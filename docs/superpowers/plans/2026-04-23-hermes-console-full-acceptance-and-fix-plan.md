# Hermes Console 全量自验结果与修复计划（2026-04-23）

## 本次自验范围
- 桌面启动链路：Electron + Vite + 路由可达
- 本地环境：Hermes CLI / Docker 探测
- 实例链路：本地实例创建、注册表、状态读取、网关启动失败回传
- Hermes 官方对象：Profiles / Providers / Integrations 真实写操作
- 运行维护：Diagnostics / Logs / Backups
- 工作区：会话列表、重命名、删除、chat 发送错误回传
- 远程预检：SSH 参数缺失与私钥缺失错误回传

## 自验结论
结论分为三层：

1. **服务层主链路大体可用**
   - 本地实例失败态可诚实落盘
   - profile/provider/integration 写入可用
   - backups create/restore/delete 可用
   - session rename/delete 可用
   - 远程预检错误码回传可用

2. **产品层仍有 4 个阻塞项**
   - `instances.json` 为空时，桌面首页与工作区仍留有对 `local-studio / remote-gateway` 的历史假定
   - `profile import` 会破坏已有 profile 集合，是当前最严重的功能 bug
   - 创建失败后的实例不能直接通过“启动”恢复，返回 `INSTANCE_CONTAINER_MISSING`
   - `Settings` 仍是静态摘要页，维护动作未接线

3. **当前环境限制是真实存在的，但不是主借口**
   - 本机 `Hermes CLI` 可用
   - 本机 `Docker` 已安装但 daemon 未运行
   - 这会阻断本地 Docker 真启动，但不影响我们确认产品是否诚实回传错误、是否保持状态一致

## 关键证据
### 1. 当前桌面真实环境
- Hermes CLI：可用
- Docker：可用但 daemon 未运行
- 应用注册表：`/Users/zhachenhao/Library/Application Support/Electron/instances.json`
- 当前注册表内容：`instances: []`

### 2. 主链路验证结果
- `createLocalDockerInstance`：返回 `DOCKER_DAEMON_UNAVAILABLE`，同时实例目录、`HERMES_HOME`、注册表记录均已创建
- `listInstanceStates` / `getInstanceState`：可读到 `failed` 状态
- `create/rename/set-default/delete profile`：通过
- `update provider/integration`：通过
- `getInstanceOfficialState(profile=alpha)`：通过
- `getInstanceDiagnostics` / `getInstanceLogs`：通过
- `create/restore/delete backup`：通过
- `list/rename/delete workspace session`：通过
- `runInstanceWorkspaceChat`：在无可用 provider 响应时返回真实非零退出，不伪造成功
- `inspectRemoteEnvironment`：
  - 缺 host → `SSH_HOST_REQUIRED`
  - 缺私钥 → `SSH_KEY_NOT_FOUND`

## 阻塞问题清单

### P0-1：profile import 会吞掉已有 profile
**现象**
- 最小复现：
  1. 创建 `alpha`
  2. 导出 `alpha`
  3. 以 `imported-alpha` 导入
- 结果：导入后 `profiles` 目录只剩 `imported-alpha`，原始 `alpha` 消失

**影响**
- 这是破坏性写操作
- 导入不再是“新增档案”，而变成“替换当前 profile 集合”
- 用户会误以为旧档案仍在，实际已经丢失

**判断**
- 当前不能继续把 `hermes profile import` 直接暴露为桌面端导入动作

**修复方案**
- 不再直接在目标实例上执行 `hermes profile import`
- 改为：
  1. 在临时隔离 `HERMES_HOME` 中执行导入
  2. 提取导入后的 profile 目录
  3. 显式复制到目标实例的 `profiles/<name>`
  4. 导入前做同名检测与备份
- 导入完成后刷新 official state，并校验旧 profile 数量不减少

---

### P0-2：失败态实例无法从“启动”动作恢复
**现象**
- 创建本地实例时若 Docker daemon 未运行，实例进入 `failed`
- 此后调用 `startInstanceGateway` 返回 `INSTANCE_CONTAINER_MISSING`

**影响**
- 用户恢复 Docker 后，不能直接从 Overview/Integrations 的“启动”操作恢复实例
- 当前产品缺少“失败后重试部署”闭环

**修复方案**
- 对 `failed + docker runtime` 增加 `redeploy / retry bootstrap` 语义
- `startInstance` 需分流：
  - 已有 container → 正常 start
  - 无 container 但 runtime metadata 存在 → 重跑 `docker run` / bootstrap
- UI 上把按钮文案从“启动”改成“重试部署/启动”或按状态动态切换

---

### P1-1：当前桌面注册表为空，但页面仍残留历史 fallback 路由假定
**现象**
- 当前真实 `instances.json` 为空
- 但前端仍保留 `local-studio / remote-gateway / wsl-lab` 静态数据
- `Overview/Chat/RootLayout/Dashboard` 仍有 fallback 兜底逻辑
- `Profiles/Providers/Integrations` 则会在实例不存在时报错

**影响**
- 首次打开桌面端时，部分页面按真实空态工作，部分页面仍尝试展示历史静态实例
- 信息架构不一致，容易让用户误判“实例已经存在但坏了”

**修复方案**
- 移除默认硬编码实例作为主兜底
- 把产品统一成两种明确状态：
  1. 无实例：只显示空态 + 创建/导入入口
  2. 有实例：全部基于注册表渲染
- 新增“导入现有 `~/.hermes` 为默认本地实例”能力，作为首次启动入口之一

---

### P1-2：Settings 仍未接成真实维护中心
**现象**
- `打开 config.yaml`
- `打开 .env`
- `查看 gateway 状态`
- `运行 doctor`
- 以上均为 disabled

**影响**
- 设置页目前不是功能页，只是摘要页
- 与前面阶段定义的“维护中心真实化”不一致

**修复方案**
- 增加桌面动作：
  - openPath(config/env/auth/HERMES_HOME/logs)
  - runHermesStatus
  - runHermesDoctor
- Settings 改成真实动作卡片，而不是禁用按钮墙

---

## 次级问题（非阻塞，但应尽快处理）

### P2-1：Profiles / Chat 仍使用 `window.prompt / window.confirm`
**影响**
- 桌面端体验不统一
- 无法承载更复杂校验与错误提示

**修复方案**
- 换成统一 Drawer/Dialog 表单
- 把名称校验、冲突提示、危险确认放进受控组件

### P2-2：Chat 发送仍依赖实例当前 provider 真可用
**现象**
- 现在 UI 能诚实拦截“待配置”场景
- 当 provider 配置存在但实际不可用时，仍会收到 Hermes CLI 非零退出

**修复方案**
- 增加 provider test connection 动作
- 在发送前把“已配置”与“已验证”区分开

## 修复顺序
### 第一批（必须先做）
1. 修复 `profile import` 破坏已有 profile
2. 给失败态实例补 `retry bootstrap / redeploy`
3. 清掉 runtime fallback 与硬编码实例假定

### 第二批（紧随其后）
4. Settings 接成真实维护中心
5. Profiles / Chat 从 `prompt/confirm` 升级为统一表单弹层
6. Provider 增加连接测试与“已验证”状态

## 验收回归标准
完成上述修复后，重新回归：
- 首次启动无实例时只显示真实空态
- 导入 profile 后旧 profile 不丢
- Docker daemon 恢复后，失败实例可直接重试拉起
- Settings 4 个维护动作全部可用
- Chat 在 provider 未验证时不给发送，provider 已验证后可进入稳定链路
