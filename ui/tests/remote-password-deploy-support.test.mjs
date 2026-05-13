import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteInstance = fs.readFileSync(path.join(root, "desktop/services/remote-instance.mjs"), "utf8");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");
const instanceState = fs.readFileSync(path.join(root, "desktop/services/instance-state.mjs"), "utf8");
const instanceRuntime = fs.readFileSync(path.join(root, "desktop/services/instance-runtime.mjs"), "utf8");
const dts = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");

assert.doesNotMatch(
  remoteInstance,
  /REMOTE_DEPLOY_REQUIRES_SSH_KEY/,
  "Remote Docker instance creation should no longer hard-block password auth mode.",
);

assert.match(
  remoteInstance,
  /authMode:\s*(authMode|connection\.authMode)\s*===\s*\"password\"\s*\?\s*\"password\"\s*:\s*\"ssh_key\"/,
  "Remote instance creation should preserve the requested authMode instead of forcing ssh_key.",
);

assert.match(
  remoteInstance,
  /password:\s*authMode === \"password\" \? String\(input(?:\?\\.)?\.password \|\| \"\"\)\.trim\(\) : \"\"/,
  "Remote connection builder should accept password input for deployment mode.",
);

assert.match(
  instanceState,
  /authMode:\s*remote\.authMode === \"password\" \? \"password\" : \"ssh_key\"/,
  "Remote instance state refresh should rebuild SSH connections using the stored auth mode.",
);

assert.match(
  instanceRuntime,
  /authMode:\s*instance\.remote\.authMode === \"password\" \? \"password\" : \"ssh_key\"/,
  "Runtime actions should rebuild remote connections using the stored auth mode.",
);

assert.match(
  dts,
  /authMode: \"ssh_key\" \| \"password\"/,
  "Registered remote instance metadata should allow password auth mode.",
);

assert.match(
  dts,
  /password\?: string;/,
  "Registered remote instance metadata should be able to carry a password for password-mode remote instances.",
);

assert.doesNotMatch(
  createInstance,
  /当前阶段远程部署只支持 SSH 私钥模式；密码模式保留给环境预检。/,
  "Create Instance should stop blocking the final deploy step when remote password auth has already passed environment checks.",
);

assert.match(
  remoteInstance,
  /await ensureUniqueInstanceId\(slugifyInstanceId\(name\), activeRegistryInstances, connection, baseWorkdir\)/,
  "Remote password deploy should avoid reusing stale remote workspace directories when the same slug already exists on disk.",
);

assert.match(
  sshRuntime,
  /Permission denied \\\(\.\*\\\)/,
  "SSH password auth classification should only treat authentication-style Permission denied output as credential rejection.",
);

console.log("remote password deploy support assertions passed");
