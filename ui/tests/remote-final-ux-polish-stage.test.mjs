import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(root, 'src/app/services/runtime.ts'), 'utf8');
const createSource = fs.readFileSync(path.join(root, 'src/app/pages/CreateInstance.tsx'), 'utf8');
const rootLayoutSource = fs.readFileSync(path.join(root, 'src/app/layout/RootLayout.tsx'), 'utf8');
const overviewSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Overview.tsx'), 'utf8');
const environmentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Environment.tsx'), 'utf8');
const deploymentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Deployment.tsx'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Diagnostics.tsx'), 'utf8');

assert.match(runtimeSource, /export function buildRemoteNodeUxCopy\(/, 'runtime 应提供远程节点最终 UX 文案 helper');
assert.match(runtimeSource, /下一步：前往部署管理查看当前结果面板/, '统一 UX helper 应内置远程创建成功后的下一步文案');
assert.match(runtimeSource, /primaryLabel:\s*"前往部署管理"/, '统一 UX helper 应把远程节点主 CTA 统一为前往部署管理');
assert.match(rootLayoutSource, /activeInstance\.type === "remote"/, 'RootLayout 应按远程实例类型切换页头与实例摘要');
assert.match(rootLayoutSource, /activeInstanceCompactMeta[\s\S]*\?\s*"远程节点"/, 'RootLayout 远程实例摘要应显示远程节点身份');
assert.match(rootLayoutSource, /activeInstanceHeaderSignal[\s\S]*\?\s*activeInstance\.sshTarget \?\? activeInstance\.security/, '远程实例页头主信号应优先显示 SSH 目标');
assert.match(rootLayoutSource, /activeInstance && !isRemoteActive/, '远程实例页头不应继续展示默认档案与模型噪音');
assert.match(createSource, /buildRemoteNodeUxCopy\(/, 'CreateInstance 远程成功卡片应复用统一 UX 文案 helper');
assert.match(overviewSource, /buildRemoteNodeUxCopy\(/, 'Overview 应复用统一 UX 文案 helper');
assert.match(overviewSource, /前往部署管理/, 'Overview 主 CTA 应使用前往部署管理文案');
assert.match(environmentSource, /buildRemoteNodeUxCopy\(/, 'Environment 应复用统一 UX 文案 helper');
assert.match(deploymentSource, /buildRemoteNodeUxCopy\(/, 'Deployment 应复用统一 UX 文案 helper');
assert.match(diagnosticsSource, /buildRemoteNodeUxCopy\(/, 'Diagnostics 应复用统一 UX 文案 helper');

console.log('remote final ux polish stage assertions passed');
