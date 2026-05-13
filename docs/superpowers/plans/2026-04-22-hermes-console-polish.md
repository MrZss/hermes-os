# Hermes Console 像素级与交互级 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变信息架构、不扩业务功能的前提下，完成 Hermes Console 前端最后一轮像素级与交互级收口，让桌面壳层、Welcome / Dashboard、创建实例向导、目录页与抽屉详情达到更稳定的正式产品状态。

**Architecture:** 保持现有桌面壳层、路由和对象模型不变，只做视觉节奏、卡片结构、状态层级、只读/可配置区差异、disabled/可执行入口边界的统一收口。所有调整都必须维持“诚实交互”原则，不新增假能力。

**Tech Stack:** React 18、React Router 7、TypeScript、Vite、Electron、Tailwind 风格组件、现有 `Badge / Button / Card / Drawer / PageHeader`。

---

## File Map

### Modify

- `ui/src/app/layout/RootLayout.tsx`
  - 收紧侧栏、当前实例区、工作区导航和顶栏的视觉节奏
- `ui/src/app/pages/Dashboard.tsx`
  - 收紧首页摘要卡、实例卡与最近活动区的视觉层级
- `ui/src/app/pages/Onboarding.tsx`
  - 收紧欢迎页主入口卡与右侧提示卡的视觉重心
- `ui/src/app/pages/CreateInstance.tsx`
  - 收紧 5 步向导中的卡片、摘要、风险提示、底部导航节奏
- `ui/src/app/pages/instance/Profiles.tsx`
  - 强化默认档案状态识别并统一卡片/抽屉节奏
- `ui/src/app/pages/instance/Providers.tsx`
  - 统一卡片信息块与抽屉配置摘要的视觉关系
- `ui/src/app/pages/instance/Integrations.tsx`
  - 统一分组节奏、卡片信息密度和抽屉头部/配置区节奏
- `ui/src/app/pages/Settings.tsx`
  - 继续收紧三张卡的垂直关系与 disabled 入口样式

### Optional shared touch-up

- `ui/src/app/components/console/PageHeader.tsx`
  - 如多个页面都存在同类留白/间距问题，可最小统一
- `ui/src/app/components/ui/drawer.tsx`
  - 如抽屉标题区或底部操作区节奏不一致，可最小统一

### Verify

- `ui/package.json`
  - 使用既有脚本 `npm run build` / `npm run desktop:dev`

---

## Validation Strategy

当前仓库没有前端自动化测试基建；本轮以 **构建通过 + 桌面态可视验收 + 关键路由人工验收** 作为验收门槛。

- 编译验证：`cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`
- 桌面开发态：`cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 关键验收路径：
  - `/welcome`
  - `/`
  - `/create?type=local`
  - `/create?type=remote`
  - `/instance/local-studio/profiles`
  - `/instance/local-studio/providers`
  - `/instance/local-studio/integrations`
  - `/settings`

---

### Task 1: 全局壳层节奏收口

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/layout/RootLayout.tsx`
- Optional: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/components/console/PageHeader.tsx`

- [ ] **Step 1: 收紧侧栏区块节奏**
  - 收紧“控制台 / 当前实例 / 工作区”三个 section 的上下距离
  - 统一 section 标题、实例卡、导航项的垂直节奏
  - 保证当前实例卡与工作区导航的视觉重心清晰

- [ ] **Step 2: 收紧顶栏信息密度**
  - 统一顶栏 badge 与主按钮间距
  - 避免顶栏右侧信息块松散或堆叠感过强
  - 不新增任何新功能入口

- [ ] **Step 3: 如有必要，最小统一 PageHeader**
  - 若多个页面顶部存在相同的首屏留白问题，可在 `PageHeader` 做最小统一
  - 不改变标题语义，不新增说明文

- [ ] **Step 4: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 5: 提交本任务**
  - 提交信息：`收口桌面壳层与页面头部节奏`

---

### Task 2: Welcome / Dashboard 控制台首页 polish

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/Onboarding.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/Dashboard.tsx`

- [ ] **Step 1: 收紧欢迎页主入口卡**
  - 统一本地/远程两张主卡的标题区、badge 区、CTA 区节奏
  - 让主入口成为首屏主要视觉重心
  - 右侧提示卡继续压缩信息密度，不出现开发态文案

- [ ] **Step 2: 收紧 Dashboard 四张摘要卡**
  - 统一卡片标题、主信息、次信息、按钮区的纵向节奏
  - 弱化“展示页感”，强化“控制台首页感”

- [ ] **Step 3: 收紧实例卡与最近活动区**
  - 统一实例卡内摘要块、卡片底部动作区、badge 和辅助信息的对齐
  - 收紧最近活动列表的行高、标签区和时间区密度

- [ ] **Step 4: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 5: 提交本任务**
  - 提交信息：`收口欢迎页与概览页的控制台视觉节奏`

---

### Task 3: 创建实例向导节奏与层级 polish

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/CreateInstance.tsx`

- [ ] **Step 1: 统一 5 步向导内容块节奏**
  - 统一步骤区卡片 padding、块间距、状态块与提示块之间的距离
  - 让 Step 2/3/4/5 的视觉节奏一致

- [ ] **Step 2: 收 Step 2 风险与检查视觉噪音**
  - 检查项、风险卡、环境提示保持清晰但更克制
  - 不改变现有可用性与约束逻辑

- [ ] **Step 3: 收 Step 4/5 的主次关系**
  - Step 4 左右两列主次更清楚
  - Step 5 摘要卡和关键提示卡的层级更稳
  - 底部导航区与正文分隔更清楚

- [ ] **Step 4: 高级配置继续保持“只读/诚实”**
  - 不恢复假交互
  - 不新增解释性副标题

- [ ] **Step 5: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 6: 提交本任务**
  - 提交信息：`收口创建实例向导的视觉层级与交互节奏`

---

### Task 4: 目录页卡片与抽屉节奏统一

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Profiles.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Providers.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Integrations.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/Settings.tsx`
- Optional: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/components/ui/drawer.tsx`

- [ ] **Step 1: 统一卡片结构节奏**
  - 标题、状态标签、摘要块、底部操作区对齐统一
  - 列表页顶部到首个 section 的距离统一

- [ ] **Step 2: 统一浅底摘要块样式**
  - 统一摘要块 padding、字号、边框浓度
  - 强化只读/disabled 与可操作入口的视觉差异

- [ ] **Step 3: 收紧抽屉详情层**
  - 统一抽屉标题区、首个摘要块、信息块标题、正文块、底部区节奏
  - 强化“只读摘要块”与“可配置字段块”的差异

- [ ] **Step 4: 页面专项 polish**
  - 档案页：默认档案状态识别更清楚，但不过度放大 badge
  - 提供商页：认证方式/模型摘要更清楚
  - 集成页：分组节奏、状态/健康/接入类型信息密度更稳
  - 设置页：三张卡与 disabled 入口关系更稳

- [ ] **Step 5: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 6: 提交本任务**
  - 提交信息：`统一目录页卡片与抽屉详情节奏`

---

### Task 5: 最终验收与桌面态回归

**Files:**
- Verify only

- [ ] **Step 1: 运行最终构建**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 2: 启动桌面开发态**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`

- [ ] **Step 3: 路由级人工验收**
  - Welcome、Dashboard、Create、Profiles、Providers、Integrations、Settings 首屏自检
  - 核对：没有新增假交互，没有新增解释性副标题，页面节奏更统一

- [ ] **Step 4: 提交本任务**
  - 提交信息：`完成 Hermes Console 前端 polish 验收收口`

---

## Final Verification Checklist

- [ ] 顶栏、侧栏、当前实例区节奏统一
- [ ] Welcome / Dashboard 更像正式控制台，不像原型页
- [ ] 创建实例 5 步流程视觉节奏统一
- [ ] 档案 / 提供商 / 集成 / 设置卡片与抽屉节奏更一致
- [ ] 没有新增假交互
- [ ] 没有新增解释性副标题噪音
- [ ] `npm run build` 通过
- [ ] Electron 开发态能正常启动并展示最新页面

