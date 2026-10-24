const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest, excludeDirs = []) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      if (excludeDirs.includes(file)) return;
      copyRecursive(path.join(src, file), path.join(dest, file), excludeDirs);
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('[Setup] Starting workspace extraction & unification...');

// =============================================================================
// WORKSPACE 01: Material Library
// =============================================================================
console.log('[Setup] 01. Material Library...');
const ws1Dir = path.join(__dirname, '..', 'workspaces', 'material-library');
if (!fs.existsSync(ws1Dir)) fs.mkdirSync(ws1Dir, { recursive: true });

// Copy icons and public files from PBR visualizer/public EXCEPT materials
copyRecursive(path.join(__dirname, '..', 'PBR visualizer', 'public'), ws1Dir, ['materials', 'node_modules']);

// Read and patch index.html for GPU lifecycle & Hub events
let ws1Html = fs.readFileSync(path.join(ws1Dir, 'index.html'), 'utf8');

const ws1GpuPatch = `
        // -------------------------------------------------------------
        // GPU LIFECYCLE & ARCHFORGE STUDIO HUB INTEGRATION
        // -------------------------------------------------------------
        let isWorkspaceActive = true;
        let animFrameId = null;

        function animate() {
            if (!isWorkspaceActive) {
                animFrameId = null;
                return;
            }
            animFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('message', (event) => {
            if (!event.data || typeof event.data !== 'object') return;
            const { type } = event.data;

            if (type === 'ARCHFORGE_SET_ACTIVE') {
                isWorkspaceActive = !!event.data.active;
                if (isWorkspaceActive) {
                    if (!animFrameId) animate();
                } else {
                    if (animFrameId) {
                        cancelAnimationFrame(animFrameId);
                        animFrameId = null;
                    }
                }
            }

            if (type === 'ARCHFORGE_REFRESH_CATALOG') {
                console.log('[Material Library] Refreshing catalog from Hub event...', event.data);
                fetchCatalog().then(() => {
                    if (event.data.category && event.data.materialName) {
                        const cat = globalCatalog[event.data.category];
                        if (cat) {
                            const mat = cat.find(m => m.name === event.data.materialName);
                            if (mat) applyMaterialToScene(mat);
                        }
                    }
                });
            }
        });

        // Notify parent Hub that frame is mounted
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'ARCHFORGE_FRAME_READY' }, '*');
        }
`;

if (ws1Html.includes('function animate()')) {
  ws1Html = ws1Html.replace(/function animate\(\)\s*\{[\s\S]*?\}\s*animate\(\);/, ws1GpuPatch);
  fs.writeFileSync(path.join(ws1Dir, 'index.html'), ws1Html, 'utf8');
}

// =============================================================================
// WORKSPACE 02: 3D Inspector
// =============================================================================
console.log('[Setup] 02. 3D Inspector...');
const ws2Dir = path.join(__dirname, '..', 'workspaces', 'inspector');
if (!fs.existsSync(ws2Dir)) fs.mkdirSync(ws2Dir, { recursive: true });

copyRecursive(path.join(__dirname, '..', '3D viewer app'), ws2Dir, ['node_modules']);

// Patch inspector index.html to add quick action bridge buttons in toolbar
let ws2Html = fs.readFileSync(path.join(ws2Dir, 'index.html'), 'utf8');

const ws2ToolbarButtons = `
      <span class="sep"></span>

      <!-- Inter-module transfer buttons -->
      <button id="btn-send-slicer" class="tool tool-bridge" title="Transférer directement ce modèle 3D vers le découpeur de maquette physique">
        <svg class="i" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        <span class="label">Vers Maquette Slicer</span>
      </button>

      <button id="btn-send-physics" class="tool tool-bridge" title="Transférer directement ce modèle 3D vers ArchPhysics pour calcul thermique et RDM">
        <svg class="i" viewBox="0 0 24 24"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
        <span class="label">Vers ArchPhysics</span>
      </button>

      <span class="sep"></span>
`;

if (!ws2Html.includes('btn-send-slicer')) {
  ws2Html = ws2Html.replace('<button id="btn-capture"', ws2ToolbarButtons + '\n      <button id="btn-capture"');
  fs.writeFileSync(path.join(ws2Dir, 'index.html'), ws2Html, 'utf8');
}

// Patch styles.css in inspector for bridge buttons styling
let ws2Css = fs.readFileSync(path.join(ws2Dir, 'styles.css'), 'utf8');
const ws2CssPatch = `
.tool-bridge {
  background: rgba(6, 182, 212, 0.12) !important;
  color: #38bdf8 !important;
  border: 1px solid rgba(6, 182, 212, 0.3) !important;
}
.tool-bridge:hover {
  background: rgba(6, 182, 212, 0.25) !important;
  color: #ffffff !important;
  border-color: #06b6d4 !important;
}
`;
if (!ws2Css.includes('.tool-bridge')) {
  ws2Css += '\n' + ws2CssPatch;
  fs.writeFileSync(path.join(ws2Dir, 'styles.css'), ws2Css, 'utf8');
}

// Patch app.js in inspector for GPU lifecycle & inter-module sending
let ws2Js = fs.readFileSync(path.join(ws2Dir, 'app.js'), 'utf8');

// Replace tick(now) with GPU-aware tick
const ws2TickOld = `function tick(now) {
  requestAnimationFrame(tick);`;
const ws2TickNew = `let isStudioActive = true;
let animId = null;

function tick(now) {
  if (!isStudioActive) {
    animId = null;
    return;
  }
  animId = requestAnimationFrame(tick);`;

if (ws2Js.includes(ws2TickOld)) {
  ws2Js = ws2Js.replace(ws2TickOld, ws2TickNew);
}

// Add state.lastRawFile tracking in installModel
if (!ws2Js.includes('state.lastRawFile = file;')) {
  ws2Js = ws2Js.replace('state.fileName = file.name;', 'state.fileName = file.name;\n  state.lastRawFile = file;');
}

// Add Bridge event listeners at bottom of app.js
const ws2BridgeJs = `
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

// Bridge action: Send to Maquette Slicer
$('btn-send-slicer')?.addEventListener('click', async () => {
  if (!state.root) {
    toast('Veuillez ouvrir ou déposer un modèle 3D avant de le transférer.', { type: 'warn' });
    return;
  }

  try {
    toast('Préparation du transfert vers Maquette Slicer...');
    let buffer = null;
    let filename = state.fileName || 'model.glb';

    if (state.lastRawFile && state.lastRawFile.data) {
      buffer = state.lastRawFile.data.buffer || state.lastRawFile.data;
    } else if (state.lastRawFile instanceof Blob) {
      buffer = await state.lastRawFile.arrayBuffer();
    } else {
      // Export current scene mesh via GLTFExporter
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();
      buffer = await new Promise((res, rej) => {
        exporter.parse(state.root, (gltf) => res(gltf), rej, { binary: true });
      });
      filename = baseName(filename) + '.glb';
    }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'ARCHFORGE_TRANSFER_MODEL',
        target: 'slicer',
        name: filename,
        buffer: buffer,
        ext: extOf(filename)
      }, '*');
    }
  } catch (err) {
    console.error('[Bridge Slicer Error]:', err);
    toast('Échec du transfert vers Maquette Slicer : ' + err.message, { type: 'error' });
  }
});

// Bridge action: Send to ArchPhysics
$('btn-send-physics')?.addEventListener('click', async () => {
  if (!state.root) {
    toast('Veuillez ouvrir ou déposer un modèle 3D avant de le transférer.', { type: 'warn' });
    return;
  }

  try {
    toast('Préparation du transfert vers ArchPhysics...');
    let buffer = null;
    let filename = state.fileName || 'model.glb';

    if (state.lastRawFile && state.lastRawFile.data) {
      buffer = state.lastRawFile.data.buffer || state.lastRawFile.data;
    } else if (state.lastRawFile instanceof Blob) {
      buffer = await state.lastRawFile.arrayBuffer();
    } else {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();
      buffer = await new Promise((res, rej) => {
        exporter.parse(state.root, (gltf) => res(gltf), rej, { binary: true });
      });
      filename = baseName(filename) + '.glb';
    }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'ARCHFORGE_TRANSFER_MODEL',
        target: 'archphysics',
        name: filename,
        buffer: buffer,
        ext: extOf(filename)
      }, '*');
    }
  } catch (err) {
    console.error('[Bridge ArchPhysics Error]:', err);
    toast('Échec du transfert vers ArchPhysics : ' + err.message, { type: 'error' });
  }
});
`;

if (!ws2Js.includes('btn-send-slicer')) {
  ws2Js += '\n' + ws2BridgeJs;
  fs.writeFileSync(path.join(ws2Dir, 'app.js'), ws2Js, 'utf8');
}

// =============================================================================
// WORKSPACE 03: PBR Alchemist
// =============================================================================
console.log('[Setup] 03. PBR Alchemist...');
const ws3Dir = path.join(__dirname, '..', 'workspaces', 'alchemist');
if (!fs.existsSync(ws3Dir)) fs.mkdirSync(ws3Dir, { recursive: true });

copyRecursive(path.join(__dirname, '..', 'PBR Alchemist'), ws3Dir, ['node_modules', 'exported_materials']);

// Add "Envoyer vers la Bibliothèque" button to Alchemist index.html
let ws3Html = fs.readFileSync(path.join(ws3Dir, 'index.html'), 'utf8');

// Also update importmap to use vendor three
ws3Html = ws3Html.replace('"three": "./node_modules/three/build/three.module.js"', '"three": "/vendor/three/build/three.module.js"');
ws3Html = ws3Html.replace('"three/addons/": "./node_modules/three/examples/jsm/"', '"three/addons/": "/vendor/three/examples/jsm/"');
ws3Html = ws3Html.replace('"./node_modules/jszip/dist/jszip.min.js"', '"/vendor/jszip/dist/jszip.min.js"');

const ws3SendBtn = `
        <!-- Direct bridge to 01. Material Library -->
        <button id="btnSendToLibrary" class="btn-send-library" style="background: linear-gradient(135deg, #0284c7, #06b6d4); color: white; border: none; padding: 11px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 6px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.35);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12 17"/></svg>
          Envoyer vers la Bibliothèque
        </button>
`;

if (!ws3Html.includes('btnSendToLibrary')) {
  ws3Html = ws3Html.replace('<button id="btnExportPack"', ws3SendBtn + '\n        <button id="btnExportPack"');
  fs.writeFileSync(path.join(ws3Dir, 'index.html'), ws3Html, 'utf8');
}

// In viewport3d.js: patch animate loop for GPU lifecycle
let ws3Vp = fs.readFileSync(path.join(ws3Dir, 'js', 'engine', 'viewport3d.js'), 'utf8');
if (!ws3Vp.includes('this.isStudioActive')) {
  ws3Vp = ws3Vp.replace('this.animate = this.animate.bind(this);', 'this.isStudioActive = true;\n    this.animId = null;\n    this.animate = this.animate.bind(this);');
  ws3Vp = ws3Vp.replace('animate() {\n    requestAnimationFrame(this.animate);', 'animate() {\n    if (!this.isStudioActive) { this.animId = null; return; }\n    this.animId = requestAnimationFrame(this.animate);');
  fs.writeFileSync(path.join(ws3Dir, 'js', 'engine', 'viewport3d.js'), ws3Vp, 'utf8');
}

// In Alchemist app.js: bind btnSendToLibrary and Hub message listeners
let ws3AppJs = fs.readFileSync(path.join(ws3Dir, 'js', 'app.js'), 'utf8');
const ws3AppPatch = `
// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & BRIDGE TO MATERIAL LIBRARY
// -----------------------------------------------------------------------------

window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    if (window.pbrViewport) {
      window.pbrViewport.isStudioActive = !!e.data.active;
      if (window.pbrViewport.isStudioActive && !window.pbrViewport.animId) {
        window.pbrViewport.animate();
      }
    }
  }
});

// Notify parent Hub that frame is mounted
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'ARCHFORGE_FRAME_READY' }, '*');
}

document.getElementById('btnSendToLibrary')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnSendToLibrary');
  const catInput = document.getElementById('exportCategory');
  const nameInput = document.getElementById('exportMaterialName');

  const category = (catInput ? catInput.value : 'Concrete').trim() || 'Concrete';
  const materialName = (nameInput ? nameInput.value : 'pbr_material').trim() || 'pbr_material';

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Enregistrement dans la Bibliothèque...';

  try {
    // Generate/collect all 5 maps from inspector canvases or generator
    const maps = {};
    const canvasBC = document.getElementById('canvasBaseColor') || document.getElementById('inspectorCanvas');
    const canvasNormal = document.getElementById('canvasNormal');
    const canvasRough = document.getElementById('canvasRoughness');
    const canvasHeight = document.getElementById('canvasHeight');
    const canvasAO = document.getElementById('canvasAO');

    if (canvasBC) maps.baseColor = canvasBC.toDataURL('image/png');
    if (canvasNormal) maps.normal = canvasNormal.toDataURL('image/png');
    if (canvasRough) maps.roughness = canvasRough.toDataURL('image/png');
    if (canvasHeight) maps.height = canvasHeight.toDataURL('image/png');
    if (canvasAO) maps.ambientOcclusion = canvasAO.toDataURL('image/png');

    const res = await fetch('/api/save-alchemist-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, materialName, maps })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur enregistrement');

    // Notify Hub
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'ARCHFORGE_ALCHEMIST_SAVED',
        category: data.category,
        materialName: data.materialName
      }, '*');
    }

    if (typeof showToast === 'function') {
      showToast('Matériau enregistré dans la Bibliothèque avec succès !', 'success');
    } else {
      alert('Matériau transféré vers la Bibliothèque avec succès !');
    }
  } catch (err) {
    console.error('[Send to Library Error]:', err);
    if (typeof showToast === 'function') {
      showToast('Erreur : ' + err.message, 'error');
    } else {
      alert('Erreur : ' + err.message);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
`;

if (!ws3AppJs.includes('btnSendToLibrary')) {
  ws3AppJs += '\n' + ws3AppPatch;
  fs.writeFileSync(path.join(ws3Dir, 'js', 'app.js'), ws3AppJs, 'utf8');
}

// =============================================================================
// WORKSPACE 04: Maquette Slicer
// =============================================================================
console.log('[Setup] 04. Maquette Slicer...');
const ws4Dir = path.join(__dirname, '..', 'workspaces', 'slicer');
if (!fs.existsSync(ws4Dir)) fs.mkdirSync(ws4Dir, { recursive: true });

copyRecursive(path.join(__dirname, '..', 'Maquette Slicer Studio'), ws4Dir, ['node_modules']);

// Patch importmap in slicer index.html
let ws4Html = fs.readFileSync(path.join(ws4Dir, 'index.html'), 'utf8');
ws4Html = ws4Html.replace('"three": "./node_modules/three/build/three.module.js"', '"three": "/vendor/three/build/three.module.js"');
ws4Html = ws4Html.replace('"three/addons/": "./node_modules/three/examples/jsm/"', '"three/addons/": "/vendor/three/examples/jsm/"');
fs.writeFileSync(path.join(ws4Dir, 'index.html'), ws4Html, 'utf8');

// Patch slicer viewport for GPU lifecycle
let ws4Vp = fs.readFileSync(path.join(ws4Dir, 'src', 'js', 'view3d', 'viewport.js'), 'utf8');
if (!ws4Vp.includes('this.isStudioActive')) {
  ws4Vp = ws4Vp.replace('constructor(container) {', 'constructor(container) {\n    this.isStudioActive = true;\n    this.animId = null;');
  ws4Vp = ws4Vp.replace('animate() {\n    requestAnimationFrame(() => this.animate());', 'animate() {\n    if (!this.isStudioActive) { this.animId = null; return; }\n    this.animId = requestAnimationFrame(() => this.animate());');
  fs.writeFileSync(path.join(ws4Dir, 'src', 'js', 'view3d', 'viewport.js'), ws4Vp, 'utf8');
}

// Patch slicer app.js for Hub incoming model & GPU events
let ws4AppJs = fs.readFileSync(path.join(ws4Dir, 'src', 'js', 'app.js'), 'utf8');
const ws4AppPatch = `
// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & INCOMING 3D MODEL HANDLER
// -----------------------------------------------------------------------------

window.addEventListener('message', async (e) => {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    if (window.__slicerApp && window.__slicerApp.viewport) {
      window.__slicerApp.viewport.isStudioActive = !!e.data.active;
      if (window.__slicerApp.viewport.isStudioActive && !window.__slicerApp.viewport.animId) {
        window.__slicerApp.viewport.animate();
      }
    }
  }

  if (e.data.type === 'ARCHFORGE_LOAD_MODEL') {
    console.log('[Maquette Slicer] Received 3D model from Hub:', e.data.name);
    try {
      const { buffer, name } = e.data;
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const file = new File([blob], name || 'imported_model.glb');
      if (window.__slicerApp) {
        window.__slicerApp.loadUserFile(file);
      }
    } catch (err) {
      console.error('[Maquette Slicer Load Error]:', err);
    }
  }
});

// Notify parent Hub that frame is mounted
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'ARCHFORGE_FRAME_READY' }, '*');
}
`;

if (!ws4AppJs.includes('ARCHFORGE_LOAD_MODEL')) {
  // Expose app instance
  ws4AppJs = ws4AppJs.replace('new MaquetteApp();', 'window.__slicerApp = new MaquetteApp();');
  ws4AppJs += '\n' + ws4AppPatch;
  fs.writeFileSync(path.join(ws4Dir, 'src', 'js', 'app.js'), ws4AppJs, 'utf8');
}

// =============================================================================
// WORKSPACE 05: ArchPhysics
// =============================================================================
console.log('[Setup] 05. ArchPhysics...');
const ws5Dir = path.join(__dirname, '..', 'workspaces', 'archphysics');
if (!fs.existsSync(ws5Dir)) fs.mkdirSync(ws5Dir, { recursive: true });

copyRecursive(path.join(__dirname, '..', 'ArchPhysics Studio'), ws5Dir, ['node_modules']);

// Patch importmap in archphysics index.html
let ws5Html = fs.readFileSync(path.join(ws5Dir, 'index.html'), 'utf8');
ws5Html = ws5Html.replace('"three": "./node_modules/three/build/three.module.js"', '"three": "/vendor/three/build/three.module.js"');
ws5Html = ws5Html.replace('"three/addons/": "./node_modules/three/examples/jsm/"', '"three/addons/": "/vendor/three/examples/jsm/"');
fs.writeFileSync(path.join(ws5Dir, 'index.html'), ws5Html, 'utf8');

// Patch archphysics viewer for GPU lifecycle
let ws5Vp = fs.readFileSync(path.join(ws5Dir, 'js', 'viewer.js'), 'utf8');
if (!ws5Vp.includes('this.isStudioActive')) {
  ws5Vp = ws5Vp.replace('this._dirty = true;', 'this._dirty = true;\n    this.isStudioActive = true;\n    this.animId = null;');
  ws5Vp = ws5Vp.replace('const loop = () => {', 'const loop = () => {\n      if (!this.isStudioActive) { this.animId = null; return; }');
  ws5Vp = ws5Vp.replace('requestAnimationFrame(loop);', 'this.animId = requestAnimationFrame(loop);');
  fs.writeFileSync(path.join(ws5Dir, 'js', 'viewer.js'), ws5Vp, 'utf8');
}

// Patch archphysics app.js for Hub incoming 3D model & GPU events
let ws5AppJs = fs.readFileSync(path.join(ws5Dir, 'js', 'app.js'), 'utf8');
const ws5AppPatch = `
// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & INCOMING 3D MODEL HANDLER
// -----------------------------------------------------------------------------

window.addEventListener('message', async (e) => {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.type === 'ARCHFORGE_REINIT_LISTENERS') {
    if (window.initModuleListeners) window.initModuleListeners();
    if (typeof viewer !== 'undefined' && viewer) {
      viewer.resize();
      viewer.invalidate();
      if (viewer.isStudioActive && !viewer.animId) viewer.start();
    }
  }

  if (e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    if (e.data.active && window.initModuleListeners) {
      window.initModuleListeners();
    }
    if (typeof viewer !== 'undefined' && viewer) {
      if (e.data.active) {
        viewer.start();
        setTimeout(() => {
          viewer.resize();
          viewer.invalidate();
        }, 50);
      } else {
        viewer.stop();
      }
    }
    if (e.data.active && window.__pendingPhysicsModel && typeof loadFiles === 'function') {
      const file = window.__pendingPhysicsModel;
      window.__pendingPhysicsModel = null;
      loadFiles([file]);
    }
  }

  if (e.data.type === 'ARCHFORGE_LOAD_MODEL') {
    console.log('[ArchPhysics] Received 3D model from Hub:', e.data.name);
    try {
      const { buffer, name } = e.data;
      const fileName = name || 'imported_model.glb';
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const file = new File([blob], fileName);
      if (typeof loadFiles === 'function' && typeof viewer !== 'undefined' && viewer.modelRoot) {
        loadFiles([file]);
      } else {
        window.__pendingPhysicsModel = file;
      }
    } catch (err) {
      console.error('[ArchPhysics Load Error]:', err);
    }
  }
});

// Notify parent Hub that frame is mounted
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'ARCHFORGE_FRAME_READY' }, '*');
}
`;

if (!ws5AppJs.includes('ARCHFORGE_LOAD_MODEL')) {
  ws5AppJs += '\n' + ws5AppPatch;
  fs.writeFileSync(path.join(ws5Dir, 'js', 'app.js'), ws5AppJs, 'utf8');
}

console.log('[Setup] SUCCESS! All 5 workspaces unified and bridges initialized.');
