# Security Policy

## Supported Versions / 支持版本

当前项目仍处于早期开发阶段，安全修复优先落到 `main` 或当前活跃开发分支。发布稳定版本后，会在此处列出明确的支持版本范围。

| Version | Supported |
| ------- | --------- |
| main / active development | Yes |
| older snapshots | Best effort |

## Reporting a Vulnerability / 报告安全问题

如果你发现安全漏洞，请不要在公开 Issue 中直接贴出可被滥用的完整细节。请优先提供以下信息：

- 影响的功能模块（例如远程实例、SSH、供应商配置、消息平台 token、打包产物）。
- 最小复现步骤。
- 影响范围和可能泄露的数据类型。
- 建议修复方向（如果有）。

当前仓库尚未配置专用安全邮箱时，请通过 GitHub Security Advisory（如果仓库已启用）或私下联系维护者报告。维护者确认后会协调修复、回归验证和公开说明。

## Sensitive Data / 敏感数据

请不要提交：

- API Key、OAuth token、Bot token。
- SSH 密码、私钥、服务器地址凭据组合。
- `.env`、本地 Hermes profile 中的真实凭据。
- 用户聊天记录、诊断日志中的个人信息。
