import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_DAEMON_WAIT_TIMEOUT_MS = 90_000;
const DEFAULT_DOCKER_INSTALL_TIMEOUT_MS = 900_000;
const DEFAULT_DOCKER_PULL_TIMEOUT_MS = 600_000;
const DEFAULT_DOCKER_PULL_ATTEMPTS = 3;
const DAEMON_POLL_INTERVAL_MS = 2_000;
const DOCKER_DESKTOP_DOWNLOAD_URL = "https://www.docker.com/products/docker-desktop/";
const DOCKER_DESKTOP_WINDOWS_INSTALL_URL = "https://docs.docker.com/desktop/setup/install/windows-install/";
const DOCKER_ENGINE_LINUX_INSTALL_URL = "https://docs.docker.com/engine/install/";
const DOCKER_OFFICIAL_INSTALL_SCRIPT_URL = "https://get.docker.com";
const COMMON_BREW_PATHS = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
const COMMON_SYSTEMCTL_PATHS = ["/bin/systemctl", "/usr/bin/systemctl"];
const COMMON_SERVICE_PATHS = ["/sbin/service", "/usr/sbin/service"];

function nowIso() {
  return new Date().toISOString();
}

function runProcess(command, args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, env, onOutput } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}Command timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onOutput?.("stdout", text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onOutput?.("stderr", text);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error.message}`,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: exitCode === 0,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function compactPaths(paths) {
  return paths.filter((candidate) => typeof candidate === "string" && candidate.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitProgressSegments(text) {
  return text
    .toString()
    .split(/\r?\n|\r/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 320));
}

function createDockerPullProgressTracker({ image, emitProgress, operationId, scope }) {
  const layerStates = new Map();
  let lastSummary = "";
  let lastEmitAt = 0;

  const emitSummary = (message, detail) => {
    if (!message) return;
    const now = Date.now();
    const signature = `${message}\n${detail ?? ""}`;

    if (signature === lastSummary && now - lastEmitAt < 1_500) {
      return;
    }

    lastSummary = signature;
    lastEmitAt = now;
    emitProgress({
      operationId,
      scope,
      stage: "docker-image-pull",
      message,
      detail,
    });
  };

  const summarize = () => {
    const entries = [...layerStates.values()];
    const total = entries.length;
    const complete = entries.filter((status) => status === "complete").length;
    const extracting = entries.filter((status) => status === "extracting").length;
    const downloading = entries.filter((status) => status === "downloading" || status === "verifying").length;
    const waiting = entries.filter((status) => status === "waiting" || status === "pulling").length;

    if (extracting > 0) {
      return {
        message: `正在解压镜像层（${complete}/${total || complete} 已完成）`,
        detail: image,
      };
    }

    if (downloading > 0) {
      return {
        message: `正在下载镜像层（${complete}/${total || complete} 已完成）`,
        detail: image,
      };
    }

    if (complete > 0 && complete < total) {
      return {
        message: `镜像层已写入本地（${complete}/${total}）`,
        detail: image,
      };
    }

    if (waiting > 0 || total > 0) {
      return {
        message: "正在准备镜像层",
        detail: image,
      };
    }

    return null;
  };

  return {
    push(stream, text) {
      for (const line of splitProgressSegments(text)) {
        emitProgress({
          operationId,
          scope,
          stage: "docker-image-pull",
          stream,
          message: line,
        });

        const match = line.match(/^([A-Za-z0-9]+):\s+(.*)$/);
        if (!match) {
          if (/Status:\s+/i.test(line)) {
            emitSummary("镜像拉取完成，正在整理本地镜像", image);
          }
          continue;
        }

        const [, layerId, stateText] = match;
        const state = stateText.toLowerCase();

        if (state.includes("pull complete") || state.includes("already exists")) {
          layerStates.set(layerId, "complete");
        } else if (state.includes("extracting")) {
          layerStates.set(layerId, "extracting");
        } else if (state.includes("download complete")) {
          layerStates.set(layerId, "downloaded");
        } else if (state.includes("downloading")) {
          layerStates.set(layerId, "downloading");
        } else if (state.includes("verifying checksum")) {
          layerStates.set(layerId, "verifying");
        } else if (state.includes("waiting")) {
          layerStates.set(layerId, "waiting");
        } else if (state.includes("pulling fs layer")) {
          layerStates.set(layerId, "pulling");
        }

        const summary = summarize();
        if (summary) {
          emitSummary(summary.message, summary.detail);
        }
      }
    },
  };
}

function getPlatformLabel() {
  if (process.platform === "darwin") return "macOS";
  if (process.platform === "win32") return "Windows";
  if (process.platform === "linux") return "Linux";
  return process.platform;
}

function getCommonDockerCliPaths() {
  if (process.platform === "win32") {
    return compactPaths([
      process.env.ProgramFiles ? `${process.env.ProgramFiles}\\Docker\\Docker\\resources\\bin\\docker.exe` : "",
      process.env["ProgramFiles(x86)"] ? `${process.env["ProgramFiles(x86)"]}\\Docker\\Docker\\resources\\bin\\docker.exe` : "",
    ]);
  }

  if (process.platform === "linux") {
    return ["/usr/bin/docker", "/usr/local/bin/docker", "/snap/bin/docker"];
  }

  return [
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
  ];
}

function getWindowsDockerDesktopExecutable() {
  return compactPaths([
    process.env.ProgramFiles ? `${process.env.ProgramFiles}\\Docker\\Docker\\Docker Desktop.exe` : "",
    process.env["ProgramFiles(x86)"] ? `${process.env["ProgramFiles(x86)"]}\\Docker\\Docker\\Docker Desktop.exe` : "",
  ]).find((candidate) => existsSync(candidate));
}

async function resolveCommand(command, fallbackPaths = []) {
  const lookupResult = process.platform === "win32"
    ? await runProcess("where.exe", [command], { timeoutMs: 5_000 })
    : await runProcess("which", [command], { timeoutMs: 5_000 });
  const lookupPath = lookupResult.ok ? lookupResult.stdout.trim().split(/\r?\n/).find(Boolean) : "";

  if (lookupPath) {
    return lookupPath;
  }

  return fallbackPaths.find((candidate) => existsSync(candidate)) || null;
}

async function resolveDockerCommand() {
  return resolveCommand("docker", getCommonDockerCliPaths());
}

async function resolveBrewCommand() {
  return resolveCommand("brew", COMMON_BREW_PATHS);
}

export async function inspectDockerEnvironment() {
  const dockerCommand = await resolveDockerCommand();
  const platformLabel = getPlatformLabel();

  if (!dockerCommand) {
    return {
      available: false,
      daemonRunning: false,
      platformLabel,
      detail: `${platformLabel} 环境未找到 Docker 命令，也未检测到可用的 Docker CLI。`,
    };
  }

  const versionResult = await runProcess(dockerCommand, ["version"], { timeoutMs: 20_000 });

  if (!versionResult.ok) {
    const detail = versionResult.stderr.trim() || versionResult.stdout.trim();
    const missing = /enoent|not found/i.test(detail);

    return {
      available: !missing,
      daemonRunning: false,
      dockerCommand,
      platformLabel,
      detail: missing ? "未找到 Docker 命令。" : detail || "Docker 不可用。",
    };
  }

  const psResult = await runProcess(dockerCommand, ["ps"], { timeoutMs: 20_000 });

  return {
    available: true,
    daemonRunning: psResult.ok,
    dockerCommand,
    platformLabel,
    detail: psResult.ok
      ? "Docker daemon 正常运行。"
      : psResult.stderr.trim() || "Docker daemon 未启动。",
  };
}

async function openUrl(url) {
  if (process.platform === "darwin") {
    return runProcess("open", [url], { timeoutMs: 10_000 });
  }

  if (process.platform === "win32") {
    return runProcess("cmd.exe", ["/c", "start", "", url], { timeoutMs: 10_000 });
  }

  return runProcess("xdg-open", [url], { timeoutMs: 10_000 });
}

async function installDockerOnMac({ timeoutMs }) {
  if (existsSync("/Applications/Docker.app")) {
    return {
      ok: true,
      detail: "已检测到 Docker Desktop 应用，将尝试自动启动并补齐运行状态。",
      installed: false,
    };
  }

  const brewCheck = await runProcess("brew", ["--version"], { timeoutMs: 10_000 });
  const brewCommand = brewCheck.ok ? "brew" : await resolveBrewCommand();

  if (brewCommand) {
    const installResult = brewCommand === "brew"
      ? await runProcess("brew", ["install", "--cask", "docker"], { timeoutMs })
      : await runProcess(brewCommand, ["install", "--cask", "docker"], { timeoutMs });
    const installDetail = [installResult.stdout.trim(), installResult.stderr.trim()].filter(Boolean).join("\n");
    const alreadyInstalled = /already installed|already exists|It seems there is already an App/i.test(installDetail);

    if (installResult.ok || alreadyInstalled || existsSync("/Applications/Docker.app")) {
      return {
        ok: true,
        detail: [
          installResult.ok ? "已通过 Homebrew 安装 Docker Desktop。" : "检测到 Docker Desktop 已安装。",
          installDetail,
        ].filter(Boolean).join("\n"),
        installed: installResult.ok,
      };
    }

    const openResult = await openUrl(DOCKER_DESKTOP_DOWNLOAD_URL);
    return {
      ok: false,
      detail: [
        "Homebrew 自动安装 Docker Desktop 失败。",
        installDetail,
        openResult.ok ? "已打开 Docker 官方下载页，请完成安装后重试。" : "打开 Docker 官方下载页失败，请手动访问 Docker 官网安装。",
      ].filter(Boolean).join("\n"),
    };
  }

  const openResult = await openUrl(DOCKER_DESKTOP_DOWNLOAD_URL);
  return {
    ok: false,
    detail: openResult.ok
      ? "未检测到 Homebrew，无法静默安装 Docker Desktop；已打开 Docker 官方下载页，请完成安装后重试。"
      : "未检测到 Homebrew，且打开 Docker 官方下载页失败，请手动安装 Docker Desktop 后重试。",
  };
}

async function installDockerOnWindows({ timeoutMs }) {
  if (getWindowsDockerDesktopExecutable()) {
    return {
      ok: true,
      detail: "已检测到 Docker Desktop 应用，将尝试自动启动并补齐运行状态。",
      installed: false,
    };
  }

  const wingetCommand = await resolveCommand("winget", []);

  if (process.platform === "win32" && wingetCommand) {
    const installResult = await runProcess(wingetCommand, [
      "install",
      "--id",
      "Docker.DockerDesktop",
      "-e",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ], { timeoutMs });
    const installDetail = [installResult.stdout.trim(), installResult.stderr.trim()].filter(Boolean).join("\n");
    const alreadyInstalled = /already installed|No available upgrade|已安装/i.test(installDetail);

    if (installResult.ok || alreadyInstalled || getWindowsDockerDesktopExecutable()) {
      return {
        ok: true,
        detail: [
          installResult.ok ? "已通过 Windows winget 安装 Docker Desktop。" : "检测到 Docker Desktop 已安装。",
          installDetail,
        ].filter(Boolean).join("\n"),
        installed: installResult.ok,
      };
    }

    const openResult = await openUrl(DOCKER_DESKTOP_WINDOWS_INSTALL_URL);
    return {
      ok: false,
      detail: [
        "Windows winget 自动安装 Docker Desktop 失败。",
        installDetail,
        openResult.ok ? "已打开 Docker Desktop Windows 官方安装说明，请完成安装后重试。" : "打开 Docker 官方安装说明失败，请手动安装 Docker Desktop 后重试。",
      ].filter(Boolean).join("\n"),
    };
  }

  const openResult = await openUrl(DOCKER_DESKTOP_WINDOWS_INSTALL_URL);
  return {
    ok: false,
    detail: openResult.ok
      ? "未检测到 winget，无法静默安装 Docker Desktop；已打开 Docker Desktop Windows 官方安装说明，请完成安装后重试。"
      : "未检测到 winget，且打开 Docker 官方安装说明失败，请手动安装 Docker Desktop 后重试。",
  };
}

async function installDockerOnLinux({ timeoutMs }) {
  const curlCommand = await resolveCommand("curl", ["/usr/bin/curl", "/usr/local/bin/curl"]);
  const installScriptPath = "/tmp/hermes-get-docker.sh";

  if (process.platform === "linux" && curlCommand) {
    const downloadResult = await runProcess(curlCommand, ["-fsSL", DOCKER_OFFICIAL_INSTALL_SCRIPT_URL, "-o", installScriptPath], {
      timeoutMs: 120_000,
    });
    const canRunAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
    const sudoCommand = canRunAsRoot ? null : await resolveCommand("sudo", ["/usr/bin/sudo", "/bin/sudo"]);
    const installResult = downloadResult.ok
      ? canRunAsRoot
        ? await runProcess("sh", [installScriptPath], { timeoutMs })
        : sudoCommand
          ? await runProcess(sudoCommand, ["-n", "sh", installScriptPath], { timeoutMs })
          : { ok: false, stdout: "", stderr: "当前用户不是 root，且未检测到 sudo，无法自动安装 Docker Engine。" }
      : downloadResult;
    const installDetail = [downloadResult.stdout?.trim(), downloadResult.stderr?.trim(), installResult.stdout?.trim(), installResult.stderr?.trim()]
      .filter(Boolean)
      .join("\n");

    if (installResult.ok) {
      const startResult = await startDockerRuntime({ autoStart: true });
      return {
        ok: true,
        detail: [
          "已通过 Docker 官方安装脚本安装 Docker Engine。",
          installDetail,
          startResult.detail,
          "如果当前用户没有 docker 组权限，可能需要重新登录系统后才能直接使用 docker 命令。",
        ].filter(Boolean).join("\n"),
        installed: true,
      };
    }

    const openResult = await openUrl(DOCKER_ENGINE_LINUX_INSTALL_URL);
    return {
      ok: false,
      detail: [
        "Linux Docker Engine 自动安装失败。",
        installDetail,
        openResult.ok ? "已打开 Docker Engine 官方安装说明，请按发行版完成安装后重试。" : "打开 Docker Engine 官方安装说明失败，请手动安装 Docker Engine 后重试。",
      ].filter(Boolean).join("\n"),
    };
  }

  const openResult = await openUrl(DOCKER_ENGINE_LINUX_INSTALL_URL);
  return {
    ok: false,
    detail: openResult.ok
      ? "未检测到 curl，无法自动下载安装脚本；已打开 Docker Engine 官方安装说明，请完成安装后重试。"
      : "未检测到 curl，且打开 Docker Engine 官方安装说明失败，请手动安装 Docker Engine 后重试。",
  };
}

export async function installDockerDesktop({ timeoutMs = DEFAULT_DOCKER_INSTALL_TIMEOUT_MS } = {}) {
  if (process.platform === "darwin") {
    return installDockerOnMac({ timeoutMs });
  }

  if (process.platform === "win32") {
    return installDockerOnWindows({ timeoutMs });
  }

  if (process.platform === "linux") {
    return installDockerOnLinux({ timeoutMs });
  }

  const openResult = await openUrl(DOCKER_DESKTOP_DOWNLOAD_URL);
  return {
    ok: false,
    detail: openResult.ok
      ? `${getPlatformLabel()} 暂不支持自动安装 Docker；已打开 Docker 官方下载页，请完成安装后重试。`
      : `${getPlatformLabel()} 暂不支持自动安装 Docker，且打开 Docker 官方下载页失败，请手动安装后重试。`,
  };
}

async function startLinuxDockerService() {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const sudoCommand = isRoot ? null : await resolveCommand("sudo", ["/usr/bin/sudo", "/bin/sudo"]);
  const systemctlCommand = await resolveCommand("systemctl", COMMON_SYSTEMCTL_PATHS);
  const serviceCommand = await resolveCommand("service", COMMON_SERVICE_PATHS);
  const attempts = [];

  if (systemctlCommand) {
    attempts.push(isRoot
      ? { command: systemctlCommand, args: ["start", "docker"] }
      : sudoCommand
        ? { command: sudoCommand, args: ["-n", systemctlCommand, "start", "docker"] }
        : null);
  }

  if (serviceCommand) {
    attempts.push(isRoot
      ? { command: serviceCommand, args: ["docker", "start"] }
      : sudoCommand
        ? { command: sudoCommand, args: ["-n", serviceCommand, "docker", "start"] }
        : null);
  }

  const details = [];
  for (const attempt of attempts.filter(Boolean)) {
    const result = await runProcess(attempt.command, attempt.args, { timeoutMs: 30_000 });
    details.push([`${attempt.command} ${attempt.args.join(" ")}`, result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n"));
    if (result.ok) {
      return {
        ok: true,
        detail: "已尝试启动 Linux Docker 服务。\n" + details.filter(Boolean).join("\n"),
      };
    }
  }

  return {
    ok: false,
    detail: details.filter(Boolean).join("\n") || "未检测到 systemctl/service 或免密 sudo，无法自动启动 Linux Docker 服务。",
  };
}

async function startDockerRuntime({ autoStart }) {
  if (!autoStart) {
    return { ok: false, detail: "" };
  }

  if (process.platform === "darwin") {
    const startResult = await runProcess("open", ["-a", "Docker"], { timeoutMs: 10_000 });
    return {
      ok: startResult.ok,
      detail: startResult.ok
        ? "已尝试自动打开 Docker Desktop。"
        : startResult.stderr.trim() || startResult.stdout.trim() || "尝试打开 Docker Desktop 失败。",
    };
  }

  if (process.platform === "win32") {
    const executable = getWindowsDockerDesktopExecutable();
    const startResult = executable
      ? await runProcess("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath '${executable.replace(/'/g, "''")}'`,
      ], { timeoutMs: 10_000 })
      : await runProcess("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Start-Process 'Docker Desktop'",
      ], { timeoutMs: 10_000 });

    return {
      ok: startResult.ok,
      detail: startResult.ok
        ? "已尝试自动打开 Windows Docker Desktop。"
        : startResult.stderr.trim() || startResult.stdout.trim() || "尝试打开 Windows Docker Desktop 失败。",
    };
  }

  if (process.platform === "linux") {
    return startLinuxDockerService();
  }

  return {
    ok: false,
    detail: `${getPlatformLabel()} 暂不支持自动启动 Docker daemon，请先手动启动。`,
  };
}

export async function ensureDockerDaemonRunning({
  autoStart = true,
  autoInstall = false,
  timeoutMs = DEFAULT_DAEMON_WAIT_TIMEOUT_MS,
  installTimeoutMs = DEFAULT_DOCKER_INSTALL_TIMEOUT_MS,
  onProgress,
  operationId,
  scope = "docker",
} = {}) {
  const emitProgress = (payload) => {
    if (typeof onProgress !== "function") return;
    onProgress({
      ...payload,
      operationId,
      scope,
      at: nowIso(),
    });
  };

  let current = await inspectDockerEnvironment();
  let installDetail = "";

  emitProgress({
    stage: "docker-check",
    message: "检查 Docker CLI 与 daemon 状态",
    detail: current.detail,
  });

  if (!current.available && autoInstall) {
    emitProgress({
      stage: "docker-install",
      message: "未检测到 Docker，准备尝试自动安装",
      detail: current.detail,
    });
    const installResult = await installDockerDesktop({ timeoutMs: installTimeoutMs });
    installDetail = installResult.detail || "";
    current = await inspectDockerEnvironment();

    emitProgress({
      stage: "docker-install",
      message: "Docker 安装处理完成",
      detail: [installDetail, current.detail].filter(Boolean).join("\n") || "已完成 Docker 安装/修复步骤。",
    });
  }

  if (!current.available || current.daemonRunning) {
    if (!current.available) {
      emitProgress({
        stage: "failed",
        message: "Docker 不可用，无法继续",
        detail: [installDetail, current.detail].filter(Boolean).join("\n") || current.detail,
      });
    } else {
      emitProgress({
        stage: "docker-ready",
        message: "Docker daemon 已就绪",
        detail: current.detail,
      });
    }

    return {
      ...current,
      detail: [installDetail, current.detail].filter(Boolean).join("\n") || current.detail,
      autoStarted: false,
      autoInstalled: Boolean(installDetail),
    };
  }

  const startResult = await startDockerRuntime({ autoStart });
  const startDetail = startResult.detail;
  if (startResult.ok) {
    emitProgress({
      stage: "docker-start",
      message: "已触发 Docker Desktop / 服务启动",
      detail: startDetail || "已触发启动命令。",
    });
  } else {
    emitProgress({
      stage: "docker-start",
      message: "Docker 启动命令执行失败",
      detail: startDetail || "启动命令未返回有效信息。",
    });
  }

  const startedAt = Date.now();
  let waitTick = 1;
  while (Date.now() - startedAt < timeoutMs) {
    const dockerCommand = await resolveDockerCommand();
    const infoResult = dockerCommand
      ? await runProcess(dockerCommand, ["info"], { timeoutMs: 10_000 })
      : { ok: false };

    if (infoResult.ok) {
      current = await inspectDockerEnvironment();
      emitProgress({
        stage: "docker-ready",
        message: "Docker daemon 已恢复",
        detail: current.detail || "已完成 daemon 健康检查。",
      });
      return {
        ...current,
        daemonRunning: true,
        detail: [installDetail, current.detail || "Docker daemon 正常运行。"].filter(Boolean).join("\n"),
        autoStarted: Boolean(autoStart),
        autoInstalled: Boolean(installDetail),
      };
    }

    emitProgress({
      stage: "docker-start",
      message: `等待 Docker daemon 就绪（${waitTick}）`,
      detail: "已尝试读取 docker info，仍未就绪。",
    });
    waitTick += 1;
    await new Promise((resolve) => setTimeout(resolve, DAEMON_POLL_INTERVAL_MS));
  }

  current = await inspectDockerEnvironment();
  return {
    ...current,
    daemonRunning: false,
    detail: [
      installDetail,
      startDetail,
      current.detail,
      `已等待 ${Math.round(timeoutMs / 1000)} 秒，Docker daemon 仍未就绪。`,
    ].filter(Boolean).join("\n"),
    autoStarted: Boolean(autoStart),
    autoInstalled: Boolean(installDetail),
  };
}

function getDockerCommandResultDetail(result) {
  return result?.error?.detail
    || result?.data?.stderr
    || result?.data?.stdout
    || "Docker 命令没有返回详细信息。";
}

export async function ensureDockerImageAvailable(
  image,
  {
    timeoutMs = DEFAULT_DOCKER_PULL_TIMEOUT_MS,
    attempts = DEFAULT_DOCKER_PULL_ATTEMPTS,
    onProgress,
    operationId,
    scope = "docker",
  } = {}
) {
  const emitProgress = (payload) => {
    if (typeof onProgress !== "function") return;
    onProgress({
      ...payload,
      operationId,
      scope,
      at: nowIso(),
    });
  };

  if (!image || typeof image !== "string") {
    const detail = "启动容器前缺少 Docker 镜像名称。";
    emitProgress({ stage: "failed", message: "镜像名称缺失", detail });
    return {
      ok: false,
      error: {
        code: "DOCKER_IMAGE_REQUIRED",
        message: "Docker 镜像不能为空。",
        detail,
        recoverable: true,
      },
    };
  }

  emitProgress({ stage: "docker-image-inspect", message: "检查镜像本地缓存", detail: `镜像：${image}` });
  const inspectResult = await runDockerCommand(["image", "inspect", image], { timeoutMs: 30_000 });
  if (inspectResult.ok) {
    emitProgress({
      stage: "docker-image-inspect",
      message: "镜像已在本地存在",
      detail: `镜像 ${image} 已存在本地，可直接运行容器。`,
    });
    return {
      ok: true,
      data: {
        image,
        alreadyAvailable: true,
        attempts: 0,
        detail: "Docker 镜像已存在。",
      },
    };
  }

  const pullDetails = [];
  const maxAttempts = Math.max(1, Number.isFinite(attempts) ? Math.floor(attempts) : DEFAULT_DOCKER_PULL_ATTEMPTS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pullStageMessage = `正在拉取镜像（第 ${attempt}/${maxAttempts} 次）`;
    emitProgress({ stage: "docker-image-pull", message: pullStageMessage, detail: image });
    const pullTracker = createDockerPullProgressTracker({ image, emitProgress, operationId, scope });
    const pullResult = await runDockerCommand(["pull", image], {
      timeoutMs,
      onOutput: (stream, text) => {
        pullTracker.push(stream, text);
      },
    });

    if (pullResult.ok) {
      emitProgress({
        stage: "docker-image-pull",
        message: `镜像拉取完成（第 ${attempt}/${maxAttempts} 次）`,
        detail: `镜像 ${image} 已成功拉取。`,
      });
      return {
        ok: true,
        data: {
          image,
          alreadyAvailable: false,
          attempts: attempt,
          detail: `Docker 镜像拉取完成（第 ${attempt}/${maxAttempts} 次）。`,
          stdout: pullResult.data?.stdout,
          stderr: pullResult.data?.stderr,
        },
      };
    }

    pullDetails.push(`第 ${attempt}/${maxAttempts} 次拉取失败：${getDockerCommandResultDetail(pullResult)}`);

    if (attempt < maxAttempts) {
      emitProgress({
        stage: "docker-image-pull",
        message: "镜像拉取失败，准备重试",
        detail: pullDetails[pullDetails.length - 1],
      });
      await sleep(2_000);
    }
  }

  emitProgress({
    stage: "failed",
    message: "镜像拉取失败",
    detail: pullDetails.join("\n") || "镜像拉取未返回详细失败信息。",
  });
  return {
    ok: false,
    data: {
      image,
      attempts: maxAttempts,
      detail: pullDetails.join("\n"),
    },
    error: {
      code: "DOCKER_IMAGE_PULL_FAILED",
      message: "Docker 镜像拉取失败。",
      detail: [
        `镜像 ${image} 拉取超时或失败，客户端已自动重试 ${maxAttempts} 次。`,
        `单次最长等待 ${Math.round(timeoutMs / 1000)} 秒；Docker 会复用已下载的 layer，下一次会继续拉取。`,
        pullDetails.join("\n"),
      ].filter(Boolean).join("\n"),
      recoverable: true,
    },
  };
}

export async function runDockerCommand(args, options = {}) {
  const dockerCommand = await resolveDockerCommand();

  if (!dockerCommand) {
    return {
      ok: false,
      data: {
        args,
        exitCode: null,
        stdout: "",
        stderr: "未找到 Docker 命令。",
      },
      error: {
        code: "DOCKER_COMMAND_UNAVAILABLE",
        message: "Docker 命令不可用。",
        detail: "未找到 Docker 命令，也未检测到 Docker Desktop 内置 CLI。",
        recoverable: true,
      },
    };
  }

  const result = await runProcess(dockerCommand, args, options);

  return {
    ok: result.ok,
    data: {
      args,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    },
    error: result.ok
      ? undefined
      : {
          code: "DOCKER_COMMAND_FAILED",
          message: "Docker 命令执行失败。",
          detail: result.stderr.trim() || result.stdout.trim() || `exitCode=${result.exitCode}`,
          recoverable: true,
        },
  };
}
