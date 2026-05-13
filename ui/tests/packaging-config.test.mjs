import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
assert.match(viteConfig, /optimizeDeps:\s*\{[\s\S]*?entries:\s*\[\s*["']index\.html["']\s*\]/, "Vite 依赖扫描应只使用入口 index.html，避免把 release 安装包目录里的 HTML 当入口扫描。 ");
assert.match(viteConfig, /ignored:\s*\[\s*["']\*\*\/release\/\*\*["']\s*\]/, "Vite dev watch 应忽略 release 安装包目录。 ");

assert.equal(pkg.main, "desktop/main.mjs", "安装包入口必须指向 Electron 主进程。");
assert.ok(pkg.author, "安装包元数据应包含 author，避免 electron-builder 元数据告警。");
assert.match(pkg.devDependencies?.["electron-builder"] ?? "", /^\^?\d+\.\d+\.\d+/, "应固定声明 electron-builder 打包依赖。");

for (const scriptName of ["pack:mac", "pack:mac:x64", "pack:mac:arm64", "pack:win", "pack:all"]) {
  assert.ok(pkg.scripts?.[scriptName], `应提供 ${scriptName} 打包脚本。`);
  assert.match(pkg.scripts[scriptName], /npm run build/, `${scriptName} 应先构建前端 dist。`);
}

assert.equal(pkg.build?.appId, "com.hermes.console", "安装包应使用稳定 appId。");
assert.equal(pkg.build?.directories?.output, "release", "打包产物应统一输出到 ui/release。");
assert.deepEqual(pkg.build?.files, ["dist/**/*", "desktop/**/*", "package.json"], "安装包只应包含运行所需文件。 ");
assert.equal(pkg.build?.mac?.icon, "desktop/assets/hermes-console-icon.icns", "mac 安装包必须使用自定义 icns 图标。");
assert.equal(pkg.build?.win?.icon, "desktop/assets/hermes-console-icon.ico", "Windows 安装包必须使用自定义 ico 图标。");
assert.ok(fs.existsSync(path.join(root, "desktop/assets/hermes-console-icon.icns")), "mac 图标文件必须存在。 ");
assert.ok(fs.existsSync(path.join(root, "desktop/assets/hermes-console-icon.ico")), "Windows 图标文件必须存在。 ");

const macTargets = JSON.stringify(pkg.build?.mac?.target ?? []);
assert.match(macTargets, /dmg/, "mac 打包应产出 dmg。 ");
assert.match(macTargets, /zip/, "mac 打包应产出 zip 备用包。 ");
assert.match(macTargets, /x64/, "mac 打包应产出 Intel x64 安装包。 ");
assert.match(macTargets, /arm64/, "mac 打包应产出 Apple Silicon arm64 安装包。 ");
assert.match(pkg.build?.mac?.artifactName ?? "", /\$\{arch\}/, "mac 安装包文件名必须包含架构，方便下载区分。 ");
assert.match(pkg.build?.mac?.artifactName ?? "", /^Hermes-Console-/, "mac 安装包文件名不应包含空格，避免 GitHub Release 自动改名。 ");
assert.match(pkg.build?.win?.artifactName ?? "", /^Hermes-Console-/, "Windows 便携包文件名不应包含空格，避免 GitHub Release 自动改名。 ");
assert.match(pkg.build?.nsis?.artifactName ?? "", /^Hermes-Console-/, "Windows 安装包文件名不应包含空格，避免 GitHub Release 自动改名。 ");

const winTargets = JSON.stringify(pkg.build?.win?.target ?? []);
assert.match(winTargets, /nsis/, "Windows 打包应产出 NSIS 安装包。 ");
assert.match(winTargets, /portable/, "Windows 打包应产出 portable 备用包。 ");
assert.match(winTargets, /x64/, "Windows 打包应覆盖 x64。 ");
assert.equal(pkg.build?.nsis?.oneClick, false, "Windows 安装包应允许用户确认安装路径。 ");
assert.equal(pkg.build?.nsis?.allowToChangeInstallationDirectory, true, "Windows 安装包应允许选择安装目录。 ");

console.log("packaging config assertions passed");
