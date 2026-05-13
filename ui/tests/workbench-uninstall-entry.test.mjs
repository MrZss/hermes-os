import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = fs.readFileSync(path.join(root, "src/app/pages/Dashboard.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "src/app/pages/instance/Overview.tsx"), "utf8");

assert.match(dashboard, /卸载与清理/, "Dashboard should expose uninstall entry");
assert.match(dashboard, /前往全局卸载/, "Dashboard should link to global uninstall settings");
assert.match(dashboard, /\/settings/, "Dashboard uninstall card should navigate to settings");
assert.doesNotMatch(dashboard, /\/instance\/\$\{recentInstance\.id\}\/backups|实例清理|备份页/, "Dashboard should hide instance cleanup shortcut while backups are temporarily hidden");

assert.match(overview, /清理与卸载/, "Instance overview should expose uninstall entry");
assert.match(overview, /\/settings/, "Instance overview should link global uninstall to settings");
assert.doesNotMatch(overview, /\/instance\/\$\{instance\.id\}\/backups|实例清理|备份页/, "Instance overview should hide cleanup shortcut while backups are temporarily hidden");

console.log("workbench uninstall entry assertions passed");
