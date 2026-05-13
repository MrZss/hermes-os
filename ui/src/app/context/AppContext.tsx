import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { dict } from "../i18n";

type Lang = "en" | "zh";

export type InstanceStatus = "healthy" | "warning" | "offline" | "failed";

export interface Instance {
  id: string;
  name: string;
  type: "local" | "remote";
  platform: string;
  installMethod: "Native" | "Docker" | "SSH";
  version: string;
  gatewayStatus: InstanceStatus;
  apiStatus: InstanceStatus;
  defaultProfile: string;
  lastActivity: string;
}

interface AppContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof typeof dict.en) => string;
  
  // App state
  isAppLoading: boolean;
  appError: string | null;
  
  instances: Instance[];
  setInstances: (instances: Instance[]) => void;
  activeInstance: string | null;
  setActiveInstance: (id: string | null) => void;
  
  // Theme (stub for future if needed, forced light currently)
  theme: "light";
}

const getGlobalContext = () => {
  if (!(window as any).__AppContext) {
    (window as any).__AppContext = createContext<AppContextType | undefined>(undefined);
  }
  return (window as any).__AppContext;
};

const AppContext = getGlobalContext();

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("zh"); // 默认中文
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  
  const [instances, setInstances] = useState<Instance[]>([]);
  const [activeInstance, setActiveInstance] = useState<string | null>(null);

  // Simulate initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      // We can populate fake instances here to see the Dashboard, or leave empty to see empty state.
      // Let's provide a toggle in the UI later or just load a few default ones.
      setInstances([
        {
          id: "inst-1",
          name: "local-dev-node",
          type: "local",
          platform: "macOS",
          installMethod: "Native",
          version: "v1.4.2",
          gatewayStatus: "healthy",
          apiStatus: "healthy",
          defaultProfile: "gpt-4o-default",
          lastActivity: "2 分钟前"
        },
        {
          id: "inst-2",
          name: "staging-server-eu",
          type: "remote",
          platform: "Ubuntu 22.04",
          installMethod: "SSH",
          version: "v1.4.0",
          gatewayStatus: "warning",
          apiStatus: "healthy",
          defaultProfile: "claude-3-opus",
          lastActivity: "1 小时前"
        },
        {
          id: "inst-3",
          name: "docker-test-env",
          type: "local",
          platform: "Docker Desktop",
          installMethod: "Docker",
          version: "v1.3.9",
          gatewayStatus: "offline",
          apiStatus: "offline",
          defaultProfile: "llama-3-local",
          lastActivity: "3 天前"
        }
      ]);
      setActiveInstance("inst-1");
      setIsAppLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const t = (key: keyof typeof dict.en) => {
    return dict[lang][key] || dict["en"][key] || key;
  };

  return (
    <AppContext.Provider value={{ 
      lang, setLang, t, 
      isAppLoading, appError,
      instances, setInstances, 
      activeInstance, setActiveInstance,
      theme: "light"
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
