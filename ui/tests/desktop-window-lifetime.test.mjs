import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "desktop/main.mjs"), "utf8");

assert.match(
  main,
  /let mainWindow\s*=\s*null/,
  "Electron main process should keep a module-level BrowserWindow reference so the desktop client window is not garbage-collected.",
);
assert.match(
  main,
  /mainWindow\s*=\s*new BrowserWindow/,
  "createWindow should assign the BrowserWindow to the retained mainWindow reference.",
);
assert.match(
  main,
  /mainWindow\.on\("closed", \(\) => \{\s*mainWindow = null;\s*\}\)/,
  "The retained BrowserWindow reference should be released only after the window closes.",
);
assert.match(
  main,
  /if \(!mainWindow\) \{\s*createWindow\(\);\s*\}/,
  "macOS activate should recreate the retained desktop window when none is alive.",
);

console.log("desktop window lifetime assertions passed");
