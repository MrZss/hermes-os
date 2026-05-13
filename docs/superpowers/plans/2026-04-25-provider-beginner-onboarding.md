# AI 提供商傻瓜式接入优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 简化 AI 提供商配置，让新手只按“选供应商 → 登录或粘贴 Key → 保存 → 测试”完成接入。

**Architecture:** 保持现有 React provider 页面与 Electron state/actions 服务边界不变。前端过滤内部 `auto` provider、按新手优先排序、收敛抽屉字段；后端 state 服务只移除用户可见的“自动检测”标签，不改变已有 Hermes CLI 写入路径。

**Tech Stack:** React、TypeScript、Electron desktop service、Node assert smoke tests、Vite build。

---

### Task 1: 锁定简化验收

**Files:**
- Modify: `ui/tests/provider-module-completion.test.mjs`

- [x] **Step 1: Write the failing test**

Add assertions that provider UI must expose the short path, filter visible providers, remove advanced config, and remove automatic selection labels.

- [x] **Step 2: Run test to verify it fails**

Run: `node ui/tests/provider-module-completion.test.mjs`
Expected: FAIL because current page still explains OAuth via CLI/auth.json and exposes automatic/advanced branches.

### Task 2: Simplify provider page

**Files:**
- Modify: `ui/src/app/pages/instance/Providers.tsx`

- [x] **Step 1: Add visible provider filtering and beginner ordering**

Create `visibleProviders`, filter `id !== "auto"`, then sort configured/current providers first and common providers next.

- [x] **Step 2: Shorten main page and cards**

Show the four-step path, compact current AI summary, and card fields limited to configuration method + recommended model.

- [x] **Step 3: Simplify drawer**

Keep supplier, auth method, model, credentials. Hide single-method pickers, remove advanced metadata, shorten OAuth copy, and rename save button to “保存并设为当前供应商”.

### Task 3: Remove automatic labels from state metadata

**Files:**
- Modify: `ui/desktop/services/hermes-official-state.mjs`

- [x] **Step 1: Rename internal auto fallback**

Change user-facing label from automatic selection to a non-actionable internal fallback label.

- [x] **Step 2: Remove automatic auth fallback**

Do not generate an `自动检测` auth method when a provider has no real OAuth/API Key/Endpoint path.

### Task 4: Sync docs and verify

**Files:**
- Modify: `docs/PAGE_SPEC.md`
- Modify: `docs/PRODUCT_BASELINE_Hermes_Console_v1.md`
- Modify: `docs/superpowers/specs/2026-04-24-ai-provider-intake-research.md`
- Modify: `docs/superpowers/specs/2026-04-25-provider-auth-card-design.md`
- Create: `docs/superpowers/specs/2026-04-25-provider-beginner-onboarding-design.md`
- Create: `docs/superpowers/plans/2026-04-25-provider-beginner-onboarding.md`

- [x] **Step 1: Run verification**

Run:

```bash
node ui/tests/provider-module-completion.test.mjs
for test in ui/tests/*.test.mjs; do node "$test"; done
git diff --check
cd ui && npm run build
```

Expected: all commands exit 0.

- [x] **Step 2: Restart and browser-check**

Restart `npm run desktop:dev`, open `/instance/remote-gateway/providers`, verify no automatic/advanced branch and drawer shows simplified steps.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs ui
git commit -m "简化AI提供商傻瓜式配置"
```
