import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrations = fs.readFileSync(path.join(root, "src/app/pages/instance/Integrations.tsx"), "utf8");

assert.match(
  integrations,
  /function buildWeixinQrStatusTitle\(status: WeixinQrState\["status"\]\)/,
  "微信二维码状态标题应通过共享 helper 收口，避免主路径文案散落在 JSX 条件分支里。",
);
assert.match(
  integrations,
  /function buildWeixinQrPrimaryActionLabel\(status: WeixinQrState\["status"\], hasQrCode: boolean\)/,
  "微信二维码主按钮文案应通过共享 helper 收口，覆盖生成中/重新开始等状态。",
);

for (const expected of [
  "请先生成微信二维码",
  "正在生成二维码…",
  "等待微信扫码",
  "已扫码，等待手机确认",
  "扫码成功，正在保存微信配置…",
  "已自动保存并重启消息平台。",
  "二维码已过期，请重新开始。",
  "二维码状态读取失败，请重新开始。",
]) {
  assert.match(
    integrations,
    new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `微信二维码主路径应覆盖状态文案：${expected}`,
  );
}

assert.match(
  integrations,
  /buildWeixinQrPrimaryActionLabel\(weixinQr\.status,\s*Boolean\(weixinQr\.qrcodeDataUrl \|\| selected\.status === "已启用"\)\)/,
  "微信二维码主按钮应根据当前二维码状态切换为生成中/重新开始等文案。",
);
assert.match(
  integrations,
  /if \(status === "saving"\) return "保存中\.\.\.";/,
  "微信二维码主按钮在保存中应明确显示保存中，避免仍像可重复生成。",
);
assert.match(
  integrations,
  /if \(status === "confirmed"\) return "重新生成二维码";/,
  "微信二维码完成后主按钮应回到重新生成二维码，允许用户重新开始新一轮扫码。",
);
assert.match(
  integrations,
  /selected\.status === "已启用"[\s\S]{0,80}return;/,
  "微信已绑定后打开详情不应自动生成新二维码，避免把已绑定状态误导成等待扫码。",
);
assert.match(
  integrations,
  /result\.message \|\| "已自动保存并重启消息平台。"/,
  "扫码确认后的成功反馈应回到“已自动保存并重启消息平台”这一结果文案。",
);

console.log("messaging weixin ux closure assertions passed");
