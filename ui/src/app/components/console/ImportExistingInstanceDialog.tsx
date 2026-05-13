import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Server } from "lucide-react";
import {
  importExistingLocalInstance,
  importExistingRemoteInstance,
  scanImportableRemoteInstances,
  type ImportExistingLocalInstancePayload,
  type ImportExistingRemoteInstancePayload,
  type ImportableRemoteInstanceEntry,
  type ScanImportableRemoteInstancesInput,
  type ScanImportableRemoteInstancesPayload,
} from "../../services/instances";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface ImportExistingInstanceDialogProps {
  trigger: ReactNode;
  onImported?: (payload: ImportExistingLocalInstancePayload | ImportExistingRemoteInstancePayload) => void | Promise<void>;
  defaultMode?: "local" | "remote";
  defaultRemoteConnection?: Partial<ScanImportableRemoteInstancesInput>;
}

type ImportMode = "local" | "remote";

function inferDefaultName(hermesHome: string) {
  const normalized = hermesHome.trim().replace(/\/$/, "");
  if (!normalized) return "默认 Hermes 环境";
  if (normalized.endsWith("/.hermes") || normalized === ".hermes") {
    return "默认 Hermes 环境";
  }

  const baseName = normalized.split("/").filter(Boolean).pop();
  return baseName ? `${baseName} 实例` : "默认 Hermes 环境";
}

function statusBadge(status: ImportableRemoteInstanceEntry["status"]) {
  if (status === "running") return { label: "运行中", variant: "success" as const };
  if (status === "stopped") return { label: "已停止", variant: "outline" as const };
  if (status === "creating") return { label: "创建中", variant: "warning" as const };
  return { label: "待关注", variant: "warning" as const };
}

export function ImportExistingInstanceDialog({
  trigger,
  onImported,
  defaultMode = "local",
  defaultRemoteConnection,
}: ImportExistingInstanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("local");

  const [name, setName] = useState("");
  const [hermesHome, setHermesHome] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("22");
  const [remoteUser, setRemoteUser] = useState("");
  const [remotePassword, setRemotePassword] = useState("");
  const [remoteKeyPath, setRemoteKeyPath] = useState("");
  const [remoteAuthMode, setRemoteAuthMode] = useState<"password" | "ssh_key">("password");
  const [scanning, setScanning] = useState(false);
  const [remoteScan, setRemoteScan] = useState<ScanImportableRemoteInstancesPayload | null>(null);
  const [importingContainer, setImportingContainer] = useState<string | null>(null);

  const defaultHermesHome = useMemo(() => {
    const homeDirectory = window.hermesDesktop?.homeDirectory || "~";
    return `${homeDirectory}/.hermes`;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode(defaultMode);
    setHermesHome(defaultHermesHome);
    setName(inferDefaultName(defaultHermesHome));
    setRemoteHost(defaultRemoteConnection?.host?.trim() || "");
    setRemotePort(defaultRemoteConnection?.port?.trim() || "22");
    setRemoteUser(defaultRemoteConnection?.user?.trim() || "");
    setRemotePassword(defaultRemoteConnection?.password || "");
    setRemoteKeyPath(defaultRemoteConnection?.keyPath?.trim() || "");
    setRemoteAuthMode(defaultRemoteConnection?.authMode === "ssh_key" ? "ssh_key" : defaultRemoteConnection?.authMode === "password" ? "password" : "password");
    setRemoteScan(null);
    setSubmitting(false);
    setScanning(false);
    setImportingContainer(null);
  }, [defaultHermesHome, defaultMode, defaultRemoteConnection, open]);

  useEffect(() => {
    if (!open || mode !== "local") return;
    if (!name.trim() || name === inferDefaultName(hermesHome)) {
      setName(inferDefaultName(hermesHome));
    }
  }, [hermesHome, mode, name, open]);

  async function handleLocalSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const result = await importExistingLocalInstance({
        name: name.trim() || inferDefaultName(hermesHome),
        hermesHome,
      });

      if (!result.ok || !result.data) {
        setError(result.error?.detail ?? result.error?.message ?? "导入现有 Hermes 环境失败。");
        return;
      }

      await onImported?.(result.data);
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "导入现有 Hermes 环境失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoteScan() {
    setScanning(true);
    setError(null);
    setRemoteScan(null);

    try {
      const result = await scanImportableRemoteInstances({
        host: remoteHost,
        port: remotePort,
        user: remoteUser,
        authMode: remoteAuthMode,
        keyPath: remoteAuthMode === "ssh_key" ? remoteKeyPath : undefined,
        password: remoteAuthMode === "password" ? remotePassword : undefined,
      });

      if (!result.ok || !result.data) {
        setError(result.error?.detail ?? result.error?.message ?? "扫描远程实例失败。");
        return;
      }

      setRemoteScan(result.data);
      if (result.data.candidates.length === 0) {
        setError("当前远程主机未发现可导入实例。这里只会显示带 desktop-client 标记的客户端创建实例。");
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "扫描远程实例失败。");
    } finally {
      setScanning(false);
    }
  }

  async function handleRemoteImport(candidate: ImportableRemoteInstanceEntry) {
    setImportingContainer(candidate.containerName);
    setError(null);

    try {
      const result = await importExistingRemoteInstance({
        host: remoteHost,
        port: remotePort,
        user: remoteUser,
        authMode: remoteAuthMode,
        keyPath: remoteAuthMode === "ssh_key" ? remoteKeyPath : undefined,
        password: remoteAuthMode === "password" ? remotePassword : undefined,
        containerName: candidate.containerName,
        name: candidate.name,
      });

      if (!result.ok || !result.data) {
        setError(result.error?.detail ?? result.error?.message ?? "导入远程实例失败。");
        return;
      }

      await onImported?.(result.data);
      setOpen(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入远程实例失败。");
    } finally {
      setImportingContainer(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>导入现有实例</DialogTitle>
          <DialogDescription>
            本地导入不会改写原目录。远程导入当前只识别带 <span className="font-medium text-zinc-700">desktop-client</span> 标记、由客户端创建过的远程实例。
            导入后会读取 AI 提供商和消息平台状态，缺少配置时会在使用页提示补齐。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex gap-2">
            <Button variant={mode === "local" ? "primary" : "secondary"} size="sm" onClick={() => setMode("local")} disabled={submitting || scanning || Boolean(importingContainer)}>
              本地 Hermes
            </Button>
            <Button variant={mode === "remote" ? "primary" : "secondary"} size="sm" onClick={() => setMode("remote")} disabled={submitting || scanning || Boolean(importingContainer)}>
              远程实例
            </Button>
          </div>

          {mode === "local" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="import-instance-name">实例名称</Label>
                <Input
                  id="import-instance-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：默认 Hermes 环境"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-instance-home">HERMES_HOME 路径</Label>
                <Input
                  id="import-instance-home"
                  value={hermesHome}
                  onChange={(event) => setHermesHome(event.target.value)}
                  placeholder="例如：/Users/you/.hermes"
                  disabled={submitting}
                />
                <div className="text-xs leading-5 text-zinc-500">
                  请输入 Hermes 根目录，而不是单个 profile 子目录。默认建议导入 {defaultHermesHome}。
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-zinc-200 bg-[#faf9f6] px-4 py-3 text-sm leading-6 text-zinc-600">
                这里只会扫描 <span className="font-medium text-zinc-900">客户端创建</span> 的远程实例，也就是同时带有
                <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-[12px]">hermes.console.managed=true</code>
                和
                <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-[12px]">hermes.console.creator=desktop-client</code>
                的实例。
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="remote-import-host">远程主机 / IP</Label>
                  <Input id="remote-import-host" value={remoteHost} onChange={(event) => setRemoteHost(event.target.value)} placeholder="例如：192.0.2.10" disabled={scanning || Boolean(importingContainer)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="remote-import-port">SSH 端口</Label>
                  <Input id="remote-import-port" value={remotePort} onChange={(event) => setRemotePort(event.target.value)} placeholder="22" disabled={scanning || Boolean(importingContainer)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="remote-import-user">SSH 用户</Label>
                  <Input id="remote-import-user" value={remoteUser} onChange={(event) => setRemoteUser(event.target.value)} placeholder="例如：deploy" disabled={scanning || Boolean(importingContainer)} />
                </div>
                <div className="space-y-2">
                  <Label>认证方式</Label>
                  <div className="flex gap-2">
                    <Button variant={remoteAuthMode === "password" ? "primary" : "secondary"} size="sm" onClick={() => setRemoteAuthMode("password")} disabled={scanning || Boolean(importingContainer)}>
                      密码
                    </Button>
                    <Button variant={remoteAuthMode === "ssh_key" ? "primary" : "secondary"} size="sm" onClick={() => setRemoteAuthMode("ssh_key")} disabled={scanning || Boolean(importingContainer)}>
                      SSH 私钥
                    </Button>
                  </div>
                </div>
              </div>

              {remoteAuthMode === "password" ? (
                <div className="space-y-2">
                  <Label htmlFor="remote-import-password">SSH 密码</Label>
                  <Input id="remote-import-password" type="password" value={remotePassword} onChange={(event) => setRemotePassword(event.target.value)} placeholder="输入远程登录密码" disabled={scanning || Boolean(importingContainer)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="remote-import-key">SSH 私钥路径</Label>
                  <Input id="remote-import-key" value={remoteKeyPath} onChange={(event) => setRemoteKeyPath(event.target.value)} placeholder="例如：~/.ssh/id_rsa" disabled={scanning || Boolean(importingContainer)} />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void handleRemoteScan()}
                  disabled={scanning || Boolean(importingContainer) || !remoteHost.trim() || !remoteUser.trim() || (remoteAuthMode === "password" ? !remotePassword : !remoteKeyPath.trim())}
                >
                  {scanning ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                  {scanning ? "扫描中..." : "扫描可导入实例"}
                </Button>
                {remoteScan ? (
                  <div className="text-xs text-zinc-500">
                    已连接 {remoteScan.user}@{remoteScan.host}:{remoteScan.port}，共发现 {remoteScan.candidates.length} 个候选实例。
                  </div>
                ) : null}
              </div>

              {remoteScan?.candidates?.length ? (
                <div className="space-y-3">
                  {remoteScan.candidates.map((candidate) => {
                    const badge = statusBadge(candidate.status);
                    const isImporting = importingContainer === candidate.containerName;
                    return (
                      <div key={candidate.containerName} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-zinc-500" />
                              <div className="truncate text-sm font-semibold text-zinc-950">{candidate.name}</div>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </div>
                            <div className="mt-2 space-y-1 text-xs leading-5 text-zinc-600">
                              <div>服务标识：{candidate.containerName}</div>
                              <div>运行版本：{candidate.image}</div>
                              <div>目录：{candidate.workspaceDir}</div>
                              <div>端口：{candidate.gatewayPort} → 8642</div>
                            </div>
                          </div>
                          <Button variant="primary" size="sm" onClick={() => void handleRemoteImport(candidate)} disabled={Boolean(importingContainer) || scanning}>
                            {isImporting ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                            {isImporting ? "导入中..." : "导入管理"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting || scanning || Boolean(importingContainer)}>
            取消
          </Button>
          {mode === "local" ? (
            <Button variant="primary" onClick={() => void handleLocalSubmit()} disabled={submitting || !hermesHome.trim()}>
              {submitting ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {submitting ? "导入中..." : "导入现有环境"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
