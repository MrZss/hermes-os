import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actionService = fs.readFileSync(path.join(root, "desktop/services/hermes-official-actions.mjs"), "utf8");
const mainProcess = fs.readFileSync(path.join(root, "desktop/main.mjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop/preload.mjs"), "utf8");
const frontendActions = fs.readFileSync(path.join(root, "src/app/services/officialActions.ts"), "utf8");
const desktopTypes = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");
const integrations = fs.readFileSync(path.join(root, "src/app/pages/instance/Integrations.tsx"), "utf8");

for (const fileText of [actionService, mainProcess, preload, frontendActions, desktopTypes]) {
  assert.match(
    fileText,
    /approveInstanceMessagingPairing/,
    "客户端主进程、preload、前端 wrapper 和类型声明都必须暴露消息平台配对审批能力。",
  );
}

assert.match(
  actionService,
  /\["pairing",\s*"approve",\s*platformId,\s*pairingCode\]/,
  "配对审批必须调用 Hermes 官方 CLI：hermes pairing approve <platform> <code>。",
);
assert.match(
  actionService,
  /not found or expired|PAIRING_CODE_EXPIRED/i,
  "Hermes CLI 在配对码过期时可能 exit 0，客户端必须解析输出并显示失败。",
);
assert.match(
  integrations,
  /hermes pairing approve weixin/,
  "微信详情页必须解释截图中的 weixin pairing approve 命令含义。",
);
assert.match(
  integrations,
  /不用打开终端|粘贴配对码|批准配对/,
  "微信/QQ 首次授权必须走客户端傻瓜式输入框，而不是继续让用户手动打开终端。",
);
assert.match(
  integrations,
  /绑定成功[\s\S]{0,180}下一步[\s\S]{0,180}首次授权/,
  "微信扫码保存后需要明确反馈绑定成功，并告诉用户下一步处理首次授权。",
);
assert.match(
  integrations,
  /正在批准|批准中/,
  "配对审批属于后台任务，按钮必须有 loading 文案。",
);
assert.match(
  integrations,
  /const \[pairingFeedback,\s*setPairingFeedback\]/,
  "配对码错误必须使用局部 pairingFeedback 状态，不能继续占用页面顶部全局反馈。",
);
assert.match(
  integrations,
  /PAIRING CODE[\s\S]{0,900}pairingFeedback\?\.message/,
  "配对码错误提示必须渲染在 pairing code 输入框下面。",
);
assert.doesNotMatch(
  integrations,
  /catch \(pairingError\) \{[\s\S]{0,220}setFeedback\(/,
  "配对码审批失败不能再写入页面顶部全局反馈。",
);
assert.doesNotMatch(
  integrations,
  /如果提示配对码无效或已过期，请在消息平台里重新发送一条消息，复制最新 pairing code 后再批准。/,
  "配对输入框默认说明需要更短，错误发生后再在输入框下方显示具体原因。",
);

console.log("messaging pairing approval assertions passed");
