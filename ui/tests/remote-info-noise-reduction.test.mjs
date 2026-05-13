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
  const overviewModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Overview.tsx");
  const deploymentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Deployment.tsx");
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Diagnostics.tsx");

  assert.equal(typeof runtimeModule.buildRemoteOutcomePanel, "function", "runtime 应提供共享结果面板 helper");

  const instance = runtimeModule.mapRecordToConsoleInstance(
    {
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
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "恢复结果：已重新接管并同步端口",
      lastOperationAt: "2026-05-04T08:18:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "运维结果：Gateway 已重启完成",
      lastError: "最近错误：Gateway 健康检查仍抖动",
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
    },
    {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: false, detail: "Gateway 健康检查仍抖动" },
      detail: "Gateway 健康检查仍抖动",
    },
  );

  const outcomePanel = runtimeModule.buildRemoteOutcomePanel(instance);
  assert.equal(outcomePanel.rows.length, 4, "共享结果面板应压缩为固定 4 行以内");
  assert.deepEqual(
    outcomePanel.rows.map((row) => row.label),
    ["当前结论", "最近恢复", "最近运维", "最近错误"],
    "共享结果面板应统一行顺序，避免页面各自拼装",
  );
  assert.match(outcomePanel.rows[0].value, /Gateway 健康检查仍抖动/, "第一行应始终展示当前主结论");

  const overviewSnapshot = overviewModule.buildRemoteNodeSnapshot(instance);
  assert.ok(Array.isArray(overviewSnapshot.outcomeRows), "Overview 应暴露共享结果面板行");
  assert.equal(overviewSnapshot.outcomeRows.length, 4, "Overview 结果区块应压缩为 4 行以内");
  assert.ok(!overviewSnapshot.signalRows.some((row) => row.label === "恢复结果"), "Overview 不应再单独重复恢复结果行");
  assert.ok(!overviewSnapshot.signalRows.some((row) => row.label === "运维结果"), "Overview 不应再单独重复运维结果行");

  const deploymentModel = deploymentModule.buildDeploymentViewModel(instance, {});
  assert.ok(Array.isArray(deploymentModel.outcomeRows), "Deployment 应暴露共享结果面板行");
  assert.equal(deploymentModel.outcomeRows.length, 4, "Deployment 结果区块应压缩为 4 行以内");
  assert.ok(!deploymentModel.metadata.some((row) => row.label === "恢复结果"), "Deployment metadata 不应再重复恢复结果");
  assert.ok(!deploymentModel.metadata.some((row) => row.label === "运维结果"), "Deployment metadata 不应再重复运维结果");
  assert.ok(!deploymentModel.metadata.some((row) => row.label === "最近部署结果"), "Deployment metadata 不应再重复当前结论");

  const diagnosticsModel = diagnosticsModule.buildDiagnosticsViewModel(instance, {});
  assert.ok(diagnosticsModel.hints.length <= 4, "Diagnostics hints 应压缩，避免过长列表");
  assert.equal(new Set(diagnosticsModel.hints).size, diagnosticsModel.hints.length, "Diagnostics hints 不应出现重复含义");

  console.log("remote info noise reduction assertions passed");
} finally {
  await viteServer.close();
}
