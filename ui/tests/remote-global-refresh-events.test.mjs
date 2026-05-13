import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(root, 'src/app/services/runtime.ts'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'src/app/pages/Dashboard.tsx'), 'utf8');
const overviewSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Overview.tsx'), 'utf8');
const deploymentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Deployment.tsx'), 'utf8');
const environmentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Environment.tsx'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Diagnostics.tsx'), 'utf8');

assert.match(runtimeSource, /export const CONSOLE_RUNTIME_REFRESH_EVENT = "hermes-console:runtime-refresh"/, 'runtime 应定义全局刷新事件名');
assert.match(runtimeSource, /export function publishConsoleRuntimeRefresh\(/, 'runtime 应提供刷新事件发布 helper');
assert.match(runtimeSource, /export function subscribeConsoleRuntimeRefresh\(/, 'runtime 应提供刷新事件订阅 helper');
assert.match(dashboardSource, /subscribeConsoleRuntimeRefresh\(/, 'Dashboard 应订阅全局刷新事件');
assert.match(dashboardSource, /publishConsoleRuntimeRefresh\(/, 'Dashboard 在远程恢复导入成功后应发布全局刷新事件');
assert.match(overviewSource, /subscribeConsoleRuntimeRefresh\(/, 'Overview 应订阅全局刷新事件');
assert.match(overviewSource, /publishConsoleRuntimeRefresh\(/, 'Overview 在远程动作成功后应发布全局刷新事件');
assert.match(deploymentSource, /subscribeConsoleRuntimeRefresh\(/, 'Deployment 应订阅全局刷新事件');
assert.match(deploymentSource, /publishConsoleRuntimeRefresh\(/, 'Deployment 在远程动作成功后应发布全局刷新事件');
assert.match(environmentSource, /subscribeConsoleRuntimeRefresh\(/, 'Environment 应订阅全局刷新事件');
assert.match(diagnosticsSource, /subscribeConsoleRuntimeRefresh\(/, 'Diagnostics 应订阅全局刷新事件');

console.log('remote global refresh event assertions passed');
