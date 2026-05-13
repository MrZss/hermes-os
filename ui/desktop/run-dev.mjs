import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

const port = process.env.HERMES_DESKTOP_PORT || "4174";
const devUrl = `http://127.0.0.1:${port}/`;
const desktopFiles = new Set(["main.mjs", "preload.mjs"]);
const inheritedNoProxy = [process.env.NO_PROXY, process.env.no_proxy].filter(Boolean).join(",");
const noProxy = inheritedNoProxy ? `${inheritedNoProxy},127.0.0.1,localhost` : "127.0.0.1,localhost";

let viteProcess;
let electronProcess;
let watcher;
let restartTimer;
let shuttingDown = false;
let restartingElectron = false;

function createEnv(extra = {}) {
  return {
    ...process.env,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    ...extra,
  };
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (watcher) {
    watcher.close();
    watcher = undefined;
  }

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill("SIGTERM");
  }

  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 150);
}

async function waitForServer(retries = 120) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await fetch(devUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Vite dev server did not become ready at ${devUrl}`);
}

function resolveElectronCli() {
  return path.join(appRoot, "node_modules", "electron", "cli.js");
}

function startElectron() {
  console.log(`[desktop:dev] Launching Electron on ${devUrl}`);

  electronProcess = spawn(
    process.execPath,
    [resolveElectronCli(), "."],
    {
      cwd: appRoot,
      stdio: "inherit",
      env: createEnv({
        VITE_DEV_SERVER_URL: devUrl,
      }),
    }
  );

  electronProcess.on("exit", (code) => {
    const shouldRestart = restartingElectron && !shuttingDown;
    electronProcess = undefined;

    if (shouldRestart) {
      restartingElectron = false;
      startElectron();
      return;
    }

    if (!shuttingDown) {
      stopAll(code ?? 0);
    }
  });
}

function scheduleElectronRestart(reason) {
  if (shuttingDown || restartingElectron || !electronProcess) return;

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartingElectron = true;
    console.log(`[desktop:dev] ${reason}，正在重启 Electron...`);
    electronProcess.kill("SIGTERM");
  }, 180);
}

function startDesktopWatcher() {
  watcher = watch(__dirname, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;

    const normalized = path.basename(String(filename));
    if (!desktopFiles.has(normalized)) return;

    scheduleElectronRestart(`${normalized} 已变更`);
  });

  watcher.on("error", (error) => {
    console.error(`[desktop:dev] 桌面壳监听失败: ${error.message}`);
  });
}

function run() {
  viteProcess = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", port],
    {
      cwd: appRoot,
      stdio: "inherit",
      env: createEnv(),
    }
  );

  viteProcess.on("exit", (code) => {
    if (!shuttingDown) {
      stopAll(code ?? 1);
    }
  });

  waitForServer()
    .then(() => {
      console.log(`[desktop:dev] Vite dev server is ready at ${devUrl}`);
      startDesktopWatcher();
      startElectron();
    })
    .catch((error) => {
      console.error(error.message);
      stopAll(1);
    });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

run();
