import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AlertCircle, Bot, LoaderCircle, MessageCircle, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";
import { getInstanceOfficialState } from "../../services/officialState";
import {
  INSTANCE_SETUP_READINESS_REFRESH_EVENT,
  resolveInstanceSetupReadiness,
  type InstanceSetupBlockerKey,
  type InstanceSetupReadiness,
  type InstanceSetupReadinessRefreshDetail,
} from "../../services/setupReadiness";

interface InstanceSetupGateProps {
  children: ReactNode;
}

const setupBlockerTitleByKey: Record<InstanceSetupBlockerKey, string> = {
  ai: "还差 AI 提供商",
  messaging: "还差消息平台",
  state: "读取状态失败",
};

function getSetupIcon(key: string) {
  if (key === "ai") return Bot;
  if (key === "messaging") return MessageCircle;
  return AlertCircle;
}

export function InstanceSetupGate({ children }: InstanceSetupGateProps) {
  const { id: instanceId = "" } = useParams();
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<InstanceSetupReadiness | null>(null);
  const [loading, setLoading] = useState(Boolean(instanceId));

  const loadReadiness = useCallback(async () => {
    if (!instanceId) return;

    setLoading(true);
    try {
      const state = await getInstanceOfficialState(instanceId);
      setReadiness(resolveInstanceSetupReadiness(instanceId, state));
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取当前实例配置状态。";
      setReadiness(resolveInstanceSetupReadiness(instanceId, null, message));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  useEffect(() => {
    if (!instanceId) return;

    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<InstanceSetupReadinessRefreshDetail>).detail;
      if (!detail?.instanceId || detail.instanceId === instanceId) {
        void loadReadiness();
      }
    };

    window.addEventListener(INSTANCE_SETUP_READINESS_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(INSTANCE_SETUP_READINESS_REFRESH_EVENT, handleRefresh);
  }, [instanceId, loadReadiness]);

  if (!instanceId) {
    return <>{children}</>;
  }

  const blockers = readiness?.blockers ?? [];
  const needsSetup = loading || Boolean(readiness && !readiness.ready);
  const title = loading
    ? "正在检查配置"
    : readiness?.stateError
      ? "读取状态失败"
      : "实例还没配置完成";
  const detail = loading
    ? "正在读取 AI 提供商和消息平台状态。"
    : readiness?.stateError
      ? "无法确认当前实例是否可用，请重试或前往配置页检查。"
      : "完成下面两项后再开始使用。";
  const showAiAction = loading || blockers.some((blocker) => blocker.key === "ai" || blocker.key === "state");
  const showMessagingAction = loading || blockers.some((blocker) => blocker.key === "messaging" || blocker.key === "state");

  return (
    <div className="relative h-full min-h-0">
      <div className={cn("h-full min-h-0", needsSetup ? "pointer-events-none select-none opacity-25 blur-[1.5px]" : "")}>
        {children}
      </div>

      {needsSetup ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#fcfbf8]/82 px-6 backdrop-blur-sm">
          <Card className="w-full max-w-[560px] border-zinc-200/90 bg-white/95 p-6 shadow-[0_24px_80px_rgba(24,24,27,0.12)]">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-white">
                {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
                  <Badge variant="warning">需要配置</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
              </div>
            </div>

            {!loading ? (
              <div className="mt-5 space-y-3">
                {blockers.map((blocker) => {
                  const Icon = getSetupIcon(blocker.key);
                  return (
                    <div key={blocker.key} className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-[#faf9f6] px-4 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-950">{blocker.title || setupBlockerTitleByKey[blocker.key]}</div>
                        <div className="mt-1 text-sm leading-5 text-zinc-600">{blocker.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              {showAiAction ? (
                <Button variant="primary" size="sm" onClick={() => navigate(`/instance/${instanceId}/providers`)}>
                  去配置 AI 提供商
                </Button>
              ) : null}
              {showMessagingAction ? (
                <Button variant={showAiAction ? "secondary" : "primary"} size="sm" onClick={() => navigate(`/instance/${instanceId}/integrations`)}>
                  去配置消息平台
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => void loadReadiness()} disabled={loading}>
                {loading ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                重新读取
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
