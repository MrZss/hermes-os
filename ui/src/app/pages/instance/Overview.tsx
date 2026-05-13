import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Activity, Clock3, Database, LoaderCircle, MessageSquare, Play, RefreshCw, Settings, Shield, Square, Terminal, Trash2 } from "lucide-react";
import { Badge, StatusDot } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ImportExistingInstanceDialog } from "../../components/console/ImportExistingInstanceDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/console/PageHeader";
import {
  buildRemoteActionFeedback,
  buildRemoteNodeUxCopy,
  buildRemoteOutcomePanel,
  buildRemoteWorkflowTarget,
  destroyConsoleRuntimeInstance,
  isRecoverableRemoteContainerLoss,
  loadConsoleRuntimeDetailState,
  publishConsoleRuntimeRefresh,
  resolveRemoteDisplayState,
  resolveRemoteStatusNarrative,
  startConsoleRuntimeInstance,
  stopConsoleRuntimeInstance,
  subscribeConsoleRuntimeRefresh,
  type ConsoleRuntimeInstance,
} from "../../services/runtime";
import { consoleInstances, type ConsoleInstance } from "../../data/console";

type OverviewActionItem = {
  key: string;
  label: string;
  icon: typeof Activity;
  to?: string;
  variant: "primary" | "secondary" | "ghost" | "danger";
  intent?: "navigate" | "cleanup" | "start" | "stop";
};

type OverviewActionSection = {
  key: string;
  title: string;
  description: string;
  actions: OverviewActionItem[];
};

type OverviewActionModel = {
  primary: OverviewActionItem;
  sections: OverviewActionSection[];
};

type OverviewRenderedAction = OverviewActionItem & {
  disabled: boolean;
  busy: boolean;
  displayLabel: string;
};

type OverviewRenderedSection = OverviewActionSection & {
  actions: OverviewRenderedAction[];
};

type OverviewHeaderActionPlan = {
  primary: OverviewRenderedAction;
  sections: OverviewRenderedSection[];
};

function getStatusLabel(instance: ConsoleInstance) {
  if (instance.runtimeState === "running") return "稳定运行";
  if (instance.runtimeState === "warning" || instance.runtimeState === "creating") return "需要关注";
  if (instance.runtimeState === "stopped") return "已停止";
  if (instance.runtimeState === "failed") return "启动失败";
  return "未检测";
}

function getPublishedPortValue(instance: ConsoleInstance) {
  return instance.publishedPort ? String(instance.publishedPort) : "未分配";
}

function hasMissingRemoteContainer(instance: ConsoleInstance) {
  return instance.type === "remote" && isRecoverableRemoteContainerLoss(instance);
}

function getRemoteNodeCards(instance: ConsoleInstance) {
  const narrative = resolveRemoteStatusNarrative(instance);
  const display = resolveRemoteDisplayState(instance);
  return [
    {
      title: "节点状态",
      value: display.badgeLabel,
      detail: narrative.primaryDetail,
      icon: Activity,
      lead: null,
    },
    {
      title: "SSH 目标",
      value: instance.sshTarget ?? instance.endpoint,
      detail: instance.security,
      icon: Shield,
    },
    {
      title: "运行服务",
      value: instance.diagnostics?.dockerDetail ?? "待检测",
      detail: instance.containerName ?? "尚未创建运行服务",
      icon: Database,
    },
    {
      title: "Gateway 状态",
      value: instance.diagnostics?.gatewayDetail ?? instance.gateway,
      detail: `映射端口 ${getPublishedPortValue(instance)}`,
      icon: Terminal,
    },
  ];
}

export function buildRemoteNodeSnapshot(instance: ConsoleInstance) {
  const narrative = resolveRemoteStatusNarrative(instance);
  const display = resolveRemoteDisplayState(instance);
  const outcomePanel = buildRemoteOutcomePanel(instance);
  return {
    healthSignal: {
      label: "节点状态",
      detail: narrative.primaryDetail,
      secondaryDetail: narrative.secondaryDetail,
    },
    cards: getRemoteNodeCards(instance),
    coreRows: [
      { label: "SSH 目标", value: instance.sshTarget ?? instance.endpoint },
      { label: "运行服务", value: instance.diagnostics?.dockerDetail ?? "待检测" },
      { label: "Gateway 状态", value: instance.diagnostics?.gatewayDetail ?? instance.gateway },
      { label: "当前工作目录", value: instance.workspaceDir ?? "未检测到" },
      { label: "映射端口", value: getPublishedPortValue(instance) },
      { label: "最近恢复", value: instance.lastRecoveredAt ? new Date(instance.lastRecoveredAt).toLocaleString("zh-CN") : "未恢复" },
      { label: "最近运维", value: instance.lastOperationAt ? `${instance.lastOperationType ?? "已执行"} · ${new Date(instance.lastOperationAt).toLocaleString("zh-CN")}` : "暂无运维动作" },
      { label: "最近错误", value: narrative.kind === "error" ? narrative.primaryDetail : instance.lastError ?? "无" },
    ],
    signalRows: [
      { label: "运行服务标识", value: instance.containerName ?? "尚未创建" },
      { label: "远程目录", value: instance.workspaceDir ?? "未检测到" },
      { label: "节点入口", value: instance.endpoint },
      { label: "补充说明", value: narrative.primaryDetail },
    ],
    outcomeRows: outcomePanel.rows,
  };
}

export function buildOverviewActionModel(instance: ConsoleInstance | null) {
  if (!instance) return null;

  if (instance.type === "remote") {
    const remoteUx = buildRemoteNodeUxCopy("overview", instance.id);
    return {
      primary: { key: "deployment", label: remoteUx.primaryLabel ?? "前往部署管理", icon: Settings, to: remoteUx.primaryTo ?? `/instance/${instance.id}/deployment`, variant: "primary", intent: "navigate" } satisfies OverviewActionItem,
      sections: [
        {
          key: "workflow-order",
          title: "推荐顺序",
          description: remoteUx.description,
          actions: [
            { key: "read-environment", label: remoteUx.secondaryLabel ?? "环境检查", icon: Shield, to: remoteUx.secondaryTo ?? `/instance/${instance.id}/environment`, variant: "secondary", intent: "navigate" },
            { key: "rebuild-deployment", label: "重建部署", icon: RefreshCw, to: `/instance/${instance.id}/deployment`, variant: "secondary", intent: "navigate" },
            { key: "diagnostics", label: remoteUx.tertiaryLabel ?? "查看诊断", icon: Activity, to: remoteUx.tertiaryTo ?? `/instance/${instance.id}/diagnostics`, variant: "ghost", intent: "navigate" },
          ],
        },
        {
          key: "lifecycle-actions",
          title: "启动 / 停止 / 卸载",
          description: "所有节点生命周期操作都在概况主操作区直接可达，不再主打会话型入口。",
          actions: [
            { key: "start-node", label: instance.runtimeState === "failed" ? "重试启动" : "启动", icon: Play, variant: "secondary", intent: "start" },
            { key: "stop-node", label: "停止", icon: Square, variant: "ghost", intent: "stop" },
            { key: "cleanup-node", label: "卸载", icon: Trash2, variant: "danger", intent: "cleanup" },
          ],
        },
      ] satisfies OverviewActionSection[],
    } satisfies OverviewActionModel;
  }

  return {
    primary: { key: "open-chat", label: "打开会话", icon: MessageSquare, to: `/instance/${instance.id}/chat`, variant: "primary", intent: "navigate" } satisfies OverviewActionItem,
    sections: [],
  } satisfies OverviewActionModel;
}

export function buildOverviewHeaderActionPlan(
  instance: ConsoleInstance | null,
  options: { isActing: boolean; cleanupWorking: boolean }
) {
  const actionModel = buildOverviewActionModel(instance);
  if (!instance || !actionModel) return null;

  const canStart = instance.runtimeState === "stopped" || instance.runtimeState === "failed";
  const canStop = instance.runtimeState === "running" || instance.runtimeState === "warning";

  const decorateAction = (action: OverviewActionItem): OverviewRenderedAction => {
    const isStartAction = action.intent === "start";
    const isStopAction = action.intent === "stop";
    const busy = options.isActing && (isStartAction || isStopAction);
    const disabled = isStartAction
      ? !canStart || options.isActing
      : isStopAction
        ? !canStop || options.isActing
        : action.intent === "cleanup"
          ? options.cleanupWorking || options.isActing
          : false;

    return {
      ...action,
      disabled,
      busy,
      displayLabel: busy ? "处理中..." : action.label,
    };
  };

  if (instance.type === "remote") {
    return {
      primary: decorateAction(actionModel.primary),
      sections: actionModel.sections.map((section) => ({
        ...section,
        actions: section.actions.map((action) => decorateAction(action)),
      })),
    } satisfies OverviewHeaderActionPlan;
  }

  return {
    primary: decorateAction(actionModel.primary),
    sections: [
      {
        key: "local-runtime",
        title: "本地运行控制",
        description: "本地实例保留启动、停止与会话入口。",
        actions: [
          decorateAction({ key: "stop-local", label: "停止", icon: Square, variant: "ghost", intent: "stop" }),
          decorateAction({ key: "start-local", label: instance.runtimeState === "failed" ? "重试部署" : "启动", icon: Play, variant: "secondary", intent: "start" }),
        ],
      },
    ],
  } satisfies OverviewHeaderActionPlan;
}

export function Overview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = id ? consoleInstances.find((item) => item.id === id) ?? null : null;
  const [instance, setInstance] = useState<ConsoleInstance | null>(desktopRuntimeAvailable ? null : fallbackInstance);
  const [loadingInstance, setLoadingInstance] = useState(desktopRuntimeAvailable);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState("");
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);
  const [cleanupWorking, setCleanupWorking] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const load = async () => {
      setLoadingInstance(true);
      try {
        const detail = await loadConsoleRuntimeDetailState(id);
        const nextInstance = detail.runtimeInstance;

        if (cancelled) return;

        setInstance(nextInstance);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;

        setInstance(desktopRuntimeAvailable ? null : fallbackInstance);
        setLoadError(error instanceof Error ? error.message : "读取实例状态失败。");
      } finally {
        if (!cancelled) {
          setLoadingInstance(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [desktopRuntimeAvailable, fallbackInstance, id]);

  useEffect(() => {
    if (!id) return;
    return subscribeConsoleRuntimeRefresh(async (detail) => {
      if (detail.scope === "all" || detail.instanceId === id) {
        const next = await loadConsoleRuntimeDetailState(id);
        setInstance(next.runtimeInstance);
      }
    });
  }, [id]);

  const stats = useMemo(() => {
    if (!instance) return [];
    const remoteDisplay = instance.type === "remote" ? resolveRemoteDisplayState(instance) : null;

    return [
      {
        title: "运行状态",
        value: remoteDisplay?.badgeLabel ?? getStatusLabel(instance),
        detail: instance.type === "remote" ? remoteDisplay?.headline ?? resolveRemoteStatusNarrative(instance).primaryDetail : instance.diagnostics?.detail ?? instance.summary,
        icon: Activity,
        lead: <StatusDot status={instance.status === "normal" ? "running" : instance.status === "warning" ? "warning" : "offline"} />,
      },
      {
        title: "访问端点",
        value: instance.endpoint,
        detail: instance.security,
        icon: Shield,
      },
      {
        title: "当前档案",
        value: instance.defaultProfile,
        detail: instance.hermesHome ?? "未检测到 HERMES_HOME",
        icon: Terminal,
      },
      {
        title: "当前模型",
        value: instance.currentModel,
        detail: `${instance.provider} · 网关 ${instance.gateway}`,
        icon: Database,
      },
    ];
  }, [instance]);

  const detailRows = useMemo(() => {
    if (!instance) return [];

    return [
      { label: "实例类型", value: `${instance.scope} · ${instance.installMethod}` },
      { label: "工作目录", value: instance.workspaceDir ?? "未检测到" },
      { label: "HERMES_HOME", value: instance.hermesHome ?? "未检测到" },
      { label: "运行服务", value: instance.containerName ?? "尚未创建" },
      { label: "最近检查", value: instance.lastActivity },
      { label: "连接状态", value: `${instance.gateway} / ${instance.api}` },
    ];
  }, [instance]);

  const timeline = useMemo(() => {
    if (!instance) return [];

    const items = instance.type === "remote"
      ? [
          {
            title: resolveRemoteDisplayState(instance).activityTitle,
            detail: resolveRemoteDisplayState(instance).headline,
            time: instance.lastActivity,
            tone: resolveRemoteDisplayState(instance).tone === "warning" ? "warning" : "normal",
          },
          {
            title: "远程目录检查",
            detail: instance.workspaceDir ?? "当前未检测到工作目录。",
            time: instance.lastActivity,
            tone: "normal",
          },
        ]
      : [
          {
            title: "最近状态刷新",
            detail: instance.summary,
            time: instance.lastActivity,
            tone: instance.status === "warning" ? "warning" : "normal",
          },
          {
            title: "实例路径已建立",
            detail: instance.workspaceDir ?? "当前未检测到工作目录。",
            time: instance.lastActivity,
            tone: "normal",
          },
        ];

    if (instance.lastError) {
      items.unshift({
        title: "最近错误",
        detail: resolveRemoteStatusNarrative(instance).primaryDetail,
        time: instance.lastActivity,
        tone: "warning",
      });
    }

    return items;
  }, [instance]);

  const isRemoteInstance = instance?.type === "remote";
  const remotePageUx = instance?.type === "remote" ? buildRemoteNodeUxCopy("overview", instance.id) : null;
  const cleanupLabel = instance?.runtime === "docker" ? "清除当前实例" : "清除本机实例";
  const cleanupDescription = instance?.runtime === "docker"
    ? instance.type === "remote"
      ? "会通过 SSH 删除远程受管运行服务、工作目录和本地 Console 注册；不会执行 hermes uninstall。"
      : "会删除受管运行服务、工作目录和 Console 注册；不会执行 hermes uninstall。"
    : "会停止 Console 托管的本地网关、删除受管工作目录并移除注册；全局 Hermes CLI 卸载请到设置页处理。";

  const handleStart = async () => {
    if (!id) return;
    setIsActing(true);
    setActionError(null);

    try {
      const nextInstance = await startConsoleRuntimeInstance(id);
      setInstance(nextInstance);
      publishConsoleRuntimeRefresh({ scope: "instance", instanceId: id, reason: "state-sync" });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "实例启动失败。");
    } finally {
      setIsActing(false);
    }
  };

  const handleStop = async () => {
    if (!id) return;
    setIsActing(true);
    setActionError(null);

    try {
      const nextInstance = await stopConsoleRuntimeInstance(id);
      setInstance(nextInstance);
      publishConsoleRuntimeRefresh({ scope: "instance", instanceId: id, reason: "state-sync" });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "实例停止失败。");
    } finally {
      setIsActing(false);
    }
  };

  const handleCleanupInstance = async () => {
    if (!id || !instance) return;
    const expectedName = instance.name;
    if (cleanupConfirmText.trim() !== expectedName) {
      setActionError(`请输入实例名称“${expectedName}”以确认清除。`);
      return;
    }

    setCleanupWorking(true);
    setActionError(null);
    setCleanupFeedback(null);

    try {
      const result = await destroyConsoleRuntimeInstance(id);
      setCleanupFeedback(result.message);
      setCleanupDialogOpen(false);
      setCleanupConfirmText("");
      window.setTimeout(() => {
        navigate("/", { replace: true });
      }, 300);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "实例清除失败。");
    } finally {
      setCleanupWorking(false);
    }
  };

  if (loadingInstance) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[480px] p-8 text-center text-sm text-zinc-600">
          <div className="flex items-center justify-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在读取实例运行状态…
          </div>
        </Card>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[480px] p-8 text-center">
          <div className="text-lg font-semibold text-zinc-950">实例不存在</div>
          <div className="mt-2 text-sm text-zinc-500">请先返回主页选择实例，或重新创建一个本地实例。</div>
          <div className="mt-5">
            <Button variant="primary" size="sm" onClick={() => navigate("/")}>
              返回主页
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const actionModel = buildOverviewActionModel(instance);
  const headerActionPlan = buildOverviewHeaderActionPlan(instance, { isActing, cleanupWorking });
  const remoteSnapshot = isRemoteInstance ? buildRemoteNodeSnapshot(instance) : null;
  const remoteConnection = isRemoteInstance ? (instance as ConsoleRuntimeInstance).remoteConfig : undefined;
  const showRemoteRecovery = hasMissingRemoteContainer(instance);

  const triggerAction = async (action?: OverviewActionItem) => {
    if (!action) return;
    if (action.intent === "cleanup") {
      setCleanupConfirmText("");
      setCleanupDialogOpen(true);
      return;
    }
    if (action.intent === "start") {
      await handleStart();
      return;
    }
    if (action.intent === "stop") {
      await handleStop();
      return;
    }
    if (action.to) {
      navigate(action.to);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 px-8 py-8">
        <PageHeader
          title={instance.name}
          meta={<Badge variant={instance.status === "normal" ? "success" : instance.status === "warning" ? "warning" : "outline"}>{instance.status === "normal" ? "正常" : instance.status === "warning" ? "警告" : "离线"}</Badge>}
          actions={
            <>
              {isRemoteInstance ? (
                headerActionPlan?.sections.map((section) => (
                  section.actions.map((action) => {
                    return (
                      <Button key={action.key} variant={action.variant} size="sm" onClick={() => void triggerAction(action)} disabled={action.disabled}>
                        {action.busy ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <action.icon className="mr-1.5 h-4 w-4" />}
                        {action.displayLabel}
                      </Button>
                    );
                  })
                ))
              ) : (
                headerActionPlan?.sections.map((section) => (
                  section.actions.map((action) => (
                    <Button key={action.key} variant={action.variant} size="sm" onClick={() => void triggerAction(action)} disabled={action.disabled}>
                      {action.busy ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <action.icon className="mr-1.5 h-4 w-4" />}
                      {action.displayLabel}
                    </Button>
                  ))
                ))
              )}
              <Button variant="primary" size="sm" onClick={() => void triggerAction(headerActionPlan?.primary)}>
                {headerActionPlan?.primary.icon ? <headerActionPlan.primary.icon className="mr-1.5 h-4 w-4" /> : null}
                {headerActionPlan?.primary.displayLabel}
              </Button>
            </>
          }
        />

        {loadError ? (
          <Card className="border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            读取真实实例状态失败，当前展示的是静态兜底信息：{loadError}
          </Card>
        ) : null}

        {actionError ? (
          <Card className="border-red-200 bg-red-50/80 p-4 text-sm text-red-900">
            {actionError}
          </Card>
        ) : null}

        {cleanupFeedback ? (
          <Card className="border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
            {cleanupFeedback}
          </Card>
        ) : null}

        {showRemoteRecovery ? (
          <Card className="border-amber-200 bg-amber-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-amber-950">受管远程运行服务已不存在</div>
                <div className="mt-1 text-sm leading-6 text-amber-900">
                  当前实例注册仍在，但远程运行服务已经被删除。你可以直接重新扫描并导入客户端创建过的远程实例，或者前往部署管理重新创建。
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ImportExistingInstanceDialog
                  defaultMode="remote"
                  defaultRemoteConnection={{
                    host: remoteConnection?.host,
                    port: remoteConnection?.port,
                    user: remoteConnection?.user,
                    authMode: remoteConnection?.authMode,
                    keyPath: remoteConnection?.keyPath,
                    password: remoteConnection?.password,
                  }}
                  onImported={async (payload) => {
                    if (payload.instance.type === "remote") {
                      setCleanupFeedback(buildRemoteActionFeedback(payload.instance, { action: "recover" }).message);
                      publishConsoleRuntimeRefresh({ scope: "all", instanceId: payload.instance.id, reason: "recover" });
                    }
                    if (payload.instance.id === id) {
                      const detail = await loadConsoleRuntimeDetailState(id);
                      setInstance(detail.runtimeInstance);
                    }
                    navigate(
                      payload.instance.type === "remote"
                        ? buildRemoteWorkflowTarget(payload.instance.id, "outcome-panel")
                        : `/instance/${payload.instance.id}`,
                      { replace: true }
                    ); // focus=outcome-panel
                  }}
                  trigger={<Button variant="secondary">重新扫描并导入</Button>}
                />
                <Button variant="primary" onClick={() => navigate(`/instance/${instance.id}/deployment`)}>
                  {remotePageUx?.primaryLabel ?? "前往部署管理"}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {(isRemoteInstance ? remoteSnapshot?.cards ?? [] : stats).map((stat) => (
            <Card key={stat.title} className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                <stat.icon className="h-3.5 w-3.5" />
                {stat.title}
              </div>
              <div className="mt-5 flex min-w-0 flex-wrap items-center gap-2 text-lg font-semibold text-zinc-950">
                {stat.lead}
                <span className="min-w-0 break-words">{stat.value}</span>
              </div>
              <div className="mt-2 break-words text-sm text-zinc-500">{stat.detail}</div>
            </Card>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">{isRemoteInstance ? "节点核心信息" : "实例详情"}</h2>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {(isRemoteInstance
                  ? remoteSnapshot?.coreRows ?? []
                  : detailRows
                ).map((row) => (
                  <div key={row.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                    <div className="text-xs text-zinc-400">{row.label}</div>
                    <div className="mt-2 break-words text-sm font-medium text-zinc-950">{row.value}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">{isRemoteInstance ? "节点主操作" : "当前已接线能力"}</h2>
                </div>
                {isRemoteInstance ? (
                  <Button variant="secondary" size="sm" onClick={() => triggerAction(actionModel?.primary)}>
                    {remotePageUx?.primaryLabel ?? "前往部署管理"}
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => navigate("/create?type=local")}>
                    新建本地实例
                  </Button>
                )}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {isRemoteInstance ? (
                  actionModel.sections.map((section) => (
                    <div key={section.key} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                      <div className="text-xs text-zinc-400">{section.title}</div>
                      <div className="mt-2 break-words text-sm font-medium text-zinc-900">{section.description}</div>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                      <div className="text-xs text-zinc-400">已接线能力</div>
                      <div className="mt-2 break-words text-sm font-medium text-zinc-900">实例注册、运行控制、状态探测、会话与官方配置同步</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                      <div className="text-xs text-zinc-400">当前限制</div>
                      <div className="mt-2 break-words text-sm font-medium text-zinc-900">本地 Native 已开放；远程 Native 新建入口暂不开放。</div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <Clock3 className="h-4 w-4 text-zinc-500" />
                {isRemoteInstance ? "节点巡检摘要" : "实例活动时间线"}
              </div>
              <div className="mt-5 border-l border-zinc-200 pl-5">
                {timeline.map((item) => (
                  <div key={`${item.title}-${item.time}`} className="relative pb-6 last:pb-0">
                    <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${item.tone === "warning" ? "bg-amber-400" : "bg-zinc-300"}`} />
                    <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                    <div className="mt-1 break-words text-sm leading-6 text-zinc-600">{item.detail}</div>
                    <div className="mt-2 text-xs text-zinc-400">{item.time}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <RefreshCw className="h-4 w-4 text-zinc-500" />
                {isRemoteInstance ? "节点运行信号" : "当前诊断"}
              </div>
              <div className="mt-5 space-y-3 text-sm">
                {(isRemoteInstance ? remoteSnapshot?.signalRows ?? [] : [
                  { label: "运行服务", value: instance.diagnostics?.dockerDetail ?? "待检测" },
                  { label: "Gateway", value: instance.diagnostics?.gatewayDetail ?? "待检测" },
                  { label: "补充说明", value: resolveRemoteStatusNarrative(instance).primaryDetail },
                ]).map((row) => (
                  <div key={row.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                    <div className="text-xs text-zinc-400">{row.label}</div>
                    <div className="mt-1 break-words font-medium text-zinc-900">{row.value}</div>
                  </div>
                ))}
              </div>
            </Card>

            {isRemoteInstance ? (
              <Card className="p-6">
                <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                  <Activity className="h-4 w-4 text-zinc-500" />
                  当前结果面板
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  {remoteSnapshot?.outcomeRows.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                      <div className="text-xs text-zinc-400">{row.label}</div>
                      <div className="mt-1 break-words font-medium text-zinc-900">{row.value}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <Trash2 className="h-4 w-4 text-red-500" />
                清理与卸载
              </div>
              <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
                <div>{cleanupDescription}</div>
                <div>全局 Hermes CLI：设置页危险区处理官方卸载，和历史资源回收互不影响。</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="danger" size="sm" onClick={() => { setCleanupConfirmText(""); setCleanupDialogOpen(true); }} disabled={cleanupWorking || isActing}>
                  {cleanupWorking ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                  {cleanupWorking ? "清除中..." : cleanupLabel}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                  <Settings className="mr-1.5 h-4 w-4" />
                  本机 CLI 卸载
                </Button>
              </div>
            </Card>
          </div>
        </section>

        <Dialog
          open={cleanupDialogOpen}
          onOpenChange={(open) => {
            if (!open && cleanupWorking) return;
            setCleanupDialogOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>{cleanupLabel}</DialogTitle>
              <DialogDescription>{cleanupDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                该操作只处理当前实例运行载体和受管目录，不会混用另一种安装方式的卸载命令。请输入实例名称 <span className="font-semibold">{instance.name}</span> 确认。
              </div>
              <Input
                value={cleanupConfirmText}
                onChange={(event) => setCleanupConfirmText(event.target.value)}
                placeholder={instance.name}
                disabled={cleanupWorking}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCleanupDialogOpen(false)} disabled={cleanupWorking}>
                取消
              </Button>
              <Button variant="danger" onClick={() => void handleCleanupInstance()} disabled={cleanupWorking || cleanupConfirmText.trim() !== instance.name}>
                {cleanupWorking ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {cleanupWorking ? "清除中..." : cleanupLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
