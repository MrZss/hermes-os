# Hermes 官方配置体系对齐审查与重构设计

## 背景

当前 Hermes Console 已经完成桌面端 UI 基线与主工作流页面，但在“配置项归属”和“对象建模”上仍存在明显偏差：

- `档案` 页面还停留在本地 mock 数组层，未映射 Hermes 官方 `profile`
- `提供商` 页面仍是泛化连接卡片，未严格对齐 Hermes 官方 `model/provider` 配置
- `集成` 页面目前更像 SaaS 接入墙，缺失 Hermes 官方最核心的 `gateway` 体系
- `设置` 页面混入了若干不应作为应用级真相源的配置项
- `创建实例` 的第 `4` 步仍在使用产品层抽象，没有清晰映射 Hermes 官方配置路径

用户已明确确认两条优先级规则：

1. 当本地产品文档与 Hermes 官方能力模型冲突时，**以 Hermes 官方体系为准**
2. 对于 Hermes 官方没有明确一等配置模型的现有泛化接入项，**从 v1 主界面移除**

因此，本轮不是微调 UI 文案，而是要把所有“有配置真相源含义”的页面，统一收回到 Hermes 官方对象模型和配置体系。

---

## 目标

本轮设计目标：

1. 将 Hermes Console 中的配置型页面对齐 Hermes 官方对象模型
2. 消除当前前端中“第二套伪配置系统”的趋势
3. 让后续真实接入 `Hermes CLI / config.yaml / .env / gateway / profile / provider` 时不需要推翻 UI 结构
4. 保持当前 v1 信息架构不扩页，只重构页面职责和字段归属

---

## 非目标

本轮不做以下事情：

- 不直接接入 Hermes 官方运行时或 CLI
- 不新增一级导航
- 不在本轮实现完整的 Skills 管理页
- 不在本轮实现完整的 Plugins 管理页
- 不扩展 Memory Providers、MCP、Training 等高级能力页面
- 不把“官方暂未明确的一等配置对象”继续包装成 v1 核心配置页

---

## 官方真相源

根据 Hermes 官方文档，当前应视为配置真相源的对象和文件包括：

- `~/.hermes/config.yaml`
  - 非敏感设置主配置
- `~/.hermes/.env`
  - API keys、bot tokens、passwords 等 secrets
- `~/.hermes/auth.json`
  - OAuth provider credentials
- `~/.hermes/`
  - 默认 profile 根目录
- `~/.hermes/profiles/<name>/`
  - 非默认 profile 根目录
- `hermes model`
  - provider / model 配置入口
- `hermes profile`
  - profile 生命周期管理入口
- `hermes gateway`
  - 消息平台、API Server、Webhooks 等统一接入入口
- `plugins.enabled` in `config.yaml`
  - 插件启用状态
- `~/.hermes/skills/`
  - skills 存储目录

核心规则：

- **Secrets 进 `.env`**
- **非敏感设置进 `config.yaml`**
- **profile 自带隔离目录和隔离状态**
- **skills 不是 integrations**
- **plugins 不是 providers**
- **gateway 是消息平台和程序化接入的统一入口**

---

## 审查结论

### 1. 档案页偏差

当前问题：

- 页面对象是 UI mock，不是 Hermes 官方 `profile`
- “档案详情”里混入了环境变量、工具授权等重编辑区
- 档案对象边界模糊，容易被误解成轻量标签或工作区筛选器

结论：

- `档案` 必须保留
- 但它应严格回归 Hermes 官方 `profile`

### 2. 提供商页偏差

当前问题：

- 页面按“API 密钥 / OAuth / 自定义 Endpoint”做静态分组
- 默认将 `API Key`、`Endpoint` 视为所有 provider 的通用表单字段
- 混入“失败回退”“备用模型”等未确认的稳定一等配置语义

结论：

- `提供商` 必须保留
- 但应回到 Hermes 官方 `model/provider` 体系
- 配置表达应以 Hermes 官方 provider 类型和运行路径为中心

### 3. 集成页偏差

当前问题：

- 页面当前偏向 GitHub / Notion / Linear 这类泛化三方接入
- 缺失 Hermes 官方最重要的 `Messaging Gateway`
- 容易把 skills / tools / 第三方服务混成“集成”

结论：

- `集成` 必须重构
- v1 主体应优先展示 Hermes 官方外部接入面：
  - Messaging Gateway
  - API Server
  - ACP Editor Integration
  - Webhooks
  - Home Assistant

### 4. 设置页偏差

当前问题：

- 当前页面中存在“默认 SSH 用户名”“默认端口”“默认安装方式”“日志保留周期”等伪全局配置
- 这些字段没有明确的 Hermes 官方全局设置真相源
- 容易把实例级、部署级和应用级配置混在一起

结论：

- `设置` 必须做减法
- 应回到“应用偏好 + Hermes 配置入口 + 诊断维护入口”

### 5. 创建实例第 4 步偏差

当前问题：

- 当前 Step 4 仍停留在产品层抽象
- provider 与 profile 仅通过轻量表单输入表达
- 没有明确体现“创建后映射到 Hermes 官方 provider/profile 配置”

结论：

- 保留 5 步向导
- 第 4 步需改成“模型提供商与默认档案”

---

## 推荐方案

采用 **方案 A：按 Hermes 官方对象模型重组 v1**。

原因：

- 与 Hermes 官方体系最一致
- 后续真实接入时成本最低
- 不会再产生第二套平行配置系统
- 与用户已确认的两条原则完全一致

不采用其他方案的原因：

- 仅改文案/分组会保留结构性债务
- 单独做一层控制台抽象映射，会引入 v1 不必要复杂度

---

## 统一对象模型

后续 Hermes Console 的配置型页面统一按下列对象关系建模：

- **实例**
  - Hermes Console 的本地/远程部署与连接壳层对象
- **档案**
  - Hermes 官方 `profile`
- **提供商**
  - Hermes 官方 `model/provider`
- **集成**
  - Hermes 官方外部接入面：
    - Messaging Gateway
    - API Server
    - ACP
    - Webhooks
    - Home Assistant
- **技能**
  - Hermes `skills`
- **插件**
  - Hermes `plugins`

强约束：

- `Profile ≠ 标签 ≠ 会话筛选器`
- `Skills ≠ 集成`
- `Plugins ≠ 提供商`
- `Messaging Platforms ≈ 集成页核心对象`

---

## 页面重构方案

## 1. 创建实例

### 保留

- 固定 5 步流程
- 第 1 步选择目标
- 第 2 步环境预检
- 第 3 步安装方式
- 第 5 步最终确认与部署

### 调整

第 `4` 步从“提供商与档案”进一步收正为：

- **模型提供商与默认档案**

### 字段归属

保留：

- provider 选择
- 默认档案名称
- 模型选择

重构：

- provider 列表与分组应对齐 Hermes 官方 provider 体系
- 自定义 Endpoint 只在 `custom/self-hosted` provider 场景出现
- 默认档案名称明确映射为创建后的 Hermes profile

避免：

- 把所有 provider 都强行套成同一张“API Key + Endpoint”表单
- 用模糊的“Gateway 开关”承载多个不同官方能力

---

## 2. 档案页

### 新页面目标

将当前页面明确改造成 **Hermes 官方 Profile 管理页**。

### 保留能力

- 新建档案
- 克隆档案
- 重命名
- 删除
- 导出
- 导入
- 设为默认

### 首页卡片字段

统一为：

- 档案名称
- 默认状态
- 当前 provider / model 摘要
- 会话数量
- 最近使用时间
- gateway / 运行状态摘要（如果有）

### 抽屉方向

档案详情抽屉保留，但职责改为：

- 基础信息
- provider/model 摘要
- profile 状态
- 导入导出 / 默认切换 / 删除等动作

不在 v1 主抽屉中继续放大面积的：

- 环境变量大表单
- 工具授权常驻编辑区
- 与 profile 真相源无明确映射的自定义设置面板

---

## 3. 提供商页

### 新页面目标

改造成 **Hermes 模型提供商与模型配置页**。

### 页面应表达的核心信息

- 当前默认 provider
- 当前默认 model
- 已配置 provider 列表
- provider 认证状态
- provider 类型
- 模型可用性 / 连接测试

### 分组原则

优先按 Hermes 官方 provider 类型和能力路径组织，不再使用当前单纯的视觉分组卡表达全部逻辑。

### 字段规则

允许：

- provider 名称
- 当前状态
- 认证方式摘要
- 模型数量或模型摘要
- 测试连接

约束：

- `API Key` 不是所有 provider 的通用字段
- `Endpoint` 不是所有 provider 的通用字段
- `OAuth` provider 不能伪装成纯手填表单

### 详情抽屉方向

提供商详情抽屉应优先承担：

- 认证信息摘要
- model/provider 摘要
- 状态区
- 测试连接
- 切换默认 provider/model 的入口

---

## 4. 集成页

### 新页面目标

将页面从“泛化第三方接入墙”重构为 **Hermes 官方外部接入页**。

### 页面主结构

建议改成三大组：

#### A. 消息平台 / Gateway

- Telegram
- Discord
- Slack
- WhatsApp
- Signal
- Matrix
- Mattermost
- Email
- SMS
- DingTalk
- Feishu / Lark
- WeCom
- WeCom Callback
- Weixin
- BlueBubbles
- QQ Bot
- Home Assistant
- Webhooks

#### B. 程序化接入

- API Server
- ACP Editor Integration

#### C. 扩展入口

- 插件入口（仅入口，不铺复杂配置）

### 从 v1 主页面移除

以下项不作为本轮 v1 集成页核心对象继续保留：

- GitHub
- Notion
- Linear

它们如果未来要保留，应在 vNext 里以“扩展能力”重新定义，而不是继续占据 Hermes 官方集成页核心位置。

### 详情抽屉配置方向

不同平台抽屉必须按 Hermes 官方配置模式设计：

- token 型
- webhook / callback 型
- websocket / polling 型
- allowlist / pairing 型

不再继续使用“统一 access token + allowlist 文本域”作为所有平台共用模板。

---

## 5. 设置页

### 新页面目标

设置页只负责：

- 应用偏好
- Hermes 配置位置摘要
- 诊断与维护入口

### 保留项

- 语言
- 客户端偏好
- 主题（若仍保持 light-first，则只保留轻量表达）
- 高级面板入口

### 新增摘要区

建议新增 Hermes 配置位置概览：

- `config.yaml`
- `.env`
- `auth.json`
- `HERMES_HOME`

### 迁出项

以下不再放在应用级设置页中作为核心配置：

- 默认 SSH 用户名
- 默认 SSH 端口
- 默认安装方式
- 日志保留周期

这些字段若未来需要，必须回到：

- 实例级
- 部署级
- 或 Hermes 官方明确的配置路径

### 新增维护入口

设置页应承担统一入口，而不是承担全部表单编辑：

- 打开配置文件
- 打开日志目录
- 查看 gateway status
- 运行 doctor
- 打开高级面板

---

## 信息架构影响

本轮不新增一级导航，也不删除一级导航。

保留原有壳层：

- 概览
- 会话
- 档案
- 提供商
- 集成
- 日志
- 备份
- 设置

本轮只修正其对象归属、字段语义与配置真相源。

---

## 实施顺序建议

建议按以下顺序改造：

1. 集成页
2. 提供商页
3. 档案页
4. 创建实例 Step 4
5. 设置页
6. 同步修正文档

原因：

- 集成页当前偏差最大，且最容易继续误导后续实现
- 提供商与档案是核心对象，需要在集成页之后一起收正
- 创建实例 Step 4 必须与前述两页对齐
- 设置页最后减法最安全

---

## 验收标准

完成本轮重构后，应满足：

1. 用户不再把 `skills` 误解为 `集成`
2. 用户能在 `集成` 页里优先看到官方 gateway 平台，而不是泛化 SaaS 接入项
3. `档案` 页明确表现为 Hermes `profile`
4. `提供商` 页明确表现为 Hermes `model/provider`
5. `设置` 页不再承担伪全局真相源
6. `创建实例` 第 4 步与官方 provider/profile 语义一致
7. 后续真实接 Hermes CLI/API 时，不需要再推翻本轮信息架构

---

## 实施前限制

在实现开始前，必须继续遵守以下限制：

- 不新增新的一级导航
- 不私自把 Skills / Plugins 页面拉进 v1 核心导航
- 不在 UI 中发明 Hermes 官方没有的一等配置对象
- 不将不确定的运行时字段伪装成稳定配置项

---

## 结论

Hermes Console v1 后续的配置型页面必须从“产品自定义抽象”回归到“官方配置模型驱动”。

最终方向不是让 Console 拥有一套平行于 Hermes 的配置系统，而是让它成为：

**围绕实例壳层组织的、对 Hermes 官方对象与配置进行桌面化表达的控制台。**
