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
  const environmentModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Environment.tsx");
  const diagnosticsModule = await viteServer.ssrLoadModule("/src/app/pages/instance/Diagnostics.tsx");

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
      container: { status: "running", pid: 21888, startedAt: "2026-05-04T08:10:10.000Z" },
    }
  );

  const environmentModel = environmentModule.buildEnvironmentViewModel(recoveredRemote, {
    rawRecord: {
      docker: { publishedPort: 8650, containerName: "hermes-console-remote-gateway-new", containerPort: 8642 },
      remote: { workdir: "/srv/hermes" },
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "已重新接管远程实例并同步最新容器端口。",
    },
    diagnostics: {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: true, detail: "Gateway 正常。" },
      detail: "节点已恢复并重新连通。",
    },
  });
  assert.ok(environmentModel.recommendations.some((item) => /恢复|接管/.test(`${item.title} ${item.detail}`)), "Environment 应展示最近恢复结果，帮助确认节点已重新接管");

  const diagnosticsModel = diagnosticsModule.buildDiagnosticsViewModel(recoveredRemote, {
    rawRecord: {
      docker: { publishedPort: 8650, containerName: "hermes-console-remote-gateway-new", containerPort: 8642 },
      lastRecoveredAt: "2026-05-04T08:10:00.000Z",
      lastRecoveryResult: "已重新接管远程实例并同步最新容器端口。",
    },
    diagnostics: {
      docker: { available: true, daemonRunning: true, detail: "Docker 正常。" },
      gateway: { reachable: true, detail: "Gateway 正常。" },
      detail: "节点已恢复并重新连通。",
      container: { status: "running", pid: 21888, startedAt: "2026-05-04T08:10:10.000Z" },
    },
  });
  assert.match(diagnosticsModel.conclusion, /恢复|接管/, "Diagnostics 最近诊断结论应优先包含恢复结果");
  assert.ok(diagnosticsModel.hints.some((item) => /恢复|接管/.test(item)), "Diagnostics hints 应提醒最近已执行恢复动作");

  console.log("remote recovery observability assertions passed");
} finally {
  await viteServer.close();
}
