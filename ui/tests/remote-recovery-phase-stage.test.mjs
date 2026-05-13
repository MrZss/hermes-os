import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importRemoteSource = fs.readFileSync(path.join(root, "desktop/services/import-existing-remote-instance.mjs"), "utf8");
const instancesSource = fs.readFileSync(path.join(root, "src/app/services/instances.ts"), "utf8");
const desktopTypes = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");

assert.match(importRemoteSource, /lastRecoveredAt|recovery/, "远程导入服务应写入恢复元数据，而不是只返回 message");
assert.match(importRemoteSource, /lastError:\s*status === "warning" \? \(candidate\.detail \|\| undefined\) : undefined/, "远程恢复成功后应在非 warning 场景清理旧 lastError，避免 warning 残留");
assert.match(instancesSource, /lastRecoveredAt\?: string/, "实例类型应声明最近恢复时间字段");
assert.match(instancesSource, /lastRecoveryResult\?: string/, "实例类型应声明最近恢复结果字段");
assert.match(desktopTypes, /lastRecoveredAt\?: string/, "桌面桥类型也应同步最近恢复时间字段");
assert.match(desktopTypes, /lastRecoveryResult\?: string/, "桌面桥类型也应同步最近恢复结果字段");

const vite = await import("vite");
const viteServer = await vite.createServer({
  root: path.join(root),
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const runtimeModule = await viteServer.ssrLoadModule("/src/app/services/runtime.ts");
  const overviewModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Overview.tsx");
  const deploymentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Deployment.tsx");

  const recoveredRemote = runtimeModule.mapRecordToConsoleInstance(
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
      lastCheckedAt: "2026-05-04T08:12:00.000Z",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "已重新接管远程实例并同步最新容器端口。",
      security: "SSH 隧道",
      providerId: "openrouter",
      model: "glm-4.5-air",
      defaultProfile: "默认档案",
      lastError: undefined,
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
      detail: "节点已恢复并重新连通。",
    }
  );

  assert.equal(recoveredRemote.status, "normal", "恢复成功后不应继续保留 warning 状态");
  assert.equal(recoveredRemote.lastError, undefined, "恢复成功后 runtime 实例不应继续暴露旧错误");
  assert.match(recoveredRemote.summary, /8650/, "恢复成功后的 summary 应同步最新 publishedPort");

  const overviewSnapshot = overviewModule.buildRemoteNodeSnapshot(recoveredRemote);
  assert.ok(overviewSnapshot.coreRows.some((row) => row.label === "最近恢复"), "概况页应展示最近恢复时间");
  assert.ok(overviewSnapshot.outcomeRows.some((row) => row.label === "最近恢复"), "概况页应通过结果面板展示最近恢复结果");

  const deploymentModel = deploymentModule.buildDeploymentViewModel(recoveredRemote, {
    rawRecord: {
      docker: { publishedPort: 8650, containerName: "hermes-console-remote-gateway-new", containerPort: 8642, image: "nousresearch/hermes-agent:latest", command: ["gateway", "run"] },
      remote: { workdir: "/srv/hermes" },
      createdAt: "2026-05-04T08:00:00.000Z",
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "已重新接管远程实例并同步最新容器端口。",
    },
    diagnostics: { docker: { available: true, daemonRunning: true, detail: "Docker 正常。" }, gateway: { reachable: true, detail: "Gateway 正常。" }, detail: "节点已恢复并重新连通。" },
  });
  assert.ok(deploymentModel.metadata.some((item) => item.label === "最近恢复"), "部署页应展示最近恢复时间");
  assert.ok(deploymentModel.outcomeRows.some((item) => item.label === "最近恢复"), "部署页应通过结果面板展示恢复结果");

  console.log("remote recovery phase stage assertions passed");
} finally {
  await viteServer.close();
}
