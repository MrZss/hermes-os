import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRegisteredInstance, upsertRegisteredInstance } from "./instance-registry.mjs";
import { getInstanceOfficialState } from "./hermes-official-state.mjs";
import { resolveHermesBinary } from "./hermes-cli.mjs";
import { runSshCommand } from "./ssh-runtime.mjs";
import { getInstanceState, startInstance, stopInstance } from "./instance-state.mjs";
import {
  isRemoteDockerInstance,
  readRemoteDockerTextFile,
  runRemoteDockerHermesCommand,
  writeRemoteDockerTextFile,
} from "./remote-docker-files.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const PROFILE_TIMEOUT_MS = 60_000;
const PROVIDER_AUTH_TIMEOUT_MS = readPositiveIntegerEnv("HERMES_PROVIDER_AUTH_TIMEOUT_MS", 300_000);
const PAIRING_APPROVE_TIMEOUT_MS = 30_000;
const IMPORTED_PROFILE_MARKER = "__HERMES_IMPORTED_PROFILE__=";
const WEIXIN_ILINK_BASE_URL = "https://ilinkai.weixin.qq.com";
const WEIXIN_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const WEIXIN_QR_TIMEOUT_MS = 35_000;
const WEIXIN_QR_SESSION_TTL_MS = 8 * 60_000;
const WEIXIN_QR_SESSIONS = new Map();
const XIAOMI_TOKEN_PLAN_CN_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";

function readPositiveIntegerEnv(name, fallbackValue) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function nowIso() {
  return new Date().toISOString();
}

function randomWeixinUin() {
  return Buffer.from(String(crypto.randomInt(0, 0xffffffff))).toString("base64");
}

function buildWeixinHeaders(body = "") {
  return {
    "Content-Type": "application/json",
    "AuthorizationType": "ilink_bot_token",
    "Content-Length": String(Buffer.byteLength(body, "utf8")),
    "X-WECHAT-UIN": randomWeixinUin(),
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": String((2 << 16) | (2 << 8) | 0),
  };
}

async function fetchWeixinIlinkJson(baseUrl, endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEIXIN_QR_TIMEOUT_MS);

  try {
    const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/${endpoint}`, {
      headers: buildWeixinHeaders(),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanupWeixinQrSessions() {
  const now = Date.now();
  for (const [requestId, session] of WEIXIN_QR_SESSIONS.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) {
      WEIXIN_QR_SESSIONS.delete(requestId);
    }
  }
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

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProviderId(providerId) {
  return normalizeText(providerId) === "custom-endpoint" ? "custom" : normalizeText(providerId);
}

function normalizePairingPlatformId(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "weixin" || normalized === "wechat") return "weixin";
  if (normalized === "qq" || normalized === "qqbot") return "qqbot";
  return "";
}

function normalizePairingCode(value) {
  return normalizeText(value).replace(/[`'"\s]/g, "").toUpperCase();
}

function getPairingPlatformLabel(platformId) {
  return platformId === "weixin" ? "微信" : platformId === "qqbot" ? "QQ Bot" : platformId;
}

function normalizeConfigValue(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function ensureXiaomiTokenPlanBaseUrl(envEntries) {
  const existing = envEntries.find((entry) => entry.key === "XIAOMI_BASE_URL");

  if (existing) {
    if (!normalizeText(existing.value)) {
      existing.value = XIAOMI_TOKEN_PLAN_CN_BASE_URL;
    }
    return envEntries;
  }

  envEntries.push({
    key: "XIAOMI_BASE_URL",
    value: XIAOMI_TOKEN_PLAN_CN_BASE_URL,
  });

  return envEntries;
}

function buildRemoteConnection(instance) {
  if (!instance?.remote?.host || !instance?.remote?.user || (instance.remote.authMode === "password" ? !instance.remote?.password : !instance?.remote?.keyPath)) {
    return null;
  }

  return {
    host: instance.remote.host,
    port: instance.remote.port || "22",
    user: instance.remote.user,
    authMode: instance.remote.authMode === "password" ? "password" : "ssh_key",
    keyPath: instance.remote.keyPath,
    password: instance.remote.password,
    workdir: instance.remote.workdir || instance.workspaceDir,
  };
}

function parseCommandDetail(stdout = "", stderr = "") {
  return [stderr, stdout].map((value) => String(value || "").trim()).filter(Boolean).join("\n");
}

function parseOutputPath(stdout = "") {
  const match = String(stdout).match(/to\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function parseImportedProfileId(stdout = "") {
  const match = String(stdout).match(/Imported profile '([^']+)'/);
  return match?.[1]?.trim() ?? "";
}

function parseImportedProfileMarker(output = "") {
  const match = String(output).match(/__HERMES_IMPORTED_PROFILE__=([^\n\r]+)/);
  return match?.[1]?.trim() ?? "";
}

function runLocalProcess(command, args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, env } = {}) {
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

async function getManagedInstance(userDataPath, instanceId) {
  if (!normalizeText(instanceId)) {
    return toDesktopError("INSTANCE_ID_REQUIRED", "实例 ID 不能为空。", "请提供实例 ID。", true);
  }

  const registryResult = await getRegisteredInstance(userDataPath, instanceId);
  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  if (!registryResult.data.instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }

  return {
    ok: true,
    data: {
      instance: registryResult.data.instance,
    },
  };
}

async function cleanupProfileAlias(instance, profileName) {
  const normalizedProfile = normalizeText(profileName);
  if (!normalizedProfile) {
    return;
  }

  if (instance.type === "remote") {
    const connection = buildRemoteConnection(instance);
    if (!connection) return;
    await runSshCommand(connection, `rm -f "$HOME/.local/bin/"${shellEscape(normalizedProfile)}`, { timeoutMs: 10_000 }).catch(() => {});
    return;
  }

  try {
    await fs.rm(path.join(os.homedir(), ".local", "bin", normalizedProfile), { force: true });
  } catch {
    // ignore alias cleanup failure
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function buildProfileScopedArgs(profileId, args) {
  const scopedArgs = [];
  if (profileId && profileId !== "default") {
    scopedArgs.push("-p", profileId);
  }
  scopedArgs.push(...args);
  return scopedArgs;
}

function resolveProfileHome(instance, profileId) {
  const normalizedProfile = normalizeText(profileId) || "default";
  if (normalizedProfile === "default") {
    return instance.hermesHome;
  }

  return instance.type === "remote"
    ? path.posix.join(instance.hermesHome, "profiles", normalizedProfile)
    : path.join(instance.hermesHome, "profiles", normalizedProfile);
}

function serializeEnvValue(value) {
  const normalizedValue = normalizeConfigValue(value);
  if (/^[A-Za-z0-9_./:@+-]*$/.test(normalizedValue)) {
    return normalizedValue;
  }

  return `"${normalizedValue
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

function upsertEnvText(currentText, entries) {
  const normalizedEntries = entries
    .map((entry) => ({
      key: normalizeText(entry?.key),
      value: normalizeConfigValue(entry?.value),
    }))
    .filter((entry) => entry.key);
  const pending = new Map(normalizedEntries.map((entry) => [entry.key, entry.value]));

  if (pending.size === 0) {
    return String(currentText || "");
  }

  const lines = String(currentText || "").split(/\r?\n/);
  const nextLines = [];

  for (const [index, line] of lines.entries()) {
    if (index === lines.length - 1 && line === "") {
      continue;
    }

    const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !pending.has(match[2])) {
      nextLines.push(line);
      continue;
    }

    const key = match[2];
    nextLines.push(`${key}=${serializeEnvValue(pending.get(key))}`);
    pending.delete(key);
  }

  for (const [key, value] of pending) {
    nextLines.push(`${key}=${serializeEnvValue(value)}`);
  }

  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
}

function serializeYamlValue(value) {
  const normalizedValue = normalizeConfigValue(value);
  return `"${normalizedValue
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findYamlSection(lines, sectionName) {
  const sectionPattern = new RegExp(`^${escapeRegExp(sectionName)}\\s*:\\s*(?:#.*)?$`);
  const startIndex = lines.findIndex((line) => sectionPattern.test(line));
  if (startIndex < 0) {
    return { startIndex: -1, endIndex: -1 };
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && /:\s*(?:#.*)?$/.test(line)) {
      endIndex = index;
      break;
    }
  }

  return { startIndex, endIndex };
}

function upsertSimpleYamlEntries(currentText, entries) {
  const lines = String(currentText || "")
    .replace(/\s*$/, "")
    .split(/\r?\n/)
    .filter((line, index, allLines) => !(allLines.length === 1 && index === 0 && line === ""));

  for (const entry of entries) {
    const [sectionName, ...keyParts] = String(entry.key || "").split(".");
    const keyName = keyParts.join(".");
    if (!sectionName || !keyName) continue;

    let { startIndex, endIndex } = findYamlSection(lines, sectionName);
    if (startIndex < 0) {
      if (lines.length > 0 && lines.at(-1) !== "") {
        lines.push("");
      }
      startIndex = lines.length;
      lines.push(`${sectionName}:`);
      endIndex = lines.length;
    }

    const keyPattern = new RegExp(`^\\s{2}${escapeRegExp(keyName)}\\s*:`);
    const valueLine = `  ${keyName}: ${serializeYamlValue(entry.value)}`;
    let replaced = false;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      if (keyPattern.test(lines[index])) {
        lines[index] = valueLine;
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      lines.splice(endIndex, 0, valueLine);
    }
  }

  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

async function runHermesInstanceCommand(instance, args, { timeoutMs = DEFAULT_TIMEOUT_MS, hermesHomeOverride, cwdOverride } = {}) {
  const hermesBinary = resolveHermesBinary();
  const effectiveHermesHome = normalizeText(hermesHomeOverride) || instance.hermesHome;
  const cwd = normalizeText(cwdOverride) || instance.workspaceDir || instance.hermesHome;

  if (isRemoteDockerInstance(instance) && !normalizeText(hermesHomeOverride)) {
    const result = await runRemoteDockerHermesCommand(instance, args, { timeoutMs, cwd });
    if (!result.ok || !result.data) {
      return toDesktopError(
        result.error?.code ?? "REMOTE_DOCKER_HERMES_COMMAND_FAILED",
        result.error?.message ?? "远程 Docker Hermes CLI 执行失败。",
        result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
        result.error?.recoverable ?? true
      );
    }

    return {
      ok: true,
      data: {
        exitCode: result.data.exitCode,
        stdout: result.data.stdout ?? "",
        stderr: result.data.stderr ?? "",
      },
    };
  }

  if (instance.type === "remote") {
    const connection = buildRemoteConnection(instance);
    if (!connection) {
      return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
    }

    const remoteCommand = [
      `cd ${shellEscape(cwd)} 2>/dev/null || cd ${shellEscape(instance.hermesHome)}`,
      `HERMES_HOME=${shellEscape(effectiveHermesHome)} hermes ${args.map((arg) => shellEscape(arg)).join(" ")}`,
    ].join(" && ");

    const result = await runSshCommand(connection, remoteCommand, { timeoutMs });

    if (!result.ok || !result.data) {
      return toDesktopError(
        result.error?.code ?? "REMOTE_HERMES_COMMAND_FAILED",
        result.error?.message ?? "远程 Hermes CLI 执行失败。",
        result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
        result.error?.recoverable ?? true
      );
    }

    return {
      ok: true,
      data: {
        exitCode: result.data.exitCode,
        stdout: result.data.stdout ?? "",
        stderr: result.data.stderr ?? "",
      },
    };
  }

  const result = await runLocalProcess(hermesBinary, args, {
    cwd,
    timeoutMs,
    env: {
      ...process.env,
      HERMES_HOME: effectiveHermesHome,
    },
  });

  if (!result.ok) {
    return toDesktopError(
      "LOCAL_HERMES_COMMAND_FAILED",
      "本地 Hermes CLI 执行失败。",
      parseCommandDetail(result.stdout, result.stderr) || `exitCode=${result.exitCode}`,
      true
    );
  }

  return {
    ok: true,
    data: {
      exitCode: result.exitCode,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    },
  };
}

async function readRemoteTextFile(instance, targetPath) {
  if (isRemoteDockerInstance(instance)) {
    return readRemoteDockerTextFile(instance, targetPath);
  }

  const connection = buildRemoteConnection(instance);
  if (!connection) {
    return "";
  }

  const result = await runSshCommand(connection, `if [ -f ${shellEscape(targetPath)} ]; then cat ${shellEscape(targetPath)}; fi`, {
    timeoutMs: 15_000,
  });

  return result.ok ? result.data?.stdout ?? "" : "";
}

async function writeRemoteTextFile(instance, targetPath, content) {
  if (isRemoteDockerInstance(instance)) {
    return writeRemoteDockerTextFile(instance, targetPath, content);
  }

  const connection = buildRemoteConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance.id}`, true);
  }

  const encodedPath = Buffer.from(targetPath, "utf8").toString("base64");
  const encodedContent = Buffer.from(content, "utf8").toString("base64");
  const command = `
PATH_B64=${shellEscape(encodedPath)} CONTENT_B64=${shellEscape(encodedContent)} python3 - <<'PY'
import base64, pathlib, os
target = pathlib.Path(base64.b64decode(os.environ["PATH_B64"]).decode("utf-8"))
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(base64.b64decode(os.environ["CONTENT_B64"]).decode("utf-8"), encoding="utf-8")
PY
`.trim();

  const result = await runSshCommand(connection, command, { timeoutMs: 15_000 });
  if (!result.ok) {
    return toDesktopError(
      result.error?.code ?? "REMOTE_ENV_WRITE_FAILED",
      result.error?.message ?? "写入远程 profile .env 失败。",
      result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
      result.error?.recoverable ?? true
    );
  }

  return {
    ok: true,
    data: {
      path: targetPath,
    },
  };
}

async function applyRemoteDockerConfigEntries(instance, profileId, entries) {
  const profileHome = resolveProfileHome(instance, profileId);
  const configPath = path.posix.join(profileHome, "config.yaml");
  const currentText = await readRemoteDockerTextFile(instance, configPath);
  const nextText = upsertSimpleYamlEntries(currentText, entries);
  const writeResult = await writeRemoteDockerTextFile(instance, configPath, nextText);
  if (!writeResult.ok) {
    return writeResult;
  }

  return {
    ok: true,
    data: {
      path: configPath,
      containerPath: writeResult.data?.containerPath,
      updatedKeys: entries.map((entry) => entry.key),
    },
  };
}

async function writeProfileEnvEntries(instance, profileId, entries) {
  const normalizedEntries = entries
    .map((entry) => ({
      key: normalizeText(entry?.key),
      value: normalizeConfigValue(entry?.value),
    }))
    .filter((entry) => entry.key);

  if (normalizedEntries.length === 0) {
    return {
      ok: true,
      data: {
        updatedKeys: [],
      },
    };
  }

  const profileHome = resolveProfileHome(instance, profileId);
  const envPath = instance.type === "remote"
    ? path.posix.join(profileHome, ".env")
    : path.join(profileHome, ".env");
  const currentText = instance.type === "remote"
    ? await readRemoteTextFile(instance, envPath)
    : await fs.readFile(envPath, "utf8").catch(() => "");
  const nextText = upsertEnvText(currentText, normalizedEntries);

  if (instance.type === "remote") {
    const writeResult = await writeRemoteTextFile(instance, envPath, nextText);
    if (!writeResult.ok) {
      return writeResult;
    }
  } else {
    await fs.mkdir(path.dirname(envPath), { recursive: true });
    await fs.writeFile(envPath, nextText, "utf8");
  }

  return {
    ok: true,
    data: {
      updatedKeys: normalizedEntries.map((entry) => entry.key),
    },
  };
}

async function writeWeixinAccountCredentialFile(instance, profileId, credentials) {
  const accountId = normalizeText(credentials.accountId);
  const token = normalizeText(credentials.token);
  if (!accountId || !token) {
    return toDesktopError(
      "WEIXIN_ACCOUNT_FILE_CREDENTIALS_MISSING",
      "微信扫码凭据不完整，无法写入账号文件。",
      `accountId=${Boolean(accountId)} token=${Boolean(token)}`,
      true
    );
  }

  const profileHome = resolveProfileHome(instance, profileId);
  const accountDir = instance.type === "remote"
    ? path.posix.join(profileHome, "weixin", "accounts")
    : path.join(profileHome, "weixin", "accounts");
  const accountPath = instance.type === "remote"
    ? path.posix.join(accountDir, `${accountId}.json`)
    : path.join(accountDir, `${accountId}.json`);
  const payload = `${JSON.stringify(
    {
      token,
      base_url: normalizeText(credentials.baseUrl) || WEIXIN_ILINK_BASE_URL,
      user_id: normalizeText(credentials.userId),
      saved_at: nowIso().replace(/\.\d{3}Z$/, "Z"),
    },
    null,
    2
  )}\n`;

  if (instance.type === "remote") {
    const writeResult = await writeRemoteTextFile(instance, accountPath, payload);
    if (!writeResult.ok) {
      return writeResult;
    }

    const connection = buildRemoteConnection(instance);
    if (connection) {
      await runSshCommand(connection, `chmod 600 ${shellEscape(accountPath)}`, { timeoutMs: 10_000 }).catch(() => {});
    }

    return {
      ok: true,
      data: {
        path: accountPath,
      },
    };
  }

  await fs.mkdir(accountDir, { recursive: true });
  await fs.writeFile(accountPath, payload, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(accountPath, 0o600).catch(() => {});

  return {
    ok: true,
    data: {
      path: accountPath,
    },
  };
}

async function syncDefaultProviderRegistry(userDataPath, instance, profileId, providerId, defaultModel) {
  if (profileId !== "default") {
    return {
      ok: true,
      data: {
        synced: false,
      },
    };
  }

  const result = await upsertRegisteredInstance(userDataPath, {
    ...instance,
    providerId,
    model: defaultModel,
    lastCheckedAt: nowIso(),
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      synced: true,
    },
  };
}

async function applyConfigEntries(instance, profileId, entries) {
  const normalizedEntries = entries
    .map((entry) => ({
      key: normalizeText(entry?.key),
      value: normalizeConfigValue(entry?.value),
    }))
    .filter((entry) => entry.key);

  if (normalizedEntries.length === 0) {
    return {
      ok: true,
      data: {
        updatedKeys: [],
      },
    };
  }

  if (isRemoteDockerInstance(instance)) {
    return applyRemoteDockerConfigEntries(instance, profileId, normalizedEntries);
  }

  for (const entry of normalizedEntries) {
    const args = buildProfileScopedArgs(profileId, ["config", "set", entry.key, entry.value]);
    const result = await runHermesInstanceCommand(instance, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
    if (!result.ok) {
      return result;
    }
  }

  return {
    ok: true,
    data: {
      updatedKeys: normalizedEntries.map((entry) => entry.key),
    },
  };
}

function buildDefaultExportPath(instance, profileName, outputPath = "") {
  const normalizedOutput = normalizeText(outputPath);
  if (normalizedOutput) {
    return normalizedOutput;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${profileName}-${stamp}.tar.gz`;

  if (instance.type === "remote") {
    return path.posix.join(instance.workspaceDir, "backups", fileName);
  }

  return path.join(instance.workspaceDir, "backups", fileName);
}

function extractProfileActionPayload(stdout, extra = {}) {
  return {
    message: String(stdout || "").trim(),
    ...extra,
  };
}

async function importLocalProfileViaStaging(instance, archivePath, profileName) {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-profile-import-"));
  const stagingHome = path.join(stagingRoot, "home");
  let importedProfileId = normalizeText(profileName);

  try {
    await fs.mkdir(stagingHome, { recursive: true });

    const args = ["profile", "import", archivePath];
    if (importedProfileId) {
      args.push("--name", importedProfileId);
    }

    const result = await runHermesInstanceCommand(instance, args, {
      timeoutMs: PROFILE_TIMEOUT_MS,
      hermesHomeOverride: stagingHome,
    });

    if (!result.ok || !result.data) {
      return result;
    }

    importedProfileId =
      importedProfileId ||
      parseImportedProfileId(result.data.stdout) ||
      parseImportedProfileMarker([result.data.stdout, result.data.stderr].filter(Boolean).join("\n"));

    if (!importedProfileId) {
      const entries = await fs.readdir(path.join(stagingHome, "profiles"), { withFileTypes: true }).catch(() => []);
      const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      if (directories.length === 1) {
        importedProfileId = directories[0];
      }
    }

    if (!importedProfileId) {
      return toDesktopError(
        "PROFILE_IMPORT_NAME_UNRESOLVED",
        "无法确定导入后的档案名称。",
        result.data.stdout || result.data.stderr || "导入完成后未识别到 staging profile。",
        true
      );
    }

    const sourcePath = path.join(stagingHome, "profiles", importedProfileId);
    const targetPath = path.join(instance.hermesHome, "profiles", importedProfileId);

    if (!(await fileExists(sourcePath))) {
      return toDesktopError(
        "PROFILE_IMPORT_SOURCE_MISSING",
        "暂存导入结果不完整。",
        `未找到 ${sourcePath}。`,
        true
      );
    }

    if (await fileExists(targetPath)) {
      return toDesktopError(
        "PROFILE_ALREADY_EXISTS",
        "目标档案已存在。",
        `档案 ${importedProfileId} 已存在于 ${targetPath}。`,
        true
      );
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true });
    await cleanupProfileAlias(instance, importedProfileId);

    return {
      ok: true,
      data: extractProfileActionPayload(result.data.stdout, {
        profileId: importedProfileId,
        archivePath,
      }),
    };
  } finally {
    if (importedProfileId) {
      await cleanupProfileAlias(instance, importedProfileId).catch(() => {});
    }
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }
}

function buildRemoteStagedImportScript(instance, archivePath, profileName) {
  const preferredProfileId = normalizeText(profileName);
  const targetProfilesRoot = path.posix.join(instance.hermesHome, "profiles");
  const importArgs = ["profile", "import", archivePath];
  if (preferredProfileId) {
    importArgs.push("--name", preferredProfileId);
  }

  return `
set -eu
TMP_ROOT=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT
STAGING_HOME="$TMP_ROOT/home"
mkdir -p "$STAGING_HOME"
HERMES_HOME="$STAGING_HOME" hermes ${importArgs.map((arg) => shellEscape(arg)).join(" ")}
IMPORTED_PROFILE=${preferredProfileId ? shellEscape(preferredProfileId) : "\"\""}
if [ -z "$IMPORTED_PROFILE" ]; then
  IMPORTED_PROFILE=$(find "$STAGING_HOME/profiles" -mindepth 1 -maxdepth 1 -type d -exec basename {} \\; | head -n 1)
fi
printf '%s%s\\n' ${shellEscape(IMPORTED_PROFILE_MARKER)} "$IMPORTED_PROFILE"
if [ -z "$IMPORTED_PROFILE" ]; then
  echo "No imported profile found in staging home." >&2
  exit 91
fi
TARGET_DIR=${shellEscape(targetProfilesRoot)}/"$IMPORTED_PROFILE"
if [ -e "$TARGET_DIR" ]; then
  echo "Target profile already exists: $TARGET_DIR" >&2
  exit 92
fi
mkdir -p ${shellEscape(targetProfilesRoot)}
cp -R "$STAGING_HOME/profiles/$IMPORTED_PROFILE" "$TARGET_DIR"
`.trim();
}

export async function createInstanceProfile(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileName = normalizeText(input.name);
  if (!profileName) {
    return toDesktopError("PROFILE_NAME_REQUIRED", "档案名称不能为空。", "请先填写档案名称。", true);
  }

  const cloneSource = normalizeText(input.cloneFrom);
  const args = ["profile", "create", profileName, "--no-alias"];
  if (cloneSource) {
    args.push(input.cloneAll ? "--clone-all" : "--clone", "--clone-from", cloneSource);
  } else if (input.cloneAll) {
    args.push("--clone-all");
  } else if (input.clone) {
    args.push("--clone");
  }

  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PROFILE_TIMEOUT_MS });
  if (!result.ok || !result.data) {
    return result;
  }

  return {
    ok: true,
    data: extractProfileActionPayload(result.data.stdout, {
      profileId: profileName,
    }),
  };
}

export async function renameInstanceProfile(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileId = normalizeText(input.profileId);
  const nextName = normalizeText(input.nextName);
  if (!profileId || !nextName) {
    return toDesktopError("PROFILE_RENAME_REQUIRED", "缺少档案重命名所需参数。", "请提供当前档案名和新档案名。", true);
  }

  const args = ["profile", "rename", profileId, nextName];
  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PROFILE_TIMEOUT_MS });
  if (!result.ok || !result.data) {
    return result;
  }

  await cleanupProfileAlias(instanceResult.data.instance, profileId);
  await cleanupProfileAlias(instanceResult.data.instance, nextName);

  return {
    ok: true,
    data: extractProfileActionPayload(result.data.stdout, {
      profileId: nextName,
      previousProfileId: profileId,
    }),
  };
}

export async function setDefaultInstanceProfile(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileId = normalizeText(input.profileId) || "default";
  const args = ["profile", "use", profileId];
  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PROFILE_TIMEOUT_MS });
  if (!result.ok || !result.data) {
    return result;
  }

  return {
    ok: true,
    data: extractProfileActionPayload(result.data.stdout, {
      profileId,
    }),
  };
}

export async function deleteInstanceProfile(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileId = normalizeText(input.profileId);
  if (!profileId || profileId === "default") {
    return toDesktopError("PROFILE_DELETE_NOT_ALLOWED", "默认档案不能在这里删除。", "请选择一个非默认档案后再删除。", true);
  }

  const args = ["profile", "delete", profileId, "-y"];
  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PROFILE_TIMEOUT_MS });
  if (!result.ok || !result.data) {
    return result;
  }

  return {
    ok: true,
    data: extractProfileActionPayload(result.data.stdout, {
      profileId,
    }),
  };
}

export async function exportInstanceProfile(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileId = normalizeText(input.profileId) || "default";
  const outputPath = buildDefaultExportPath(instanceResult.data.instance, profileId, input.outputPath);
  const args = ["profile", "export", profileId, "-o", outputPath];
  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PROFILE_TIMEOUT_MS });
  if (!result.ok || !result.data) {
    return result;
  }

  return {
    ok: true,
    data: extractProfileActionPayload(result.data.stdout, {
      profileId,
      outputPath: parseOutputPath(result.data.stdout) || outputPath,
    }),
  };
}

export async function importInstanceProfile(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const archivePath = normalizeText(input.archivePath);
  const profileName = normalizeText(input.profileName);
  if (!archivePath) {
    return toDesktopError("PROFILE_ARCHIVE_REQUIRED", "缺少档案归档路径。", "请先填写要导入的 .tar.gz 归档路径。", true);
  }

  if (instanceResult.data.instance.type === "local") {
    return importLocalProfileViaStaging(instanceResult.data.instance, archivePath, profileName);
  }

  const connection = buildRemoteConnection(instanceResult.data.instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instanceId}`, true);
  }

  const result = await runSshCommand(
    connection,
    buildRemoteStagedImportScript(instanceResult.data.instance, archivePath, profileName),
    { timeoutMs: PROFILE_TIMEOUT_MS }
  );

  const remoteOutput = [result.data?.stdout, result.data?.stderr].filter(Boolean).join("\n");
  const importedProfileId =
    profileName ||
    parseImportedProfileMarker(remoteOutput) ||
    parseImportedProfileId(result.data?.stdout || "");

  if (importedProfileId) {
    await cleanupProfileAlias(instanceResult.data.instance, importedProfileId).catch(() => {});
  }

  if (!result.ok || !result.data) {
    return toDesktopError(
      result.error?.code ?? "REMOTE_HERMES_COMMAND_FAILED",
      result.error?.message ?? "远程 Hermes CLI 执行失败。",
      result.error?.detail ?? remoteOutput,
      result.error?.recoverable ?? true
    );
  }

  if (!importedProfileId) {
    return toDesktopError(
      "PROFILE_IMPORT_NAME_UNRESOLVED",
      "无法确定导入后的档案名称。",
      remoteOutput || "远程导入完成后未识别到 staging profile。",
      true
    );
  }

  return {
    ok: true,
    data: extractProfileActionPayload(result.data.stdout, {
      profileId: importedProfileId,
      archivePath,
    }),
  };
}

export async function updateInstanceProviderConfig(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const providerId = normalizeProviderId(input.providerId);
  const profileId = normalizeText(input.profileId) || "default";
  const defaultModel = normalizeText(input.defaultModel);

  if (!providerId) {
    return toDesktopError("PROVIDER_REQUIRED", "缺少 provider。", "请先选择要保存的 provider。", true);
  }

  if (providerId !== "auto" && !defaultModel) {
    return toDesktopError("PROVIDER_MODEL_REQUIRED", "缺少默认模型。", "请选择或手动输入该 provider 要写入 model.default 的模型名称。", true);
  }

  if (providerId === "custom" && !normalizeText(input.baseUrl)) {
    return toDesktopError("CUSTOM_ENDPOINT_REQUIRED", "缺少自定义 Endpoint。", "Custom Endpoint 需要先填写 model.base_url。", true);
  }

  const entries = [
    { key: "model.provider", value: providerId },
    { key: "model.default", value: defaultModel },
  ];
  const envEntries = Object.entries(input.env ?? {})
    .map(([key, value]) => ({ key, value }))
    .filter((entry) => normalizeText(entry.key));

  if (providerId === "xiaomi") {
    ensureXiaomiTokenPlanBaseUrl(envEntries);
  }

  if ("baseUrl" in input) {
    entries.push({ key: "model.base_url", value: normalizeConfigValue(input.baseUrl) });
  }

  if ("apiMode" in input) {
    entries.push({ key: "model.api_mode", value: normalizeConfigValue(input.apiMode) });
  }

  if ("apiKey" in input) {
    entries.push({ key: "model.api_key", value: normalizeConfigValue(input.apiKey) });
  }

  if (providerId !== "custom" && !("baseUrl" in input)) {
    entries.push({ key: "model.base_url", value: "" });
    entries.push({ key: "model.api_key", value: "" });
  }

  const writeResult = await applyConfigEntries(instanceResult.data.instance, profileId, entries);
  if (!writeResult.ok) {
    return writeResult;
  }

  const envWriteResult = await writeProfileEnvEntries(instanceResult.data.instance, profileId, envEntries);
  if (!envWriteResult.ok) {
    return envWriteResult;
  }

  const registrySyncResult = await syncDefaultProviderRegistry(userDataPath, instanceResult.data.instance, profileId, providerId, defaultModel);
  if (!registrySyncResult.ok) {
    return registrySyncResult;
  }

  const refreshed = await getInstanceOfficialState(userDataPath, instanceId, { profileId });
  if (!refreshed.ok || !refreshed.data) {
    return refreshed;
  }

  return {
    ok: true,
    data: {
      message: `已保存 ${profileId === "default" ? "默认档案" : profileId} 的 provider 配置。`,
      profileId,
      updatedKeys: [...(writeResult.data?.updatedKeys ?? []), ...(envWriteResult.data?.updatedKeys ?? [])],
      state: refreshed.data,
    },
  };
}

export async function authenticateInstanceProvider(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const providerId = normalizeProviderId(input.providerId);
  const profileId = normalizeText(input.profileId) || "default";
  const authType = normalizeText(input.authType) || "oauth";

  if (!providerId) {
    return toDesktopError("PROVIDER_REQUIRED", "缺少 provider。", "请先选择要登录的 provider。", true);
  }

  if (authType !== "oauth") {
    return toDesktopError("PROVIDER_AUTH_TYPE_UNSUPPORTED", "暂不支持该认证方式。", `authType=${authType}`, true);
  }

  const commandArgs = ["auth", "add", providerId, "--type", "oauth"];
  const args = buildProfileScopedArgs(profileId, commandArgs);
  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PROVIDER_AUTH_TIMEOUT_MS });

  if (!result.ok || !result.data) {
    return result;
  }

  const refreshed = await getInstanceOfficialState(userDataPath, instanceId, { profileId });
  if (!refreshed.ok || !refreshed.data) {
    return refreshed;
  }

  const output = parseCommandDetail(result.data.stdout, result.data.stderr);

  return {
    ok: true,
    data: {
      message: `已完成 ${providerId} OAuth 登录流程。`,
      profileId,
      providerId,
      command: args,
      output,
      state: refreshed.data,
    },
  };
}

export async function approveInstanceMessagingPairing(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileId = normalizeText(input.profileId) || "default";
  const platformId = normalizePairingPlatformId(input.platformId || input.integrationId);
  const pairingCode = normalizePairingCode(input.code || input.pairingCode);

  if (!platformId) {
    return toDesktopError(
      "PAIRING_PLATFORM_UNSUPPORTED",
      "当前消息平台暂不支持客户端配对审批。",
      "目前支持微信 weixin 与 QQ Bot qqbot。",
      true
    );
  }

  if (!/^[A-Z0-9_-]{4,64}$/.test(pairingCode)) {
    return toDesktopError(
      "PAIRING_CODE_INVALID",
      "配对码格式不正确。",
      "请复制微信或 QQ Bot 返回的 pairing code，只粘贴中间那串字符。",
      true
    );
  }

  const args = buildProfileScopedArgs(profileId, ["pairing", "approve", platformId, pairingCode]);
  const result = await runHermesInstanceCommand(instanceResult.data.instance, args, { timeoutMs: PAIRING_APPROVE_TIMEOUT_MS });

  if (!result.ok || !result.data) {
    return result;
  }

  const output = parseCommandDetail(result.data.stdout, result.data.stderr);
  if (/not found or expired|No pending pairing requests/i.test(output)) {
    return toDesktopError(
      "PAIRING_CODE_EXPIRED",
      "配对码无效或已过期。",
      "请在微信或 QQ 里重新给机器人发送一条消息，复制最新 pairing code 后再点批准配对。",
      true
    );
  }

  const refreshed = await getInstanceOfficialState(userDataPath, instanceId, { profileId });
  if (!refreshed.ok || !refreshed.data) {
    return refreshed;
  }

  const platformLabel = getPairingPlatformLabel(platformId);
  return {
    ok: true,
    data: {
      message: `已批准 ${platformLabel} 配对码。下一条消息会自动识别该用户。`,
      profileId,
      integrationId: platformId === "qqbot" ? "qq" : platformId,
      platformId,
      pairingCode,
      output,
      state: refreshed.data,
    },
  };
}

export async function startInstanceWeixinQrLogin(userDataPath, instanceId, input = {}) {
  cleanupWeixinQrSessions();

  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const profileId = normalizeText(input.profileId) || "default";

  try {
    const qrResp = await fetchWeixinIlinkJson(WEIXIN_ILINK_BASE_URL, "ilink/bot/get_bot_qrcode?bot_type=3");
    const qrcodeValue = normalizeText(qrResp.qrcode);
    const qrcodeUrl = normalizeText(qrResp.qrcode_img_content) || qrcodeValue;

    if (!qrcodeValue || !qrcodeUrl) {
      return toDesktopError(
        "WEIXIN_QR_MISSING",
        "微信二维码生成失败。",
        "iLink 返回内容缺少 qrcode 或 qrcode_img_content。",
        true
      );
    }

    const requestId = crypto.randomUUID();
    const expiresAtMs = Date.now() + WEIXIN_QR_SESSION_TTL_MS;
    WEIXIN_QR_SESSIONS.set(requestId, {
      instanceId,
      profileId,
      instance: instanceResult.data.instance,
      qrcodeValue,
      qrcodeUrl,
      currentBaseUrl: WEIXIN_ILINK_BASE_URL,
      expiresAt: expiresAtMs,
    });

    return {
      ok: true,
      data: {
        requestId,
        qrcodeUrl,
        expiresAt: new Date(expiresAtMs).toISOString(),
        status: "waiting",
        message: "微信二维码已生成，请使用微信扫码确认。",
      },
    };
  } catch (error) {
    return toDesktopError(
      "WEIXIN_QR_START_FAILED",
      "微信二维码生成失败。",
      error instanceof Error ? error.message : String(error),
      true
    );
  }
}

export async function pollInstanceWeixinQrLogin(userDataPath, instanceId, input = {}) {
  cleanupWeixinQrSessions();

  const requestId = normalizeText(input.requestId);
  const session = requestId ? WEIXIN_QR_SESSIONS.get(requestId) : null;
  if (!session || session.instanceId !== instanceId) {
    return {
      ok: true,
      data: {
        status: "expired",
        message: "二维码已过期，请重新生成。",
      },
    };
  }

  try {
    const statusResp = await fetchWeixinIlinkJson(
      session.currentBaseUrl,
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(session.qrcodeValue)}`
    );
    const status = normalizeText(statusResp.status) || "wait";

    if (status === "wait") {
      return {
        ok: true,
        data: {
          status: "waiting",
          message: "等待微信扫码…",
        },
      };
    }

    if (status === "scaned") {
      return {
        ok: true,
        data: {
          status: "scanned",
          message: "已扫码，请在微信里确认。",
        },
      };
    }

    if (status === "scaned_but_redirect") {
      const redirectHost = normalizeText(statusResp.redirect_host);
      if (redirectHost) {
        session.currentBaseUrl = `https://${redirectHost}`;
      }
      return {
        ok: true,
        data: {
          status: "scanned",
          message: "已扫码，请在微信里确认。",
        },
      };
    }

    if (status === "expired") {
      WEIXIN_QR_SESSIONS.delete(requestId);
      return {
        ok: true,
        data: {
          status: "expired",
          message: "二维码已过期，请重新生成。",
        },
      };
    }

    if (status !== "confirmed") {
      return {
        ok: true,
        data: {
          status: "waiting",
          message: `等待微信确认（${status}）…`,
        },
      };
    }

    const accountId = normalizeText(statusResp.ilink_bot_id);
    const token = normalizeText(statusResp.bot_token);
    const baseUrl = normalizeText(statusResp.baseurl) || session.currentBaseUrl || WEIXIN_ILINK_BASE_URL;
    const userId = normalizeText(statusResp.ilink_user_id);

    if (!accountId || !token) {
      return toDesktopError(
        "WEIXIN_QR_CREDENTIALS_MISSING",
        "微信扫码已确认，但返回凭据不完整。",
        JSON.stringify({ hasAccountId: Boolean(accountId), hasToken: Boolean(token) }),
        true
      );
    }

    const envEntries = [
      { key: "WEIXIN_ACCOUNT_ID", value: accountId },
      { key: "WEIXIN_TOKEN", value: token },
      { key: "WEIXIN_BASE_URL", value: baseUrl },
      { key: "WEIXIN_CDN_BASE_URL", value: WEIXIN_CDN_BASE_URL },
      { key: "WEIXIN_DM_POLICY", value: "pairing" },
      { key: "WEIXIN_ALLOW_ALL_USERS", value: "false" },
      { key: "WEIXIN_GROUP_POLICY", value: "disabled" },
      { key: "WEIXIN_GROUP_ALLOWED_USERS", value: "" },
    ];
    if (userId) {
      envEntries.push({ key: "WEIXIN_HOME_CHANNEL", value: userId });
    }

    const envWriteResult = await writeProfileEnvEntries(session.instance, session.profileId, envEntries);
    if (!envWriteResult.ok) {
      return envWriteResult;
    }

    const accountWriteResult = await writeWeixinAccountCredentialFile(session.instance, session.profileId, {
      accountId,
      token,
      baseUrl,
      userId,
    });
    if (!accountWriteResult.ok) {
      return accountWriteResult;
    }

    WEIXIN_QR_SESSIONS.delete(requestId);

    const restartResult = await restartInstanceGateway(userDataPath, instanceId);
    if (!restartResult.ok) {
      return restartResult;
    }

    const refreshed = await getInstanceOfficialState(userDataPath, instanceId, { profileId: session.profileId });
    if (!refreshed.ok || !refreshed.data) {
      return refreshed;
    }

    return {
      ok: true,
      data: {
        status: "confirmed",
        message: "已自动保存微信凭据并重启消息平台。",
        profileId: session.profileId,
        accountId,
        userId,
        updatedKeys: envWriteResult.data?.updatedKeys ?? [],
        accountPath: accountWriteResult.data?.path,
        state: refreshed.data,
      },
    };
  } catch (error) {
    return toDesktopError(
      "WEIXIN_QR_POLL_FAILED",
      "读取微信扫码状态失败。",
      error instanceof Error ? error.message : String(error),
      true
    );
  }
}

export async function cancelInstanceWeixinQrLogin(_userDataPath, _instanceId, input = {}) {
  const requestId = normalizeText(input.requestId);
  if (requestId) {
    WEIXIN_QR_SESSIONS.delete(requestId);
  }

  return {
    ok: true,
    data: {
      status: "cancelled",
      message: "已取消微信扫码配置。",
    },
  };
}

export async function updateInstanceIntegrationConfig(userDataPath, instanceId, input = {}) {
  const instanceResult = await getManagedInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return instanceResult;
  }

  const integrationId = normalizeText(input.integrationId);
  const profileId = normalizeText(input.profileId) || "default";
  if (!integrationId) {
    return toDesktopError("INTEGRATION_REQUIRED", "缺少集成 ID。", "请先选择要保存的集成。", true);
  }

  const envEntries = [];
  const configEntries = [];

  for (const [key, value] of Object.entries(input.fields ?? {})) {
    envEntries.push({ key, value });
  }

  if ("pluginsEnabled" in input) {
    configEntries.push({ key: "plugins.enabled", value: Boolean(input.pluginsEnabled) });
  }

  if ("apiServerEnabled" in input) {
    envEntries.push({ key: "API_SERVER_ENABLED", value: Boolean(input.apiServerEnabled) });
  }

  const envWriteResult = await writeProfileEnvEntries(instanceResult.data.instance, profileId, envEntries);
  if (!envWriteResult.ok) {
    return envWriteResult;
  }

  const configWriteResult = configEntries.length > 0
    ? await applyConfigEntries(instanceResult.data.instance, profileId, configEntries)
    : { ok: true, data: { updatedKeys: [] } };
  if (!configWriteResult.ok) {
    return configWriteResult;
  }

  const refreshed = await getInstanceOfficialState(userDataPath, instanceId, { profileId });
  if (!refreshed.ok || !refreshed.data) {
    return refreshed;
  }

  return {
    ok: true,
    data: {
      message: `已保存 ${profileId === "default" ? "默认档案" : profileId} 的 ${integrationId} 配置。`,
      profileId,
      integrationId,
      updatedKeys: [
        ...(envWriteResult.data?.updatedKeys ?? []),
        ...(configWriteResult.data?.updatedKeys ?? []),
      ],
      state: refreshed.data,
    },
  };
}

export async function startInstanceGateway(userDataPath, instanceId) {
  return startInstance(userDataPath, instanceId);
}

export async function stopInstanceGateway(userDataPath, instanceId) {
  return stopInstance(userDataPath, instanceId);
}

export async function restartInstanceGateway(userDataPath, instanceId) {
  const stopResult = await stopInstance(userDataPath, instanceId);
  if (!stopResult.ok) {
    const detail = stopResult.error?.detail ?? "";
    const containerMissing = /No such container|is not running|not found/i.test(detail);
    if (!containerMissing) {
      return stopResult;
    }
  }

  const startResult = await startInstance(userDataPath, instanceId);
  if (!startResult.ok) {
    return startResult;
  }

  const registryResult = await getRegisteredInstance(userDataPath, instanceId);
  if (registryResult.ok && registryResult.data?.instance) {
    await upsertRegisteredInstance(userDataPath, {
      ...registryResult.data.instance,
      lastOperationAt: new Date().toISOString(),
      lastOperationType: "gateway-restart",
      lastOperationResult: "Gateway 已触发重启，最新节点状态已重新读取。",
    });
  }

  return getInstanceState(userDataPath, instanceId);
}
