import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providersPage = fs.readFileSync(path.join(root, "src/app/pages/instance/Providers.tsx"), "utf8");

assert.match(
  providersPage,
  /function buildProviderOAuthSuccessMessage\(result: \{ message: string; output: string \}, refreshFailed = false\)/,
  "OAuth 成功反馈应通过共享 helper 收口，避免成功/刷新失败文案散落在 block 中。",
);
assert.match(
  providersPage,
  /登录已完成，但重新读取最新状态失败，请稍后刷新页面确认。/,
  "OAuth 回读失败时应明确提示登录已完成、但状态确认仍需稍后刷新。",
);

const authStart = providersPage.indexOf("async function handleAuthenticateProvider() {");
const authEnd = providersPage.indexOf("async function handleSaveProvider() {");
assert.ok(authStart >= 0, "应能定位 handleAuthenticateProvider。");
assert.ok(authEnd > authStart, "应能定位 handleSaveProvider 作为 OAuth block 的结束边界。");

const authBlock = providersPage.slice(authStart, authEnd);
const refreshCall = "const refreshResult = await refreshProviders(selectedProfileId, selected.id);";
const refreshIndex = authBlock.indexOf(refreshCall);
assert.ok(refreshIndex >= 0, "OAuth 成功后应调用 refreshProviders 真实回读 provider 状态。");

assert.match(
  authBlock,
  /message: buildProviderOAuthSuccessMessage\(result, !refreshResult\.ok\),/,
  "OAuth 成功反馈应统一走 helper，并显式依赖 refresh 结果收口文案。",
);

const preRefreshBlock = authBlock.slice(0, refreshIndex);
assert.doesNotMatch(
  preRefreshBlock,
  /setFeedback\(\{\s*tone:\s*"success"/,
  "在真实回读 provider 状态之前，不应先抛出成功反馈。",
);
assert.doesNotMatch(
  preRefreshBlock,
  /setOauthCompleted\(\(current\)\s*=>\s*\(\{\s*\.\.\.current,\s*\[selected\.id\]:\s*true\s*\}\)\);/,
  "在真实回读 provider 状态之前，不应先把 OAuth 标记为已完成。",
);

const successFeedbackIndex = authBlock.indexOf('setFeedback({\n        tone: "success"');
assert.ok(
  successFeedbackIndex > refreshIndex,
  "OAuth 成功反馈应在真实回读之后统一收口，保留“建议立即测试当前供应商”的下一步提示。",
);
const completionIndex = authBlock.indexOf('setOauthCompleted((current) => ({ ...current, [selected.id]: true }));');
assert.ok(
  completionIndex > refreshIndex,
  "OAuth 登录完成标记应放在真实回读之后，确保 provider 状态先刷新再宣布成功。",
);

console.log("provider oauth refresh assertions passed");
