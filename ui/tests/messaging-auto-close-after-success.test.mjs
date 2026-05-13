import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrations = fs.readFileSync(path.join(root, "src/app/pages/instance/Integrations.tsx"), "utf8");

const saveStart = integrations.indexOf("async function handleSaveIntegration() {");
const qrStart = integrations.indexOf("async function handleStartWeixinQrLogin() {");
const approveStart = integrations.indexOf("async function handleApprovePairing() {");
const closeStart = integrations.indexOf("function handleCloseDrawer() {");
assert.ok(saveStart >= 0 && qrStart > saveStart, "应能定位普通消息平台保存逻辑。");
assert.ok(approveStart >= 0 && closeStart > approveStart, "应能定位配对审批逻辑。");

const saveBlock = integrations.slice(saveStart, qrStart);
const pollConfirmedBlock = integrations.match(/if \(result\.status === "confirmed"\) \{[\s\S]*?\n\s*if \(result\.status === "expired"\)/)?.[0] ?? "";
const approveBlock = integrations.slice(approveStart, closeStart);
const approveSuccessBlock = approveBlock.match(/try \{[\s\S]*?\n\s*\} catch \(pairingError\)/)?.[0] ?? "";
const approveErrorBlock = approveBlock.match(/catch \(pairingError\) \{[\s\S]*?\n\s*\} finally/)?.[0] ?? "";

assert.match(
  saveBlock,
  /setSelectedId\(null\);[\s\S]{0,180}await loadIntegrations\(selectedProfileId, null\);/,
  "Telegram/QQ/飞书保存成功后应关闭详情弹窗，并以目录态回读状态。",
);

assert.match(
  pollConfirmedBlock,
  /setSelectedId\(null\);/,
  "微信扫码确认并自动保存后应关闭详情弹窗。",
);
assert.match(
  pollConfirmedBlock,
  /await loadIntegrations\(selectedProfileId, null\);/,
  "微信扫码确认后如需回读状态，也应以目录态回读，避免重新打开微信弹窗。",
);
assert.doesNotMatch(
  pollConfirmedBlock,
  /setSelectedId\("weixin"\)|loadIntegrations\(selectedProfileId, "weixin"\)/,
  "微信扫码保存成功后不应重新选中 weixin，否则弹窗会再次打开。",
);

assert.match(
  approveSuccessBlock,
  /setFeedback\(\{[\s\S]*?tone: "success"/,
  "配对审批成功后应把结果展示到页面级反馈，因为弹窗会关闭。",
);
assert.match(
  approveSuccessBlock,
  /setSelectedId\(null\);/,
  "配对审批成功后应关闭详情弹窗。",
);
assert.match(
  approveSuccessBlock,
  /loadIntegrations\(selectedProfileId, null\)/,
  "配对审批成功后的状态回读不应保留当前弹窗选中项。",
);
assert.match(
  approveErrorBlock,
  /setPairingFeedback\(/,
  "配对审批失败仍应在配对码输入框下方显示错误。",
);
assert.doesNotMatch(
  approveErrorBlock,
  /setFeedback\(/,
  "配对审批失败不能写入页面级反馈，否则错误位置会离输入框太远。",
);

console.log("messaging auto-close after success assertions passed");
