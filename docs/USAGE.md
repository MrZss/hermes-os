# Hermes Console 使用说明

Hermes Console 的宗旨是：一键安装 Hermes，并用最少步骤完成 AI 供应商、消息平台和运行环境配置。

English: Hermes Console provides one-click Hermes installation and guided configuration for AI providers, messaging platforms, and runtime environments.

## 1. 安装与启动

### 开发环境启动

```bash
cd ui
npm ci
npm run desktop:dev
```

### 使用安装包

从发布页下载安装包后打开客户端。首次启动建议先创建或导入一个实例。

## 2. 创建实例

### 本地实例

适合在当前电脑上运行 Hermes。

1. 点击主页的「新建实例」。
2. 选择「本地实例」。
3. 按环境检查提示完成 Hermes CLI 准备。
4. 创建成功后进入实例工作区。

### 远程实例

适合在服务器或 NAS 上运行 Hermes 网关服务。

1. 点击主页的「新建实例」。
2. 选择「远程实例」。
3. 填写服务器地址、SSH 端口、用户名和认证方式。
4. 通过环境检查后继续部署。

> 示例地址请使用自己的服务器信息。不要把真实密码、API Key、Bot Token 写入仓库或截图公开。

## 3. 配置 AI 供应商

进入实例后，先配置「AI 供应商」：

1. 打开「AI 供应商」页面。
2. 选择供应商。
3. 选择认证方式：API Key 或 OAuth（如果供应商支持）。
4. 填写模型、Base URL（如供应商要求）和 Key。
5. 点击保存。客户端会先测试，测试通过后自动保存并关闭弹窗。

常见占位示例：

```txt
API Key: <your-api-key>
Base URL: https://example.com/v1
Model: <provider-model-name>
```

## 4. 配置消息平台

进入「消息平台」页面，至少启用一个平台后再使用会话功能。

当前保留入口：

- Telegram：通常需要 Bot Token 和用户/频道 ID。
- 微信：按客户端二维码和页面引导完成绑定。
- QQ：按 QQ 开放平台配置 Bot，并根据配对码完成授权。
- 飞书：按飞书开放平台应用信息配置。

保存成功后弹窗会自动关闭；如果平台需要额外配对，页面会给出短提示。

## 5. 会话与工作区

AI 供应商和消息平台都配置完成后，可以进入：

- 主页：查看实例状态和快捷入口。
- 会话：测试与 AI 的交互效果。
- 档案：查看当前 Hermes profile 信息。
- 部署管理、环境检查、诊断：用于排查运行问题。

如果缺少必要配置，使用页会显示蒙层，并提供跳转按钮。

## 6. 导入现有实例

导入时客户端会读取实例当前状态，包括：

- AI 供应商和默认模型。
- Telegram / 微信 / QQ / 飞书等消息平台状态。
- 运行服务与网关状态。

读取失败时不会默认判定为可用，请按页面提示重试或进入诊断。

## 7. 数据与凭据安全

- 不要提交真实 API Key、Bot Token、服务器密码、私钥或个人 IP。
- 示例文档只使用占位符和保留测试网段。
- 本地运行数据保存在 Electron 用户数据目录和 Hermes 实例目录中。
- 开源前请运行测试和敏感信息扫描。

```bash
for f in ui/tests/*.test.mjs; do node "$f"; done
cd ui && npm run build
```
