<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createModelViewer } from './viewer/modelViewer.js';
import {
  countModelEntryFiles,
  DEFAULT_MAX_MODEL_TABS,
  isModelLimitReached,
  listModelEntryFiles,
  resolveMaxModelTabs,
} from './viewer/localFiles.js';

const SAMPLES = [
  { name: 'Damaged Helmet', fmt: 'GLB', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb' },
  { name: 'Box', fmt: 'GLTF', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Box/glTF/Box.gltf' },
  { name: 'Spot (cow)', fmt: 'OBJ', url: 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/spot.obj' },
  { name: 'Spider', fmt: 'STL', url: 'https://raw.githubusercontent.com/assimp/assimp/master/test/models/STL/Spider_binary.stl' },
  { name: 'Spider', fmt: 'FBX', url: 'https://raw.githubusercontent.com/assimp/assimp/master/test/models/FBX/spider.fbx' },
  { name: 'Igea', fmt: 'PLY', url: 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/igea.ply' },
  { name: 'Duck', fmt: 'DAE', url: 'https://raw.githubusercontent.com/assimp/assimp/master/test/models/Collada/duck.dae' },
  { name: 'Test', fmt: '3DS', url: 'https://raw.githubusercontent.com/assimp/assimp/master/test/models/3DS/test1.3ds' },
];

const viewerWrap = ref(null);
const fileInput = ref(null);
const urlInput = ref('');
const stats = ref('—');
const fileSize = ref('');
const wireframe = ref(false);
const dragOver = ref(false);
const hintFading = ref(false);
const localTabs = ref([]);
const activeLocalTabId = ref('');
const uploadNotice = ref('');
const maxModelTabs = resolveMaxModelTabs(new URLSearchParams(window.location.search).get('maxModels') || DEFAULT_MAX_MODEL_TABS);
const overlay = reactive({
  visible: true,
  error: false,
  loading: false,
  text: 'Drop a 3D file or paste a URL to start',
});

let viewer = null;
let hintTimer = null;
let localFileBatch = [];

const overlayClasses = computed(() => ({
  overlay: true,
  hidden: !overlay.visible,
  error: overlay.error,
}));
const uploadLimitReached = computed(() => isModelLimitReached(localTabs.value.length, maxModelTabs));

onMounted(() => {
  viewer = createModelViewer(viewerWrap.value, {
    onOverlay: state => Object.assign(overlay, state),
    onStats: value => { stats.value = value; },
    onFileSize: value => { fileSize.value = value; },
    onUrl: value => { urlInput.value = value; },
    onWireframe: value => { wireframe.value = value; },
  });

  window.addEventListener('keydown', onKeydown);
  showHint();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(hintTimer);
  viewer?.dispose();
});

function browseFiles() {
  if (uploadLimitReached.value) {
    uploadNotice.value = `Clear uploaded models before selecting more than ${maxModelTabs}.`;
    return;
  }
  fileInput.value?.click();
}

function onFileChange(event) {
  const files = event.target.files;
  if (files?.length) handleLocalFiles(files);
  event.target.value = '';
}

function onDragOver() {
  if (uploadLimitReached.value) return;
  dragOver.value = true;
}

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) dragOver.value = false;
}

function onDrop(event) {
  dragOver.value = false;
  if (uploadLimitReached.value) {
    uploadNotice.value = `Clear uploaded models before selecting more than ${maxModelTabs}.`;
    return;
  }
  if (event.dataTransfer.files.length) handleLocalFiles(event.dataTransfer.files);
}

function loadUrl() {
  const url = urlInput.value.trim();
  if (url) {
    clearLocalTabs();
    viewer.loadFromUrl(url);
  }
}

function loadSample(sample) {
  clearLocalTabs();
  viewer.loadFromUrl(sample.url);
}

function handleLocalFiles(fileList) {
  const files = Array.from(fileList);
  const entryFiles = listModelEntryFiles(files, maxModelTabs);
  const entryCount = countModelEntryFiles(files);

  localFileBatch = files;
  localTabs.value = entryFiles.map((file, index) => ({
    id: `${file.webkitRelativePath || file.name}-${index}`,
    label: file.name,
    title: file.webkitRelativePath || file.name,
    file,
  }));
  activeLocalTabId.value = localTabs.value[0]?.id || '';
  uploadNotice.value = entryCount > maxModelTabs
    ? `Only the first ${maxModelTabs} model files are shown.`
    : '';

  if (localTabs.value.length) {
    loadLocalTab(localTabs.value[0]);
  } else {
    viewer.loadFromFiles(files);
  }
}

function loadLocalTab(tab) {
  activeLocalTabId.value = tab.id;
  viewer.loadFromFiles(localFileBatch, tab.file);
}

function clearLocalTabs() {
  localFileBatch = [];
  localTabs.value = [];
  activeLocalTabId.value = '';
  uploadNotice.value = '';
  viewer?.clear();
}

function resetCamera() {
  viewer.resetCamera();
}

function toggleWireframe() {
  viewer.toggleWireframe();
}

function onKeydown(event) {
  const tagName = event.target?.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') return;
  if (event.key === 'r' || event.key === 'R') resetCamera();
  if (event.key === 'w' || event.key === 'W') toggleWireframe();
}

function showHint() {
  hintFading.value = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hintFading.value = true;
  }, 3000);
}
</script>

<template>
  <div class="app-shell" @dragover.prevent @drop.prevent="onDrop">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>3D Model Viewer</h1>
        <span class="sub">Free online preview tool</span>
      </div>

      <div class="section">
        <h3>Upload file</h3>
        <button
          class="drop-zone"
          :class="{ 'drag-over': dragOver, disabled: uploadLimitReached }"
          type="button"
          :disabled="uploadLimitReached"
          @click="browseFiles"
          @dragover.prevent="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <span class="drop-icon">⬆</span>
          <span>{{ uploadLimitReached ? `Model limit reached (${maxModelTabs})` : 'Drag & drop model files here' }}</span>
          <small v-if="uploadLimitReached">Clear uploaded models to select more</small>
          <small v-else>or <strong>click to browse</strong></small>
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".glb,.gltf,.obj,.stl,.fbx,.ply,.dae,.3ds"
          multiple
          :disabled="uploadLimitReached"
          hidden
          @change="onFileChange"
        >
      </div>

      <div class="section">
        <h3>Load from URL</h3>
        <div class="url-row">
          <input v-model="urlInput" type="text" placeholder="https://example.com/model.glb" @keydown.enter="loadUrl">
          <button class="btn btn-primary" type="button" @click="loadUrl">Load</button>
        </div>
      </div>

      <div class="section">
        <h3>Sample models</h3>
        <button
          v-for="sample in SAMPLES"
          :key="sample.url"
          class="sample-item"
          type="button"
          @click="loadSample(sample)"
        >
          <span class="fmt">{{ sample.fmt }}</span>
          <span>{{ sample.name }}</span>
        </button>
      </div>

      <div class="section">
        <h3>Supported formats</h3>
        <div class="format-list">
          <span v-for="fmt in ['GLB', 'GLTF', 'OBJ', 'STL', 'FBX', 'PLY', 'DAE', '3DS']" :key="fmt" class="fmt-tag supported">
            {{ fmt }}
          </span>
        </div>
      </div>
    </aside>

    <main class="main">
      <div v-if="localTabs.length" class="model-tabs" aria-label="Uploaded models">
        <button
          v-for="tab in localTabs"
          :key="tab.id"
          type="button"
          class="model-tab"
          :class="{ active: tab.id === activeLocalTabId }"
          :title="tab.title"
          @click="loadLocalTab(tab)"
        >
          {{ tab.label }}
        </button>
        <button class="model-tab clear-tab" type="button" title="Clear uploaded models" @click="clearLocalTabs">
          Clear
        </button>
      </div>
      <div class="toolbar">
        <button type="button" title="Reset camera (R)" @click="resetCamera">↺ Reset</button>
        <button type="button" :class="{ active: wireframe }" title="Toggle wireframe (W)" @click="toggleWireframe">
          ◌ Wireframe
        </button>
      </div>

      <div ref="viewerWrap" class="viewer-wrap" @pointerdown="showHint">
        <div v-if="uploadNotice" class="upload-notice">{{ uploadNotice }}</div>
        <div :class="overlayClasses">
          <div v-if="overlay.loading" class="spinner"></div>
          <p>{{ overlay.text }}</p>
        </div>
        <div class="hint" :class="{ fading: hintFading }">
          <span>Drag: rotate</span>
          <span>Scroll: zoom</span>
          <span>Right-drag: pan</span>
        </div>
      </div>

      <div class="info-bar">
        <span>{{ stats }}</span>
        <span>{{ fileSize }}</span>
        <span class="spacer"></span>
        <span><span class="kbd">R</span> reset</span>
        <span><span class="kbd">W</span> wireframe</span>
      </div>
    </main>
  </div>
</template>

<style>
:root {
  --bg: #111;
  --surface: #1a1a1a;
  --border: #333;
  --text: #ddd;
  --muted: #888;
  --accent: #4f8ff7;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

button,
input {
  font: inherit;
}

.app-shell {
  display: flex;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.sidebar {
  z-index: 10;
  display: flex;
  width: 320px;
  min-width: 320px;
  flex-direction: column;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.sidebar-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h1 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
}

.sidebar-header .sub {
  color: var(--muted);
  font-size: 12px;
}

.section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.section h3 {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.drop-zone {
  display: flex;
  width: 100%;
  min-height: 132px;
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 2px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
}

.drop-zone:hover:not(:disabled),
.drop-zone.drag-over {
  border-color: var(--accent);
  background: rgba(79, 143, 247, 0.08);
}

.drop-zone.disabled,
.drop-zone:disabled {
  cursor: not-allowed;
  border-color: rgba(255, 183, 77, 0.35);
  background: rgba(255, 183, 77, 0.07);
  color: rgba(244, 194, 117, 0.78);
}

.drop-icon {
  color: var(--text);
  font-size: 32px;
  line-height: 1;
}

.drop-zone small {
  color: var(--muted);
}

.drop-zone strong {
  color: var(--accent);
  font-weight: 600;
}

.url-row {
  display: flex;
  gap: 6px;
}

.url-row input {
  min-width: 0;
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  background: #222;
  color: var(--text);
  font-size: 13px;
  padding: 8px 10px;
}

.url-row input:focus {
  border-color: var(--accent);
}

.btn,
.toolbar button,
.sample-item {
  cursor: pointer;
}

.btn {
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  white-space: nowrap;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  background: #6ba2ff;
}

.sample-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  padding: 8px 10px;
  text-align: left;
  transition: background 0.15s;
}

.sample-item:hover {
  background: #252525;
}

.fmt {
  border-radius: 3px;
  background: #2d5a27;
  color: #8fdf7a;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  text-transform: uppercase;
}

.format-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.fmt-tag {
  border-radius: 4px;
  background: #252525;
  color: var(--muted);
  font-family: monospace;
  font-size: 10px;
  padding: 2px 7px;
}

.fmt-tag.supported {
  color: #8fdf7a;
}

.main {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  background: #222731;
}

.toolbar {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 5;
  display: flex;
  gap: 6px;
}

.toolbar button {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #ccc;
  font-size: 12px;
  padding: 6px 12px;
}

.toolbar button:hover,
.toolbar button.active {
  background: rgba(255, 255, 255, 0.12);
}

.model-tabs {
  position: absolute;
  top: 12px;
  left: 16px;
  z-index: 6;
  display: flex;
  max-width: calc(100% - 260px);
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.model-tab {
  max-width: 160px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  padding: 6px 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-tab:hover,
.model-tab.active {
  border-color: rgba(79, 143, 247, 0.75);
  background: rgba(79, 143, 247, 0.22);
  color: #fff;
}

.clear-tab {
  max-width: none;
  color: rgba(255, 255, 255, 0.48);
}

.clear-tab:hover {
  border-color: rgba(255, 183, 77, 0.55);
  background: rgba(255, 183, 77, 0.14);
  color: #f4c275;
}

.viewer-wrap {
  position: relative;
  isolation: isolate;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 48%, rgba(160, 170, 188, 0.08) 0%, rgba(160, 170, 188, 0.025) 34%, rgba(160, 170, 188, 0) 62%),
    linear-gradient(180deg, #2b2f3a 0%, #272c36 48%, #222731 100%);
}

.viewer-wrap::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 42%, rgba(8, 10, 16, 0.42) 77%, rgba(4, 6, 10, 0.82) 100%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.02) 12%, rgba(255, 255, 255, 0) 35%);
}

canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
}

.upload-notice {
  position: absolute;
  top: 52px;
  left: 16px;
  z-index: 6;
  max-width: min(420px, calc(100% - 32px));
  border: 1px solid rgba(255, 183, 77, 0.26);
  border-radius: 6px;
  background: rgba(26, 22, 14, 0.72);
  color: #f4c275;
  font-size: 12px;
  padding: 7px 10px;
}

.info-bar {
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  padding: 8px 16px;
}

.info-bar .spacer {
  flex: 1;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

.overlay.hidden {
  display: none;
}

.spinner {
  width: 36px;
  height: 36px;
  margin-bottom: 12px;
  border: 3px solid #333;
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.overlay p {
  max-width: min(720px, 80vw);
  margin: 0;
  color: #aaa;
  font-size: 13px;
  text-align: center;
}

.overlay.error .spinner {
  animation: none;
  border-top-color: #e74c3c;
}

.overlay.error p {
  color: #ff5548;
}

.hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  z-index: 5;
  display: flex;
  gap: 16px;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.25);
  font-size: 12px;
  pointer-events: none;
  transition: opacity 0.4s;
}

.hint.fading {
  opacity: 0;
}

.kbd {
  display: inline-block;
  border: 1px solid #444;
  border-radius: 3px;
  background: #2a2a2a;
  color: #aaa;
  font-family: monospace;
  font-size: 10px;
  padding: 1px 5px;
}

@media (max-width: 768px) {
  .app-shell {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    min-width: 0;
    max-height: 40vh;
  }

  .main {
    min-height: 60vh;
  }
}
</style>
