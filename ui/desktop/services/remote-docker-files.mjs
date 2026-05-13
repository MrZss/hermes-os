import path from "node:path";
import { runSshCommand } from "./ssh-runtime.mjs";

const DEFAULT_TIMEOUT_MS = 15_000;
const REMOTE_DOCKER_DATA_ROOT = "/opt/data";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
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

function normalizePosixAbsolute(inputPath) {
  const normalized = normalizeText(inputPath);
  if (!normalized.startsWith("/")) return "";
  return path.posix.normalize(normalized);
}

function dockerBinaryBootstrap() {
  return `
if command -v docker >/dev/null 2>&1; then
  DOCKER_BIN="$(command -v docker)"
elif [ -x /usr/local/bin/docker ]; then
  DOCKER_BIN="/usr/local/bin/docker"
elif [ -x /var/packages/ContainerManager/target/usr/bin/docker ]; then
  DOCKER_BIN="/var/packages/ContainerManager/target/usr/bin/docker"
elif [ -x /var/packages/Docker/target/usr/bin/docker ]; then
  DOCKER_BIN="/var/packages/Docker/target/usr/bin/docker"
else
  DOCKER_BIN="docker"
fi
`.trim();
}

export function isRemoteDockerInstance(instance) {
  return Boolean(
    instance
      && instance.type === "remote"
      && instance.runtime === "docker"
      && normalizeText(instance.docker?.containerName)
  );
}

export function mapRemoteDockerDataPath(instance, targetPath) {
  if (!isRemoteDockerInstance(instance)) return null;

  const normalizedTarget = normalizePosixAbsolute(targetPath);
  if (!normalizedTarget) return null;

  if (normalizedTarget === REMOTE_DOCKER_DATA_ROOT || normalizedTarget.startsWith(`${REMOTE_DOCKER_DATA_ROOT}/`)) {
    return normalizedTarget;
  }

  const hermesHome = normalizePosixAbsolute(instance.hermesHome);
  if (!hermesHome) return null;

  const relativePath = path.posix.relative(hermesHome, normalizedTarget);
  if (relativePath === "") {
    return REMOTE_DOCKER_DATA_ROOT;
  }

  if (relativePath.startsWith("..") || path.posix.isAbsolute(relativePath)) {
    return null;
  }

  return path.posix.join(REMOTE_DOCKER_DATA_ROOT, relativePath);
}

async function runRemoteDockerShell(instance, dockerArgs, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const connection = buildRemoteConnection(instance);
  if (!connection) {
    return toDesktopError("REMOTE_CONNECTION_MISSING", "远程实例缺少 SSH 连接元数据。", `instanceId=${instance?.id ?? "unknown"}`, true);
  }

  if (!isRemoteDockerInstance(instance)) {
    return toDesktopError("REMOTE_DOCKER_INSTANCE_REQUIRED", "当前实例不是远程 Docker 实例。", `instanceId=${instance?.id ?? "unknown"}`, true);
  }

  const containerName = normalizeText(instance.docker?.containerName);
  const command = `
set -u
${dockerBinaryBootstrap()}
CONTAINER=${shellEscape(containerName)}
"$DOCKER_BIN" ${dockerArgs}
`.trim();

  return runSshCommand(connection, command, { timeoutMs });
}

export async function remoteDockerFileExists(instance, targetPath) {
  const containerPath = mapRemoteDockerDataPath(instance, targetPath);
  if (!containerPath) return false;

  const result = await runRemoteDockerShell(
    instance,
    `exec "$CONTAINER" sh -lc ${shellEscape('if [ -e "$1" ]; then printf 1; else printf 0; fi')} sh ${shellEscape(containerPath)}`,
    { timeoutMs: 8_000 }
  );

  return Boolean(result.ok && result.data?.stdout.trim() === "1");
}

export async function readRemoteDockerTextFile(instance, targetPath) {
  const containerPath = mapRemoteDockerDataPath(instance, targetPath);
  if (!containerPath) return "";

  const result = await runRemoteDockerShell(
    instance,
    `exec "$CONTAINER" sh -lc ${shellEscape('if [ -f "$1" ]; then cat "$1"; fi')} sh ${shellEscape(containerPath)}`,
    { timeoutMs: DEFAULT_TIMEOUT_MS }
  );

  return result.ok ? result.data?.stdout ?? "" : "";
}

export async function writeRemoteDockerTextFile(instance, targetPath, content) {
  const containerPath = mapRemoteDockerDataPath(instance, targetPath);
  if (!containerPath) {
    return toDesktopError("REMOTE_DOCKER_PATH_UNMAPPED", "远程 Docker 文件路径无法映射。", `targetPath=${targetPath}`, true);
  }

  const encodedPath = Buffer.from(containerPath, "utf8").toString("base64");
  const encodedContent = Buffer.from(String(content ?? ""), "utf8").toString("base64");
  const python = [
    "import base64, os, pathlib",
    "target = pathlib.Path(base64.b64decode(os.environ['TARGET_B64']).decode('utf-8'))",
    "target.parent.mkdir(parents=True, exist_ok=True)",
    "target.write_text(base64.b64decode(os.environ['CONTENT_B64']).decode('utf-8'), encoding='utf-8')",
  ].join("; ");

  const result = await runRemoteDockerShell(
    instance,
    [
      "exec",
      "-u hermes",
      `-e HOME=${shellEscape(path.posix.join(REMOTE_DOCKER_DATA_ROOT, "home"))}`,
      `-e TARGET_B64=${shellEscape(encodedPath)}`,
      `-e CONTENT_B64=${shellEscape(encodedContent)}`,
      '"$CONTAINER"',
      "python3",
      "-c",
      shellEscape(python),
    ].join(" "),
    { timeoutMs: DEFAULT_TIMEOUT_MS }
  );

  if (!result.ok) {
    return toDesktopError(
      result.error?.code ?? "REMOTE_DOCKER_FILE_WRITE_FAILED",
      result.error?.message ?? "写入远程 Docker 实例文件失败。",
      result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
      result.error?.recoverable ?? true
    );
  }

  return {
    ok: true,
    data: {
      path: targetPath,
      containerPath,
    },
  };
}

export async function runRemoteDockerHermesCommand(instance, args = [], { timeoutMs = DEFAULT_TIMEOUT_MS, cwd } = {}) {
  const containerCwd = mapRemoteDockerDataPath(instance, cwd) || REMOTE_DOCKER_DATA_ROOT;
  const hermesArgs = Array.isArray(args) ? args.map((arg) => shellEscape(arg)).join(" ") : "";
  const command = [
    ". /opt/hermes/.venv/bin/activate 2>/dev/null || true",
    "export PATH=/opt/hermes/.venv/bin:/opt/hermes:$PATH",
    `exec hermes ${hermesArgs}`,
  ].join(" && ");
  return runRemoteDockerShell(
    instance,
    [
      "exec",
      "-u hermes",
      `-e HERMES_HOME=${shellEscape(REMOTE_DOCKER_DATA_ROOT)}`,
      `-e HOME=${shellEscape(path.posix.join(REMOTE_DOCKER_DATA_ROOT, "home"))}`,
      "-w",
      shellEscape(containerCwd),
      '"$CONTAINER"',
      "sh",
      "-lc",
      shellEscape(command),
    ].filter(Boolean).join(" "),
    { timeoutMs }
  );
}

export async function runRemoteDockerPythonScript(instance, script, { timeoutMs = DEFAULT_TIMEOUT_MS, cwd, env = {} } = {}) {
  const containerCwd = mapRemoteDockerDataPath(instance, cwd) || REMOTE_DOCKER_DATA_ROOT;
  const envArgs = Object.entries(env)
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    .map(([key, value]) => `-e ${key}=${shellEscape(String(value ?? ""))}`)
    .join(" ");

  return runRemoteDockerShell(
    instance,
    [
      "exec",
      "-u hermes",
      `-e HOME=${shellEscape(path.posix.join(REMOTE_DOCKER_DATA_ROOT, "home"))}`,
      envArgs,
      "-w",
      shellEscape(containerCwd),
      '"$CONTAINER"',
      "python3",
      "-c",
      shellEscape(script),
    ].filter(Boolean).join(" "),
    { timeoutMs }
  );
}

export async function readRemoteDockerJsonFile(instance, targetPath) {
  try {
    const raw = await readRemoteDockerTextFile(instance, targetPath);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function readRemoteDockerDirectoryEntries(instance, directoryPath) {
  const containerPath = mapRemoteDockerDataPath(instance, directoryPath);
  if (!containerPath) return [];

  const python = [
    "import base64, json, os, pathlib",
    "target = pathlib.Path(base64.b64decode(os.environ['TARGET_B64']).decode('utf-8'))",
    "items = []",
    "if target.is_dir():",
    "    items = [{'name': item.name, 'directory': item.is_dir(), 'file': item.is_file()} for item in target.iterdir()]",
    "print(json.dumps(items, ensure_ascii=False))",
  ].join("\n");

  const result = await runRemoteDockerShell(
    instance,
    [
      "exec",
      `-e TARGET_B64=${shellEscape(Buffer.from(containerPath, "utf8").toString("base64"))}`,
      '"$CONTAINER"',
      "python3",
      "-c",
      shellEscape(python),
    ].join(" "),
    { timeoutMs: 12_000 }
  );

  if (!result.ok || !result.data) return [];

  try {
    const items = JSON.parse(result.data.stdout || "[]");
    return Array.isArray(items)
      ? items.map((item) => ({
          name: item.name,
          isDirectory() {
            return Boolean(item.directory);
          },
          isFile() {
            return Boolean(item.file);
          },
        }))
      : [];
  } catch {
    return [];
  }
}

export async function countRemoteDockerFilesRecursively(instance, directoryPath) {
  const containerPath = mapRemoteDockerDataPath(instance, directoryPath);
  if (!containerPath) return 0;

  const python = [
    "import base64, os, pathlib",
    "target = pathlib.Path(base64.b64decode(os.environ['TARGET_B64']).decode('utf-8'))",
    "count = sum(1 for item in target.rglob('*') if item.is_file()) if target.is_dir() else 0",
    "print(count)",
  ].join("; ");

  const result = await runRemoteDockerShell(
    instance,
    [
      "exec",
      `-e TARGET_B64=${shellEscape(Buffer.from(containerPath, "utf8").toString("base64"))}`,
      '"$CONTAINER"',
      "python3",
      "-c",
      shellEscape(python),
    ].join(" "),
    { timeoutMs: 12_000 }
  );

  const numeric = Number(result.ok ? result.data?.stdout?.trim() ?? "0" : "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getLatestRemoteDockerTimestamp(instance, paths) {
  const containerPaths = paths
    .map((targetPath) => mapRemoteDockerDataPath(instance, targetPath))
    .filter(Boolean);
  if (containerPaths.length === 0) return 0;

  const encodedPaths = Buffer.from(JSON.stringify(containerPaths), "utf8").toString("base64");
  const python = [
    "import base64, json, os, pathlib",
    "paths = json.loads(base64.b64decode(os.environ['PATHS_B64']).decode('utf-8'))",
    "latest = 0.0",
    "for raw in paths:",
    "    target = pathlib.Path(raw)",
    "    if target.is_file():",
    "        latest = max(latest, target.stat().st_mtime)",
    "    elif target.is_dir():",
    "        for item in target.rglob('*'):",
    "            if item.is_file():",
    "                latest = max(latest, item.stat().st_mtime)",
    "print(int(latest * 1000) if latest > 0 else 0)",
  ].join("\n");

  const result = await runRemoteDockerShell(
    instance,
    [
      "exec",
      `-e PATHS_B64=${shellEscape(encodedPaths)}`,
      '"$CONTAINER"',
      "python3",
      "-c",
      shellEscape(python),
    ].join(" "),
    { timeoutMs: 12_000 }
  );

  const numeric = Number(result.ok ? result.data?.stdout?.trim() ?? "0" : "0");
  return Number.isFinite(numeric) ? numeric : 0;
}
