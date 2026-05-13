import path from "node:path";
import { listRegisteredInstances, upsertRegisteredInstance } from "./instance-registry.mjs";
import { inspectRemoteEnvironment } from "./remote-environment.mjs";
import { runRemoteDockerCommand } from "./remote-instance.mjs";

const CONTAINER_INTERNAL_PORT = 8642;

function nowIso() {
  return new Date().toISOString();
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

function normalizeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function buildRemoteConnection(input) {
  const authMode = input?.authMode === "password" ? "password" : "ssh_key";
  return {
    host: normalizeText(input?.host),
    port: normalizeText(input?.port, "22"),
    user: normalizeText(input?.user),
    authMode,
    keyPath: authMode === "ssh_key" ? normalizeText(input?.keyPath) : "",
    password: authMode === "password" ? String(input?.password ?? "") : "",
  };
}

function buildRemoteEndpoint({ host, port }) {
  return `ssh://${host}:${port || "22"}`;
}

function deriveStatus(container) {
  const status = String(container?.State?.Status || "").toLowerCase();
  if (status === "running") return "running";
  if (status === "created") return "creating";
  if (status === "exited" || status === "dead") return "stopped";
  return "warning";
}

function deriveGatewayPort(container) {
  const bindings = container?.NetworkSettings?.Ports?.["8642/tcp"];
  const hostPort = Array.isArray(bindings) ? bindings[0]?.HostPort : null;
  const numeric = Number(hostPort);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : CONTAINER_INTERNAL_PORT;
}

function deriveHermesHome(container) {
  const mount = Array.isArray(container?.Mounts)
    ? container.Mounts.find((entry) => entry?.Destination === "/opt/data" && typeof entry?.Source === "string")
    : null;
  return mount?.Source ? String(mount.Source) : "";
}

function deriveCommand(container) {
  if (Array.isArray(container?.Config?.Cmd) && container.Config.Cmd.length > 0) {
    return container.Config.Cmd.map((value) => String(value));
  }
  return ["gateway", "run"];
}

function deriveDisplayName(instanceId, containerName) {
  const normalized = normalizeText(instanceId);
  if (normalized) {
    return normalized
      .split("-")
      .filter(Boolean)
      .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
      .join(" ");
  }

  return normalizeText(containerName, "远程导入实例");
}

function deriveInstanceId(labels, containerName) {
  return normalizeText(labels?.["hermes.console.instance-id"], normalizeText(containerName).replace(/^hermes-console-/, ""));
}

function resolveImportedInstanceId(existingInstances, candidateInstanceId, host) {
  const duplicate = existingInstances.find((instance) => instance.id === candidateInstanceId);
  if (!duplicate) return candidateInstanceId;
  if (duplicate.type === "remote" && duplicate.remote?.host === host) {
    return candidateInstanceId;
  }

  let counter = 2;
  let nextId = `${candidateInstanceId}-${counter}`;
  while (existingInstances.some((instance) => instance.id === nextId)) {
    counter += 1;
    nextId = `${candidateInstanceId}-${counter}`;
  }
  return nextId;
}

function findExistingRemoteImport(existingInstances, candidate, host) {
  return existingInstances.find((instance) => (
    instance.type === "remote"
    && instance.remote?.host === host
    && (
      instance.docker?.containerName === candidate.containerName
      || (instance.hermesHome && candidate.hermesHome && instance.hermesHome === candidate.hermesHome)
    )
  )) ?? null;
}

function deriveRecoveredStatus(candidate) {
  if (candidate?.status === "running") return "running";
  if (candidate?.status === "creating") return "creating";
  if (candidate?.status === "stopped") return "stopped";
  return "warning";
}

function buildRecoveryResult(candidate, imported) {
  const base = imported ? "已导入客户端创建的远程实例，并恢复为可管理节点。" : "该远程实例已存在于 Console 中，已定位到现有实例。";
  return `${base} 当前容器 ${candidate.containerName}，映射端口 ${candidate.gatewayPort}。`;
}

function buildRecoveredRemoteInstanceRecord({ existing, candidate, scanResult, input, timestamp }) {
  const status = deriveRecoveredStatus(candidate);
  const recoveryResult = buildRecoveryResult(candidate, !existing);

  return {
    ...(existing ?? {}),
    id: existing?.id ?? candidate.instanceId,
    name: normalizeText(input?.name, existing?.name || candidate.name),
    type: "remote",
    runtime: "docker",
    hermesHome: candidate.hermesHome,
    workspaceDir: candidate.workspaceDir,
    endpoint: candidate.endpoint,
    status,
    createdAt: existing?.createdAt || timestamp,
    lastCheckedAt: timestamp,
    lastRecoveredAt: timestamp,
    lastRecoveryResult: recoveryResult,
    platformLabel: scanResult.data.inspection.system.platform || existing?.platformLabel || "Linux",
    security: existing?.security || "SSH tunnel",
    providerId: existing?.providerId,
    model: existing?.model,
    defaultProfile: existing?.defaultProfile || "默认档案",
    lastError: status === "warning" ? (candidate.detail || undefined) : undefined,
    docker: {
      image: candidate.image,
      containerName: candidate.containerName,
      publishedPort: candidate.gatewayPort,
      containerPort: CONTAINER_INTERNAL_PORT,
      command: candidate.command,
    },
    remote: {
      host: scanResult.data.host,
      port: scanResult.data.port,
      user: scanResult.data.user,
      authMode: input?.authMode === "password" ? "password" : "ssh_key",
      keyPath: input?.authMode === "ssh_key" ? normalizeText(input?.keyPath) : "",
      password: input?.authMode === "password" ? String(input?.password ?? "") : "",
      workdir: candidate.workdir,
    },
  };
}

async function inspectImportableRemoteContainers(connection) {
  const listResult = await runRemoteDockerCommand(
    connection,
    [
      "ps",
      "-a",
      "--filter",
      "label=hermes.console.managed=true",
      "--filter",
      "label=hermes.console.creator=desktop-client",
      "--format",
      "{{.Names}}",
    ],
    { timeoutMs: 30_000 }
  );

  if (!listResult.ok || !listResult.data) {
    return listResult;
  }

  const containerNames = String(listResult.data.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const containers = [];
  for (const containerName of containerNames) {
    const inspectResult = await runRemoteDockerCommand(connection, ["inspect", containerName], { timeoutMs: 20_000 });
    if (!inspectResult.ok || !inspectResult.data?.stdout) {
      continue;
    }

    try {
      const parsed = JSON.parse(inspectResult.data.stdout);
      if (Array.isArray(parsed) && parsed[0]) {
        containers.push(parsed[0]);
      }
    } catch {
      // ignore malformed entries
    }
  }

  return {
    ok: true,
    data: containers,
  };
}

function mapContainerToCandidate(connectionInput, inspection, container) {
  const labels = container?.Config?.Labels || {};
  const instanceId = deriveInstanceId(labels, container?.Name);
  const containerName = normalizeText(container?.Name, "").replace(/^\//, "");
  const hermesHome = deriveHermesHome(container);
  const workspaceDir = hermesHome ? path.posix.dirname(hermesHome) : "";
  const workdir = workspaceDir ? path.posix.dirname(workspaceDir) : normalizeText(inspection?.workdir, "/opt/hermes");
  const gatewayPort = deriveGatewayPort(container);

  return {
    instanceId,
    name: deriveDisplayName(instanceId, containerName),
    containerName,
    image: normalizeText(container?.Config?.Image, "nousresearch/hermes-agent:latest"),
    status: deriveStatus(container),
    gatewayPort,
    hermesHome,
    workspaceDir,
    workdir,
    endpoint: buildRemoteEndpoint(connectionInput),
    command: deriveCommand(container),
    detail: container?.State?.Error ? String(container.State.Error) : "",
  };
}

export async function scanImportableRemoteInstances({ input }) {
  const connection = buildRemoteConnection(input);
  if (!connection.host || !connection.user) {
    return toDesktopError("REMOTE_IMPORT_CONNECTION_REQUIRED", "远程连接信息不完整。", "请先填写远程主机与用户名。", true);
  }

  const inspection = await inspectRemoteEnvironment({
    ...connection,
    workdir: normalizeText(input?.workdir, "/opt/hermes"),
  });

  if (!inspection.ok || !inspection.data) {
    return inspection;
  }

  const containersResult = await inspectImportableRemoteContainers(connection);
  if (!containersResult.ok || !containersResult.data) {
    return containersResult;
  }

  return {
    ok: true,
    data: {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      candidates: containersResult.data.map((container) => mapContainerToCandidate(connection, inspection.data, container)),
      inspection: inspection.data,
    },
  };
}

export async function importExistingRemoteInstance({ userDataPath, input }) {
  const scanResult = await scanImportableRemoteInstances({ input });
  if (!scanResult.ok || !scanResult.data) {
    return scanResult;
  }

  const containerName = normalizeText(input?.containerName);
  const candidate = scanResult.data.candidates.find((item) => item.containerName === containerName);
  if (!candidate) {
    return toDesktopError("REMOTE_IMPORT_CANDIDATE_NOT_FOUND", "未找到可导入的远程实例。", "请先重新扫描，再选择一个客户端创建的远程实例。", true);
  }

  const registryResult = await listRegisteredInstances(userDataPath);
  if (!registryResult.ok || !registryResult.data) {
    return registryResult;
  }

  const duplicate = findExistingRemoteImport(registryResult.data.instances, candidate, scanResult.data.host);
  if (duplicate) {
    const timestamp = nowIso();
    const recoveredDuplicate = buildRecoveredRemoteInstanceRecord({
      existing: duplicate,
      candidate,
      scanResult,
      input,
      timestamp,
    });
    const upsertDuplicateResult = await upsertRegisteredInstance(userDataPath, recoveredDuplicate);
    if (!upsertDuplicateResult.ok || !upsertDuplicateResult.data) {
      return upsertDuplicateResult;
    }

    return {
      ok: true,
      data: {
        imported: false,
        message: recoveredDuplicate.lastRecoveryResult,
        registryFilePath: upsertDuplicateResult.data.filePath,
        instance: recoveredDuplicate,
        workspaceDir: recoveredDuplicate.workspaceDir,
        hermesHome: recoveredDuplicate.hermesHome,
        remote: {
          host: scanResult.data.host,
          port: scanResult.data.port,
          user: scanResult.data.user,
          workdir: recoveredDuplicate.remote?.workdir || candidate.workdir,
          containerName: recoveredDuplicate.docker?.containerName || candidate.containerName,
          gatewayPort: recoveredDuplicate.docker?.publishedPort || candidate.gatewayPort,
        },
      },
    };
  }

  const instanceId = resolveImportedInstanceId(registryResult.data.instances, candidate.instanceId, scanResult.data.host);
  const existing = registryResult.data.instances.find((instance) => instance.id === instanceId);
  const timestamp = nowIso();
  const instanceRecord = buildRecoveredRemoteInstanceRecord({
    existing: existing ? { ...existing, id: instanceId } : { id: instanceId },
    candidate,
    scanResult,
    input,
    timestamp,
  });

  const upsertResult = await upsertRegisteredInstance(userDataPath, instanceRecord);
  if (!upsertResult.ok || !upsertResult.data) {
    return upsertResult;
  }

  return {
    ok: true,
    data: {
      imported: true,
      message: instanceRecord.lastRecoveryResult,
      registryFilePath: upsertResult.data.filePath,
      instance: instanceRecord,
      workspaceDir: instanceRecord.workspaceDir,
      hermesHome: instanceRecord.hermesHome,
      remote: {
        host: scanResult.data.host,
        port: scanResult.data.port,
        user: scanResult.data.user,
        workdir: candidate.workdir,
        containerName: candidate.containerName,
        gatewayPort: candidate.gatewayPort,
      },
    },
  };
}
