import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { ensureDockerImageAvailable, inspectDockerEnvironment, runDockerCommand } from "./docker-runtime.mjs";
import { resolveHermesBinary, runHermesCommand } from "./hermes-cli.mjs";
import { getRegisteredInstance, listRegisteredInstances, upsertRegisteredInstance } from "./instance-registry.mjs";
import { inspectRemoteEnvironment } from "./remote-environment.mjs";
import {
  inspectRemoteContainerState,
  inspectRemoteGatewayHealth,
  parseRemoteGatewayRuntimeProbeOutput as parseDockerGatewayRuntimeProbeOutput,
  ensureRemoteDockerImageAvailable,
  runRemoteDockerCommand,
  writeRemoteRuntimeMetadata,
} from "./remote-instance.mjs";

const STATE_TIMEOUT_MS = 20_000;
const START_TIMEOUT_MS = 120_000;

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

function withOperation(instance, operationType, operationResult) {
  return {
    ...instance,
    lastOperationAt: nowIso(),
    lastOperationType: operationType,
    lastOperationResult: operationResult,
  };
}

async function inspectContainer(containerName) {
  const result = await runDockerCommand(["inspect", "--format", "{{json .State}}", containerName], {
    timeoutMs: STATE_TIMEOUT_MS,
  });

  if (!result.ok || !result.data?.stdout) {
    return {
      found: false,
      detail: result.error?.detail ?? result.data?.stderr ?? result.data?.stdout ?? "无法读取运行服务状态。",
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
      detail: "运行服务状态返回值无法解析。",
      state: null,
    };
  }
}

async function inspectGatewayHealth(endpoint) {
  if (!endpoint) {
    return {
      reachable: false,
      detail: "未配置网关端点。",
    };
  }

  const url = `${endpoint.replace(/\/$/, "")}/health`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(2_500),
    });

    if (response.ok) {
      return {
        reachable: true,
        detail: "Gateway health endpoint 可访问。",
      };
    }

    return {
      reachable: false,
      detail: `Gateway health endpoint 返回 ${response.status}。`,
    };
  } catch (error) {
    return {
      reachable: false,
      detail: error instanceof Error ? error.message : "无法连接 Gateway health endpoint。",
    };
  }
}

function toDockerGatewayProbeSection(marker, value) {
  const text = String(value || "").trim();
  if (!text) return `${marker}`;
  return text.split(/\r?\n/).map((line) => `${marker}${line}`).join("\n");
}

async function inspectLocalDockerGatewayHealth(containerName, endpoint) {
  const [processResult, logResult] = await Promise.all([
    runDockerCommand([
      "exec",
      containerName,
      "sh",
      "-lc",
      'set +e; ps -ef | grep -E "[h]ermes gateway run|[p]ython3 .*/hermes gateway run|[p]ython .*/hermes gateway run" | head -n 5; exit 0',
    ], { timeoutMs: 10_000 }),
    runDockerCommand([
      "exec",
      containerName,
      "sh",
      "-lc",
      'set +e; for f in /opt/data/logs/gateway.log /opt/data/home/logs/gateway.log; do [ -f "$f" ] && tail -n 80 "$f"; done; exit 0',
    ], { timeoutMs: 10_000 }),
  ]);

  const runtimeHealth = parseDockerGatewayRuntimeProbeOutput([
    "__INSPECT__=running=true status=running",
    toDockerGatewayProbeSection("__PROCESS__=", [processResult.data?.stdout, processResult.data?.stderr, processResult.error?.detail].filter(Boolean).join("\n")),
    toDockerGatewayProbeSection("__LOG__=", [logResult.data?.stdout, logResult.data?.stderr, logResult.error?.detail].filter(Boolean).join("\n")),
  ].join("\n"));

  if (runtimeHealth.reachable) {
    return runtimeHealth;
  }

  const httpHealth = await inspectGatewayHealth(endpoint);
  if (httpHealth.reachable) {
    return {
      ...httpHealth,
      mode: "http-health",
    };
  }

  return {
    reachable: false,
    detail: [runtimeHealth.detail, `HTTP /health 探测：${httpHealth.detail}`].filter(Boolean).join("\n"),
    mode: "docker-runtime",
  };
}

async function writeRuntimeMetadata(workspaceDir, metadata) {
  const runtimeDir = path.join(workspaceDir, "runtime");
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(path.join(runtimeDir, "state.json"), JSON.stringify(metadata, null, 2), "utf8");
}

function inferNativeGatewayStatus(output) {
  if (/Gateway service is loaded|\bPID\b|Service started/i.test(output)) {
    return "running";
  }

  if (/not loaded|not running|no such process|service could not be found|not found/i.test(output)) {
    return "stopped";
  }

  return "warning";
}

function isManagedNativeProcess(instance) {
  return instance?.type === "local" && instance?.runtime === "native" && instance.native?.mode === "managed-process";
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function startManagedNativeGateway(instance) {
  const binaryPath = resolveHermesBinary();
  const args = ["gateway", "run", "--replace"];

  return new Promise((resolve) => {
    const child = spawn(binaryPath, args, {
      env: {
        ...process.env,
        HERMES_HOME: instance.hermesHome,
      },
      detached: true,
      stdio: "ignore",
    });

    let settled = false;

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        detail: error.message,
        pid: null,
        binaryPath,
        args,
      });
    });

    child.unref();

    setTimeout(() => {
      if (settled) return;
      settled = true;
      const alive = isProcessAlive(child.pid);
      resolve({
        ok: alive,
        detail: alive ? "Native gateway 进程已启动。" : "Native gateway 进程启动后立即退出。",
        pid: alive ? child.pid : null,
        binaryPath,
        args,
      });
    }, 2_000);
  });
}

async function stopManagedNativeGateway(pid) {
  if (!isProcessAlive(pid)) {
    return true;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }

  for (let index = 0; index < 20; index += 1) {
    await sleep(150);
    if (!isProcessAlive(pid)) return true;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }

  return !isProcessAlive(pid);
}

async function refreshLocalNativeInstance(userDataPath, instance) {
  try {
    await fs.access(instance.hermesHome);
  } catch {
    const failedInstance = {
      ...instance,
      status: "failed",
      lastCheckedAt: nowIso(),
      lastError: `未找到 ${instance.hermesHome}。`,
    };
    await upsertRegisteredInstance(userDataPath, failedInstance);
    return {
      instance: failedInstance,
      docker: null,
      container: null,
      gateway: {
        reachable: false,
        detail: failedInstance.lastError,
      },
      detail: failedInstance.lastError,
    };
  }

  if (isManagedNativeProcess(instance)) {
    const alive = isProcessAlive(instance.native?.pid);
    const nextInstance = {
      ...instance,
      status: alive ? "running" : "stopped",
      lastCheckedAt: nowIso(),
      lastError: undefined,
    };

    await upsertRegisteredInstance(userDataPath, nextInstance);
    await writeRuntimeMetadata(instance.workspaceDir, {
      phase: "managed-native-status-refresh",
      checkedAt: nextInstance.lastCheckedAt,
      pid: instance.native?.pid ?? null,
      gatewayStatus: nextInstance.status,
      detail: alive ? "Console 管理的 Native gateway 进程正在运行。" : "Console 管理的 Native gateway 进程未运行。",
    });

    return {
      instance: nextInstance,
      docker: null,
      container: null,
      gateway: {
        reachable: alive,
        detail: alive ? "Console 管理的 Native gateway 进程正在运行。" : "Console 管理的 Native gateway 进程未运行。",
      },
      detail: alive ? "Console 管理的 Native gateway 进程正在运行。" : "Console 管理的 Native gateway 进程未运行。",
    };
  }

  const gatewayStatus = await runHermesCommand(["gateway", "status"], {
    env: { HERMES_HOME: instance.hermesHome },
    timeoutMs: 30_000,
  });

  const statusOutput = gatewayStatus.ok
    ? gatewayStatus.data?.stdout ?? ""
    : gatewayStatus.error?.detail ?? gatewayStatus.error?.message ?? "";
  const inferredStatus = inferNativeGatewayStatus(statusOutput);

  const nextInstance = {
    ...instance,
    status: inferredStatus,
    lastCheckedAt: nowIso(),
    lastError: inferredStatus === "warning" ? (statusOutput || "无法读取 Native gateway 状态。") : undefined,
  };

  await upsertRegisteredInstance(userDataPath, nextInstance);
  await writeRuntimeMetadata(instance.workspaceDir, {
    phase: "native-status-refresh",
    checkedAt: nextInstance.lastCheckedAt,
    gatewayStatus: inferredStatus,
    detail: statusOutput,
  });

  return {
    instance: nextInstance,
    docker: null,
    container: null,
    gateway: {
      reachable: inferredStatus === "running",
      detail: statusOutput || (inferredStatus === "running" ? "Native gateway 运行中。" : "Native gateway 未运行。"),
    },
    detail: statusOutput || (inferredStatus === "running" ? "Native gateway 运行中。" : "Native gateway 未运行。"),
  };
}

function buildLocalDockerRunArgs(instance) {
  const args = [
    "run",
    "-d",
    "--name",
    instance.docker.containerName,
    "--restart",
    "unless-stopped",
    "--label",
    "hermes.console.managed=true",
    "--label",
    `hermes.console.instance-id=${instance.id}`,
    "--label",
    "hermes.console.creator=desktop-client",
    "-v",
    `${instance.hermesHome}:/opt/data`,
    "-p",
    `127.0.0.1:${instance.docker.publishedPort}:${instance.docker.containerPort || 8642}`,
  ];

  if (typeof process.getuid === "function") {
    args.push("-e", `HERMES_UID=${process.getuid()}`);
  }

  if (typeof process.getgid === "function") {
    args.push("-e", `HERMES_GID=${process.getgid()}`);
  }

  args.push(instance.docker.image, ...(instance.docker.command || ["gateway", "run"]));
  return args;
}

function buildRemoteDockerRunArgs(instance) {
  return [
    "run",
    "-d",
    "--name",
    instance.docker.containerName,
    "--restart",
    "unless-stopped",
    "--label",
    "hermes.console.managed=true",
    "--label",
    `hermes.console.instance-id=${instance.id}`,
    "--label",
    "hermes.console.creator=desktop-client",
    "-v",
    `${instance.hermesHome}:/opt/data`,
    "-p",
    `127.0.0.1:${instance.docker.publishedPort}:${instance.docker.containerPort || 8642}`,
    instance.docker.image,
    ...(instance.docker.command || ["gateway", "run"]),
  ];
}

async function redeployLocalDockerInstance(userDataPath, instance) {
  if (!instance.docker?.containerName || !instance.docker?.image || !instance.hermesHome) {
    return toDesktopError("INSTANCE_CONTAINER_MISSING", "实例缺少运行服务元数据。", `instanceId=${instance.id}`, true);
  }

  const creatingInstance = withOperation({
    ...instance,
    status: "creating",
    lastError: undefined,
    lastCheckedAt: nowIso(),
  }, "redeploy", "正在重建部署并重新创建本机运行服务。");
  await upsertRegisteredInstance(userDataPath, creatingInstance);
  await writeRuntimeMetadata(instance.workspaceDir, {
    phase: "redeploying",
    image: instance.docker.image,
    endpoint: instance.endpoint,
    publishedPort: instance.docker.publishedPort,
    containerName: instance.docker.containerName,
  });

  const imageResult = await ensureDockerImageAvailable(instance.docker.image);
  if (!imageResult.ok) {
    const failedInstance = {
      ...instance,
      status: "failed",
      lastError: imageResult.error?.detail ?? imageResult.data?.detail,
      lastCheckedAt: nowIso(),
    };
    await upsertRegisteredInstance(userDataPath, failedInstance);
    await writeRuntimeMetadata(instance.workspaceDir, {
      phase: "docker-image-pull-failed",
      image: instance.docker.image,
      endpoint: instance.endpoint,
      publishedPort: instance.docker.publishedPort,
      containerName: instance.docker.containerName,
      lastError: failedInstance.lastError,
    });

    return {
      ok: false,
      error: {
        code: imageResult.error?.code ?? "DOCKER_IMAGE_PULL_FAILED",
        message: "实例镜像拉取失败。",
        detail: failedInstance.lastError,
        recoverable: true,
      },
    };
  }

  const runResult = await runDockerCommand(buildLocalDockerRunArgs(instance), {
    timeoutMs: START_TIMEOUT_MS,
  });

  if (!runResult.ok) {
    const failedInstance = {
      ...instance,
      status: "failed",
      lastError: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
      lastCheckedAt: nowIso(),
    };
    await upsertRegisteredInstance(userDataPath, failedInstance);
    await writeRuntimeMetadata(instance.workspaceDir, {
      phase: "docker-run-failed",
      image: instance.docker.image,
      endpoint: instance.endpoint,
      publishedPort: instance.docker.publishedPort,
      containerName: instance.docker.containerName,
      lastError: failedInstance.lastError,
    });

    return {
      ok: false,
      error: {
        code: runResult.error?.code ?? "INSTANCE_REDEPLOY_FAILED",
        message: "实例重试部署失败。",
        detail: failedInstance.lastError,
        recoverable: true,
      },
    };
  }

  await sleep(2_000);
  return getInstanceState(userDataPath, instance.id);
}

async function redeployRemoteDockerInstance(userDataPath, instance, connection) {
  if (!instance.docker?.containerName || !instance.docker?.image || !instance.hermesHome) {
    return toDesktopError("INSTANCE_CONTAINER_MISSING", "远程实例缺少运行服务元数据。", `instanceId=${instance.id}`, true);
  }

  const creatingInstance = withOperation({
    ...instance,
    status: "creating",
    lastError: undefined,
    lastCheckedAt: nowIso(),
  }, "redeploy", "正在重建部署并重新创建远程运行服务。");
  await upsertRegisteredInstance(userDataPath, creatingInstance);
  await writeRemoteRuntimeMetadata(connection, path.posix.join(instance.workspaceDir, "runtime"), {
    phase: "redeploying",
    image: instance.docker.image,
    endpoint: instance.endpoint,
    publishedPort: instance.docker.publishedPort,
    containerName: instance.docker.containerName,
  });

  const imageResult = await ensureRemoteDockerImageAvailable(connection, instance.docker.image);
  if (!imageResult.ok) {
    const failedInstance = {
      ...instance,
      status: "failed",
      lastError: imageResult.error?.detail ?? imageResult.data?.detail,
      lastCheckedAt: nowIso(),
    };
    await upsertRegisteredInstance(userDataPath, failedInstance);
    await writeRemoteRuntimeMetadata(connection, path.posix.join(instance.workspaceDir, "runtime"), {
      phase: "docker-image-pull-failed",
      image: instance.docker.image,
      endpoint: instance.endpoint,
      publishedPort: instance.docker.publishedPort,
      containerName: instance.docker.containerName,
      lastError: failedInstance.lastError,
    });

    return {
      ok: false,
      error: {
        code: imageResult.error?.code ?? "REMOTE_DOCKER_IMAGE_PULL_FAILED",
        message: "远程实例镜像拉取失败。",
        detail: failedInstance.lastError,
        recoverable: true,
      },
    };
  }

  const runResult = await runRemoteDockerCommand(connection, buildRemoteDockerRunArgs(instance), {
    timeoutMs: START_TIMEOUT_MS,
  });

  if (!runResult.ok) {
    const failedInstance = {
      ...instance,
      status: "failed",
      lastError: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
      lastCheckedAt: nowIso(),
    };
    await upsertRegisteredInstance(userDataPath, failedInstance);
    await writeRemoteRuntimeMetadata(connection, path.posix.join(instance.workspaceDir, "runtime"), {
      phase: "docker-run-failed",
      image: instance.docker.image,
      endpoint: instance.endpoint,
      publishedPort: instance.docker.publishedPort,
      containerName: instance.docker.containerName,
      lastError: failedInstance.lastError,
    });

    return {
      ok: false,
      error: {
        code: runResult.error?.code ?? "INSTANCE_REDEPLOY_FAILED",
        message: "远程实例重试部署失败。",
        detail: failedInstance.lastError,
        recoverable: true,
      },
    };
  }

  await sleep(2_000);
  return getInstanceState(userDataPath, instance.id);
}

function deriveStatusFromContainer(instance, dockerEnvironment, containerInspection, healthInspection) {
  if (instance.runtime !== "docker" || instance.type !== "local") {
    return {
      status: instance.status ?? "unknown",
      lastError: instance.lastError,
      detail: "当前实例不是本机运行服务实例。",
    };
  }

  if (!dockerEnvironment.available || !dockerEnvironment.daemonRunning) {
    return {
      status: instance.status === "failed" ? "failed" : "warning",
      lastError: dockerEnvironment.detail,
      detail: dockerEnvironment.detail,
    };
  }

  if (!instance.docker?.containerName) {
    return {
      status: "failed",
      lastError: "实例缺少运行服务元数据。",
      detail: "实例缺少运行服务元数据。",
    };
  }

  if (!containerInspection.found || !containerInspection.state) {
    const detail = containerInspection.detail || "未找到对应的受管运行服务。";
    return {
      status: instance.status === "failed" ? "failed" : "warning",
      lastError: detail,
      detail,
    };
  }

  if (containerInspection.state.Running) {
    if (healthInspection.reachable) {
      return {
        status: "running",
        lastError: undefined,
        detail: healthInspection.mode === "http-health"
          ? "运行服务运行中，HTTP health endpoint 正常。"
          : "运行服务运行中，Hermes Gateway 进程正常。",
      };
    }

    return {
      status: "warning",
      lastError: healthInspection.detail,
      detail: healthInspection.detail,
    };
  }

  if (containerInspection.state.Status === "created" || containerInspection.state.Status === "exited") {
    return {
      status: "stopped",
      lastError: undefined,
      detail: `运行服务当前状态：${containerInspection.state.Status}。`,
    };
  }

  if (containerInspection.state.Status === "restarting" || containerInspection.state.Status === "paused") {
    return {
      status: "warning",
      lastError: `运行服务当前状态：${containerInspection.state.Status}。`,
      detail: `运行服务当前状态：${containerInspection.state.Status}。`,
    };
  }

  return {
    status: "failed",
    lastError: containerInspection.state.Error || `运行服务当前状态：${containerInspection.state.Status}。`,
    detail: containerInspection.state.Error || `运行服务当前状态：${containerInspection.state.Status}。`,
  };
}

function buildRemoteConnectionFromInstance(instance) {
  const remote = instance.remote;

  if (!remote?.host || !remote?.user || (remote.authMode === "password" ? !remote.password : !remote?.keyPath)) {
    return null;
  }

  return {
    host: remote.host,
    port: remote.port || "22",
    user: remote.user,
    authMode: remote.authMode === "password" ? "password" : "ssh_key",
    keyPath: remote.keyPath,
    password: remote.password,
    workdir: remote.workdir || instance.workspaceDir,
  };
}

export function normalizeRecoverableRemoteContainerDetail(detail) {
  const message = typeof detail === "string" ? detail.trim() : "";
  if (/No such object:\s*hermes-console-|受管远程(?:容器|运行服务)已不存在/i.test(message)) {
    return "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。";
  }
  return message;
}

export function extractRemoteContainerMetadata(container) {
  if (!container || typeof container !== "object") {
    return null;
  }

  const containerName = typeof container.Name === "string" ? container.Name.replace(/^\//, "").trim() : "";
  const mount = Array.isArray(container.Mounts)
    ? container.Mounts.find((entry) => entry?.Destination === "/opt/data" && typeof entry?.Source === "string")
    : null;
  const hermesHome = mount?.Source ? String(mount.Source).trim() : "";
  const workspaceDir = hermesHome ? path.posix.dirname(hermesHome) : "";
  const bindings = container?.NetworkSettings?.Ports?.["8642/tcp"];
  const hostPort = Array.isArray(bindings) ? Number(bindings[0]?.HostPort) : Number.NaN;
  const publishedPort = Number.isFinite(hostPort) && hostPort > 0 ? hostPort : null;
  const image = typeof container?.Config?.Image === "string" ? container.Config.Image.trim() : "";
  const command = Array.isArray(container?.Config?.Cmd)
    ? container.Config.Cmd.map((entry) => String(entry))
    : [];

  if (!containerName) {
    return null;
  }

  return {
    containerName,
    publishedPort,
    hermesHome,
    workspaceDir,
    image,
    command,
  };
}

export function applyRemoteRegistrySelfHeal(instance, metadata) {
  if (!metadata?.containerName) {
    return instance;
  }

  const nextPublishedPort = Number.isFinite(metadata.publishedPort) && metadata.publishedPort > 0
    ? metadata.publishedPort
    : instance.docker?.publishedPort;
  const nextHermesHome = metadata.hermesHome || instance.hermesHome;
  const nextWorkspaceDir = metadata.workspaceDir || instance.workspaceDir;
  const nextImage = metadata.image || instance.docker?.image;
  const nextCommand = Array.isArray(metadata.command) && metadata.command.length > 0
    ? metadata.command
    : instance.docker?.command;

  const changed = (
    metadata.containerName !== instance.docker?.containerName
    || nextPublishedPort !== instance.docker?.publishedPort
    || nextHermesHome !== instance.hermesHome
    || nextWorkspaceDir !== instance.workspaceDir
    || nextImage !== instance.docker?.image
    || JSON.stringify(nextCommand || []) !== JSON.stringify(instance.docker?.command || [])
  );

  if (!changed) {
    return instance;
  }

  return {
    ...instance,
    hermesHome: nextHermesHome,
    workspaceDir: nextWorkspaceDir,
    docker: {
      ...instance.docker,
      containerName: metadata.containerName,
      publishedPort: nextPublishedPort,
      image: nextImage,
      command: nextCommand,
    },
  };
}

async function inspectManagedRemoteContainerByInstanceId(connection, instanceId) {
  if (!connection || !instanceId) {
    return null;
  }

  const listResult = await runRemoteDockerCommand(
    connection,
    [
      "ps",
      "-a",
      "--filter",
      "label=hermes.console.managed=true",
      "--filter",
      "label=hermes.console.creator=desktop-client",
      "--filter",
      `label=hermes.console.instance-id=${instanceId}`,
      "--format",
      "{{.Names}}",
    ],
    { timeoutMs: 20_000 }
  );

  if (!listResult.ok || !listResult.data?.stdout) {
    return null;
  }

  const containerName = String(listResult.data.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!containerName) {
    return null;
  }

  const inspectResult = await runRemoteDockerCommand(connection, ["inspect", containerName], { timeoutMs: 20_000 });
  if (!inspectResult.ok || !inspectResult.data?.stdout) {
    return null;
  }

  try {
    const parsed = JSON.parse(inspectResult.data.stdout);
    return Array.isArray(parsed) && parsed[0] ? parsed[0] : null;
  } catch {
    return null;
  }
}

function deriveStatusFromRemote(instance, remoteEnvironment, containerInspection, healthInspection) {
  if (instance.runtime !== "docker" || instance.type !== "remote") {
    return {
      status: instance.status ?? "unknown",
      lastError: instance.lastError,
      detail: "当前实例不是远程运行服务实例。",
    };
  }

  if (!remoteEnvironment?.ssh?.reachable) {
    const detail = remoteEnvironment?.ssh?.detail || instance.lastError || "远程 SSH 当前不可达。";
    return {
      status: instance.status === "failed" ? "failed" : "warning",
      lastError: detail,
      detail,
    };
  }

  if (!remoteEnvironment.docker.available || !remoteEnvironment.docker.daemonRunning) {
    return {
      status: instance.status === "failed" ? "failed" : "warning",
      lastError: remoteEnvironment.docker.detail,
      detail: remoteEnvironment.docker.detail,
    };
  }

  if (!instance.docker?.containerName) {
    return {
      status: "failed",
      lastError: "远程实例缺少运行服务元数据。",
      detail: "远程实例缺少运行服务元数据。",
    };
  }

  if (!containerInspection.found || !containerInspection.state) {
    const detail = normalizeRecoverableRemoteContainerDetail(containerInspection.detail || "未找到对应的远程运行服务。");
    return {
      status: instance.status === "failed" ? "failed" : "warning",
      lastError: detail,
      detail,
    };
  }

  if (containerInspection.state.Running) {
    if (healthInspection.reachable) {
      return {
        status: "running",
        lastError: undefined,
        detail: healthInspection.mode === "http-health"
          ? "远程运行服务运行中，HTTP health endpoint 正常。"
          : "远程运行服务运行中，Hermes Gateway 进程正常。",
      };
    }

    return {
      status: "warning",
      lastError: healthInspection.detail,
      detail: healthInspection.detail,
    };
  }

  if (containerInspection.state.Status === "created" || containerInspection.state.Status === "exited") {
    return {
      status: "stopped",
      lastError: undefined,
      detail: `远程运行服务当前状态：${containerInspection.state.Status}。`,
    };
  }

  if (containerInspection.state.Status === "restarting" || containerInspection.state.Status === "paused") {
    return {
      status: "warning",
      lastError: `远程运行服务当前状态：${containerInspection.state.Status}。`,
      detail: `远程运行服务当前状态：${containerInspection.state.Status}。`,
    };
  }

  return {
    status: "failed",
    lastError: containerInspection.state.Error || `远程运行服务当前状态：${containerInspection.state.Status}。`,
    detail: containerInspection.state.Error || `远程运行服务当前状态：${containerInspection.state.Status}。`,
  };
}

async function refreshLocalDockerInstance(userDataPath, instance) {
  const dockerEnvironment = await inspectDockerEnvironment();
  const containerInspection = instance.docker?.containerName
    ? await inspectContainer(instance.docker.containerName)
    : { found: false, detail: "实例缺少运行服务元数据。", state: null };
  const healthInspection = containerInspection.state?.Running
    ? await inspectLocalDockerGatewayHealth(instance.docker.containerName, instance.endpoint)
    : { reachable: false, detail: "运行服务未运行，跳过 Gateway 运行态检查。" };
  const resolved = deriveStatusFromContainer(instance, dockerEnvironment, containerInspection, healthInspection);

  const nextInstance = {
    ...instance,
    status: resolved.status,
    lastCheckedAt: nowIso(),
    lastError: resolved.lastError,
  };

  await upsertRegisteredInstance(userDataPath, nextInstance);
  await writeRuntimeMetadata(instance.workspaceDir, {
    checkedAt: nextInstance.lastCheckedAt,
    docker: dockerEnvironment,
    container: containerInspection.state,
    gateway: healthInspection,
    resolvedStatus: resolved.status,
    detail: resolved.detail,
  });

  return {
    instance: nextInstance,
    docker: dockerEnvironment,
    container: containerInspection.state,
    gateway: healthInspection,
    detail: resolved.detail,
  };
}

async function refreshRemoteDockerInstance(userDataPath, instance) {
  const connection = buildRemoteConnectionFromInstance(instance);

  if (!connection) {
    const nextInstance = {
      ...instance,
      status: instance.status === "failed" ? "failed" : "warning",
      lastCheckedAt: nowIso(),
      lastError: "远程实例缺少 SSH 连接元数据。",
    };
    await upsertRegisteredInstance(userDataPath, nextInstance);

    return {
      instance: nextInstance,
      docker: { available: false, daemonRunning: false, detail: nextInstance.lastError },
      container: null,
      gateway: { reachable: false, detail: "缺少远程连接信息，无法检查 Gateway 运行态。" },
      detail: nextInstance.lastError,
    };
  }

  const remoteEnvironmentResult = await inspectRemoteEnvironment(connection);
  const remoteEnvironment = remoteEnvironmentResult.ok && remoteEnvironmentResult.data
    ? remoteEnvironmentResult.data
    : {
        ssh: {
          reachable: false,
          detail: remoteEnvironmentResult.error?.detail ?? remoteEnvironmentResult.error?.message ?? "远程环境读取失败。",
        },
        docker: {
          available: false,
          daemonRunning: false,
          detail: remoteEnvironmentResult.error?.detail ?? remoteEnvironmentResult.error?.message ?? "远程运行服务状态未知。",
        },
      };

  const discoveredContainer = remoteEnvironment.ssh.reachable
    ? await inspectManagedRemoteContainerByInstanceId(connection, instance.id)
    : null;
  const healedInstance = applyRemoteRegistrySelfHeal(instance, extractRemoteContainerMetadata(discoveredContainer));

  const containerInspection = healedInstance.docker?.containerName && remoteEnvironment.ssh.reachable
    ? await inspectRemoteContainerState(connection, healedInstance.docker.containerName)
    : { found: false, detail: "未建立可用 SSH 连接，跳过远程运行服务检查。", state: null };

  if (!discoveredContainer && remoteEnvironment.ssh.reachable && remoteEnvironment.docker.available && remoteEnvironment.docker.daemonRunning) {
    containerInspection.detail = normalizeRecoverableRemoteContainerDetail(
      containerInspection.detail || "未找到对应的远程运行服务。"
    );
  }

  const healthInspection = containerInspection.state?.Running
    ? await inspectRemoteGatewayHealth(connection, healedInstance.docker?.publishedPort, { containerName: healedInstance.docker?.containerName })
    : { reachable: false, detail: "远程运行服务未运行，跳过 Gateway 运行态检查。" };

  const resolved = deriveStatusFromRemote(healedInstance, remoteEnvironment, containerInspection, healthInspection);
  const nextInstance = {
    ...healedInstance,
    status: resolved.status,
    lastCheckedAt: nowIso(),
    lastError: resolved.lastError,
  };

  await upsertRegisteredInstance(userDataPath, nextInstance);

  try {
    await writeRemoteRuntimeMetadata(connection, path.posix.join(nextInstance.workspaceDir, "runtime"), {
      checkedAt: nextInstance.lastCheckedAt,
      docker: remoteEnvironment.docker,
      ssh: remoteEnvironment.ssh,
      container: containerInspection.state,
      gateway: healthInspection,
      resolvedStatus: resolved.status,
      detail: resolved.detail,
    });
  } catch {
    // ignore remote runtime metadata write failure during status refresh
  }

  return {
    instance: nextInstance,
    docker: remoteEnvironment.docker,
    container: containerInspection.state,
    gateway: healthInspection,
    detail: resolved.detail,
  };
}

export async function getInstanceState(userDataPath, instanceId) {
  const registryResult = await getRegisteredInstance(userDataPath, instanceId);

  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  if (!registryResult.data.instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }

  let refreshed;
  if (registryResult.data.instance.type === "remote" && registryResult.data.instance.runtime === "docker") {
    refreshed = await refreshRemoteDockerInstance(userDataPath, registryResult.data.instance);
  } else if (registryResult.data.instance.type === "local" && registryResult.data.instance.runtime === "native") {
    refreshed = await refreshLocalNativeInstance(userDataPath, registryResult.data.instance);
  } else {
    refreshed = await refreshLocalDockerInstance(userDataPath, registryResult.data.instance);
  }

  return {
    ok: true,
    data: {
      filePath: registryResult.data.filePath,
      instance: refreshed.instance,
      diagnostics: {
        docker: refreshed.docker,
        container: refreshed.container,
        gateway: refreshed.gateway,
        detail: refreshed.detail,
      },
    },
  };
}

export async function listInstanceStates(userDataPath) {
  const registryResult = await listRegisteredInstances(userDataPath);

  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  const nextInstances = [];

  for (const instance of registryResult.data.instances) {
    if (instance.type === "local" && instance.runtime === "native") {
      const refreshed = await refreshLocalNativeInstance(userDataPath, instance);
      nextInstances.push(refreshed.instance);
      continue;
    }

    if (instance.type === "local" && instance.runtime === "docker") {
      const refreshed = await refreshLocalDockerInstance(userDataPath, instance);
      nextInstances.push(refreshed.instance);
      continue;
    }

    if (instance.type === "remote" && instance.runtime === "docker") {
      const refreshed = await refreshRemoteDockerInstance(userDataPath, instance);
      nextInstances.push(refreshed.instance);
      continue;
    }

    nextInstances.push(instance);
  }

  return {
    ok: true,
    data: {
      filePath: registryResult.data.filePath,
      instances: nextInstances,
      recoveredFromCorruption: registryResult.data.recoveredFromCorruption ?? false,
      backupPath: registryResult.data.backupPath,
    },
  };
}

export async function startInstance(userDataPath, instanceId) {
  const registryResult = await getRegisteredInstance(userDataPath, instanceId);

  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  const instance = registryResult.data.instance;

  if (!instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }

  if (instance.type === "local" && instance.runtime === "docker") {
    if (!instance.docker?.containerName) {
      return toDesktopError("INSTANCE_CONTAINER_MISSING", "实例缺少运行服务元数据。", `instanceId=${instanceId}`, true);
    }

    const dockerEnvironment = await inspectDockerEnvironment();

    if (!dockerEnvironment.available || !dockerEnvironment.daemonRunning) {
      return toDesktopError(
        dockerEnvironment.available ? "DOCKER_DAEMON_UNAVAILABLE" : "DOCKER_UNAVAILABLE",
        dockerEnvironment.available ? "运行服务未启动，无法启动实例。" : "未找到可用运行服务，无法启动实例。",
        dockerEnvironment.detail,
        true
      );
    }

    const containerInspection = await inspectContainer(instance.docker.containerName);

    if (!containerInspection.found) {
      return redeployLocalDockerInstance(userDataPath, instance);
    }

    const startResult = await runDockerCommand(["start", instance.docker.containerName], {
      timeoutMs: STATE_TIMEOUT_MS,
    });

    if (!startResult.ok) {
      return {
        ok: false,
        error: {
          code: startResult.error?.code ?? "INSTANCE_START_FAILED",
          message: "实例启动失败。",
          detail: startResult.error?.detail ?? startResult.data?.stderr ?? startResult.data?.stdout,
          recoverable: true,
        },
      };
    }

    await upsertRegisteredInstance(userDataPath, withOperation(instance, "start", "本机运行服务已启动并刷新状态。"));
    return getInstanceState(userDataPath, instanceId);
  }

  if (instance.type === "local" && instance.runtime === "native") {
    if (isManagedNativeProcess(instance)) {
      const managedStart = await startManagedNativeGateway(instance);

      if (!managedStart.ok) {
        return toDesktopError("INSTANCE_START_FAILED", "Native 实例启动失败。", managedStart.detail, true);
      }

      await upsertRegisteredInstance(userDataPath, {
        ...withOperation(instance, "start", "Native gateway 已启动并刷新状态。"),
        status: "running",
        lastError: undefined,
        lastCheckedAt: nowIso(),
        native: {
          mode: "managed-process",
          pid: managedStart.pid,
          command: managedStart.args,
          binaryPath: managedStart.binaryPath,
        },
      });

      return getInstanceState(userDataPath, instanceId);
    }

    const startResult = await runHermesCommand(["gateway", "start"], {
      env: { HERMES_HOME: instance.hermesHome },
      timeoutMs: START_TIMEOUT_MS,
    });

    if (!startResult.ok) {
      return {
        ok: false,
        error: {
          code: startResult.error?.code ?? "INSTANCE_START_FAILED",
          message: "Native 实例启动失败。",
          detail: startResult.error?.detail ?? startResult.data?.stderr ?? startResult.data?.stdout,
          recoverable: true,
        },
      };
    }

    await upsertRegisteredInstance(userDataPath, withOperation(instance, "start", "Native gateway 已启动并刷新状态。"));
    return getInstanceState(userDataPath, instanceId);
  }

  if (instance.type === "remote" && instance.runtime === "docker") {
    if (!instance.docker?.containerName) {
      return toDesktopError("INSTANCE_CONTAINER_MISSING", "远程实例缺少运行服务元数据。", `instanceId=${instanceId}`, true);
    }

    const connection = buildRemoteConnectionFromInstance(instance);
    if (!connection) {
      return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instanceId}`, true);
    }

    const remoteEnvironmentResult = await inspectRemoteEnvironment(connection);
    if (!remoteEnvironmentResult.ok || !remoteEnvironmentResult.data) {
      return remoteEnvironmentResult;
    }

    if (!remoteEnvironmentResult.data.docker.available || !remoteEnvironmentResult.data.docker.daemonRunning) {
      return toDesktopError(
        remoteEnvironmentResult.data.docker.available ? "DOCKER_DAEMON_UNAVAILABLE" : "DOCKER_UNAVAILABLE",
        remoteEnvironmentResult.data.docker.available ? "远程运行服务未启动，无法启动实例。" : "远程环境未找到可用运行服务。",
        remoteEnvironmentResult.data.docker.detail,
        true
      );
    }

    const containerInspection = await inspectRemoteContainerState(connection, instance.docker.containerName);

    if (!containerInspection.found) {
      return redeployRemoteDockerInstance(userDataPath, instance, connection);
    }

    const startResult = await runRemoteDockerCommand(connection, ["start", instance.docker.containerName], {
      timeoutMs: STATE_TIMEOUT_MS,
    });

    if (!startResult.ok) {
      return {
        ok: false,
        error: {
          code: startResult.error?.code ?? "INSTANCE_START_FAILED",
          message: "远程实例启动失败。",
          detail: startResult.error?.detail ?? startResult.data?.stderr ?? startResult.data?.stdout,
          recoverable: true,
        },
      };
    }

    await upsertRegisteredInstance(userDataPath, withOperation(instance, "start", "远程运行服务已启动并刷新状态。"));
    return getInstanceState(userDataPath, instanceId);
  }

  return toDesktopError("INSTANCE_RUNTIME_UNSUPPORTED", "当前阶段不支持该实例运行方式。", `instanceId=${instanceId}`, true);
}

export async function stopInstance(userDataPath, instanceId) {
  const registryResult = await getRegisteredInstance(userDataPath, instanceId);

  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  const instance = registryResult.data.instance;

  if (!instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }

  if (instance.type === "local" && instance.runtime === "docker") {
    if (!instance.docker?.containerName) {
      return toDesktopError("INSTANCE_CONTAINER_MISSING", "实例缺少运行服务元数据。", `instanceId=${instanceId}`, true);
    }

    const dockerEnvironment = await inspectDockerEnvironment();

    if (!dockerEnvironment.available || !dockerEnvironment.daemonRunning) {
      return toDesktopError(
        dockerEnvironment.available ? "DOCKER_DAEMON_UNAVAILABLE" : "DOCKER_UNAVAILABLE",
        dockerEnvironment.available ? "运行服务未启动，无法停止实例。" : "未找到可用运行服务，无法停止实例。",
        dockerEnvironment.detail,
        true
      );
    }

    const stopResult = await runDockerCommand(["stop", "--time", "10", instance.docker.containerName], {
      timeoutMs: STATE_TIMEOUT_MS,
    });

    if (!stopResult.ok) {
      return {
        ok: false,
        error: {
          code: stopResult.error?.code ?? "INSTANCE_STOP_FAILED",
          message: "实例停止失败。",
          detail: stopResult.error?.detail ?? stopResult.data?.stderr ?? stopResult.data?.stdout,
          recoverable: true,
        },
      };
    }

    await upsertRegisteredInstance(userDataPath, withOperation(instance, "stop", "本机运行服务已停止并刷新状态。"));
    return getInstanceState(userDataPath, instanceId);
  }

  if (instance.type === "remote" && instance.runtime === "docker") {
    if (!instance.docker?.containerName) {
      return toDesktopError("INSTANCE_CONTAINER_MISSING", "远程实例缺少运行服务元数据。", `instanceId=${instanceId}`, true);
    }

    const connection = buildRemoteConnectionFromInstance(instance);
    if (!connection) {
      return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instanceId}`, true);
    }

    const remoteEnvironmentResult = await inspectRemoteEnvironment(connection);
    if (!remoteEnvironmentResult.ok || !remoteEnvironmentResult.data) {
      return remoteEnvironmentResult;
    }

    if (!remoteEnvironmentResult.data.docker.available || !remoteEnvironmentResult.data.docker.daemonRunning) {
      return toDesktopError(
        remoteEnvironmentResult.data.docker.available ? "DOCKER_DAEMON_UNAVAILABLE" : "DOCKER_UNAVAILABLE",
        remoteEnvironmentResult.data.docker.available ? "远程运行服务未启动，无法停止实例。" : "远程环境未找到可用运行服务。",
        remoteEnvironmentResult.data.docker.detail,
        true
      );
    }

    const stopResult = await runRemoteDockerCommand(connection, ["stop", "--time", "10", instance.docker.containerName], {
      timeoutMs: STATE_TIMEOUT_MS,
    });

    if (!stopResult.ok) {
      return {
        ok: false,
        error: {
          code: stopResult.error?.code ?? "INSTANCE_STOP_FAILED",
          message: "远程实例停止失败。",
          detail: stopResult.error?.detail ?? stopResult.data?.stderr ?? stopResult.data?.stdout,
          recoverable: true,
        },
      };
    }

    await upsertRegisteredInstance(userDataPath, withOperation(instance, "stop", "远程运行服务已停止并刷新状态。"));
    return getInstanceState(userDataPath, instanceId);
  }

  if (instance.type === "local" && instance.runtime === "native") {
    if (isManagedNativeProcess(instance)) {
      try {
        await stopManagedNativeGateway(instance.native?.pid);
      } catch (error) {
        return toDesktopError("INSTANCE_STOP_FAILED", "Native 实例停止失败。", error instanceof Error ? error.message : "无法停止 Native gateway 进程。", true);
      }

      await upsertRegisteredInstance(userDataPath, {
        ...withOperation(instance, "stop", "Native gateway 已停止并刷新状态。"),
        status: "stopped",
        lastError: undefined,
        lastCheckedAt: nowIso(),
        native: {
          ...instance.native,
          pid: null,
        },
      });

      return getInstanceState(userDataPath, instanceId);
    }

    const stopResult = await runHermesCommand(["gateway", "stop"], {
      env: { HERMES_HOME: instance.hermesHome },
      timeoutMs: STATE_TIMEOUT_MS,
    });

    if (!stopResult.ok) {
      return {
        ok: false,
        error: {
          code: stopResult.error?.code ?? "INSTANCE_STOP_FAILED",
          message: "Native 实例停止失败。",
          detail: stopResult.error?.detail ?? stopResult.data?.stderr ?? stopResult.data?.stdout,
          recoverable: true,
        },
      };
    }

    await upsertRegisteredInstance(userDataPath, withOperation(instance, "stop", "Native gateway 已停止并刷新状态。"));
    return getInstanceState(userDataPath, instanceId);
  }

  return toDesktopError("INSTANCE_RUNTIME_UNSUPPORTED", "当前阶段不支持该实例运行方式。", `instanceId=${instanceId}`, true);
}
