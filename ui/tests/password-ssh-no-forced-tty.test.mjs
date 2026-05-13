import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");

assert.match(
  sshRuntime,
  /forceTty: options\.forceTty === true,/,
  "Password-mode SSH should not always force a remote TTY, otherwise post-login shell init can hang and look like SSH timeout.",
);

assert.doesNotMatch(
  sshRuntime,
  /forceTty: validation\.data\.authMode === "password"/,
  "SSH runtime should no longer hard-force TTY for every password-auth command.",
);

console.log("password ssh no forced tty assertions passed");
