import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  FileCode2,
  FileText,
  FolderOpen,
  LoaderCircle,
  Palette,
  Play,
  RefreshCcw,
  RotateCw,
  ShieldAlert,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/console/PageHeader";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { hermesSettingsSummary } from "../data/hermesOfficial";
import { listConsoleRuntimeInstances } from "../services/runtime";
import {
  completeUninstallHermesLocal,
  inspectLocalEnvironment,
  openDesktopPath,
  reinstallHermesGatewayService,
  runHermesDeepStatus,
  runHermesDoctor,
  runHermesGatewayAction,
  runHermesGatewayStatus,
  uninstallHermesAgent,
  uninstallHermesGatewayService,
} from "../services/system";

const summaryCardClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3.5 [overflow-wrap:anywhere]";
const actionCardClassName =
  "flex w-full items-start gap-3 rounded-2xl border border-zinc-200/70 bg-[#faf9f6] p-4 text-left text-zinc-700 transition hover:border-zinc-300 hover:bg-white";
const dangerActionCardClassName =
  "flex w-full items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-left text-red-800 transition hover:border-red-300 hover:bg-red-50";
const uninstallConfirmationText = "UNINSTALL HERMES";
const FULL_UNINSTALL_HERMES = "FULL UNINSTALL HERMES";

function formatCompleteUninstallFeedback(result: HermesCompleteUninstallPayload) {
  const stepLines = result.steps.map((step) => {
    const prefix = step.status === "success" ? "✓" : step.status === "warning" ? "!" : "-";
    return `${prefix} ${step.label}：${step.detail}`;
  });
  const remainingLines = [
    `CLI：${result.remaining.hermesBinaryExists || result.remaining.hermesAvailable ? "仍检测到" : "未检测到"} (${result.remaining.hermesBinaryPath})`,
    `HERMES_HOME：${result.remaining.hermesHomeExists ? "仍存在" : "已清理"} (${result.remaining.hermesHome})`,
    `Console 本地 Native 实例：${result.remaining.registeredNativeInstanceIds.length > 0 ? result.remaining.registeredNativeInstanceIds.join(", ") : "无残留"}`,
  ];

  return [`${result.summary}`, "", "执行步骤：", ...stepLines, "", "残留检测：", ...remainingLines].join("\n");
}

type MaintenanceFeedback =
  | {
      tone: "success" | "error";
      title: string;
      content: string;
    }
  | null;

export function Settings() {
  const desktopHomeDirectory = typeof window === "undefined" ? undefined : window.hermesDesktop?.homeDirectory;
  const hermesHome = desktopHomeDirectory ? `${desktopHomeDirectory}/.hermes` : "~/.hermes";
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MaintenanceFeedback>(null);
  const [environmentSummary, setEnvironmentSummary] = useState<HermesLocalEnvironmentInspection | null>(null);
  const [managedInstanceCount, setManagedInstanceCount] = useState<number | null>(null);
  const [managedLocalNativeInstanceCount, setManagedLocalNativeInstanceCount] = useState<number | null>(null);
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [uninstallMode, setUninstallMode] = useState<"keep-data" | "full">("keep-data");
  const [uninstallConfirmText, setUninstallConfirmText] = useState("");
  const settingsSummary = hermesSettingsSummary.map((item) => ({
    ...item,
    value:
      item.label === "HERMES_HOME"
        ? hermesHome
        : desktopHomeDirectory
          ? `${desktopHomeDirectory}/.hermes/${item.label}`
          : item.value,
  }));

  const configLocation = `${hermesHome}/config.yaml`;
  const envLocation = `${hermesHome}/.env`;
  const authLocation = `${hermesHome}/auth.json`;
  const logsLocation = `${hermesHome}/logs`;
  const expectedUninstallConfirmationText = uninstallMode === "full" ? FULL_UNINSTALL_HERMES : uninstallConfirmationText;
  const uninstallEnvironmentReady = environmentSummary !== null && managedInstanceCount !== null && managedLocalNativeInstanceCount !== null;
  const hasHermesUninstallTarget = Boolean(
    environmentSummary?.hermes.available ||
      environmentSummary?.hermesHome.exists ||
      environmentSummary?.hermesHomeExists ||
      (managedLocalNativeInstanceCount ?? 0) > 0,
  );
  const uninstallDisabled = workingAction !== null || (uninstallEnvironmentReady && !hasHermesUninstallTarget);

  async function refreshEnvironmentSummary() {
    try {
      const [environment, instances] = await Promise.all([
        inspectLocalEnvironment(),
        listConsoleRuntimeInstances().catch(() => []),
      ]);
      setEnvironmentSummary(environment);
      setManagedInstanceCount(instances.length);
      setManagedLocalNativeInstanceCount(instances.filter((instance) => instance.type === "local" && instance.runtime === "native").length);
    } catch {
      setEnvironmentSummary(null);
      setManagedInstanceCount(null);
      setManagedLocalNativeInstanceCount(null);
    }
  }

  useEffect(() => {
    void refreshEnvironmentSummary();
  }, []);

  async function handleOpenPath(label: string, targetPath: string) {
    setWorkingAction(label);
    setFeedback(null);

    try {
      await openDesktopPath(targetPath);
      setFeedback({
        tone: "success",
        title: `已打开 ${label}`,
        content: targetPath,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: `${label} 打开失败`,
        content: error instanceof Error ? error.message : "打开路径失败。",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleGatewayStatus() {
    setWorkingAction("gateway-status");
    setFeedback(null);

    try {
      const result = await runHermesGatewayStatus();
      setFeedback({
        tone: "success",
        title: "Gateway 状态",
        content: result.stdout || result.stderr || "Hermes gateway status 未返回输出。",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Gateway 状态读取失败",
        content: error instanceof Error ? error.message : "读取 gateway 状态失败。",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleGatewayAction(action: "start" | "stop" | "restart") {
    setWorkingAction(`gateway-${action}`);
    setFeedback(null);

    try {
      const result = await runHermesGatewayAction(action);
      const titleMap = {
        start: "Gateway 已启动",
        stop: "Gateway 已停止",
        restart: "Gateway 已重启",
      } as const;
      setFeedback({
        tone: "success",
        title: titleMap[action],
        content: result.stdout || result.stderr || `gateway ${action} 未返回输出。`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: `Gateway ${action} 执行失败`,
        content: error instanceof Error ? error.message : `执行 gateway ${action} 失败。`,
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleGatewayServiceAction(action: "install" | "uninstall") {
    setWorkingAction(`gateway-service-${action}`);
    setFeedback(null);

    try {
      const result = action === "install"
        ? await reinstallHermesGatewayService()
        : await uninstallHermesGatewayService();
      setFeedback({
        tone: "success",
        title: action === "install" ? "Gateway 服务已重装" : "Gateway 服务已卸载",
        content: result.stdout || result.stderr || (action === "install" ? "gateway install --force 未返回输出。" : "gateway uninstall 未返回输出。"),
      });
      await refreshEnvironmentSummary();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: action === "install" ? "Gateway 服务重装失败" : "Gateway 服务卸载失败",
        content: error instanceof Error ? error.message : "Gateway 服务操作失败。",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  function openUninstallDialog() {
    if (uninstallEnvironmentReady && !hasHermesUninstallTarget) {
      setFeedback({
        tone: "success",
        title: "Hermes 已处于卸载状态",
        content: "未检测到 Hermes CLI、~/.hermes 或 Console 本地 Native 实例，无需重复卸载。",
      });
      return;
    }

    setUninstallMode("keep-data");
    setUninstallConfirmText("");
    setUninstallDialogOpen(true);
  }

  async function handleUninstallHermesAgent() {
    const expectedConfirmationText = uninstallMode === "full" ? FULL_UNINSTALL_HERMES : uninstallConfirmationText;
    if (uninstallConfirmText !== expectedConfirmationText) return;

    setWorkingAction("hermes-uninstall");
    setFeedback(null);

    try {
      if (uninstallMode === "full") {
        const result = await completeUninstallHermesLocal(FULL_UNINSTALL_HERMES);
        const hasRemaining =
          result.remaining.hermesBinaryExists ||
          result.remaining.hermesHomeExists ||
          result.remaining.hermesAvailable ||
          result.remaining.registeredNativeInstanceIds.length > 0;

        setFeedback({
          tone: hasRemaining ? "error" : "success",
          title: hasRemaining ? "完整卸载后仍检测到残留" : "Hermes 已完整卸载",
          content: formatCompleteUninstallFeedback(result),
        });
      } else {
        const result = await uninstallHermesAgent("keep-data");
        setFeedback({
          tone: "success",
          title: "Hermes Agent 已卸载",
          content: result.stdout || result.stderr || "hermes uninstall 未返回输出。",
        });
      }
      setUninstallDialogOpen(false);
      setUninstallConfirmText("");
      await refreshEnvironmentSummary();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Hermes Agent 卸载失败",
        content: error instanceof Error ? error.message : "卸载 Hermes Agent 失败。",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleRunDeepStatus() {
    setWorkingAction("status-deep");
    setFeedback(null);

    try {
      const result = await runHermesDeepStatus();
      setFeedback({
        tone: "success",
        title: "Hermes 深度状态",
        content: result.stdout || result.stderr || "status --deep 未返回输出。",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Hermes 深度状态读取失败",
        content: error instanceof Error ? error.message : "读取 Hermes 深度状态失败。",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleRunDoctor() {
    setWorkingAction("doctor");
    setFeedback(null);

    try {
      const result = await runHermesDoctor();
      setFeedback({
        tone: "success",
        title: "Doctor 输出",
        content: result.stdout || result.stderr || "Hermes doctor 未返回输出。",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Doctor 执行失败",
        content: error instanceof Error ? error.message : "运行 doctor 失败。",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[980px] flex-1 flex-col gap-5 px-8 py-8">
        <PageHeader title="设置" />

        <Card className="p-6">
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-zinc-950">应用偏好</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className={summaryCardClassName}>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">语言</div>
                <div className="mt-1.5 text-sm font-medium text-zinc-950">简体中文</div>
                <div className="mt-1 text-sm text-zinc-500">当前使用</div>
              </div>

              <div className={summaryCardClassName}>
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                  <Palette className="h-3.5 w-3.5" />
                  主题
                </div>
                <div className="mt-1.5 text-sm font-medium text-zinc-950">暖白主题</div>
                <div className="mt-1 text-sm text-zinc-500">当前使用</div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-zinc-950">Hermes 配置摘要</h2>
            <div className="space-y-3">
              {settingsSummary.map((item) => (
                <div key={item.label} className={`${summaryCardClassName} flex items-center justify-between gap-4`}>
                  <div className="text-sm font-medium text-zinc-900">{item.label}</div>
                  <div className="text-sm text-zinc-600">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-zinc-950">配置入口</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button type="button" className={actionCardClassName} onClick={() => void handleOpenPath("config.yaml", configLocation)} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">打开 config.yaml</span>
                  <span className="mt-1 block text-sm text-zinc-500">{configLocation}</span>
                </span>
                {workingAction === "config.yaml" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleOpenPath(".env", envLocation)} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <FileCode2 className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">打开 .env</span>
                  <span className="mt-1 block text-sm text-zinc-500">{envLocation}</span>
                </span>
                {workingAction === ".env" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleOpenPath("auth.json", authLocation)} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <FileCode2 className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">打开 auth.json</span>
                  <span className="mt-1 block text-sm text-zinc-500">{authLocation}</span>
                </span>
                {workingAction === "auth.json" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleOpenPath("logs", logsLocation)} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">打开 logs</span>
                  <span className="mt-1 block text-sm text-zinc-500">{logsLocation}</span>
                </span>
                {workingAction === "logs" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-zinc-950">诊断与维护</h2>

            {feedback ? (
              <Card className={`px-4 py-3 text-sm whitespace-pre-wrap ${feedback.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                <div className="font-medium">{feedback.title}</div>
                <div className="mt-1">{feedback.content}</div>
              </Card>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <button type="button" className={actionCardClassName} onClick={() => void handleGatewayStatus()} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <Activity className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">查看 gateway 状态</span>
                </span>
                {workingAction === "gateway-status" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleGatewayAction("start")} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <Play className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">启动 gateway</span>
                </span>
                {workingAction === "gateway-start" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleGatewayAction("stop")} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <Square className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">停止 gateway</span>
                </span>
                {workingAction === "gateway-stop" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleGatewayAction("restart")} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <RefreshCcw className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">重启 gateway</span>
                </span>
                {workingAction === "gateway-restart" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleGatewayServiceAction("install")} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <RotateCw className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">重装 gateway 服务</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">执行官方 install --force，修复 launchd / systemd 服务注册。</span>
                </span>
                {workingAction === "gateway-service-install" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={dangerActionCardClassName} onClick={() => void handleGatewayServiceAction("uninstall")} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-red-200 bg-white p-2 text-red-500">
                  <Trash2 className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-red-900">卸载 gateway 服务</span>
                  <span className="mt-1 block text-xs leading-5 text-red-700">仅移除后台服务，不删除 Hermes CLI、配置与数据。</span>
                </span>
                {workingAction === "gateway-service-uninstall" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-red-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleRunDeepStatus()} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <Activity className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">读取 Hermes 深度状态</span>
                </span>
                {workingAction === "status-deep" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>

              <button type="button" className={actionCardClassName} onClick={() => void handleRunDoctor()} disabled={workingAction !== null}>
                <span className="mt-0.5 rounded-xl border border-zinc-200/70 bg-white p-2 text-zinc-500">
                  <TerminalSquare className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-700">运行 doctor</span>
                </span>
                {workingAction === "doctor" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-zinc-500" /> : null}
              </button>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setFeedback(null)} disabled={!feedback || workingAction !== null}>
                清空输出
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border-red-200 bg-red-50/50 p-6">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className="rounded-2xl border border-red-200 bg-white p-2 text-red-600">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-red-950">危险区</h2>
                <p className="mt-1 text-sm leading-6 text-red-800">
                  这里仅影响本机 Hermes CLI 与后台服务。历史受管实例请在实例主页单独清理。
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-red-200/80 bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-red-400">Hermes CLI</div>
                <div className="mt-1.5 break-all text-sm font-medium text-red-950">
                  {environmentSummary?.hermes.binaryPath ?? "待读取"}
                </div>
                <div className="mt-1 text-sm text-red-700">
                  {environmentSummary ? (environmentSummary.hermes.available ? "可用" : "未发现") : "环境摘要读取中"}
                </div>
              </div>

              <div className="rounded-2xl border border-red-200/80 bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-red-400">Hermes Home</div>
                <div className="mt-1.5 break-all text-sm font-medium text-red-950">{hermesHome}</div>
                <div className="mt-1 text-sm text-red-700">
                  {environmentSummary ? (environmentSummary.hermesHome.exists ? "完整卸载会删除配置和数据" : "已清理") : "环境摘要读取中"}
                </div>
              </div>

              <div className="rounded-2xl border border-red-200/80 bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-red-400">Console 本机实例</div>
                <div className="mt-1.5 text-sm font-medium text-red-950">
                  {managedLocalNativeInstanceCount === null ? "待读取" : `${managedLocalNativeInstanceCount} 个`}
                </div>
                <div className="mt-1 text-sm text-red-700">历史受管实例不受影响，需在实例主页单独清理</div>
              </div>
            </div>

            <button type="button" className={dangerActionCardClassName} onClick={openUninstallDialog} disabled={uninstallDisabled}>
              <span className="mt-0.5 rounded-xl border border-red-200 bg-white p-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-red-950">
                  {uninstallEnvironmentReady && !hasHermesUninstallTarget ? "已卸载，无需重复操作" : "卸载 Hermes Agent"}
                </span>
                <span className="mt-1 block text-sm leading-6 text-red-800">
                  {uninstallEnvironmentReady && !hasHermesUninstallTarget
                    ? "未检测到 Hermes CLI、~/.hermes 或 Console 本机实例；如需重新使用，请到主页创建本地实例触发安装。"
                    : "通过官方 `hermes uninstall` 执行，仅处理本机 Hermes。历史受管实例不会被这里卸载。"}
                </span>
              </span>
              {workingAction === "hermes-uninstall" ? <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-red-500" /> : null}
            </button>
          </div>
        </Card>

        <Dialog
          open={uninstallDialogOpen}
          onOpenChange={(open) => {
            if (!open && workingAction === "hermes-uninstall") return;
            setUninstallDialogOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>卸载 Hermes Agent</DialogTitle>
              <DialogDescription>
                这是全局 Hermes CLI 卸载操作，不会清理历史受管实例。请确认范围，并输入确认短语后继续。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                <div className="font-semibold text-red-950">影响范围</div>
                <div className="mt-1">CLI：{environmentSummary?.hermes.binaryPath ?? "待读取"}</div>
                <div>HERMES_HOME：{hermesHome}</div>
                <div>Console 本机实例：{managedLocalNativeInstanceCount === null ? "待读取" : `${managedLocalNativeInstanceCount} 个`}</div>
                <div>历史受管实例：不在本弹窗处理，请回到实例主页清理资源。</div>
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <input
                    className="mt-1"
                    type="radio"
                    checked={uninstallMode === "keep-data"}
                    onChange={() => setUninstallMode("keep-data")}
                    disabled={workingAction === "hermes-uninstall"}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-950">卸载程序，保留配置与数据</span>
                    <span className="mt-1 block text-sm leading-5 text-zinc-500">执行 `hermes uninstall --yes`，适合后续重装。</span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                  <input
                    className="mt-1"
                    type="radio"
                    checked={uninstallMode === "full"}
                    onChange={() => setUninstallMode("full")}
                    disabled={workingAction === "hermes-uninstall"}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-red-950">完整卸载本机 Hermes</span>
                    <span className="mt-1 block text-sm leading-5 text-red-700">
                      停止并卸载 gateway，执行官方 full uninstall，清理 ~/.local/bin/hermes、~/.hermes 和 Console 本地 Native 注册；Docker 不受影响。
                    </span>
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-900">
                  请输入 <span className="font-mono text-red-700">{expectedUninstallConfirmationText}</span>
                </div>
                <Input
                  value={uninstallConfirmText}
                  onChange={(event) => setUninstallConfirmText(event.target.value)}
                  placeholder={expectedUninstallConfirmationText}
                  disabled={workingAction === "hermes-uninstall"}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setUninstallDialogOpen(false)} disabled={workingAction === "hermes-uninstall"}>
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleUninstallHermesAgent()}
                disabled={workingAction === "hermes-uninstall" || uninstallConfirmText !== expectedUninstallConfirmationText}
              >
                {workingAction === "hermes-uninstall" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {workingAction === "hermes-uninstall" ? "卸载中..." : uninstallMode === "full" ? "完整卸载并清理" : "卸载 Hermes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
