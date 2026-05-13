# Hermes 完整卸载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加真正的本机 Hermes 完整卸载闭环：官方卸载 + 本地残留清理 + Console 注册清理 + 结果检测。

**Architecture:** 新增桌面主进程服务 `hermes-uninstall.mjs` 承接完整卸载。前端设置页只负责确认、调用和展示结果。通过静态/辅助函数测试验证安全边界，不在开发期执行真实删除。

**Tech Stack:** Electron IPC、Node.js fs/path/os、React 设置页、Node assert 测试。

---

## 文件结构

- Create: `ui/desktop/services/hermes-uninstall.mjs`：完整卸载服务与安全路径 helper。
- Create: `ui/tests/complete-uninstall.test.mjs`：验证 IPC、前端文案、强确认和安全删除 helper。
- Modify: `ui/desktop/main.mjs`：注册 `hermes:completeHermesUninstall`。
- Modify: `ui/desktop/preload.mjs`：暴露 `completeHermesUninstall`。
- Modify: `ui/src/hermes-desktop.d.ts`：补充完整卸载 payload 类型和 bridge 方法。
- Modify: `ui/src/app/services/system.ts`：增加 `completeUninstallHermesLocal`。
- Modify: `ui/src/app/pages/Settings.tsx`：完整卸载调用新 IPC，更新文案与确认短语。

## Task 1: 写失败测试

- [ ] 创建 `ui/tests/complete-uninstall.test.mjs`。
- [ ] 断言存在 `FULL_UNINSTALL_CONFIRMATION_TEXT`。
- [ ] 断言 `isSafeHermesRemovalPath` 只允许 `~/.hermes` 和 `~/.local/bin/hermes`。
- [ ] 断言 main/preload/d.ts/system/Settings 均接入 `completeHermesUninstall`。
- [ ] 运行测试，预期失败。

## Task 2: 实现桌面完整卸载服务

- [ ] 新建 `hermes-uninstall.mjs`。
- [ ] 导出确认短语、安全路径 helper、plan helper、`completeHermesUninstall`。
- [ ] 执行 gateway stop/uninstall、官方 full uninstall、白名单路径删除、注册表清理、残留检测。
- [ ] 非关键步骤失败记录 warning，不阻塞后续兜底清理。

## Task 3: 接入 IPC 与类型

- [ ] main 注册 `hermes:completeHermesUninstall`。
- [ ] preload 暴露 `completeHermesUninstall`。
- [ ] d.ts 增加 payload 类型和方法。
- [ ] system.ts 增加前端调用函数。

## Task 4: 更新设置页 UI

- [ ] 完整卸载模式使用 `FULL UNINSTALL HERMES`。
- [ ] 完整卸载调用 `completeUninstallHermesLocal`。
- [ ] 结果输出展示每一步和残留检测。
- [ ] gateway 服务卸载说明明确不会删除 CLI 与数据。

## Task 5: 验证与提交

- [ ] 运行 `node ui/tests/complete-uninstall.test.mjs`。
- [ ] 运行既有导航和卸载入口测试。
- [ ] 运行 `npm run build`。
- [ ] 重启桌面客户端并只做界面验证，不执行真实完整卸载。
- [ ] 提交：`增加 Hermes 本机完整卸载闭环`。
