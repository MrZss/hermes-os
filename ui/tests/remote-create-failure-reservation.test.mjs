import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteInstancePath = path.join(root, "desktop/services/remote-instance.mjs");
const remoteInstanceSource = fs.readFileSync(remoteInstancePath, "utf8");
const remoteInstanceModule = await import(`file://${remoteInstancePath}?t=${Date.now()}`);

assert.equal(
  typeof remoteInstanceModule.isRetryableRemoteCreateReservation,
  "function",
  "remote-instance 应暴露可测试的失败创建占位识别 helper。",
);

assert.equal(
  remoteInstanceModule.isRetryableRemoteCreateReservation({
    type: "remote",
    status: "failed",
    lastError: "/opt/hermes 远程目录不存在。",
  }),
  true,
  "远程目录不存在这类预检失败不应永久占用同名实例。",
);

assert.equal(
  remoteInstanceModule.isRetryableRemoteCreateReservation({
    type: "remote",
    status: "failed",
    lastError: "远程 Docker 容器启动失败。",
  }),
  false,
  "已经进入 Docker 启动阶段的失败记录仍应保留，避免丢失可恢复部署上下文。",
);

assert.match(
  remoteInstanceSource,
  /removeRegisteredInstance/,
  "重试同名远程实例时，应能清理旧版本留下的预检失败占位记录。",
);

assert.match(
  remoteInstanceSource,
  /sameNameRemoteInstances[\s\S]*isRetryableRemoteCreateReservation[\s\S]*blockingDuplicateInstance/s,
  "同名检查应区分真正重复实例和可重试的预检失败占位。",
);

const firstCreatingUpsertIndex = remoteInstanceSource.indexOf("await upsertRegisteredInstance(userDataPath, creatingRecord);");
const directoryPreflightIndex = remoteInstanceSource.indexOf("if (!remoteInspection.data.directory.writable)");
const dockerPreflightIndex = remoteInstanceSource.indexOf("if (!remoteInspection.data.docker.available || !remoteInspection.data.docker.daemonRunning)");
const portPreflightIndex = remoteInstanceSource.indexOf("if (remoteInspection.data.port.available === false)");
const bootstrapIndex = remoteInstanceSource.indexOf("const bootstrapMetadata = {");

assert.ok(firstCreatingUpsertIndex > 0, "远程创建成功进入部署前仍应登记 creating 状态。");
assert.ok(
  firstCreatingUpsertIndex > directoryPreflightIndex
    && firstCreatingUpsertIndex > dockerPreflightIndex
    && firstCreatingUpsertIndex > portPreflightIndex,
  "目录、Docker、端口等预检失败前不应写入实例注册表，否则失败创建会占用同名实例。",
);
assert.ok(
  firstCreatingUpsertIndex < bootstrapIndex,
  "通过预检后应在真正创建远程目录/容器前登记 creating 状态，保留后续部署失败的恢复上下文。",
);

const preflightSource = remoteInstanceSource.slice(directoryPreflightIndex, firstCreatingUpsertIndex);
assert.doesNotMatch(
  preflightSource,
  /upsertRegisteredInstance\(userDataPath,\s*failedRecord\)/,
  "预检失败不能写入 failedRecord；否则路径错误这类失败会污染实例列表并阻塞同名重试。",
);

console.log("remote create failure reservation assertions passed");
