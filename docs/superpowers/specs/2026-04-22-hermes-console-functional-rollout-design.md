# Hermes Console 功能对接分阶段开发设计文档

> 日期：2026-04-22  
> 范围：Hermes Console 从 UI 基线进入真实功能对接阶段  
> 方法：遵守既有产品基线、官方 Hermes 体系与 superpowers 开发流程，按模块分阶段闭环开发并逐阶段验收。

---

## 1. 目标

本设计解决的问题不是“把页面随便接点数据”，而是把 Hermes Console 从 UI 原型正式推进到真实桌面客户端。

本轮设计目标：

1. 明确 Hermes Console 与 Hermes 官方能力的边界。
2. 明确功能对接的真相源，避免继续维护平行状态系统。
3. 将功能开发拆成可闭环、可验收、可逐步发布的阶段。
4. 规定第一阶段只打通一条最稳的真实链路：**本地 Docker 实例闭环**。
5. 为后续 `profile / provider / gateway / logs / backups / remote SSH` 留出稳定扩展路径。

一句话：

> 先把一条真实链路打透，再逐层扩展，而不是把所有页面一起“半接线”。

---

## 2. 核心原则

### 2.1 官方真相源优先
涉及 Hermes 内部对象时，优先使用 Hermes 官方 CLI、配置目录和运行状态。

包括但不限于：
- `HERMES_HOME`
- `config.yaml`
- `.env`
- `auth.json`
- `profiles`
- `providers`
- `gateway`
- `logs`
- `backup`
- Hermes CLI 命令结果

### 2.2 Console 只维护“多实例目录索引”
Hermes 官方能力只覆盖单实例内部状态；Hermes Console 需要额外承担“多实例管理壳层”的职责。

因此 Console 可以拥有自己的真相源，但只限：
- 实例列表
- 实例位置
- 实例类型
- 实例运行方式
- 最近一次状态快照
- 最近探测时间

### 2.3 诚实交互原则继续生效
功能对接阶段仍必须遵守：
- 不新增假交互
- 不新增伪状态
- UI 中任何强交互都必须可执行，或降级为只读/disabled
- 不允许“看起来接通，实际还是 mock”的灰色状态长期存在

### 2.4 纵向闭环优先于横向铺开
功能开发顺序必须优先满足：
- 一个完整路径真正跑通
- 页面状态真实回流
- 用户可感知的闭环成立

而不是：
- 一次改很多页面
- 每页都接一点点
- 最终没有一条链路能真正使用

---

## 3. 真相源模型

## 3.1 Hermes 真相源
负责单个实例内部状态。

职责范围：
- 当前 Hermes 配置
- 当前 profile/provider/gateway 状态
- 当前 CLI 诊断结果
- 当前 logs/backup 状态
- 运行时配置目录和文件

工程上依赖：
- Hermes CLI
- `HERMES_HOME`
- 配置文件和目录
- Docker / Native 运行状态

结论：

> Hermes 只回答“这个实例内部现在是什么状态”。

## 3.2 Console 真相源
负责多个实例的外层管理。

职责范围：
- Console 管理了哪些实例
- 每个实例在哪个目录
- 每个实例是本地还是远程
- 每个实例走 Docker 还是 Native
- 每个实例最近一次探测得到的状态摘要

不负责：
- profile 内部配置真相
- provider 内部配置真相
- gateway 细节真相
- chat 内容真相

结论：

> Console 只回答“我管理哪些实例，以及如何找到它们”。

---

## 4. 多实例设计

## 4.1 本地实例隔离方式
v1 功能对接采用：

> **每个本地实例拥有独立 `HERMES_HOME` 目录。**

`~/.hermes` 只作为：
- 现有用户环境的兼容来源
- 后续可能的导入来源
- 默认 Hermes CLI 环境的参考位置

不作为多实例共享目录。

### 原因
如果多个本地实例共用 `~/.hermes`：
- profile 会互相污染
- provider/gateway 状态会串
- Dashboard 的多实例会退化成假能力
- 后续远程与本地实例模型会越来越乱

### 结果
每个本地实例至少有：
- 独立工作目录
- 独立 `HERMES_HOME`
- 独立运行时辅助文件
- 独立可探测状态

## 4.2 实例注册表
Console 自己维护一份实例注册表，作为多实例目录索引。

建议使用 JSON 文件开始，而不是一上来引入 SQLite。

建议字段：

```json
{
  "version": 1,
  "instances": [
    {
      "id": "local-studio",
      "name": "本地创作环境",
      "type": "local",
      "runtime": "docker",
      "hermesHome": "<instances-root>/local-studio/home",
      "workspaceDir": "<instances-root>/local-studio",
      "endpoint": "http://127.0.0.1:8642",
      "status": "running",
      "createdAt": "2026-04-22T17:40:00+08:00",
      "lastCheckedAt": "2026-04-22T18:00:00+08:00"
    }
  ]
}
```

---

## 5. 桌面端模块结构

## 5.1 Renderer UI 层
位置：
- `ui/src/app/pages/*`
- `ui/src/app/layout/*`
- `ui/src/app/context/*`

职责：
- 展示状态
- 触发动作
- 不直接执行命令、不直接访问本地文件系统

## 5.2 Renderer Service 层
建议新增：
- `ui/src/app/services/system.ts`
- `ui/src/app/services/instances.ts`
- `ui/src/app/services/runtime.ts`

职责：
- 封装前端对 Electron bridge 的调用
- 统一 DTO 转换
- 做轻量刷新与缓存

## 5.3 Preload Bridge 层
位置：
- `ui/desktop/preload.mjs`

职责：
- 暴露受控桌面 API
- 不承载业务决策

建议接口：
- `getDesktopPaths()`
- `inspectLocalEnvironment()`
- `listInstances()`
- `createLocalDockerInstance(input)`
- `startInstance(id)`
- `stopInstance(id)`
- `getInstanceState(id)`

## 5.4 Electron Main Service 层
建议新增：
- `ui/desktop/services/environment.mjs`
- `ui/desktop/services/hermes-cli.mjs`
- `ui/desktop/services/instance-registry.mjs`
- `ui/desktop/services/local-runtime.mjs`
- `ui/desktop/services/instance-state.mjs`

职责：
- 读写注册表
- 调用 Hermes CLI
- 调用 Docker
- 创建实例目录
- 聚合实例状态

## 5.5 本机真相源层
- Console 注册表
- 每个实例自己的 `HERMES_HOME`
- Docker / 本机运行时状态

---

## 6. 分阶段路线图

## 6.1 阶段 1：本地 Docker 实例闭环

### 目标
打通第一条真实链路：
- 本地环境探测
- 本地实例注册
- 本地 Docker 实例创建
- 启动 / 停止 / 状态读取
- UI 回流到 Dashboard / Create / Overview

### 范围
本阶段只做：
- 本地
- Docker
- 已有 Hermes CLI

### 明确不做
- 远程 SSH
- Native 本地实例
- provider/profile 的真实写操作
- gateway 真实启停
- logs / backups 真接线
- chat 真调用
- Hermes CLI 安装/升级

### 完成后用户可做的事
- 创建本地 Docker 实例
- 看到真实实例出现在 Console
- 启动 / 停止实例
- 再次打开客户端时实例仍可被发现

---

## 6.2 阶段 2：本地实例增强

### 目标
在阶段 1 闭环基础上，补本地缺失能力。

### 包含
- Native 本地实例
- Hermes CLI 安装/升级入口
- `doctor` 诊断回流
- 本地实例更细粒度状态探测

### 结果
本地链路基本完整，能覆盖多数单机用户。

---

## 6.3 阶段 3：Hermes 官方对象同步

### 目标
让 `Profiles / Providers / Integrations` 开始脱离 mock。

### 优先顺序
1. 只读同步
2. 状态展示真实化
3. 少量安全可控写操作

### 范围
- `hermes profile list/show/use`
- provider / model 读取
- gateway status / setup 基础状态读取

### 原则
先同步真实状态，再开放写操作，避免一上来把配置写炸。

---

## 6.4 阶段 4：远程实例闭环

### 目标
接通 SSH 远程实例。

### 包含
- SSH 环境探测
- 远程实例注册
- 远程 Docker 启停/状态读取
- 远程创建流程真实化

### 原则
重用阶段 1 的实例注册表和状态 DTO，不再重做一套远程页面模型。

---

## 6.5 阶段 5：运行与恢复

### 包含
- logs 真实接入
- backups 真实接入
- 基础诊断与恢复动作

---

## 6.6 阶段 6：工作区真实化

### 包含
- chat/workspace 真实绑定实例
- 与当前 profile/provider/gateway 的真实联动

---

## 7. 第一阶段模块拆解

## 模块 1：桌面基础能力桥

### 目标
建立前端和本机真实能力之间的安全桥接。

### 必做
- app data 路径
- 实例根目录路径
- 本机环境读取
- 受控 Hermes CLI 调用
- 受控 Docker 调用
- JSON 注册表读写

### 验收标准
- 前端拿到真实环境摘要
- 命令错误返回结构化对象
- build 通过

---

## 模块 2：实例注册表

### 目标
让 Console 真正拥有实例目录索引。

### 必做
- 初始化注册表
- 列表读取
- 新增实例
- 更新状态快照
- 根据 id 查询

### 验收标准
- 重启后实例不丢
- 注册表损坏可恢复为空结构
- Dashboard / Sidebar 可读真实实例列表

---

## 模块 3：本地 Docker 实例创建器

### 目标
把创建向导接到真实本地实例创建。

### 必做
- 创建实例目录
- 创建独立 `HERMES_HOME`
- 写入注册表
- 启动 Docker 实例初始化链路
- 返回创建结果 DTO

### 验收标准
- 创建成功后实例目录真实存在
- `HERMES_HOME` 真实存在
- 注册表新增实例
- 创建完成页展示真实实例摘要

---

## 模块 4：本地实例运行控制

### 目标
让实例真正可启停、可探测。

### 必做
- `startInstance(id)`
- `stopInstance(id)`
- `getInstanceState(id)`
- Docker / Hermes CLI 状态聚合

### 验收标准
- 桌面端可启动/停止实例
- Dashboard / Overview 状态真实变化
- 重开应用后状态仍可重新探测

---

## 模块 5：前端真状态接入

### 优先接入页面
- `Dashboard`
- `CreateInstance`
- `instance/Overview`

### 暂不接入页面
- Chat
- Profiles 真实写操作
- Providers 真实写操作
- Integrations 真实写操作
- Logs
- Backups

### 验收标准
- 这 3 页不再以 `console.ts` 为主真相源
- 刷新后状态仍保留
- 创建 / 启停 / 状态读取形成 UI 闭环

---

## 8. 第一阶段状态模型

建议统一内部状态：
- `creating`
- `running`
- `stopped`
- `warning`
- `failed`
- `unknown`

映射到现有 UI 展示：
- `running -> 正常`
- `warning -> 警告`
- `stopped / failed / unknown -> 离线或失败态`

原则：
- 先保持 UI 稳定
- 再逐步扩状态标签

---

## 9. 第一阶段错误处理

## 9.1 错误分层

### A. 用户可修复错误
例如：
- Docker 未启动
- 目录不可写
- 端口占用

要求：
- 页面要给出明确提示
- 可以重试或回到上一步

### B. 运行时错误
例如：
- Hermes CLI 调用失败
- Docker 命令失败
- 状态探测超时

要求：
- 返回结构化错误
- 在 UI 上有明确失败态
- 不允许静默失败

### C. 数据错误
例如：
- 注册表损坏
- 实例目录缺失
- 记录与真实目录不一致

要求：
- 可自动降级为空态或失效态
- 不允许直接把页面打崩

## 9.2 错误对象建议
统一错误结构：

```ts
{
  code: string;
  message: string;
  detail?: string;
  recoverable: boolean;
}
```

---

## 10. 第一阶段最终验收路径

必须完整跑通以下路径：

1. 打开桌面客户端
2. 进入创建实例
3. 选择本地实例
4. 选择 Docker
5. 创建实例成功
6. Dashboard 出现真实新实例
7. 进入实例概览页看到真实状态
8. 停止实例
9. 状态改变
10. 再启动实例
11. 状态恢复
12. 退出并重开客户端，实例仍存在且可重新探测

技术验收同时必须满足：
- `npm run build` 通过
- Electron 可正常启动
- 无新增假交互
- 注册表持久化正常
- 实例目录与 `HERMES_HOME` 创建正常
- CLI / Docker 错误能回到 UI

---

## 11. 开发流程要求

后续所有功能对接模块，必须严格按以下流程执行：

1. 先写 spec
2. 再写实施计划
3. 再开始实现
4. build 验证
5. 桌面端自验
6. 中文 git commit
7. 汇报“这个版本做了什么”
8. 再进入下一个模块

禁止：
- 未出 spec 直接开改
- 一次跨多个阶段乱做
- 一堆页面半接线后再统一修
- build 没跑就宣称完成

---

## 12. 本设计的结论

本轮功能对接的推荐路径已经确定：

- **总策略**：纵向闭环分阶段开发
- **真相源策略**：Hermes 官方真相源 + Console 实例注册表
- **第一阶段策略**：本地优先、Docker 优先、已有 Hermes CLI 优先
- **实例隔离策略**：每个本地实例独立 `HERMES_HOME`
- **验收策略**：每一块独立闭环、独立 build、独立验收

这套路径的核心价值是：

> 先把“本地 Docker 实例真的活起来”做通，再接 profile/provider/gateway/SSH，而不是继续在页面层制造半真半假的能力错觉。
