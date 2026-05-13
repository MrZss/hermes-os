import assert from "node:assert/strict";
import { detectIntegrationRuntimeIssue } from "../desktop/services/hermes-official-state.mjs";

const timeoutLog = `
WARNING gateway.platforms.telegram_network: [Telegram] Primary api.telegram.org connection failed (); trying fallback IPs 149.154.167.220
WARNING gateway.platforms.telegram_network: [Telegram] Fallback IP 149.154.167.220 failed:
ERROR gateway.run: ✗ telegram error: telegram connect timed out after 30s
ERROR gateway.run: Gateway failed to connect any configured messaging platform: telegram: telegram connect timed out after 30s
`;

const issue = detectIntegrationRuntimeIssue("telegram", timeoutLog);
assert.ok(issue, "Telegram Bot API 连通性失败必须从 gateway.log 中被识别出来。",);
assert.equal(issue.status, "异常", "Telegram 连接超时不能继续显示为活跃。",);
assert.equal(issue.health, "未同步", "Telegram 连接超时应显示为未同步，提示用户不是配置生效。",);
assert.match(issue.detail, /api\.telegram\.org|Telegram API|远程节点运行服务/, "错误详情必须明确是远程节点运行服务访问 Telegram API 失败。",);
assert.match(issue.detail, /TELEGRAM_PROXY|代理/, "错误详情必须给出 Hermes 官方支持的 TELEGRAM_PROXY 处理方向。",);

assert.equal(detectIntegrationRuntimeIssue("telegram", "INFO gateway.run: Telegram connected"), null, "正常日志不能误报异常。",);
assert.equal(detectIntegrationRuntimeIssue("qq", timeoutLog), null, "Telegram 日志不能污染其他消息平台。",);

const qqTimeoutLog = `
ERROR gateway.run: ✗ qqbot error: ConnectTimeout: HTTPSConnectionPool(host='q.qq.com', port=443): timed out
ERROR gateway.run: Gateway failed to connect any configured messaging platform: qqbot: connection timed out
`;
const qqIssue = detectIntegrationRuntimeIssue("qq", qqTimeoutLog);
assert.ok(qqIssue, "QQ Bot 网络连接失败必须从 gateway.log 中被识别出来。",);
assert.equal(qqIssue.status, "异常", "QQ Bot 连接超时不能继续显示为活跃。",);
assert.equal(qqIssue.health, "未同步", "QQ Bot 连接超时应显示为未同步。",);
assert.match(qqIssue.detail, /QQ|q\.qq\.com|远程节点运行服务/, "QQ 错误详情必须明确是远程节点运行服务访问 QQ Bot API 失败。",);
assert.match(qqIssue.detail, /代理|服务器环境/, "QQ 错误详情必须给出代理或服务器网络处理方向。",);
assert.equal(
  detectIntegrationRuntimeIssue("qq", "INFO qqbot connected to q.qq.com and gateway is ready"),
  null,
  "QQ Bot 日志只出现开放平台域名且连接成功时不能误报网络异常。",
);

const feishuTimeoutLog = `
ERROR gateway.run: ✗ feishu error: HTTPSConnectionPool(host='open.feishu.cn', port=443): Read timed out
ERROR gateway.run: Gateway failed to connect any configured messaging platform: feishu: connection timed out
`;
const feishuIssue = detectIntegrationRuntimeIssue("feishu", feishuTimeoutLog);
assert.ok(feishuIssue, "飞书网络连接失败必须从 gateway.log 中被识别出来。",);
assert.equal(feishuIssue.status, "异常", "飞书连接超时不能继续显示为活跃。",);
assert.match(feishuIssue.detail, /飞书|open\.feishu\.cn|远程节点运行服务/, "飞书错误详情必须明确是远程节点运行服务访问飞书开放平台失败。",);
assert.match(feishuIssue.detail, /代理|服务器环境/, "飞书错误详情必须给出代理或服务器网络处理方向。",);
assert.equal(
  detectIntegrationRuntimeIssue("feishu", "INFO feishu connected to open.feishu.cn and message gateway is ready"),
  null,
  "飞书日志只出现开放平台域名且连接成功时不能误报网络异常。",
);

const weixinTimeoutLog = `
ERROR gateway.run: ✗ weixin error: iLink login failed: ConnectTimeout to novac2c.cdn.weixin.qq.com
ERROR gateway.run: Gateway failed to connect any configured messaging platform: weixin: connection timed out
`;
const weixinIssue = detectIntegrationRuntimeIssue("weixin", weixinTimeoutLog);
assert.ok(weixinIssue, "微信 iLink 网络连接失败必须从 gateway.log 中被识别出来。",);
assert.equal(weixinIssue.status, "异常", "微信连接超时不能继续显示为活跃。",);
assert.match(weixinIssue.detail, /微信|iLink|weixin\.qq\.com|远程节点运行服务/, "微信错误详情必须明确是远程节点运行服务访问微信 iLink 失败。",);
assert.match(weixinIssue.detail, /代理|服务器环境/, "微信错误详情必须给出代理或服务器网络处理方向。",);
assert.equal(
  detectIntegrationRuntimeIssue("weixin", "INFO weixin iLink connected via novac2c.cdn.weixin.qq.com and login is ready"),
  null,
  "微信日志只出现 iLink 域名且连接成功时不能误报网络异常。",
);

const mixedPlatformLog = `
ERROR gateway.run: ✗ telegram error: telegram connect timed out after 30s
INFO gateway.run: Connecting to weixin...
INFO gateway.platforms.weixin: [Weixin] Connected account=6998e4a2 base=https://ilinkai.weixin.qq.com
INFO gateway.run: ✓ weixin connected
WARNING gateway.run: Unauthorized user: somebody@im.wechat on weixin
`;
assert.equal(
  detectIntegrationRuntimeIssue("weixin", mixedPlatformLog),
  null,
  "Telegram 超时日志不能因为靠近 weixin connected/Unauthorized user 行而把微信误报为网络异常。",
);

const recoveredWeixinLog = `
ERROR gateway.run: ✗ weixin error: iLink login failed: ConnectTimeout to novac2c.cdn.weixin.qq.com
INFO gateway.run: Connecting to weixin...
INFO gateway.platforms.weixin: [Weixin] Connected account=6998e4a2 base=https://ilinkai.weixin.qq.com
INFO gateway.run: ✓ weixin connected
`;
assert.equal(
  detectIntegrationRuntimeIssue("weixin", recoveredWeixinLog),
  null,
  "微信后续已经连接成功时，旧的微信网络超时不能继续覆盖当前状态。",
);

console.log("telegram runtime diagnostics assertions passed");
