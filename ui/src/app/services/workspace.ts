export interface WorkspaceProfile {
  id: string;
  name: string;
  isDefault: boolean;
  homePath: string;
  workspaceDir: string;
  stateDbPath: string;
  configPath: string;
  envPath: string;
  soulPath: string;
  logsDir: string;
  sessionsDir: string;
  backupsDir: string;
}

export interface WorkspaceSessionSummary {
  id: string;
  title: string;
  source: string;
  model: string;
  messageCount: number;
  preview: string;
  lastActive: string;
  lastActiveLabel: string;
  startedAt: string;
  startedLabel: string;
  status: '活跃' | '已结束';
}

export interface WorkspaceMessage {
  id: number;
  role: string;
  content: string;
  toolCallId: string;
  toolName: string;
  toolCalls: Array<Record<string, unknown>>;
  finishReason: string;
  timestamp: string;
  timestampLabel: string;
}

export interface WorkspaceContextEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  modifiedLabel: string;
}

export interface WorkspaceContext {
  profileHome: string;
  workspaceDir: string;
  stateDbPath: string;
  configPath: string;
  envPath: string;
  soulPath: string;
  logsDir: string;
  sessionsDir: string;
  backupsDir: string;
  exists: boolean;
  hasConfig: boolean;
  hasEnv: boolean;
  hasSoul: boolean;
  sessionCount: number;
  logCount: number;
  backupCount: number;
  entries: WorkspaceContextEntry[];
  latestSessionId: string;
}

export interface WorkspaceSessionsResult {
  instance: HermesRegisteredInstance;
  profile: WorkspaceProfile;
  sessions: WorkspaceSessionSummary[];
}

export interface WorkspaceSessionResult {
  instance: HermesRegisteredInstance;
  profile: WorkspaceProfile;
  session: WorkspaceSessionSummary | null;
  messages: WorkspaceMessage[];
}

export interface WorkspaceStateResult {
  instance: HermesRegisteredInstance;
  profile: WorkspaceProfile;
  context: WorkspaceContext;
}

export interface WorkspaceChatResult {
  instance: HermesRegisteredInstance;
  profile: WorkspaceProfile;
  sessionId: string;
  responseText: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  session: WorkspaceSessionSummary | null;
  messages: WorkspaceMessage[];
}

function ensureWorkspaceApi() {
  if (
    !window.hermesDesktop?.listInstanceWorkspaceSessions ||
    !window.hermesDesktop?.getInstanceWorkspaceSession ||
    !window.hermesDesktop?.getInstanceWorkspaceState ||
    !window.hermesDesktop?.runInstanceWorkspaceChat ||
    !window.hermesDesktop?.renameInstanceWorkspaceSession ||
    !window.hermesDesktop?.deleteInstanceWorkspaceSession
  ) {
    throw new Error('Hermes workspace API is unavailable.');
  }

  return window.hermesDesktop;
}

export async function listInstanceWorkspaceSessions(instanceId: string, options?: { profileId?: string; limit?: number }) {
  const desktop = ensureWorkspaceApi();
  const result = await desktop.listInstanceWorkspaceSessions!(instanceId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '无法读取实例会话列表。');
  }

  return result.data as WorkspaceSessionsResult;
}

export async function getInstanceWorkspaceSession(instanceId: string, sessionId: string, options?: { profileId?: string }) {
  const desktop = ensureWorkspaceApi();
  const result = await desktop.getInstanceWorkspaceSession!(instanceId, sessionId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '无法读取会话详情。');
  }

  return result.data as WorkspaceSessionResult;
}

export async function getInstanceWorkspaceState(instanceId: string, options?: { profileId?: string }) {
  const desktop = ensureWorkspaceApi();
  const result = await desktop.getInstanceWorkspaceState!(instanceId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '无法读取工作区上下文。');
  }

  return result.data as WorkspaceStateResult;
}

export async function runInstanceWorkspaceChat(instanceId: string, input: string, options?: { profileId?: string; sessionId?: string }) {
  const desktop = ensureWorkspaceApi();
  const result = await desktop.runInstanceWorkspaceChat!(instanceId, input, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '会话发送失败。');
  }

  return result.data as WorkspaceChatResult;
}

export async function renameInstanceWorkspaceSession(instanceId: string, sessionId: string, input: { profileId?: string; title: string }) {
  const desktop = ensureWorkspaceApi();
  const result = await desktop.renameInstanceWorkspaceSession!(instanceId, sessionId, input);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '会话重命名失败。');
  }

  return result.data as WorkspaceSessionResult;
}

export async function deleteInstanceWorkspaceSession(instanceId: string, sessionId: string, options?: { profileId?: string }) {
  const desktop = ensureWorkspaceApi();
  const result = await desktop.deleteInstanceWorkspaceSession!(instanceId, sessionId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? '会话删除失败。');
  }

  return result.data as { deletedSessionId: string; profile: WorkspaceProfile; instance: HermesRegisteredInstance };
}
