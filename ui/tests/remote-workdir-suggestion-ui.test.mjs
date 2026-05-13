import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteEnv = fs.readFileSync(path.join(root, "desktop/services/remote-environment.mjs"), "utf8");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  remoteEnv,
  /system_home=/,
  "Remote environment probe should capture the remote user's home directory so the UI can suggest a safer workdir than /opt/hermes.",
);

assert.match(
  createInstance,
  /建议目录/,
  "Create Instance should surface a recommended remote workdir when the current workdir is missing or unwritable.",
);

assert.match(
  createInstance,
  /改为建议目录/,
  "Create Instance should let the user apply the recommended remote workdir in one click.",
);

console.log("remote workdir suggestion ui assertions passed");
