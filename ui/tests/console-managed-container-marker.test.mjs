import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const localInstance = read("desktop/services/local-instance.mjs");
const remoteInstance = read("desktop/services/remote-instance.mjs");
const instanceState = read("desktop/services/instance-state.mjs");

for (const [name, source] of [
  ["local create", localInstance],
  ["remote create", remoteInstance],
  ["instance restart/redeploy", instanceState],
]) {
  assert.match(
    source,
    /hermes\.console\.creator=desktop-client/,
    `${name} 应给 Docker 容器补充 desktop-client 创建标记，方便后续识别和清理。`,
  );
}

console.log("console managed container marker assertions passed");
