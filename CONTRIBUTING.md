# Contributing to Hermes Console

感谢你愿意为 Hermes Console 做贡献。本项目是 Hermes Agent 的桌面控制台，任何改动都应优先保证“安装简单、配置清晰、非技术用户能跑通”。

## 开发流程

1. Fork 或 clone 仓库。
2. 阅读 `README.md`、`docs/PRODUCT_BASELINE_Hermes_Console_v1.md`、`docs/PAGE_SPEC.md` 和 `docs/UI_RULES.md`。
3. 进入 `ui` 安装依赖：

   ```bash
   cd ui
   npm ci
   ```

4. 启动桌面开发版：

   ```bash
   npm run desktop:dev
   ```

5. 修改前优先补充或更新 `ui/tests/*.test.mjs` 中的边界断言。
6. 修改后运行测试和构建。

## 提交规范

- 提交信息建议使用简短中文，说明“本次做了什么”。
- 每个 PR 聚焦一个主题，避免把 UI、功能、重构、依赖升级混在一起。
- 不提交本地产物目录：`ui/dist/`、`ui/release/`、`ui/node_modules/`。
- 不提交 `.env`、API Key、SSH 密码、聊天平台 token 等敏感信息。

## Pull Request

发起 Pull Request 前请确认：

```bash
for f in ui/tests/*.test.mjs; do node "$f"; done
cd ui && npm run build
```

PR 描述应包含：

- Summary：改动摘要
- Test Plan：实际运行过的验证命令
- Screenshots：涉及 UI 时提供截图或说明
- Risk：是否影响实例创建、供应商配置、消息平台配置或打包

## 代码风格

- UI 文案以中文为主，短句优先。
- 页面结构遵守 `docs/PAGE_SPEC.md`。
- 视觉风格遵守 `docs/UI_RULES.md`。
- 涉及后台任务必须有 loading / disabled 状态。
- 错误提示先给人话结论，再提供技术细节。

## 发布与打包

本地可运行：

```bash
cd ui
npm run pack:mac
npm run pack:win
npm run pack:all
```

正式发布前需要补齐平台签名和公证。不要把未确认的签名证书、密钥或发布 token 提交到仓库。
