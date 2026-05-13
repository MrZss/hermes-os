import { spawn } from "node:child_process";
import path from "node:path";
import { getRegisteredInstance } from "./instance-registry.mjs";
import { resolveHermesBinary } from "./hermes-cli.mjs";
import { runSshCommand } from "./ssh-runtime.mjs";
import {
  isRemoteDockerInstance,
  mapRemoteDockerDataPath,
  runRemoteDockerHermesCommand,
  runRemoteDockerPythonScript,
} from "./remote-docker-files.mjs";

const DEFAULT_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MS = 180_000;
const PYTHON_SCRIPT = String.raw`
import base64
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def load_request():
    raw = os.environ.get("HERMES_CONSOLE_REQUEST_B64", "")
    if not raw:
        raise ValueError("missing request payload")
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def iso_to_label(value):
    if not value:
        return "刚刚"
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.strftime("%m-%d %H:%M")
    except Exception:
        return str(value)


def ts_to_iso(value):
    if value is None:
        return ""
    try:
        return datetime.fromtimestamp(float(value)).astimezone().isoformat()
    except Exception:
        return ""


def ts_to_label(value):
    iso = ts_to_iso(value)
    return iso_to_label(iso)


def format_size(size):
    try:
        size = int(size)
    except Exception:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    index = 0
    while value >= 1024 and index < len(units) - 1:
        value /= 1024
        index += 1
    if index == 0:
        return f"{int(value)} {units[index]}"
    return f"{value:.1f} {units[index]}"


def connect_db(state_db_path):
    db_path = Path(state_db_path)
    if not db_path.exists():
        return None
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def list_sessions(state_db_path, limit=30):
    conn = connect_db(state_db_path)
    if conn is None:
        return []
    try:
        cursor = conn.execute(
            """
            SELECT s.id, s.source, s.model, s.title, s.message_count, s.started_at, s.ended_at,
                   COALESCE(
                     (SELECT SUBSTR(REPLACE(REPLACE(m.content, X'0A', ' '), X'0D', ' '), 1, 120)
                      FROM messages m
                      WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
                      ORDER BY m.timestamp, m.id LIMIT 1),
                     ''
                   ) AS preview,
                   COALESCE((SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.session_id = s.id), s.started_at) AS last_active
            FROM sessions s
            WHERE s.parent_session_id IS NULL
            ORDER BY last_active DESC, s.started_at DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        rows = cursor.fetchall()
        items = []
        for row in rows:
            preview = (row["preview"] or "").strip()
            items.append(
                {
                    "id": row["id"],
                    "title": row["title"] or "",
                    "source": row["source"] or "cli",
                    "model": row["model"] or "待配置",
                    "messageCount": int(row["message_count"] or 0),
                    "preview": preview,
                    "lastActive": ts_to_iso(row["last_active"]),
                    "lastActiveLabel": ts_to_label(row["last_active"]),
                    "startedAt": ts_to_iso(row["started_at"]),
                    "startedLabel": ts_to_label(row["started_at"]),
                    "status": "活跃" if row["ended_at"] is None else "已结束",
                }
            )
        return items
    finally:
        conn.close()


def get_session(state_db_path, session_id):
    conn = connect_db(state_db_path)
    if conn is None:
        return {"session": None, "messages": []}
    try:
        session_row = conn.execute(
            """
            SELECT s.id, s.source, s.model, s.title, s.message_count, s.started_at, s.ended_at,
                   COALESCE(
                     (SELECT SUBSTR(REPLACE(REPLACE(m.content, X'0A', ' '), X'0D', ' '), 1, 120)
                      FROM messages m
                      WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
                      ORDER BY m.timestamp, m.id LIMIT 1),
                     ''
                   ) AS preview,
                   COALESCE((SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.session_id = s.id), s.started_at) AS last_active
            FROM sessions s
            WHERE s.id = ?
            LIMIT 1
            """,
            (session_id,),
        ).fetchone()
        if session_row is None:
            return {"session": None, "messages": []}

        message_rows = conn.execute(
            """
            SELECT id, role, content, tool_call_id, tool_calls, tool_name, timestamp, finish_reason
            FROM messages
            WHERE session_id = ?
            ORDER BY timestamp, id
            """,
            (session_id,),
        ).fetchall()

        messages = []
        for row in message_rows:
            tool_calls = []
            if row["tool_calls"]:
                try:
                    tool_calls = json.loads(row["tool_calls"])
                except Exception:
                    tool_calls = []
            messages.append(
                {
                    "id": int(row["id"]),
                    "role": row["role"] or "assistant",
                    "content": row["content"] or "",
                    "toolCallId": row["tool_call_id"] or "",
                    "toolName": row["tool_name"] or "",
                    "toolCalls": tool_calls,
                    "finishReason": row["finish_reason"] or "",
                    "timestamp": ts_to_iso(row["timestamp"]),
                    "timestampLabel": ts_to_label(row["timestamp"]),
                }
            )

        return {
            "session": {
                "id": session_row["id"],
                "title": session_row["title"] or "",
                "source": session_row["source"] or "cli",
                "model": session_row["model"] or "待配置",
                "messageCount": int(session_row["message_count"] or 0),
                "preview": (session_row["preview"] or "").strip(),
                "lastActive": ts_to_iso(session_row["last_active"]),
                "lastActiveLabel": ts_to_label(session_row["last_active"]),
                "startedAt": ts_to_iso(session_row["started_at"]),
                "startedLabel": ts_to_label(session_row["started_at"]),
                "status": "活跃" if session_row["ended_at"] is None else "已结束",
            },
            "messages": messages,
        }
    finally:
        conn.close()


def list_workspace_entries(workspace_dir):
    root = Path(workspace_dir)
    if not root.exists() or not root.is_dir():
        return []
    entries = []
    for entry in sorted(root.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))[:12]:
        try:
            stat = entry.stat()
        except Exception:
            continue
        entries.append(
            {
                "name": entry.name,
                "path": str(entry),
                "type": "dir" if entry.is_dir() else "file",
                "sizeBytes": 0 if entry.is_dir() else int(stat.st_size),
                "sizeLabel": "目录" if entry.is_dir() else format_size(stat.st_size),
                "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
                "modifiedLabel": datetime.fromtimestamp(stat.st_mtime).astimezone().strftime("%m-%d %H:%M"),
            }
        )
    return entries


def count_files(target):
    root = Path(target)
    if not root.exists():
        return 0
    if root.is_file():
        return 1
    total = 0
    for child in root.rglob("*"):
        if child.is_file():
            total += 1
    return total


def file_exists(target):
    path_obj = Path(target)
    return path_obj.exists()


def workspace_context(profile_home, workspace_dir, backups_dir, state_db_path):
    sessions = list_sessions(state_db_path, limit=1)
    root = Path(profile_home)
    return {
        "profileHome": str(root),
        "workspaceDir": str(Path(workspace_dir)),
        "stateDbPath": str(Path(state_db_path)),
        "configPath": str(root / "config.yaml"),
        "envPath": str(root / ".env"),
        "soulPath": str(root / "SOUL.md"),
        "logsDir": str(root / "logs"),
        "sessionsDir": str(root / "sessions"),
        "backupsDir": str(Path(backups_dir)),
        "exists": root.exists(),
        "hasConfig": file_exists(root / "config.yaml"),
        "hasEnv": file_exists(root / ".env"),
        "hasSoul": file_exists(root / "SOUL.md"),
        "sessionCount": count_files(root / "sessions"),
        "logCount": count_files(root / "logs"),
        "backupCount": count_files(backups_dir),
        "entries": list_workspace_entries(workspace_dir),
        "latestSessionId": sessions[0]["id"] if sessions else "",
    }


def main():
    request = load_request()
    mode = request.get("mode")

    if mode == "list_sessions":
        payload = {"sessions": list_sessions(request["stateDbPath"], request.get("limit", 30))}
    elif mode == "get_session":
        payload = get_session(request["stateDbPath"], request["sessionId"])
    elif mode == "workspace_context":
        payload = workspace_context(
            request["profileHome"],
            request["workspaceDir"],
            request["backupsDir"],
            request["stateDbPath"],
        )
    else:
        raise ValueError(f"unsupported mode: {mode}")

    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
`;

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
  return `'${String(value ?? "").replace(/'/g, `"'"'`)}'`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runLocalProcess(command, args, { timeoutMs = DEFAULT_TIMEOUT_MS, cwd, env } = {}) {
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

function resolveProfileContext(instance, requestedProfileId) {
  const profileId = typeof requestedProfileId === "string" && requestedProfileId.trim() && requestedProfileId.trim() !== "default"
    ? requestedProfileId.trim()
    : "default";
  const isDefault = profileId === "default";
  const profileHome = isDefault ? instance.hermesHome : path.join(instance.hermesHome, "profiles", profileId);

  return {
    id: profileId,
    name: isDefault ? "默认档案" : profileId,
    isDefault,
    homePath: profileHome,
    workspaceDir: path.join(profileHome, "workspace"),
    stateDbPath: path.join(profileHome, "state.db"),
    configPath: path.join(profileHome, "config.yaml"),
    envPath: path.join(profileHome, ".env"),
    soulPath: path.join(profileHome, "SOUL.md"),
    logsDir: path.join(profileHome, "logs"),
    sessionsDir: path.join(profileHome, "sessions"),
    backupsDir: path.join(instance.workspaceDir, "backups"),
  };
}

function buildProfileAwareArgs(profile, args) {
  const scopedArgs = [];
  if (!profile.isDefault) {
    scopedArgs.push("--profile", profile.id);
  }
  scopedArgs.push(...args);
  return scopedArgs;
}

function createWorkspaceProfilePayload(profile) {
  return {
    id: profile.id,
    name: profile.name,
    isDefault: profile.isDefault,
    homePath: profile.homePath,
    workspaceDir: profile.workspaceDir,
    stateDbPath: profile.stateDbPath,
    configPath: profile.configPath,
    envPath: profile.envPath,
    soulPath: profile.soulPath,
    logsDir: profile.logsDir,
    sessionsDir: profile.sessionsDir,
    backupsDir: profile.backupsDir,
  };
}

function mapRemoteDockerRequestValue(instance, value) {
  if (typeof value === "string") {
    return mapRemoteDockerDataPath(instance, value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mapRemoteDockerRequestValue(instance, item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, mapRemoteDockerRequestValue(instance, childValue)])
    );
  }

  return value;
}

async function getInstanceWithProfile(userDataPath, instanceId, requestedProfileId) {
  if (!instanceId || typeof instanceId !== "string") {
    return toDesktopError("INSTANCE_ID_REQUIRED", "实例 ID 不能为空。", "请提供要读取的实例 ID。", true);
  }

  const instanceResult = await getRegisteredInstance(userDataPath, instanceId);
  if (!instanceResult.ok || !instanceResult.data) {
    return toDesktopError(
      instanceResult.error?.code ?? "INSTANCE_LOOKUP_FAILED",
      instanceResult.error?.message ?? "无法读取实例信息。",
      instanceResult.error?.detail,
      instanceResult.error?.recoverable ?? true
    );
  }

  if (!instanceResult.data.instance) {
    return toDesktopError("INSTANCE_NOT_FOUND", "未找到对应实例。", `instanceId=${instanceId}`, true);
  }

  return {
    ok: true,
    data: {
      instance: instanceResult.data.instance,
      profile: resolveProfileContext(instanceResult.data.instance, requestedProfileId),
    },
  };
}

async function runWorkspacePython(instance, request, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const effectiveRequest = isRemoteDockerInstance(instance)
    ? mapRemoteDockerRequestValue(instance, request)
    : request;
  const requestB64 = Buffer.from(JSON.stringify(effectiveRequest), "utf8").toString("base64");

  if (instance.type === "remote") {
    if (isRemoteDockerInstance(instance)) {
      const result = await runRemoteDockerPythonScript(instance, PYTHON_SCRIPT, {
        timeoutMs,
        cwd: instance.hermesHome,
        env: {
          HERMES_CONSOLE_REQUEST_B64: requestB64,
        },
      });

      if (!result.ok || !result.data) {
        return toDesktopError(
          result.error?.code ?? "REMOTE_DOCKER_WORKSPACE_COMMAND_FAILED",
          result.error?.message ?? "远程 Docker 工作区读取失败。",
          result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
          result.error?.recoverable ?? true
        );
      }

      try {
        return {
          ok: true,
          data: JSON.parse((result.data.stdout || "").trim() || "{}"),
        };
      } catch {
        return toDesktopError(
          "REMOTE_DOCKER_WORKSPACE_PARSE_FAILED",
          "远程 Docker 工作区返回值无法解析。",
          (result.data.stdout || result.data.stderr || "").trim(),
          true
        );
      }
    }

    const connection = buildRemoteConnection(instance);
    if (!connection) {
      return toDesktopError(
        "REMOTE_CONNECTION_MISSING",
        "远程实例缺少 SSH 连接元数据。",
        `instanceId=${instance.id}`,
        true
      );
    }

    const command = `HERMES_CONSOLE_REQUEST_B64=${shellEscape(requestB64)} python3 - <<'PY'\n${PYTHON_SCRIPT}\nPY`;
    const result = await runSshCommand(connection, command, { timeoutMs });

    if (!result.ok || !result.data) {
      return toDesktopError(
        result.error?.code ?? "REMOTE_WORKSPACE_COMMAND_FAILED",
        result.error?.message ?? "远程工作区读取失败。",
        result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
        result.error?.recoverable ?? true
      );
    }

    try {
      return {
        ok: true,
        data: JSON.parse((result.data.stdout || "").trim() || "{}"),
      };
    } catch {
      return toDesktopError(
        "REMOTE_WORKSPACE_PARSE_FAILED",
        "远程工作区返回值无法解析。",
        (result.data.stdout || result.data.stderr || "").trim(),
        true
      );
    }
  }

  const result = await runLocalProcess("python3", ["-c", PYTHON_SCRIPT], {
    timeoutMs,
    env: {
      ...process.env,
      HERMES_CONSOLE_REQUEST_B64: requestB64,
    },
  });

  if (!result.ok) {
    return toDesktopError(
      "LOCAL_WORKSPACE_COMMAND_FAILED",
      "本地工作区读取失败。",
      (result.stderr || result.stdout || "").trim(),
      true
    );
  }

  try {
    return {
      ok: true,
      data: JSON.parse((result.stdout || "").trim() || "{}"),
    };
  } catch {
    return toDesktopError(
      "LOCAL_WORKSPACE_PARSE_FAILED",
      "本地工作区返回值无法解析。",
      (result.stdout || result.stderr || "").trim(),
      true
    );
  }
}

function buildHermesChatArgs(profile, prompt, sessionId) {
  const args = buildProfileAwareArgs(profile, ["chat", "-Q"]);

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  args.push("-q", prompt);
  return args;
}

function parseHermesChatOutput(stdout = "") {
  const sessionMatch = stdout.match(/session_id:\s*(\S+)/);
  const sessionId = sessionMatch?.[1] ?? "";
  const responseText = stdout.replace(/\n?session_id:\s*\S+\s*$/m, "").trim();

  return {
    sessionId,
    responseText,
  };
}

async function runHermesChat(instance, profile, prompt, sessionId) {
  const args = buildHermesChatArgs(profile, prompt, sessionId);

  if (instance.type === "remote") {
    if (isRemoteDockerInstance(instance)) {
      const result = await runRemoteDockerHermesCommand(instance, args, {
        timeoutMs: CHAT_TIMEOUT_MS,
        cwd: profile.homePath,
      });

      if (!result.ok || !result.data) {
        return toDesktopError(
          result.error?.code ?? "REMOTE_DOCKER_CHAT_FAILED",
          result.error?.message ?? "远程 Docker 会话发送失败。",
          result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
          result.error?.recoverable ?? true
        );
      }

      return {
        ok: result.data.exitCode === 0,
        data: {
          exitCode: result.data.exitCode,
          stdout: result.data.stdout || "",
          stderr: result.data.stderr || "",
        },
        error:
          result.data.exitCode === 0
            ? undefined
            : {
                code: "REMOTE_DOCKER_CHAT_EXIT_FAILED",
                message: "远程 Docker Hermes chat 返回非零退出码。",
                detail: (result.data.stderr || result.data.stdout || "").trim(),
                recoverable: true,
              },
      };
    }

    const connection = buildRemoteConnection(instance);
    if (!connection) {
      return toDesktopError(
        "REMOTE_CONNECTION_MISSING",
        "远程实例缺少 SSH 连接元数据。",
        `instanceId=${instance.id}`,
        true
      );
    }

    const command = [
      `cd ${shellEscape(instance.workspaceDir)} 2>/dev/null || cd ${shellEscape(profile.homePath)}`,
      `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes ${args.map((item) => shellEscape(item)).join(" ")}`,
    ].join(" && ");

    const result = await runSshCommand(connection, command, { timeoutMs: CHAT_TIMEOUT_MS });

    if (!result.ok || !result.data) {
      return toDesktopError(
        result.error?.code ?? "REMOTE_CHAT_FAILED",
        result.error?.message ?? "远程会话发送失败。",
        result.error?.detail ?? result.data?.stderr ?? result.data?.stdout,
        result.error?.recoverable ?? true
      );
    }

    return {
      ok: result.data.exitCode === 0,
      data: {
        exitCode: result.data.exitCode,
        stdout: result.data.stdout || "",
        stderr: result.data.stderr || "",
      },
      error:
        result.data.exitCode === 0
          ? undefined
          : {
              code: "REMOTE_CHAT_EXIT_FAILED",
              message: "远程 Hermes chat 返回非零退出码。",
              detail: (result.data.stderr || result.data.stdout || "").trim(),
              recoverable: true,
            },
    };
  }

  const binaryPath = resolveHermesBinary();
  const result = await runLocalProcess(binaryPath, args, {
    timeoutMs: CHAT_TIMEOUT_MS,
    cwd: instance.workspaceDir,
    env: {
      ...process.env,
      HERMES_HOME: instance.hermesHome,
    },
  });

  return {
    ok: result.ok,
    data: {
      exitCode: result.exitCode,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    },
    error: result.ok
      ? undefined
      : {
          code: "LOCAL_CHAT_EXIT_FAILED",
          message: "本地 Hermes chat 返回非零退出码。",
          detail: (result.stderr || result.stdout || "").trim(),
          recoverable: true,
        },
  };
}

async function runHermesProfileCommand(instance, profile, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const commandArgs = buildProfileAwareArgs(profile, args);

  if (instance.type === "remote") {
    if (isRemoteDockerInstance(instance)) {
      const result = await runRemoteDockerHermesCommand(instance, commandArgs, {
        timeoutMs,
        cwd: profile.homePath,
      });

      if (!result.ok || !result.data) {
        return toDesktopError(
          result.error?.code ?? "REMOTE_DOCKER_WORKSPACE_COMMAND_FAILED",
          result.error?.message ?? "远程 Docker Hermes 会话命令执行失败。",
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

    const connection = buildRemoteConnection(instance);
    if (!connection) {
      return toDesktopError(
        "REMOTE_CONNECTION_MISSING",
        "远程实例缺少 SSH 连接元数据。",
        `instanceId=${instance.id}`,
        true
      );
    }

    const command = [
      `cd ${shellEscape(instance.workspaceDir)} 2>/dev/null || cd ${shellEscape(profile.homePath)}`,
      `HERMES_HOME=${shellEscape(instance.hermesHome)} hermes ${commandArgs.map((item) => shellEscape(item)).join(" ")}`,
    ].join(" && ");

    const result = await runSshCommand(connection, command, { timeoutMs });

    if (!result.ok || !result.data) {
      return toDesktopError(
        result.error?.code ?? "REMOTE_WORKSPACE_COMMAND_FAILED",
        result.error?.message ?? "远程 Hermes 会话命令执行失败。",
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

  const binaryPath = resolveHermesBinary();
  const result = await runLocalProcess(binaryPath, commandArgs, {
    timeoutMs,
    cwd: instance.workspaceDir,
    env: {
      ...process.env,
      HERMES_HOME: instance.hermesHome,
    },
  });

  if (!result.ok) {
    return toDesktopError(
      "LOCAL_WORKSPACE_COMMAND_FAILED",
      "本地 Hermes 会话命令执行失败。",
      (result.stderr || result.stdout || "").trim(),
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

function findLatestAssistantMessage(detail) {
  const messages = detail?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && String(message.content || "").trim()) {
      return message;
    }
  }
  return null;
}

async function waitForSessionDetail(userDataPath, instanceId, profileId, sessionId, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const detailResult = await getInstanceWorkspaceSession(userDataPath, instanceId, sessionId, { profileId });
    if (detailResult.ok && detailResult.data) {
      const assistantMessage = findLatestAssistantMessage(detailResult.data);
      if (assistantMessage || attempt === attempts - 1) {
        return detailResult;
      }
    }

    if (attempt < attempts - 1) {
      await sleep(600);
    }
  }

  return toDesktopError("SESSION_TRANSCRIPT_TIMEOUT", "等待会话转录超时。", `sessionId=${sessionId}`, true);
}

export async function listInstanceWorkspaceSessions(userDataPath, instanceId, options = {}) {
  const contextResult = await getInstanceWithProfile(userDataPath, instanceId, options.profileId);
  if (!contextResult.ok || !contextResult.data) {
    return contextResult;
  }

  const { instance, profile } = contextResult.data;
  const pythonResult = await runWorkspacePython(
    instance,
    {
      mode: "list_sessions",
      stateDbPath: profile.stateDbPath,
      limit: options.limit ?? 30,
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!pythonResult.ok || !pythonResult.data) {
    return pythonResult;
  }

  return {
    ok: true,
    data: {
      instance,
      profile: createWorkspaceProfilePayload(profile),
      sessions: pythonResult.data.sessions ?? [],
    },
  };
}

export async function getInstanceWorkspaceSession(userDataPath, instanceId, sessionId, options = {}) {
  if (!sessionId || typeof sessionId !== "string") {
    return toDesktopError("SESSION_ID_REQUIRED", "会话 ID 不能为空。", "请提供要读取的会话 ID。", true);
  }

  const contextResult = await getInstanceWithProfile(userDataPath, instanceId, options.profileId);
  if (!contextResult.ok || !contextResult.data) {
    return contextResult;
  }

  const { instance, profile } = contextResult.data;
  const pythonResult = await runWorkspacePython(
    instance,
    {
      mode: "get_session",
      stateDbPath: profile.stateDbPath,
      sessionId,
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!pythonResult.ok || !pythonResult.data) {
    return pythonResult;
  }

  return {
    ok: true,
    data: {
      instance,
      profile: createWorkspaceProfilePayload(profile),
      session: pythonResult.data.session ?? null,
      messages: pythonResult.data.messages ?? [],
    },
  };
}

export async function getInstanceWorkspaceState(userDataPath, instanceId, options = {}) {
  const contextResult = await getInstanceWithProfile(userDataPath, instanceId, options.profileId);
  if (!contextResult.ok || !contextResult.data) {
    return contextResult;
  }

  const { instance, profile } = contextResult.data;
  const pythonResult = await runWorkspacePython(
    instance,
    {
      mode: "workspace_context",
      profileHome: profile.homePath,
      workspaceDir: profile.workspaceDir,
      backupsDir: profile.backupsDir,
      stateDbPath: profile.stateDbPath,
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!pythonResult.ok || !pythonResult.data) {
    return pythonResult;
  }

  return {
    ok: true,
    data: {
      instance,
      profile: createWorkspaceProfilePayload(profile),
      context: pythonResult.data,
    },
  };
}

export async function runInstanceWorkspaceChat(userDataPath, instanceId, input, options = {}) {
  const prompt = typeof input === "string" ? input.trim() : "";
  if (!prompt) {
    return toDesktopError("CHAT_INPUT_REQUIRED", "输入内容不能为空。", "请先输入会话内容。", true);
  }

  const contextResult = await getInstanceWithProfile(userDataPath, instanceId, options.profileId);
  if (!contextResult.ok || !contextResult.data) {
    return contextResult;
  }

  const { instance, profile } = contextResult.data;
  const chatResult = await runHermesChat(instance, profile, prompt, options.sessionId);
  const stdout = chatResult.data?.stdout ?? "";
  const stderr = chatResult.data?.stderr ?? "";
  const parsedOutput = parseHermesChatOutput(stdout);
  const effectiveSessionId = parsedOutput.sessionId || options.sessionId || "";

  if (!effectiveSessionId) {
    return toDesktopError(
      chatResult.error?.code ?? "CHAT_SESSION_ID_MISSING",
      chatResult.error?.message ?? "发送后未返回 session_id。",
      chatResult.error?.detail ?? stderr ?? stdout ?? "Hermes chat 未返回 session_id。",
      true
    );
  }

  const detailResult = await waitForSessionDetail(userDataPath, instanceId, profile.id, effectiveSessionId);
  const assistantMessage = detailResult.ok && detailResult.data ? findLatestAssistantMessage(detailResult.data) : null;
  const responseText = assistantMessage?.content?.trim() || parsedOutput.responseText || "";

  if (!chatResult.ok && !responseText) {
    return toDesktopError(
      chatResult.error?.code ?? "CHAT_QUERY_FAILED",
      chatResult.error?.message ?? "Hermes chat 执行失败。",
      [chatResult.error?.detail, stderr, stdout, `sessionId=${effectiveSessionId}`].filter(Boolean).join("\n"),
      true
    );
  }

  if (!responseText) {
    return toDesktopError(
      "CHAT_RESPONSE_MISSING",
      "会话未生成 assistant 回复。",
      [stderr, stdout, `sessionId=${effectiveSessionId}`].filter(Boolean).join("\n"),
      true
    );
  }

  return {
    ok: true,
    data: {
      instance,
      profile: createWorkspaceProfilePayload(profile),
      sessionId: effectiveSessionId,
      responseText,
      exitCode: chatResult.data?.exitCode ?? 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      session: detailResult.ok ? detailResult.data?.session ?? null : null,
      messages: detailResult.ok ? detailResult.data?.messages ?? [] : [],
    },
  };
}

export async function renameInstanceWorkspaceSession(userDataPath, instanceId, sessionId, input = {}) {
  const nextTitle = typeof input.title === "string" ? input.title.trim() : "";
  if (!sessionId || typeof sessionId !== "string") {
    return toDesktopError("SESSION_ID_REQUIRED", "会话 ID 不能为空。", "请提供要重命名的会话 ID。", true);
  }

  if (!nextTitle) {
    return toDesktopError("SESSION_TITLE_REQUIRED", "会话标题不能为空。", "请先填写新的会话标题。", true);
  }

  const contextResult = await getInstanceWithProfile(userDataPath, instanceId, input.profileId);
  if (!contextResult.ok || !contextResult.data) {
    return contextResult;
  }

  const { instance, profile } = contextResult.data;
  const renameResult = await runHermesProfileCommand(instance, profile, ["sessions", "rename", sessionId, nextTitle]);
  if (!renameResult.ok) {
    return renameResult;
  }

  return getInstanceWorkspaceSession(userDataPath, instanceId, sessionId, { profileId: profile.id });
}

export async function deleteInstanceWorkspaceSession(userDataPath, instanceId, sessionId, options = {}) {
  if (!sessionId || typeof sessionId !== "string") {
    return toDesktopError("SESSION_ID_REQUIRED", "会话 ID 不能为空。", "请提供要删除的会话 ID。", true);
  }

  const contextResult = await getInstanceWithProfile(userDataPath, instanceId, options.profileId);
  if (!contextResult.ok || !contextResult.data) {
    return contextResult;
  }

  const { instance, profile } = contextResult.data;
  const deleteResult = await runHermesProfileCommand(instance, profile, ["sessions", "delete", "--yes", sessionId]);
  if (!deleteResult.ok) {
    return deleteResult;
  }

  return {
    ok: true,
    data: {
      deletedSessionId: sessionId,
      instance,
      profile: createWorkspaceProfilePayload(profile),
    },
  };
}
