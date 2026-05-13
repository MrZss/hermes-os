import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Activity, ArrowRight, Clock3, LoaderCircle, Plus, Server, Settings, Shield, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/console/PageHeader";
import { ImportExistingInstanceDialog } from "../components/console/ImportExistingInstanceDialog";
import { consoleInstances, type ConsoleInstance } from "../data/console";
import { cn } from "../lib/utils";
import { buildRemoteActionFeedback, buildRemoteWorkflowTarget, isRecoverableRemoteContainerLoss, listConsoleRuntimeInstances, publishConsoleRuntimeRefresh, resolveRemoteDisplayState, resolveRemoteStatusNarrative, subscribeConsoleRuntimeRefresh } from "../services/runtime";

function statusBadge(instance: ConsoleInstance) {
  if (instance.type === "remote") {
    const display = resolveRemoteDisplayState(instance);
    return {
      label: display.badgeLabel,
      variant: display.tone === "success" ? "success" as const : display.tone === "warning" ? "warning" as const : "outline" as const,
    };
  }
  if (instance.status === "normal") return { label: "正常", variant: "success" as const };
  if (instance.status === "warning") return { label: "警告", variant: "warning" as const };
  return { label: "离线", variant: "outline" as const };
}

export function resolveDashboardFlashVariant(message?: string | null) {
  const text = String(message ?? "");
  if (/已存在于 Console|定位到现有实例|待处理|警告/i.test(text)) return "warning" as const;
  return "success" as const;
}

export function buildDashboardInstanceCardModel(instance: ConsoleInstance) {
  const badge = statusBadge(instance);
  const isRecoverableRemoteLoss = instance.type === "remote"
    && instance.status !== "normal"
    && instance.runtimeState !== "running"
    && isRecoverableRemoteContainerLoss(instance);
  const metaText = instance.type === "remote"
    ? `${instance.platform} · 网关 ${instance.gateway} · 端口 ${instance.publishedPort ?? "未分配"}`
    : `${instance.platform} · 网关 ${instance.gateway} · API ${instance.api}`;

  return {
    badge,
    isRecoverableRemoteLoss,
    summary: instance.type === "remote" ? resolveRemoteDisplayState(instance).headline : instance.summary,
    metaText,
    cardClassName: isRecoverableRemoteLoss ? "border-amber-200 bg-amber-50/40" : "",
    primaryAction: {
      label: isRecoverableRemoteLoss ? "重新扫描并导入" : "打开工作区",
    },
  };
}

export function buildDashboardRecentActivityModel(instances: ConsoleInstance[]) {
  return instances
    .slice(0, 3)
    .map((instance) => {
      const remoteDisplay = instance.type === "remote" ? resolveRemoteDisplayState(instance) : null;
      const isRecoverableRemoteLoss = instance.type === "remote"
        && instance.status !== "normal"
        && instance.runtimeState !== "running"
        && isRecoverableRemoteContainerLoss(instance);
      const isRecoveredRemote = instance.type === "remote"
        && !isRecoverableRemoteLoss
        && Boolean(instance.lastRecoveredAt && instance.lastRecoveryResult);
      const isOperatedRemote = instance.type === "remote"
        && !isRecoverableRemoteLoss
        && Boolean(instance.lastOperationAt && instance.lastOperationResult);

      return {
        title: remoteDisplay
          ? remoteDisplay.activityTitle
          : isOperatedRemote
          ? "远程节点运维已完成"
          : isRecoveredRemote
            ? "远程实例已恢复"
          : instance.status === "normal"
            ? "实例状态正常"
            : instance.status === "warning"
              ? "实例需要关注"
              : "实例当前离线",
        detail: isRecoverableRemoteLoss
          ? `${instance.name} · 请重新扫描并导入实例，或前往部署管理重新创建。`
          : remoteDisplay
            ? `${instance.name} · ${remoteDisplay.headline}`
          : isOperatedRemote
            ? `${instance.name} · ${resolveRemoteStatusNarrative(instance).primaryDetail}`
            : isRecoveredRemote
            ? `${instance.name} · ${resolveRemoteStatusNarrative(instance).primaryDetail}`
            : `${instance.name} · ${instance.summary}`,
        tag: remoteDisplay ? remoteDisplay.activityTag : isRecoverableRemoteLoss ? "可恢复" : isOperatedRemote ? "已运维" : isRecoveredRemote ? "已恢复" : instance.status === "normal" ? "运行中" : instance.status === "warning" ? "警告" : "离线",
        tone: remoteDisplay ? (remoteDisplay.tone === "warning" ? "warning" as const : "normal" as const) : isRecoverableRemoteLoss ? "warning" as const : instance.status === "warning" ? "warning" as const : "normal" as const,
        time: instance.lastActivity,
        actionLabel: isRecoverableRemoteLoss ? "重新扫描并导入" : null,
        instanceId: instance.id,
        isRecoverableRemoteLoss,
        isRecoveredRemote,
        isOperatedRemote,
      };
    });
}

export function Dashboard() {
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.listInstanceStates);
  const [instances, setInstances] = useState<ConsoleInstance[]>(desktopRuntimeAvailable ? [] : consoleInstances);
  const [loadingInstances, setLoadingInstances] = useState(desktopRuntimeAvailable);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const loadInstances = useCallback(async () => {
    setLoadingInstances(true);
    try {
      const nextInstances = await listConsoleRuntimeInstances();
      setInstances(nextInstances);
      setLoadError(null);
    } catch (error) {
      setInstances(desktopRuntimeAvailable ? [] : consoleInstances);
      setLoadError(error instanceof Error ? error.message : "读取实例状态失败。");
    } finally {
      setLoadingInstances(false);
    }
  }, [desktopRuntimeAvailable]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingInstances(true);
      try {
        const nextInstances = await listConsoleRuntimeInstances();
        if (cancelled) return;
        setInstances(nextInstances);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setInstances(desktopRuntimeAvailable ? [] : consoleInstances);
        setLoadError(error instanceof Error ? error.message : "读取实例状态失败。");
      } finally {
        if (!cancelled) {
          setLoadingInstances(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [desktopRuntimeAvailable]);

  useEffect(() => {
    return subscribeConsoleRuntimeRefresh(async () => {
      await loadInstances();
    });
  }, [loadInstances]);

  const runningCount = instances.filter((instance) => instance.status === "normal").length;
  const attentionCount = instances.filter((instance) => instance.status !== "normal").length;
  const recentInstance = instances[0];
  const recentActivity = useMemo(() => buildDashboardRecentActivityModel(instances), [instances]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 px-8 py-8">
        <PageHeader
          title="主页"
          meta={flashMessage ? <Badge variant={resolveDashboardFlashVariant(flashMessage)}>{flashMessage}</Badge> : <Badge variant="outline">桌面控制台首页</Badge>}
          actions={
            <div className="flex items-center gap-2">
              {desktopRuntimeAvailable ? (
                <ImportExistingInstanceDialog
                  onImported={async (payload) => {
                    setFlashMessage(payload.instance.type === "remote" ? buildRemoteActionFeedback(payload.instance, { action: "recover" }).message : payload.message);
                    if (payload.instance.type === "remote") {
                      publishConsoleRuntimeRefresh({ scope: "all", instanceId: payload.instance.id, reason: "recover" });
                    }
                    await loadInstances();
                    navigate(payload.instance.type === "remote" ? buildRemoteWorkflowTarget(payload.instance.id, "outcome-panel") : `/instance/${payload.instance.id}`); // focus=outcome-panel
                  }}
                  trigger={
                    <Button variant="secondary" size="sm">
                      导入现有 Hermes
                    </Button>
                  }
                />
              ) : null}
              <Button variant="primary" size="sm" onClick={() => navigate("/create")}>
                <Plus className="mr-1.5 h-4 w-4" />
                新建实例
              </Button>
            </div>
          }
        />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.18fr_1fr_1fr_1.15fr]">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <Activity className="h-3.5 w-3.5" />
              状态摘要
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-[2rem] font-semibold leading-none text-zinc-950">{loadingInstances ? "…" : runningCount}</span>
              <span className="pb-1 text-sm text-zinc-500">{loadingInstances ? "正在读取实例状态" : "个实例处于正常运行"}</span>
            </div>
            <div className="mt-3">
              <Badge variant={loadingInstances ? "outline" : attentionCount > 0 ? "warning" : "success"}>
                {loadingInstances ? "读取中" : attentionCount > 0 ? `${attentionCount} 个待处理` : "全部稳定"}
              </Badge>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <Shield className="h-3.5 w-3.5" />
              安全连接
            </div>
            <div className="mt-4 text-[1.45rem] font-semibold leading-tight text-zinc-950">localhost / SSH</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <Server className="h-3.5 w-3.5" />
              快捷动作
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="justify-start"
                onClick={() => recentInstance && navigate(`/instance/${recentInstance.id}`)}
                disabled={!recentInstance || loadingInstances}
              >
                打开最近实例
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <Sparkles className="h-3.5 w-3.5" />
              最近变更
            </div>
            <div className="mt-4 space-y-2.5">
              {loadingInstances ? (
                <div className="rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-3 text-sm text-zinc-500">
                  正在同步最新实例活动…
                </div>
              ) : null}
              {recentActivity.slice(0, 2).map((event) => (
                <div key={event.title} className="rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-zinc-900">{event.title}</div>
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{event.time}</span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-zinc-600">{event.detail}</div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-950">实例列表</h2>
            </div>

            {loadError ? (
              <Card className="border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                当前读取真实实例状态失败，已回退到静态演示数据：{loadError}
              </Card>
            ) : null}

            {loadingInstances ? (
              <Card className="p-6 text-sm text-zinc-600">
                <div className="flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  正在读取实例列表…
                </div>
              </Card>
            ) : instances.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {instances.map((instance) => {
                  const cardModel = buildDashboardInstanceCardModel(instance);

                  return (
                    <Card key={instance.id} className={cn("p-4", cardModel.cardClassName)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-[#faf9f6] text-zinc-700">
                            <Server className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="truncate text-sm font-semibold text-zinc-950">{instance.name}</h3>
                              <Badge variant={cardModel.badge.variant} className="px-2 py-0.5 text-[11px]">
                                {cardModel.badge.label}
                              </Badge>
                            </div>
                            <p className="mt-1.5 text-sm leading-6 text-zinc-600">{cardModel.summary}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/instance/${instance.id}`)}>
                          进入
                        </Button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
                        <div className="rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-2.5">
                          <div className="text-xs text-zinc-400">实例类型</div>
                          <div className="mt-1 font-medium text-zinc-900">
                            {instance.scope} · {instance.installMethod}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-2.5">
                          <div className="text-xs text-zinc-400">默认档案</div>
                          <div className="mt-1 font-medium text-zinc-900">{instance.defaultProfile}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-2.5">
                          <div className="text-xs text-zinc-400">当前模型</div>
                          <div className="mt-1 font-medium text-zinc-900">
                            {instance.currentModel} · {instance.provider}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-2.5">
                          <div className="text-xs text-zinc-400">最近检查</div>
                          <div className="mt-1 font-medium text-zinc-900">{instance.lastActivity}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-zinc-200/70 pt-3">
                        <div className="text-[11px] leading-5 text-zinc-500">{cardModel.metaText}</div>
                        {cardModel.isRecoverableRemoteLoss ? (
                          <ImportExistingInstanceDialog
                            defaultMode="remote"
                            defaultRemoteConnection={instance.type === "remote" ? {
                              host: instance.remoteConfig?.host ?? "",
                              port: instance.remoteConfig?.port ?? "22",
                              user: instance.remoteConfig?.user ?? "",
                              authMode: instance.remoteConfig?.authMode ?? "ssh_key",
                              keyPath: instance.remoteConfig?.keyPath ?? "",
                              password: instance.remoteConfig?.password ?? "",
                              workdir: instance.remoteConfig?.workdir ?? instance.workspaceDir ?? "",
                            } : undefined}
                            onImported={async (payload) => {
                              setFlashMessage(payload.instance.type === "remote" ? buildRemoteActionFeedback(payload.instance, { action: "recover" }).message : payload.message);
                              if (payload.instance.type === "remote") {
                                publishConsoleRuntimeRefresh({ scope: "all", instanceId: payload.instance.id, reason: "recover" });
                              }
                              await loadInstances();
                              navigate(payload.instance.type === "remote" ? buildRemoteWorkflowTarget(payload.instance.id, "outcome-panel") : `/instance/${payload.instance.id}`); // focus=outcome-panel
                            }}
                            trigger={<Button variant="secondary" size="sm">{cardModel.primaryAction.label}</Button>}
                          />
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/instance/${instance.id}`)}>
                            {cardModel.primaryAction.label}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <div className="text-base font-semibold text-zinc-950">还没有实例</div>
                <div className="mt-2 text-sm text-zinc-500">可以新建一个本地实例，也可以先把现有 Hermes 环境导入到 Console。</div>
                <div className="mt-5 flex items-center justify-center gap-3">
                  {desktopRuntimeAvailable ? (
                    <ImportExistingInstanceDialog
                      onImported={async (payload) => {
                        setFlashMessage(payload.instance.type === "remote" ? buildRemoteActionFeedback(payload.instance, { action: "recover" }).message : payload.message);
                        if (payload.instance.type === "remote") {
                          publishConsoleRuntimeRefresh({ scope: "all", instanceId: payload.instance.id, reason: "recover" });
                        }
                        await loadInstances();
                        navigate(payload.instance.type === "remote" ? buildRemoteWorkflowTarget(payload.instance.id, "outcome-panel") : `/instance/${payload.instance.id}`); // focus=outcome-panel
                      }}
                      trigger={<Button variant="secondary" size="sm">导入现有 Hermes</Button>}
                    />
                  ) : null}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">最近活动</h2>
            </div>

            <Card className="overflow-hidden">
              {recentActivity.length > 0 ? recentActivity.map((event, index) => (
                <div
                  key={`${event.instanceId}-${event.title}`}
                  className={cn(
                    "flex gap-3 px-4 py-3",
                    event.isRecoverableRemoteLoss && "bg-amber-50/40",
                    index !== recentActivity.length - 1 && "border-b border-zinc-200/70"
                  )}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#faf9f6] text-zinc-500">
                    {event.tone === "warning" ? <Shield className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-zinc-900">{event.title}</div>
                      <Badge
                        variant={event.tone === "warning" ? "warning" : "outline"}
                        className="px-2 py-0.5 text-[11px]"
                      >
                        {event.tag}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm leading-5 text-zinc-600">{event.detail}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <div className="text-[11px] tabular-nums text-zinc-400">{event.time}</div>
                      {event.actionLabel ? (
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/instance/${event.instanceId}`)}>
                          {event.actionLabel}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-5 text-sm text-zinc-500">当前还没有可展示的实例活动。</div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-950">继续最近实例</div>
                <Button variant="ghost" size="sm" onClick={() => recentInstance && navigate(`/instance/${recentInstance.id}`)} disabled={!recentInstance || loadingInstances}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              {recentInstance ? (
                <div className="mt-3 rounded-xl border border-zinc-200/70 bg-[#faf9f6] px-3.5 py-3.5">
                  <div className="text-sm font-medium text-zinc-900">{recentInstance.name}</div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {recentInstance.defaultProfile} · {recentInstance.currentModel}
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-zinc-200/80 bg-[#faf9f6] px-3.5 py-4 text-sm text-zinc-500">
                  创建实例后，这里会显示最近一次工作的目标环境。
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <Trash2 className="h-4 w-4 text-red-500" />
                卸载与清理
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
                <div>历史受管实例：在实例主页清理资源。</div>
                <div>本机 Hermes：到设置页走官方卸载向导。</div>
              </div>
              <div className="mt-4">
                <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
                  <Settings className="mr-1.5 h-4 w-4" />
                  前往全局卸载
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
