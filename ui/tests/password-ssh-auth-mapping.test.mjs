import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");
const { mapSshFailure } = await import(path.join(root, "desktop/services/ssh-runtime.mjs"));

assert.match(
  sshRuntime,
  /function isSshAuthenticationFailureDetail/,
  "mapSshFailure should classify authentication failures through a dedicated helper before falling back to a generic SSH failure.",
);

assert.equal(
  mapSshFailure({ ok: false, timedOut: false, exitCode: 65, stdout: "", stderr: "SSH_PASSWORD_REJECTED" }, "password").error?.code,
  "SSH_PASSWORD_REJECTED",
  "mapSshFailure should recognize dedicated password auth markers.",
);

assert.equal(
  mapSshFailure({ ok: false, timedOut: false, exitCode: 1, stdout: "", stderr: "rm: Permission denied" }, "password").error?.code,
  "SSH_COMMAND_FAILED",
  "mapSshFailure should not classify generic remote command Permission denied as SSH credential rejection.",
);

console.log("password ssh auth mapping assertions passed");
