import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = path.join(root, "src/app/services/runtime.ts");
const overviewPath = path.join(root, "src/app/pages/instance/Overview.tsx");
const deploymentPath = path.join(root, "src/app/pages/instance/Deployment.tsx");
const stateModulePath = new URL("../desktop/services/instance-state.mjs", import.meta.url);

const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const overviewSource = fs.readFileSync(overviewPath, "utf8");
const deploymentSource = fs.readFileSync(deploymentPath, "utf8");
const stateModule = await import(stateModulePath);

assert.match(runtimeSource, /export function isRecoverableRemoteContainerLoss\(/, "runtime 应导出统一的远程恢复态判断 helper");
assert.match(runtimeSource, /export function getRecoverableRemoteContainerLossMessage\(/, "runtime 应导出统一的远程恢复提示文案 helper");
assert.match(overviewSource, /isRecoverableRemoteContainerLoss/, "Overview 应复用统一恢复态 helper，而不是单独写正则");
assert.match(deploymentSource, /isRecoverableRemoteContainerLoss/, "Deployment 应复用统一恢复态 helper，而不是单独写正则");
assert.doesNotMatch(overviewSource, /No such object:\\s\*hermes-console-/, "Overview 不应继续内联匹配缺容器底层报错");
assert.doesNotMatch(deploymentSource, /No such object:\\s\*hermes-console-/, "Deployment 不应继续内联匹配缺容器底层报错");

assert.equal(typeof stateModule.normalizeRecoverableRemoteContainerDetail, "function", "instance-state 应导出缺容器可恢复态文案规范化 helper");
assert.equal(
  stateModule.normalizeRecoverableRemoteContainerDetail("Error: No such object: hermes-console-remote-gateway-demo"),
  "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。",
  "instance-state 应把缺运行服务底层报错统一规范成人话恢复提示",
);

console.log("remote recovery state unification assertions passed");
