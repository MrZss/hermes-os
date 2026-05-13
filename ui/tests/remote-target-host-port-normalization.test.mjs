import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  createInstance,
  /function parseRemoteTargetInput\(rawValue: string, fallbackPort: string\)/,
  "Create Instance should normalize host input before remote inspection.",
);

assert.match(
  createInstance,
  /const normalizedTarget = parseRemoteTargetInput\(remoteHost, remotePort\.trim\(\) \|\| "22"\);/,
  "Remote environment loading should split host:port inputs so SSH does not receive an invalid hostname.",
);

assert.match(
  createInstance,
  /host: normalizedTarget\.host,\s*port: normalizedTarget\.port,/s,
  "Desktop remote inspection should use the normalized host and port values.",
);

assert.match(
  createInstance,
  /const next = parseRemoteTargetInput\(event\.target\.value, remotePort\);/,
  "Typing host:port into the host field should automatically separate the host and port in the UI.",
);

console.log("remote target host/port normalization assertions passed");
