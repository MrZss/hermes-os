import type { InstanceOfficialState } from "./officialState";

export interface OfficialProfileActionResult {
  message: string;
  profileId?: string;
  previousProfileId?: string;
  outputPath?: string;
  archivePath?: string;
}

export interface OfficialConfigActionResult {
  message: string;
  profileId: string;
  integrationId?: string;
  updatedKeys: string[];
  state?: InstanceOfficialState;
}

export interface OfficialProviderAuthResult {
  message: string;
  profileId: string;
  providerId: string;
  command: string[];
  output: string;
  state?: InstanceOfficialState;
}

export interface OfficialPairingActionResult {
  message: string;
  profileId: string;
  integrationId: string;
  platformId: string;
  pairingCode: string;
  output: string;
  state?: InstanceOfficialState;
}

export interface WeixinQrLoginStartResult {
  requestId: string;
  qrcodeUrl: string;
  expiresAt: string;
  status: "waiting";
  message: string;
}

export interface WeixinQrLoginPollResult {
  status: "waiting" | "scanned" | "confirmed" | "expired" | "cancelled";
  message: string;
  profileId?: string;
  accountId?: string;
  userId?: string;
  updatedKeys?: string[];
  accountPath?: string;
  state?: InstanceOfficialState;
}

export interface ProviderTestResult {
  instanceId: string;
  profileId: string;
  providerId: string;
  checkedAt: string;
  status: "verified" | "failed" | "configured";
  summary: string;
  detail: string;
  source: "doctor" | "http" | "config";
}

function ensureOfficialActionApi() {
  if (
    !window.hermesDesktop?.createInstanceProfile ||
    !window.hermesDesktop?.renameInstanceProfile ||
    !window.hermesDesktop?.setDefaultInstanceProfile ||
    !window.hermesDesktop?.deleteInstanceProfile ||
    !window.hermesDesktop?.exportInstanceProfile ||
    !window.hermesDesktop?.importInstanceProfile ||
    !window.hermesDesktop?.updateInstanceProviderConfig ||
    !window.hermesDesktop?.authenticateInstanceProvider ||
    !window.hermesDesktop?.approveInstanceMessagingPairing ||
    !window.hermesDesktop?.updateInstanceIntegrationConfig ||
    !window.hermesDesktop?.startInstanceWeixinQrLogin ||
    !window.hermesDesktop?.pollInstanceWeixinQrLogin ||
    !window.hermesDesktop?.cancelInstanceWeixinQrLogin ||
    !window.hermesDesktop?.listInstanceProviderTests ||
    !window.hermesDesktop?.testInstanceProvider ||
    !window.hermesDesktop?.startInstanceGateway ||
    !window.hermesDesktop?.stopInstanceGateway ||
    !window.hermesDesktop?.restartInstanceGateway
  ) {
    throw new Error("请在 Hermes 桌面客户端中操作；浏览器预览无法执行登录、保存、测试或实例维护动作。");
  }

  return window.hermesDesktop;
}

function mapOfficialState(raw?: HermesInstanceOfficialStatePayload): InstanceOfficialState | undefined {
  if (!raw) return undefined;

  return {
    instance: raw.instance,
    profiles: raw.profiles as never,
    providers: raw.providers as never,
    integrations: raw.integrations as never,
    sources: raw.sources,
    fallback: false,
  };
}

function looksLikeTechnicalTrace(value?: string) {
  if (!value) return false;

  return [
    "Traceback (most recent call last):",
    "node:internal/",
    "Command timed out after",
  ].some((marker) => value.includes(marker))
    || /\n\s*File ".+?", line \d+, in /.test(value)
    || /\n\s*at .+\(.+:\d+:\d+\)/.test(value)
    || /\^\^\^\^\^\^\^\^\^\^/.test(value);
}

function formatDesktopActionError(error: HermesDesktopError | undefined, fallbackMessage: string) {
  if (!error) {
    return fallbackMessage;
  }

  const message = error.message?.trim() || fallbackMessage;
  const detail = error.detail?.trim();

  if (!detail || detail === message) {
    return message;
  }

  if (looksLikeTechnicalTrace(detail) || detail.length > 600) {
    return `${message}\n详情已记录在桌面日志；请检查网络代理、登录状态或 Hermes CLI 输出。`;
  }

  return `${message}\n${detail}`;
}

function unwrapResult<T>(result: HermesDesktopResult<T>, fallbackMessage: string) {
  if (!result.ok || !result.data) {
    throw new Error(formatDesktopActionError(result.error, fallbackMessage));
  }

  return result.data;
}

export async function createInstanceProfile(instanceId: string, input: { name: string; clone?: boolean; cloneAll?: boolean; cloneFrom?: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.createInstanceProfile!(instanceId, input);
  return unwrapResult(result, "创建档案失败。") as OfficialProfileActionResult;
}

export async function renameInstanceProfile(instanceId: string, input: { profileId: string; nextName: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.renameInstanceProfile!(instanceId, input);
  return unwrapResult(result, "重命名档案失败。") as OfficialProfileActionResult;
}

export async function setDefaultInstanceProfile(instanceId: string, input: { profileId: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.setDefaultInstanceProfile!(instanceId, input);
  return unwrapResult(result, "切换默认档案失败。") as OfficialProfileActionResult;
}

export async function deleteInstanceProfile(instanceId: string, input: { profileId: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.deleteInstanceProfile!(instanceId, input);
  return unwrapResult(result, "删除档案失败。") as OfficialProfileActionResult;
}

export async function exportInstanceProfile(instanceId: string, input: { profileId: string; outputPath?: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.exportInstanceProfile!(instanceId, input);
  return unwrapResult(result, "导出档案失败。") as OfficialProfileActionResult;
}

export async function importInstanceProfile(instanceId: string, input: { archivePath: string; profileName?: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.importInstanceProfile!(instanceId, input);
  return unwrapResult(result, "导入档案失败。") as OfficialProfileActionResult;
}

export async function updateInstanceProviderConfig(
  instanceId: string,
  input: {
    profileId?: string;
    providerId: string;
    defaultModel?: string;
    baseUrl?: string;
    apiMode?: string;
    apiKey?: string;
    env?: Record<string, string>;
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.updateInstanceProviderConfig!(instanceId, input);
  const data = unwrapResult(result, "保存 provider 配置失败。") as HermesOfficialConfigActionPayload;

  return {
    ...data,
    state: mapOfficialState(data.state),
  } as OfficialConfigActionResult;
}

export async function authenticateInstanceProvider(
  instanceId: string,
  input: {
    profileId?: string;
    providerId: string;
    authType?: "oauth";
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.authenticateInstanceProvider!(instanceId, input);
  const data = unwrapResult(result, "OAuth 登录失败。") as HermesOfficialProviderAuthPayload;

  return {
    ...data,
    state: mapOfficialState(data.state),
  } as OfficialProviderAuthResult;
}

export async function updateInstanceIntegrationConfig(
  instanceId: string,
  input: {
    profileId?: string;
    integrationId: string;
    fields?: Record<string, string>;
    pluginsEnabled?: boolean;
    apiServerEnabled?: boolean;
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.updateInstanceIntegrationConfig!(instanceId, input);
  const data = unwrapResult(result, "保存集成配置失败。") as HermesOfficialConfigActionPayload;

  return {
    ...data,
    state: mapOfficialState(data.state),
  } as OfficialConfigActionResult;
}

export async function approveInstanceMessagingPairing(
  instanceId: string,
  input: {
    profileId?: string;
    integrationId: string;
    code: string;
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.approveInstanceMessagingPairing!(instanceId, input);
  const data = unwrapResult(result, "批准消息平台配对失败。") as HermesOfficialPairingActionPayload;

  return {
    ...data,
    state: mapOfficialState(data.state),
  } as OfficialPairingActionResult;
}

export async function startInstanceWeixinQrLogin(
  instanceId: string,
  input?: {
    profileId?: string;
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.startInstanceWeixinQrLogin!(instanceId, input);
  return unwrapResult(result, "生成微信二维码失败。") as WeixinQrLoginStartResult;
}

export async function pollInstanceWeixinQrLogin(
  instanceId: string,
  input: {
    requestId: string;
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.pollInstanceWeixinQrLogin!(instanceId, input);
  const data = unwrapResult(result, "读取微信扫码状态失败。") as HermesWeixinQrLoginPollPayload;

  return {
    ...data,
    state: mapOfficialState(data.state),
  } as WeixinQrLoginPollResult;
}

export async function cancelInstanceWeixinQrLogin(
  instanceId: string,
  input: {
    requestId?: string;
  }
) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.cancelInstanceWeixinQrLogin!(instanceId, input);
  return unwrapResult(result, "取消微信扫码配置失败。") as WeixinQrLoginPollResult;
}

export async function listInstanceProviderTests(instanceId: string, options?: { profileId?: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.listInstanceProviderTests!(instanceId, options);
  const data = unwrapResult(result, "读取 provider 测试记录失败。") as HermesProviderTestsPayload;
  return data.entries as ProviderTestResult[];
}

export async function testInstanceProvider(instanceId: string, input: { profileId?: string; providerId: string }) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.testInstanceProvider!(instanceId, input);
  return unwrapResult(result, "执行 provider 测试失败。") as ProviderTestResult;
}

export async function startInstanceGateway(instanceId: string) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.startInstanceGateway!(instanceId);
  return unwrapResult(result, "启动网关失败。");
}

export async function stopInstanceGateway(instanceId: string) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.stopInstanceGateway!(instanceId);
  return unwrapResult(result, "停止网关失败。");
}

export async function restartInstanceGateway(instanceId: string) {
  const desktop = ensureOfficialActionApi();
  const result = await desktop.restartInstanceGateway!(instanceId);
  return unwrapResult(result, "重启网关失败。");
}
