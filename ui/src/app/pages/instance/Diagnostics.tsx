import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Activity, AlertTriangle, Boxes, Database, LoaderCircle, Network, Terminal } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/console/PageHeader";
import { consoleInstances, type ConsoleInstance } from "../../data/console";
import { type ConsoleInstanceRecord, type InstanceStateResult } from "../../services/instances";
import { buildRemoteNodeUxCopy, loadConsoleRuntimeDetailState, resolveRemoteDisplayState, resolveRemoteStatusNarrative, subscribeConsoleRuntimeRefresh, type ConsoleRuntimeDiagnostics, type ConsoleRuntimeInstance } from "../../services/runtime";

type DiagnosticsTone = "success" | "warning" | "offline";

type DiagnosticsCheck = {
  label: string;
  value: string;
  detail: string;
  tone: DiagnosticsTone;
};

type DiagnosticsContext = {
  rawRecord?: Partial<ConsoleInstanceRecord> | null;
  diagnostics?: InstanceStateResult["diagnostics"] | null;
};

type DiagnosticsViewModel = {
  summary: {
    title: string;
    value: string;
    detail: string;
    tone: DiagnosticsTone;
  };
  checks: DiagnosticsCheck[];
  conclusion: string;
  hints: string[];
};

function getRuntimeField<T extends keyof ConsoleRuntimeInstance>(instance: ConsoleInstance, field: T) {
  return (instance as ConsoleRuntimeInstance)[field];
}

function getRuntimeDiagnostics(instance: ConsoleInstance) {
  return (instance as ConsoleRuntimeInstance).diagnostics as ConsoleRuntimeDiagnostics | undefined;
}

function getExternalPort(instance: ConsoleInstance, rawRecord?: Partial<ConsoleInstanceRecord> | null) {
  return rawRecord?.docker?.publishedPort ?? instance.publishedPort;
}

function getInternalPort(instance: ConsoleInstance, rawRecord?: Partial<ConsoleInstanceRecord> | null) {
  return rawRecord?.docker?.containerPort ?? getRuntimeField(instance, "containerPort") ?? 8642;
}

function getContainerName(instance: ConsoleInstance, rawRecord?: Partial<ConsoleInstanceRecord> | null) {
  return rawRecord?.docker?.containerName ?? instance.containerName ?? "尚未创建运行服务";
}

function compactValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function readContainerField(container: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (container[key] !== undefined && container[key] !== null && container[key] !== "") {
      return container[key];
    }
  }
  return undefined;
}

function normalizeContainerStatus(container: Record<string, unknown>) {
  const explicitStatus = compactValue(readContainerField(container, ["status", "Status"]));
  const explicitState = compactValue(readContainerField(container, ["state", "State"]));
  const running = readContainerField(container, ["running", "Running"]);
  const paused = readContainerField(container, ["paused", "Paused"]);
  const restarting = readContainerField(container, ["restarting", "Restarting"]);
  const dead = readContainerField(container, ["dead", "Dead"]);
  const oomKilled = readContainerField(container, ["oomKilled", "OOMKilled"]);

  if (String(restarting) === "true") return "重启中";
  if (String(paused) === "true") return "已暂停";
  if (String(dead) === "true") return "已终止";
  if (String(oomKilled) === "true") return "OOM 退出";
  if (String(running) === "true") return "运行中";

  const normalized = [explicitStatus, explicitState]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/restart/.test(normalized)) return "重启中";
  if (/unhealthy|fail|error|exited|dead/.test(normalized)) return "异常";
  if (/running|healthy|up/.test(normalized)) return "运行中";

  return explicitStatus ?? explicitState ?? "待检测";
}

function buildContainerSummary(instance: ConsoleInstance, context: DiagnosticsContext, options: { recoverableLoss?: boolean } = {}) {
  if (options.recoverableLoss) {
    return {
      value: "不存在",
      detail: "受管运行服务已不存在，请重新扫描并导入实例，或在部署管理里重新创建。",
      tone: "warning" as const,
    };
  }

  const container = context.diagnostics?.container ?? getRuntimeDiagnostics(instance)?.container;
  if (!container) {
    return {
      value: instance.containerName ? "待回传" : "未创建",
      detail: instance.containerName ? "运行服务已注册，等待下一次节点诊断返回运行状态。" : "尚未发现受管运行服务。",
      tone: instance.containerName ? ("offline" as const) : ("offline" as const),
    };
  }

  const status = normalizeContainerStatus(container);
  const health = compactValue(readContainerField(container, ["health", "Health"]));
  const pid = compactValue(readContainerField(container, ["pid", "Pid"]));
  const startedAt = compactValue(readContainerField(container, ["startedAt", "StartedAt"]));
  const finishedAt = compactValue(readContainerField(container, ["finishedAt", "FinishedAt"]));
  const error = compactValue(readContainerField(container, ["error", "Error"]));
  const detailParts = [
    health ? `健康检查 ${health}` : null,
    pid && pid !== "0" ? `PID ${pid}` : null,
    startedAt && startedAt !== "0001-01-01T00:00:00Z" ? `启动于 ${startedAt}` : null,
    finishedAt && finishedAt !== "0001-01-01T00:00:00Z" ? `结束于 ${finishedAt}` : null,
    error && error !== "\"\"" && error !== "" ? `错误：${error}` : null,
  ].filter(Boolean);

  const tone = /异常|重启中|退出|终止/i.test(status)
    ? ("warning" as const)
    : /运行中/i.test(status)
      ? ("success" as const)
      : ("offline" as const);

  return {
    value: status,
    detail: detailParts.join(" · ") || "节点已返回运行状态，但未附带更多细节。",
    tone,
  };
}

function getStatusText(instance: ConsoleInstance) {
  if (instance.runtimeState === "running" || instance.status === "normal") return "健康";
  if (instance.runtimeState === "warning" || instance.runtimeState === "creating" || instance.status === "warning") return "需要关注";
  if (instance.runtimeState === "failed") return "异常";
  if (instance.runtimeState === "stopped") return "已停止";
  return "待检测";
}

function getStatusTone(instance: ConsoleInstance): DiagnosticsTone {
  if (instance.runtimeState === "running" || instance.status === "normal") return "success";
  if (instance.runtimeState === "warning" || instance.runtimeState === "creating" || instance.status === "warning") return "warning";
  return "offline";
}

function formatRuntimeServiceDetail(detail?: string | null) {
  if (!detail) return "运行服务状态尚未返回。";
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

function getDockerCheck(instance: ConsoleInstance, context: DiagnosticsContext): DiagnosticsCheck {
  const diagnostics = context.diagnostics;
  const runtimeDiagnostics = getRuntimeDiagnostics(instance);
  const daemonRunning = diagnostics?.docker?.daemonRunning ?? runtimeDiagnostics?.dockerDaemonRunning;
  const available = diagnostics?.docker?.available ?? runtimeDiagnostics?.dockerAvailable;
  const detail = formatRuntimeServiceDetail(diagnostics?.docker?.detail ?? instance.diagnostics?.dockerDetail);

  return {
    label: "运行服务",
    value: available && daemonRunning ? "可用" : available === false || daemonRunning === false ? "需修复" : "待检测",
    detail,
    tone: available && daemonRunning ? "success" : available === false || daemonRunning === false ? "warning" : "offline",
  };
}

function getGatewayCheck(instance: ConsoleInstance, context: DiagnosticsContext): DiagnosticsCheck {
  const diagnostics = context.diagnostics;
  const runtimeDiagnostics = getRuntimeDiagnostics(instance);
  const reachable = diagnostics?.gateway?.reachable ?? runtimeDiagnostics?.gatewayReachable;
  const detail = diagnostics?.gateway?.detail ?? instance.diagnostics?.gatewayDetail ?? "Gateway 状态尚未返回。";

  return {
    label: "Gateway 检查",
    value: reachable ? "可访问" : reachable === false ? "不可访问" : instance.gateway,
    detail,
    tone: reachable ? "success" : reachable === false ? "warning" : instance.gateway === "已连接" ? "success" : "offline",
  };
}

function buildHints(instance: ConsoleInstance, dockerCheck: DiagnosticsCheck, gatewayCheck: DiagnosticsCheck, context: DiagnosticsContext) {
  const hints: string[] = [];
  const lastRecoveryResult = context.rawRecord?.lastRecoveryResult ?? getRuntimeField(instance, "lastRecoveryResult");
  const display = resolveRemoteDisplayState(instance, context);
  hints.push(display.hint);
  if (dockerCheck.tone !== "success") hints.push("先恢复运行服务，再重试 Gateway 健康检查。");
  if (gatewayCheck.tone !== "success") hints.push("Gateway 不可达时优先到部署管理执行重启 Gateway 或重建部署。");
  if (context.diagnostics?.container || getRuntimeDiagnostics(instance)?.container) hints.push("运行状态已经返回，可结合端口映射判断是服务退出还是网络映射问题。");
  if (lastRecoveryResult) hints.push(`最近已执行恢复：${lastRecoveryResult}`);
  if (hints.length === 0) hints.push("当前节点关键检查没有明显阻塞，继续观察最近诊断结论即可。");
  return [...new Set(hints)].slice(0, 4);
}

export function buildDiagnosticsViewModel(instance: ConsoleInstance, context: DiagnosticsContext = {}): DiagnosticsViewModel {
  const runtimeDiagnostics = getRuntimeDiagnostics(instance);
  const diagnostics = context.diagnostics;
  const rawRecord = context.rawRecord;
  const lastRecoveryResult = rawRecord?.lastRecoveryResult ?? getRuntimeField(instance, "lastRecoveryResult");
  const narrative = resolveRemoteStatusNarrative(instance, { rawRecord, diagnostics });
  const display = resolveRemoteDisplayState(instance, { rawRecord, diagnostics });
  const dockerCheck = getDockerCheck(instance, context);
  const gatewayCheck = getGatewayCheck(instance, context);
  const externalPort = getExternalPort(instance, rawRecord);
  const internalPort = getInternalPort(instance, rawRecord);
  const containerName = getContainerName(instance, rawRecord);
  const recoverableLoss = narrative.kind === "recoverable-loss";
  const containerSummary = buildContainerSummary(instance, context, { recoverableLoss });
  const conclusion = narrative.primaryDetail;

  const checks: DiagnosticsCheck[] = [
    {
      label: "运行载体",
      value: `${containerName} · ${containerSummary.value}`,
      detail: containerSummary.detail,
      tone: containerSummary.tone,
    },
    {
      label: "端口映射",
      value: `${externalPort ? String(externalPort) : "未分配"} → ${internalPort ? String(internalPort) : "8642"}`,
      detail: recoverableLoss
        ? `当前只保留注册表端口 ${externalPort ? String(externalPort) : "未分配"} → ${internalPort ? String(internalPort) : "8642"}；受管运行服务已不存在，需重新导入或重建后再验证。`
        : `对外端口 ${externalPort ? String(externalPort) : "未分配"} 转发到服务内部端口 ${internalPort ? String(internalPort) : "8642"}。`,
      tone: recoverableLoss ? "warning" : externalPort ? "success" : "warning",
    },
    dockerCheck,
    gatewayCheck,
  ];

  return {
    summary: {
      title: "健康摘要 / 集中答案",
      value: display.statusValue,
      detail: conclusion,
      tone: display.tone,
    },
    checks,
    conclusion,
    hints: buildHints(instance, dockerCheck, gatewayCheck, context),
  };
}

export function buildDiagnosticsSnapshot(instance: ConsoleInstance, context: DiagnosticsContext = {}) {
  const viewModel = buildDiagnosticsViewModel(instance, context);
  const containerStatus = viewModel.checks.find((check) => check.label === "运行载体")!;
  const portMapping = viewModel.checks.find((check) => check.label === "端口映射")!;

  return {
    healthSummary: viewModel.summary,
    containerStatus,
    portMapping,
    checks: viewModel.checks.filter((check) => check.label === "运行服务" || check.label === "Gateway 检查"),
    recentConclusion: {
      title: "最近诊断结论",
      detail: viewModel.conclusion,
    },
  };
}

function getToneClasses(tone: DiagnosticsTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50/70 text-amber-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-800";
}

function getBadgeVariant(tone: DiagnosticsTone) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  return "outline" as const;
}

function getCheckIcon(label: string) {
  if (label === "运行载体") return Boxes;
  if (label === "端口映射") return Network;
  if (label === "运行服务") return Database;
  return Terminal;
}

export function Diagnostics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = id ? consoleInstances.find((item) => item.id === id) ?? null : null;
  const [instance, setInstance] = useState<ConsoleInstance | null>(desktopRuntimeAvailable ? null : fallbackInstance);
  const [rawRecord, setRawRecord] = useState<ConsoleInstanceRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<InstanceStateResult["diagnostics"] | null>(fallbackInstance?.diagnostics ?? null);
  const [loading, setLoading] = useState(desktopRuntimeAvailable);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setInstance(fallbackInstance);
        setRawRecord(null);
        setDiagnostics(fallbackInstance?.diagnostics ?? null);
        setLoadError(error instanceof Error ? error.message : "读取节点诊断失败。");
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
        const next = await loadConsoleRuntimeDetailState(id);
        setInstance(next.runtimeInstance);
        setRawRecord(next.state?.instance ?? null);
        setDiagnostics(next.diagnostics ?? null);
      }
    });
  }, [id]);

  const viewModel = useMemo(() => {
    if (!instance) return undefined;
    return buildDiagnosticsViewModel(instance, { rawRecord, diagnostics });
  }, [diagnostics, instance, rawRecord]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[480px] p-8 text-center text-sm text-zinc-600">
          <div className="flex items-center justify-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在读取远程节点诊断…
          </div>
        </Card>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[520px] p-8 text-center">
          <div className="text-lg font-semibold text-zinc-950">找不到诊断节点</div>
          <div className="mt-2 text-sm text-zinc-500">请先返回主页选择远程实例，再重新进入诊断页。</div>
          <div className="mt-5">
            <Button variant="primary" size="sm" onClick={() => navigate("/")}>返回主页</Button>
          </div>
        </Card>
      </div>
    );
  }

  const isRemote = instance.type === "remote";
  const pageUx = buildRemoteNodeUxCopy("diagnostics", instance.id);

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <PageHeader
        title="诊断"
        description={pageUx.description}
        meta={<Badge variant={instance.status === "normal" ? "success" : instance.status === "warning" ? "warning" : "outline"}>{isRemote ? "远程节点" : "本地实例"}</Badge>}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate(pageUx.secondaryTo ?? `/instance/${instance.id}/environment`)}>{pageUx.secondaryLabel ?? "环境检查"}</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(pageUx.primaryTo ?? `/instance/${instance.id}/deployment`)}>{pageUx.primaryLabel ?? "前往部署管理"}</Button>
          </>
        }
      />

      {!isRemote ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          当前页面按远程节点优先设计。本地实例建议回到概况页查看运行状态。
        </Card>
      ) : null}

      {loadError ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          当前展示的是兜底诊断信息，原因：{loadError}
        </Card>
      ) : null}

      {viewModel ? (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className={`p-6 ${getToneClasses(viewModel.summary.tone)}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-base font-semibold text-current">
                  <Activity className="h-4 w-4" />
                  健康摘要
                </div>
                <Badge variant={getBadgeVariant(viewModel.summary.tone)}>{viewModel.summary.value}</Badge>
              </div>
              <div className="mt-4 text-sm leading-6 text-current/80">{viewModel.summary.detail}</div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <AlertTriangle className="h-4 w-4 text-zinc-500" />
                最近诊断结论
              </div>
              {pageUx.nextStepDetail ? (
                <div className="mt-2 text-sm leading-6 text-zinc-500">{pageUx.nextStepDetail}</div>
              ) : null}
              <div className="mt-4 break-words text-sm leading-6 text-zinc-600">{viewModel.conclusion}</div>
            </Card>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.checks.map((check) => {
              const Icon = getCheckIcon(check.label);
              return (
                <Card key={check.label} className={`p-5 ${getToneClasses(check.tone)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-current/70">
                      <Icon className="h-3.5 w-3.5" />
                      {check.label}
                    </div>
                    <Badge variant={getBadgeVariant(check.tone)}>{check.tone === "success" ? "正常" : check.tone === "warning" ? "待处理" : "待检测"}</Badge>
                  </div>
                  <div className="mt-4 break-words text-sm font-semibold text-current">{check.value}</div>
                  <div className="mt-2 break-words text-xs leading-6 text-current/80">{check.detail}</div>
                </Card>
              );
            })}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <Terminal className="h-4 w-4 text-zinc-500" />
                排障建议
              </div>
              <div className="mt-5 space-y-3">
                {viewModel.hints.map((hint) => (
                  <div key={hint} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4 text-sm leading-6 text-zinc-600">
                    {hint}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <Network className="h-4 w-4 text-zinc-500" />
                远程节点答案汇总
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">运行载体</div>
                  <div className="mt-2 break-words text-sm font-medium text-zinc-950">{viewModel.checks.find((check) => check.label === "运行载体")?.detail}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">端口映射</div>
                  <div className="mt-2 break-words text-sm font-medium text-zinc-950">{viewModel.checks.find((check) => check.label === "端口映射")?.value}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">运行服务</div>
                  <div className="mt-2 break-words text-sm font-medium text-zinc-950">{viewModel.checks.find((check) => check.label === "运行服务")?.detail}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">Gateway 检查</div>
                  <div className="mt-2 break-words text-sm font-medium text-zinc-950">{viewModel.checks.find((check) => check.label === "Gateway 检查")?.detail}</div>
                </div>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
