import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { inspectHermesEnvironment } from "./hermes-cli.mjs";

export const HERMES_INSTALL_SCRIPT_URL = "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh";
const DEFAULT_INSTALL_TIMEOUT_MS = 300_000;
const MAX_INSTALLER_BYTES = 1024 * 1024 * 2;

function nowIso() {
  return new Date().toISOString();
}

function emitProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;

  onProgress({
    at: nowIso(),
    ...event,
  });
}

function splitProgressLines(text) {
  return text
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 320));
}

function toInstallerError(code, message, detail, recoverable = true, data) {
  return {
    ok: false,
    data,
    error: {
      code,
      message,
      detail,
      recoverable,
    },
  };
}

function downloadText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "User-Agent": "Hermes-Console",
        Accept: "text/x-shellscript,text/plain,*/*",
      },
      timeout: 30_000,
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        if (redirects >= 3) {
          reject(new Error("installer redirect limit exceeded"));
          return;
        }

        resolve(downloadText(new URL(location, url).toString(), redirects + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`installer download failed with HTTP ${statusCode}`));
        return;
      }

      let size = 0;
      const chunks = [];

      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_INSTALLER_BYTES) {
          response.destroy(new Error("installer script is unexpectedly large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("installer download timed out"));
    });

    request.on("error", reject);
  });
}

function runProcess(command, args, { cwd, timeoutMs = DEFAULT_INSTALL_TIMEOUT_MS, env, onOutput } = {}) {
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

export async function installHermesCli({ timeoutMs = DEFAULT_INSTALL_TIMEOUT_MS, operationId, onProgress } = {}) {
  emitProgress(onProgress, {
    operationId,
    stage: "inspect",
    message: "检查 Hermes CLI 是否已安装",
  });

  const before = await inspectHermesEnvironment();
  if (before.available) {
    emitProgress(onProgress, {
      operationId,
      stage: "done",
      message: "Hermes CLI 已就绪",
      detail: before.binaryPath,
    });

    return {
      ok: true,
      data: {
        alreadyInstalled: true,
        scriptUrl: HERMES_INSTALL_SCRIPT_URL,
        binaryPath: before.binaryPath,
        version: before.version,
        stdout: "Hermes CLI already installed.",
        stderr: "",
      },
    };
  }

  let scriptText;
  try {
    emitProgress(onProgress, {
      operationId,
      stage: "download",
      message: "下载 Hermes 官方安装器",
      detail: HERMES_INSTALL_SCRIPT_URL,
    });
    scriptText = await downloadText(HERMES_INSTALL_SCRIPT_URL);
  } catch (error) {
    emitProgress(onProgress, {
      operationId,
      stage: "failed",
      message: "Hermes 官方安装器下载失败",
      detail: error instanceof Error ? error.message : "下载官方安装脚本时发生未知错误。",
    });

    return toInstallerError(
      "HERMES_INSTALLER_DOWNLOAD_FAILED",
      "Hermes 官方安装器下载失败。",
      error instanceof Error ? error.message : "下载官方安装脚本时发生未知错误。"
    );
  }

  emitProgress(onProgress, {
    operationId,
    stage: "validate",
    message: "校验 Hermes 官方安装脚本",
  });

  if (!scriptText.includes("hermes") || !scriptText.includes("NousResearch")) {
    emitProgress(onProgress, {
      operationId,
      stage: "failed",
      message: "Hermes 官方安装器内容异常",
      detail: "下载到的脚本没有包含预期的 Hermes / NousResearch 标识，已中止安装。",
    });

    return toInstallerError(
      "HERMES_INSTALLER_UNEXPECTED_CONTENT",
      "Hermes 官方安装器内容异常。",
      "下载到的脚本没有包含预期的 Hermes / NousResearch 标识，已中止安装。"
    );
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-console-install-"));
  const scriptPath = path.join(tempRoot, "install.sh");
  await fs.writeFile(scriptPath, scriptText, { mode: 0o700 });

  emitProgress(onProgress, {
    operationId,
    stage: "run",
    message: "执行 Hermes 官方安装器",
    detail: scriptPath,
  });

  const result = await runProcess("bash", [scriptPath, "--skip-setup"], {
    timeoutMs,
    env: {
      ...process.env,
      HERMES_CONSOLE_INSTALL: "1",
    },
    onOutput: (stream, text) => {
      for (const line of splitProgressLines(text)) {
        if (stream === "stdout") {
          onProgress?.({
            operationId,
            stage: "run",
            stream: "stdout",
            message: line,
            at: nowIso(),
          });
        }

        if (stream === "stderr") {
          onProgress?.({
            operationId,
            stage: "run",
            stream: "stderr",
            message: line,
            at: nowIso(),
          });
        }
      }
    },
  });

  emitProgress(onProgress, {
    operationId,
    stage: "verify",
    message: "验证 Hermes CLI 安装结果",
  });

  const after = await inspectHermesEnvironment();
  const data = {
    alreadyInstalled: false,
    scriptUrl: HERMES_INSTALL_SCRIPT_URL,
    scriptPath,
    binaryPath: after.binaryPath,
    version: after.version,
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };

  if (!result.ok || !after.available) {
    emitProgress(onProgress, {
      operationId,
      stage: "failed",
      message: "Hermes CLI 安装失败",
      detail: result.stderr.trim() || result.stdout.trim() || after.detail || `installer exitCode=${result.exitCode}`,
    });

    return toInstallerError(
      "HERMES_INSTALLER_RUN_FAILED",
      "Hermes CLI 安装失败。",
      result.stderr.trim() || result.stdout.trim() || after.detail || `installer exitCode=${result.exitCode}`,
      true,
      data
    );
  }

  emitProgress(onProgress, {
    operationId,
    stage: "done",
    message: "Hermes CLI 安装完成",
    detail: after.binaryPath,
  });

  return {
    ok: true,
    data,
  };
}
