import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrations = fs.readFileSync(path.join(root, "src/app/pages/instance/Integrations.tsx"), "utf8");

assert.match(
  integrations,
  /const previousRequestId = weixinQr\.requestId;/,
  "重新获取微信二维码前应记录当前 requestId，避免旧二维码会话悬挂。",
);

assert.match(
  integrations,
  /if \(previousRequestId\) \{[\s\S]{0,220}cancelInstanceWeixinQrLogin\(instanceId,\s*\{ requestId: previousRequestId \}\)/,
  "重新获取微信二维码时应先 best-effort 取消旧二维码会话。",
);

assert.match(
  integrations,
  /previousRequestId \? "正在重新获取微信二维码…" : "正在生成微信二维码…"/,
  "用户点击刷新时应看到“正在重新获取微信二维码”的 loading 文案。",
);

assert.match(
  integrations,
  /data-testid="weixin-qr-refresh"/,
  "二维码面板内应提供显式的重新获取二维码按钮，避免用户只找顶部按钮。",
);

assert.match(
  integrations,
  /data-testid="weixin-qr-refresh"[\s\S]{0,260}disabled=\{weixinQr\.status === "generating" \|\| weixinQr\.status === "saving"\}/,
  "重新获取二维码按钮在生成中或保存中应禁用，避免重复请求。",
);

assert.match(
  integrations,
  /data-testid="weixin-qr-refresh"[\s\S]{0,420}重新获取二维码/,
  "刷新按钮文案应直接叫“重新获取二维码”。",
);

assert.match(
  integrations,
  /data-testid="weixin-qr-refresh"[\s\S]{0,360}handleStartWeixinQrLogin/,
  "刷新按钮应复用微信二维码生成流程。",
);

console.log("weixin QR refresh action assertions passed");
