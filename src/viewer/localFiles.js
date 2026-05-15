const MODEL_FORMAT_RE = /\.(glb|gltf|obj|stl|fbx|ply|dae|3ds)$/i;
export const DEFAULT_MAX_MODEL_TABS = 5;

export function normalizeAssetPath(path) {
  const withoutQuery = String(path || '').split(/[?#]/, 1)[0];
  let normalized = withoutQuery.replace(/\\/g, '/').replace(/^\.?\//, '');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep malformed escape sequences as-is so loading can still surface the real parser error.
  }
  return normalized;
}

export function chooseEntryFile(files) {
  return Array.from(files).find(file => MODEL_FORMAT_RE.test(file.name || file.webkitRelativePath || '')) || null;
}

export function countModelEntryFiles(files) {
  return Array.from(files).filter(file => MODEL_FORMAT_RE.test(file.name || file.webkitRelativePath || '')).length;
}

export function resolveMaxModelTabs(value = DEFAULT_MAX_MODEL_TABS) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_MODEL_TABS;
}

export function isModelLimitReached(count, limit = DEFAULT_MAX_MODEL_TABS) {
  return count >= resolveMaxModelTabs(limit);
}

export function listModelEntryFiles(files, limit = DEFAULT_MAX_MODEL_TABS) {
  const resolvedLimit = resolveMaxModelTabs(limit);
  return Array.from(files)
    .filter(file => MODEL_FORMAT_RE.test(file.name || file.webkitRelativePath || ''))
    .slice(0, resolvedLimit);
}

export function localBasePathFor(file) {
  const path = normalizeAssetPath(file?.webkitRelativePath || file?.name || '');
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(0, slash + 1) : '';
}

export function buildLocalAssetIndex(files, createObjectUrl = file => URL.createObjectURL(file)) {
  const byPath = new Map();

  Array.from(files).forEach(file => {
    const objectUrl = createObjectUrl(file);
    const paths = [file.webkitRelativePath, file.name]
      .filter(Boolean)
      .map(normalizeAssetPath);

    paths.forEach(path => {
      byPath.set(path, objectUrl);
      byPath.set(path.toLowerCase(), objectUrl);
    });
  });

  return byPath;
}

export function createLocalAssetResolver(assetIndex) {
  return url => {
    const path = normalizeAssetPath(url);
    const direct = assetIndex.get(path) || assetIndex.get(path.toLowerCase());
    if (direct) return direct;

    for (const [assetPath, objectUrl] of assetIndex) {
      if (assetPath.endsWith('/' + path) || assetPath.toLowerCase().endsWith('/' + path.toLowerCase())) {
        return objectUrl;
      }
    }

    return url;
  };
}

export function createLocalLoadingManager(files, {
  LoadingManager,
  createObjectURL = file => URL.createObjectURL(file),
  revokeObjectURL = url => URL.revokeObjectURL(url),
} = {}) {
  const objectUrls = [];
  const assetIndex = buildLocalAssetIndex(files, file => {
    const objectUrl = createObjectURL(file);
    objectUrls.push(objectUrl);
    return objectUrl;
  });
  const manager = new LoadingManager();
  manager.setURLModifier(createLocalAssetResolver(assetIndex));
  manager.disposeObjectUrls = () => objectUrls.forEach(revokeObjectURL);
  return manager;
}
