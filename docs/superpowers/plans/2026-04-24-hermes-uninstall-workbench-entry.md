# Hermes 工作台卸载入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首页工作台和实例概览中补齐卸载/清理入口，让用户不用猜卸载路径。

**Architecture:** 工作台入口只负责说明与导航；实际危险操作继续由设置页危险区与备份页确认弹窗承接。新增一个轻量静态 UI 断言脚本，防止入口文案或路由后续被误删。

**Tech Stack:** React + Vite + Electron；lucide-react 图标；Node.js 文件断言脚本。

---

## 文件结构

- Create: `ui/tests/workbench-uninstall-entry.test.mjs`：读取 TSX 文件，断言工作台卸载入口文案与路由存在。
- Modify: `ui/src/app/pages/Dashboard.tsx`：在首页右侧增加「卸载与清理」卡片。
- Modify: `ui/src/app/pages/instance/Overview.tsx`：在实例概览右栏增加「清理与卸载」卡片。

## Task 1: 写入失败测试

- [ ] **Step 1: 创建测试文件**

```js
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dashboard = fs.readFileSync(path.join(root, "src/app/pages/Dashboard.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "src/app/pages/instance/Overview.tsx"), "utf8");

assert.match(dashboard, /卸载与清理/, "Dashboard should expose uninstall and cleanup entry");
assert.match(dashboard, /前往全局卸载/, "Dashboard should link to global uninstall settings");
assert.match(dashboard, /\/settings/, "Dashboard uninstall card should navigate to settings");
assert.match(dashboard, /\/instance\/\$\{recentInstance\.id\}\/backups/, "Dashboard should link recent instance cleanup to backups");

assert.match(overview, /清理与卸载/, "Instance overview should expose cleanup and uninstall entry");
assert.match(overview, /\/instance\/\$\{instance\.id\}\/backups/, "Instance overview should link cleanup to backups");
assert.match(overview, /\/settings/, "Instance overview should link global uninstall to settings");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node ui/tests/workbench-uninstall-entry.test.mjs`

Expected: FAIL，提示 Dashboard 缺少 `卸载与清理`。

## Task 2: 实现首页工作台卡片

- [ ] **Step 1: 修改 Dashboard 图标 import**

Add `Settings` and `Trash2` to lucide-react import list.

- [ ] **Step 2: 在首页右侧「继续最近实例」下方增加卡片**

卡片标题为 `卸载与清理`；正文用三行短说明；按钮分别跳转 `/settings` 与 `/instance/${recentInstance.id}/backups`。

- [ ] **Step 3: 运行测试确认首页断言通过或推进到 Overview 断言失败**

Run: `node ui/tests/workbench-uninstall-entry.test.mjs`

Expected: FAIL，若 Overview 尚未实现，应提示 Overview 缺少 `清理与卸载`。

## Task 3: 实现实例概览卡片

- [ ] **Step 1: 修改 Overview 图标 import**

Add `Settings` and `Trash2` to lucide-react import list.

- [ ] **Step 2: 在右栏「当前诊断」下方增加卡片**

卡片标题为 `清理与卸载`；说明实例级清理走备份页，全局卸载走设置危险区；按钮分别跳转 `/instance/${instance.id}/backups` 与 `/settings`。

- [ ] **Step 3: 运行测试确认通过**

Run: `node ui/tests/workbench-uninstall-entry.test.mjs`

Expected: PASS，无输出或仅输出测试完成信息。

## Task 4: 构建与桌面验证

- [ ] **Step 1: 构建**

Run: `npm run build` from `ui/`.

Expected: exit 0，Vite build 完成。

- [ ] **Step 2: 重启桌面客户端**

Run: `npm run desktop:dev` from `ui/` after stopping旧进程。

Expected: Vite 监听 `127.0.0.1:4174`，Electron 窗口存在。

- [ ] **Step 3: 验证 HTTP 与进程**

Run: `curl -I http://127.0.0.1:4174/` and Electron/window check.

Expected: HTTP 200，Electron 窗口数大于 0。

## Task 5: 提交

- [ ] **Step 1: 检查 diff**

Run: `git diff -- docs/superpowers ui/src/app/pages ui/tests`。

- [ ] **Step 2: 提交实现**

Run:

```bash
git add ui/src/app/pages/Dashboard.tsx ui/src/app/pages/instance/Overview.tsx ui/tests/workbench-uninstall-entry.test.mjs
git commit -m "在工作台补充 Hermes 卸载指引入口"
```
