import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CloudUpload, Copy, Database, HardDrive, LoaderCircle, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/console/PageHeader";
import { consoleInstances, type ConsoleInstance } from "../../data/console";
import { getConsoleRuntimeInstance } from "../../services/runtime";
import {
  clearInstanceBackups,
  createInstanceBackup,
  deleteInstanceBackup,
  destroyInstance,
  importInstanceBackup,
  listInstanceBackups,
  pickBackupArchivePath,
  restoreInstanceBackup,
  type RuntimeBackups,
} from "../../services/runtimeMaintenance";

type BackupDialogState =
  | { kind: "import"; path: string }
  | { kind: "clear" }
  | { kind: "destroy"; confirmText: string }
  | null;

function isExternalImportedInstance(data: RuntimeBackups | null) {
  if (!data) return false;
  return data.instance.type === "local" && data.instance.runtime === "native" && data.instance.workspaceDir === data.instance.hermesHome;
}

export function Backups() {
  const { id: instanceId = "" } = useParams();
  const navigate = useNavigate();
  const desktopRuntimeAvailable = typeof window !== "undefined" && Boolean(window.hermesDesktop?.getInstanceState);
  const fallbackInstance = useMemo<ConsoleInstance | null>(() => consoleInstances.find((item) => item.id === instanceId) ?? null, [instanceId]);
  const [data, setData] = useState<RuntimeBackups | null>(null);
  const [instance, setInstance] = useState<ConsoleInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<BackupDialogState>(null);

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

  const load = async (showLoading = false) => {
    if (!instanceId) return;
    if (showLoading) setLoading(true);
    try {
      const result = await listInstanceBackups(instanceId);
      setData(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取实例备份。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, [instanceId]);

  useEffect(() => {
    if (!flashMessage) return undefined;
    const timer = window.setTimeout(() => setFlashMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [flashMessage]);

  const backupCount = data?.items.length ?? 0;
  const latestBackup = data?.items[0] ?? null;
  const externalImported = isExternalImportedInstance(data);
  const backupPolicyLabel = useMemo(() => (backupCount > 0 ? `已发现 ${backupCount} 份备份` : "尚未生成备份"), [backupCount]);
  const destroyLabel = externalImported ? "移除实例注册" : "强制销毁";
  const destroyDescription = externalImported
    ? "当前实例来自现有 Hermes 环境导入，执行后只会从 Console 中移除注册，不会删除原目录。"
    : "该操作会停止当前实例、删除受管工作目录，并从 Console 注册表中移除该实例。";
  const remoteRedirectNotice =
    instance?.type === "remote"
      ? "远程实例已切换为节点模式，备份入口已迁移到诊断页。请在诊断或概况页继续处理远程维护。"
      : null;

  if (instance?.type === "remote") {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-transparent">
        <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-8 py-8">
          <PageHeader title="备份入口已迁移" meta={<Badge variant="warning">远程节点</Badge>} />
          <Card className="border-amber-200 bg-amber-50/80 p-6 text-sm leading-7 text-zinc-700">
            <div className="font-medium text-zinc-950">远程实例不再将备份页作为主流程入口。</div>
            <div className="mt-2">{remoteRedirectNotice}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="primary" size="sm" onClick={() => navigate(`/instance/${instanceId}/diagnostics`)}>
                立即前往诊断
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/instance/${instanceId}`, { replace: true })}>
                返回概况
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const handleCreateBackup = async () => {
    setWorkingAction("create");
    try {
      const next = await createInstanceBackup(instanceId);
      setData(next);
      setFlashMessage(next.created ? `备份创建完成：${next.created.fileName}` : "备份创建完成");
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "创建备份失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    setWorkingAction(`restore:${backupId}`);
    try {
      const result = await restoreInstanceBackup(instanceId, backupId);
      setFlashMessage(`已恢复到 ${result.backup.fileName}`);
      setError(null);
      await load(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "恢复备份失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    setWorkingAction(`delete:${backupId}`);
    try {
      const next = await deleteInstanceBackup(instanceId, backupId);
      setData(next);
      setFlashMessage("备份已删除");
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "删除备份失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleImportBackup = async () => {
    if (dialogState?.kind !== "import") return;
    const sourcePath = dialogState.path.trim();
    if (!sourcePath) {
      setError("请先选择或填写要导入的 zip 备份路径。");
      return;
    }

    setWorkingAction("import");
    try {
      const next = await importInstanceBackup(instanceId, sourcePath);
      setData(next);
      setDialogState(null);
      setFlashMessage(next.imported ? `已导入 ${next.imported.fileName}` : "备份导入完成");
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "导入备份失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const handlePickImportPath = async () => {
    if (dialogState?.kind !== "import") return;
    try {
      const pickedPath = await pickBackupArchivePath();
      setDialogState({ kind: "import", path: pickedPath });
    } catch (pickError) {
      const message = pickError instanceof Error ? pickError.message : "选择备份文件失败。";
      if (message.includes("已取消")) return;
      setError(message);
    }
  };

  const handleClearBackups = async () => {
    setWorkingAction("clear");
    try {
      const next = await clearInstanceBackups(instanceId);
      setData(next);
      setDialogState(null);
      setFlashMessage(next.clearedCount ? `已清空 ${next.clearedCount} 份备份` : "备份已清空");
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "清空备份失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleDestroyInstance = async () => {
    if (dialogState?.kind !== "destroy") return;
    const requiredName = data?.instance.name ?? "";
    if (requiredName && dialogState.confirmText.trim() !== requiredName) {
      setError(`请输入实例名称“${requiredName}”以确认操作。`);
      return;
    }

    setWorkingAction("destroy");
    try {
      const result = await destroyInstance(instanceId);
      setDialogState(null);
      setFlashMessage(result.message);
      setError(null);
      window.setTimeout(() => {
        navigate("/", { replace: true });
      }, 250);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "销毁实例失败。");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleCopyPath = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFlashMessage("已复制备份路径");
    } catch {
      setFlashMessage("复制失败，请检查系统剪贴板权限");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-transparent">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 px-8 py-8">
        <PageHeader
          title="备份"
          meta={flashMessage ? <Badge variant="success">{flashMessage}</Badge> : undefined}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setDialogState({ kind: "import", path: "" })} disabled={loading || workingAction !== null}>
                <CloudUpload className="mr-1.5 h-4 w-4" />
                导入备份
              </Button>
              <Button variant="primary" size="sm" onClick={() => void handleCreateBackup()} disabled={workingAction === "create" || loading}>
                {workingAction === "create" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Database className="mr-1.5 h-4 w-4" />}
                {workingAction === "create" ? "创建中..." : "创建备份"}
              </Button>
            </>
          }
        />

        {loading ? <Card className="p-6 text-sm text-zinc-600">正在读取实例备份…</Card> : null}
        {error ? <Card className="border-red-200 bg-red-50/80 p-6 text-sm text-red-900 whitespace-pre-wrap">{error}</Card> : null}

        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-zinc-950">备份目录已接线</h2>
                  <Badge variant="success">{backupPolicyLabel}</Badge>
                </div>
                <div className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                  {data ? `当前实例的备份保存在 ${data.backupsRoot}` : "实例备份会保存在当前实例的 workspace/backups 目录。"}
                </div>
              </div>
            </div>
            <div className="text-xs text-zinc-500">当前直接以目录内 zip 文件作为备份真相源，不额外发明策略层。</div>
          </div>
        </Card>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">可用备份记录</h2>
          </div>

          {data && data.items.length > 0 ? (
            <div className="space-y-3">
              {data.items.map((backup) => (
                <Card key={backup.id} className="p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-[#faf9f6] text-zinc-700">
                        <HardDrive className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-950">{backup.createdLabel}</div>
                        <div className="mt-1 text-xs text-zinc-500">{backup.fileName}</div>
                      </div>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-3 text-sm xl:grid-cols-4">
                      <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                        <div className="text-xs text-zinc-400">类型</div>
                        <div className="mt-1 font-medium text-zinc-900">{backup.type}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                        <div className="text-xs text-zinc-400">大小</div>
                        <div className="mt-1 font-medium text-zinc-900">{backup.sizeLabel}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                        <div className="text-xs text-zinc-400">范围</div>
                        <div className="mt-1 font-medium text-zinc-900">{backup.scope}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200/80 bg-[#faf9f6] px-3 py-3">
                        <div className="text-xs text-zinc-400">状态</div>
                        <div className="mt-1"><Badge variant={backup.status === "建议保留" ? "warning" : "success"}>{backup.status}</Badge></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => void handleCopyPath(backup.location)}>
                        <Copy className="mr-1.5 h-4 w-4" />
                        复制路径
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void handleRestoreBackup(backup.id)} disabled={workingAction === `restore:${backup.id}`}>
                        {workingAction === `restore:${backup.id}` ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                        {workingAction === `restore:${backup.id}` ? "恢复中..." : "恢复"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleDeleteBackup(backup.id)} disabled={workingAction === `delete:${backup.id}`}>
                        {workingAction === `delete:${backup.id}` ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                        {workingAction === `delete:${backup.id}` ? "删除中..." : "删除"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : !loading ? (
            <Card className="p-6 text-sm text-zinc-600">当前实例还没有备份文件，先创建一份或导入一份 zip 备份再进入恢复链路。</Card>
          ) : null}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-red-700">
              <ShieldAlert className="h-4 w-4" />
              危险维护区
            </h2>
            <p className="mt-1 text-sm text-zinc-500">危险动作与普通维护彻底分离，所有操作都必须经过明确确认，不再保留假禁用入口。</p>
          </div>

          <Card className="overflow-hidden border-red-200">
            <div className="flex flex-col gap-4 border-b border-zinc-200/70 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-950">清空历史备份</div>
                <div className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">会删除当前实例 backup 目录中的所有 zip 文件，但不会影响当前运行中的 Hermes 目录。</div>
              </div>
              <Button variant="danger" size="sm" onClick={() => setDialogState({ kind: "clear" })} disabled={workingAction !== null || backupCount === 0}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                清空备份
              </Button>
            </div>

            <div className="flex flex-col gap-4 bg-red-50/70 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-red-900">{externalImported ? "移除导入实例" : "彻底销毁并卸载实例"}</div>
                <div className="mt-2 max-w-2xl text-sm leading-6 text-red-800">{destroyDescription}</div>
              </div>
              <Button variant="danger" size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => setDialogState({ kind: "destroy", confirmText: "" })} disabled={workingAction !== null || !data}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                {destroyLabel}
              </Button>
            </div>
          </Card>
        </section>

        {latestBackup ? (
          <div className="text-xs text-zinc-500">最近备份：{latestBackup.fileName} · {latestBackup.sizeLabel}</div>
        ) : null}
      </div>

      <Dialog open={dialogState?.kind === "import"} onOpenChange={(open) => (!open ? setDialogState(null) : undefined)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>导入备份</DialogTitle>
            <DialogDescription>选择一个本地 zip 备份文件，导入到当前实例的 backups 目录。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-zinc-600">你可以直接使用文件选择器，或粘贴已经存在的绝对路径。</div>
            <div className="flex gap-2">
              <Input
                value={dialogState?.kind === "import" ? dialogState.path : ""}
                onChange={(event) => setDialogState({ kind: "import", path: event.target.value })}
                placeholder="/absolute/path/to/backup.zip"
              />
              <Button variant="secondary" size="sm" onClick={() => void handlePickImportPath()} disabled={workingAction === "import"}>
                选择文件
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogState(null)} disabled={workingAction === "import"}>取消</Button>
            <Button variant="primary" onClick={() => void handleImportBackup()} disabled={workingAction === "import"}>
              {workingAction === "import" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {workingAction === "import" ? "导入中..." : "确认导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogState?.kind === "clear"} onOpenChange={(open) => (!open ? setDialogState(null) : undefined)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>清空全部备份</DialogTitle>
            <DialogDescription>该操作会删除当前实例 backup 目录中的全部 zip 文件，请确认你已经完成导出或复制路径。</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            当前将删除 {backupCount} 份备份文件，操作不可撤销。
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogState(null)} disabled={workingAction === "clear"}>取消</Button>
            <Button variant="danger" onClick={() => void handleClearBackups()} disabled={workingAction === "clear"}>
              {workingAction === "clear" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {workingAction === "clear" ? "清空中..." : "确认清空"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogState?.kind === "destroy"} onOpenChange={(open) => (!open ? setDialogState(null) : undefined)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{destroyLabel}</DialogTitle>
            <DialogDescription>{destroyDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              请输入实例名称 <span className="font-semibold">{data?.instance.name ?? ""}</span> 以确认操作。
            </div>
            <Input
              value={dialogState?.kind === "destroy" ? dialogState.confirmText : ""}
              onChange={(event) => setDialogState({ kind: "destroy", confirmText: event.target.value })}
              placeholder={data?.instance.name ?? "请输入实例名称"}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogState(null)} disabled={workingAction === "destroy"}>取消</Button>
            <Button variant="danger" onClick={() => void handleDestroyInstance()} disabled={workingAction === "destroy"}>
              {workingAction === "destroy" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {workingAction === "destroy" ? "处理中..." : destroyLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
