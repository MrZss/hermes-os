import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { getDefaultInstancesRoot } from "./environment.mjs";
import { getRegisteredInstance, removeRegisteredInstance } from "./instance-registry.mjs";
import { runHermesCommand } from "./hermes-cli.mjs";
import { inspectDockerEnvironment, runDockerCommand } from "./docker-runtime.mjs";
import { inspectRemoteEnvironment } from "./remote-environment.mjs";
import {
  inspectRemoteContainerState,
  inspectRemoteGatewayHealth,
  parseRemoteGatewayRuntimeProbeOutput as parseDockerGatewayRuntimeProbeOutput,
  readRemoteContainerLogs,
  runRemoteDockerCommand,
} from "./remote-instance.mjs";
import { copyLocalFileToRemote, runSshCommand } from "./ssh-runtime.mjs";
import { clearInstanceProviderTests } from "./provider-tests.mjs";
import {
  isRemoteDockerInstance,
  readRemoteDockerTextFile,
  runRemoteDockerHermesCommand,
} from "./remote-docker-files.mjs";

const DEFAULT_LOG_LINES = 200;
const BACKUP_TIMEOUT_MS = 180_000;
const LOG_FILENAMES = {
  agent: "agent.log",
  gateway: "gateway.log",
  errors: "errors.log",
};

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

function nowIso() {
  return new Date().toISOString();
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `"'"'`)}'`;
}

function getInstanceConnection(instance) {
  if (instance.type !== "remote" || !instance.remote?.host || !instance.remote?.user || (instance.remote.authMode === "password" ? !instance.remote?.password : !instance.remote?.keyPath)) {
    return null;
  }

  return {
    host: instance.remote.host,
    port: instance.remote.port || "22",
    user: instance.remote.user,
    authMode: instance.remote.authMode === "password" ? "password" : "ssh_key",
    keyPath: instance.remote.keyPath,
    password: instance.remote.password,
    workdir: instance.remote.workdir || instance.workspaceDir,
  };
}

function getHermesEnv(instance) {
  return {
    HERMES_HOME: instance.hermesHome,
  };
}

function getBackupsRoot(instance) {
  return path.join(instance.workspaceDir, "backups");
}

async function ensureLocalDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function localFileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeSinceArg(since) {
  return typeof since === "string" && since.trim() ? since.trim() : undefined;
}

function normalizeLevelArg(level) {
  if (!level || level === "ALL") return undefined;
  return String(level).trim().toUpperCase();
}

function buildLogArgs(kind, { lines = DEFAULT_LOG_LINES, level, since, component } = {}) {
  const args = ["logs"];
  if (kind !== "agent") {
    args.push(kind);
  }
  if (Number.isFinite(lines) && lines > 0) {
    args.push("-n", String(lines));
  }
  const normalizedLevel = normalizeLevelArg(level);
  if (normalizedLevel) {
    args.push("--level", normalizedLevel);
  }
  const normalizedSince = normalizeSinceArg(since);
  if (normalizedSince) {
    args.push("--since", normalizedSince);
  }
  if (component && String(component).trim()) {
    args.push("--component", String(component).trim());
  }
  return args;
}

function parseLogEntries(rawText) {
  const lines = String(rawText || "").split(/\r?\n/).filter(Boolean);
  const entries = [];
  const matcher = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+([A-Z]+)\s+([^:]+):\s?(.*)$/;

  for (const line of lines) {
    const match = line.match(matcher);
    if (match) {
      entries.push({
        id: `${match[1]}-${entries.length}`,
        timestamp: match[1],
        level: match[2],
        component: match[3],
        message: match[4],
        raw: line,
      });
      continue;
    }

    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      last.message = `${last.message}\n${line}`;
      last.raw = `${last.raw}\n${line}`;
    } else {
      entries.push({
        id: `raw-${entries.length}`,
        timestamp: "",
        level: "INFO",
        component: "raw",
        message: line,
        raw: line,
      });
    }
  }

  return entries;
}

async function getLocalDockerStats(containerName) {
  if (!containerName) return null;
  const result = await runDockerCommand(["stats", "--no-stream", "--format", "{{json .}}", containerName], {
    timeoutMs: 20_000,
  });

  if (!result.ok || !result.data?.stdout) return null;

  try {
    return JSON.parse(result.data.stdout);
  } catch {
    return null;
  }
}

async function getRemoteDockerStats(connection, containerName) {
  if (!containerName) return null;
  const result = await runRemoteDockerCommand(connection, ["stats", "--no-stream", "--format", "{{json .}}", containerName], {
    timeoutMs: 20_000,
  });

  if (!result.ok || !result.data?.stdout) return null;

  try {
    return JSON.parse(result.data.stdout);
  } catch {
    return null;
  }
}

function parsePercentString(value) {
  const match = String(value || "").trim().match(/([\d.]+)%?/);
  return match ? Number(match[1]) : null;
}

async function probeLocalGatewayHealth(endpoint) {
  if (!endpoint) {
    return { reachable: false, detail: "未配置 Gateway endpoint。" };
  }

  const targetUrl = new URL(`${endpoint.replace(/\/$/, "")}/health`);
  const transport = targetUrl.protocol === "https:" ? https : http;

  return new Promise((resolve) => {
    const request = transport.request(targetUrl, {
      method: "GET",
      timeout: 2_500,
      headers: {
        Connection: "close",
      },
    }, (response) => {
      response.resume();
      resolve({
        reachable: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
        detail: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300
          ? "Gateway health endpoint 可访问。"
          : `Gateway health endpoint 返回 ${response.statusCode ?? "unknown"}。`,
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("Gateway health endpoint 请求超时。"));
    });

    request.on("error", (error) => {
      resolve({
        reachable: false,
        detail: error instanceof Error ? error.message : "Gateway health endpoint 不可访问。",
      });
    });

    request.end();
  });
}

function toDockerGatewayProbeSection(marker, value) {
  const text = String(value || "").trim();
  if (!text) return `${marker}`;
  return text.split(/\r?\n/).map((line) => `${marker}${line}`).join("\n");
}

async function probeLocalDockerGatewayHealth(instance) {
  if (!instance.docker?.containerName) {
    return { reachable: false, detail: "缺少本地 Docker 容器信息。" };
  }

  const [processResult, logResult] = await Promise.all([
    runDockerCommand([
      "exec",
      instance.docker.containerName,
      "sh",
      "-lc",
      'set +e; ps -ef | grep -E "[h]ermes gateway run|[p]ython3 .*/hermes gateway run|[p]ython .*/hermes gateway run" | head -n 5; exit 0',
    ], { timeoutMs: 10_000 }),
    runDockerCommand([
      "exec",
      instance.docker.containerName,
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

  const httpHealth = await probeLocalGatewayHealth(instance.endpoint);
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

async function getLocalRuntimeDiagnostics(instance) {
  const [dockerEnvironment, statusResult, doctorResult, dockerStats, gatewayHealth] = await Promise.all([
    inspectDockerEnvironment(),
    runHermesCommand(["status", "--deep"], { env: getHermesEnv(instance), timeoutMs: 40_000 }),
    runHermesCommand(["doctor"], { env: getHermesEnv(instance), timeoutMs: 40_000 }),
    getLocalDockerStats(instance.docker?.containerName),
    instance.runtime === "docker" ? probeLocalDockerGatewayHealth(instance) : probeLocalGatewayHealth(instance.endpoint),
  ]);

  return {
    checkedAt: nowIso(),
    statusText: statusResult.ok ? statusResult.data?.stdout ?? "" : statusResult.error?.detail ?? "status 读取失败。",
    doctorText: doctorResult.ok ? doctorResult.data?.stdout ?? "" : doctorResult.error?.detail ?? "doctor 读取失败。",
    resources: {
      cpuPercent: parsePercentString(dockerStats?.CPUPerc),
      memoryPercent: parsePercentString(dockerStats?.MemPerc),
      memoryUsage: dockerStats?.MemUsage ?? "",
    },
    services: [
      { name: "Docker Engine", status: dockerEnvironment.daemonRunning ? "正常" : dockerEnvironment.available ? "警告" : "离线", detail: dockerEnvironment.detail },
      { name: "Hermes CLI", status: statusResult.ok ? "正常" : "警告", detail: statusResult.ok ? "status --deep 执行成功。" : statusResult.error?.detail ?? "status 读取失败。" },
      { name: "Gateway", status: gatewayHealth.reachable ? "正常" : instance.status === "running" ? "警告" : "离线", detail: gatewayHealth.detail },
    ],
    hints: [doctorResult.ok ? null : (doctorResult.error?.message ?? "doctor 返回错误。"), gatewayHealth.reachable ? null : gatewayHealth.detail].filter(Boolean),
  };
}

async function getRemoteRuntimeDiagnostics(instance) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const [remoteEnvironmentResult, containerInspection, gatewayHealth, dockerStats] = await Promise.all([
    inspectRemoteEnvironment(connection),
    instance.docker?.containerName ? inspectRemoteContainerState(connection, instance.docker.containerName) : Promise.resolve({ found: false, detail: "缺少容器信息。", state: null }),
    inspectRemoteGatewayHealth(connection, instance.docker?.publishedPort, { containerName: instance.docker?.containerName }),
    instance.docker?.containerName ? getRemoteDockerStats(connection, instance.docker.containerName) : Promise.resolve(null),
  ]);

  if (!remoteEnvironmentResult.ok || !remoteEnvironmentResult.data) {
    return remoteEnvironmentResult;
  }

  const remoteEnvironment = remoteEnvironmentResult.data;
  let statusText = "当前远程实例未发现可用的 Hermes CLI。";
  let doctorText = "当前远程实例未发现可用的 Hermes CLI。";
  let hermesCliStatus = remoteEnvironment.hermes.available ? "正常" : "警告";
  let hermesCliDetail = remoteEnvironment.hermes.detail;

  if (isRemoteDockerInstance(instance)) {
    const [statusResult, doctorResult] = await Promise.all([
      runRemoteDockerHermesCommand(instance, ["status", "--deep"], { timeoutMs: 40_000, cwd: instance.hermesHome }),
      runRemoteDockerHermesCommand(instance, ["doctor"], { timeoutMs: 40_000, cwd: instance.hermesHome }),
    ]);
    statusText = statusResult.ok ? statusResult.data?.stdout ?? "" : statusResult.error?.detail ?? statusText;
    doctorText = doctorResult.ok ? doctorResult.data?.stdout ?? "" : doctorResult.error?.detail ?? doctorText;
    hermesCliStatus = statusResult.ok || doctorResult.ok ? "正常" : "警告";
    hermesCliDetail = statusResult.ok || doctorResult.ok
      ? "已在远程 Docker 容器内执行 Hermes CLI。"
      : statusResult.error?.detail ?? doctorResult.error?.detail ?? "远程 Docker 容器内 Hermes CLI 检测失败。";
  } else if (remoteEnvironment.hermes.available) {
    const [statusResult, doctorResult] = await Promise.all([
      runSshCommand(connection, `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes status --deep`, { timeoutMs: 40_000 }),
      runSshCommand(connection, `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes doctor`, { timeoutMs: 40_000 }),
    ]);
    statusText = statusResult.ok ? statusResult.data?.stdout ?? "" : statusResult.error?.detail ?? statusText;
    doctorText = doctorResult.ok ? doctorResult.data?.stdout ?? "" : doctorResult.error?.detail ?? doctorText;
  }

  return {
    checkedAt: nowIso(),
    statusText,
    doctorText,
    resources: {
      cpuPercent: parsePercentString(dockerStats?.CPUPerc),
      memoryPercent: parsePercentString(dockerStats?.MemPerc),
      memoryUsage: dockerStats?.MemUsage ?? "",
    },
    services: [
      { name: "SSH 隧道", status: remoteEnvironment.ssh.reachable ? "正常" : "离线", detail: remoteEnvironment.ssh.detail },
      { name: "Docker Engine", status: remoteEnvironment.docker.daemonRunning ? "正常" : remoteEnvironment.docker.available ? "警告" : "离线", detail: remoteEnvironment.docker.detail },
      { name: "Gateway", status: gatewayHealth.reachable ? "正常" : containerInspection.state?.Running ? "警告" : "离线", detail: gatewayHealth.detail },
      { name: "Hermes CLI", status: hermesCliStatus, detail: hermesCliDetail },
    ],
    hints: [
      remoteEnvironment.port.available === false ? remoteEnvironment.port.detail : null,
      gatewayHealth.reachable ? null : gatewayHealth.detail,
      hermesCliStatus === "正常" ? null : hermesCliDetail,
    ].filter(Boolean),
  };
}

async function readLocalLogViaCli(instance, kind, options) {
  const result = await runHermesCommand(buildLogArgs(kind, options), {
    env: getHermesEnv(instance),
    timeoutMs: 40_000,
  });

  if (!result.ok) {
    return null;
  }

  return {
    rawText: result.data?.stdout ?? "",
    source: {
      type: "hermes-cli",
      path: `${instance.hermesHome}/logs/${LOG_FILENAMES[kind]}`,
      detail: `通过 Hermes CLI 读取 ${kind} 日志。`,
    },
  };
}

async function readLocalLogFallback(instance, kind, options) {
  const logPath = path.join(instance.hermesHome, "logs", LOG_FILENAMES[kind]);

  if (await localFileExists(logPath)) {
    const raw = await fs.readFile(logPath, "utf8");
    const lines = raw.split(/\r?\n/);
    const tail = lines.slice(-Math.max(1, options.lines ?? DEFAULT_LOG_LINES)).join("\n");
    return {
      rawText: tail,
      source: {
        type: "file",
        path: logPath,
        detail: `直接读取 ${LOG_FILENAMES[kind]}。`,
      },
    };
  }

  if (kind === "gateway" && instance.docker?.containerName) {
    const result = await runDockerCommand(["logs", "--tail", String(options.lines ?? DEFAULT_LOG_LINES), instance.docker.containerName], {
      timeoutMs: 20_000,
    });
    return {
      rawText: [result.data?.stdout, result.data?.stderr].filter(Boolean).join("\n"),
      source: {
        type: "docker",
        path: instance.docker.containerName,
        detail: "gateway.log 缺失，回退到 docker logs。",
      },
    };
  }

  return {
    rawText: "",
    source: {
      type: "missing",
      path: logPath,
      detail: "未找到对应日志文件。",
    },
  };
}

async function readRemoteLog(instance, kind, options) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const logPath = path.posix.join(instance.hermesHome, "logs", LOG_FILENAMES[kind]);
  if (isRemoteDockerInstance(instance)) {
    const raw = await readRemoteDockerTextFile(instance, logPath);
    if (raw.trim()) {
      const lines = raw.split(/\r?\n/);
      const tail = lines.slice(-Math.max(1, options.lines ?? DEFAULT_LOG_LINES)).join("\n");
      return {
        rawText: tail,
        source: {
          type: "docker-file",
          path: logPath,
          detail: `通过远程 Docker 容器读取 ${LOG_FILENAMES[kind]}。`,
        },
      };
    }

    if (kind === "gateway" && instance.docker?.containerName) {
      const logs = await readRemoteContainerLogs(connection, instance.docker.containerName);
      return {
        rawText: logs,
        source: {
          type: "ssh-docker",
          path: instance.docker.containerName,
          detail: "容器内 gateway.log 缺失，回退到 docker logs。",
        },
      };
    }

    return {
      rawText: "",
      source: {
        type: "missing",
        path: logPath,
        detail: "未找到对应容器内日志文件。",
      },
    };
  }

  const tailCommand = `if [ -f ${shellEscape(logPath)} ]; then tail -n ${Math.max(1, options.lines ?? DEFAULT_LOG_LINES)} ${shellEscape(logPath)}; fi`;
  const result = await runSshCommand(connection, tailCommand, { timeoutMs: 20_000 });

  if (result.ok && result.data?.stdout?.trim()) {
    return {
      rawText: result.data.stdout,
      source: {
        type: "ssh-file",
        path: logPath,
        detail: `通过 SSH 读取 ${LOG_FILENAMES[kind]}。`,
      },
    };
  }

  if (kind === "gateway" && instance.docker?.containerName) {
    const logs = await readRemoteContainerLogs(connection, instance.docker.containerName);
    return {
      rawText: logs,
      source: {
        type: "ssh-docker",
        path: instance.docker.containerName,
        detail: "远程 gateway.log 缺失，回退到 docker logs。",
      },
    };
  }

  return {
    rawText: "",
    source: {
      type: "missing",
      path: logPath,
      detail: result.ok ? "未找到对应远程日志文件。" : result.error?.detail ?? "读取远程日志失败。",
    },
  };
}

function applyClientSideFilters(entries, { search, level }) {
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const normalizedLevel = normalizeLevelArg(level);

  return entries.filter((entry) => {
    if (normalizedLevel && String(entry.level || "").toUpperCase() !== normalizedLevel) {
      return false;
    }

    if (normalizedSearch) {
      const haystack = `${entry.raw}\n${entry.message}\n${entry.component}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    }

    return true;
  });
}

function buildBackupFileName(instanceId, quick = false) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${instanceId}-${quick ? "quick-" : ""}${stamp}.zip`;
}

function ensureZipFileName(sourcePath, instanceId) {
  const baseName = path.basename(sourcePath);
  if (baseName.toLowerCase().endsWith(".zip")) {
    return baseName;
  }
  return `${instanceId}-${Date.now()}.zip`;
}

async function ensureUniqueLocalBackupPath(backupsRoot, fileName) {
  const extension = path.extname(fileName) || ".zip";
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(backupsRoot, fileName);
  let counter = 2;

  while (await localFileExists(candidate)) {
    candidate = path.join(backupsRoot, `${baseName}-${counter}${extension}`);
    counter += 1;
  }

  return candidate;
}

function buildRemoteBackupPath(backupsRoot, fileName) {
  const extension = path.posix.extname(fileName) || ".zip";
  const baseName = path.posix.basename(fileName, extension);
  return path.posix.join(backupsRoot, `${baseName}-${Date.now()}${extension}`);
}

function isManagedLocalWorkspace(instance) {
  if (instance.type !== "local") return false;
  const workspaceDir = path.resolve(instance.workspaceDir);
  const managedRoot = path.resolve(getDefaultInstancesRoot());
  return workspaceDir === managedRoot || workspaceDir.startsWith(`${managedRoot}${path.sep}`);
}

function shouldPreserveExternalWorkspace(instance) {
  if (instance.type !== "local") return false;
  const workspaceDir = path.resolve(instance.workspaceDir);
  const hermesHome = path.resolve(instance.hermesHome);
  return workspaceDir === hermesHome && !isManagedLocalWorkspace(instance);
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

async function stopManagedNativeProcess(pid) {
  if (!isProcessAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }

  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!isProcessAlive(pid)) return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function isSafeRemoteWorkspace(instance) {
  if (instance.type !== "remote") return false;
  const workspaceDir = String(instance.workspaceDir || "").trim();
  const disallowed = new Set([
    "",
    "/",
    "/root",
    `/home/${instance.remote?.user ?? ""}`,
    `/Users/${instance.remote?.user ?? ""}`,
  ]);
  return !disallowed.has(workspaceDir);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 10 || unit === "B" ? value.toFixed(unit === "B" ? 0 : 1) : value.toFixed(2)} ${unit}`;
}

function toBackupEntry(instance, fileName, stats, location) {
  return {
    id: fileName,
    fileName,
    createdAt: stats.mtime.toISOString(),
    createdLabel: stats.mtime.toLocaleString("zh-CN", { hour12: false }),
    sizeBytes: stats.size,
    sizeLabel: formatSize(stats.size),
    type: fileName.includes("quick-") ? "快速快照" : "手动备份",
    scope: instance.defaultProfile ? `${instance.defaultProfile} / 实例数据` : "实例数据",
    status: "可恢复",
    location,
  };
}

async function listLocalBackups(instance) {
  const backupsRoot = getBackupsRoot(instance);
  await ensureLocalDirectory(backupsRoot);
  const entries = await fs.readdir(backupsRoot, { withFileTypes: true }).catch(() => []);
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".zip")) continue;
    const fullPath = path.join(backupsRoot, entry.name);
    const stats = await fs.stat(fullPath);
    items.push(toBackupEntry(instance, entry.name, stats, fullPath));
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { backupsRoot, items };
}

async function listRemoteBackups(instance) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const backupsRoot = path.posix.join(instance.workspaceDir, "backups");
  const command = `
mkdir -p ${shellEscape(backupsRoot)}
find ${shellEscape(backupsRoot)} -maxdepth 1 -type f -name '*.zip' -printf '%f\t%s\t%TY-%Tm-%TdT%TH:%TM:%TS\n' 2>/dev/null | sort -r
`.trim();
  const result = await runSshCommand(connection, command, { timeoutMs: 20_000 });

  if (!result.ok || !result.data) {
    return result;
  }

  const items = result.data.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [fileName, size, createdRaw] = line.split("\t");
      const createdAt = new Date(createdRaw).toISOString();
      const sizeBytes = Number(size);
      return {
        id: fileName,
        fileName,
        createdAt,
        createdLabel: new Date(createdAt).toLocaleString("zh-CN", { hour12: false }),
        sizeBytes,
        sizeLabel: formatSize(sizeBytes),
        type: fileName.includes("quick-") ? "快速快照" : "手动备份",
        scope: instance.defaultProfile ? `${instance.defaultProfile} / 实例数据` : "实例数据",
        status: "可恢复",
        location: path.posix.join(backupsRoot, fileName),
      };
    });

  return {
    ok: true,
    data: {
      backupsRoot,
      items,
    },
  };
}

async function createLocalBackup(instance) {
  const backupsRoot = getBackupsRoot(instance);
  await ensureLocalDirectory(backupsRoot);
  const outputPath = path.join(backupsRoot, buildBackupFileName(instance.id, false));
  const args = ["backup", "-o", outputPath];
  const result = await runHermesCommand(args, {
    env: getHermesEnv(instance),
    timeoutMs: BACKUP_TIMEOUT_MS,
  });

  if (!result.ok) {
    return result;
  }

  const stats = await fs.stat(outputPath);
  return {
    ok: true,
    data: {
      created: toBackupEntry(instance, path.basename(outputPath), stats, outputPath),
    },
  };
}

function buildRemotePythonZipCommand(sourceDir, outputPath) {
  return `
mkdir -p ${shellEscape(path.posix.dirname(outputPath))}
SRC=${shellEscape(sourceDir)} OUT=${shellEscape(outputPath)} python3 - <<'PY'
import os, pathlib, zipfile
src = pathlib.Path(os.environ['SRC'])
out = pathlib.Path(os.environ['OUT'])
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for item in src.rglob('*'):
        if item.is_file():
            zf.write(item, item.relative_to(src))
print(out)
PY
`.trim();
}

function buildRemotePythonUnzipCommand(zipPath, targetDir) {
  return `
ZIP_PATH=${shellEscape(zipPath)} TARGET_DIR=${shellEscape(targetDir)} python3 - <<'PY'
import os, pathlib, zipfile
zip_path = pathlib.Path(os.environ['ZIP_PATH'])
target_dir = pathlib.Path(os.environ['TARGET_DIR'])
target_dir.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(zip_path, 'r') as zf:
    zf.extractall(target_dir)
print(target_dir)
PY
`.trim();
}

async function createRemoteBackup(instance) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const backupsRoot = path.posix.join(instance.workspaceDir, "backups");
  const outputPath = path.posix.join(backupsRoot, buildBackupFileName(instance.id, false));
  const remoteEnvironment = await inspectRemoteEnvironment(connection);

  if (!remoteEnvironment.ok || !remoteEnvironment.data) {
    return remoteEnvironment;
  }

  let result;
  if (remoteEnvironment.data.hermes.available) {
    result = await runSshCommand(connection, `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes backup -o ${shellEscape(outputPath)}`, { timeoutMs: BACKUP_TIMEOUT_MS });
  } else {
    result = await runSshCommand(connection, buildRemotePythonZipCommand(instance.hermesHome, outputPath), {
      timeoutMs: BACKUP_TIMEOUT_MS,
    });
  }

  if (!result.ok) {
    return result;
  }

  const listResult = await listRemoteBackups(instance);
  if (!listResult.ok || !listResult.data) {
    return listResult;
  }

  return {
    ok: true,
    data: {
      created: listResult.data.items.find((item) => item.location === outputPath) ?? null,
    },
  };
}

async function restoreLocalBackup(instance, backupPath) {
  const result = await runHermesCommand(["import", "--force", backupPath], {
    env: getHermesEnv(instance),
    timeoutMs: BACKUP_TIMEOUT_MS,
  });

  return result.ok ? { ok: true, data: { restoredAt: nowIso() } } : result;
}

async function restoreRemoteBackup(instance, backupPath) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const remoteEnvironment = await inspectRemoteEnvironment(connection);
  if (!remoteEnvironment.ok || !remoteEnvironment.data) {
    return remoteEnvironment;
  }

  const command = remoteEnvironment.data.hermes.available
    ? `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes import --force ${shellEscape(backupPath)}`
    : buildRemotePythonUnzipCommand(backupPath, instance.hermesHome);

  const result = await runSshCommand(connection, command, { timeoutMs: BACKUP_TIMEOUT_MS });
  return result.ok ? { ok: true, data: { restoredAt: nowIso() } } : result;
}

async function deleteLocalBackup(backupPath) {
  await fs.rm(backupPath, { force: true });
  return { ok: true, data: { deleted: true } };
}

async function deleteRemoteBackup(instance, backupPath) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const result = await runSshCommand(connection, `rm -f ${shellEscape(backupPath)}`, { timeoutMs: 20_000 });
  return result.ok ? { ok: true, data: { deleted: true } } : result;
}

async function importLocalBackup(instance, sourcePath) {
  if (!(await localFileExists(sourcePath))) {
    return toDesktopError("BACKUP_SOURCE_NOT_FOUND", "未找到要导入的备份文件。", `未找到 ${sourcePath}。`, true);
  }

  const backupsRoot = getBackupsRoot(instance);
  await ensureLocalDirectory(backupsRoot);
  const targetPath = await ensureUniqueLocalBackupPath(backupsRoot, ensureZipFileName(sourcePath, instance.id));
  await fs.copyFile(sourcePath, targetPath);
  const stats = await fs.stat(targetPath);

  return {
    ok: true,
    data: {
      imported: toBackupEntry(instance, path.basename(targetPath), stats, targetPath),
    },
  };
}

async function importRemoteBackup(instance, sourcePath) {
  if (!(await localFileExists(sourcePath))) {
    return toDesktopError("BACKUP_SOURCE_NOT_FOUND", "未找到要导入的备份文件。", `未找到 ${sourcePath}。`, true);
  }

  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const backupsRoot = path.posix.join(instance.workspaceDir, "backups");
  const targetPath = buildRemoteBackupPath(backupsRoot, ensureZipFileName(sourcePath, instance.id));
  const mkdirResult = await runSshCommand(connection, `mkdir -p ${shellEscape(backupsRoot)}`, { timeoutMs: 20_000 });
  if (!mkdirResult.ok) {
    return mkdirResult;
  }

  const uploadResult = await copyLocalFileToRemote(connection, sourcePath, targetPath, { timeoutMs: BACKUP_TIMEOUT_MS });
  if (!uploadResult.ok) {
    return uploadResult;
  }

  return {
    ok: true,
    data: {
      importedPath: targetPath,
    },
  };
}

async function clearLocalBackups(instance) {
  const listed = await listLocalBackups(instance);
  await Promise.all(listed.items.map((item) => fs.rm(item.location, { force: true })));
  return {
    ok: true,
    data: {
      clearedCount: listed.items.length,
    },
  };
}

async function clearRemoteBackups(instance) {
  const connection = getInstanceConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const listed = await listRemoteBackups(instance);
  if (!listed.ok || !listed.data) {
    return listed;
  }

  const backupsRoot = listed.data.backupsRoot;
  const result = await runSshCommand(connection, `if [ -d ${shellEscape(backupsRoot)} ]; then find ${shellEscape(backupsRoot)} -maxdepth 1 -type f -name '*.zip' -delete; fi`, {
    timeoutMs: 20_000,
  });
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      clearedCount: listed.data.items.length,
    },
  };
}

async function removeLocalContainer(containerName) {
  if (!containerName) return;
  await runDockerCommand(["rm", "-f", "-v", containerName], { timeoutMs: 20_000 }).catch(() => {});
}

async function removeRemoteContainer(connection, containerName) {
  if (!containerName) return;
  await runRemoteDockerCommand(connection, ["rm", "-f", "-v", containerName], { timeoutMs: 20_000 }).catch(() => {});
}

async function removeRemoteDockerWorkspaceContents(connection, instance) {
  const workspaceDir = instance?.workspaceDir;
  if (!workspaceDir) return { ok: true, data: { skipped: true } };

  const cleanupImage = instance.docker?.image || "nousresearch/hermes-agent:latest";
  return runRemoteDockerCommand(
    connection,
    [
      "run",
      "--rm",
      "-v",
      `${workspaceDir}:/target`,
      "--entrypoint",
      "sh",
      cleanupImage,
      "-lc",
      "rm -rf /target/* /target/.[!.]* /target/..?*",
    ],
    { timeoutMs: 60_000 }
  );
}

async function destroyInstanceWorkspace(instance) {
  if (instance.type === "remote") {
    const connection = getInstanceConnection(instance);
    if (!connection) {
      return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
    }

    if (!isSafeRemoteWorkspace(instance)) {
      return {
        ok: true,
        data: {
          mode: "remove",
          deletedWorkspace: false,
          message: "已移除实例注册，保留远程工作目录以避免误删系统路径。",
        },
      };
    }

    if (instance.runtime === "docker") {
      await removeRemoteContainer(connection, instance.docker?.containerName);
      const workspaceCleanup = await removeRemoteDockerWorkspaceContents(connection, instance);
      if (!workspaceCleanup.ok) {
        return workspaceCleanup;
      }
    } else {
      await runSshCommand(connection, `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes gateway stop`, { timeoutMs: 20_000 }).catch(() => {});
    }

    const removeResult = await runSshCommand(connection, `rm -rf ${shellEscape(instance.workspaceDir)}`, { timeoutMs: BACKUP_TIMEOUT_MS });
    if (!removeResult.ok) {
      return removeResult;
    }

    return {
      ok: true,
      data: {
        mode: "destroy",
        deletedWorkspace: true,
        message: instance.runtime === "docker"
          ? "已清除远程 Docker 容器、匿名卷、受管工作目录与 Console 注册，不影响远程 Docker Engine 或 Hermes CLI。"
          : "已销毁远程实例并清理工作目录。",
      },
    };
  }

  if (shouldPreserveExternalWorkspace(instance)) {
    return {
      ok: true,
      data: {
        mode: "remove",
        deletedWorkspace: false,
        message: "已从 Console 移除实例注册，保留原有 Hermes 环境目录。",
      },
    };
  }

  if (!isManagedLocalWorkspace(instance)) {
    return {
      ok: true,
      data: {
        mode: "remove",
        deletedWorkspace: false,
        message: "该实例目录不在 Console 受管目录下，已仅移除注册信息。",
      },
    };
  }

  if (instance.runtime === "docker") {
    await removeLocalContainer(instance.docker?.containerName);
  } else if (instance.native?.mode === "managed-process") {
    await stopManagedNativeProcess(instance.native?.pid).catch(() => {});
  } else {
    await runHermesCommand(["gateway", "stop"], {
      env: getHermesEnv(instance),
      timeoutMs: 20_000,
    }).catch(() => {});
  }

  await fs.rm(instance.workspaceDir, { recursive: true, force: true });
  return {
    ok: true,
    data: {
      mode: "destroy",
      deletedWorkspace: true,
      message: instance.runtime === "docker"
        ? "已清除 Docker 容器、匿名卷、受管工作目录与 Console 注册，不影响 Hermes CLI 或 Docker Desktop。"
        : "已清除本地 Native 实例、受管工作目录与 Console 注册；如需卸载 Hermes CLI，请到设置页执行官方卸载。",
    },
  };
}

async function getRegisteredRuntimeInstance(userDataPath, instanceId) {
  const registryResult = await getRegisteredInstance(userDataPath, instanceId);
  if (!registryResult.ok || !registryResult.data) return registryResult;
  if (!registryResult.data.instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }
  return { ok: true, data: registryResult.data.instance };
}

export async function getInstanceDiagnostics(userDataPath, instanceId) {
  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  const diagnostics = instanceResult.data.type === "remote"
    ? await getRemoteRuntimeDiagnostics(instanceResult.data)
    : await getLocalRuntimeDiagnostics(instanceResult.data);

  if (!diagnostics.ok && diagnostics.error) {
    return diagnostics;
  }

  return {
    ok: true,
    data: {
      instance: instanceResult.data,
      diagnostics,
    },
  };
}

export async function getInstanceLogs(userDataPath, instanceId, options = {}) {
  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  const kind = ["agent", "gateway", "errors"].includes(options.kind) ? options.kind : "agent";
  const diagnosticsResult = await getInstanceDiagnostics(userDataPath, instanceId);
  if (!diagnosticsResult.ok || !diagnosticsResult.data) return diagnosticsResult;

  let payload;
  if (instanceResult.data.type === "remote") {
    payload = await readRemoteLog(instanceResult.data, kind, options);
    if (!payload.ok && payload.error) return payload;
  } else {
    payload = await readLocalLogViaCli(instanceResult.data, kind, options) ?? await readLocalLogFallback(instanceResult.data, kind, options);
  }

  const entries = applyClientSideFilters(parseLogEntries(payload.rawText), options);

  return {
    ok: true,
    data: {
      instance: instanceResult.data,
      requestedLog: kind,
      rawText: payload.rawText,
      entries,
      source: payload.source,
      diagnostics: diagnosticsResult.data.diagnostics,
    },
  };
}

export async function listInstanceBackups(userDataPath, instanceId) {
  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  if (instanceResult.data.type === "remote") {
    const remoteResult = await listRemoteBackups(instanceResult.data);
    if (!remoteResult.ok || !remoteResult.data) return remoteResult;
    return {
      ok: true,
      data: {
        instance: instanceResult.data,
        backupsRoot: remoteResult.data.backupsRoot,
        items: remoteResult.data.items,
      },
    };
  }

  const localResult = await listLocalBackups(instanceResult.data);
  return {
    ok: true,
    data: {
      instance: instanceResult.data,
      backupsRoot: localResult.backupsRoot,
      items: localResult.items,
    },
  };
}

export async function createInstanceBackup(userDataPath, instanceId, options = {}) {
  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  const createResult = instanceResult.data.type === "remote"
    ? await createRemoteBackup(instanceResult.data, options)
    : await createLocalBackup(instanceResult.data, options);

  if (!createResult.ok || !createResult.data) return createResult;

  const listResult = await listInstanceBackups(userDataPath, instanceId);
  if (!listResult.ok || !listResult.data) return listResult;

  return {
    ok: true,
    data: {
      ...listResult.data,
      created: createResult.data.created,
    },
  };
}

export async function restoreInstanceBackup(userDataPath, instanceId, backupId) {
  const listResult = await listInstanceBackups(userDataPath, instanceId);
  if (!listResult.ok || !listResult.data) return listResult;

  const target = listResult.data.items.find((item) => item.id === backupId);
  if (!target) {
    return toDesktopError("BACKUP_NOT_FOUND", "未找到对应备份。", `backupId=${backupId}`, true);
  }

  const restoreResult = listResult.data.instance.type === "remote"
    ? await restoreRemoteBackup(listResult.data.instance, target.location)
    : await restoreLocalBackup(listResult.data.instance, target.location);

  if (!restoreResult.ok) return restoreResult;

  return {
    ok: true,
    data: {
      restoredAt: restoreResult.data?.restoredAt ?? nowIso(),
      backup: target,
    },
  };
}

export async function deleteInstanceBackup(userDataPath, instanceId, backupId) {
  const listResult = await listInstanceBackups(userDataPath, instanceId);
  if (!listResult.ok || !listResult.data) return listResult;

  const target = listResult.data.items.find((item) => item.id === backupId);
  if (!target) {
    return toDesktopError("BACKUP_NOT_FOUND", "未找到对应备份。", `backupId=${backupId}`, true);
  }

  const deleteResult = listResult.data.instance.type === "remote"
    ? await deleteRemoteBackup(listResult.data.instance, target.location)
    : await deleteLocalBackup(target.location);

  if (!deleteResult.ok) return deleteResult;

  const refreshed = await listInstanceBackups(userDataPath, instanceId);
  if (!refreshed.ok || !refreshed.data) return refreshed;

  return {
    ok: true,
    data: {
      ...refreshed.data,
      deletedBackupId: backupId,
    },
  };
}

export async function importInstanceBackup(userDataPath, instanceId, input = {}) {
  const sourcePath = String(input.sourcePath || "").trim();
  if (!sourcePath) {
    return toDesktopError("BACKUP_SOURCE_REQUIRED", "缺少要导入的备份路径。", "请先选择本地 zip 备份文件。", true);
  }

  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  const importResult = instanceResult.data.type === "remote"
    ? await importRemoteBackup(instanceResult.data, sourcePath)
    : await importLocalBackup(instanceResult.data, sourcePath);

  if (!importResult.ok || !importResult.data) return importResult;

  const listResult = await listInstanceBackups(userDataPath, instanceId);
  if (!listResult.ok || !listResult.data) return listResult;

  return {
    ok: true,
    data: {
      ...listResult.data,
      imported: "imported" in importResult.data
        ? importResult.data.imported
        : listResult.data.items.find((item) => item.location === importResult.data.importedPath) ?? null,
    },
  };
}

export async function clearInstanceBackups(userDataPath, instanceId) {
  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  const clearResult = instanceResult.data.type === "remote"
    ? await clearRemoteBackups(instanceResult.data)
    : await clearLocalBackups(instanceResult.data);
  if (!clearResult.ok || !clearResult.data) return clearResult;

  const listResult = await listInstanceBackups(userDataPath, instanceId);
  if (!listResult.ok || !listResult.data) return listResult;

  return {
    ok: true,
    data: {
      ...listResult.data,
      clearedCount: clearResult.data.clearedCount ?? 0,
    },
  };
}

export async function destroyInstance(userDataPath, instanceId) {
  const instanceResult = await getRegisteredRuntimeInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) return instanceResult;

  const destroyResult = await destroyInstanceWorkspace(instanceResult.data);
  if (!destroyResult.ok || !destroyResult.data) return destroyResult;

  const removeResult = await removeRegisteredInstance(userDataPath, instanceId);
  if (!removeResult.ok) return removeResult;

  await clearInstanceProviderTests(userDataPath, instanceId).catch(() => {});

  return {
    ok: true,
    data: {
      removedInstanceId: instanceId,
      deletedWorkspace: destroyResult.data.deletedWorkspace,
      mode: destroyResult.data.mode,
      message: destroyResult.data.message,
    },
  };
}
