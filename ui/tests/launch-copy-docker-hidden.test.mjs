import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const createInstance = read("src/app/pages/CreateInstance.tsx");
const onboarding = read("src/app/pages/Onboarding.tsx");
const dashboard = read("src/app/pages/Dashboard.tsx");
const instancesService = read("src/app/services/instances.ts");

assert.match(
  createInstance,
  /useState<InstallType>\(\(\) => initialType === "remote" \? "docker" : "native"\)/,
  "CreateInstance should default new local instances to the Native path while keeping remote creation internally deployable.",
);

assert.doesNotMatch(
  createInstance,
  />\s*Docker\s*</,
  "CreateInstance primary wizard should not render Docker as a selectable install card before launch.",
);

assert.doesNotMatch(
  [createInstance, onboarding, dashboard].join("\n"),
  /Docker\s*\/\s*Native|本地 Docker|远程 Docker|Docker 服务|Docker 可用性|Docker 实例/,
  "Launch-facing pages should hide Docker deployment wording from the primary flow.",
);

assert.match(
  createInstance,
  /本机安装/,
  "CreateInstance should present local deployment as 本机安装.",
);

assert.match(
  createInstance,
  /服务器部署/,
  "CreateInstance should present remote deployment as 服务器部署.",
);

assert.match(
  instancesService,
  /createLocalDockerInstance/,
  "Hiding Docker in the primary UI must not remove local Docker management capability.",
);

assert.match(
  instancesService,
  /createRemoteDockerInstance/,
  "Hiding Docker in the primary UI must not remove remote Docker management capability.",
);

console.log("launch copy docker hidden assertions passed");
