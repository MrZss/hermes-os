import {
  hermesIntegrations,
  hermesProfiles,
  hermesProviders,
  type HermesIntegrationEntry,
  type HermesProfileEntry,
  type HermesProviderEntry,
} from "../data/hermesOfficial";

export interface InstanceOfficialState {
  instance: HermesRegisteredInstance | null;
  profiles: HermesProfileEntry[];
  providers: HermesProviderEntry[];
  integrations: HermesIntegrationEntry[];
  sources?: HermesInstanceOfficialStatePayload["sources"];
  fallback: boolean;
}

function canUseDesktopOfficialState() {
  return typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceOfficialState);
}

export async function getInstanceOfficialState(instanceId: string, options?: { profileId?: string }): Promise<InstanceOfficialState> {
  if (!canUseDesktopOfficialState()) {
    return {
      instance: null,
      profiles: hermesProfiles,
      providers: hermesProviders,
      integrations: hermesIntegrations,
      fallback: true,
    };
  }

  const result = await window.hermesDesktop!.getInstanceOfficialState!(instanceId, options);

  if (!result.ok || !result.data) {
    throw new Error(result.error?.detail ?? result.error?.message ?? "无法读取实例官方状态。");
  }

  return {
    instance: result.data.instance,
    profiles: result.data.profiles as HermesProfileEntry[],
    providers: result.data.providers as HermesProviderEntry[],
    integrations: result.data.integrations as HermesIntegrationEntry[],
    sources: result.data.sources,
    fallback: false,
  };
}
