# Hermes Console 剩余缺口收尾计划（2026-04-23）

## 目标
在当前已完成的实例、官方状态、运行维护和工作区真实接线基础上，继续收掉最后一批明显缺口，避免桌面客户端停留在“主链路可用但维护能力不完整”的状态。

本轮只做三类能力：
1. Provider 连接测试与已验证反馈
2. Backups 剩余维护动作
3. Settings 运维中心增强

不在本轮引入新的信息架构，不再回退到 mock，不发明与 Hermes 官方能力平行的状态系统。

## 范围

### 1. Provider 连接测试
- 新增桌面端 provider test 动作
- 复用 Hermes 官方 doctor/配置真相源，不单独伪造 provider 健康状态
- 在提供商页展示：
  - 当前测试中状态
  - 最近一次测试结果
  - 最近一次测试时间
- 测试失败必须返回真实 detail，不伪造“已连接”

### 2. Backups 剩余维护动作
- 补齐导入备份
- 补齐清空全部备份
- 补齐实例销毁/移除闭环
- 销毁动作必须区分：
  - 可安全销毁的受管实例
  - 外部导入实例（如现有 ~/.hermes），不能直接误删
- 所有危险动作使用正式对话框确认，不用 prompt/confirm

### 3. Settings 运维中心增强
- 打开 auth.json
- 打开 HERMES_HOME/logs
- gateway start / stop / restart / status
- 保留 doctor 输出
- 所有动作统一回到同一块反馈面板

## 文件范围
- `ui/desktop/services/`：新增或扩展 provider test / runtime maintenance / system action 能力
- `ui/desktop/main.mjs`
- `ui/desktop/preload.mjs`
- `ui/src/hermes-desktop.d.ts`
- `ui/src/app/services/officialActions.ts`
- `ui/src/app/services/runtimeMaintenance.ts`
- `ui/src/app/services/system.ts`
- `ui/src/app/pages/instance/Providers.tsx`
- `ui/src/app/pages/instance/Backups.tsx`
- `ui/src/app/pages/Settings.tsx`

## 实施顺序
1. Provider 连接测试服务与页面回流
2. Backups 导入/清空/销毁保护
3. Settings 运维中心增强
4. build + 桌面回归 + 中文 git commit

## 验收标准
- `Providers` 页可以对当前 provider 执行真实连接测试，并看到结果时间与详情
- `Backups` 页不再保留明显假禁用动作；导入、清空、销毁都有真实行为或真实保护
- `Settings` 页可直接执行 gateway start/stop/restart/status、doctor、打开 auth.json/logs
- `npm run build` 通过
- Electron 开发态重启成功
- 关键路由回归可达
