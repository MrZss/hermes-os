import path from "node:path";
import { inspectRemoteEnvironment } from "./remote-environment.mjs";
import { listRegisteredInstances, removeRegisteredInstance, upsertRegisteredInstance } from "./instance-registry.mjs";
import { runSshCommand } from "./ssh-runtime.mjs";

const DEFAULT_DOCKER_IMAGE = "nousresearch/hermes-agent:latest";
const REMOTE_DOCKER_PULL_TIMEOUT_MS = 600_000;
const REMOTE_DOCKER_PULL_ATTEMPTS = 3;
const DEFAULT_GATEWAY_PORT = 8642;
const CONTAINER_INTERNAL_PORT = 8642;
const KNOWN_INSTANCE_IDS = {
  本地创作环境: "local-studio",
  远程网关节点: "remote-gateway",
};
const BOOTSTRAP_DIRECTORIES = ["cron", "sessions", "logs", "hooks", "memories", "skills", "skins", "plans", "workspace", "home"];
const MINIMAL_SOUL = "# SOUL\n\n你是 Hermes Agent。\n";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDesktopError(code, message, detail, recoverable = true) {
  return {
    ok: false,
    error: {
      code,
      message,
      detail,
      recoverable,
    },
  };
}

function normalizeDisplayName(name) {
  return typeof name === "string" ? name.trim() : "";
}

export function isRetryableRemoteCreateReservation(instance) {
  if (!instance || instance.type !== "remote" || instance.status !== "failed") {
    return false;
  }

  const detail = String(instance.lastError || "");
  return /远程目录不存在|远程工作目录不可写|当前部署路径不可用|Docker daemon 未运行|远程环境未找到 Docker|远程网关端口已被占用|REMOTE_WORKDIR_NOT_WRITABLE|DOCKER_DAEMON_UNAVAILABLE|DOCKER_UNAVAILABLE|REMOTE_GATEWAY_PORT_OCCUPIED/i.test(detail);
}

function normalizeCliConfigValue(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== "待配置" ? text : fallback;
}

function quoteYamlString(value) {
  return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildHermesCliConfig({ providerId, model } = {}) {
  const provider = normalizeCliConfigValue(providerId, "auto");
  const defaultModel = normalizeCliConfigValue(model);
  const modelLines = [`  provider: ${quoteYamlString(provider)}`];

  if (defaultModel) {
    modelLines.push(`  default: ${quoteYamlString(defaultModel)}`);
  }

  if (provider === "auto") {
    modelLines.push(`  base_url: ${quoteYamlString("https://openrouter.ai/api/v1")}`);
  }

  return `model:\n${modelLines.join("\n")}\nterminal:\n  backend: "local"\n  cwd: "."\n  timeout: 180\n  lifetime_seconds: 300\n`;
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

function slugifyInstanceId(name) {
  const known = KNOWN_INSTANCE_IDS[name];
  if (known) return known;

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "remote-instance";
}

async function remotePathExists(connection, targetPath) {
  const result = await runSshCommand(
    connection,
    `if [ -e ${shellEscape(targetPath)} ]; then printf '1'; else printf '0'; fi`,
    { timeoutMs: 15_000 }
  );

  if (!result.ok || !result.data) {
    return false;
  }

  const lines = String(result.data.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) === "1";
}

async function ensureUniqueInstanceId(baseId, instances, connection, baseWorkdir) {
  const existingIds = new Set(instances.map((instance) => instance.id));
  const isOccupied = async (candidateId) => (
    existingIds.has(candidateId)
    || (connection && baseWorkdir ? await remotePathExists(connection, joinRemotePath(baseWorkdir, candidateId)) : false)
  );

  if (!(await isOccupied(baseId))) {
    return baseId;
  }

  let counter = 2;
  let nextId = `${baseId}-${counter}`;

  while (await isOccupied(nextId)) {
    counter += 1;
    nextId = `${baseId}-${counter}`;
  }

  return nextId;
}

function joinRemotePath(...segments) {
  return path.posix.join(...segments.filter(Boolean));
}

function buildContainerName(instanceId) {
  return `hermes-console-${instanceId}-${Date.now().toString(36)}`;
}

function buildRemoteEndpoint({ host, port }) {
  return `ssh://${host}:${port || "22"}`;
}

function buildRemoteConnection(input) {
  const authMode = input?.authMode === "password" ? "password" : "ssh_key";
  return {
    host: String(input.host || "").trim(),
    port: String(input.port || "22").trim() || "22",
    user: String(input.user || "").trim(),
    authMode,
    keyPath: authMode === "ssh_key" ? String(input.keyPath || "").trim() : "",
    password: authMode === "password" ? String(input.password || "").trim() : "",
  };
}

function buildInstanceRecord({
  id,
  name,
  host,
  port,
  user,
  authMode,
  keyPath,
  password,
  workspaceDir,
  hermesHome,
  workdir,
  endpoint,
  status,
  providerId,
  model,
  defaultProfile,
  containerName,
  publishedPort,
  lastError,
  createdAt,
  platformLabel,
}) {
  const timestamp = nowIso();

  return {
    id,
    name,
    type: "remote",
    runtime: "docker",
    hermesHome,
    workspaceDir,
    endpoint,
    status,
    createdAt,
    lastCheckedAt: timestamp,
    platformLabel: platformLabel || "Linux",
    security: "SSH tunnel",
    providerId,
    model,
    defaultProfile,
    lastError,
    docker: {
      image: DEFAULT_DOCKER_IMAGE,
      containerName,
      publishedPort,
      containerPort: CONTAINER_INTERNAL_PORT,
      command: ["gateway", "run"],
    },
    remote: {
      host,
      port,
      user,
      authMode: authMode === "password" ? "password" : "ssh_key",
      keyPath,
      password,
      workdir,
    },
  };
}

function buildRemoteBootstrapScript({ workspaceDir, hermesHome, runtimeDir, providerId, model, deploymentMetadata }) {
  const metadataJson = JSON.stringify(deploymentMetadata, null, 2);
  const bootstrapDirs = BOOTSTRAP_DIRECTORIES.map((directoryName) => shellEscape(joinRemotePath(hermesHome, directoryName))).join(" ");
  const cliConfig = buildHermesCliConfig({ providerId, model });

  return `
set -eu
WORKSPACE_DIR=${shellEscape(workspaceDir)}
HERMES_HOME=${shellEscape(hermesHome)}
RUNTIME_DIR=${shellEscape(runtimeDir)}
mkdir -p "$WORKSPACE_DIR" "$HERMES_HOME" "$RUNTIME_DIR"
for dir in ${bootstrapDirs}; do
  mkdir -p "$dir"
done
if [ ! -f "$HERMES_HOME/.env" ]; then
  : > "$HERMES_HOME/.env"
fi
if [ ! -f "$HERMES_HOME/config.yaml" ]; then
  cat > "$HERMES_HOME/config.yaml" <<'YAML'
${cliConfig}
YAML
fi
if [ ! -f "$HERMES_HOME/SOUL.md" ]; then
  cat > "$HERMES_HOME/SOUL.md" <<'MARKDOWN'
${MINIMAL_SOUL}
MARKDOWN
fi
cat > "$RUNTIME_DIR/deployment.json" <<'JSON'
${metadataJson}
JSON
`.trim();
}

function buildRemoteDockerCommand(args) {
  return `docker ${args.map((arg) => shellEscape(arg)).join(" ")}`;
}

export async function writeRemoteRuntimeMetadata(connection, runtimeDir, metadata) {
  const metadataJson = JSON.stringify(metadata, null, 2);
  const command = `
set -eu
mkdir -p ${shellEscape(runtimeDir)}
cat > ${shellEscape(joinRemotePath(runtimeDir, "deployment.json"))} <<'JSON'
${metadataJson}
JSON
`.trim();

  return runSshCommand(connection, command, { timeoutMs: 30_000 });
}

export async function runRemoteDockerCommand(connection, args, options = {}) {
  const result = await runSshCommand(connection, buildRemoteDockerCommand(args), {
    timeoutMs: options.timeoutMs ?? 120_000,
  });

  if (!result.ok || !result.data) {
    return result;
  }

  return {
    ok: true,
    data: {
      args,
      exitCode: result.data.exitCode,
      stdout: result.data.stdout,
      stderr: result.data.stderr,
      binaryPath: result.data.binaryPath,
    },
  };
}

function getRemoteDockerCommandDetail(result) {
  return result?.error?.detail
    || result?.data?.stderr
    || result?.data?.stdout
    || "远程运行服务命令没有返回详细信息。";
}

export async function ensureRemoteDockerImageAvailable(
  connection,
  image,
  { timeoutMs = REMOTE_DOCKER_PULL_TIMEOUT_MS, attempts = REMOTE_DOCKER_PULL_ATTEMPTS } = {}
) {
  const inspectResult = await runRemoteDockerCommand(connection, ["image", "inspect", image], { timeoutMs: 30_000 });
  if (inspectResult.ok) {
    return {
      ok: true,
      data: {
        image,
        alreadyAvailable: true,
        attempts: 0,
        detail: "远程运行版本已就绪。",
      },
    };
  }

  const pullDetails = [];
  const maxAttempts = Math.max(1, Number.isFinite(attempts) ? Math.floor(attempts) : REMOTE_DOCKER_PULL_ATTEMPTS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pullResult = await runRemoteDockerCommand(connection, ["pull", image], { timeoutMs });
    if (pullResult.ok) {
      return {
        ok: true,
        data: {
          image,
          alreadyAvailable: false,
          attempts: attempt,
          detail: `远程运行版本下载完成（第 ${attempt}/${maxAttempts} 次）。`,
          stdout: pullResult.data?.stdout,
          stderr: pullResult.data?.stderr,
        },
      };
    }

    pullDetails.push(`第 ${attempt}/${maxAttempts} 次远程拉取失败：${getRemoteDockerCommandDetail(pullResult)}`);

    if (attempt < maxAttempts) {
      await sleep(2_000);
    }
  }

  return {
    ok: false,
    data: {
      image,
      attempts: maxAttempts,
      detail: pullDetails.join("\n"),
    },
    error: {
      code: "REMOTE_DOCKER_IMAGE_PULL_FAILED",
      message: "远程运行版本下载失败。",
      detail: [
        `远程运行版本 ${image} 下载超时或失败，客户端已自动重试 ${maxAttempts} 次。`,
        `单次最长等待 ${Math.round(timeoutMs / 1000)} 秒；已下载内容会被复用，下一次会继续下载。`,
        pullDetails.join("\n"),
      ].filter(Boolean).join("\n"),
      recoverable: true,
    },
  };
}

export async function inspectRemoteContainerState(connection, containerName) {
  const result = await runRemoteDockerCommand(connection, ["inspect", "--format", "{{json .State}}", containerName], {
    timeoutMs: 20_000,
  });

  if (!result.ok || !result.data?.stdout) {
    return {
      found: false,
      detail: result.error?.detail ?? result.data?.stderr ?? result.data?.stdout ?? "无法读取远程运行服务状态。",
      state: null,
    };
  }

  try {
    return {
      found: true,
      detail: null,
      state: JSON.parse(result.data.stdout),
    };
  } catch {
    return {
      found: false,
      detail: "远程运行服务状态返回值无法解析。",
      state: null,
    };
  }
}

export async function readRemoteContainerLogs(connection, containerName) {
  const result = await runRemoteDockerCommand(connection, ["logs", "--tail", "50", containerName], {
    timeoutMs: 20_000,
  });

  if (!result.ok && !result.data) {
    return result.error?.detail ?? "";
  }

  return [result.data?.stdout, result.data?.stderr].filter(Boolean).join("\n").trim();
}

function buildRemoteGatewayHttpHealthScript(gatewayPort) {
  return `
if command -v curl >/dev/null 2>&1; then
  curl -fsS ${shellEscape(`http://127.0.0.1:${gatewayPort}/health`)} >/dev/null
elif command -v wget >/dev/null 2>&1; then
  wget -qO- ${shellEscape(`http://127.0.0.1:${gatewayPort}/health`)} >/dev/null
elif command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import sys, urllib.request
urllib.request.urlopen(${JSON.stringify(`http://127.0.0.1:${gatewayPort}/health`)}, timeout=2).read()
PY
else
  exit 4
fi
`.trim();
}

export function buildRemoteGatewayRuntimeProbeScript(containerName) {
  return `
set +e
CONTAINER_NAME=${shellEscape(containerName)}
INSPECT_OUTPUT="$(docker inspect --format 'running={{.State.Running}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}} error={{.State.Error}}' "$CONTAINER_NAME" 2>&1)"
INSPECT_CODE=$?
printf '__INSPECT_CODE__=%s\\n' "$INSPECT_CODE"
printf '%s\\n' "$INSPECT_OUTPUT" | sed 's/^/__INSPECT__=/'
if [ "$INSPECT_CODE" -ne 0 ]; then
  exit 0
fi
PROCESS_OUTPUT="$(docker exec "$CONTAINER_NAME" sh -lc 'ps -ef | grep -E "[h]ermes gateway run|[p]ython3 .*/hermes gateway run|[p]ython .*/hermes gateway run" | head -n 5' 2>&1)"
PROCESS_CODE=$?
printf '__PROCESS_CODE__=%s\\n' "$PROCESS_CODE"
printf '%s\\n' "$PROCESS_OUTPUT" | sed 's/^/__PROCESS__=/'
LOG_OUTPUT="$(docker exec "$CONTAINER_NAME" sh -lc 'for f in /opt/data/logs/gateway.log /opt/data/home/logs/gateway.log; do [ -f "$f" ] && tail -n 80 "$f"; done' 2>&1)"
LOG_CODE=$?
printf '__LOG_CODE__=%s\\n' "$LOG_CODE"
printf '%s\\n' "$LOG_OUTPUT" | tail -n 120 | sed 's/^/__LOG__=/'
exit 0
`.trim();
}

function extractProbeLines(stdout, marker) {
  return String(stdout || "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith(marker))
    .map((line) => line.slice(marker.length));
}

export function parseRemoteGatewayRuntimeProbeOutput(stdout) {
  const inspectText = extractProbeLines(stdout, "__INSPECT__=").join("\n").trim();
  const processText = extractProbeLines(stdout, "__PROCESS__=").join("\n").trim();
  const logText = extractProbeLines(stdout, "__LOG__=").join("\n").trim();

  const containerRunning = /\brunning=true\b/i.test(inspectText);
  const containerStatus = inspectText.match(/\bstatus=([^\s]+)/i)?.[1] ?? "";
  const containerError = inspectText.match(/\berror=(.*)$/im)?.[1]?.trim() ?? "";
  const gatewayProcessRunning = /hermes gateway run/i.test(processText);
  const gatewayLogHealthy = /Gateway 进程正在运行|Cron ticker started|Press Ctrl\+C to stop|Gateway will continue running|Starting Hermes Gateway/i.test(logText);
  const gatewayLogHasFatal = /\b(CRITICAL|Traceback \(most recent call last\)|Fatal|Unhandled exception)\b/i.test(logText);

  if (!inspectText) {
    return {
      reachable: false,
      detail: "无法读取远程运行服务状态。",
      mode: "docker-runtime",
    };
  }

  if (!containerRunning) {
    const detail = containerError || (containerStatus ? `远程运行服务当前状态：${containerStatus}。` : inspectText);
    return {
      reachable: false,
      detail,
      mode: "docker-runtime",
    };
  }

  if (gatewayProcessRunning) {
    return {
      reachable: true,
      detail: "远程运行服务运行中，Hermes Gateway 进程正在运行。",
      mode: "docker-runtime",
    };
  }

  if (gatewayLogHealthy && !gatewayLogHasFatal) {
    return {
      reachable: true,
      detail: "远程运行服务运行中，Gateway 日志显示已进入消息/cron 常驻状态。",
      mode: "docker-runtime",
    };
  }

  const detail = [
    "远程运行服务正在运行，但尚未确认 Hermes Gateway 进程或运行日志。",
    processText ? `进程输出：${processText}` : null,
    logText ? `日志尾部：${logText.split(/\r?\n/).slice(-6).join(" / ")}` : null,
  ].filter(Boolean).join("\n");

  return {
    reachable: false,
    detail,
    mode: "docker-runtime",
  };
}

export async function inspectRemoteGatewayHealth(connection, gatewayPort = DEFAULT_GATEWAY_PORT, options = {}) {
  if (options?.containerName) {
    const runtimeResult = await runSshCommand(connection, buildRemoteGatewayRuntimeProbeScript(options.containerName), {
      timeoutMs: 15_000,
    });

    if (!runtimeResult.ok) {
      return {
        reachable: false,
        detail: runtimeResult.error?.detail ?? "无法读取远程 Docker Gateway 运行态。",
      };
    }

    const runtimeHealth = parseRemoteGatewayRuntimeProbeOutput(runtimeResult.data?.stdout ?? "");
    if (runtimeHealth.reachable) {
      return runtimeHealth;
    }

    const httpResult = await runSshCommand(connection, buildRemoteGatewayHttpHealthScript(gatewayPort), { timeoutMs: 8_000 });
    if (httpResult.ok) {
      return {
        reachable: true,
        detail: "远程 Gateway health endpoint 可访问。",
        mode: "http-health",
      };
    }

    return {
      reachable: false,
      detail: [
        runtimeHealth.detail,
        httpResult.error?.detail ? `HTTP /health 探测：${httpResult.error.detail}` : null,
      ].filter(Boolean).join("\n"),
      mode: "docker-runtime",
    };
  }

  const command = buildRemoteGatewayHttpHealthScript(gatewayPort);

  const result = await runSshCommand(connection, command, { timeoutMs: 8_000 });

  if (!result.ok) {
    return {
      reachable: false,
      detail: result.error?.detail ?? "远程 health endpoint 不可访问。",
    };
  }

  return {
    reachable: true,
    detail: "远程 Gateway health endpoint 可访问。",
    mode: "http-health",
  };
}

export async function createRemoteDockerInstance({ userDataPath, input }) {
  const name = normalizeDisplayName(input?.name);

  if (!name) {
    return toDesktopError("INSTANCE_NAME_REQUIRED", "实例名称不能为空。", "请先填写实例名称。", true);
  }

  const connection = buildRemoteConnection(input ?? {});

  if (!connection.host || !connection.user || (connection.authMode === "ssh_key" ? !connection.keyPath : !connection.password)) {
    return toDesktopError(
      "REMOTE_CONNECTION_REQUIRED",
      "缺少远程部署所需的 SSH 连接信息。",
      connection.authMode === "password" ? "请补全远程主机、用户名与 SSH 密码。" : "请补全远程主机、用户名与私钥路径。",
      true
    );
  }

  const registryResult = await listRegisteredInstances(userDataPath);
  if (!registryResult.ok || !registryResult.data) {
    return toDesktopError(
      registryResult.error?.code ?? "INSTANCE_REGISTRY_UNAVAILABLE",
      registryResult.error?.message ?? "无法读取实例注册表。",
      registryResult.error?.detail,
      registryResult.error?.recoverable ?? true
    );
  }

  const sameNameRemoteInstances = registryResult.data.instances.filter(
    (instance) => instance.type === "remote" && instance.name === name
  );
  const blockingDuplicateInstance = sameNameRemoteInstances.find(
    (instance) => !isRetryableRemoteCreateReservation(instance)
  );

  if (blockingDuplicateInstance) {
    return toDesktopError(
      "INSTANCE_NAME_EXISTS",
      "实例名称已存在。",
      `已存在同名远程实例“${name}”，请更换名称后重试。`,
      true
    );
  }

  const retryableDuplicateIds = sameNameRemoteInstances
    .filter(isRetryableRemoteCreateReservation)
    .map((instance) => instance.id);
  const activeRegistryInstances = registryResult.data.instances.filter(
    (instance) => !retryableDuplicateIds.includes(instance.id)
  );

  for (const instanceId of retryableDuplicateIds) {
    await removeRegisteredInstance(userDataPath, instanceId);
  }

  const remoteInspection = await inspectRemoteEnvironment({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    authMode: connection.authMode,
    keyPath: connection.keyPath,
    password: connection.password,
    workdir: input?.workdir || "/opt/hermes",
  });

  if (!remoteInspection.ok || !remoteInspection.data) {
    return remoteInspection;
  }

  const baseWorkdir = remoteInspection.data.workdir || String(input?.workdir || "/opt/hermes");
  const instanceId = await ensureUniqueInstanceId(slugifyInstanceId(name), activeRegistryInstances, connection, baseWorkdir);
  const workspaceDir = joinRemotePath(baseWorkdir, instanceId);
  const hermesHome = joinRemotePath(workspaceDir, "home");
  const runtimeDir = joinRemotePath(workspaceDir, "runtime");
  const containerName = buildContainerName(instanceId);
  const gatewayPort = remoteInspection.data.port.port || DEFAULT_GATEWAY_PORT;
  const endpoint = buildRemoteEndpoint(connection);
  const createdAt = nowIso();

  const creatingRecord = buildInstanceRecord({
    id: instanceId,
    name,
    host: connection.host,
    port: connection.port,
    user: connection.user,
    authMode: connection.authMode,
    keyPath: connection.keyPath,
    password: connection.password,
    workspaceDir,
    hermesHome,
    workdir: baseWorkdir,
    endpoint,
    status: "creating",
    providerId: input?.providerId,
    model: input?.model,
    defaultProfile: input?.defaultProfile,
    containerName,
    publishedPort: gatewayPort,
    createdAt,
    platformLabel: remoteInspection.data.system.platform,
  });

  if (!remoteInspection.data.directory.writable) {
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: remoteInspection.data.directory.detail,
    };
    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: "REMOTE_WORKDIR_NOT_WRITABLE",
        message: "远程工作目录不可写，无法创建实例。",
        detail: remoteInspection.data.directory.detail,
        recoverable: true,
      },
    };
  }

  if (!remoteInspection.data.docker.available || !remoteInspection.data.docker.daemonRunning) {
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: remoteInspection.data.docker.detail,
    };
    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: remoteInspection.data.docker.available ? "DOCKER_DAEMON_UNAVAILABLE" : "DOCKER_UNAVAILABLE",
        message: remoteInspection.data.docker.available ? "远程运行服务未启动。" : "远程环境未找到可用运行服务。",
        detail: remoteInspection.data.docker.detail,
        recoverable: true,
      },
    };
  }

  if (remoteInspection.data.port.available === false) {
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: remoteInspection.data.port.detail,
    };
    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: "REMOTE_GATEWAY_PORT_OCCUPIED",
        message: "远程网关端口已被占用。",
        detail: remoteInspection.data.port.detail,
        recoverable: true,
      },
    };
  }

  await upsertRegisteredInstance(userDataPath, creatingRecord);

  const bootstrapMetadata = {
    phase: "bootstrap-complete",
    image: DEFAULT_DOCKER_IMAGE,
    endpoint,
    gatewayPort,
    containerName,
    remote: {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      workdir: baseWorkdir,
    },
  };

  const bootstrapResult = await runSshCommand(
    connection,
    buildRemoteBootstrapScript({
      workspaceDir,
      hermesHome,
      runtimeDir,
      providerId: input?.providerId,
      model: input?.model,
      deploymentMetadata: bootstrapMetadata,
    }),
    { timeoutMs: 60_000 }
  );

  if (!bootstrapResult.ok) {
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: bootstrapResult.error?.detail,
    };
    await upsertRegisteredInstance(userDataPath, failedRecord);
    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: bootstrapResult.error?.code ?? "REMOTE_BOOTSTRAP_FAILED",
        message: "远程实例目录初始化失败。",
        detail: bootstrapResult.error?.detail ?? "远程 bootstrap 执行失败。",
        recoverable: true,
      },
    };
  }

  const imageResult = await ensureRemoteDockerImageAvailable(connection, DEFAULT_DOCKER_IMAGE);

  if (!imageResult.ok) {
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: imageResult.error?.detail ?? imageResult.data?.detail,
    };
    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRemoteRuntimeMetadata(connection, runtimeDir, {
      ...bootstrapMetadata,
      phase: "docker-image-pull-failed",
      lastError: failedRecord.lastError,
    });

    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: imageResult.error?.code ?? "REMOTE_DOCKER_IMAGE_PULL_FAILED",
        message: "远程运行版本下载失败。",
        detail: failedRecord.lastError,
        recoverable: true,
      },
    };
  }

  const runResult = await runRemoteDockerCommand(
    connection,
    [
      "run",
      "-d",
      "--name",
      containerName,
      "--restart",
      "unless-stopped",
      "--label",
      "hermes.console.managed=true",
      "--label",
      `hermes.console.instance-id=${instanceId}`,
      "--label",
      "hermes.console.creator=desktop-client",
      "-v",
      `${hermesHome}:/opt/data`,
      "-p",
      `127.0.0.1:${gatewayPort}:${CONTAINER_INTERNAL_PORT}`,
      DEFAULT_DOCKER_IMAGE,
      "gateway",
      "run",
    ],
    { timeoutMs: 120_000 }
  );

  if (!runResult.ok) {
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
    };
    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRemoteRuntimeMetadata(connection, runtimeDir, {
      ...bootstrapMetadata,
      phase: "docker-run-failed",
      lastError: failedRecord.lastError,
    });

    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: runResult.error?.code ?? "REMOTE_DOCKER_RUN_FAILED",
        message: "远程运行服务启动失败。",
        detail: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
        recoverable: true,
      },
    };
  }

  await sleep(2_000);

  const containerState = await inspectRemoteContainerState(connection, containerName);

  if (!containerState.found || !containerState.state || containerState.state.Status !== "running") {
    const containerLogs = await readRemoteContainerLogs(connection, containerName);
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: containerLogs || containerState.state?.Error || containerState.detail || "远程运行服务未进入 running 状态。",
    };
    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRemoteRuntimeMetadata(connection, runtimeDir, {
      ...bootstrapMetadata,
      phase: "container-exited",
      containerState: containerState.state,
      lastError: failedRecord.lastError,
    });

    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        containerName,
        image: DEFAULT_DOCKER_IMAGE,
        endpoint,
        healthUrl: `${endpoint}#${gatewayPort}/health`,
        createdAt,
        remote: {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          workdir: baseWorkdir,
          gatewayPort,
        },
      },
      error: {
        code: "REMOTE_DOCKER_CONTAINER_NOT_RUNNING",
        message: "远程运行服务没有保持运行。",
        detail: failedRecord.lastError,
        recoverable: true,
      },
    };
  }

  const gatewayHealth = await inspectRemoteGatewayHealth(connection, gatewayPort, { containerName });
  const runningRecord = {
    ...creatingRecord,
    status: gatewayHealth.reachable ? "running" : "warning",
    lastError: gatewayHealth.reachable ? undefined : gatewayHealth.detail,
  };

  await upsertRegisteredInstance(userDataPath, runningRecord);
  await writeRemoteRuntimeMetadata(connection, runtimeDir, {
    ...bootstrapMetadata,
    phase: "running",
    containerState: containerState.state,
    gateway: gatewayHealth,
  });

  return {
    ok: true,
    data: {
      instance: runningRecord,
      registryFilePath: registryResult.data.filePath,
      workspaceDir,
      hermesHome,
      runtimeDir,
      containerName,
      image: DEFAULT_DOCKER_IMAGE,
      endpoint,
      healthUrl: `${endpoint}#${gatewayPort}/health`,
      createdAt,
      remote: {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        workdir: baseWorkdir,
        gatewayPort,
      },
    },
  };
}
