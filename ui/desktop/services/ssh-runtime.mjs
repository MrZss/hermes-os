import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 20_000;
const SSH_BINARY = "/usr/bin/ssh";
const SCP_BINARY = "/usr/bin/scp";
const EXPECT_BINARY = "/usr/bin/expect";

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

function resolveBinary(binaryPath, fallbackName) {
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }
  return fallbackName;
}

function expandHomeDirectory(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return "";
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

function stripPasswordPromptNoise(text) {
  const promptStripped = String(text || "").replace(/^[^\n\r]*password:\s*\r?/i, "");
  const lines = promptStripped.split(/\r?\n/);
  while (lines.length > 0 && /password:\s*$/i.test(lines[0].trim())) {
    lines.shift();
  }
  return lines.join("\n").replace(/^\s+/, "");
}

function buildSshFailureDetail(token, detailLines = []) {
  const extras = detailLines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join("\n");
  return extras ? `${token}\n${extras}` : token;
}

export function suggestLocalSshKeyPath() {
  const candidates = [
    "~/.ssh/id_ed25519",
    "~/.ssh/id_rsa",
    "~/.ssh/ai.pem",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(expandHomeDirectory(candidate))) {
      return candidate;
    }
  }

  return candidates[0];
}

function validateConnectionInput(connection) {
  const host = typeof connection?.host === "string" ? connection.host.trim() : "";
  const user = typeof connection?.user === "string" ? connection.user.trim() : "";
  const port = typeof connection?.port === "string" || typeof connection?.port === "number"
    ? String(connection.port).trim() || "22"
    : "22";
  const authMode = connection?.authMode === "password" ? "password" : "ssh_key";
  const keyPath = authMode === "ssh_key" ? expandHomeDirectory(typeof connection?.keyPath === "string" ? connection.keyPath.trim() : "") : "";
  const password = authMode === "password" ? String(connection?.password ?? "") : "";

  if (!host) {
    return toDesktopError("SSH_HOST_REQUIRED", "远程主机不能为空。", "请先填写远程主机或 IP。", true);
  }

  if (!user) {
    return toDesktopError("SSH_USER_REQUIRED", "远程用户名不能为空。", "请先填写 SSH 用户名。", true);
  }

  if (authMode === "ssh_key" && !keyPath) {
    return toDesktopError("SSH_AUTH_REQUIRED", "缺少 SSH 私钥路径。", "请先填写可用的 SSH 私钥路径。", true);
  }

  if (authMode === "ssh_key" && !fs.existsSync(keyPath)) {
    return toDesktopError("SSH_KEY_NOT_FOUND", "未找到 SSH 私钥文件。", `未找到 ${keyPath}。`, true);
  }

  if (authMode === "password" && !password.trim()) {
    return toDesktopError("SSH_AUTH_REQUIRED", "缺少 SSH 密码。", "请先输入 SSH 密码。", true);
  }

  return {
    ok: true,
    data: {
      host,
      user,
      port,
      authMode,
      keyPath,
      password,
    },
  };
}

function runProcess(command, args, { timeoutMs = DEFAULT_TIMEOUT_MS, env, cwd } = {}) {
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
        timedOut: true,
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
        timedOut: false,
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
        timedOut: false,
      });
    });
  });
}

function buildSshArgs({ host, user, port, authMode, keyPath, remoteCommand, forceTty = false }) {
  const args = [
    "-p",
    String(port || 22),
    "-o",
    "ConnectTimeout=8",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    authMode === "ssh_key" ? "BatchMode=yes" : "BatchMode=no",
  ];

  if (authMode === "password") {
    args.push(
      "-o",
      "PreferredAuthentications=password,keyboard-interactive",
      "-o",
      "PubkeyAuthentication=no",
    );
  }

  if (forceTty) {
    args.push("-tt");
  }

  if (authMode === "ssh_key") {
    args.push("-i", keyPath);
  }

  args.push(`${user}@${host}`, `sh -lc ${shellEscape(remoteCommand)}`);
  return args;
}

function buildScpArgs({ host, user, port, authMode, keyPath, localPath, remotePath }) {
  const args = [
    "-P",
    String(port || 22),
    "-o",
    "ConnectTimeout=8",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    authMode === "ssh_key" ? "BatchMode=yes" : "BatchMode=no",
  ];

  if (authMode === "ssh_key") {
    args.push("-i", keyPath);
  }

  args.push(localPath, `${user}@${host}:${remotePath}`);
  return args;
}

function classifyPasswordAuthFailure(detail) {
  const normalized = String(detail || "");

  if (/SSH_PASSWORD_DISABLED/i.test(normalized)) {
    return {
      code: "SSH_PASSWORD_DISABLED",
      message: "目标服务器未开放密码登录。",
    };
  }

  if (
    /SSH_PASSWORD_REJECTED/i.test(normalized) ||
    (
      /Permission denied \(.*\)/i.test(normalized) &&
      /Authentications that can continue:\s*.*password/i.test(normalized)
    )
  ) {
    return {
      code: "SSH_PASSWORD_REJECTED",
      message: "SSH 用户名或密码被服务器拒绝。",
    };
  }

  if (
    /Permission denied \(publickey\)\./i.test(normalized) ||
    /Authentications that can continue:\s*publickey\s*$/im.test(normalized)
  ) {
    return {
      code: "SSH_PASSWORD_DISABLED",
      message: "目标服务器未开放密码登录。",
    };
  }

  return {
    code: "SSH_AUTH_FAILED",
    message: "SSH 密码认证失败。",
  };
}

function isSshAuthenticationFailureDetail(detail) {
  return /SSH_PASSWORD_REJECTED|SSH_PASSWORD_DISABLED|SSH_AUTH_FAILED/i.test(detail)
    || /Permission denied \(.*\)/i.test(detail)
    || /Permission denied, please try again\./i.test(detail)
    || /Authentications that can continue:/i.test(detail)
    || /authentication failed|access denied/i.test(detail);
}

export function mapSshFailure(result, authMode) {
  const rawDetail = (result.stderr || result.stdout || "").trim();
  const detail = authMode === "password" ? stripPasswordPromptNoise(rawDetail).trim() : rawDetail;
  const looksLikeAuthFailure = isSshAuthenticationFailureDetail(detail);

  if (result.timedOut) {
    return toDesktopError("SSH_TIMEOUT", "SSH 连接超时。", detail || "SSH 调用超时。", true);
  }

  if (looksLikeAuthFailure) {
    if (authMode === "password") {
      const passwordFailure = classifyPasswordAuthFailure(detail);
      return toDesktopError(
        passwordFailure.code,
        passwordFailure.message,
        detail || buildSshFailureDetail(passwordFailure.code, ["Remote authentication failed."]),
        true,
      );
    }

    return toDesktopError(
      "SSH_AUTH_FAILED",
      "SSH 认证失败。",
      detail || buildSshFailureDetail("SSH_AUTH_FAILED", ["Remote authentication failed."]),
      true,
    );
  }

  if (/Could not resolve hostname|Name or service not known|nodename nor servname provided/i.test(detail)) {
    return toDesktopError("SSH_CONNECTION_FAILED", "无法解析远程主机。", detail, true);
  }

  if (/Connection refused|Operation timed out|No route to host|Connection timed out/i.test(detail)) {
    return toDesktopError("SSH_CONNECTION_FAILED", "无法连接远程主机。", detail, true);
  }

  return toDesktopError("SSH_COMMAND_FAILED", "远程命令执行失败。", detail || `exitCode=${result.exitCode}`, true);
}

async function runSshWithPassword(args, { timeoutMs, password }) {
  const expectPath = resolveBinary(EXPECT_BINARY, "expect");
  if (expectPath === "expect" && !fs.existsSync(EXPECT_BINARY)) {
    return toDesktopError("EXPECT_BINARY_MISSING", "当前环境缺少 expect，无法使用密码认证。", "请安装 expect，或切换到 SSH 私钥模式。", true);
  }

  const scriptPath = path.join(os.tmpdir(), `hermes-ssh-${Date.now()}-${Math.random().toString(36).slice(2)}.exp`);
  const script = `#!/usr/bin/expect -f
set timeout ${Math.max(1, Math.ceil(timeoutMs / 1000))}
match_max 1048576
set password $env(HERMES_SSH_PASSWORD)
set auth_prompt_count 0
set saw_password_rejection 0
set saw_password_prompt 0
spawn -noecho {*}$argv
expect {
  -re {(?i)are you sure you want to continue connecting.*} {
    send "yes\\r"
    exp_continue
  }
  -re {(?i)(password|passphrase|verification code|enter.*code).*:} {
    set saw_password_prompt 1
    incr auth_prompt_count
    if {$auth_prompt_count >= 2} {
      send_error "SSH_PASSWORD_REJECTED\\n"
      send_error "Remote authentication was requested again after one credential attempt.\\n"
      exit 65
    }
    send -- "$password\\r"
    exp_continue
  }
  -re {Authentications that can continue:\\s*publickey\\s*$} {
    send_error "SSH_PASSWORD_DISABLED\\n"
    send_error "$expect_out(0,string)\\n"
    exit 67
  }
  -re {(?i)(permission denied \\(.*\\)|permission denied, please try again\\.|authentication failed|access denied)} {
    set saw_password_rejection 1
    exp_continue
  }
  -re {(?i)(connection closed by remote host|kex_exchange_identification.*|received disconnect.*)} {
    send_error "SSH_CONNECTION_FAILED\\n"
    send_error "$expect_out(0,string)\\n"
    exit 66
  }
  timeout {
    send_error "SSH_TIMEOUT\\n"
    exit 124
  }
  eof
}
catch wait result
set exit_code [lindex $result 3]
if {$exit_code != 0 && $saw_password_rejection == 1} {
  send_error "SSH_PASSWORD_REJECTED\\n"
} elseif {$exit_code != 0 && $saw_password_prompt == 0} {
  send_error "SSH_PASSWORD_DISABLED\\n"
}
exit $exit_code
`;

  await fsp.writeFile(scriptPath, script, { mode: 0o700 });

  try {
    return await runProcess(expectPath, [scriptPath, ...args], {
      timeoutMs,
      env: {
        ...process.env,
        HERMES_SSH_PASSWORD: password,
      },
    });
  } finally {
    await fsp.rm(scriptPath, { force: true });
  }
}

export function inspectSshRuntime({ authMode } = {}) {
  const sshBinary = resolveBinary(SSH_BINARY, "ssh");
  const sshAvailable = sshBinary === "ssh" ? true : fs.existsSync(sshBinary);
  const expectBinary = resolveBinary(EXPECT_BINARY, "expect");
  const expectAvailable = expectBinary === "expect" ? true : fs.existsSync(expectBinary);

  return {
    sshBinary,
    sshAvailable,
    expectBinary,
    expectAvailable,
    passwordSupported: authMode === "password" ? expectAvailable : true,
  };
}

export async function runSshCommand(connection, remoteCommand, options = {}) {
  const validation = validateConnectionInput(connection);
  if (!validation.ok || !validation.data) {
    return validation;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runtime = inspectSshRuntime({ authMode: validation.data.authMode });

  if (!runtime.sshAvailable) {
    return toDesktopError("SSH_BINARY_MISSING", "当前环境缺少 ssh 命令。", "请先安装 OpenSSH 客户端。", false);
  }

  const args = buildSshArgs({
    ...validation.data,
    remoteCommand,
    forceTty: options.forceTty === true,
  });

  const result = validation.data.authMode === "password"
    ? await runSshWithPassword([runtime.sshBinary, ...args], { timeoutMs, password: validation.data.password })
    : await runProcess(runtime.sshBinary, args, { timeoutMs });

  if (result.error) {
    return result;
  }

  if (!result.ok) {
    return mapSshFailure(result, validation.data.authMode);
  }

  const stdout = validation.data.authMode === "password"
    ? stripPasswordPromptNoise(result.stdout)
    : result.stdout;
  const stderr = validation.data.authMode === "password"
    ? stripPasswordPromptNoise(result.stderr)
    : result.stderr;

  return {
    ok: true,
    data: {
      binaryPath: runtime.sshBinary,
      args,
      exitCode: result.exitCode,
      stdout: String(stdout || "").trim(),
      stderr: String(stderr || "").trim(),
    },
  };
}

export async function copyLocalFileToRemote(connection, localPath, remotePath, options = {}) {
  const validation = validateConnectionInput(connection);
  if (!validation.ok || !validation.data) {
    return validation;
  }

  if (validation.data.authMode !== "ssh_key") {
    return toDesktopError("SSH_PASSWORD_UPLOAD_UNSUPPORTED", "当前远程文件上传只支持 SSH 私钥模式。", "请切换到 SSH 私钥认证后再重试。", true);
  }

  const runtime = inspectSshRuntime({ authMode: validation.data.authMode });
  const scpBinary = resolveBinary(SCP_BINARY, "scp");
  const scpAvailable = scpBinary === "scp" ? true : fs.existsSync(scpBinary);

  if (!scpAvailable) {
    return toDesktopError("SCP_BINARY_MISSING", "当前环境缺少 scp 命令。", "请先安装 OpenSSH 客户端。", false);
  }

  const args = buildScpArgs({
    ...validation.data,
    localPath: expandHomeDirectory(localPath),
    remotePath,
  });

  const result = await runProcess(scpBinary, args, {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  if (!result.ok) {
    return mapSshFailure(result, validation.data.authMode);
  }

  return {
    ok: true,
    data: {
      binaryPath: scpBinary,
      args,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    },
  };
}
