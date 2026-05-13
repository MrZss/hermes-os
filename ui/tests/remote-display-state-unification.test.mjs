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
  const runtimeModule = await viteServer.ssrLoadModule("/src/app/services/runtime.ts");
  const dashboardModule = await viteServer.ssrLoadModule("/src/app/pages/Dashboard.tsx");
  const overviewModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Overview.tsx");
  const environmentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Environment.tsx");
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Diagnostics.tsx");

  assert.equal(typeof runtimeModule.resolveRemoteDisplayState, "function", "runtime 应提供统一展示 helper");

  const base = {
    id: "remote-gateway",
    name: "远程网关节点",
    type: "remote",
    runtime: "docker",
    hermesHome: "/srv/hermes/remote-gateway/home",
    workspaceDir: "/srv/hermes/remote-gateway",
    endpoint: "ssh://10.0.0.8:22",
    createdAt: "2026-05-04T08:00:00.000Z",
    lastCheckedAt: "2026-05-04T08:20:00.000Z",
    security: "SSH 隧道",
    providerId: "openrouter",
    model: "glm-4.5-air",
    defaultProfile: "默认档案",
    docker: {
      image: "nousresearch/hermes-agent:latest",
      containerName: "hermes-console-remote-gateway-new",
      publishedPort: 8650,
      containerPort: 8642,
      command: ["gateway", "run"],
    },
    remote: {
      host: "10.0.0.8",
      port: "22",
      user: "ops",
      authMode: "password",
      workdir: "/srv/hermes",
    },
  };

  const operated = runtimeModule.mapRecordToConsoleInstance(
    {
      ...base,
      status: "running",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
      lastRecoveryAt: undefined,
      lastRecoveryResult: undefined,
    },
    {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: true, detail: "Gateway 正常。" },
      detail: "节点状态正常。",
    },
  );

  const operatedDisplay = runtimeModule.resolveRemoteDisplayState(operated);
  assert.equal(operatedDisplay.tone, "success", "运维完成且节点正常时应统一为 success tone");
  assert.equal(operatedDisplay.badgeLabel, "稳定", "运维完成且节点正常时 badge 应统一为稳定");
  assert.equal(operatedDisplay.statusValue, "健康", "运维完成且节点正常时诊断状态值应统一为健康");
  assert.match(operatedDisplay.headline, /Gateway 已重启完成/, "headline 应统一使用最近运维结果");
  assert.match(operatedDisplay.hint, /部署管理|AI 提供商|消息平台/, "稳定态 hint 应指向后续配置或观察动作");

  const operatedActivity = dashboardModule.buildDashboardRecentActivityModel([operated])[0];
  assert.match(operatedActivity.detail, /Gateway 已重启完成/, "Dashboard 最近活动应复用统一 headline");
  const operatedOverview = overviewModule.buildRemoteNodeSnapshot(operated);
  assert.match(operatedOverview.healthSignal.detail, /Gateway 已重启完成/, "Overview 应复用统一 headline");
  const operatedEnvironment = environmentModule.buildEnvironmentViewModel(operated, {});
  assert.equal(operatedEnvironment.summary.value, "稳定", "Environment 摘要值应复用统一 badge label");
  assert.match(operatedEnvironment.hint, /部署管理|AI 提供商|消息平台/, "Environment hint 应复用统一 hint");
  const operatedDiagnostics = diagnosticsModule.buildDiagnosticsViewModel(operated, {});
  assert.equal(operatedDiagnostics.summary.value, "健康", "Diagnostics 摘要值应复用统一诊断状态值");
  assert.match(operatedDiagnostics.hints[0], /部署管理|AI 提供商|消息平台/, "Diagnostics 第一条 hint 应复用统一 hint");

  const recoverable = runtimeModule.mapRecordToConsoleInstance(
    {
      ...base,
      status: "failed",
      lastError: "No such object: hermes-console-remote-gateway-gone",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：上次已重新接管成功",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: false, detail: "No such object: hermes-console-remote-gateway-gone" },
      detail: "No such object: hermes-console-remote-gateway-gone",
    },
  );

  const recoverableDisplay = runtimeModule.resolveRemoteDisplayState(recoverable, {
    diagnostics: {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: false, detail: "No such object: hermes-console-remote-gateway-gone" },
      detail: "No such object: hermes-console-remote-gateway-gone",
    },
  });
  assert.equal(recoverableDisplay.tone, "warning", "缺容器恢复态应统一为 warning tone");
  assert.equal(recoverableDisplay.badgeLabel, "待恢复", "缺容器恢复态 badge 应统一为待恢复");
  assert.equal(recoverableDisplay.statusValue, "待恢复", "缺容器恢复态诊断状态值应统一为待恢复");
  assert.match(recoverableDisplay.headline, /受管远程运行服务已不存在/, "缺运行服务恢复态 headline 应统一");
  assert.match(recoverableDisplay.hint, /重新扫描并导入|重新创建/, "缺容器恢复态 hint 应指向恢复闭环");

  const recoverableActivity = dashboardModule.buildDashboardRecentActivityModel([recoverable])[0];
  assert.equal(recoverableActivity.tag, "待恢复", "Dashboard 恢复态 tag 应统一");
  const recoverableEnvironment = environmentModule.buildEnvironmentViewModel(recoverable, {
    diagnostics: {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: false, detail: "No such object: hermes-console-remote-gateway-gone" },
      detail: "No such object: hermes-console-remote-gateway-gone",
    },
  });
  assert.equal(recoverableEnvironment.summary.value, "待恢复", "Environment 恢复态摘要值应统一");
  const recoverableDiagnostics = diagnosticsModule.buildDiagnosticsViewModel(recoverable, {
    diagnostics: {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: false, detail: "No such object: hermes-console-remote-gateway-gone" },
      detail: "No such object: hermes-console-remote-gateway-gone",
    },
  });
  assert.equal(recoverableDiagnostics.summary.value, "待恢复", "Diagnostics 恢复态摘要值应统一");
  const recoverableContainerCheck = recoverableDiagnostics.checks.find((item) => item.label === "运行载体");
  assert.match(
    recoverableContainerCheck?.value ?? "",
    /不存在/,
    "受管运行服务已不存在时，Diagnostics 不应继续显示待回传，而应直接标明运行服务不存在。",
  );
  assert.match(
    recoverableContainerCheck?.detail ?? "",
    /已不存在|重新扫描并导入|重新创建/,
    "受管运行服务已不存在时，运行载体明细应直接给出恢复态提示。",
  );
  const recoverablePortCheck = recoverableDiagnostics.checks.find((item) => item.label === "端口映射");
  assert.equal(
    recoverablePortCheck?.tone,
    "warning",
    "受管运行服务已不存在时，端口映射不应继续显示为正常。",
  );
  assert.match(
    recoverablePortCheck?.detail ?? "",
    /未验证|已不存在|重新创建/,
    "受管运行服务已不存在时，端口映射明细应明确这是残留注册信息而非实时正常结果。",
  );

  console.log("remote display state unification assertions passed");
} finally {
  await viteServer.close();
}
