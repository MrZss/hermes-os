export {};

declare global {
  interface HermesDesktopError {
    code: string;
    message: string;
    detail?: string;
    recoverable: boolean;
  }

  interface HermesDesktopResult<T> {
    ok: boolean;
    data?: T;
    error?: HermesDesktopError;
  }

  interface HermesDesktopCommandOutput {
    args: string[];
    exitCode: number | null;
    stdout: string;
    stderr: string;
    binaryPath?: string;
  }

  interface HermesCompleteUninstallStep {
    id: string;
    label: string;
    status: "success" | "warning" | "skipped";
    detail: string;
    args?: string[];
    path?: string;
  }

  interface HermesCompleteUninstallPayload {
    mode: "complete";
    confirmationText: string;
    steps: HermesCompleteUninstallStep[];
    removedPaths: string[];
    removedInstanceIds: string[];
    remaining: {
      hermesBinaryPath: string;
      hermesBinaryExists: boolean;
      hermesHome: string;
      hermesHomeExists: boolean;
      registeredNativeInstanceIds: string[];
      hermesAvailable: boolean;
      hermesDetail: string;
    };
    summary: string;
  }

  interface HermesDesktopPaths {
    userDataPath: string;
    instancesRoot: string;
    homeDirectory: string;
    hostname: string;
    platform: string;
    shell: string;
  }

  interface HermesRemoteEnvironmentInput {
    host: string;
    port?: string;
    user: string;
    authMode: "ssh_key" | "password";
    keyPath?: string;
    password?: string;
    workdir?: string;
    gatewayPort?: number;
  }

  interface HermesRemoteEnvironmentInspection {
    host: string;
    port: string;
    user: string;
    authMode: "ssh_key" | "password";
    workdir: string;
    warning?: string;
    ssh: {
      reachable: boolean;
      detail: string;
      sshBinary: string;
      expectBinary: string;
      passwordSupported: boolean;
    };
    system: {
      platform: string;
      hostname: string;
      arch: string;
      remoteUser: string;
      homeDir?: string;
    };
    directory: {
      writable: boolean;
      detail: string;
    };
    hermes: {
      available: boolean;
      binaryPath: string;
      detail: string;
    };
    docker: {
      available: boolean;
      daemonRunning: boolean;
      version: string;
      detail: string;
    };
    disk: {
      availableGb: number | null;
      detail: string;
    };
    port: {
      port: number;
      requestedPort?: number;
      autoSelected?: boolean;
      available: boolean | null;
      detail: string;
    };
    raw: Record<string, string>;
  }

  interface HermesLocalEnvironmentInspection extends HermesDesktopPaths {
    hermes: {
      available: boolean;
      binaryPath: string;
      version: string | null;
      detail: string;
    };
    hermesHome: {
      path: string;
      exists: boolean;
    };
    hermesHomeExists: boolean;
    docker: {
      available: boolean;
      daemonRunning: boolean;
      detail: string;
    };
  }

  interface HermesNativeInstallProgressEvent {
    operationId?: string;
    scope?: "native" | "docker";
    stage:
      | "inspect"
      | "download"
      | "validate"
      | "run"
      | "verify"
      | "done"
      | "failed"
      | "docker-check"
      | "docker-install"
      | "docker-start"
      | "docker-ready"
      | "docker-image-inspect"
      | "docker-image-pull"
      | "docker-container";
    stream?: "stdout" | "stderr";
    message: string;
    detail?: string;
    at: string;
  }

  interface HermesRegisteredInstance {
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

  interface HermesListInstancesPayload {
    filePath: string;
    instances: HermesRegisteredInstance[];
    recoveredFromCorruption?: boolean;
    backupPath?: string;
  }

  interface HermesGetInstancePayload {
    filePath: string;
    instance: HermesRegisteredInstance | null;
    recoveredFromCorruption?: boolean;
    backupPath?: string;
  }

  interface HermesInstanceStatePayload {
    filePath: string;
    instance: HermesRegisteredInstance;
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

  interface HermesCreateLocalDockerInstanceInput {
    name: string;
    instancesRoot?: string;
    providerId?: string;
    model?: string;
    defaultProfile?: string;
    autoStartDockerDesktop?: boolean;
    autoInstallDockerDesktop?: boolean;
    operationId?: string;
  }

  interface HermesCreateLocalNativeInstanceInput {
    name: string;
    instancesRoot?: string;
    providerId?: string;
    model?: string;
    defaultProfile?: string;
    installHermesIfMissing?: boolean;
    operationId?: string;
  }

  interface HermesCreateRemoteDockerInstanceInput {
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

  interface HermesCreateLocalDockerInstancePayload {
    instance: HermesRegisteredInstance;
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

  interface HermesCreateLocalNativeInstancePayload {
    instance: HermesRegisteredInstance;
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

  interface HermesCreateRemoteDockerInstancePayload {
    instance: HermesRegisteredInstance;
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

  interface HermesImportExistingLocalInstanceInput {
    name: string;
    hermesHome: string;
  }

  interface HermesImportExistingLocalInstancePayload {
    imported: boolean;
    message: string;
    registryFilePath: string;
    instance: HermesRegisteredInstance;
    workspaceDir: string;
    hermesHome: string;
  }

  interface HermesScanImportableRemoteInstancesInput {
    host: string;
    port?: string;
    user: string;
    authMode?: "ssh_key" | "password";
    keyPath?: string;
    password?: string;
    workdir?: string;
  }

  interface HermesImportableRemoteInstanceEntry {
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

  interface HermesScanImportableRemoteInstancesPayload {
    host: string;
    port: string;
    user: string;
    candidates: HermesImportableRemoteInstanceEntry[];
    inspection: HermesRemoteEnvironmentInspection;
  }

  interface HermesImportExistingRemoteInstanceInput extends HermesScanImportableRemoteInstancesInput {
    containerName: string;
    name?: string;
  }

  interface HermesImportExistingRemoteInstancePayload {
    imported: boolean;
    message: string;
    registryFilePath: string;
    instance: HermesRegisteredInstance;
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

  type HermesRuntimeLogKind = "agent" | "gateway" | "errors";

  interface HermesRuntimeLogEntry {
    id: string;
    timestamp: string;
    level: string;
    component: string;
    message: string;
    raw: string;
  }

  interface HermesInstanceDiagnosticsPayload {
    checkedAt: string;
    statusText: string;
    doctorText: string;
    resources: {
      cpuPercent: number | null;
      memoryPercent: number | null;
      memoryUsage: string;
    };
    services: Array<{
      name: string;
      status: "正常" | "警告" | "离线";
      detail: string;
    }>;
    hints: string[];
  }

  interface HermesInstanceLogsPayload {
    instance: HermesRegisteredInstance;
    requestedLog: HermesRuntimeLogKind;
    rawText: string;
    entries: HermesRuntimeLogEntry[];
    source: {
      type: string;
      path: string;
      detail: string;
    };
    diagnostics: HermesInstanceDiagnosticsPayload;
  }

  interface HermesInstanceBackupEntry {
    id: string;
    fileName: string;
    createdAt: string;
    createdLabel: string;
    sizeBytes: number;
    sizeLabel: string;
    type: string;
    scope: string;
    status: string;
    location: string;
  }

  interface HermesInstanceBackupsPayload {
    instance: HermesRegisteredInstance;
    backupsRoot: string;
    items: HermesInstanceBackupEntry[];
    created?: HermesInstanceBackupEntry | null;
    imported?: HermesInstanceBackupEntry | null;
    deletedBackupId?: string;
    clearedCount?: number;
  }

  interface HermesDestroyInstancePayload {
    removedInstanceId: string;
    deletedWorkspace: boolean;
    mode: "destroy" | "remove";
    message: string;
  }

  interface HermesWorkspaceProfilePayload {
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

  interface HermesWorkspaceSessionSummary {
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
    status: "活跃" | "已结束";
  }

  interface HermesWorkspaceMessage {
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

  interface HermesWorkspaceContextEntry {
    name: string;
    path: string;
    type: "dir" | "file";
    sizeBytes: number;
    sizeLabel: string;
    modifiedAt: string;
    modifiedLabel: string;
  }

  interface HermesWorkspaceContextPayload {
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
    entries: HermesWorkspaceContextEntry[];
    latestSessionId: string;
  }

  interface HermesInstanceWorkspaceSessionsPayload {
    instance: HermesRegisteredInstance;
    profile: HermesWorkspaceProfilePayload;
    sessions: HermesWorkspaceSessionSummary[];
  }

  interface HermesInstanceWorkspaceSessionPayload {
    instance: HermesRegisteredInstance;
    profile: HermesWorkspaceProfilePayload;
    session: HermesWorkspaceSessionSummary | null;
    messages: HermesWorkspaceMessage[];
  }

  interface HermesInstanceWorkspaceStatePayload {
    instance: HermesRegisteredInstance;
    profile: HermesWorkspaceProfilePayload;
    context: HermesWorkspaceContextPayload;
  }

  interface HermesInstanceWorkspaceChatPayload {
    instance: HermesRegisteredInstance;
    profile: HermesWorkspaceProfilePayload;
    sessionId: string;
    responseText: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    session: HermesWorkspaceSessionSummary | null;
    messages: HermesWorkspaceMessage[];
  }


  type HermesOfficialProviderStatus = "已连接" | "未完成" | "异常";
  type HermesOfficialProfileGatewayStatus = "已启用" | "未启用" | "异常";
  type HermesOfficialIntegrationStatus = "已启用" | "未启用" | "异常";
  type HermesOfficialIntegrationHealth = "活跃" | "未同步" | "待配置";

  interface HermesOfficialConfigField {
    key: string;
    label: string;
    value: string;
    kind?: "text" | "password" | "readonly";
    readOnly?: boolean;
    secret?: boolean;
    required?: boolean;
  }

  interface HermesOfficialProfileEntry {
    id: string;
    name: string;
    isDefault: boolean;
    providerId: string;
    model: string;
    sessions: number;
    lastUsed: string;
    gatewayStatus: HermesOfficialProfileGatewayStatus;
    description: string;
  }

  interface HermesOfficialProviderEntry {
    id: string;
    name: string;
    providerType: "OAuth" | "API Key" | "Custom Endpoint" | "Self-Hosted";
    status: HermesOfficialProviderStatus;
    authSummary: string;
    authMethods?: Array<{
      id: "oauth" | "api-key" | "endpoint";
      label: string;
      detail: string;
      command?: string;
    }>;
    models: string[];
    defaultModel: string;
    isDefault?: boolean;
    modelSummary: string;
    detail: string;
    fields: HermesOfficialConfigField[];
  }

  interface HermesOfficialIntegrationEntry {
    id: string;
    name: string;
    group: "消息平台" | "程序化接入" | "扩展入口";
    mode: "polling" | "webhook" | "websocket" | "callback" | "oauth" | "token" | "local" | "proxy";
    status: HermesOfficialIntegrationStatus;
    health: HermesOfficialIntegrationHealth;
    authLabel: string;
    summary: string;
    detail: string;
    fields: HermesOfficialConfigField[];
  }

  interface HermesInstanceOfficialStatePayload {
    instance: HermesRegisteredInstance;
    profiles: HermesOfficialProfileEntry[];
    providers: HermesOfficialProviderEntry[];
    integrations: HermesOfficialIntegrationEntry[];
    sources: {
      hermesHome: string;
      configPath: string;
      envPath: string;
      authPath: string;
      profilesRoot: string;
      selectedProfileId: string;
      selectedProfileHome: string;
    };
  }

  interface HermesOfficialProfileActionPayload {
    message: string;
    profileId?: string;
    previousProfileId?: string;
    outputPath?: string;
    archivePath?: string;
  }

  interface HermesOfficialConfigActionPayload {
    message: string;
    profileId: string;
    integrationId?: string;
    updatedKeys: string[];
    state?: HermesInstanceOfficialStatePayload;
  }

  interface HermesOfficialProviderAuthPayload {
    message: string;
    profileId: string;
    providerId: string;
    command: string[];
    output: string;
    state?: HermesInstanceOfficialStatePayload;
  }

  interface HermesOfficialPairingActionPayload {
    message: string;
    profileId: string;
    integrationId: string;
    platformId: string;
    pairingCode: string;
    output: string;
    state?: HermesInstanceOfficialStatePayload;
  }

  interface HermesWeixinQrLoginStartPayload {
    requestId: string;
    qrcodeUrl: string;
    expiresAt: string;
    status: "waiting";
    message: string;
  }

  interface HermesWeixinQrLoginPollPayload {
    status: "waiting" | "scanned" | "confirmed" | "expired" | "cancelled";
    message: string;
    profileId?: string;
    accountId?: string;
    userId?: string;
    updatedKeys?: string[];
    accountPath?: string;
    state?: HermesInstanceOfficialStatePayload;
  }

  interface HermesProviderTestEntry {
    instanceId: string;
    profileId: string;
    providerId: string;
    checkedAt: string;
    status: "verified" | "failed" | "configured";
    summary: string;
    detail: string;
    source: "doctor" | "http" | "config";
  }

  interface HermesProviderTestsPayload {
    instanceId: string;
    profileId: string;
    entries: HermesProviderTestEntry[];
  }

  interface Window {
    hermesDesktop?: {
      platform?: string;
      shell?: string;
      homeDirectory?: string;
      hostname?: string;
      getDesktopPaths?: () => Promise<HermesDesktopPaths>;
      inspectLocalEnvironment?: () => Promise<HermesLocalEnvironmentInspection>;
      suggestLocalSshKeyPath: () => Promise<string>;
      inspectRemoteEnvironment?: (
        input: HermesRemoteEnvironmentInput
      ) => Promise<HermesDesktopResult<HermesRemoteEnvironmentInspection>>;
      runHermesCommand?: (
        args: string[],
        options?: { cwd?: string; timeoutMs?: number }
      ) => Promise<HermesDesktopResult<HermesDesktopCommandOutput>>;
      completeHermesUninstall?: (
        input: { confirmText: string }
      ) => Promise<HermesDesktopResult<HermesCompleteUninstallPayload>>;
      runDockerCommand?: (
        args: string[],
        options?: { cwd?: string; timeoutMs?: number }
      ) => Promise<HermesDesktopResult<HermesDesktopCommandOutput>>;
      openPath?: (
        targetPath: string
      ) => Promise<HermesDesktopResult<{ path: string }>>;
      pickPath?: (
        options?: { type?: "file" | "directory"; title?: string; filters?: Array<{ name: string; extensions: string[] }> }
      ) => Promise<HermesDesktopResult<{ path: string }>>;
      listInstances?: () => Promise<HermesDesktopResult<HermesListInstancesPayload>>;
      getInstance?: (instanceId: string) => Promise<HermesDesktopResult<HermesGetInstancePayload>>;
      listInstanceStates?: () => Promise<HermesDesktopResult<HermesListInstancesPayload>>;
      getInstanceState?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceStatePayload>>;
      getInstanceOfficialState?: (
        instanceId: string,
        options?: { profileId?: string }
      ) => Promise<HermesDesktopResult<HermesInstanceOfficialStatePayload>>;
      createInstanceProfile?: (
        instanceId: string,
        input: { name: string; clone?: boolean; cloneAll?: boolean; cloneFrom?: string }
      ) => Promise<HermesDesktopResult<HermesOfficialProfileActionPayload>>;
      renameInstanceProfile?: (
        instanceId: string,
        input: { profileId: string; nextName: string }
      ) => Promise<HermesDesktopResult<HermesOfficialProfileActionPayload>>;
      setDefaultInstanceProfile?: (
        instanceId: string,
        input: { profileId: string }
      ) => Promise<HermesDesktopResult<HermesOfficialProfileActionPayload>>;
      deleteInstanceProfile?: (
        instanceId: string,
        input: { profileId: string }
      ) => Promise<HermesDesktopResult<HermesOfficialProfileActionPayload>>;
      exportInstanceProfile?: (
        instanceId: string,
        input: { profileId: string; outputPath?: string }
      ) => Promise<HermesDesktopResult<HermesOfficialProfileActionPayload>>;
      importInstanceProfile?: (
        instanceId: string,
        input: { archivePath: string; profileName?: string }
      ) => Promise<HermesDesktopResult<HermesOfficialProfileActionPayload>>;
      updateInstanceProviderConfig?: (
        instanceId: string,
        input: {
          profileId?: string;
          providerId: string;
          defaultModel?: string;
          baseUrl?: string;
          apiMode?: string;
          apiKey?: string;
          env?: Record<string, string>;
        }
      ) => Promise<HermesDesktopResult<HermesOfficialConfigActionPayload>>;
      authenticateInstanceProvider?: (
        instanceId: string,
        input: {
          profileId?: string;
          providerId: string;
          authType?: "oauth";
        }
      ) => Promise<HermesDesktopResult<HermesOfficialProviderAuthPayload>>;
      approveInstanceMessagingPairing?: (
        instanceId: string,
        input: {
          profileId?: string;
          integrationId: string;
          code: string;
        }
      ) => Promise<HermesDesktopResult<HermesOfficialPairingActionPayload>>;
      updateInstanceIntegrationConfig?: (
        instanceId: string,
        input: {
          profileId?: string;
          integrationId: string;
          fields?: Record<string, string>;
          pluginsEnabled?: boolean;
          apiServerEnabled?: boolean;
        }
      ) => Promise<HermesDesktopResult<HermesOfficialConfigActionPayload>>;
      startInstanceWeixinQrLogin?: (
        instanceId: string,
        input?: { profileId?: string }
      ) => Promise<HermesDesktopResult<HermesWeixinQrLoginStartPayload>>;
      pollInstanceWeixinQrLogin?: (
        instanceId: string,
        input: { requestId: string }
      ) => Promise<HermesDesktopResult<HermesWeixinQrLoginPollPayload>>;
      cancelInstanceWeixinQrLogin?: (
        instanceId: string,
        input: { requestId?: string }
      ) => Promise<HermesDesktopResult<HermesWeixinQrLoginPollPayload>>;
      listInstanceProviderTests?: (
        instanceId: string,
        options?: { profileId?: string }
      ) => Promise<HermesDesktopResult<HermesProviderTestsPayload>>;
      testInstanceProvider?: (
        instanceId: string,
        input: { profileId?: string; providerId: string }
      ) => Promise<HermesDesktopResult<HermesProviderTestEntry>>;
      startInstanceGateway?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceStatePayload>>;
      stopInstanceGateway?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceStatePayload>>;
      restartInstanceGateway?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceStatePayload>>;
      startInstance?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceStatePayload>>;
      stopInstance?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceStatePayload>>;
      createLocalDockerInstance?: (
        input: HermesCreateLocalDockerInstanceInput
      ) => Promise<HermesDesktopResult<HermesCreateLocalDockerInstancePayload>>;
      createLocalNativeInstance?: (
        input: HermesCreateLocalNativeInstanceInput
      ) => Promise<HermesDesktopResult<HermesCreateLocalNativeInstancePayload>>;
      onNativeInstallProgress?: (
        callback: (event: HermesNativeInstallProgressEvent) => void
      ) => () => void;
      onInstallProgress?: (
        callback: (event: HermesNativeInstallProgressEvent) => void
      ) => () => void;
      createRemoteDockerInstance?: (
        input: HermesCreateRemoteDockerInstanceInput
      ) => Promise<HermesDesktopResult<HermesCreateRemoteDockerInstancePayload>>;
      importExistingLocalInstance?: (
        input: HermesImportExistingLocalInstanceInput
      ) => Promise<HermesDesktopResult<HermesImportExistingLocalInstancePayload>>;
      scanImportableRemoteInstances?: (
        input: HermesScanImportableRemoteInstancesInput
      ) => Promise<HermesDesktopResult<HermesScanImportableRemoteInstancesPayload>>;
      importExistingRemoteInstance?: (
        input: HermesImportExistingRemoteInstanceInput
      ) => Promise<HermesDesktopResult<HermesImportExistingRemoteInstancePayload>>;
      getInstanceLogs?: (
        instanceId: string,
        options?: { kind?: HermesRuntimeLogKind; lines?: number; level?: string; search?: string; component?: string; since?: string }
      ) => Promise<HermesDesktopResult<HermesInstanceLogsPayload>>;
      getInstanceDiagnostics?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<{ instance: HermesRegisteredInstance; diagnostics: HermesInstanceDiagnosticsPayload }>>;
      listInstanceBackups?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceBackupsPayload>>;
      createInstanceBackup?: (
        instanceId: string,
        options?: { quick?: boolean }
      ) => Promise<HermesDesktopResult<HermesInstanceBackupsPayload>>;
      importInstanceBackup?: (
        instanceId: string,
        input: { sourcePath: string }
      ) => Promise<HermesDesktopResult<HermesInstanceBackupsPayload>>;
      restoreInstanceBackup?: (
        instanceId: string,
        backupId: string
      ) => Promise<HermesDesktopResult<{ restoredAt: string; backup: HermesInstanceBackupEntry }>>;
      deleteInstanceBackup?: (
        instanceId: string,
        backupId: string
      ) => Promise<HermesDesktopResult<HermesInstanceBackupsPayload>>;
      clearInstanceBackups?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesInstanceBackupsPayload>>;
      destroyInstance?: (
        instanceId: string
      ) => Promise<HermesDesktopResult<HermesDestroyInstancePayload>>;
      listInstanceWorkspaceSessions?: (
        instanceId: string,
        options?: { profileId?: string; limit?: number }
      ) => Promise<HermesDesktopResult<HermesInstanceWorkspaceSessionsPayload>>;
      getInstanceWorkspaceSession?: (
        instanceId: string,
        sessionId: string,
        options?: { profileId?: string }
      ) => Promise<HermesDesktopResult<HermesInstanceWorkspaceSessionPayload>>;
      getInstanceWorkspaceState?: (
        instanceId: string,
        options?: { profileId?: string }
      ) => Promise<HermesDesktopResult<HermesInstanceWorkspaceStatePayload>>;
      runInstanceWorkspaceChat?: (
        instanceId: string,
        input: string,
        options?: { profileId?: string; sessionId?: string }
      ) => Promise<HermesDesktopResult<HermesInstanceWorkspaceChatPayload>>;
      renameInstanceWorkspaceSession?: (
        instanceId: string,
        sessionId: string,
        input: { profileId?: string; title: string }
      ) => Promise<HermesDesktopResult<HermesInstanceWorkspaceSessionPayload>>;
      deleteInstanceWorkspaceSession?: (
        instanceId: string,
        sessionId: string,
        options?: { profileId?: string }
      ) => Promise<HermesDesktopResult<{ deletedSessionId: string; profile: HermesWorkspaceProfilePayload; instance: HermesRegisteredInstance }>>;
    };
  }
}
