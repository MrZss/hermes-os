# 供应商卡片与认证方式内聚重构

日期：2026-04-25

## 背景

用户指出供应商页存在两个重复配置入口：上方“当前 AI 接入”能打开配置，下面“提供商目录”也能打开同一个抽屉；同时外层按 OAuth / API Key 分组会让用户误以为是在选择认证类型，而不是选择供应商。

## 设计结论

1. **外层只按供应商展示卡片**
   - 不再按 OAuth / API Key / Endpoint 分组。
   - 已配置、当前或已验证的供应商高亮并排在前面。
   - 上方“当前 AI 接入”只展示摘要、profile 切换与当前配置测试，不再提供重复配置按钮。

2. **认证方式进入供应商内部选择**
   - 每张供应商卡片展示支持的认证方式标签。
   - 打开卡片后，在抽屉内选择 OAuth 登录、API Key 或 Endpoint。
   - API Key 字段只在选择 API Key 时出现；Endpoint 字段只在选择 Endpoint 时出现。

3. **OAuth 必须是真实动作，不是假说明**
   - OAuth 按 Hermes 官方凭据池命令执行：`hermes auth add <provider> --type oauth`。
   - 前端通过 Electron IPC 调用桌面服务。
   - 登录中展示 loading；完成后刷新当前 profile 的 provider 状态。
   - 未检测到 OAuth 凭据或本次 OAuth 未完成时，不允许把 OAuth provider 保存成“已配置”。

4. **保持产品基线**
   - Provider 页面仍为“目录 + 抽屉详情”。
   - 抽屉仍包含认证方式、模型设置、凭据配置和测试连接。
   - 新手路径只保留“选供应商 → 登录或粘贴 Key → 保存 → 测试”，不再展示自动选择 provider 或高级元数据。
   - 保存仍写入 Hermes 官方 profile 配置，凭据仍遵守 `auth.json` / `.env` / `config.yaml` 的真相源边界。

## 验收点

- 主页面没有重复的“配置 AI 提供商”全局按钮。
- 外层目录不再按认证类型分组。
- 已配置供应商高亮并靠前。
- 抽屉标题为“供应商配置”，且认证方式在抽屉内选择。
- OAuth 登录按钮会调用 `authenticateInstanceProvider`，桌面服务执行 `hermes auth add <provider> --type oauth`。
- API Key / Endpoint 输入只在对应认证方式下显示。
- 页面不出现“自动选择 / 自动检测 / 高级配置”作为新手可操作项。
