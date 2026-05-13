import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { getDefaultInstancesRoot } from "./environment.mjs";
import { ensureDockerDaemonRunning, ensureDockerImageAvailable, runDockerCommand } from "./docker-runtime.mjs";
import { resolveHermesBinary } from "./hermes-cli.mjs";
import { installHermesCli } from "./hermes-installer.mjs";
import { listRegisteredInstances, upsertRegisteredInstance } from "./instance-registry.mjs";

const DEFAULT_DOCKER_IMAGE = "nousresearch/hermes-agent:latest";
const DEFAULT_NATIVE_ENDPOINT = "http://127.0.0.1:8642";
const DEFAULT_INSTANCE_PORT = 8642;
const CONTAINER_INTERNAL_PORT = 8642;
const BOOTSTRAP_DIRECTORIES = ["cron", "sessions", "logs", "hooks", "memories", "skills", "skins", "plans", "workspace", "home"];
const KNOWN_INSTANCE_IDS = {
  本地创作环境: "local-studio",
  远程网关节点: "remote-gateway",
};
const HERMES_SOURCE_CANDIDATES = [path.join(os.homedir(), ".hermes", "hermes-agent")];
const MINIMAL_SOUL = "# SOUL\n\n你是 Hermes Agent。\n";
const DEFAULT_API_SERVER_KEY_PREFIX = "hermes-console-local-";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitInstallEvent(input, onProgress, event) {
  if (typeof onProgress !== "function") return;
  onProgress({
    at: nowIso(),
    scope: "docker",
    ...event,
    operationId: input?.operationId,
  });
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

function slugifyInstanceId(name) {
  const known = KNOWN_INSTANCE_IDS[name];
  if (known) return known;

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "local-instance";
}

async function ensureUniqueInstanceId(baseId, instances, instancesRoot) {
  const existingIds = new Set(instances.map((instance) => instance.id));

  const isOccupied = async (nextId) => (
    existingIds.has(nextId) || (instancesRoot ? await fileExists(path.join(instancesRoot, nextId)) : false)
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

function getHermesSourceRoot() {
  return HERMES_SOURCE_CANDIDATES.find((candidate) => Boolean(candidate));
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(sourcePath, targetPath, fallbackContent = "") {
  if (await fileExists(targetPath)) {
    return;
  }

  if (sourcePath && (await fileExists(sourcePath))) {
    await ensureDirectory(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
    return;
  }

  await ensureDirectory(path.dirname(targetPath));
  await fs.writeFile(targetPath, fallbackContent, "utf8");
}

function normalizeEnvLine(line) {
  return String(line ?? "").replace(/\r?\n/g, "").trim();
}

async function upsertEnvEntries(targetPath, entries) {
  const existing = await fileExists(targetPath) ? await fs.readFile(targetPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const nextLines = [...lines];

  for (const [key, rawValue] of Object.entries(entries)) {
    const value = normalizeEnvLine(rawValue);
    const line = `${key}=${value}`;
    const index = nextLines.findIndex((candidate) => candidate.startsWith(`${key}=`));
    if (index >= 0) {
      nextLines[index] = line;
    } else {
      nextLines.push(line);
    }
  }

  const output = nextLines.filter(Boolean).join("\n");
  await fs.writeFile(targetPath, `${output}\n`, "utf8");
}

async function bootstrapHermesHome(hermesHome, configInput = {}) {
  await ensureDirectory(hermesHome);

  await Promise.all(
    BOOTSTRAP_DIRECTORIES.map((directoryName) => ensureDirectory(path.join(hermesHome, directoryName)))
  );

  const hermesSourceRoot = getHermesSourceRoot();

  await copyIfMissing(
    hermesSourceRoot ? path.join(hermesSourceRoot, ".env.example") : null,
    path.join(hermesHome, ".env"),
    ""
  );
  await upsertEnvEntries(path.join(hermesHome, ".env"), {
    API_SERVER_ENABLED: "true",
    API_SERVER_HOST: "0.0.0.0",
    API_SERVER_PORT: String(CONTAINER_INTERNAL_PORT),
    API_SERVER_KEY: `${DEFAULT_API_SERVER_KEY_PREFIX}${crypto.randomBytes(16).toString("hex")}`,
  });
  await copyIfMissing(
    null,
    path.join(hermesHome, "config.yaml"),
    buildHermesCliConfig(configInput)
  );
  await copyIfMissing(
    hermesSourceRoot ? path.join(hermesSourceRoot, "docker", "SOUL.md") : null,
    path.join(hermesHome, "SOUL.md"),
    MINIMAL_SOUL
  );
}

function getPlatformLabel() {
  if (process.platform === "darwin") return "macOS";
  if (process.platform === "win32") return "Windows";
  if (process.platform === "linux") return "Linux";
  return process.platform;
}

function buildContainerName(instanceId) {
  return `hermes-console-${instanceId}-${Date.now().toString(36)}`;
}

function resolveInstancesRoot(instancesRoot) {
  if (typeof instancesRoot === "string" && instancesRoot.trim()) {
    return instancesRoot.trim();
  }

  return getDefaultInstancesRoot();
}

async function findAvailablePort(startPort, occupiedPorts = []) {
  const blockedPorts = new Set(occupiedPorts.filter((value) => Number.isInteger(value) && value > 0));

  for (let candidate = startPort; candidate < startPort + 200; candidate += 1) {
    if (blockedPorts.has(candidate)) continue;

    const isFree = await new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on("error", () => resolve(false));
      server.listen(candidate, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });

    if (isFree) {
      return candidate;
    }
  }

  throw new Error("无法分配可用的本地端口。请释放 8642 附近端口后重试。");
}

async function writeRuntimeMetadata(runtimeDir, metadata) {
  await ensureDirectory(runtimeDir);
  await fs.writeFile(path.join(runtimeDir, "deployment.json"), JSON.stringify(metadata, null, 2), "utf8");
}

async function inspectContainerState(containerName) {
  const result = await runDockerCommand(["inspect", "--format", "{{json .State}}", containerName], {
    timeoutMs: 20_000,
  });

  if (!result.ok || !result.data?.stdout) {
    return null;
  }

  try {
    return JSON.parse(result.data.stdout);
  } catch {
    return null;
  }
}

async function readContainerLogs(containerName) {
  const result = await runDockerCommand(["logs", "--tail", "50", containerName], {
    timeoutMs: 20_000,
  });

  if (!result.data) {
    return "";
  }

  return [result.data.stdout, result.data.stderr].filter(Boolean).join("\n").trim();
}

function buildInstanceRecord({
  id,
  name,
  workspaceDir,
  hermesHome,
  endpoint,
  status,
  providerId,
  model,
  defaultProfile,
  containerName,
  publishedPort,
  lastError,
  createdAt,
}) {
  const timestamp = nowIso();

  return {
    id,
    name,
    type: "local",
    runtime: "docker",
    hermesHome,
    workspaceDir,
    endpoint,
    status,
    createdAt,
    lastCheckedAt: timestamp,
    platformLabel: getPlatformLabel(),
    security: "localhost",
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
  };
}

function buildNativeInstanceRecord({
  id,
  name,
  workspaceDir,
  hermesHome,
  status,
  providerId,
  model,
  defaultProfile,
  lastError,
  createdAt,
}) {
  const timestamp = nowIso();

  return {
    id,
    name,
    type: "local",
    runtime: "native",
    hermesHome,
    workspaceDir,
    endpoint: DEFAULT_NATIVE_ENDPOINT,
    status,
    createdAt,
    lastCheckedAt: timestamp,
    platformLabel: getPlatformLabel(),
    security: "localhost",
    providerId,
    model,
    defaultProfile,
    lastError,
    native: {
      mode: "managed-process",
      pid: null,
      command: ["gateway", "run", "--replace"],
    },
  };
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

async function startManagedNativeGateway({ hermesHome }) {
  const binaryPath = resolveHermesBinary();
  const args = ["gateway", "run", "--replace"];

  return new Promise((resolve) => {
    const child = spawn(binaryPath, args, {
      env: {
        ...process.env,
        HERMES_HOME: hermesHome,
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

async function startGatewayContainer({ instanceId, hermesHome, publishedPort, containerName }, runtimeOptions = {}) {
  const imageResult = await ensureDockerImageAvailable(DEFAULT_DOCKER_IMAGE, {
    onProgress: runtimeOptions.onProgress,
    operationId: runtimeOptions.operationId,
    scope: runtimeOptions.scope,
  });

  if (!imageResult.ok) {
    return imageResult;
  }

  const args = [
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
    `127.0.0.1:${publishedPort}:${CONTAINER_INTERNAL_PORT}`,
  ];

  if (typeof process.getuid === "function") {
    args.push("-e", `HERMES_UID=${process.getuid()}`);
  }

  if (typeof process.getgid === "function") {
    args.push("-e", `HERMES_GID=${process.getgid()}`);
  }

  args.push(DEFAULT_DOCKER_IMAGE, "gateway", "run");

  return runDockerCommand(args, { timeoutMs: 120_000 });
}

export async function createLocalDockerInstance({ userDataPath, input, onProgress }) {
  const name = normalizeDisplayName(input?.name);

  if (!name) {
    return toDesktopError("INSTANCE_NAME_REQUIRED", "实例名称不能为空。", "请先填写实例名称。", true);
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

  const duplicateInstance = registryResult.data.instances.find(
    (instance) => instance.type === "local" && instance.name === name
  );

  if (duplicateInstance) {
    return toDesktopError(
      "INSTANCE_NAME_EXISTS",
      "实例名称已存在。",
      `已存在同名本地实例“${name}”，请更换名称后重试。`,
      true
    );
  }

  const instancesRoot = resolveInstancesRoot(input?.instancesRoot);
  const instanceId = await ensureUniqueInstanceId(slugifyInstanceId(name), registryResult.data.instances, instancesRoot);
  const workspaceDir = path.join(instancesRoot, instanceId);
  const hermesHome = path.join(workspaceDir, "home");
  const runtimeDir = path.join(workspaceDir, "runtime");
  const occupiedPorts = registryResult.data.instances
    .map((instance) => instance.docker?.publishedPort)
    .filter((value) => Number.isInteger(value));
  const publishedPort = await findAvailablePort(DEFAULT_INSTANCE_PORT, occupiedPorts);
  const endpoint = `http://127.0.0.1:${publishedPort}`;
  const containerName = buildContainerName(instanceId);
  const createdAt = nowIso();

  await ensureDirectory(workspaceDir);
  await ensureDirectory(runtimeDir);
  await bootstrapHermesHome(hermesHome, {
    providerId: input?.providerId,
    model: input?.model,
  });

  const creatingRecord = buildInstanceRecord({
    id: instanceId,
    name,
    workspaceDir,
    hermesHome,
    endpoint,
    status: "creating",
    providerId: input?.providerId,
    model: input?.model,
    defaultProfile: input?.defaultProfile,
    containerName,
    publishedPort,
    createdAt,
  });

  await upsertRegisteredInstance(userDataPath, creatingRecord);

  const dockerRepairOptions = {
    autoStartDockerDesktop: input?.autoStartDockerDesktop !== false,
    autoInstallDockerDesktop: input?.autoInstallDockerDesktop !== false,
  };
  emitInstallEvent(input, onProgress, {
    stage: "docker-check",
    message: "开始校验本地 Docker 环境",
    detail: "将检查 Docker 命令、可用性与 daemon 状态。",
  });
  const dockerEnvironment = await ensureDockerDaemonRunning({ autoStart: dockerRepairOptions.autoStartDockerDesktop, autoInstall: dockerRepairOptions.autoInstallDockerDesktop, onProgress: (payload) => emitInstallEvent(input, onProgress, payload) });

  if (!dockerEnvironment.available || !dockerEnvironment.daemonRunning) {
    emitInstallEvent(input, onProgress, {
      stage: "failed",
      message: dockerEnvironment.available ? "Docker daemon 未运行" : "未检测到 Docker",
      detail: dockerEnvironment.detail,
    });
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: dockerEnvironment.detail,
      lastCheckedAt: nowIso(),
    };

    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRuntimeMetadata(runtimeDir, {
      phase: "bootstrap-complete",
      image: DEFAULT_DOCKER_IMAGE,
      endpoint,
      publishedPort,
      containerName,
      lastError: dockerEnvironment.detail,
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
        healthUrl: `${endpoint}/health`,
        createdAt,
      },
      error: {
        code: dockerEnvironment.available ? "DOCKER_DAEMON_UNAVAILABLE" : "DOCKER_UNAVAILABLE",
        message: dockerEnvironment.available
          ? "Docker daemon 未运行，无法启动本地 Docker 实例。"
          : "未找到 Docker，无法创建本地 Docker 实例。",
        detail: dockerEnvironment.detail,
        recoverable: true,
      },
    };
  }

  emitInstallEvent(input, onProgress, {
    stage: "docker-container",
    message: "正在启动 Hermes Docker 容器",
    detail: `实例目录：${workspaceDir}`,
  });
  const runResult = await startGatewayContainer({
    instanceId,
    hermesHome,
    publishedPort,
    containerName,
  }, {
    onProgress: (payload) => emitInstallEvent(input, onProgress, payload),
    operationId: input?.operationId,
    scope: "docker",
  });

  if (!runResult.ok) {
    emitInstallEvent(input, onProgress, {
      stage: "failed",
      message: "Hermes Docker 容器启动失败",
      detail: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
    });
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
      lastCheckedAt: nowIso(),
    };

    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRuntimeMetadata(runtimeDir, {
      phase: "docker-run-failed",
      image: DEFAULT_DOCKER_IMAGE,
      endpoint,
      publishedPort,
      containerName,
      lastError: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
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
        healthUrl: `${endpoint}/health`,
        createdAt,
      },
      error: {
        code: runResult.error?.code ?? "DOCKER_RUN_FAILED",
        message: "Docker 容器启动失败。",
        detail: runResult.error?.detail ?? runResult.data?.stderr ?? runResult.data?.stdout,
        recoverable: true,
      },
    };
  }

  await sleep(2_000);
  emitInstallEvent(input, onProgress, {
    stage: "docker-container",
    message: "等待容器进入 running 状态",
    detail: `容器 ${containerName} 准备中。`,
  });

  const containerState = await inspectContainerState(containerName);

  if (!containerState || containerState.Status !== "running") {
    const containerLogs = await readContainerLogs(containerName);
    emitInstallEvent(input, onProgress, {
      stage: "failed",
      message: "容器未进入运行状态",
      detail: containerLogs || containerState?.Error || "容器未进入 running 状态。",
    });
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: containerLogs || containerState?.Error || "容器未进入 running 状态。",
      lastCheckedAt: nowIso(),
    };

    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRuntimeMetadata(runtimeDir, {
      phase: "container-exited",
      image: DEFAULT_DOCKER_IMAGE,
      endpoint,
      publishedPort,
      containerName,
      containerState,
      lastError: containerLogs || containerState?.Error || "容器未进入 running 状态。",
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
        healthUrl: `${endpoint}/health`,
        createdAt,
      },
      error: {
        code: "DOCKER_CONTAINER_NOT_RUNNING",
        message: "Docker 容器没有保持运行。",
        detail: containerLogs || containerState?.Error || "容器未进入 running 状态。",
        recoverable: true,
      },
    };
  }

  emitInstallEvent(input, onProgress, {
    stage: "done",
    message: "本地 Docker 实例创建完成",
    detail: `实例 ${containerName} 已运行。`,
  });

  const runningRecord = {
    ...creatingRecord,
    status: "running",
    lastError: undefined,
    lastCheckedAt: nowIso(),
  };

  await upsertRegisteredInstance(userDataPath, runningRecord);
  await writeRuntimeMetadata(runtimeDir, {
    phase: "running",
    image: DEFAULT_DOCKER_IMAGE,
    endpoint,
    publishedPort,
    containerName,
    containerState,
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
      healthUrl: `${endpoint}/health`,
      createdAt,
    },
  };
}

export async function createLocalNativeInstance({ userDataPath, input, onProgress }) {
  const name = normalizeDisplayName(input?.name);

  if (!name) {
    return toDesktopError("INSTANCE_NAME_REQUIRED", "实例名称不能为空。", "请先填写实例名称。", true);
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

  const duplicateInstance = registryResult.data.instances.find(
    (instance) => instance.type === "local" && instance.name === name
  );

  if (duplicateInstance) {
    return toDesktopError(
      "INSTANCE_NAME_EXISTS",
      "实例名称已存在。",
      `已存在同名本地实例“${name}”，请更换名称后重试。`,
      true
    );
  }

  const instancesRoot = resolveInstancesRoot(input?.instancesRoot);
  const instanceId = await ensureUniqueInstanceId(slugifyInstanceId(name), registryResult.data.instances, instancesRoot);
  const workspaceDir = path.join(instancesRoot, instanceId);
  const hermesHome = path.join(workspaceDir, "home");
  const runtimeDir = path.join(workspaceDir, "runtime");
  const createdAt = nowIso();
  let installerResult = null;

  if (input?.installHermesIfMissing) {
    const installResult = await installHermesCli({
      operationId: input?.operationId,
      onProgress: input?.operationId ? onProgress : undefined,
    });
    installerResult = installResult.data ?? null;

    if (!installResult.ok) {
      return {
        ok: false,
        data: {
          instance: buildNativeInstanceRecord({
            id: instanceId,
            name,
            workspaceDir,
            hermesHome,
            status: "failed",
            providerId: input?.providerId,
            model: input?.model,
            defaultProfile: input?.defaultProfile,
            createdAt,
          }),
          registryFilePath: registryResult.data.filePath,
          workspaceDir,
          hermesHome,
          runtimeDir,
          endpoint: DEFAULT_NATIVE_ENDPOINT,
          service: "native-gateway",
          installer: installerResult,
          createdAt,
        },
        error: installResult.error ?? {
          code: "HERMES_INSTALLER_RUN_FAILED",
          message: "Hermes CLI 安装失败。",
          detail: "官方安装器未返回成功状态。",
          recoverable: true,
        },
      };
    }
  }

  await ensureDirectory(workspaceDir);
  await ensureDirectory(runtimeDir);
  await bootstrapHermesHome(hermesHome, {
    providerId: input?.providerId,
    model: input?.model,
  });

  const creatingRecord = buildNativeInstanceRecord({
    id: instanceId,
    name,
    workspaceDir,
    hermesHome,
    status: "creating",
    providerId: input?.providerId,
    model: input?.model,
    defaultProfile: input?.defaultProfile,
    createdAt,
  });

  await upsertRegisteredInstance(userDataPath, creatingRecord);

  const startResult = await startManagedNativeGateway({ hermesHome });

  if (!startResult.ok) {
    const detail = startResult.detail ?? "Native gateway 启动失败。";
    const failedRecord = {
      ...creatingRecord,
      status: "failed",
      lastError: detail,
      lastCheckedAt: nowIso(),
    };

    await upsertRegisteredInstance(userDataPath, failedRecord);
    await writeRuntimeMetadata(runtimeDir, {
      phase: "native-start-failed",
      endpoint: DEFAULT_NATIVE_ENDPOINT,
      lastError: detail,
      binaryPath: startResult.binaryPath,
      command: startResult.args,
    });

    return {
      ok: false,
      data: {
        instance: failedRecord,
        registryFilePath: registryResult.data.filePath,
        workspaceDir,
        hermesHome,
        runtimeDir,
        endpoint: DEFAULT_NATIVE_ENDPOINT,
        service: "native-gateway",
        installer: installerResult,
        createdAt,
      },
      error: {
        code: "NATIVE_GATEWAY_START_FAILED",
        message: "Native gateway 启动失败。",
        detail,
        recoverable: true,
      },
    };
  }

  const nextRecord = {
    ...creatingRecord,
    status: "running",
    native: {
      mode: "managed-process",
      pid: startResult.pid,
      command: startResult.args,
      binaryPath: startResult.binaryPath,
    },
    lastError: undefined,
    lastCheckedAt: nowIso(),
  };

  await upsertRegisteredInstance(userDataPath, nextRecord);
  await writeRuntimeMetadata(runtimeDir, {
    phase: "native-running",
    endpoint: DEFAULT_NATIVE_ENDPOINT,
    pid: startResult.pid,
    binaryPath: startResult.binaryPath,
    command: startResult.args,
    gatewayStatus: "running",
  });

  return {
    ok: true,
    data: {
      instance: nextRecord,
      registryFilePath: registryResult.data.filePath,
      workspaceDir,
      hermesHome,
      runtimeDir,
      endpoint: DEFAULT_NATIVE_ENDPOINT,
      service: "native-gateway",
      installer: installerResult,
      createdAt,
    },
  };
}
