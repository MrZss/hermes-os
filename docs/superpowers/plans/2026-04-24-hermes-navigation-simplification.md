# Hermes 主页与侧栏导航整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去除重复新建实例入口，并把侧栏在未选/已选实例时的导航语义区分清楚。

**Architecture:** 只修改 RootLayout 与 Dashboard 的展示逻辑，不改路由结构；用静态断言脚本锁定按钮数量、主页命名和侧栏状态切换约束。

**Tech Stack:** React + React Router + Electron + Node.js assertion test.

---

## 文件结构

- Create: `ui/tests/navigation-simplification.test.mjs`：断言主页命名、新建实例入口数量和侧栏动态标题。
- Modify: `ui/src/app/layout/RootLayout.tsx`：删除重复创建入口，调整侧栏未选/已选实例状态。
- Modify: `ui/src/app/pages/Dashboard.tsx`：页面标题改主页，去掉空状态重复创建按钮。
- Modify: `ui/src/app/pages/instance/Overview.tsx`：返回文案从概览改主页。
- Modify: `ui/src/app/pages/CreateInstance.tsx`：返回概览按钮文案改返回主页。

## Task 1: 写失败测试

- [ ] 创建 `ui/tests/navigation-simplification.test.mjs`，读取 RootLayout/Dashboard/Overview/CreateInstance。
- [ ] 断言 RootLayout 根导航为 `label="主页"`。
- [ ] 断言 RootLayout 不再包含 `新建实例` 文案。
- [ ] 断言 RootLayout 有 `activeInstance ? "工作区" : "实例列表"`。
- [ ] 断言 RootLayout 的当前实例区域由 `activeInstance ? (` 守卫。
- [ ] 断言 Dashboard 标题为 `主页`，且 `navigate("/create` 只出现一次。
- [ ] 运行 `node ui/tests/navigation-simplification.test.mjs`，预期失败。

## Task 2: 修改 RootLayout

- [ ] 删除 `ChevronDown` import 与 activeInstance 卡片右侧下拉图标。
- [ ] 根 NavItem 文案改为 `主页`。
- [ ] 当前实例卡片只在 `activeInstance` 存在时渲染。
- [ ] 列表标题改为动态 `activeInstance ? "工作区" : "实例列表"`。
- [ ] 删除未选中实例侧栏底部 `新建实例` 按钮。
- [ ] 删除顶栏 `新建实例` 按钮。

## Task 3: 修改主页与返回文案

- [ ] Dashboard PageHeader title 改为 `主页`。
- [ ] Dashboard 空状态删除 `创建本地实例` 按钮，只保留导入现有 Hermes。
- [ ] Overview 不存在实例时文案改为返回主页。
- [ ] CreateInstance 返回按钮文案改为返回主页。

## Task 4: 验证

- [ ] 运行 `node ui/tests/navigation-simplification.test.mjs`，预期通过。
- [ ] 运行 `node ui/tests/workbench-uninstall-entry.test.mjs`，防止上轮卸载入口回归。
- [ ] 运行 `npm run build`。
- [ ] 重启 `npm run desktop:dev` 并用 Electron 窗口自验首页与实例页。

## Task 5: 提交

- [ ] `git add` 相关文件。
- [ ] `git commit -m "整理主页与实例侧栏导航"`。
