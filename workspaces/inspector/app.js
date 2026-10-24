import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

/* ==========================================================================
   Constantes & utilitaires
   ========================================================================== */

const THREE_PATH = '/vendor/three/examples/jsm/';
const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'dae', 'stl', 'ply'];
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

const fmtInt = (n) => Math.round(n).toLocaleString('fr-FR');
const fmtDim = (v) => v.toLocaleString('fr-FR', { maximumSignificantDigits: 7 });
const fmtSlider = (v, d = 2) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const baseName = (name) => name.replace(/\.[^.]+$/, '');
const extOf = (name) => (name.split('.').pop() || '').toLowerCase();

/* ==========================================================================
   Renderer, scène, caméra
   ========================================================================== */

const stage = $('stage');
const viewport = $('viewport');

const renderer = new THREE.WebGLRenderer({
  canvas: viewport,
  antialias: true,
  preserveDrawingBuffer: true, // nécessaire pour la capture HD
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f11);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
const controls = new OrbitControls(camera, viewport);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.rotateSpeed = 0.85;

// Éclairage global PBR neutre (RoomEnvironment + PMREM)
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;
scene.environmentIntensity = 1;

// Lumière principale (ombres douces) + lumière de débouchage
const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(4096, 4096);
keyLight.shadow.bias = -0.0006;
scene.add(keyLight, keyLight.target);

const fillLight = new THREE.DirectionalLight(0xb8cdff, 0.7);
scene.add(fillLight, fillLight.target);

// Sol receveur d'ombres
const shadowGround = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ opacity: 0.42, color: 0x000000 })
);
shadowGround.rotation.x = -Math.PI / 2;
shadowGround.receiveShadow = true;
shadowGround.userData.__helper = true;
scene.add(shadowGround);

// Pivot contenant le modèle chargé (centré sur l'origine, posé sur le sol)
const pivot = new THREE.Group();
pivot.name = '__pivot';
scene.add(pivot);

const gridGroup = new THREE.Group();
gridGroup.userData.__helper = true;
scene.add(gridGroup);

// Boîte de sélection
const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0x6ea0ff);
selectionBox.material.depthTest = false;
selectionBox.material.transparent = true;
selectionBox.material.opacity = 0.9;
selectionBox.renderOrder = 10;
selectionBox.visible = false;
selectionBox.userData.__helper = true;
scene.add(selectionBox);

/* ==========================================================================
   État
   ========================================================================== */

const state = {
  root: null,
  fileName: '',
  meshes: [],
  mode: 'shaded',
  selected: null,
  box: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1)),
  size: new THREE.Vector3(2, 1, 2),
  center: new THREE.Vector3(0, 0.5, 0),
  radius: 1.5,
  lightAngle: 35,
  needsRender: true,
  blobUrls: [],
  loadToken: 0,
  tween: null,
  uvChecker: null,
  insets: { top: 64, bottom: 46 }, // zones masquées par la barre d'outils / le tiroir
};

const requestRender = () => { state.needsRender = true; };
controls.addEventListener('change', requestRender);

/* ==========================================================================
   Matériaux utilitaires (modes de rendu)
   ========================================================================== */

const wireMat = new THREE.MeshBasicMaterial({ color: 0x7ba6ff, wireframe: true, transparent: true, opacity: 0.92 });
const wireOverlayMat = new THREE.MeshBasicMaterial({
  color: 0x9dbcff, wireframe: true, transparent: true, opacity: 0.5, depthWrite: false,
});
const uvMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });

/** Damier UV haute précision généré procéduralement (Canvas 2D). */
function createUVChecker(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const N = 32;            // damier fin
  const M = 8;             // cellules repères
  const fine = size / N;
  const major = size / M;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const v = 1 - (j + 0.5) / N;
      const hue = (u * 260 + (1 - v) * 70 + 200) % 360;
      const light = (i + j) & 1 ? 36 : 56;
      g.fillStyle = `hsl(${hue.toFixed(1)} 58% ${light}%)`;
      g.fillRect(i * fine, j * fine, fine + 0.5, fine + 0.5);
    }
  }

  // Repères majeurs
  const lw = Math.max(2, size / 900);
  g.strokeStyle = 'rgba(255,255,255,0.88)';
  g.lineWidth = lw;
  g.beginPath();
  for (let k = 0; k <= M; k++) {
    g.moveTo(k * major, 0); g.lineTo(k * major, size);
    g.moveTo(0, k * major); g.lineTo(size, k * major);
  }
  g.stroke();

  // Coordonnées au centre de chaque cellule
  const fs = Math.round(major * 0.13);
  g.font = `600 ${fs}px "JetBrains Mono", Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = fs * 0.22;
  for (let cj = 0; cj < M; cj++) {
    for (let ci = 0; ci < M; ci++) {
      const cx = (ci + 0.5) * major;
      const cy = (cj + 0.5) * major;
      const lines = [`U ${((ci + 0.5) / M).toFixed(3)}`, `V ${(1 - (cj + 0.5) / M).toFixed(3)}`];
      lines.forEach((t, n) => {
        const y = cy + (n - 0.5) * fs * 1.25;
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.strokeText(t, cx, y);
        g.fillStyle = '#fff';
        g.fillText(t, cx, y);
      });
    }
  }

  // Repères d'orientation aux quatre coins
  const cs = major * 0.42;
  const corners = [
    { x: 0, y: size - cs, col: '#ff4d4d', t: '0,0' },
    { x: size - cs, y: size - cs, col: '#4da3ff', t: '1,0' },
    { x: 0, y: 0, col: '#ffd24d', t: '0,1' },
    { x: size - cs, y: 0, col: '#55e07a', t: '1,1' },
  ];
  g.font = `700 ${Math.round(cs * 0.32)}px "JetBrains Mono", Consolas, monospace`;
  for (const k of corners) {
    g.fillStyle = k.col;
    g.fillRect(k.x, k.y, cs, cs);
    g.fillStyle = '#101114';
    g.fillText(k.t, k.x + cs / 2, k.y + cs / 2);
  }

  // Axes U / V
  g.font = `700 ${Math.round(major * 0.1)}px "JetBrains Mono", Consolas, monospace`;
  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.lineWidth = major * 0.02;
  g.strokeText('U  →', size / 2, size - major * 0.07);
  g.fillText('U  →', size / 2, size - major * 0.07);
  g.save();
  g.translate(major * 0.07, size / 2);
  g.rotate(-Math.PI / 2);
  g.strokeText('V  →', 0, 0);
  g.fillText('V  →', 0, 0);
  g.restore();

  // Cadre extérieur
  g.strokeStyle = '#ffffff';
  g.lineWidth = lw * 3;
  g.strokeRect(lw * 1.5, lw * 1.5, size - lw * 3, size - lw * 3);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

/* ==========================================================================
   Grille architecturale au sol (dégradé radial)
   ========================================================================== */

function makeGridMaterial(color, opacity, half) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uHalf: { value: half },
    },
    vertexShader: /* glsl */`
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uHalf;
      varying vec3 vPos;
      void main() {
        float d = length(vPos.xz) / uHalf;
        float fade = 1.0 - smoothstep(0.35, 1.0, d);
        gl_FragColor = vec4(uColor, uOpacity * fade);
        #include <colorspace_fragment>
      }`,
  });
}

function buildGrid(gridDim) {
  gridGroup.children.slice().forEach((c) => {
    c.geometry.dispose();
    c.material.dispose();
    gridGroup.remove(c);
  });

  const major = Math.pow(10, Math.floor(Math.log10(Math.max(gridDim, 1e-9))));
  const minor = major / 10;
  const half = Math.ceil((gridDim * 2.2) / major) * major;
  const n = Math.round(half / minor);

  const minorPts = [], majorPts = [], axisX = [], axisZ = [];
  for (let i = -n; i <= n; i++) {
    const p = i * minor;
    const isMajor = i % 10 === 0;
    if (i === 0) {
      axisX.push(-half, 0, 0, half, 0, 0);
      axisZ.push(0, 0, -half, 0, 0, half);
      continue;
    }
    const target = isMajor ? majorPts : minorPts;
    target.push(-half, 0, p, half, 0, p, p, 0, -half, p, 0, half);
  }

  const mk = (pts, color, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(geo, makeGridMaterial(color, opacity, half));
    l.frustumCulled = false;
    l.renderOrder = -1;
    gridGroup.add(l);
  };
  mk(minorPts, 0x5b5f6b, 0.2);
  mk(majorPts, 0x8a90a0, 0.42);
  mk(axisX, 0xd9605f, 0.55);
  mk(axisZ, 0x5f8fe0, 0.55);

  shadowGround.scale.setScalar(half * 2);
  state.gridHalf = half;
  state.gridMajor = major;
}

/* ==========================================================================
   Éclairage : orientation, exposition
   ========================================================================== */

function updateLighting() {
  const az = state.lightAngle * DEG;
  const R = state.radius * 3;
  const c = state.center;

  const place = (light, azimuth, elevation, dist) => {
    light.position.set(
      c.x + Math.sin(azimuth) * Math.cos(elevation) * dist,
      c.y + Math.sin(elevation) * dist,
      c.z + Math.cos(azimuth) * Math.cos(elevation) * dist
    );
    light.target.position.copy(c);
    light.target.updateMatrixWorld();
  };
  place(keyLight, az, 52 * DEG, R);
  place(fillLight, az + 2.5, 22 * DEG, R);

  scene.environmentRotation.y = az;
  requestRender();
}

function fitShadowCamera() {
  const r = state.radius;
  const cam = keyLight.shadow.camera;
  cam.left = -r * 1.5; cam.right = r * 1.5;
  cam.top = r * 1.5; cam.bottom = -r * 1.5;
  cam.near = r * 0.2;
  cam.far = r * 7;
  cam.updateProjectionMatrix();
  keyLight.shadow.normalBias = r * 0.006;
  keyLight.shadow.radius = 3;
  if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
}

/* ==========================================================================
   Caméra : Auto-Fit
   ========================================================================== */

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Distance minimale pour que la boîte tienne entièrement dans le cadre. */
function distanceToFit(box, target, dir) {
  const forward = dir.clone().negate().normalize();
  let right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const tanFull = Math.tan((camera.fov * DEG) / 2);
  const H = Math.max(1, stage.clientHeight);
  const visH = Math.max(0.3 * H, H - state.insets.top - state.insets.bottom);
  const tanV = (tanFull * visH) / H;
  const tanH = tanFull * camera.aspect;
  let dist = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
    const x = Math.abs(p.dot(right)), y = Math.abs(p.dot(up)), z = p.dot(forward);
    dist = Math.max(dist, x / tanH - z, y / tanV - z);
  }
  return dist;
}

function updateClipping(dist) {
  const r = state.radius;
  camera.near = Math.max(r * 0.0005, 1e-9);
  camera.far = Math.max(dist * 40 + r * 20, camera.near * 1000);
  camera.updateProjectionMatrix();
  controls.minDistance = r * 0.0008;
  controls.maxDistance = Math.max(dist * 30, r * 40);
}

/**
 * Cadre la caméra sur une boîte englobante.
 * @param {object} opts  box, dir (vecteur depuis la cible), animate
 */
function fitCamera({ box = state.box, dir = null, animate = true } = {}) {
  const target = box.getCenter(new THREE.Vector3());
  if (!dir) {
    dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0.65, 1);
  }
  dir.normalize();
  const dist = distanceToFit(box, target, dir) * 1.1 + 1e-9;
  updateClipping(Math.max(dist, state.radius * 1.5));

  const toPos = target.clone().addScaledVector(dir, dist);
  if (!animate) {
    camera.position.copy(toPos);
    controls.target.copy(target);
    controls.update();
    requestRender();
    return;
  }
  state.tween = {
    t0: performance.now(), dur: 650,
    fromPos: camera.position.clone(), toPos,
    fromTarget: controls.target.clone(), toTarget: target,
  };
}

function stepTween(now) {
  const tw = state.tween;
  if (!tw) return false;
  const k = Math.min(1, (now - tw.t0) / tw.dur);
  const e = easeInOut(k);
  camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
  controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
  if (k >= 1) state.tween = null;
  return true;
}
controls.addEventListener('start', () => { state.tween = null; });

/* ==========================================================================
   Redimensionnement & boucle de rendu
   ========================================================================== */

/** Décale la projection pour centrer le modèle dans la zone réellement visible. */
function applyViewOffset() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  const { top, bottom } = state.insets;
  camera.setViewOffset(w, h, 0, Math.round((bottom - top) / 2), w, h);
}

function measureInsets() {
  const H = stage.clientHeight;
  const bottom = Math.max(0, H - $('drawer').getBoundingClientRect().top);
  return { top: 64, bottom };
}

function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  state.insets = measureInsets();
  applyViewOffset();
  requestRender();
}
new ResizeObserver(resize).observe(stage);

let isStudioActive = true;
let animId = null;

function tick(now) {
  if (!isStudioActive) {
    animId = null;
    return;
  }
  animId = requestAnimationFrame(tick);
  const moving = stepTween(now);
  let changed = controls.update();
  const ins = measureInsets();
  if (Math.abs(ins.bottom - state.insets.bottom) > 0.5) {
    state.insets = ins;
    applyViewOffset();
    changed = true;
  }
  if (moving || changed || state.needsRender) {
    renderer.render(scene, camera);
    state.needsRender = false;
  }
}

/* ==========================================================================
   Interface : notifications, chargement
   ========================================================================== */

function toast(message, { type = 'info', action = null, duration = 4500 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => { action.fn(); remove(); });
    el.appendChild(b);
  }
  $('toasts').appendChild(el);
  const remove = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  };
  setTimeout(remove, duration);
}

const loadingEl = $('loading');
function showLoading(title, sub = 'Lecture du fichier') {
  $('loading-title').textContent = title;
  $('loading-sub').textContent = sub;
  setProgress(null);
  loadingEl.classList.add('show');
}
function hideLoading() { loadingEl.classList.remove('show'); }
function setProgress(frac) {
  const wrap = loadingEl.querySelector('.progress');
  if (frac == null) { wrap.classList.add('indeterminate'); return; }
  wrap.classList.remove('indeterminate');
  $('loading-bar').style.width = `${Math.round(frac * 100)}%`;
}
const onProgress = (e) => {
  if (e && e.lengthComputable && e.total) setProgress(e.loaded / e.total);
};

/* ==========================================================================
   Chargement des modèles
   ========================================================================== */

const draco = new DRACOLoader().setDecoderPath(`${THREE_PATH}libs/draco/gltf/`);
const ktx2 = new KTX2Loader().setTranscoderPath(`${THREE_PATH}libs/basis/`).detectSupport(renderer);

function pickMainFile(files) {
  for (const ext of MODEL_EXTS) {
    const f = files.find((x) => extOf(x.name) === ext);
    if (f) return f;
  }
  return null;
}

/** Convertit les matériaux Phong / Lambert en PBR pour profiter de l'éclairage IBL. */
function upgradeMaterial(m, cache) {
  if (!m || !(m.isMeshPhongMaterial || m.isMeshLambertMaterial)) return m;
  if (cache.has(m)) return cache.get(m);
  const std = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color ? m.color.clone() : 0xcccccc,
    map: m.map || null,
    aoMap: m.aoMap || null,
    aoMapIntensity: m.aoMapIntensity ?? 1,
    emissive: m.emissive ? m.emissive.clone() : 0x000000,
    emissiveMap: m.emissiveMap || null,
    emissiveIntensity: m.emissiveIntensity ?? 1,
    normalMap: m.normalMap || null,
    bumpMap: m.bumpMap || null,
    bumpScale: m.bumpScale ?? 1,
    alphaMap: m.alphaMap || null,
    transparent: m.transparent,
    opacity: m.opacity,
    alphaTest: m.alphaTest,
    side: m.side,
    vertexColors: m.vertexColors,
    flatShading: m.flatShading,
    roughness: m.isMeshPhongMaterial ? THREE.MathUtils.clamp(1 - (m.shininess ?? 30) / 160, 0.3, 1) : 0.85,
    metalness: 0,
  });
  if (m.normalScale) std.normalScale.copy(m.normalScale);
  cache.set(m, std);
  return std;
}

function prepareModel(root) {
  const cache = new Map();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const trash = [];

  root.traverse((o) => {
    if (o.isLight || o.isCamera) { trash.push(o); return; }
    if (!(o.isMesh || o.isPoints || o.isLine)) return;

    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => upgradeMaterial(m, cache))
        : upgradeMaterial(o.material, cache);
    }
    o.frustumCulled = !o.isSkinnedMesh;
    o.userData.origMaterial = o.material;

    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const key in m) {
        const v = m[key];
        if (v && v.isTexture) v.anisotropy = aniso;
      }
    }
  });
  trash.forEach((o) => o.removeFromParent());
}

function disposeModel() {
  if (!state.root) return;
  state.root.traverse((o) => {
    if (o.userData.__helper) return;
    o.geometry?.dispose();
    const mats = o.userData.origMaterial;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      for (const key in m) { const v = m[key]; if (v && v.isTexture) v.dispose(); }
      m.dispose();
    }
  });
  pivot.remove(state.root);
  state.root = null;
  state.meshes = [];
  state.blobUrls.forEach((u) => URL.revokeObjectURL(u));
  state.blobUrls = [];
}

async function loadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const main = pickMainFile(files);
  if (!main) {
    toast('Format non pris en charge. Formats : GLTF, GLB, OBJ, FBX, STL, DAE, PLY.', { type: 'error' });
    return;
  }

  const token = ++state.loadToken;
  const t0 = performance.now();
  const ext = extOf(main.name);
  showLoading(main.name, 'Lecture du fichier…');

  // Ressources associées (textures, .bin, .mtl) résolues par nom de fichier
  const resources = new Map();
  const urls = [];
  for (const f of files) {
    const u = URL.createObjectURL(f);
    urls.push(u);
    resources.set(f.name.toLowerCase(), u);
  }
  const missing = new Set();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:')) return url;
    const name = decodeURIComponent(url.split(/[?#]/)[0].split(/[\\/]/).pop() || '').toLowerCase();
    return resources.get(name) ?? url;
  });
  manager.onError = (url) => {
    if (!resources.has(decodeURIComponent((url.split(/[?#]/)[0].split(/[\\/]/).pop() || '')).toLowerCase())) {
      missing.add(decodeURIComponent(url.split(/[?#]/)[0].split(/[\\/]/).pop() || url));
    }
  };
  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  const mainUrl = resources.get(main.name.toLowerCase());

  try {
    let root;
    switch (ext) {
      case 'glb':
      case 'gltf': {
        const loader = new GLTFLoader(manager)
          .setDRACOLoader(draco)
          .setKTX2Loader(ktx2)
          .setMeshoptDecoder(MeshoptDecoder);
        root = (await loader.loadAsync(mainUrl, onProgress)).scene;
        break;
      }
      case 'obj': {
        const loader = new OBJLoader(manager);
        const mtl = files.find((f) => extOf(f.name) === 'mtl');
        if (mtl) {
          const mats = await new MTLLoader(manager).loadAsync(resources.get(mtl.name.toLowerCase()));
          mats.preload();
          loader.setMaterials(mats);
        }
        root = await loader.loadAsync(mainUrl, onProgress);
        break;
      }
      case 'fbx':
        root = await new FBXLoader(manager).loadAsync(mainUrl, onProgress);
        break;
      case 'dae':
        root = (await new ColladaLoader(manager).loadAsync(mainUrl, onProgress)).scene;
        break;
      case 'stl': {
        const geo = await new STLLoader(manager).loadAsync(mainUrl, onProgress);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xb9bec9, roughness: 0.5, metalness: 0.15, vertexColors: !!geo.hasColors,
        });
        root = new THREE.Mesh(geo, mat);
        break;
      }
      case 'ply': {
        const geo = await new PLYLoader(manager).loadAsync(mainUrl, onProgress);
        const hasColor = !!geo.getAttribute('color');
        if (geo.index) {
          if (!geo.getAttribute('normal')) geo.computeVertexNormals();
          root = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: hasColor ? 0xffffff : 0xb9bec9, vertexColors: hasColor, roughness: 0.55, metalness: 0.1,
          }));
        } else {
          geo.computeBoundingBox();
          const diag = geo.boundingBox.getSize(new THREE.Vector3()).length() || 1;
          const count = geo.getAttribute('position').count;
          root = new THREE.Points(geo, new THREE.PointsMaterial({
            size: (diag / Math.cbrt(Math.max(count, 1))) * 0.6,
            sizeAttenuation: true,
            vertexColors: hasColor,
            color: hasColor ? 0xffffff : 0xb9bec9,
          }));
        }
        break;
      }
      default:
        throw new Error(`Format « .${ext} » non géré.`);
    }

    if (token !== state.loadToken) { urls.forEach((u) => URL.revokeObjectURL(u)); return; }

    setProgress(null);
    $('loading-sub').textContent = 'Préparation de la scène…';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

    disposeModel();
    state.blobUrls = urls;
    installModel(root, main, performance.now() - t0);

    if (missing.size) {
      const list = [...missing].slice(0, 3).join(', ') + (missing.size > 3 ? '…' : '');
      toast(`${missing.size} texture(s) introuvable(s) : ${list}. Déposez-les avec le modèle.`, { type: 'warn', duration: 8000 });
    }
  } catch (err) {
    console.error(err);
    urls.forEach((u) => URL.revokeObjectURL(u));
    toast(`Échec du chargement de « ${main.name} » : ${err.message || err}`, { type: 'error', duration: 8000 });
  } finally {
    if (token === state.loadToken) hideLoading();
  }
}

/* ==========================================================================
   Installation du modèle dans la scène
   ========================================================================== */

function installModel(root, file, loadMs) {
  prepareModel(root);
  pivot.position.set(0, 0, 0);
  pivot.add(root);
  state.root = root;
  state.fileName = file.name;
  state.lastRawFile = file;
  state.selected = null;
  selectionBox.visible = false;

  root.updateMatrixWorld(true);

  // Statistiques
  const stats = computeStats(root);

  // Boîte englobante (précise si le modèle est raisonnable)
  const box = new THREE.Box3().setFromObject(root, stats.vertices < 1.5e6);
  if (box.isEmpty() || !isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z)) {
    pivot.remove(root);
    state.root = null;
    toast('Aucune géométrie visible dans ce fichier.', { type: 'error' });
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Centrage : XZ sur l'origine, base posée sur la grille au sol
  pivot.position.set(-center.x, -box.min.y, -center.z);
  pivot.updateMatrixWorld(true);

  state.size.copy(size);
  state.box.set(
    new THREE.Vector3(-size.x / 2, 0, -size.z / 2),
    new THREE.Vector3(size.x / 2, size.y, size.z / 2)
  );
  state.center.set(0, size.y / 2, 0);
  state.radius = Math.max(size.length() / 2, 1e-9);
  stats.dims = size;

  // Meshes pour les modes de rendu
  state.meshes = [];
  root.traverse((o) => { if (o.isMesh) state.meshes.push(o); });

  buildGrid(Math.max(size.x, size.z, size.y * 0.5));
  fitShadowCamera();
  updateLighting();
  fitCamera({ box: state.box, dir: new THREE.Vector3(1, 0.62, 1), animate: false });

  buildHierarchy(root, file);
  applyMode(state.mode);
  fillInspector(stats, file, loadMs);

  $('empty-state').classList.add('gone');
  $('model-name').textContent = baseName(file.name);
  $('model-name').title = file.name;
  document.title = `${baseName(file.name)} — 3D Viewer Studio`;
  requestRender();
}

/* ==========================================================================
   Statistiques & tiroir d'inspection
   ========================================================================== */

function computeStats(root) {
  let vertices = 0, triangles = 0, meshes = 0, groups = 0;
  const materials = new Map();

  root.traverse((o) => {
    if (o.userData.__helper) return;
    if (o.isMesh) {
      meshes++;
      const pos = o.geometry.getAttribute('position');
      if (!pos) return;
      const inst = o.isInstancedMesh ? o.count : 1;
      vertices += pos.count * inst;
      triangles += (o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3) * inst;
    } else if (o.isPoints || o.isLine) {
      const pos = o.geometry.getAttribute('position');
      if (pos) vertices += pos.count;
    } else if (o.isGroup || o.isObject3D) {
      if (o.children.length && o !== root) groups++;
    }
    if (o.isMesh || o.isPoints || o.isLine) {
      const mats = o.userData.origMaterial ?? o.material;
      for (const m of Array.isArray(mats) ? mats : [mats]) if (m) materials.set(m.uuid, m);
    }
  });
  return { vertices, triangles, meshes, groups, materials: [...materials.values()], dims: new THREE.Vector3() };
}

function fillInspector(s, file, loadMs) {
  $('m-verts').textContent = fmtInt(s.vertices);
  $('m-tris').textContent = fmtInt(s.triangles);
  $('m-meshes').textContent = fmtInt(s.meshes);
  $('m-groups').textContent = s.groups ? `${fmtInt(s.groups)} groupe(s)` : '';
  $('m-mats').textContent = fmtInt(s.materials.length);
  $('m-dx').textContent = fmtDim(s.dims.x);
  $('m-dy').textContent = fmtDim(s.dims.y);
  $('m-dz').textContent = fmtDim(s.dims.z);

  const list = $('mat-list');
  list.textContent = '';
  if (!s.materials.length) list.innerHTML = '<span class="muted">Aucun matériau</span>';
  s.materials.forEach((m, i) => {
    const chip = document.createElement('span');
    chip.className = 'mat-chip';
    const sw = document.createElement('i');
    sw.style.background = m.color ? `#${m.color.getHexString()}` : '#888';
    const label = document.createElement('span');
    label.textContent = m.name || `Matériau sans nom ${i + 1}`;
    chip.title = `${label.textContent} — ${m.type}`;
    chip.append(sw, label);
    list.appendChild(chip);
  });

  $('file-info').textContent =
    `${file.name} · ${(file.size / 1048576).toFixed(2).replace('.', ',')} Mo · chargé en ${Math.round(loadMs)} ms`;

  $('drawer-summary').textContent =
    `${fmtInt(s.vertices)} sommets · ${fmtInt(s.triangles)} tri. · ${fmtInt(s.meshes)} maillages · ` +
    `${fmtInt(s.materials.length)} mat. · ${fmtDim(s.dims.x)} × ${fmtDim(s.dims.y)} × ${fmtDim(s.dims.z)}`;
}

function setDrawer(open) {
  $('drawer').classList.toggle('open', open);
  document.body.classList.toggle('drawer-open', open);
  $('drawer-handle').setAttribute('aria-expanded', String(open));
}
$('drawer-handle').addEventListener('click', () => setDrawer(!$('drawer').classList.contains('open')));

/* ==========================================================================
   Modes de rendu : PBR / Superposé / Filaire / UV
   ========================================================================== */

const matList = (m) => (Array.isArray(m) ? m : [m]);

function setPolygonOffset(mesh, on) {
  for (const m of matList(mesh.userData.origMaterial)) {
    if (!m) continue;
    if (on) {
      if (!m.userData.__po) m.userData.__po = [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits];
      m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
    } else if (m.userData.__po) {
      [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits] = m.userData.__po;
      delete m.userData.__po;
    }
  }
}

function removeOverlay(mesh) {
  const w = mesh.userData.__overlay;
  if (w) { mesh.remove(w); delete mesh.userData.__overlay; }
}

function addOverlay(mesh) {
  if (mesh.userData.__overlay) return;
  let w;
  if (mesh.isSkinnedMesh) {
    w = new THREE.SkinnedMesh(mesh.geometry, wireOverlayMat);
    w.bind(mesh.skeleton, mesh.bindMatrix);
  } else if (mesh.isInstancedMesh) {
    w = new THREE.InstancedMesh(mesh.geometry, wireOverlayMat, mesh.count);
    w.instanceMatrix = mesh.instanceMatrix;
  } else {
    w = new THREE.Mesh(mesh.geometry, wireOverlayMat);
  }
  w.userData.__helper = true;
  w.frustumCulled = mesh.frustumCulled;
  w.raycast = () => {};
  mesh.add(w);
  mesh.userData.__overlay = w;
}

function applyMode(mode) {
  state.mode = mode;

  if (mode === 'uv') {
    if (!state.uvChecker) {
      state.uvChecker = createUVChecker(Math.min(4096, renderer.capabilities.maxTextureSize));
      uvMat.map = state.uvChecker;
      uvMat.needsUpdate = true;
    }
  }

  for (const mesh of state.meshes) {
    removeOverlay(mesh);
    setPolygonOffset(mesh, mode === 'overlay');
    mesh.castShadow = mode !== 'wire';
    switch (mode) {
      case 'wire': mesh.material = wireMat; break;
      case 'uv': mesh.material = uvMat; break;
      case 'overlay': mesh.material = mesh.userData.origMaterial; addOverlay(mesh); break;
      default: mesh.material = mesh.userData.origMaterial;
    }
  }

  document.querySelectorAll('#mode-group .seg').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });

  const uvCard = $('uv-card');
  uvCard.hidden = mode !== 'uv';
  if (mode === 'uv') drawUV();
  requestRender();
}

document.querySelectorAll('#mode-group .seg').forEach((b) =>
  b.addEventListener('click', () => applyMode(b.dataset.mode))
);

/* ==========================================================================
   Aperçu 2D du dépliage UV
   ========================================================================== */

function isVisibleInTree(o) {
  for (let p = o; p && p !== pivot; p = p.parent) if (!p.visible) return false;
  return true;
}

function uvTargets() {
  const out = [];
  const scan = (o) => { if (o.isMesh && !o.userData.__helper && isVisibleInTree(o)) out.push(o); };
  if (state.selected) state.selected.traverse(scan);
  else state.meshes.forEach(scan);
  return out;
}

function drawUV() {
  const cv = $('uv-canvas');
  const g = cv.getContext('2d');
  const S = cv.width;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#0b0c0e';
  g.fillRect(0, 0, S, S);

  const meshes = uvTargets();
  let minU = 0, maxU = 1, minV = 0, maxV = 1, tris = 0, noUV = 0, used = 0;
  for (const m of meshes) {
    const uv = m.geometry.getAttribute('uv');
    if (!uv) { noUV++; continue; }
    used++;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u < minU) minU = u; else if (u > maxU) maxU = u;
      if (v < minV) minV = v; else if (v > maxV) maxV = v;
    }
    tris += m.geometry.index ? m.geometry.index.count / 3 : uv.count / 3;
  }
  if (!isFinite(minU + maxU + minV + maxV)) { minU = minV = 0; maxU = maxV = 1; }

  const u0 = Math.floor(minU + 1e-6), u1 = Math.max(u0 + 1, Math.ceil(maxU - 1e-6));
  const v0 = Math.floor(minV + 1e-6), v1 = Math.max(v0 + 1, Math.ceil(maxV - 1e-6));
  const span = Math.max(u1 - u0, v1 - v0);
  const pad = 26;
  const scale = (S - pad * 2) / span;
  const offX = pad + ((S - pad * 2) - (u1 - u0) * scale) / 2;
  const offY = pad + ((S - pad * 2) - (v1 - v0) * scale) / 2;
  const X = (u) => offX + (u - u0) * scale;
  const Y = (v) => S - offY - (v - v0) * scale;

  // Tuile unité [0,1] : damier discret
  const cells = 8;
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    if ((i + j) & 1) continue;
    g.fillRect(X(i / cells), Y((j + 1) / cells), scale / cells, scale / cells);
  }

  // Grille de tuiles
  if (span <= 24) {
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let u = u0; u <= u1; u++) { g.moveTo(X(u), Y(v0)); g.lineTo(X(u), Y(v1)); }
    for (let v = v0; v <= v1; v++) { g.moveTo(X(u0), Y(v)); g.lineTo(X(u1), Y(v)); }
    g.stroke();
  }

  // Tuile 0..1
  g.strokeStyle = 'rgba(110,160,255,0.75)';
  g.lineWidth = 1.5;
  g.strokeRect(X(0), Y(1), scale, scale);

  // Triangles UV (une teinte par maillage pour distinguer les îlots)
  if (tris > 0) {
    const palette = [[110, 160, 255], [255, 159, 90], [126, 224, 160], [224, 122, 232], [242, 212, 92], [90, 214, 224]];
    const paths = palette.map(() => new Path2D());
    const stride = Math.max(1, Math.ceil(tris / 150000));
    meshes.forEach((m, mi) => {
      const geo = m.geometry;
      const uv = geo.getAttribute('uv');
      if (!uv) return;
      const path = paths[mi % palette.length];
      const idx = geo.index;
      const count = idx ? idx.count / 3 : uv.count / 3;
      for (let t = 0; t < count; t += stride) {
        const a = idx ? idx.getX(t * 3) : t * 3;
        const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        path.moveTo(X(uv.getX(a)), Y(uv.getY(a)));
        path.lineTo(X(uv.getX(b)), Y(uv.getY(b)));
        path.lineTo(X(uv.getX(c)), Y(uv.getY(c)));
        path.closePath();
      }
    });
    g.lineJoin = 'round';
    g.lineWidth = 0.8;
    paths.forEach((path, i) => {
      const [r, gr, b] = palette[i];
      g.fillStyle = `rgba(${r},${gr},${b},0.10)`;
      g.fill(path);
      g.strokeStyle = `rgba(${r},${gr},${b},0.55)`;
      g.stroke(path);
    });
  }

  // Repères
  g.font = '600 20px "JetBrains Mono", Consolas, monospace';
  g.fillStyle = 'rgba(200,205,220,0.7)';
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.fillText('0,0', X(0) + 4, Y(0) + 5);
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.fillText('1,1', X(1) - 4, Y(1) - 5);

  // Informations
  $('uv-title').textContent = state.selected
    ? (state.selected.name || (state.selected.isMesh ? 'Mesh' : 'Groupe'))
    : 'Tous les maillages';
  const out = (minU < -1e-4 || maxU > 1 + 1e-4 || minV < -1e-4 || maxV > 1 + 1e-4);
  const lines = [];
  if (!meshes.length) lines.push('Aucun maillage visible.');
  else {
    lines.push(`${fmtInt(used)} maillage(s) · ${fmtInt(tris)} triangles`);
    if (used) lines.push(`U ${minU.toFixed(3)} → ${maxU.toFixed(3)} · V ${minV.toFixed(3)} → ${maxV.toFixed(3)}`);
    if (out) lines.push('⚠ UV hors de la tuile [0, 1]');
    if (noUV) lines.push(`${noUV} maillage(s) sans coordonnées UV`);
  }
  $('uv-info').textContent = lines.join('\n');
  $('uv-info').style.whiteSpace = 'pre-line';
}

/* ==========================================================================
   Gestionnaire de calques / hiérarchie
   ========================================================================== */

const treeEl = $('tree');
const nodeInfo = new Map();      // Object3D -> { has, tris }
const rows = new Map();          // Object3D -> { li, row, caret, kids }

const isRenderable = (o) => (o.isMesh || o.isPoints || o.isLine) && !o.userData.__helper;

function analyse(o) {
  let tris = 0, has = false;
  if (isRenderable(o)) {
    has = true;
    if (o.isMesh) {
      const pos = o.geometry.getAttribute('position');
      if (pos) tris = o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
    }
  }
  for (const c of o.children) {
    if (c.userData.__helper) continue;
    const i = analyse(c);
    if (i.has) { has = true; tris += i.tris; }
  }
  const info = { has, tris };
  nodeInfo.set(o, info);
  return info;
}

const layerChildren = (o) => o.children.filter((c) => !c.userData.__helper && nodeInfo.get(c)?.has);

function displayName(o, index) {
  if (o.name) return o.name;
  if (o === state.root) return baseName(state.fileName);
  const kind = o.isMesh ? 'Mesh' : o.isPoints ? 'Points' : o.isLine ? 'Ligne' : 'Groupe';
  return `${kind} ${index + 1}`;
}

function svgIcon(id, cls = 'i sm') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `#${id}`);
  s.appendChild(u);
  return s;
}

function actButton(cls, title, ...icons) {
  const b = document.createElement('button');
  b.className = `act ${cls}`;
  b.title = title;
  icons.forEach((i) => b.appendChild(i));
  return b;
}

function createNode(o, index, { flat = false, expand = false } = {}) {
  const li = document.createElement('li');
  li.className = 'node';
  li.setAttribute('role', 'treeitem');
  const row = document.createElement('div');
  row.className = `row ${o.isMesh ? 'is-mesh' : 'is-group'}`;

  const kids = flat ? [] : layerChildren(o);
  const caret = document.createElement('button');
  caret.className = `caret${kids.length ? '' : ' leaf'}`;
  caret.appendChild(svgIcon('i-chevron'));

  const ico = document.createElement('span');
  ico.className = 't-ico';
  ico.appendChild(svgIcon(o.isMesh || o.isPoints || o.isLine ? 'i-mesh' : 'i-group'));

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = displayName(o, index);
  name.title = name.textContent;

  const meta = document.createElement('span');
  meta.className = 'meta';
  const tris = nodeInfo.get(o)?.tris || 0;
  meta.textContent = tris ? (tris >= 1000 ? `${(tris / 1000).toFixed(tris >= 1e5 ? 0 : 1)}k` : `${Math.round(tris)}`) : '';
  meta.title = `${fmtInt(tris)} triangles`;

  const solo = actButton('solo', 'Isoler', svgIcon('i-solo'));
  const eye = actButton('eye', 'Masquer / afficher', svgIcon('i-eye', 'i sm on'), svgIcon('i-eye-off', 'i sm off'));

  row.append(caret, ico, name, meta, solo, eye);
  li.appendChild(row);

  const entry = { li, row, caret, kids: null, obj: o };
  rows.set(o, entry);

  const ensureKids = () => {
    if (entry.kids || flat) return;
    const ul = document.createElement('ul');
    ul.className = 'children';
    ul.setAttribute('role', 'group');
    layerChildren(o).forEach((c, i) => ul.appendChild(createNode(c, i)));
    li.appendChild(ul);
    entry.kids = ul;
  };
  const setOpen = (open) => {
    caret.classList.toggle('open', open);
    if (open) ensureKids();
    if (entry.kids) entry.kids.hidden = !open;
  };
  if (expand && kids.length) setOpen(true);

  caret.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!caret.classList.contains('open')); });
  row.addEventListener('click', () => selectObject(state.selected === o ? null : o));
  row.addEventListener('dblclick', () => focusObject(o));
  eye.addEventListener('click', (e) => { e.stopPropagation(); toggleVisible(o); });
  solo.addEventListener('click', (e) => { e.stopPropagation(); isolate(o); });

  li.classList.toggle('is-hidden', !o.visible);
  return li;
}

function buildHierarchy(root) {
  nodeInfo.clear();
  analyse(root);
  $('layer-search').value = '';
  renderTree();
}

function renderTree() {
  rows.clear();
  treeEl.textContent = '';
  treeEl.classList.remove('flat');
  if (!state.root) return;

  const q = $('layer-search').value.trim().toLowerCase();
  const ul = document.createElement('ul');
  if (!q) {
    ul.appendChild(createNode(state.root, 0, { expand: true }));
    // Premier niveau enfant ouvert par défaut
    const e = rows.get(state.root);
    if (e?.kids) e.kids.querySelectorAll(':scope > .node > .row > .caret:not(.leaf)').forEach((c, i) => { if (i < 12) c.click(); });
  } else {
    treeEl.classList.add('flat');
    let n = 0;
    state.root.traverse((o) => {
      if (n > 400 || o.userData.__helper || !nodeInfo.get(o)?.has) return;
      if (displayName(o, 0).toLowerCase().includes(q)) { ul.appendChild(createNode(o, n, { flat: true })); n++; }
    });
  }
  treeEl.appendChild(ul);
  refreshTree();
}
$('layer-search').addEventListener('input', renderTree);

function refreshTree() {
  rows.forEach((e, o) => {
    e.li.classList.toggle('is-hidden', !o.visible);
    e.row.classList.toggle('selected', o === state.selected);
  });
}

function toggleVisible(o) {
  o.visible = !o.visible;
  refreshTree();
  afterVisibilityChange();
}

function afterVisibilityChange() {
  if (state.mode === 'uv') drawUV();
  if (state.selected) updateSelectionBox();
  requestRender();
}

function isolate(o) {
  const keep = new Set();
  for (let p = o; p; p = p.parent) { keep.add(p); if (p === state.root) break; }
  o.traverse((c) => keep.add(c));
  state.root.traverse((n) => {
    if (n.userData.__helper || !nodeInfo.get(n)?.has) return;
    n.visible = keep.has(n);
  });
  refreshTree();
  afterVisibilityChange();
}

function showAll() {
  if (!state.root) return;
  state.root.traverse((n) => { if (!n.userData.__helper) n.visible = true; });
  refreshTree();
  afterVisibilityChange();
}
$('btn-showall').addEventListener('click', showAll);

function updateSelectionBox() {
  if (!state.selected) { selectionBox.visible = false; return; }
  const b = new THREE.Box3().setFromObject(state.selected);
  if (b.isEmpty()) { selectionBox.visible = false; return; }
  selectionBox.box.copy(b);
  selectionBox.visible = true;
}

function selectObject(o) {
  state.selected = o;
  updateSelectionBox();
  refreshTree();
  if (state.mode === 'uv') drawUV();
  requestRender();
}

function focusObject(o) {
  const b = new THREE.Box3().setFromObject(o);
  if (b.isEmpty()) return;
  fitCamera({ box: b, animate: true });
}

/* ==========================================================================
   Capture HD
   ========================================================================== */

async function captureHD() {
  console.log('Bouton cliqué : [3D Inspector] Capture HD');
  if (!state.root) { toast('Chargez un modèle avant de capturer une image.', { type: 'warn' }); return; }

  const cssW = stage.clientWidth, cssH = stage.clientHeight;
  const gl = renderer.getContext();
  const maxSide = Math.min(8192, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), renderer.capabilities.maxTextureSize);
  let scale = Math.max(2, 3840 / Math.max(cssW, cssH));
  scale = Math.min(scale, maxSide / Math.max(cssW, cssH));
  const W = Math.round(cssW * scale), H = Math.round(cssH * scale);

  const prevPR = renderer.getPixelRatio();
  selectionBox.visible = false;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  camera.clearViewOffset(); // modèle centré sur toute l'image
  renderer.render(scene, camera);
  const blob = await new Promise((res) => viewport.toBlob(res, 'image/png'));

  renderer.setPixelRatio(prevPR);
  renderer.setSize(cssW, cssH, false);
  applyViewOffset();
  updateSelectionBox();
  requestRender();

  if (!blob) { toast('Échec de la capture.', { type: 'error' }); return; }

  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const safe = baseName(state.fileName).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 60) || 'modele';
  const filename = `${safe}_${stamp}.png`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);

  if (!window.studio) toast(`Capture ${W} × ${H} px téléchargée : ${filename}`);
  else state.pendingShot = `${W} × ${H} px`;
}

if (window.studio && typeof window.studio.onDownloadDone === 'function') {
  window.studio.onDownloadDone(({ state: st, path }) => {
    if (st === 'completed') {
      toast(`Capture ${state.pendingShot || 'HD'} enregistrée dans Téléchargements`, {
        action: { label: 'Afficher', fn: () => window.studio.revealFile(path) }, duration: 7000,
      });
    } else {
      toast('La capture n’a pas pu être enregistrée.', { type: 'error' });
    }
  });
}

/* ==========================================================================
   Contrôles de l'interface
   ========================================================================== */

function bindToggle(btnId, targetEl, cls, onChange) {
  const btn = $(btnId);
  const set = (on) => {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    if (targetEl) targetEl.classList.toggle(cls, !on);
    onChange?.(on);
  };
  btn.addEventListener('click', () => set(!btn.classList.contains('active')));
  return set;
}

const setLayers = bindToggle('btn-layers', $('layers'), 'collapsed', (on) => {
  console.log('Bouton cliqué : [3D Inspector] Calques / Hiérarchie :', on ? 'OUVERT' : 'FERMÉ');
});
const setStudio = bindToggle('btn-studio', $('studio'), 'collapsed', (on) => {
  console.log('Bouton cliqué : [3D Inspector] Studio d\'éclairage :', on ? 'OUVERT' : 'FERMÉ');
});
const setGrid = bindToggle('btn-grid', null, null, (on) => {
  console.log('Bouton cliqué : [3D Inspector] Grille :', on ? 'VISIBLE' : 'MASQUÉE');
  gridGroup.visible = on;
  requestRender();
});

function fitCameraWithLog() {
  console.log('Bouton cliqué : [3D Inspector] Recadrer la caméra (F)');
  fitCamera({ animate: true });
}

// Sélecteur de fichiers
const fileInput = $('file-input');
const openPicker = () => {
  console.log('Bouton cliqué : [3D Inspector] Importer un modèle 3D');
  fileInput.click();
};
viewport.addEventListener('dblclick', fitCameraWithLog);
if (fileInput && !fileInput.dataset.inspBound) {
  fileInput.dataset.inspBound = 'true';
  fileInput.addEventListener('change', () => { loadFiles(fileInput.files); fileInput.value = ''; });
}

// Curseurs
function bindRange(id, outId, fmt, apply) {
  const el = $(id), out = $(outId);
  const update = () => {
    const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--fill', `${pct}%`);
    out.textContent = fmt(parseFloat(el.value));
    apply(parseFloat(el.value));
  };
  el.addEventListener('input', update);
  update();
}
bindRange('rng-light', 'out-light', (v) => `${Math.round(v)}°`, (v) => { state.lightAngle = v; updateLighting(); });
bindRange('rng-exposure', 'out-exposure', (v) => fmtSlider(v), (v) => { renderer.toneMappingExposure = v; requestRender(); });
bindRange('rng-env', 'out-env', (v) => fmtSlider(v), (v) => { scene.environmentIntensity = v; requestRender(); });
$('chk-shadows').addEventListener('change', (e) => {
  keyLight.castShadow = e.target.checked;
  shadowGround.visible = e.target.checked;
  requestRender();
});

/* ---------- Glisser-déposer ---------- */

const dropOverlay = $('drop-overlay');
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropOverlay.classList.add('show');
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay.classList.remove('show');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('show');
  if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
});

/* ---------- Raccourcis clavier ---------- */

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  switch (e.key.toLowerCase()) {
    case 'o': openPicker(); break;
    case 'l': $('btn-layers').click(); break;
    case 'e': $('btn-studio').click(); break;
    case 'g': $('btn-grid').click(); break;
    case 'f': fitCamera({ animate: true }); break;
    case 's': captureHD(); break;
    case 'i': setDrawer(!$('drawer').classList.contains('open')); break;
    case '1': applyMode('shaded'); break;
    case '2': applyMode('overlay'); break;
    case '3': applyMode('wire'); break;
    case '4': applyMode('uv'); break;
    case 'escape': selectObject(null); break;
    default: return;
  }
});

/* ==========================================================================
   Démarrage
   ========================================================================== */

buildGrid(2);
updateLighting();
fitShadowCamera();
resize();
fitCamera({ box: state.box, dir: new THREE.Vector3(1, 0.62, 1), animate: false });
requestAnimationFrame(tick);

// Options de lancement (ouverture par la ligne de commande / tests)
const params = new URLSearchParams(location.search);
if (params.get('drawer')) setDrawer(true);
if (params.get('hidepanels')) { setLayers(false); setStudio(false); }

if (window.studio && typeof window.studio.onOpenFiles === 'function') {
  window.studio.onOpenFiles(async (list) => {
    const files = list.map((f) => new File([f.data], f.name));
    await loadFiles(files);
    if (params.get('mode')) applyMode(params.get('mode'));
    window.studio.loaded?.();
  });
  window.studio.ready?.();
}

window.__viewer = { loadFiles, applyMode, state, scene, camera, renderer, selectObject, isolate };
window.__viewerReady = true;


// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & INTER-MODULE BRIDGES
// -----------------------------------------------------------------------------

window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    isStudioActive = !!e.data.active;
    if (isStudioActive && !animId) {
      animId = requestAnimationFrame(tick);
    }
  }
});

// Notify parent Hub that frame is mounted
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'ARCHFORGE_FRAME_READY' }, '*');
}

// Helper: Prepare a self-contained binary model buffer for cross-workspace transfer
async function prepareModelExportBuffer() {
  if (!state.root) {
    throw new Error('Veuillez d\'abord charger un modèle 3D.');
  }

  const rawExt = (state.fileName ? extOf(state.fileName) : '').toLowerCase();

  // If the raw imported file was already a binary GLB and is available as a Blob, use its buffer directly
  if (rawExt === 'glb' && state.lastRawFile instanceof Blob) {
    const rawBuffer = await state.lastRawFile.arrayBuffer();
    return {
      buffer: rawBuffer,
      filename: state.fileName || 'model.glb',
      ext: 'glb'
    };
  }

  // Otherwise, export scene meshes to a clean, self-contained binary GLB
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();

  const exportScene = new THREE.Scene();
  exportScene.name = baseName(state.fileName || 'model');

  state.root.updateMatrixWorld(true);

  let meshCount = 0;
  state.root.traverse((o) => {
    if (o.isMesh && o.visible && !o.userData.__helper && o.geometry) {
      meshCount++;
      const geom = o.geometry.clone();
      geom.applyMatrix4(o.matrixWorld);

      // Clean material without circular userData
      let cleanMat;
      const srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (srcMat && srcMat.isMaterial) {
        cleanMat = new THREE.MeshStandardMaterial({
          color: srcMat.color ? srcMat.color.clone() : new THREE.Color(0xd1d5db),
          roughness: srcMat.roughness ?? 0.6,
          metalness: srcMat.metalness ?? 0.1,
          side: THREE.DoubleSide
        });
        if (srcMat.map && srcMat.map.isTexture && srcMat.map.image) {
          cleanMat.map = srcMat.map;
        }
      } else {
        cleanMat = new THREE.MeshStandardMaterial({
          color: 0xd1d5db,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
      }

      const m = new THREE.Mesh(geom, cleanMat);
      m.name = o.name || `Mesh_${meshCount}`;
      m.userData = {}; // Clear circular references
      exportScene.add(m);
    }
  });

  if (meshCount === 0) {
    throw new Error('Le modèle ne contient aucun maillage 3D visible à exporter.');
  }

  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      exportScene,
      (gltf) => resolve(gltf),
      (err) => reject(new Error(err && err.message ? err.message : String(err))),
      {
        binary: true,
        onlyVisible: true,
        embedImages: false,
        maxTextureSize: 1024
      }
    );
  });

  // Cleanup temporary cloned resources
  exportScene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose && m.dispose());
      else o.material.dispose && o.material.dispose();
    }
  });

  const outName = baseName(state.fileName || 'model') + '.glb';
  return {
    buffer: glbBuffer,
    filename: outName,
    ext: 'glb'
  };
}

// Bridge action: Send to Maquette Slicer
async function sendToSlicer() {
  console.log('Bouton cliqué : [3D Inspector] Transférer vers Maquette Slicer');
  if (!state.root) {
    toast('Veuillez ouvrir ou déposer un modèle 3D avant de le transférer.', { type: 'warn' });
    return;
  }

  try {
    toast('Préparation du transfert vers Maquette Slicer...');
    const { buffer, filename, ext } = await prepareModelExportBuffer();

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'ARCHFORGE_TRANSFER_MODEL',
        target: 'slicer',
        name: filename,
        buffer: buffer,
        ext: ext
      }, '*');
    } else {
      toast(`Modèle prêt pour Maquette Slicer (${filename}).`);
    }
  } catch (err) {
    console.error('[Bridge Slicer Error]:', err);
    toast('Échec du transfert vers Maquette Slicer : ' + err.message, { type: 'error' });
  }
}

// Bridge action: Send to ArchPhysics
async function sendToPhysics() {
  console.log('Bouton cliqué : [3D Inspector] Transférer vers ArchPhysics');
  if (!state.root) {
    toast('Veuillez ouvrir ou déposer un modèle 3D avant de le transférer.', { type: 'warn' });
    return;
  }

  try {
    toast('Préparation du transfert vers ArchPhysics...');
    const { buffer, filename, ext } = await prepareModelExportBuffer();

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'ARCHFORGE_TRANSFER_MODEL',
        target: 'archphysics',
        name: filename,
        buffer: buffer,
        ext: ext
      }, '*');
    } else {
      toast(`Modèle prêt pour ArchPhysics (${filename}).`);
    }
  } catch (err) {
    console.error('[Bridge ArchPhysics Error]:', err);
    toast('Échec du transfert vers ArchPhysics : ' + err.message, { type: 'error' });
  }
}

// Centralisation de l'initialisation des écouteurs du module 3D Inspector
function initModuleListeners() {
  const btnCap = $('btn-capture');
  if (btnCap && !btnCap.dataset.inspBound) {
    btnCap.dataset.inspBound = 'true';
    btnCap.addEventListener('click', (e) => {
      e.stopPropagation();
      captureHD();
    });
  }

  const btnOp = $('btn-open');
  if (btnOp && !btnOp.dataset.inspBound) {
    btnOp.dataset.inspBound = 'true';
    btnOp.addEventListener('click', (e) => {
      e.stopPropagation();
      openPicker();
    });
  }

  const btnOpEmpty = $('btn-open-empty');
  if (btnOpEmpty && !btnOpEmpty.dataset.inspBound) {
    btnOpEmpty.dataset.inspBound = 'true';
    btnOpEmpty.addEventListener('click', (e) => {
      e.stopPropagation();
      openPicker();
    });
  }

  const btnRec = $('btn-recenter');
  if (btnRec && !btnRec.dataset.inspBound) {
    btnRec.dataset.inspBound = 'true';
    btnRec.addEventListener('click', (e) => {
      e.stopPropagation();
      fitCameraWithLog();
    });
  }

  const btnSlicer = $('btn-send-slicer');
  if (btnSlicer && !btnSlicer.dataset.inspBound) {
    btnSlicer.dataset.inspBound = 'true';
    btnSlicer.addEventListener('click', (e) => {
      e.stopPropagation();
      sendToSlicer();
    });
  }

  const btnPhys = $('btn-send-physics');
  if (btnPhys && !btnPhys.dataset.inspBound) {
    btnPhys.dataset.inspBound = 'true';
    btnPhys.addEventListener('click', (e) => {
      e.stopPropagation();
      sendToPhysics();
    });
  }

  const btnShow = $('btn-showall');
  if (btnShow && !btnShow.dataset.inspBound) {
    btnShow.dataset.inspBound = 'true';
    btnShow.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Bouton cliqué : [3D Inspector] Tout afficher');
      showAll();
    });
  }
}

// Réception des événements du Hub
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'ARCHFORGE_REINIT_LISTENERS') {
    initModuleListeners();
  }
  if (e.data.type === 'ARCHFORGE_SET_ACTIVE' && e.data.active) {
    initModuleListeners();
    requestRender();
  }
});

// Initialisation initiale dès que le DOM est complètement chargé
function startInspector() {
  initModuleListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startInspector);
} else {
  startInspector();
}

// Export fonctions globales
window.initModuleListeners = initModuleListeners;
window.captureHD = captureHD;
window.openPicker = openPicker;
window.fitCamera = fitCamera;
window.sendToSlicer = sendToSlicer;
window.sendToPhysics = sendToPhysics;
window.showAll = showAll;

// Signal that local Three.js viewer is fully initialized (100% offline)
window.__viewerReady = true;

