/**
 * ArchPhysics Studio — Visualiseur Three.js (ES Modules, r165)
 * Scène, import de maquettes, raycasting, maquette test procédurale, colorisation.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const MODEL_EXT = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ifc'];
const ext = (name) => (name.split('.').pop() || '').toLowerCase();
const base = (p) => decodeURIComponent(p.split(/[\\/]/).pop().split('?')[0]);

/* -------------------------------------------------------------------------- */
/*  Métriques géométriques d'un maillage (dimensions locales × échelle monde)  */
/* -------------------------------------------------------------------------- */
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3();

export function meshMetrics(mesh) {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  mesh.matrixWorld.decompose(_p, _q, _s);
  const sx = Math.abs(_s.x), sy = Math.abs(_s.y), sz = Math.abs(_s.z);
  const lsize = geo.boundingBox.getSize(new THREE.Vector3());
  const size = { x: lsize.x * sx, y: lsize.y * sy, z: lsize.z * sz };
  const sorted = [size.x, size.y, size.z].sort((u, v) => v - u);
  const [L, W, T] = sorted;
  const bboxVol = size.x * size.y * size.z;

  // Surface développée et volume signé (théorème de la divergence) en repère monde
  const pos = geo.attributes.position;
  const idx = geo.index;
  const m = mesh.matrixWorld;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  let area = 0, vol6 = 0;
  for (let i = 0; i < tri; i++) {
    const i0 = idx ? idx.getX(3 * i) : 3 * i, i1 = idx ? idx.getX(3 * i + 1) : 3 * i + 1, i2 = idx ? idx.getX(3 * i + 2) : 3 * i + 2;
    _a.fromBufferAttribute(pos, i0).applyMatrix4(m);
    _b.fromBufferAttribute(pos, i1).applyMatrix4(m);
    _c.fromBufferAttribute(pos, i2).applyMatrix4(m);
    _ab.subVectors(_b, _a); _ac.subVectors(_c, _a);
    area += _ab.cross(_ac).length() * 0.5;
    vol6 += _a.dot(_b.clone().cross(_c));
  }
  let volume = Math.abs(vol6) / 6;
  let volApprox = false;
  if (!(volume > 1e-12) || volume > bboxVol * 1.05 || volume < bboxVol * 0.02) { volume = bboxVol; volApprox = true; }

  return { size, L, W, T, area: L * W, areaTri: area, volume, volApprox, bboxVol, triangles: Math.round(tri) };
}

/* -------------------------------------------------------------------------- */
/*  Viewer                                                                     */
/* -------------------------------------------------------------------------- */
export class Viewer {
  constructor(container, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.selected = null;
    this.selectedList = [];
    this._lastClickHit = null;
    this.edgesOn = false; // Désactivé par défaut sur maquettes denses
    this._dirty = true;
    this.isStudioActive = true;
    this.animId = null;
    this.unit = 1;

    // --- Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0e0f11, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'viewport-canvas';

    // --- Scène
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0f11);
    this.scene.fog = new THREE.Fog(0x0e0f11, 60, 160);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
    this.camera.position.set(9, 6.5, 10);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.target.set(0, 1.4, 0);
    this.controls.maxPolarAngle = Math.PI * 0.499;
    this.controls.addEventListener('change', () => this.invalidate());

    this._buildLights();
    this._buildGround();

    this.modelRoot = new THREE.Group();
    this.modelRoot.name = 'Modèle';
    this.scene.add(this.modelRoot);

    // --- Post-traitement (surbrillance par contour)
    const initW = Math.max(container.clientWidth || 800, 100);
    const initH = Math.max(container.clientHeight || 600, 100);
    const size = new THREE.Vector2(initW, initH);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(size, this.scene, this.camera);
    this.outline.visibleEdgeColor.set(0xf59e0b);
    this.outline.hiddenEdgeColor.set(0x7a4d06);
    this.outline.edgeStrength = 5;
    this.outline.edgeGlow = 0.35;
    this.outline.edgeThickness = 2.2;
    this.outline.pulsePeriod = 0;
    this.composer.addPass(this.outline);
    this.composer.addPass(new OutputPass());

    // --- Raycasting & Maillages plats optimisés
    this.raycaster = new THREE.Raycaster();
    this._ptr = new THREE.Vector2();
    this._down = null;
    this._cachedMeshes = null; // Tableau plat de référence mis en cache
    this._hoveredMesh = null;
    this._tempSphere = new THREE.Sphere();
    this._tempVec3 = new THREE.Vector3();
    this._sharedLineMat = new THREE.LineBasicMaterial({ color: 0x0e0f11, transparent: true, opacity: 0.75, depthTest: true });
    this._highlightLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95, linewidth: 2, depthTest: false });

    // --- Sélection rectangulaire 3D (Marquee selection box)
    this.marqueeEl = this.container.querySelector('#viewport-marquee');
    if (!this.marqueeEl) {
      this.marqueeEl = document.createElement('div');
      this.marqueeEl.id = 'viewport-marquee';
      this.marqueeEl.className = 'viewport-selection-box';
      this.marqueeEl.hidden = true;
      this.container.appendChild(this.marqueeEl);
    }
    this.marqueeMode = false;
    this._marqueeStart = null;
    this._marqueeDragging = false;
    this.layersMap = new Map();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
      // Déclenchement de la sélection rectangulaire par bouton toolbar ou Shift + Glisser
      if (e.button === 0 && (this.marqueeMode || e.shiftKey)) {
        this._marqueeStart = { x: e.clientX, y: e.clientY };
        this._marqueeDragging = false;
        this.controls.enabled = false;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this._marqueeStart && (e.buttons & 1)) {
        const dx = e.clientX - this._marqueeStart.x;
        const dy = e.clientY - this._marqueeStart.y;
        if (!this._marqueeDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          this._marqueeDragging = true;
          this.marqueeEl.hidden = false;
        }
        if (this._marqueeDragging) {
          const rect = this.container.getBoundingClientRect();
          const left = Math.min(this._marqueeStart.x, e.clientX) - rect.left;
          const top = Math.min(this._marqueeStart.y, e.clientY) - rect.top;
          const width = Math.abs(dx);
          const height = Math.abs(dy);
          this.marqueeEl.style.left = `${left}px`;
          this.marqueeEl.style.top = `${top}px`;
          this.marqueeEl.style.width = `${width}px`;
          this.marqueeEl.style.height = `${height}px`;
          return;
        }
      }
      this._onPointerMove(e);
    });

    el.addEventListener('pointerup', (e) => {
      if (this._marqueeStart) {
        this.controls.enabled = true;
        const wasDragging = this._marqueeDragging;
        const start = this._marqueeStart;
        this._marqueeStart = null;
        this._marqueeDragging = false;
        this.marqueeEl.hidden = true;
        if (wasDragging) {
          this._onMarqueeSelect(start, { x: e.clientX, y: e.clientY }, e);
          return;
        }
      }
      this._onPointerUp(e);
    });

    el.addEventListener('pointerleave', () => {
      if (this._marqueeStart) {
        this.controls.enabled = true;
        this._marqueeStart = null;
        this._marqueeDragging = false;
        this.marqueeEl.hidden = true;
      }
      this._updateHoverHighlight(null);
      this.hooks.onHover && this.hooks.onHover(null);
    });

    new ResizeObserver(() => this.resize()).observe(container);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.start();
  }

  invalidate() {
    this._dirty = true;
  }

  start() {
    this.isStudioActive = true;
    this.invalidate();
    if (this.animId) return;

    const loop = () => {
      if (!this.isStudioActive) {
        this.animId = null;
        return;
      }
      this.animId = requestAnimationFrame(loop);
      if (this.controls.update()) this._dirty = true;
      if (this._dirty) {
        this._dirty = false;
        this.render();
      }
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    this.isStudioActive = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  animate() {
    this.start();
  }

  render() {
    try {
      if (this.outline && this.outline.selectedObjects && this.outline.selectedObjects.length > 0) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (err) {
      console.warn('[Viewer] Render fallback:', err);
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w < 50 || h < 50) return;

    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.outline) this.outline.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /* ---------------- Environnement ---------------- */
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x1a1b20, 0.55));
    const sun = new THREE.DirectionalLight(0xfff3df, 2.4);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0x8fb2ff, 0.5);
    fill.position.set(-8, 5, -7);
    this.scene.add(fill);
  }

  _buildGround() {
    this.grid = new THREE.GridHelper(60, 60, 0x2f3139, 0x1d1e23);
    this.grid.position.y = -0.002;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.9;
    this.scene.add(this.grid);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.004;
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    this.groundShadow = shadow;
  }

  setGrid(on) { this.grid.visible = on; this.invalidate(); }

  /* ---------------- Maillages ---------------- */
  meshes() {
    if (this._cachedMeshes) return this._cachedMeshes;
    const out = [];
    this.modelRoot.traverse((o) => { if (o.isMesh && !o.userData.isHelper) out.push(o); });
    this._cachedMeshes = out;
    return out;
  }

  invalidateMeshCache() {
    this._cachedMeshes = null;
  }

  _prepareMesh(mesh, n) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (!mesh.name) mesh.name = `Élément ${n}`;
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    if (!mesh.userData.baseMat) mesh.userData.baseMat = mesh.material;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => { if (m && m.isMaterial) m.needsUpdate = true; });
  }

  clearModel() {
    this.select(null);
    this._updateHoverHighlight(null);
    for (const o of [...this.modelRoot.children]) {
      this.modelRoot.remove(o);
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
        mats.forEach((m) => m.dispose && m.dispose());
        if (c.userData && c.userData.vizMat) c.userData.vizMat.dispose();
        if (c.userData && c.userData.edges) {
          if (c.userData.edges.geometry) c.userData.edges.geometry.dispose();
          delete c.userData.edges;
        }
      });
    }
    this.invalidateMeshCache();
    this.invalidate();
  }

  /** Finalise l'ajout d'un nouveau sous-arbre (indexation, arêtes, cadrage). */
  _adopt(root, { autoUnit = false, recenter = true } = {}) {
    this.modelRoot.add(root);
    this.invalidateMeshCache();
    let n = 1;
    root.traverse((o) => { if (o.isMesh) this._prepareMesh(o, n++); });
    this._extractLayers(root);
    let info = null;
    if (autoUnit) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const dim = box.getSize(new THREE.Vector3()).length() / Math.sqrt(3);
      const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray());
      let f = 1; let label = 'm';
      if (maxDim > 1500) { f = 0.001; label = 'mm'; } else if (maxDim > 150) { f = 0.01; label = 'cm'; }
      info = { factor: f, label, maxDim, dim };
      this.unit = f;
    }
    this.applyUnit(this.unit, recenter);
    // OPTIMISATION MAQUETTES LOURDES : on n'engendre plus EdgesGeometry sur des milliers de pièces au chargement
    this.updateActiveWireframes();
    this.fit();
    return info;
  }

  /* ---------------- Gestion des Groupes & Calques ---------------- */
  _extractLayers(root) {
    this.layersMap = new Map();
    const defaultColors = [
      '#38bdf8', '#a855f7', '#f59e0b', '#10b981', '#ec4899',
      '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
      '#e11d48', '#3b82f6', '#d97706', '#059669', '#7c3aed'
    ];
    let colorIdx = 0;

    const all = this.meshes();
    for (let i = 0; i < all.length; i++) {
      const mesh = all[i];
      let layerId = mesh.userData.layerId;
      let layerName = mesh.userData.layerName;

      if (!layerId) {
        if (mesh.userData.layer) {
          layerId = String(mesh.userData.layer).toLowerCase().replace(/[^a-z0-9]+/g, '_');
          layerName = String(mesh.userData.layer);
        } else {
          let curr = mesh.parent;
          let parentName = '';
          while (curr && curr !== root && curr !== this.modelRoot && curr !== this.scene) {
            if (curr.name && !curr.name.startsWith('Scene') && !curr.name.startsWith('Object_')) {
              parentName = curr.name;
              break;
            }
            curr = curr.parent;
          }

          if (parentName) {
            layerId = parentName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            layerName = parentName;
          } else {
            const n = (mesh.name || '').toLowerCase();
            if (/fondation|dalle|plancher|sol|slab|floor/.test(n)) {
              layerId = 'planchers'; layerName = 'Planchers & Dalles';
            } else if (/poteau|column|pilier|pieu|pillar/.test(n)) {
              layerId = 'poteaux'; layerName = 'Poteaux & Piliers';
            } else if (/poutre|beam|solive|chevron|panne|linteau/.test(n)) {
              layerId = 'poutres'; layerName = 'Poutres & Linteaux';
            } else if (/mur|wall|trumeau|cloison/.test(n)) {
              layerId = 'murs'; layerName = 'Murs & Parois';
            } else if (/toit|roof|couverture|charpente/.test(n)) {
              layerId = 'toiture'; layerName = 'Toiture';
            } else if (/vitr|baie|fenetre|window|glass|porte|door/.test(n)) {
              layerId = 'menuiseries'; layerName = 'Menuiseries & Vitrages';
            } else {
              layerId = 'default'; layerName = 'Éléments généraux';
            }
          }
        }
        mesh.userData.layerId = layerId;
        mesh.userData.layerName = layerName;
      }

      if (!this.layersMap.has(layerId)) {
        this.layersMap.set(layerId, {
          id: layerId,
          name: layerName,
          customName: null,
          count: 0,
          visible: true,
          color: defaultColors[colorIdx++ % defaultColors.length]
        });
      }
      const entry = this.layersMap.get(layerId);
      entry.count++;
    }
  }

  getLayers() {
    return Array.from(this.layersMap.values());
  }

  setLayerVisibility(layerId, visible) {
    const layer = this.layersMap.get(layerId);
    if (layer) layer.visible = visible;
    const meshes = this.meshes();
    for (let i = 0; i < meshes.length; i++) {
      if (meshes[i].userData.layerId === layerId) {
        if (!meshes[i].userData.arch) meshes[i].userData.arch = {};
        meshes[i].userData.arch.hidden = !visible;
      }
    }
    this.updateActiveWireframes();
    this.invalidate();
    this.hooks.onLayerVisibilityChanged && this.hooks.onLayerVisibilityChanged(layerId, visible);
  }

  renameLayer(layerId, newName) {
    const layer = this.layersMap.get(layerId);
    if (layer) {
      layer.name = newName;
      layer.customName = newName;
      const meshes = this.meshes();
      for (let i = 0; i < meshes.length; i++) {
        if (meshes[i].userData.layerId === layerId) {
          meshes[i].userData.layerName = newName;
        }
      }
      this.hooks.onLayersChanged && this.hooks.onLayersChanged();
    }
  }

  selectLayer(layerId) {
    const matching = this.meshes().filter((m) => m.userData.layerId === layerId && m.visible);
    if (matching.length) {
      this.selectAll(matching);
    }
  }

  /** Applique le facteur d'unité (modèle → mètres) puis recentre sur l'origine, posé sur le sol. */
  applyUnit(f, recenter = true) {
    this.unit = f;
    this.modelRoot.scale.setScalar(f);
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.updateMatrixWorld(true);
    if (recenter) {
      const box = new THREE.Box3().setFromObject(this.modelRoot);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        this.modelRoot.position.set(-c.x, -box.min.y, -c.z);
      }
    }
    this.modelRoot.updateMatrixWorld(true);
    this.invalidate();
    this.hooks.onModelChanged && this.hooks.onModelChanged();
  }

  /* ---------------- Optimisation rendu filaire (Edges) ---------------- */
  /**
   * Crée à la demande le tracé filaire d'un maillage spécifique.
   * Utilise le matériau partagé _sharedLineMat pour minimiser les draw calls.
   */
  _ensureMeshEdges(mesh) {
    if (!mesh || mesh.userData.edges) return mesh?.userData?.edges || null;
    try {
      const count = mesh.geometry?.attributes?.position?.count || 0;
      if (count > 250000) return null;
      const geo = new THREE.EdgesGeometry(mesh.geometry, 28);
      const e = new THREE.LineSegments(geo, this._sharedLineMat);
      e.userData.isHelper = true;
      e.raycast = () => {};
      mesh.add(e);
      mesh.userData.edges = e;
      return e;
    } catch (_) {
      return null;
    }
  }

  /** Met à jour les arêtes sur les éléments actifs (sélectionnés ou survolés) */
  updateActiveWireframes() {
    const activeSet = new Set(this.selectedList || []);
    if (this.selected) activeSet.add(this.selected);
    if (this._hoveredMesh) activeSet.add(this._hoveredMesh);

    const all = this.meshes();
    const isGlobal = !!this.edgesOn;

    for (let i = 0; i < all.length; i++) {
      const m = all[i];
      const shouldShow = isGlobal || activeSet.has(m);
      if (shouldShow) {
        // En mode global sur maquette très dense (> 1000 maillages), n'allouer que les objets visibles/actifs
        if (!m.userData.edges && (activeSet.has(m) || all.length <= 1500)) {
          this._ensureMeshEdges(m);
        }
        if (m.userData.edges) {
          m.userData.edges.visible = m.visible;
          // Surlignage distinctif pour l'élément survolé ou sélectionné
          if (m === this._hoveredMesh && !activeSet.has(m)) {
            m.userData.edges.material = this._highlightLineMat;
          } else {
            m.userData.edges.material = this._sharedLineMat;
          }
        }
      } else if (m.userData.edges) {
        m.userData.edges.visible = false;
      }
    }
    this.invalidate();
  }

  setEdges(on) {
    this.edgesOn = on;
    this.updateActiveWireframes();
  }

  /* ---------------- Visibilité & couleurs ---------------- */
  /** fn(mesh) -> boolean */
  setVisibility(fn) {
    for (const m of this.meshes()) m.visible = fn(m) !== false;
    if (this.selected && !this.selected.visible) this.select(null);
    this.updateActiveWireframes();
    this.invalidate();
  }

  /**
   * fn(mesh) -> null (matériau d'origine) | {rgb:[r,g,b], opacity?:number}
   */
  applyVisuals(fn) {
    for (const m of this.meshes()) {
      const v = fn(m);
      if (!v) { if (m.material !== m.userData.baseMat) m.material = m.userData.baseMat; continue; }
      let vm = m.userData.vizMat;
      if (!vm) {
        vm = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.04, side: THREE.DoubleSide });
        m.userData.vizMat = vm;
      }
      vm.color.setRGB(v.rgb[0], v.rgb[1], v.rgb[2], THREE.SRGBColorSpace);
      vm.emissive.setRGB(v.rgb[0], v.rgb[1], v.rgb[2], THREE.SRGBColorSpace).multiplyScalar(v.glow ?? 0.14);
      const op = v.opacity ?? 1;
      const trans = op < 1;
      if (vm.transparent !== trans) { vm.transparent = trans; vm.needsUpdate = true; }
      vm.opacity = op;
      vm.depthWrite = !trans;
      m.material = vm;
      m.castShadow = !trans;
    }
    this.invalidate();
  }

  /* ---------------- Sélection / raycasting haute performance ---------------- */
  select(mesh, { multi = false, toggle = false } = {}) {
    if (!mesh) {
      this.selected = null;
      this.selectedList = [];
    } else if (multi || toggle) {
      const idx = this.selectedList.indexOf(mesh);
      if (idx >= 0) {
        this.selectedList.splice(idx, 1);
        this.selected = this.selectedList.length ? this.selectedList[this.selectedList.length - 1] : null;
      } else {
        this.selectedList.push(mesh);
        this.selected = mesh;
      }
    } else {
      this.selected = mesh;
      this.selectedList = [mesh];
    }
    this.outline.selectedObjects = [...this.selectedList];
    this.updateActiveWireframes();
    this.invalidate();
    this.hooks.onSelect && this.hooks.onSelect(this.selected, this.selectedList);
  }

  selectAll(meshes) {
    const list = Array.isArray(meshes) ? meshes : this.meshes().filter((m) => m.visible);
    this.selectedList = [...list];
    this.selected = this.selectedList.length ? this.selectedList[0] : null;
    this.outline.selectedObjects = [...this.selectedList];
    this.updateActiveWireframes();
    this.invalidate();
    this.hooks.onSelect && this.hooks.onSelect(this.selected, this.selectedList);
  }

  deselectAll() {
    this.select(null);
  }

  setMarqueeMode(on) {
    this.marqueeMode = !!on;
    this.renderer.domElement.style.cursor = this.marqueeMode ? 'crosshair' : 'default';
  }

  /**
   * Sélection rectangulaire 3D : projette les boîtes englobantes des maillages dans l'espace écran
   * et sélectionne tous les objets intersectant le rectangle tracé.
   */
  _onMarqueeSelect(start, end, e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    if (maxX - minX < 4 && maxY - minY < 4) return;

    const targets = this.meshes().filter((m) => m.visible);
    const selected = [];
    const p = new THREE.Vector3();
    const box = new THREE.Box3();
    const corners = [
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
    ];

    for (let i = 0; i < targets.length; i++) {
      const m = targets[i];
      const geo = m.geometry;
      if (!geo) continue;
      if (!geo.boundingBox) geo.computeBoundingBox();

      box.copy(geo.boundingBox).applyMatrix4(m.matrixWorld);

      // 8 sommets de la boîte englobante monde
      corners[0].set(box.min.x, box.min.y, box.min.z);
      corners[1].set(box.max.x, box.min.y, box.min.z);
      corners[2].set(box.min.x, box.max.y, box.min.z);
      corners[3].set(box.max.x, box.max.y, box.min.z);
      corners[4].set(box.min.x, box.min.y, box.max.z);
      corners[5].set(box.max.x, box.min.y, box.max.z);
      corners[6].set(box.min.x, box.max.y, box.max.z);
      corners[7].set(box.max.x, box.max.y, box.max.z);

      let screenMinX = Infinity, screenMaxX = -Infinity;
      let screenMinY = Infinity, screenMaxY = -Infinity;
      let anyInFront = false;

      for (let c = 0; c < 8; c++) {
        p.copy(corners[c]).project(this.camera);
        if (p.z >= -1 && p.z <= 1) {
          anyInFront = true;
          const sx = ((p.x + 1) / 2) * rect.width + rect.left;
          const sy = ((-p.y + 1) / 2) * rect.height + rect.top;
          if (sx < screenMinX) screenMinX = sx;
          if (sx > screenMaxX) screenMaxX = sx;
          if (sy < screenMinY) screenMinY = sy;
          if (sy > screenMaxY) screenMaxY = sy;
        }
      }

      if (!anyInFront) continue;

      // Test d'intersection AABB 2D écran
      const overlaps = (screenMinX <= maxX && screenMaxX >= minX && screenMinY <= maxY && screenMaxY >= minY);
      if (overlaps) {
        selected.push(m);
      }
    }

    const isToggle = !!(e.ctrlKey || e.metaKey);
    if (isToggle) {
      const curList = new Set(this.selectedList || []);
      selected.forEach((m) => {
        if (curList.has(m)) curList.delete(m);
        else curList.add(m);
      });
      this.selectAll([...curList]);
    } else {
      this.selectAll(selected);
    }
  }

  /**
   * Filtrage optimisé des maillages par BoundingSphere avant raycast direct.
   * Évite de tester 5 000+ géométries complexes face à face.
   */
  _filterRayCandidates(targets, ray) {
    if (targets.length <= 64) return targets;
    const candidates = [];
    const sphere = this._tempSphere;

    for (let i = 0; i < targets.length; i++) {
      const m = targets[i];
      const geo = m.geometry;
      if (!geo) continue;
      if (!geo.boundingSphere) geo.computeBoundingSphere();

      sphere.copy(geo.boundingSphere);
      sphere.applyMatrix4(m.matrixWorld);

      if (ray.intersectsSphere(sphere)) {
        candidates.push(m);
      }
    }
    return candidates.length > 0 ? candidates : targets;
  }

  _pick(e, multiHits = false) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const allMeshes = this.meshes();
    const targets = [];
    for (let i = 0; i < allMeshes.length; i++) {
      if (allMeshes[i].visible) targets.push(allMeshes[i]);
    }
    if (!targets.length) return null;

    const clientX = e.clientX;
    const clientY = e.clientY;

    // 1. Raycast direct avec pré-filtrage par BoundingSpheres
    this._ptr.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ptr, this.camera);

    const candidates = this._filterRayCandidates(targets, this.raycaster.ray);

    // DoubleSide uniquement sur les candidats éligibles
    const origSides = [];
    for (let i = 0; i < candidates.length; i++) {
      const mat = candidates[i].material;
      if (mat && mat.side !== THREE.DoubleSide) {
        origSides.push({ mat, side: mat.side });
        mat.side = THREE.DoubleSide;
      }
    }

    let hits = this.raycaster.intersectObjects(candidates, false);

    // 2. Détection de proximité si aucun élément n'est touché directement
    if (!hits.length && targets.length <= 8000) {
      const offsets = [
        [0, 3], [0, -3], [3, 0], [-3, 0],
        [3, 3], [-3, -3], [3, -3], [-3, 3]
      ];
      for (const [dx, dy] of offsets) {
        const px = clientX + dx;
        const py = clientY + dy;
        this._ptr.set(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this._ptr, this.camera);
        const proxCandidates = this._filterRayCandidates(targets, this.raycaster.ray);
        hits = this.raycaster.intersectObjects(proxCandidates, false);
        if (hits.length) break;
      }
    }

    // Restauration des faces d'origine
    for (let i = 0; i < origSides.length; i++) {
      origSides[i].mat.side = origSides[i].side;
    }

    if (multiHits) return hits;
    return hits.length ? hits[0] : null;
  }

  _onPointerUp(e) {
    const d = this._down; this._down = null;
    if (!d || e.button !== 0) return;
    // Tolérance de déplacement portée de 4px à 10px pour ne pas annuler le clic sur micro-mouvement
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;

    const isMulti = !!(e.shiftKey || e.ctrlKey || e.metaKey);
    const allHits = this._pick(e, true);

    if (!allHits || !allHits.length) {
      if (!isMulti) this.select(null);
      return;
    }

    // Cyclage d'éléments superposés : des clics successifs au même endroit sélectionnent les pièces en profondeur
    let targetMesh = allHits[0].object;
    if (allHits.length > 1) {
      const now = performance.now();
      const last = this._lastClickHit;
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 8 && (now - last.t) < 1500) {
        const curIdx = allHits.findIndex((h) => h.object === this.selected);
        const nextIdx = (curIdx + 1) % allHits.length;
        targetMesh = allHits[nextIdx].object;
      }
      this._lastClickHit = { x: e.clientX, y: e.clientY, t: now };
    }

    this.select(targetMesh, { multi: isMulti, toggle: isMulti });
  }

  _updateHoverHighlight(mesh) {
    if (this._hoveredMesh === mesh) return;
    const prev = this._hoveredMesh;
    this._hoveredMesh = mesh;

    // Si les arêtes sont désactivées globalement, afficher les arêtes uniquement sur le mesh survolé
    if (!this.edgesOn) {
      if (prev && prev !== this.selected && (!this.selectedList || !this.selectedList.includes(prev))) {
        if (prev.userData.edges) prev.userData.edges.visible = false;
      }
      if (mesh) {
        const e = this._ensureMeshEdges(mesh);
        if (e) {
          e.material = this._highlightLineMat;
          e.visible = mesh.visible;
        }
      }
    } else {
      if (prev && prev.userData.edges) {
        prev.userData.edges.material = this._sharedLineMat;
      }
      if (mesh && mesh.userData.edges) {
        mesh.userData.edges.material = this._highlightLineMat;
      }
    }
    this.invalidate();
  }

  _onPointerMove(e) {
    if (e.buttons) return;
    const now = performance.now();
    if (now - (this._lastHover || 0) < 40) return;
    this._lastHover = now;
    const hit = this._pick(e);
    const hitMesh = hit ? hit.object : null;
    this.renderer.domElement.style.cursor = hitMesh ? 'pointer' : 'default';
    this._updateHoverHighlight(hitMesh);
    this.hooks.onHover && this.hooks.onHover(hitMesh, hit);
  }

  /* ---------------- Caméra ---------------- */
  bounds() {
    this.modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of this.meshes()) if (m.visible) box.expandByObject(m, true);
    return box;
  }

  fit(dir) {
    const box = this.bounds();
    if (box.isEmpty()) {
      this.controls.target.set(0, 1, 0);
      this.camera.position.set(9, 6.5, 10);
      this.controls.update(); this.invalidate();
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const d = (dir ? dir.clone() : this.camera.position.clone().sub(this.controls.target)).normalize();
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.95;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.near = Math.max(dist / 500, 0.01);
    this.camera.far = dist * 40;
    this.camera.updateProjectionMatrix();
    const s = Math.max(r * 1.6, 8);
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.far = s * 6; sc.updateProjectionMatrix();
    this.sun.position.set(center.x + s * 0.6, center.y + s * 1.1, center.z + s * 0.5);
    this.sun.target.position.copy(center); this.sun.target.updateMatrixWorld();
    this.scene.add(this.sun.target);
    this.controls.update();
    this.invalidate();
  }

  setView(name) {
    const v = {
      iso: [1, 0.78, 1.15], face: [0, 0.12, 1], arriere: [0, 0.12, -1],
      droite: [1, 0.12, 0], gauche: [-1, 0.12, 0], dessus: [0.0001, 1, 0.0001]
    }[name] || [1, 0.8, 1];
    this.fit(new THREE.Vector3(...v));
  }

  snapshot() {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  /* ---------------- Import ---------------- */
  async loadFiles(fileList) {
    const files = [...fileList];
    const models = files.filter((f) => MODEL_EXT.includes(ext(f.name)));
    if (!models.length) throw new Error('Aucun fichier 3D reconnu (GLB, GLTF, OBJ, FBX, STL, IFC).');
    const urls = new Map();
    files.forEach((f) => urls.set(f.name.toLowerCase(), URL.createObjectURL(f)));
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((u) => (typeof u === 'string' && u.startsWith('blob:')) ? u : (urls.get(base(u).toLowerCase()) || u));

    const group = new THREE.Group();
    group.name = models.length === 1 ? models[0].name : 'Import';
    try {
      for (const f of models) {
        const e = ext(f.name);
        let obj;
        if (e === 'glb' || e === 'gltf') obj = await this._loadGLTF(f, manager, urls);
        else if (e === 'obj') obj = await this._loadOBJ(f, files, manager);
        else if (e === 'fbx') obj = new FBXLoader(manager).parse(await f.arrayBuffer(), '');
        else if (e === 'stl') obj = this._loadSTL(await f.arrayBuffer(), f.name);
        else if (e === 'ifc') obj = await this._loadIFC(await f.arrayBuffer(), f.name);
        if (obj) { obj.name = obj.name || f.name; group.add(obj); }
      }
    } finally {
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 2000);
    }
    let count = 0;
    group.traverse((o) => { if (o.isMesh) count++; });
    if (!count) throw new Error('Le fichier ne contient aucun maillage exploitable.');
    return { group, count };
  }

  addImported(group) {
    this.clearModel();
    return this._adopt(group, { autoUnit: true });
  }

  _loadGLTF(file, manager, urls) {
    return new Promise((resolve, reject) => {
      file.arrayBuffer().then((buf) => {
        new GLTFLoader(manager).parse(buf, '', (g) => resolve(g.scene), (err) => {
          const url = urls.get(file.name.toLowerCase());
          if (url) {
            new GLTFLoader(manager).load(url, (g) => resolve(g.scene), undefined, reject);
          } else {
            reject(err);
          }
        });
      }).catch((err) => {
        const url = urls.get(file.name.toLowerCase());
        if (url) {
          new GLTFLoader(manager).load(url, (g) => resolve(g.scene), undefined, reject);
        } else {
          reject(err);
        }
      });
    });
  }

  async _loadOBJ(file, files, manager) {
    const loader = new OBJLoader(manager);
    const mtl = files.find((f) => ext(f.name) === 'mtl');
    if (mtl) {
      const mats = new MTLLoader(manager).parse(await mtl.text(), '');
      mats.preload();
      loader.setMaterials(mats);
    }
    const obj = loader.parse(await file.text());
    obj.traverse((o) => {
      if (o.isMesh && (!o.material || o.material.type === 'MeshPhongMaterial' && !mtl)) {
        o.material = new THREE.MeshStandardMaterial({ color: 0xb9bcc5, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide });
      }
    });
    return obj;
  }

  _loadSTL(buffer, name) {
    const geo = new STLLoader().parse(buffer);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb9bcc5, roughness: 0.65, metalness: 0.08, side: THREE.DoubleSide }));
    mesh.name = name.replace(/\.stl$/i, '');
    // STL est le plus souvent Z-up (CAO)
    const g = new THREE.Group(); g.add(mesh); g.rotation.x = -Math.PI / 2;
    return g;
  }

  /** IFC géométrique via web-ifc (WASM), chargé à la demande. */
  async _loadIFC(buffer, name) {
    const WebIFC = await import('../node_modules/web-ifc/web-ifc-api.js');
    const api = new WebIFC.IfcAPI();
    api.SetWasmPath(new URL('../node_modules/web-ifc/', import.meta.url).href, true);
    await api.Init();
    const modelID = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true });
    const root = new THREE.Group();
    const byProduct = new Map();
    api.StreamAllMeshes(modelID, (fm) => {
      const id = fm.expressID;
      const placed = fm.geometries;
      for (let i = 0; i < placed.size(); i++) {
        const pg = placed.get(i);
        const g = api.GetGeometry(modelID, pg.geometryExpressID);
        const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const index = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(verts.length / 2), nor = new Float32Array(verts.length / 2);
        for (let k = 0, j = 0; k < verts.length; k += 6, j += 3) {
          pos[j] = verts[k]; pos[j + 1] = verts[k + 1]; pos[j + 2] = verts[k + 2];
          nor[j] = verts[k + 3]; nor[j + 1] = verts[k + 4]; nor[j + 2] = verts[k + 5];
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
        const c = pg.color;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setRGB(c.x, c.y, c.z, THREE.SRGBColorSpace),
          roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide,
          transparent: c.w < 0.99, opacity: c.w, depthWrite: c.w >= 0.99
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
        let label = `IFC #${id}`;
        try {
          const line = api.GetLine(modelID, id);
          const typeName = api.GetNameFromTypeCode ? api.GetNameFromTypeCode(line.type) : '';
          label = `${(line.Name && line.Name.value) || typeName || 'IFC'} #${id}`;
        } catch (_) { /* nom indisponible */ }
        mesh.name = byProduct.has(id) ? `${label}.${byProduct.get(id)}` : label;
        byProduct.set(id, (byProduct.get(id) || 0) + 1);
        root.add(mesh);
        g.delete();
      }
    });
    api.CloseModel(modelID);
    root.rotation.x = -Math.PI / 2;      // IFC : Z vers le haut
    root.name = name;
    return root;
  }

  /* ---------------- Maquette test procédurale ---------------- */
  generateTestModel() {
    this.clearModel();
    const root = new THREE.Group();
    root.name = 'Maquette test — Pavillon';

    // Groupes / Calques fonctionnels
    const grpFloor = new THREE.Group(); grpFloor.name = 'Planchers & Fondations';
    const grpWalls = new THREE.Group(); grpWalls.name = 'Murs & Parois';
    const grpOpenings = new THREE.Group(); grpOpenings.name = 'Menuiseries & Vitrages';
    const grpRoof = new THREE.Group(); grpRoof.name = 'Toiture';
    const grpStructure = new THREE.Group(); grpStructure.name = 'Poutres & Poteaux';

    root.add(grpFloor);
    root.add(grpWalls);
    root.add(grpOpenings);
    root.add(grpRoof);
    root.add(grpStructure);

    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...o });
    const concrete = mat(0xb4b7be), concreteDark = mat(0x8e929b), roofMat = mat(0x6c7079, { roughness: 0.6 });
    const timber = mat(0xb98a55, { roughness: 0.55 }), timber2 = mat(0xa07242, { roughness: 0.55 });
    const steelMat = mat(0x5a6375, { roughness: 0.42, metalness: 0.8 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x9fd0ff, roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.32,
      envMapIntensity: 1.6, side: THREE.DoubleSide
    });

    // Compositions de paroi et paramètres RDM par défaut (portés par userData.preset)
    const WALL = [{ mat: 'beton', e: 20 }, { mat: 'laine_bois', e: 14 }, { mat: 'enduit', e: 2 }];
    const ROOF = [{ mat: 'beton', e: 16 }, { mat: 'laine_roche', e: 22 }, { mat: 'enduit', e: 2 }];
    const FLOOR = [{ mat: 'beton', e: 20 }, { mat: 'pse', e: 12 }, { mat: 'enduit', e: 2 }];
    const GLASS = [{ mat: 'vitrage_d', e: 2.4 }];

    const add = (parentGrp, name, sx, sy, sz, px, py, pz, material, preset) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.name = name;
      mesh.position.set(px, py, pz);
      mesh.userData.preset = preset;
      mesh.userData.layer = parentGrp.name;
      parentGrp.add(mesh);
      return mesh;
    };

    const t = 0.36, H = 2.8, X = 6.0, Z = 4.5;         // épaisseur mur, hauteur, volume intérieur
    const xo = X + 2 * t, zo = Z + 2 * t;
    const wall = (name, ...a) => add(grpWalls, name, ...a, { role: 'mur', layers: WALL });

    // 1. Planchers
    add(grpFloor, 'Dalle de sol', xo, 0.34, zo, 0, -0.17, 0, concreteDark, {
      role: 'plancher', layers: FLOOR, b: 0.6,
      rdm: { structType: 'slab', matId: 'beton', scheme: 'two_way', qSurf: 2.0, gFin: 1.5, nature: 'Q', crit: 500 }
    });
    add(grpFloor, 'Plancher dalle intermédiaire (CLT 160mm)', 3.2, 0.16, 2.6, -0.8, 1.4, 0, timber, {
      role: 'plancher', layers: FLOOR, b: 1.0,
      rdm: { structType: 'slab', matId: 'clt', scheme: 'one_way', qSurf: 2.5, gFin: 1.2, nature: 'Q', crit: 350 }
    });

    // 2. Murs d'enveloppe et parois intérieures
    wall('Mur Nord', xo, H, t, 0, H / 2, -(Z / 2 + t / 2), concrete);
    wall('Mur Est', t, H, Z, X / 2 + t / 2, H / 2, 0, concrete);
    wall('Mur Ouest', t, H, Z, -(X / 2 + t / 2), H / 2, 0, concrete);

    // Mur Sud percé d'une baie vitrée
    const zs = Z / 2 + t / 2, ox0 = -1.5, ox1 = 2.1, oh = 2.2;
    wall('Mur Sud — trumeau gauche', ox0 + xo / 2, H, t, (-xo / 2 + ox0) / 2, H / 2, zs, concrete);
    wall('Mur Sud — trumeau droit', xo / 2 - ox1, H, t, (xo / 2 + ox1) / 2, H / 2, zs, concrete);
    add(grpWalls, 'Linteau de la baie', ox1 - ox0, H - oh, t, (ox0 + ox1) / 2, oh + (H - oh) / 2, zs, concrete, {
      role: 'mur', layers: WALL,
      rdm: { structType: 'beam', matId: 'beton', scheme: 'ss', qMode: 'direct', qDirect: 12, strip: 1.5, surf: 0, F: 0, nature: 'Q' }
    });

    // Mur porteur intérieur (refend lourd)
    add(grpWalls, 'Mur porteur de refend (Béton C25/30)', 0.20, H, 2.2, 0.2, H / 2, -0.6, concrete, {
      role: 'mur', layers: WALL,
      rdm: { structType: 'bearingwall', matId: 'beton', scheme: 'two_pinned', nLin: 150, nature: 'Q' }
    });

    // Cloison de distribution intérieure (légère)
    add(grpWalls, 'Cloison de distribution (Ossature bois)', 0.08, H, 2.0, 0.2, H / 2, 1.1, timber2, {
      role: 'mur', layers: WALL,
      rdm: { structType: 'partition', matId: 'c24', scheme: 'top_bottom', qh: 0.40, defLimit: 200 }
    });

    // 3. Menuiseries & Vitrages
    add(grpOpenings, 'Baie vitrée', ox1 - ox0, oh, 0.06, (ox0 + ox1) / 2, oh / 2, zs, glass, { role: 'vitrage', layers: GLASS });

    // 4. Toiture
    add(grpRoof, 'Toiture terrasse', xo, 0.4, zo, 0, H + 0.2, 0, roofMat, { role: 'toit', layers: ROOF });

    // 5. Structure : Poutres, Poteaux verticaux et Corbeaux
    add(grpStructure, 'Poutre porteuse 1 (GL24h)', 0.14, 0.36, Z, -1.5, H - 0.18, 0, timber, {
      role: 'none', layers: [],
      rdm: { structType: 'beam', matId: 'gl24h', scheme: 'ss', qMode: 'strip', qDirect: 5, strip: 1.5, surf: 350, F: 0, nature: 'Q' }
    });
    add(grpStructure, 'Poutre porteuse 2 (C24)', 0.12, 0.28, Z, 1.5, H - 0.14, 0, timber2, {
      role: 'none', layers: [],
      rdm: { structType: 'beam', matId: 'c24', scheme: 'ss', qMode: 'strip', qDirect: 5, strip: 1.5, surf: 400, F: 0, nature: 'Q' }
    });

    // Poteaux verticaux sous les poutres (poutres verticales soumises à la compression axiale)
    add(grpStructure, 'Poteau vertical 1 (Béton C25/30)', 0.22, H, 0.22, -1.5, H / 2, -1.2, concrete, {
      role: 'none', layers: [],
      rdm: { structType: 'column', matId: 'beton', scheme: 'pin_pin', N: 160, e0: 0.02, M: 0, nature: 'Q' }
    });
    add(grpStructure, 'Poteau vertical 2 (Acier S235)', 0.16, H, 0.16, 1.5, H / 2, 1.2, steelMat, {
      role: 'none', layers: [],
      rdm: { structType: 'column', matId: 's235', scheme: 'fix_pin', N: 240, e0: 0.02, M: 0, nature: 'Q' }
    });

    // Corbeau en béton armé (Console courte supportant la retombée de poutre)
    add(grpStructure, 'Corbeau en béton armé (Console courte)', 0.22, 0.32, 0.30, -1.5, H - 0.36 - 0.16, -0.94, concrete, {
      role: 'none', layers: [],
      rdm: { structType: 'corbel', matId: 'beton', scheme: 'corbel_tie', F: 75, ac: 0.22, nature: 'Q' }
    });

    root.userData.room = { V: X * Z * H, S: X * Z, note: 'Volume intérieur de la maquette test (6,00 × 4,50 × 2,80 m)' };
    this.unit = 1;
    this._adopt(root, { autoUnit: false, recenter: false });
    this.setView('iso');
    return root;
  }
}
