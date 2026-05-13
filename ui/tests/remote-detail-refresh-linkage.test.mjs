import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(root, 'src/app/services/runtime.ts'), 'utf8');
const overviewSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Overview.tsx'), 'utf8');
const deploymentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Deployment.tsx'), 'utf8');
const environmentSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Environment.tsx'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(root, 'src/app/pages/instance/Diagnostics.tsx'), 'utf8');

assert.match(runtimeSource, /export async function loadConsoleRuntimeDetailState\(/, 'runtime 应提供统一详情刷新 helper');
assert.match(overviewSource, /loadConsoleRuntimeDetailState\(/, 'Overview 应复用统一详情刷新 helper');
assert.match(deploymentSource, /loadConsoleRuntimeDetailState\(/, 'Deployment 应复用统一详情刷新 helper');
assert.match(environmentSource, /loadConsoleRuntimeDetailState\(/, 'Environment 应复用统一详情刷新 helper');
assert.match(diagnosticsSource, /loadConsoleRuntimeDetailState\(/, 'Diagnostics 应复用统一详情刷新 helper');
assert.match(overviewSource, /payload\.instance\.id === id/, 'Overview 同页恢复导入时应处理相同实例 id 的即时刷新');
assert.match(deploymentSource, /payload\.instance\.id === id/, 'Deployment 同页恢复导入时应处理相同实例 id 的即时刷新');

console.log('remote detail refresh linkage assertions passed');
