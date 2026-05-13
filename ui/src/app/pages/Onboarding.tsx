import { Link, useNavigate } from "react-router";
import { ArrowRight, Monitor, Server, Shield } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/console/PageHeader";
import { ImportExistingInstanceDialog } from "../components/console/ImportExistingInstanceDialog";

export function Onboarding() {
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.importExistingLocalInstance);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-8 py-8">
        <PageHeader
          title="欢迎使用 Hermes Console"
          meta={<Badge variant="outline">首次启动</Badge>}
          actions={
            <Link
              to="/"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition hover:bg-zinc-50"
            >
              先查看主页
            </Link>
          }
        />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1.2fr_0.88fr]">
          <Link to="/create?type=local" className="block">
            <Card className="flex h-full min-h-[250px] flex-col p-5 transition hover:border-zinc-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-[#faf9f6] text-zinc-700">
                <Monitor className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-[1.05rem] font-semibold leading-7 text-zinc-950">添加本地实例</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  macOS
                </Badge>
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  Windows WSL2
                </Badge>
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  本机安装
                </Badge>
              </div>
              <div className="mt-auto flex items-center gap-2 pt-5 text-sm font-medium text-blue-700">
                进入本地创建流程
                <ArrowRight className="h-4 w-4" />
              </div>
            </Card>
          </Link>

          <Link to="/create?type=remote" className="block">
            <Card className="flex h-full min-h-[250px] flex-col p-5 transition hover:border-zinc-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-[#faf9f6] text-zinc-700">
                <Server className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-[1.05rem] font-semibold leading-7 text-zinc-950">添加远程实例</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  SSH
                </Badge>
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  Linux
                </Badge>
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  远程部署
                </Badge>
              </div>
              <div className="mt-auto flex items-center gap-2 pt-5 text-sm font-medium text-blue-700">
                进入远程创建流程
                <ArrowRight className="h-4 w-4" />
              </div>
            </Card>
          </Link>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
              <Shield className="h-4 w-4 text-zinc-500" />
              关键提示
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
              <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3.5 py-3.5">
                默认使用 localhost / SSH 隧道
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3.5 py-3.5">
                默认走最简单的安装路径
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3.5 py-3.5">
                创建完成后可在会话、提供商和集成页继续管理实例
              </div>
              {desktopRuntimeAvailable ? (
                <ImportExistingInstanceDialog
                  onImported={async (payload) => {
                    navigate(`/instance/${payload.instance.id}`);
                  }}
                  trigger={
                    <button type="button" className="w-full rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3.5 py-3.5 text-left transition hover:border-zinc-300">
                      已有本机 Hermes 环境？点这里直接导入
                    </button>
                  }
                />
              ) : null}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
