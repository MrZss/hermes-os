import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instancesSource = fs.readFileSync(path.join(root, "src/app/services/instances.ts"), "utf8");
const desktopTypes = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");
const runtimeSource = fs.readFileSync(path.join(root, "src/app/services/runtime.ts"), "utf8");
const deploymentSource = fs.readFileSync(path.join(root, "src/app/pages/instance/Deployment.tsx"), "utf8");
const officialActionsSource = fs.readFileSync(path.join(root, "desktop/services/hermes-official-actions.mjs"), "utf8");
const stateSource = fs.readFileSync(path.join(root, "desktop/services/instance-state.mjs"), "utf8");

assert.match(instancesSource, /lastOperationAt\?: string/, "实例类型应声明最近运维动作时间");
assert.match(instancesSource, /lastOperationType\?: string/, "实例类型应声明最近运维动作类型");
assert.match(instancesSource, /lastOperationResult\?: string/, "实例类型应声明最近运维动作结果");
assert.match(desktopTypes, /lastOperationAt\?: string/, "桌面桥类型应同步最近运维动作时间");
assert.match(desktopTypes, /lastOperationType\?: string/, "桌面桥类型应同步最近运维动作类型");
assert.match(desktopTypes, /lastOperationResult\?: string/, "桌面桥类型应同步最近运维动作结果");
assert.match(runtimeSource, /lastOperationAt: instance\.lastOperationAt/, "runtime 应映射最近运维动作时间");
assert.match(runtimeSource, /lastOperationType: instance\.lastOperationType/, "runtime 应映射最近运维动作类型");
assert.match(runtimeSource, /lastOperationResult: instance\.lastOperationResult/, "runtime 应映射最近运维动作结果");
assert.match(deploymentSource, /最近运维动作/, "部署页应展示最近运维动作");
assert.match(officialActionsSource, /lastOperationType|gateway-restart/, "Gateway 重启动作应写回统一运维动作字段");
assert.match(stateSource, /lastOperationType|redeploy|start|stop/, "实例启动停止重建链路应写回统一运维动作字段");

const vite = await import("vite");
const viteServer = await vite.createServer({
  root: path.join(root),
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const runtimeModule = await viteServer.ssrLoadModule("/src/app/services/runtime.ts");
  const dashboardModule = await viteServer.ssrLoadModule("/src/app/pages/Dashboard.tsx");
  const deploymentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Deployment.tsx");

  const operatedRemote = runtimeModule.mapRecordToConsoleInstance(
    {
      id: "remote-gateway",
      name: "远程网关节点",
      type: "remote",
      runtime: "docker",
      hermesHome: "/srv/hermes/remote-gateway/home",
      workspaceDir: "/srv/hermes/remote-gateway",
      endpoint: "ssh://10.0.0.8:22",
      status: "running",
      createdAt: "2026-05-04T08:00:00.000Z",
      lastCheckedAt: "2026-05-04T08:20:00.000Z",
      lastOperationAt: "2026-05-04T08:19:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "Gateway 已触发重启，最新节点状态已重新读取。",
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
      gateway: { reachable: true, detail: "Gateway 正常。" },
      detail: "节点状态正常。",
    }
  );

  const activity = dashboardModule.buildDashboardRecentActivityModel([operatedRemote]);
  assert.equal(activity[0].title, "远程节点运维已完成", "最近活动应优先展示最近运维动作");
  assert.equal(activity[0].tag, "已运维", "最近活动 tag 应标识为已运维");
  assert.match(activity[0].detail, /Gateway 已触发重启/, "最近活动应展示最近运维动作结果");

  const deploymentModel = deploymentModule.buildDeploymentViewModel(operatedRemote, {
    rawRecord: {
      docker: { publishedPort: 8650, containerName: "hermes-console-remote-gateway-new", containerPort: 8642, image: "nousresearch/hermes-agent:latest", command: ["gateway", "run"] },
      remote: { workdir: "/srv/hermes" },
      createdAt: "2026-05-04T08:00:00.000Z",
      lastOperationAt: "2026-05-04T08:19:00.000Z",
      lastOperationType: "gateway-restart",
      lastOperationResult: "Gateway 已触发重启，最新节点状态已重新读取。",
    },
    diagnostics: { docker: { available: true, daemonRunning: true, detail: "Docker 正常。" }, gateway: { reachable: true, detail: "Gateway 正常。" }, detail: "节点状态正常。" },
  });
  assert.ok(deploymentModel.metadata.some((item) => item.label === "最近运维动作"), "部署页应展示最近运维动作");
  assert.ok(deploymentModel.outcomeRows.some((item) => item.label === "最近运维"), "部署页应通过结果面板展示最近运维结果");

  console.log("remote operations phase stage assertions passed");
} finally {
  await viteServer.close();
}
