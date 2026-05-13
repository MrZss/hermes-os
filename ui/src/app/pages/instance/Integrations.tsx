import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import QRCode from "qrcode";
import { CheckCircle2, LoaderCircle, MessageCircle } from "lucide-react";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Drawer } from "../../components/ui/drawer";
import { PageHeader } from "../../components/console/PageHeader";
import type { HermesConfigField, HermesIntegrationEntry, HermesProfileEntry } from "../../data/hermesOfficial";
import { cn } from "../../lib/utils";
import {
  approveInstanceMessagingPairing,
  cancelInstanceWeixinQrLogin,
  pollInstanceWeixinQrLogin,
  restartInstanceGateway,
  startInstanceWeixinQrLogin,
  updateInstanceIntegrationConfig,
} from "../../services/officialActions";
import { getInstanceOfficialState } from "../../services/officialState";
import { publishInstanceSetupReadinessRefresh } from "../../services/setupReadiness";

const summaryCardClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3.5 [overflow-wrap:anywhere]";
const detailCardClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 [overflow-wrap:anywhere]";

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

type IntegrationFormState = {
  fields: Record<string, string>;
};

type WeixinQrState = {
  requestId?: string;
  qrcodeUrl?: string;
  qrcodeDataUrl?: string;
  expiresAt?: string;
  status: "idle" | "generating" | "waiting" | "scanned" | "saving" | "confirmed" | "expired" | "error";
  message: string;
};

type IntegrationGuide = {
  sourceName: string;
  sourceUrl: string;
  docUrl: string;
  summary: string;
  steps: string[];
  fieldHints: Record<string, string>;
};

const integrationGuides: Record<string, IntegrationGuide> = {
  telegram: {
    sourceName: "BotFather",
    sourceUrl: "https://t.me/BotFather",
    docUrl: "https://core.telegram.org/bots/features",
    summary: "在 Telegram 打开 BotFather 创建机器人，复制 Bot Token；用户 ID 填允许访问 Hermes 的 Telegram 用户 ID。",
    steps: [
      "打开 BotFather，发送 /newbot 创建机器人并复制 Bot Token。",
      "把自己的 Telegram 用户 ID 填入用户 ID；先填自己，后续需要多人再补充。",
      "保存后会自动重启消息平台；首次聊天按提示发送 /sethome。",
      "无响应：检查远程服务器运行服务到 Telegram 的网络代理。",
    ],
    fieldHints: {
      TELEGRAM_BOT_TOKEN: "从 BotFather 创建 bot 后复制 Bot Token。",
      TELEGRAM_ALLOWED_USERS: "填写允许访问 Hermes 的 Telegram 用户 ID；先填自己的用户 ID。",
    },
  },
  weixin: {
    sourceName: "Hermes 微信扫码向导",
    sourceUrl: "https://hermes-agent.lzw.me/docs/user-guide/messaging/weixin",
    docUrl: "https://weixin.qq.com/",
    summary: "Hermes 官方底层仍是 iLink Bot API；桌面端会代替 hermes gateway setup 生成微信二维码，扫码后自动保存账号 ID 与 Token。",
    steps: [
      "打开微信配置后自动生成微信二维码。",
      "用微信扫码并在手机上确认登录。",
      "确认后客户端自动写入账号 ID / Token、保存账号文件并重启消息平台。",
      "收到 pairing code 后，在本页粘贴并批准配对。",
      "无响应：检查远程服务器运行服务到微信 iLink 服务的网络或代理。",
    ],
    fieldHints: {
      WEIXIN_ACCOUNT_ID: "扫码确认后自动写入 WEIXIN_ACCOUNT_ID。",
      WEIXIN_TOKEN: "扫码确认后自动写入 WEIXIN_TOKEN；不是微信公众号 Token。",
    },
  },
  qq: {
    sourceName: "QQ 机器人开放平台",
    sourceUrl: "https://q.qq.com/qqbot/openclaw/",
    docUrl: "https://hermes-agent.lzw.me/docs/user-guide/messaging/qqbot",
    summary: "在 QQ 机器人开放平台创建或选择 OpenClaw 机器人应用，进入应用凭据页复制 App ID 与 Client Secret。",
    steps: [
      "打开 QQ 机器人开放平台的 OpenClaw 入口，创建或选择机器人应用。",
      "进入应用凭据页，复制 App ID 和 Client Secret。",
      "收到 pairing code 后，在本页粘贴并批准配对。",
      "保存后客户端会自动重启消息平台并加载新配置。",
      "无响应：检查远程服务器运行服务到 QQ Bot 开放平台的网络/代理。",
    ],
    fieldHints: {
      QQ_APP_ID: "填写 QQ 机器人应用的 App ID。",
      QQ_CLIENT_SECRET: "填写 QQ 机器人应用的 Client Secret。",
    },
  },
  feishu: {
    sourceName: "飞书开发者后台",
    sourceUrl: "https://open.feishu.cn/app",
    docUrl: "https://open.feishu.cn/document/home/index",
    summary: "在飞书开发者后台创建企业自建应用，在凭证与基础信息中复制 App ID 与 App Secret。",
    steps: [
      "打开飞书开发者后台，创建或选择企业自建应用。",
      "进入凭证与基础信息，复制 App ID 和 App Secret。",
      "保存后客户端会自动重启消息平台并加载新配置。",
      "无响应：检查远程服务器运行服务到飞书开放平台的网络/代理。",
    ],
    fieldHints: {
      FEISHU_APP_ID: "填写飞书应用凭证与基础信息里的 App ID。",
      FEISHU_APP_SECRET: "填写飞书应用凭证与基础信息里的 App Secret。",
    },
  },
};

const integrationRequiredFields = {
  telegram: [
    { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token" },
    { key: "TELEGRAM_ALLOWED_USERS", label: "用户 ID" },
  ],
  qq: [
    { key: "QQ_APP_ID", label: "App ID" },
    { key: "QQ_CLIENT_SECRET", label: "Client Secret" },
  ],
  feishu: [
    { key: "FEISHU_APP_ID", label: "App ID" },
    { key: "FEISHU_APP_SECRET", label: "App Secret" },
  ],
} as const;

const pairingGuides = {
  weixin: {
    platformId: "weixin",
    command: "hermes pairing approve weixin <配对码>",
    intro: "收到 pairing code → 粘贴配对码 → 批准配对。",
    nextStep: "客户端会执行授权，不用打开终端。",
  },
  qq: {
    platformId: "qqbot",
    command: "hermes pairing approve qqbot <配对码>",
    intro: "收到 pairing code → 粘贴配对码 → 批准配对。",
    nextStep: "客户端会执行授权，不用打开终端。",
  },
} as const;

function getStatusVariant(status: HermesIntegrationEntry["status"]): BadgeProps["variant"] {
  return status === "已启用" ? "success" : status === "异常" ? "error" : "outline";
}

function getHealthVariant(health: HermesIntegrationEntry["health"]): BadgeProps["variant"] {
  return health === "活跃" ? "success" : health === "待配置" ? "outline" : "warning";
}

function buildIntegrationForm(integration: HermesIntegrationEntry): IntegrationFormState {
  const fields: Record<string, string> = {};

  for (const field of integration.fields) {
    if (field.readOnly || field.kind === "readonly") {
      continue;
    }

    fields[field.key] = field.secret ? "" : field.value === "待配置" ? "" : field.value;
  }

  return { fields };
}

function getMissingIntegrationFieldLabels(integration: HermesIntegrationEntry, formState: IntegrationFormState) {
  const requiredFields = integrationRequiredFields[integration.id as keyof typeof integrationRequiredFields] ?? [];
  const fieldByKey = new Map(
    integration.fields
      .filter((field) => field.required && !field.readOnly && field.kind !== "readonly")
      .map((field) => [field.key, field] as const)
  );

  return requiredFields
    .filter(({ key }) => {
      const field = fieldByKey.get(key);
      if (!field) return false;

      const draftValue = formState.fields[field.key] ?? "";
      const nextValue = draftValue.trim() ? draftValue : field.value;
      return !nextValue || nextValue.trim() === "" || nextValue.trim() === "待配置";
    })
    .map(({ label }) => label);
}

function getIntegrationPrerequisiteMessage(integrationId: string, missingFields: string[]) {
  if (integrationId === "weixin") {
    return "先完成扫码，再继续保存。";
  }

  if (missingFields.length === 0) {
    return "保存没成功，请再试一次。";
  }

  return `先填 ${missingFields[0]}，再保存。`;
}

function sortMessagingIntegrations(items: HermesIntegrationEntry[]) {
  return [...items].sort((left, right) => {
    if (left.status === "已启用" && right.status !== "已启用") return -1;
    if (left.status !== "已启用" && right.status === "已启用") return 1;
    if (left.health === "活跃" && right.health !== "活跃") return -1;
    if (left.health !== "活跃" && right.health === "活跃") return 1;
    return left.name.localeCompare(right.name);
  });
}

function getIntegrationCardClassName(isConfigured: boolean) {
  return cn(
    "flex h-full flex-col p-5 transition-colors",
    isConfigured
      ? "border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200/80 shadow-[0_8px_28px_rgba(16,185,129,0.12)]"
      : "hover:border-zinc-300 hover:bg-zinc-50/40"
  );
}

function shouldPollWeixinQr(status: WeixinQrState["status"]) {
  return status === "waiting" || status === "scanned";
}

function buildWeixinQrStatusTitle(status: WeixinQrState["status"]) {
  if (status === "confirmed") return "已自动保存并重启消息平台。";
  if (status === "saving") return "扫码成功，正在保存微信配置…";
  if (status === "scanned") return "已扫码，等待手机确认";
  if (status === "waiting") return "等待微信扫码";
  if (status === "expired") return "二维码已过期，请重新开始。";
  if (status === "error") return "二维码状态读取失败，请重新开始。";
  if (status === "generating") return "正在生成二维码…";
  return "请先生成微信二维码";
}

function buildWeixinQrPrimaryActionLabel(status: WeixinQrState["status"], hasQrCode: boolean) {
  if (status === "generating") return "生成中...";
  if (status === "saving") return "保存中...";
  if (status === "confirmed") return "重新生成二维码";
  if (status === "expired" || status === "error") return "重新开始";
  return hasQrCode ? "重新生成二维码" : "生成微信二维码";
}

function normalizePairingCodeInput(value: string) {
  return value.replace(/[`'"\s]/g, "").toUpperCase();
}

export function Integrations() {
  const { id: instanceId = "" } = useParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<HermesIntegrationEntry[]>([]);
  const [profiles, setProfiles] = useState<HermesProfileEntry[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("default");
  const [formState, setFormState] = useState<IntegrationFormState>({ fields: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [fallback, setFallback] = useState(false);
  const [weixinQr, setWeixinQr] = useState<WeixinQrState>({ status: "idle", message: "" });
  const [pairingCode, setPairingCode] = useState("");
  const [pairingFeedback, setPairingFeedback] = useState<FeedbackState>(null);
  const [approvingPairing, setApprovingPairing] = useState(false);

  const loadIntegrations = useCallback(
    async (preferredProfileId?: string, preferredIntegrationId?: string | null) => {
      setLoading(true);
      setError(null);

      try {
        const result = await getInstanceOfficialState(instanceId, {
          profileId: preferredProfileId ?? selectedProfileId,
        });
        setIntegrations(result.integrations);
        setProfiles(result.profiles);
        setFallback(result.fallback);
        publishInstanceSetupReadinessRefresh(instanceId, "messaging");

        const nextProfileId = preferredProfileId
          ?? result.sources?.selectedProfileId
          ?? result.profiles.find((profile) => profile.id === selectedProfileId)?.id
          ?? result.profiles.find((profile) => profile.isDefault)?.id
          ?? "default";
        setSelectedProfileId(nextProfileId);

        const nextIntegrationId = preferredIntegrationId === undefined
          ? null
          : result.integrations.some((integration) => integration.id === preferredIntegrationId)
            ? preferredIntegrationId
            : null;
        setSelectedId(nextIntegrationId);
      } catch (loadError) {
        setIntegrations([]);
        setProfiles([]);
        setFallback(false);
        setError(loadError instanceof Error ? loadError.message : "无法读取当前实例的原生消息平台状态。");
      } finally {
        setLoading(false);
      }
    },
    [instanceId, selectedProfileId]
  );

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  const messagingIntegrations = useMemo(() => sortMessagingIntegrations(integrations), [integrations]);
  const selected = useMemo(
    () => messagingIntegrations.find((item) => item.id === selectedId) ?? messagingIntegrations[0] ?? null,
    [messagingIntegrations, selectedId]
  );
  const selectedGuide = selected ? integrationGuides[selected.id] ?? null : null;
  const pairingGuide = selected ? pairingGuides[selected.id as keyof typeof pairingGuides] ?? null : null;
  const configuredCount = useMemo(() => messagingIntegrations.filter((item) => item.status === "已启用").length, [messagingIntegrations]);
  const editableFields = useMemo(
    () => selected?.fields.filter((field) => !field.readOnly && field.kind !== "readonly") ?? [],
    [selected]
  );
  const simpleFields = useMemo(
    () => editableFields,
    [editableFields]
  );
  const missingFields = useMemo(
    () => (selected && selected.id !== "weixin" ? getMissingIntegrationFieldLabels(selected, formState) : []),
    [formState, selected]
  );
  const canSaveIntegration = !saving && missingFields.length === 0;
  const normalizedPairingCode = normalizePairingCodeInput(pairingCode);
  const canApprovePairing = Boolean(pairingGuide && normalizedPairingCode && !approvingPairing);
  const shouldShowWeixinQrPanel = selected?.id === "weixin" && (
    weixinQr.status !== "idle" || Boolean(weixinQr.qrcodeDataUrl)
  );

  useEffect(() => {
    if (!selected) return;
    setFormState(buildIntegrationForm(selected));
  }, [selected]);

  async function handleSaveIntegration() {
    if (!selected) return;
    if (selected.id === "weixin") {
      setFeedback({
        tone: "error",
        message: getIntegrationPrerequisiteMessage("weixin", []),
      });
      return;
    }

    const missingFields = getMissingIntegrationFieldLabels(selected, formState);
    if (missingFields.length > 0) {
      setFeedback({
        tone: "error",
        message: getIntegrationPrerequisiteMessage(selected.id, missingFields),
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const nextFields: Record<string, string> = {};

      for (const field of selected.fields) {
        if (field.readOnly || field.kind === "readonly") {
          continue;
        }

        const nextValue = formState.fields[field.key] ?? "";
        if (field.secret) {
          if (nextValue.trim()) {
            nextFields[field.key] = nextValue.trim();
          }
        } else {
          nextFields[field.key] = nextValue.trim();
        }
      }

      const result = await updateInstanceIntegrationConfig(instanceId, {
        profileId: selectedProfileId,
        integrationId: selected.id,
        fields: nextFields,
      });

      await restartInstanceGateway(instanceId);

      setFeedback({
        tone: "success",
        message: `${result.message}\n已自动重启消息平台，Telegram/微信/QQ/飞书会读取最新配置。`,
      });
      setSelectedId(null);
      await loadIntegrations(selectedProfileId, null);
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "保存没成功，请再试一次。",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleStartWeixinQrLogin() {
    if (!selected || selected.id !== "weixin") return;

    const previousRequestId = weixinQr.requestId;
    setFeedback(null);
    setWeixinQr({
      status: "generating",
      message: previousRequestId ? "正在重新获取微信二维码…" : "正在生成微信二维码…",
    });

    try {
      if (previousRequestId) {
        await cancelInstanceWeixinQrLogin(instanceId, { requestId: previousRequestId }).catch(() => {});
      }

      const result = await startInstanceWeixinQrLogin(instanceId, {
        profileId: selectedProfileId,
      });
      const qrcodeDataUrl = await QRCode.toDataURL(result.qrcodeUrl, {
        margin: 1,
        width: 184,
        color: {
          dark: "#18181b",
          light: "#ffffff",
        },
      });

      setWeixinQr({
        requestId: result.requestId,
        qrcodeUrl: result.qrcodeUrl,
        qrcodeDataUrl,
        expiresAt: result.expiresAt,
        status: "waiting",
        message: result.message,
      });
    } catch (qrError) {
      setWeixinQr({
        status: "error",
        message: qrError instanceof Error ? qrError.message : "生成微信二维码失败。",
      });
    }
  }

  async function handleCancelWeixinQrLogin() {
    const requestId = weixinQr.requestId;
    setWeixinQr({ status: "idle", message: "" });

    if (requestId) {
      try {
        await cancelInstanceWeixinQrLogin(instanceId, { requestId });
      } catch {
        // Session cleanup is best-effort; expired QR sessions are also removed by TTL in the main process.
      }
    }
  }

  async function handleApprovePairing() {
    if (!selected || !pairingGuide || !normalizedPairingCode) return;

    const currentIntegrationName = selected.name;
    setApprovingPairing(true);
    setPairingFeedback(null);

    try {
      const result = await approveInstanceMessagingPairing(instanceId, {
        profileId: selectedProfileId,
        integrationId: selected.id,
        code: normalizedPairingCode,
      });

      if (result.state) {
        setIntegrations(result.state.integrations);
        setProfiles(result.state.profiles);
        setFallback(result.state.fallback);
        publishInstanceSetupReadinessRefresh(instanceId, "messaging");
      } else {
        await loadIntegrations(selectedProfileId, null);
      }

      setPairingCode("");
      setPairingFeedback(null);
      setFeedback({
        tone: "success",
        message: `${result.message}\n现在回到${currentIntegrationName}再发一条消息验证。`,
      });
      setSelectedId(null);
    } catch (pairingError) {
      setPairingFeedback({
        tone: "error",
        message: pairingError instanceof Error ? pairingError.message : "批准配对失败，请重新复制最新配对码。",
      });
    } finally {
      setApprovingPairing(false);
    }
  }

  function handleCloseDrawer() {
    if (selected?.id === "weixin" && shouldPollWeixinQr(weixinQr.status)) {
      void handleCancelWeixinQrLogin();
    }
    setSelectedId(null);
  }

  useEffect(() => {
    setWeixinQr({ status: "idle", message: "" });
    setPairingCode("");
    setPairingFeedback(null);
  }, [selectedId, selectedProfileId]);

  useEffect(() => {
    if (selectedId !== "weixin" || selected?.id !== "weixin" || weixinQr.status !== "idle") {
      return;
    }
    if (selected.status === "已启用") {
      return;
    }

    void handleStartWeixinQrLogin();
  }, [selectedId, selected?.id, selected?.status, selectedProfileId, weixinQr.status]);

  useEffect(() => {
    if (
      selectedId !== "weixin"
      || selected?.id !== "weixin"
      || !weixinQr.requestId
      || !shouldPollWeixinQr(weixinQr.status)
    ) {
      return;
    }

    let disposed = false;
    let polling = false;

    const pollQrStatus = async () => {
      if (polling || !weixinQr.requestId) return;
      polling = true;

      try {
        const result = await pollInstanceWeixinQrLogin(instanceId, {
          requestId: weixinQr.requestId,
        });
        if (disposed) return;

        if (result.status === "confirmed") {
          const successMessage = result.message || "已自动保存并重启消息平台。";
          setWeixinQr((current) => ({
            ...current,
            status: "saving",
            message: "扫码成功，正在保存微信配置…",
          }));

          if (result.state) {
            setIntegrations(result.state.integrations);
            setProfiles(result.state.profiles);
            setFallback(result.state.fallback);
            setSelectedId(null);
            publishInstanceSetupReadinessRefresh(instanceId, "messaging");
          } else {
            await loadIntegrations(selectedProfileId, null);
          }

          if (disposed) return;
          setFeedback({
            tone: "success",
            message: successMessage,
          });
          setWeixinQr((current) => ({
            ...current,
            requestId: undefined,
            status: "confirmed",
            message: successMessage,
          }));
          return;
        }

        if (result.status === "expired") {
          setWeixinQr((current) => ({
            ...current,
            requestId: undefined,
            status: "expired",
            message: result.message || "二维码已过期，请重新生成。",
          }));
          return;
        }

        if (result.status === "cancelled") {
          setWeixinQr({ status: "idle", message: "" });
          return;
        }

        setWeixinQr((current) => ({
          ...current,
          status: result.status === "scanned" ? "scanned" : "waiting",
          message: result.message,
        }));
      } catch (pollError) {
        if (!disposed) {
          setWeixinQr((current) => ({
            ...current,
            status: "error",
            message: pollError instanceof Error ? pollError.message : "读取微信扫码状态失败。",
          }));
        }
      } finally {
        polling = false;
      }
    };

    void pollQrStatus();
    const timer = window.setInterval(() => {
      void pollQrStatus();
    }, 2_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [instanceId, loadIntegrations, selected?.id, selectedId, selectedProfileId, weixinQr.requestId, weixinQr.status]);

  function renderConfigField(field: HermesConfigField) {
    const fieldHint = selectedGuide?.fieldHints[field.key];

    return (
      <div key={field.label} className={detailCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">{field.label}</div>
          <Badge variant="outline">必填</Badge>
        </div>
        <input
          type={field.secret ? "password" : "text"}
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
          value={formState.fields[field.key] ?? ""}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              fields: {
                ...current.fields,
                [field.key]: event.target.value,
              },
            }))
          }
          placeholder={field.secret ? (field.value ? "已配置，留空则保持现有值" : "待配置") : "待配置"}
        />
        {fieldHint ? <div className="mt-2 text-xs leading-5 text-zinc-500">{fieldHint}</div> : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="集成" meta={<Badge variant="outline">Hermes 原生消息平台</Badge>} />
          <Card className="p-6 text-sm text-zinc-600">正在读取当前实例的原生消息平台状态…</Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="集成" meta={<Badge variant="outline">Hermes 原生消息平台</Badge>} />
          <Card className="p-6 text-sm text-zinc-600">{error}</Card>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="集成" meta={fallback ? <Badge variant="outline">静态 fallback</Badge> : <Badge variant="outline">Hermes 原生消息平台</Badge>} />
          <Card className="p-6 text-sm text-zinc-600">当前实例没有可展示的 Hermes 原生消息平台。</Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
        <PageHeader title="集成" meta={fallback ? <Badge variant="outline">静态 fallback</Badge> : <Badge variant="outline">Hermes 原生消息平台</Badge>} />

        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-medium text-zinc-900">目标档案</div>
            <div className="mt-1 text-sm text-zinc-500">平台凭据会直接写入所选 profile。保存后会写入当前 profile 对应的 .env。</div>
          </div>
          <select
            className="h-10 min-w-[220px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
            value={selectedProfileId}
            onChange={(event) => {
              const nextProfileId = event.target.value;
              setSelectedProfileId(nextProfileId);
              void loadIntegrations(nextProfileId);
            }}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </Card>

        {feedback ? (
          <Card className={`px-4 py-3 text-sm whitespace-pre-wrap ${feedback.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {feedback.message}
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-zinc-950">原生消息平台</div>
              <div className="mt-1 text-sm leading-6 text-zinc-600">傻瓜式配置：当前先保留 Telegram、微信、QQ、飞书；默认只填写必要项。</div>
            </div>
            <div className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3 text-sm text-zinc-600">
              <span className="font-semibold text-zinc-950">{configuredCount}</span> / {messagingIntegrations.length} 已配置
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {messagingIntegrations.map((item) => {
            const isConfigured = item.status === "已启用";
            const statusVariant = getStatusVariant(item.status);
            const healthVariant = getHealthVariant(item.health);

            return (
              <Card key={item.id} data-testid={`integration-card-${item.id}`} className={getIntegrationCardClassName(isConfigured)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                        isConfigured
                          ? "border-emerald-200 bg-white text-emerald-700"
                          : "border-zinc-200 bg-[#faf9f6] text-zinc-700"
                      )}
                    >
                      {isConfigured ? <CheckCircle2 className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-950">{item.name}</div>
                        {isConfigured ? <Badge variant="success">已配置</Badge> : null}
                      </div>
                      <div className="text-sm leading-6 text-zinc-600">{item.summary}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge variant={statusVariant}>{item.status}</Badge>
                  <Badge variant={healthVariant}>{item.health}</Badge>
                  <Badge variant="outline">{item.mode}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                  <div className={summaryCardClassName}>
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">接入方式</div>
                    <div className="mt-1.5 text-sm font-medium text-zinc-900">{item.authLabel}</div>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-zinc-200/70 pt-4">
                  <div className="text-xs text-zinc-500">{item.health}</div>
                  <Button variant={isConfigured ? "primary" : "secondary"} size="sm" onClick={() => setSelectedId(item.id)}>
                    {isConfigured ? "调整配置" : "查看并配置"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Drawer
        isOpen={!!selectedId}
        onClose={handleCloseDrawer}
        title="集成详情"
        footer={
          selected && selected.id !== "weixin" ? (
            <div className="flex w-full justify-end">
              <Button variant="primary" size="sm" disabled={!canSaveIntegration} onClick={() => void handleSaveIntegration()}>
                {saving ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {saving ? "保存并重启中..." : "保存配置"}
              </Button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-zinc-950">{selected.name}</div>
                    <Badge variant={getStatusVariant(selected.status)}>{selected.status}</Badge>
                    <Badge variant={getHealthVariant(selected.health)}>{selected.health}</Badge>
                  </div>
                  <div className="mt-1 text-sm leading-5 text-zinc-600">{selected.summary}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                <span className="rounded-full bg-white px-2.5 py-1">接入：{selected.authLabel}</span>
                <span className="rounded-full bg-white px-2.5 py-1">模式：{selected.mode}</span>
                <span className="rounded-full bg-white px-2.5 py-1">{selected.detail}</span>
              </div>
            </section>

            {selected.id === "weixin" ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-950">微信扫码配置</div>
                    <div className="mt-1 text-sm text-zinc-500">微信二维码是主路径，不需要先手动填 token；点击生成微信二维码后自动保存并重启。</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={weixinQr.status === "generating" || weixinQr.status === "saving"}
                    onClick={() => void handleStartWeixinQrLogin()}
                  >
                    {weixinQr.status === "generating" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    {buildWeixinQrPrimaryActionLabel(weixinQr.status, Boolean(weixinQr.qrcodeDataUrl || selected.status === "已启用"))}
                  </Button>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-800">
                  扫码前：微信最新版，并开启「微信 ClawBot」插件。路径：微信 → 我 → 设置 → 插件。看不到插件入口：先更新微信或等待灰度开放。
                </div>

                {shouldShowWeixinQrPanel ? (
                  <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {weixinQr.qrcodeDataUrl ? (
                        <img
                          src={weixinQr.qrcodeDataUrl}
                          alt="微信扫码登录二维码"
                          className="h-[184px] w-[184px] shrink-0 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm"
                        />
                      ) : (
                        <div className="flex min-h-[88px] flex-1 items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-4 text-sm text-zinc-600">
                          {weixinQr.status === "generating" ? (
                            <span className="inline-flex items-center">
                              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                              正在生成二维码…
                            </span>
                          ) : (
                            buildWeixinQrStatusTitle(weixinQr.status)
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1 text-sm leading-6">
                        <div className="font-semibold text-zinc-950">{buildWeixinQrStatusTitle(weixinQr.status)}</div>
                        <div className="text-zinc-600">{weixinQr.message || "扫码后自动写入凭据。"}</div>
                        {weixinQr.qrcodeUrl && weixinQr.status !== "confirmed" ? (
                          <a
                            href={weixinQr.qrcodeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-xs font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-4"
                          >
                            备用链接
                          </a>
                        ) : null}
                        {weixinQr.qrcodeDataUrl || weixinQr.status === "expired" || weixinQr.status === "error" ? (
                          <div className="pt-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              data-testid="weixin-qr-refresh"
                              disabled={weixinQr.status === "generating" || weixinQr.status === "saving"}
                              onClick={() => void handleStartWeixinQrLogin()}
                            >
                              {weixinQr.status === "generating" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                              重新获取二维码
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {selected.status === "已启用" || weixinQr.status === "confirmed" ? (
                  <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm leading-6 text-emerald-800">
                    <span className="font-semibold text-emerald-900">微信扫码绑定成功。</span>
                    下一步：首次授权收到 pairing code 后，在下方批准配对。
                  </div>
                ) : null}

                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-800">
                  无响应：检查远程服务器运行服务到微信 iLink 服务的网络或代理。
                </div>
              </section>
            ) : null}

            {selectedGuide && selected.id !== "weixin" ? (
              <section className="space-y-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-950">获取凭据</div>
                      <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-blue-500">凭据入口：{selectedGuide.sourceName}</div>
                      <div className="mt-1 text-sm leading-6 text-blue-800">{selectedGuide.summary}</div>
                    </div>
                    <Badge variant="outline">只保存到当前 profile</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={selectedGuide.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                    >
                      打开官方入口
                    </a>
                    <a
                      href={selectedGuide.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-blue-100 bg-blue-100/70 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      官方文档
                    </a>
                  </div>
                </div>
              </section>
            ) : null}

            {selected.id !== "weixin" ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-950">傻瓜式配置</div>
                    <div className="mt-1 text-sm text-zinc-500">只填必填项，保存后自动重启。</div>
                  </div>
                  <Badge variant="outline">{simpleFields.length} 个必要项</Badge>
                </div>
                <div className="space-y-3">
                  {simpleFields.map(renderConfigField)}

                  {editableFields.length === 0 ? (
                    <div className={detailCardClassName}>
                      <div className="text-sm text-zinc-600">当前平台没有可编辑字段。</div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {pairingGuide ? (
              <section className="space-y-3">
                <div className="text-sm font-semibold text-zinc-950">首次授权配对</div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-800">
                  {pairingGuide.intro}
                  <span className="ml-1 text-blue-700">{pairingGuide.nextStep}</span>
                  <div className="mt-2">
                    命令：
                    <code className="mx-1 rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-blue-900">{pairingGuide.command}</code>
                  </div>
                </div>
                <div className={detailCardClassName}>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-[220px] flex-1">
                      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">PAIRING CODE</div>
                      <input
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                        value={pairingCode}
                        onChange={(event) => {
                          setPairingCode(normalizePairingCodeInput(event.target.value));
                          setPairingFeedback(null);
                        }}
                        placeholder="例如 ABC1234"
                      />
                      {pairingFeedback?.message ? (
                        <div className={`mt-2 rounded-xl px-3 py-2 text-xs leading-5 ${pairingFeedback.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {pairingFeedback.message}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs leading-5 text-zinc-500">粘贴平台返回的最新 pairing code。</div>
                      )}
                    </label>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!canApprovePairing}
                      onClick={() => void handleApprovePairing()}
                    >
                      {approvingPairing ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      {approvingPairing ? "正在批准..." : "批准配对"}
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {selected.id === "telegram" ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-800">
                Telegram 提示 “No home channel is set” 时，在当前聊天发送
                <code className="mx-1 rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-blue-900">/sethome</code>；无响应先检查远程服务器运行服务到 Telegram 的网络代理。
              </div>
            ) : null}

            {selected.id === "feishu" ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-800">
                无响应：检查远程服务器运行服务到飞书开放平台的网络/代理。
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
