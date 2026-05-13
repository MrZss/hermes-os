import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const routes = read("src/app/routes.tsx");
const gate = read("src/app/components/console/InstanceSetupGate.tsx");
const readiness = read("src/app/services/setupReadiness.ts");
const providers = read("src/app/pages/instance/Providers.tsx");
const integrations = read("src/app/pages/instance/Integrations.tsx");
const createInstance = read("src/app/pages/CreateInstance.tsx");
const importDialog = read("src/app/components/console/ImportExistingInstanceDialog.tsx");

assert.match(
  readiness,
  /export interface InstanceSetupReadiness/,
  "应新增统一 InstanceSetupReadiness 状态模型。"
);

assert.match(
  readiness,
  /aiReady[\s\S]{0,400}provider\.status === "已连接"[\s\S]{0,400}profile\.model !== "待配置"/,
  "AI readiness 必须同时检查 provider 已连接和当前 profile 有可用模型。"
);

assert.match(
  readiness,
  /messagingReady[\s\S]{0,260}integrations\.some[\s\S]{0,180}integration\.status === "已启用"/,
  "消息平台 readiness 必须检查至少一个原生消息平台已启用。"
);

assert.match(
  readiness,
  /INSTANCE_SETUP_READINESS_REFRESH_EVENT/,
  "配置保存后应有统一刷新事件，供蒙层自动重新读取。"
);

for (const copy of ["还差 AI 提供商", "还差消息平台", "读取状态失败"]) {
  assert.match(gate, new RegExp(copy), `蒙层应展示短句提示：${copy}`);
}

for (const target of ["/providers", "/integrations"]) {
  assert.match(gate, new RegExp(`\\$\\{instanceId\\}${target}`), `蒙层应提供跳转到 ${target} 的按钮。`);
}

assert.match(
  gate,
  /getInstanceOfficialState\(instanceId/,
  "蒙层必须读取真实 Hermes 官方状态，而不是只信注册表。"
);

assert.match(
  gate,
  /window\.addEventListener\(INSTANCE_SETUP_READINESS_REFRESH_EVENT/,
  "蒙层应监听配置刷新事件，保存 AI 或消息平台后自动重新检查。"
);

for (const page of ["Overview", "Chat", "Profiles", "Logs", "Backups"]) {
  assert.match(
    routes,
    new RegExp(`withInstanceSetupGate\\(${page}\\)`),
    `${page} 使用页应被 InstanceSetupGate 包裹。`
  );
}

for (const page of ["Providers", "Integrations", "Environment", "Deployment", "Diagnostics"]) {
  assert.doesNotMatch(
    routes,
    new RegExp(`withInstanceSetupGate\\(${page}\\)`),
    `${page} 是配置/诊断页，不应被蒙层阻断。`
  );
}

assert.match(
  providers,
  /publishInstanceSetupReadinessRefresh\(instanceId,\s*"provider"/,
  "AI 提供商保存、登录或测试后应通知使用页重新检查 readiness。"
);

assert.match(
  integrations,
  /publishInstanceSetupReadinessRefresh\(instanceId,\s*"messaging"/,
  "消息平台保存、扫码或配对后应通知使用页重新检查 readiness。"
);

assert.match(
  createInstance,
  /navigate\(`\/instance\/\$\{deployResult\.instance\.id\}\/providers`\)/,
  "新建实例成功后应继续保留跳转 AI 提供商配置的入口。"
);

assert.match(
  importDialog,
  /导入后会读取 AI 提供商和消息平台状态/,
  "导入现有实例时应明确告知会读取 AI 与消息平台状态。"
);

console.log("instance setup readiness gate assertions passed");
