import fs from "node:fs/promises";
import fsSync from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { inspectHermesEnvironment, runHermesCommand } from "./hermes-cli.mjs";
import { listRegisteredInstances, removeRegisteredInstance } from "./instance-registry.mjs";

export const FULL_UNINSTALL_CONFIRMATION_TEXT = "FULL UNINSTALL HERMES";

function defaultHermesHome(homeDir = os.homedir()) {
  return path.join(homeDir, ".hermes");
}

function defaultHermesBinary(homeDir = os.homedir()) {
  return path.join(homeDir, ".local", "bin", "hermes");
}

function normalizePath(targetPath) {
  return path.resolve(String(targetPath || ""));
}

export function isSafeHermesRemovalPath(targetPath, homeDir = os.homedir()) {
  const resolved = normalizePath(targetPath);
  const allowed = [defaultHermesHome(homeDir), defaultHermesBinary(homeDir)].map(normalizePath);
  return allowed.includes(resolved);
}

export function buildCompleteUninstallPlan({ homeDir = os.homedir(), userDataPath } = {}) {
  const hermesHome = defaultHermesHome(homeDir);
  const hermesBinaryPath = defaultHermesBinary(homeDir);

  return {
    confirmationText: FULL_UNINSTALL_CONFIRMATION_TEXT,
    hermesHome,
    hermesBinaryPath,
    userDataPath,
    removalPaths: [hermesBinaryPath, hermesHome],
    commands: [
      ["gateway", "stop"],
      ["gateway", "uninstall"],
      ["uninstall", "--full", "--yes"],
    ],
  };
}

function toDesktopError(code, message, detail, recoverable = true) {
  return {
    ok: false,
    error: {
      code,
      message,
      detail,
      recoverable,
    },
  };
}

function commandDetail(result) {
  return result?.data?.stdout || result?.data?.stderr || result?.error?.detail || result?.error?.message || "命令未返回输出。";
}

async function runBestEffortCommand(id, label, args, timeoutMs) {
  const result = await runHermesCommand(args, { timeoutMs });

  return {
    id,
    label,
    status: result.ok ? "success" : "warning",
    args,
    detail: commandDetail(result),
  };
}

async function removeSafePath(targetPath, homeDir) {
  if (!isSafeHermesRemovalPath(targetPath, homeDir)) {
    return {
      id: `remove:${targetPath}`,
      label: `跳过非白名单路径 ${targetPath}`,
      status: "warning",
      path: targetPath,
      detail: "路径不在完整卸载白名单中，已跳过。",
    };
  }

  const existedBefore = fsSync.existsSync(targetPath);
  await fs.rm(targetPath, { recursive: true, force: true });

  return {
    id: `remove:${targetPath}`,
    label: `清理 ${targetPath}`,
    status: "success",
    path: targetPath,
    detail: existedBefore ? "已删除。" : "路径原本不存在。",
  };
}

async function clearDefaultNativeRegistrations(userDataPath, hermesHome) {
  const listResult = await listRegisteredInstances(userDataPath);
  if (!listResult.ok) return { removedInstanceIds: [], detail: listResult.error?.detail ?? "读取 Console 注册表失败。" };

  const normalizedHermesHome = normalizePath(hermesHome);
  const candidates = listResult.data.instances.filter((instance) => {
    if (instance.runtime !== "native") return false;
    return [instance.hermesHome, instance.workspaceDir].some((item) => item && normalizePath(item) === normalizedHermesHome);
  });

  const removedInstanceIds = [];
  for (const instance of candidates) {
    const removeResult = await removeRegisteredInstance(userDataPath, instance.id);
    if (removeResult.ok) {
      removedInstanceIds.push(instance.id);
    }
  }

  return {
    removedInstanceIds,
    detail: removedInstanceIds.length > 0 ? `已移除 ${removedInstanceIds.length} 个本地 Native 注册实例。` : "没有需要移除的本地 Native 注册实例。",
  };
}

function stopNativeProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
  } catch (error) {
    return error?.code === "ESRCH";
  }

  const inspection = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  const command = inspection.status === 0 ? inspection.stdout.trim() : "";
  const looksLikeHermesGateway = /(^|\s|\/)hermes(\s|$)/i.test(command) && /gateway/i.test(command);

  if (!looksLikeHermesGateway) {
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

export async function clearLocalNativeRegistrations(userDataPath) {
  const listResult = await listRegisteredInstances(userDataPath);
  if (!listResult.ok) {
    return {
      removedInstanceIds: [],
      stoppedPids: [],
      detail: listResult.error?.detail ?? "读取 Console 注册表失败。",
    };
  }

  const candidates = listResult.data.instances.filter((instance) => {
    return instance.type === "local" && instance.runtime === "native";
  });

  const removedInstanceIds = [];
  const stoppedPids = [];

  for (const instance of candidates) {
    const pid = instance.native?.pid;
    if (Number.isInteger(pid) && pid > 0) {
      const stopped = stopNativeProcess(pid);
      if (stopped) {
        stoppedPids.push(pid);
      }
    }

    const removeResult = await removeRegisteredInstance(userDataPath, instance.id);
    if (removeResult.ok) {
      removedInstanceIds.push(instance.id);
    }
  }

  return {
    removedInstanceIds,
    stoppedPids,
    detail: removedInstanceIds.length > 0
      ? `已移除 ${removedInstanceIds.length} 个本地 Native 注册实例。`
      : "没有需要移除的本地 Native 注册实例。",
  };
}

async function inspectRemaining({ userDataPath, hermesHome, hermesBinaryPath }) {
  const registryResult = await listRegisteredInstances(userDataPath);
  const registeredNativeInstanceIds = registryResult.ok
    ? registryResult.data.instances
        .filter((instance) => instance.type === "local" && instance.runtime === "native")
        .map((instance) => instance.id)
    : [];
  const hermesInspection = await inspectHermesEnvironment();

  return {
    hermesBinaryPath,
    hermesBinaryExists: fsSync.existsSync(hermesBinaryPath),
    hermesHome,
    hermesHomeExists: fsSync.existsSync(hermesHome),
    registeredNativeInstanceIds,
    hermesAvailable: hermesInspection.available,
    hermesDetail: hermesInspection.detail,
  };
}

export async function completeHermesUninstall({ userDataPath, input = {} } = {}) {
  if (input.confirmText !== FULL_UNINSTALL_CONFIRMATION_TEXT) {
    return toDesktopError(
      "FULL_UNINSTALL_CONFIRMATION_REQUIRED",
      "完整卸载确认短语不正确。",
      `请输入 ${FULL_UNINSTALL_CONFIRMATION_TEXT} 后再执行完整卸载。`,
      true
    );
  }

  const homeDir = os.homedir();
  const plan = buildCompleteUninstallPlan({ homeDir, userDataPath });
  const steps = [];

  const localNativeCleanup = await clearLocalNativeRegistrations(userDataPath);
  steps.push({
    id: "console-native-stop-cleanup",
    label: "停止并移除 Console 本地 Native 实例",
    status: localNativeCleanup.removedInstanceIds.length > 0 ? "success" : "skipped",
    detail: `${localNativeCleanup.detail}${localNativeCleanup.stoppedPids.length > 0 ? ` 已处理 PID：${localNativeCleanup.stoppedPids.join(", ")}。` : ""}`,
  });

  steps.push(await runBestEffortCommand("gateway-stop", "停止 gateway", ["gateway", "stop"], 30_000));
  steps.push(await runBestEffortCommand("gateway-uninstall", "卸载 gateway 服务", ["gateway", "uninstall"], 90_000));
  steps.push(await runBestEffortCommand("hermes-full-uninstall", "执行官方完整卸载", ["uninstall", "--full", "--yes"], 120_000));

  const removedPaths = [];
  for (const targetPath of plan.removalPaths) {
    const step = await removeSafePath(targetPath, homeDir);
    steps.push(step);
    if (step.status === "success") removedPaths.push(targetPath);
  }

  const registryCleanup = await clearDefaultNativeRegistrations(userDataPath, plan.hermesHome);
  steps.push({
    id: "console-registry-cleanup",
    label: "清理 Console 本地注册",
    status: registryCleanup.removedInstanceIds.length > 0 ? "success" : "skipped",
    detail: registryCleanup.detail,
  });

  const remaining = await inspectRemaining({
    userDataPath,
    hermesHome: plan.hermesHome,
    hermesBinaryPath: plan.hermesBinaryPath,
  });

  return {
    ok: true,
    data: {
      mode: "complete",
      confirmationText: FULL_UNINSTALL_CONFIRMATION_TEXT,
      steps,
      removedPaths,
      removedInstanceIds: [...localNativeCleanup.removedInstanceIds, ...registryCleanup.removedInstanceIds],
      remaining,
      summary: remaining.hermesBinaryExists || remaining.hermesHomeExists || remaining.registeredNativeInstanceIds.length > 0 || remaining.hermesAvailable
        ? "完整卸载流程已执行，但仍检测到残留。"
        : "本机 Hermes 已完整卸载。",
    },
  };
}
