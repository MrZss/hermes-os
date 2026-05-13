import assert from "node:assert/strict";

const modulePath = new URL("../desktop/services/instance-state.mjs", import.meta.url);
const stateModule = await import(modulePath);

assert.equal(typeof stateModule.extractRemoteContainerMetadata, "function", "instance-state 应导出 remote 容器元数据提取 helper");
assert.equal(typeof stateModule.applyRemoteRegistrySelfHeal, "function", "instance-state 应导出远程注册表自愈 helper");

const remoteInstance = {
  id: "remote-gateway",
  name: "远程网关节点",
  type: "remote",
  runtime: "docker",
  hermesHome: "/volume1/homes/hermes/hermes/remote-gateway/home",
  workspaceDir: "/volume1/homes/hermes/hermes/remote-gateway",
  endpoint: "ssh://192.0.2.10:22",
  status: "warning",
  createdAt: "2026-05-04T10:00:00.000Z",
  lastCheckedAt: "2026-05-04T10:05:00.000Z",
  docker: {
    image: "nousresearch/hermes-agent:latest",
    containerName: "hermes-console-remote-gateway-old",
    publishedPort: 8645,
    containerPort: 8642,
    command: ["gateway", "run"],
  },
  remote: {
    host: "192.0.2.10",
    port: "22",
    user: "deploy",
    authMode: "password",
    workdir: "/volume1/homes/hermes/hermes",
  },
};

const inspectedContainer = {
  Name: "/hermes-console-remote-gateway-new",
  Config: {
    Image: "nousresearch/hermes-agent:latest",
    Cmd: ["gateway", "run"],
  },
  Mounts: [
    {
      Source: "/volume1/homes/hermes/hermes/remote-gateway/home",
      Destination: "/opt/data",
    },
  ],
  NetworkSettings: {
    Ports: {
      "8642/tcp": [
        { HostPort: "8650" },
      ],
    },
  },
};

const metadata = stateModule.extractRemoteContainerMetadata(inspectedContainer);
assert.deepEqual(
  metadata,
  {
    containerName: "hermes-console-remote-gateway-new",
    publishedPort: 8650,
    hermesHome: "/volume1/homes/hermes/hermes/remote-gateway/home",
    workspaceDir: "/volume1/homes/hermes/hermes/remote-gateway",
    image: "nousresearch/hermes-agent:latest",
    command: ["gateway", "run"],
  },
  "应从远程 docker inspect 结果中提取可用于回填注册表的关键元数据",
);

const healed = stateModule.applyRemoteRegistrySelfHeal(remoteInstance, metadata);
assert.equal(healed.docker.containerName, "hermes-console-remote-gateway-new", "应在容器名漂移后自动回填新容器名");
assert.equal(healed.docker.publishedPort, 8650, "应在端口漂移后自动回填新 publishedPort");
assert.equal(healed.hermesHome, remoteInstance.hermesHome, "自愈不应篡改已确认的 hermesHome");
assert.equal(healed.workspaceDir, remoteInstance.workspaceDir, "自愈不应篡改已确认的 workspaceDir");
assert.equal(healed.lastError, remoteInstance.lastError, "仅元数据自愈时不应额外覆盖错误信息");

const unchanged = stateModule.applyRemoteRegistrySelfHeal(remoteInstance, null);
assert.equal(unchanged, remoteInstance, "没有发现匹配容器时应保持原实例记录不变");

console.log("remote registry self-heal assertions passed");
