import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getRegisteredInstance } from "./instance-registry.mjs";
import { resolveHermesBinary } from "./hermes-cli.mjs";
import { runSshCommand } from "./ssh-runtime.mjs";
import {
  isRemoteDockerInstance,
  readRemoteDockerJsonFile,
  readRemoteDockerTextFile,
  runRemoteDockerHermesCommand,
} from "./remote-docker-files.mjs";

const STORE_FILENAME = "provider-tests.json";
const STORE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 45_000;
const XIAOMI_TOKEN_PLAN_CN_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";

const PROVIDER_TEST_META = {
  "openai-codex": {
    doctorLabel: "OpenAI Codex auth",
    authProviders: ["openai-codex"],
  },
  anthropic: {
    doctorLabel: "Anthropic API",
    authProviders: ["anthropic"],
    envKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_TOKEN"],
  },
  nous: {
    doctorLabel: "Nous Portal auth",
    authProviders: ["nous", "portal"],
  },
  openrouter: {
    http: {
      envKeys: ["OPENROUTER_API_KEY"],
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      validationPath: "/key",
    },
  },
  zai: {
    doctorLabel: "Z.AI / GLM",
    envKeys: ["GLM_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY"],
  },
  "kimi-coding": {
    doctorLabel: "Kimi / Moonshot",
    envKeys: ["KIMI_API_KEY"],
  },
  "kimi-coding-cn": {
    doctorLabel: "Kimi / Moonshot (China)",
    envKeys: ["KIMI_CN_API_KEY"],
  },
  arcee: {
    doctorLabel: "Arcee AI",
    envKeys: ["ARCEEAI_API_KEY"],
  },
  deepseek: {
    doctorLabel: "DeepSeek",
    envKeys: ["DEEPSEEK_API_KEY"],
  },
  huggingface: {
    doctorLabel: "Hugging Face",
    envKeys: ["HF_TOKEN"],
  },
  alibaba: {
    doctorLabel: "Alibaba/DashScope",
    envKeys: ["DASHSCOPE_API_KEY"],
  },
  minimax: {
    doctorLabel: "MiniMax",
    envKeys: ["MINIMAX_API_KEY"],
  },
  "minimax-cn": {
    doctorLabel: "MiniMax (China)",
    envKeys: ["MINIMAX_CN_API_KEY"],
  },
  "ai-gateway": {
    doctorLabel: "Vercel AI Gateway",
    envKeys: ["AI_GATEWAY_API_KEY"],
  },
  xiaomi: {
    http: {
      envKeys: ["XIAOMI_API_KEY"],
      baseEnvKey: "XIAOMI_BASE_URL",
      defaultBaseUrl: XIAOMI_TOKEN_PLAN_CN_BASE_URL,
    },
  },
  custom: {
    http: {
      configBaseUrlPath: ["model", "base_url"],
      configApiKeyPath: ["model", "api_key"],
    },
  },
};

function createEmptyStore() {
  return {
    version: STORE_VERSION,
    entries: {},
  };
}

function ensureValidStore(data) {
  if (!data || typeof data !== "object" || typeof data.entries !== "object" || Array.isArray(data.entries)) {
    return createEmptyStore();
  }

  return {
    version: STORE_VERSION,
    entries: data.entries,
  };
}

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

function storeKey(instanceId, profileId, providerId) {
  return `${instanceId}::${profileId}::${providerId}`;
}

function getStorePath(userDataPath) {
  return path.join(userDataPath, STORE_FILENAME);
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readStore(userDataPath) {
  const filePath = getStorePath(userDataPath);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return {
      ok: true,
      data: {
        filePath,
        store: ensureValidStore(JSON.parse(raw)),
      },
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: true,
        data: {
          filePath,
          store: createEmptyStore(),
        },
      };
    }

    return toDesktopError("PROVIDER_TEST_STORE_READ_FAILED", "无法读取 provider 测试记录。", error instanceof Error ? error.message : String(error), true);
  }
}

async function writeStore(filePath, store) {
  await ensureParentDirectory(filePath);
  const normalized = ensureValidStore(store);
  const tempFilePath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tempFilePath, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tempFilePath, filePath);
  return normalized;
}

function stripSurroundingQuotes(value) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(value) {
  let quoted = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
      quoted = quoted === char ? null : quoted ?? char;
      continue;
    }

    if (char === "#" && !quoted) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
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

  for (const rawLine of String(text || "").split(/\r?\n/)) {
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

function parseEnvText(text) {
  const env = {};

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    const value = stripSurroundingQuotes(rawLine.slice(separatorIndex + 1).trim());
    env[key] = value;
  }

  return env;
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

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasAuthProvider(authJson, providers = []) {
  if (!authJson || typeof authJson !== "object") return false;
  const authProviders = authJson.providers;
  if (!authProviders || typeof authProviders !== "object") return false;
  return providers.some((providerId) => Boolean(authProviders[providerId]));
}

function hasConfiguredEnv(env, keys = []) {
  return keys.some((key) => normalizeText(env[key]));
}

function stripAnsi(text) {
  return String(text || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\r/g, "\n");
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

function buildRemoteConnection(instance) {
  if (!instance?.remote?.host || !instance?.remote?.user || (instance.remote.authMode === "password" ? !instance.remote?.password : !instance?.remote?.keyPath)) {
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

async function readTextFile(targetPath) {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return "";
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

async function readRemoteTextFile(instance, targetPath) {
  if (isRemoteDockerInstance(instance)) {
    return readRemoteDockerTextFile(instance, targetPath);
  }

  const connection = buildRemoteConnection(instance);
  if (!connection) return "";
  const result = await runSshCommand(connection, `if [ -f ${shellEscape(targetPath)} ]; then cat ${shellEscape(targetPath)}; fi`, {
    timeoutMs: 15_000,
  });
  return result.ok ? result.data?.stdout ?? "" : "";
}

async function readRemoteJsonFile(instance, targetPath) {
  if (isRemoteDockerInstance(instance)) {
    return readRemoteDockerJsonFile(instance, targetPath);
  }

  try {
    const raw = await readRemoteTextFile(instance, targetPath);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadProfileContext(instance, profileId = "default") {
  const effectiveProfileId = normalizeText(profileId) || "default";
  const profileHome = effectiveProfileId === "default"
    ? instance.hermesHome
    : path.join(instance.hermesHome, "profiles", effectiveProfileId);
  const configPath = path.join(profileHome, "config.yaml");
  const envPath = path.join(profileHome, ".env");
  const authPath = path.join(instance.hermesHome, "auth.json");

  const configText = instance.type === "remote"
    ? await readRemoteTextFile(instance, configPath)
    : await readTextFile(configPath);
  const envText = instance.type === "remote"
    ? await readRemoteTextFile(instance, envPath)
    : await readTextFile(envPath);
  const authJson = instance.type === "remote"
    ? await readRemoteJsonFile(instance, authPath)
    : await readJsonFile(authPath);

  return {
    profileId: effectiveProfileId,
    profileHome,
    configPath,
    envPath,
    authPath,
    config: parseSimpleYaml(configText),
    env: parseEnvText(envText),
    authJson,
  };
}

function runLocalProcess(command, args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}Command timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error.message}`,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: exitCode === 0,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

async function runProfileDoctor(instance, profileId) {
  const scopedArgs = profileId && profileId !== "default" ? ["-p", profileId, "doctor"] : ["doctor"];

  if (isRemoteDockerInstance(instance)) {
    return runRemoteDockerHermesCommand(instance, scopedArgs, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      cwd: instance.hermesHome,
    });
  }

  if (instance.type === "remote") {
    const connection = buildRemoteConnection(instance);
    if (!connection) {
      return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
    }

    const remoteCommand = [
      `cd ${shellEscape(instance.workspaceDir)} 2>/dev/null || cd ${shellEscape(instance.hermesHome)}`,
      `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes ${scopedArgs.map((arg) => shellEscape(arg)).join(" ")}`,
    ].join(" && ");

    return runSshCommand(connection, remoteCommand, { timeoutMs: DEFAULT_TIMEOUT_MS });
  }

  const binaryPath = resolveHermesBinary();
  const result = await runLocalProcess(binaryPath, scopedArgs, {
    cwd: instance.workspaceDir || instance.hermesHome,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    env: {
      ...process.env,
      HERMES_HOME: instance.hermesHome,
    },
  });

  return {
    ok: result.ok,
    data: {
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    },
    error: result.ok
      ? undefined
      : {
          code: "LOCAL_PROVIDER_DOCTOR_FAILED",
          message: "运行 provider doctor 检查失败。",
          detail: result.stderr.trim() || result.stdout.trim() || `exitCode=${result.exitCode}`,
          recoverable: true,
        },
  };
}

function parseDoctorLine(output, label) {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matchedLine = lines.find((line) => line.toLowerCase().includes(label.toLowerCase()));

  if (!matchedLine) {
    return null;
  }

  const success = matchedLine.includes("✓");
  const message = matchedLine.replace(/\s+/g, " ").trim();
  return {
    success,
    line: message,
  };
}

function buildStoredResult({ instanceId, profileId, providerId, status, summary, detail, source }) {
  return {
    instanceId,
    profileId,
    providerId,
    checkedAt: nowIso(),
    status,
    summary,
    detail,
    source,
  };
}

function toHttpProbeUrl(baseUrl, validationPath = "/models") {
  const normalizedBase = normalizeText(baseUrl).replace(/\/+$/, "");
  const normalizedPath = normalizeText(validationPath) || "/models";
  const suffix = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return normalizedBase ? `${normalizedBase}${suffix}` : "";
}

function getProviderDisplayName(providerId) {
  if (providerId === "openrouter") return "OpenRouter";
  if (providerId === "xiaomi") return "Xiaomi MiMo";
  if (providerId === "custom") return "自定义供应商";
  return providerId || "当前供应商";
}

function humanizeProviderHttpFailure({ providerId, apiKey, baseUrl, statusCode, body }) {
  const text = String(body || "");
  const providerName = getProviderDisplayName(providerId);
  const keyPrefix = normalizeText(apiKey).slice(0, 9);
  const normalizedBaseUrl = normalizeText(baseUrl);
  const isInvalidKey = Number(statusCode) === 401
    || /Invalid API Key|invalid_key|provide valid API Key|unauthorized|forbidden/i.test(text);

  if (isInvalidKey) {
    if (providerId === "xiaomi" && keyPrefix === "sk-or-v1-") {
      return "API Key 无效：当前选择的是 Xiaomi MiMo，但填写的是 OpenRouter 的 sk-or-v1- Key。请切换到 OpenRouter 供应商，或换成 Xiaomi MiMo 的有效 Key。";
    }

    if (providerId === "xiaomi" && normalizeText(apiKey).startsWith("tp-") && normalizedBaseUrl !== XIAOMI_TOKEN_PLAN_CN_BASE_URL) {
      return `API Key 无效：检测到这是 MiMo 套餐 Key，但当前 Base URL 不是套餐专属地址。请使用 ${XIAOMI_TOKEN_PLAN_CN_BASE_URL} 后再测试。`;
    }

    return `API Key 无效：${providerName} 返回 401，请重新粘贴该供应商的有效 Key 后再保存并测试。`;
  }

  const compactBody = text.trim().slice(0, 600);
  return `HTTP ${statusCode}${compactBody ? `\n${compactBody}` : ""}`;
}

async function testLocalHttpEndpoint(baseUrl, apiKey, options = {}) {
  const url = toHttpProbeUrl(baseUrl, options.validationPath);
  if (!url) {
    return toDesktopError("PROVIDER_BASE_URL_REQUIRED", "当前 provider 缺少 base_url。", "请先填写可访问的 OpenAI-compatible base_url。", true);
  }

  const headers = {
    Accept: "application/json",
  };
  if (normalizeText(apiKey)) {
    headers.Authorization = `Bearer ${normalizeText(apiKey)}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.text().catch(() => "");
    return {
      ok: response.ok,
      data: {
        statusCode: response.status,
        body,
      },
      error: response.ok
        ? undefined
        : {
            code: "PROVIDER_HTTP_FAILED",
            message: "provider endpoint 返回错误。",
            detail: humanizeProviderHttpFailure({
              providerId: options.providerId,
              apiKey,
              baseUrl,
              statusCode: response.status,
              body,
            }),
            recoverable: true,
          },
    };
  } catch (error) {
    return toDesktopError("PROVIDER_HTTP_FAILED", "provider endpoint 访问失败。", error instanceof Error ? error.message : String(error), true);
  }
}

async function testRemoteHttpEndpoint(instance, baseUrl, apiKey, options = {}) {
  const url = toHttpProbeUrl(baseUrl, options.validationPath);
  if (!url) {
    return toDesktopError("PROVIDER_BASE_URL_REQUIRED", "当前 provider 缺少 base_url。", "请先填写可访问的 OpenAI-compatible base_url。", true);
  }

  const connection = buildRemoteConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const remoteCommand = `
URL=${shellEscape(url)} API_KEY=${shellEscape(normalizeText(apiKey))} python3 - <<'PY'
import os, sys, urllib.request, urllib.error
url = os.environ["URL"]
api_key = os.environ.get("API_KEY", "")
headers = {"Accept": "application/json"}
if api_key:
    headers["Authorization"] = f"Bearer {api_key}"
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read(400).decode("utf-8", "replace")
        print(f"HTTP {resp.status}")
        if body:
            print(body)
except urllib.error.HTTPError as exc:
    body = exc.read(400).decode("utf-8", "replace")
    print(f"HTTP {exc.code}")
    if body:
        print(body)
    sys.exit(1)
except Exception as exc:
    print(str(exc))
    sys.exit(1)
PY
`.trim();

  const result = await runSshCommand(connection, remoteCommand, { timeoutMs: 20_000 });
  if (!result.ok || !result.data) {
    return toDesktopError(
      result.error?.code ?? "PROVIDER_HTTP_FAILED",
      result.error?.message ?? "远程 provider endpoint 访问失败。",
      result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
      result.error?.recoverable ?? true
    );
  }

  const output = String(result.data.stdout || "").trim();
  const statusMatch = output.match(/HTTP\s+(\d+)/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;

  return {
    ok: statusCode >= 200 && statusCode < 300,
    data: {
      statusCode,
      body: output,
    },
    error: statusCode >= 200 && statusCode < 300
      ? undefined
      : {
          code: "PROVIDER_HTTP_FAILED",
          message: "远程 provider endpoint 返回错误。",
          detail: humanizeProviderHttpFailure({
            providerId: options.providerId,
            apiKey,
            baseUrl,
            statusCode,
            body: output,
          }),
          recoverable: true,
        },
  };
}

async function persistProviderTest(userDataPath, entry) {
  const storeResult = await readStore(userDataPath);
  if (!storeResult.ok || !storeResult.data) {
    return storeResult;
  }

  const nextStore = ensureValidStore(storeResult.data.store);
  nextStore.entries[storeKey(entry.instanceId, entry.profileId, entry.providerId)] = entry;
  await writeStore(storeResult.data.filePath, nextStore);

  return {
    ok: true,
    data: entry,
  };
}

export async function listInstanceProviderTests(userDataPath, instanceId, options = {}) {
  const profileId = normalizeText(options.profileId) || "default";
  const storeResult = await readStore(userDataPath);
  if (!storeResult.ok || !storeResult.data) {
    return storeResult;
  }

  const entries = Object.values(storeResult.data.store.entries)
    .filter((entry) => entry.instanceId === instanceId && entry.profileId === profileId)
    .sort((left, right) => String(right.checkedAt).localeCompare(String(left.checkedAt)));

  return {
    ok: true,
    data: {
      instanceId,
      profileId,
      entries,
    },
  };
}

export async function clearInstanceProviderTests(userDataPath, instanceId) {
  const storeResult = await readStore(userDataPath);
  if (!storeResult.ok || !storeResult.data) {
    return storeResult;
  }

  const nextStore = ensureValidStore(storeResult.data.store);
  for (const key of Object.keys(nextStore.entries)) {
    if (key.startsWith(`${instanceId}::`)) {
      delete nextStore.entries[key];
    }
  }

  await writeStore(storeResult.data.filePath, nextStore);
  return {
    ok: true,
    data: {
      instanceId,
      cleared: true,
    },
  };
}

export async function testInstanceProvider(userDataPath, instanceId, input = {}) {
  const providerId = normalizeText(input.providerId);
  const profileId = normalizeText(input.profileId) || "default";
  if (!providerId) {
    return toDesktopError("PROVIDER_REQUIRED", "缺少要测试的 provider。", "请先选择要测试的 provider。", true);
  }

  const registryResult = await getRegisteredInstance(userDataPath, instanceId);
  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  const instance = registryResult.data.instance;
  if (!instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }

  const profileContext = await loadProfileContext(instance, profileId);
  const meta = PROVIDER_TEST_META[providerId] ?? null;

  if (!meta) {
    const result = buildStoredResult({
      instanceId,
      profileId: profileContext.profileId,
      providerId,
      status: "configured",
      summary: "当前 provider 尚未接入专用测试器。",
      detail: `${providerId} 目前只保留配置写入能力，未提供专用连接测试。`,
      source: "config",
    });
    return persistProviderTest(userDataPath, result);
  }

  if (meta.http) {
    const baseUrl = meta.http.configBaseUrlPath
      ? getNested(profileContext.config, meta.http.configBaseUrlPath, "")
      : normalizeText(profileContext.env[meta.http.baseEnvKey]) || meta.http.defaultBaseUrl || "";
    const apiKey = meta.http.configApiKeyPath
      ? getNested(profileContext.config, meta.http.configApiKeyPath, "")
      : meta.http.envKeys?.map((key) => normalizeText(profileContext.env[key])).find(Boolean) ?? "";

    if (meta.http.envKeys?.length && !apiKey) {
      const missingResult = buildStoredResult({
        instanceId,
        profileId: profileContext.profileId,
        providerId,
        status: "failed",
        summary: "当前 provider 尚未配置密钥。",
        detail: `请先配置 ${meta.http.envKeys.join(" / ")} 后再测试连接。`,
        source: "config",
      });
      return persistProviderTest(userDataPath, missingResult);
    }

    const httpResult = instance.type === "remote"
      ? await testRemoteHttpEndpoint(instance, baseUrl, apiKey, { ...meta.http, providerId })
      : await testLocalHttpEndpoint(baseUrl, apiKey, { ...meta.http, providerId });

    const storedResult = buildStoredResult({
      instanceId,
      profileId: profileContext.profileId,
      providerId,
      status: httpResult.ok ? "verified" : "failed",
      summary: httpResult.ok ? "连接测试通过。" : "连接测试失败。",
      detail: httpResult.ok
        ? `已成功访问 ${toHttpProbeUrl(baseUrl, meta.http.validationPath)}（HTTP ${httpResult.data?.statusCode ?? 200}）。`
        : httpResult.error?.detail ?? "provider endpoint 测试失败。",
      source: "http",
    });
    return persistProviderTest(userDataPath, storedResult);
  }

  const configured = hasAuthProvider(profileContext.authJson, meta.authProviders) || hasConfiguredEnv(profileContext.env, meta.envKeys);
  if (!configured) {
    const result = buildStoredResult({
      instanceId,
      profileId: profileContext.profileId,
      providerId,
      status: "failed",
      summary: "当前 provider 尚未完成配置。",
      detail: "请先登录 OAuth 或补充 API Key 后再执行连接测试。",
      source: "config",
    });
    return persistProviderTest(userDataPath, result);
  }

  if (!meta.doctorLabel) {
    const result = buildStoredResult({
      instanceId,
      profileId: profileContext.profileId,
      providerId,
      status: "configured",
      summary: "当前 provider 已配置，但 Hermes doctor 未提供专用验证。",
      detail: "配置已经保存，可继续在真实会话中验证可用性。",
      source: "config",
    });
    return persistProviderTest(userDataPath, result);
  }

  const doctorResult = await runProfileDoctor(instance, profileContext.profileId);
  if (!doctorResult.ok) {
    const result = buildStoredResult({
      instanceId,
      profileId: profileContext.profileId,
      providerId,
      status: "failed",
      summary: "运行 Hermes doctor 失败。",
      detail: doctorResult.error?.detail ?? doctorResult.error?.message ?? "未读取到有效输出。",
      source: "doctor",
    });
    return persistProviderTest(userDataPath, result);
  }

  const combinedOutput = [doctorResult.data?.stdout, doctorResult.data?.stderr].filter(Boolean).join("\n");
  const parsed = parseDoctorLine(combinedOutput, meta.doctorLabel);

  const result = buildStoredResult({
    instanceId,
    profileId: profileContext.profileId,
    providerId,
    status: parsed?.success ? "verified" : parsed ? "failed" : "configured",
    summary: parsed?.success
      ? "Hermes doctor 已通过。"
      : parsed
        ? "Hermes doctor 返回异常。"
        : "当前 provider 已配置，但 doctor 未返回专用检查项。",
    detail: parsed?.line ?? `未在 doctor 输出中找到“${meta.doctorLabel}”检查项。`,
    source: "doctor",
  });

  return persistProviderTest(userDataPath, result);
}
