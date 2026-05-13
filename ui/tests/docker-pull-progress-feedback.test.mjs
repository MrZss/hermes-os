import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const createInstance = read("src/app/pages/CreateInstance.tsx");
const dockerRuntime = read("desktop/services/docker-runtime.mjs");
const localInstance = read("desktop/services/local-instance.mjs");
const instanceRuntime = read("desktop/services/instance-runtime.mjs");

assert.match(
  createInstance,
  /准备运行服务/,
  "Hidden container deployment stages should use launch-facing runtime-service wording.",
);

assert.match(
  createInstance,
  /启动网关服务/,
  "Hidden container deployment stages should communicate gateway-service startup without exposing Docker in the primary flow.",
);

assert.match(
  createInstance,
  /已等待 \{deployElapsedLabel\}/,
  "Deployment loading UI should surface elapsed wait time for long-running tasks.",
);

assert.match(
  createInstance,
  /首次准备运行环境可能需要几分钟/,
  "Deployment loading UI should set expectations when the first runtime preparation takes a while.",
);

assert.match(
  createInstance,
  /实时输出/,
  "Technical details should present Docker pull logs as live output, not only installer output.",
);

assert.match(
  dockerRuntime,
  /function createDockerPullProgressTracker\(/,
  "Docker runtime should track pull-layer progress so the desktop UI can show live feedback.",
);

assert.match(
  dockerRuntime,
  /onOutput\?\.\("stdout", text\)/,
  "Docker process runner should accept streamed output callbacks for long-running commands.",
);

assert.match(
  dockerRuntime,
  /emitProgress\(\{\s*operationId,\s*scope,\s*stage: "docker-image-pull",\s*stream,/s,
  "Docker pull progress should forward raw stream output for in-client technical inspection.",
);

assert.match(
  dockerRuntime,
  /正在下载镜像层|正在解压镜像层|镜像层已写入本地/,
  "Docker pull progress should translate raw layer states into user-facing Chinese progress messages.",
);

assert.match(
  localInstance,
  /API_SERVER_ENABLED/,
  "Local instance bootstrap should enable Hermes API server so the desktop health check has a real endpoint to probe.",
);

assert.match(
  localInstance,
  /API_SERVER_HOST/,
  "Local instance bootstrap should configure the API server host for Docker access.",
);

assert.match(
  instanceRuntime,
  /probeLocalGatewayHealth|http\.request|https\.request/,
  "Desktop runtime checks should probe localhost gateway health without relying on proxy-aware fetch().",
);

assert.doesNotMatch(
  instanceRuntime,
  /fetch\(`\$\{instance\.endpoint\.replace\(\/\\\\\/\\\$\/, ""\)\}\/health`/,
  "Desktop runtime checks should not use fetch() directly for localhost health probes, because proxy settings can produce false gateway failures.",
);

console.log("docker pull progress feedback assertions passed");
