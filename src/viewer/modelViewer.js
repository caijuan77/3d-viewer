import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { calculateCameraFit } from './cameraFit.js';
import {
  chooseEntryFile,
  createLocalLoadingManager,
  localBasePathFor,
} from './localFiles.js';

export const INITIAL_OVERLAY_TEXT = 'Drop a 3D file or paste a URL to start';
const INITIAL_CAMERA_NEAR = 0.01;
const INITIAL_CAMERA_FAR = 1000;
const INITIAL_CAMERA_POSITION = [3, 2, 5];
const INITIAL_CAMERA_TARGET = [0, 0, 0];

export function detectFormat(name) {
  const match = String(name || '').match(/\.(glb|gltf|obj|stl|fbx|ply|dae|3ds)([?#].*)?$/i);
  return match ? match[1].toLowerCase() : null;
}

export function resetViewerOutputs(emit) {
  emit.overlay({ visible: true, error: false, loading: false, text: INITIAL_OVERLAY_TEXT });
  emit.stats('—');
  emit.fileSize('');
  emit.url('');
  emit.wireframe(false);
}

export function createModelViewer(container, callbacks = {}) {
  const emit = {
    overlay: callbacks.onOverlay || (() => {}),
    stats: callbacks.onStats || (() => {}),
    fileSize: callbacks.onFileSize || (() => {}),
    url: callbacks.onUrl || (() => {}),
    wireframe: callbacks.onWireframe || (() => {}),
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 2, INITIAL_CAMERA_NEAR, INITIAL_CAMERA_FAR);
  camera.position.set(...INITIAL_CAMERA_POSITION);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  let stageBeamDistance = 80;
  const stageBeams = createStageBeams();
  camera.add(stageBeams);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dce5, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(4, 6, 6);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
  fillLight.position.set(-4, 3, 4);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
  rimLight.position.set(0, 4, -5);
  scene.add(rimLight);

  const grid = new THREE.GridHelper(10, 10, 0x333333, 0x1a1a1a);
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');

  let currentModel = null;
  let currentLocalManager = null;
  let wireframe = false;

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    controls.update();
    updateStageBeams();
    renderer.render(scene, camera);
  });
  resize();
  showOverlay(INITIAL_OVERLAY_TEXT);

  async function loadFromUrl(url) {
    const name = url.split('/').pop() || 'model';
    const fmt = detectFormat(name);
    if (!fmt) {
      showError('Unsupported file format. Try GLB, GLTF, OBJ, STL, FBX, PLY, DAE or 3DS.');
      return;
    }

    emit.url(url);
    clearModel();
    showOverlay('Fetching ' + fmt.toUpperCase() + '...', true);
    emit.stats('—');
    emit.fileSize('');

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const size = Number(resp.headers.get('content-length'));
      if (size) emit.fileSize(formatBytes(size));
      showOverlay('Parsing ' + fmt.toUpperCase() + '...', true);
      const object = await parseResponse(resp, fmt, url);
      onLoaded(object, fmt);
    } catch (error) {
      console.error(error);
      showError('Failed to load: ' + (error.message || 'unknown error'));
    }
  }

  async function loadFromFiles(fileList, entryFileOverride = null) {
    const files = Array.from(fileList);
    const entryFile = entryFileOverride || chooseEntryFile(files);
    if (!entryFile) {
      showError('Unsupported file format');
      return;
    }

    const fmt = detectFormat(entryFile.name || entryFile.webkitRelativePath);
    if (!fmt) {
      showError('Unsupported file format');
      return;
    }

    clearModel();
    const localManager = createLocalLoadingManager(files, { LoadingManager: THREE.LoadingManager });
    showOverlay('Loading ' + fmt.toUpperCase() + '...', true);
    emit.stats('—');
    emit.fileSize(formatBytes(entryFile.size));

    try {
      const buf = await entryFile.arrayBuffer();
      const object = await parseBuffer(buf, fmt, localBasePathFor(entryFile), localManager);
      onLoaded(object, fmt, localManager);
    } catch (error) {
      disposeLocalManager(localManager);
      console.error(error);
      showError('Failed to parse: ' + formatLoadError(error, fmt));
    }
  }

  function resetCamera() {
    if (currentModel) fitCamera(currentModel);
  }

  function toggleWireframe() {
    wireframe = !wireframe;
    applyWireframe();
    emit.wireframe(wireframe);
  }

  function clear() {
    clearModel();
    wireframe = false;
    resetViewport();
    resetViewerOutputs(emit);
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    controls.dispose();
    clearModel();
    dracoLoader.dispose();
    stageBeams.material.map?.dispose();
    stageBeams.material.dispose();
    stageBeams.geometry.dispose();
    grid.geometry.dispose();
    grid.material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  async function parseResponse(resp, fmt, url) {
    const basePath = url.substring(0, url.lastIndexOf('/') + 1);
    if (fmt === 'glb' || fmt === 'gltf') {
      const buf = await resp.arrayBuffer();
      return parseGltf(buf, basePath, THREE.DefaultLoadingManager);
    }
    return parseBuffer(await resp.arrayBuffer(), fmt, basePath, THREE.DefaultLoadingManager);
  }

  async function parseGltf(buf, basePath, manager) {
    const gltf = await new GLTFLoader(manager).setDRACOLoader(dracoLoader).parseAsync(buf, basePath);
    return gltf.scene;
  }

  function parseBuffer(buf, fmt, basePath, manager = THREE.DefaultLoadingManager) {
    if (fmt === 'glb' || fmt === 'gltf') {
      return parseGltf(buf, basePath, manager);
    }
    if (fmt === 'obj') {
      const text = new TextDecoder().decode(buf);
      return new OBJLoader(manager).parse(text);
    }
    if (fmt === 'stl') {
      const geometry = new STLLoader(manager).parse(buf);
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x5599dd, roughness: 0.4, metalness: 0.1 }));
    }
    if (fmt === 'fbx') {
      return new FBXLoader(manager).parse(buf, basePath);
    }
    if (fmt === 'ply') {
      const geometry = new PLYLoader(manager).parse(buf);
      const hasVertexColors = geometry.hasAttribute('color');
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        roughness: 0.5,
        metalness: 0.05,
        vertexColors: hasVertexColors,
        color: hasVertexColors ? 0xffffff : 0x5599dd,
      }));
    }
    if (fmt === 'dae') {
      const text = new TextDecoder().decode(buf);
      return new ColladaLoader(manager).parse(text, basePath).scene;
    }
    if (fmt === '3ds') {
      return new TDSLoader(manager).parse(buf, basePath);
    }
    throw new Error('Unsupported format: ' + fmt);
  }

  function onLoaded(object, fmt, localManager = null) {
    if (currentModel) clearModel();
    currentModel = object;
    currentLocalManager = localManager;
    scene.add(object);
    fitCamera(object);
    updateStats(object);
    hideOverlay();
    applyWireframe();
  }

  function fitCamera(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const diameter = Math.max(size.x, size.y, size.z, 0.01);
    const fit = calculateCameraFit({ diameter, fov: camera.fov });

    camera.near = fit.near;
    camera.far = fit.far;
    camera.updateProjectionMatrix();
    camera.position.copy(center.clone().add(new THREE.Vector3(fit.distance * 0.7, fit.distance * 0.5, fit.distance * 0.8)));
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();

    const gridScale = Math.max(Math.ceil(diameter * 1.5), 1);
    grid.scale.set(gridScale, 1, gridScale);
    grid.position.y = box.min.y;
  }

  function resetViewport() {
    camera.near = INITIAL_CAMERA_NEAR;
    camera.far = INITIAL_CAMERA_FAR;
    camera.position.set(...INITIAL_CAMERA_POSITION);
    camera.lookAt(...INITIAL_CAMERA_TARGET);
    camera.updateProjectionMatrix();
    controls.target.set(...INITIAL_CAMERA_TARGET);
    controls.update();
    grid.scale.set(1, 1, 1);
    grid.position.y = 0;
    updateStageBeams();
  }

  function updateStats(object) {
    let tris = 0;
    let verts = 0;
    let meshes = 0;

    object.traverse(child => {
      if (!child.isMesh) return;
      meshes += 1;
      const geometry = child.geometry;
      const position = geometry.getAttribute('position');
      if (position) verts += position.count;
      if (geometry.index) tris += geometry.index.count / 3;
      else if (position) tris += position.count / 3;
    });

    emit.stats(`${meshes} mesh · ${fmtNum(tris)} tris · ${fmtNum(verts)} verts`);
  }

  function applyWireframe() {
    if (!currentModel) return;
    currentModel.traverse(child => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (material.wireframe !== undefined) material.wireframe = wireframe;
      });
    });
  }

  function clearModel() {
    if (currentModel) {
      scene.remove(currentModel);
      currentModel.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(material => {
            for (const key in material) {
              if (material[key] && material[key].isTexture) material[key].dispose();
            }
            material.dispose();
          });
        }
      });
      currentModel = null;
    }
    disposeLocalManager(currentLocalManager);
    currentLocalManager = null;
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    updateStageBeams();
  }

  function createStageBeams() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'blur(56px)';
    drawBeam(ctx, 330, 438, 86, 710, 'rgba(230,238,255,0.16)');
    drawBeam(ctx, 278, 382, -6, 600, 'rgba(230,238,255,0.08)');
    drawBeam(ctx, 386, 490, 168, 774, 'rgba(230,238,255,0.08)');

    ctx.filter = 'blur(34px)';
    const crown = ctx.createRadialGradient(384, 0, 0, 384, 70, 250);
    crown.addColorStop(0, 'rgba(255,255,255,0.22)');
    crown.addColorStop(0.32, 'rgba(235,242,255,0.10)');
    crown.addColorStop(1, 'rgba(235,242,255,0)');
    ctx.fillStyle = crown;
    ctx.fillRect(0, 0, canvas.width, 420);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.z = -stageBeamDistance;
    mesh.renderOrder = -1000;
    mesh.frustumCulled = false;
    return mesh;
  }

  function updateStageBeams() {
    const targetDistance = camera.position.distanceTo(controls.target);
    stageBeamDistance = Math.min(camera.far * 0.65, Math.max(45, targetDistance * 2.6));
    stageBeams.position.z = -stageBeamDistance;

    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * stageBeamDistance;
    const visibleWidth = visibleHeight * camera.aspect;
    stageBeams.scale.set(visibleWidth * 1.12, visibleHeight * 1.12, 1);
  }

  function drawBeam(ctx, topLeft, topRight, bottomLeft, bottomRight, color) {
    const fade = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    fade.addColorStop(0, color);
    fade.addColorStop(0.58, color.replace(/[\d.]+\)$/, '0.055)'));
    fade.addColorStop(1, 'rgba(230,238,255,0)');

    ctx.fillStyle = fade;
    ctx.beginPath();
    ctx.moveTo(topLeft, -80);
    ctx.lineTo(topRight, -80);
    ctx.lineTo(bottomRight, ctx.canvas.height + 80);
    ctx.lineTo(bottomLeft, ctx.canvas.height + 80);
    ctx.closePath();
    ctx.fill();
  }

  function showOverlay(text, loading = false) {
    emit.overlay({ visible: true, error: false, loading, text });
  }

  function hideOverlay() {
    emit.overlay({ visible: false, error: false, loading: false, text: '' });
  }

  function showError(text) {
    emit.overlay({ visible: true, error: true, loading: false, text });
  }

  return {
    loadFromUrl,
    loadFromFiles,
    clear,
    resetCamera,
    toggleWireframe,
    dispose,
  };
}

function fmtNum(n) {
  return Math.round(n).toLocaleString();
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return parseFloat((bytes / Math.pow(1024, index)).toFixed(1)) + ' ' + units[index];
}

function disposeLocalManager(manager) {
  if (manager?.disposeObjectUrls) manager.disposeObjectUrls();
}

function formatLoadError(error, fmt) {
  const message = error?.message || 'unknown error';
  if (fmt === 'gltf' || fmt === 'obj' || fmt === 'dae' || fmt === '3ds' || fmt === 'fbx') {
    return `${message}. If this model uses external files, select or drop the model together with its .bin/.mtl/textures.`;
  }
  return message;
}
