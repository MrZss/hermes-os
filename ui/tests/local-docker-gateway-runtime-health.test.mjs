import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instanceStatePath = path.join(root, "desktop/services/instance-state.mjs");
const runtimePath = path.join(root, "desktop/services/instance-runtime.mjs");

const instanceState = fs.readFileSync(instanceStatePath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

assert.match(
  instanceState,
  /parseRemoteGatewayRuntimeProbeOutput as parseDockerGatewayRuntimeProbeOutput/,
  "本地 Docker Gateway 应复用 Docker 运行态解析，不能只依赖 HTTP /health。",
);

assert.match(
  instanceState,
  /async function inspectLocalDockerGatewayHealth\(containerName, endpoint\)/,
  "本地 Docker 状态刷新必须先检查容器内 gateway 进程/日志。",
);

assert.match(
  instanceState,
  /inspectLocalDockerGatewayHealth\(instance\.docker\.containerName, instance\.endpoint\)/,
  "本地 Docker 实例刷新不能直接调用 inspectGatewayHealth(instance.endpoint)。",
);

assert.match(
  runtime,
  /async function probeLocalDockerGatewayHealth\(instance\)/,
  "运行时诊断必须为本地 Docker 使用容器进程/日志健康检查。",
);

assert.match(
  runtime,
  /instance\.runtime === "docker"\s*\? probeLocalDockerGatewayHealth\(instance\)\s*:\s*probeLocalGatewayHealth\(instance\.endpoint\)/,
  "运行时诊断必须区分本地 Docker 与非 Docker Gateway。",
);

console.log("local docker gateway runtime health assertions passed");
