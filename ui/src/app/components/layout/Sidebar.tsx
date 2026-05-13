import { Link, useLocation } from "react-router";
import { useApp } from "../../context/AppContext";
import { cn } from "../../utils/cn";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Box,
  Network,
  Settings,
  Plus,
  Container
} from "lucide-react";
import { BrandMark } from "../brand/BrandMark";

export function Sidebar() {
  const { t, activeInstance, lang, setLang } = useApp();
  const location = useLocation();

  const isRouteActive = (path: string) => location.pathname.startsWith(path);

  const mainNav = [
    { icon: LayoutDashboard, label: t("overview"), path: `/instance/${activeInstance}` },
    { icon: MessageSquare, label: t("chat"), path: `/instance/${activeInstance}/chat` },
    { icon: Users, label: t("profiles"), path: `/instance/${activeInstance}/profiles` },
    { icon: Box, label: t("providers"), path: `/instance/${activeInstance}/providers` },
    { icon: Network, label: t("integrations"), path: `/instance/${activeInstance}/integrations` },
  ];

  return (
    <aside className="w-64 bg-[#F2F2F0] border-r border-stone-200 h-full flex flex-col pt-5 pb-4 px-4 select-none">
      {/* Brand */}
      <div className="flex items-center space-x-3 mb-8 px-2">
        <BrandMark className="h-8 w-8 rounded-lg shadow-sm ring-1 ring-stone-200/70" />
        <div>
          <h1 className="text-sm font-semibold text-stone-900 tracking-tight leading-none">Hermes Console</h1>
          <span className="text-[10px] text-stone-500 font-medium tracking-wider uppercase mt-1 block">Local Control Plane</span>
        </div>
      </div>

      <div className="mb-6 space-y-1.5">
        <div className="text-[11px] font-semibold text-stone-400 tracking-wider uppercase px-2 mb-2">
          所有实例
        </div>
        
        <Link 
          to="/dashboard"
          className={cn(
            "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all",
            location.pathname === "/dashboard" || location.pathname === "/"
              ? "bg-white text-blue-600 shadow-sm border border-stone-200/60 font-medium" 
              : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 font-medium"
          )}
        >
          <div className="flex items-center space-x-3">
            <LayoutDashboard className="w-4 h-4" />
            <span>概览大盘</span>
          </div>
        </Link>

        <Link
          to="/instance/inst-1"
          className={cn(
            "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all",
            activeInstance === "inst-1" && location.pathname !== "/dashboard" && location.pathname !== "/"
              ? "bg-white text-blue-600 shadow-sm border border-stone-200/60 font-medium" 
              : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 font-medium"
          )}
        >
          <div className="flex items-center space-x-3">
            <Container className={cn("w-4 h-4", activeInstance === "inst-1" && location.pathname !== "/dashboard" && location.pathname !== "/" ? "text-blue-600" : "text-stone-500")} />
            <span>local-dev-node</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
        </Link>

        <Link
          to="/create"
          className={cn(
            "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-all mt-1 font-medium",
            isRouteActive("/create") 
              ? "bg-white text-blue-600 shadow-sm border border-stone-200/60" 
              : "text-stone-500 hover:text-stone-800 hover:bg-stone-200/50"
          )}
        >
          <Plus className="w-4 h-4" />
          <span>{t("new_instance")}</span>
        </Link>
      </div>

      {activeInstance && location.pathname.includes("/instance/") && (
        <nav className="flex-1 space-y-1">
          <div className="text-[11px] font-semibold text-stone-400 tracking-wider uppercase px-2 mt-4 mb-2">
            工作区
          </div>
          {mainNav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-white text-blue-600 shadow-sm border border-stone-200/60"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50"
                )}
              >
                <item.icon className={cn("w-4 h-4", active ? "text-blue-600" : "text-stone-500")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mt-auto pt-6 space-y-1">
        <Link
          to="/settings"
          className={cn(
            "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
            isRouteActive("/settings")
              ? "bg-white text-blue-600 shadow-sm border border-stone-200/60"
              : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>{t("settings")}</span>
        </Link>
        
        <div className="pt-4 mt-4 border-t border-stone-200/60 flex flex-col space-y-3 px-3">
          <Link to="/onboarding" className="text-xs text-stone-500 hover:text-blue-600 transition-colors font-medium">
            查看欢迎页演示
          </Link>
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-500 font-medium">{t("language")}</span>
            <div className="flex bg-stone-200/50 rounded p-0.5 border border-stone-200/50">
              <button
                onClick={() => setLang("en")}
                className={cn("text-[10px] px-2 py-0.5 rounded-sm transition-colors font-medium", lang === "en" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}
              >
                EN
              </button>
              <button
                onClick={() => setLang("zh")}
                className={cn("text-[10px] px-2 py-0.5 rounded-sm transition-colors font-medium", lang === "zh" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}
              >
                中
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
