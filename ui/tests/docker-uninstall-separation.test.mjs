import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const settings = read("src/app/pages/Settings.tsx");
const dashboard = read("src/app/pages/Dashboard.tsx");
const overview = read("src/app/pages/instance/Overview.tsx");
const runtime = read("src/app/services/runtime.ts");
const instanceRuntime = read("desktop/services/instance-runtime.mjs");
const uninstallService = read("desktop/services/hermes-uninstall.mjs");

assert.match(
  settings,
  /历史受管实例不会被这里卸载|历史受管实例不受影响/,
  "Settings danger zone should explicitly say Hermes CLI uninstall does not uninstall legacy managed instances.",
);
assert.match(
  settings,
  /Console 本机实例/,
  "Settings uninstall scope should count local Hermes instances instead of all Console instances.",
);
assert.doesNotMatch(
  settings,
  /Console 管理实例：\{managedInstanceCount === null \? "待读取" : `\$\{managedInstanceCount\} 个`\}/,
  "Settings uninstall dialog should not present all Console instances as Hermes CLI uninstall targets.",
);

assert.match(
  dashboard,
  /历史受管实例：在实例主页清理资源。/,
  "Dashboard should distinguish legacy managed instance cleanup from Hermes CLI uninstall.",
);
assert.match(
  overview,
  /destroyConsoleRuntimeInstance/,
  "Instance overview should expose a direct instance cleanup action while backups remain hidden.",
);
assert.match(
  overview,
  /清除当前实例/,
  "Managed runtime instances should show simplified cleanup wording.",
);
assert.match(
  overview,
  /不会执行 hermes uninstall/,
  "Legacy container cleanup copy should explain that it does not run CLI uninstall.",
);
assert.doesNotMatch(
  overview,
  /\/backups|备份页/,
  "Overview cleanup entry should not route through the hidden Backups page.",
);
assert.match(
  runtime,
  /export async function destroyConsoleRuntimeInstance/,
  "Runtime service should expose a direct destroy wrapper for the overview cleanup entry.",
);

assert.match(
  instanceRuntime,
  /runDockerCommand\(\["rm", "-f", "-v", containerName\]/,
  "Docker cleanup should remove the container and anonymous volumes via Docker, not Hermes CLI.",
);
assert.match(
  instanceRuntime,
  /不影响 Hermes CLI 或 Docker Desktop/,
  "Local Docker destroy result should state it does not uninstall Hermes CLI or Docker Desktop.",
);
assert.doesNotMatch(
  instanceRuntime,
  /instance\.runtime === "docker"[\s\S]{0,500}runHermesCommand\(\["uninstall"/,
  "Docker instance cleanup must not call hermes uninstall.",
);
assert.doesNotMatch(
  uninstallService,
  /runtime === "docker"[\s\S]{0,800}runHermesCommand/,
  "Global Hermes CLI uninstall service must not operate on Docker runtime instances.",
);

console.log("docker uninstall separation assertions passed");
