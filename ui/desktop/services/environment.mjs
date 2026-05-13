import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { inspectDockerEnvironment } from "./docker-runtime.mjs";
import { inspectHermesEnvironment } from "./hermes-cli.mjs";

export function getDefaultInstancesRoot() {
  return path.join(os.homedir(), "HermesOS", "instances");
}

export function getDesktopPaths(userDataPath) {
  return {
    userDataPath,
    instancesRoot: getDefaultInstancesRoot(),
    homeDirectory: os.homedir(),
    hostname: os.hostname(),
    platform: process.platform,
    shell: "electron",
  };
}

export async function inspectLocalEnvironment({ userDataPath }) {
  const hermesHome = path.join(os.homedir(), ".hermes");
  const [hermes, docker] = await Promise.all([
    inspectHermesEnvironment(),
    inspectDockerEnvironment(),
  ]);

  return {
    ...getDesktopPaths(userDataPath),
    hermes,
    hermesHome: {
      path: hermesHome,
      exists: fs.existsSync(hermesHome),
    },
    hermesHomeExists: fs.existsSync(hermesHome),
    docker,
  };
}
