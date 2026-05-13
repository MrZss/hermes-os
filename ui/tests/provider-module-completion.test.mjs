import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateService = fs.readFileSync(path.join(root, "desktop/services/hermes-official-state.mjs"), "utf8");
const actionsService = fs.readFileSync(path.join(root, "desktop/services/hermes-official-actions.mjs"), "utf8");
const clientActions = fs.readFileSync(path.join(root, "src/app/services/officialActions.ts"), "utf8");
const providersPage = fs.readFileSync(path.join(root, "src/app/pages/instance/Providers.tsx"), "utf8");
const officialData = fs.readFileSync(path.join(root, "src/app/data/hermesOfficial.ts"), "utf8");

assert.match(
  stateService,
  /models:\s*\[/,
  "Provider catalog should expose official/default model candidates so the UI is not a blind text box.",
);
assert.match(
  stateService,
  /function buildProviderModelOptions\(/,
  "Provider state builder should merge catalog model candidates with the currently configured model.",
);
assert.match(
  stateService,
  /const configuredProviderIds = new Set\(Object\.keys\(PROVIDER_CATALOG\)\)/,
  "Provider state should return the full official catalog instead of only selected/configured providers.",
);
assert.doesNotMatch(
  stateService,
  /if \(providerId === "custom"\) continue;/,
  "Custom Endpoint must be included in the full provider catalog.",
);

assert.match(
  actionsService,
  /function normalizeProviderId\(/,
  "Provider config save should normalize legacy/static provider ids before writing config.",
);
assert.match(
  actionsService,
  /PROVIDER_MODEL_REQUIRED/,
  "Provider config save should reject non-auto providers without a default model instead of persisting an unusable provider.",
);
assert.match(
  actionsService,
  /CUSTOM_ENDPOINT_REQUIRED/,
  "Custom Endpoint saves should require a base_url before selecting the custom provider.",
);

assert.match(
  providersPage,
  /list=\{modelOptions\.length > 0 \? `provider-models-\$\{selected\.id\}` : undefined\}/,
  "Provider drawer should offer model candidates via datalist while still allowing manual input.",
);
assert.match(
  providersPage,
  /先选一个模型，再继续登录或粘贴 Key。也可以直接手动输入。/,
  "Provider drawer should explain the model selection behavior.",
);
assert.match(
  providersPage,
  /点登录，Hermes 会帮你处理凭据。/,
  "OAuth providers should explain the managed login path without exposing low-level storage details first.",
);
assert.match(
  providersPage,
  /const canSaveProvider = /,
  "Provider drawer should compute save eligibility instead of allowing obviously incomplete saves.",
);
assert.match(
  providersPage,
  /disabled=\{!canSaveProvider\}/,
  "Provider save action should be disabled when required fields are incomplete.",
);

assert.doesNotMatch(
  officialData,
  /id:\s*"custom-endpoint"/,
  "Static fallback provider ids should use the same custom id as the backend config writer.",
);
assert.match(
  officialData,
  /id:\s*"openrouter"/,
  "Static fallback provider list should include API-key providers from the official catalog, not only OAuth examples.",
);

assert.match(
  providersPage,
  /当前 AI 接入/,
  "Provider page should lead with the active AI connection summary, not a raw global form.",
);
assert.match(
  providersPage,
  /供应商配置/,
  "Provider drawer should be provider-scoped instead of a duplicated global intake form.",
);
assert.match(
  providersPage,
  /提供商目录/,
  "Provider page should keep the product-required catalog/directory scanning surface.",
);
assert.match(
  providersPage,
  /sortedProviders/,
  "Configured providers should be sorted to the front and highlighted instead of duplicated in a top form.",
);
assert.match(
  providersPage,
  /凭据配置/,
  "Provider drawer should have an explicit credentials section for API keys or endpoint credentials.",
);
assert.match(
  providersPage,
  /默认模型（必填）/,
  "Provider drawer should separate model selection from credential configuration.",
);
assert.doesNotMatch(
  providersPage,
  /高级配置/,
  "Provider drawer should remove advanced metadata for the beginner-first onboarding flow.",
);
assert.match(
  providersPage,
  /认证方式/,
  "Provider drawer should keep OAuth/API Key selection inside the selected provider card flow.",
);
assert.match(
  providersPage,
  /OAuth 登录/,
  "Provider drawer should expose a real OAuth login action for providers that support OAuth.",
);
assert.match(
  providersPage,
  /authenticateInstanceProvider/,
  "OAuth login should call the desktop action instead of being a static explanation.",
);
assert.match(
  providersPage,
  /drawerFeedback/,
  "Provider drawer should render action feedback inside the drawer so OAuth errors are visible where the user clicked.",
);
assert.match(
  providersPage,
  /!drawerOpen/,
  "Provider page should avoid showing drawer-triggered feedback only behind the modal overlay.",
);
assert.match(
  clientActions,
  /请在 Hermes 桌面客户端中操作/,
  "Missing desktop action API errors should be localized and actionable instead of looking like a silent no-op.",
);
assert.doesNotMatch(
  clientActions,
  /Hermes official actions API is unavailable/,
  "Client action errors should not leak low-level English implementation text.",
);
assert.match(
  providersPage,
  /data-testid="provider-save-current"[\s\S]*?>[\s\S]*保存/,
  "Provider drawer should expose a beginner-friendly save action that explains the outcome.",
);
assert.match(
  providersPage,
  /selectedRequiresSecret/,
  "API Key providers should require an existing or newly entered credential before saving an unusable configuration.",
);
assert.match(
  providersPage,
  /handleOpenProviderDrawer/,
  "Provider cards should open the configuration drawer instead of pretending the list itself is the form.",
);
assert.doesNotMatch(
  providersPage,
  /handleOpenProviderDrawer\(currentProvider\.id\)/,
  "The current-provider summary must not duplicate the same configuration entry already available on provider cards.",
);
assert.doesNotMatch(
  providersPage,
  /groups\.map/,
  "The provider catalog should no longer group the outside page by OAuth/API Key; auth mode belongs inside each provider.",
);
assert.doesNotMatch(
  providersPage,
  /接入 AI 供应商/,
  "The rejected first-screen intake form should be removed.",
);
assert.doesNotMatch(
  providersPage,
  /provider-models-quick-/,
  "Model datalists should live in the drawer, not in a first-screen raw form.",
);
assert.match(
  providersPage,
  /选供应商 → 登录或粘贴 Key → 保存 → 测试/,
  "Provider page should lead with the shortest beginner path to a working AI connection.",
);
assert.match(
  providersPage,
  /visibleProviders/,
  "Provider page should filter internal provider choices before rendering the beginner catalog.",
);
assert.doesNotMatch(
  providersPage,
  /自动选择|自动检测|自动选择可留空/,
  "Provider page should not expose automatic provider/model choices as a visible configuration branch.",
);
assert.doesNotMatch(
  stateService,
  /自动选择|自动检测/,
  "Provider state should not label fallback auth/provider choices as user-facing automatic selection.",
);
assert.doesNotMatch(
  providersPage,
  /selected\.id !== "auto"/,
  "Provider save validation should no longer special-case a visible auto provider.",
);

assert.match(
  stateService,
  /authMethods/,
  "Provider state should expose provider-supported auth methods so the UI can choose OAuth/API Key inside the card.",
);
assert.match(
  actionsService,
  /export async function authenticateInstanceProvider/,
  "Desktop actions should implement a real provider OAuth login entry point.",
);
assert.match(
  actionsService,
  /\["auth", "add", providerId, "--type", "oauth"\]/,
  "OAuth login should invoke the official Hermes auth add provider --type oauth command.",
);

console.log("provider module completion assertions passed");
