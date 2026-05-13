export interface RuntimeDiagnostics {
  instance: HermesRegisteredInstance;
  diagnostics: HermesInstanceDiagnosticsPayload;
}

export interface RuntimeLogs {
  instance: HermesRegisteredInstance;
  requestedLog: HermesRuntimeLogKind;
  rawText: string;
  entries: HermesRuntimeLogEntry[];
  source: HermesInstanceLogsPayload['source'];
  diagnostics: HermesInstanceDiagnosticsPayload;
}

export interface RuntimeBackups {
  instance: HermesRegisteredInstance;
  backupsRoot: string;
  items: HermesInstanceBackupEntry[];
  created?: HermesInstanceBackupEntry | null;
  imported?: HermesInstanceBackupEntry | null;
  deletedBackupId?: string;
  clearedCount?: number;
}

export interface DestroyInstanceResult {
  removedInstanceId: string;
  deletedWorkspace: boolean;
  mode: "destroy" | "remove";
  message: string;
}

function ensureMaintenanceApi() {
  if (
    !window.hermesDesktop?.pickPath ||
    !window.hermesDesktop?.getInstanceLogs ||
    !window.hermesDesktop?.getInstanceDiagnostics ||
    !window.hermesDesktop?.listInstanceBackups ||
    !window.hermesDesktop?.createInstanceBackup ||
    !window.hermesDesktop?.importInstanceBackup ||
    !window.hermesDesktop?.restoreInstanceBackup ||
    !window.hermesDesktop?.deleteInstanceBackup ||
    !window.hermesDesktop?.clearInstanceBackups ||
    !window.hermesDesktop?.destroyInstance
  ) {
    throw new Error('Hermes runtime maintenance API is unavailable.');
  }

  return window.hermesDesktop;
}

export async function getInstanceLogs(instanceId: string, options?: { kind?: HermesRuntimeLogKind; lines?: number; level?: string; search?: string; component?: string; since?: string; }) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.getInstanceLogs!(instanceId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '无法读取实例日志。');
  }

  return result.data as RuntimeLogs;
}

export async function getInstanceDiagnostics(instanceId: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.getInstanceDiagnostics!(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '无法读取实例诊断。');
  }

  return result.data as RuntimeDiagnostics;
}

export async function listInstanceBackups(instanceId: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.listInstanceBackups!(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '无法读取实例备份。');
  }

  return result.data as RuntimeBackups;
}

export async function createInstanceBackup(instanceId: string, options?: { quick?: boolean }) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.createInstanceBackup!(instanceId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '创建备份失败。');
  }

  return result.data as RuntimeBackups;
}

export async function pickBackupArchivePath() {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.pickPath!({
    type: "file",
    title: "选择 Hermes 备份文件",
    filters: [{ name: "Hermes Backup", extensions: ["zip"] }],
  });

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "选择备份文件失败。");
  }

  return result.data.path;
}

export async function importInstanceBackup(instanceId: string, sourcePath: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.importInstanceBackup!(instanceId, { sourcePath });

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '导入备份失败。');
  }

  return result.data as RuntimeBackups;
}

export async function restoreInstanceBackup(instanceId: string, backupId: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.restoreInstanceBackup!(instanceId, backupId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '恢复备份失败。');
  }

  return result.data;
}

export async function deleteInstanceBackup(instanceId: string, backupId: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.deleteInstanceBackup!(instanceId, backupId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '删除备份失败。');
  }

  return result.data as RuntimeBackups;
}

export async function clearInstanceBackups(instanceId: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.clearInstanceBackups!(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '清空备份失败。');
  }

  return result.data as RuntimeBackups;
}

export async function destroyInstance(instanceId: string) {
  const desktop = ensureMaintenanceApi();
  const result = await desktop.destroyInstance!(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '销毁实例失败。');
  }

  return result.data as DestroyInstanceResult;
}
