# AI Provider 接入重调研与供应商页 UI/UX 重构

日期：2026-04-24

## 重新调研结论

1. OpenClaw 的 AI 接入不是“在列表页堆一个通用表单”，而是先选 provider，再维护凭据与模型。官方 provider 文档体现为：Anthropic 可以通过 `openclaw onboard --anthropic-api-key` 注入 Key；OpenAI 区分 API Key 路由、Codex/OAuth 路由与 Azure/OpenAI-compatible 高级配置。
2. OpenClaw FAQ 明确说明 credentials 与 model selection 是分开的；凭据只解决认证，默认模型仍需要单独选择。
3. Hermes Agent 的官方模型体系以 `model.provider` / `model.default` 为配置核心；API Key 由 `~/.hermes/.env` 管理，OAuth 凭据在 `auth.json`，`hermes config set` 会把 API keys 写到 `.env`、其他配置写到 `config.yaml`。
4. Hermes 的 Provider 页面应回到产品基线中的“目录 + 抽屉详情”模式：列表负责扫描定位，抽屉负责完整配置；不能在主视图平铺一个像普通设置页的大表单，也不能把所有 provider 字段一次性展开。

## 本轮根因

上一版为了回应“没有地方输入”，在主视图顶部加了一个“接入 AI 供应商”表单。这个修法解决了表面入口问题，但破坏了产品定义：

- 主视图变成普通大表单，和“目录 + 抽屉详情”冲突。
- 当前 provider 摘要、provider 目录、编辑态三种状态混在同一屏。
- OAuth / API Key / Custom Endpoint 的配置心智没有被分层表达。
- 用户需要“先知道当前接入是什么，再进入配置”，而不是被一个横向表单打断。

## 新 UI/UX 设计

### 页面主结构

1. **当前 AI 接入**
   - 显示当前 profile 的 provider、model、状态与当前配置测试。
   - profile 切换保留在当前接入区域，不再单独占一个大卡片。

2. **提供商目录**
   - 不按 OAuth / API Key / Custom Endpoint / Self-Hosted 分组。
   - 已配置和新手常用供应商优先展示。
   - 卡片只展示扫描信息：状态、认证摘要、默认模型、当前标记。
   - 卡片动作统一为“配置”，进入抽屉。

3. **配置 AI 提供商抽屉**
   - 第一段：选择供应商。
   - 第二段：认证方式。
   - 第三段：模型设置。
   - 第四段：凭据配置（OAuth 登录、API Key 输入、Custom Endpoint 输入）。
   - Footer：测试连接、保存并设为当前供应商。
   - 不展示自动选择 provider 或高级配置入口。

## 验收点

- 主页面不能再出现被否定的“接入 AI 供应商”顶部表单。
- 必须出现“当前 AI 接入”和“提供商目录”。
- 配置行为必须通过“配置 AI 提供商”抽屉完成。
- 抽屉必须包含选择供应商、认证方式、模型设置、凭据配置。
- OAuth 必须说明凭据由 Hermes 管理。
- API Key 与 Custom Endpoint 必须有真实输入字段。
- 保存按钮必须清楚标记为“保存并设为当前供应商”。

## 参考来源

- OpenClaw Anthropic provider：`https://docs.openclaw.ai/providers/anthropic`
- OpenClaw OpenAI provider：`https://docs.openclaw.ai/providers/openai`
- OpenClaw Model Providers：`https://docs.openclaw.ai/concepts/model-providers`
- OpenClaw FAQ：`https://docs.openclaw.ai/start/faq/`
- Hermes Agent AI Providers：`https://hermes-agent.nousresearch.com/docs/integrations/providers`
- Hermes Agent Configuration：`https://hermes-agent.nousresearch.com/docs/user-guide/configuration/`
