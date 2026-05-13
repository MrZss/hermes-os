import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AlertCircle,
  Bot,
  Database,
  FileCode2,
  FolderTree,
  LoaderCircle,
  Paperclip,
  Pencil,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { consoleInstances, type ConsoleInstance } from "../../data/console";
import { cn } from "../../lib/utils";
import { getInstanceOfficialState, type InstanceOfficialState } from "../../services/officialState";
import { getConsoleRuntimeInstance } from "../../services/runtime";
import {
  deleteInstanceWorkspaceSession,
  getInstanceWorkspaceSession,
  getInstanceWorkspaceState,
  listInstanceWorkspaceSessions,
  renameInstanceWorkspaceSession,
  runInstanceWorkspaceChat,
  type WorkspaceChatResult,
  type WorkspaceContext,
  type WorkspaceMessage,
  type WorkspaceSessionResult,
  type WorkspaceSessionSummary,
} from "../../services/workspace";

function parseToolOutput(content: string) {
  if (!content.trim()) return "工具返回为空。";

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "string") return parsed;
    if (parsed?.output) return String(parsed.output);
    if (parsed?.error) return String(parsed.error);
    if (parsed?.status && parsed?.detail) return `${parsed.status}: ${parsed.detail}`;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

function getToolCallLabel(toolCall: Record<string, unknown>) {
  const maybeFunction = toolCall.function;
  if (maybeFunction && typeof maybeFunction === "object" && "name" in maybeFunction) {
    return String((maybeFunction as { name?: unknown }).name ?? "tool");
  }
  if ("name" in toolCall) {
    return String((toolCall as { name?: unknown }).name ?? "tool");
  }
  return "tool";
}

function getSessionTitle(session: WorkspaceSessionSummary | null) {
  if (!session) return "新会话";
  return session.title || session.preview || session.id;
}

function getSessionPreview(session: WorkspaceSessionSummary) {
  return session.preview || "当前会话还没有首条用户输入。";
}

function matchSession(session: WorkspaceSessionSummary, keyword: string) {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;
  return [session.title, session.preview, session.model, session.id].some((value) => value.toLowerCase().includes(query));
}

const chatSuggestions = [
  {
    label: "检查当前实例",
    prompt: "帮我检查当前 Hermes 实例的运行状态、供应商配置和最近日志，按问题优先级给出下一步。",
  },
  {
    label: "生成排障计划",
    prompt: "基于当前工作区上下文，帮我生成一份可执行的排障计划，并标注每一步的验证标准。",
  },
  {
    label: "总结最近会话",
    prompt: "请总结当前档案最近的会话重点、已完成动作和还需要继续推进的事项。",
  },
];

type SessionDialogState =
  | { type: "rename"; title: string }
  | { type: "delete" }
  | null;

function createOptimisticUserMessage(content: string): WorkspaceMessage {
  return {
    id: -Date.now(),
    role: "user",
    content,
    toolCallId: "",
    toolName: "",
    toolCalls: [],
    finishReason: "",
    timestamp: new Date().toISOString(),
    timestampLabel: "刚刚",
  };
}

function findLatestAssistantMessage(messages: WorkspaceMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      return message;
    }
  }
  return null;
}

function buildStreamingSessionDetail(result: WorkspaceChatResult, assistantMessageId: number | null): WorkspaceSessionResult {
  return {
    instance: result.instance,
    profile: result.profile,
    session: result.session,
    messages: result.messages.map((message) =>
      assistantMessageId !== null && message.id === assistantMessageId
        ? { ...message, content: "" }
        : message
    ),
  };
}

function buildFinalSessionDetail(result: WorkspaceChatResult, assistantMessageId: number | null, responseText: string): WorkspaceSessionResult {
  return {
    instance: result.instance,
    profile: result.profile,
    session: result.session,
    messages: result.messages.map((message) =>
      assistantMessageId !== null && message.id === assistantMessageId && !message.content.trim()
        ? { ...message, content: responseText }
        : message
    ),
  };
}

export function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = useMemo<ConsoleInstance | null>(() => consoleInstances.find((item) => item.id === id) ?? consoleInstances[0] ?? null, [id]);

  const [instance, setInstance] = useState<ConsoleInstance | null>(desktopRuntimeAvailable ? null : fallbackInstance);
  const [officialState, setOfficialState] = useState<InstanceOfficialState | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("default");
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [sessions, setSessions] = useState<WorkspaceSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<WorkspaceSessionResult | null>(null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<WorkspaceMessage[]>([]);
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<number | null>(null);
  const [isResponseStreaming, setIsResponseStreaming] = useState(false);
  const [forceBlankSession, setForceBlankSession] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [sessionActionPending, setSessionActionPending] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);
  const [sessionDialog, setSessionDialog] = useState<SessionDialogState>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const generationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!desktopRuntimeAvailable) {
      setInstance(fallbackInstance);
    }
  }, [desktopRuntimeAvailable, fallbackInstance]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function loadMeta() {
      setLoadingMeta(true);
      setMetaError(null);

      try {
        const [runtimeInstance, nextOfficialState] = await Promise.all([
          getConsoleRuntimeInstance(id).catch(() => null),
          getInstanceOfficialState(id, { profileId: selectedProfileId }).catch(() => null),
        ]);

        if (cancelled) return;

        setInstance(runtimeInstance ?? (desktopRuntimeAvailable ? null : fallbackInstance));
        setOfficialState(nextOfficialState);

        const defaultProfile = nextOfficialState?.profiles.find((profile) => profile.isDefault)?.id ?? "default";
        setSelectedProfileId((current) => {
          if (nextOfficialState && nextOfficialState.profiles.some((profile) => profile.id === current)) {
            return current;
          }
          return defaultProfile;
        });

        if (!runtimeInstance && !nextOfficialState) {
          setMetaError(desktopRuntimeAvailable ? "当前实例不存在或尚未注册到 Console。" : "当前实例尚未接入真实工作区数据，以下内容只显示基础实例信息。完成真实部署后，会话与上下文会自动切换。");
        }
      } catch (error) {
        if (cancelled) return;
        setOfficialState(null);
        setInstance(desktopRuntimeAvailable ? null : fallbackInstance);
        setMetaError(error instanceof Error ? error.message : "无法读取实例工作区元数据。");
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    }

    void loadMeta();

    return () => {
      cancelled = true;
    };
  }, [desktopRuntimeAvailable, fallbackInstance, id, selectedProfileId]);

  const refreshWorkspace = useCallback(
    async (preferredSessionId?: string | null) => {
      if (!id) return;

      setLoadingWorkspace(true);
      setWorkspaceError(null);

      try {
        const [workspaceResult, sessionsResult] = await Promise.all([
          getInstanceWorkspaceState(id, { profileId: selectedProfileId }),
          listInstanceWorkspaceSessions(id, { profileId: selectedProfileId, limit: 40 }),
        ]);

        setWorkspaceContext(workspaceResult.context);
        setSessions(sessionsResult.sessions);
        setSelectedSessionId((current) => {
          const nextCandidate = preferredSessionId ?? current;
          if (nextCandidate && sessionsResult.sessions.some((session) => session.id === nextCandidate)) {
            return nextCandidate;
          }
          if (forceBlankSession && !preferredSessionId) {
            return null;
          }
          if (workspaceResult.context.latestSessionId && sessionsResult.sessions.some((session) => session.id === workspaceResult.context.latestSessionId)) {
            return workspaceResult.context.latestSessionId;
          }
          return sessionsResult.sessions[0]?.id ?? null;
        });
      } catch (error) {
        setWorkspaceContext(null);
        setSessions([]);
        setSelectedSessionId(null);
        setWorkspaceError(error instanceof Error ? error.message : "无法读取当前档案的会话与工作区摘要。");
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [forceBlankSession, id, selectedProfileId]
  );

  useEffect(() => {
    if (!id) return;
    void refreshWorkspace();
  }, [id, refreshWorkspace]);

  useEffect(() => {
    if (!id || !selectedSessionId) {
      setSessionDetail(null);
      return;
    }

    let cancelled = false;

    async function loadSession() {
      setLoadingSession(true);

      try {
        const detail = await getInstanceWorkspaceSession(id, selectedSessionId, { profileId: selectedProfileId });
        if (!cancelled) {
          setSessionDetail(detail);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionDetail(null);
          setWorkspaceError(error instanceof Error ? error.message : "无法读取当前会话详情。");
        }
      } finally {
        if (!cancelled) {
          setLoadingSession(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [id, selectedProfileId, selectedSessionId]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [loadingSession, optimisticMessages.length, sending, streamingAssistantText, isResponseStreaming, sessionDetail?.messages.length]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const selectedProfile = useMemo(() => {
    return officialState?.profiles.find((profile) => profile.id === selectedProfileId) ?? officialState?.profiles.find((profile) => profile.isDefault) ?? null;
  }, [officialState, selectedProfileId]);

  const providerNameById = useMemo(() => {
    return new Map((officialState?.providers ?? []).map((provider) => [provider.id, provider.name]));
  }, [officialState]);

  const activeProvider = useMemo(() => {
    if (!selectedProfile) return null;
    return officialState?.providers.find((provider) => provider.id === selectedProfile.providerId) ?? null;
  }, [officialState, selectedProfile]);

  const filteredSessions = useMemo(() => sessions.filter((session) => matchSession(session, search)), [search, sessions]);

  const activeSession = useMemo(() => {
    return sessionDetail?.session ?? sessions.find((session) => session.id === selectedSessionId) ?? null;
  }, [selectedSessionId, sessionDetail, sessions]);

  const messageList = sessionDetail?.messages ?? [];
  const conversationMessages = useMemo(
    () => [...messageList, ...optimisticMessages],
    [messageList, optimisticMessages]
  );
  const isGenerating = sending || isResponseStreaming;
  const gatewayVariant: "success" | "warning" | "outline" =
    selectedProfile?.gatewayStatus === "已启用" ? "success" : selectedProfile?.gatewayStatus === "异常" ? "warning" : "outline";
  const providerVariant: "success" | "warning" | "outline" =
    activeProvider?.status === "已连接" ? "success" : activeProvider?.status === "异常" ? "warning" : "outline";
  const workspaceReady = Boolean(workspaceContext?.exists);

  const sendBlockedReason = useMemo(() => {
    if (!workspaceReady) {
      return "当前档案尚未准备好工作区，待实例目录初始化后可发送真实请求。";
    }

    if (!selectedProfile) {
      return "当前实例尚未解析出有效档案。";
    }

    if (!selectedProfile.model || selectedProfile.model === "待配置") {
      return "当前档案还没有可用模型，请先到提供商页配置默认模型。";
    }

    if (activeProvider?.status === "未完成") {
      return "当前档案的 provider 还未完成配置，请先到提供商页保存凭据。";
    }

    if (activeProvider?.status === "异常") {
      return "当前档案的 provider 状态异常，请先到提供商页修复后再发送。";
    }

    return null;
  }, [activeProvider, selectedProfile, workspaceReady]);
  const composerDisabled = Boolean(sendBlockedReason) || isGenerating;
  const remoteRedirectNotice =
    instance?.type === "remote"
      ? "远程实例已切换为节点模式，会话入口已迁移到部署管理。请从新的节点入口继续处理远程部署。"
      : null;

  function cancelAssistantFrame() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  function streamAssistantResponse(result: WorkspaceChatResult, generationId: number) {
    const assistantMessage = findLatestAssistantMessage(result.messages);
    const assistantMessageId = assistantMessage?.id ?? null;
    const responseText = (assistantMessage?.content || result.responseText || "").trim();
    const finalDetail = buildFinalSessionDetail(result, assistantMessageId, responseText);

    if (!responseText || assistantMessageId === null) {
      setSessionDetail(finalDetail);
      setStreamingAssistantText("");
      setStreamingAssistantMessageId(null);
      setIsResponseStreaming(false);
      void refreshWorkspace(result.sessionId);
      return;
    }

    cancelAssistantFrame();
    setSessionDetail(buildStreamingSessionDetail(result, assistantMessageId));
    setStreamingAssistantMessageId(assistantMessageId);
    setStreamingAssistantText("");
    setIsResponseStreaming(true);

    let visibleLength = 0;
    const reveal = () => {
      if (generationRef.current !== generationId) {
        return;
      }

      const chunkSize = Math.max(2, Math.ceil(responseText.length / 72));
      visibleLength = Math.min(responseText.length, visibleLength + chunkSize);
      setStreamingAssistantText(responseText.slice(0, visibleLength));

      if (visibleLength < responseText.length) {
        animationFrameRef.current = window.requestAnimationFrame(reveal);
        return;
      }

      animationFrameRef.current = null;
      setStreamingAssistantText("");
      setStreamingAssistantMessageId(null);
      setIsResponseStreaming(false);
      setSessionDetail(finalDetail);
      void refreshWorkspace(result.sessionId);
    };

    animationFrameRef.current = window.requestAnimationFrame(reveal);
  }

  function handleStopGeneration() {
    generationRef.current += 1;
    cancelAssistantFrame();
    setSending(false);
    setIsResponseStreaming(false);
    setStreamingAssistantText("");
    setStreamingAssistantMessageId(null);
    setOptimisticMessages([]);
    setSessionFeedback("已停止当前回复展示。若 Hermes 后台请求已经发出，稍后刷新会话即可看到真实写入结果。");
  }

  function handleSuggestionClick(prompt: string) {
    setInput(prompt);
    setSendError(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!composerDisabled && input.trim()) {
        void handleSend();
      }
    }
  }

  function handleCreateBlankSession() {
    generationRef.current += 1;
    cancelAssistantFrame();
    setForceBlankSession(true);
    setSelectedSessionId(null);
    setSessionDetail(null);
    setOptimisticMessages([]);
    setStreamingAssistantText("");
    setStreamingAssistantMessageId(null);
    setIsResponseStreaming(false);
    setSending(false);
    setInput("");
    setSendError(null);
    setSessionFeedback("已切换到新的空白会话。");
  }

  async function handleRenameSessionSubmit(nextTitle: string) {
    if (!id || !activeSession) return;
    setSessionActionPending(true);
    setWorkspaceError(null);
    setSessionFeedback(null);

    try {
      const detail = await renameInstanceWorkspaceSession(id, activeSession.id, {
        profileId: selectedProfileId,
        title: nextTitle.trim(),
      });
      setSessionDetail(detail);
      setForceBlankSession(false);
      setSessionFeedback("会话标题已更新。");
      setSessionDialog(null);
      await refreshWorkspace(activeSession.id);
    } catch (renameError) {
      setWorkspaceError(renameError instanceof Error ? renameError.message : "会话重命名失败。");
    } finally {
      setSessionActionPending(false);
    }
  }

  async function handleDeleteSessionSubmit() {
    if (!id || !activeSession) return;
    setSessionActionPending(true);
    setWorkspaceError(null);
    setSessionFeedback(null);

    try {
      await deleteInstanceWorkspaceSession(id, activeSession.id, {
        profileId: selectedProfileId,
      });
      setForceBlankSession(true);
      setSelectedSessionId(null);
      setSessionDetail(null);
      setSessionFeedback("会话已删除。");
      setSessionDialog(null);
      await refreshWorkspace();
    } catch (deleteError) {
      setWorkspaceError(deleteError instanceof Error ? deleteError.message : "会话删除失败。");
    } finally {
      setSessionActionPending(false);
    }
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!id || !prompt || sendBlockedReason || isGenerating) return;

    const generationId = generationRef.current + 1;
    generationRef.current = generationId;
    cancelAssistantFrame();
    setSending(true);
    setIsResponseStreaming(false);
    setStreamingAssistantText("");
    setStreamingAssistantMessageId(null);
    setSendError(null);
    setSessionFeedback(null);
    setInput("");
    setOptimisticMessages([createOptimisticUserMessage(prompt)]);

    try {
      setForceBlankSession(false);
      const result = await runInstanceWorkspaceChat(id, prompt, {
        profileId: selectedProfileId,
        sessionId: selectedSessionId ?? undefined,
      });

      if (generationRef.current !== generationId) {
        return;
      }

      setSelectedSessionId(result.sessionId);
      setOptimisticMessages([]);
      setSending(false);
      streamAssistantResponse(result, generationId);
    } catch (error) {
      if (generationRef.current !== generationId) {
        return;
      }
      setSendError(error instanceof Error ? error.message : "会话发送失败。");
      setOptimisticMessages([]);
      setSending(false);
      await refreshWorkspace(selectedSessionId);
    }
  }

  function openRenameDialog() {
    if (!activeSession) return;
    setSessionDialog({
      type: "rename",
      title: getSessionTitle(activeSession),
    });
  }

  function openDeleteDialog() {
    if (!activeSession) return;
    setSessionDialog({
      type: "delete",
    });
  }

  if (!instance) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <div className="w-full max-w-[480px] rounded-3xl border border-zinc-200 bg-white px-8 py-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="text-lg font-semibold text-zinc-950">实例不存在</div>
          <div className="mt-2 text-sm leading-7 text-zinc-500">当前路由对应的实例还没有注册到 Console。请先返回主页创建实例，或选择一个已存在的实例。</div>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
              返回
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (instance.type === "remote") {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <div className="w-full max-w-[560px] rounded-3xl border border-amber-200 bg-amber-50/80 px-8 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="text-lg font-semibold text-zinc-950">会话入口已迁移</div>
          <div className="mt-2 text-sm leading-7 text-zinc-600">{remoteRedirectNotice}</div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/instance/${instance.id}/deployment`)}
            >
              立即前往部署管理
            </Button>
            <Badge variant="warning">远程节点</Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-transparent">
      <aside className="flex w-[290px] shrink-0 flex-col border-r border-zinc-200/70 bg-[#f8f6f1]">
        <div className="flex h-16 items-center justify-between border-b border-zinc-200/70 px-5">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-zinc-950">会话</div>
            <div className="text-[11px] text-zinc-500">{selectedProfile?.name ?? "默认档案"}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCreateBlankSession}>
            新建
          </Button>
        </div>

        <div className="border-b border-zinc-200/70 px-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              placeholder="搜索会话"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {loadingWorkspace ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              正在读取当前档案会话…
            </div>
          ) : null}
          {workspaceError ? <div className="mt-3 text-xs leading-5 text-amber-700">{workspaceError}</div> : null}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {filteredSessions.length > 0 ? (
            <div className="space-y-2">
              {filteredSessions.map((session) => {
                const active = session.id === selectedSessionId;
                return (
                  <button
                    key={session.id}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      active ? "border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]" : "border-transparent bg-transparent hover:bg-white"
                    )}
                    onClick={() => {
                      setForceBlankSession(false);
                      setSelectedSessionId(session.id);
                      setSessionFeedback(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{getSessionTitle(session)}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{getSessionPreview(session)}</div>
                      </div>
                      <Badge variant={session.status === "活跃" ? "success" : "outline"}>{session.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>{session.model}</span>
                      <span>{session.lastActiveLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/80 px-4 py-5 text-sm leading-6 text-zinc-500">
              当前档案还没有可展示的 Hermes 会话。输入第一条请求后，这里会出现真实历史。
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#fcfbf8]">
        <div className="flex h-16 items-center justify-between border-b border-zinc-200/70 px-6">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-zinc-950">{getSessionTitle(activeSession)}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {selectedProfile?.name ?? "默认档案"}
              {activeSession ? ` · ${activeSession.model}` : " · 新会话"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" disabled={!activeSession || sessionActionPending} onClick={openRenameDialog}>
              <Pencil className="mr-1.5 h-4 w-4" />
              重命名
            </Button>
            <Button variant="ghost" size="sm" disabled={!activeSession || sessionActionPending} onClick={openDeleteDialog}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              删除
            </Button>
            <Button variant="ghost" size="sm" disabled={isGenerating} onClick={handleCreateBlankSession}>
              清空上下文
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            {loadingMeta ? (
              <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-5 text-sm text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  正在加载实例与档案上下文…
                </div>
              </div>
            ) : null}

            {metaError ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-800">
                {metaError}
              </div>
            ) : null}

            {sessionFeedback ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
                {sessionFeedback}
              </div>
            ) : null}

            {loadingSession ? (
              <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-5 text-sm text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  正在加载会话详情…
                </div>
              </div>
            ) : null}

            {!loadingSession && conversationMessages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-200 bg-white/90 px-5 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex items-start gap-3 text-sm leading-7 text-zinc-700">
                  <Bot className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
                  <div>
                    <div className="font-medium text-zinc-900">当前档案还没有真实会话</div>
                    <div className="mt-1 text-zinc-600">
                      直接输入第一条分析请求即可创建新会话。发送动作会真实调用当前实例下的 Hermes CLI，并把结果回流到会话列表与工作区上下文。
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {chatSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          className="rounded-full border border-zinc-200 bg-[#faf9f6] px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white"
                          onClick={() => handleSuggestionClick(suggestion.prompt)}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {conversationMessages.map((message) => {
              const isUser = message.role === "user";
              const isTool = message.role === "tool";
              const hasToolCalls = message.toolCalls.length > 0;
              const displayContent = streamingAssistantMessageId === message.id ? streamingAssistantText : message.content;

              return (
                <div key={`${message.role}-${message.id}-${message.timestamp}`} className={cn("space-y-3", isUser ? "ml-auto max-w-[82%]" : "max-w-[92%]")}>
                  {hasToolCalls ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        <TerminalSquare className="h-4 w-4" />
                        工具调用
                      </div>
                      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <div className="border-b border-zinc-200/70 bg-[#faf9f6] px-4 py-3 text-sm font-medium text-zinc-900">
                          {message.toolCalls.length} 个工具调用
                        </div>
                        <div className="flex flex-wrap gap-2 px-4 py-4">
                          {message.toolCalls.map((toolCall, index) => (
                            <Badge key={`${message.id}-tool-${index}`} variant="outline">
                              {getToolCallLabel(toolCall)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {isTool ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        <Database className="h-4 w-4" />
                        工具结果
                      </div>
                      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <div className="border-b border-zinc-200/70 bg-[#faf9f6] px-4 py-3 text-sm font-medium text-zinc-900">
                          {message.toolName || "工具输出"}
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-4 font-mono text-[12px] leading-6 text-zinc-700">{parseToolOutput(message.content)}</pre>
                      </div>
                    </div>
                  ) : !hasToolCalls || displayContent.trim() ? (
                    <div
                      className={cn(
                        "rounded-3xl border px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
                        isUser ? "border-zinc-200 bg-white" : "border-zinc-200 bg-white"
                      )}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-900">
                        {displayContent || (message.role === "assistant" ? "Assistant 正在组织回复。" : "")}
                        {streamingAssistantMessageId === message.id ? <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-blue-500 align-[-2px]" /> : null}
                      </div>
                      <div className="mt-3 text-[11px] text-zinc-400">{isUser ? "用户" : "Hermes"} · {message.timestampLabel}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {sending && !isResponseStreaming ? (
              <div className="max-w-[92%] rounded-3xl border border-blue-100 bg-blue-50/80 px-5 py-4 text-sm text-blue-900 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Hermes 正在思考</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={conversationEndRef} />
          </div>
        </div>

        <div className="border-t border-zinc-200/70 bg-white px-6 py-5">
          <div className="mx-auto max-w-4xl rounded-[28px] border border-zinc-200 bg-[#faf9f6] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {isGenerating ? (
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs text-blue-700">
                <div className="flex items-center gap-2">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  {isResponseStreaming ? "正在生成回复" : "Hermes 正在思考"}
                </div>
                <Button variant="ghost" size="sm" data-testid="chat-stop-generation" onClick={handleStopGeneration}>
                  停止
                </Button>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              data-testid="chat-composer-input"
              className="min-h-[88px] w-full resize-none bg-transparent text-sm leading-7 text-zinc-900 outline-none placeholder:text-zinc-400"
              placeholder={sendBlockedReason ?? "输入分析请求、Shell 命令或下一步排障动作。会真实发送到当前实例下的 Hermes。"}
              value={input}
              disabled={composerDisabled}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200/70 pt-3">
              <Button variant="ghost" size="sm" disabled>
                <Paperclip className="mr-1.5 h-4 w-4" />
                添加上下文
              </Button>
              <Button variant="primary" size="sm" disabled={composerDisabled || !input.trim()} onClick={() => void handleSend()}>
                {isGenerating ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                {isGenerating ? "生成中" : "发送"}
              </Button>
            </div>
          </div>
          <div className={cn("mt-3 text-center text-[11px]", sendError ? "text-red-600" : "text-zinc-400")}>
            {sendError || sendBlockedReason || "执行高危命令前仍需核对上下文。当前页只保留真实已接线动作，未接线操作不会伪装可用。"}
          </div>
        </div>
      </section>

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-zinc-200/70 bg-[#f8f6f1]">
        <div className="flex h-16 items-center border-b border-zinc-200/70 px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Settings2 className="h-4 w-4 text-zinc-500" />
            工作区上下文
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">目标实例</div>
            <div className="mt-3 text-sm font-medium text-zinc-950">{instance.name}</div>
            <div className="mt-1 text-sm text-zinc-500">{instance.scope} · {instance.platform}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{instance.security}</Badge>
              <Badge variant={instance.runtimeState === "running" ? "success" : instance.runtimeState === "warning" ? "warning" : "outline"}>
                {instance.gateway}
              </Badge>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">当前档案</div>
            <div className="mt-3 space-y-3">
              <select
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                value={selectedProfileId}
                onChange={(event) => {
                  setSelectedProfileId(event.target.value);
                  setForceBlankSession(false);
                  setSelectedSessionId(null);
                  setSessionDetail(null);
                  setSendError(null);
                  setSessionFeedback(null);
                }}
              >
                {(officialState?.profiles ?? [{ id: "default", name: instance.defaultProfile, isDefault: true }]).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">提供商</span>
                <span className="font-medium text-zinc-900">{activeProvider?.name ?? providerNameById.get(selectedProfile?.providerId ?? "") ?? instance.provider}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">当前模型</span>
                <span className="font-medium text-zinc-900">{selectedProfile?.model ?? instance.currentModel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Provider 状态</span>
                <Badge variant={providerVariant}>{activeProvider?.status ?? "未知"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">网关状态</span>
                <Badge variant={gatewayVariant}>{selectedProfile?.gatewayStatus ?? "未启用"}</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">工作区摘要</div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-3">
                <div className="text-zinc-400">会话</div>
                <div className="mt-1 text-sm font-semibold text-zinc-950">{workspaceContext?.sessionCount ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-3">
                <div className="text-zinc-400">日志</div>
                <div className="mt-1 text-sm font-semibold text-zinc-950">{workspaceContext?.logCount ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-3">
                <div className="text-zinc-400">备份</div>
                <div className="mt-1 text-sm font-semibold text-zinc-950">{workspaceContext?.backupCount ?? 0}</div>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-xs text-zinc-600">
              <div className="flex items-start gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 break-all">{workspaceContext?.stateDbPath ?? "未检测到 state.db"}</div>
              </div>
              <div className="flex items-start gap-2">
                <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 break-all">{workspaceContext?.workspaceDir ?? "未检测到 workspace 目录"}</div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant={workspaceContext?.hasConfig ? "success" : "outline"}>config</Badge>
                <Badge variant={workspaceContext?.hasEnv ? "success" : "outline"}>.env</Badge>
                <Badge variant={workspaceContext?.hasSoul ? "success" : "outline"}>SOUL</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">工作区文件</div>
            <div className="mt-4 space-y-3">
              {(workspaceContext?.entries ?? []).length > 0 ? (
                workspaceContext!.entries.map((entry) => (
                  <div key={entry.path} className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-3 py-3">
                    <div className="flex items-start gap-2">
                      {entry.type === "dir" ? <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" /> : <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-900">{entry.name}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">{entry.sizeLabel} · {entry.modifiedLabel}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-[#faf9f6] px-3 py-4 text-sm leading-6 text-zinc-500">
                  当前档案的 workspace 目录还没有可展示的文件。后续工具输出、计划草稿与临时产物会出现在这里。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">执行安全策略</div>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  <div className="font-medium text-zinc-900">真实会话来自当前档案</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">会话列表、消息历史和工作区摘要均来自当前实例下的 `state.db`、`sessions/` 与 `workspace/`。</div>
                </div>
              </div>
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <div className="font-medium text-zinc-900">高危动作仍需确认</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">即使从当前页发起真实请求，涉及修改系统状态的命令也应先核对上下文与目标实例。</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <Dialog open={Boolean(sessionDialog)} onOpenChange={(open) => (!open ? setSessionDialog(null) : undefined)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{sessionDialog?.type === "rename" ? "重命名会话" : "删除会话"}</DialogTitle>
            <DialogDescription>
              {sessionDialog?.type === "rename"
                ? "新的会话标题会立即写回当前档案的真实会话记录。"
                : `确认删除会话「${getSessionTitle(activeSession)}」吗？删除后会从当前档案历史中移除。`}
            </DialogDescription>
          </DialogHeader>

          {sessionDialog?.type === "rename" ? (
            <Input
              value={sessionDialog.title}
              onChange={(event) => setSessionDialog({ ...sessionDialog, title: event.target.value })}
              placeholder="输入新的会话标题"
              disabled={sessionActionPending}
            />
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSessionDialog(null)} disabled={sessionActionPending}>
              取消
            </Button>
            <Button
              variant={sessionDialog?.type === "delete" ? "danger" : "primary"}
              disabled={sessionActionPending || (sessionDialog?.type === "rename" && !sessionDialog.title.trim())}
              onClick={() => {
                if (sessionDialog?.type === "rename") {
                  void handleRenameSessionSubmit(sessionDialog.title);
                  return;
                }
                void handleDeleteSessionSubmit();
              }}
            >
              {sessionActionPending ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {sessionActionPending ? "处理中..." : sessionDialog?.type === "delete" ? "确认删除" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
