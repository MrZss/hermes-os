import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const card = read("src/app/components/ui/card.tsx");
const badge = read("src/app/components/ui/badge.tsx");
const overview = read("src/app/pages/instance/Overview.tsx");

assert.match(
  card,
  /min-w-0/,
  "Base Card should be allowed to shrink inside responsive grids and flex containers instead of forcing horizontal overflow.",
);
assert.match(
  card,
  /overflow-hidden/,
  "Base Card should contain accidental child overflow within its rounded boundary.",
);
assert.match(
  card,
  /\[overflow-wrap:anywhere\]/,
  "Base Card should wrap long paths, URLs, model names, and provider IDs at arbitrary points when needed.",
);
assert.match(
  badge,
  /max-w-full/,
  "Badges should not force card width when status/model text becomes long.",
);
assert.match(
  badge,
  /\[overflow-wrap:anywhere\]/,
  "Badges should be able to wrap long labels inside cards instead of overflowing.",
);
assert.match(
  overview,
  /className="[^"]*min-w-0[^"]*"/,
  "Overview stat values should wrap inside cards instead of overflowing from flex rows.",
);
assert.match(
  overview,
  /break-words/,
  "Overview detail/value cards should explicitly wrap filesystem paths and URLs.",
);

for (const filePath of [
  "src/app/pages/Settings.tsx",
  "src/app/pages/instance/Providers.tsx",
  "src/app/pages/instance/Profiles.tsx",
  "src/app/pages/instance/Integrations.tsx",
]) {
  const source = read(filePath);
  assert.doesNotMatch(
    source,
    /const summaryCardClassName = "(?![^"]*min-w-0[^"]*overflow-hidden[^"]*\[overflow-wrap:anywhere\])/,
    `${filePath} summary cards should inherit the same shrink/wrap/contain safeguards as base cards.`,
  );
}

console.log("card overflow resilience assertions passed");
