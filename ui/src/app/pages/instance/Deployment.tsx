import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Boxes, HardDriveDownload, LoaderCircle, RefreshCw, Rocket, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ImportExistingInstanceDialog } from "../../components/console/ImportExistingInstanceDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/console/PageHeader";
import { consoleInstances, type ConsoleInstance } from "../../data/console";
import { restartInstanceGateway } from "../../services/officialActions";
import { type ConsoleInstanceRecord, type InstanceStateResult } from "../../services/instances";
import {
  buildRemoteActionFeedback,
  buildRemoteNodeUxCopy,
  loadConsoleRuntimeDetailState,
  buildRemoteOutcomePanel,
  buildRemoteWorkflowTarget,
  destroyConsoleRuntimeInstance,
  isRecoverableRemoteContainerLoss,
  publishConsoleRuntimeRefresh,
  resolveRemoteStatusNarrative,
  startConsoleRuntimeInstance,
  stopConsoleRuntimeInstance,
  subscribeConsoleRuntimeRefresh,
  type ConsoleRuntimeInstance,
} from "../../services/runtime";

type DeploymentActionKey = "redeploy" | "restart-gateway" | "cleanup-directory";

type DeploymentAction = {
  key: DeploymentActionKey;
  label: string;
  description: string;
};

type DeploymentMetadata = {
  label: string;
  value: string;
};

type DeploymentViewModel = {
  summary: string;
  metadata: DeploymentMetadata[];
  outcomeRows: DeploymentMetadata[];
  statusCards: Array<{ title: string; value: string; detail: string }>;
  actions: DeploymentAction[];
  recentResult: string;
};

type DeploymentContext = {
  rawRecord?: Partial<ConsoleInstanceRecord> | null;
  diagnostics?: InstanceStateResult["diagnostics"] | null;
};

function getRuntimeField<T extends keyof ConsoleRuntimeInstance>(instance: ConsoleInstance, field: T) {
  return (instance as ConsoleRuntimeInstance)[field];
}

function formatTimestamp(iso?: string) {
  if (!iso) return "未记录";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRecentResult(instance: ConsoleInstance, diagnostics?: InstanceStateResult["diagnostics"] | null) {
  return resolveRemoteStatusNarrative(instance, { diagnostics }).primaryDetail;
}

function formatRuntimeServiceDetail(detail?: string | null) {
  if (!detail) return "当前没有额外运行服务细节。";
  return detail
    .replace(/Docker\s+daemon/gi, "运行服务")
    .replace(/Docker\s+Engine/gi, "运行服务")
    .replace(/Docker\s+容器/g, "运行服务")
    .replace(/远程\s*Docker/g, "远程运行服务")
    .replace(/本地\s*Docker/g, "本机运行服务")
    .replace(/Docker\s+正常/g, "运行服务正常")
    .replace(/Docker\s+已安装/g, "运行服务已安装")
    .replace(/容器/g, "运行服务");
}

function hasMissingRemoteContainer(instance: ConsoleInstance, diagnostics?: InstanceStateResult["diagnostics"] | null) {
  return instance.type === "remote" && isRecoverableRemoteContainerLoss(instance, diagnostics);
}

export function buildDeploymentViewModel(instance: ConsoleInstance, context: DeploymentContext = {}): DeploymentViewModel {
  const { rawRecord, diagnostics } = context;
  const recentResult = getRecentResult(instance, diagnostics);
  const containerName = rawRecord?.docker?.containerName ?? instance.containerName ?? "尚未创建";
  const image = rawRecord?.docker?.image ?? getRuntimeField(instance, "image") ?? "未记录";
  const createdAt = rawRecord?.createdAt ?? getRuntimeField(instance, "createdAt");
  const lastRecoveredAt = rawRecord?.lastRecoveredAt ?? getRuntimeField(instance, "lastRecoveredAt");
  const lastOperationAt = rawRecord?.lastOperationAt ?? getRuntimeField(instance, "lastOperationAt");
  const lastOperationType = rawRecord?.lastOperationType ?? getRuntimeField(instance, "lastOperationType");
  const externalPort = rawRecord?.docker?.publishedPort ?? instance.publishedPort;
  const internalPort = rawRecord?.docker?.containerPort ?? getRuntimeField(instance, "containerPort") ?? 8642;
  const workdir = rawRecord?.remote?.workdir ?? getRuntimeField(instance, "remoteConfig")?.workdir ?? instance.workspaceDir ?? "未检测到";
  const outcomeRows = buildRemoteOutcomePanel(instance, { rawRecord, diagnostics }).rows;

  return {
    summary: recentResult,
    metadata: [
      { label: "运行服务", value: containerName },
      { label: "运行版本", value: image },
      { label: "对外端口", value: externalPort ? String(externalPort) : "未分配" },
      { label: "内部端口", value: internalPort ? String(internalPort) : "8642" },
      { label: "工作目录", value: workdir },
      { label: "创建时间", value: formatTimestamp(createdAt) },
      { label: "最近恢复", value: lastRecoveredAt ? formatTimestamp(lastRecoveredAt) : "未恢复" },
      { label: "最近运维动作", value: lastOperationAt ? `${lastOperationType || "已执行"} · ${formatTimestamp(lastOperationAt)}` : "暂无运维动作" },
    ],
    outcomeRows,
    statusCards: [
      {
        title: "运行服务状态",
        value: containerName,
        detail: formatRuntimeServiceDetail(diagnostics?.docker?.detail),
      },
      {
        title: "部署入口",
        value: instance.endpoint,
        detail: `工作目录：${workdir}`,
      },
      {
        title: "最近部署结果",
        value: instance.runtimeState === "running" ? "运行中" : instance.runtimeState === "warning" ? "需处理告警" : "等待接管",
        detail: recentResult,
      },
    ],
    actions: [
      {
        key: "redeploy",
        label: "重建部署",
        description: "停止当前节点后重新启动，适合处理运行服务或 Gateway 状态漂移。",
      },
      {
        key: "restart-gateway",
        label: "重启 Gateway",
        description: "在不重建目录的前提下刷新节点 Gateway，适合处理短时健康检查抖动。",
      },
      {
        key: "cleanup-directory",
        label: "清理实例目录",
        description: "删除当前受管目录与注册，适合彻底回收远程节点后重新创建。",
      },
    ],
    recentResult,
  };
}

export function buildDeploymentSnapshot(instance: ConsoleInstance, context: DeploymentContext = {}) {
  const viewModel = buildDeploymentViewModel(instance, context);
  const detailRows = [
    { label: "运行服务", value: viewModel.metadata.find((item) => item.label === "运行服务")?.value ?? "尚未创建" },
    { label: "运行版本", value: viewModel.metadata.find((item) => item.label === "运行版本")?.value ?? "未记录" },
    { label: "对外端口", value: viewModel.metadata.find((item) => item.label === "对外端口")?.value ?? "未分配" },
    { label: "内部端口", value: viewModel.metadata.find((item) => item.label === "内部端口")?.value ?? "8642" },
    { label: "工作目录", value: viewModel.metadata.find((item) => item.label === "工作目录")?.value ?? "未检测到" },
    { label: "创建时间", value: viewModel.metadata.find((item) => item.label === "创建时间")?.value ?? "未记录" },
    { label: "最近部署结果", value: viewModel.metadata.find((item) => item.label === "最近部署结果")?.value ?? viewModel.recentResult },
  ];

  return {
    detailRows,
    nodeActions: viewModel.actions,
    statusCards: viewModel.statusCards,
  };
}

export function Deployment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = id ? consoleInstances.find((item) => item.id === id) ?? null : null;
  const [instance, setInstance] = useState<ConsoleInstance | null>(desktopRuntimeAvailable ? null : fallbackInstance);
  const [rawRecord, setRawRecord] = useState<ConsoleInstanceRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<InstanceStateResult["diagnostics"] | null>(fallbackInstance?.diagnostics ?? null);
  const [loading, setLoading] = useState(desktopRuntimeAvailable);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<DeploymentActionKey | null>(null);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState("");
  const [highlightOutcomePanel, setHighlightOutcomePanel] = useState(searchParams.get("focus") === "outcome-panel");

  useEffect(() => {
    setHighlightOutcomePanel(searchParams.get("focus") === "outcome-panel");
  }, [searchParams]);

  const reloadState = async (instanceId: string) => {
    const { runtimeInstance, state, diagnostics: nextDiagnostics } = await loadConsoleRuntimeDetailState(instanceId);
    setInstance(runtimeInstance);
    setRawRecord(state?.instance ?? null);
    setDiagnostics(nextDiagnostics ?? null);
    return { runtimeInstance, state };
  };

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { runtimeInstance, state, diagnostics: nextDiagnostics } = await loadConsoleRuntimeDetailState(id);
        if (cancelled) return;
        setInstance(runtimeInstance);
        setRawRecord(state?.instance ?? null);
        setDiagnostics(nextDiagnostics ?? null);
        setActionError(null);
      } catch (error) {
        if (cancelled) return;
        setInstance(fallbackInstance);
        setRawRecord(null);
        setDiagnostics(fallbackInstance?.diagnostics ?? null);
        setActionError(error instanceof Error ? error.message : "读取部署状态失败。");
      } finally {
        if (!cancelled) setLoading(false);
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
        await reloadState(id);
      }
    });
  }, [id]);

  const viewModel = useMemo(() => {
    if (!instance) return undefined;
    return buildDeploymentViewModel(instance, { rawRecord, diagnostics });
  }, [diagnostics, instance, rawRecord]);
  const showRemoteRecovery = Boolean(instance && hasMissingRemoteContainer(instance, diagnostics));
  const pageUx = instance ? buildRemoteNodeUxCopy("deployment", instance.id) : null;

  const executeRedeploy = async () => {
    if (!id || !instance) return;
    setWorkingAction("redeploy");
    setActionError(null);
    setFeedback(null);
    try {
      if (instance.runtimeState === "running" || instance.runtimeState === "warning") {
        await stopConsoleRuntimeInstance(id);
      }
      const next = await startConsoleRuntimeInstance(id);
      setInstance(next);
      const refreshed = await reloadState(id);
      setFeedback(buildRemoteActionFeedback(refreshed.runtimeInstance ?? next, { action: "redeploy" }).message);
      publishConsoleRuntimeRefresh({ scope: "all", instanceId: id, reason: "redeploy" });
      setSearchParams({ focus: "outcome-panel" }, { replace: true }); // focus=outcome-panel
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "重建部署失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const executeRestartGateway = async () => {
    if (!id) return;
    setWorkingAction("restart-gateway");
    setActionError(null);
    setFeedback(null);
    try {
      await restartInstanceGateway(id);
      const refreshed = await reloadState(id);
      if (refreshed.runtimeInstance) {
        setFeedback(buildRemoteActionFeedback(refreshed.runtimeInstance, { action: "gateway-restart" }).message);
      }
      publishConsoleRuntimeRefresh({ scope: "all", instanceId: id, reason: "gateway-restart" });
      setSearchParams({ focus: "outcome-panel" }, { replace: true }); // focus=outcome-panel
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "重启 Gateway 失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const executeCleanup = async () => {
    if (!id || !instance) return;
    if (cleanupConfirmText.trim() !== instance.name) {
      setActionError(`请输入实例名称“${instance.name}”以确认清理。`);
      return;
    }

    setWorkingAction("cleanup-directory");
    setActionError(null);
    setFeedback(null);
    try {
      const result = await destroyConsoleRuntimeInstance(id);
      setCleanupDialogOpen(false);
      setCleanupConfirmText("");
      setFeedback(result.message);
      window.setTimeout(() => navigate("/", { replace: true }), 300);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "清理实例目录失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[480px] p-8 text-center text-sm text-zinc-600">
          <div className="flex items-center justify-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在读取节点部署状态…
          </div>
        </Card>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[520px] p-8 text-center">
          <div className="text-lg font-semibold text-zinc-950">找不到部署节点</div>
          <div className="mt-2 text-sm text-zinc-500">请先返回主页选择远程实例，再重新进入部署管理。</div>
          <div className="mt-5">
            <Button variant="primary" size="sm" onClick={() => navigate("/")}>
              返回主页
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const isRemote = instance.type === "remote";

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <PageHeader
        title="部署管理"
        description={pageUx?.description ?? "这里直接回答“节点部署到了哪、当前运行服务是否正常、下一步该做什么”。需要重建部署、重启 Gateway 或清理实例目录，都可以从这里进入。"}
        meta={<Badge variant={instance.status === "normal" ? "success" : instance.status === "warning" ? "warning" : "outline"}>{isRemote ? "远程节点" : "本地实例"}</Badge>}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate(pageUx?.secondaryTo ?? `/instance/${instance.id}/environment`)}>
              {pageUx?.secondaryLabel ?? "环境检查"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(pageUx?.tertiaryTo ?? `/instance/${instance.id}/diagnostics`)}>
              {pageUx?.tertiaryLabel ?? "查看诊断"}
            </Button>
          </>
        }
      />

      {!isRemote ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          当前页面按远程节点优先设计。本地实例建议回到概况页继续使用。
        </Card>
      ) : null}

      {actionError ? (
        <Card className="mt-6 border-red-200 bg-red-50/80 p-4 text-sm text-red-900">{actionError}</Card>
      ) : null}

      {feedback ? (
        <Card className="mt-6 border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">{feedback}</Card>
      ) : null}

      {showRemoteRecovery && instance ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/80 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-950">远程实例需要重新接管</div>
              <div className="mt-1 text-sm leading-6 text-amber-900">
                当前登记的受管运行服务已经不存在。你可以重新扫描并导入客户端创建过的远程实例，或者直接执行重建部署。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ImportExistingInstanceDialog
                defaultMode="remote"
                defaultRemoteConnection={{
                  host: rawRecord?.remote?.host,
                  port: rawRecord?.remote?.port,
                  user: rawRecord?.remote?.user,
                  authMode: rawRecord?.remote?.authMode,
                  keyPath: rawRecord?.remote?.keyPath,
                  password: rawRecord?.remote?.password,
                }}
                onImported={async (payload) => {
                  if (payload.instance.id === id) {
                    await reloadState(id);
                  }
                  if (payload.instance.type === "remote") {
                    publishConsoleRuntimeRefresh({ scope: "all", instanceId: payload.instance.id, reason: "recover" });
                  }
                  navigate(
                    payload.instance.type === "remote"
                      ? buildRemoteWorkflowTarget(payload.instance.id, "outcome-panel")
                      : `/instance/${payload.instance.id}/deployment`,
                    { replace: true }
                  ); // focus=outcome-panel
                }}
                trigger={<Button variant="secondary">重新扫描并导入</Button>}
              />
              <Button variant="primary" onClick={() => void executeRedeploy()} disabled={workingAction !== null}>
                重建部署
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {viewModel ? (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            {viewModel.statusCards.map((card) => (
              <Card key={card.title} className="p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{card.title}</div>
                <div className="mt-4 break-words text-lg font-semibold text-zinc-950">{card.value}</div>
                <div className="mt-2 break-words text-sm leading-6 text-zinc-600">{card.detail}</div>
              </Card>
            ))}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <Card className={`p-6 ${highlightOutcomePanel ? "border-emerald-300 bg-emerald-50/40" : ""}`}>
                <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                  <Boxes className="h-4 w-4 text-zinc-500" />
                  部署元信息
                </div>
                {pageUx?.nextStepDetail ? (
                  <div className="mt-2 text-sm leading-6 text-zinc-600">{pageUx.nextStepDetail}</div>
                ) : null}
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {viewModel.metadata.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                      <div className="text-xs text-zinc-400">{item.label}</div>
                      <div className="mt-2 break-words text-sm font-medium text-zinc-950">{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                  <Rocket className="h-4 w-4 text-zinc-500" />
                  当前结果面板
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  {viewModel.outcomeRows.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                      <div className="text-xs text-zinc-400">{row.label}</div>
                      <div className="mt-1 break-words font-medium text-zinc-900">{row.value}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <Rocket className="h-4 w-4 text-zinc-500" />
                节点级操作入口
              </div>
              <div className="mt-2 text-sm leading-6 text-zinc-600">这些操作直接处理节点部署生命周期，不再回到旧的交互入口。</div>
              <div className="mt-5 space-y-3">
                {viewModel.actions.map((action) => {
                  const isBusy = workingAction === action.key;
                  const onClick = action.key === "redeploy"
                    ? executeRedeploy
                    : action.key === "restart-gateway"
                      ? executeRestartGateway
                      : () => {
                          setCleanupConfirmText("");
                          setCleanupDialogOpen(true);
                        };
                  return (
                    <div key={action.key} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-950">{action.label}</div>
                          <div className="mt-1 text-sm leading-6 text-zinc-600">{action.description}</div>
                        </div>
                        <Button
                          variant={action.key === "cleanup-directory" ? "danger" : action.key === "restart-gateway" ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() => void onClick()}
                          disabled={workingAction !== null}
                        >
                          {isBusy ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : action.key === "redeploy" ? <RotateCcw className="mr-1.5 h-4 w-4" /> : action.key === "restart-gateway" ? <RefreshCw className="mr-1.5 h-4 w-4" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                          {action.label}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        </>
      ) : null}

      <Dialog
        open={cleanupDialogOpen}
        onOpenChange={(open) => {
          if (workingAction === "cleanup-directory" && !open) return;
          setCleanupDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>清理实例目录</DialogTitle>
            <DialogDescription>该操作会删除当前受管目录与节点注册。请输入实例名称确认，避免误删正在服务的节点。</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
            当前目标：<span className="font-semibold">{instance.name}</span>
          </div>
          <Input
            value={cleanupConfirmText}
            onChange={(event) => setCleanupConfirmText(event.target.value)}
            placeholder={instance.name}
            disabled={workingAction === "cleanup-directory"}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCleanupDialogOpen(false)} disabled={workingAction === "cleanup-directory"}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => void executeCleanup()}
              disabled={workingAction === "cleanup-directory" || cleanupConfirmText.trim() !== instance.name}
            >
              {workingAction === "cleanup-directory" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <HardDriveDownload className="mr-1.5 h-4 w-4" />}
              清理实例目录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
