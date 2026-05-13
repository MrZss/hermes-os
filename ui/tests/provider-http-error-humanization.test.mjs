import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providerTests = fs.readFileSync(path.join(root, "desktop/services/provider-tests.mjs"), "utf8");

assert.match(
  providerTests,
  /function humanizeProviderHttpFailure\(/,
  "Provider HTTP 测试应集中把 401/invalid_key 等原始响应转成人话。"
);

assert.match(
  providerTests,
  /Invalid API Key|invalid_key|401/,
  "人话诊断应识别用户贴出的 Invalid API Key / invalid_key / 401。"
);

assert.match(
  providerTests,
  /API Key 无效/,
  "401 invalid_key 应提示 API Key 无效，而不是只展示原始 JSON。"
);

assert.match(
  providerTests,
  /sk-or-v1-[\s\S]{0,240}OpenRouter[\s\S]{0,240}Xiaomi MiMo/,
  "如果把 OpenRouter 的 sk-or-v1 Key 填到 Xiaomi MiMo，应提示切换供应商或更换 Key。"
);

assert.match(
  providerTests,
  /humanizeProviderHttpFailure\(\{[\s\S]*providerId[\s\S]*apiKey[\s\S]*statusCode: response\.status[\s\S]*body/,
  "本地 provider HTTP 测试失败时应使用人话诊断。"
);

assert.match(
  providerTests,
  /humanizeProviderHttpFailure\(\{[\s\S]*providerId[\s\S]*apiKey[\s\S]*statusCode[\s\S]*body: output/,
  "远程 provider HTTP 测试失败时也应使用同一套人话诊断。"
);

console.log("provider HTTP error humanization assertions passed");
