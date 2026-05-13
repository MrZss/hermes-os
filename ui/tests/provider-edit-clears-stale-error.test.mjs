import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providers = fs.readFileSync(path.join(root, "src/app/pages/instance/Providers.tsx"), "utf8");

const helperStart = providers.indexOf("function clearProviderEditFeedback(");
assert.ok(helperStart >= 0, "AI 供应商表单应提供统一的编辑清错 helper。");
const helperEnd = providers.indexOf("async function handleAuthenticateProvider()", helperStart);
assert.ok(helperEnd > helperStart, "清错 helper 应定义在供应商操作逻辑附近。");
const helperBlock = providers.slice(helperStart, helperEnd);

assert.match(
  helperBlock,
  /setFeedback\(null\)/,
  "重新编辑供应商字段时应先清空旧的弹窗错误提示。"
);

assert.match(
  helperBlock,
  /setProviderTests\(\(current\) => \{/,
  "重新编辑供应商字段时应同步处理旧测试结果，避免失败卡片继续误导用户。"
);

assert.match(
  helperBlock,
  /currentTest\?\.status !== "failed"/,
  "只应清掉旧的失败测试结果，已通过的状态不应被编辑动作误清。"
);

assert.match(
  helperBlock,
  /delete next\[providerId\]/,
  "旧失败测试结果应按当前 provider 删除。"
);

const requiredInputs = [
  { token: 'data-testid="provider-model-input"', label: "默认模型" },
  { token: 'data-testid="provider-base-url-input"', label: "服务地址" },
  { token: 'data-testid="provider-endpoint-api-key-input"', label: "Endpoint API Key" },
  { token: 'data-testid={`provider-env-${field.key}`}', label: "API Key / 环境字段" },
];

for (const { token, label } of requiredInputs) {
  const inputStart = providers.indexOf(token);
  assert.ok(inputStart >= 0, `应能定位 ${label} 输入框。`);
  const inputBlock = providers.slice(inputStart, inputStart + 900);

  assert.match(
    inputBlock,
    /onChange=\{\(event\) => \{[\s\S]*clearProviderEditFeedback\(selected\?\.id \?\? null\)[\s\S]*setFormState/,
    `${label} 重新填写时应先清掉旧错误，再更新表单。`
  );
}

const authMethodBlockStart = providers.indexOf("setSelectedAuthMethod(method.id);");
assert.ok(authMethodBlockStart >= 0, "应能定位认证方式切换逻辑。");
const authMethodBlock = providers.slice(authMethodBlockStart, authMethodBlockStart + 220);
assert.match(
  authMethodBlock,
  /setSelectedAuthMethod\(method\.id\);[\s\S]*clearProviderEditFeedback\(selected\?\.id \?\? null\)/,
  "切换认证方式也应清掉旧错误，避免用户看到上一种方式的失败提示。"
);

const saveStart = providers.indexOf("async function handleSaveProvider() {");
const saveEnd = providers.indexOf("async function handleTestProvider(", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "应能定位保存并测试逻辑。");
const saveBlock = providers.slice(saveStart, saveEnd);
assert.match(
  saveBlock,
  /setSaving\(true\);[\s\S]{0,140}clearProviderEditFeedback\(selected\.id\)/,
  "点击保存并测试时也应先清掉旧失败提示，再展示新的测试结果。"
);

const testStart = providers.indexOf("async function handleTestProvider(");
const testEnd = providers.indexOf("return (", testStart);
assert.ok(testStart >= 0 && testEnd > testStart, "应能定位单独测试逻辑。");
const testBlock = providers.slice(testStart, testEnd);
assert.match(
  testBlock,
  /setTestingId\(targetProvider\.id\);[\s\S]{0,140}clearProviderEditFeedback\(targetProvider\.id\)/,
  "点击单独测试时也应先清掉旧失败提示，再展示新的测试结果。"
);

console.log("provider edit clears stale error assertions passed");
