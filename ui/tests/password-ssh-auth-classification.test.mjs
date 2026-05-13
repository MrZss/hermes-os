import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  sshRuntime,
  /PreferredAuthentications=password,keyboard-interactive/,
  "Password SSH flow should force password\/keyboard-interactive authentication so diagnostics reflect the real password path.",
);

assert.match(
  sshRuntime,
  /PubkeyAuthentication=no/,
  "Password SSH flow should disable pubkey auth during password diagnostics so stale keys do not blur the failure reason.",
);

assert.match(
  sshRuntime,
  /SSH_PASSWORD_REJECTED/,
  "SSH runtime should emit a dedicated SSH_PASSWORD_REJECTED marker when the server accepts password auth but rejects the supplied credential.",
);

assert.match(
  sshRuntime,
  /SSH_PASSWORD_DISABLED/,
  "SSH runtime should emit a dedicated SSH_PASSWORD_DISABLED marker when the server does not offer password login for this target.",
);

assert.match(
  createInstance,
  /密码已提交但被服务器拒绝/,
  "Remote error overview should tell the user when the supplied password was actually tried and rejected by the server.",
);

assert.match(
  createInstance,
  /服务器未开放密码登录/,
  "Remote error overview should tell the user when the target only accepts SSH keys instead of password login.",
);

console.log("password ssh auth classification assertions passed");
