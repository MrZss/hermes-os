# Hermes 官方配置体系对齐重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Hermes Console 中与配置真相源相关的页面统一对齐到 Hermes 官方 `profile / provider / gateway / config.yaml / .env` 体系，并移除 v1 中不应继续保留的泛化配置对象。

**Architecture:** 保持现有桌面壳层、路由和页面数量不变，只重构配置型页面的对象语义、字段归属和 mock 数据来源。新增一个共享的 `hermesOfficial` 数据模块作为当前 UI 的临时真相源，统一驱动 `档案 / 提供商 / 集成 / 设置 / 创建实例 Step 4`，避免页面继续各自发明配置对象。

**Tech Stack:** React 18、React Router 7、TypeScript、Vite、Electron、Tailwind 风格组件、现有 `Badge / Button / Card / Drawer / PageHeader`

---

## File Map

### Create

- `ui/src/app/data/hermesOfficial.ts`
  - Hermes 官方体系对齐后的临时共享 mock 数据与类型定义

### Modify

- `ui/src/app/pages/instance/Integrations.tsx`
  - 将“集成页”改为 Hermes 官方外部接入页，优先展示 Messaging Gateway / API Server / ACP / Webhooks / Home Assistant
- `ui/src/app/pages/instance/Providers.tsx`
  - 将“提供商页”改为 Hermes 官方 provider / model 配置页
- `ui/src/app/pages/instance/Profiles.tsx`
  - 将“档案页”改为 Hermes 官方 `profile` 管理页
- `ui/src/app/pages/CreateInstance.tsx`
  - 对齐 Step 4 的 provider/profile 语义与 Step 5 摘要表达
- `ui/src/app/pages/Settings.tsx`
  - 将“设置页”精简为应用偏好 + Hermes 配置入口 + 诊断维护入口
- `docs/PAGE_SPEC.md`
  - 同步页面职责与字段归属
- `docs/PRODUCT_BASELINE_Hermes_Console_v1.md`
  - 同步对象模型、集成页定义和配置边界
- `docs/UI_RULES.md`
  - 同步集成页/设置页的表现约束

### Verify

- `ui/package.json`
  - 使用既有脚本 `npm run build` / `npm run desktop:dev`

### Validation Strategy

当前仓库没有前端自动化测试基建；本轮以 **编译通过 + 路由级人工验收** 作为验收门槛：

- 编译验证：`cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`
- 桌面开发态：`cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 关键验收路径：
  - `/instance/local-studio/integrations`
  - `/instance/local-studio/providers`
  - `/instance/local-studio/profiles`
  - `/create?type=local`
  - `/create?type=remote`
  - `/settings`

---

### Task 1: 建立官方体系共享数据源

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/hermesOfficial.ts`
- Verify: `/Volumes/gm7000/开发代码/HermesOS/ui/package.json`

- [ ] **Step 1: 新建共享类型定义**

写入以下类型骨架，统一页面使用的数据语义：

```ts
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

export interface HermesIntegrationEntry {
  id: string;
  name: string;
  group: "消息平台" | "程序化接入" | "扩展入口";
  mode: HermesIntegrationMode;
  status: HermesIntegrationStatus;
  health: HermesIntegrationHealth;
  authLabel: string;
  summary: string;
  detail: string;
  fields: Array<{
    label: string;
    value: string;
    secret?: boolean;
  }>;
}

export interface HermesProviderEntry {
  id: string;
  name: string;
  providerType: "OAuth" | "API Key" | "Custom Endpoint" | "Self-Hosted";
  status: "已连接" | "未完成" | "异常";
  authSummary: string;
  modelSummary: string;
  detail: string;
  fields: Array<{
    label: string;
    value: string;
    secret?: boolean;
  }>;
}

export interface HermesProfileEntry {
  id: string;
  name: string;
  isDefault: boolean;
  provider: string;
  model: string;
  sessions: number;
  lastUsed: string;
  gatewayStatus: "已连接" | "未启用" | "警告";
  description: string;
}

export interface HermesSettingsSummaryItem {
  label: string;
  value: string;
}
```

- [ ] **Step 2: 填充官方集成数据**

为“消息平台 / 程序化接入 / 扩展入口”写入一套共享 mock 数据，至少包含这些条目：

```ts
export const hermesIntegrations: HermesIntegrationEntry[] = [
  {
    id: "telegram",
    name: "Telegram",
    group: "消息平台",
    mode: "polling",
    status: "已启用",
    health: "活跃",
    authLabel: "Bot Token + Allowed Users",
    summary: "官方 gateway 平台，支持轮询与 webhook。",
    detail: "当前使用 long polling，允许 2 个用户 ID 访问。",
    fields: [
      { label: "TELEGRAM_BOT_TOKEN", value: "123456789:**************", secret: true },
      { label: "TELEGRAM_ALLOWED_USERS", value: "123456789,987654321" },
    ],
  },
  {
    id: "feishu",
    name: "Feishu / Lark",
    group: "消息平台",
    mode: "websocket",
    status: "未启用",
    health: "待配置",
    authLabel: "App ID + App Secret",
    summary: "官方 websocket / webhook 双模式平台。",
    detail: "尚未填写 FEISHU_APP_ID 与 FEISHU_APP_SECRET。",
    fields: [
      { label: "FEISHU_APP_ID", value: "" },
      { label: "FEISHU_APP_SECRET", value: "", secret: true },
      { label: "FEISHU_CONNECTION_MODE", value: "websocket" },
    ],
  },
  {
    id: "wecom-callback",
    name: "WeCom Callback",
    group: "消息平台",
    mode: "callback",
    status: "未启用",
    health: "待配置",
    authLabel: "Corp ID + Secret + Callback",
    summary: "企业微信自建应用回调模式。",
    detail: "需要可公网访问的 callback URL。",
    fields: [
      { label: "WECOM_CORP_ID", value: "" },
      { label: "WECOM_AGENT_ID", value: "" },
      { label: "WECOM_SECRET", value: "", secret: true },
      { label: "WECOM_CALLBACK_URL", value: "http://YOUR_PUBLIC_IP:8645/wecom/callback" },
    ],
  },
  {
    id: "api-server",
    name: "API Server",
    group: "程序化接入",
    mode: "local",
    status: "已启用",
    health: "活跃",
    authLabel: "API Key",
    summary: "OpenAI-compatible HTTP endpoint。",
    detail: "监听在 http://127.0.0.1:8642/v1。",
    fields: [
      { label: "API_SERVER_ENABLED", value: "true" },
      { label: "API_SERVER_KEY", value: "change-me-local-dev", secret: true },
    ],
  },
  {
    id: "acp",
    name: "ACP Editor Integration",
    group: "程序化接入",
    mode: "local",
    status: "未启用",
    health: "待配置",
    authLabel: "Editor Registry",
    summary: "VS Code / Zed / JetBrains 的 ACP 接入。",
    detail: "需要安装 ACP client 并指向 acp_registry。",
    fields: [
      { label: "启动命令", value: "hermes acp" },
      { label: "Registry", value: "acp_registry/agent.json" },
    ],
  },
  {
    id: "plugins",
    name: "Plugins",
    group: "扩展入口",
    mode: "proxy",
    status: "未启用",
    health: "待配置",
    authLabel: "plugins.enabled",
    summary: "Hermes plugins 为 opt-in，不再冒充集成。",
    detail: "通过 config.yaml 中 plugins.enabled 控制启用状态。",
    fields: [
      { label: "config 路径", value: "plugins.enabled" },
    ],
  },
];
```

- [ ] **Step 3: 填充 provider / profile / settings 共享数据**

继续在同一文件里补充 provider、profile 和设置摘要数据：

```ts
export const hermesProviders: HermesProviderEntry[] = [
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    providerType: "OAuth",
    status: "已连接",
    authSummary: "ChatGPT OAuth",
    modelSummary: "gpt-5.3-codex / gpt-5.4",
    detail: "通过 hermes model 配置，当前为默认 provider。",
    fields: [
      { label: "provider", value: "openai-codex" },
      { label: "default model", value: "gpt-5.3-codex" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    providerType: "OAuth",
    status: "已连接",
    authSummary: "Claude Code / API Key",
    modelSummary: "claude-sonnet-4",
    detail: "已完成官方 provider 配置。",
    fields: [
      { label: "provider", value: "anthropic" },
      { label: "default model", value: "claude-sonnet-4" },
    ],
  },
  {
    id: "custom-endpoint",
    name: "Custom Endpoint",
    providerType: "Custom Endpoint",
    status: "未完成",
    authSummary: "base_url + api_key",
    modelSummary: "待配置",
    detail: "仅在 custom/self-hosted 场景下展示 base_url。",
    fields: [
      { label: "provider", value: "custom" },
      { label: "base_url", value: "http://localhost:8000/v1" },
      { label: "api_key", value: "", secret: true },
    ],
  },
];

export const hermesProfiles: HermesProfileEntry[] = [
  {
    id: "default",
    name: "默认档案",
    isDefault: true,
    provider: "OpenAI Codex",
    model: "gpt-5.3-codex",
    sessions: 12,
    lastUsed: "10 分钟前",
    gatewayStatus: "已连接",
    description: "默认 Hermes profile，对应 ~/.hermes。",
  },
  {
    id: "incident-response",
    name: "生产排障档案",
    isDefault: false,
    provider: "Anthropic",
    model: "claude-sonnet-4",
    sessions: 8,
    lastUsed: "昨天 14:30",
    gatewayStatus: "警告",
    description: "隔离的排障 profile，单独持有 config、sessions 和 gateway 状态。",
  },
];

export const hermesSettingsSummary: HermesSettingsSummaryItem[] = [
  { label: "config.yaml", value: "~/.hermes/config.yaml" },
  { label: ".env", value: "~/.hermes/.env" },
  { label: "auth.json", value: "~/.hermes/auth.json" },
  { label: "HERMES_HOME", value: "~/.hermes" },
];
```

- [ ] **Step 4: 运行构建验证新数据模块**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Expected:

```text
vite building for production...
✓ built in
```

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add ui/src/app/data/hermesOfficial.ts
git commit -m "提取 Hermes 官方配置对齐的共享 mock 数据"
```

---

### Task 2: 按官方 gateway 体系重构集成页

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Integrations.tsx`
- Import from: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/hermesOfficial.ts`

- [ ] **Step 1: 删除当前 GitHub / Notion / Linear 分组，改用官方数据源**

将页头和数据来源改为导入 `hermesIntegrations`，并按 `group` 动态分组：

```ts
import { hermesIntegrations } from "../../data/hermesOfficial";

const groups = ["消息平台", "程序化接入", "扩展入口"].map((title) => ({
  title,
  items: hermesIntegrations.filter((item) => item.group === title),
}));
```

同时删除当前文件顶部的本地 `groups` 常量。

- [ ] **Step 2: 将卡片字段改成官方语义**

把卡片里的显示项从“summary + detail 的泛化 SaaS 卡片”改成：

```tsx
<div className="mt-5 flex flex-wrap gap-2">
  <Badge variant={item.status === "已启用" ? "success" : item.status === "异常" ? "error" : "outline"}>
    {item.status}
  </Badge>
  <Badge variant={item.health === "活跃" ? "success" : item.health === "待配置" ? "outline" : "warning"}>
    {item.health}
  </Badge>
</div>

<div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4 text-sm">
  <div className="flex items-center justify-between">
    <span className="text-zinc-500">接入方式</span>
    <span className="font-medium text-zinc-900">{item.authLabel}</span>
  </div>
  <div className="flex items-center justify-between">
    <span className="text-zinc-500">运行模式</span>
    <span className="font-medium text-zinc-900">{item.mode}</span>
  </div>
</div>
```

- [ ] **Step 3: 重写详情抽屉字段渲染**

详情抽屉不再使用统一“访问令牌 + Allowlist”模板，改为根据 `item.fields` 动态渲染：

```tsx
<section className="space-y-4">
  <div className="text-sm font-semibold text-zinc-950">配置项</div>
  <div className="space-y-3">
    {selected.fields.map((field) => (
      <div key={field.label}>
        <label className="mb-2 block text-sm font-medium text-zinc-900">{field.label}</label>
        <input
          className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
          defaultValue={field.value}
          type={field.secret ? "password" : "text"}
          placeholder={field.secret ? "输入或更新密钥" : ""}
        />
      </div>
    ))}
  </div>
</section>
```

保留：

- 测试连接
- 启用 / 停用
- 查看日志

但文案要对齐为平台 / gateway 语义。

- [ ] **Step 4: 跑构建并做路由验收**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Then verify:

```text
/instance/local-studio/integrations
```

Expected:

- 顶部分组出现“消息平台 / 程序化接入 / 扩展入口”
- 页面首屏出现 Telegram / Feishu / WeCom Callback / API Server / ACP
- 不再出现 GitHub / Notion / Linear
- 抽屉字段不再统一是“访问令牌 + Allowlist”

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add ui/src/app/pages/instance/Integrations.tsx ui/src/app/data/hermesOfficial.ts
git commit -m "按官方 gateway 体系重构集成页"
```

---

### Task 3: 按官方 provider 体系重构提供商页

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Providers.tsx`
- Import from: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/hermesOfficial.ts`

- [ ] **Step 1: 用共享 provider 数据替换本地 groups**

将当前本地 `groups` 常量替换为基于 `providerType` 的动态分组：

```ts
import { hermesProviders } from "../../data/hermesOfficial";

const groups = ["OAuth", "API Key", "Custom Endpoint", "Self-Hosted"].map((title) => ({
  title,
  items: hermesProviders.filter((item) => item.providerType === title),
})).filter((group) => group.items.length > 0);
```

- [ ] **Step 2: 改写卡片内容，去掉“所有 provider 都有 Endpoint”的暗示**

卡片显示项统一为：

```tsx
<div className="mt-5 grid grid-cols-1 gap-3 text-sm">
  <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
    <div className="text-xs text-zinc-400">认证方式</div>
    <div className="mt-1 font-medium text-zinc-900">{item.authSummary}</div>
  </div>
  <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
    <div className="text-xs text-zinc-400">模型摘要</div>
    <div className="mt-1 font-medium text-zinc-900">{item.modelSummary}</div>
  </div>
</div>
```

保留“管理”按钮，但去掉对所有 provider 一视同仁的表单暗示。

- [ ] **Step 3: 改写详情抽屉字段为动态表单**

把当前固定 `API 密钥 + Endpoint` 区改成：

```tsx
<section className="space-y-4">
  <div className="text-sm font-semibold text-zinc-950">配置摘要</div>
  <div className="space-y-3">
    {selected.fields.map((field) => (
      <div key={field.label}>
        <label className="mb-2 block text-sm font-medium text-zinc-900">{field.label}</label>
        <input
          className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
          defaultValue={field.value}
          type={field.secret ? "password" : "text"}
        />
      </div>
    ))}
  </div>
</section>
```

在状态区说明中明确：

```tsx
<div className="text-sm font-medium text-emerald-800">provider 与默认 model 已同步</div>
<div className="mt-1 text-xs leading-5 text-emerald-700">该页面只表达 Hermes 官方 provider/model 配置，不再承载额外的伪全局字段。</div>
```

- [ ] **Step 4: 跑构建并验收提供商路由**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Then verify:

```text
/instance/local-studio/providers
```

Expected:

- 看到 `OpenAI Codex / Anthropic / Custom Endpoint`
- Provider 页面不再暗示“每个 provider 都要填 API Key + Endpoint”
- 抽屉字段与 provider 类型一致

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add ui/src/app/pages/instance/Providers.tsx ui/src/app/data/hermesOfficial.ts
git commit -m "按官方 provider 体系重构提供商页"
```

---

### Task 4: 按官方 profile 语义重构档案页

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Profiles.tsx`
- Import from: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/hermesOfficial.ts`

- [ ] **Step 1: 用共享 profile 数据替换当前本地数组**

将顶部本地 `profiles` 常量替换为：

```ts
import { hermesProfiles } from "../../data/hermesOfficial";

const profiles = hermesProfiles;
```

并让 `selectedProfile` 回退到默认档案：

```ts
const selectedProfile =
  profiles.find((profile) => profile.id === selectedId) ??
  profiles.find((profile) => profile.isDefault) ??
  profiles[0];
```

- [ ] **Step 2: 收正卡片字段为 profile 语义**

把卡片字段改成：

```tsx
<div className="mt-5 grid grid-cols-2 gap-3 text-sm">
  <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
    <div className="text-xs text-zinc-400">提供商</div>
    <div className="mt-1 font-medium text-zinc-900">{profile.provider}</div>
  </div>
  <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
    <div className="text-xs text-zinc-400">模型</div>
    <div className="mt-1 font-medium text-zinc-900">{profile.model}</div>
  </div>
  <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
    <div className="text-xs text-zinc-400">会话数量</div>
    <div className="mt-1 font-medium text-zinc-900">{profile.sessions}</div>
  </div>
  <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
    <div className="text-xs text-zinc-400">Gateway 状态</div>
    <div className="mt-1 font-medium text-zinc-900">{profile.gatewayStatus}</div>
  </div>
</div>
```

- [ ] **Step 3: 精简详情抽屉，不再把 profile 做成大表单**

保留：

- 名称
- 描述
- 设为默认
- 导出
- 克隆
- 删除

移除当前抽屉里的这两大块：

- 已授权工具
- 环境变量

替换为 profile 摘要块：

```tsx
<section className="space-y-3">
  <div className="text-sm font-semibold text-zinc-950">Profile 摘要</div>
  <div className="grid grid-cols-1 gap-3 rounded-2xl border border-zinc-200/80 bg-[#faf9f6] p-4 text-sm">
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3">
      <span className="text-zinc-600">Provider</span>
      <span className="font-medium text-zinc-900">{selectedProfile.provider}</span>
    </div>
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3">
      <span className="text-zinc-600">Model</span>
      <span className="font-medium text-zinc-900">{selectedProfile.model}</span>
    </div>
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3">
      <span className="text-zinc-600">Gateway</span>
      <span className="font-medium text-zinc-900">{selectedProfile.gatewayStatus}</span>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 跑构建并验收档案页**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Then verify:

```text
/instance/local-studio/profiles
```

Expected:

- 页面能明显感知“档案 = Hermes profile”
- 抽屉不再充满环境变量和工具授权常驻区
- 默认档案与非默认档案状态更清晰

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add ui/src/app/pages/instance/Profiles.tsx ui/src/app/data/hermesOfficial.ts
git commit -m "按官方 profile 语义重构档案页"
```

---

### Task 5: 对齐创建实例 Step 4 的 provider / profile 语义

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/CreateInstance.tsx`
- Import from: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/hermesOfficial.ts`

- [ ] **Step 1: 让 Step 4 使用官方 provider 选项**

在共享数据中补一个 provider 下拉选项数组，然后在 `CreateInstance.tsx` 使用：

```ts
export const hermesProviderOptions = [
  { value: "openai-codex", label: "OpenAI Codex" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Custom Endpoint" },
];
```

在 `CreateInstance.tsx` 中替换当前固定 `<option>`：

```tsx
<select
  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
  value={provider}
  onChange={(event) => setProvider(event.target.value)}
>
  {hermesProviderOptions.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>
```

- [ ] **Step 2: 调整 Step 4 文案和辅助说明**

在 Step 4 标题下或卡片内新增一句轻量说明，明确：

```tsx
<div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] p-4 text-sm text-zinc-600">
  Provider 对应 Hermes 官方 model/provider 配置；默认档案会映射为创建后的 Hermes profile。
</div>
```

同时不要新增“通用 Endpoint”字段给所有 provider。

- [ ] **Step 3: 调整 Step 5 摘要与高级区**

把 Step 5 摘要中的 `网关状态` 改成更中性的表达：

```ts
{ label: "消息接入", value: "部署后在集成页配置" }
```

把高级配置里的 `网关监听端口` 改名为：

```tsx
<label className="mb-2 block text-sm font-medium text-zinc-900">服务监听端口</label>
```

这样避免把所有后续接入都错误归因到单个“网关端口”。

- [ ] **Step 4: 跑构建并验收本地/远程创建页**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Then verify:

```text
/create?type=local
/create?type=remote
```

Expected:

- Step 4 明确是“provider + 默认档案”语义
- provider 选项与官方体系一致
- 不再暗示每个 provider 都共享同一套高级字段

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add ui/src/app/pages/CreateInstance.tsx ui/src/app/data/hermesOfficial.ts
git commit -m "对齐创建实例的提供商与默认档案配置"
```

---

### Task 6: 精简设置页并补充 Hermes 配置入口

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/Settings.tsx`
- Import from: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/hermesOfficial.ts`

- [ ] **Step 1: 移除伪全局设置块**

从当前 `Settings.tsx` 删除这两个区域：

- `SSH 默认项`
- `日志与安装偏好`

删除后，不再保留：

- 默认用户名
- 默认端口
- 默认安装方式
- 日志保留周期

- [ ] **Step 2: 新增 Hermes 配置位置摘要卡**

使用 `hermesSettingsSummary` 渲染配置位置摘要：

```tsx
<Card className="p-6">
  <h2 className="text-base font-semibold text-zinc-950">Hermes 配置位置</h2>
  <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
    {hermesSettingsSummary.map((item) => (
      <div key={item.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
        <div className="text-xs text-zinc-400">{item.label}</div>
        <div className="mt-2 text-sm font-medium text-zinc-950">{item.value}</div>
      </div>
    ))}
  </div>
</Card>
```

- [ ] **Step 3: 新增诊断与维护入口卡**

添加一个新的操作卡，集中承载入口：

```tsx
<Card className="p-6">
  <h2 className="text-base font-semibold text-zinc-950">诊断与维护</h2>
  <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
    <Button variant="secondary" size="sm">打开 config.yaml</Button>
    <Button variant="secondary" size="sm">打开 .env</Button>
    <Button variant="secondary" size="sm">查看 gateway 状态</Button>
    <Button variant="secondary" size="sm">运行 doctor</Button>
  </div>
</Card>
```

保持“语言”和“主题”仍是页面顶部主内容。

- [ ] **Step 4: 跑构建并验收设置页**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Then verify:

```text
/settings
```

Expected:

- 页面只剩应用偏好、Hermes 配置摘要、维护入口
- 不再出现 SSH 默认项和安装偏好伪全局配置

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add ui/src/app/pages/Settings.tsx ui/src/app/data/hermesOfficial.ts
git commit -m "精简设置页并补充 Hermes 配置入口"
```

---

### Task 7: 同步官方体系对齐文档

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/docs/PAGE_SPEC.md`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/docs/PRODUCT_BASELINE_Hermes_Console_v1.md`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/docs/UI_RULES.md`

- [ ] **Step 1: 更新 PAGE_SPEC.md**

在以下章节同步新语义：

- `Step 4：提供商与档案`
- `6. 档案页`
- `7. 提供商页`
- `8. 集成页`
- `设置页`

关键更新方向：

```md
- 档案页明确映射 Hermes profile
- 提供商页明确映射 Hermes model/provider
- 集成页优先管理消息平台和程序化接入
- 设置页仅保留应用偏好、配置入口和维护入口
```

- [ ] **Step 2: 更新 PRODUCT_BASELINE_Hermes_Console_v1.md**

同步对象定义和页面职责：

```md
- Profile（档案）= 实例下的隔离 Hermes 运行环境
- Provider（提供商）= 官方 model/provider 配置对象
- Integration（集成）= gateway / API Server / ACP / Webhooks / Home Assistant 等外部接入
- Skills / Plugins 不再冒充集成页核心对象
```

- [ ] **Step 3: 更新 UI_RULES.md**

补充两条显式约束：

```md
- 集成页优先展示官方 gateway 平台与程序化接入，不做应用商店风格
- 设置页不承担实例级或部署级伪全局配置
```

- [ ] **Step 4: 跑最终构建验证**

Run:

```bash
cd /Volumes/gm7000/开发代码/HermesOS/ui
npm run build
```

Expected:

```text
✓ built in
```

- [ ] **Step 5: 提交本任务**

```bash
cd /Volumes/gm7000/开发代码/HermesOS
git add docs/PAGE_SPEC.md docs/PRODUCT_BASELINE_Hermes_Console_v1.md docs/UI_RULES.md
git commit -m "同步 Hermes 官方配置体系对齐文档"
```

---

## Final Verification Checklist

- [ ] `/instance/local-studio/integrations` 首屏优先出现官方 gateway / API Server / ACP
- [ ] `/instance/local-studio/providers` 不再把所有 provider 强制套成同一套字段
- [ ] `/instance/local-studio/profiles` 明确表现为 Hermes `profile`
- [ ] `/create?type=local` 与 `/create?type=remote` 的 Step 4 明确映射官方 provider/profile 语义
- [ ] `/settings` 不再承担 SSH/安装方式这类伪全局配置
- [ ] `npm run build` 通过
- [ ] Electron 开发态能正常启动并展示新页面

---

## Spec Coverage Check

本计划覆盖了 spec 中的全部核心要求：

- 集成页按官方 `gateway` 体系重构 → Task 1, 2
- 提供商页按官方 `provider/model` 体系重构 → Task 1, 3
- 档案页按官方 `profile` 语义重构 → Task 1, 4
- 创建实例 Step 4 对齐官方 provider/profile → Task 1, 5
- 设置页做减法并回到配置入口语义 → Task 1, 6
- 同步产品与页面文档 → Task 7

无 spec 漏项。
