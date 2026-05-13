import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrations = fs.readFileSync(path.join(root, "src/app/pages/instance/Integrations.tsx"), "utf8");
const stateService = fs.readFileSync(path.join(root, "desktop/services/hermes-official-state.mjs"), "utf8");
const actionService = fs.readFileSync(path.join(root, "desktop/services/hermes-official-actions.mjs"), "utf8");
const fallbackData = fs.readFileSync(path.join(root, "src/app/data/hermesOfficial.ts"), "utf8");
const updateIntegrationAction = actionService.match(
  /export async function updateInstanceIntegrationConfig[\s\S]*?export async function startInstanceGateway/
)?.[0] ?? "";
const stateIntegrationCatalog = stateService.match(/const INTEGRATION_CATALOG = \[[\s\S]*?\];/)?.[0] ?? "";

const nativeMessagingIds = [
  "telegram",
  "feishu",
  "weixin",
  "qq",
];

const nonMessagingIds = [
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "sms",
  "email",
  "mattermost",
  "matrix",
  "dingtalk",
  "wecom",
  "wecom-callback",
  "bluebubbles",
  "api-server",
  "acp",
  "plugins",
  "webhooks",
  "home-assistant",
];

assert.doesNotMatch(
  integrations,
  /启动网关|重启网关|停止网关/,
  "Integration detail drawer should not expose gateway lifecycle controls; those belong to instance/workbench maintenance, not integration configuration.",
);
assert.doesNotMatch(
  integrations,
  /\bhandleGatewayAction\b|\bgatewayAction\b|\bstartInstanceGateway\b|\bstopInstanceGateway\b/,
  "Integration page should not own gateway lifecycle actions after configuration boundary cleanup.",
);
assert.match(
  integrations,
  /保存配置/,
  "Integration detail drawer should keep the primary save action.",
);
assert.match(
  integrations,
  /保存后会写入当前 profile/,
  "Integration detail drawer should continue explaining that it writes configuration to the selected profile.",
);
assert.match(
  integrations,
  /await loadIntegrations\(selectedProfileId,\s*null\);/,
  "Saving an integration should refresh state without preserving selectedId so the configuration drawer closes after success.",
);
assert.match(
  integrations,
  /restartInstanceGateway\(instanceId\)/,
  "Saving an integration should automatically restart the message gateway so Telegram loads the freshly saved .env without a manual settings-page restart.",
);
assert.match(
  integrations,
  /保存并重启中/,
  "Integration save action should show a loading label for the combined save-and-restart background work.",
);
assert.doesNotMatch(
  integrations,
  /回到工作区执行对应档案.*运行操作/,
  "Integration detail should not tell users to manually run/restart the message platform after save now that the client restarts it automatically.",
);
assert.match(
  integrations,
  /\/sethome/,
  "Telegram integration UX should explain the runtime /sethome step for the first chat home-channel setup.",
);
assert.match(
  integrations,
  /No home channel is set|主页频道|home channel/,
  "Telegram integration UX should map the bot's home-channel warning to a clear next action in the desktop client.",
);
assert.match(
  integrations,
  /QQ Bot 开放平台的网络\/代理/,
  "QQ integration UX should tell users to check remote network/proxy when the bot never returns a pairing code.",
);
assert.match(
  integrations,
  /飞书开放平台[\s\S]{0,80}网络\/代理/,
  "Feishu integration UX should tell users to check remote network/proxy when the platform is unreachable.",
);
assert.match(
  integrations,
  /微信 iLink 服务[\s\S]{0,80}网络或代理/,
  "Weixin integration UX should tell users to check remote network/proxy when QR or messaging is unreachable.",
);
for (const officialUrl of [
  "https://t.me/BotFather",
  "https://hermes-agent.lzw.me/docs/user-guide/messaging/weixin",
  "https://q.qq.com/qqbot/openclaw/",
  "https://open.feishu.cn/app",
]) {
  assert.match(
    integrations,
    new RegExp(officialUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Integration guide should expose official credential URL ${officialUrl}.`,
  );
}
for (const guideCopy of [
  "获取凭据",
  "凭据入口",
  "打开官方入口",
  "只保存到当前 profile",
]) {
  assert.match(
    integrations,
    new RegExp(guideCopy),
    `Integration detail should keep concise beginner-friendly guide copy: ${guideCopy}.`,
  );
}
assert.match(
  integrations,
  /<div className="space-y-4">/,
  "Integration detail drawer should use compact vertical spacing so the core controls fit on one screen.",
);
assert.doesNotMatch(
  integrations,
  /<div className="space-y-7">|配置摘要|接入状态|获取凭据指引|在哪里获取、填入字段和保存后的下一步。|获取步骤/,
  "Integration detail should remove verbose section titles and multi-step explanations that push controls below the fold.",
);
assert.doesNotMatch(
  integrations,
  /如果微信扫码或消息完全没有响应，并且接入状态提示连接超时，说明远程服务器运行服务无法访问微信 iLink 服务。|二维码确认后会自动写入凭据，不需要手动复制任何字段。/,
  "Weixin detail should replace long explanatory paragraphs with short actionable hints.",
);
assert.match(
  integrations,
  /扫码前：微信最新版，并开启「微信 ClawBot」插件。/,
  "Weixin QR detail should keep the ClawBot plugin prerequisite as a single concise line.",
);
assert.match(
  integrations,
  /收到 pairing code → 粘贴配对码 → 批准配对。/,
  "Pairing guide should be a short action chain instead of multiple explanatory paragraphs.",
);
assert.match(
  integrations,
  /shouldShowWeixinQrPanel[\s\S]{0,180}weixinQr\.status !== "idle"[\s\S]{0,180}Boolean\(weixinQr\.qrcodeDataUrl\)/,
  "Configured Weixin detail should not show the large empty QR placeholder unless a QR flow is active.",
);
assert.doesNotMatch(
  integrations,
  /h-\[244px\] w-\[244px\]|等待生成二维码/,
  "Integration detail should avoid the old large empty QR placeholder to keep the drawer within one screen.",
);
for (const fieldCopy of [
  "BotFather",
  "Hermes 微信扫码向导",
  "iLink Bot API",
  "hermes gateway setup",
  "QQ 机器人开放平台",
  "飞书开发者后台",
  "App ID",
  "App Secret",
]) {
  assert.match(
    integrations,
    new RegExp(fieldCopy),
    `Integration guide should explain where to obtain ${fieldCopy}.`,
  );
}

assert.doesNotMatch(
  integrations,
  /https:\/\/mp\.weixin\.qq\.com\//,
  "Weixin guide must not point users to WeChat Official Account platform; Hermes personal Weixin uses iLink QR login instead.",
);
assert.match(
  integrations,
  /https:\/\/q\.qq\.com\/qqbot\/openclaw\//,
  "QQ Bot guide should use the OpenClaw-specific QQ bot credential entry provided by the platform.",
);
assert.match(
  integrations,
  /hermes pairing approve qqbot/,
  "QQ Bot integration UX should explain the first-message pairing approval command shown by Hermes.",
);
assert.match(
  integrations,
  /I don't recognize you yet|pairing code|首次授权|配对码/,
  "QQ Bot integration UX should map the unrecognized-user pairing prompt to a clear desktop-side action.",
);
assert.match(
  integrations,
  /微信扫码配置|生成微信二维码|扫码后自动保存/,
  "Weixin integration should prioritize a direct QR-code setup flow instead of manual credential copy.",
);
assert.match(
  integrations,
  /selected\.id === "weixin"[\s\S]{0,700}生成微信二维码/,
  "Weixin detail drawer should show a dedicated QR setup action when Weixin is selected.",
);
assert.doesNotMatch(
  integrations,
  /微信手机端扫描终端二维码|扫码登录完成后，把生成的 WEIXIN_ACCOUNT_ID/,
  "Weixin guide should remove terminal/manual-field instructions now that the desktop client opens the QR setup flow directly.",
);

assert.doesNotMatch(
  integrations,
  /await loadIntegrations\(selectedProfileId,\s*selected\.id\);/,
  "Saving an integration should not re-select the same integration because that reopens the drawer after a successful save.",
);
assert.match(
  integrations,
  /const isConfigured = item\.status === "已启用";/,
  "Integration cards should derive an explicit configured state from the saved platform status.",
);
assert.match(
  integrations,
  /isConfigured[\s\S]{0,220}(border-emerald|ring-emerald|bg-emerald)/,
  "Configured integration cards should be visually highlighted so users can see the selected platform is active.",
);
assert.match(
  updateIntegrationAction,
  /writeProfileEnvEntries\(instanceResult\.data\.instance,\s*profileId,\s*envEntries\)/,
  "Saving messaging integrations should write required platform fields to the selected profile .env so status refresh can become enabled.",
);

for (const id of nativeMessagingIds) {
  assert.match(
    stateService,
    new RegExp(`id:\\s*"${id}"`),
    `Official integration catalog should include native messaging platform ${id}.`,
  );
  assert.match(
    fallbackData,
    new RegExp(`id:\\s*"${id}"`),
    `Fallback integration data should include native messaging platform ${id}.`,
  );
}

for (const id of nonMessagingIds) {
  assert.doesNotMatch(
    stateService,
    new RegExp(`id:\\s*"${id}"`),
    `Integration catalog should remove non-messaging integration ${id}.`,
  );
  assert.doesNotMatch(
    fallbackData,
    new RegExp(`id:\\s*"${id}"`),
    `Fallback integration data should remove non-messaging integration ${id}.`,
  );
}

assert.match(
  integrations,
  /原生消息平台/,
  "Integration page should explain that it only manages Hermes native messaging platforms.",
);
assert.match(
  integrations,
  /傻瓜式配置/,
  "Integration page should communicate a beginner-friendly configuration mode.",
);
assert.match(
  integrations,
  /simpleFields/,
  "Integration drawer should render the required-only form through simple fields.",
);
assert.doesNotMatch(
  integrations,
  /advancedFields|showAdvancedFields|显示高级配置|收起高级配置|高级/,
  "Integration drawer should not expose advanced configuration after the required-only cleanup.",
);
assert.doesNotMatch(
  fallbackData,
  /advanced\?: boolean|advanced:\s*true/,
  "Fallback config field metadata should not carry optional advanced fields.",
);
assert.match(
  stateService,
  /TELEGRAM_ALLOWED_USERS[\s\S]{0,140}required:\s*true/,
  "Telegram user ID allow-list should be visible as a required simple field next to the bot token.",
);
assert.match(
  fallbackData,
  /TELEGRAM_ALLOWED_USERS[\s\S]{0,140}required:\s*true/,
  "Fallback Telegram user ID allow-list should also be required.",
);
assert.match(
  stateService,
  /function hasRequiredIntegrationEnv/,
  "Integration status should be based on required fields, not just any optional env var.",
);
assert.match(
  fallbackData,
  /微信 \/ Weixin/,
  "The reduced catalog should label the Weixin platform in Chinese for users.",
);

for (const optionalField of [
  "TELEGRAM_HOME_CHANNEL",
  "TELEGRAM_WEBHOOK_URL",
  "TELEGRAM_PROXY",
  "WEIXIN_BASE_URL",
  "WEIXIN_DM_POLICY",
  "WEIXIN_GROUP_POLICY",
  "WEIXIN_ALLOWED_USERS",
  "WEIXIN_GROUP_ALLOWED_USERS",
  "QQ_ALLOWED_USERS",
  "QQ_GROUP_ALLOWED_USERS",
  "QQBOT_HOME_CHANNEL",
  "QQ_SANDBOX",
  "FEISHU_DOMAIN",
  "FEISHU_CONNECTION_MODE",
  "FEISHU_ALLOWED_USERS",
  "FEISHU_HOME_CHANNEL",
]) {
  assert.doesNotMatch(
    stateIntegrationCatalog,
    new RegExp(optionalField),
    `Official integration catalog should keep only required field and remove ${optionalField}.`,
  );
  assert.doesNotMatch(
    fallbackData,
    new RegExp(optionalField),
    `Fallback integration data should keep only required field and remove ${optionalField}.`,
  );
}
assert.doesNotMatch(
  integrations,
  /API Server|ACP|Plugins|Webhooks|Home Assistant/,
  "Integration UI should not present programmatic access or extension entries after the message-platform scope cleanup.",
);

console.log("integration detail action boundary assertions passed");
