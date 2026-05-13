#!/usr/bin/env node
import assert from "node:assert/strict";

const port = process.env.HERMES_DESKTOP_CDP_PORT || "9231";
const instanceId = process.env.HERMES_DESKTOP_INSTANCE_ID || "local-studio";
const baseUrl = process.env.HERMES_DESKTOP_URL || "http://127.0.0.1:4174";
const openRouterTestApiKey = process.env.OPENROUTER_TEST_API_KEY || "";
const openRouterTestModel = process.env.OPENROUTER_TEST_MODEL || "z-ai/glm-4.5-air:free";
const cdpBase = `http://127.0.0.1:${port}`;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }
  return response.json();
}

class CdpClient {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("CDP websocket failed to open")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.id) return;
      const handler = this.pending.get(payload.id);
      if (!handler) return;
      this.pending.delete(payload.id);
      if (payload.error) {
        handler.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
      } else {
        handler.resolve(payload.result);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression, timeoutMs = 10_000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }

  return result.result?.value;
}

async function waitFor(client, expression, { timeoutMs = 20_000, intervalMs = 250, label = expression } = {}) {
  const startedAt = Date.now();
  let lastValue;

  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await evaluate(client, expression).catch((error) => ({ error: error.message }));
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(lastValue)}`);
}

async function setInputValue(client, selector, value) {
  return evaluate(client, `(() => {
    const selector = ${JSON.stringify(selector)};
    const nextValue = ${JSON.stringify(value)};
    const input = document.querySelector(selector);
    if (!input) return null;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) {
      setter.call(input, nextValue);
    } else {
      input.value = nextValue;
    }
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextValue }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.value;
  })()`);
}

const pages = await fetchJson(`${cdpBase}/json/list`);
const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
assert.ok(page, "Electron desktop page should be available through CDP.");

const client = new CdpClient(page.webSocketDebuggerUrl);
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Page.navigate", { url: `${baseUrl}/instance/${instanceId}/providers` });
await waitFor(client, "document.readyState === 'complete'", { label: "document ready" });
await waitFor(client, `Boolean(document.querySelector('[data-testid="provider-configure-openai-codex"]'))`, { timeoutMs: 30_000, label: "OpenAI provider card" });

const shellState = await evaluate(client, `(() => ({
  hasDesktopBridge: Boolean(window.hermesDesktop?.authenticateInstanceProvider),
  currentUrl: location.href,
  title: document.title,
  providerCount: document.querySelectorAll('[data-testid^="provider-configure-"]').length,
  hasBrowserUnavailableCopy: document.body.textContent.includes('浏览器预览无法执行'),
}))()`);
assert.equal(shellState.hasDesktopBridge, true, "Provider flow must run inside the Electron desktop bridge, not a plain browser preview.");
assert.equal(shellState.hasBrowserUnavailableCopy, false, "Desktop validation should not show browser-only unavailable copy.");
assert.ok(shellState.providerCount >= 4, "Provider catalog should render multiple provider cards.");

await evaluate(client, `document.querySelector('[data-testid="provider-configure-openai-codex"]').click()`);
await waitFor(client, `Boolean(document.querySelector('[data-testid="provider-oauth-start"]'))`, { label: "OAuth start button" });

const openAiBefore = await evaluate(client, `(() => ({
  drawerText: document.body.textContent,
  saveDisabled: document.querySelector('[data-testid="provider-save-current"]')?.disabled ?? null,
  testDisabled: document.querySelector('[data-testid="provider-test-selected"]')?.disabled ?? null,
  oauthLabel: document.querySelector('[data-testid="provider-oauth-start"]')?.textContent?.trim() ?? '',
}))()`);
assert.match(openAiBefore.drawerText, /OpenAI Codex/);
assert.match(openAiBefore.oauthLabel, /启动 OAuth 登录/);

await evaluate(client, `document.querySelector('[data-testid="provider-oauth-start"]').click()`);
await waitFor(
  client,
  `(() => {
    const feedback = document.querySelector('[data-testid="provider-action-feedback"]')?.textContent || '';
    const working = document.querySelector('[data-testid="provider-oauth-start"]')?.textContent?.includes('OAuth 登录中');
    return feedback && !working ? feedback : '';
  })()`,
  { timeoutMs: 45_000, intervalMs: 500, label: "OAuth feedback" },
);

const oauthFeedback = await evaluate(client, `document.querySelector('[data-testid="provider-action-feedback"]')?.textContent || ''`);
assert.match(oauthFeedback, /本地 Hermes CLI 执行失败|OAuth 登录失败|Hermes CLI 执行失败/);
assert.match(oauthFeedback, /详情已记录在桌面日志/);
assert.doesNotMatch(oauthFeedback, /Traceback \(most recent call last\)|httpcore|site-packages|File "\/Users\//, "Desktop OAuth feedback must not expose Python tracebacks in the user UI.");

await evaluate(client, `document.querySelector('[data-testid="provider-configure-deepseek"]').click()`);
await waitFor(client, `document.body.textContent.includes('DeepSeek') && Boolean(document.querySelector('[data-testid="provider-save-current"]'))`, { label: "DeepSeek drawer" });

const deepSeekState = await evaluate(client, `(() => ({
  drawerText: document.body.textContent,
  saveDisabled: document.querySelector('[data-testid="provider-save-current"]')?.disabled ?? null,
  hasOauthButton: Boolean(document.querySelector('[data-testid="provider-oauth-start"]')),
}))()`);
assert.match(deepSeekState.drawerText, /DeepSeek/);
assert.match(deepSeekState.drawerText, /API Key/);
assert.equal(deepSeekState.hasOauthButton, false, "API Key-only providers should not show OAuth CTA.");
assert.equal(deepSeekState.saveDisabled, true, "API Key provider save should stay disabled until a credential exists.");

let openRouterSmoke = null;
if (openRouterTestApiKey) {
  await evaluate(client, `document.querySelector('[data-testid="provider-configure-openrouter"]').click()`);
  await waitFor(
    client,
    `document.body.textContent.includes('OpenRouter') && Boolean(document.querySelector('[data-testid="provider-env-OPENROUTER_API_KEY"]'))`,
    { label: "OpenRouter API-key drawer" },
  );

  const modelValue = await setInputValue(client, '[data-testid="provider-model-input"]', openRouterTestModel);
  const keyValue = await setInputValue(client, '[data-testid="provider-env-OPENROUTER_API_KEY"]', openRouterTestApiKey);
  assert.equal(modelValue, openRouterTestModel, "OpenRouter model input should accept the supplied model.");
  assert.equal(Boolean(keyValue), true, "OpenRouter API-key input should accept the supplied credential.");

  await waitFor(
    client,
    `document.querySelector('[data-testid="provider-save-current"]') && !document.querySelector('[data-testid="provider-save-current"]').disabled`,
    { label: "OpenRouter save button enabled" },
  );
  await evaluate(client, `document.querySelector('[data-testid="provider-save-current"]').click()`);
  await waitFor(
    client,
    `(() => {
      const feedback = document.querySelector('[data-testid="provider-action-feedback"]')?.textContent || '';
      const saving = document.querySelector('[data-testid="provider-save-current"]')?.textContent?.includes('保存中');
      return /已保存/.test(feedback) && !saving ? feedback : '';
    })()`,
    { timeoutMs: 45_000, intervalMs: 500, label: "OpenRouter save feedback" },
  );

  const saveFeedback = await evaluate(client, `document.querySelector('[data-testid="provider-action-feedback"]')?.textContent || ''`);
  assert.match(saveFeedback, /已保存/);
  assert.doesNotMatch(saveFeedback, new RegExp(openRouterTestApiKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "Visible OpenRouter save feedback must not echo the API key.");

  await evaluate(client, `document.querySelector('[data-testid="provider-test-selected"]').click()`);
  await waitFor(
    client,
    `(() => {
      const feedback = document.querySelector('[data-testid="provider-action-feedback"]')?.textContent || '';
      const testing = document.querySelector('[data-testid="provider-test-selected"]')?.textContent?.includes('测试中');
      return /连接测试/.test(feedback) && !testing ? feedback : '';
    })()`,
    { timeoutMs: 45_000, intervalMs: 500, label: "OpenRouter test feedback" },
  );

  const testFeedback = await evaluate(client, `document.querySelector('[data-testid="provider-action-feedback"]')?.textContent || ''`);
  assert.match(testFeedback, /连接测试通过/);
  assert.doesNotMatch(testFeedback, new RegExp(openRouterTestApiKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "Visible OpenRouter test feedback must not echo the API key.");

  openRouterSmoke = {
    model: openRouterTestModel,
    saved: /已保存/.test(saveFeedback),
    verified: /连接测试通过/.test(testFeedback),
    feedback: testFeedback,
    key: "redacted",
  };
}

client.close();
console.log(JSON.stringify({
  ok: true,
  mode: "electron-desktop-cdp",
  url: shellState.currentUrl,
  providerCount: shellState.providerCount,
  oauthFeedback,
  deepSeekSaveDisabled: deepSeekState.saveDisabled,
  openRouterSmoke,
}, null, 2));
