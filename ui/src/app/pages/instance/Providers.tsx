import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { KeyRound, LoaderCircle, Server, ShieldCheck } from "lucide-react";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Drawer } from "../../components/ui/drawer";
import { PageHeader } from "../../components/console/PageHeader";
import type {
  HermesProfileEntry,
  HermesProviderAuthMethod,
  HermesProviderAuthMethodId,
  HermesProviderEntry,
  HermesProviderStatus,
} from "../../data/hermesOfficial";
import {
  authenticateInstanceProvider,
  listInstanceProviderTests,
  testInstanceProvider,
  type ProviderTestResult,
  updateInstanceProviderConfig,
} from "../../services/officialActions";
import { getInstanceOfficialState } from "../../services/officialState";
import { publishInstanceSetupReadinessRefresh } from "../../services/setupReadiness";

const summaryCardClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3.5 [overflow-wrap:anywhere]";
const readonlyFieldClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 [overflow-wrap:anywhere]";
const beginnerProviderOrder = [
  "openai-codex",
  "anthropic",
  "deepseek",
  "openrouter",
  "gemini",
  "alibaba",
  "custom",
];

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

type ProviderFormState = {
  defaultModel: string;
  baseUrl: string;
  apiKey: string;
  env: Record<string, string>;
};

type ProviderTestMap = Record<string, ProviderTestResult>;
type OAuthCompletionMap = Record<string, boolean>;
type ProviderRefreshResult =
  | { ok: true }
  | { ok: false; message: string };
type ApplyOfficialProviderStateOptions = {
  preserveProviderTestsOnFailure?: boolean;
};

function getStatusVariant(status: HermesProviderStatus): BadgeProps["variant"] {
  return status === "已连接" ? "success" : status === "异常" ? "error" : "outline";
}

function getFieldKind(field: HermesProviderEntry["fields"][number]) {
  return field.kind ?? (field.secret ? "password" : "text");
}

function isEditableProviderField(field: HermesProviderEntry["fields"][number]) {
  return !field.readOnly
    && getFieldKind(field) !== "readonly"
    && !["base_url", "api_key", "provider", "auth_mode", "default_model"].includes(field.key);
}

function buildProviderForm(provider: HermesProviderEntry): ProviderFormState {
  const env: Record<string, string> = {};
  for (const field of provider.fields) {
    if (!isEditableProviderField(field)) {
      continue;
    }

    env[field.key] = field.secret ? "" : field.value === "待配置" ? "" : field.value;
  }

  const baseUrlField = provider.fields.find((field) => field.key === "base_url");

  return {
    defaultModel: provider.defaultModel === "待配置" ? "" : provider.defaultModel,
    baseUrl: baseUrlField?.value === "待配置" ? "" : baseUrlField?.value ?? "",
    apiKey: "",
    env,
  };
}

function toProviderTestMap(entries: ProviderTestResult[]) {
  return entries.reduce<ProviderTestMap>((accumulator, entry) => {
    accumulator[entry.providerId] = entry;
    return accumulator;
  }, {});
}

function getProviderTestBadge(test?: ProviderTestResult | null): { label: string; variant: BadgeProps["variant"] } | null {
  if (!test) return null;
  if (test.status === "verified") {
    return { label: "已验证", variant: "success" };
  }
  if (test.status === "failed") {
    return { label: "验证失败", variant: "error" };
  }
  return { label: "已配置", variant: "outline" };
}

function formatCheckedAt(checkedAt?: string) {
  if (!checkedAt) return "";
  const timestamp = new Date(checkedAt);
  if (Number.isNaN(timestamp.getTime())) return checkedAt;
  return timestamp.toLocaleString("zh-CN", { hour12: false });
}

function hasEditableSecret(provider: HermesProviderEntry) {
  return provider.fields.some((field) => isEditableProviderField(field) && field.secret);
}

function getProviderAuthMethods(provider: HermesProviderEntry): HermesProviderAuthMethod[] {
  if (provider.authMethods?.length) {
    return provider.authMethods;
  }

  if (provider.id === "custom" || provider.providerType === "Custom Endpoint") {
    return [{ id: "endpoint", label: "自定义地址", detail: "先填服务地址，再保存；需要 Key 时再粘贴。" }];
  }

  const methods: HermesProviderAuthMethod[] = [];

  if (provider.providerType === "OAuth") {
    methods.push({
      id: "oauth",
      label: "OAuth 登录",
      detail: "点登录，Hermes 会帮你处理凭据。",
      command: `hermes auth add ${provider.id} --type oauth`,
    });
  }

  if (provider.providerType === "API Key" || hasEditableSecret(provider)) {
    methods.push({
      id: "api-key",
      label: "API Key",
      detail: "把 Key 粘贴进来，保存后就能测试。",
    });
  }

  return methods;
}

function getProviderAuthMethodHelp(method: HermesProviderAuthMethod) {
  if (method.id === "oauth") return "点登录，Hermes 会帮你处理凭据。";
  if (method.id === "api-key") return "把 Key 粘贴进来，保存后就能测试。";
  if (method.id === "endpoint") return "先填服务地址，再保存；需要 Key 时再粘贴。";
  return method.detail ?? "";
}

function getProviderDrawerPathHint(authMethod: HermesProviderAuthMethodId) {
  if (authMethod === "oauth") return "先点“启动 OAuth 登录”，登录完成后再保存。";
  if (authMethod === "api-key") return "把 Key 粘贴进来，再保存并测试。";
  if (authMethod === "endpoint") return "先填服务地址，再保存并测试。";
  return "按页面提示补齐必填项后再保存。";
}

function getProviderSaveGuardMessage(
  provider: HermesProviderEntry,
  authMethod: HermesProviderAuthMethodId,
  formState: ProviderFormState,
  selectedOAuthReady: boolean,
  selectedHasSecret: boolean,
) {
  if (!formState.defaultModel.trim()) {
    return "先选一个默认模型，再保存。";
  }

  if ((authMethod === "endpoint" || provider.id === "custom") && !formState.baseUrl.trim()) {
    return "先填服务地址，再保存。";
  }

  if (authMethod === "oauth" && !selectedOAuthReady) {
    return "先完成 OAuth 登录，再保存。";
  }

  if (authMethod === "api-key" && !selectedHasSecret) {
    return "先把 Key 粘贴进来，再保存。";
  }

  return null;
}

function getProviderTestGuardMessage(
  provider: HermesProviderEntry,
  authMethod: HermesProviderAuthMethodId,
  formState: ProviderFormState,
  selectedOAuthReady: boolean,
  selectedHasSecret: boolean,
) {
  if (!formState.defaultModel.trim()) {
    return "先选一个默认模型，再测试。";
  }

  if ((authMethod === "endpoint" || provider.id === "custom") && !formState.baseUrl.trim()) {
    return "先填服务地址，再测试。";
  }

  if (authMethod === "oauth" && !selectedOAuthReady) {
    return "先完成 OAuth 登录，再测试。";
  }

  if (authMethod === "api-key" && !selectedHasSecret) {
    return "先把 Key 粘贴进来，再测试。";
  }

  return null;
}

function getDefaultAuthMethod(provider: HermesProviderEntry): HermesProviderAuthMethodId {
  const methods = getProviderAuthMethods(provider);
  const authMode = provider.fields.find((field) => field.key === "auth_mode")?.value ?? provider.authSummary;

  if (provider.id === "custom") return "endpoint";
  if (/oauth|code|portal/i.test(authMode) && methods.some((method) => method.id === "oauth")) return "oauth";
  if (provider.status === "已连接" && methods.some((method) => method.id === "api-key") && !methods.some((method) => method.id === "oauth")) return "api-key";

  return methods[0]?.id ?? "api-key";
}

function getConfiguredRank(provider: HermesProviderEntry, test?: ProviderTestResult) {
  if (provider.isDefault) return 0;
  if (provider.status === "已连接" && test?.status === "verified") return 1;
  if (provider.status === "已连接") return 2;
  if (test?.status === "failed") return 3;
  if (test?.status === "configured") return 4;
  return 5;
}

function getBeginnerProviderRank(provider: HermesProviderEntry, test?: ProviderTestResult) {
  const configuredRank = getConfiguredRank(provider, test);
  if (configuredRank < 5) return configuredRank;

  const beginnerIndex = beginnerProviderOrder.indexOf(provider.id);
  if (beginnerIndex >= 0) return 10 + beginnerIndex;

  return 50;
}

function formatAuthMethodLabels(methods: HermesProviderAuthMethod[]) {
  if (methods.length === 0) return "无需手动凭据";
  return methods.map((method) => method.label).join(" / ");
}

function renderFeedbackCard(feedback: FeedbackState) {
  if (!feedback) return null;

  return (
    <Card
      role={feedback.tone === "error" ? "alert" : "status"}
      data-testid="provider-action-feedback"
      className={`px-4 py-3 text-sm whitespace-pre-wrap ${feedback.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
    >
      {feedback.message}
    </Card>
  );
}

function buildProviderOAuthSuccessMessage(result: { message: string; output: string }, refreshFailed = false) {
  const baseMessage = `${[result.message, result.output].filter(Boolean).join("\n")}\n建议立即测试当前供应商。`;
  if (!refreshFailed) {
    return baseMessage;
  }

  return `${baseMessage}\n登录已完成，但重新读取最新状态失败，请稍后刷新页面确认。`;
}

function getOptimisticProviderStatusFromTestResult(result: ProviderTestResult): HermesProviderStatus | null {
  if (result.status === "verified" || result.status === "configured") {
    return "已连接";
  }
  if (result.status === "failed") {
    return "异常";
  }

  return null;
}

function getOptimisticProviderStatusAfterSave(): HermesProviderStatus {
  return "已连接";
}

function resolveOfficialProviderSelection(
  result: Awaited<ReturnType<typeof getInstanceOfficialState>>,
  selectedProfileId: string,
  preferredProfileId?: string,
  preferredProviderId?: string | null,
) {
  const nextProfileId = preferredProfileId
    ?? result.sources?.selectedProfileId
    ?? result.profiles.find((profile) => profile.id === selectedProfileId)?.id
    ?? result.profiles.find((profile) => profile.isDefault)?.id
    ?? "default";

  const nextProviderId = preferredProviderId === undefined
    ? null
    : result.providers.some((provider) => provider.id === preferredProviderId)
      ? preferredProviderId
      : null;

  return {
    nextProfileId,
    nextProviderId,
  };
}

export function Providers() {
  const { id: instanceId = "" } = useParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [providers, setProviders] = useState<HermesProviderEntry[]>([]);
  const [profiles, setProfiles] = useState<HermesProfileEntry[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("default");
  const [formState, setFormState] = useState<ProviderFormState>({ defaultModel: "", baseUrl: "", apiKey: "", env: {} });
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<HermesProviderAuthMethodId>("oauth");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [oauthWorkingId, setOauthWorkingId] = useState<string | null>(null);
  const [oauthCompleted, setOauthCompleted] = useState<OAuthCompletionMap>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [fallback, setFallback] = useState(false);
  const [providerTests, setProviderTests] = useState<ProviderTestMap>({});

  const applyOfficialProviderState = useCallback(
    async (
      result: Awaited<ReturnType<typeof getInstanceOfficialState>>,
      preferredProfileId?: string,
      preferredProviderId?: string | null,
      options?: ApplyOfficialProviderStateOptions,
    ) => {
      setProviders(result.providers);
      setProfiles(result.profiles);
      setFallback(result.fallback);

      const { nextProfileId, nextProviderId } = resolveOfficialProviderSelection(
        result,
        selectedProfileId,
        preferredProfileId,
        preferredProviderId,
      );

      setSelectedProfileId(nextProfileId);
      setSelectedId(nextProviderId);

      try {
        const tests = await listInstanceProviderTests(instanceId, { profileId: nextProfileId });
        setProviderTests(toProviderTestMap(tests));
      } catch {
        if (!options?.preserveProviderTestsOnFailure) {
          setProviderTests({});
        }
      }
    },
    [instanceId, selectedProfileId]
  );

  const loadProviders = useCallback(
    async (preferredProfileId?: string, preferredProviderId?: string | null) => {
      setLoading(true);
      setError(null);

      try {
        const result = await getInstanceOfficialState(instanceId, {
          profileId: preferredProfileId ?? selectedProfileId,
        });
        await applyOfficialProviderState(result, preferredProfileId, preferredProviderId);
      } catch (loadError) {
        setProviders([]);
        setProfiles([]);
        setFallback(false);
        setProviderTests({});
        setError(loadError instanceof Error ? loadError.message : "无法读取当前实例的 provider 状态。");
      } finally {
        setLoading(false);
      }
    },
    [applyOfficialProviderState, instanceId, selectedProfileId]
  );

  const refreshProviders = useCallback(
    async (preferredProfileId?: string, preferredProviderId?: string | null) => {
      try {
        const result = await getInstanceOfficialState(instanceId, {
          profileId: preferredProfileId ?? selectedProfileId,
        });
        await applyOfficialProviderState(result, preferredProfileId, preferredProviderId, {
          preserveProviderTestsOnFailure: true,
        });
        publishInstanceSetupReadinessRefresh(instanceId, "provider");
        return { ok: true } satisfies ProviderRefreshResult;
      } catch (refreshError) {
        return {
          ok: false,
          message: refreshError instanceof Error ? refreshError.message : "无法读取当前实例的 provider 状态。",
        } satisfies ProviderRefreshResult;
      }
    },
    [applyOfficialProviderState, instanceId, selectedProfileId]
  );

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const visibleProviders = useMemo(
    () => providers.filter((provider) => provider.id !== "auto"),
    [providers]
  );
  const sortedProviders = useMemo(
    () => [...visibleProviders].sort((left, right) => {
      const rankDelta = getBeginnerProviderRank(left, providerTests[left.id]) - getBeginnerProviderRank(right, providerTests[right.id]);
      if (rankDelta !== 0) return rankDelta;
      return left.name.localeCompare(right.name, "zh-CN");
    }),
    [providerTests, visibleProviders]
  );

  const currentProvider = useMemo(
    () => visibleProviders.find((item) => item.isDefault) ?? sortedProviders.find((item) => item.status === "已连接") ?? sortedProviders[0] ?? null,
    [sortedProviders, visibleProviders]
  );
  const selected = useMemo(
    () => sortedProviders.find((item) => item.id === selectedId) ?? currentProvider,
    [currentProvider, selectedId, sortedProviders]
  );
  const selectedProfileName = profiles.find((profile) => profile.id === selectedProfileId)?.name ?? selectedProfileId;
  const currentTest = currentProvider ? providerTests[currentProvider.id] : null;
  const selectedAuthMethods = selected ? getProviderAuthMethods(selected) : [];
  const selectedAuthMethodInfo = selectedAuthMethods.find((method) => method.id === selectedAuthMethod) ?? selectedAuthMethods[0] ?? null;
  const modelOptions = useMemo(() => {
    if (!selected) return [];
    const candidates = selected.models.filter((model) => model && model !== "待配置");
    const currentModel = formState.defaultModel.trim();

    if (currentModel && !candidates.includes(currentModel)) {
      return [currentModel, ...candidates];
    }

    return candidates;
  }, [formState.defaultModel, selected]);
  const shouldShowAuthMethodPicker = selectedAuthMethods.length > 1;
  const selectedRequiresModel = Boolean(selected);
  const selectedRequiresEndpoint = selectedAuthMethod === "endpoint" || selected?.id === "custom";
  const selectedEditableFields = selected?.fields.filter(isEditableProviderField) ?? [];
  const selectedRequiresSecret = selectedAuthMethod === "api-key"
    && selectedEditableFields.some((field) => field.secret);
  const selectedHasSecret = selectedEditableFields.some((field) => {
    if (!field.secret) return false;
    return Boolean(field.value) || Boolean((formState.env[field.key] ?? "").trim());
  });
  const selectedOAuthReady = selectedAuthMethod !== "oauth" || Boolean(selected && (selected.status === "已连接" || oauthCompleted[selected.id]));
  const canSaveProvider = Boolean(selected)
    && !saving
    && !oauthWorkingId
    && (!selected || testingId !== selected.id)
    && (!selectedRequiresModel || formState.defaultModel.trim().length > 0)
    && (!selectedRequiresEndpoint || formState.baseUrl.trim().length > 0)
    && (!selectedRequiresSecret || selectedHasSecret)
    && selectedOAuthReady;
  const currentProviderTestGuardMessage = useMemo(() => {
    if (!currentProvider) return "当前还没有可测试的供应商。";
    const authMethod = getDefaultAuthMethod(currentProvider);
    const currentFormState = buildProviderForm(currentProvider);
    const currentEditableFields = currentProvider.fields.filter(isEditableProviderField);
    const currentHasSecret = currentEditableFields.some((field) => {
      if (!field.secret) return false;
      return Boolean(field.value) || Boolean((currentFormState.env[field.key] ?? "").trim());
    });
    const currentOAuthReady = authMethod !== "oauth"
      || currentProvider.status === "已连接"
      || oauthCompleted[currentProvider.id];

    return getProviderTestGuardMessage(
      currentProvider,
      authMethod,
      currentFormState,
      currentOAuthReady,
      currentHasSecret,
    );
  }, [currentProvider, oauthCompleted]);
  const canTestCurrentProvider = !currentProviderTestGuardMessage && testingId !== currentProvider?.id;
  const drawerFeedback = drawerOpen ? feedback : null;

  useEffect(() => {
    if (!selected) return;
    setFormState(buildProviderForm(selected));
    setSelectedAuthMethod(getDefaultAuthMethod(selected));
  }, [selected]);

  function handleOpenProviderDrawer(providerId?: string) {
    setSelectedId(providerId ?? currentProvider?.id ?? null);
    setFeedback(null);
    setDrawerOpen(true);
  }

  function clearProviderEditFeedback(providerId: string | null = selectedId) {
    setFeedback(null);

    if (!providerId) return;

    setProviderTests((current) => {
      const currentTest = current[providerId];
      if (currentTest?.status !== "failed") return current;

      const next = { ...current };
      delete next[providerId];
      return next;
    });
  }

  async function handleAuthenticateProvider() {
    if (!selected || selectedAuthMethod !== "oauth") return;

    setOauthWorkingId(selected.id);
    clearProviderEditFeedback(selected.id);

    try {
      const result = await authenticateInstanceProvider(instanceId, {
        profileId: selectedProfileId,
        providerId: selected.id,
        authType: "oauth",
      });

      const refreshResult = await refreshProviders(selectedProfileId, selected.id);
      if (!refreshResult.ok) {
        setProviders((current) => current.map((provider) => (
          provider.id === selected.id
            ? { ...provider, status: "已连接" }
            : provider
        )));
      }
      setOauthCompleted((current) => ({ ...current, [selected.id]: true }));
      setFeedback({
        tone: "success",
        message: buildProviderOAuthSuccessMessage(result, !refreshResult.ok),
      });
    } catch (authError) {
      setFeedback({
        tone: "error",
        message: "OAuth 登录没完成，请再试一次。",
      });
    } finally {
      setOauthWorkingId(null);
    }
  }

  async function handleSaveProvider() {
    if (!selected) return;

    const saveGuardMessage = getProviderSaveGuardMessage(
      selected,
      selectedAuthMethod,
      formState,
      selectedOAuthReady,
      selectedHasSecret,
    );

    if (saveGuardMessage) {
      setFeedback({
        tone: "error",
        message: saveGuardMessage,
      });
      return;
    }

    setSaving(true);
    clearProviderEditFeedback(selected.id);

    try {
      const payloadEnv: Record<string, string> = {};

      if (selectedAuthMethod === "api-key") {
        for (const field of selected.fields) {
          if (!isEditableProviderField(field)) {
            continue;
          }

          const currentValue = formState.env[field.key] ?? "";
          if (field.secret) {
            if (currentValue.trim()) {
              payloadEnv[field.key] = currentValue.trim();
            }
          } else {
            payloadEnv[field.key] = currentValue.trim();
          }
        }
      }

      const result = await updateInstanceProviderConfig(instanceId, {
        profileId: selectedProfileId,
        providerId: selected.id,
        defaultModel: formState.defaultModel.trim(),
        baseUrl: selectedRequiresEndpoint ? formState.baseUrl.trim() : undefined,
        apiKey: selectedRequiresEndpoint && formState.apiKey.trim() ? formState.apiKey.trim() : undefined,
        env: payloadEnv,
      });

      try {
        setTestingId(selected.id);
        setFeedback({
          tone: "success",
          message: `${result.message}\n正在自动测试当前供应商…`,
        });

        const testResult = await testInstanceProvider(instanceId, {
          profileId: selectedProfileId,
          providerId: selected.id,
        });

        try {
          const tests = await listInstanceProviderTests(instanceId, { profileId: selectedProfileId });
          setProviderTests(toProviderTestMap(tests));
        } catch {
          // 测试结果本身已经返回；列表刷新失败不阻断保存后的主流程。
        }

        const refreshResult = await refreshProviders(selectedProfileId, selected.id);
        if (!refreshResult.ok) {
          const optimisticStatus = getOptimisticProviderStatusFromTestResult(testResult)
            ?? getOptimisticProviderStatusAfterSave();
          setProviders((current) => current.map((provider) => (
            provider.id === selected.id
              ? { ...provider, status: optimisticStatus }
              : provider
          )));
          setFeedback({
            tone: "success",
            message: `${result.message}\n已保存，但重新读取最新状态失败，请稍后刷新页面确认。`,
          });
        }

        if (testResult.status === "failed") {
          setFeedback({
            tone: "error",
            message: `${result.message}\n${testResult.summary}\n${testResult.detail}`,
          });
          return;
        }

        if (testResult.status !== "failed") {
          setFeedback({
            tone: "success",
            message: refreshResult.ok
              ? `${result.message}\n${testResult.summary}\n${testResult.detail}`
              : `${result.message}\n${testResult.summary}\n${testResult.detail}\n已完成测试，但最新状态刷新失败，请稍后刷新页面确认。`,
          });
          setDrawerOpen(false);
          setSelectedId(null);
        }
      } catch (testError) {
        setFeedback({
          tone: "error",
          message: testError instanceof Error
            ? `${result.message}\n自动测试没完成。\n${testError.message}`
            : `${result.message}\n自动测试没完成，请再试一次。`,
        });
      }
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: "保存没成功，请再试一次。",
      });
    } finally {
      setSaving(false);
      setTestingId(null);
    }
  }

  async function handleTestProvider(providerOverride?: HermesProviderEntry | null) {
    const targetProvider = providerOverride ?? selected;
    if (!targetProvider) return;
    const targetAuthMethod = providerOverride ? getDefaultAuthMethod(targetProvider) : selectedAuthMethod;
    const targetFormState = providerOverride ? buildProviderForm(targetProvider) : formState;
    const targetEditableFields = targetProvider.fields.filter(isEditableProviderField);
    const targetHasSecret = targetEditableFields.some((field) => {
      if (!field.secret) return false;
      return Boolean(field.value) || Boolean((targetFormState.env[field.key] ?? "").trim());
    });
    const targetOAuthReady = targetAuthMethod !== "oauth"
      || targetProvider.status === "已连接"
      || oauthCompleted[targetProvider.id];
    const testGuardMessage = getProviderTestGuardMessage(
      targetProvider,
      targetAuthMethod,
      targetFormState,
      targetOAuthReady,
      targetHasSecret,
    );

    if (testGuardMessage) {
      setFeedback({
        tone: "error",
        message: testGuardMessage,
      });
      return;
    }

    setTestingId(targetProvider.id);
    clearProviderEditFeedback(targetProvider.id);

    try {
      const result = await testInstanceProvider(instanceId, {
        profileId: selectedProfileId,
        providerId: targetProvider.id,
      });

      const tests = await listInstanceProviderTests(instanceId, { profileId: selectedProfileId });
      setProviderTests(toProviderTestMap(tests));
      const refreshResult = await refreshProviders(selectedProfileId, targetProvider.id);
      if (!refreshResult.ok) {
        const optimisticStatus = getOptimisticProviderStatusFromTestResult(result);
        if (optimisticStatus) {
          setProviders((current) => current.map((provider) => (
            provider.id === targetProvider.id
              ? { ...provider, status: optimisticStatus }
              : provider
          )));
        }
      }
      setFeedback({
        tone: result.status === "verified" ? "success" : "error",
        message: refreshResult.ok
          ? `${result.summary}\n${result.detail}`
          : `${result.summary}\n${result.detail}\n已完成测试，但最新状态刷新失败，请稍后刷新页面确认。`,
      });
    } catch (testError) {
      setFeedback({
        tone: "error",
        message: "测试没通过，请再试一次。",
      });
    } finally {
      setTestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="AI 提供商" meta={<Badge variant="outline">Hermes 官方 provider/model</Badge>} />
          <Card className="p-6 text-sm text-zinc-600">正在读取当前实例的 provider 与 model 状态…</Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="AI 提供商" meta={<Badge variant="outline">Hermes 官方 provider/model</Badge>} />
          <Card className="p-6 text-sm text-zinc-600">{error}</Card>
        </div>
      </div>
    );
  }

  if (!selected || !currentProvider) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader
            title="AI 提供商"
            meta={fallback ? <Badge variant="outline">静态 fallback</Badge> : <Badge variant="outline">Hermes 官方 provider/model</Badge>}
          />
          <Card className="p-6 text-sm text-zinc-600">当前实例还没有可展示的 Hermes 官方 provider。</Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
        <PageHeader
          title="AI 提供商"
          meta={fallback ? <Badge variant="outline">静态 fallback</Badge> : <Badge variant="outline">Hermes 官方 provider/model</Badge>}
        />

        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-950">AI 提供商</div>
              <div className="mt-1 text-sm text-zinc-500">选供应商 → 登录或粘贴 Key → 保存 → 测试；现在保存会自动测试，通过后弹窗关闭。</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getStatusVariant(currentProvider.status)}>{currentProvider.status}</Badge>
              <Badge variant="outline">{selectedProfileName}</Badge>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3.5 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">当前 AI 接入</div>
                <div className="mt-1.5 text-sm font-semibold text-zinc-950">
                  {currentProvider.name} · {currentProvider.defaultModel}
                </div>
                <div className="mt-1 text-xs text-zinc-500">当前档案：{selectedProfileName}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getStatusVariant(currentProvider.status)}>{currentProvider.status}</Badge>
                {currentTest ? <Badge variant={getProviderTestBadge(currentTest)?.variant ?? "outline"}>{currentTest.summary}</Badge> : <Badge variant="outline">未测试</Badge>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/70 pt-4">
            <select
              className="h-10 min-w-[220px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
              value={selectedProfileId}
              onChange={(event) => {
                const nextProfileId = event.target.value;
                setSelectedProfileId(nextProfileId);
                void loadProviders(nextProfileId);
              }}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              data-testid="provider-test-current"
              disabled={!canTestCurrentProvider}
              onClick={() => void handleTestProvider(currentProvider)}
            >
              {testingId === currentProvider.id ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {testingId === currentProvider.id ? "测试中..." : "测试当前配置"}
            </Button>
          </div>
        </Card>

        {!drawerOpen ? renderFeedbackCard(feedback) : null}

        <div className="space-y-4">
          <div className="flex items-end justify-between border-b border-zinc-200/70 pb-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">提供商目录</h2>
              <p className="mt-1 text-sm text-zinc-500">常用和已配置供应商排在前面；打开卡片后只需登录或粘贴 Key。</p>
            </div>
            <span className="text-xs text-zinc-400">{sortedProviders.length} 个供应商</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedProviders.map((item) => {
              const variant = getStatusVariant(item.status);
              const latestTest = providerTests[item.id];
              const testBadge = getProviderTestBadge(latestTest);
              const methods = getProviderAuthMethods(item);
              const isConfigured = item.status === "已连接" || item.isDefault;
              return (
                <Card
                  key={item.id}
                  className={`flex h-full flex-col p-5 transition ${isConfigured ? "border-emerald-200 bg-emerald-50/45 shadow-[0_18px_60px_rgba(16,185,129,0.10)]" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${isConfigured ? "border-emerald-200 bg-white text-emerald-700" : "border-zinc-200 bg-[#faf9f6] text-zinc-700"}`}>
                      <Server className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-zinc-950">{item.name}</h4>
                        <Badge variant={variant}>{item.status}</Badge>
                        {item.isDefault ? <Badge variant="success">当前</Badge> : null}
                        {testBadge ? <Badge variant={testBadge.variant}>{testBadge.label}</Badge> : null}
                      </div>
                      <div className="line-clamp-2 text-sm text-zinc-600">{item.detail}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className={summaryCardClassName}>
                      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">配置方式</div>
                      <div className="mt-1.5 truncate text-sm font-medium text-zinc-900">{formatAuthMethodLabels(methods)}</div>
                    </div>
                    <div className={summaryCardClassName}>
                      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">推荐模型</div>
                      <div className="mt-1.5 truncate text-sm font-medium text-zinc-900">{item.defaultModel}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-zinc-200/70 pt-4">
                    <div className="text-xs text-zinc-500">{item.id}</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid={`provider-configure-${item.id}`}
                      onClick={() => handleOpenProviderDrawer(item.id)}
                    >
                      打开配置
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <Drawer
        isOpen={drawerOpen && !!selected}
        onClose={() => setDrawerOpen(false)}
        title="AI 供应商配置"
        footer={
          selected ? (
            <div className="flex w-full items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">保存到当前档案：{selectedProfileName}。密码字段留空保留现有值。</div>
              <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid="provider-test-selected"
                      disabled={saving || oauthWorkingId === selected.id || testingId === selected.id || !canSaveProvider}
                      onClick={() => void handleTestProvider()}
                    >
                  {testingId === selected.id ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {testingId === selected.id ? "测试中..." : "测试"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  data-testid="provider-save-current"
                  disabled={!canSaveProvider}
                  onClick={() => void handleSaveProvider()}
                >
                  {saving ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {saving ? "保存并测试中..." : "保存并测试"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-7">
            {renderFeedbackCard(drawerFeedback)}

            {providerTests[selected.id] ? (
              <Card className={`px-4 py-3 text-sm whitespace-pre-wrap ${providerTests[selected.id].status === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : providerTests[selected.id].status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-zinc-200 bg-[#faf9f6] text-zinc-700"}`}>
                <div className="font-medium">{providerTests[selected.id].summary}</div>
                <div className="mt-1">{providerTests[selected.id].detail}</div>
                <div className="mt-2 text-xs opacity-75">{formatCheckedAt(providerTests[selected.id].checkedAt)} · {providerTests[selected.id].source}</div>
              </Card>
            ) : null}

            <section className="space-y-3">
              <div className="text-sm font-semibold text-zinc-950">1. 供应商</div>
              <div className={readonlyFieldClassName}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-zinc-950">{selected.name}</div>
                    <p className="mt-2 text-sm text-zinc-600">{selected.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusVariant(selected.status)}>{selected.status}</Badge>
                    {selected.isDefault ? <Badge variant="success">当前</Badge> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold text-zinc-950">2. 认证方式</div>
              {shouldShowAuthMethodPicker ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {selectedAuthMethods.map((method) => {
                    const isActive = selectedAuthMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        className={`rounded-2xl border px-4 py-3 text-left transition ${isActive ? "border-zinc-950 bg-zinc-950 text-white shadow-sm" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"}`}
                        onClick={() => {
                          setSelectedAuthMethod(method.id);
                          clearProviderEditFeedback(selected?.id ?? null);
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {method.id === "oauth" ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                          {method.label}
                        </div>
                        <div className={`mt-1 text-xs ${isActive ? "text-white/70" : "text-zinc-500"}`}>{getProviderAuthMethodHelp(method)}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={readonlyFieldClassName}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                    {selectedAuthMethod === "oauth" ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                    {selectedAuthMethodInfo?.label ?? "无需手动凭据"}
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">{selectedAuthMethodInfo ? getProviderAuthMethodHelp(selectedAuthMethodInfo) : "该供应商无需额外选择认证方式。"}</div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold text-zinc-950">3. 默认模型（必填）</div>
              <div className={readonlyFieldClassName}>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">默认模型</div>
                <div className="mt-1 text-xs text-zinc-500">先选一个模型，再继续登录或粘贴 Key。也可以直接手动输入。</div>
                <input
                  list={modelOptions.length > 0 ? `provider-models-${selected.id}` : undefined}
                  data-testid="provider-model-input"
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                  value={formState.defaultModel}
                  onChange={(event) => {
                    clearProviderEditFeedback(selected?.id ?? null);
                    setFormState((current) => ({ ...current, defaultModel: event.target.value }));
                  }}
                  placeholder="例如：gpt-5.4 / claude-sonnet-4"
                />
                {modelOptions.length > 0 ? (
                  <datalist id={`provider-models-${selected.id}`}>
                    {modelOptions.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold text-zinc-950">4. 凭据配置</div>
              <div className="text-sm text-zinc-500">{getProviderDrawerPathHint(selectedAuthMethod)}</div>
              <div className="space-y-3">
                {selectedAuthMethod === "oauth" ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    <div className="font-medium">先完成 OAuth 登录，剩下的交给 Hermes。</div>
                    <div className="mt-1">点下面的按钮登录，完成后再保存。</div>
                    <Button
                      className="mt-3"
                      variant="primary"
                      size="sm"
                      data-testid="provider-oauth-start"
                      disabled={oauthWorkingId === selected.id || saving}
                      onClick={() => void handleAuthenticateProvider()}
                    >
                      {oauthWorkingId === selected.id ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      {oauthWorkingId === selected.id ? "OAuth 登录中..." : "启动 OAuth 登录"}
                    </Button>
                    {!selectedOAuthReady ? <div className="mt-2 text-xs text-blue-700/80">先完成登录，保存按钮才会亮起。</div> : null}
                  </div>
                ) : null}

                {selectedRequiresEndpoint ? (
                  <>
                    <div className={readonlyFieldClassName}>
                      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">服务地址（必填）</div>
                      <input
                        data-testid="provider-base-url-input"
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                        value={formState.baseUrl}
                        onChange={(event) => {
                          clearProviderEditFeedback(selected?.id ?? null);
                          setFormState((current) => ({ ...current, baseUrl: event.target.value }));
                        }}
                        placeholder="https://example.com/v1"
                      />
                    </div>
                    <div className={readonlyFieldClassName}>
                      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">API Key（可选）</div>
                      <input
                        type="password"
                        data-testid="provider-endpoint-api-key-input"
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                        value={formState.apiKey}
                        onChange={(event) => {
                          clearProviderEditFeedback(selected?.id ?? null);
                          setFormState((current) => ({ ...current, apiKey: event.target.value }));
                        }}
                        placeholder="有 Key 就填，没有也能先保存"
                      />
                    </div>
                  </>
                ) : null}

                {selectedAuthMethod === "api-key" ? (
                  selectedEditableFields.length > 0 ? selectedEditableFields.map((field) => {
                    const kind = getFieldKind(field);
                    const stored = Boolean(field.value);
                    return (
                      <div key={field.key} className={readonlyFieldClassName}>
                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">{field.label}</div>
                        <input
                          type={kind === "password" ? "password" : "text"}
                          data-testid={`provider-env-${field.key}`}
                          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                          value={formState.env[field.key] ?? ""}
                          onChange={(event) => {
                            clearProviderEditFeedback(selected?.id ?? null);
                            setFormState((current) => ({
                              ...current,
                              env: {
                                ...current.env,
                                [field.key]: event.target.value,
                              },
                            }));
                          }}
                          placeholder={field.secret ? (stored ? "已配置，留空则保持现有值" : "把 Key 粘贴进来") : "待配置"}
                        />
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl border border-zinc-200 bg-[#faf9f6] px-4 py-3 text-sm text-zinc-600">
                      这个供应商不用手填 Key，直接按页面提示继续就行。
                    </div>
                  )
                ) : null}

                {selectedRequiresSecret && !selectedHasSecret ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    先把 Key 粘贴进来，再保存。
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
