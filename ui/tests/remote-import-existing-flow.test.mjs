import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const remoteImportService = read("desktop/services/import-existing-remote-instance.mjs");
const preload = read("desktop/preload.mjs");
const main = read("desktop/main.mjs");
const desktopTypes = read("src/hermes-desktop.d.ts");
const instanceServices = read("src/app/services/instances.ts");
const importDialog = read("src/app/components/console/ImportExistingInstanceDialog.tsx");
const overview = read("src/app/pages/instance/Overview.tsx");
const deployment = read("src/app/pages/instance/Deployment.tsx");

assert.match(
  remoteImportService,
  /export async function scanImportableRemoteInstances/,
  "远程导入服务应暴露扫描可导入远程实例的能力。",
);
assert.match(
  remoteImportService,
  /export async function importExistingRemoteInstance/,
  "远程导入服务应暴露正式导入远程实例的能力。",
);
assert.match(
  remoteImportService,
  /hermes\.console\.managed=true/,
  "远程导入扫描应只识别 Console 受管容器。",
);
assert.match(
  remoteImportService,
  /hermes\.console\.creator=desktop-client/,
  "远程导入扫描应只识别 desktop-client 创建的容器。",
);
assert.match(
  remoteImportService,
  /same remote container is already registered|该远程实例已存在于 Console 中|REMOTE_IMPORT_ALREADY_REGISTERED/,
  "远程导入应处理同一远程容器重复导入的冲突，而不是直接生成重复注册。",
);

assert.match(preload, /scanImportableRemoteInstances:/, "preload 应暴露远程实例扫描 API。");
assert.match(preload, /importExistingRemoteInstance:/, "preload 应暴露远程实例导入 API。");
assert.match(main, /hermes:scanImportableRemoteInstances/, "main IPC 应注册远程实例扫描处理器。");
assert.match(main, /hermes:importExistingRemoteInstance/, "main IPC 应注册远程实例导入处理器。");

assert.match(desktopTypes, /interface HermesScanImportableRemoteInstancesInput/, "桌面类型应声明远程实例扫描输入。");
assert.match(desktopTypes, /interface HermesImportExistingRemoteInstanceInput/, "桌面类型应声明远程实例导入输入。");
assert.match(instanceServices, /export async function scanImportableRemoteInstances/, "前端实例服务应包装远程实例扫描接口。");
assert.match(instanceServices, /export async function importExistingRemoteInstance/, "前端实例服务应包装远程实例导入接口。");

assert.match(importDialog, /远程/, "导入对话框应提供远程导入入口。");
assert.match(importDialog, /desktop-client|客户端创建/, "导入对话框应明确只导入客户端创建的远程实例。");
assert.match(importDialog, /defaultMode\?:\s*"local"\s*\|\s*"remote"/, "导入对话框应支持默认切到远程导入模式。");
assert.match(importDialog, /defaultRemoteConnection\?:/, "导入对话框应支持预填当前远程连接信息。");

assert.match(overview, /ImportExistingInstanceDialog/, "远程概况页应能直接拉起导入实例弹窗。");
assert.match(overview, /重新扫描并导入|重新导入/, "远程概况页应提供丢失容器后的恢复入口。");
assert.match(deployment, /ImportExistingInstanceDialog/, "部署管理页应能直接拉起导入实例弹窗。");
assert.match(deployment, /重新扫描并导入|重新导入/, "部署管理页应提供丢失容器后的恢复入口。");

console.log("remote import existing flow assertions passed");
