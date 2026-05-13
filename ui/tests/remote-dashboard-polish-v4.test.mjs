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

  assert.equal(typeof dashboardModule.buildDashboardInstanceCardModel, "function", "Dashboard 应导出实例卡片模型 helper");
  assert.equal(typeof dashboardModule.buildDashboardRecentActivityModel, "function", "Dashboard 应导出最近活动模型 helper");
  assert.equal(typeof dashboardModule.resolveDashboardFlashVariant, "function", "Dashboard 应导出 flash 反馈样式 helper");

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
      lastError: "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。",
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
  assert.equal(cardModel.isRecoverableRemoteLoss, true, "恢复态远程卡片应继续可识别");
  assert.match(cardModel.cardClassName, /amber|warning|border-amber/, "恢复态远程卡片应有更明显的高亮样式");
  assert.equal(cardModel.primaryAction.label, "重新扫描并导入", "恢复态卡片应保留恢复入口");

  const activity = dashboardModule.buildDashboardRecentActivityModel([recoverableRemote]);
  assert.equal(activity[0].actionLabel, "重新扫描并导入", "最近活动应给恢复入口");
  assert.equal(activity[0].instanceId, "remote-gateway", "最近活动恢复入口应能定位实例");
  assert.match(activity[0].detail, /重新扫描并导入|重新创建/, "最近活动文案应提示恢复动作");

  const recoveredRemote = {
    ...recoverableRemote,
    status: "normal",
    runtimeState: "running",
    lastError: undefined,
    lastRecoveredAt: "2026-05-04T08:10:00.000Z",
    lastRecoveryResult: "已重新接管远程实例并同步最新容器端口。",
  };
  const recoveredActivity = dashboardModule.buildDashboardRecentActivityModel([recoveredRemote]);
  assert.equal(recoveredActivity[0].title, "远程实例已恢复", "恢复成功后最近活动应优先展示恢复事件");
  assert.equal(recoveredActivity[0].tag, "已恢复", "恢复成功后最近活动 tag 应切换为已恢复");
  assert.match(recoveredActivity[0].detail, /重新接管远程实例/, "恢复成功后最近活动应展示恢复结果");

  assert.equal(dashboardModule.resolveDashboardFlashVariant("该远程实例已存在于 Console 中，已定位到现有实例。"), "warning", "重复接管类反馈应使用 warning badge");
  assert.equal(dashboardModule.resolveDashboardFlashVariant("导入成功，已恢复远程实例。"), "success", "成功恢复类反馈应使用 success badge");

  console.log("remote dashboard polish v4 assertions passed");
} finally {
  await viteServer.close();
}
