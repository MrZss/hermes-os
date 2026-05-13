import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Activity, Copy, LoaderCircle, Pause, Play, RefreshCw, Search, ShieldAlert, Terminal } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getInstanceDiagnostics, getInstanceLogs, type RuntimeDiagnostics, type RuntimeLogs } from "../../services/runtimeMaintenance";

type TabId = HermesRuntimeLogKind | "diagnostics";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "agent", label: "Agent 日志" },
  { id: "gateway", label: "网关日志" },
  { id: "errors", label: "错误日志" },
  { id: "diagnostics", label: "诊断" },
];

function levelTone(level: string) {
  if (level === "ERROR") return "text-red-600";
  if (level === "WARNING") return "text-amber-600";
  if (level === "INFO") return "text-blue-600";
  return "text-zinc-500";
}

export function Logs() {
  const { id: instanceId = "" } = useParams();
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("ALL");
  const [logsData, setLogsData] = useState<RuntimeLogs | null>(null);
  const [diagnosticsData, setDiagnosticsData] = useState<RuntimeDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const load = async (showLoading = false) => {
    if (!instanceId) return;
    if (showLoading) setLoading(true);
    if (!showLoading) setRefreshing(true);

    try {
      if (activeTab === "diagnostics") {
        const diagnostics = await getInstanceDiagnostics(instanceId);
        setDiagnosticsData(diagnostics);
      } else {
        const logs = await getInstanceLogs(instanceId, {
          kind: activeTab,
          lines: 200,
        });
        setLogsData(logs);
        setDiagnosticsData({ instance: logs.instance, diagnostics: logs.diagnostics });
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取实例日志。") ;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load(true);
  }, [instanceId, activeTab]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      void load(false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [instanceId, activeTab, paused]);

  useEffect(() => {
    if (!copyMessage) return undefined;
    const timer = window.setTimeout(() => setCopyMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const filteredEntries = useMemo(() => {
    const entries = logsData?.entries ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (level !== "ALL" && entry.level !== level) return false;
      if (!normalizedSearch) return true;
      return `${entry.raw}\n${entry.message}\n${entry.component}`.toLowerCase().includes(normalizedSearch);
    });
  }, [level, logsData?.entries, search]);

  const diagnostics = diagnosticsData?.diagnostics ?? logsData?.diagnostics ?? null;
  const instance = diagnosticsData?.instance ?? logsData?.instance ?? null;
  const errorSummary = diagnostics?.hints.join("\n") || error || "当前没有额外错误摘要。";

  const handleCopy = async (text: string, successMessage: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(successMessage);
    } catch {
      setCopyMessage("复制失败，请检查系统剪贴板权限。");
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-transparent">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center justify-between border-b border-zinc-200/70 px-6">
          <div className="flex items-center gap-2 rounded-2xl bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`rounded-xl px-3 py-2 text-sm transition ${activeTab === tab.id ? "bg-[#faf9f6] font-medium text-zinc-950" : "text-zinc-500 hover:text-zinc-900"}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {copyMessage ? <Badge variant="success">{copyMessage}</Badge> : null}
            <Button variant="ghost" size="sm" onClick={() => setPaused((value) => !value)}>
              {paused ? <Play className="mr-1.5 h-4 w-4" /> : <Pause className="mr-1.5 h-4 w-4" />}
              {paused ? "继续" : "暂停"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load(false)} disabled={loading || refreshing}>
              {refreshing ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {refreshing ? "刷新中..." : "刷新"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy(activeTab === "diagnostics" ? `${diagnostics?.statusText ?? ""}\n\n${diagnostics?.doctorText ?? ""}` : logsData?.rawText ?? "", activeTab === "diagnostics" ? "已复制诊断输出" : "已复制日志内容")}
              disabled={activeTab === "diagnostics" ? !(diagnostics?.statusText || diagnostics?.doctorText) : !logsData?.rawText}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              复制
            </Button>
          </div>
        </div>

        <div className="border-b border-zinc-200/70 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                placeholder="搜索日志内容、错误码或组件"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="ALL">全部级别</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
            </select>
            <Badge variant="outline">{paused ? "已暂停自动刷新" : "每 5 秒自动刷新"}</Badge>
            {logsData?.source ? <Badge variant="outline">{logsData.source.type}</Badge> : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 font-mono text-[12px] leading-6 text-zinc-700">
          {loading ? (
            <Card className="p-6 text-sm text-zinc-600">正在读取当前实例日志…</Card>
          ) : error ? (
            <Card className="border-red-200 bg-red-50/80 p-6 text-sm text-red-900">{error}</Card>
          ) : activeTab === "diagnostics" ? (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="text-sm font-semibold text-zinc-950">status --deep</div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-[#faf9f6] px-4 py-4 text-[12px] leading-6 text-zinc-700">{diagnostics?.statusText || "当前没有可展示的 status 输出。"}</pre>
              </Card>
              <Card className="p-5">
                <div className="text-sm font-semibold text-zinc-950">doctor</div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-[#faf9f6] px-4 py-4 text-[12px] leading-6 text-zinc-700">{diagnostics?.doctorText || "当前没有可展示的 doctor 输出。"}</pre>
              </Card>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry, index) => (
                  <div key={entry.id} className={`flex gap-4 px-5 py-3 ${index !== filteredEntries.length - 1 ? "border-b border-zinc-200/70" : ""}`}>
                    <span className="w-[148px] shrink-0 text-zinc-400">{entry.timestamp || "--"}</span>
                    <span className={`w-16 shrink-0 font-semibold ${levelTone(entry.level)}`}>[{entry.level}]</span>
                    <span className="w-[160px] shrink-0 text-zinc-500">{entry.component}</span>
                    <span className="break-all whitespace-pre-wrap">{entry.message}</span>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-sm text-zinc-500">当前筛选条件下没有可展示的日志行。</div>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-zinc-200/70 bg-[#f8f6f1]">
        <div className="flex h-16 items-center justify-between border-b border-zinc-200/70 px-5">
          <div className="text-sm font-semibold text-zinc-950">诊断</div>
          <Button variant="ghost" size="sm" onClick={() => void load(false)} disabled={loading || refreshing}>
            {refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <Activity className="h-4 w-4" />
              资源状态
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">CPU 负载</span>
                  <span className="font-medium text-zinc-900">{diagnostics?.resources.cpuPercent != null ? `${diagnostics.resources.cpuPercent}%` : "待检测"}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, diagnostics?.resources.cpuPercent ?? 0)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">内存占用</span>
                  <span className="font-medium text-zinc-900">{diagnostics?.resources.memoryPercent != null ? `${diagnostics.resources.memoryPercent}%` : "待检测"}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, diagnostics?.resources.memoryPercent ?? 0)}%` }} />
                </div>
                {diagnostics?.resources.memoryUsage ? <div className="mt-2 text-xs text-zinc-500">{diagnostics.resources.memoryUsage}</div> : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <Terminal className="h-4 w-4" />
              依赖服务
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {(diagnostics?.services ?? []).map((service) => (
                <div key={service.name} className="rounded-xl bg-[#faf9f6] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-700">{service.name}</span>
                    <Badge variant={service.status === "正常" ? "success" : service.status === "警告" ? "warning" : "error"}>{service.status}</Badge>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">{service.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <div className="text-sm font-medium text-amber-900">错误摘要</div>
                <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-amber-800">{errorSummary}</div>
              </div>
            </div>
          </div>

          <Button variant="secondary" size="sm" onClick={() => void handleCopy(errorSummary, "已复制错误摘要")} disabled={!errorSummary}>
            复制错误摘要
          </Button>
          {instance ? <div className="text-xs text-zinc-500">当前实例：{instance.name}</div> : null}
        </div>
      </aside>
    </div>
  );
}
