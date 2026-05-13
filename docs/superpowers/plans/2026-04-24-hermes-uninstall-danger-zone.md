# Hermes 卸载危险区实施计划

## 任务 1：扩展 Hermes CLI 安全白名单
- 允许 `gateway install --force`、`gateway uninstall`。
- 允许 `uninstall --yes`、`uninstall --full --yes`。
- 不开放任意参数透传。

## 任务 2：封装前端语义化维护 API
- 在 `ui/src/app/services/system.ts` 增加 gateway 重装/卸载服务函数。
- 增加 Hermes Agent 卸载函数，参数限定为 `keep-data` / `full`。

## 任务 3：设置页危险区 UI
- 读取本地 Hermes 环境和 Console 实例数量。
- 诊断与维护中补充 gateway 重装、卸载服务入口。
- 设置页底部新增危险区和卸载弹窗。
- 二次确认文案为 `UNINSTALL HERMES`。
- 所有后台动作接入 loading 与结果输出。

## 任务 4：验证与提交
- 运行 `npm run build`。
- 重启桌面客户端。
- 验证 4174 HTTP 可访问、Electron 窗口存在。
- 中文 git commit。
