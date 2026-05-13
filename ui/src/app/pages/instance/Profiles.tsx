import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Briefcase, Copy, Download, LoaderCircle, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Drawer } from "../../components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PageHeader } from "../../components/console/PageHeader";
import { consoleInstances, type ConsoleInstance } from "../../data/console";
import type { HermesProfileEntry, HermesProfileGatewayStatus } from "../../data/hermesOfficial";
import {
  createInstanceProfile,
  deleteInstanceProfile,
  exportInstanceProfile,
  importInstanceProfile,
  renameInstanceProfile,
  setDefaultInstanceProfile,
} from "../../services/officialActions";
import { getInstanceOfficialState, type InstanceOfficialState } from "../../services/officialState";
import { getConsoleRuntimeInstance } from "../../services/runtime";

const summaryCardClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-3.5 [overflow-wrap:anywhere]";
const detailCardClassName = "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 [overflow-wrap:anywhere]";

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

type ProfileDialogState =
  | { type: "create"; name: string }
  | { type: "import"; archivePath: string; profileName: string }
  | { type: "clone"; profile: HermesProfileEntry; name: string }
  | { type: "rename"; profile: HermesProfileEntry; nextName: string }
  | { type: "export"; profile: HermesProfileEntry; outputPath: string }
  | { type: "delete"; profile: HermesProfileEntry }
  | null;

export function Profiles() {
  const { id: instanceId = "" } = useParams();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = useMemo<ConsoleInstance | null>(() => consoleInstances.find((item) => item.id === instanceId) ?? null, [instanceId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<HermesProfileEntry[]>([]);
  const [providerNameById, setProviderNameById] = useState<Map<string, string>>(new Map());
  const [instance, setInstance] = useState<ConsoleInstance | null>(null);
  const [officialState, setOfficialState] = useState<InstanceOfficialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<ProfileDialogState>(null);

  useEffect(() => {
    if (!desktopRuntimeAvailable) {
      setInstance(fallbackInstance);
    }
  }, [desktopRuntimeAvailable, fallbackInstance]);

  useEffect(() => {
    if (!instanceId) return;

    let cancelled = false;

    async function loadInstanceMeta() {
      try {
        const runtimeInstance = await getConsoleRuntimeInstance(instanceId);
        if (!cancelled) {
          setInstance(runtimeInstance ?? (desktopRuntimeAvailable ? null : fallbackInstance));
        }
      } catch {
        if (!cancelled) {
          setInstance(desktopRuntimeAvailable ? null : fallbackInstance);
        }
      }
    }

    void loadInstanceMeta();

    return () => {
      cancelled = true;
    };
  }, [desktopRuntimeAvailable, fallbackInstance, instanceId]);

  const loadProfiles = useCallback(
    async (preferredSelectedId?: string | null) => {
      setLoading(true);
      setError(null);

      try {
        const result = await getInstanceOfficialState(instanceId);
        setOfficialState(result);
        setProfiles(result.profiles);
        setProviderNameById(new Map(result.providers.map((provider) => [provider.id, provider.name])));
        setFallback(result.fallback);
        setSelectedId(() => {
          if (preferredSelectedId === undefined) {
            return null;
          }

          if (preferredSelectedId && result.profiles.some((profile) => profile.id === preferredSelectedId)) {
            return preferredSelectedId;
          }

          return null;
        });
      } catch (loadError) {
        setOfficialState(null);
        setProfiles([]);
        setProviderNameById(new Map());
        setFallback(false);
        setError(loadError instanceof Error ? loadError.message : "无法读取当前实例的档案状态。");
      } finally {
        setLoading(false);
      }
    },
    [instanceId]
  );

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null,
    [profiles, selectedId]
  );
  const remoteRedirectNotice =
    instance?.type === "remote"
      ? "远程实例已切换为节点模式，档案入口已迁移到 AI 提供商。请在那里继续配置节点接入。"
      : null;

  const gatewayBadgeVariant: Record<HermesProfileGatewayStatus, "success" | "warning" | "outline"> = {
    已启用: "success",
    未启用: "outline",
    异常: "warning",
  };

  async function runProfileAction(actionKey: string, runner: () => Promise<{ message?: string; profileId?: string; outputPath?: string }>) {
    setPendingAction(actionKey);
    setFeedback(null);

    try {
      const result = await runner();
      await loadProfiles(result.profileId ?? selectedId);
      setFeedback({
        tone: "success",
        message: result.outputPath ? `${result.message || "操作完成。"}\n输出路径：${result.outputPath}` : result.message || "操作完成。",
      });
    } catch (actionError) {
      setFeedback({
        tone: "error",
        message: actionError instanceof Error ? actionError.message : "操作失败。",
      });
    } finally {
      setPendingAction(null);
    }
  }

  function handleCreateProfile() {
    setDialogState({
      type: "create",
      name: "",
    });
  }

  function handleImportProfile() {
    setDialogState({
      type: "import",
      archivePath: "",
      profileName: "",
    });
  }

  function handleCloneProfile(profile: HermesProfileEntry) {
    setDialogState({
      type: "clone",
      profile,
      name: `${profile.id}-copy`,
    });
  }

  function handleRenameProfile(profile: HermesProfileEntry) {
    if (profile.id === "default") {
      setFeedback({
        tone: "error",
        message: "默认档案不能直接重命名，请新建或克隆一个新的命名档案。",
      });
      return;
    }
    setDialogState({
      type: "rename",
      profile,
      nextName: profile.id,
    });
  }

  async function handleSetDefault(profile: HermesProfileEntry) {
    await runProfileAction("set-default", () => setDefaultInstanceProfile(instanceId, { profileId: profile.id }));
  }

  function handleDelete(profile: HermesProfileEntry) {
    if (profile.id === "default") {
      setFeedback({
        tone: "error",
        message: "默认档案不能在这里删除。",
      });
      return;
    }
    setDialogState({
      type: "delete",
      profile,
    });
  }

  function handleExport(profile: HermesProfileEntry) {
    setDialogState({
      type: "export",
      profile,
      outputPath: "",
    });
  }

  async function handleSubmitDialog() {
    if (!dialogState) return;

    if (dialogState.type === "create" && dialogState.name.trim()) {
      await runProfileAction("create", () => createInstanceProfile(instanceId, { name: dialogState.name.trim() }));
      setDialogState(null);
      return;
    }

    if (dialogState.type === "import" && dialogState.archivePath.trim()) {
      await runProfileAction("import", () =>
        importInstanceProfile(instanceId, {
          archivePath: dialogState.archivePath.trim(),
          profileName: dialogState.profileName.trim() || undefined,
        })
      );
      setDialogState(null);
      return;
    }

    if (dialogState.type === "clone" && dialogState.name.trim()) {
      await runProfileAction("clone", () =>
        createInstanceProfile(instanceId, {
          name: dialogState.name.trim(),
          clone: true,
          cloneFrom: dialogState.profile.id,
        })
      );
      setDialogState(null);
      return;
    }

    if (dialogState.type === "rename" && dialogState.nextName.trim() && dialogState.nextName.trim() !== dialogState.profile.id) {
      await runProfileAction("rename", () =>
        renameInstanceProfile(instanceId, {
          profileId: dialogState.profile.id,
          nextName: dialogState.nextName.trim(),
        })
      );
      setDialogState(null);
      return;
    }

    if (dialogState.type === "export") {
      await runProfileAction("export", () =>
        exportInstanceProfile(instanceId, {
          profileId: dialogState.profile.id,
          outputPath: dialogState.outputPath.trim() || undefined,
        })
      );
      setDialogState(null);
      return;
    }

    if (dialogState.type === "delete") {
      await runProfileAction("delete", () => deleteInstanceProfile(instanceId, { profileId: dialogState.profile.id }));
      setDialogState(null);
    }
  }

  if (instance?.type === "remote") {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="档案入口已迁移" meta={<Badge variant="warning">远程节点</Badge>} />
          <Card className="border-amber-200 bg-amber-50/80 p-6 text-sm leading-7 text-zinc-700">
            <div className="font-medium text-zinc-950">远程实例不再保留档案主入口。</div>
            <div className="mt-2">{remoteRedirectNotice}</div>
            <div className="mt-4">
              <Button variant="primary" size="sm" onClick={() => navigate(`/instance/${instanceId}/providers`)}>
                立即前往 AI 提供商
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="档案" />
          <Card className="p-6 text-sm text-zinc-600">正在读取当前实例的 Hermes profile 摘要…</Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="档案" />
          <Card className="p-6 text-sm text-zinc-600">{error}</Card>
        </div>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="档案" meta={fallback ? <Badge variant="outline">静态 fallback</Badge> : undefined} />
          <Card className="p-6 text-sm text-zinc-600">当前实例没有可展示的 Hermes profile。</Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
        <PageHeader
          title="档案"
          meta={fallback ? <Badge variant="outline">静态 fallback</Badge> : <Badge variant="outline">Hermes 官方 profile</Badge>}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => void handleImportProfile()} disabled={pendingAction !== null}>
                <Upload className="mr-1.5 h-4 w-4" />
                导入
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void handleCreateProfile()} disabled={pendingAction !== null}>
                <Plus className="mr-1.5 h-4 w-4" />
                新建档案
              </Button>
            </>
          }
        />

        {feedback ? (
          <Card className={`px-4 py-3 text-sm whitespace-pre-wrap ${feedback.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {feedback.message}
          </Card>
        ) : null}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => (
            <Card key={profile.id} className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                      profile.isDefault ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-[#faf9f6] text-zinc-700"
                    }`}
                  >
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-zinc-950">{profile.name}</h3>
                      {profile.isDefault ? <Badge variant="success" className="bg-emerald-50/80">默认</Badge> : null}
                    </div>
                    <div className="text-sm leading-6 text-zinc-600">{profile.description}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">提供商</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-900">{providerNameById.get(profile.providerId) ?? profile.providerId}</div>
                </div>
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">模型</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-900">{profile.model}</div>
                </div>
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">会话数量</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-900">{profile.sessions}</div>
                </div>
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">网关状态</div>
                  <div className="mt-1.5">
                    <Badge variant={gatewayBadgeVariant[profile.gatewayStatus]}>{profile.gatewayStatus}</Badge>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-zinc-200/70 pt-4">
                <div className="text-xs text-zinc-500">最近使用 {profile.lastUsed}</div>
                <Button variant="secondary" size="sm" onClick={() => setSelectedId(profile.id)}>
                  查看摘要
                </Button>
              </div>
            </Card>
          ))}
        </section>
      </div>

      <Drawer
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="档案详情"
        footer={
          selectedProfile ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <Button variant="danger" size="sm" disabled={pendingAction !== null || selectedProfile.id === "default"} onClick={() => void handleDelete(selectedProfile)}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                删除
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={pendingAction !== null} onClick={() => void handleCloneProfile(selectedProfile)}>
                  <Copy className="mr-1.5 h-4 w-4" />
                  克隆
                </Button>
                <Button variant="secondary" size="sm" disabled={pendingAction !== null} onClick={() => void handleExport(selectedProfile)}>
                  <Download className="mr-1.5 h-4 w-4" />
                  导出
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selectedProfile ? (
          <div className="space-y-7">
            <section className="rounded-2xl border border-zinc-200/70 bg-[#faf9f6] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-zinc-950">{selectedProfile.name}</div>
                    {selectedProfile.isDefault ? <Badge variant="success" className="bg-emerald-50/80">默认</Badge> : null}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-zinc-600">{selectedProfile.description}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" disabled={pendingAction !== null || selectedProfile.isDefault} onClick={() => void handleSetDefault(selectedProfile)}>
                    {pendingAction === "set-default" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Star className="mr-1.5 h-4 w-4" />}
                    {pendingAction === "set-default" ? "设置中..." : "设为默认"}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={pendingAction !== null || selectedProfile.id === "default"} onClick={() => void handleRenameProfile(selectedProfile)}>
                    <Pencil className="mr-1.5 h-4 w-4" />
                    重命名
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold text-zinc-950">基础信息</div>
              <div className="grid grid-cols-1 gap-3">
                <div className={detailCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">档案名称</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-950">{selectedProfile.name}</div>
                </div>
                <div className={detailCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">最近使用</div>
                  <div className="mt-1.5 text-sm text-zinc-700">{selectedProfile.lastUsed}</div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold text-zinc-950">摘要</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">提供商</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-900">{providerNameById.get(selectedProfile.providerId) ?? selectedProfile.providerId}</div>
                </div>
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">模型</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-900">{selectedProfile.model}</div>
                </div>
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">会话数量</div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-900">{selectedProfile.sessions}</div>
                </div>
                <div className={summaryCardClassName}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">网关状态</div>
                  <div className="mt-1.5">
                    <Badge variant={gatewayBadgeVariant[selectedProfile.gatewayStatus]}>{selectedProfile.gatewayStatus}</Badge>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>

      <Dialog open={Boolean(dialogState)} onOpenChange={(open) => (!open ? setDialogState(null) : undefined)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {dialogState?.type === "create" && "新建档案"}
              {dialogState?.type === "import" && "导入档案"}
              {dialogState?.type === "clone" && "克隆档案"}
              {dialogState?.type === "rename" && "重命名档案"}
              {dialogState?.type === "export" && "导出档案"}
              {dialogState?.type === "delete" && "删除档案"}
            </DialogTitle>
            <DialogDescription>
              {dialogState?.type === "create" && "创建一个新的 Hermes profile。建议使用小写英文、数字或短横线。"}
              {dialogState?.type === "import" && "从现有的 .tar.gz 归档导入 Hermes profile，不会覆盖已有档案。"}
              {dialogState?.type === "clone" && `为 ${dialogState.profile.name} 创建一个新的克隆档案。`}
              {dialogState?.type === "rename" && `将 ${dialogState.profile.name} 重命名为新的档案名称。`}
              {dialogState?.type === "export" && `导出 ${dialogState.profile.name}，可留空使用实例 backups 目录。`}
              {dialogState?.type === "delete" && `确认删除 ${dialogState.profile.name} 吗？其配置、会话和上下文会被一并删除。`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {dialogState?.type === "create" || dialogState?.type === "clone" || dialogState?.type === "rename" ? (
              <div className="space-y-2">
                <Label htmlFor="profile-name-input">
                  {dialogState.type === "rename" ? "新档案名称" : "档案名称"}
                </Label>
                <Input
                  id="profile-name-input"
                  value={dialogState.type === "rename" ? dialogState.nextName : dialogState.name}
                  onChange={(event) =>
                    setDialogState((current) => {
                      if (!current) return current;
                      if (current.type === "rename") {
                        return { ...current, nextName: event.target.value };
                      }
                      if (current.type === "create" || current.type === "clone") {
                        return { ...current, name: event.target.value };
                      }
                      return current;
                    })
                  }
                  placeholder="例如：prod-ops"
                  disabled={pendingAction !== null}
                />
              </div>
            ) : null}

            {dialogState?.type === "import" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="profile-import-archive">归档路径</Label>
                  <Input
                    id="profile-import-archive"
                    value={dialogState.archivePath}
                    onChange={(event) => setDialogState({ ...dialogState, archivePath: event.target.value })}
                    placeholder="/absolute/path/profile.tar.gz"
                    disabled={pendingAction !== null}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-import-name">导入后名称（可留空）</Label>
                  <Input
                    id="profile-import-name"
                    value={dialogState.profileName}
                    onChange={(event) => setDialogState({ ...dialogState, profileName: event.target.value })}
                    placeholder="按归档推断"
                    disabled={pendingAction !== null}
                  />
                </div>
              </>
            ) : null}

            {dialogState?.type === "export" ? (
              <div className="space-y-2">
                <Label htmlFor="profile-export-path">导出路径（可留空）</Label>
                <Input
                  id="profile-export-path"
                  value={dialogState.outputPath}
                  onChange={(event) => setDialogState({ ...dialogState, outputPath: event.target.value })}
                  placeholder="默认导出到实例 backups 目录"
                  disabled={pendingAction !== null}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogState(null)} disabled={pendingAction !== null}>
              取消
            </Button>
            <Button
              variant={dialogState?.type === "delete" ? "danger" : "primary"}
              onClick={() => void handleSubmitDialog()}
              disabled={
                pendingAction !== null ||
                (dialogState?.type === "create" && !dialogState.name.trim()) ||
                (dialogState?.type === "import" && !dialogState.archivePath.trim()) ||
                (dialogState?.type === "clone" && !dialogState.name.trim()) ||
                (dialogState?.type === "rename" &&
                  (!dialogState.nextName.trim() || dialogState.nextName.trim() === dialogState.profile.id))
              }
            >
              {pendingAction ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {pendingAction ? "处理中..." : dialogState?.type === "delete" ? "确认删除" : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
