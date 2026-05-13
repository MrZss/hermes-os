import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actionService = fs.readFileSync(path.join(root, "desktop/services/hermes-official-actions.mjs"), "utf8");
const mainProcess = fs.readFileSync(path.join(root, "desktop/main.mjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop/preload.mjs"), "utf8");
const frontendActions = fs.readFileSync(path.join(root, "src/app/services/officialActions.ts"), "utf8");
const integrations = fs.readFileSync(path.join(root, "src/app/pages/instance/Integrations.tsx"), "utf8");

for (const symbol of [
  "startInstanceWeixinQrLogin",
  "pollInstanceWeixinQrLogin",
  "cancelInstanceWeixinQrLogin",
]) {
  assert.match(actionService, new RegExp(`export async function ${symbol}`), `desktop action service should export ${symbol}.`);
  assert.match(mainProcess, new RegExp(`hermes:${symbol}`), `main process should expose ${symbol} IPC.`);
  assert.match(preload, new RegExp(`${symbol}:`), `preload should expose ${symbol} to renderer.`);
  assert.match(frontendActions, new RegExp(`function ${symbol}|async function ${symbol}`), `frontend action wrapper should expose ${symbol}.`);
}

for (const expected of [
  "get_bot_qrcode",
  "get_qrcode_status",
  "qrcode_img_content",
  "WEIXIN_ACCOUNT_ID",
  "WEIXIN_TOKEN",
  "WEIXIN_BASE_URL",
  "WEIXIN_DM_POLICY",
  "WEIXIN_GROUP_POLICY",
]) {
  assert.match(actionService, new RegExp(expected), `Weixin QR login service should handle ${expected}.`);
}


for (const guideCopy of [
  "微信 → 我 → 设置 → 插件",
  "微信 ClawBot",
  "看不到插件入口",
  "先更新微信或等待灰度开放",
]) {
  assert.match(integrations, new RegExp(guideCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Weixin QR drawer should guide users through ClawBot plugin prerequisite: ${guideCopy}.`);
}

assert.match(integrations, /QRCode\.toDataURL/, "Weixin QR drawer should render the returned QR URL as a scannable QR image.");
assert.match(integrations, /pollInstanceWeixinQrLogin/, "Weixin QR drawer should poll until scan confirmation and auto-save credentials.");
assert.match(integrations, /扫码成功，正在保存/, "Weixin QR drawer should show a saving state after phone confirmation.");
assert.match(integrations, /已自动保存并重启消息平台/, "Weixin QR drawer should confirm auto-save and gateway restart.");

console.log("weixin QR login flow assertions passed");
