import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const rootLayout = read("ui/src/app/layout/RootLayout.tsx");
const routes = read("ui/src/app/routes.tsx");
const environmentPagePath = "ui/src/app/pages/instance/Environment.tsx";
const deploymentPagePath = "ui/src/app/pages/instance/Deployment.tsx";
const diagnosticsPagePath = "ui/src/app/pages/instance/Diagnostics.tsx";
const chatPage = read("ui/src/app/pages/instance/Chat.tsx");
const profilesPage = read("ui/src/app/pages/instance/Profiles.tsx");
const backupsPage = read("ui/src/app/pages/instance/Backups.tsx");
const overviewPage = read("ui/src/app/pages/instance/Overview.tsx");
const runtimeService = read("ui/src/app/services/runtime.ts");
const consoleData = read("ui/src/app/data/console.ts");

assert.match(rootLayout, /activeInstance\.type\s*===\s*"remote"/, "RootLayout 应按实例类型分流导航");
assert.match(rootLayout, /const remoteWorkspaceNav = activeInstance[\s\S]*?label: "概况"/, "应定义远程导航配置");
assert.match(rootLayout, /\/environment/, "远程导航应包含 environment");
assert.match(rootLayout, /\/deployment/, "远程导航应包含 deployment");
assert.match(rootLayout, /\/diagnostics/, "远程导航应包含 diagnostics");

const remoteNavBlock = rootLayout.match(/const remoteWorkspaceNav = activeInstance[\s\S]*?\n\s*: \[];/)?.[0] ?? rootLayout;
assert.match(remoteNavBlock, /概况/, "远程导航应包含概况");
assert.match(remoteNavBlock, /环境检查/, "远程导航应包含环境检查");
assert.match(remoteNavBlock, /部署管理/, "远程导航应包含部署管理");
assert.match(remoteNavBlock, /AI\s*提供商/, "远程导航应包含 AI 提供商");
assert.match(remoteNavBlock, /消息平台/, "远程导航应包含消息平台");
assert.match(remoteNavBlock, /日志/, "远程导航应包含日志");
assert.match(remoteNavBlock, /诊断/, "远程导航应包含诊断");
assert.doesNotMatch(remoteNavBlock, /label: "会话"|label: "档案"|label: "备份"/, "远程导航不应再出现会话型导航文案");

for (const [componentName, pagePath, title] of [
  ["Environment", environmentPagePath, "环境检查"],
  ["Deployment", deploymentPagePath, "部署管理"],
  ["Diagnostics", diagnosticsPagePath, "诊断"],
]) {
  assert.ok(fs.existsSync(path.join(repoRoot, pagePath)), `${pagePath} 应存在`);
  const page = read(pagePath);
  assert.match(page, new RegExp(`export function ${componentName}\\s*\\(`), `${componentName} 应导出真实页面组件`);
  assert.match(page, /<PageHeader[\s\S]*title=/, `${componentName} 应渲染可见标题区域`);
  assert.match(page, new RegExp(title), `${componentName} 页面应包含标题“${title}”`);
  assert.doesNotMatch(page, /=>\s*null|return\s+null\b/, `${componentName} 页面不能返回空白内容`);
}

assert.match(read(environmentPagePath), /buildEnvironmentSnapshot|buildEnvironmentViewModel/, "Environment 应暴露可测试的数据结构 helper");
assert.match(read(environmentPagePath), /SSH 连通性|SSH/, "Environment 应锁定 SSH 结果卡片");
assert.match(read(environmentPagePath), /远程目录|目录/, "Environment 应锁定远程目录结果卡片");
assert.match(read(environmentPagePath), /Hermes CLI/, "Environment 应锁定 Hermes CLI 结果卡片");
assert.match(read(environmentPagePath), /建议修复项/, "Environment 应锁定建议修复项分区");
assert.match(read(environmentPagePath), /<details|<summary/, "Environment 应折叠原始错误或诊断摘要");

assert.match(read(deploymentPagePath), /buildDeploymentSnapshot|buildDeploymentViewModel/, "Deployment 应暴露可测试的数据结构 helper");
assert.match(read(deploymentPagePath), /运行服务/, "Deployment 应锁定运行服务标识");
assert.match(read(deploymentPagePath), /运行版本/, "Deployment 应锁定运行版本");
assert.match(read(deploymentPagePath), /对外端口/, "Deployment 应锁定对外端口");
assert.match(read(deploymentPagePath), /内部端口/, "Deployment 应锁定内部端口");
assert.match(read(deploymentPagePath), /工作目录/, "Deployment 应锁定工作目录");
assert.match(read(deploymentPagePath), /重建部署/, "Deployment 应锁定重建部署入口");
assert.match(read(deploymentPagePath), /重启 Gateway/, "Deployment 应锁定重启 Gateway 入口");
assert.match(read(deploymentPagePath), /清理实例目录/, "Deployment 应锁定清理实例目录入口");

assert.match(read(diagnosticsPagePath), /buildDiagnosticsSnapshot|buildDiagnosticsViewModel/, "Diagnostics 应暴露可测试的数据结构 helper");
assert.match(read(diagnosticsPagePath), /健康摘要/, "Diagnostics 应锁定健康摘要");
assert.match(read(diagnosticsPagePath), /运行载体/, "Diagnostics 应锁定运行载体状态");
assert.match(read(diagnosticsPagePath), /端口映射/, "Diagnostics 应锁定端口映射");
assert.match(read(diagnosticsPagePath), /运行服务[\s\S]*Gateway/, "Diagnostics 应锁定运行服务/Gateway 检查");
assert.match(read(diagnosticsPagePath), /最近诊断结论/, "Diagnostics 应锁定最近诊断结论");

assert.match(routes, /import\s*\{\s*Environment\s*\}\s*from\s*"\.\/pages\/instance\/Environment";/, "routes 应导入 Environment 页面");
assert.match(routes, /import\s*\{\s*Deployment\s*\}\s*from\s*"\.\/pages\/instance\/Deployment";/, "routes 应导入 Deployment 页面");
assert.match(routes, /import\s*\{\s*Diagnostics\s*\}\s*from\s*"\.\/pages\/instance\/Diagnostics";/, "routes 应导入 Diagnostics 页面");
assert.doesNotMatch(routes, /const\s+Environment\s*=\s*\(\)\s*=>\s*null/, "routes 不应再使用空的 Environment 占位");
assert.doesNotMatch(routes, /const\s+Deployment\s*=\s*\(\)\s*=>\s*null/, "routes 不应再使用空的 Deployment 占位");
assert.doesNotMatch(routes, /const\s+Diagnostics\s*=\s*\(\)\s*=>\s*null/, "routes 不应再使用空的 Diagnostics 占位");
assert.match(routes, /path:\s*"environment"/, "routes 应注册 environment");
assert.match(routes, /path:\s*"deployment"/, "routes 应注册 deployment");
assert.match(routes, /path:\s*"diagnostics"/, "routes 应注册 diagnostics");

assert.match(chatPage, /type\s*===\s*"remote"/, "Chat 应识别远程实例");
assert.match(chatPage, /Navigate|navigate\(/, "Chat 应包含远程跳转逻辑");
assert.match(chatPage, /\/instance\/\$\{instance\.id\}\/deployment|\/deployment/, "Chat 远程跳转目标应为 deployment");
assert.match(chatPage, /入口已迁移|节点模式/, "Chat 旧入口应给出明确迁移说明");
assert.match(chatPage, /立即前往部署管理|前往部署管理/, "Chat 旧入口应提供前往目标页按钮");
assert.doesNotMatch(chatPage, /setTimeout\s*\(\s*\(\)\s*=>\s*\{\s*navigate\([^)]*\/deployment/, "Chat 不应依赖自动跳转到 deployment");
assert.doesNotMatch(chatPage, /state:\s*\{\s*banner:/, "Chat 不应依赖 state.banner 提示");

assert.match(profilesPage, /type\s*===\s*"remote"/, "Profiles 应识别远程实例");
assert.match(profilesPage, /Navigate|navigate\(/, "Profiles 应包含远程跳转逻辑");
assert.match(profilesPage, /\/instance\/\$\{instanceId\}\/providers|\/providers/, "Profiles 远程跳转目标应为 providers");
assert.match(profilesPage, /getConsoleRuntimeInstance/, "Profiles 应使用稳定实例元信息做远程分流");
assert.doesNotMatch(profilesPage, /consoleInstances\[0\]/, "Profiles 不应再使用 consoleInstances[0] 作为 fallback");
assert.match(profilesPage, /useState<ConsoleInstance \| null>\(null\)/, "Profiles 的 runtime instance 初值应为 unknown/null");
assert.match(profilesPage, /入口已迁移|节点模式/, "Profiles 旧入口应给出明确迁移说明");
assert.match(profilesPage, /立即前往 AI 提供商|前往 AI 提供商/, "Profiles 旧入口应提供前往目标页按钮");
assert.doesNotMatch(profilesPage, /setTimeout\s*\(\s*\(\)\s*=>\s*\{\s*navigate\([^)]*\/providers/, "Profiles 不应依赖自动跳转到 providers");
assert.doesNotMatch(profilesPage, /state:\s*\{\s*banner:/, "Profiles 不应依赖 state.banner 提示");
assert.match(
  profilesPage,
  /if \(instance\?\.type === "remote"\)[\s\S]*if \(loading\)[\s\S]*if \(error\)[\s\S]*if \(profiles\.length === 0\)/,
  "Profiles 远程迁移卡应优先于 loading/error/empty 旧分支"
);

assert.match(backupsPage, /type\s*===\s*"remote"/, "Backups 应识别远程实例");
assert.match(backupsPage, /Navigate|navigate\(/, "Backups 应包含远程跳转逻辑");
assert.match(backupsPage, /\/instance\/\$\{instanceId\}\/diagnostics|\/diagnostics|\/instance\/\$\{instanceId\}`?/, "Backups 远程跳转目标应为 diagnostics 或概况");
assert.match(backupsPage, /getConsoleRuntimeInstance/, "Backups 应使用稳定实例元信息做远程分流");
assert.doesNotMatch(backupsPage, /consoleInstances\[0\]/, "Backups 不应再使用 consoleInstances[0] 作为 fallback");
assert.match(backupsPage, /useState<ConsoleInstance \| null>\(null\)/, "Backups 的 runtime instance 初值应为 unknown/null");
assert.match(backupsPage, /入口已迁移|节点模式/, "Backups 旧入口应给出明确迁移说明");
assert.match(backupsPage, /立即前往诊断|返回概况/, "Backups 旧入口应提供前往目标页按钮");
assert.doesNotMatch(backupsPage, /setTimeout\s*\(\s*\(\)\s*=>\s*\{\s*navigate\([^)]*\/diagnostics/, "Backups 不应依赖自动跳转到 diagnostics");
assert.doesNotMatch(backupsPage, /state:\s*\{\s*banner:/, "Backups 不应依赖 state.banner 提示");
assert.match(
  backupsPage,
  /const remoteRedirectNotice[\s\S]*if \(instance\?\.type === "remote"\)[\s\S]*const handleCreateBackup/,
  "Backups 远程迁移卡应在后续业务处理与渲染前优先返回"
);

assert.match(overviewPage, /instance\?\.type === "remote"/, "Overview 应按实例类型切换远程概况 CTA");
assert.match(overviewPage, /部署管理/, "Overview 远程概况应提供部署管理入口");
assert.match(overviewPage, /环境检查|读取环境/, "Overview 远程概况应提供环境检查入口");
assert.match(overviewPage, /诊断/, "Overview 远程概况应提供诊断入口");
assert.match(overviewPage, /环境检查/, "Overview 远程概况应明确提供环境检查操作");
assert.match(overviewPage, /重建部署|重新部署/, "Overview 远程概况主操作应明确提供重建部署入口");
assert.match(overviewPage, /节点状态/, "Overview 远程概况统计应使用节点化状态文案");
assert.match(overviewPage, /SSH 目标/, "Overview 远程概况应展示 SSH 目标");
assert.match(overviewPage, /运行服务/, "Overview 远程概况应展示运行服务状态");
assert.match(overviewPage, /Gateway 状态/, "Overview 远程概况应展示 Gateway 状态");
assert.match(overviewPage, /运行服务标识/, "Overview 远程详情应展示运行服务标识");
assert.match(overviewPage, /映射端口/, "Overview 远程详情应展示映射端口");
assert.match(overviewPage, /远程目录/, "Overview 远程详情应展示远程目录");
assert.match(overviewPage, /最近错误/, "Overview 远程详情应展示最近错误");
assert.match(overviewPage, /主操作|节点操作/, "Overview 远程概况应使用节点化主操作分区");
assert.doesNotMatch(
  overviewPage,
  /instance\?\.type === "remote"[\s\S]{0,600}打开会话/,
  "Overview 远程概况不应再把打开会话作为主 CTA"
);
assert.doesNotMatch(overviewPage, /secondary\[\d+\]/, "Overview 不应再通过数组下标耦合 action model");
assert.match(overviewPage, /actionModel\.(primary|sections|quickActions|lifecycleActions)/, "Overview 应直接使用结构化 action model 渲染按钮");
assert.match(overviewPage, /\.map\(\(action\)/, "Overview 应通过遍历 action model 渲染真实按钮");

assert.match(runtimeService, /远程节点/, "runtime 远程摘要应改为节点化语言");
assert.match(runtimeService, /映射端口/, "runtime 远程摘要应提及映射端口");
assert.match(runtimeService, /远程目录|节点目录/, "runtime 远程摘要或映射应提及远程目录");
assert.match(runtimeService, /publishedPort/, "runtime 应透传结构化 publishedPort");
assert.match(consoleData, /publishedPort\?: number/, "ConsoleInstance 应暴露结构化 publishedPort 字段");

const viteServer = await createServer({
  root: path.join(repoRoot, "ui"),
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const overviewModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Overview.tsx");
  const environmentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Environment.tsx");
  const deploymentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Deployment.tsx");
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Diagnostics.tsx");
  const runtimeModule = await viteServer.ssrLoadModule("/src/app/services/runtime.ts");
  const renderModule = await viteServer.ssrLoadModule("/tests/support/overview-ssr-render.tsx");

  assert.equal(typeof overviewModule.buildOverviewActionModel, "function", "Overview 应导出可调用的 action model helper");
  assert.equal(typeof overviewModule.buildOverviewHeaderActionPlan, "function", "Overview 应导出 header action plan helper");
  assert.equal(typeof overviewModule.buildRemoteNodeSnapshot, "function", "Overview 应导出可调用的远程节点快照 helper");
  assert.equal(typeof environmentModule.buildEnvironmentSnapshot, "function", "Environment 应导出结果卡片快照 helper");
  assert.equal(typeof deploymentModule.buildDeploymentSnapshot, "function", "Deployment 应导出部署详情快照 helper");
  assert.equal(typeof diagnosticsModule.buildDiagnosticsSnapshot, "function", "Diagnostics 应导出集中诊断快照 helper");
  assert.equal(typeof runtimeModule.mapRecordToConsoleInstance, "function", "runtime 应导出实例映射 helper 供行为测试复用");

  const mappedRemote = runtimeModule.mapRecordToConsoleInstance(
    {
      id: "remote-behavior",
      name: "远程行为测试节点",
      type: "remote",
      runtime: "docker",
      hermesHome: "/srv/hermes/.hermes",
      workspaceDir: "/srv/hermes/app",
      endpoint: "ssh://ops@example.internal:2222",
      status: "running",
      createdAt: "2026-04-30T00:00:00.000Z",
      lastCheckedAt: "2026-04-30T00:05:00.000Z",
      security: "SSH 隧道",
      providerId: "openai",
      model: "gpt-4o",
      defaultProfile: "默认档案",
      docker: {
        image: "ghcr.io/hermes/app:latest",
        containerName: "hermes-remote",
        publishedPort: 9527,
        containerPort: 8642,
        command: ["hermes", "gateway"],
      },
      remote: {
        host: "example.internal",
        port: "2222",
        user: "ops",
        authMode: "ssh_key",
        workdir: "/srv/hermes/app",
      },
    },
    {
      docker: { available: true, daemonRunning: true, detail: "Docker 运行中" },
      gateway: { reachable: true, detail: "Gateway 已连接" },
      detail: "summary 中即便写 1111 也不能影响结构化端口",
    }
  );

  const remoteActions = overviewModule.buildOverviewActionModel(mappedRemote);
  const remoteHeaderPlan = overviewModule.buildOverviewHeaderActionPlan(mappedRemote, { isActing: false, cleanupWorking: false });
  const remoteSnapshot = overviewModule.buildRemoteNodeSnapshot({
    ...mappedRemote,
    summary: "伪造 summary：映射端口 1111",
  });

  assert.equal(remoteActions.primary.label, "前往部署管理", "远程主 CTA 应指向部署管理");
  assert.equal(remoteActions.primary.to, `/instance/${mappedRemote.id}/deployment`, "远程主 CTA 不能再指向 chat");
  assert.ok(Array.isArray(remoteActions.sections), "远程 action model 应暴露可遍历分组");
  const remoteActionEntries = remoteActions.sections.flatMap((section) => section.actions);
  assert.ok(remoteActionEntries.every((entry) => !/^\d+$/.test(String(entry.key))), "远程 action model 应使用具名 key 而不是数组下标约定");
  assert.equal(remoteActions.sections[0]?.key, "workflow-order", "远程首组 action 应为推荐顺序入口");
  assert.equal(remoteActions.sections[1]?.key, "lifecycle-actions", "远程次组 action 应为生命周期操作");
  const readEnvironmentAction = remoteActionEntries.find((item) => item.key === "read-environment");
  assert.equal(readEnvironmentAction?.label, "环境检查", "远程次级操作应包含环境检查");
  assert.equal(readEnvironmentAction?.to, `/instance/${mappedRemote.id}/environment`, "读取环境应跳转到 environment");
  const redeployAction = remoteActionEntries.find((item) => item.key === "rebuild-deployment");
  assert.equal(redeployAction?.label, "重建部署", "远程主操作区应明确提供重建部署");
  assert.equal(redeployAction?.to, `/instance/${mappedRemote.id}/deployment`, "重建部署应直达 deployment");
  assert.ok(remoteActionEntries.some((item) => item.key === "cleanup-node" && item.label === "卸载"), "远程主操作区应明确可达卸载");
  const remoteHeaderEntries = remoteHeaderPlan.sections.flatMap((section) => section.actions);
  assert.deepEqual(
    remoteHeaderEntries.map((entry) => entry.key),
    ["read-environment", "rebuild-deployment", "diagnostics", "start-node", "stop-node", "cleanup-node"],
    "远程 header 实际渲染计划应保持稳定的动作顺序"
  );
  assert.equal(remoteHeaderPlan.primary.to, `/instance/${mappedRemote.id}/deployment`, "远程主按钮计划应仍指向 deployment");
  assert.equal(remoteHeaderEntries.find((entry) => entry.key === "start-node")?.intent, "start", "启动按钮应绑定 start intent");
  assert.equal(remoteHeaderEntries.find((entry) => entry.key === "start-node")?.disabled, true, "运行中远程节点的启动按钮应禁用");
  assert.equal(remoteHeaderEntries.find((entry) => entry.key === "stop-node")?.intent, "stop", "停止按钮应绑定 stop intent");
  assert.equal(remoteHeaderEntries.find((entry) => entry.key === "stop-node")?.disabled, false, "运行中远程节点的停止按钮应可用");
  assert.equal(remoteHeaderEntries.find((entry) => entry.key === "cleanup-node")?.intent, "cleanup", "卸载按钮应绑定 cleanup intent");
  assert.equal(mappedRemote.publishedPort, 9527, "runtime 应透传结构化 publishedPort");
  assert.equal(mappedRemote.image, "ghcr.io/hermes/app:latest", "runtime 应透传结构化镜像字段");
  assert.equal(mappedRemote.containerPort, 8642, "runtime 应透传结构化内部端口");
  assert.equal(mappedRemote.createdAt, "2026-04-30T00:00:00.000Z", "runtime 应透传创建时间");
  assert.equal(mappedRemote.remoteConfig?.workdir, "/srv/hermes/app", "runtime 应保留远程节点配置供环境读取");
  assert.equal(remoteSnapshot.coreRows.find((row) => row.label === "映射端口")?.value, "9527", "Overview 应使用结构化 publishedPort 渲染映射端口");
  assert.equal(remoteSnapshot.coreRows.find((row) => row.label === "SSH 目标")?.value, "ops@example.internal:2222", "Overview 应展示结构化 SSH 目标");
  assert.match(
    overviewPage,
    /actionModel\.sections\.map\(\(section\)[\s\S]*section\.actions\.map\(\(action\)/,
    "Overview 真实 UI 应遍历同一份 action model 渲染按钮"
  );

  const environmentSnapshot = environmentModule.buildEnvironmentSnapshot(mappedRemote, {
    host: "example.internal",
    port: "2222",
    user: "ops",
    authMode: "ssh_key",
    workdir: "/srv/hermes/app",
    ssh: { reachable: true, detail: "SSH 可达", sshBinary: "/usr/bin/ssh", expectBinary: "/usr/bin/expect", passwordSupported: true },
    system: { platform: "Ubuntu 22.04", hostname: "remote", arch: "x64", remoteUser: "ops" },
    directory: { writable: true, detail: "/srv/hermes/app 可写" },
    hermes: { available: false, binaryPath: "", detail: "未在 PATH 中找到 Hermes CLI" },
    docker: { available: true, daemonRunning: true, version: "Docker 26", detail: "Docker daemon 运行中" },
    disk: { availableGb: 16, detail: "剩余 16 GB" },
    port: { port: 9527, requestedPort: 9527, autoSelected: false, available: false, detail: "端口 9527 已占用" },
    raw: { ssh: "RAW_SSH_BLOB" },
  });
  assert.deepEqual(environmentSnapshot.resultCards.map((card) => card.key), ["ssh", "directory", "runtime-service", "port", "hermes-cli"], "Environment 应优先输出 SSH/目录/运行服务/端口/Hermes CLI 结果卡片");
  assert.ok(environmentSnapshot.repairItems.some((item) => /9527|Hermes CLI/.test(`${item.title} ${item.detail}`)), "Environment 应针对端口或 CLI 问题给出建议修复项");
  assert.match(environmentSnapshot.foldedSummary.content, /RAW_SSH_BLOB/, "Environment 原始输出应进入折叠摘要");
  assert.doesNotMatch(environmentSnapshot.resultCards.map((card) => card.detail).join("\n"), /RAW_SSH_BLOB/, "Environment 结果卡片不应堆原始输出");

  const deploymentSnapshot = deploymentModule.buildDeploymentSnapshot(mappedRemote);
  assert.deepEqual(
    deploymentSnapshot.detailRows.map((row) => row.label),
    ["运行服务", "运行版本", "对外端口", "内部端口", "工作目录", "创建时间", "最近部署结果"],
    "Deployment 应稳定展示运行服务、版本、端口、目录与最近部署结果"
  );
  assert.equal(deploymentSnapshot.detailRows.find((row) => row.label === "运行版本")?.value, "ghcr.io/hermes/app:latest", "Deployment 应展示真实运行版本");
  assert.equal(deploymentSnapshot.detailRows.find((row) => row.label === "内部端口")?.value, "8642", "Deployment 应展示真实内部端口");
  assert.deepEqual(deploymentSnapshot.nodeActions.map((action) => action.label), ["重建部署", "重启 Gateway", "清理实例目录"], "Deployment 应提供节点级操作入口");

  const diagnosticsSnapshot = diagnosticsModule.buildDiagnosticsSnapshot(mappedRemote);
  assert.match(diagnosticsSnapshot.healthSummary.value, /健康|需要关注|异常|已停止|待检测/, "Diagnostics 应给出健康摘要状态");
  assert.match(diagnosticsSnapshot.containerStatus.value, /hermes-remote/, "Diagnostics 应展示运行服务标识");
  assert.match(diagnosticsSnapshot.containerStatus.value, /待回传|运行中|重启中|异常|未创建/, "Diagnostics 应展示结构化运行状态");
  assert.equal(diagnosticsSnapshot.portMapping.value, "9527 → 8642", "Diagnostics 应展示端口映射");
  assert.deepEqual(diagnosticsSnapshot.checks.map((check) => check.label), ["运行服务", "Gateway 检查"], "Diagnostics 应集中展示运行服务/Gateway 检查");
  assert.match(diagnosticsSnapshot.recentConclusion.detail, /summary|Gateway|Docker|远程节点|映射端口/, "Diagnostics 应展示最近诊断结论");

  const originalConsoleError = console.error;
  try {
    console.error = (...args) => {
      if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) {
        return;
      }
      originalConsoleError(...args);
    };

    const remoteMarkup = renderModule.renderOverviewForPath("/instance/remote-gateway");

    assert.match(remoteMarkup, /读取环境/, "远程 Overview 实际渲染应包含读取环境按钮");
    assert.match(remoteMarkup, /重建部署/, "远程 Overview 实际渲染应包含重建部署按钮");
    assert.match(remoteMarkup, /诊断/, "远程 Overview 实际渲染应包含诊断按钮");
    assert.match(remoteMarkup, /卸载/, "远程 Overview 实际渲染应包含卸载按钮");
    assert.match(remoteMarkup, /部署管理/, "远程 Overview 实际渲染应包含部署管理主按钮");
    assert.doesNotMatch(remoteMarkup, /打开会话/, "远程 Overview 实际渲染不应回退为会话入口");

    const localMarkup = renderModule.renderOverviewForPath("/instance/local-studio");

    assert.match(localMarkup, /打开会话/, "本地 Overview 实际渲染应保留会话主入口");
    const localHeaderPlan = overviewModule.buildOverviewHeaderActionPlan(
      runtimeModule.mapRecordToConsoleInstance({
        id: "local-behavior",
        name: "本地行为测试实例",
        type: "local",
        runtime: "docker",
        hermesHome: "/Users/test/.hermes",
        workspaceDir: "/Users/test/HermesOS/local",
        endpoint: "127.0.0.1:8642",
        status: "stopped",
        createdAt: "2026-04-30T00:00:00.000Z",
        lastCheckedAt: "2026-04-30T00:05:00.000Z",
        security: "localhost",
      }),
      { isActing: false, cleanupWorking: false }
    );
    assert.equal(localHeaderPlan.primary.key, "open-chat", "本地主按钮计划应保留会话入口");
    assert.deepEqual(
      localHeaderPlan.sections[0].actions.map((entry) => ({ key: entry.key, disabled: entry.disabled })),
      [
        { key: "stop-local", disabled: true },
        { key: "start-local", disabled: false },
      ],
      "本地 header 计划应正确反映启动/停止可用性"
    );
  } finally {
    console.error = originalConsoleError;
  }
} finally {
  await viteServer.close();
}
