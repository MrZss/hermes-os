import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");

assert.match(
  sshRuntime,
  /function shellEscape\(value\)/,
  "SSH runtime should provide shell escaping for remote command payloads.",
);

assert.match(
  sshRuntime,
  /sh -lc \$\{shellEscape\(remoteCommand\)\}/,
  "SSH runtime should pass the remote command as one escaped shell string instead of splitting a multi-line probe into multiple argv segments.",
);

assert.doesNotMatch(
  sshRuntime,
  /args\.push\(`\\$\\{user\\}@\\$\\{host\\}`, "sh", "-lc", remoteCommand\);/,
  "SSH runtime should no longer hand ssh an unescaped multi-arg remote command sequence.",
);

console.log("ssh remote command escaping assertions passed");
