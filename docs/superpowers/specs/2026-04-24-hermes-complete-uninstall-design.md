# Hermes Console 完整卸载设计

## 背景

现有设置页已经支持 `hermes uninstall --full --yes`，但用户反馈点击卸载后本地 Hermes 仍在。只靠官方命令不足以形成 Console 侧可验证的“完整卸载”闭环，因为可能仍残留：

- `~/.local/bin/hermes` CLI 入口或断链 symlink
- `~/.hermes` 数据目录
- Console 注册表中的本地 Native 实例
- gateway 后台服务状态或命令输出残留

## 设计目标

- 在设置危险区提供明确的「完整卸载本机 Hermes」能力。
- 完整卸载不仅运行官方命令，还做本机残留清理与结果检测。
- 保留“卸载程序，保留配置与数据”的轻量卸载选项。
- 所有删除动作必须在弹窗中用更强确认短语触发。
- 开发验证阶段不执行真实卸载命令，只做构建、静态测试和界面检查。

## 完整卸载链路

当用户选择完整卸载并输入 `FULL UNINSTALL HERMES` 后，桌面主进程执行：

1. 尝试停止 gateway：`hermes gateway stop`。
2. 尝试卸载 gateway 服务：`hermes gateway uninstall`。
3. 尝试执行官方完整卸载：`hermes uninstall --full --yes`。
4. 兜底清理安全白名单路径：
   - `~/.local/bin/hermes`
   - `~/.hermes`
5. 清理 Console 注册表中指向 `~/.hermes` 的本地 Native 实例。
6. 重新检查 CLI、`~/.hermes` 和 Console 注册残留，并把结果回显到设置页。

## 安全边界

- 主进程再次校验确认短语，不能只依赖前端按钮禁用。
- 文件删除只允许白名单路径，禁止任意路径删除。
- 失败不中断整体清理，但每一步都会返回状态；最终根据残留检测决定提示成功或仍有残留。
- 不删除远程实例、Docker 实例或其他非 `~/.hermes` 的本地目录。

## UI 调整

- gateway 服务卸载说明明确：不会删除 Hermes CLI、配置或数据。
- 完整卸载选项文案明确列出：服务、CLI、`~/.hermes`、Console 本地 Native 注册。
- 保留数据卸载仍使用 `UNINSTALL HERMES`。
- 完整卸载必须输入 `FULL UNINSTALL HERMES`。

## 验收标准

- 前端有完整卸载选项和强确认短语。
- 主进程暴露 `completeHermesUninstall` IPC。
- 后端完整卸载函数只删除白名单路径。
- 后端会清理 Console 本地 Native 注册实例。
- 测试、构建通过，客户端可启动。
