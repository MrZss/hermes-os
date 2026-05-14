import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(repoRoot, relativePath));

for (const requiredPath of [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/workflows/ci.yml",
]) {
  assert.ok(exists(requiredPath), `开源项目应包含 ${requiredPath}`);
}

const readme = read("README.md");
for (const section of [
  "# Hermes Console",
  "## 功能特性",
  "## 快速开始",
  "## 开发",
  "## 打包发布",
  "## 项目结构",
  "## 参与贡献",
  "## 安全",
  "## 许可证",
]) {
  assert.match(readme, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `README 应包含章节：${section}`);
}
for (const command of ["npm ci", "npm run desktop:dev", "npm run build", "npm run pack:all"]) {
  assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `README 应说明命令：${command}`);
}
assert.match(readme, /Hermes Agent/i, "README 应说明与 Hermes Agent 的关系。");
assert.match(readme, /macOS|Windows/, "README 应说明桌面端平台。");
assert.match(readme, /一键安装 Hermes/, "README 应明确产品宗旨是一键安装 Hermes。");
assert.match(readme, /English:[\s\S]*one-click Hermes installation/i, "README 应包含英文版产品描述。");
assert.doesNotMatch(readme, /文档包 v1|不是给外部看的介绍材料/, "根 README 不应再是内部文档包说明。");

const license = read("LICENSE");
assert.match(license, /MIT License/, "开源项目应使用 MIT License。 ");
assert.match(license, /Hermes Console Team/, "LICENSE 应包含版权主体。 ");

const contributing = read("CONTRIBUTING.md");
for (const expected of ["开发流程", "提交规范", "Pull Request", "npm run build"]) {
  assert.match(contributing, new RegExp(expected), `CONTRIBUTING 应包含 ${expected}`);
}

const security = read("SECURITY.md");
assert.match(security, /Supported Versions|支持版本/, "SECURITY 应说明支持版本。 ");
assert.match(security, /vulnerability|安全/i, "SECURITY 应说明漏洞反馈方式。 ");

const codeOfConduct = read("CODE_OF_CONDUCT.md");
assert.match(codeOfConduct, /Contributor Covenant|贡献者公约/, "CODE_OF_CONDUCT 应采用常见开源社区行为准则。 ");

const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
for (const expected of ["Summary", "Test Plan", "Checklist"]) {
  assert.match(prTemplate, new RegExp(expected), `PR 模板应包含 ${expected}`);
}

const ci = read(".github/workflows/ci.yml");
for (const expected of ["npm ci", "npm run build", "ui/tests/*.test.mjs"]) {
  assert.match(ci, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `CI 应执行 ${expected}`);
}
assert.match(ci, /working-directory:\s+ui/, "CI 应在 ui 目录运行 Node 命令。 ");

const pkg = JSON.parse(read("ui/package.json"));
assert.equal(pkg.license, "MIT", "package.json 应声明 MIT license。 ");
assert.notEqual(pkg.private, true, "开源项目 package.json 不应标记为 private true。 ");
assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.includes("electron"), "package.json 应包含 GitHub/NPM 常见关键词。 ");
assert.match(pkg.description, /One-click Hermes installer/i, "package.json description 应体现一键安装 Hermes 的定位。");

console.log("open source project metadata assertions passed");
