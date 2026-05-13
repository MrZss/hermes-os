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
  const dashboardModule = await viteServer.ssrLoadModule("/src/app/pages/Dashboard.tsx");
  const runtimeModule = await viteServer.ssrLoadModule("/src/app/services/runtime.ts");

  assert.equal(typeof dashboardModule.buildDashboardInstanceCardModel, "function", "Dashboard 应导出实例卡片 view model helper");

  const recoverableRemote = runtimeModule.mapRecordToConsoleInstance(
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
      lastCheckedAt: "2026-05-04T08:08:00.000Z",
      security: "SSH 隧道",
      providerId: "openrouter",
      model: "glm-4.5-air",
      defaultProfile: "默认档案",
      lastError: "No such object: hermes-console-remote-gateway-old",
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
      gateway: { reachable: false, detail: "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。" },
      detail: "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。",
    }
  );

  const cardModel = dashboardModule.buildDashboardInstanceCardModel(recoverableRemote);
  assert.equal(cardModel.isRecoverableRemoteLoss, true, "主页实例卡片应识别远程缺容器恢复态");
  assert.equal(cardModel.primaryAction.label, "重新扫描并导入", "主页实例卡片应直接给恢复入口");
  assert.match(cardModel.summary, /重新扫描并导入|重新创建/, "主页摘要应提示恢复动作");
  assert.match(cardModel.metaText, /8650/, "端口漂移后主页卡片应显示最新 publishedPort");
  assert.doesNotMatch(cardModel.summary, /No such object:/i, "主页卡片不应暴露底层 docker 缺对象报错");

  const normalRemote = {
    ...recoverableRemote,
    status: "normal",
    summary: "远程节点运行中，可通过 ssh://10.0.0.8:22 管理容器与映射端口 8650。",
    lastError: undefined,
  };
  const normalModel = dashboardModule.buildDashboardInstanceCardModel(normalRemote);
  assert.equal(normalModel.isRecoverableRemoteLoss, false, "正常远程实例不应显示恢复入口");
  assert.equal(normalModel.primaryAction.label, "打开工作区", "正常实例仍应维持默认入口");

  console.log("remote dashboard recovery actions assertions passed");
} finally {
  await viteServer.close();
}
