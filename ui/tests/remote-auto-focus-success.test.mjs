import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(root, 'src/app/services/runtime.ts'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'src/app/pages/Dashboard.tsx'), 'utf8');
const overviewSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Overview.tsx'), 'utf8');
const deploymentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Deployment.tsx'), 'utf8');

assert.match(runtimeSource, /export function buildRemoteSuccessFocusTarget\(/, 'runtime 应提供统一成功聚焦 helper');
assert.match(dashboardSource, /focus=outcome-panel/, 'Dashboard 成功后打开远程实例应带 focus=outcome-panel');
assert.match(overviewSource, /focus=outcome-panel/, 'Overview 恢复成功后应带 focus=outcome-panel');
assert.match(deploymentSource, /focus=outcome-panel/, 'Deployment 恢复成功后应保持结果面板聚焦');
assert.match(deploymentSource, /searchParams\.get\("focus"\)/, 'Deployment 应读取 focus 参数以激活结果面板高亮');
assert.match(deploymentSource, /highlightOutcomePanel/, 'Deployment 应存在结果面板高亮状态');

console.log('remote auto focus success assertions passed');
