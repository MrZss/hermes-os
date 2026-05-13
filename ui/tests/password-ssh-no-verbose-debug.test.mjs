import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");

assert.doesNotMatch(
  sshRuntime,
  /args\.push\(\s*"-v"/,
  "Password SSH runtime should not enable verbose ssh logging in production flow, because debug output containing the word 'password' can confuse expect and create false auth failures.",
);

console.log("password ssh no verbose debug assertions passed");
