import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");
const sshRuntime = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");
const desktopTypes = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");

assert.match(
  sshRuntime,
  /export function suggestLocalSshKeyPath\(/,
  "Desktop SSH runtime should expose a local private-key suggestion helper instead of hardcoding a nonexistent default path.",
);

assert.match(
  sshRuntime,
  /id_ed25519[\s\S]*id_rsa[\s\S]*ai\.pem/,
  "SSH key suggestion should check common private-key paths and fall back through the list.",
);

assert.match(
  desktopTypes,
  /suggestLocalSshKeyPath:\s*\(\)\s*=>\s*Promise<string>;/,
  "Desktop bridge typings should expose the SSH key suggestion helper.",
);

assert.match(
  createInstance,
  /const \[remoteKeyPath, setRemoteKeyPath\] = useState\(""\);/,
  "Create Instance should not boot with a hardcoded SSH key path that may not exist on the current machine.",
);

assert.match(
  createInstance,
  /await window\.hermesDesktop\?\.suggestLocalSshKeyPath\?\.\(\)/,
  "Create Instance should hydrate the remote key path from the desktop runtime suggestion when available.",
);

assert.match(
  createInstance,
  /先补全主机、用户和认证信息/,
  "Remote auth gating should still explain which connection fields are required after key-path auto-suggestion.",
);

assert.match(
  createInstance,
  /remoteErrorOverview[\s\S]*visibleChecks/s,
  "Remote error overview should render before the issue list so the decisive failure is visible without scrolling.",
);

console.log("remote key-path suggestion and error priority assertions passed");
