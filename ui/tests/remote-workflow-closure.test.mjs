import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(root, 'src/app/services/runtime.ts'), 'utf8');
const createSource = fs.readFileSync(path.join(root, 'src/app/pages/CreateInstance.tsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'src/app/pages/Dashboard.tsx'), 'utf8');
const deploymentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Deployment.tsx'), 'utf8');

assert.match(runtimeSource, /export function buildRemoteWorkflowTarget\(/, 'runtime 应提供远程工作流落点 helper');
assert.match(runtimeSource, /下一步：前往部署管理查看当前结果面板/, 'runtime 统一 UX helper 应提供远程成功后的明确下一步');
assert.match(runtimeSource, /primaryLabel:\s*"前往部署管理"/, 'runtime 统一 UX helper 应把远程成功主按钮统一为前往部署管理');
assert.match(createSource, /buildRemoteWorkflowTarget\(/, 'CreateInstance 远程创建成功后应复用统一工作流落点 helper');
assert.match(createSource, /buildRemoteNodeUxCopy\(/, 'CreateInstance 远程成功卡片应复用统一 UX helper');
assert.match(dashboardSource, /buildRemoteWorkflowTarget\(/, 'Dashboard 恢复后应复用统一工作流落点 helper');
assert.match(deploymentSource, /远程实例需要重新接管/, 'Deployment 缺容器空状态文案应保留恢复闭环入口');

console.log('remote workflow closure assertions passed');
