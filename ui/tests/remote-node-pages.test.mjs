import assert from "node:assert/strict";
import path from "node:path";
import { createServer } from "vite";

const repoRoot = process.cwd();

const viteServer = await createServer({
  root: path.join(repoRoot, "ui"),
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const environmentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Environment.tsx");
  const deploymentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Deployment.tsx");
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Diagnostics.tsx");
  const runtimeModule = await viteServer.ssrLoadModule("/src/app/services/runtime.ts");
  const renderModule = await viteServer.ssrLoadModule("/tests/support/remote-node-page-ssr-render.tsx");

  assert.equal(typeof environmentModule.buildEnvironmentViewModel, "function", "Environment 应导出可测试的 view model helper");
  assert.equal(typeof deploymentModule.buildDeploymentViewModel, "function", "Deployment 应导出可测试的 view model helper");
  assert.equal(typeof diagnosticsModule.buildDiagnosticsViewModel, "function", "Diagnostics 应导出可测试的 view model helper");
  assert.equal(typeof runtimeModule.mapRecordToConsoleInstance, "function", "runtime 应可复用映射 helper");

  const remoteInstance = runtimeModule.mapRecordToConsoleInstance(
    {
      id: "remote-page-test",
      name: "远程节点页面测试",
      type: "remote",
      runtime: "docker",
      hermesHome: "/srv/hermes/.hermes",
      workspaceDir: "/srv/hermes/app",
      endpoint: "http://10.0.0.8:18642",
      status: "warning",
      createdAt: "2026-04-29T08:00:00.000Z",
      lastCheckedAt: "2026-04-30T08:00:00.000Z",
      security: "SSH 隧道",
      providerId: "openai",
      model: "gpt-4o",
      defaultProfile: "默认档案",
      lastError: "Gateway 健康检查抖动，建议重建部署并确认 Docker 守护进程。",
      docker: {
        image: "nousresearch/hermes-agent:latest",
        containerName: "hermes-node-test",
        publishedPort: 18642,
        containerPort: 8642,
        command: ["hermes", "gateway"],
      },
      remote: {
        host: "10.0.0.8",
        port: "22",
        user: "ops",
        authMode: "password",
        workdir: "/srv/hermes/app",
      },
    },
    {
      docker: { available: true, daemonRunning: false, detail: "Docker 已安装，但 daemon 当前不可用。" },
      gateway: { reachable: false, detail: "Gateway 当前不可访问，健康检查超时。" },
      detail: "SSH 已连接，但 Docker 与 Gateway 仍需修复后才能稳定接管节点。",
    }
  );

  const rawRecord = {
    createdAt: "2026-04-29T08:00:00.000Z",
    docker: {
      image: "nousresearch/hermes-agent:latest",
      containerName: "hermes-node-test",
      publishedPort: 18642,
      containerPort: 8642,
      command: ["hermes", "gateway"],
    },
    remote: {
      host: "10.0.0.8",
      port: "22",
      user: "ops",
      authMode: "password",
      workdir: "/srv/hermes/app",
    },
  };

  const diagnostics = {
    docker: { available: true, daemonRunning: false, detail: "Docker 已安装，但 daemon 当前不可用。" },
    gateway: { reachable: false, detail: "Gateway 当前不可访问，健康检查超时。" },
    detail: "SSH 已连接，但 Docker 与 Gateway 仍需修复后才能稳定接管节点。",
    container: { status: "restarting", health: "unhealthy", pid: 21789, error: "", startedAt: "2026-04-30T02:13:43.917838232Z" },
  };

  const environmentModel = environmentModule.buildEnvironmentViewModel(remoteInstance, { rawRecord, diagnostics });
  assert.ok(environmentModel.cards.some((card) => card.label === "SSH"), "Environment 应输出 SSH 结果卡片");
  assert.ok(environmentModel.cards.some((card) => card.label === "Hermes CLI"), "Environment 应输出 Hermes CLI 结果卡片");
  assert.ok(environmentModel.recommendations.length > 0, "Environment 应输出建议修复项");
  assert.match(environmentModel.rawSummary, /Docker|Gateway|SSH/, "Environment 应保留原始诊断摘要");
  assert.equal(environmentModel.cards.find((card) => card.label === "SSH")?.tone, "warning", "Environment 在 SSH 已连通但节点仍报错时应展示待修复而不是可用");
  assert.doesNotMatch(environmentModel.recommendations.map((item) => `${item.title} ${item.detail}`).join("\n"), /password:/i, "Environment 用户侧建议不应混入 SSH 密码提示噪音");
  assert.doesNotMatch(remoteInstance.summary, /password:/i, "runtime summary 应先清理 SSH 密码提示噪音");
  assert.doesNotMatch(remoteInstance.summary, /curl:\s*\(56\)|connection reset by peer/i, "runtime summary 应将底层 curl 重置错误转换为人话提示");
  assert.match(remoteInstance.summary, /Gateway|重启|部署管理/, "runtime summary 应为远程 Gateway 错误提供人话化指引");
  assert.equal(
    runtimeModule.humanizeRemoteRuntimeMessage("Error: No such object: hermes-console-remote-gateway-demo"),
    "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。",
    "runtime summary 应将丢失运行服务错误转换为人话提示",
  );

  const deploymentModel = deploymentModule.buildDeploymentViewModel(remoteInstance, { rawRecord, diagnostics });
  assert.equal(deploymentModel.metadata.find((item) => item.label === "运行版本")?.value, "nousresearch/hermes-agent:latest", "Deployment 应展示运行版本");
  assert.equal(deploymentModel.metadata.find((item) => item.label === "内部端口")?.value, "8642", "Deployment 应展示内部端口");
  assert.ok(deploymentModel.actions.some((action) => action.label === "重建部署"), "Deployment 应提供重建部署入口");
  assert.ok(deploymentModel.actions.some((action) => action.label === "重启 Gateway"), "Deployment 应提供重启 Gateway 入口");
  assert.ok(deploymentModel.actions.some((action) => action.label === "清理实例目录"), "Deployment 应提供清理实例目录入口");

  const diagnosticsModel = diagnosticsModule.buildDiagnosticsViewModel(remoteInstance, { rawRecord, diagnostics });
  assert.match(diagnosticsModel.summary.title, /健康摘要|集中答案/, "Diagnostics 应输出健康摘要");
  assert.ok(diagnosticsModel.checks.some((item) => item.label === "运行载体"), "Diagnostics 应输出运行载体状态");
  assert.ok(diagnosticsModel.checks.some((item) => item.label === "端口映射"), "Diagnostics 应输出端口映射");
  assert.match(diagnosticsModel.conclusion, /Docker|Gateway|SSH/, "Diagnostics 应聚合最近诊断结论");
  const containerCheck = diagnosticsModel.checks.find((item) => item.label === "运行载体");
  assert.match(containerCheck?.value ?? "", /重启中/, "Diagnostics 运行载体应输出结构化状态而不是原始 JSON");
  assert.doesNotMatch(containerCheck?.detail ?? "", /\{\"status\"|\{\"Status\"/, "Diagnostics 运行载体详情不应直接暴露原始 JSON");
  assert.doesNotMatch(diagnosticsModel.conclusion, /password:/i, "Diagnostics 诊断结论不应混入 SSH 密码提示噪音");

  const originalConsoleError = console.error;
  try {
    console.error = (...args) => {
      if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) {
        return;
      }
      originalConsoleError(...args);
    };

    const environmentMarkup = renderModule.renderRemoteNodePage("/instance/remote-gateway/environment");
    assert.match(environmentMarkup, /SSH/, "Environment SSR 应渲染 SSH 结果卡片");
    assert.match(environmentMarkup, /Hermes CLI/, "Environment SSR 应渲染 Hermes CLI 区域");
    assert.match(environmentMarkup, /建议修复项/, "Environment SSR 应渲染建议修复项");
    assert.match(environmentMarkup, /原始诊断摘要|诊断摘要/, "Environment SSR 应渲染原始诊断摘要折叠区");

    const deploymentMarkup = renderModule.renderRemoteNodePage("/instance/remote-gateway/deployment");
    assert.match(deploymentMarkup, /运行服务/, "Deployment SSR 应渲染运行服务标识");
    assert.match(deploymentMarkup, /运行版本/, "Deployment SSR 应渲染运行版本信息");
    assert.match(deploymentMarkup, /对外端口/, "Deployment SSR 应渲染对外端口");
    assert.match(deploymentMarkup, /内部端口/, "Deployment SSR 应渲染内部端口");
    assert.match(deploymentMarkup, /重建部署/, "Deployment SSR 应渲染重建部署入口");
    assert.match(deploymentMarkup, /重启 Gateway/, "Deployment SSR 应渲染重启 Gateway 入口");
    assert.match(deploymentMarkup, /清理实例目录/, "Deployment SSR 应渲染清理实例目录入口");

    const diagnosticsMarkup = renderModule.renderRemoteNodePage("/instance/remote-gateway/diagnostics");
    assert.match(diagnosticsMarkup, /健康摘要|集中答案/, "Diagnostics SSR 应渲染健康摘要");
    assert.match(diagnosticsMarkup, /运行载体/, "Diagnostics SSR 应渲染运行载体状态");
    assert.match(diagnosticsMarkup, /端口映射/, "Diagnostics SSR 应渲染端口映射");
    assert.match(diagnosticsMarkup, /运行服务/, "Diagnostics SSR 应渲染运行服务检查");
    assert.match(diagnosticsMarkup, /Gateway 检查/, "Diagnostics SSR 应渲染 Gateway 检查");
    assert.match(diagnosticsMarkup, /最近诊断结论/, "Diagnostics SSR 应渲染最近诊断结论");
  } finally {
    console.error = originalConsoleError;
  }
} finally {
  await viteServer.close();
}
