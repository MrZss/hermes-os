import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const providers = read("src/app/pages/instance/Providers.tsx");
const rootLayout = read("src/app/layout/RootLayout.tsx");

const saveStart = providers.indexOf("async function handleSaveProvider() {");
const saveEnd = providers.indexOf("async function handleTestProvider(");
assert.ok(saveStart >= 0, "应能定位 handleSaveProvider。");
assert.ok(saveEnd > saveStart, "应能定位 handleTestProvider 作为保存逻辑结束边界。");
const saveBlock = providers.slice(saveStart, saveEnd);

assert.match(
  saveBlock,
  /const testResult = await testInstanceProvider\(instanceId,\s*\{[\s\S]*providerId: selected\.id/,
  "保存 provider 后必须自动调用真实 provider 测试。"
);

assert.match(
  saveBlock,
  /if \(testResult\.status === "failed"\)[\s\S]*setFeedback\(\{[\s\S]*tone: "error"/,
  "自动测试失败时应保留弹窗并给出错误反馈。"
);

assert.match(
  saveBlock,
  /if \(testResult\.status !== "failed"\)[\s\S]*setDrawerOpen\(false\)[\s\S]*setSelectedId\(null\)/,
  "自动测试通过或至少完成配置检查后应关闭供应商配置弹窗。"
);

assert.match(
  providers,
  /data-testid="provider-save-current"[\s\S]{0,260}保存并测试/,
  "保存按钮文案应明确提示会自动测试。"
);

assert.doesNotMatch(
  rootLayout,
  /label: "提供商"/,
  "实例工作区侧边栏不应再显示泛化的“提供商”tab。"
);

assert.match(
  rootLayout,
  /label: "AI 提供商"/,
  "实例工作区侧边栏应显示“AI 提供商”tab。"
);

assert.match(
  providers,
  /PageHeader[\s\S]{0,120}title="AI 提供商"/,
  "AI 供应商页面标题应改为 AI 提供商。"
);

console.log("provider save auto-test close assertions passed");
