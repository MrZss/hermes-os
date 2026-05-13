import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const clientActions = read("src/app/services/officialActions.ts");
const providersPage = read("src/app/pages/instance/Providers.tsx");

assert.match(
  clientActions,
  /function formatDesktopActionError\(/,
  "Desktop action errors should be formatted through one UX-safe formatter before reaching provider feedback.",
);
assert.match(
  clientActions,
  /function looksLikeTechnicalTrace\(/,
  "The formatter should detect stack traces and other technical dumps from Hermes CLI.",
);
assert.match(
  clientActions,
  /Traceback \(most recent call last\)/,
  "Python tracebacks from Hermes OAuth failures should be explicitly classified as technical detail.",
);
assert.doesNotMatch(
  clientActions,
  /result\.error\?\.detail\s*\?\?\s*result\.error\?\.message/,
  "unwrapResult must not prefer raw CLI detail over the localized desktop error message.",
);
assert.match(
  clientActions,
  /详情已记录在桌面日志/,
  "Traceback-sized details should be replaced with a concise log hint in the visible UI.",
);

assert.match(
  providersPage,
  /role=\{feedback\.tone === "error" \? "alert" : "status"\}/,
  "Provider action feedback should expose an alert/status role for desktop UI automation.",
);
assert.match(
  providersPage,
  /data-testid="provider-action-feedback"/,
  "Provider action feedback should have a stable test id for desktop flow checks.",
);
assert.match(
  providersPage,
  /data-testid=\{`provider-configure-\$\{item\.id\}`\}/,
  "Provider cards should have stable configure-button test ids for the Electron flow.",
);
assert.match(
  providersPage,
  /data-testid="provider-oauth-start"/,
  "OAuth login should have a stable desktop-test target.",
);
assert.match(
  providersPage,
  /data-testid="provider-test-current"/,
  "Current-provider test action should have a stable desktop-test target.",
);
assert.match(
  providersPage,
  /data-testid="provider-test-selected"/,
  "Drawer-provider test action should have a stable desktop-test target.",
);
assert.match(
  providersPage,
  /data-testid="provider-save-current"/,
  "Provider save action should have a stable desktop-test target.",
);

const desktopActions = read("desktop/services/hermes-official-actions.mjs");
assert.match(
  desktopActions,
  /const PROVIDER_AUTH_TIMEOUT_MS = readPositiveIntegerEnv\("HERMES_PROVIDER_AUTH_TIMEOUT_MS", 300_000\)/,
  "Provider OAuth timeout should be configurable so desktop validation can exercise failure feedback without waiting five minutes.",
);
assert.match(
  desktopActions,
  /timeoutMs:\s*PROVIDER_AUTH_TIMEOUT_MS/,
  "OAuth login should use the named provider auth timeout instead of an opaque hard-coded literal.",
);
assert.doesNotMatch(
  desktopActions,
  /timeoutMs:\s*300_000/,
  "OAuth login should not keep an inline hard-coded timeout at the call site.",
);

assert.match(
  desktopActions,
  /function writeProfileEnvEntries\(/,
  "API Key provider saves should write provider env keys into the profile .env file, not only through hermes config set.",
);
assert.match(
  desktopActions,
  /const envEntries = Object\.entries\(input\.env \?\? \{\}\)/,
  "Provider save should split env entries from model config entries before persistence.",
);
assert.match(
  desktopActions,
  /await writeProfileEnvEntries\(instanceResult\.data\.instance, profileId, envEntries\)/,
  "Provider save should persist API keys into the selected profile .env so state and tests can read them back.",
);
assert.match(
  desktopActions,
  /upsertRegisteredInstance/,
  "Saving the default provider should sync the instance registry so the homepage and workspace cards show the new provider immediately after restart.",
);
assert.match(
  desktopActions,
  /profileId === "default"/,
  "Registry provider/model sync should only update the default instance summary for the default Hermes profile.",
);
assert.doesNotMatch(
  desktopActions,
  /for \(const \[key, value\] of Object\.entries\(input\.env \?\? \{\}\)\) \{\s*entries\.push\(\{ key, value \}\);\s*\}/,
  "Provider API keys must not be routed through hermes config set as generic config entries.",
);

const providerTests = read("desktop/services/provider-tests.mjs");
assert.match(
  providerTests,
  /openrouter:\s*\{\s*http:/,
  "OpenRouter should use a direct HTTP connectivity test so the supplied OpenRouter key can be validated immediately.",
);
assert.match(
  providerTests,
  /defaultBaseUrl:\s*"https:\/\/openrouter\.ai\/api\/v1"/,
  "OpenRouter HTTP validation should hit the official OpenRouter API base URL.",
);
assert.match(
  providerTests,
  /validationPath:\s*"\/key"/,
  "OpenRouter HTTP validation should verify the supplied API key instead of only probing the public model catalog.",
);
assert.match(
  providerTests,
  /function toHttpProbeUrl\(baseUrl, validationPath = "\/models"\)/,
  "HTTP provider tests should support provider-specific validation endpoints.",
);

assert.match(
  providersPage,
  /data-testid="provider-model-input"/,
  "Provider model input should have a stable test id for Electron flow validation.",
);
assert.match(
  providersPage,
  /data-testid=\{`provider-env-\$\{field\.key\}`\}/,
  "Provider env inputs should have stable test ids for API-key entry validation.",
);

const desktopFlowScript = read("scripts/validate-provider-desktop-flow.mjs");
assert.match(
  desktopFlowScript,
  /OPENROUTER_TEST_API_KEY/,
  "Desktop provider validation should support a real OpenRouter credential smoke test without hard-coding secrets.",
);
assert.match(
  desktopFlowScript,
  /provider-configure-openrouter/,
  "Desktop provider validation should exercise the OpenRouter configure drawer.",
);
assert.match(
  desktopFlowScript,
  /provider-env-OPENROUTER_API_KEY/,
  "Desktop provider validation should type into the OpenRouter API-key field.",
);
assert.match(
  desktopFlowScript,
  /provider-model-input/,
  "Desktop provider validation should type the supplied OpenRouter model.",
);

console.log("provider desktop feedback assertions passed");
