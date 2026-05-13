import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const rootLayout = read("src/app/layout/RootLayout.tsx");
const dashboard = read("src/app/pages/Dashboard.tsx");
const overview = read("src/app/pages/instance/Overview.tsx");
const createInstance = read("src/app/pages/CreateInstance.tsx");

assert.match(rootLayout, /to="\/" icon=\{LayoutDashboard\} label="主页"/, "Root nav should call the root page 主页");
assert.doesNotMatch(rootLayout, /to="\/" icon=\{LayoutDashboard\} label="概览"/, "Root nav should not call the root page 概览");
assert.doesNotMatch(rootLayout, /新建实例/, "Root layout should not duplicate the create-instance action");
assert.match(rootLayout, /activeInstance \? "工作区" : "实例列表"/, "Sidebar section title should switch between 实例列表 and 工作区");
assert.match(rootLayout, /\{activeInstance \? \(\s*<div className="mb-5">/, "Current instance block should render only after an instance is selected");
assert.doesNotMatch(rootLayout, /尚未选中实例/, "Sidebar should not show an unselected current-instance placeholder");
assert.doesNotMatch(rootLayout, /ChevronDown/, "Current instance card should not look like a switch dropdown");

assert.match(dashboard, /title="主页"/, "Dashboard page title should be 主页");
const dashboardCreateNavigations = dashboard.match(/navigate\("\/create/g) ?? [];
assert.equal(dashboardCreateNavigations.length, 1, "Dashboard should keep exactly one create-instance navigation");
assert.doesNotMatch(dashboard, /创建本地实例/, "Dashboard empty state should not duplicate create-instance action");

assert.match(overview, /返回主页/, "Missing-instance state should send users back to 主页");
assert.match(createInstance, /返回主页/, "Create instance flow should use 返回主页 wording");

console.log("navigation simplification assertions passed");
