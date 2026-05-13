import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(uiRoot, "..");

const usageDocPath = path.join(repoRoot, "docs/USAGE.md");
const readmePath = path.join(repoRoot, "README.md");

assert.ok(fs.existsSync(usageDocPath), "开源发布必须提供 docs/USAGE.md 使用说明。");

const readme = fs.readFileSync(readmePath, "utf8");
assert.match(readme, /docs\/USAGE\.md/, "README 必须链接到使用说明。");

const usageDoc = fs.readFileSync(usageDocPath, "utf8");
assert.match(usageDoc, /<your-api-key>/, "使用说明只能使用占位 API Key。");
assert.match(usageDoc, /不要提交真实/, "使用说明必须提醒不要提交真实凭据。");

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const skipExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".pdf",
  ".zip",
  ".dmg",
  ".exe",
  ".asar",
  ".mp4",
  ".mov",
  ".woff",
  ".woff2",
  ".ttf",
]);

const exact = (parts) => parts.join("");
const forbiddenPatterns = [
  { label: "OpenRouter API Key", pattern: /sk-or-v1-[A-Za-z0-9_-]+/ },
  { label: "MiMo Token Plan Key", pattern: /tp-[A-Za-z0-9_-]{20,}/ },
  { label: "Telegram Bot Token", pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ },
  { label: "User Remote Password", pattern: new RegExp(`${exact(["Zch", "\\\\.", "8023"])}|${exact(["zch", "\\\\.", "8023"])}`) },
  { label: "User Remote IP", pattern: new RegExp(["192", "168", "1", "27"].join("\\\\.")) },
  { label: "User Telegram ID", pattern: new RegExp(exact(["823", "680", "0467"])) },
  { label: "User Telegram Bot ID", pattern: new RegExp(exact(["874", "694", "8775"])) },
  { label: "User SSH Account", pattern: new RegExp(exact(["Mr", "Zss"])) },
  { label: "Known Bot Token Prefix", pattern: new RegExp(exact(["AA", "Fkx"])) },
];

const findings = [];
for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (skipExtensions.has(extension)) continue;

  const absolutePath = path.join(repoRoot, file);
  let text = "";
  try {
    text = fs.readFileSync(absolutePath, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;

  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(text)) findings.push(`${file}: ${label}`);
  }
}

assert.deepEqual(findings, [], `开源发布文件中不能包含真实密钥或用户测试数据：\n${findings.join("\n")}`);

console.log("release sanitization assertions passed");
