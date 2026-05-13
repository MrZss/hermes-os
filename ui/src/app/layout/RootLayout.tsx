import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate, useParams } from "react-router";
import {
  Activity,
  Briefcase,
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  Server,
  Settings,
  Shield,
} from "lucide-react";
import { BrandMark } from "../components/brand/BrandMark";
import { Badge } from "../components/ui/badge";
import { consoleInstances, type ConsoleInstance, getHealthLabel } from "../data/console";
import { cn } from "../lib/utils";
import { getConsoleRuntimeInstance, listConsoleRuntimeInstances } from "../services/runtime";

export function RootLayout() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.listInstanceStates);
  const [instances, setInstances] = useState<ConsoleInstance[]>(desktopRuntimeAvailable ? [] : consoleInstances);
  const [activeInstance, setActiveInstance] = useState<ConsoleInstance | null>(id ? null : null);
  const [loadingRuntime, setLoadingRuntime] = useState(desktopRuntimeAvailable);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingRuntime(true);
      try {
        const [nextInstances, nextActiveInstance] = await Promise.all([
          listConsoleRuntimeInstances(),
          id ? getConsoleRuntimeInstance(id) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setInstances(nextInstances);
        setActiveInstance(nextActiveInstance);
      } catch {
        if (cancelled) return;

        setInstances(desktopRuntimeAvailable ? [] : consoleInstances);
        setActiveInstance(desktopRuntimeAvailable ? null : id ? consoleInstances.find((instance) => instance.id === id) ?? null : null);
      } finally {
        if (!cancelled) {
          setLoadingRuntime(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [desktopRuntimeAvailable, id, location.pathname]);

  const recentInstances = instances.slice(0, 3);

  const localWorkspaceNav = activeInstance
    ? [
        { to: `/instance/${activeInstance.id}`, icon: Activity, label: "概览", exact: true },
        { to: `/instance/${activeInstance.id}/chat`, icon: MessageSquare, label: "会话" },
        { to: `/instance/${activeInstance.id}/profiles`, icon: Briefcase, label: "档案" },
        { to: `/instance/${activeInstance.id}/providers`, icon: Server, label: "AI 提供商" },
        { to: `/instance/${activeInstance.id}/integrations`, icon: Puzzle, label: "集成" },
      ]
    : [];

  const remoteWorkspaceNav = activeInstance
    ? [
        { to: `/instance/${activeInstance.id}`, icon: Activity, label: "概况", exact: true },
        { to: `/instance/${activeInstance.id}/environment`, icon: Shield, label: "环境检查" },
        { to: `/instance/${activeInstance.id}/deployment`, icon: Settings, label: "部署管理" },
        { to: `/instance/${activeInstance.id}/providers`, icon: Server, label: "AI 提供商" },
        { to: `/instance/${activeInstance.id}/integrations`, icon: Puzzle, label: "消息平台" },
        // 日志入口已临时隐藏，诊断页承接节点日志排查。
        { to: `/instance/${activeInstance.id}/diagnostics`, icon: Shield, label: "诊断" },
      ]
    : [];

  const workspaceNav = activeInstance
    ? activeInstance.type === "remote"
      ? remoteWorkspaceNav
      : localWorkspaceNav
    : [];
  const isRemoteActive = activeInstance?.type === "remote";
  const activeInstanceCompactMeta = activeInstance
    ? isRemoteActive
      ? "远程节点"
      : activeInstance.defaultProfile
    : "";
  const activeInstanceHeaderSignal = activeInstance
    ? isRemoteActive
      ? activeInstance.sshTarget ?? activeInstance.security
      : activeInstance.security
    : "localhost / SSH 隧道";

  const NavItem = ({
    to,
    icon: Icon,
    label,
    isActive,
  }: {
    to: string;
    icon: any;
    label: string;
    isActive?: boolean;
  }) => {
    const active = isActive !== undefined ? isActive : location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
      <NavLink
        to={to}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "bg-white text-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-zinc-200/80" : "text-zinc-600 hover:bg-white hover:text-zinc-950"
        )}
      >
        <Icon className={cn("h-4 w-4", active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-700")} />
        {label}
      </NavLink>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f6f4ef] text-zinc-900">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-zinc-200/70 bg-[#f7f5f0]">
        <div className="flex h-16 items-center border-b border-zinc-200/70 px-5">
          <button className="flex items-center gap-3 text-left" onClick={() => navigate("/")}>
            <BrandMark className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-zinc-950/10" />
            <div>
              <div className="text-sm font-semibold text-zinc-950">Hermes Console</div>
              <div className="text-xs text-zinc-500">桌面控制台</div>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-5">
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-zinc-400">控制台</div>
            <div className="space-y-1">
              <NavItem to="/" icon={LayoutDashboard} label="主页" isActive={location.pathname === "/"} />
              <NavItem to="/settings" icon={Settings} label="设置" />
            </div>
          </div>

          {activeInstance ? (
          <div className="mb-5">
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-zinc-400">当前实例</div>
              <div className="w-full rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-start gap-2.5">
                  <div className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", activeInstance.status === "offline" ? "bg-zinc-300" : activeInstance.status === "warning" ? "bg-amber-400" : "bg-emerald-500")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-zinc-950">{activeInstance.name}</div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={activeInstance.status === "normal" ? "success" : activeInstance.status === "warning" ? "warning" : "outline"}
                        className="h-6 rounded-full px-2.5 text-[11px] font-medium"
                      >
                        {getHealthLabel(activeInstance.status)}
                      </Badge>
                      <span className="text-xs leading-5 text-zinc-500">{activeInstanceCompactMeta}</span>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-zinc-500">切换实例请返回主页。</div>
                  </div>
                </div>
              </div>
          </div>
          ) : null}

          <div>
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{activeInstance ? "工作区" : "实例列表"}</div>
            {activeInstance ? (
              <div className="space-y-1">
                {workspaceNav.map((item) => (
                  <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} isActive={item.exact ? location.pathname === item.to : undefined} />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {loadingRuntime ? (
                  <div className="rounded-xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3 text-sm text-zinc-500">
                    正在读取最近实例…
                  </div>
                ) : recentInstances.map((instance) => (
                  <button
                    key={instance.id}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-600 transition hover:bg-white hover:text-zinc-950"
                    onClick={() => navigate(`/instance/${instance.id}`)}
                  >
                    <div>
                      <div className="text-[13px] font-medium">{instance.name}</div>
                      <div className="mt-0.5 text-xs leading-5 text-zinc-500">{instance.scope}</div>
                    </div>
                    <span className={cn("h-2.5 w-2.5 rounded-full", instance.status === "normal" ? "bg-emerald-500" : instance.status === "warning" ? "bg-amber-400" : "bg-zinc-300")} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="z-10 flex min-w-0 flex-1 flex-col bg-[#fcfbf8]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200/70 bg-[#fcfbf8] px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Badge variant="outline" className="hidden h-7 rounded-full bg-white px-2.5 text-[11px] font-medium md:inline-flex">
              <Shield className="mr-1.5 h-3.5 w-3.5 text-zinc-500" />
              {activeInstanceHeaderSignal}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {activeInstance && !isRemoteActive ? (
              <>
                <Badge variant="outline" className="hidden h-7 rounded-full bg-white px-2.5 text-[11px] font-medium lg:inline-flex">
                  {activeInstance.defaultProfile}
                </Badge>
                <Badge variant="outline" className="hidden h-7 rounded-full bg-white px-2.5 text-[11px] font-medium lg:inline-flex">
                  {activeInstance.currentModel} · {activeInstance.provider}
                </Badge>
              </>
            ) : null}
          </div>
        </div>

        <section className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
