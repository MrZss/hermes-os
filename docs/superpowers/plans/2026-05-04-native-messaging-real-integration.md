# 原生消息平台真实对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把消息平台页从“能保存配置”推进到“真实保存、自动重启、状态回读、二维码闭环、桌面端可验收”的稳定闭环。

**Architecture:** 保持现有 `Integrations` 页面与平台卡片结构不重做，通过桌面桥官方动作与官方状态回读建立“保存 → 自动重启 → 回读刷新”的实例级闭环；微信继续走独立二维码主路径。状态来源统一为官方状态优先、二维码状态次之、表单临时态兜底。

**Tech Stack:** React、TypeScript/TSX、Hermes desktop bridge、officialActions、officialState、现有 Integrations 页面。

---

## File Structure

### Existing files to modify
- `ui/src/app/pages/instance/Integrations.tsx`
  - 消息平台主页面；需要统一真实状态驱动、保存后回读、文案收口、二维码状态收口。
- `ui/src/app/services/officialActions.ts`
  - 已有集成保存 / 微信二维码动作封装；如有必要补足错误文案映射。
- `ui/src/app/services/officialState.ts`
  - 官方状态读取；确认消息平台回读字段足够支撑 UI。
- `ui/src/app/data/hermesOfficial.ts`
  - fallback 数据与字段标签；保持最小必填字段与真实页一致。

### New tests to create
- `ui/tests/messaging-real-save-refresh.test.mjs`
  - 验证消息平台保存后自动重启并回读官方状态。
- `ui/tests/messaging-weixin-ux-closure.test.mjs`
  - 验证微信二维码主路径文案与状态收口。
- `ui/tests/messaging-beginner-guards.test.mjs`
  - 验证 Telegram / QQ / 飞书 / 微信最小必填项与按钮限制。

---

### Task 1: 统一消息平台保存后的真实回读与自动重启

**Files:**
- Modify: `ui/src/app/pages/instance/Integrations.tsx`
- Test: `ui/tests/messaging-real-save-refresh.test.mjs`

- [ ] 写失败测试，锁定：
  - 保存必须调用 `updateInstanceIntegrationConfig(...)`
  - 保存后必须调用 `restartInstanceGateway(instanceId)`
  - 成功后必须重新读取官方状态
  - 成功后不应保留旧 drawer 选中状态

- [ ] 实现保存成功链路：
  1. 保存配置
  2. 自动重启 Gateway
  3. 重新读取 `loadIntegrations(...)`
  4. 关闭抽屉 / 回到目录态
  5. 给出统一成功反馈

- [ ] 运行测试确认通过

- [ ] 提交

```bash
git add ui/src/app/pages/instance/Integrations.tsx ui/tests/messaging-real-save-refresh.test.mjs
git commit -m "收口消息平台保存后的真实回读与自动重启"
```

---

### Task 2: 收口微信二维码主路径与状态文案

**Files:**
- Modify: `ui/src/app/pages/instance/Integrations.tsx`
- Test: `ui/tests/messaging-weixin-ux-closure.test.mjs`

- [ ] 写失败测试，锁定：
  - 微信抽屉优先显示二维码主路径
  - 状态必须覆盖：生成中 / 等待扫码 / 已扫码 / 保存中 / 已保存 / 过期 / 失败
  - 扫码确认后要回到“已自动保存并重启”的结果文案

- [ ] 收口微信二维码 UX：
  - 前置插件引导
  - 生成二维码按钮
  - 轮询状态文案
  - 自动保存后成功反馈
  - 出错/过期的重新开始入口

- [ ] 运行测试确认通过

- [ ] 提交

```bash
git add ui/src/app/pages/instance/Integrations.tsx ui/tests/messaging-weixin-ux-closure.test.mjs
git commit -m "收口微信二维码登录主路径与状态文案"
```

---

### Task 3: 收口 Telegram / QQ / 飞书 / 微信最小必填项与按钮前置校验

**Files:**
- Modify: `ui/src/app/pages/instance/Integrations.tsx`
- Test: `ui/tests/messaging-beginner-guards.test.mjs`

- [ ] 写失败测试，锁定：
  - Telegram 需要 Bot Token + 用户 ID
  - QQ 需要 App ID + Client Secret
  - 飞书需要 App ID + App Secret
  - 微信二维码路径不把手工 token 当默认主路径
  - 未满足前置配置时保存按钮/关键动作不能继续

- [ ] 收口错误文案：
  - 先填 Bot Token，再保存。
  - 先填用户 ID，再保存。
  - 先完成扫码，再继续保存。
  - 保存没成功，请再试一次。

- [ ] 运行测试确认通过

- [ ] 提交

```bash
git add ui/src/app/pages/instance/Integrations.tsx ui/tests/messaging-beginner-guards.test.mjs
git commit -m "收口消息平台最小必填项与按钮校验"
```

---

### Task 4: 全量验证与桌面端验收

**Files:**
- Verify existing tests plus new messaging tests

- [ ] 运行消息平台相关测试：
  - `node ui/tests/integration-detail-actions.test.mjs`
  - `node ui/tests/weixin-qr-login-flow.test.mjs`
  - `node ui/tests/messaging-real-save-refresh.test.mjs`
  - `node ui/tests/messaging-weixin-ux-closure.test.mjs`
  - `node ui/tests/messaging-beginner-guards.test.mjs`

- [ ] 构建验证：
  - `cd ui && npm run build`

- [ ] 桌面端验收：
  - 启动 `npm run desktop:dev`
  - 打开 `远程网关节点 → 消息平台`
  - 逐个打开 Telegram / 微信 / QQ / 飞书抽屉
  - 验证：
    - 文案是否傻瓜式
    - 必填项是否收口
    - 微信二维码区域是否清晰
    - 已启用平台是否高亮

- [ ] 阶段提交

```bash
git add <verified files>
git commit -m "完成原生消息平台真实对接阶段"
```
