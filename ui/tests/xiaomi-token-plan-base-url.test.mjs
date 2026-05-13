import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const providerTests = read("desktop/services/provider-tests.mjs");
const officialActions = read("desktop/services/hermes-official-actions.mjs");
const officialState = read("desktop/services/hermes-official-state.mjs");

assert.match(
  providerTests,
  /XIAOMI_TOKEN_PLAN_CN_BASE_URL\s*=\s*"https:\/\/token-plan-cn\.xiaomimimo\.com\/v1"/,
  "MiMo 套餐 Key 的连接测试默认应使用官方专属 token-plan-cn Base URL。"
);

assert.doesNotMatch(
  providerTests,
  /xiaomi:\s*\{[\s\S]{0,180}defaultBaseUrl:\s*"https:\/\/api\.xiaomimimo\.com\/v1"/,
  "Xiaomi provider 测试不应继续默认打到旧的 api.xiaomimimo.com。"
);

assert.match(
  providerTests,
  /normalizeText\(apiKey\)\.startsWith\("tp-"\)[\s\S]{0,260}XIAOMI_TOKEN_PLAN_CN_BASE_URL/,
  "如果 MiMo 套餐 Key 仍打到非专属 Base URL，错误提示应明确指向 token-plan-cn。"
);

assert.match(
  officialActions,
  /function ensureXiaomiTokenPlanBaseUrl\(/,
  "保存 Xiaomi provider 时应有专门逻辑自动补齐官方套餐 Base URL。"
);

assert.match(
  officialActions,
  /providerId === "xiaomi"[\s\S]{0,360}ensureXiaomiTokenPlanBaseUrl\(envEntries\)/,
  "保存 Xiaomi provider 时应自动写入 XIAOMI_BASE_URL。"
);

assert.match(
  officialActions,
  /key:\s*"XIAOMI_BASE_URL"[\s\S]{0,160}XIAOMI_TOKEN_PLAN_CN_BASE_URL/,
  "自动补齐的环境变量应是 XIAOMI_BASE_URL=token-plan-cn。"
);

assert.match(
  officialState,
  /xiaomi:\s*\{[\s\S]{0,260}baseEnvKey:\s*"XIAOMI_BASE_URL"[\s\S]{0,260}defaultBaseUrl:\s*XIAOMI_TOKEN_PLAN_CN_BASE_URL/,
  "Xiaomi provider 状态应展示/识别专属 Base URL，而不是只展示 Key。"
);

assert.match(
  officialState,
  /models:\s*\[[^\]]*"mimo-v2\.5-pro"[^\]]*"mimo-v2-pro"/,
  "Xiaomi provider 模型建议应使用 API 可接受的小写模型 ID。"
);

console.log("xiaomi token-plan base url assertions passed");
