import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  sshRuntime,
  /runSshWithPassword\(\[runtime\.sshBinary, \.\.\.args\]/,
  "Password SSH flow must prepend the ssh binary before handing argv to expect, otherwise expect will try to execute '-p' and only report a timeout.",
);

assert.match(
  sshRuntime,
  /set auth_prompt_count 0/,
  "Password SSH flow should count repeated auth prompts so invalid credentials stop quickly instead of timing out.",
);

assert.match(
  sshRuntime,
  /Remote authentication was requested again after one credential attempt\./,
  "Password SSH flow should surface a concrete repeated-auth explanation for invalid password loops.",
);

assert.match(
  sshRuntime,
  /SSH_AUTH_FAILED/,
  "SSH runtime should emit a dedicated SSH_AUTH_FAILED marker for password authentication failures.",
);

assert.match(
  createInstance,
  /错误总览/,
  "Create Instance should render an error overview card for remote environment failures.",
);

assert.match(
  createInstance,
  /SSH 认证失败/,
  "The remote error overview should classify password failures as SSH authentication errors.",
);

console.log("password ssh auth diagnostics assertions passed");
