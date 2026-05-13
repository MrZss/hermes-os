export async function getDesktopPaths() {
  if (!window.hermesDesktop?.getDesktopPaths) {
    throw new Error("Hermes desktop bridge is unavailable.");
  }

  return window.hermesDesktop.getDesktopPaths();
}

export async function inspectLocalEnvironment() {
  if (!window.hermesDesktop?.inspectLocalEnvironment) {
    throw new Error("Hermes desktop bridge is unavailable.");
  }

  return window.hermesDesktop.inspectLocalEnvironment();
}

export async function openDesktopPath(targetPath: string) {
  if (!window.hermesDesktop?.openPath) {
    throw new Error("Hermes desktop bridge is unavailable.");
  }

  const result = await window.hermesDesktop.openPath(targetPath);
  if (!result.ok) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "打开路径失败。");
  }

  return result.data;
}

async function runDesktopHermesCommand(args: string[], fallbackMessage: string, timeoutMs = 30_000) {
  if (!window.hermesDesktop?.runHermesCommand) {
    throw new Error("Hermes desktop bridge is unavailable.");
  }

  const result = await window.hermesDesktop.runHermesCommand(args, { timeoutMs });
  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? fallbackMessage);
  }

  return result.data;
}

export async function runHermesGatewayStatus() {
  return runDesktopHermesCommand(["gateway", "status"], "读取 gateway 状态失败。");
}

export async function runHermesGatewayAction(action: "start" | "stop" | "restart") {
  return runDesktopHermesCommand(["gateway", action], `执行 gateway ${action} 失败。`, 60_000);
}

export async function reinstallHermesGatewayService() {
  return runDesktopHermesCommand(["gateway", "install", "--force"], "重装 gateway 服务失败。", 90_000);
}

export async function uninstallHermesGatewayService() {
  return runDesktopHermesCommand(["gateway", "uninstall"], "卸载 gateway 服务失败。", 90_000);
}

export async function uninstallHermesAgent(mode: "keep-data" | "full") {
  const args = mode === "full" ? ["uninstall", "--full", "--yes"] : ["uninstall", "--yes"];
  return runDesktopHermesCommand(args, "卸载 Hermes Agent 失败。", 120_000);
}

export async function completeUninstallHermesLocal(confirmText: string) {
  if (!window.hermesDesktop?.completeHermesUninstall) {
    throw new Error("Hermes desktop bridge is unavailable.");
  }

  const result = await window.hermesDesktop.completeHermesUninstall({ confirmText });
  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "完整卸载 Hermes 失败。");
  }

  return result.data;
}

export async function runHermesDeepStatus() {
  return runDesktopHermesCommand(["status", "--deep"], "读取 Hermes 深度状态失败。", 60_000);
}

export async function runHermesDoctor() {
  return runDesktopHermesCommand(["doctor"], "运行 doctor 失败。", 60_000);
}

export async function inspectRemoteEnvironment(input: HermesRemoteEnvironmentInput) {
  if (!window.hermesDesktop?.inspectRemoteEnvironment) {
    throw new Error("Hermes desktop bridge is unavailable.");
  }

  const result = await window.hermesDesktop.inspectRemoteEnvironment(input);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "读取远程环境失败。");
  }

  return result.data;
}
