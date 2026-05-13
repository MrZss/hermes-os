export type InstanceHealth = "normal" | "warning" | "offline";

export interface ConsoleInstance {
  id: string;
  name: string;
  type: "local" | "remote";
  runtime: "docker" | "native" | "ssh";
  scope: "本地实例" | "远程实例";
  platform: string;
  installMethod: "Docker" | "Native";
  version: string;
  gateway: "已连接" | "警告" | "离线";
  api: "已连接" | "警告" | "离线";
  defaultProfile: string;
  currentModel: string;
  provider: string;
  lastActivity: string;
  status: InstanceHealth;
  summary: string;
  endpoint: string;
  security: string;
  runtimeState?: "creating" | "running" | "stopped" | "warning" | "failed" | "unknown";
  workspaceDir?: string;
  hermesHome?: string;
  containerName?: string;
  publishedPort?: number;
  sshTarget?: string;
  lastError?: string;
  lastRecoveredAt?: string;
  lastRecoveryResult?: string;
  lastOperationAt?: string;
  lastOperationType?: string;
  lastOperationResult?: string;
  diagnostics?: {
    dockerDetail?: string;
    gatewayDetail?: string;
    detail?: string;
  };
}

export const consoleInstances: ConsoleInstance[] = [
  {
    id: "local-studio",
    name: "本地创作环境",
    type: "local",
    runtime: "docker",
    scope: "本地实例",
    platform: "macOS 15",
    installMethod: "Docker",
    version: "v1.4.2",
    gateway: "已连接",
    api: "已连接",
    defaultProfile: "默认档案",
    currentModel: "GPT-4o",
    provider: "OpenAI",
    lastActivity: "2 分钟前",
    status: "normal",
    summary: "适合日常开发、调试和本地文件协作。",
    endpoint: "127.0.0.1:8080",
    security: "localhost 安全模式",
  },
  {
    id: "remote-gateway",
    name: "远程网关节点",
    type: "remote",
    runtime: "docker",
    scope: "远程实例",
    platform: "Ubuntu 22.04",
    installMethod: "Docker",
    version: "v1.4.0",
    gateway: "警告",
    api: "已连接",
    defaultProfile: "生产排障档案",
    currentModel: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    lastActivity: "1 小时前",
    status: "warning",
    summary: "通过 SSH 管理远程服务，偏向稳定运维与排障。",
    endpoint: "ssh://10.0.1.24",
    security: "SSH 隧道",
    workspaceDir: "/srv/hermes/remote-gateway",
    containerName: "hermes-remote-gateway",
    publishedPort: 18642,
    sshTarget: "ops@10.0.1.24:22",
    lastError: "最近一次节点巡检发现 Docker 重启后 Gateway 连接抖动。",
    diagnostics: {
      dockerDetail: "Docker daemon 运行中，容器等待健康检查完成。",
      gatewayDetail: "Gateway 可访问，但最近 1 小时发生过一次重连。",
      detail: "SSH 隧道稳定，建议先读取环境并确认容器健康状态。",
    },
  },
  {
    id: "wsl-lab",
    name: "Windows 实验环境",
    type: "local",
    runtime: "native",
    scope: "本地实例",
    platform: "Windows WSL2",
    installMethod: "Native",
    version: "v1.3.9",
    gateway: "离线",
    api: "离线",
    defaultProfile: "前端开发档案",
    currentModel: "Qwen2.5-Coder",
    provider: "自托管 Endpoint",
    lastActivity: "3 天前",
    status: "offline",
    summary: "用于测试原生安装链路与实验模型接入。",
    endpoint: "WSL2 内部网络",
    security: "localhost 安全模式",
  },
];

export const globalActivity = [
  {
    time: "10 分钟前",
    title: "自动快照完成",
    detail: "远程网关节点完成增量备份，写入 24.5 MB。",
    tag: "备份",
    tone: "normal" as const,
  },
  {
    time: "35 分钟前",
    title: "SSH 隧道出现重连",
    detail: "远程网关节点触发一次隧道重连，已自动恢复。",
    tag: "警告",
    tone: "warning" as const,
  },
  {
    time: "昨天 22:14",
    title: "前端开发档案完成同步",
    detail: "Windows 实验环境的集成与档案缓存已成功刷新。",
    tag: "同步",
    tone: "normal" as const,
  },
];

export function getConsoleInstance(id?: string) {
  return consoleInstances.find((instance) => instance.id === id) ?? consoleInstances[0];
}

export function getHealthLabel(status: InstanceHealth) {
  switch (status) {
    case "normal":
      return "正常";
    case "warning":
      return "警告";
    case "offline":
      return "离线";
  }
}
