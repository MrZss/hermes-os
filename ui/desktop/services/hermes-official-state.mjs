import fs from "node:fs/promises";
import path from "node:path";
import { getRegisteredInstance } from "./instance-registry.mjs";
import { runSshCommand } from "./ssh-runtime.mjs";
import {
  countRemoteDockerFilesRecursively,
  getLatestRemoteDockerTimestamp,
  isRemoteDockerInstance,
  readRemoteDockerDirectoryEntries,
  readRemoteDockerJsonFile,
  readRemoteDockerTextFile,
  remoteDockerFileExists,
} from "./remote-docker-files.mjs";

const PROVIDER_TYPE = {
  OAUTH: "OAuth",
  API_KEY: "API Key",
  CUSTOM: "Custom Endpoint",
  SELF_HOSTED: "Self-Hosted",
};

const XIAOMI_TOKEN_PLAN_CN_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";

const PROVIDER_CATALOG = {
  auto: {
    name: "未选择",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "尚未选择供应商",
    envKeys: [],
    models: [],
    defaultModel: "",
  },
  "openai-codex": {
    name: "OpenAI Codex",
    providerType: PROVIDER_TYPE.OAUTH,
    authSummary: "ChatGPT OAuth",
    authProviders: ["openai-codex", "codex"],
    models: ["gpt-5.3-codex", "gpt-5.4"],
    defaultModel: "gpt-5.3-codex",
  },
  anthropic: {
    name: "Anthropic",
    providerType: PROVIDER_TYPE.OAUTH,
    authSummary: "Claude Code OAuth / API Key",
    authProviders: ["anthropic"],
    envKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_TOKEN"],
    models: ["claude-sonnet-4"],
    defaultModel: "claude-sonnet-4",
  },
  copilot: {
    name: "GitHub Copilot",
    providerType: PROVIDER_TYPE.OAUTH,
    authSummary: "OAuth device flow / GitHub token",
    authProviders: ["copilot", "github-copilot"],
    envKeys: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
    models: ["gpt-4.1", "gpt-4o"],
    defaultModel: "gpt-4.1",
  },
  nous: {
    name: "Nous Portal",
    providerType: PROVIDER_TYPE.OAUTH,
    authSummary: "Portal OAuth",
    authProviders: ["nous", "portal"],
    models: [],
    defaultModel: "",
  },
  openrouter: {
    name: "OpenRouter",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "OPENROUTER_API_KEY",
    envKeys: ["OPENROUTER_API_KEY"],
    models: ["openrouter/auto"],
    defaultModel: "openrouter/auto",
  },
  "ai-gateway": {
    name: "AI Gateway",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "AI_GATEWAY_API_KEY",
    envKeys: ["AI_GATEWAY_API_KEY"],
    models: ["auto"],
    defaultModel: "auto",
  },
  zai: {
    name: "z.ai / GLM",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "GLM_API_KEY",
    envKeys: ["GLM_API_KEY"],
    models: ["glm-4.5", "glm-4.5-air"],
    defaultModel: "glm-4.5",
  },
  "kimi-coding": {
    name: "Kimi / Moonshot",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "KIMI_API_KEY",
    envKeys: ["KIMI_API_KEY"],
    models: ["kimi-k2", "moonshot-v1-128k"],
    defaultModel: "kimi-k2",
  },
  "kimi-coding-cn": {
    name: "Kimi / Moonshot（中国）",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "KIMI_CN_API_KEY",
    envKeys: ["KIMI_CN_API_KEY"],
    models: ["kimi-k2", "moonshot-v1-128k"],
    defaultModel: "kimi-k2",
  },
  minimax: {
    name: "MiniMax",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "MINIMAX_API_KEY",
    envKeys: ["MINIMAX_API_KEY"],
    models: ["MiniMax-Text-01"],
    defaultModel: "MiniMax-Text-01",
  },
  "minimax-cn": {
    name: "MiniMax（中国）",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "MINIMAX_CN_API_KEY",
    envKeys: ["MINIMAX_CN_API_KEY"],
    models: ["MiniMax-Text-01"],
    defaultModel: "MiniMax-Text-01",
  },
  alibaba: {
    name: "Alibaba Cloud / DashScope",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "DASHSCOPE_API_KEY",
    envKeys: ["DASHSCOPE_API_KEY"],
    models: ["qwen-plus", "qwen-max"],
    defaultModel: "qwen-plus",
  },
  xiaomi: {
    name: "Xiaomi MiMo",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "XIAOMI_API_KEY + 专属 Base URL",
    envKeys: ["XIAOMI_API_KEY"],
    baseEnvKey: "XIAOMI_BASE_URL",
    defaultBaseUrl: XIAOMI_TOKEN_PLAN_CN_BASE_URL,
    models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni", "mimo-v2-flash"],
    defaultModel: "mimo-v2.5-pro",
  },
  arcee: {
    name: "Arcee AI",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "ARCEEAI_API_KEY",
    envKeys: ["ARCEEAI_API_KEY"],
    models: [],
    defaultModel: "",
  },
  deepseek: {
    name: "DeepSeek",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "DEEPSEEK_API_KEY",
    envKeys: ["DEEPSEEK_API_KEY"],
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
  },
  gemini: {
    name: "Google / Gemini",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "GOOGLE_API_KEY / GEMINI_API_KEY",
    envKeys: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
  },
  "google-gemini-cli": {
    name: "Google Gemini OAuth",
    providerType: PROVIDER_TYPE.OAUTH,
    authSummary: "Google Cloud Code Assist OAuth",
    authProviders: ["google-gemini-cli", "gemini-cli"],
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
  },
  "qwen-oauth": {
    name: "Qwen OAuth",
    providerType: PROVIDER_TYPE.OAUTH,
    authSummary: "Qwen Portal OAuth",
    authProviders: ["qwen-oauth", "qwen"],
    models: ["qwen3-coder-plus", "qwen3-coder"],
    defaultModel: "qwen3-coder-plus",
  },
  huggingface: {
    name: "Hugging Face",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "HF_TOKEN",
    envKeys: ["HF_TOKEN"],
    models: [],
    defaultModel: "",
  },
  custom: {
    name: "Custom Endpoint",
    providerType: PROVIDER_TYPE.CUSTOM,
    authSummary: "base_url + api_key",
    envKeys: [],
    models: [],
    defaultModel: "",
  },
};

const INTEGRATION_CATALOG = [
  {
    id: "telegram",
    name: "Telegram",
    group: "消息平台",
    mode: "polling",
    authLabel: "Bot Token + 用户 ID",
    summary: "Hermes 原生 Telegram bot，傻瓜式配置只需要 Bot Token 和允许访问的用户 ID。",
    envKeys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USERS"],
    fieldDefs: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", secret: true, required: true },
      { key: "TELEGRAM_ALLOWED_USERS", label: "用户 ID", required: true },
    ],
  },
  {
    id: "weixin",
    name: "微信 / Weixin",
    group: "消息平台",
    mode: "websocket",
    authLabel: "微信扫码",
    summary: "Hermes 原生微信 iLink Bot API 接入，桌面端直接生成二维码，扫码后自动保存凭据。",
    envKeys: ["WEIXIN_ACCOUNT_ID", "WEIXIN_TOKEN"],
    fieldDefs: [
      { key: "WEIXIN_ACCOUNT_ID", label: "账号 ID", required: true },
      { key: "WEIXIN_TOKEN", label: "Token", secret: true, required: true },
    ],
  },
  {
    id: "qq",
    name: "QQ",
    group: "消息平台",
    mode: "websocket",
    authLabel: "App ID + Client Secret",
    summary: "Hermes 原生 QQ Bot，默认只填写 App ID 和 Client Secret。",
    envKeys: ["QQ_APP_ID", "QQ_CLIENT_SECRET"],
    fieldDefs: [
      { key: "QQ_APP_ID", label: "App ID", required: true },
      { key: "QQ_CLIENT_SECRET", label: "Client Secret", secret: true, required: true },
    ],
  },
  {
    id: "feishu",
    name: "飞书 / Lark",
    group: "消息平台",
    mode: "websocket",
    authLabel: "App ID + App Secret",
    summary: "Hermes 原生飞书/Lark 平台，默认只填写 App ID 和 App Secret。",
    envKeys: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
    fieldDefs: [
      { key: "FEISHU_APP_ID", label: "App ID", required: true },
      { key: "FEISHU_APP_SECRET", label: "App Secret", secret: true, required: true },
    ],
  },
];

const MESSAGING_GATEWAY_ENV_KEYS = Array.from(new Set(INTEGRATION_CATALOG.flatMap((definition) => definition.envKeys ?? [])));
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

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

function nowMs() {
  return Date.now();
}

function formatRelativeTimeFromMs(timestamp) {
  if (!timestamp || Number.isNaN(timestamp)) return "刚刚";

  const diff = Math.max(0, nowMs() - timestamp);
  const minutes = Math.round(diff / 60_000);

  if (minutes <= 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

function normalizeEnvValue(value) {
  return typeof value === "string" ? value.trim() : "";
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

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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

async function runRemoteShell(instance, remoteCommand, timeoutMs = 20_000) {
  const connection = buildRemoteConnection(instance);

  if (!connection) {
    return toDesktopError(
      "REMOTE_CONNECTION_MISSING",
      "远程实例缺少 SSH 连接元数据。",
      `instanceId=${instance?.id ?? "unknown"}`,
      true
    );
  }

  return runSshCommand(connection, remoteCommand, { timeoutMs });
}

async function remoteFileExists(instance, targetPath) {
  if (isRemoteDockerInstance(instance)) {
    return remoteDockerFileExists(instance, targetPath);
  }

  const result = await runRemoteShell(
    instance,
    `if [ -e ${shellEscape(targetPath)} ]; then printf '1'; else printf '0'; fi`,
    8_000
  );

  return Boolean(result.ok && result.data?.stdout.trim() === "1");
}

async function readRemoteTextFile(instance, targetPath) {
  if (isRemoteDockerInstance(instance)) {
    return readRemoteDockerTextFile(instance, targetPath);
  }

  const result = await runRemoteShell(
    instance,
    `if [ -f ${shellEscape(targetPath)} ]; then cat ${shellEscape(targetPath)}; fi`,
    12_000
  );

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

function parseEnvText(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    let value = rawLine.slice(separatorIndex + 1).trim();

    value = stripSurroundingQuotes(value);
    env[key] = value;
  }

  return env;
}

async function readDirectoryEntries(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readRemoteDirectoryEntries(instance, directoryPath) {
  if (isRemoteDockerInstance(instance)) {
    return readRemoteDockerDirectoryEntries(instance, directoryPath);
  }

  const command = `
if [ -d ${shellEscape(directoryPath)} ]; then
  find ${shellEscape(directoryPath)} -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' 2>/dev/null || true
fi
`.trim();
  const result = await runRemoteShell(instance, command, 12_000);

  if (!result.ok || !result.data) {
    return [];
  }

  return result.data.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      isDirectory() {
        return true;
      },
    }));
}

async function countFilesRecursively(directoryPath) {
  const entries = await readDirectoryEntries(directoryPath);
  let count = 0;

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursively(entryPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }

  return count;
}

async function countRemoteFilesRecursively(instance, directoryPath) {
  if (isRemoteDockerInstance(instance)) {
    return countRemoteDockerFilesRecursively(instance, directoryPath);
  }

  const command = `
if [ -d ${shellEscape(directoryPath)} ]; then
  find ${shellEscape(directoryPath)} -type f 2>/dev/null | wc -l | tr -d ' '
else
  printf '0'
fi
`.trim();

  const result = await runRemoteShell(instance, command, 12_000);
  const numeric = Number(result.ok ? result.data?.stdout?.trim() ?? "0" : "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

async function getLatestTimestampRecursively(directoryPath) {
  const entries = await readDirectoryEntries(directoryPath);
  let latest = 0;

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, await getLatestTimestampRecursively(entryPath));
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      const stats = await fs.stat(entryPath);
      latest = Math.max(latest, stats.mtimeMs);
    } catch {
      // ignore
    }
  }

  return latest;
}

async function getLatestTimestamp(paths) {
  let latest = 0;

  for (const targetPath of paths) {
    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        latest = Math.max(latest, await getLatestTimestampRecursively(targetPath));
      } else {
        latest = Math.max(latest, stats.mtimeMs);
      }
    } catch {
      // ignore missing paths
    }
  }

  return latest;
}

async function getLatestRemoteTimestamp(instance, paths) {
  if (isRemoteDockerInstance(instance)) {
    return getLatestRemoteDockerTimestamp(instance, paths);
  }

  const escapedPaths = paths.filter(Boolean).map((targetPath) => shellEscape(targetPath)).join(" ");
  const command = `
LATEST=$(for target in ${escapedPaths}; do
  if [ -d "$target" ]; then
    find "$target" -type f -printf '%T@\\n' 2>/dev/null || true
  elif [ -f "$target" ]; then
    stat -c '%Y' "$target" 2>/dev/null || true
  fi
done | sort -nr | head -n1)
printf '%s' "$LATEST"
`.trim();

  const result = await runRemoteShell(instance, command, 12_000);
  const numeric = Number(result.ok ? result.data?.stdout?.trim() ?? "0" : "0");
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 10_000_000_000 ? numeric : numeric * 1000;
}

function getProviderMeta(providerId) {
  return PROVIDER_CATALOG[providerId] ?? {
    name: providerId || "待配置",
    providerType: PROVIDER_TYPE.API_KEY,
    authSummary: "待配置",
    envKeys: [],
    models: [],
    defaultModel: "",
  };
}

function normalizeProviderId(providerId) {
  return providerId === "custom-endpoint" ? "custom" : providerId;
}

function buildProviderModelOptions(providerId, meta, configuredModel) {
  const options = [];
  const configured = String(configuredModel || "").trim();

  if (configured && configured !== "待配置") {
    options.push(configured);
  }

  for (const candidate of [meta.defaultModel, ...(meta.models ?? [])]) {
    const model = String(candidate || "").trim();
    if (model && model !== "待配置" && !options.includes(model)) {
      options.push(model);
    }
  }

  return providerId === "auto" ? [] : options;
}

function getProviderDefaultModel(providerId, meta, configuredModel, isSelected) {
  if (providerId === "auto") return "";
  const configured = String(configuredModel || "").trim();
  if (isSelected && configured && configured !== "待配置") {
    return configured;
  }

  return String(meta.defaultModel || meta.models?.[0] || "").trim() || "待配置";
}

function buildProviderModelSummary(models, defaultModel) {
  const visibleModels = [
    defaultModel,
    ...models.filter((model) => model !== defaultModel),
  ].filter((model) => model && model !== "待配置").slice(0, 3);

  return visibleModels.length > 0 ? visibleModels.join(" / ") : "待配置";
}

function getConfiguredEnvKeys(env, keys = []) {
  return keys.filter((key) => normalizeEnvValue(env[key]));
}

function hasConfiguredEnv(env, keys = []) {
  return getConfiguredEnvKeys(env, keys).length > 0;
}

function hasRequiredIntegrationEnv(definition, env) {
  const requiredKeys = (definition.fieldDefs ?? [])
    .filter((field) => field.required)
    .map((field) => field.key);

  if (requiredKeys.length === 0) {
    return hasConfiguredEnv(env, definition.envKeys);
  }

  return requiredKeys.every((key) => normalizeEnvValue(env[key]));
}

function hasAuthProvider(authJson, authProviders = []) {
  if (!authJson || typeof authJson !== "object") return false;
  const providers = authJson.providers;
  if (!providers || typeof providers !== "object") return false;
  return authProviders.some((providerId) => Boolean(providers[providerId]));
}

function buildProviderAuthMethods(providerId, meta) {
  if (providerId === "custom") {
    return [
      {
        id: "endpoint",
        label: "Endpoint + Key",
        detail: "填写 OpenAI-compatible base_url、模型与可选 API Key。",
      },
    ];
  }

  const methods = [];

  if (Array.isArray(meta.authProviders) && meta.authProviders.length > 0) {
    methods.push({
      id: "oauth",
      label: "OAuth 登录",
      detail: "调用官方 hermes auth add <provider> --type oauth 流程写入 auth.json / credential pool。",
      command: `hermes auth add ${providerId} --type oauth`,
    });
  }

  if (Array.isArray(meta.envKeys) && meta.envKeys.length > 0) {
    methods.push({
      id: "api-key",
      label: "API Key",
      detail: `写入 ${meta.envKeys.join(" / ")} 到当前 Hermes profile 的 .env。`,
      command: `hermes config set ${meta.envKeys[0]} ***`,
    });
  }

  return methods;
}

function buildProviderFields({ providerId, meta, config, env, authJson, defaultModel }) {
  const modelValue = defaultModel || getNested(config, ["model", "default"], getNested(config, ["model", "model"], "待配置"));
  const baseUrl = getNested(config, ["model", "base_url"], "");
  const apiKey = getNested(config, ["model", "api_key"], "");
  const authMode = hasAuthProvider(authJson, meta.authProviders) ? meta.authSummary : hasConfiguredEnv(env, meta.envKeys) ? "API Key" : meta.authSummary;

  const fields = [{ key: "provider", label: "provider", value: providerId, kind: "readonly", readOnly: true }];

  if (providerId === "custom") {
    fields.push({ key: "base_url", label: "base_url", value: baseUrl || "待配置", kind: "text" });
    fields.push({ key: "api_key", label: "api_key", value: apiKey ? maskSecret(String(apiKey)) : "", kind: "password", secret: true });
  } else {
    fields.push({ key: "auth_mode", label: "auth mode", value: authMode, kind: "readonly", readOnly: true });
    for (const envKey of meta.envKeys ?? []) {
      fields.push({
        key: envKey,
        label: envKey,
        value: normalizeEnvValue(env[envKey]) ? maskSecret(String(env[envKey])) : "",
        kind: "password",
        secret: true,
      });
    }
    if (meta.baseEnvKey) {
      fields.push({
        key: meta.baseEnvKey,
        label: "专属 Base URL",
        value: normalizeEnvValue(env[meta.baseEnvKey]) || meta.defaultBaseUrl || "待配置",
        kind: "readonly",
        readOnly: true,
      });
    }
  }

  fields.push({ key: "default_model", label: "default model", value: modelValue || "待配置", kind: "readonly", readOnly: true });

  return fields;
}

function buildProviderEntries({ config, env, authJson }) {
  const selectedProviderId = normalizeProviderId(String(getNested(config, ["model", "provider"], "") || "").trim() || "auto");
  const configuredDefaultModel = String(getNested(config, ["model", "default"], getNested(config, ["model", "model"], "")) || "").trim();
  const configuredProviderIds = new Set(Object.keys(PROVIDER_CATALOG));

  if (selectedProviderId && !configuredProviderIds.has(selectedProviderId)) {
    configuredProviderIds.add(selectedProviderId);
  }

  for (const [providerId, meta] of Object.entries(PROVIDER_CATALOG)) {
    if (hasConfiguredEnv(env, meta.envKeys) || hasAuthProvider(authJson, meta.authProviders)) {
      configuredProviderIds.add(providerId);
    }
  }

  const entries = Array.from(configuredProviderIds)
    .filter(Boolean)
    .map((providerId) => {
      const meta = getProviderMeta(providerId);
      const configuredEnvKeys = getConfiguredEnvKeys(env, meta.envKeys);
      const oauthConfigured = hasAuthProvider(authJson, meta.authProviders);
      const customConfigured = providerId === "custom" && Boolean(getNested(config, ["model", "base_url"], ""));
      const isConfigured = oauthConfigured || configuredEnvKeys.length > 0 || customConfigured || providerId === "auto";
      const status = isConfigured ? "已连接" : providerId === selectedProviderId ? "异常" : "未完成";
      const isDefault = providerId === selectedProviderId;
      const defaultModel = getProviderDefaultModel(providerId, meta, configuredDefaultModel, isDefault);
      const models = buildProviderModelOptions(providerId, meta, isDefault ? configuredDefaultModel : "");
      const modelSummary = buildProviderModelSummary(models, defaultModel);
      const authSummary = providerId === "custom"
        ? (customConfigured
          ? (getNested(config, ["model", "api_key"], "") ? "base_url + api_key" : "base_url")
          : meta.authSummary)
        : oauthConfigured
          ? meta.authSummary
          : configuredEnvKeys.length > 0
            ? configuredEnvKeys.join(" / ")
            : meta.authSummary;
      const detail = providerId === selectedProviderId
        ? `当前实例默认 provider 为 ${meta.name}，默认模型 ${defaultModel || "待配置"}。`
        : isConfigured
          ? `${meta.name} 已在当前实例中发现凭据，可通过 Hermes 官方模型切换命令启用。`
          : `${meta.name} 尚未在当前实例中完成配置。`;

      return {
        id: providerId,
        name: meta.name,
        providerType: meta.providerType,
        status,
        authSummary,
        authMethods: buildProviderAuthMethods(providerId, meta),
        models,
        defaultModel: defaultModel || "待配置",
        isDefault,
        modelSummary,
        detail,
        fields: buildProviderFields({ providerId, meta, config, env, authJson, defaultModel }),
      };
    });

  return entries.sort((left, right) => {
    if (left.isDefault && !right.isDefault) return -1;
    if (!left.isDefault && right.isDefault) return 1;
    return left.name.localeCompare(right.name);
  });
}

function buildIntegrationFields(definition, env) {
  return definition.fieldDefs.map((field) => {
    let value = field.value ?? env[field.key] ?? "";

    return {
      key: field.key,
      label: field.label,
      value: field.secret ? maskSecret(String(value || "")) : String(value || ""),
      kind: field.readOnly ? "readonly" : field.secret ? "password" : "text",
      readOnly: Boolean(field.readOnly),
      secret: Boolean(field.secret),
      required: Boolean(field.required ?? true),
    };
  });
}

const INTEGRATION_NETWORK_ISSUES = {
  telegram: {
    patterns: [/telegram connect timed out/i, /api\.telegram\.org connection failed/i, /Fallback IP .* failed/i, /urlopen error timed out/i, /ConnectTimeout/i],
    successPatterns: [/\b✓\s*telegram connected/i, /\[Telegram\].*\bConnected\b/i],
    detail: "Telegram API 连接超时：远程节点运行服务无法访问 api.telegram.org。请在服务器环境处理网络/代理后重启消息平台；Hermes 支持 TELEGRAM_PROXY。",
  },
  qq: {
    patterns: [
      /(?:\bqqbot\b|q\.qq\.com).*(?:connection failed|connect timed out|connection timed out|timeout|timed out|ConnectTimeout|ECONNRESET|ENETUNREACH)/i,
      /(?:connection failed|connect timed out|connection timed out|timeout|timed out|ConnectTimeout|ECONNRESET|ENETUNREACH).*(?:\bqqbot\b|q\.qq\.com)/i,
    ],
    successPatterns: [/\b✓\s*(?:qq|qqbot) connected/i, /\[(?:QQ|QQBot)\].*\bConnected\b/i],
    detail: "QQ Bot API 连接超时：远程节点运行服务无法访问 q.qq.com / QQ Bot 开放平台。请在服务器环境处理网络或代理后重启消息平台。",
  },
  qqbot: {
    patterns: [
      /(?:\bqqbot\b|q\.qq\.com).*(?:connection failed|connect timed out|connection timed out|timeout|timed out|ConnectTimeout|ECONNRESET|ENETUNREACH)/i,
      /(?:connection failed|connect timed out|connection timed out|timeout|timed out|ConnectTimeout|ECONNRESET|ENETUNREACH).*(?:\bqqbot\b|q\.qq\.com)/i,
    ],
    successPatterns: [/\b✓\s*(?:qq|qqbot) connected/i, /\[(?:QQ|QQBot)\].*\bConnected\b/i],
    detail: "QQ Bot API 连接超时：远程节点运行服务无法访问 q.qq.com / QQ Bot 开放平台。请在服务器环境处理网络或代理后重启消息平台。",
  },
  feishu: {
    patterns: [
      /(?:\bfeishu\b|open\.feishu\.cn|\blark\b).*(?:connection failed|connect timed out|connection timed out|timeout|timed out|Read timed out|ConnectTimeout|ECONNRESET|ENETUNREACH)/i,
      /(?:connection failed|connect timed out|connection timed out|timeout|timed out|Read timed out|ConnectTimeout|ECONNRESET|ENETUNREACH).*(?:\bfeishu\b|open\.feishu\.cn|\blark\b)/i,
    ],
    successPatterns: [/\b✓\s*(?:feishu|lark) connected/i, /\[(?:Feishu|Lark)\].*\bConnected\b/i],
    detail: "飞书开放平台连接超时：远程节点运行服务无法访问 open.feishu.cn。请在服务器环境处理网络或代理后重启消息平台。",
  },
  weixin: {
    patterns: [
      /(?:\bweixin\b|\biLink\b|weixin\.qq\.com|novac2c\.cdn\.weixin\.qq\.com).*(?:connection failed|connect timed out|connection timed out|timeout|timed out|ConnectTimeout|ECONNRESET|ENETUNREACH)/i,
      /(?:connection failed|connect timed out|connection timed out|timeout|timed out|ConnectTimeout|ECONNRESET|ENETUNREACH).*(?:\bweixin\b|\biLink\b|weixin\.qq\.com|novac2c\.cdn\.weixin\.qq\.com)/i,
    ],
    successPatterns: [/\b✓\s*weixin connected/i, /\[Weixin\].*\bConnected\b/i],
    detail: "微信 iLink 连接超时：远程节点运行服务无法访问微信 iLink 服务。请在服务器环境处理网络或代理后重启消息平台。",
  },
};

export function detectIntegrationRuntimeIssue(integrationId, gatewayLogText = "") {
  const id = String(integrationId || "").trim().toLowerCase();
  const logText = String(gatewayLogText || "");

  if (!id || !logText.trim()) {
    return null;
  }

  const networkIssue = INTEGRATION_NETWORK_ISSUES[id];
  if (networkIssue) {
    const recentLines = logText.split(/\r?\n/).filter(Boolean).slice(-300).reverse();
    for (const line of recentLines) {
      if (networkIssue.successPatterns?.some((pattern) => pattern.test(line))) {
        break;
      }
      if (networkIssue.patterns.some((pattern) => pattern.test(line))) {
        return {
          status: "异常",
          health: "未同步",
          detail: networkIssue.detail,
        };
      }
    }
  }

  if (id === "telegram") {
    if (/telegram.*(invalid token|Unauthorized|Forbidden|Not Found)/i.test(logText)) {
      return {
        status: "异常",
        health: "未同步",
        detail: "Telegram Bot Token 校验失败：请重新检查 BotFather 提供的 Bot Token，然后保存并重启消息平台。",
      };
    }

    if (/No home channel is set/i.test(logText)) {
      return {
        status: "已启用",
        health: "未同步",
        detail: "Telegram 已连接，但还没有设置主页频道。请在当前 Telegram 聊天里发送 /sethome。",
      };
    }
  }

  return null;
}

function buildIntegrationEntry({ definition, env, instance, gatewayPidExists, gatewayLogText }) {
  const configured = hasRequiredIntegrationEnv(definition, env);
  const runtimeIssue = configured ? detectIntegrationRuntimeIssue(definition.id, gatewayLogText) : null;
  const runtimeHealthy = gatewayPidExists && configured;
  const status = configured ? (runtimeIssue?.status ?? (instance.lastError && !runtimeHealthy ? "异常" : "已启用")) : "未启用";
  const health = configured ? (runtimeIssue?.health ?? (runtimeHealthy ? "活跃" : "未同步")) : "待配置";
  const detail = configured
    ? runtimeIssue?.detail ?? (runtimeHealthy
      ? `${definition.name} 已配置且当前 messaging gateway 处于活跃态。`
      : `${definition.name} 已配置，但当前 messaging gateway 未处于活跃态。`)
    : `当前 profile 尚未配置 ${definition.name} 所需凭据。`;

  return {
    id: definition.id,
    name: definition.name,
    group: definition.group,
    mode: definition.mode,
    status,
    health,
    authLabel: definition.authLabel,
    summary: definition.summary,
    detail,
    fields: buildIntegrationFields(definition, env),
  };
}

function createFilesystemOps(instance) {
  if (instance.type === "remote") {
    return {
      fileExists: (targetPath) => remoteFileExists(instance, targetPath),
      readTextFile: (targetPath) => readRemoteTextFile(instance, targetPath),
      readDirectoryEntries: (directoryPath) => readRemoteDirectoryEntries(instance, directoryPath),
      countFilesRecursively: (directoryPath) => countRemoteFilesRecursively(instance, directoryPath),
      getLatestTimestamp: (paths) => getLatestRemoteTimestamp(instance, paths),
      readJsonFile: (targetPath) => readRemoteJsonFile(instance, targetPath),
    };
  }

  return {
    fileExists,
    readTextFile,
    readDirectoryEntries,
    countFilesRecursively,
    getLatestTimestamp,
    readJsonFile,
  };
}

async function collectProfileEntries({ instance, defaultConfig, defaultEnv, fsOps }) {
  const profileRoots = [{ id: "default", name: "默认档案", isDefault: true, homePath: instance.hermesHome }];
  const profilesRoot = path.join(instance.hermesHome, "profiles");
  const profileDirectories = await fsOps.readDirectoryEntries(profilesRoot);

  for (const entry of profileDirectories) {
    if (!entry.isDirectory()) continue;
    profileRoots.push({
      id: entry.name,
      name: entry.name,
      isDefault: false,
      homePath: path.join(profilesRoot, entry.name),
    });
  }

  const profileEntries = [];

  for (const descriptor of profileRoots) {
    const configPath = path.join(descriptor.homePath, "config.yaml");
    const envPath = path.join(descriptor.homePath, ".env");
    const gatewayPidPath = path.join(descriptor.homePath, "gateway.pid");
    const config = descriptor.isDefault ? defaultConfig : parseSimpleYaml(await fsOps.readTextFile(configPath));
    const env = descriptor.isDefault ? defaultEnv : parseEnvText(await fsOps.readTextFile(envPath));
    const providerId = String(getNested(config, ["model", "provider"], "待配置") || "待配置").trim() || "待配置";
    const model = String(getNested(config, ["model", "default"], getNested(config, ["model", "model"], "待配置")) || "待配置").trim() || "待配置";
    const sessions = await fsOps.countFilesRecursively(path.join(descriptor.homePath, "sessions"));
    const lastUsedTimestamp = await fsOps.getLatestTimestamp([
      path.join(descriptor.homePath, "sessions"),
      path.join(descriptor.homePath, "logs"),
      configPath,
      envPath,
      path.join(descriptor.homePath, "SOUL.md"),
    ]);
    const gatewayPidExists = await fsOps.fileExists(gatewayPidPath);
    const gatewayConfigured = hasConfiguredEnv(env, MESSAGING_GATEWAY_ENV_KEYS);

    let gatewayStatus = "未启用";
    if (gatewayPidExists || (descriptor.isDefault && instance.status === "running")) {
      gatewayStatus = "已启用";
    } else if (descriptor.isDefault && instance.lastError) {
      gatewayStatus = "异常";
    } else if (gatewayConfigured) {
      gatewayStatus = "未启用";
    }

    profileEntries.push({
      id: descriptor.id,
      name: descriptor.name,
      isDefault: descriptor.isDefault,
      providerId,
      model,
      sessions,
      lastUsed: formatRelativeTimeFromMs(lastUsedTimestamp),
      gatewayStatus,
      description: descriptor.isDefault
        ? `默认 Hermes profile，对应 ${instance.hermesHome}。`
        : `隔离的 Hermes profile，对应 ${descriptor.homePath}。`,
    });
  }

  return profileEntries;
}

export async function getInstanceOfficialState(userDataPath, instanceId, options = {}) {
  if (!instanceId || typeof instanceId !== "string") {
    return toDesktopError("INSTANCE_ID_REQUIRED", "实例 ID 不能为空。", "请提供要读取的实例 ID。", true);
  }

  const registryResult = await getRegisteredInstance(userDataPath, instanceId);
  if (!registryResult.ok || !registryResult.data) {
    return toDesktopError(
      registryResult.error?.code ?? "INSTANCE_LOOKUP_FAILED",
      registryResult.error?.message ?? "无法读取实例信息。",
      registryResult.error?.detail,
      registryResult.error?.recoverable ?? true
    );
  }

  const instance = registryResult.data.instance;
  if (!instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "实例不存在。", `未在注册表中找到实例 ${instanceId}。`, true);
  }

  const fsOps = createFilesystemOps(instance);

  if (instance.type === "remote") {
    const remoteProbe = await runRemoteShell(instance, "printf '__connected__'", 8_000);
    if (!remoteProbe.ok) {
      return remoteProbe;
    }
  }

  if (!(await fsOps.fileExists(instance.hermesHome))) {
    return toDesktopError(
      "HERMES_HOME_MISSING",
      "实例尚未初始化 Hermes 目录。",
      `未找到 ${instance.hermesHome}。请先重新部署或修复实例目录。`,
      true
    );
  }

  const selectedProfileId = typeof options.profileId === "string" && options.profileId.trim() ? options.profileId.trim() : "default";
  const selectedProfileHome = selectedProfileId === "default"
    ? instance.hermesHome
    : path.join(instance.hermesHome, "profiles", selectedProfileId);
  const configPath = path.join(selectedProfileHome, "config.yaml");
  const envPath = path.join(selectedProfileHome, ".env");
  const authPath = path.join(instance.hermesHome, "auth.json");
  const profilesRoot = path.join(instance.hermesHome, "profiles");
  const gatewayPidPath = path.join(selectedProfileHome, "gateway.pid");

  const defaultConfig = parseSimpleYaml(await fsOps.readTextFile(path.join(instance.hermesHome, "config.yaml")));
  const defaultEnv = parseEnvText(await fsOps.readTextFile(path.join(instance.hermesHome, ".env")));
  const config = selectedProfileId === "default" ? defaultConfig : parseSimpleYaml(await fsOps.readTextFile(configPath));
  const env = selectedProfileId === "default" ? defaultEnv : parseEnvText(await fsOps.readTextFile(envPath));
  const gatewayLogText = await fsOps.readTextFile(path.join(selectedProfileHome, "logs", "gateway.log"));
  const authJson = await fsOps.readJsonFile(authPath);
  const profiles = await collectProfileEntries({ instance, defaultConfig, defaultEnv, fsOps });
  const providers = buildProviderEntries({ config, env, authJson });
  const gatewayPidExists = await fsOps.fileExists(gatewayPidPath);
  const integrations = INTEGRATION_CATALOG.map((definition) =>
    buildIntegrationEntry({ definition, env, instance, gatewayPidExists, gatewayLogText })
  );

  return {
    ok: true,
    data: {
      instance,
      profiles,
      providers,
      integrations,
      sources: {
        hermesHome: instance.hermesHome,
        configPath,
        envPath,
        authPath,
        profilesRoot,
        selectedProfileId,
        selectedProfileHome,
      },
    },
  };
}
