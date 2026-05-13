import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectDockerEnvironment, runDockerCommand } from "./docker-runtime.mjs";
import { runHermesCommand } from "./hermes-cli.mjs";
import { listRegisteredInstances, upsertRegisteredInstance } from "./instance-registry.mjs";

const DEFAULT_NATIVE_ENDPOINT = "http://127.0.0.1:8642";
const DEFAULT_DOCKER_IMAGE = "nousresearch/hermes-agent:latest";
const CONTAINER_INTERNAL_PORT = 8642;

function nowIso() {
  return new Date().toISOString();
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

function expandUserPath(inputPath) {
  if (typeof inputPath !== "string") return "";
  const trimmed = inputPath.trim();
  if (!trimmed) return "";
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stripInlineComment(value) {
  let result = "";
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
      result += char;
      continue;
    }

    if (char === "#" && !quote) {
      break;
    }

    result += char;
  }

  return result.trimEnd();
}

function stripSurroundingQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(rawValue) {
  const value = stripSurroundingQuotes(stripInlineComment(rawValue.trim()));

  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "[]") return [];
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, target: root }];

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("- ")) continue;

    const match = rawLine.match(/^(\s*)([^:#][^:]*):(.*)$/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2].trim();
    const rawValue = match[3] ?? "";

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].target;
    const valueText = stripInlineComment(rawValue);

    if (valueText.trim() === "") {
      parent[key] = {};
      stack.push({ indent, target: parent[key] });
      continue;
    }

    parent[key] = parseScalar(valueText);
  }

  return root;
}

function getNested(object, keys, fallback = undefined) {
  let current = object;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return fallback;
    }
    current = current[key];
  }
  return current ?? fallback;
}

function normalizeDisplayName(name, hermesHome) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed) return trimmed;
  if (path.basename(hermesHome) === ".hermes") return "默认 Hermes 环境";
  return `${path.basename(hermesHome)} 实例`;
}

function slugifyInstanceId(name, hermesHome) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  if (slug) return slug;

  const baseName = path.basename(hermesHome).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  if (baseName) return `imported-${baseName}`;

  return `imported-${Date.now().toString(36)}`;
}

function ensureUniqueInstanceId(baseId, instances) {
  const existingIds = new Set(instances.map((item) => item.id));
  if (!existingIds.has(baseId)) return baseId;

  let counter = 2;
  let nextId = `${baseId}-${counter}`;
  while (existingIds.has(nextId)) {
    counter += 1;
    nextId = `${baseId}-${counter}`;
  }
  return nextId;
}

function detectWorkspaceDir(hermesHome) {
  const parent = path.dirname(hermesHome);
  const baseName = path.basename(hermesHome);
  if (baseName === "home") return parent;
  return hermesHome;
}

async function resolveStatusFromNativeGateway(hermesHome) {
  const gatewayStatus = await runHermesCommand(["gateway", "status"], {
    env: { HERMES_HOME: hermesHome },
    timeoutMs: 30_000,
  });

  if (gatewayStatus.ok) {
    const stdout = gatewayStatus.data?.stdout ?? "";
    const running = /Gateway service is loaded|\bPID\b|Service started/i.test(stdout);
    return {
      status: running ? "running" : "stopped",
      endpoint: DEFAULT_NATIVE_ENDPOINT,
      lastError: undefined,
      detail: stdout,
    };
  }

  const detail = gatewayStatus.error?.detail ?? gatewayStatus.error?.message ?? "";
  if (/not loaded|not running|no such process|service could not be found|not found/i.test(detail)) {
    return {
      status: "stopped",
      endpoint: DEFAULT_NATIVE_ENDPOINT,
      lastError: undefined,
      detail,
    };
  }

  return {
    status: "warning",
    endpoint: DEFAULT_NATIVE_ENDPOINT,
    lastError: detail || "无法读取 Native gateway 状态。",
    detail,
  };
}

async function inspectLocalDockerContainer(containerName) {
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

async function detectRuntimeDescriptor(hermesHome, workspaceDir) {
  const runtimeDir = path.join(workspaceDir, "runtime");
  const deploymentPath = path.join(runtimeDir, "deployment.json");
  const deployment = await readJsonFile(deploymentPath);

  if (deployment?.containerName && deployment?.publishedPort) {
    const dockerEnvironment = await inspectDockerEnvironment();
    const endpoint = deployment.endpoint || `http://127.0.0.1:${deployment.publishedPort}`;

    if (!dockerEnvironment.available || !dockerEnvironment.daemonRunning) {
      return {
        runtime: "docker",
        endpoint,
        status: "stopped",
        lastError: dockerEnvironment.available ? undefined : dockerEnvironment.detail,
        docker: {
          image: deployment.image || DEFAULT_DOCKER_IMAGE,
          containerName: deployment.containerName,
          publishedPort: Number(deployment.publishedPort) || 8642,
          containerPort: Number(deployment.containerPort) || CONTAINER_INTERNAL_PORT,
          command: Array.isArray(deployment.command) && deployment.command.length > 0 ? deployment.command.map((item) => String(item)) : ["gateway", "run"],
        },
      };
    }

    const containerState = await inspectLocalDockerContainer(deployment.containerName);
    return {
      runtime: "docker",
      endpoint,
      status: containerState?.Status === "running" ? "running" : "stopped",
      lastError: containerState?.Error || undefined,
      docker: {
        image: deployment.image || DEFAULT_DOCKER_IMAGE,
        containerName: deployment.containerName,
        publishedPort: Number(deployment.publishedPort) || 8642,
        containerPort: Number(deployment.containerPort) || CONTAINER_INTERNAL_PORT,
        command: Array.isArray(deployment.command) && deployment.command.length > 0 ? deployment.command.map((item) => String(item)) : ["gateway", "run"],
      },
    };
  }

  const nativeStatus = await resolveStatusFromNativeGateway(hermesHome);
  return {
    runtime: "native",
    endpoint: nativeStatus.endpoint,
    status: nativeStatus.status,
    lastError: nativeStatus.lastError,
  };
}

async function resolveRealHermesHome(inputPath) {
  const expanded = expandUserPath(inputPath);
  if (!expanded) {
    return { ok: false, error: "请输入 Hermes 目录路径。" };
  }

  const resolved = path.resolve(expanded);
  if (!(await fileExists(resolved))) {
    return { ok: false, error: `未找到 ${resolved}。` };
  }

  try {
    const realPath = await fs.realpath(resolved);
    return { ok: true, value: realPath };
  } catch {
    return { ok: true, value: resolved };
  }
}

async function findDuplicateInstance(instances, hermesHome) {
  for (const instance of instances) {
    try {
      const existingRealPath = await fs.realpath(instance.hermesHome);
      if (existingRealPath === hermesHome) {
        return instance;
      }
    } catch {
      if (path.resolve(instance.hermesHome) === hermesHome) {
        return instance;
      }
    }
  }
  return null;
}

export async function importExistingLocalInstance({ userDataPath, input }) {
  const hermesHomeResult = await resolveRealHermesHome(input?.hermesHome);
  if (!hermesHomeResult.ok) {
    return toDesktopError("HERMES_HOME_REQUIRED", "Hermes 目录无效。", hermesHomeResult.error, true);
  }

  const hermesHome = hermesHomeResult.value;
  const configPath = path.join(hermesHome, "config.yaml");

  if (!(await fileExists(configPath))) {
    return toDesktopError(
      "HERMES_CONFIG_MISSING",
      "目标目录不是有效的 Hermes 环境。",
      `未在 ${hermesHome} 下发现 config.yaml。`,
      true
    );
  }

  const registryResult = await listRegisteredInstances(userDataPath);
  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  const duplicate = await findDuplicateInstance(registryResult.data.instances, hermesHome);
  if (duplicate) {
    return {
      ok: true,
      data: {
        imported: false,
        message: "该 Hermes 环境已存在于 Console 中，已定位到现有实例。",
        registryFilePath: registryResult.data.filePath,
        instance: duplicate,
        workspaceDir: duplicate.workspaceDir,
        hermesHome: duplicate.hermesHome,
      },
    };
  }

  const displayName = normalizeDisplayName(input?.name, hermesHome);
  const workspaceDir = detectWorkspaceDir(hermesHome);
  const rawConfig = await fs.readFile(configPath, "utf8");
  const config = parseSimpleYaml(rawConfig);
  const providerId = String(getNested(config, ["model", "provider"], "") || "").trim() || undefined;
  const model = String(getNested(config, ["model", "default"], getNested(config, ["model", "model"], "")) || "").trim() || undefined;
  const runtimeDescriptor = await detectRuntimeDescriptor(hermesHome, workspaceDir);
  const instanceId = ensureUniqueInstanceId(slugifyInstanceId(displayName, hermesHome), registryResult.data.instances);
  const timestamp = nowIso();

  const instanceRecord = {
    id: instanceId,
    name: displayName,
    type: "local",
    runtime: runtimeDescriptor.runtime,
    hermesHome,
    workspaceDir,
    endpoint: runtimeDescriptor.endpoint,
    status: runtimeDescriptor.status,
    createdAt: timestamp,
    lastCheckedAt: timestamp,
    platformLabel: process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : process.platform,
    security: "localhost",
    providerId,
    model,
    defaultProfile: "default",
    lastError: runtimeDescriptor.lastError,
    docker: runtimeDescriptor.docker,
  };

  const upsertResult = await upsertRegisteredInstance(userDataPath, instanceRecord);
  if (!upsertResult.ok || !upsertResult.data) {
    return upsertResult;
  }

  return {
    ok: true,
    data: {
      imported: true,
      message:
        runtimeDescriptor.runtime === "docker"
          ? "已导入现有 Hermes 环境，并恢复为可管理的 Docker 实例。"
          : "已导入现有 Hermes 环境，并登记为本地 Native 实例。",
      registryFilePath: upsertResult.data.filePath,
      instance: instanceRecord,
      workspaceDir,
      hermesHome,
    },
  };
}
