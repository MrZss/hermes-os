# Hermes Console 本地 Native 新建闭环实施计划

日期：2026-04-23

## 目标

补齐创建向导中的本地 Native 新建能力，使“本地实例 + Native”不再只是可选卡片或不可用路径，而是能真实创建独立 `HERMES_HOME`、注册到 Console、调用 Hermes 官方 gateway 启动/状态读取链路，并在 UI 中回流真实结果。

## 边界

- 本轮只做**本地 Native**。
- 远程 Native 仍不开放。
- 不伪造 provider/profile 深写；保持与当前 Docker 创建路径一致，记录选择并依赖后续官方配置页修改。
- Native gateway 走 Hermes 官方 `hermes gateway start/status/stop`，不发明自定义守护进程。

## 任务

1. 扩展桌面本地实例服务
   - 在 `local-instance.mjs` 中新增 `createLocalNativeInstance`。
   - 复用当前目录初始化、注册表、独立 `HERMES_HOME`、runtime metadata 逻辑。
   - 调用 `HERMES_HOME=<home> hermes gateway start`。
   - 失败时保留实例目录和注册表失败态，返回真实错误。

2. 打通 Electron bridge 与类型
   - `main.mjs` 增加 IPC handler。
   - `preload.mjs` 暴露 `createLocalNativeInstance`。
   - `instances.ts` 与 `hermes-desktop.d.ts` 增加输入/输出类型。

3. 接入创建向导
   - `CreateInstance.tsx` 支持本地 Native 进入部署。
   - Step 5 文案从“Native 后续”改为真实边界：本地 Native 可创建，远程 Native 不开放。
   - 成功页对 Native 不再展示“容器名”，改为运行方式/服务。

4. 验证
   - `node --check` 桌面服务与 bridge。
   - 使用临时 userDataPath 创建一个 Native 实例，验证注册表、目录和状态结果。
   - `npm run build`。
   - 重启桌面开发链并检查关键路由 200。

## 验收标准

- 本地 Native 实例可以从创建向导走到真实桌面 API。
- 创建成功或失败都必须有真实注册表状态和错误回传。
- 概览页现有 Native 启停能力可以接管新建的 Native 实例。
- 无新增假交互。
