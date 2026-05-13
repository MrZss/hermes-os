import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteInstancePath = path.join(root, "desktop/services/remote-instance.mjs");
const instanceStatePath = path.join(root, "desktop/services/instance-state.mjs");
const runtimePath = path.join(root, "desktop/services/instance-runtime.mjs");

const remoteInstance = fs.readFileSync(remoteInstancePath, "utf8");
const instanceState = fs.readFileSync(instanceStatePath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

assert.match(
  remoteInstance,
  /export async function inspectRemoteGatewayHealth\(connection, gatewayPort = DEFAULT_GATEWAY_PORT, options = \{\}\)/,
  "远程 Gateway 健康检查必须接受 options.containerName，不能只探测 HTTP /health。",
);

assert.match(
  remoteInstance,
  /buildRemoteGatewayRuntimeProbeScript/,
  "远程 Docker Gateway 健康检查必须有容器运行态/进程/日志探针。",
);

assert.match(
  remoteInstance,
  /Gateway 进程正在运行|Cron ticker started|Press Ctrl\+C to stop/,
  "远程 Docker Gateway 应按 hermes gateway run 进程或官方运行日志判定健康。",
);

assert.match(
  instanceState,
  /inspectRemoteGatewayHealth\(connection, healedInstance\.docker\?\.publishedPort, \{ containerName: healedInstance\.docker\?\.containerName \}\)/,
  "实例状态刷新必须把远程 Docker 容器名传给健康检查，避免误报 /health reset。",
);

assert.match(
  runtime,
  /inspectRemoteGatewayHealth\(connection, instance\.docker\?\.publishedPort, \{ containerName: instance\.docker\?\.containerName \}\)/,
  "运行时诊断必须把远程 Docker 容器名传给健康检查，显示真实原因而不是泛化超时。",
);

assert.doesNotMatch(
  instanceState,
  /远程容器运行中，Gateway health endpoint 正常。/,
  "远程 Docker 状态文案不能再暗示 Hermes Gateway 一定有 HTTP health endpoint。",
);

console.log("remote docker gateway runtime health assertions passed");
