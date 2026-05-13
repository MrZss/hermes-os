import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integrationsPage = fs.readFileSync(path.join(root, 'src/app/pages/instance/Integrations.tsx'), 'utf8');

const saveStart = integrationsPage.indexOf('async function handleSaveIntegration() {');
const saveEnd = integrationsPage.indexOf('async function handleStartWeixinQrLogin() {');
assert.ok(saveStart >= 0, '应能定位 handleSaveIntegration。');
assert.ok(saveEnd > saveStart, '应能定位 save block 的结束边界。');
const saveBlock = integrationsPage.slice(saveStart, saveEnd);

assert.match(
  saveBlock,
  /const result = await updateInstanceIntegrationConfig\(instanceId, \{[\s\S]*?\}\);/,
  '保存必须先真实调用 updateInstanceIntegrationConfig。',
);
assert.match(
  saveBlock,
  /await restartInstanceGateway\(instanceId\);/,
  '保存成功后必须自动重启消息平台。',
);
assert.match(
  saveBlock,
  /await loadIntegrations\(selectedProfileId, null\);/,
  '重启后必须真实回读最新状态，而不是只改前端本地状态。',
);
assert.match(
  saveBlock,
  /setSelectedId\(null\);/,
  '保存成功后应回到目录态，不应保留旧 drawer 选中状态。',
);
assert.ok(
  saveBlock.indexOf('setSelectedId(null);') < saveBlock.indexOf('await loadIntegrations(selectedProfileId, null);'),
  '目录态应在真实回读之前恢复，避免回读期间仍保留旧 drawer 选中状态。',
);
assert.match(
  saveBlock,
  /setFeedback\(\{[\s\S]*?已自动重启消息平台/,
  '成功反馈应明确告知已自动重启消息平台。',
);
assert.doesNotMatch(
  saveBlock,
  /await loadIntegrations\(selectedProfileId, selected\.id\);/,
  '保存后不应重新选中同一个 integration，避免 drawer 再次打开。',
);

console.log('messaging real save refresh assertions passed');
