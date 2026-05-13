import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providersPage = fs.readFileSync(path.join(root, "src/app/pages/instance/Providers.tsx"), "utf8");

assert.match(
  providersPage,
  /function getConfiguredRank\(provider: HermesProviderEntry, test\?: ProviderTestResult\) \{\n\s*if \(provider\.isDefault\) return 0;\n\s*if \(provider\.status === "已连接" && test\?\.status === "verified"\) return 1;\n\s*if \(provider\.status === "已连接"\) return 2;\n\s*if \(test\?\.status === "failed"\) return 3;\n\s*if \(test\?\.status === "configured"\) return 4;\n\s*return 5;/,
  "排序优先级应收口为：默认 provider → 已连接且已验证 → 已连接但未验证 → 已配置但失败 → 已配置未验证 → 未配置。",
);

assert.match(
  providersPage,
  /const result = await testInstanceProvider\(instanceId, \{\n\s*profileId: selectedProfileId,\n\s*providerId: targetProvider\.id,\n\s*\}\);/,
  "测试按钮必须继续走真实 testInstanceProvider 动作。",
);
assert.match(
  providersPage,
  /const tests = await listInstanceProviderTests\(instanceId, \{ profileId: selectedProfileId \}\);/,
  "执行 provider 测试后必须重新拉取测试结果列表，避免只依赖本地临时结果。",
);
assert.match(
  providersPage,
  /setProviderTests\(toProviderTestMap\(tests\)\);/,
  "执行 provider 测试后应以最新测试列表回写 badge 与排序状态。",
);
assert.match(
  providersPage,
  /const refreshResult = await refreshProviders\(selectedProfileId, targetProvider\.id\);/,
  "执行 provider 测试后应刷新官方 provider 状态，保证排序与当前配置一致。",
);
assert.match(
  providersPage,
  /function getOptimisticProviderStatusFromTestResult\(result: ProviderTestResult\): HermesProviderStatus \| null \{/,
  "测试结果页应提供基于最新测试结果的本地状态兜底，避免刷新失败时排序与 badge 滞后。",
);
assert.match(
  providersPage,
  /type ApplyOfficialProviderStateOptions = \{\n\s*preserveProviderTestsOnFailure\?: boolean;\n\};/,
  "官方状态同步应支持在刷新路径保留最新测试列表，避免二次拉取失败时清空刚拿到的测试结果。",
);
assert.match(
  providersPage,
  /await applyOfficialProviderState\(result, preferredProfileId, preferredProviderId, \{\n\s*preserveProviderTestsOnFailure: true,\n\s*\}\);/,
  "测试/保存/OAuth 后的轻量刷新路径应保留已有测试列表，避免回读时二次清空排序依据。",
);
assert.match(
  providersPage,
  /if \(!refreshResult\.ok\) \{[\s\S]*?const optimisticStatus = getOptimisticProviderStatusFromTestResult\(result\);[\s\S]*?setProviders\(\(current\) => current\.map\(\(provider\) => \(/,
  "当测试后的官方状态刷新失败时，仍应根据最新测试结果做本地 provider 状态兜底同步。",
);
assert.match(
  providersPage,
  /function getOptimisticProviderStatusAfterSave\(\): HermesProviderStatus \{/,
  "保存成功后的刷新失败场景也应具备最小本地状态兜底，避免 provider 状态与排序卡在旧值。",
);

assert.match(
  providersPage,
  /getProviderTestBadge\(latestTest\)/,
  "provider 测试 badge 应继续由真实测试结果驱动。",
);

console.log("provider test result priority assertions passed");
