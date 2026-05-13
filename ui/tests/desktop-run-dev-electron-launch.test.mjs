import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runDev = fs.readFileSync(path.join(root, "desktop/run-dev.mjs"), "utf8");

assert.match(
  runDev,
  /const appRoot = path\.resolve\(__dirname, "\.\."\)/,
  "Desktop dev runner should resolve the UI app root explicitly instead of relying on whatever cwd launched npm.",
);
assert.match(
  runDev,
  /function resolveElectronCli\(/,
  "Desktop dev runner should resolve the project-local Electron CLI instead of invoking npx.",
);
assert.doesNotMatch(
  runDev,
  /\["electron", "\."\]/,
  "Desktop dev runner must not invoke npx electron . because it can open Electron's default app without the Hermes window.",
);
assert.match(
  runDev,
  /spawn\(\s*process\.execPath,\s*\[resolveElectronCli\(\), "\."\]/,
  "Desktop dev runner should launch the local Electron CLI through the current Node executable.",
);
assert.match(
  runDev,
  /cwd:\s*appRoot/,
  "Vite and Electron child processes should run from the UI app root so the desktop window loads Hermes Console.",
);

console.log("desktop run-dev electron launch assertions passed");
