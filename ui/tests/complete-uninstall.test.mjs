import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const service = await import(path.join(root, "desktop/services/hermes-uninstall.mjs"));
assert.equal(service.FULL_UNINSTALL_CONFIRMATION_TEXT, "FULL UNINSTALL HERMES");

const fakeHome = path.join(os.tmpdir(), "hermes-console-test-home");
assert.equal(service.isSafeHermesRemovalPath(path.join(fakeHome, ".hermes"), fakeHome), true);
assert.equal(service.isSafeHermesRemovalPath(path.join(fakeHome, ".local", "bin", "hermes"), fakeHome), true);
assert.equal(service.isSafeHermesRemovalPath(path.join(fakeHome, ".ssh"), fakeHome), false);
assert.equal(service.isSafeHermesRemovalPath("/", fakeHome), false);

const plan = service.buildCompleteUninstallPlan({ homeDir: fakeHome, userDataPath: path.join(fakeHome, "Library", "App") });
assert.deepEqual(plan.removalPaths.sort(), [path.join(fakeHome, ".hermes"), path.join(fakeHome, ".local", "bin", "hermes")].sort());
assert.equal(plan.confirmationText, "FULL UNINSTALL HERMES");

const fakeUserDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), "hermes-console-uninstall-registry-"));
const fakeRegistryPath = path.join(fakeUserDataPath, "instances.json");
await fsp.writeFile(fakeRegistryPath, JSON.stringify({
  version: 1,
  instances: [
    {
      id: "local-native-a",
      name: "本地 Native A",
      type: "local",
      runtime: "native",
      hermesHome: path.join(fakeHome, "HermesOS", "instances", "a", "home"),
      workspaceDir: path.join(fakeHome, "HermesOS", "instances", "a"),
      endpoint: "http://127.0.0.1:8642",
      status: "running",
      native: { pid: 999999, command: ["gateway", "run", "--replace"] },
    },
    {
      id: "local-docker-b",
      name: "本地 Docker B",
      type: "local",
      runtime: "docker",
      hermesHome: path.join(fakeHome, "HermesOS", "instances", "b", "home"),
      workspaceDir: path.join(fakeHome, "HermesOS", "instances", "b"),
      endpoint: "http://127.0.0.1:8643",
      status: "running",
    },
  ],
}, null, 2), "utf8");

const cleanupResult = await service.clearLocalNativeRegistrations(fakeUserDataPath);
assert.deepEqual(cleanupResult.removedInstanceIds, ["local-native-a"], "Complete uninstall should unregister all local Native instances, not only ~/.hermes.");
assert.deepEqual(cleanupResult.stoppedPids, [999999], "Complete uninstall should attempt to stop managed Native gateway pids.");
const cleanedRegistry = JSON.parse(await fsp.readFile(fakeRegistryPath, "utf8"));
assert.deepEqual(cleanedRegistry.instances.map((instance) => instance.id), ["local-docker-b"], "Complete uninstall should leave non-Native instances registered.");

const main = read("desktop/main.mjs");
const preload = read("desktop/preload.mjs");
const dts = read("src/hermes-desktop.d.ts");
const system = read("src/app/services/system.ts");
const settings = read("src/app/pages/Settings.tsx");
const uninstallService = read("desktop/services/hermes-uninstall.mjs");

assert.match(main, /hermes:completeHermesUninstall/);
assert.match(preload, /completeHermesUninstall/);
assert.match(dts, /HermesCompleteUninstallPayload/);
assert.match(system, /completeUninstallHermesLocal/);
assert.match(settings, /FULL_UNINSTALL_HERMES/);
assert.match(settings, /完整卸载本机 Hermes/);
assert.match(settings, /completeUninstallHermesLocal/);

const environmentService = read("desktop/services/environment.mjs");
assert.match(environmentService, /hermesHomeExists:\s*fs\.existsSync\(hermesHome\)/, "Local environment inspection should expose whether ~/.hermes still exists so uninstall can become unavailable after cleanup.");
assert.match(dts, /hermesHome:\s*\{[\s\S]*path:\s*string;[\s\S]*exists:\s*boolean;[\s\S]*\}/, "Desktop bridge types should expose Hermes Home existence.");
assert.match(settings, /managedLocalNativeInstanceCount/, "Settings should distinguish local Native instances from unrelated Console instances when deciding uninstall availability.");
assert.match(settings, /hasHermesUninstallTarget/, "Settings should compute whether there is still anything to uninstall.");
assert.match(settings, /已卸载，无需重复操作/, "Danger zone should explain that uninstall is unavailable after Hermes has already been fully removed.");
assert.match(settings, /!hasHermesUninstallTarget/, "Uninstall action should be disabled once no CLI, Hermes Home, or local Native registration remains.");
assert.match(uninstallService, /removeRegisteredInstance/);
assert.match(uninstallService, /fs\.rm/);
assert.match(uninstallService, /process\.kill\(pid, "SIGTERM"\)/, "Complete uninstall should stop managed local Native gateway processes.");
assert.match(uninstallService, /removedInstanceIds: \[\.\.\.localNativeCleanup\.removedInstanceIds, \.\.\.registryCleanup\.removedInstanceIds\]/, "Complete uninstall payload should report all removed native registrations.");
assert.doesNotMatch(uninstallService, /rm -rf/);

console.log("complete uninstall assertions passed");
