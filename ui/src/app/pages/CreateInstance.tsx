import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Cpu, LoaderCircle, Monitor, RefreshCw, Server, Shield, TerminalSquare, XCircle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { hermesDefaultProviderId, hermesProviderOptions, hermesProviders, type HermesProviderEntry } from "../data/hermesOfficial";
import {
  createLocalDockerInstance,
  createLocalNativeInstance,
  createRemoteDockerInstance,
  type CreateLocalDockerInstancePayload,
  type CreateLocalNativeInstancePayload,
  type CreateRemoteDockerInstancePayload,
} from "../services/instances";
import { inspectLocalEnvironment, inspectRemoteEnvironment } from "../services/system";
import { buildRemoteNodeUxCopy, buildRemoteWorkflowTarget } from "../services/runtime";
import { cn } from "../lib/utils";

type TargetType = "local" | "remote" | null;
type InstallType = "docker" | "native" | null;
type RemoteAuthMode = "ssh_key" | "password";
type CheckState = "pass" | "warning" | "fail";
type DeployStageState = "pending" | "active" | "done" | "failed";
type ConnectionPreset = {
  label: string;
  host: string;
  port: string;
  user: string;
  authMode: RemoteAuthMode;
  keyPath: string;
  workdir: string;
};

function getSelectedProvider(providerId: string) {
  return hermesProviders.find((item) => item.id === providerId) ?? hermesProviders.find((item) => item.id === hermesDefaultProviderId);
}

function getProviderModelOptions(providerEntry?: HermesProviderEntry) {
  if (!providerEntry) return [{ value: "待配置", label: "待配置" }];

  const orderedModels = providerEntry.defaultModel === "待配置"
    ? []
    : [providerEntry.defaultModel, ...providerEntry.models.filter((model) => model !== providerEntry.defaultModel)];

  return (orderedModels.length > 0 ? orderedModels : [providerEntry.defaultModel]).map((model) => ({
    value: model,
    label: model,
  }));
}

function parseRemoteTargetInput(rawValue: string, fallbackPort: string) {
  const value = rawValue.trim();
  if (!value) {
    return { host: "", port: fallbackPort };
  }

  if (!value.startsWith("[") && value.includes(":")) {
    const segments = value.split(":");
    if (segments.length === 2 && /^\d+$/.test(segments[1].trim())) {
      return {
        host: segments[0].trim(),
        port: segments[1].trim() || fallbackPort,
      };
    }
  }

  return { host: value, port: fallbackPort };
}

function buildRemoteErrorOverview(detail: string) {
  const normalized = String(detail || "").trim();
  const condensed = normalized.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
  const rawCode = condensed[0] || "";
  const code = /^[A-Z0-9_]+$/.test(rawCode) ? rawCode : "";

  if (code === "SSH_PASSWORD_REJECTED") {
    return {
      title: "密码已提交但被服务器拒绝",
      action: "这说明客户端已经连到目标 SSH，并且服务器接受了密码登录流程；请重点检查用户名、密码是否正确，或确认该账号是否已锁定/已改密。",
      code,
      detail: normalized,
    };
  }

  if (code === "SSH_PASSWORD_DISABLED") {
    return {
      title: "服务器未开放密码登录",
      action: "目标主机当前更像只接受 SSH 私钥登录。请切换到 SSH 私钥方式，或在服务器端开启 PasswordAuthentication 后再试。",
      code,
      detail: normalized,
    };
  }

  if (code === "SSH_AUTH_FAILED" || /认证失败|password|passphrase|verification code|access denied/i.test(normalized)) {
    return {
      title: "SSH 认证失败",
      action: "请检查用户名、密码是否正确；如果服务器开启了验证码/二次认证，请改用 SSH 私钥方式。",
      code,
      detail: normalized,
    };
  }

  if (code === "SSH_TIMEOUT" || /timed out|超时/i.test(normalized)) {
    return {
      title: "SSH 连接超时",
      action: "请检查目标主机是否在线、22 端口是否可达，以及服务器是否在等待额外认证交互。",
      code,
      detail: normalized,
    };
  }

  if (/解析远程主机|Could not resolve hostname|nodename nor servname/i.test(normalized)) {
    return {
      title: "远程主机无法解析",
      action: "请确认主机名或 IP 是否填写正确，端口请单独填写到端口输入框。",
      code,
      detail: normalized,
    };
  }

  return {
    title: "远程环境读取失败",
    action: "请根据下方原始错误检查 SSH、认证方式与远程环境状态。",
    code,
    detail: normalized,
  };
}

function normalizeRemoteHomeDir(input?: string) {
  const value = String(input || "").trim();
  if (!value || value === "/" || value === ".") return "";
  return value.replace(/\/+$/, "");
}

function getSuggestedRemoteWorkdir(inspection: HermesRemoteEnvironmentInspection | null) {
  if (!inspection || inspection.directory.writable) return "";

  const homeDir = normalizeRemoteHomeDir(inspection.system.homeDir);
  const currentWorkdir = String(inspection.workdir || "").trim();

  if (homeDir && currentWorkdir && currentWorkdir.startsWith(homeDir)) {
    return currentWorkdir;
  }

  if (homeDir) {
    return `${homeDir}/hermes`;
  }

  const user = String(inspection.system.remoteUser || inspection.user || "").trim();
  if (user) {
    return `/home/${user}/hermes`;
  }

  return "";
}

const steps = ["选择目标", "环境检查", "部署方式", "提供商与档案（可跳过）", "确认部署"];
const savedRemoteConnections: ConnectionPreset[] = [
  {
    label: "生产网关节点",
    host: "10.0.1.24",
    port: "22",
    user: "root",
    authMode: "ssh_key",
    keyPath: "~/.ssh/id_rsa",
    workdir: "/opt/hermes",
  },
  {
    label: "研发跳板机",
    host: "192.168.31.16",
    port: "2222",
    user: "deploy",
    authMode: "ssh_key",
    keyPath: "~/.ssh/hermes-dev",
    workdir: "/srv/hermes",
  },
];

function getPlatformLabel(platform?: string) {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  return "macOS";
}

function compactHermesVersion(version?: string) {
  return String(version || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/\s+Project:\s.*$/i, "")
    .trim() ?? "";
}

function getLocalRuntimeSummary(inspection: HermesLocalEnvironmentInspection | null, installType: InstallType) {
  if (!inspection) return "正在读取桌面环境";

  if (installType === "native") {
    const version = compactHermesVersion(inspection.hermes.version);
    return inspection.hermes.available
      ? `Hermes CLI 已就绪${version ? ` · ${version}` : ""}`
      : "Hermes CLI 未就绪，需先安装 Hermes";
  }

  if (inspection.docker.daemonRunning) return "运行服务已就绪";
  if (inspection.docker.available) return "运行服务未启动";
  return "运行服务未就绪";
}

function getLocalEnvironmentAnnouncement(inspection: HermesLocalEnvironmentInspection, installType: InstallType) {
  return installType === "native" ? inspection.hermes.detail : inspection.docker.detail;
}

function getDeploymentMethodLabel(targetType: TargetType) {
  return targetType === "remote" ? "服务器部署" : "本机安装";
}

function getRemoteServiceSummary(inspection: HermesRemoteEnvironmentInspection | null, loading: boolean, error: string | null) {
  if (!inspection) return loading ? "正在确认服务器运行服务。" : error ?? "需先读取服务器环境。";
  if (inspection.docker.daemonRunning) return "运行服务已就绪。";
  if (inspection.docker.available) return "运行服务未启动，请修复服务器环境。";
  return "运行服务不可用，请查看技术详情。";
}

function getDeployStageRows({
  targetType,
  isLocalNativeDeploy,
  nativeWillInstallHermes,
  showProgressStages,
  deployProgressEvents,
  deployError,
}: {
  targetType: TargetType;
  isLocalNativeDeploy: boolean;
  nativeWillInstallHermes: boolean;
  showProgressStages: boolean;
  deployProgressEvents: HermesNativeInstallProgressEvent[];
  deployError: HermesDesktopError | null;
}) {
  const latestProgress = deployProgressEvents.at(-1);
  const isLocalDockerDeploy = targetType === "local" && !nativeWillInstallHermes && !isLocalNativeDeploy;
  const baseRows = targetType === "remote"
    ? ["连接服务器", "准备工作目录", "启动网关服务", "写入实例注册"]
    : nativeWillInstallHermes
      ? ["准备本机环境", "安装 Hermes CLI", "初始化实例目录", "启动 Hermes Gateway"]
      : isLocalNativeDeploy
        ? ["准备本机环境", "初始化实例目录", "启动 Hermes Gateway", "写入实例注册"]
        : ["准备本机环境", "准备运行服务", "启动网关服务", "写入实例注册"];

  const hasInstallProgress = showProgressStages && Boolean(latestProgress);
  const installDone = latestProgress?.stage === "done";
  const failed = Boolean(deployError || latestProgress?.stage === "failed");
  const activeIndex = hasInstallProgress
    ? (
      isLocalDockerDeploy
        ? installDone
          ? 3
          : latestProgress?.stage === "docker-container"
            ? 2
            : latestProgress?.stage === "docker-image-inspect" || latestProgress?.stage === "docker-image-pull"
              ? 1
              : 0
        : installDone
          ? 2
          : 1
    )
    : 0;

  return baseRows.map((label, index) => {
    let state: DeployStageState = "pending";

    if (failed && index === activeIndex) {
      state = "failed";
    } else if (index < activeIndex || (installDone && index === 1)) {
      state = "done";
    } else if (index === activeIndex) {
      state = "active";
    }

    return {
      label,
      state,
    };
  });
}

export function CreateInstance() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get("type") === "remote" ? "remote" : "local";
  const defaultProvider = hermesDefaultProviderId;
  const [step, setStep] = useState(1);
  const [targetType, setTargetType] = useState<TargetType>(initialType);
  const [installType, setInstallType] = useState<InstallType>(() => initialType === "remote" ? "docker" : "native");
  const [provider, setProvider] = useState(defaultProvider);
  const [model, setModel] = useState(() => getSelectedProvider(defaultProvider)?.defaultModel ?? "待配置");
  const [profileName, setProfileName] = useState("默认档案");
  const [providerSetupDeferred, setProviderSetupDeferred] = useState(true);
  const [instanceName, setInstanceName] = useState(initialType === "remote" ? "远程网关节点" : "本地创作环境");
  const [remoteHost, setRemoteHost] = useState("10.0.1.24");
  const [remotePort, setRemotePort] = useState("22");
  const [remoteUser, setRemoteUser] = useState("root");
  const [remoteAuthMode, setRemoteAuthMode] = useState<RemoteAuthMode>("ssh_key");
  const [remoteKeyPath, setRemoteKeyPath] = useState("");
  const [remotePassword, setRemotePassword] = useState("");
  const [remoteWorkdir, setRemoteWorkdir] = useState("/opt/hermes");
  const [remoteEnvironmentInspection, setRemoteEnvironmentInspection] = useState<HermesRemoteEnvironmentInspection | null>(null);
  const [isInspectingRemoteEnvironment, setIsInspectingRemoteEnvironment] = useState(false);
  const [remoteEnvironmentError, setRemoteEnvironmentError] = useState<string | null>(null);
  const [localEnvironmentInspection, setLocalEnvironmentInspection] = useState<HermesLocalEnvironmentInspection | null>(null);
  const [isInspectingLocalEnvironment, setIsInspectingLocalEnvironment] = useState(false);
  const [localEnvironmentError, setLocalEnvironmentError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLocalEnvironmentDetails, setShowLocalEnvironmentDetails] = useState(false);
  const [showRemoteAdvancedSettings, setShowRemoteAdvancedSettings] = useState(false);
  const [showRemoteConnectionPresets, setShowRemoteConnectionPresets] = useState(false);
  const [environmentHint, setEnvironmentHint] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<HermesDesktopError | null>(null);
  const [deployResult, setDeployResult] = useState<(CreateLocalDockerInstancePayload | CreateLocalNativeInstancePayload | CreateRemoteDockerInstancePayload) | null>(null);
  const [deployProgressEvents, setDeployProgressEvents] = useState<HermesNativeInstallProgressEvent[]>([]);
  const [showDeployTechnicalDetails, setShowDeployTechnicalDetails] = useState(false);
  const deployOperationIdRef = useRef<string | null>(null);
  const selectedProvider = useMemo(() => getSelectedProvider(provider), [provider]);
  const providerLabel = selectedProvider?.name ?? provider;
  const providerModelOptions = useMemo(() => getProviderModelOptions(selectedProvider), [selectedProvider]);
  const effectiveProviderId = providerSetupDeferred ? undefined : provider;
  const effectiveModel = providerSetupDeferred ? undefined : model;
  const effectiveProfileName = providerSetupDeferred ? undefined : profileName.trim();
  const deploySuccess = Boolean(deployResult && !deployError);
  const remoteSuccessUx = useMemo(() => buildRemoteNodeUxCopy("create-success", "new-remote-instance"), []);
  const localEnvironmentLoaded = Boolean(localEnvironmentInspection);
  const remoteEnvironmentLoaded = Boolean(remoteEnvironmentInspection);
  const canDeployCurrentSelection = (
    targetType === "local" &&
    ((installType === "docker" && Boolean(localEnvironmentInspection?.docker.daemonRunning)) || (installType === "native" && Boolean(localEnvironmentInspection)))
  ) || (
    targetType === "remote" &&
    installType === "docker" &&
    Boolean(remoteEnvironmentInspection?.docker.daemonRunning)
  );
  const deployUnavailableReason = useMemo(() => {
    if (canDeployCurrentSelection) return null;

    if (targetType === "local" && installType === "docker") {
      if (!localEnvironmentInspection) {
        return {
          code: "LOCAL_ENV_REQUIRED",
          label: "先读取本机环境",
          message: "本地环境尚未读取。",
          detail: localEnvironmentError ?? "请返回环境检查并点击“重试检查”。",
        };
      }

      if (!localEnvironmentInspection.docker.available) {
        return {
          code: "LOCAL_DOCKER_MISSING",
          label: "运行服务未就绪",
          message: "本机运行服务不可用。",
          detail: localEnvironmentInspection.docker.detail,
        };
      }

      if (!localEnvironmentInspection.docker.daemonRunning) {
        return {
          code: "LOCAL_DOCKER_DAEMON_STOPPED",
          label: "运行服务未启动",
          message: "本机运行服务未启动。",
          detail: localEnvironmentInspection.docker.detail,
        };
      }
    }

    if (targetType === "local" && installType === "native") {
      return {
        code: "LOCAL_ENV_REQUIRED",
        label: "先读取本机环境",
        message: "本机安装需要可用的环境信息。",
        detail: localEnvironmentError ?? "请返回环境检查并点击“重试检查”。",
      };
    }

    if (targetType === "remote") {
      return {
        code: "REMOTE_DOCKER_NOT_READY",
        label: "运行服务未就绪",
        message: "服务器运行服务暂不可用。",
        detail: remoteEnvironmentInspection?.docker.detail ?? remoteEnvironmentError ?? "请先完成服务器环境读取，并确认运行服务可用。",
      };
    }

    return {
      code: "PHASE1_PATH_UNSUPPORTED",
      label: "当前部署路径不可用",
      message: "当前部署路径暂不可用。",
      detail: "请选择可用的部署目标和安装方式后重试。",
    };
  }, [
    canDeployCurrentSelection,
    installType,
    localEnvironmentError,
    localEnvironmentInspection,
    remoteAuthMode,
    remoteEnvironmentError,
    remoteEnvironmentInspection,
    targetType,
  ]);

  useEffect(() => {
    const nextModel = selectedProvider?.defaultModel ?? "待配置";
    setModel(nextModel);
  }, [selectedProvider]);

  useEffect(() => {
    const subscribe = window.hermesDesktop?.onInstallProgress ?? window.hermesDesktop?.onNativeInstallProgress;
    if (!subscribe) return undefined;

    return subscribe((event) => {
      const activeOperationId = deployOperationIdRef.current;
      if (event.operationId && activeOperationId && event.operationId !== activeOperationId) return;

      setDeployProgressEvents((items) => [...items, event].slice(-80));
    });
  }, []);

  const loadLocalEnvironment = async (announce = false) => {
    setIsInspectingLocalEnvironment(true);
    setLocalEnvironmentError(null);

    try {
      const inspection = await inspectLocalEnvironment();
      setLocalEnvironmentInspection(inspection);

      if (announce) {
        setEnvironmentHint(`已重新读取本地环境：${getLocalEnvironmentAnnouncement(inspection, installType)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取本地环境失败。";
      setLocalEnvironmentInspection(null);
      setLocalEnvironmentError(message);

      if (announce) {
        setEnvironmentHint(message);
      }
    } finally {
      setIsInspectingLocalEnvironment(false);
    }
  };

  useEffect(() => {
    if (targetType === "local") {
      void loadLocalEnvironment();
    }
  }, [targetType]);

  useEffect(() => {
    if (remoteKeyPath.trim()) return;
    let cancelled = false;
    void (async () => {
      const suggestedKeyPath = await window.hermesDesktop?.suggestLocalSshKeyPath?.() ?? "";
      if (!cancelled && String(suggestedKeyPath).trim()) {
        setRemoteKeyPath(String(suggestedKeyPath).trim());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [remoteKeyPath]);

  const resetRemoteEnvironmentState = () => {
    setRemoteEnvironmentInspection(null);
    setRemoteEnvironmentError(null);
  };

  const loadRemoteEnvironment = async () => {
    setIsInspectingRemoteEnvironment(true);
    setRemoteEnvironmentError(null);

    try {
      const normalizedTarget = parseRemoteTargetInput(remoteHost, remotePort.trim() || "22");
      if (normalizedTarget.host !== remoteHost || normalizedTarget.port !== remotePort) {
        setRemoteHost(normalizedTarget.host);
        setRemotePort(normalizedTarget.port);
      }

      const inspection = await inspectRemoteEnvironment({
        host: normalizedTarget.host,
        port: normalizedTarget.port,
        user: remoteUser.trim(),
        authMode: remoteAuthMode,
        keyPath: remoteAuthMode === "ssh_key" ? remoteKeyPath.trim() : undefined,
        password: remoteAuthMode === "password" ? remotePassword : undefined,
        workdir: remoteWorkdir.trim(),
      });
      setRemoteEnvironmentInspection(inspection);
      setEnvironmentHint(
        inspection.warning?.trim()
          ? inspection.warning
          : `已读取 ${inspection.user}@${inspection.host}:${inspection.port} 的真实远程环境。`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取远程环境失败。";
      setRemoteEnvironmentInspection(null);
      setRemoteEnvironmentError(message);
      setEnvironmentHint(message);
    } finally {
      setIsInspectingRemoteEnvironment(false);
    }
  };

  const localEnvironmentSummary = useMemo(() => {
    const desktopBridge = typeof window === "undefined" ? undefined : window.hermesDesktop;
    const fallbackPlatform = typeof navigator === "undefined" ? "macOS" : navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Mac") ? "macOS" : "Linux";
    const platform = localEnvironmentInspection?.platform
      ? getPlatformLabel(localEnvironmentInspection.platform)
      : desktopBridge?.platform
        ? getPlatformLabel(desktopBridge.platform)
        : fallbackPlatform;
    const shell = desktopBridge?.shell ? "Electron 桌面客户端" : "浏览器预览环境";
    const workspace = localEnvironmentInspection?.instancesRoot ?? (desktopBridge?.homeDirectory ? `${desktopBridge.homeDirectory}/HermesOS/instances` : "~/HermesOS/instances");
    const hostname = localEnvironmentInspection?.hostname ?? desktopBridge?.hostname ?? "当前设备";
    const runtime = getLocalRuntimeSummary(localEnvironmentInspection, installType);

    return {
      platform,
      shell,
      workspace,
      hostname,
      runtime,
    };
  }, [installType, localEnvironmentInspection]);

  const hasRemoteTarget = remoteHost.trim() && remoteUser.trim();
  const hasRemoteAuth = remoteAuthMode === "ssh_key" ? remoteKeyPath.trim() : remotePassword.trim();
  const canReadRemoteEnvironment = Boolean(hasRemoteTarget && hasRemoteAuth);

  const checks = useMemo(() => {
    if (targetType === "local") {
      const methodChecks = installType === "native"
        ? [
            {
              name: "Hermes CLI",
              state: localEnvironmentInspection
                ? localEnvironmentInspection.hermes.available
                  ? ("pass" as CheckState)
                  : ("warning" as CheckState)
                : ("warning" as CheckState),
              desc: localEnvironmentInspection
                ? localEnvironmentInspection.hermes.available
                  ? localEnvironmentInspection.hermes.detail
                  : `${localEnvironmentInspection.hermes.detail} 可在最终确认时执行官方安装器。`
                : isInspectingLocalEnvironment
                  ? "正在读取 Hermes CLI 状态。"
                  : localEnvironmentError ?? "尚未读取本地 Hermes 环境。",
              action: "重试检查",
            },
          ]
        : [
            {
              name: "运行服务",
              state: localEnvironmentInspection
                ? localEnvironmentInspection.docker.daemonRunning
                  ? ("pass" as CheckState)
                  : ("fail" as CheckState)
                : ("warning" as CheckState),
              desc: localEnvironmentInspection
                ? localEnvironmentInspection.docker.detail
                : isInspectingLocalEnvironment
                  ? "正在确认运行服务。"
                  : localEnvironmentError ?? "尚未读取运行环境。",
              action: "重试检查",
            },
          ];

      return [
        {
          name: "操作系统",
          state: "pass" as CheckState,
          desc: `${localEnvironmentSummary.platform} 可运行桌面控制台。`,
        },
        ...methodChecks,
        {
          name: "实例根目录",
          state: "pass" as CheckState,
          desc: `${localEnvironmentSummary.workspace} 将作为本地多实例根目录。`,
        },
        {
          name: "本地安全模式",
          state: "pass" as CheckState,
          desc: "本地实例默认只绑定到 127.0.0.1。",
        },
      ];
    }

    return [
      {
        name: "SSH 连通性",
        state: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.ssh.reachable
            ? ("pass" as CheckState)
            : ("fail" as CheckState)
          : isInspectingRemoteEnvironment
            ? ("warning" as CheckState)
            : ("fail" as CheckState),
        desc: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.ssh.detail
          : isInspectingRemoteEnvironment
            ? "正在建立 SSH 连接并读取远程环境。"
            : remoteEnvironmentError ?? "先补全主机、用户和认证信息，然后读取远程环境。",
        action: remoteEnvironmentInspection ? undefined : "读取环境",
      },
      {
        name: "用户权限",
        state: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.directory.writable
            ? ("pass" as CheckState)
            : ("fail" as CheckState)
          : ("fail" as CheckState),
        desc: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.directory.detail
          : "未建立连接，无法确认目录权限。",
      },
      {
        name: "运行服务",
        state: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.docker.daemonRunning
            ? ("pass" as CheckState)
            : remoteEnvironmentInspection.docker.available
              ? ("warning" as CheckState)
              : ("fail" as CheckState)
          : ("fail" as CheckState),
        desc: getRemoteServiceSummary(remoteEnvironmentInspection, isInspectingRemoteEnvironment, remoteEnvironmentError),
        action: remoteEnvironmentInspection && remoteEnvironmentInspection.docker.available && !remoteEnvironmentInspection.docker.daemonRunning ? "修复建议" : remoteEnvironmentInspection ? undefined : "读取环境",
      },
      {
        name: "磁盘空间",
        state: remoteEnvironmentInspection
          ? typeof remoteEnvironmentInspection.disk.availableGb === "number"
            ? remoteEnvironmentInspection.disk.availableGb >= 5
              ? ("pass" as CheckState)
              : ("warning" as CheckState)
            : ("warning" as CheckState)
          : ("fail" as CheckState),
        desc: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.disk.detail
          : "需先读取远程环境。",
      },
      {
        name: "端口冲突",
        state: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.port.available === true
            ? remoteEnvironmentInspection.port.autoSelected
              ? ("warning" as CheckState)
              : ("pass" as CheckState)
            : remoteEnvironmentInspection.port.available === false
              ? ("fail" as CheckState)
              : ("warning" as CheckState)
          : ("fail" as CheckState),
        desc: remoteEnvironmentInspection
          ? remoteEnvironmentInspection.port.detail
          : "需先读取远程环境。",
      },
    ];
  }, [
    canReadRemoteEnvironment,
    hasRemoteAuth,
    hasRemoteTarget,
    isInspectingLocalEnvironment,
    isInspectingRemoteEnvironment,
    localEnvironmentError,
    localEnvironmentInspection,
    localEnvironmentSummary,
    remoteEnvironmentError,
    remoteEnvironmentInspection,
    installType,
    targetType,
  ]);

  const hasCheckIssues = useMemo(() => checks.some((check) => check.state !== "pass"), [checks]);
  const visibleChecks = checks.filter((check) => check.state !== "pass");
  const shouldShowRiskCard = useMemo(() => checks.some((check) => check.state === "fail") || (targetType === "remote" && checks.some((check) => check.state === "warning")), [checks, targetType]);
  const remoteErrorOverview = useMemo(() => {
    if (targetType !== "remote" || !remoteEnvironmentError) return null;
    const overview = buildRemoteErrorOverview(remoteEnvironmentError);
    return {
      ...overview,
      failedCount: visibleChecks.filter((check) => check.state === "fail").length,
      warningCount: visibleChecks.filter((check) => check.state === "warning").length,
    };
  }, [remoteEnvironmentError, targetType, visibleChecks]);
  const suggestedRemoteWorkdir = useMemo(() => getSuggestedRemoteWorkdir(remoteEnvironmentInspection), [remoteEnvironmentInspection]);

  const canProceedToNextStep = useMemo(() => {
    if (step === 1) return Boolean(targetType);
    if (step === 2) {
      if (targetType === "local") return true;
      return canReadRemoteEnvironment && remoteEnvironmentLoaded;
    }
    if (step === 4) {
      if (providerSetupDeferred) {
        return Boolean(instanceName.trim());
      }

      const providerReady = selectedProvider?.status === "已连接" && selectedProvider?.defaultModel !== "待配置" && model !== "待配置";
      return Boolean(instanceName.trim() && profileName.trim() && providerReady);
    }
    return true;
  }, [canReadRemoteEnvironment, instanceName, model, profileName, providerSetupDeferred, remoteEnvironmentLoaded, selectedProvider, step, targetType]);

  const nextStepHint = useMemo(() => {
    if (step === 2 && targetType === "remote" && !canReadRemoteEnvironment) {
      return "先填写远程主机、用户名和认证方式，才能读取服务器环境。";
    }

    if (step === 2 && targetType === "remote" && remoteEnvironmentError) {
      return remoteEnvironmentError;
    }

    if (step === 2 && targetType === "remote" && !remoteEnvironmentLoaded) {
      return "先完成一次远程环境读取，确认 SSH、磁盘和端口状态后再继续。";
    }

    if (step === 4 && providerSetupDeferred) {
      return "安装会先完成实例部署；AI 提供商和默认档案可在工作区继续配置。";
    }

    if (step === 4 && selectedProvider?.status === "未完成") {
      return "当前 provider 未完成，不能继续。";
    }

    if (step === 4 && selectedProvider?.defaultModel === "待配置") {
      return "当前 provider 还没有默认模型。";
    }

    if (step === 4 && (!instanceName.trim() || !profileName.trim())) {
      return "实例名称和默认档案名称不能为空。";
    }

    if (step === 5 && targetType === "remote" && !remoteEnvironmentLoaded) {
      return "远程部署前需先完成一次真实环境读取。";
    }

    if (step === 5 && targetType === "remote" && installType === "native") {
      return "服务器部署入口暂不支持本机安装方式，请返回选择目标。";
    }

    if (step === 5 && targetType === "local" && installType === "native" && localEnvironmentInspection && !localEnvironmentInspection.hermes.available) {
      return "本机未发现 Hermes CLI；点击“安装 Hermes 并创建实例”会执行官方安装器。";
    }

    if (step === 5 && targetType === "local" && installType === "docker" && localEnvironmentInspection && !localEnvironmentInspection.docker.daemonRunning) {
      return localEnvironmentInspection.docker.detail;
    }

    if (step === 5 && targetType === "remote" && remoteEnvironmentInspection && !remoteEnvironmentInspection.docker.daemonRunning) {
      return remoteEnvironmentInspection.docker.detail;
    }

    if (step === 5 && !canDeployCurrentSelection) {
      return "当前可用路径：本机安装或服务器部署。";
    }

    return null;
  }, [
    canDeployCurrentSelection,
    canReadRemoteEnvironment,
    instanceName,
    installType,
    localEnvironmentInspection,
    profileName,
    providerSetupDeferred,
    remoteAuthMode,
    remoteEnvironmentInspection,
    remoteEnvironmentLoaded,
    selectedProvider,
    step,
    targetType,
  ]);

  const summaryRows = [
    { label: "实例名称", value: instanceName },
    { label: "目标类型", value: targetType === "local" ? "本地实例" : "远程实例" },
    { label: targetType === "local" ? "当前环境" : "远程目标", value: targetType === "local" ? `${localEnvironmentSummary.platform} · ${localEnvironmentSummary.shell}` : `${remoteUser}@${remoteHost}:${remotePort}` },
    { label: "部署方式", value: getDeploymentMethodLabel(targetType) },
    { label: "提供商", value: providerSetupDeferred ? "安装后配置" : providerLabel },
    { label: "默认模型", value: providerSetupDeferred ? "安装后配置" : model },
    { label: "默认档案", value: providerSetupDeferred ? "安装后配置" : profileName },
    { label: targetType === "local" ? "工作目录" : "远程目录", value: targetType === "local" ? localEnvironmentSummary.workspace : remoteWorkdir },
  ];

  const handleNext = () => setStep((current) => Math.min(current + 1, 5));
  const handlePrev = () => setStep((current) => Math.max(current - 1, 1));
  const importConnectionPreset = (preset: ConnectionPreset) => {
    setRemoteHost(preset.host);
    setRemotePort(preset.port);
    setRemoteUser(preset.user);
    setRemoteAuthMode(preset.authMode);
    setRemoteKeyPath(preset.keyPath);
    setRemotePassword("");
    setRemoteWorkdir(preset.workdir);
    resetRemoteEnvironmentState();
    setShowRemoteConnectionPresets(false);
    setEnvironmentHint(`已导入历史连接“${preset.label}”，下一步可直接读取远程环境。`);
  };

  const handleCheckAction = (action: string) => {
    if (action === "重试检查") {
      void loadLocalEnvironment(true);
      return;
    }

    if (action === "读取环境") {
      if (!canReadRemoteEnvironment) return;
      void loadRemoteEnvironment();
      return;
    }

    if (action === "修复建议") {
      if (remoteEnvironmentInspection?.docker.available && !remoteEnvironmentInspection.docker.daemonRunning) {
        if (/无权访问 Docker daemon/.test(remoteEnvironmentInspection.docker.detail)) {
          setEnvironmentHint("当前 SSH 已通，但该账号没有运行服务权限。请换有权限的账号，或修复服务器运行环境。");
          return;
        }
        setEnvironmentHint("建议先启动或修复服务器运行服务。");
        return;
      }

      if (remoteEnvironmentInspection && !remoteEnvironmentInspection.directory.writable) {
        if (/远程目录不存在/.test(remoteEnvironmentInspection.directory.detail) && suggestedRemoteWorkdir) {
          setEnvironmentHint(`当前目录不可直接使用，建议改为 ${suggestedRemoteWorkdir} 后重新读取环境。`);
          return;
        }
        setEnvironmentHint("请改用当前用户可写的目录，例如 home 目录下的 hermes 工作目录。");
        return;
      }

      setEnvironmentHint("建议先修复远程目录或运行服务权限后再继续。");
    }
  };

  const isCheckActionPending = (action: string) => {
    if (action === "重试检查") return isInspectingLocalEnvironment;
    if (action === "读取环境") return isInspectingRemoteEnvironment;
    return false;
  };

  const startDeploy = async () => {
    setDeployError(null);
    setDeployResult(null);
    setDeployProgressEvents([]);
    setShowDeployTechnicalDetails(false);
    deployOperationIdRef.current = null;

    if (!canDeployCurrentSelection) {
      setDeployError({
        code: deployUnavailableReason?.code ?? "PHASE1_PATH_UNSUPPORTED",
        message: deployUnavailableReason?.message ?? "当前部署路径暂不可用。",
        detail: deployUnavailableReason?.detail ?? "请检查部署环境后重试。",
        recoverable: true,
      });
      return;
    }

    const deployOperationId = targetType === "local"
      ? `${installType ?? "deploy"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : undefined;

    deployOperationIdRef.current = deployOperationId ?? null;
    setIsDeploying(true);

    try {
      const result = targetType === "remote"
        ? await createRemoteDockerInstance({
            name: instanceName.trim(),
            host: remoteHost.trim(),
            port: remotePort.trim(),
            user: remoteUser.trim(),
            authMode: remoteAuthMode,
            keyPath: remoteKeyPath.trim(),
            password: remotePassword,
            workdir: (remoteEnvironmentInspection?.workdir ?? remoteWorkdir).trim(),
            providerId: effectiveProviderId,
            model: effectiveModel,
            defaultProfile: effectiveProfileName,
          })
        : installType === "native"
          ? await createLocalNativeInstance({
              name: instanceName.trim(),
              instancesRoot: localEnvironmentInspection?.instancesRoot,
              providerId: effectiveProviderId,
              model: effectiveModel,
              defaultProfile: effectiveProfileName,
              installHermesIfMissing: targetType === "local" && installType === "native" && !localEnvironmentInspection?.hermes.available,
              operationId: deployOperationId,
            })
        : await createLocalDockerInstance({
            name: instanceName.trim(),
            instancesRoot: localEnvironmentInspection?.instancesRoot,
            providerId: effectiveProviderId,
            model: effectiveModel,
            defaultProfile: effectiveProfileName,
            operationId: deployOperationId,
          });

      setDeployResult(result.data ?? null);

      if (!result.ok || !result.data) {
        setDeployError(result.error ?? {
          code: targetType === "remote" ? "REMOTE_DOCKER_CREATE_FAILED" : installType === "native" ? "LOCAL_NATIVE_CREATE_FAILED" : "LOCAL_DOCKER_CREATE_FAILED",
          message: "实例创建失败。",
          detail: "未收到创建结果。",
          recoverable: true,
        });

        if (result.data) {
          setEnvironmentHint(
            installType === "native"
              ? `实例目录已初始化到 ${result.data.workspaceDir}，修复本地网关后可在主页重试。`
              : `实例目录已初始化到 ${result.data.workspaceDir}，修复运行服务后可继续重试。`
          );
        }

        return;
      }

      setEnvironmentHint(`实例已注册到 Console：${result.data.instance.name} · ${result.data.endpoint}`);
    } catch (error) {
      setDeployError({
        code: targetType === "remote" ? "REMOTE_DOCKER_CREATE_FAILED" : installType === "native" ? "LOCAL_NATIVE_CREATE_FAILED" : "LOCAL_DOCKER_CREATE_FAILED",
        message: "实例创建失败。",
        detail: error instanceof Error ? error.message : "创建过程中发生未知错误。",
        recoverable: true,
      });
    } finally {
      deployOperationIdRef.current = null;
      setIsDeploying(false);
    }
  };

  const isLocalNativeDeploy = targetType === "local" && installType === "native";
  const nativeWillInstallHermes = isLocalNativeDeploy && !localEnvironmentInspection?.hermes.available;
  const dockerWillShowProgress = targetType === "local" && installType === "docker";
  const shouldShowInstallProgress = nativeWillInstallHermes || dockerWillShowProgress;
  const deployButtonLabel = nativeWillInstallHermes ? "安装 Hermes 并创建实例" : "开始部署";
  const installProgressEvents = deployProgressEvents.filter((event) => !event.stream);
  const rawInstallerOutputEvents = deployProgressEvents.filter((event) => event.stream);
  const deployElapsedMs = isDeploying && deployProgressEvents.length > 0
    ? Math.max(0, Date.now() - new Date(deployProgressEvents[0]?.at ?? Date.now()).getTime())
    : 0;
  const deployElapsedLabel = deployElapsedMs >= 60_000
    ? `${Math.floor(deployElapsedMs / 60_000)} 分 ${Math.floor((deployElapsedMs % 60_000) / 1_000)} 秒`
    : `${Math.floor(deployElapsedMs / 1_000)} 秒`;
  const shouldShowLongWaitHint = dockerWillShowProgress && deployElapsedMs >= 20_000;
  const deployStageRows = getDeployStageRows({
    targetType,
    isLocalNativeDeploy,
    nativeWillInstallHermes,
    showProgressStages: shouldShowInstallProgress,
    deployProgressEvents,
    deployError,
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-8 px-8 py-8">
        <div className="flex items-center justify-between rounded-3xl border border-zinc-200/80 bg-white px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <XCircle className="mr-1.5 h-4 w-4" />
              关闭
            </Button>
            <div className="h-5 w-px bg-zinc-200" />
            <div>
              <div className="text-base font-semibold text-zinc-950">创建实例</div>
            </div>
          </div>

          {!isDeploying && !deploySuccess ? (
            <div className="hidden items-center gap-2 md:flex">
              {steps.map((label, index) => {
                const number = index + 1;
                const complete = step > number;
                const current = step === number;

                return (
                  <div key={label} className="flex items-center gap-2">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", complete ? "bg-zinc-950 text-white" : current ? "border border-zinc-300 bg-white text-zinc-950" : "bg-[#f5f3ee] text-zinc-400")}>
                      {complete ? <Check className="h-4 w-4" /> : number}
                    </div>
                    {index !== steps.length - 1 ? <div className={cn("h-px w-7", complete ? "bg-zinc-950" : "bg-zinc-200")} /> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {deploySuccess ? (
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 py-10">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold text-zinc-950">实例已创建完成</h2>
            </div>

            <Card className="p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">实例名称</div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">{deployResult?.instance.name ?? instanceName}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">访问方式</div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">{deployResult?.endpoint ?? (targetType === "local" ? "127.0.0.1:8642" : `${remoteUser}@${remoteHost}:${remotePort}`)}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">实例目录</div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">{deployResult?.workspaceDir ?? localEnvironmentSummary.workspace}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                  <div className="text-xs text-zinc-400">运行载体</div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">
                    {deployResult && "containerName" in deployResult ? deployResult.containerName : deployResult && "service" in deployResult ? deployResult.service : "待创建"}
                  </div>
                </div>
              </div>
              {providerSetupDeferred && deployResult?.instance?.id ? (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-4 text-sm text-blue-950">
                  <div className="font-medium">{targetType === "remote" ? remoteSuccessUx.nextStepTitle : "下一步：配置 AI 提供商与默认档案"}</div>
                  <div className="mt-1 text-blue-900/80">
                    {targetType === "remote"
                      ? remoteSuccessUx.description
                      : "实例已经可以运行；聊天和模型调用前，再到工作区补充 Provider 凭证和默认档案即可。"}
                  </div>
                </div>
              ) : null}
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate("/")}>
                返回主页
              </Button>
              {deployResult?.instance?.id ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => navigate(
                    targetType === "remote"
                      ? buildRemoteWorkflowTarget(deployResult.instance.id, "outcome-panel")
                      : `/instance/${deployResult.instance.id}`
                  )}
                >
                  {targetType === "remote" ? remoteSuccessUx.primaryLabel : "打开工作区"}
                </Button>
              ) : null}
              {providerSetupDeferred && deployResult?.instance?.id ? (
                <Button variant="primary" size="md" className="flex-1" onClick={() => navigate(`/instance/${deployResult.instance.id}/providers`)}>
                  去配置提供商
                </Button>
              ) : (
                <Button variant="primary" size="md" className="flex-1" onClick={() => navigate(`/create?type=${targetType ?? "local"}`)}>
                  继续创建
                </Button>
              )}
            </div>
          </div>
        ) : isDeploying ? (
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-8">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">正在部署实例</h2>
            </div>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                  {targetType === "remote" ? "正在创建服务器实例" : nativeWillInstallHermes ? "正在安装 Hermes 并创建本地实例" : isLocalNativeDeploy ? "正在创建本地实例" : "正在创建本地实例"}
                </div>
                <Badge variant="outline">真实任务执行中</Badge>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                {deployStageRows.map((row, index) => (
                  <div key={row.label} className={cn("rounded-3xl border px-4 py-4", row.state === "active" ? "border-blue-200 bg-blue-50/80" : row.state === "done" ? "border-emerald-200 bg-emerald-50/70" : row.state === "failed" ? "border-red-200 bg-red-50/80" : "border-zinc-200 bg-[#faf9f6]")}>
                    <div className="flex items-center justify-between">
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold", row.state === "active" ? "bg-blue-600 text-white" : row.state === "done" ? "bg-emerald-600 text-white" : row.state === "failed" ? "bg-red-600 text-white" : "bg-white text-zinc-400")}>
                        {row.state === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </div>
                      {row.state === "active" ? <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" /> : null}
                    </div>
                    <div className="mt-3 text-sm font-medium text-zinc-950">{row.label}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.state === "done" ? "已完成" : row.state === "active" ? "处理中" : row.state === "failed" ? "需要处理" : "待执行"}
                    </div>
                  </div>
                ))}
              </div>

              {shouldShowInstallProgress ? (
                <div className="mt-5 rounded-3xl border border-zinc-200 bg-[#faf9f6] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-zinc-500">安装进度</div>
                      <div className="mt-2 text-sm font-medium text-zinc-950">
                        {installProgressEvents.at(-1)?.message ?? "等待安装器启动并回传进度"}
                      </div>
                      {installProgressEvents.at(-1)?.detail ? (
                        <div className="mt-1 max-w-[560px] truncate text-xs text-zinc-500">{installProgressEvents.at(-1)?.detail}</div>
                      ) : null}
                      {shouldShowLongWaitHint ? (
                        <div className="mt-2 text-xs text-zinc-500">
                          已等待 {deployElapsedLabel} · 首次准备运行环境可能需要几分钟，请保持客户端开启。
                        </div>
                      ) : null}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowDeployTechnicalDetails((value) => !value)}>
                      {showDeployTechnicalDetails ? "收起技术详情" : "查看技术详情"}
                      <ChevronDown className={cn("ml-1.5 h-4 w-4 transition", showDeployTechnicalDetails && "rotate-180")} />
                    </Button>
                  </div>

                  {showDeployTechnicalDetails ? (
                    <div className="mt-4 border-t border-zinc-200/70 pt-4">
                      {rawInstallerOutputEvents.length > 0 ? (
                        <>
                          <div className="text-xs font-semibold text-zinc-500">安装器原始输出 · 实时输出</div>
                          <div className="mt-3 max-h-40 overflow-hidden rounded-2xl bg-zinc-950 px-4 py-3 font-mono text-[12px] leading-6 text-zinc-100">
                            {rawInstallerOutputEvents.slice(-6).map((event, index) => (
                              <div key={`${event.stream}-${event.at}-${index}`} className={cn("truncate", event.stream === "stderr" ? "text-amber-200" : "text-zinc-100")}>
                                <span className="mr-2 text-zinc-500">[{event.stream}]</span>
                                {event.message}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-zinc-500">阶段详情</div>
                          <div className="mt-3 space-y-2">
                            {installProgressEvents.slice(-6).map((event, index) => (
                              <div key={`${event.stage}-${event.at}-${index}`} className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2">
                                <div className="text-xs font-medium text-zinc-900">{event.message}</div>
                                {event.detail ? <div className="mt-1 text-xs leading-5 text-zinc-500">{event.detail}</div> : null}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 text-sm leading-6 text-zinc-500">
                默认只展示关键阶段；遇到失败时可展开技术详情定位安装器或运行时问题。
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                <Badge variant="outline">步骤 {step} / 5</Badge>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-zinc-950">{steps[step - 1]}</h2>
            </div>

            {step === 1 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card
                  className={cn("cursor-pointer p-6 transition", targetType === "local" ? "border-zinc-950 ring-1 ring-zinc-950/10" : "hover:border-zinc-300")}
                  onClick={() => {
                    setTargetType("local");
                    setInstallType("native");
                    setInstanceName("本地创作环境");
                    resetRemoteEnvironmentState();
                    setDeployError(null);
                    setDeployResult(null);
                    setEnvironmentHint(null);
                  }}
                >
                  <Monitor className="h-8 w-8 text-zinc-700" />
                  <h3 className="mt-5 text-lg font-semibold text-zinc-950">本地实例</h3>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Badge variant="outline">macOS</Badge>
                    <Badge variant="outline">Windows WSL2</Badge>
                    <Badge variant="outline">本机安装</Badge>
                  </div>
                </Card>

                <Card
                  className={cn("cursor-pointer p-6 transition", targetType === "remote" ? "border-zinc-950 ring-1 ring-zinc-950/10" : "hover:border-zinc-300")}
                  onClick={() => {
                    setTargetType("remote");
                    setInstallType("docker");
                    setInstanceName("远程网关节点");
                    resetRemoteEnvironmentState();
                    setDeployError(null);
                    setDeployResult(null);
                    setEnvironmentHint(null);
                  }}
                >
                  <Server className="h-8 w-8 text-zinc-700" />
                  <h3 className="mt-5 text-lg font-semibold text-zinc-950">远程实例</h3>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Badge variant="outline">SSH</Badge>
                    <Badge variant="outline">Linux</Badge>
                    <Badge variant="outline">服务器部署</Badge>
                  </div>
                </Card>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                {targetType === "local" ? (
                  <Card className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-zinc-950">本机环境</div>
                          <Badge variant="outline">
                            {isInspectingLocalEnvironment ? "读取中" : localEnvironmentLoaded ? "已同步" : "待读取"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-sm text-zinc-600 sm:grid-cols-3">
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                            <div className="text-[11px] text-zinc-400">平台</div>
                            <div className="mt-1 font-medium text-zinc-950">{localEnvironmentSummary.platform}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                            <div className="text-[11px] text-zinc-400">部署方式</div>
                            <div className="mt-1 font-medium text-zinc-950">本机安装</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                            <div className="text-[11px] text-zinc-400">状态</div>
                            <div className="mt-1 font-medium text-zinc-950">{localEnvironmentSummary.runtime}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void loadLocalEnvironment(true)} disabled={isInspectingLocalEnvironment}>
                          {isInspectingLocalEnvironment ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                          重新读取
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowLocalEnvironmentDetails((value) => !value)}>
                          {showLocalEnvironmentDetails ? "收起详情" : "查看详情"}
                          <ChevronDown className={cn("ml-1.5 h-4 w-4 transition", showLocalEnvironmentDetails && "rotate-180")} />
                        </Button>
                      </div>
                    </div>

                    {showLocalEnvironmentDetails ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-zinc-200/70 pt-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                          <div className="text-[11px] text-zinc-400">当前设备</div>
                          <div className="mt-1 text-sm font-medium text-zinc-950">{localEnvironmentSummary.hostname}</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                          <div className="text-[11px] text-zinc-400">部署方式</div>
                          <div className="mt-1 text-sm font-medium text-zinc-950">本机安装</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                          <div className="text-[11px] text-zinc-400">Hermes CLI</div>
                          <div className="mt-1 text-sm font-medium text-zinc-950">
                            {installType === "native"
                              ? compactHermesVersion(localEnvironmentInspection?.hermes.version) || localEnvironmentError || "读取中"
                              : localEnvironmentSummary.runtime}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                          <div className="text-[11px] text-zinc-400">实例根目录</div>
                          <div className="mt-1 text-sm font-medium text-zinc-950">{localEnvironmentSummary.workspace}</div>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                ) : (
                  <Card className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-zinc-950">远程连接</div>
                          <Badge variant="outline">{isInspectingRemoteEnvironment ? "读取中" : remoteEnvironmentLoaded ? "已读取环境" : "待读取环境"}</Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-sm text-zinc-600 sm:grid-cols-3">
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                            <div className="text-[11px] text-zinc-400">目标</div>
                            <div className="mt-1 font-medium text-zinc-950">{remoteEnvironmentInspection ? `${remoteEnvironmentInspection.user}@${remoteEnvironmentInspection.system.hostname}` : canReadRemoteEnvironment ? `${remoteUser}@${remoteHost}` : "补全连接信息"}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                            <div className="text-[11px] text-zinc-400">端口</div>
                            <div className="mt-1 font-medium text-zinc-950">{remotePort}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                            <div className="text-[11px] text-zinc-400">状态</div>
                            <div className="mt-1 font-medium text-zinc-950">{remoteEnvironmentLoaded ? "环境已读取" : "待读取"}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowRemoteConnectionPresets((value) => !value)}>
                          {showRemoteConnectionPresets ? "收起历史" : "历史连接"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowRemoteAdvancedSettings((value) => !value)}>
                          {showRemoteAdvancedSettings ? "收起设置" : "更多设置"}
                          <ChevronDown className={cn("ml-1.5 h-4 w-4 transition", showRemoteAdvancedSettings && "rotate-180")} />
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckAction("读取环境")}
                          disabled={!canReadRemoteEnvironment || isInspectingRemoteEnvironment}
                        >
                          {isInspectingRemoteEnvironment ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                          {isInspectingRemoteEnvironment ? "读取中..." : "读取环境"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="xl:col-span-2">
                        <label className="mb-2 block text-xs font-medium text-zinc-500">远程主机 / IP</label>
                        <input className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={remoteHost} onChange={(event) => {
                          const next = parseRemoteTargetInput(event.target.value, remotePort);
                          setRemoteHost(next.host);
                          if (next.port !== remotePort) {
                            setRemotePort(next.port);
                          }
                          resetRemoteEnvironmentState();
                        }} />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-zinc-500">SSH 端口</label>
                        <input className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={remotePort} onChange={(event) => {
                          setRemotePort(event.target.value);
                          resetRemoteEnvironmentState();
                        }} />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-zinc-500">用户名</label>
                        <input className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={remoteUser} onChange={(event) => {
                          setRemoteUser(event.target.value);
                          resetRemoteEnvironmentState();
                        }} />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-zinc-500">认证方式</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className={cn("rounded-xl border px-3 py-2.5 text-sm transition", remoteAuthMode === "ssh_key" ? "border-zinc-950 bg-white text-zinc-950 ring-1 ring-zinc-950/10" : "border-zinc-200 bg-[#faf9f6] text-zinc-600")}
                            onClick={() => {
                              setRemoteAuthMode("ssh_key");
                              resetRemoteEnvironmentState();
                            }}
                          >
                            SSH 私钥
                          </button>
                          <button
                            className={cn("rounded-xl border px-3 py-2.5 text-sm transition", remoteAuthMode === "password" ? "border-zinc-950 bg-white text-zinc-950 ring-1 ring-zinc-950/10" : "border-zinc-200 bg-[#faf9f6] text-zinc-600")}
                            onClick={() => {
                              setRemoteAuthMode("password");
                              resetRemoteEnvironmentState();
                            }}
                          >
                            密码
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-2 xl:col-span-3">
                        <label className="mb-2 block text-xs font-medium text-zinc-500">{remoteAuthMode === "ssh_key" ? "私钥路径" : "SSH 密码"}</label>
                        {remoteAuthMode === "ssh_key" ? (
                          <input className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={remoteKeyPath} onChange={(event) => {
                            setRemoteKeyPath(event.target.value);
                            resetRemoteEnvironmentState();
                          }} />
                        ) : (
                          <input type="password" className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={remotePassword} onChange={(event) => {
                            setRemotePassword(event.target.value);
                            resetRemoteEnvironmentState();
                          }} placeholder="输入远程用户密码" />
                        )}
                      </div>
                    </div>

                    {showRemoteAdvancedSettings ? (
                      <div className="mt-4 border-t border-zinc-200/70 pt-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-xs font-medium text-zinc-500">远程工作目录</label>
                            <input className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={remoteEnvironmentInspection?.workdir ?? remoteWorkdir} onChange={(event) => {
                              setRemoteWorkdir(event.target.value);
                              resetRemoteEnvironmentState();
                            }} />
                          </div>
                          <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                            <div className="text-[11px] text-zinc-400">读取范围</div>
                            <div className="mt-1 text-sm font-medium text-zinc-950">系统、磁盘、端口、目录权限、运行服务</div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {remoteEnvironmentInspection && !remoteEnvironmentInspection.directory.writable && suggestedRemoteWorkdir ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-amber-950">建议目录</div>
                            <div className="mt-1 text-sm text-amber-900">
                              当前远程目录不可用，建议改为 <span className="font-medium">{suggestedRemoteWorkdir}</span>，更适合普通用户直接部署。
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setRemoteWorkdir(suggestedRemoteWorkdir);
                              setShowRemoteAdvancedSettings(true);
                              resetRemoteEnvironmentState();
                              setEnvironmentHint(`已切换为建议目录 ${suggestedRemoteWorkdir}，请重新读取远程环境。`);
                            }}
                          >
                            改为建议目录
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {showRemoteConnectionPresets ? (
                      <div className="mt-4 border-t border-zinc-200/70 pt-4">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {savedRemoteConnections.map((preset) => (
                            <button
                              key={preset.label}
                              className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3 text-left transition hover:border-zinc-300"
                              onClick={() => importConnectionPreset(preset)}
                            >
                              <div>
                                <div className="text-sm font-medium text-zinc-950">{preset.label}</div>
                                <div className="mt-1 text-xs text-zinc-500">{preset.user}@{preset.host}:{preset.port}</div>
                              </div>
                              <span className="text-xs text-zinc-400">导入</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </Card>
                )}

                {remoteErrorOverview ? (
                  <Card className="border-red-200 bg-red-50/80 p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-red-950">错误总览</div>
                        <div className="mt-1 text-sm leading-5 text-red-900">
                          {remoteErrorOverview.title}
                          {remoteErrorOverview.code ? ` · ${remoteErrorOverview.code}` : ""}
                          {` · ${remoteErrorOverview.failedCount} 个阻断项 / ${remoteErrorOverview.warningCount} 个提示项`}
                        </div>
                        <div className="mt-2 text-sm leading-5 text-red-900">{remoteErrorOverview.action}</div>
                        <details className="mt-3 rounded-xl border border-red-200/80 bg-white/70 px-3 py-2 text-xs leading-5 text-red-800">
                          <summary className="cursor-pointer list-none font-medium">查看技术详情</summary>
                          <div className="mt-2 whitespace-pre-wrap break-all">{remoteErrorOverview.detail}</div>
                        </details>
                      </div>
                    </div>
                  </Card>
                ) : null}

                <Card className="overflow-hidden">
                  {visibleChecks.length > 0 ? (
                    visibleChecks.map((check, index) => (
                      <div key={check.name} className={cn("flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between", index !== visibleChecks.length - 1 && "border-b border-zinc-200/70")}>
                        <div className="flex gap-3">
                          <div className="mt-0.5">
                            {check.state === "pass" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : check.state === "warning" ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <XCircle className="h-5 w-5 text-red-600" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-zinc-950">{check.name}</div>
                            <div className="mt-1 text-sm leading-5 text-zinc-600">{check.desc}</div>
                          </div>
                        </div>
                        {check.action ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCheckAction(check.action)}
                            disabled={isCheckActionPending(check.action)}
                          >
                            {isCheckActionPending(check.action) ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                            {check.action}
                          </Button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <div>
                        <div className="text-sm font-medium text-zinc-950">环境检查通过</div>
                        <div className="mt-1 text-sm leading-5 text-zinc-600">没有发现需要处理的问题，已隐藏通过项。</div>
                      </div>
                    </div>
                  )}
                </Card>

                {environmentHint ? (
                  <Card className="border-blue-200 bg-blue-50/70 p-4">
                    <div className="flex gap-3">
                      <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <div>
                        <div className="text-sm font-medium text-blue-950">环境读取说明</div>
                        <div className="mt-1 text-sm leading-5 text-blue-900">{environmentHint}</div>
                      </div>
                    </div>
                  </Card>
                ) : null}

                {shouldShowRiskCard ? (
                  <Card className="border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <div className="text-sm font-medium text-amber-900">{hasCheckIssues ? "当前检查里有待处理项" : "允许继续，但需要知道风险边界"}</div>
                        <div className="mt-1 text-sm leading-5 text-amber-800">黄色项可继续推进；红色阻断项在接入真实能力前必须先修复。</div>
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <Card className="p-5 border-zinc-950 ring-1 ring-zinc-950/10">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-[#faf9f6] text-zinc-700">
                      {targetType === "remote" ? <Server className="h-5 w-5" /> : <TerminalSquare className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-zinc-950">{getDeploymentMethodLabel(targetType)}</h3>
                        <Badge variant="success">默认</Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                          {targetType === "remote" ? "通过 SSH 连接服务器" : "自动检查 Hermes CLI"}
                        </div>
                        <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                          {targetType === "remote" ? "启动网关服务" : "缺少时自动安装"}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <Card className="p-6">
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-zinc-900">实例名称</label>
                      <input className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={instanceName} onChange={(event) => setInstanceName(event.target.value)} />
                    </div>
                    <label className="flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-[#faf9f6] p-4">
                      <Checkbox checked={providerSetupDeferred} onCheckedChange={(checked) => setProviderSetupDeferred(checked === true)} />
                      <span>
                        <span className="block text-sm font-medium text-zinc-950">安装后再配置 AI 提供商与档案</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">
                          先把实例安装起来。Provider 的 API Key / OAuth 和默认档案可以到工作区里继续完成。
                        </span>
                      </span>
                    </label>
                    {providerSetupDeferred ? (
                      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-sm text-blue-950">
                        <div className="font-medium">本阶段只创建实例，不要求填写 Key。</div>
                        <div className="mt-1 leading-6 text-blue-900/80">
                          安装完成后会提供“去配置提供商”入口；进入工作区后再选择 OAuth / API Key，并创建默认档案。
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-zinc-900">提供商</label>
                          <select
                            className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                            value={provider}
                            onChange={(event) => setProvider(event.target.value)}
                          >
                            {hermesProviderOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-zinc-900">默认档案名称</label>
                          <input className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-zinc-900">默认模型</label>
                          <select
                            className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200/80"
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                          >
                            {providerModelOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-zinc-950">高级配置</div>
                        <button className="flex items-center gap-2 text-sm text-zinc-600" onClick={() => setShowAdvanced((value) => !value)} type="button">
                          {showAdvanced ? "收起" : "展开"}
                          <ChevronDown className={cn("h-4 w-4 transition", showAdvanced && "rotate-180")} />
                        </button>
                      </div>

                      {showAdvanced ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3">
                            <div className="text-[11px] text-zinc-400">服务监听端口</div>
                            <div className="mt-1 text-sm font-medium text-zinc-900">8642（仅展示）</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3">
                            <div className="text-[11px] text-zinc-400">日志级别</div>
                            <div className="mt-1 text-sm font-medium text-zinc-900">info（仅展示）</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="text-sm font-semibold text-zinc-950">当前关系</div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                      <div className="text-xs text-zinc-400">提供商</div>
                      <div className="mt-1 font-medium text-zinc-900">{providerSetupDeferred ? "安装后配置" : providerLabel}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                      <div className="text-xs text-zinc-400">默认模型</div>
                      <div className="mt-1 font-medium text-zinc-900">{providerSetupDeferred ? "安装后配置" : model}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                      <div className="text-xs text-zinc-400">默认档案</div>
                      <div className="mt-1 font-medium text-zinc-900">{providerSetupDeferred ? "安装后配置" : profileName}</div>
                    </div>
                    {targetType === "remote" ? (
                      <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                        <div className="text-xs text-zinc-400">远程目标</div>
                        <div className="mt-1 font-medium text-zinc-900">{remoteUser}@{remoteHost}:{remotePort}</div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-3">
                        <div className="text-xs text-zinc-400">当前环境</div>
                        <div className="mt-1 font-medium text-zinc-900">{localEnvironmentSummary.platform}</div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Card className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-zinc-950">部署摘要</div>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {summaryRows.map((row) => (
                      <div key={row.label} className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">
                        <div className="text-xs text-zinc-400">{row.label}</div>
                        <div className="mt-2 text-sm font-medium text-zinc-950">{row.value}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center gap-2 text-base font-semibold text-zinc-950">
                    <Shield className="h-4 w-4 text-zinc-500" />
                    关键提示
                  </div>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">默认安全模型为 localhost 或 SSH 隧道，不以直接公网暴露管理端口为默认方案。</div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-4 py-4">上线默认只展示本机安装与服务器部署，复杂运行细节放到技术详情。</div>
                  </div>
                </Card>
              </div>
            ) : null}

            {step === 5 && deployError ? (
              <Card className="border-red-200 bg-red-50/80 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-red-950">{deployError.message}</div>
                      <div className="mt-1 text-sm leading-6 text-red-900">{deployError.detail ?? "请检查部署环境后重试。"}</div>
                    </div>
                    {deployResult ? (
                      <div className="rounded-2xl border border-red-200/80 bg-white/80 px-4 py-3 text-sm text-red-900">
                        <div>实例目录：{deployResult.workspaceDir}</div>
                        <div className="mt-1">预留端点：{deployResult.endpoint}</div>
                        <div className="mt-1">运行载体：{deployResult && "containerName" in deployResult ? deployResult.containerName : deployResult && "service" in deployResult ? deployResult.service : "待创建"}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}

            <div className="flex items-center justify-between border-t border-zinc-200/70 pt-6">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={handlePrev} disabled={step === 1}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  上一步
                </Button>
                {nextStepHint ? <div className="hidden text-xs text-zinc-500 md:block">{nextStepHint}</div> : null}
              </div>
              {step < 5 ? (
                <Button variant="primary" size="sm" onClick={handleNext} disabled={!canProceedToNextStep}>
                  下一步
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => void startDeploy()} disabled={isDeploying || !canDeployCurrentSelection}>
                  {isDeploying ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {canDeployCurrentSelection ? deployButtonLabel : deployUnavailableReason?.label ?? "当前部署路径不可用"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
