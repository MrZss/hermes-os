import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AlertTriangle, FolderTree, LoaderCircle, Shield, TerminalSquare, Wrench } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/console/PageHeader";
import { consoleInstances, type ConsoleInstance } from "../../data/console";
import { type ConsoleInstanceRecord, type InstanceStateResult } from "../../services/instances";
import { buildRemoteNodeUxCopy, loadConsoleRuntimeDetailState, resolveRemoteDisplayState, resolveRemoteStatusNarrative, subscribeConsoleRuntimeRefresh, type ConsoleRuntimeInstance } from "../../services/runtime";
import { inspectRemoteEnvironment } from "../../services/system";

type EnvironmentTone = "success" | "warning" | "offline";

type EnvironmentCard = {
  label: string;
  value: string;
  detail: string;
  tone: EnvironmentTone;
};

type EnvironmentRecommendation = {
  title: string;
  detail: string;
};

type EnvironmentViewModel = {
  summary: {
    value: string;
    detail: string;
    tone: EnvironmentTone;
  };
  cards: EnvironmentCard[];
  recommendations: EnvironmentRecommendation[];
  rawSummary: string;
  hint: string;
};

type EnvironmentContext = {
  rawRecord?: Partial<ConsoleInstanceRecord> | null;
  diagnostics?: InstanceStateResult["diagnostics"] | null;
  inspection?: HermesRemoteEnvironmentInspection | null;
};

function getRuntimeField<T extends keyof ConsoleRuntimeInstance>(instance: ConsoleInstance, field: T) {
  return (instance as ConsoleRuntimeInstance)[field];
}

function formatPortPair(
  instance: ConsoleInstance,
  rawRecord?: Partial<ConsoleInstanceRecord> | null,
  inspection?: HermesRemoteEnvironmentInspection | null
) {
  const externalPort = inspection?.port.port ?? rawRecord?.docker?.publishedPort ?? instance.publishedPort;
  const internalPort = rawRecord?.docker?.containerPort ?? getRuntimeField(instance, "containerPort") ?? 8642;
  return `${externalPort ? String(externalPort) : "未分配"} → ${internalPort ? String(internalPort) : "8642"}`;
}

function getRemoteWorkdir(
  instance: ConsoleInstance,
  rawRecord?: Partial<ConsoleInstanceRecord> | null,
  inspection?: HermesRemoteEnvironmentInspection | null
) {
  return inspection?.workdir ?? rawRecord?.remote?.workdir ?? getRuntimeField(instance, "remoteConfig")?.workdir ?? instance.workspaceDir ?? "未检测到";
}

function getSshTarget(instance: ConsoleInstance, rawRecord?: Partial<ConsoleInstanceRecord> | null) {
  if (rawRecord?.remote) return `${rawRecord.remote.user}@${rawRecord.remote.host}:${rawRecord.remote.port}`;
  return instance.sshTarget ?? instance.endpoint;
}

function getHermesCliSummary(
  instance: ConsoleInstance,
  diagnostics?: InstanceStateResult["diagnostics"] | null,
  inspection?: HermesRemoteEnvironmentInspection | null
) {
  if (inspection?.hermes) {
    return {
      value: inspection.hermes.available ? "已检测到 CLI" : "未检测到独立 CLI",
      detail: inspection.hermes.detail || inspection.hermes.binaryPath || "远程节点未返回 Hermes CLI 明细。",
      tone: inspection.hermes.available ? "success" as const : "warning" as const,
    };
  }

  const combinedText = [instance.summary, instance.lastError, diagnostics?.detail].filter(Boolean).join(" ");
  if (/未发现\s*Hermes\s*CLI|Hermes\s*CLI.*未安装|hermes command not found/i.test(combinedText)) {
    return {
      value: "未检测到独立 CLI",
      detail: "请先补齐 Hermes CLI，或在部署管理里重建网关服务。",
      tone: "warning" as const,
    };
  }

  if (instance.runtime === "docker") {
    return {
      value: "由网关服务托管",
      detail: "当前节点由网关服务托管，宿主机无需常驻 CLI 也可继续部署。",
      tone: "success" as const,
    };
  }

  return {
    value: "待人工确认",
    detail: "当前诊断未返回 CLI 明确信号，请结合原始诊断摘要确认。",
    tone: "offline" as const,
  };
}

function buildRecommendationList(
  instance: ConsoleInstance,
  rawRecord?: Partial<ConsoleInstanceRecord> | null,
  diagnostics?: InstanceStateResult["diagnostics"] | null,
  inspection?: HermesRemoteEnvironmentInspection | null
) {
  const recommendations: EnvironmentRecommendation[] = [];
  const workspaceDir = getRemoteWorkdir(instance, rawRecord, inspection);
  const lastRecoveryResult = rawRecord?.lastRecoveryResult ?? getRuntimeField(instance, "lastRecoveryResult");
  const lastRecoveredAt = rawRecord?.lastRecoveredAt ?? getRuntimeField(instance, "lastRecoveredAt");

  if (lastRecoveryResult) {
    recommendations.push({
      title: "最近恢复已完成",
      detail: lastRecoveredAt
        ? `${lastRecoveryResult}（${new Date(lastRecoveredAt).toLocaleString("zh-CN")}）`
        : lastRecoveryResult,
    });
  }

  if (inspection?.ssh && !inspection.ssh.reachable) {
    recommendations.push({
      title: "先恢复 SSH 连通性",
      detail: inspection.ssh.detail || "SSH 无法连通时，后续目录、运行服务与端口检查都不会可靠。",
    });
  }

  if (!workspaceDir || workspaceDir === "未检测到") {
    recommendations.push({
      title: "补齐远程工作目录",
      detail: "当前没有稳定工作目录，请先在创建向导或部署管理页确认远程目录后再重试环境检查。",
    });
  }

  if (inspection?.directory && !inspection.directory.writable) {
    recommendations.push({
      title: "修复目录写入权限",
      detail: inspection.directory.detail || "远程目录不可写，部署阶段无法写入 Hermes 配置和运行状态。",
    });
  }

  if (inspection?.docker && (!inspection.docker.available || !inspection.docker.daemonRunning)) {
    recommendations.push({
      title: "优先修复运行服务",
      detail: inspection.docker.detail || "服务器运行服务不可用，节点暂时无法继续部署。",
    });
  }

  if (diagnostics?.docker && (!diagnostics.docker.available || !diagnostics.docker.daemonRunning)) {
    recommendations.push({
      title: "优先修复运行服务",
      detail: diagnostics.docker.detail || "服务器运行服务不可用，节点暂时无法继续部署。",
    });
  }

  if (diagnostics?.gateway && !diagnostics.gateway.reachable) {
    recommendations.push({
      title: "Gateway 仍未连通",
      detail: "建议先进入部署管理执行重建部署或重启 Gateway，再回到环境检查确认对外端口。",
    });
  }

  if (inspection?.port && inspection.port.available === false) {
    recommendations.push({
      title: `释放端口 ${inspection.port.port}`,
      detail: inspection.port.detail || "对外端口被占用，请释放端口或重新选择可用映射端口。",
    });
  }

  if (inspection?.hermes && !inspection.hermes.available) {
    recommendations.push({
      title: "安装或补齐 Hermes CLI",
      detail: inspection.hermes.detail || "远程节点未检测到 Hermes CLI；若依赖宿主机命令，请先完成安装。",
    });
  }

  if (instance.lastError) {
    recommendations.push({
      title: "先处理最近错误",
      detail: instance.lastError,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: "环境前置条件已就绪",
      detail: "当前 SSH、工作目录、运行服务与对外端口没有明显阻塞，可继续进入部署管理或 AI 提供商配置。",
    });
  }

  return recommendations;
}

function getCardTone(options: { ok?: boolean; warn?: boolean }) {
  if (options.warn) return "warning" as const;
  if (options.ok) return "success" as const;
  return "offline" as const;
}

export function buildEnvironmentViewModel(instance: ConsoleInstance, context: EnvironmentContext = {}): EnvironmentViewModel {
  const { rawRecord, diagnostics, inspection } = context;
  const workspaceDir = getRemoteWorkdir(instance, rawRecord, inspection);
  const hermesCli = getHermesCliSummary(instance, diagnostics, inspection);
  const narrative = resolveRemoteStatusNarrative(instance, { rawRecord, diagnostics });
  const display = resolveRemoteDisplayState(instance, { rawRecord, diagnostics });

  const cards: EnvironmentCard[] = [
    {
      label: "SSH",
      value: getSshTarget(instance, rawRecord),
      detail: inspection?.ssh.detail ?? diagnostics?.detail ?? instance.security,
      tone: getCardTone({ ok: inspection?.ssh.reachable ?? Boolean(instance.sshTarget ?? instance.endpoint), warn: Boolean(instance.lastError) || inspection?.ssh.reachable === false }),
    },
    {
      label: "目录",
      value: workspaceDir,
      detail: inspection?.directory.detail ?? `HERMES_HOME：${instance.hermesHome ?? "未检测到"}`,
      tone: getCardTone({ ok: inspection?.directory.writable ?? workspaceDir !== "未检测到", warn: inspection?.directory.writable === false || workspaceDir === "未检测到" }),
    },
    {
      label: "运行服务",
      value: inspection?.docker
        ? inspection.docker.daemonRunning
          ? "已就绪"
          : "需修复"
        : diagnostics?.docker
          ? diagnostics.docker.daemonRunning
            ? "已就绪"
            : "需修复"
          : "待检测",
      detail: inspection?.docker.version ?? rawRecord?.docker?.containerName ?? instance.containerName ?? "尚未创建运行服务",
      tone: getCardTone({
        ok: inspection?.docker ? inspection.docker.available && inspection.docker.daemonRunning : Boolean(diagnostics?.docker?.available && diagnostics?.docker?.daemonRunning),
        warn: inspection?.docker ? !inspection.docker.daemonRunning : diagnostics?.docker ? !diagnostics.docker.daemonRunning : Boolean(instance.lastError),
      }),
    },
    {
      label: "端口",
      value: formatPortPair(instance, rawRecord, inspection),
      detail: inspection?.port.detail ?? `节点入口：${instance.endpoint}`,
      tone: getCardTone({ ok: inspection?.port.available ?? Boolean(instance.publishedPort), warn: inspection?.port.available === false || !instance.publishedPort }),
    },
    {
      label: "Hermes CLI",
      value: hermesCli.value,
      detail: hermesCli.detail,
      tone: hermesCli.tone,
    },
  ];

  const recommendations = buildRecommendationList(instance, rawRecord, diagnostics, inspection);
  const rawSummary = [
    inspection?.warning,
    diagnostics?.detail,
    diagnostics?.docker?.detail,
    diagnostics?.gateway?.detail,
    inspection?.raw ? Object.entries(inspection.raw).map(([key, value]) => `${key}:\n${value}`).join("\n\n") : null,
    instance.lastError,
    instance.summary,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    summary: {
      value: display.badgeLabel,
      detail: narrative.primaryDetail,
      tone: display.tone,
    },
    cards,
    recommendations,
    rawSummary: rawSummary || "当前没有可展开的原始诊断输出，结果卡片已汇总主要结论。",
    hint: display.hint,
  };
}

export function buildEnvironmentSnapshot(
  instance: ConsoleInstance,
  inspection?: HermesRemoteEnvironmentInspection | null,
  context: Omit<EnvironmentContext, "inspection"> = {}
) {
  const viewModel = buildEnvironmentViewModel(instance, { ...context, inspection });
  const keyByLabel = new Map([
    ["SSH", "ssh"],
    ["目录", "directory"],
    ["运行服务", "runtime-service"],
    ["端口", "port"],
    ["Hermes CLI", "hermes-cli"],
  ]);
  const titleByLabel = new Map([
    ["SSH", "SSH 连通性"],
    ["目录", "远程目录"],
    ["运行服务", "运行服务"],
    ["端口", "端口"],
    ["Hermes CLI", "Hermes CLI"],
  ]);

  return {
    resultCards: viewModel.cards.map((card) => ({
      key: keyByLabel.get(card.label) ?? card.label,
      title: titleByLabel.get(card.label) ?? card.label,
      value: card.value,
      detail: card.detail,
      tone: card.tone,
    })),
    repairItems: viewModel.recommendations,
    foldedSummary: {
      title: "原始错误 / 诊断摘要",
      content: viewModel.rawSummary,
    },
  };
}

function getToneClasses(tone: EnvironmentTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50/70 text-amber-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-800";
}

function getBadgeVariant(tone: EnvironmentTone) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  return "outline" as const;
}

export function Environment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = id ? consoleInstances.find((item) => item.id === id) ?? null : null;
  const [instance, setInstance] = useState<ConsoleInstance | null>(desktopRuntimeAvailable ? null : fallbackInstance);
  const [rawRecord, setRawRecord] = useState<ConsoleInstanceRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<InstanceStateResult["diagnostics"] | null>(fallbackInstance?.diagnostics ?? null);
  const [inspection, setInspection] = useState<HermesRemoteEnvironmentInspection | null>(null);
  const [loading, setLoading] = useState(desktopRuntimeAvailable);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

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
        setInspection(null);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setInstance(fallbackInstance);
        setRawRecord(null);
        setDiagnostics(fallbackInstance?.diagnostics ?? null);
        setInspection(null);
        setLoadError(error instanceof Error ? error.message : "读取环境检查结果失败。");
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
    return buildEnvironmentViewModel(instance, { rawRecord, diagnostics, inspection });
  }, [diagnostics, inspection, instance, rawRecord]);

  const runRemoteInspection = async () => {
    if (!instance) return;
    const remoteConfig = rawRecord?.remote ?? getRuntimeField(instance, "remoteConfig");
    if (!remoteConfig) {
      setInspectError("当前节点缺少远程连接配置，无法执行 SSH / 运行服务 / Hermes CLI 实时读取。");
      return;
    }

    setInspecting(true);
    setInspectError(null);
    try {
      const result = await inspectRemoteEnvironment({
        host: remoteConfig.host,
        port: remoteConfig.port,
        user: remoteConfig.user,
        authMode: remoteConfig.authMode,
        keyPath: remoteConfig.keyPath,
        password: remoteConfig.password,
        workdir: remoteConfig.workdir,
        gatewayPort: rawRecord?.docker?.publishedPort ?? instance.publishedPort,
      });
      setInspection(result);
    } catch (error) {
      setInspectError(error instanceof Error ? error.message : "读取远程环境失败。");
    } finally {
      setInspecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[480px] p-8 text-center text-sm text-zinc-600">
          <div className="flex items-center justify-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在读取远程节点环境…
          </div>
        </Card>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="max-w-[520px] p-8 text-center">
          <div className="text-lg font-semibold text-zinc-950">找不到远程节点</div>
          <div className="mt-2 text-sm text-zinc-500">请先返回主页选择远程实例，再重新进入环境检查。</div>
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
  const pageUx = buildRemoteNodeUxCopy("environment", instance.id, { hasEnvironmentInspection: Boolean(rawRecord || diagnostics) });

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <PageHeader
        title="环境检查"
        description={pageUx.description}
        meta={<Badge variant={instance.status === "normal" ? "success" : instance.status === "warning" ? "warning" : "outline"}>{isRemote ? "远程节点" : "本地实例"}</Badge>}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void runRemoteInspection()} disabled={!isRemote || inspecting}>
              {inspecting ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {inspecting ? "读取中..." : pageUx.primaryLabel}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(pageUx.secondaryTo ?? `/instance/${instance.id}/deployment`)}>
              {pageUx.secondaryLabel}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(pageUx.tertiaryTo ?? `/instance/${instance.id}/diagnostics`)}>
              {pageUx.tertiaryLabel}
            </Button>
          </>
        }
      />

      {!isRemote ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          当前页面按远程节点优先设计。本地实例建议直接回到概况页继续使用。
        </Card>
      ) : null}

      {loadError ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          当前展示的是兜底环境信息，原因：{loadError}
        </Card>
      ) : null}

      {inspectError ? (
        <Card className="mt-6 border-red-200 bg-red-50/80 p-4 text-sm text-red-900">
          实时读取远程环境失败：{inspectError}
        </Card>
      ) : null}

      {viewModel ? (
        <>
          <section className="mt-6 grid gap-4 xl:grid-cols-5 md:grid-cols-2">
            {viewModel.cards.map((card) => (
              <Card key={card.label} className={`p-5 ${getToneClasses(card.tone)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-current/70">{card.label}</div>
                  <Badge variant={getBadgeVariant(card.tone)}>{card.tone === "success" ? "可用" : card.tone === "warning" ? "待修复" : "待确认"}</Badge>
                </div>
                <div className="mt-4 break-words text-sm font-semibold text-current">{card.value}</div>
                <div className="mt-2 break-words text-xs leading-6 text-current/80">{card.detail}</div>
              </Card>
            ))}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <Wrench className="h-4 w-4 text-zinc-500" />
                建议修复项
              </div>
              <div className="mt-2 text-sm leading-6 text-zinc-600">{pageUx.nextStepDetail ?? viewModel.hint}</div>
              <div className="mt-5 space-y-3">
                {viewModel.recommendations.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                    <div className="text-sm font-medium text-zinc-950">{item.title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-600">{item.detail}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                <AlertTriangle className="h-4 w-4 text-zinc-500" />
                原始诊断摘要
              </div>
              <div className="mt-2 text-sm leading-6 text-zinc-600">默认只展示汇总结论；需要时可展开查看原始摘要，不再把整段输出直接铺满页面。</div>
              <details className="mt-5 rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-zinc-950">展开诊断摘要</summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-zinc-600">{viewModel.rawSummary}</pre>
              </details>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Shield className="h-3.5 w-3.5" />
                    SSH 目标
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">{instance.sshTarget ?? instance.endpoint}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <FolderTree className="h-3.5 w-3.5" />
                    当前目录
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">{rawRecord?.remote?.workdir ?? instance.workspaceDir ?? "未检测到"}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4 sm:col-span-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <TerminalSquare className="h-3.5 w-3.5" />
                    Hermes CLI / Gateway 备注
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">{viewModel.cards.find((card) => card.label === "Hermes CLI")?.detail}</div>
                </div>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
