import { consoleInstances as fallbackInstances, getConsoleInstance, type ConsoleInstance } from "../data/console";
import { hermesProviders } from "../data/hermesOfficial";
import {
  getInstance,
  getInstanceState,
  listInstanceStates,
  startInstance,
  stopInstance,
  destroyInstance,
  type ConsoleInstanceRecord,
  type InstanceStateResult,
} from "./instances";

export type ConsoleRuntimeDiagnostics = NonNullable<ConsoleInstance["diagnostics"]> & {
  dockerAvailable?: boolean;
  dockerDaemonRunning?: boolean;
  gatewayReachable?: boolean;
  container?: Record<string, unknown> | null;
};

export type ConsoleRuntimeInstance = Omit<ConsoleInstance, "diagnostics"> & {
  createdAt?: string;
  lastCheckedAt?: string;
  lastRecoveredAt?: string;
  lastRecoveryResult?: string;
  lastOperationAt?: string;
  lastOperationType?: string;
  lastOperationResult?: string;
  image?: string;
  containerPort?: number;
  dockerCommand?: string[];
  remoteConfig?: ConsoleInstanceRecord["remote"];
  diagnostics?: ConsoleRuntimeDiagnostics;
};

export type RemoteStatusNarrative = {
  kind: "recoverable-loss" | "operation" | "recovery" | "error" | "diagnostics" | "summary";
  primaryDetail: string;
  secondaryDetail?: string;
};

export type RemoteDisplayState = {
  tone: "success" | "warning" | "offline";
  badgeLabel: string;
  statusValue: string;
  headline: string;
  support?: string;
  hint: string;
  activityTitle: string;
  activityTag: string;
};

export type RemoteOutcomeRow = {
  label: string;
  value: string;
};

export type RemoteActionFeedback = {
  variant: "success" | "warning";
  message: string;
};

export type RemoteNodeUxCopy = {
  description: string;
  primaryLabel?: string;
  primaryTo?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
  tertiaryLabel?: string;
  tertiaryTo?: string;
  nextStepTitle?: string;
  nextStepDetail?: string;
};

export const CONSOLE_RUNTIME_REFRESH_EVENT = "hermes-console:runtime-refresh";

export type ConsoleRuntimeRefreshDetail = {
  instanceId?: string;
  scope: "all" | "instance";
  reason: "recover" | "redeploy" | "gateway-restart" | "state-sync" | "destroy";
};

export function buildRemoteNodeUxCopy(
  page: "create-success" | "overview" | "environment" | "deployment" | "diagnostics",
  instanceId: string,
  options: { hasEnvironmentInspection?: boolean } = {}
): RemoteNodeUxCopy {
  const environmentTo = `/instance/${instanceId}/environment`;
  const deploymentTo = `/instance/${instanceId}/deployment`;
  const diagnosticsTo = `/instance/${instanceId}/diagnostics`;

  switch (page) {
    case "create-success":
      return {
        description: "远程节点已经创建完成；先到部署管理确认当前结果和下一步动作，再继续 AI 提供商与消息平台配置。",
        primaryLabel: "前往部署管理",
        primaryTo: deploymentTo,
        nextStepTitle: "下一步：前往部署管理查看当前结果面板",
      };
    case "overview":
      return {
        description: "概况页只保留节点层主入口：先看当前结果，再决定去环境检查、部署管理还是诊断。",
        primaryLabel: "前往部署管理",
        primaryTo: deploymentTo,
        secondaryLabel: "环境检查",
        secondaryTo: environmentTo,
        tertiaryLabel: "查看诊断",
        tertiaryTo: diagnosticsTo,
      };
    case "environment":
      return {
        description: "先看结果卡片，再处理建议修复项；SSH、远程目录、运行服务、端口与 Hermes CLI 都在这里汇总。",
        primaryLabel: options.hasEnvironmentInspection ? "重新读取环境" : "读取环境",
        secondaryLabel: "前往部署管理",
        secondaryTo: deploymentTo,
        tertiaryLabel: "查看诊断",
        tertiaryTo: diagnosticsTo,
        nextStepTitle: "下一步：前往部署管理",
        nextStepDetail: "环境检查通过后，先到部署管理确认运行服务、端口和当前结果；只有需要排障时再进入诊断。",
      };
    case "deployment":
      return {
        description: "这里直接回答“节点部署到了哪、当前运行服务是否正常、下一步该做什么”。需要重建部署、重启 Gateway 或清理实例目录，都从这里处理。",
        primaryLabel: "前往部署管理",
        primaryTo: deploymentTo,
        secondaryLabel: "环境检查",
        secondaryTo: environmentTo,
        tertiaryLabel: "查看诊断",
        tertiaryTo: diagnosticsTo,
        nextStepTitle: "下一步：确认当前结果面板",
        nextStepDetail: "先确认运行服务、端口和最近运维结果，再决定是否继续 AI 提供商或消息平台配置。",
      };
    case "diagnostics":
    default:
      return {
        description: "诊断页只负责回答当前哪里异常、该先回环境检查还是直接去部署管理处理。",
        primaryLabel: "前往部署管理",
        primaryTo: deploymentTo,
        secondaryLabel: "环境检查",
        secondaryTo: environmentTo,
        nextStepTitle: "下一步：前往部署管理",
        nextStepDetail: "确认异常归因后，优先去部署管理执行重建部署或重启 Gateway；需要复核前置条件时再回环境检查。",
      };
  }
}

function canUseDesktopRuntime() {
  return typeof window !== "undefined" && Boolean(window.hermesDesktop?.listInstanceStates);
}

function formatRelativeTime(iso?: string) {
  if (!iso) return "刚刚";

  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "刚刚";

  const diff = Date.now() - target.getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes <= 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function resolveProviderName(providerId?: string) {
  if (!providerId) return "待配置";
  return hermesProviders.find((provider) => provider.id === providerId)?.name ?? providerId;
}

function mapRuntimeStateToHealth(status: ConsoleInstanceRecord["status"]): ConsoleInstance["status"] {
  if (status === "running") return "normal";
  if (status === "warning" || status === "creating") return "warning";
  return "offline";
}

function mapRuntimeStateToConnectionLabel(status: ConsoleInstanceRecord["status"]) {
  if (status === "running") return "已连接";
  if (status === "warning" || status === "creating") return "警告";
  return "离线";
}

function getRemotePublishedPort(instance: ConsoleInstanceRecord) {
  return instance.docker?.publishedPort ?? 8642;
}

function getRemoteSshTarget(instance: ConsoleInstanceRecord) {
  if (!instance.remote) return instance.endpoint;
  return `${instance.remote.user}@${instance.remote.host}:${instance.remote.port}`;
}

function sanitizeRemotePromptNoise(message?: string | null) {
  if (!message) return message ?? undefined;

  const normalized = message
    .replace(/^[^\n]*?@.+?'s password:\s*/i, "")
    .replace(/^[^\n]*?@.+? password:\s*/i, "")
    .replace(/^[^\n]*?@[^:\n]+:\s*password:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || message;
}

export function getRecoverableRemoteContainerLossMessage() {
  return "受管远程运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。";
}

function matchesRecoverableRemoteContainerLoss(message?: string | null) {
  return /No such object:\s*hermes-console-|受管远程(?:容器|运行服务)已不存在/i.test(message ?? "");
}

export function isRecoverableRemoteContainerLoss(
  instanceOrMessage?: ConsoleInstanceRecord | ConsoleRuntimeInstance | ConsoleInstance | string | null,
  diagnostics?: InstanceStateResult["diagnostics"] | null
) {
  if (typeof instanceOrMessage === "string" || instanceOrMessage == null) {
    return matchesRecoverableRemoteContainerLoss(instanceOrMessage);
  }

  const combined = [
    instanceOrMessage.lastError,
    instanceOrMessage.summary,
    instanceOrMessage.diagnostics?.detail,
    diagnostics?.detail,
    diagnostics?.docker?.detail,
    diagnostics?.gateway?.detail,
  ].filter(Boolean).join(" ");

  return matchesRecoverableRemoteContainerLoss(combined);
}

function humanizeRemoteRuntimeMessage(message?: string | null) {
  const sanitized = sanitizeRemotePromptNoise(message);
  if (!sanitized) return sanitized ?? undefined;

  if (/curl:\s*\(56\).*connection reset by peer/i.test(sanitized)) {
    return "Gateway 连接被远端主动重置，请到部署管理检查运行服务并重启 Gateway。";
  }

  if (matchesRecoverableRemoteContainerLoss(sanitized)) {
    return getRecoverableRemoteContainerLossMessage();
  }

  if (/connection reset by peer/i.test(sanitized)) {
    return "远程连接被节点主动重置，请重新读取环境并检查 Gateway 与运行日志。";
  }

  return sanitized
    .replace(/Docker\s+daemon/gi, "运行服务")
    .replace(/Docker\s+Engine/gi, "运行服务")
    .replace(/Docker\s+容器/g, "运行服务")
    .replace(/远程\s*Docker/g, "远程运行服务")
    .replace(/本地\s*Docker/g, "本地运行服务")
    .replace(/Docker\s+正常/g, "运行服务正常")
    .replace(/Docker\s+已安装/g, "运行服务已安装")
    .replace(/Docker\s+与\s+Gateway/g, "运行服务与 Gateway")
    .replace(/确认\s+Docker/g, "确认运行服务")
    .replace(/容器/g, "运行服务");
}

function pickNarrativeMessage(...messages: Array<string | null | undefined>) {
  for (const message of messages) {
    const normalized = humanizeRemoteRuntimeMessage(message);
    if (normalized) return normalized;
  }
  return undefined;
}

type RemoteNarrativeContext = {
  rawRecord?: Partial<ConsoleInstanceRecord> | null;
  diagnostics?: InstanceStateResult["diagnostics"] | null;
};

export function resolveRemoteStatusNarrative(
  instance: ConsoleInstance | ConsoleRuntimeInstance,
  context: RemoteNarrativeContext = {}
): RemoteStatusNarrative {
  const rawRecord = context.rawRecord;
  const diagnostics = context.diagnostics;
  const lastOperationResult = pickNarrativeMessage(rawRecord?.lastOperationResult, instance.lastOperationResult);
  const lastRecoveryResult = pickNarrativeMessage(rawRecord?.lastRecoveryResult, instance.lastRecoveryResult);
  const lastError = pickNarrativeMessage(rawRecord?.lastError, instance.lastError);
  const diagnosticsDetail = pickNarrativeMessage(
    diagnostics?.detail,
    diagnostics?.gateway?.detail,
    diagnostics?.docker?.detail,
    instance.diagnostics?.detail,
    instance.diagnostics?.gatewayDetail,
    instance.diagnostics?.dockerDetail,
  );
  const summary = pickNarrativeMessage(instance.summary) ?? "当前没有可用的节点摘要。";

  if (
    instance.type === "remote"
    && instance.status !== "normal"
    && instance.runtimeState !== "running"
    && isRecoverableRemoteContainerLoss(instance, diagnostics)
  ) {
    return {
      kind: "recoverable-loss",
      primaryDetail: getRecoverableRemoteContainerLossMessage(),
      secondaryDetail: lastOperationResult ?? lastRecoveryResult ?? diagnosticsDetail ?? summary,
    };
  }

  if (lastOperationResult) {
    return {
      kind: "operation",
      primaryDetail: lastOperationResult,
      secondaryDetail: lastRecoveryResult ?? diagnosticsDetail ?? lastError ?? summary,
    };
  }

  if (lastRecoveryResult) {
    return {
      kind: "recovery",
      primaryDetail: lastRecoveryResult,
      secondaryDetail: diagnosticsDetail ?? lastError ?? summary,
    };
  }

  if (lastError) {
    return {
      kind: "error",
      primaryDetail: lastError,
      secondaryDetail: diagnosticsDetail ?? summary,
    };
  }

  if (diagnosticsDetail) {
    return {
      kind: "diagnostics",
      primaryDetail: diagnosticsDetail,
      secondaryDetail: summary,
    };
  }

  return {
    kind: "summary",
    primaryDetail: summary,
  };
}

export function resolveRemoteDisplayState(
  instance: ConsoleInstance | ConsoleRuntimeInstance,
  context: RemoteNarrativeContext = {}
): RemoteDisplayState {
  const narrative = resolveRemoteStatusNarrative(instance, context);

  if (narrative.kind === "recoverable-loss") {
    return {
      tone: "warning",
      badgeLabel: "待恢复",
      statusValue: "待恢复",
      headline: narrative.primaryDetail,
      support: narrative.secondaryDetail,
      hint: "请重新扫描并导入客户端创建的远程实例，或前往部署管理重新创建。",
      activityTitle: "远程实例待恢复",
      activityTag: "待恢复",
    };
  }

  if (instance.status === "normal" || instance.runtimeState === "running") {
    return {
      tone: "success",
      badgeLabel: "稳定",
      statusValue: "健康",
      headline: narrative.primaryDetail,
      support: narrative.secondaryDetail,
      hint: "节点已稳定，可继续前往部署管理、AI 提供商或消息平台完成后续配置。",
      activityTitle: narrative.kind === "operation" ? "远程节点运维已完成" : narrative.kind === "recovery" ? "远程实例已恢复" : "远程节点状态稳定",
      activityTag: narrative.kind === "operation" ? "已运维" : narrative.kind === "recovery" ? "已恢复" : "稳定",
    };
  }

  if (instance.status === "warning" || instance.runtimeState === "warning" || instance.runtimeState === "creating") {
    return {
      tone: "warning",
      badgeLabel: "需处理",
      statusValue: "需要关注",
      headline: narrative.primaryDetail,
      support: narrative.secondaryDetail,
      hint: "请先完成环境检查，再到部署管理处理运行服务、Gateway 或端口问题。",
      activityTitle: "远程节点需要处理",
      activityTag: "需处理",
    };
  }

  return {
    tone: "offline",
    badgeLabel: "离线",
    statusValue: "离线",
    headline: narrative.primaryDetail,
    support: narrative.secondaryDetail,
    hint: "节点当前离线，请先恢复 SSH、运行服务或 Gateway，再继续后续配置。",
    activityTitle: "远程节点当前离线",
    activityTag: "离线",
  };
}

export function buildRemoteOutcomePanel(
  instance: ConsoleInstance | ConsoleRuntimeInstance,
  context: RemoteNarrativeContext = {}
) {
  const narrative = resolveRemoteStatusNarrative(instance, context);
  const warningCurrent = pickNarrativeMessage(
    context.diagnostics?.detail,
    context.diagnostics?.gateway?.detail,
    context.diagnostics?.docker?.detail,
    context.rawRecord?.lastError,
    instance.diagnostics?.detail,
    instance.diagnostics?.gatewayDetail,
    instance.diagnostics?.dockerDetail,
    instance.lastError,
  );
  const currentConclusion = instance.status === "warning" || instance.runtimeState === "warning" || instance.runtimeState === "failed"
    ? (warningCurrent ?? instance.summary)
    : narrative.primaryDetail;
  const rows: RemoteOutcomeRow[] = [
    { label: "当前结论", value: currentConclusion },
    { label: "最近恢复", value: instance.lastRecoveryResult ?? "暂无恢复记录" },
    {
      label: "最近运维",
      value: instance.lastOperationResult
        ?? (instance.lastOperationAt ? `${instance.lastOperationType ?? "已执行"} · ${instance.lastOperationAt}` : "暂无运维结果"),
    },
    { label: "最近错误", value: instance.lastError ?? "无" },
  ];

  return {
    rows,
  };
}

export function buildRemoteActionFeedback(
  instance: ConsoleInstance | ConsoleRuntimeInstance,
  options: { action: "recover" | "redeploy" | "gateway-restart" }
): RemoteActionFeedback {
  if (options.action === "recover") {
    return {
      variant: "success",
      message: instance.lastRecoveryResult ?? "已重新接管远程实例并同步最新状态。",
    };
  }

  if (options.action === "gateway-restart") {
    return {
      variant: "success",
      message: instance.lastOperationType === "gateway-restart" && instance.lastOperationResult
        ? instance.lastOperationResult
        : "Gateway 已触发重启，最新节点状态已重新读取。",
    };
  }

  return {
    variant: "success",
    message: instance.lastOperationType === "redeploy" && instance.lastOperationResult
      ? instance.lastOperationResult
      : "已完成重建部署：节点已重新启动并刷新部署状态。",
  };
}

export function publishConsoleRuntimeRefresh(detail: ConsoleRuntimeRefreshDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONSOLE_RUNTIME_REFRESH_EVENT, { detail }));
}

export function subscribeConsoleRuntimeRefresh(listener: (detail: ConsoleRuntimeRefreshDetail) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ConsoleRuntimeRefreshDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(CONSOLE_RUNTIME_REFRESH_EVENT, handler as EventListener);
  return () => window.removeEventListener(CONSOLE_RUNTIME_REFRESH_EVENT, handler as EventListener);
}

export function buildRemoteSuccessFocusTarget(instanceId: string, section: "outcome-panel" = "outcome-panel") {
  return `/instance/${instanceId}/deployment?focus=${section}`;
}

export function buildRemoteWorkflowTarget(
  instanceId: string,
  step: "outcome-panel" | "environment" | "deployment" = "outcome-panel"
) {
  if (step === "environment") {
    return `/instance/${instanceId}/environment`;
  }

  if (step === "deployment") {
    return `/instance/${instanceId}/deployment`;
  }

  return buildRemoteSuccessFocusTarget(instanceId, "outcome-panel");
}

function buildSummary(instance: ConsoleInstanceRecord, diagnostics?: InstanceStateResult["diagnostics"]) {
  const remoteNarrative = instance.type === "remote"
    ? resolveRemoteStatusNarrative(
      {
        id: instance.id,
        name: instance.name,
        type: instance.type,
        runtime: instance.runtime,
        scope: instance.type === "local" ? "本地实例" : "远程实例",
        platform: instance.platformLabel ?? (instance.type === "local" ? "本地环境" : "远程环境"),
        installMethod: instance.type === "remote" ? "服务器部署" : "本机安装",
        version: "待检测",
        gateway: mapRuntimeStateToConnectionLabel(instance.status),
        api: diagnostics?.gateway?.reachable ? "已连接" : instance.status === "running" ? "警告" : "离线",
        defaultProfile: instance.defaultProfile ?? "默认档案",
        currentModel: instance.model ?? "待配置",
        provider: resolveProviderName(instance.providerId),
        lastActivity: formatRelativeTime(instance.lastCheckedAt || instance.createdAt),
        status: mapRuntimeStateToHealth(instance.status),
        summary: "",
        endpoint: instance.endpoint,
        security: instance.security === "localhost" ? "localhost 安全模式" : instance.security ?? "SSH 隧道",
        runtimeState: instance.status,
        createdAt: instance.createdAt,
        lastCheckedAt: instance.lastCheckedAt,
        lastRecoveredAt: instance.lastRecoveredAt,
        lastRecoveryResult: instance.lastRecoveryResult,
        lastOperationAt: instance.lastOperationAt,
        lastOperationType: instance.lastOperationType,
        lastOperationResult: instance.lastOperationResult,
        workspaceDir: instance.workspaceDir,
        hermesHome: instance.hermesHome,
        containerName: instance.docker?.containerName,
        publishedPort: instance.docker?.publishedPort,
        sshTarget: instance.type === "remote" ? getRemoteSshTarget(instance) : undefined,
        lastError: humanizeRemoteRuntimeMessage(instance.lastError),
        diagnostics: {
          dockerDetail: humanizeRemoteRuntimeMessage(diagnostics?.docker?.detail),
          gatewayDetail: humanizeRemoteRuntimeMessage(diagnostics?.gateway?.detail),
          detail: humanizeRemoteRuntimeMessage(diagnostics?.detail),
        },
      },
      { rawRecord: instance, diagnostics },
    )
    : null;

  if (remoteNarrative && (remoteNarrative.kind === "recoverable-loss" || instance.status === "warning" || instance.status === "failed")) {
    return remoteNarrative.primaryDetail;
  }

  if (instance.lastError) {
    return humanizeRemoteRuntimeMessage(instance.lastError) ?? instance.lastError;
  }

  const localRuntimeLabel = instance.runtime === "native" ? "本地网关" : "本地运行服务";
  const localStoppedLabel = instance.runtime === "native" ? "本地网关已停止，可在主页重新启动。" : "本地运行服务已停止，可在主页重新启动。";
  const localFailedLabel = instance.runtime === "native"
    ? "实例尚未成功启动，请先检查 Hermes gateway 与本地运行环境。"
    : "实例尚未成功启动，请先检查运行服务与 gateway 状态。";

  if (instance.status === "running") {
    return instance.type === "remote"
      ? `远程节点运行中，可通过 ${instance.endpoint} 管理服务与映射端口 ${getRemotePublishedPort(instance)}，远程目录位于 ${instance.workspaceDir}。`
      : `${localRuntimeLabel} 运行中，可通过 ${instance.endpoint} 访问。`;
  }

  if (instance.status === "stopped") {
    return instance.type === "remote"
      ? `远程节点已停止，可通过 SSH 重新启动服务并恢复映射端口 ${getRemotePublishedPort(instance)}。`
      : localStoppedLabel;
  }

  if (instance.status === "warning") {
    return instance.type === "remote"
      ? humanizeRemoteRuntimeMessage(diagnostics?.detail)
        ?? humanizeRemoteRuntimeMessage(diagnostics?.gateway?.detail)
        ?? humanizeRemoteRuntimeMessage(diagnostics?.docker?.detail)
        ?? "远程节点需要巡检，请先读取环境并确认运行服务与 Gateway 状态。"
      : diagnostics?.detail ?? diagnostics?.gateway?.detail ?? diagnostics?.docker?.detail ?? "实例状态需要检查。";
  }

  if (instance.status === "creating") {
    return instance.type === "remote"
      ? "远程节点目录已初始化，正在等待运行服务与 Gateway 完成部署。"
      : "实例目录已初始化，正在等待运行时完成。";
  }

  return instance.type === "remote"
    ? `远程节点尚未成功启动，请先检查 SSH、运行服务、映射端口 ${getRemotePublishedPort(instance)} 与远程目录。`
    : localFailedLabel;
}

function mapRecordToConsoleInstance(
  instance: ConsoleInstanceRecord,
  diagnostics?: InstanceStateResult["diagnostics"]
): ConsoleRuntimeInstance {
  const providerName = resolveProviderName(instance.providerId);
  const status = mapRuntimeStateToHealth(instance.status);

  return {
    id: instance.id,
    name: instance.name,
    type: instance.type,
    runtime: instance.runtime,
    scope: instance.type === "local" ? "本地实例" : "远程实例",
    platform: instance.platformLabel ?? (instance.type === "local" ? "本地环境" : "远程环境"),
    installMethod: instance.type === "remote" ? "服务器部署" : instance.runtime === "native" ? "本机安装" : "历史部署",
    version: "待检测",
    gateway: mapRuntimeStateToConnectionLabel(instance.status),
    api: diagnostics?.gateway?.reachable ? "已连接" : instance.status === "running" ? "警告" : "离线",
    defaultProfile: instance.defaultProfile ?? "默认档案",
    currentModel: instance.model ?? "待配置",
    provider: providerName,
    lastActivity: formatRelativeTime(instance.lastCheckedAt || instance.createdAt),
    status,
    summary: buildSummary(instance, diagnostics),
    endpoint: instance.endpoint,
    security: instance.security === "localhost" ? "localhost 安全模式" : instance.security ?? "SSH 隧道",
    runtimeState: instance.status,
    createdAt: instance.createdAt,
    lastCheckedAt: instance.lastCheckedAt,
    lastRecoveredAt: instance.lastRecoveredAt,
    lastRecoveryResult: instance.lastRecoveryResult,
    lastOperationAt: instance.lastOperationAt,
    lastOperationType: instance.lastOperationType,
    lastOperationResult: instance.lastOperationResult,
    workspaceDir: instance.workspaceDir,
    hermesHome: instance.hermesHome,
    containerName: instance.docker?.containerName,
    publishedPort: instance.docker?.publishedPort,
    image: instance.docker?.image,
    containerPort: instance.docker?.containerPort,
    dockerCommand: instance.docker?.command,
    remoteConfig: instance.type === "remote" ? instance.remote : undefined,
    sshTarget: instance.type === "remote" ? getRemoteSshTarget(instance) : undefined,
    lastError: humanizeRemoteRuntimeMessage(instance.lastError),
    diagnostics: {
      dockerDetail: humanizeRemoteRuntimeMessage(diagnostics?.docker?.detail),
      dockerAvailable: diagnostics?.docker?.available,
      dockerDaemonRunning: diagnostics?.docker?.daemonRunning,
      gatewayDetail: humanizeRemoteRuntimeMessage(diagnostics?.gateway?.detail),
      gatewayReachable: diagnostics?.gateway?.reachable,
      container: diagnostics?.container ?? null,
      detail: humanizeRemoteRuntimeMessage(diagnostics?.detail),
    },
  };
}

export { humanizeRemoteRuntimeMessage, mapRecordToConsoleInstance, sanitizeRemotePromptNoise };

export async function loadConsoleRuntimeDetailState(instanceId?: string) {
  if (!instanceId) {
    return {
      runtimeInstance: null,
      state: null,
      diagnostics: null,
    };
  }

  if (!canUseDesktopRuntime()) {
    const fallback = getConsoleInstance(instanceId);
    return {
      runtimeInstance: fallback,
      state: null,
      diagnostics: fallback?.diagnostics ?? null,
    };
  }

  const lookup = await getInstance(instanceId);
  if (!lookup.instance) {
    return {
      runtimeInstance: null,
      state: null,
      diagnostics: null,
    };
  }

  const state = await getInstanceState(instanceId);
  return {
    runtimeInstance: mapRecordToConsoleInstance(state.instance, state.diagnostics),
    state,
    diagnostics: state.diagnostics ?? null,
  };
}

export async function listConsoleRuntimeInstances() {
  if (!canUseDesktopRuntime()) {
    return fallbackInstances;
  }

  const result = await listInstanceStates();
  return result.instances.map((instance) => mapRecordToConsoleInstance(instance));
}

export async function getConsoleRuntimeInstance(instanceId?: string) {
  const detail = await loadConsoleRuntimeDetailState(instanceId);
  return detail.runtimeInstance;
}

export async function startConsoleRuntimeInstance(instanceId: string) {
  if (!canUseDesktopRuntime()) {
    throw new Error("当前环境无法执行实例启动操作。");
  }

  const result = await startInstance(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "实例启动失败。");
  }

  return mapRecordToConsoleInstance(result.data.instance, result.data.diagnostics);
}

export async function stopConsoleRuntimeInstance(instanceId: string) {
  if (!canUseDesktopRuntime()) {
    throw new Error("当前环境无法执行实例停止操作。");
  }

  const result = await stopInstance(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "实例停止失败。");
  }

  return mapRecordToConsoleInstance(result.data.instance, result.data.diagnostics);
}

export async function destroyConsoleRuntimeInstance(instanceId: string) {
  if (!canUseDesktopRuntime()) {
    throw new Error("当前环境无法执行实例清除操作。");
  }

  const result = await destroyInstance(instanceId);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "实例清除失败。");
  }

  return result.data;
}
