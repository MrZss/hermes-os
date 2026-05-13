import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  createInstance,
  /const visibleChecks = checks\.filter/,
  "Environment checks should default to visible issues instead of rendering every passing technical check",
);

assert.match(
  createInstance,
  /环境检查通过/,
  "Environment section should show one compact success state when there are no issues",
);

assert.match(
  createInstance,
  /const deployStageRows = getDeployStageRows/,
  "Deployment loading should render business-stage progress instead of raw command lines",
);

assert.match(
  createInstance,
  /查看技术详情/,
  "Raw installer output should be hidden behind a technical-details toggle",
);

assert.match(
  createInstance,
  /实时输出/,
  "Collapsed technical details should still expose live technical output when needed",
);

assert.doesNotMatch(
  createInstance,
  /CLI 输出/,
  "Create instance page should not surface CLI output as a primary section",
);

assert.doesNotMatch(
  createInstance,
  />\s*执行 hermes gateway run --replace/,
  "Deployment loading should not show raw gateway commands in the primary UI",
);

assert.doesNotMatch(
  createInstance,
  /label: "消息接入"/,
  "Create-instance summary should not include integration setup that belongs to the integration page",
);

console.log("create instance UI simplification assertions passed");
