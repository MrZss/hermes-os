import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const providersPage = fs.readFileSync(path.join(root, 'src/app/pages/instance/Providers.tsx'), 'utf8');

const saveStart = providersPage.indexOf('async function handleSaveProvider() {');
const saveEnd = providersPage.indexOf('async function handleTestProvider(');
assert.ok(saveStart >= 0, '应能定位 handleSaveProvider。');
assert.ok(saveEnd > saveStart, '应能定位 handleTestProvider 作为 save block 的结束边界。');
const saveBlock = providersPage.slice(saveStart, saveEnd);
const loadStart = providersPage.indexOf('const loadProviders = useCallback(');
const loadEnd = providersPage.indexOf('const refreshProviders = useCallback(');
assert.ok(loadStart >= 0 && loadEnd > loadStart, '应能定位 loadProviders。');
const loadBlock = providersPage.slice(loadStart, loadEnd);
const refreshStart = loadEnd;
const refreshEnd = providersPage.indexOf('useEffect(() => {');
assert.ok(refreshEnd > refreshStart, '应能定位 refreshProviders。');
const refreshBlock = providersPage.slice(refreshStart, refreshEnd);

assert.match(
  providersPage,
  /const applyOfficialProviderState = useCallback\(/,
  'Providers 应有共享的官方状态同步 helper，避免 load 与 refresh 分叉。',
);
assert.match(
  loadBlock,
  /await applyOfficialProviderState\(result, preferredProfileId, preferredProviderId\);/,
  '初始读取与保存后刷新应复用同一套官方状态同步逻辑。',
);
assert.match(
  refreshBlock,
  /await applyOfficialProviderState\(result, preferredProfileId, preferredProviderId(?:, \{[\s\S]*?preserveProviderTestsOnFailure: true[\s\S]*?\})?\);/,
  '保存后的状态回读应复用共享同步 helper，而不是复制一份状态写回逻辑。',
);
assert.match(
  providersPage,
  /const refreshProviders = useCallback\(/,
  '保存后应有独立的轻量回读 helper，避免复用会触发 loading 屏的初始加载逻辑。',
);
assert.match(
  providersPage,
  /const refreshResult = await refreshProviders\(selectedProfileId, selected\.id\);/,
  '保存成功后应通过真实官方状态回读刷新当前 provider，而不是继续调用 loadProviders。',
);
assert.match(
  saveBlock,
  /const refreshResult = await refreshProviders\(selectedProfileId, selected\.id\);/,
  'handleSaveProvider 必须在成功后调用回读 helper。',
);
assert.doesNotMatch(
  saveBlock,
  /await loadProviders\(selectedProfileId, selected\.id\);/,
  'handleSaveProvider 不应再直接调用会触发整页 loading 的 loadProviders。',
);
assert.match(
  saveBlock,
  /if \(!refreshResult\.ok\) \{[\s\S]*?tone: "success"[\s\S]*?已保存，但重新读取最新状态失败，请稍后刷新页面确认。/,
  '保存已成功但回读失败时，反馈应保留成功语义并提示稍后刷新确认，避免误导用户重复保存。',
);
assert.match(
  saveBlock,
  /catch \(saveError\) \{[\s\S]*?setFeedback\(\{[\s\S]*?message: "保存没成功，请再试一次。"/,
  '保存失败时应保留表单值，只更新反馈，不应回滚或重置输入。',
);

console.log('provider real save refresh assertions passed');
