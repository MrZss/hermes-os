import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteEnvironment = fs.readFileSync(path.join(root, "desktop/services/remote-environment.mjs"), "utf8");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");
const dts = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");

assert.match(
  remoteEnvironment,
  /const DEFAULT_REMOTE_SSH_PROBE_TIMEOUT_MS = 10_000;/,
  "Remote environment inspection should probe raw SSH reachability before running the heavier environment script.",
);

assert.match(
  remoteEnvironment,
  /const sshProbeResult = await runSshCommand\(input, buildSshProbeScript\(\), \{ timeoutMs: DEFAULT_REMOTE_SSH_PROBE_TIMEOUT_MS \}\);/,
  "Remote environment inspection should separate SSH connectivity from post-login environment detection.",
);

assert.match(
  remoteEnvironment,
  /return buildPartialInspection\(input, runtime, result\.error\?\.detail \?\? result\.error\?\.message \?\? "远程环境探测命令执行失败。"\);/,
  "If the post-login inspection script fails, the desktop service should preserve a successful SSH status instead of collapsing everything into SSH timeout.",
);

assert.match(
  remoteEnvironment,
  /run_with_timeout 6 sh -lc "docker info >\/dev\/null 2>&1"/,
  "Remote Docker probing should have its own short timeout so a hung docker info call does not masquerade as SSH failure.",
);

assert.match(
  createInstance,
  /inspection\.warning\?\.trim\(\)\s*\?\s*inspection\.warning\s*:\s*`已读取 \$\{inspection\.user\}@\$\{inspection\.host\}:\$\{inspection\.port\} 的真实远程环境。`/,
  "Create Instance should surface the more specific remote inspection warning when SSH succeeded but a later probe stalled.",
);

assert.match(
  dts,
  /warning\?: string;/,
  "Desktop bridge typings should expose the optional remote environment warning channel.",
);

console.log("remote ssh diagnostic splitting assertions passed");
