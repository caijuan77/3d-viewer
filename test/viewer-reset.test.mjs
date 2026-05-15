import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INITIAL_OVERLAY_TEXT, resetViewerOutputs } from '../src/viewer/modelViewer.js';

const outputCalls = [];
resetViewerOutputs({
  overlay: value => outputCalls.push(['overlay', value]),
  stats: value => outputCalls.push(['stats', value]),
  fileSize: value => outputCalls.push(['fileSize', value]),
  url: value => outputCalls.push(['url', value]),
  wireframe: value => outputCalls.push(['wireframe', value]),
});

assert.deepEqual(outputCalls, [
  ['overlay', { visible: true, error: false, loading: false, text: INITIAL_OVERLAY_TEXT }],
  ['stats', '—'],
  ['fileSize', ''],
  ['url', ''],
  ['wireframe', false],
]);

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const clearLocalTabsBody = appSource.match(/function clearLocalTabs\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
const closePreviewBody = appSource.match(/function closePreview\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
const onMountedBody = appSource.match(/onMounted\(\(\) => \{([\s\S]*?)\n\}\);/)?.[1] || '';

assert.match(clearLocalTabsBody, /viewer\?\.clear\(\);/);
assert.match(closePreviewBody, /clearLocalTabs\(\);/);
assert.match(appSource, /const DEFAULT_SAMPLE = SAMPLES\[0\];/);
assert.match(appSource, /const hasActiveModel = computed\(\(\) => stats\.value !== '—'\);/);
assert.match(onMountedBody, /loadSample\(DEFAULT_SAMPLE\);/);
assert.match(appSource, /class="preview-close"/);
assert.match(appSource, /v-if="hasActiveModel"/);
assert.match(appSource, /@click="closePreview"/);
assert.match(appSource, /<div v-if="overlay\.loading" class="spinner"><\/div>/);
assert.doesNotMatch(appSource, /<span><span class="kbd">R<\/span> reset<\/span>/);
assert.doesNotMatch(appSource, /<span><span class="kbd">W<\/span> wireframe<\/span>/);
assert.doesNotMatch(appSource, /class="toolbar"/);
assert.doesNotMatch(appSource, /Reset camera/);
assert.doesNotMatch(appSource, /Toggle wireframe/);
