import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  createInstance,
  /提供商与档案（可跳过）/,
  "Create-instance flow should explicitly mark provider/profile setup as skippable.",
);

assert.match(
  createInstance,
  /安装后再配置 AI 提供商与档案/,
  "Step 4 should offer a first-class defer option for provider/profile setup.",
);

assert.match(
  createInstance,
  /本阶段只创建实例，不要求填写 Key/,
  "When provider setup is deferred, the page should explain that keys are configured after installation instead of showing mandatory-looking fields.",
);

assert.match(
  createInstance,
  /if \(step === 4\) \{\s*if \(providerSetupDeferred\) \{\s*return Boolean\(instanceName\.trim\(\)\);/s,
  "Step 4 should only require an instance name when provider setup is deferred.",
);

assert.match(
  createInstance,
  /providerSetupDeferred \? "安装后配置" : providerLabel/,
  "Deployment summary should show that provider setup is deferred instead of pretending a provider is already configured.",
);

assert.match(
  createInstance,
  /const effectiveProviderId = providerSetupDeferred \? undefined : provider;/,
  "Deferred provider setup should omit providerId from the desktop create payload instead of storing an empty provider.",
);

assert.match(
  createInstance,
  /const effectiveModel = providerSetupDeferred \? undefined : model;/,
  "Deferred provider setup should omit model from the desktop create payload so the instance remains visibly unconfigured.",
);

assert.match(
  createInstance,
  /const effectiveProfileName = providerSetupDeferred \? undefined : profileName\.trim\(\);/,
  "Deferred provider setup should omit defaultProfile from the desktop create payload instead of creating a blank profile label.",
);

assert.match(
  createInstance,
  /去配置提供商/,
  "Success state should provide a direct CTA to finish provider setup after installation.",
);

console.log("create instance provider defer assertions passed");
