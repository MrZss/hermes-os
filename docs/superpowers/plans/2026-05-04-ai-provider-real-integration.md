# AI 提供商真实对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把实例级 AI 提供商配置从“界面可点”推进到“真实可保存、可认证、可测试、可回读”的稳定闭环。

**Architecture:** 保持现有 Providers 页面与 Drawer 结构不重做，通过桌面桥官方动作与官方状态回读建立“保存 → 回读 → 测试 → 刷新”的实例级真实闭环。状态来源统一为官方状态优先、测试结果次之、表单临时状态兜底，并保证本地实例与远程节点共用一套真实对接逻辑。

**Tech Stack:** React、TypeScript/TSX、Hermes desktop bridge、officialActions、officialState、现有 Providers 页面。

---

## File Structure

### Existing files to modify
- `ui/src/app/pages/instance/Providers.tsx`
  - Providers 主页面；需要统一真实状态驱动、保存后回读、测试后回写、排序前置、反馈文案收口。
- `ui/src/app/services/officialActions.ts`
  - 已有 provider 保存 / OAuth / 测试动作封装；可能需要补足返回值映射或错误文案收口。
- `ui/src/app/services/officialState.ts`
  - 官方状态读取；需要确认当前 provider / profile / sources 字段是否足以支撑真实 UI 刷新。
- `ui/src/app/data/hermesOfficial.ts`
  - Provider 数据结构与 fallback 数据；需要确认排序、默认模型和 auth method 行为的一致性。
- `ui/src/app/services/runtime.ts`
  - 如需要全局刷新事件联动 provider 配置完成后的跨页刷新，可在此补最小 helper。

### New tests to create
- `ui/tests/provider-real-save-refresh.test.mjs`
  - 验证 Providers 页保存后会重新读取官方状态。
- `ui/tests/provider-oauth-refresh.test.mjs`
  - 验证 OAuth 成功后会刷新 provider 列表与反馈。
- `ui/tests/provider-test-result-priority.test.mjs`
  - 验证 provider test 结果能正确覆盖 badge 与排序。

---

### Task 1: 统一 Providers 页的真实状态来源与保存后回读

**Files:**
- Modify: `ui/src/app/pages/instance/Providers.tsx`
- Test: `ui/tests/provider-real-save-refresh.test.mjs`

- [ ] **Step 1: 写失败测试，锁定“保存后必须回读官方状态”**

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/app/pages/instance/Providers.tsx'), 'utf8');

assert.match(source, /updateInstanceProviderConfig\(/, 'Providers 保存动作必须调用真实 provider 配置更新');
assert.match(source, /await loadProviders\(/, 'Providers 保存成功后必须重新读取官方状态');
assert.match(source, /setFeedback\(/, 'Providers 保存后应给出用户可见反馈');

console.log('provider real save refresh assertions passed');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node ui/tests/provider-real-save-refresh.test.mjs`
Expected: FAIL，说明还没有明确覆盖保存后回读链路。

- [ ] **Step 3: 在 Providers 页中收口保存成功链路**

实现要求：
- 保存动作继续调用 `updateInstanceProviderConfig(instanceId, payload)`
- 保存成功后必须：
  1. `await loadProviders(currentProfileId, currentProviderId)`
  2. 保持当前 drawer / selected provider 状态一致
  3. 设置成功反馈
- 失败时保留当前表单值，不清空输入

示意代码片段：

```ts
const handleSaveProvider = async () => {
  if (!instanceId || !selectedProvider) return;

  setSaving(true);
  setError(null);
  setFeedback(null);

  try {
    const result = await updateInstanceProviderConfig(instanceId, {
      profileId: selectedProfileId,
      providerId: selectedProvider.id,
      defaultModel: formState.defaultModel.trim(),
      baseUrl: formState.baseUrl.trim() || undefined,
      apiKey: formState.apiKey.trim() || undefined,
      env: normalizedEnv,
    });

    setFeedback({
      tone: 'success',
      message: result.message || '已保存 provider 配置。',
    });

    await loadProviders(selectedProfileId, selectedProvider.id);
  } catch (saveError) {
    setFeedback({
      tone: 'error',
      message: saveError instanceof Error ? saveError.message : '保存 provider 配置失败。',
    });
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node ui/tests/provider-real-save-refresh.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add ui/src/app/pages/instance/Providers.tsx ui/tests/provider-real-save-refresh.test.mjs
git commit -m "收口AI提供商保存后的真实状态回读"
```

---

### Task 2: 收口 OAuth 真实登录后的状态刷新与反馈

**Files:**
- Modify: `ui/src/app/pages/instance/Providers.tsx`
- Test: `ui/tests/provider-oauth-refresh.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 OAuth 成功后刷新行为**

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/app/pages/instance/Providers.tsx'), 'utf8');

assert.match(source, /authenticateInstanceProvider\(/, 'OAuth 登录必须调用真实 provider 认证动作');
assert.match(source, /await loadProviders\(/, 'OAuth 成功后必须重新读取 provider 状态');
assert.match(source, /建议立即测试|立即测试|完成登录/, 'OAuth 成功后应给出明确下一步反馈');

console.log('provider oauth refresh assertions passed');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node ui/tests/provider-oauth-refresh.test.mjs`
Expected: FAIL

- [ ] **Step 3: 收口 OAuth 成功链路**

实现要求：
- 调用 `authenticateInstanceProvider(instanceId, payload)`
- OAuth 完成后重新读取 `loadProviders(...)`
- 更新 `oauthCompleted` / selected provider 状态
- 统一成功反馈为“登录已完成，建议立即测试”一类文案

示意代码片段：

```ts
const handleAuthenticateProvider = async (provider: HermesProviderEntry) => {
  setOauthWorkingId(provider.id);
  setFeedback(null);

  try {
    const result = await authenticateInstanceProvider(instanceId, {
      profileId: selectedProfileId,
      providerId: provider.id,
      authType: 'oauth',
    });

    setOauthCompleted((current) => ({ ...current, [provider.id]: true }));
    setFeedback({
      tone: 'success',
      message: `${result.message}\n建议立即测试当前供应商。`,
    });

    await loadProviders(selectedProfileId, provider.id);
  } catch (authError) {
    setFeedback({
      tone: 'error',
      message: authError instanceof Error ? authError.message : 'OAuth 登录失败。',
    });
  } finally {
    setOauthWorkingId(null);
  }
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node ui/tests/provider-oauth-refresh.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add ui/src/app/pages/instance/Providers.tsx ui/tests/provider-oauth-refresh.test.mjs
git commit -m "收口AI提供商OAuth登录后的状态刷新"
```

---

### Task 3: 收口 Provider 测试结果与排序优先级

**Files:**
- Modify: `ui/src/app/pages/instance/Providers.tsx`
- Test: `ui/tests/provider-test-result-priority.test.mjs`

- [ ] **Step 1: 写失败测试，锁定测试结果优先级与排序行为**

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/app/pages/instance/Providers.tsx'), 'utf8');

assert.match(source, /listInstanceProviderTests\(/, 'Providers 应读取 provider 测试结果');
assert.match(source, /testInstanceProvider\(/, 'Providers 测试按钮必须调用真实测试动作');
assert.match(source, /getProviderTestBadge\(/, 'Providers 应根据测试结果映射 badge');
assert.match(source, /getBeginnerProviderRank\(/, 'Providers 应基于真实状态和测试结果排序');

console.log('provider test result priority assertions passed');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node ui/tests/provider-test-result-priority.test.mjs`
Expected: FAIL

- [ ] **Step 3: 收口测试动作与结果刷新**

实现要求：
- 点击测试调用 `testInstanceProvider(instanceId, payload)`
- 测试成功或失败后重新拉取 `listInstanceProviderTests(...)`
- 卡片 badge 优先使用测试结果：
  - verified → 已验证
  - failed → 验证失败
  - configured → 已配置
- 排序时优先展示：
  1. 当前默认 provider
  2. 已连接且已验证
  3. 已连接但未验证
  4. 已配置但失败
  5. 未配置

示意代码片段：

```ts
const handleTestProvider = async (provider: HermesProviderEntry) => {
  setTestingId(provider.id);
  setFeedback(null);

  try {
    const result = await testInstanceProvider(instanceId, {
      profileId: selectedProfileId,
      providerId: provider.id,
    });

    const tests = await listInstanceProviderTests(instanceId, { profileId: selectedProfileId });
    setProviderTests(toProviderTestMap(tests));

    setFeedback({
      tone: result.status === 'failed' ? 'error' : 'success',
      message: result.detail || result.summary,
    });

    await loadProviders(selectedProfileId, provider.id);
  } catch (testError) {
    setFeedback({
      tone: 'error',
      message: testError instanceof Error ? testError.message : '供应商测试失败。',
    });
  } finally {
    setTestingId(null);
  }
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node ui/tests/provider-test-result-priority.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add ui/src/app/pages/instance/Providers.tsx ui/tests/provider-test-result-priority.test.mjs
git commit -m "收口AI提供商测试结果与排序优先级"
```

---

### Task 4: 收口 Drawer 必填项与错误文案

**Files:**
- Modify: `ui/src/app/pages/instance/Providers.tsx`

- [ ] **Step 1: 明确 API Key / Endpoint / OAuth 三类表单校验**

实现要求：
- OAuth 类：保存前允许不填 API Key，但必须通过 OAuth 动作完成认证
- API Key 类：没有已有凭据也没有新填入 Key 时，不允许保存
- custom / endpoint 类：必须校验 `defaultModel`，必要时校验 `baseUrl`

- [ ] **Step 2: 把错误文案统一为人话**

示意文案：
- `请先填写 API Key，再保存当前供应商。`
- `请先填写默认模型，再保存当前供应商。`
- `请先完成 OAuth 登录，再继续测试。`
- `当前提供商尚未完成真实配置。`

- [ ] **Step 3: 确认 Drawer 不泄露多余技术细节**

检查并确保：
- 不出现“自动选择 / 自动检测 / 高级配置”
- 不平铺过多 Hermes 内部字段
- 只保留“选供应商 → 登录或粘贴 Key → 保存 → 测试”主路径

- [ ] **Step 4: 手工回归这三类路径**

Run: 在桌面端手工回归以下路径
- OAuth provider
- API Key provider
- Custom endpoint provider

Expected:
- 错误文案清晰
- 保存动作不会误通过
- 测试动作只在已配置前提下继续

- [ ] **Step 5: 提交**

```bash
git add ui/src/app/pages/instance/Providers.tsx
git commit -m "收口AI提供商抽屉必填项与错误文案"
```

---

### Task 5: 全量验证与桌面端验收

**Files:**
- Verify only

- [ ] **Step 1: 运行新增 provider 测试**

Run:
```bash
node ui/tests/provider-real-save-refresh.test.mjs
node ui/tests/provider-oauth-refresh.test.mjs
node ui/tests/provider-test-result-priority.test.mjs
```
Expected: PASS

- [ ] **Step 2: 运行远程节点相关回归测试**

Run:
```bash
node ui/tests/remote-final-ux-polish-stage.test.mjs
node ui/tests/remote-workflow-closure.test.mjs
node ui/tests/remote-node-pages.test.mjs
node ui/tests/remote-instance-node-navigation.test.mjs
```
Expected: PASS

- [ ] **Step 3: 构建前端**

Run:
```bash
cd ui && npm run build
```
Expected: exit 0

- [ ] **Step 4: 启动桌面端并实际验收**

Run:
```bash
cd ui && npm run desktop:dev
```

在 Electron 客户端中验收：
- 本地实例 Providers 页：
  - 选择 API Key provider
  - 保存后回读
  - 测试并观察 badge / 排序
- 远程节点 Providers 页：
  - 选择 OAuth provider
  - 认证后回读
  - 测试并观察状态刷新
- 验证无需手动重进页面即可刷新状态

- [ ] **Step 5: 最终提交**

```bash
git status --short
git add ui/src/app/pages/instance/Providers.tsx ui/src/app/services/officialActions.ts ui/src/app/services/officialState.ts ui/tests/provider-real-save-refresh.test.mjs ui/tests/provider-oauth-refresh.test.mjs ui/tests/provider-test-result-priority.test.mjs
git commit -m "完成AI提供商真实对接"
```

