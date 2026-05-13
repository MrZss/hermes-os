import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrationsPath = path.join(root, "src/app/pages/instance/Integrations.tsx");
const integrations = fs.readFileSync(integrationsPath, "utf8");

const requiredFieldsSource = integrations.match(/const integrationRequiredFields = \{[\s\S]*?\} as const;/)?.[0];
const missingFieldsSource = integrations.match(/function getMissingIntegrationFieldLabels\(integration: HermesIntegrationEntry, formState: IntegrationFormState\) \{[\s\S]*?\n\}/)?.[0];
const prerequisiteSource = integrations.match(/function getIntegrationPrerequisiteMessage\(integrationId: string, missingFields: string\[\]\) \{[\s\S]*?\n\}/)?.[0];

assert.ok(requiredFieldsSource, "应能从 Integrations.tsx 提取 integrationRequiredFields。");
assert.ok(missingFieldsSource, "应能从 Integrations.tsx 提取 getMissingIntegrationFieldLabels。");
assert.ok(prerequisiteSource, "应能从 Integrations.tsx 提取 getIntegrationPrerequisiteMessage。");

const compiledModule = transformSync(
  `
${requiredFieldsSource}
${missingFieldsSource}
${prerequisiteSource}
export { getMissingIntegrationFieldLabels, getIntegrationPrerequisiteMessage };
`,
  {
    loader: "ts",
    format: "esm",
    target: "es2022",
  },
).code;
const compiledPath = path.join(root, "tests", `.__messaging-beginner-guards-${Date.now()}.mjs`);
fs.writeFileSync(compiledPath, compiledModule, "utf8");

const { getMissingIntegrationFieldLabels, getIntegrationPrerequisiteMessage } = await import(
  `${pathToFileUrl(compiledPath)}?t=${Date.now()}`
);

assert.match(
  integrations,
  /const integrationRequiredFields = \{[\s\S]*telegram:[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_ALLOWED_USERS[\s\S]*qq:[\s\S]*QQ_APP_ID[\s\S]*QQ_CLIENT_SECRET[\s\S]*feishu:[\s\S]*FEISHU_APP_ID[\s\S]*FEISHU_APP_SECRET[\s\S]*\};/,
  "应该把 Telegram / QQ / 飞书的最小必填项集中声明，避免按钮校验各写各的。",
);

const telegramIntegration = {
  id: "telegram",
  fields: [
    {
      key: "TELEGRAM_BOT_TOKEN",
      label: "Bot Token",
      required: true,
      readOnly: false,
      kind: "password",
      secret: true,
      value: "",
    },
    {
      key: "TELEGRAM_ALLOWED_USERS",
      label: "用户 ID",
      required: true,
      readOnly: false,
      kind: "text",
      secret: false,
      value: "",
    },
  ],
};
assert.deepEqual(
  getMissingIntegrationFieldLabels(telegramIntegration, {
    fields: {
      TELEGRAM_BOT_TOKEN: "fresh-bot-token",
      TELEGRAM_ALLOWED_USERS: "",
    },
  }),
  ["用户 ID"],
  "首次输入 Bot Token 后，不应再把 secret 字段继续判定为缺失。",
);
assert.deepEqual(
  getMissingIntegrationFieldLabels(
    {
      ...telegramIntegration,
      fields: [
        { ...telegramIntegration.fields[0], value: "persisted-token" },
        telegramIntegration.fields[1],
      ],
    },
    {
      fields: {
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_ALLOWED_USERS: "1000000001",
      },
    },
  ),
  [],
  "已有 secret 值时，留空应表示沿用旧值，而不是再次判定缺失。",
);

assert.equal(getIntegrationPrerequisiteMessage("telegram", ["Bot Token"]), "先填 Bot Token，再保存。");
assert.equal(getIntegrationPrerequisiteMessage("weixin", []), "先完成扫码，再继续保存。");
assert.equal(getIntegrationPrerequisiteMessage("telegram", []), "保存没成功，请再试一次。");

assert.match(
  integrations,
  /function getIntegrationPrerequisiteMessage\(integrationId: string, missingFields: string\[\]\) \{[\s\S]*integrationId === "weixin"[\s\S]*先完成扫码，再继续保存。[\s\S]*missingFields\.length === 0[\s\S]*保存没成功，请再试一次。[\s\S]*先填 \$\{missingFields\[0\]\}，再保存。/,
  "保存前应该统一输出傻瓜式前置校验文案，并覆盖微信扫码和保存失败兜底文案。",
);

assert.match(
  integrations,
  /const canSaveIntegration = !saving && missingFields\.length === 0;/,
  "保存按钮应依赖前置校验结果，不满足必填项时不能继续。",
);

assert.match(
  integrations,
  /if \(selected\.id === "weixin"\) \{[\s\S]*getIntegrationPrerequisiteMessage\("weixin", \[\]\)/,
  "微信应明确把扫码作为主路径，而不是继续走手工保存路径。",
);

assert.match(
  integrations,
  /if \(missingFields\.length > 0\) \{[\s\S]*message: getIntegrationPrerequisiteMessage\(selected\.id, missingFields\)/,
  "保存动作在缺少必填项时应直接拦截，并复用统一的人话化提示 helper。",
);

assert.match(
  integrations,
  /保存没成功，请再试一次。/,
  "保存失败兜底文案应统一为更直白的重试提示。",
);

assert.match(
  integrations,
  /微信二维码是主路径[\s\S]*不需要先手动填 token/,
  "微信二维码流程应明确把扫码作为主路径，而不是把手工 token 当默认入口。",
);

console.log("messaging beginner guards assertions passed");

fs.unlinkSync(compiledPath);

function pathToFileUrl(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  return `file://${resolved.startsWith("/") ? resolved : `/${resolved}`}`;
}
