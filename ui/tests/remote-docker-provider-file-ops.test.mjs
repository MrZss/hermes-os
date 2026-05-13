import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(root, "desktop/services/remote-docker-files.mjs");
const actionsPath = path.join(root, "desktop/services/hermes-official-actions.mjs");
const providerTestsPath = path.join(root, "desktop/services/provider-tests.mjs");
const statePath = path.join(root, "desktop/services/hermes-official-state.mjs");
const workspacePath = path.join(root, "desktop/services/workspace-state.mjs");
const runtimePath = path.join(root, "desktop/services/instance-runtime.mjs");

assert.ok(
  fs.existsSync(helperPath),
  "远程 Docker 实例的 Hermes home 由容器内 /opt/data 持有，必须提供容器内读写 helper，不能再直接读写 SSH 主机路径。",
);

const {
  isRemoteDockerInstance,
  mapRemoteDockerDataPath,
  runRemoteDockerHermesCommand,
  runRemoteDockerPythonScript,
} = await import(pathToFileURL(helperPath));
const instance = {
  type: "remote",
  runtime: "docker",
  hermesHome: "/var/services/homes/hermes/hermes/5555/home",
  docker: { containerName: "hermes-console-5555-motiwuni" },
};

assert.equal(isRemoteDockerInstance(instance), true, "remote + docker + containerName 应被识别为远程 Docker 实例。");
assert.equal(typeof runRemoteDockerHermesCommand, "function", "远程 Docker Hermes CLI 操作必须统一通过 docker exec hermes helper。",);
assert.equal(typeof runRemoteDockerPythonScript, "function", "远程 Docker Python 读工作区数据必须统一通过 docker exec python helper。",);
assert.equal(
  mapRemoteDockerDataPath(instance, "/var/services/homes/hermes/hermes/5555/home/config.yaml"),
  "/opt/data/config.yaml",
  "默认 profile 配置应从主机 Hermes home 映射到容器 /opt/data。",
);
assert.equal(
  mapRemoteDockerDataPath(instance, "/var/services/homes/hermes/hermes/5555/home/profiles/work/.env"),
  "/opt/data/profiles/work/.env",
  "非默认 profile .env 应映射到容器 /opt/data/profiles/<profile>。",
);
assert.equal(mapRemoteDockerDataPath(instance, "/opt/data/.env"), "/opt/data/.env", "容器内路径应保持不变。");
assert.equal(mapRemoteDockerDataPath(instance, "/tmp/config.yaml"), null, "非 Hermes home 文件不能被误映射进容器。",);

const actions = fs.readFileSync(actionsPath, "utf8");
const providerTests = fs.readFileSync(providerTestsPath, "utf8");
const state = fs.readFileSync(statePath, "utf8");
const workspace = fs.readFileSync(workspacePath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

assert.match(actions, /remote-docker-files\.mjs/, "保存供应商配置的动作层必须接入远程 Docker 文件 helper。",);
assert.match(actions, /applyRemoteDockerConfigEntries/, "远程 Docker 保存 config.yaml 必须绕过远程主机 hermes CLI，改为写容器内 /opt/data/config.yaml。",);
assert.match(actions, /writeRemoteDockerTextFile/, "远程 Docker 写 .env 必须通过 docker exec 写入容器内文件，避免 SSH 用户无权限写 host volume。",);
assert.match(actions, /runRemoteDockerHermesCommand/, "远程 Docker 的 profile/OAuth 等 Hermes CLI 动作也必须通过容器内 hermes 执行。",);
assert.match(providerTests, /remote-docker-files\.mjs/, "供应商测试读取配置时必须从远程 Docker 容器内读取 config/.env/auth。",);
assert.match(providerTests, /runRemoteDockerHermesCommand/, "远程 Docker 的 provider doctor 测试不能再调用宿主机 hermes。",);
assert.match(state, /remote-docker-files\.mjs/, "官方供应商状态回读必须支持远程 Docker 容器内文件。",);
assert.match(workspace, /runRemoteDockerPythonScript/, "远程 Docker 工作区 state.db 读取必须在容器内执行，避免 SSH 用户无权限读宿主机 volume。",);
assert.match(workspace, /runRemoteDockerHermesCommand/, "远程 Docker 会话命令必须在容器内执行 hermes。",);
assert.match(runtime, /runRemoteDockerHermesCommand/, "远程 Docker 诊断不能因宿主机没有 hermes CLI 而误报，应在容器内执行 status/doctor。",);
assert.match(runtime, /readRemoteDockerTextFile/, "远程 Docker 日志读取必须优先读容器内 /opt/data/logs，不能直接 tail 宿主机受限 volume。",);
assert.match(
  providerTests,
  /if \(isRemoteDockerInstance\(instance\)\) \{[\s\S]*?return runRemoteDockerHermesCommand\(instance, scopedArgs/,
  "provider 测试必须在进入通用远程 SSH Hermes CLI 分支前先处理 remote+docker。",
);

console.log("remote docker provider file ops assertions passed");
