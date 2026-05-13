import { inspectSshRuntime, runSshCommand } from "./ssh-runtime.mjs";

const DEFAULT_REMOTE_TIMEOUT_MS = 25_000;
const DEFAULT_REMOTE_SSH_PROBE_TIMEOUT_MS = 10_000;
const DEFAULT_GATEWAY_PORT = 8642;
const OUTPUT_BEGIN = "__HERMES_REMOTE_ENV_BEGIN__";
const OUTPUT_END = "__HERMES_REMOTE_ENV_END__";
const SSH_PROBE_TOKEN = "__HERMES_SSH_OK__";

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

function buildRemoteInspectionScript(workdir, port) {
  return `
WORKDIR=${shellEscape(workdir)}
START_PORT=${Number(port) || DEFAULT_GATEWAY_PORT}
run_with_timeout() {
  seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}
WORKDIR_EXISTS=0
[ -e "$WORKDIR" ] && WORKDIR_EXISTS=1
WRITABLE=0
[ -w "$WORKDIR" ] && WRITABLE=1
HERMES_BIN=""
if command -v hermes >/dev/null 2>&1; then
  HERMES_BIN=$(command -v hermes)
fi
DOCKER_AVAILABLE=0
DOCKER_DAEMON=0
DOCKER_PERMISSION_DENIED=0
DOCKER_VERSION=""
if command -v docker >/dev/null 2>&1; then
  DOCKER_AVAILABLE=1
  DOCKER_VERSION=$(run_with_timeout 6 sh -lc "docker version --format '{{.Server.Version}}' 2>/dev/null || docker --version 2>/dev/null || true")
  if run_with_timeout 6 sh -lc "docker info >/dev/null 2>&1"; then
    DOCKER_DAEMON=1
  else
    DOCKER_INFO_OUTPUT=$(run_with_timeout 6 sh -lc "docker info 2>&1" || true)
    if printf '%s' "$DOCKER_INFO_OUTPUT" | grep -qi 'permission denied while trying to connect to the Docker daemon socket'; then
      DOCKER_PERMISSION_DENIED=1
    fi
  fi
fi
DISK_AVAILABLE_KB=$(df -Pk "$WORKDIR" 2>/dev/null | awk 'NR==2 {print $4}')
PORT_REQUESTED="$START_PORT"
PORT_SELECTED="$START_PORT"
PORT_STATUS="unknown"
if command -v python3 >/dev/null 2>&1; then
  PORT_RESULT=$(python3 - "$START_PORT" <<'PY'
import socket, sys
start_port = int(sys.argv[1])
chosen = None
requested_free = False
for offset in range(0, 200):
    candidate = start_port + offset
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", candidate))
    except OSError:
        pass
    else:
        if offset == 0:
            requested_free = True
        chosen = candidate
        break
    finally:
        sock.close()

if chosen is None:
    print("unavailable")
    print(start_port)
else:
    print("free" if requested_free else "occupied")
    print(chosen)
PY
)
  PORT_STATUS=$(printf '%s\n' "$PORT_RESULT" | sed -n '1p')
  PORT_SELECTED=$(printf '%s\n' "$PORT_RESULT" | sed -n '2p')
elif command -v python >/dev/null 2>&1; then
  PORT_RESULT=$(python - "$START_PORT" <<'PY'
import socket, sys
start_port = int(sys.argv[1])
chosen = None
requested_free = False
for offset in range(0, 200):
    candidate = start_port + offset
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", candidate))
    except OSError:
        pass
    else:
        if offset == 0:
            requested_free = True
        chosen = candidate
        break
    finally:
        sock.close()

if chosen is None:
    print("unavailable")
    print(start_port)
else:
    print("free" if requested_free else "occupied")
    print(chosen)
PY
)
  PORT_STATUS=$(printf '%s\n' "$PORT_RESULT" | sed -n '1p')
  PORT_SELECTED=$(printf '%s\n' "$PORT_RESULT" | sed -n '2p')
fi
printf '%s\n' ${shellEscape(OUTPUT_BEGIN)}
printf 'system_platform=%s\n' "$(uname -s 2>/dev/null || echo unknown)"
printf 'system_arch=%s\n' "$(uname -m 2>/dev/null || echo unknown)"
printf 'system_hostname=%s\n' "$(hostname 2>/dev/null || echo unknown)"
printf 'system_user=%s\n' "$(id -un 2>/dev/null || echo unknown)"
printf 'system_home=%s\n' "$HOME"
printf 'workdir=%s\n' "$WORKDIR"
printf 'directory_exists=%s\n' "$WORKDIR_EXISTS"
printf 'directory_writable=%s\n' "$WRITABLE"
printf 'hermes_available=%s\n' "$([ -n "$HERMES_BIN" ] && echo 1 || echo 0)"
printf 'hermes_binary=%s\n' "$HERMES_BIN"
printf 'docker_available=%s\n' "$DOCKER_AVAILABLE"
printf 'docker_daemon=%s\n' "$DOCKER_DAEMON"
printf 'docker_permission_denied=%s\n' "$DOCKER_PERMISSION_DENIED"
printf 'docker_version=%s\n' "$DOCKER_VERSION"
printf 'disk_available_kb=%s\n' "$DISK_AVAILABLE_KB"
printf 'port_requested=%s\n' "$PORT_REQUESTED"
printf 'port_selected=%s\n' "$PORT_SELECTED"
printf 'port_status=%s\n' "$PORT_STATUS"
printf '%s\n' ${shellEscape(OUTPUT_END)}
`.trim();
}

function buildSshProbeScript() {
  return `printf '%s\\n' ${shellEscape(SSH_PROBE_TOKEN)}`;
}

function parseOutputValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseInspectionOutput(stdout) {
  const beginIndex = stdout.indexOf(OUTPUT_BEGIN);
  const endIndex = stdout.indexOf(OUTPUT_END);

  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    return null;
  }

  const body = stdout.slice(beginIndex + OUTPUT_BEGIN.length, endIndex).trim();
  const parsed = {};

  for (const line of body.split(/\r?\n/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    parsed[key] = value;
  }

  return parsed;
}

function toBooleanFlag(value) {
  return value === "1" || /^true$/i.test(String(value));
}

function buildPartialInspection(input, runtime, warning) {
  const host = String(input?.host || "").trim();
  const user = String(input?.user || "").trim();
  const port = String(input?.port || "22");
  const workdir = String(input?.workdir || "/opt/hermes");
  const detail = String(warning || "SSH 已建立，但远程环境探测未完成。").trim();

  return {
    ok: true,
    data: {
      host,
      port,
      user,
      authMode: input?.authMode === "password" ? "password" : "ssh_key",
      workdir,
      warning: detail,
      ssh: {
        reachable: true,
        detail: `已连接 ${user}@${host}:${port}，但环境探测命令未完成。`,
        sshBinary: runtime.sshBinary,
        expectBinary: runtime.expectBinary,
        passwordSupported: runtime.passwordSupported,
      },
      system: {
        platform: "unknown",
        hostname: host,
        arch: "unknown",
        remoteUser: user,
      },
      directory: {
        writable: false,
        detail: `SSH 已连接，但未完成目录写权限检测：${detail}`,
      },
      hermes: {
        available: false,
        binaryPath: "",
        detail: `SSH 已连接，但未完成 Hermes CLI 检测：${detail}`,
      },
      docker: {
        available: false,
        daemonRunning: false,
        version: "",
        detail: `SSH 已连接，但未完成 Docker 检测：${detail}`,
      },
      disk: {
        availableGb: null,
        detail: `SSH 已连接，但未完成磁盘空间检测：${detail}`,
      },
      port: {
        port: DEFAULT_GATEWAY_PORT,
        requestedPort: DEFAULT_GATEWAY_PORT,
        autoSelected: false,
        available: null,
        detail: `SSH 已连接，但未完成端口占用检测：${detail}`,
      },
      raw: {},
    },
  };
}

function formatDiskDetail(kbValue) {
  const numeric = Number(kbValue || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      availableGb: null,
      detail: "未能读取远程磁盘空间。",
    };
  }

  const availableGb = Number((numeric / 1024 / 1024).toFixed(1));
  return {
    availableGb,
    detail: `远程目录约剩余 ${availableGb} GB 可用空间。`,
  };
}

export async function inspectRemoteEnvironment(input) {
  const runtime = inspectSshRuntime({ authMode: input?.authMode });
  const sshProbeResult = await runSshCommand(input, buildSshProbeScript(), { timeoutMs: DEFAULT_REMOTE_SSH_PROBE_TIMEOUT_MS });
  if (!sshProbeResult.ok || !sshProbeResult.data) {
    return sshProbeResult;
  }

  const remoteCommand = buildRemoteInspectionScript(input?.workdir || "/opt/hermes", DEFAULT_GATEWAY_PORT);
  const result = await runSshCommand(input, remoteCommand, { timeoutMs: DEFAULT_REMOTE_TIMEOUT_MS });

  if (!result.ok || !result.data) {
    return buildPartialInspection(input, runtime, result.error?.detail ?? result.error?.message ?? "远程环境探测命令执行失败。");
  }

  const parsed = parseInspectionOutput(result.data.stdout);
  if (!parsed) {
    return buildPartialInspection(
      input,
      runtime,
      result.data.stdout || result.data.stderr || "远程输出不包含预期标记，无法解析环境结果。"
    );
  }

  const writable = toBooleanFlag(parsed.directory_writable);
  const directoryExists = toBooleanFlag(parsed.directory_exists);
  const dockerAvailable = toBooleanFlag(parsed.docker_available);
  const dockerDaemon = toBooleanFlag(parsed.docker_daemon);
  const dockerPermissionDenied = toBooleanFlag(parsed.docker_permission_denied);
  const hermesAvailable = toBooleanFlag(parsed.hermes_available);
  const requestedPort = Number(parsed.port_requested || DEFAULT_GATEWAY_PORT);
  const selectedPort = Number(parsed.port_selected || requestedPort || DEFAULT_GATEWAY_PORT);
  const portStatus = parseOutputValue(parsed.port_status);
  const portAutoSelected = Number.isFinite(selectedPort) && Number.isFinite(requestedPort) && selectedPort > 0 && selectedPort !== requestedPort;
  const portAvailable = portStatus === "unavailable" ? false : selectedPort > 0;
  const disk = formatDiskDetail(parsed.disk_available_kb);

  return {
    ok: true,
    data: {
      host: String(input.host).trim(),
      port: String(input.port || "22"),
      user: String(input.user).trim(),
      authMode: input.authMode === "password" ? "password" : "ssh_key",
      workdir: parseOutputValue(parsed.workdir) || String(input.workdir || "/opt/hermes"),
      ssh: {
        reachable: true,
        detail: `已连接 ${String(input.user).trim()}@${String(input.host).trim()}:${String(input.port || "22")}`,
        sshBinary: runtime.sshBinary,
        expectBinary: runtime.expectBinary,
        passwordSupported: runtime.passwordSupported,
      },
      system: {
        platform: parseOutputValue(parsed.system_platform) || "Linux",
        hostname: parseOutputValue(parsed.system_hostname) || String(input.host).trim(),
        arch: parseOutputValue(parsed.system_arch) || "unknown",
        remoteUser: parseOutputValue(parsed.system_user) || String(input.user).trim(),
        homeDir: parseOutputValue(parsed.system_home),
      },
      directory: {
        writable,
        detail: directoryExists
          ? (writable ? `${parseOutputValue(parsed.workdir)} 可写。` : `${parseOutputValue(parsed.workdir)} 当前不可写。`)
          : `${parseOutputValue(parsed.workdir)} 远程目录不存在。`,
      },
      hermes: {
        available: hermesAvailable,
        binaryPath: parseOutputValue(parsed.hermes_binary),
        detail: hermesAvailable ? `已发现 Hermes CLI：${parseOutputValue(parsed.hermes_binary) || 'hermes'}` : "远程环境尚未发现 Hermes CLI。",
      },
      docker: {
        available: dockerAvailable,
        daemonRunning: dockerDaemon,
        version: parseOutputValue(parsed.docker_version),
        detail: dockerAvailable
          ? dockerDaemon
            ? `运行服务正常运行${parsed.docker_version ? `（${parseOutputValue(parsed.docker_version)}）` : ""}。`
            : dockerPermissionDenied
              ? `运行服务已安装，但当前用户无权访问${parsed.docker_version ? `（${parseOutputValue(parsed.docker_version)}）` : ""}。`
              : `运行服务已安装，但尚未启动${parsed.docker_version ? `（${parseOutputValue(parsed.docker_version)}）` : ""}。`
          : "远程环境未发现可用运行服务。",
      },
      disk,
      port: {
        port: selectedPort || DEFAULT_GATEWAY_PORT,
        requestedPort: requestedPort || DEFAULT_GATEWAY_PORT,
        autoSelected: portAutoSelected,
        available: portAvailable,
        detail: portAvailable === false
          ? `${requestedPort || DEFAULT_GATEWAY_PORT} 附近未找到可用端口。`
          : portAutoSelected
            ? `${requestedPort} 端口已被占用，部署时将自动改用 ${selectedPort}。`
            : `${selectedPort || DEFAULT_GATEWAY_PORT} 端口当前可用。`,
      },
      raw: parsed,
    },
  };
}
