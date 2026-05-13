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
  const runtimeModule = await viteServer.ssrLoadModule('/src/app/services/runtime.ts');
  const dashboardModule = await viteServer.ssrLoadModule('/src/app/pages/Dashboard.tsx');

  assert.equal(typeof runtimeModule.buildRemoteActionFeedback, 'function', 'runtime 应提供统一动作反馈 helper');

  const operated = runtimeModule.mapRecordToConsoleInstance(
    {
      id: 'remote-gateway',
      name: '远程网关节点',
      type: 'remote',
      runtime: 'docker',
      hermesHome: '/srv/hermes/remote-gateway/home',
      workspaceDir: '/srv/hermes/remote-gateway',
      endpoint: 'ssh://10.0.0.8:22',
      status: 'running',
      createdAt: '2026-05-04T08:00:00.000Z',
      lastCheckedAt: '2026-05-04T08:20:00.000Z',
      lastOperationAt: '2026-05-04T08:18:00.000Z',
      lastOperationType: 'gateway-restart',
      lastOperationResult: 'Gateway 已触发重启，最新节点状态已重新读取。',
      security: 'SSH 隧道',
      providerId: 'openrouter',
      model: 'glm-4.5-air',
      defaultProfile: '默认档案',
      docker: { image: 'nousresearch/hermes-agent:latest', containerName: 'hermes-console-remote-gateway-new', publishedPort: 8650, containerPort: 8642, command: ['gateway','run'] },
      remote: { host: '10.0.0.8', port: '22', user: 'ops', authMode: 'password', workdir: '/srv/hermes' },
    },
    { docker: { available: true, daemonRunning: true, detail: 'Docker 正常。' }, gateway: { reachable: true, detail: 'Gateway 正常。' }, detail: '节点状态正常。' }
  );

  const restarted = runtimeModule.buildRemoteActionFeedback(operated, { action: 'gateway-restart' });
  assert.equal(restarted.variant, 'success', 'Gateway 重启成功应统一为 success 反馈');
  assert.match(restarted.message, /Gateway 已触发重启/, 'Gateway 重启反馈应使用统一成功文案');

  const recovered = runtimeModule.mapRecordToConsoleInstance(
    {
      id: 'remote-gateway',
      name: '远程网关节点',
      type: 'remote',
      runtime: 'docker',
      hermesHome: '/srv/hermes/remote-gateway/home',
      workspaceDir: '/srv/hermes/remote-gateway',
      endpoint: 'ssh://10.0.0.8:22',
      status: 'running',
      createdAt: '2026-05-04T08:00:00.000Z',
      lastCheckedAt: '2026-05-04T08:20:00.000Z',
      lastRecoveredAt: '2026-05-04T08:10:00.000Z',
      lastRecoveryResult: '已重新接管远程实例并同步最新容器端口。',
      security: 'SSH 隧道',
      providerId: 'openrouter',
      model: 'glm-4.5-air',
      defaultProfile: '默认档案',
      docker: { image: 'nousresearch/hermes-agent:latest', containerName: 'hermes-console-remote-gateway-new', publishedPort: 8650, containerPort: 8642, command: ['gateway','run'] },
      remote: { host: '10.0.0.8', port: '22', user: 'ops', authMode: 'password', workdir: '/srv/hermes' },
    },
    { docker: { available: true, daemonRunning: true, detail: 'Docker 正常。' }, gateway: { reachable: true, detail: 'Gateway 正常。' }, detail: '节点状态正常。' }
  );

  const reattached = runtimeModule.buildRemoteActionFeedback(recovered, { action: 'recover' });
  assert.equal(reattached.variant, 'success', '恢复成功应统一为 success 反馈');
  assert.match(reattached.message, /已重新接管远程实例/, '恢复成功反馈应优先使用恢复结果');

  const redeployed = runtimeModule.buildRemoteActionFeedback(operated, { action: 'redeploy' });
  assert.match(redeployed.message, /节点已重新启动并刷新部署状态|已重新启动/, '重建部署应统一反馈为重新启动并刷新状态');

  assert.equal(dashboardModule.resolveDashboardFlashVariant(restarted.message), 'success', 'Dashboard flash 对统一成功反馈应保持 success');
  assert.equal(dashboardModule.resolveDashboardFlashVariant(reattached.message), 'success', 'Dashboard flash 对恢复成功反馈应保持 success');

  console.log('remote action feedback unification assertions passed');
} finally {
  await viteServer.close();
}
