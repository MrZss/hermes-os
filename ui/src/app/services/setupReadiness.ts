import type { InstanceOfficialState } from "./officialState";

export const INSTANCE_SETUP_READINESS_REFRESH_EVENT = "hermes-console:setup-readiness-refresh";

export type InstanceSetupReadinessRefreshReason = "provider" | "messaging" | "state-sync" | "import" | "create";

export type InstanceSetupBlockerKey = "state" | "ai" | "messaging";

export interface InstanceSetupBlocker {
  key: InstanceSetupBlockerKey;
  title: string;
  detail: string;
  actionLabel?: string;
  actionTo?: string;
}

export interface InstanceSetupReadiness {
  instanceId: string;
  profileId: string;
  aiReady: boolean;
  messagingReady: boolean;
  ready: boolean;
  stateError?: string;
  blockers: InstanceSetupBlocker[];
}

export interface InstanceSetupReadinessRefreshDetail {
  instanceId?: string;
  reason: InstanceSetupReadinessRefreshReason;
}

function isConfiguredValue(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized && normalized !== "待配置" && normalized !== "未选择" && normalized !== "auto");
}

function resolveSelectedProfile(state: InstanceOfficialState) {
  const selectedProfileId = state.sources?.selectedProfileId;
  return (
    (selectedProfileId ? state.profiles.find((profile) => profile.id === selectedProfileId) : null)
    ?? state.profiles.find((profile) => profile.isDefault)
    ?? state.profiles[0]
    ?? null
  );
}

export function resolveInstanceSetupReadiness(
  instanceId: string,
  state: InstanceOfficialState | null,
  stateError?: string | null
): InstanceSetupReadiness {
  if (stateError || !state) {
    return {
      instanceId,
      profileId: "default",
      aiReady: false,
      messagingReady: false,
      ready: false,
      stateError: stateError || "无法读取当前实例配置状态。",
      blockers: [
        {
          key: "state",
          title: "读取状态失败",
          detail: stateError || "请重新读取，或先到配置页检查实例。",
        },
      ],
    };
  }

  const profile = resolveSelectedProfile(state);
  const provider = profile ? state.providers.find((entry) => entry.id === profile.providerId) : null;
  const aiReady = Boolean(
    profile
    && provider
    && provider.status === "已连接"
    && profile.model !== "待配置"
    && isConfiguredValue(profile.providerId)
    && isConfiguredValue(profile.model)
  );
  const messagingReady = state.integrations.some((integration) => integration.status === "已启用");
  const blockers: InstanceSetupBlocker[] = [];

  if (!aiReady) {
    blockers.push({
      key: "ai",
      title: "还差 AI 提供商",
      detail: "先配置供应商、Key/OAuth 和默认模型。",
      actionLabel: "去配置 AI 提供商",
      actionTo: `/instance/${instanceId}/providers`,
    });
  }

  if (!messagingReady) {
    blockers.push({
      key: "messaging",
      title: "还差消息平台",
      detail: "Telegram、微信、QQ、飞书任选一个先配置。",
      actionLabel: "去配置消息平台",
      actionTo: `/instance/${instanceId}/integrations`,
    });
  }

  return {
    instanceId,
    profileId: profile?.id ?? "default",
    aiReady,
    messagingReady,
    ready: aiReady && messagingReady,
    blockers,
  };
}

export function publishInstanceSetupReadinessRefresh(
  instanceId: string | undefined,
  reason: InstanceSetupReadinessRefreshReason
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<InstanceSetupReadinessRefreshDetail>(INSTANCE_SETUP_READINESS_REFRESH_EVENT, {
      detail: { instanceId, reason },
    })
  );
}
