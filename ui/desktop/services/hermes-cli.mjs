import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_HERMES_BINARY = path.join(os.homedir(), ".local", "bin", "hermes");

function isAllowedHermesArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return false;
  if (args.length === 1 && args[0] === "--version") return true;

  const [command, ...rest] = args;
  if (command === "status" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--deep") || (rest.length === 1 && rest[0] === "--all"))) return true;
  if (command === "doctor" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--fix"))) return true;
  if (command === "profile" && rest[0] === "list" && rest.length === 1) return true;
  if (command === "profile" && rest[0] === "show" && rest.length >= 2) return true;
  if (command === "gateway" && ["status", "start", "stop", "restart"].includes(rest[0]) && rest.length === 1) return true;
  if (command === "gateway" && rest[0] === "install" && rest.length === 2 && rest[1] === "--force") return true;
  if (command === "gateway" && rest[0] === "uninstall" && rest.length === 1) return true;
  if (command === "uninstall" && rest.length === 1 && rest[0] === "--yes") return true;
  if (command === "uninstall" && rest.length === 2 && rest[0] === "--full" && rest[1] === "--yes") return true;
  if (command === "logs") return true;
  if (command === "backup") return true;
  if (command === "import" && rest.length >= 1) return true;

  return false;
}

function runProcess(command, args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, env } = {}) {
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
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
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

export function resolveHermesBinary() {
  return fs.existsSync(DEFAULT_HERMES_BINARY) ? DEFAULT_HERMES_BINARY : "hermes";
}

export async function inspectHermesEnvironment() {
  const binaryPath = resolveHermesBinary();
  const available = binaryPath === "hermes" ? true : fs.existsSync(binaryPath);

  if (!available) {
    return {
      available: false,
      binaryPath,
      version: null,
      detail: "未找到 Hermes CLI。",
    };
  }

  const result = await runProcess(binaryPath, ["--version"]);

  return {
    available: result.ok,
    binaryPath,
    version: result.ok ? result.stdout.trim() : null,
    detail: result.ok ? "Hermes CLI 可用。" : result.stderr.trim() || "Hermes CLI 调用失败。",
  };
}

export async function runHermesCommand(args, options = {}) {
  if (!isAllowedHermesArgs(args)) {
    return {
      ok: false,
      error: {
        code: "HERMES_COMMAND_NOT_ALLOWED",
        message: "当前命令不在第一阶段白名单中。",
        detail: `args=${JSON.stringify(args)}`,
        recoverable: false,
      },
    };
  }

  const binaryPath = resolveHermesBinary();
  const result = await runProcess(binaryPath, args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    env: options.env ? { ...process.env, ...options.env } : options.env,
  });

  return {
    ok: result.ok,
    data: {
      binaryPath,
      args,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    },
    error: result.ok
      ? undefined
      : {
          code: "HERMES_COMMAND_FAILED",
          message: "Hermes CLI 执行失败。",
          detail: result.stderr.trim() || result.stdout.trim() || `exitCode=${result.exitCode}`,
          recoverable: true,
        },
  };
}
