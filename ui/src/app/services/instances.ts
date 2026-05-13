export interface ConsoleInstanceRecord {
  id: string;
  name: string;
  type: "local" | "remote";
  runtime: "docker" | "native" | "ssh";
  hermesHome: string;
  workspaceDir: string;
  endpoint: string;
  status: "creating" | "running" | "stopped" | "warning" | "failed" | "unknown";
  createdAt: string;
  lastCheckedAt: string;
  platformLabel?: string;
  security?: string;
  providerId?: string;
  model?: string;
  defaultProfile?: string;
  lastError?: string;
  lastRecoveredAt?: string;
  lastRecoveryResult?: string;
  lastOperationAt?: string;
  lastOperationType?: string;
  lastOperationResult?: string;
  docker?: {
    image: string;
    containerName: string;
    publishedPort: number;
    containerPort: number;
    command: string[];
  };
  remote?: {
    host: string;
    port: string;
    user: string;
    authMode: "ssh_key" | "password";
    keyPath?: string;
    password?: string;
    workdir: string;
  };
  native?: {
    mode: "managed-process";
    pid: number | null;
    command: string[];
    binaryPath?: string;
  };
}

export interface ListInstancesResult {
  filePath: string;
  instances: ConsoleInstanceRecord[];
  recoveredFromCorruption?: boolean;
  backupPath?: string;
}

export interface GetInstanceResult {
  filePath: string;
  instance: ConsoleInstanceRecord | null;
  recoveredFromCorruption?: boolean;
  backupPath?: string;
}

export interface InstanceStateResult {
  filePath: string;
  instance: ConsoleInstanceRecord;
  diagnostics?: {
    docker?: {
      available: boolean;
      daemonRunning: boolean;
      detail: string;
    };
    container?: Record<string, unknown> | null;
    gateway?: {
      reachable: boolean;
      detail: string;
    };
    detail?: string;
  };
}

export interface CreateLocalDockerInstanceInput {
  name: string;
  instancesRoot?: string;
  providerId?: string;
  model?: string;
  defaultProfile?: string;
  autoStartDockerDesktop?: boolean;
  autoInstallDockerDesktop?: boolean;
  operationId?: string;
}

export interface CreateLocalNativeInstanceInput {
  name: string;
  instancesRoot?: string;
  providerId?: string;
  model?: string;
  defaultProfile?: string;
  installHermesIfMissing?: boolean;
  operationId?: string;
}

export interface CreateRemoteDockerInstanceInput {
  name: string;
  host: string;
  port?: string;
  user: string;
  authMode?: "ssh_key" | "password";
  keyPath?: string;
  password?: string;
  workdir?: string;
  providerId?: string;
  model?: string;
  defaultProfile?: string;
}

export interface CreateLocalDockerInstancePayload {
  instance: ConsoleInstanceRecord;
  registryFilePath: string;
  workspaceDir: string;
  hermesHome: string;
  runtimeDir: string;
  containerName: string;
  image: string;
  endpoint: string;
  healthUrl: string;
  createdAt: string;
}

export interface CreateLocalNativeInstancePayload {
  instance: ConsoleInstanceRecord;
  registryFilePath: string;
  workspaceDir: string;
  hermesHome: string;
  runtimeDir: string;
  endpoint: string;
  service: string;
  installer?: {
    alreadyInstalled?: boolean;
    scriptUrl: string;
    scriptPath?: string;
    binaryPath?: string;
    version?: string | null;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
  } | null;
  createdAt: string;
}

export interface CreateRemoteDockerInstancePayload {
  instance: ConsoleInstanceRecord;
  registryFilePath: string;
  workspaceDir: string;
  hermesHome: string;
  runtimeDir: string;
  containerName: string;
  image: string;
  endpoint: string;
  healthUrl: string;
  createdAt: string;
  remote: {
    host: string;
    port: string;
    user: string;
    workdir: string;
    gatewayPort: number;
  };
}

export interface ImportExistingLocalInstanceInput {
  name: string;
  hermesHome: string;
}

export interface ImportExistingLocalInstancePayload {
  imported: boolean;
  message: string;
  registryFilePath: string;
  instance: ConsoleInstanceRecord;
  workspaceDir: string;
  hermesHome: string;
}

export interface ScanImportableRemoteInstancesInput {
  host: string;
  port?: string;
  user: string;
  authMode?: "ssh_key" | "password";
  keyPath?: string;
  password?: string;
  workdir?: string;
}

export interface ImportableRemoteInstanceEntry {
  instanceId: string;
  name: string;
  containerName: string;
  image: string;
  status: "creating" | "running" | "stopped" | "warning";
  gatewayPort: number;
  hermesHome: string;
  workspaceDir: string;
  workdir: string;
  endpoint: string;
  command: string[];
  detail?: string;
}

export interface ScanImportableRemoteInstancesPayload {
  host: string;
  port: string;
  user: string;
  candidates: ImportableRemoteInstanceEntry[];
  inspection: HermesRemoteEnvironmentInspection;
}

export interface ImportExistingRemoteInstanceInput extends ScanImportableRemoteInstancesInput {
  containerName: string;
  name?: string;
}

export interface ImportExistingRemoteInstancePayload {
  imported: boolean;
  message: string;
  registryFilePath: string;
  instance: ConsoleInstanceRecord;
  workspaceDir: string;
  hermesHome: string;
  remote: {
    host: string;
    port: string;
    user: string;
    workdir: string;
    containerName: string;
    gatewayPort: number;
  };
}

function ensureDesktopInstancesApi() {
  if (
    !window.hermesDesktop?.listInstances ||
    !window.hermesDesktop?.getInstance ||
    !window.hermesDesktop?.createLocalDockerInstance ||
    !window.hermesDesktop?.createLocalNativeInstance ||
    !window.hermesDesktop?.importExistingLocalInstance ||
    !window.hermesDesktop?.listInstanceStates ||
    !window.hermesDesktop?.getInstanceState ||
    !window.hermesDesktop?.startInstance ||
    !window.hermesDesktop?.stopInstance ||
    !window.hermesDesktop?.destroyInstance
  ) {
    throw new Error("Hermes desktop instances API is unavailable.");
  }

  return window.hermesDesktop;
}

export async function listInstances() {
  const desktop = ensureDesktopInstancesApi();
  const result = await desktop.listInstances();

  if (!result.ok || !result.data) {
    throw new Error(result.error?.message ?? "Failed to list instances.");
  }

  return result.data as ListInstancesResult;
}

export async function getInstance(instanceId: string) {
  const desktop = ensureDesktopInstancesApi();
  const result = await desktop.getInstance(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.message ?? "Failed to get instance.");
  }

  return result.data as GetInstanceResult;
}

export async function createLocalDockerInstance(input: CreateLocalDockerInstanceInput) {
  const desktop = ensureDesktopInstancesApi();
  return desktop.createLocalDockerInstance(input) as Promise<HermesDesktopResult<CreateLocalDockerInstancePayload>>;
}

export async function createLocalNativeInstance(input: CreateLocalNativeInstanceInput) {
  const desktop = ensureDesktopInstancesApi();
  return desktop.createLocalNativeInstance(input) as Promise<HermesDesktopResult<CreateLocalNativeInstancePayload>>;
}

export async function createRemoteDockerInstance(input: CreateRemoteDockerInstanceInput) {
  if (!window.hermesDesktop?.createRemoteDockerInstance) {
    throw new Error("Hermes desktop remote instances API is unavailable.");
  }

  return window.hermesDesktop.createRemoteDockerInstance(
    input
  ) as Promise<HermesDesktopResult<CreateRemoteDockerInstancePayload>>;
}

export async function importExistingLocalInstance(input: ImportExistingLocalInstanceInput) {
  const desktop = ensureDesktopInstancesApi();
  return desktop.importExistingLocalInstance!(input) as Promise<HermesDesktopResult<ImportExistingLocalInstancePayload>>;
}

export async function scanImportableRemoteInstances(input: ScanImportableRemoteInstancesInput) {
  if (!window.hermesDesktop?.scanImportableRemoteInstances) {
    throw new Error("Hermes desktop remote import API is unavailable.");
  }

  return window.hermesDesktop.scanImportableRemoteInstances(
    input
  ) as Promise<HermesDesktopResult<ScanImportableRemoteInstancesPayload>>;
}

export async function importExistingRemoteInstance(input: ImportExistingRemoteInstanceInput) {
  if (!window.hermesDesktop?.importExistingRemoteInstance) {
    throw new Error("Hermes desktop remote import API is unavailable.");
  }

  return window.hermesDesktop.importExistingRemoteInstance(
    input
  ) as Promise<HermesDesktopResult<ImportExistingRemoteInstancePayload>>;
}

export async function listInstanceStates() {
  const desktop = ensureDesktopInstancesApi();
  const result = await desktop.listInstanceStates();

  if (!result.ok || !result.data) {
    throw new Error(result.error?.message ?? "Failed to list instance states.");
  }

  return result.data as ListInstancesResult;
}

export async function getInstanceState(instanceId: string) {
  const desktop = ensureDesktopInstancesApi();
  const result = await desktop.getInstanceState(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.message ?? "Failed to get instance state.");
  }

  return result.data as InstanceStateResult;
}

export async function startInstance(instanceId: string) {
  const desktop = ensureDesktopInstancesApi();
  return desktop.startInstance(instanceId) as Promise<HermesDesktopResult<InstanceStateResult>>;
}

export async function stopInstance(instanceId: string) {
  const desktop = ensureDesktopInstancesApi();
  return desktop.stopInstance(instanceId) as Promise<HermesDesktopResult<InstanceStateResult>>;
}

export async function destroyInstance(instanceId: string) {
  const desktop = ensureDesktopInstancesApi();
  return desktop.destroyInstance(instanceId) as Promise<HermesDesktopResult<HermesDestroyInstancePayload>>;
}
