import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localInstance = fs.readFileSync(path.join(root, "desktop/services/local-instance.mjs"), "utf8");

assert.match(
  localInstance,
  /async function ensureUniqueInstanceId\(baseId, instances, instancesRoot\)/,
  "Local instance creation should allocate IDs asynchronously so it can inspect existing workspace directories.",
);

assert.match(
  localInstance,
  /await fileExists\(path\.join\(instancesRoot, nextId\)\)/,
  "Local instance ID allocation should treat an existing orphan workspace directory as occupied even when the registry was cleared.",
);

assert.match(
  localInstance,
  /ensureUniqueInstanceId\(slugifyInstanceId\(name\), registryResult\.data\.instances, instancesRoot\)/,
  "Both local Docker and Native creation should pass the resolved instances root into ID allocation.",
);

assert.match(
  localInstance,
  /const workspaceDir = path\.join\(instancesRoot, instanceId\);[\s\S]*await ensureDirectory\(workspaceDir\);/,
  "Workspace directory should only be created after the final non-orphan instance id is chosen.",
);

console.log("orphan workspace reuse assertions passed");
