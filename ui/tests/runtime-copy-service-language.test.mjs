import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const instanceState = read("desktop/services/instance-state.mjs");
const remoteInstance = read("desktop/services/remote-instance.mjs");
const deploymentPage = read("src/app/pages/instance/Deployment.tsx");
const diagnosticsPage = read("src/app/pages/instance/Diagnostics.tsx");

assert.doesNotMatch(
  instanceState,
  /远程容器运行中|本地容器已启动|远程容器已启动|本地容器已停止|远程容器已停止|Docker daemon 未运行，无法启动实例|Docker daemon 未运行，无法停止实例|远程环境未找到 Docker/,
  "Runtime state messages shown in the desktop UI should use 运行服务 wording instead of 容器 wording.",
);

assert.doesNotMatch(
  remoteInstance,
  /detail:\s*"远程 Docker 容器运行中|message:\s*"远程 Docker 容器启动失败|message:\s*"远程 Docker 容器没有保持运行|message:\s*"远程 Docker 镜像拉取失败|message:\s*remoteInspection\.data\.docker\.available \? "远程 Docker daemon 未运行。" : "远程环境未找到 Docker。"/,
  "Remote deployment progress should not expose Docker/container wording in primary user-facing copy.",
);

assert.match(
  instanceState,
  /远程运行服务运行中，Hermes Gateway 进程正常/,
  "Remote running detail should be expressed as 远程运行服务.",
);

assert.match(
  deploymentPage,
  /formatRuntimeServiceDetail\(diagnostics\?\.docker\?\.detail\)/,
  "Deployment primary status card should normalize low-level runtime detail before rendering.",
);

assert.match(
  diagnosticsPage,
  /formatRuntimeServiceDetail\(diagnostics\?\.docker\?\.detail \?\? instance\.diagnostics\?\.dockerDetail\)/,
  "Diagnostics primary checks should normalize low-level runtime detail before rendering.",
);

console.log("runtime copy service-language assertions passed");
