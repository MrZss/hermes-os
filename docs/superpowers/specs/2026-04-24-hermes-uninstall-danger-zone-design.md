# Hermes Console 卸载与危险区设计

## 背景
用户询问是否需要增加卸载 Hermes 功能。当前 Console 已有实例级销毁能力，但设置页只提供 gateway 启停、doctor、status 等维护入口，缺少官方 CLI 已支持的卸载闭环。

## 已确认能力
本机 Hermes CLI 支持：
- `hermes gateway install --force`：重装 gateway 后台服务。
- `hermes gateway uninstall`：卸载 gateway 后台服务。
- `hermes uninstall --yes`：卸载 Hermes Agent，保留配置与数据。
- `hermes uninstall --full --yes`：完整卸载 Hermes Agent，包括配置与数据。

## 产品原则
- 卸载功能需要加，但不能做成普通按钮。
- 设置页只承接应用级维护入口，不承担实例部署页职责。
- 危险操作必须独立分区、明确影响范围、带二次确认、执行时有 loading 和结果输出。

## 范围
第一版一次完成两个层级：
1. Gateway 服务维护：状态检测、启动、停止、重启、重装服务、卸载服务。
2. Hermes Agent 卸载向导：保留数据卸载 / 完整卸载两种模式，二次确认后执行。

## 交互设计
- 在设置页「诊断与维护」中新增 gateway 服务重装与服务卸载按钮。
- 在设置页底部新增「危险区」。
- 「卸载 Hermes Agent」通过弹窗执行：
  - 展示 Hermes CLI 路径、Hermes Home、当前 Console 实例数量。
  - 默认保留配置与数据。
  - 用户可选择完整卸载。
  - 必须输入 `UNINSTALL HERMES` 才允许执行。
  - 执行期间按钮 loading，完成后刷新环境摘要并输出 CLI 返回。

## 技术设计
- 扩展 `runHermesCommand` 白名单，允许官方卸载相关命令：
  - `gateway install --force`
  - `gateway uninstall`
  - `uninstall --yes`
  - `uninstall --full --yes`
- 前端在 `system.ts` 封装命令，Settings 只调用语义化函数。
- UI 不直接拼任意 CLI 参数，避免把危险命令暴露成通用执行器。

## 验收标准
- `npm run build` 通过。
- 设置页能看到 gateway 重装/卸载服务入口和 Hermes 危险区。
- 未输入确认语时卸载按钮不可点击。
- 执行动作都有 loading，不会重复触发。
- 项目重启后 `http://127.0.0.1:4174/` 可访问，Electron 窗口存在。
