import assert from 'node:assert/strict';
import {
  buildLocalAssetIndex,
  chooseEntryFile,
  createLocalAssetResolver,
  countModelEntryFiles,
  isModelLimitReached,
  listModelEntryFiles,
  localBasePathFor,
  DEFAULT_MAX_MODEL_TABS,
  resolveMaxModelTabs,
} from '../src/viewer/localFiles.js';

function file(name, webkitRelativePath = '') {
  return { name, webkitRelativePath };
}

const files = [
  file('preview.png', 'Robot/preview.png'),
  file('model.bin', 'Robot/model.bin'),
  file('base color.png', 'Robot/textures/base color.png'),
  file('model.gltf', 'Robot/model.gltf'),
];

const entry = chooseEntryFile(files);
assert.equal(entry.name, 'model.gltf');
assert.equal(localBasePathFor(entry), 'Robot/');

const assetIndex = buildLocalAssetIndex(files, f => `blob:${f.webkitRelativePath || f.name}`);
const resolveAsset = createLocalAssetResolver(assetIndex);

assert.equal(resolveAsset('Robot/model.bin'), 'blob:Robot/model.bin');
assert.equal(resolveAsset('Robot/textures/base%20color.png'), 'blob:Robot/textures/base color.png');
assert.equal(resolveAsset('textures/base%20color.png'), 'blob:Robot/textures/base color.png');
assert.equal(resolveAsset('missing.bin'), 'missing.bin');

const mixedBatch = [
  file('a.glb'),
  file('a.bin'),
  file('b.gltf'),
  file('b.bin'),
  file('c.fbx'),
  file('d.obj'),
  file('e.stl'),
  file('f.ply'),
  file('texture.png'),
];

assert.equal(DEFAULT_MAX_MODEL_TABS, 5);
assert.equal(resolveMaxModelTabs(), 5);
assert.equal(resolveMaxModelTabs('3'), 3);
assert.equal(resolveMaxModelTabs(2), 2);
assert.equal(resolveMaxModelTabs('0'), 5);
assert.equal(resolveMaxModelTabs('abc'), 5);
assert.equal(isModelLimitReached(4), false);
assert.equal(isModelLimitReached(5), true);
assert.equal(isModelLimitReached(3, 3), true);
assert.equal(isModelLimitReached(2, '3'), false);
assert.equal(countModelEntryFiles(mixedBatch), 6);
assert.deepEqual(
  listModelEntryFiles(mixedBatch).map(entryFile => entryFile.name),
  ['a.glb', 'b.gltf', 'c.fbx', 'd.obj', 'e.stl'],
);
assert.deepEqual(
  listModelEntryFiles(mixedBatch, resolveMaxModelTabs('3')).map(entryFile => entryFile.name),
  ['a.glb', 'b.gltf', 'c.fbx'],
);
