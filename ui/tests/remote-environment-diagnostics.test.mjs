import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteEnv = fs.readFileSync(path.join(root, "desktop/services/remote-environment.mjs"), "utf8");

assert.match(
  remoteEnv,
  /directory_exists=/,
  "Remote environment probe should expose whether the workdir exists so UI can distinguish a missing directory from a non-writable directory.",
);

assert.match(
  remoteEnv,
  /docker_permission_denied=/,
  "Remote environment probe should expose docker socket permission failures so UI can distinguish permission issues from a stopped daemon.",
);

assert.match(
  remoteEnv,
  /远程目录不存在/,
  "Remote environment diagnostics should explicitly say when the remote workdir does not exist.",
);

assert.match(
  remoteEnv,
  /当前用户无权访问/,
  "Remote environment diagnostics should explicitly say when the current user cannot access the runtime service.",
);

console.log("remote environment diagnostics assertions passed");
