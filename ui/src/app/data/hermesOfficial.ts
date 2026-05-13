export type HermesIntegrationMode =
  | "polling"
  | "webhook"
  | "websocket"
  | "callback"
  | "oauth"
  | "token"
  | "local"
  | "proxy";

export type HermesIntegrationStatus = "已启用" | "未启用" | "异常";
export type HermesIntegrationHealth = "活跃" | "未同步" | "待配置";

export interface HermesConfigField {
  key: string;
  label: string;
  value: string;
  kind?: "text" | "password" | "readonly";
  readOnly?: boolean;
  secret?: boolean;
  required?: boolean;
}

export type HermesProviderStatus = "已连接" | "未完成" | "异常";
export type HermesProfileGatewayStatus = "已启用" | "未启用" | "异常";

export type HermesProviderAuthMethodId = "oauth" | "api-key" | "endpoint";

export interface HermesProviderAuthMethod {
  id: HermesProviderAuthMethodId;
  label: string;
  detail: string;
  command?: string;
}

export interface HermesIntegrationEntry {
  id: string;
  name: string;
  group: "消息平台";
  mode: HermesIntegrationMode;
  status: HermesIntegrationStatus;
  health: HermesIntegrationHealth;
  authLabel: string;
  summary: string;
  detail: string;
  fields: HermesConfigField[];
}

export interface HermesProviderEntry {
  id: string;
  name: string;
  providerType: "OAuth" | "API Key" | "Custom Endpoint" | "Self-Hosted";
  status: HermesProviderStatus;
  authSummary: string;
  authMethods?: HermesProviderAuthMethod[];
  models: string[];
  defaultModel: string;
  isDefault?: boolean;
  modelSummary: string;
  detail: string;
  fields: HermesConfigField[];
}

export interface HermesProfileEntry {
  id: string;
  name: string;
  isDefault: boolean;
  providerId: string;
  model: string;
  sessions: number;
  lastUsed: string;
  gatewayStatus: HermesProfileGatewayStatus;
  description: string;
}

export interface HermesSettingsSummaryItem {
  label: string;
  value: string;
}

type FallbackIntegrationField = {
  key: string;
  label: string;
  secret?: boolean;
  readOnly?: boolean;
  value?: string;
  required?: boolean;
};

type FallbackIntegrationDefinition = {
  id: string;
  name: string;
  mode: HermesIntegrationMode;
  authLabel: string;
  summary: string;
  fields: FallbackIntegrationField[];
};

const nativeMessagingIntegrationDefinitions: FallbackIntegrationDefinition[] = [
  {
    id: "telegram",
    name: "Telegram",
    mode: "polling",
    authLabel: "Bot Token + 用户 ID",
    summary: "Hermes 原生 Telegram bot，傻瓜式配置只需要 Bot Token 和允许访问的用户 ID。",
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", secret: true, required: true },
      { key: "TELEGRAM_ALLOWED_USERS", label: "用户 ID", required: true },
    ],
  },
  {
    id: "weixin",
    name: "微信 / Weixin",
    mode: "websocket",
    authLabel: "微信扫码",
    summary: "Hermes 原生微信 iLink Bot API 接入，桌面端直接生成二维码，扫码后自动保存凭据。",
    fields: [
      { key: "WEIXIN_ACCOUNT_ID", label: "账号 ID", required: true },
      { key: "WEIXIN_TOKEN", label: "Token", secret: true, required: true },
    ],
  },
  {
    id: "qq",
    name: "QQ",
    mode: "websocket",
    authLabel: "App ID + Client Secret",
    summary: "Hermes 原生 QQ Bot，默认只填写 App ID 和 Client Secret。",
    fields: [
      { key: "QQ_APP_ID", label: "App ID", required: true },
      { key: "QQ_CLIENT_SECRET", label: "Client Secret", secret: true, required: true },
    ],
  },
  {
    id: "feishu",
    name: "飞书 / Lark",
    mode: "websocket",
    authLabel: "App ID + App Secret",
    summary: "Hermes 原生飞书/Lark 平台，默认只填写 App ID 和 App Secret。",
    fields: [
      { key: "FEISHU_APP_ID", label: "App ID", required: true },
      { key: "FEISHU_APP_SECRET", label: "App Secret", secret: true, required: true },
    ],
  },
];

function createMessagingIntegrationEntry(definition: FallbackIntegrationDefinition): HermesIntegrationEntry {
  return {
    id: definition.id,
    name: definition.name,
    group: "消息平台",
    mode: definition.mode,
    status: "未启用",
    health: "待配置",
    authLabel: definition.authLabel,
    summary: definition.summary,
    detail: `当前 profile 尚未配置 ${definition.name} 所需凭据。`,
    fields: definition.fields.map((field): HermesConfigField => ({
      key: field.key,
      label: field.label,
      value: field.value ?? "",
      kind: field.readOnly ? "readonly" : field.secret ? "password" : "text",
      readOnly: Boolean(field.readOnly),
      secret: Boolean(field.secret),
      required: Boolean(field.required ?? true),
    })),
  };
}

export const hermesIntegrations: HermesIntegrationEntry[] = nativeMessagingIntegrationDefinitions.map(createMessagingIntegrationEntry);

export const hermesProviders: HermesProviderEntry[] = [
  createProviderEntry({
    id: "openai-codex",
    name: "OpenAI Codex",
    providerType: "OAuth",
    status: "已连接",
    authSummary: "ChatGPT OAuth",
    models: ["gpt-5.3-codex", "gpt-5.4"],
    defaultModel: "gpt-5.3-codex",
    isDefault: true,
    detail: "OpenAI Codex OAuth provider，默认模型 gpt-5.3-codex。",
    fields: [
      { key: "provider", label: "provider", value: "openai-codex", kind: "readonly", readOnly: true },
      { key: "auth_mode", label: "auth mode", value: "ChatGPT OAuth", kind: "readonly", readOnly: true },
      { key: "default_model", label: "default model", value: "gpt-5.3-codex", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "anthropic",
    name: "Anthropic",
    providerType: "OAuth",
    status: "已连接",
    authSummary: "Claude Code OAuth / API Key",
    models: ["claude-sonnet-4"],
    defaultModel: "claude-sonnet-4",
    detail: "Anthropic provider，支持 Claude Code OAuth 或 ANTHROPIC_API_KEY。",
    fields: [
      { key: "provider", label: "provider", value: "anthropic", kind: "readonly", readOnly: true },
      { key: "auth_mode", label: "auth mode", value: "Claude Code OAuth / API Key", kind: "readonly", readOnly: true },
      { key: "ANTHROPIC_API_KEY", label: "ANTHROPIC_API_KEY", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "claude-sonnet-4", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "copilot",
    name: "GitHub Copilot",
    providerType: "OAuth",
    status: "未完成",
    authSummary: "OAuth device flow / GitHub token",
    models: ["gpt-4.1", "gpt-4o"],
    defaultModel: "gpt-4.1",
    detail: "通过 Copilot/GitHub OAuth 或 token 完成认证后可启用。",
    fields: [
      { key: "provider", label: "provider", value: "copilot", kind: "readonly", readOnly: true },
      { key: "auth_mode", label: "auth mode", value: "OAuth device flow / GitHub token", kind: "readonly", readOnly: true },
      { key: "GITHUB_TOKEN", label: "GITHUB_TOKEN", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "gpt-4.1", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "nous",
    name: "Nous Portal",
    providerType: "OAuth",
    status: "未完成",
    authSummary: "Portal OAuth",
    models: [],
    defaultModel: "待配置",
    detail: "Nous Portal OAuth provider，模型由官方登录后的配置决定。",
    fields: [
      { key: "provider", label: "provider", value: "nous", kind: "readonly", readOnly: true },
      { key: "auth_mode", label: "auth mode", value: "Portal OAuth", kind: "readonly", readOnly: true },
      { key: "default_model", label: "default model", value: "待配置", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "openrouter",
    name: "OpenRouter",
    providerType: "API Key",
    status: "未完成",
    authSummary: "OPENROUTER_API_KEY",
    models: ["openrouter/auto"],
    defaultModel: "openrouter/auto",
    detail: "OpenRouter API Key provider，保存后写入 OPENROUTER_API_KEY 与 model.default。",
    fields: [
      { key: "provider", label: "provider", value: "openrouter", kind: "readonly", readOnly: true },
      { key: "OPENROUTER_API_KEY", label: "OPENROUTER_API_KEY", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "openrouter/auto", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "ai-gateway",
    name: "AI Gateway",
    providerType: "API Key",
    status: "未完成",
    authSummary: "AI_GATEWAY_API_KEY",
    models: ["auto"],
    defaultModel: "auto",
    detail: "AI Gateway API Key provider。",
    fields: [
      { key: "provider", label: "provider", value: "ai-gateway", kind: "readonly", readOnly: true },
      { key: "AI_GATEWAY_API_KEY", label: "AI_GATEWAY_API_KEY", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "auto", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "deepseek",
    name: "DeepSeek",
    providerType: "API Key",
    status: "未完成",
    authSummary: "DEEPSEEK_API_KEY",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    detail: "DeepSeek API Key provider。",
    fields: [
      { key: "provider", label: "provider", value: "deepseek", kind: "readonly", readOnly: true },
      { key: "DEEPSEEK_API_KEY", label: "DEEPSEEK_API_KEY", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "deepseek-chat", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "gemini",
    name: "Google / Gemini",
    providerType: "API Key",
    status: "未完成",
    authSummary: "GOOGLE_API_KEY / GEMINI_API_KEY",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
    detail: "Google Gemini provider，支持 GOOGLE_API_KEY 或 GEMINI_API_KEY。",
    fields: [
      { key: "provider", label: "provider", value: "gemini", kind: "readonly", readOnly: true },
      { key: "GOOGLE_API_KEY", label: "GOOGLE_API_KEY", value: "", kind: "password", secret: true },
      { key: "GEMINI_API_KEY", label: "GEMINI_API_KEY", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "gemini-2.5-pro", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "alibaba",
    name: "Alibaba Cloud / DashScope",
    providerType: "API Key",
    status: "未完成",
    authSummary: "DASHSCOPE_API_KEY",
    models: ["qwen-plus", "qwen-max"],
    defaultModel: "qwen-plus",
    detail: "DashScope API Key provider。",
    fields: [
      { key: "provider", label: "provider", value: "alibaba", kind: "readonly", readOnly: true },
      { key: "DASHSCOPE_API_KEY", label: "DASHSCOPE_API_KEY", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "qwen-plus", kind: "readonly", readOnly: true },
    ],
  }),
  createProviderEntry({
    id: "custom",
    name: "Custom Endpoint",
    providerType: "Custom Endpoint",
    status: "未完成",
    authSummary: "base_url + api_key",
    models: [],
    defaultModel: "待配置",
    detail: "用于自定义 OpenAI-compatible endpoint。",
    fields: [
      { key: "provider", label: "provider", value: "custom", kind: "readonly", readOnly: true },
      { key: "base_url", label: "base_url", value: "http://localhost:8000/v1", kind: "text" },
      { key: "api_key", label: "api_key", value: "", kind: "password", secret: true },
      { key: "default_model", label: "default model", value: "待配置", kind: "readonly", readOnly: true },
    ],
  }),
];

function buildModelSummary(models: string[], defaultModel: string) {
  if (models.length === 0) return defaultModel;
  const orderedModels = [defaultModel, ...models.filter((model) => model !== defaultModel)];
  return orderedModels.join(" / ");
}

function createProviderEntry(provider: Omit<HermesProviderEntry, "modelSummary">): HermesProviderEntry {
  return {
    ...provider,
    modelSummary: buildModelSummary(provider.models, provider.defaultModel),
  };
}

export const hermesProviderOptions = hermesProviders.map((provider) => ({
  value: provider.id,
  label: provider.name,
}));

export const hermesDefaultProviderId = hermesProviders.find((provider) => provider.isDefault)?.id ?? "openai-codex";

export const hermesProfiles: HermesProfileEntry[] = [
  {
    id: "default",
    name: "默认档案",
    isDefault: true,
    providerId: "openai-codex",
    model: "gpt-5.3-codex",
    sessions: 12,
    lastUsed: "10 分钟前",
    gatewayStatus: "已启用",
    description: "默认 Hermes profile，对应 ~/.hermes。",
  },
  {
    id: "incident-response",
    name: "生产排障档案",
    isDefault: false,
    providerId: "anthropic",
    model: "claude-sonnet-4",
    sessions: 8,
    lastUsed: "昨天 14:30",
    gatewayStatus: "异常",
    description: "隔离的排障 profile，单独持有 config、sessions 和 gateway 状态。",
  },
];

export const hermesSettingsSummary: HermesSettingsSummaryItem[] = [
  { label: "config.yaml", value: "~/.hermes/config.yaml" },
  { label: ".env", value: "~/.hermes/.env" },
  { label: "auth.json", value: "~/.hermes/auth.json" },
  { label: "HERMES_HOME", value: "~/.hermes" },
];
