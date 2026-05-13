import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootLayout = fs.readFileSync(path.join(root, "src/app/layout/RootLayout.tsx"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "src/app/pages/Dashboard.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "src/app/pages/instance/Overview.tsx"), "utf8");
const onboarding = fs.readFileSync(path.join(root, "src/app/pages/Onboarding.tsx"), "utf8");
const legacySidebar = fs.readFileSync(path.join(root, "src/app/components/layout/Sidebar.tsx"), "utf8");

assert.doesNotMatch(rootLayout, /label:\s*"日志"|label:\s*"备份"|\/logs`|\/backups`/, "Primary workspace sidebar should temporarily hide Logs and Backups entries.");
assert.doesNotMatch(legacySidebar, /t\("logs"\)|t\("backups"\)|\/logs`|\/backups`/, "Legacy sidebar should also hide Logs and Backups entries if it is rendered.");
assert.doesNotMatch(dashboard, /查看最近实例日志|\/logs`|到备份页移除或销毁实例|\/backups`|实例清理/, "Dashboard should not surface log or backup shortcuts while these modules are hidden.");
assert.doesNotMatch(overview, /查看日志|\/logs`|备份页处理备份|\/backups`|实例清理/, "Instance overview should not surface log or backup shortcuts while these modules are hidden.");
assert.doesNotMatch(onboarding, /日志与备份页/, "Onboarding should not promise hidden Logs/Backups pages.");

console.log("temporary hide logs/backups assertions passed");
