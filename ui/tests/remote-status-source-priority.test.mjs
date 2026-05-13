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
  const deploymentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Deployment.tsx");
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Diagnostics.tsx");

  const baseRecord = {
    id: "remote-gateway",
    name: "远程网关节点",
    type: "remote",
    runtime: "docker",
    hermesHome: "/srv/hermes/remote-gateway/home",
    workspaceDir: "/srv/hermes/remote-gateway",
    endpoint: "ssh://10.0.0.8:22",
    status: "warning",
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

  const noisyDiagnostics = {
    docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
    gateway: { reachable: false, detail: "Gateway 巡检失败：curl 56" },
    detail: "诊断摘要：Gateway 未恢复。",
  };

  const instance = runtimeModule.mapRecordToConsoleInstance(
    {
      ...baseRecord,
      lastError: "旧错误：不要再把我当主文案",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    noisyDiagnostics,
  );

  assert.equal(typeof runtimeModule.resolveRemoteStatusNarrative, "function", "runtime 应提供统一状态叙事 helper");

  const narrative = runtimeModule.resolveRemoteStatusNarrative(instance, {
    rawRecord: {
      ...baseRecord,
      lastError: "旧错误：不要再把我当主文案",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    diagnostics: noisyDiagnostics,
  });

  assert.match(narrative.primaryDetail, /运维结果：Gateway 已重启完成/, "统一叙事应优先显示最近运维结果");
  assert.match(narrative.secondaryDetail ?? "", /恢复结果：已经重新接管节点/, "统一叙事应保留最近恢复结果作为次级信息");
  assert.ok(!/旧错误：不要再把我当主文案/.test(narrative.primaryDetail), "旧错误不应继续压过最近运维结果");

  const dashboardActivity = dashboardModule.buildDashboardRecentActivityModel([instance])[0];
  assert.match(dashboardActivity.detail, /运维结果：Gateway 已重启完成/, "Dashboard 最近活动应复用统一主文案");

  const overviewSnapshot = overviewModule.buildRemoteNodeSnapshot(instance);
  assert.match(String(overviewSnapshot.healthSignal.detail), /运维结果：Gateway 已重启完成/, "Overview 健康信号应复用统一主文案");

  const environmentModel = environmentModule.buildEnvironmentViewModel(instance, {
    rawRecord: {
      ...baseRecord,
      lastError: "旧错误：不要再把我当主文案",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    diagnostics: noisyDiagnostics,
  });
  assert.match(environmentModel.summary.detail, /运维结果：Gateway 已重启完成/, "Environment 摘要应复用统一主文案");

  const deploymentModel = deploymentModule.buildDeploymentViewModel(instance, {
    rawRecord: {
      ...baseRecord,
      lastError: "旧错误：不要再把我当主文案",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    diagnostics: noisyDiagnostics,
  });
  assert.match(deploymentModel.summary, /运维结果：Gateway 已重启完成/, "Deployment 摘要应复用统一主文案");

  const diagnosticsModel = diagnosticsModule.buildDiagnosticsViewModel(instance, {
    rawRecord: {
      ...baseRecord,
      lastError: "旧错误：不要再把我当主文案",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    diagnostics: noisyDiagnostics,
  });
  assert.match(diagnosticsModel.conclusion, /运维结果：Gateway 已重启完成/, "Diagnostics 结论应复用统一主文案");

  const recoverable = runtimeModule.mapRecordToConsoleInstance(
    {
      ...baseRecord,
      status: "failed",
      lastError: "No such object: hermes-console-remote-gateway-dead",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    {
      ...noisyDiagnostics,
      detail: "No such object: hermes-console-remote-gateway-dead",
      gateway: { reachable: false, detail: "No such object: hermes-console-remote-gateway-dead" },
    },
  );

  const recoverableNarrative = runtimeModule.resolveRemoteStatusNarrative(recoverable, {
    rawRecord: {
      ...baseRecord,
      status: "failed",
      lastError: "No such object: hermes-console-remote-gateway-dead",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已经重新接管节点",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
    },
    diagnostics: {
      ...noisyDiagnostics,
      detail: "No such object: hermes-console-remote-gateway-dead",
      gateway: { reachable: false, detail: "No such object: hermes-console-remote-gateway-dead" },
    },
  });

  assert.match(recoverableNarrative.primaryDetail, /受管远程运行服务已不存在/, "缺运行服务恢复态必须高于运维/恢复历史");
  assert.equal(recoverableNarrative.kind, "recoverable-loss", "统一叙事应暴露恢复态 kind");

  console.log("remote status source priority assertions passed");
} finally {
  await viteServer.close();
}
