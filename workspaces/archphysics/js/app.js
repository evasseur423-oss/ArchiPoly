/**
 * ArchPhysics Studio — Application (interface, état, liaison calcul ⇄ 3D)
 */
import * as THREE from 'three';
import { Viewer, meshMetrics } from './viewer.js';
import { MaterialDB, STRUCTURAL_IDS, MATERIAL_CATEGORIES } from './materials.js';
import * as P from './physics.js';
import { drawBeamDiagram } from './charts.js';
import { buildReport } from './report.js';

const $ = (id) => document.getElementById(id);
const db = new MaterialDB();

/* ========================================================================== */
/*  Constantes d'interface                                                     */
/* ========================================================================== */
const ROLE_COLOR = { none: '#4a4d57', mur: '#6b8bd6', toit: '#8a63d2', plancher: '#3aa98f', vitrage: '#46b5e6' };
const CAT_COLOR = {
  'Structure et maçonnerie': '#aeb3c0', 'Isolants': '#f5c86b', 'Vitrages et fluides': '#7fb4ff',
  'Finitions': '#d9c6a5', 'Personnalisés': '#9be0c0'
};
const DEFAULT_COMP = {
  mur:      [{ mat: 'beton', e: 20 }, { mat: 'laine_bois', e: 14 }, { mat: 'enduit', e: 2 }],
  toit:     [{ mat: 'beton', e: 16 }, { mat: 'laine_roche', e: 22 }, { mat: 'enduit', e: 2 }],
  plancher: [{ mat: 'beton', e: 20 }, { mat: 'pse', e: 12 }, { mat: 'enduit', e: 2 }],
  vitrage:  [{ mat: 'vitrage_d', e: 2.4 }]
};
const LOSS_COLORS = { mur: '#6b8bd6', toit: '#8a63d2', plancher: '#3aa98f', vitrage: '#46b5e6', air: '#f59e0b' };

const state = {
  mode: 'thermal',
  heatmap: false,
  roofHidden: false,
  ghost: true,
  climate: { Text: -5, Tint: 20, n: 0.6, DJU: 2500 },
  room: { V: 0, S: 0, manual: false, note: '' },
  modelName: ''
};

/* ========================================================================== */
/*  Utilitaires                                                                */
/* ========================================================================== */
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fInt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '—');
const num = (el) => parseFloat(String(el.value).replace(',', '.'));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function status(msg) { $('status-text').textContent = msg; }

function toast(msg, kind = '', ms = 3800) {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('toast-host').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
}

function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function fillMatSelect(sel, { allowEmpty = false, ids = null } = {}) {
  const prev = sel.value;
  sel.innerHTML = '';
  if (allowEmpty) sel.add(new Option('— aucune couche —', ''));
  const list = db.list().filter((m) => !ids || ids.includes(m.id));
  const cats = [...MATERIAL_CATEGORIES, ...new Set(list.map((m) => m.cat).filter((c) => !MATERIAL_CATEGORIES.includes(c)))];
  if (ids) {
    ids.forEach((id) => { const m = db.get(id); if (m) sel.add(new Option(m.name, m.id)); });
  } else {
    for (const c of cats) {
      const group = list.filter((m) => m.cat === c);
      if (!group.length) continue;
      const og = document.createElement('optgroup'); og.label = c;
      group.forEach((m) => og.appendChild(new Option(m.name, m.id)));
      sel.appendChild(og);
    }
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

/* ========================================================================== */
/*  Données d'élément                                                          */
/* ========================================================================== */
const cloneLayers = (arr) => (arr || []).map((l) => ({ mat: l.mat, e: l.e }));
function normLayers(arr) {
  const out = cloneLayers(arr).slice(0, 3);
  while (out.length < 3) out.push({ mat: '', e: 0 });
  return out;
}

function defaultRdm(mesh) {
  const n = (mesh.name || '').toLowerCase();
  let matId = 's235';
  if (/lamell|gl24|clt/.test(n)) matId = 'gl24h';
  else if (/bois|c24|solive|chevron|timber/.test(n)) matId = 'c24';
  else if (/b[ée]ton|linteau|bfup/.test(n)) matId = 'beton';
  else if (/pl[âa]tre|ba13|placoplatre/.test(n)) matId = 'platre';
  else if (/acier|metal|s235|s355|inox/.test(n)) matId = 's235';
  else if (/ma[çc]onnerie|brique|bloc/.test(n)) matId = 'maconnerie_blocs';

  let structType = 'beam';
  let scheme = 'ss';

  let m = null;
  try { m = metrics(mesh); } catch (_) {}

  if (/corbeau|corbel|bracket|console/.test(n)) {
    structType = 'corbel';
    scheme = 'strut_tie';
    matId = 'beton';
  } else if (/cloison|partition|separation/.test(n)) {
    structType = 'partition';
    scheme = 'top_bot';
    matId = 'c24';
  } else if (/plancher|dalle|slab|floor|hourdis/.test(n) || (m && m.size && m.size.y < 0.45 && m.size.x > 1.2 && m.size.z > 1.2)) {
    structType = 'slab';
    scheme = 'four_sides';
    matId = 'beton';
  } else if (/porteur|bearing|voile|mur/.test(n) || (m && m.size && m.size.y > 1.8 && (m.size.x > 1.5 || m.size.z > 1.5) && Math.min(m.size.x, m.size.z) < 0.45)) {
    structType = 'bearingwall';
    scheme = 'pin_pin';
    matId = 'beton';
  } else if (/poteau|column|pilier|pieu|pillar/.test(n) || (m && m.size && m.size.y > m.size.x * 1.15 && m.size.y > m.size.z * 1.15)) {
    structType = 'column';
    scheme = 'pin_pin';
    matId = 'beton';
  } else {
    structType = 'beam';
    scheme = 'ss';
  }

  return {
    structType,
    matId,
    scheme,
    // Paramètres Poutre
    qMode: 'direct',
    qDirect: 5,
    strip: 1,
    surf: 200,
    F: 0,
    // Paramètres Poteau
    N: 150,     // Charge axiale en kN
    e0: 0.02,   // Excentricité accidentelle en m (2 cm)
    M: 0,       // Moment fléchissant en tête en kN·m
    // Paramètres Plancher
    slabQ: 2.5, // Charge d'exploitation en kN/m²
    slabG: 1.2, // Charges permanentes en kN/m²
    // Paramètres Mur porteur
    wallN: 120, // Charge linéaire en kN/m
    // Paramètres Cloison
    partQh: 0.40,// Poussée horizontale DTU en kN/m²
    // Paramètres Corbeau
    corbF: 120, // Charge verticale en kN
    nature: 'Q',
    manual: {},
    swap: false
  };
}

function arch(mesh) {
  if (!mesh.userData.arch) {
    const pr = mesh.userData.preset || {};
    mesh.userData.arch = {
      role: pr.role || 'none',
      layers: normLayers(pr.layers),
      b: pr.b ?? 1,
      areaOverride: null,
      hidden: false,
      rdm: pr.rdm ? { ...defaultRdm(mesh), ...pr.rdm, manual: {} } : null
    };
  }
  return mesh.userData.arch;
}

const metrics = (mesh) => (mesh.userData.metrics ||= meshMetrics(mesh));

function thermalOf(mesh) {
  const a = arch(mesh);
  if (a.role === 'none') return null;
  const wt = P.wallThermal(a.role, a.layers.filter((l) => l.mat), (id) => db.get(id));
  return wt.valid ? wt : null;
}
const areaOf = (mesh) => {
  const a = arch(mesh);
  return Number.isFinite(a.areaOverride) ? a.areaOverride : metrics(mesh).area;
};

/* ========================================================================== */
/*  Viewer                                                                     */
/* ========================================================================== */
const viewer = new Viewer($('viewport'), {
  onSelect: (mesh, list) => onSelect(mesh, list),
  onHover: (mesh) => {
    const tip = $('hover-tip');
    if (!mesh) { tip.hidden = true; $('status-hover').textContent = ''; return; }
    tip.hidden = false; tip.textContent = mesh.name;
    $('status-hover').textContent = `Survol : ${mesh.name}`;
  },
  onModelChanged: () => onModelChanged(),
  onLayersChanged: () => renderLayers(),
  onLayerVisibilityChanged: () => { renderLayers(); updateVirtualList(); refreshVisuals(); }
});
window.__viewer = viewer; // utile au débogage

function getSelectedMeshes() {
  if (viewer.selectedList && viewer.selectedList.length > 0) {
    return [...viewer.selectedList];
  }
  return viewer.selected ? [viewer.selected] : [];
}

function onModelChanged() {
  const meshes = viewer.meshes();
  meshes.forEach((m) => { delete m.userData.metrics; });
  $('empty-state').hidden = meshes.length > 0;
  $('element-count').textContent = meshes.length;
  if (!state.room.manual) detectRoom(false);
  renderLayers();
  renderList();
  updateModelInfo();
  renderAll();
}

function updateModelInfo() {
  const meshes = viewer.meshes();
  if (!meshes.length) { $('model-info').textContent = 'Aucun modèle chargé.'; return; }
  const b = viewer.bounds().getSize(new THREE.Vector3());
  $('model-info').innerHTML = `<b>${escapeHtml(state.modelName)}</b><br>${meshes.length} éléments · ${f(b.x, 2)} × ${f(b.z, 2)} × ${f(b.y, 2)} m`;
}

/* ========================================================================== */
/*  Calques & Groupes (renommage virtuel sans altération du fichier source)    */
/* ========================================================================== */
function renderLayers() {
  const listEl = $('layers-list');
  if (!listEl) return;
  const layers = viewer.getLayers();
  const countEl = $('layer-count');
  if (countEl) countEl.textContent = layers.length;

  if (!layers.length) {
    listEl.innerHTML = '<li class="muted tiny" style="padding:6px 8px;">Aucun groupe ou calque détecté.</li>';
    return;
  }

  listEl.innerHTML = layers.map((l) => {
    return `<li class="layer-item ${l.visible ? '' : 'layer-hidden'}" data-layer-id="${l.id}">` +
      `<span class="layer-color" style="background:${l.color}"></span>` +
      `<div class="layer-title-wrap" title="Cliquer pour sélectionner tous les éléments du calque">` +
        `<span class="layer-title" data-layer-id="${l.id}">${escapeHtml(l.name)}</span>` +
      `</div>` +
      `<button class="layer-edit-btn" data-layer-id="${l.id}" type="button" title="Renommer ce calque (virtuel, sans modifier le fichier source)">✏️</button>` +
      `<span class="layer-count-badge">${l.count}</span>` +
      `<button class="layer-eye" data-layer-id="${l.id}" type="button" title="Afficher ou masquer ce calque">${l.visible ? '◉' : '◌'}</button>` +
    `</li>`;
  }).join('');
}

$('layers-list')?.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-layer-id]');
  if (!li) return;
  const layerId = li.dataset.layerId;
  const layer = viewer.layersMap.get(layerId);
  if (!layer) return;

  if (e.target.closest('.layer-eye')) {
    viewer.setLayerVisibility(layerId, !layer.visible);
    renderLayers();
    updateVirtualList();
    refreshVisuals();
    return;
  }

  if (e.target.closest('.layer-edit-btn')) {
    startRenamingLayer(layerId, li);
    return;
  }

  // Clic sur le calque : sélectionne tous ses éléments
  viewer.selectLayer(layerId);
  const matching = viewer.meshes().filter((m) => m.userData.layerId === layerId && m.visible);
  toast(`Calque « ${layer.name} » sélectionné (${matching.length} éléments)`);
});

$('layers-list')?.addEventListener('dblclick', (e) => {
  const li = e.target.closest('li[data-layer-id]');
  if (!li) return;
  startRenamingLayer(li.dataset.layerId, li);
});

function startRenamingLayer(layerId, li) {
  const titleWrap = li.querySelector('.layer-title-wrap');
  if (!titleWrap || titleWrap.querySelector('input')) return;
  const layer = viewer.layersMap.get(layerId);
  if (!layer) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'layer-name-input';
  input.value = layer.name;
  titleWrap.innerHTML = '';
  titleWrap.appendChild(input);
  input.focus();
  input.select();

  const finish = () => {
    const newName = input.value.trim() || layer.name;
    viewer.renameLayer(layerId, newName);
    renderLayers();
    updateVirtualList();
    toast(`Calque renommé : « ${newName} » (renommage virtuel sans réécriture du fichier 3D)`, 'ok');
  };

  input.addEventListener('blur', finish, { once: true });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      input.blur();
    } else if (ev.key === 'Escape') {
      input.value = layer.name;
      input.blur();
    }
  });
}

$('btn-toggle-layers-collapse')?.addEventListener('click', () => {
  const card = $('card-layers');
  if (card) {
    const isCol = card.classList.toggle('collapsed');
    $('btn-toggle-layers-collapse').textContent = isCol ? '▸' : '▾';
  }
});

/* ========================================================================== */
/*  Liste d'éléments (Virtual Scroll haute performance & Multi-sélection)       */
/* ========================================================================== */
const ITEM_HEIGHT = 32; // Hauteur par élément en pixels
const VISIBLE_COUNT = 30; // Nombre d'éléments visibles dans la fenêtre
const BUFFER_COUNT = 6;  // Marge tampon au-dessus et en-dessous
let currentFilteredMeshes = [];
let lastClickedIndex = -1;

const renderList = debounce(renderListNow, 250);

function renderListNow() {
  const ul = $('element-list');
  const q = $('element-filter').value.trim().toLowerCase();
  const all = viewer.meshes();
  currentFilteredMeshes = q ? all.filter((m) => m.name.toLowerCase().includes(q)) : all;
  updateVirtualList();
}

function updateVirtualList() {
  const ul = $('element-list');
  if (!ul) return;
  const total = currentFilteredMeshes.length;
  const totalHeight = total * ITEM_HEIGHT;

  let spacer = ul.querySelector('.element-list-spacer');
  let container = ul.querySelector('.element-list-items');
  if (!spacer || !container) {
    ul.innerHTML = '<div class="element-list-spacer"></div><div class="element-list-items"></div>';
    spacer = ul.querySelector('.element-list-spacer');
    container = ul.querySelector('.element-list-items');
  }

  spacer.style.height = `${totalHeight}px`;

  const scrollTop = ul.scrollTop || 0;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_COUNT);
  const endIndex = Math.min(total, startIndex + VISIBLE_COUNT + BUFFER_COUNT * 2);

  container.style.transform = `translateY(${startIndex * ITEM_HEIGHT}px)`;

  const selSet = new Set(viewer.selectedList ? viewer.selectedList : (viewer.selected ? [viewer.selected] : []));
  let html = '';

  for (let i = startIndex; i < endIndex; i++) {
    const m = currentFilteredMeshes[i];
    const a = arch(m);
    const isSel = selSet.has(m);
    let tag = '', tagColor = '';
    if (state.mode === 'thermal') {
      const wt = thermalOf(m);
      if (wt) tag = `${P.ROLES[a.role].short} · U ${f(wt.U)}`;
    } else if (m.userData.rdmRes && !m.userData.rdmRes.error) {
      const r = m.userData.rdmRes;
      const g = r.eta || 0;
      const typeLabel = {
        beam: 'POU',
        column: 'POT',
        slab: 'DAL',
        bearingwall: 'MUR',
        partition: 'CLO',
        corbel: 'COR'
      }[r.type || 'beam'] || 'RDM';
      tag = `${typeLabel} ${f(g, 0)} %`; tagColor = P.cssRgb(P.colorForRatio(g));
    }

    const classes = ['el-item'];
    if (isSel) classes.push('sel');
    if (a.hidden) classes.push('hidden-el');

    const layerName = m.userData.layerName;

    html += `<li class="${classes.join(' ')}" data-uuid="${m.uuid}" data-index="${i}" role="option">` +
      `<input type="checkbox" class="el-chk" data-uuid="${m.uuid}" ${isSel ? 'checked' : ''} title="Cocher pour multi-sélection">` +
      `<span class="el-swatch" style="background:${ROLE_COLOR[a.role]}"></span>` +
      `<span class="el-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>` +
      (layerName ? `<span class="el-layer-badge" title="Calque : ${escapeHtml(layerName)}">${escapeHtml(layerName)}</span>` : '') +
      (tag ? `<span class="el-tag" style="${tagColor ? `color:${tagColor};border-color:${tagColor}` : ''}">${escapeHtml(tag)}</span>` : '') +
      `<button class="el-eye" type="button" title="Afficher / masquer" aria-label="Afficher ou masquer">${a.hidden ? '◌' : '◉'}</button>` +
    `</li>`;
  }

  container.innerHTML = html;
}

$('element-list').addEventListener('scroll', () => {
  updateVirtualList();
}, { passive: true });

$('element-list').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-uuid]');
  if (!li) return;
  const mesh = viewer.meshes().find((m) => m.uuid === li.dataset.uuid);
  if (!mesh) return;

  if (e.target.closest('.el-eye')) {
    const a = arch(mesh); a.hidden = !a.hidden;
    refreshVisuals(); updateVirtualList();
    return;
  }

  const clickedIndex = parseInt(li.dataset.index, 10);

  // Clic direct sur la case à cocher
  if (e.target.closest('.el-chk')) {
    viewer.select(mesh, { multi: true, toggle: true });
    lastClickedIndex = clickedIndex;
    return;
  }

  // Multi-sélection par plage avec Shift + Clic
  if (e.shiftKey && lastClickedIndex >= 0 && lastClickedIndex !== clickedIndex) {
    const start = Math.min(lastClickedIndex, clickedIndex);
    const end = Math.max(lastClickedIndex, clickedIndex);
    const range = currentFilteredMeshes.slice(start, end + 1);
    const curSet = new Set(viewer.selectedList || []);
    range.forEach((item) => curSet.add(item));
    viewer.selectAll([...curSet]);
    return;
  }

  const isMulti = !!(e.ctrlKey || e.metaKey);
  viewer.select(mesh, { multi: isMulti, toggle: isMulti });
  lastClickedIndex = clickedIndex;
});

$('element-filter').addEventListener('input', renderList);

$('btn-select-all')?.addEventListener('click', () => {
  const visible = viewer.meshes().filter((m) => !arch(m).hidden);
  if (visible.length) {
    viewer.selectAll(visible);
    toast(`${visible.length} éléments sélectionnés`);
  }
});

$('btn-select-inv')?.addEventListener('click', () => {
  const visible = viewer.meshes().filter((m) => !arch(m).hidden);
  const selSet = new Set(viewer.selectedList || []);
  const inverted = visible.filter((m) => !selSet.has(m));
  viewer.selectAll(inverted);
  toast(`${inverted.length} élément(s) sélectionné(s) (inversion)`);
});

$('btn-select-none')?.addEventListener('click', () => {
  viewer.deselectAll();
});

// Bouton de sélection rectangulaire 3D dans la barre d'outils
$('tb-marquee')?.addEventListener('click', () => {
  const next = !viewer.marqueeMode;
  viewer.setMarqueeMode(next);
  $('tb-marquee').classList.toggle('active', next);
  if (next) {
    toast('Sélection rectangulaire 3D activée : glissez sur la vue 3D pour capturer plusieurs éléments.', 'ok');
  } else {
    toast('Mode de navigation 3D normal réactivé.');
  }
});

/* ========================================================================== */
/*  Sélection                                                                  */
/* ========================================================================== */
function onSelect(mesh, selectedList) {
  const list = (selectedList && selectedList.length) ? selectedList : (mesh ? [mesh] : []);
  const count = list.length;
  const has = count > 0;
  $('sel-empty').hidden = has;
  $('sel-body').hidden = !has;
  $('sel-chip').hidden = !has;

  const multiBanner = $('multi-selection-banner');
  if (multiBanner) {
    multiBanner.hidden = count <= 1;
    if (count > 1) {
      $('multi-count-label').textContent = `${count} éléments sélectionnés`;
    }
  }

  if (has) {
    list.forEach((m) => {
      arch(m);
      if (state.mode === 'structure' && !m.userData.arch.rdm) m.userData.arch.rdm = defaultRdm(m);
    });
    if (count > 1) {
      $('sel-chip-name').textContent = `${count} éléments`;
      status(`Sélection multiple : ${count} éléments`);
    } else {
      $('sel-chip-name').textContent = mesh.name;
      status(`Sélection : ${mesh.name}`);
    }
  }
  renderAll();
  renderListNow();
  if (mesh && currentFilteredMeshes.length > 0) {
    const idx = currentFilteredMeshes.indexOf(mesh);
    if (idx >= 0) {
      const ul = $('element-list');
      const targetTop = idx * ITEM_HEIGHT;
      if (ul && (targetTop < ul.scrollTop || targetTop > ul.scrollTop + ul.clientHeight - ITEM_HEIGHT)) {
        ul.scrollTop = Math.max(0, targetTop - Math.floor(ul.clientHeight / 2));
      }
    }
  }
}

function renderSelection() {
  const list = getSelectedMeshes();
  if (!list.length) return;
  const mesh = viewer.selected || list[0];
  const m = metrics(mesh);

  if (list.length > 1) {
    let totVol = 0, totArea = 0, totTris = 0;
    list.forEach((item) => {
      const im = metrics(item);
      totVol += (im.volume || 0);
      totArea += (im.area || 0);
      totTris += (im.triangles || 0);
    });
    $('sel-name').textContent = `Sélection groupée (${list.length} éléments)`;
    $('d-length').textContent = `${f(m.L, 3)} (dernier)`;
    $('d-width').textContent = `${f(m.W, 3)} (dernier)`;
    $('d-thick').textContent = `${f(m.T, 3)} (dernier)`;
    $('d-area').textContent = f(totArea, 3);
    $('d-volume').textContent = f(totVol, 3);
    $('d-surf').textContent = f(totArea, 2);
    $('d-note').textContent =
      `${list.length} éléments sélectionnés simultanément. ` +
      `Surface cumulée = ${f(totArea, 2)} m² · Volume cumulé = ${f(totVol, 3)} m³ · ` +
      `${totTris.toLocaleString('fr-FR')} triangles. Les réglages ci-dessous sont appliqués à tous les éléments sélectionnés.`;
  } else {
    $('sel-name').textContent = mesh.name;
    $('d-length').textContent = f(m.L, 3);
    $('d-width').textContent = f(m.W, 3);
    $('d-thick').textContent = f(m.T, 3);
    $('d-area').textContent = f(m.area, 3);
    $('d-volume').textContent = f(m.volume, 3);
    $('d-surf').textContent = f(m.areaTri, 2);
    $('d-note').textContent =
      `Dimensions locales (boîte orientée × échelle). Surface = L × l (face principale). ` +
      (m.volApprox ? 'Volume = boîte englobante (maillage non fermé). ' : 'Volume = intégrale du maillage fermé. ') +
      `${m.triangles.toLocaleString('fr-FR')} triangles.`;
  }
}

function renderAll() {
  renderSelection();
  syncThermalInputs();
  renderThermal();
  syncBeamInputs();
  renderBeam();
  refreshVisuals();
}

/* ========================================================================== */
/*  MODULE 1 — Thermique                                                       */
/* ========================================================================== */
function syncThermalInputs() {
  const mesh = viewer.selected;
  $('wall-disabled').hidden = !!mesh;
  $('wall-body').hidden = !mesh;
  if (!mesh) return;
  const a = arch(mesh);
  $('role-select').value = a.role;
  $('layers-block').hidden = a.role === 'none';
  $('apply-role-name').textContent = P.ROLES[a.role].label;
  a.layers.forEach((l, i) => {
    $(`layer-mat-${i}`).value = l.mat || '';
    $(`layer-e-${i}`).value = l.mat ? l.e : '';
    $(`layer-e-${i}`).disabled = !l.mat;
  });
  $('area-input').value = f(areaOf(mesh), 3);
  $('area-input').parentElement.classList.toggle('auto', !Number.isFinite(a.areaOverride));
  $('btr-input').value = a.b;
}

function renderThermal() {
  const mesh = viewer.selected;
  if (mesh) {
    const a = arch(mesh);
    const wt = thermalOf(mesh);
    $('wall-results').hidden = !(a.role !== 'none' && wt);
    renderLayerBar(a);
    if (wt) {
      $('r-R').textContent = f(wt.R, 3);
      $('r-U').textContent = f(wt.U, 3);
      $('r-phase').textContent = f(wt.phaseH, 1);
      $('r-att').textContent = f(wt.attenuation, 3);
      $('r-speed').textContent = f(wt.vCmH, 2);
      $('r-surf').textContent = f(wt.rsi + wt.rse, 2);
      const ur = P.uRating(a.role, wt.U), pr = P.phaseRating(wt.phaseH);
      setBadge('u-rating', ur.label, ur.cls);
      setBadge('phase-rating', pr.label, pr.cls);
      const tb = $('layers-table').querySelector('tbody');
      tb.innerHTML = wt.layers.map((l) =>
        `<tr><td title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</td><td>${f(l.eEff * 100, 1)}</td><td>${f(l.R, 3)}</td>` +
        `<td>${f(l.a * 1e7, 2)}</td><td>${f(l.delta * 100, 1)}</td><td>${f(l.phaseH, 2)}</td></tr>`).join('');
    }
  }
  renderBalance();
}

function setBadge(id, text, cls) {
  const b = $(id); b.textContent = text; b.className = `badge ${cls}`;
}

function renderLayerBar(a) {
  const bar = $('layer-bar');
  const items = a.layers.filter((l) => l.mat && l.e > 0).map((l) => ({ m: db.get(l.mat), e: l.e })).filter((x) => x.m);
  bar.innerHTML = items.map((x) =>
    `<span style="flex:${x.m.glaz ? x.m.glaz.e * 100 : x.e};background:${CAT_COLOR[x.m.cat] || '#aaa'}" title="${escapeHtml(x.m.name)} — ${x.m.glaz ? x.m.glaz.e * 100 : x.e} cm">${x.m.glaz ? f(x.m.glaz.e * 100, 1) : x.e}</span>`
  ).join('');
  const mesh = viewer.selected;
  const note = $('layer-note');
  if (!mesh || !items.length) { note.textContent = ''; return; }
  const wt = items.some((x) => x.m.glaz);
  if (wt) {
    note.textContent = 'Vitrage : la résistance de la couche est déduite de U_g (R = 1/U_g − 0,17) ; l\'épaisseur nominale sert à la dynamique.';
    return;
  }
  const tot = items.reduce((s, x) => s + x.e, 0);
  const geo = metrics(mesh).T * 100;
  const diff = Math.abs(tot - geo) / Math.max(geo, 1e-6);
  note.textContent = `Épaisseur composée : ${f(tot, 1)} cm — épaisseur géométrique de l'élément : ${f(geo, 1)} cm` + (diff > 0.12 ? ' (écart > 12 %).' : '.');
  note.style.color = diff > 0.12 ? '#ffb567' : '';
}

/* ---- Événements : rôle, couches, surface ---- */
$('role-select').addEventListener('change', () => {
  const mesh = viewer.selected; if (!mesh) return;
  const a = arch(mesh);
  a.role = $('role-select').value;
  if (a.role !== 'none' && !a.layers.some((l) => l.mat)) a.layers = normLayers(DEFAULT_COMP[a.role]);
  syncThermalInputs(); renderThermal(); refreshVisuals(); renderList();
});

for (let i = 0; i < 3; i++) {
  const sel = $(`layer-mat-${i}`), inp = $(`layer-e-${i}`);
  sel.addEventListener('change', () => {
    const mesh = viewer.selected; if (!mesh) return;
    const l = arch(mesh).layers[i];
    l.mat = sel.value;
    if (l.mat) {
      const m = db.get(l.mat);
      if (m && m.glaz) l.e = +(m.glaz.e * 100).toFixed(1);
      else if (!(l.e > 0)) l.e = 10;
    } else l.e = 0;
    inp.value = l.mat ? l.e : ''; inp.disabled = !l.mat;
    renderThermal(); refreshVisuals(); renderList();
  });
  inp.addEventListener('input', () => {
    const mesh = viewer.selected; if (!mesh) return;
    const v = num(inp);
    arch(mesh).layers[i].e = Number.isFinite(v) && v >= 0 ? v : 0;
    renderThermal(); refreshVisuals(); renderList();
  });
}

$('area-input').addEventListener('input', () => {
  const mesh = viewer.selected; if (!mesh) return;
  const v = num($('area-input'));
  if (Number.isFinite(v) && v >= 0) { arch(mesh).areaOverride = v; $('area-input').parentElement.classList.remove('auto'); renderThermal(); }
});
$('btn-area-auto').addEventListener('click', () => {
  const mesh = viewer.selected; if (!mesh) return;
  arch(mesh).areaOverride = null; syncThermalInputs(); renderThermal();
});
$('btr-input').addEventListener('input', () => {
  const mesh = viewer.selected; if (!mesh) return;
  const v = num($('btr-input'));
  if (Number.isFinite(v)) { arch(mesh).b = Math.min(Math.max(v, 0), 1); renderThermal(); }
});
$('btn-apply-role').addEventListener('click', () => {
  const mesh = viewer.selected; if (!mesh) return;
  const a = arch(mesh);
  let n = 0;
  viewer.meshes().forEach((m) => { const x = arch(m); if (x !== a && x.role === a.role) { x.layers = cloneLayers(a.layers); n++; } });
  toast(`Composition appliquée à ${n} autre(s) élément(s) « ${P.ROLES[a.role].label} ».`, 'ok');
  renderThermal(); refreshVisuals(); renderList();
});

/* ---- Bilan global ---- */
function envelopeElements() {
  const out = [];
  for (const m of viewer.meshes()) {
    const a = arch(m);
    if (a.role === 'none') continue;
    const wt = thermalOf(m);
    if (!wt) continue;
    out.push({ mesh: m, name: m.name, role: a.role, A: areaOf(m), U: wt.U, b: a.b, wt });
  }
  return out;
}

function computeBalance() {
  const els = envelopeElements();
  const bal = P.roomBalance({
    elements: els, V: state.room.V, n: state.climate.n, Tint: state.climate.Tint, Text: state.climate.Text,
    S: state.room.S, DJU: state.climate.DJU
  });
  bal.rows.forEach((r, i) => { r.mesh = els[i].mesh; r.wt = els[i].wt; });
  return bal;
}

function renderBalance() {
  const c = state.climate;
  $('v-text').textContent = `${f(c.Text, 1)} °C`;
  $('v-tint').textContent = `${f(c.Tint, 1)} °C`;
  $('v-vmc').textContent = `${f(c.n, 2)} vol/h`;
  if (document.activeElement !== $('room-V')) $('room-V').value = f(state.room.V, 1);
  if (document.activeElement !== $('room-S')) $('room-S').value = f(state.room.S, 1);
  $('room-note').textContent = (state.room.note ? state.room.note + '. ' : '') + 'Régime permanent (ISO 13790), hors apports solaires et internes.';

  const b = computeBalance();
  $('o-HT').textContent = f(b.HT, 2);
  $('o-HV').textContent = f(b.HV, 2);
  $('o-H').textContent = f(b.H, 2);
  const hero = $('o-phi-box');
  hero.dataset.mode = b.mode;
  $('o-phi').textContent = fInt(b.phiAbs);
  $('o-mode-label').textContent = b.mode === 'chauffage' ? 'Puissance de chauffage nécessaire'
    : b.mode === 'refroidissement' ? 'Puissance de refroidissement nécessaire' : 'Aucun besoin (ΔT ≈ 0)';
  setBadge('o-mode', b.mode === 'neutre' ? '' : b.mode, b.mode === 'chauffage' ? 'bad' : 'info');
  $('o-wm2').textContent = f(b.wm2, 1);
  $('o-kwh').textContent = fInt(b.kwhYear);

  // Répartition
  const groups = { mur: 0, toit: 0, plancher: 0, vitrage: 0 };
  b.rows.forEach((r) => { groups[r.role] += r.UA; });
  const names = { mur: 'Murs', toit: 'Toiture', plancher: 'Plancher', vitrage: 'Vitrages', air: 'Ventilation' };
  const parts = [...Object.entries(groups), ['air', b.HV]].filter(([, v]) => v > 0);
  $('loss-bar').innerHTML = parts.map(([k, v]) => `<span style="flex:${v};background:${LOSS_COLORS[k]}" title="${names[k]} : ${f(v, 1)} W/K (${f(v / b.H * 100, 0)} %)"></span>`).join('');
  $('loss-legend').innerHTML = parts.map(([k, v]) => `<span><i style="background:${LOSS_COLORS[k]}"></i>${names[k]} ${f(v / b.H * 100, 0)} %</span>`).join('');

  const rows = [...b.rows].sort((x, y) => y.UA - x.UA);
  const tb = $('loss-table').querySelector('tbody');
  tb.innerHTML = rows.slice(0, 14).map((r) =>
    `<tr class="clickable" data-uuid="${r.mesh.uuid}"><td title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td><td>${f(r.A, 2)}</td><td>${f(r.U, 3)}</td><td>${f(r.UA, 2)}</td><td>${f(r.share * 100, 1)}</td></tr>`).join('') +
    `<tr><td>Ventilation</td><td>—</td><td>—</td><td>${f(b.HV, 2)}</td><td>${f(b.shareHV * 100, 1)}</td></tr>`;

  const w = $('balance-warning');
  if (!rows.length) { w.hidden = false; w.textContent = 'Aucune paroi d\'enveloppe assignée : seules les déperditions par renouvellement d\'air sont comptées. Sélectionnez des éléments et assignez-leur un rôle.'; }
  else if (!(state.room.V > 0)) { w.hidden = false; w.textContent = 'Volume d\'air nul : renseignez V.'; }
  else w.hidden = true;
}

$('loss-table').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-uuid]'); if (!tr) return;
  const m = viewer.meshes().find((x) => x.uuid === tr.dataset.uuid); if (m) viewer.select(m);
});

function bindSlider(id, key) {
  $(id).addEventListener('input', () => { state.climate[key] = parseFloat($(id).value); renderBalance(); });
}
bindSlider('sl-text', 'Text'); bindSlider('sl-tint', 'Tint'); bindSlider('sl-vmc', 'n');
$('in-dju').addEventListener('input', () => { const v = num($('in-dju')); state.climate.DJU = Number.isFinite(v) ? Math.max(v, 0) : 0; renderBalance(); });
$('room-V').addEventListener('input', () => { const v = num($('room-V')); if (Number.isFinite(v)) { state.room.V = Math.max(v, 0); state.room.manual = true; renderBalance(); } });
$('room-S').addEventListener('input', () => { const v = num($('room-S')); if (Number.isFinite(v)) { state.room.S = Math.max(v, 0); state.room.manual = true; renderBalance(); } });
$('btn-detect-room').addEventListener('click', () => { state.room.manual = false; detectRoom(true); renderBalance(); });

function detectRoom(announce) {
  const meshes = viewer.meshes();
  if (!meshes.length) { state.room = { V: 0, S: 0, manual: false, note: '' }; return; }
  const preset = viewer.modelRoot.children.find((c) => c.userData && c.userData.room);
  if (preset) {
    const r = preset.userData.room;
    state.room = { V: r.V, S: r.S, manual: false, note: r.note };
  } else {
    const size = viewer.bounds().getSize(new THREE.Vector3());
    const avg = (role, def) => {
      const ts = meshes.filter((m) => arch(m).role === role).map((m) => metrics(m).T);
      return ts.length ? ts.reduce((s, x) => s + x, 0) / ts.length : def;
    };
    const tw = avg('mur', 0.2), tf = avg('plancher', 0.2), tr = avg('toit', 0.2);
    const ix = Math.max(size.x - 2 * tw, 0.5), iz = Math.max(size.z - 2 * tw, 0.5), ih = Math.max(size.y - tf - tr, 0.5);
    state.room = { V: ix * iz * ih, S: ix * iz, manual: false, note: 'Estimation par boîte englobante (parois et planchers déduits) — ajustez si besoin' };
  }
  if (announce) toast(`Volume détecté : ${f(state.room.V, 1)} m³ — surface utile ${f(state.room.S, 1)} m².`, 'ok');
}

/* ========================================================================== */
/*  MODULE 2 — RDM                                                             */
/* ========================================================================== */
fillMatSelect($('beam-mat'), { ids: STRUCTURAL_IDS });

function beamDims(mesh) {
  const r = arch(mesh).rdm;
  const m = metrics(mesh);
  let L = m.L, h = m.W, b = m.T;
  if (r.swap) [h, b] = [b, h];
  const man = r.manual || {};
  return { L: man.L ?? L, b: man.b ?? b, h: man.h ?? h, auto: { L, b, h } };
}
const qOf = (r) => (r.qMode === 'strip' ? r.strip * r.surf * P.G / 1000 : r.qDirect);

function analyzeMesh(mesh) {
  const a = arch(mesh);
  if (!a.rdm) { mesh.userData.rdmRes = null; return null; }
  const r = a.rdm, d = beamDims(mesh), mat = db.get(r.matId) || db.get('s235');
  let res;
  if (r.structType === 'column') {
    res = P.columnAnalysis({
      L: d.L, b: d.b, h: d.h, E: mat.E, sigmaAdm: mat.sigma, rho: mat.rho,
      scheme: r.scheme || 'pin_pin', N: r.N, e0: r.e0, M: r.M, nature: r.nature
    });
  } else if (r.structType === 'slab') {
    res = P.slabAnalysis({
      L: d.L, W: d.h, h: d.b, E: mat.E, sigmaAdm: mat.sigma, rho: mat.rho,
      q: r.slabQ ?? 2.5, gPerm: r.slabG ?? 1.2, boundary: r.scheme || 'four_sides'
    });
  } else if (r.structType === 'bearingwall') {
    res = P.bearingWallAnalysis({
      L: d.L, h: d.h, b: d.b, E: mat.E, sigmaAdm: mat.sigma, rho: mat.rho,
      n: r.wallN ?? 120, nature: r.nature
    });
  } else if (r.structType === 'partition') {
    res = P.partitionAnalysis({
      L: d.L, h: d.h, b: d.b, E: mat.E, sigmaAdm: mat.sigma, rho: mat.rho,
      qh: r.partQh ?? 0.40
    });
  } else if (r.structType === 'corbel') {
    res = P.corbelAnalysis({
      L: d.L, h: d.h, b: d.b, E: mat.E, sigmaAdm: mat.sigma, rho: mat.rho,
      F: r.corbF ?? 120, nature: r.nature
    });
  } else {
    res = P.beamAnalysis({
      L: d.L, b: d.b, h: d.h, E: mat.E, sigmaAdm: mat.sigma, rho: mat.rho,
      scheme: r.scheme || 'ss', q: qOf(r), F: r.F, nature: r.nature
    });
  }
  mesh.userData.rdmRes = res;
  return res;
}
const analyzeAll = () => viewer.meshes().forEach((m) => { if (arch(m).rdm) analyzeMesh(m); });

function syncBeamInputs() {
  const mesh = viewer.selected;
  $('beam-disabled').hidden = !!mesh;
  $('beam-body').hidden = !mesh;
  ['card-beam-mech', 'card-beam-loads', 'card-beam-results', 'card-beam-chart'].forEach((id) => { $(id).hidden = !mesh; });
  if (!mesh || state.mode !== 'structure') return;
  if (!arch(mesh).rdm) arch(mesh).rdm = defaultRdm(mesh);
  const r = arch(mesh).rdm, d = beamDims(mesh);

  const st = r.structType || 'beam';
  if ($('type-beam')) $('type-beam').checked = st === 'beam';
  if ($('type-column')) $('type-column').checked = st === 'column';
  if ($('type-slab')) $('type-slab').checked = st === 'slab';
  if ($('type-bearingwall')) $('type-bearingwall').checked = st === 'bearingwall';
  if ($('type-partition')) $('type-partition').checked = st === 'partition';
  if ($('type-corbel')) $('type-corbel').checked = st === 'corbel';

  // Libellés adaptés pour les cotes
  if (st === 'column') {
    $('lbl-dim-L').textContent = 'Hauteur H';
    $('lbl-dim-b').textContent = 'Largeur b';
    $('lbl-dim-h').textContent = 'Profondeur h';
  } else if (st === 'slab') {
    $('lbl-dim-L').textContent = 'Portée Lx';
    $('lbl-dim-b').textContent = 'Épaisseur e';
    $('lbl-dim-h').textContent = 'Largeur Ly';
  } else if (st === 'bearingwall' || st === 'partition') {
    $('lbl-dim-L').textContent = 'Longueur L';
    $('lbl-dim-b').textContent = 'Épaisseur t';
    $('lbl-dim-h').textContent = 'Hauteur H';
  } else if (st === 'corbel') {
    $('lbl-dim-L').textContent = 'Portée ac';
    $('lbl-dim-b').textContent = 'Largeur b';
    $('lbl-dim-h').textContent = 'Hauteur hc';
  } else {
    $('lbl-dim-L').textContent = 'Portée L';
    $('lbl-dim-b').textContent = 'Largeur b';
    $('lbl-dim-h').textContent = 'Hauteur h';
  }

  $('in-L').value = f(d.L, 3); $('in-b').value = f(d.b, 3); $('in-h').value = f(d.h, 3);
  fillMatSelect($('beam-mat'), { ids: STRUCTURAL_IDS });
  $('beam-mat').value = r.matId;

  // Schémas statiques adaptés
  const schemeSel = $('beam-scheme');
  if (st === 'column') {
    $('lbl-scheme').textContent = 'Conditions d’appuis (flambement)';
    schemeSel.innerHTML = `
      <option value="pin_pin">Articulé - Articulé (k = 1,0)</option>
      <option value="fix_free">Encastré - Libre / Console (k = 2,0)</option>
      <option value="fix_pin">Encastré - Articulé (k = 0,7)</option>
      <option value="fix_fix">Encastré - Encastré (k = 0,5)</option>
    `;
    schemeSel.value = r.scheme && P.COLUMN_SCHEMES[r.scheme] ? r.scheme : 'pin_pin';
  } else if (st === 'slab') {
    $('lbl-scheme').textContent = 'Type de portée & appuis de la dalle';
    schemeSel.innerHTML = `
      <option value="four_sides">Appuis 4 rives (Portée 2 sens)</option>
      <option value="one_way">Appuis 2 rives (Portée 1 sens)</option>
      <option value="cantilever">En console (Balcon / Porte-à-faux)</option>
    `;
    schemeSel.value = r.scheme || 'four_sides';
  } else if (st === 'bearingwall') {
    $('lbl-scheme').textContent = 'Liaisons du mur porteur';
    schemeSel.innerHTML = `
      <option value="pin_pin">Articulé tête & pied (standard)</option>
      <option value="fix_pin">Encastré pied, articulé tête</option>
    `;
    schemeSel.value = r.scheme || 'pin_pin';
  } else if (st === 'partition') {
    $('lbl-scheme').textContent = 'Liaisons de la cloison';
    schemeSel.innerHTML = `
      <option value="top_bot">Fixation haute & basse coulissante</option>
      <option value="four_sides">Fixation périphérique 4 rives</option>
    `;
    schemeSel.value = r.scheme || 'top_bot';
  } else if (st === 'corbel') {
    $('lbl-scheme').textContent = 'Schéma mécanique du corbeau';
    schemeSel.innerHTML = `
      <option value="strut_tie">Bielles & Tirants Eurocode (Console courte)</option>
      <option value="standard">Console trapézoïdale standard</option>
    `;
    schemeSel.value = r.scheme || 'strut_tie';
  } else {
    $('lbl-scheme').textContent = 'Support Scheme';
    schemeSel.innerHTML = `
      <option value="ss">Simply Supported Beam</option>
      <option value="fix">Fixed-Fixed Beam</option>
      <option value="cant">Cantilever Beam</option>
    `;
    schemeSel.value = r.scheme && P.SCHEMES[r.scheme] ? r.scheme : 'ss';
  }

  // Masquage conditionnel des charges
  $('loads-beam-wrap').hidden = st !== 'beam';
  $('loads-column-wrap').hidden = st !== 'column';
  $('loads-slab-wrap').hidden = st !== 'slab';
  $('loads-bearingwall-wrap').hidden = st !== 'bearingwall';
  $('loads-partition-wrap').hidden = st !== 'partition';
  $('loads-corbel-wrap').hidden = st !== 'corbel';

  if (st === 'slab') {
    $('lbl-pp').textContent = 'Poids propre dalle g = ρ·g·e';
    $('unit-pp').textContent = 'kN/m²';
  } else if (st === 'bearingwall' || st === 'partition') {
    $('lbl-pp').textContent = 'Poids propre p = ρ·g·t·H';
    $('unit-pp').textContent = 'kN/m';
  } else if (st === 'column') {
    $('lbl-pp').textContent = 'Self-weight P = ρ·g·A·H';
    $('unit-pp').textContent = 'kN';
  } else if (st === 'corbel') {
    $('lbl-pp').textContent = 'Poids propre corbeau P = ρ·g·V';
    $('unit-pp').textContent = 'kN';
  } else {
    $('lbl-pp').textContent = 'Self-weight g = ρ·g·b·h';
    $('unit-pp').textContent = 'kN/m';
  }

  // Paramètres Poutre
  $(r.qMode === 'strip' ? 'qmode-strip' : 'qmode-direct').checked = true;
  $('q-direct').hidden = r.qMode === 'strip';
  $('q-strip').hidden = r.qMode !== 'strip';
  $('in-q').value = r.qDirect ?? 5; $('in-strip').value = r.strip ?? 1; $('in-surf').value = r.surf ?? 200;
  $('in-F').value = r.F ?? 0;
  $('lbl-F').textContent = r.scheme === 'cant' ? 'Point Load F (free tip)' : 'Point Load F (midspan)';

  // Paramètres Poteau
  $('in-N').value = r.N ?? 150;
  $('in-e0').value = f((r.e0 !== undefined ? r.e0 * 100 : Math.max(d.L / 4, 2.0)), 1); // cm
  $('in-M').value = r.M ?? 0;

  // Paramètres Plancher
  $('in-slab-q').value = r.slabQ ?? 2.5;
  $('in-slab-g').value = r.slabG ?? 1.2;

  // Paramètres Mur porteur
  $('in-wall-n').value = r.wallN ?? 120;

  // Paramètres Cloison
  $('in-part-qh').value = f(r.partQh ?? 0.40, 2);

  // Paramètres Corbeau
  $('in-corb-F').value = r.corbF ?? 120;

  $('sel-nature').value = r.nature || 'Q';
}

function renderBeam() {
  const mesh = viewer.selected;
  if (!mesh || !arch(mesh).rdm) return;
  const r = arch(mesh).rdm;
  const d = beamDims(mesh), mat = db.get(r.matId) || db.get('s235');
  const res = analyzeMesh(mesh);
  const man = r.manual || {};
  const edited = ['L', 'b', 'h'].filter((k) => man[k] !== undefined);
  const st = r.structType || 'beam';

  const typeDesc = {
    beam: 'Cotes poutre BoundingBox : L = portée, h = retombée, b = largeur.',
    column: 'Cotes poteau BoundingBox : H = hauteur verticale, b & h = section.',
    slab: 'Cotes plancher BoundingBox : Lx & Ly = portées en plan, e = épaisseur.',
    bearingwall: 'Cotes mur porteur BoundingBox : L = longueur, H = hauteur, t = épaisseur.',
    partition: 'Cotes cloison BoundingBox : L = longueur, H = hauteur, t = épaisseur.',
    corbel: 'Cotes corbeau BoundingBox : ac = portée, hc = hauteur, b = largeur.'
  }[st] || 'Cotes BoundingBox.';

  $('dims-source').textContent = typeDesc + (edited.length ? ` Modifié manuellement : ${edited.join(', ')}.` : '');
  $('m-E').textContent = f(mat.E, 1); $('m-sig').textContent = f(mat.sigma, 1); $('m-rho').textContent = f(mat.rho, 0);

  const verdict = $('verdict');
  if (!res || res.error) {
    verdict.dataset.state = 'error';
    $('verdict-badge').textContent = 'DONNÉES INVALIDES';
    $('verdict-cause').textContent = res ? res.error : '';
    drawBeamDiagram($('beam-canvas'), res);
    refreshVisuals();
    return;
  }
  verdict.dataset.state = res.verdict;
  $('verdict-badge').textContent = { ok: 'CONFORME', limite: 'LIMITE', rupture: 'RUPTURE / INSTABILITÉ' }[res.verdict];
  $('verdict-cause').textContent = res.cause;

  ['table-beam-results', 'table-column-results', 'table-slab-results', 'table-bearingwall-results', 'table-partition-results', 'table-corbel-results'].forEach((id) => { $(id).hidden = true; });

  if (st === 'column') {
    // Mode POTEAU (Compression & Flambement)
    $('table-column-results').hidden = false;
    $('lbl-res-subtitle').textContent = 'Euler · Eurocodes EN 1993 / EN 1995 / EN 1992';
    $('o-pp').textContent = f(res.pp, 3);

    $('lbl-gauge-1').innerHTML = 'Taux de flambement N<sub>Ed</sub> / N<sub>b,Rd</sub> (ELU)';
    $('g-eta').textContent = `${f(res.etaBuckling, 1)} %`;
    $('g-eta-bar').style.width = `${Math.min(res.etaBuckling / 130, 1) * 100}%`;
    $('g-eta-bar').style.background = P.cssRgb(P.colorForRatio(res.etaBuckling));

    const eulerRatio = (res.Nelu / Math.max(res.Ncr, 1e-6)) * 100;
    $('lbl-gauge-2').innerHTML = 'Charge critique Euler N<sub>Ed</sub> / N<sub>cr</sub>';
    $('g-f').textContent = `${f(eulerRatio, 1)} % · (N_cr = ${f(res.Ncr, 0)} kN)`;
    $('g-f-bar').style.width = `${Math.min(eulerRatio / 130, 1) * 100}%`;
    $('g-f-bar').style.background = P.cssRgb(P.colorForRatio(eulerRatio));
    $('g-f-mark500').style.left = `${(100 / 1.3)}%`;

    $('tc-A').textContent = f(res.ACm2, 1);
    $('tc-imin').textContent = f(res.iminCm, 2);
    $('tc-Imin').textContent = f(res.IminCm4, 1);
    $('tc-Ncr').textContent = f(res.Ncr, 1);
    $('tc-Lcr').textContent = f(res.Lcr, 2);
    $('tc-lambda').textContent = f(res.lambda, 1);
    $('tc-lambdabar').textContent = f(res.lambdaBar, 2);
    $('tc-chi').textContent = f(res.chi, 3);
    $('tc-NbRd').textContent = f(res.NbRd, 1);
    $('tc-Nelu').textContent = f(res.Nelu, 1);
    $('tc-sigmaN').textContent = f(res.sigmaN, 2);
    $('tc-sigmaM').textContent = f(res.sigmaM, 2);
    $('tc-sigmatot').textContent = f(res.sigmaTotal, 2);
    $('tc-sadm').textContent = f(res.input.sigmaAdm, 1);
  } else if (st === 'slab') {
    // Mode PLANCHER / DALLE
    $('table-slab-results').hidden = false;
    $('lbl-res-subtitle').textContent = 'Eurocode 2 / Eurocode 5 · Flexion de Dalle';
    $('o-pp').textContent = f(res.pp, 2);

    $('lbl-gauge-1').innerHTML = 'Taux de flexion σ / σ<sub>adm</sub> (ELU)';
    $('g-eta').textContent = `${f(res.etaStress, 1)} %`;
    $('g-eta-bar').style.width = `${Math.min(res.etaStress / 130, 1) * 100}%`;
    $('g-eta-bar').style.background = P.cssRgb(P.colorForRatio(res.etaStress));

    $('lbl-gauge-2').innerHTML = 'Flèche de dalle f<sub>max</sub> / (L/350)';
    $('g-f').textContent = `${f(res.fMm, 1)} mm · ${f(res.etaDefl, 0)} % de L/350`;
    $('g-f-bar').style.width = `${Math.min(res.etaDefl / 130, 1) * 100}%`;
    $('g-f-bar').style.background = P.cssRgb(P.colorForRatio(res.etaDefl));
    $('g-f-mark500').style.left = `${(res.lim500 / res.lim350) / 1.3 * 100}%`;

    $('ts-dims').textContent = `${f(res.Lx, 2)} × ${f(res.Ly, 2)}`;
    $('ts-e').textContent = (res.input.h * 100).toFixed(0);
    $('ts-Gtot').textContent = f(res.Gtot, 2);
    $('ts-qelu').textContent = f(res.qElu, 2);
    $('ts-Mels').textContent = f(res.Mels, 2);
    $('ts-Melu').textContent = f(res.Mmax, 2);
    $('ts-Velu').textContent = f(res.Vmax, 2);
    $('ts-sels').textContent = f(res.sigmaEls, 1);
    $('ts-selu').textContent = f(res.sigmaElu, 1);
    $('ts-sadm').textContent = f(res.input.sigmaAdm, 1);
    $('ts-f').textContent = f(res.fMm, 1);
    $('ts-lim350').textContent = f(res.lim350, 1);
    $('ts-lim500').textContent = f(res.lim500, 1);
  } else if (st === 'bearingwall') {
    // Mode MUR PORTEUR
    $('table-bearingwall-results').hidden = false;
    $('lbl-res-subtitle').textContent = 'Eurocode 6 / Eurocode 2 · Voiles Comprimés';
    $('o-pp').textContent = f(res.ppLin, 2);

    $('lbl-gauge-1').innerHTML = 'Capacité axiale n<sub>Ed</sub> / n<sub>Rd</sub>';
    $('g-eta').textContent = `${f(res.eta, 1)} %`;
    $('g-eta-bar').style.width = `${Math.min(res.eta / 130, 1) * 100}%`;
    $('g-eta-bar').style.background = P.cssRgb(P.colorForRatio(res.eta));

    const lamRatio = (res.lambda / 120) * 100;
    $('lbl-gauge-2').innerHTML = 'Élancement du mur λ / 120';
    $('g-f').textContent = `${f(res.lambda, 1)} · ${f(lamRatio, 0)} % de 120`;
    $('g-f-bar').style.width = `${Math.min(lamRatio / 130, 1) * 100}%`;
    $('g-f-bar').style.background = P.cssRgb(P.colorForRatio(lamRatio));
    $('g-f-mark500').style.left = `${(100 / 1.3)}%`;

    $('tw-geom').textContent = `${f(res.H, 2)} × ${(res.t * 100).toFixed(0)} cm`;
    $('tw-pp').textContent = f(res.ppLin, 2);
    $('tw-nels').textContent = f(res.nEls, 1);
    $('tw-nelu').textContent = f(res.nEd, 1);
    $('tw-lambda').textContent = f(res.lambda, 1);
    $('tw-ei').textContent = (res.ei * 100).toFixed(1);
    $('tw-phi').textContent = f(res.phi, 3);
    $('tw-nrd').textContent = f(res.nRd, 1);
    $('tw-sigma').textContent = f(res.sigmaMoy, 2);
    $('tw-sadm').textContent = f(res.sigmaAdm, 1);
  } else if (st === 'partition') {
    // Mode CLOISON
    $('table-partition-results').hidden = false;
    $('lbl-res-subtitle').textContent = 'NF DTU 25.41 · Rigidité sous poussée';
    $('o-pp').textContent = f(res.weightLin, 2);

    $('lbl-gauge-1').innerHTML = 'Contrainte sous poussée σ<sub>h</sub> / σ<sub>adm</sub>';
    $('g-eta').textContent = `${f(res.etaStress, 1)} %`;
    $('g-eta-bar').style.width = `${Math.min(res.etaStress / 130, 1) * 100}%`;
    $('g-eta-bar').style.background = P.cssRgb(P.colorForRatio(res.etaStress));

    $('lbl-gauge-2').innerHTML = 'Flèche horizontale f<sub>h</sub> / (H/200)';
    $('g-f').textContent = `${f(res.fhMm, 1)} mm · ${f(res.etaDefl, 0)} % de H/200`;
    $('g-f-bar').style.width = `${Math.min(res.etaDefl / 130, 1) * 100}%`;
    $('g-f-bar').style.background = P.cssRgb(P.colorForRatio(res.etaDefl));
    $('g-f-mark500').style.left = `${(100 / 1.3)}%`;

    $('tp-geom').textContent = `${f(res.H, 2)} × ${(res.t * 100).toFixed(0)} cm`;
    $('tp-wlin').textContent = f(res.weightLin, 2);
    $('tp-wsurf').textContent = f(res.weightSurf, 0);
    $('tp-qh').textContent = f(res.input.qh, 2);
    $('tp-fh').textContent = f(res.fhMm, 1);
    $('tp-lim200').textContent = f(res.lim200, 1);
    $('tp-sigma').textContent = f(res.sigmaH, 2);
    $('tp-sadm').textContent = f(res.input.sigmaAdm, 1);
    $('tp-status').textContent = res.verdict === 'ok' ? 'CONFORME DTU' : 'RIGIDITÉ FAIBLE';
  } else if (st === 'corbel') {
    // Mode CORBEAU
    $('table-corbel-results').hidden = false;
    $('lbl-res-subtitle').textContent = 'Eurocode 2 §6.5 · Modèle Bielles & Tirants';
    $('o-pp').textContent = '—';

    $('lbl-gauge-1').innerHTML = 'Bielle comprimée σ<sub>c</sub> / σ<sub>adm</sub>';
    $('g-eta').textContent = `${f(res.etaStrut, 1)} %`;
    $('g-eta-bar').style.width = `${Math.min(res.etaStrut / 130, 1) * 100}%`;
    $('g-eta-bar').style.background = P.cssRgb(P.colorForRatio(res.etaStrut));

    $('lbl-gauge-2').innerHTML = 'Cisaillement jonction τ / τ<sub>adm</sub>';
    $('g-f').textContent = `${f(res.tau, 2)} MPa · ${f(res.etaShear, 0)} %`;
    $('g-f-bar').style.width = `${Math.min(res.etaShear / 130, 1) * 100}%`;
    $('g-f-bar').style.background = P.cssRgb(P.colorForRatio(res.etaShear));
    $('g-f-mark500').style.left = `${(100 / 1.3)}%`;

    $('tcb-geom').textContent = `${(res.ac * 100).toFixed(0)} / ${(res.hc * 100).toFixed(0)}`;
    $('tcb-rac').textContent = `${f(res.rac, 2)} (${res.rac <= 1 ? 'console courte' : 'standard'})`;
    $('tcb-fels').textContent = f(res.Fels, 1);
    $('tcb-fedu').textContent = f(res.Fed, 1);
    $('tcb-hed').textContent = f(res.Hed, 1);
    $('tcb-theta').textContent = `${f(res.thetaDeg, 1)}°`;
    $('tcb-ted').textContent = f(res.Ted, 1);
    $('tcb-as').textContent = f(res.AsReq, 1);
    $('tcb-sigmastrut').textContent = f(res.sigmaStrut, 1);
    $('tcb-tau').textContent = f(res.tau, 2);
    $('tcb-tauadm').textContent = f(res.tauAdm, 2);
  } else {
    // Mode POUTRE (Flexion & Flèche)
    $('table-beam-results').hidden = false;
    $('lbl-res-subtitle').textContent = 'Euler-Bernoulli · EN 1990';
    const pp = P.G * mat.rho * d.b * d.h / 1000;
    $('o-pp').textContent = f(pp, 3);
    $('o-q').textContent = f(qOf(r), 3);

    $('lbl-gauge-1').innerHTML = 'Contrainte / σ<sub>adm</sub> (ELU)';
    $('g-eta').textContent = `${f(res.eta, 1)} %`;
    $('g-eta-bar').style.width = `${Math.min(res.eta / 130, 1) * 100}%`;
    $('g-eta-bar').style.background = P.cssRgb(P.colorForRatio(res.eta));

    const fr = res.fMm / res.lim300 * 100;
    $('lbl-gauge-2').innerHTML = 'Flèche f<sub>max</sub> / L/300';
    $('g-f').textContent = `${f(res.fMm, 2)} mm · ${f(fr, 0)} % de L/300`;
    $('g-f-bar').style.width = `${Math.min(fr / 130, 1) * 100}%`;
    $('g-f-bar').style.background = P.cssRgb(P.colorForRatio(fr));
    $('g-f-mark500').style.left = `${(res.lim500 / res.lim300) / 1.3 * 100}%`;

    $('t-Iz').textContent = f(res.IzCm4, 1);
    $('t-W').textContent = f(res.WelCm3, 1);
    $('t-M-els').textContent = f(res.els.M, 2); $('t-M-elu').textContent = f(res.elu.M, 2);
    $('t-V-els').textContent = f(res.els.V, 2); $('t-V-elu').textContent = f(res.elu.V, 2);
    $('t-s-els').textContent = f(res.sigmaEls, 2); $('t-s-elu').textContent = f(res.sigmaElu, 2);
    $('t-sadm').textContent = f(res.input.sigmaAdm, 1);
    $('t-f').textContent = f(res.fMm, 2);
    $('t-lref').textContent = res.input.scheme === 'cant' ? '(L_ref = 2L)' : '';
    $('t-ratio').textContent = Number.isFinite(res.ratio) ? `L/${fInt(res.ratio)}` : '—';
    $('t-l300').textContent = f(res.lim300, 2);
    $('t-l500').textContent = f(res.lim500, 2);
  }

  drawBeamDiagram($('beam-canvas'), res);
  refreshVisuals();
  renderList();
}

function bindBeamInput(id, apply) {
  $(id).addEventListener('input', () => {
    const targets = getSelectedMeshes();
    if (!targets.length) return;
    const v = num($(id));
    if (!Number.isFinite(v)) return;
    targets.forEach((mesh) => {
      if (!arch(mesh).rdm) arch(mesh).rdm = defaultRdm(mesh);
      apply(arch(mesh).rdm, v, mesh);
      analyzeMesh(mesh);
    });
    renderBeam();
  });
}
bindBeamInput('in-L', (r, v) => { if (v > 0) r.manual.L = v; });
bindBeamInput('in-b', (r, v) => { if (v > 0) r.manual.b = v; });
bindBeamInput('in-h', (r, v) => { if (v > 0) r.manual.h = v; });
bindBeamInput('in-q', (r, v) => { r.qDirect = Math.max(v, 0); });
bindBeamInput('in-strip', (r, v) => { r.strip = Math.max(v, 0); });
bindBeamInput('in-surf', (r, v) => { r.surf = Math.max(v, 0); });
bindBeamInput('in-F', (r, v) => { r.F = Math.max(v, 0); });
bindBeamInput('in-N', (r, v) => { r.N = Math.max(v, 0); });
bindBeamInput('in-e0', (r, v) => { r.e0 = Math.max(v, 0) / 100; }); // saisi en cm -> stocké en mètres
bindBeamInput('in-M', (r, v) => { r.M = Math.max(v, 0); });
bindBeamInput('in-slab-q', (r, v) => { r.slabQ = Math.max(v, 0); });
bindBeamInput('in-slab-g', (r, v) => { r.slabG = Math.max(v, 0); });
bindBeamInput('in-wall-n', (r, v) => { r.wallN = Math.max(v, 0); });
bindBeamInput('in-part-qh', (r, v) => { r.partQh = Math.max(v, 0); });
bindBeamInput('in-corb-F', (r, v) => { r.corbF = Math.max(v, 0); });

document.querySelectorAll('input[name="struct-type"]').forEach((rb) => rb.addEventListener('change', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  const structType = rb.value;
  const defScheme = {
    beam: 'ss',
    column: 'pin_pin',
    slab: 'four_sides',
    bearingwall: 'pin_pin',
    partition: 'top_bot',
    corbel: 'strut_tie'
  }[structType] || 'ss';

  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    arch(m).rdm.structType = structType;
    arch(m).rdm.scheme = defScheme;
    analyzeMesh(m);
  });
  syncBeamInputs();
  renderBeam();
  if (targets.length > 1) toast(`Rôle structural (${structType}) appliqué aux ${targets.length} éléments`, 'ok');
}));

$('beam-mat').addEventListener('change', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  const matId = $('beam-mat').value;
  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    arch(m).rdm.matId = matId;
    analyzeMesh(m);
  });
  renderBeam();
  if (targets.length > 1) toast(`Matériau porteur appliqué aux ${targets.length} éléments sélectionnés`);
});

$('beam-scheme').addEventListener('change', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  const scheme = $('beam-scheme').value;
  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    arch(m).rdm.scheme = scheme;
    analyzeMesh(m);
  });
  $('lbl-F').textContent = scheme === 'cant' ? 'Charge ponctuelle F (extrémité libre)' : 'Charge ponctuelle F (au centre)';
  renderBeam();
  if (targets.length > 1) toast(`Schéma statique appliqué aux ${targets.length} éléments sélectionnés`);
});

$('sel-nature').addEventListener('change', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  const nature = $('sel-nature').value;
  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    arch(m).rdm.nature = nature;
    analyzeMesh(m);
  });
  renderBeam();
  if (targets.length > 1) toast(`Nature structurelle appliquée aux ${targets.length} éléments sélectionnés`);
});

document.querySelectorAll('input[name="qmode"]').forEach((rb) => rb.addEventListener('change', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  const mode = rb.value;
  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    arch(m).rdm.qMode = mode;
    analyzeMesh(m);
  });
  $('q-direct').hidden = mode === 'strip';
  $('q-strip').hidden = mode !== 'strip';
  renderBeam();
}));

$('btn-dims-auto').addEventListener('click', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    arch(m).rdm.manual = {};
    analyzeMesh(m);
  });
  syncBeamInputs();
  renderBeam();
  if (targets.length > 1) toast(`Cotes automatiques appliquées aux ${targets.length} éléments sélectionnés`);
});

$('btn-swap-bh').addEventListener('click', () => {
  const targets = getSelectedMeshes();
  if (!targets.length) return;
  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    const r = arch(m).rdm;
    r.swap = !r.swap;
    r.manual.b = r.manual.h = undefined;
    delete r.manual.b;
    delete r.manual.h;
    analyzeMesh(m);
  });
  syncBeamInputs();
  renderBeam();
});

// Bouton explicite d'application groupée
$('btn-apply-batch')?.addEventListener('click', () => {
  const targets = getSelectedMeshes();
  if (targets.length <= 1) return;
  const sourceMesh = viewer.selected || targets[0];
  const sourceRdm = arch(sourceMesh).rdm;
  if (!sourceRdm) return;

  targets.forEach((m) => {
    if (!arch(m).rdm) arch(m).rdm = defaultRdm(m);
    const r = arch(m).rdm;
    r.structType = sourceRdm.structType;
    r.matId = sourceRdm.matId;
    r.scheme = sourceRdm.scheme;
    r.nature = sourceRdm.nature;
    r.qMode = sourceRdm.qMode;
    r.qDirect = sourceRdm.qDirect;
    r.strip = sourceRdm.strip;
    r.surf = sourceRdm.surf;
    r.F = sourceRdm.F;
    r.N = sourceRdm.N;
    r.e0 = sourceRdm.e0;
    r.M = sourceRdm.M;
    r.slabQ = sourceRdm.slabQ;
    r.slabG = sourceRdm.slabG;
    r.wallN = sourceRdm.wallN;
    r.partQh = sourceRdm.partQh;
    r.corbF = sourceRdm.corbF;
    analyzeMesh(m);
  });
  renderBeam();
  toast(`⚡ Réglages appliqués aux ${targets.length} éléments sélectionnés !`, { type: 'ok' });
});

window.addEventListener('resize', debounce(() => { const m = viewer.selected; if (m && state.mode === 'structure') drawBeamDiagram($('beam-canvas'), m.userData.rdmRes); }, 120));

/* ========================================================================== */
/*  Rendu 3D : visibilité, cartes de couleurs, légende                         */
/* ========================================================================== */
function refreshVisuals() {
  viewer.setVisibility((m) => !arch(m).hidden && !(state.roofHidden && arch(m).role === 'toit'));
  viewer.applyVisuals((m) => {
    const a = arch(m);
    if (state.mode === 'thermal') {
      if (!state.heatmap) return null;
      const wt = thermalOf(m);
      if (wt) return { rgb: P.colorForU(wt.U), glow: 0.2 };
      return { rgb: [0.3, 0.31, 0.35], opacity: 0.28, glow: 0 };
    }
    const isSelected = viewer.selectedList ? viewer.selectedList.includes(m) : (m === viewer.selected);
    const res = a.rdm ? m.userData.rdmRes : null;
    // La surbrillance et la couleur RDM ne s'affichent QUE sur les éléments actuellement sélectionnés
    // Dès qu'un élément n'est plus sélectionné, son animation/surbrillance disparaît immédiatement
    if (res && !res.error && (isSelected || state.structureHeatmap)) {
      const g = res.eta || 0;
      return { rgb: P.colorForRatio(g), glow: isSelected ? 0.3 : 0.1 };
    }
    if (state.ghost) return { rgb: [0.42, 0.44, 0.5], opacity: 0.16, glow: 0 };
    return null;
  });
  updateLegend();
  $('tb-heatmap').classList.toggle('active', state.heatmap);
  $('btn-heatmap').classList.toggle('active-state', state.heatmap);
  $('btn-heatmap').lastChild.textContent = state.heatmap ? ' Masquer la carte de chaleur' : ' Visualisation thermique 3D (carte de chaleur)';
  $('tb-roof').classList.toggle('active', state.roofHidden);
  $('tb-ghost').classList.toggle('active', state.ghost);
}

function gradientCss(stops, max) {
  return 'linear-gradient(90deg,' + stops.map(([t, c]) => `${P.cssRgb(c)} ${Math.min(t / max, 1) * 100}%`).join(',') + ')';
}

function updateLegend() {
  const lg = $('legend');
  const selectedCount = viewer.selectedList ? viewer.selectedList.length : (viewer.selected ? 1 : 0);
  const show = viewer.meshes().length && ((state.mode === 'thermal' && state.heatmap) || (state.mode === 'structure' && selectedCount > 0));
  lg.hidden = !show;
  if (!show) return;
  const ticks = $('legend-ticks');
  if (state.mode === 'thermal') {
    $('legend-title').textContent = 'Coefficient de transmission U (W/m²·K)';
    $('legend-bar').style.background = gradientCss(P.U_STOPS, 2.6);
    const t = [[0.1, '0,1'], [0.5, '0,5'], [1.0, '1,0'], [1.6, '1,6'], [2.6, '≥ 2,6']];
    ticks.innerHTML = t.map(([v, l]) => `<span style="left:${v / 2.6 * 100}%">${l}</span>`).join('');
  } else {
    $('legend-title').textContent = 'Taux gouvernant (σ/σadm ou f/(L/300))';
    $('legend-bar').style.background = gradientCss(P.RATIO_STOPS, 130);
    const t = [[0, '0'], [55, '55'], [80, '80'], [100, '100 %'], [130, '≥130']];
    ticks.innerHTML = t.map(([v, l]) => `<span style="left:${v / 130 * 100}%">${l}</span>`).join('');
  }
}

/* ========================================================================== */
/*  Modes, barre d'outils, clavier                                             */
/* ========================================================================== */
function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'structure') {
    analyzeAll();
    const m = viewer.selected;
    if (m && !arch(m).rdm) arch(m).rdm = defaultRdm(m);
  }
  renderAll(); renderListNow();
  status(mode === 'thermal' ? 'Module Thermique — ISO 6946 / ISO 13790.' : 'Module Structure / RDM — Euler-Bernoulli, Eurocodes.');
}
function toggleHeatmap() {
  if (state.mode !== 'thermal') setMode('thermal');
  state.heatmap = !state.heatmap;
  refreshVisuals();
  if (state.heatmap && !envelopeElements().length) toast('Aucune paroi n\'a de composition : assignez un rôle aux éléments pour colorer la carte.', 'warn');
}

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case '1': setMode('thermal'); break;
    case '2': setMode('structure'); break;
    case 'f': viewer.fit(); break;
    case 'h': toggleHeatmap(); break;
    case 'r': state.roofHidden = !state.roofHidden; refreshVisuals(); break;
    case 'escape': viewer.select(null); break;
    default: return;
  }
});

/* ========================================================================== */
/*  Chargement de maquettes                                                    */
/* ========================================================================== */
function busy(on, text) { $('busy').hidden = !on; if (text) $('busy-text').textContent = text; }

async function loadFiles(files) {
  if (!files || !files.length) return;
  busy(true, 'Chargement de la maquette…');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const { group, count } = await viewer.loadFiles(files);
    state.room.manual = false;
    state.modelName = group.name;
    const info = viewer.addImported(group);
    const sel = $('unit-select');
    if (info && sel && info.factor) {
      const opt = [...sel.options].find((o) => parseFloat(o.value) === info.factor);
      sel.value = opt ? opt.value : '1';
      toast(`${count} maillage(s) importé(s)` + (info.factor !== 1 ? ` — unité détectée : ${info.label} (modifiable à gauche).` : '.'), 'ok');
    } else {
      toast(`${count} maillage(s) importé(s).`, 'ok');
    }
    status(`Modèle importé : ${group.name}`);
  } catch (err) {
    console.error(err);
    toast(`Échec de l'import : ${err.message || err}`, 'err', 6000);
  } finally { busy(false); }
}

function generateTest() {
  state.room.manual = false;
  state.modelName = 'Maquette test — Pavillon';
  $('unit-select').value = '1';
  viewer.generateTestModel();
  const pick = state.mode === 'structure' ? 'Poutre porteuse 2' : 'Mur Nord';
  const mesh = viewer.meshes().find((m) => m.name.startsWith(pick));
  if (state.mode === 'structure') analyzeAll();
  if (mesh) viewer.select(mesh);
  toast('Maquette test générée : dalle, 4 murs, toiture, baie vitrée et 2 poutres porteuses.', 'ok');
  status('Maquette test prête.');
}


// Glisser-déposer
const wrap = $('viewport-wrap');
['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));
let dragDepth = 0;
wrap.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; });
wrap.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; } });
wrap.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true;
  loadFiles([...e.dataTransfer.files]);
});

/* ========================================================================== */
/*  Matériaux (modale d'édition)                                               */
/* ========================================================================== */
function renderMaterialTable() {
  const tb = $('materials-table').querySelector('tbody');
  const list = db.list();
  const cats = [...MATERIAL_CATEGORIES, ...new Set(list.map((m) => m.cat).filter((c) => !MATERIAL_CATEGORIES.includes(c)))];
  let html = '';
  for (const c of cats) {
    const group = list.filter((m) => m.cat === c);
    if (!group.length) continue;
    html += `<tr class="cat-row"><td colspan="9">${escapeHtml(c)}</td></tr>`;
    for (const m of group) {
      const catOpts = cats.map((x) => `<option ${x === m.cat ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('');
      const nin = (k, step) => `<td><input type="number" step="${step}" data-id="${m.id}" data-k="${k}" value="${m[k]}" aria-label="${k} de ${escapeHtml(m.name)}"></td>`;
      html += `<tr>
        <td><input type="text" data-id="${m.id}" data-k="name" value="${escapeHtml(m.name)}" aria-label="Nom"></td>
        <td><select data-id="${m.id}" data-k="cat" aria-label="Catégorie">${catOpts}</select></td>
        ${nin('lambda', 'any')}${nin('rho', 'any')}${nin('cp', 'any')}${nin('E', 'any')}${nin('sigma', 'any')}
        ${m.glaz ? `<td><input type="number" step="0.05" data-id="${m.id}" data-k="glazU" value="${m.glaz.U}" aria-label="Ug"></td>` : '<td class="na">—</td>'}
        <td>${m.custom ? `<button class="icon-btn" data-del="${m.id}" title="Supprimer" type="button">🗑</button>` : ''}</td>
      </tr>`;
    }
  }
  tb.innerHTML = html;
}

$('materials-table').addEventListener('input', (e) => {
  const el = e.target; const id = el.dataset.id, k = el.dataset.k;
  if (!id) return;
  if (k === 'name') db.update(id, { name: el.value || 'Sans nom' });
  else if (k === 'glazU') { const v = parseFloat(el.value); if (v > 0) db.update(id, { glaz: { ...db.get(id).glaz, U: v } }); }
  else { const v = parseFloat(el.value); if (Number.isFinite(v) && v >= 0) db.update(id, { [k]: v }); }
});
$('materials-table').addEventListener('change', (e) => {
  if (e.target.dataset.k === 'cat') { db.update(e.target.dataset.id, { cat: e.target.value }); renderMaterialTable(); }
});
$('materials-table').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  if (db.remove(b.dataset.del)) renderMaterialTable();
});
$('btn-materials').addEventListener('click', () => { renderMaterialTable(); $('materials-modal').hidden = false; });
const closeMaterials = () => { $('materials-modal').hidden = true; };
$('materials-close').addEventListener('click', closeMaterials);
$('mat-done').addEventListener('click', closeMaterials);
$('materials-modal').addEventListener('mousedown', (e) => { if (e.target === $('materials-modal')) closeMaterials(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('materials-modal').hidden) closeMaterials(); });
$('mat-add').addEventListener('click', () => {
  db.add({ name: 'Nouveau matériau' });
  renderMaterialTable();
  const body = document.querySelector('#materials-modal .modal-body'); body.scrollTop = body.scrollHeight;
  const inputs = [...document.querySelectorAll('#materials-table input[data-k="name"]')]; const last = inputs[inputs.length - 1];
  if (last) { last.focus(); last.select(); }
});
$('mat-reset').addEventListener('click', () => {
  if (!confirm('Réinitialiser toute la base aux valeurs par défaut ? Vos modifications et matériaux ajoutés seront perdus.')) return;
  db.resetDefaults(); renderMaterialTable();
});
$('mat-export').addEventListener('click', () => download('materiaux-archphysics.json', db.toJSON(), 'application/json'));
$('mat-import').addEventListener('click', () => $('mat-import-input').click());
$('mat-import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { const n = db.importJSON(await file.text()); renderMaterialTable(); toast(`${n} matériau(x) importé(s).`, 'ok'); }
  catch (err) { toast('Fichier JSON invalide.', 'err'); }
});

function refreshMaterialSelects() {
  for (let i = 0; i < 3; i++) fillMatSelect($(`layer-mat-${i}`), { allowEmpty: true });
  fillMatSelect($('beam-mat'), { ids: STRUCTURAL_IDS });
  const m = viewer.selected;
  if (m) { syncThermalInputs(); if (arch(m).rdm) $('beam-mat').value = arch(m).rdm.matId; }
}
refreshMaterialSelects();
db.onChange(() => {
  refreshMaterialSelects();
  if (state.mode === 'structure') analyzeAll();
  renderThermal(); renderBeam(); refreshVisuals(); renderList();
});

/* ========================================================================== */
/*  Note de calcul                                                             */
/* ========================================================================== */
function collectReportData() {
  analyzeAll();
  const bal = computeBalance();
  const elements = [];
  const usedMats = new Set();
  for (const m of viewer.meshes()) {
    const a = arch(m), wt = thermalOf(m);
    if (!wt) continue;
    const mt = metrics(m);
    a.layers.forEach((l) => l.mat && usedMats.add(l.mat));
    elements.push({
      name: m.name, role: a.role, roleLabel: P.ROLES[a.role].label, L: mt.L, W: mt.W, T: mt.T,
      A: areaOf(m), b: a.b, wt, layers: a.layers.filter((l) => l.mat).map((l) => ({ ...l }))
    });
  }
  const beams = [];
  for (const m of viewer.meshes()) {
    const a = arch(m), res = m.userData.rdmRes;
    if (!a.rdm || !res || res.error) continue;
    usedMats.add(a.rdm.matId);
    const c = document.createElement('canvas');
    drawBeamDiagram(c, res, { width: 680, height: 340, dpr: 2, theme: 'light' });
    const mat = db.get(a.rdm.matId);
    beams.push({ name: m.name, res, mat, rdm: { ...a.rdm }, q: qOf(a.rdm), chart: c.toDataURL('image/png') });
  }
  let snapshot = '';
  try { snapshot = viewer.meshes().length ? viewer.snapshot() : ''; } catch (_) { /* ignore */ }
  return {
    project: state.modelName || 'Sans titre',
    date: new Date(),
    climate: { ...state.climate },
    room: { ...state.room },
    balance: bal,
    elements, beams, snapshot,
    materials: [...usedMats].map((id) => db.get(id)).filter(Boolean)
  };
}

async function exportReport(kind) {
  $('export-menu').hidden = true;
  $('btn-export').setAttribute('aria-expanded', 'false');
  if (!viewer.meshes().length) { toast('Chargez ou générez une maquette avant d\'exporter la note de calcul.', 'warn'); return; }
  busy(true, 'Génération de la note de calcul…');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const html = buildReport(collectReportData());
    const name = `Note-de-calcul-${(state.modelName || 'ArchPhysics').replace(/[^\w\-]+/g, '_')}.html`;
    const api = window.archAPI;
    if (api) {
      if (kind === 'preview') await api.previewReport(html);
      else if (kind === 'pdf') { const r = await api.saveReportPdf(html, name); if (r.ok) toast(`PDF enregistré : ${r.filePath}`, 'ok', 6000); }
      else { const r = await api.saveReportHtml(html, name); if (r.ok) toast(`Note enregistrée : ${r.filePath}`, 'ok', 6000); }
    } else if (kind === 'html') {
      download(name, html, 'text/html');
    } else {
      const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
      if (!w) download(name, html, 'text/html');
    }
  } catch (err) {
    console.error(err); toast(`Échec de l'export : ${err.message || err}`, 'err', 6000);
  } finally { busy(false); }
}

export function initModuleListeners() {
  // Mode switcher
  document.querySelectorAll('.mode-btn').forEach((b) => {
    if (b.dataset.physBound) return;
    b.dataset.physBound = 'true';
    b.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Module :', b.dataset.mode);
      setMode(b.dataset.mode);
    });
  });

  // Top Actions & Exports
  const btnExport = $('btn-export');
  if (btnExport && !btnExport.dataset.physBound) {
    btnExport.dataset.physBound = 'true';
    btnExport.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Bouton cliqué : [ArchPhysics] Menu Exporter Note de Calcul');
      const m = $('export-menu');
      if (m) {
        m.hidden = !m.hidden;
        btnExport.setAttribute('aria-expanded', String(!m.hidden));
      }
    });
  }

  const expPreview = $('export-preview');
  if (expPreview && !expPreview.dataset.physBound) {
    expPreview.dataset.physBound = 'true';
    expPreview.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Note de Calcul - Aperçu & impression');
      exportReport('preview');
    });
  }

  const expPdf = $('export-pdf');
  if (expPdf && !expPdf.dataset.physBound) {
    expPdf.dataset.physBound = 'true';
    expPdf.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Note de Calcul - Enregistrer en PDF');
      exportReport('pdf');
    });
  }

  const expHtml = $('export-html');
  if (expHtml && !expHtml.dataset.physBound) {
    expHtml.dataset.physBound = 'true';
    expHtml.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Note de Calcul - Enregistrer en HTML');
      exportReport('html');
    });
  }

  // Model Import & Test Model
  const btnTestModel = $('btn-test-model');
  if (btnTestModel && !btnTestModel.dataset.physBound) {
    btnTestModel.dataset.physBound = 'true';
    btnTestModel.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Générer Maquette Test');
      generateTest();
    });
  }

  const emptyTest = $('empty-test');
  if (emptyTest && !emptyTest.dataset.physBound) {
    emptyTest.dataset.physBound = 'true';
    emptyTest.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Générer Maquette Test');
      generateTest();
    });
  }

  const btnImport = $('btn-import');
  if (btnImport && !btnImport.dataset.physBound) {
    btnImport.dataset.physBound = 'true';
    btnImport.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Importer un fichier 3D');
      $('file-input')?.click();
    });
  }

  const emptyImport = $('empty-import');
  if (emptyImport && !emptyImport.dataset.physBound) {
    emptyImport.dataset.physBound = 'true';
    emptyImport.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Importer un fichier 3D');
      $('file-input')?.click();
    });
  }

  const fileInput = $('file-input');
  if (fileInput && !fileInput.dataset.physBound) {
    fileInput.dataset.physBound = 'true';
    fileInput.addEventListener('change', (e) => {
      loadFiles([...e.target.files]);
      e.target.value = '';
    });
  }

  const unitSelect = $('unit-select');
  if (unitSelect && !unitSelect.dataset.physBound) {
    unitSelect.dataset.physBound = 'true';
    unitSelect.addEventListener('change', () => {
      if (!viewer.meshes().length) return;
      viewer.applyUnit(parseFloat(unitSelect.value));
      viewer.fit();
    });
  }

  // Viewport Toolbar Controls
  const tbHeatmap = $('tb-heatmap');
  if (tbHeatmap && !tbHeatmap.dataset.physBound) {
    tbHeatmap.dataset.physBound = 'true';
    tbHeatmap.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Carte thermique 3D');
      toggleHeatmap();
    });
  }

  const btnHeatmap = $('btn-heatmap');
  if (btnHeatmap && !btnHeatmap.dataset.physBound) {
    btnHeatmap.dataset.physBound = 'true';
    btnHeatmap.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Carte thermique 3D');
      toggleHeatmap();
    });
  }

  const tbGhost = $('tb-ghost');
  if (tbGhost && !tbGhost.dataset.physBound) {
    tbGhost.dataset.physBound = 'true';
    tbGhost.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Isoler la structure');
      state.ghost = !state.ghost;
      refreshVisuals();
    });
  }

  const tbRoof = $('tb-roof');
  if (tbRoof && !tbRoof.dataset.physBound) {
    tbRoof.dataset.physBound = 'true';
    tbRoof.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Toiture (visibilité)');
      state.roofHidden = !state.roofHidden;
      refreshVisuals();
    });
  }

  const tbEdges = $('tb-edges');
  if (tbEdges && !tbEdges.dataset.physBound) {
    tbEdges.dataset.physBound = 'true';
    tbEdges.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Arêtes (visibilité)');
      const on = !viewer.edgesOn;
      viewer.setEdges(on);
      tbEdges.classList.toggle('active', on);
    });
  }

  const tbGrid = $('tb-grid');
  if (tbGrid && !tbGrid.dataset.physBound) {
    tbGrid.dataset.physBound = 'true';
    tbGrid.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Grille (visibilité)');
      const on = !viewer.grid.visible;
      viewer.setGrid(on);
      tbGrid.classList.toggle('active', on);
    });
  }

  const tbFit = $('tb-fit');
  if (tbFit && !tbFit.dataset.physBound) {
    tbFit.dataset.physBound = 'true';
    tbFit.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Cadrer le modèle (F)');
      viewer.fit();
    });
  }

  document.querySelectorAll('[data-view]').forEach((b) => {
    if (b.dataset.physBound) return;
    b.dataset.physBound = 'true';
    b.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Vue caméra :', b.dataset.view);
      viewer.setView(b.dataset.view);
    });
  });

  // Materials Modal
  const btnMaterials = $('btn-materials');
  if (btnMaterials && !btnMaterials.dataset.physBound) {
    btnMaterials.dataset.physBound = 'true';
    btnMaterials.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Base Matériaux');
      renderMaterialTable();
      const mm = $('materials-modal');
      if (mm) mm.hidden = false;
    });
  }

  const matClose = $('materials-close');
  if (matClose && !matClose.dataset.physBound) {
    matClose.dataset.physBound = 'true';
    matClose.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Fermer Matériaux');
      closeMaterials();
    });
  }

  const matDone = $('mat-done');
  if (matDone && !matDone.dataset.physBound) {
    matDone.dataset.physBound = 'true';
    matDone.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Terminer Matériaux');
      closeMaterials();
    });
  }

  const matAdd = $('mat-add');
  if (matAdd && !matAdd.dataset.physBound) {
    matAdd.dataset.physBound = 'true';
    matAdd.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Ajouter matériau');
      db.add({ name: 'Nouveau matériau' });
      renderMaterialTable();
      const body = document.querySelector('#materials-modal .modal-body');
      if (body) body.scrollTop = body.scrollHeight;
      const inputs = [...document.querySelectorAll('#materials-table input[data-k="name"]')];
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    });
  }

  const matReset = $('mat-reset');
  if (matReset && !matReset.dataset.physBound) {
    matReset.dataset.physBound = 'true';
    matReset.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Réinitialiser matériaux');
      if (!confirm('Réinitialiser toute la base aux valeurs par défaut ? Vos modifications et matériaux ajoutés seront perdus.')) return;
      db.resetDefaults();
      renderMaterialTable();
    });
  }

  const matExport = $('mat-export');
  if (matExport && !matExport.dataset.physBound) {
    matExport.dataset.physBound = 'true';
    matExport.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Exporter matériaux');
      download('materiaux-archphysics.json', db.toJSON(), 'application/json');
    });
  }

  const matImport = $('mat-import');
  if (matImport && !matImport.dataset.physBound) {
    matImport.dataset.physBound = 'true';
    matImport.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Importer matériaux');
      $('mat-import-input')?.click();
    });
  }

  const matImportInput = $('mat-import-input');
  if (matImportInput && !matImportInput.dataset.physBound) {
    matImportInput.dataset.physBound = 'true';
    matImportInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const n = db.importJSON(await file.text());
        renderMaterialTable();
        toast(`${n} matériau(x) importé(s).`, 'ok');
      } catch (err) {
        toast('Fichier JSON invalide.', 'err');
      }
    });
  }

  // Thermal Panel Buttons
  const btnAreaAuto = $('btn-area-auto');
  if (btnAreaAuto && !btnAreaAuto.dataset.physBound) {
    btnAreaAuto.dataset.physBound = 'true';
    btnAreaAuto.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Surface auto');
      const mesh = viewer.selected;
      if (!mesh) return;
      arch(mesh).areaOverride = null;
      syncThermalInputs();
      renderThermal();
    });
  }

  const btnApplyRole = $('btn-apply-role');
  if (btnApplyRole && !btnApplyRole.dataset.physBound) {
    btnApplyRole.dataset.physBound = 'true';
    btnApplyRole.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Appliquer composition au rôle');
      const mesh = viewer.selected;
      if (!mesh) return;
      const a = arch(mesh);
      let n = 0;
      viewer.meshes().forEach((m) => {
        const x = arch(m);
        if (x !== a && x.role === a.role) {
          x.layers = cloneLayers(a.layers);
          n++;
        }
      });
      toast(`Composition appliquée à ${n} autre(s) élément(s) « ${P.ROLES[a.role].label} ».`, 'ok');
      renderThermal();
      refreshVisuals();
      renderList();
    });
  }

  const btnDetectRoom = $('btn-detect-room');
  if (btnDetectRoom && !btnDetectRoom.dataset.physBound) {
    btnDetectRoom.dataset.physBound = 'true';
    btnDetectRoom.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] Détecter volume thermique');
      state.room.manual = false;
      detectRoom(true);
      renderBalance();
    });
  }

  // RDM Structure Buttons
  const btnDimsAuto = $('btn-dims-auto');
  if (btnDimsAuto && !btnDimsAuto.dataset.physBound) {
    btnDimsAuto.dataset.physBound = 'true';
    btnDimsAuto.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] RDM Cotes auto');
      const m = viewer.selected;
      if (!m) return;
      arch(m).rdm.manual = {};
      syncBeamInputs();
      renderBeam();
    });
  }

  const btnSwapBh = $('btn-swap-bh');
  if (btnSwapBh && !btnSwapBh.dataset.physBound) {
    btnSwapBh.dataset.physBound = 'true';
    btnSwapBh.addEventListener('click', () => {
      console.log('Bouton cliqué : [ArchPhysics] RDM Inverser b/h');
      const m = viewer.selected;
      if (!m) return;
      const r = arch(m).rdm;
      r.swap = !r.swap;
      r.manual.b = r.manual.h = undefined;
      delete r.manual.b;
      delete r.manual.h;
      syncBeamInputs();
      renderBeam();
    });
  }
}

// Close export menu when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) {
    const em = $('export-menu');
    if (em) em.hidden = true;
  }
});

/* ========================================================================== */
/*  Initialisation                                                             */
/* ========================================================================== */
function startArchPhysics() {
  const empty = $('empty-state');
  if (empty) empty.hidden = false;
  renderBalance();
  status('Prêt — générez la maquette test ou importez un fichier 3D.');
  initModuleListeners();

  if (typeof viewer !== 'undefined' && viewer) {
    viewer.resize();
    viewer.invalidate();
    if (viewer.isStudioActive && !viewer.animId) viewer.start();
  }

  if (window.__pendingPhysicsModel && typeof loadFiles === 'function') {
    const file = window.__pendingPhysicsModel;
    window.__pendingPhysicsModel = null;
    loadFiles([file]);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startArchPhysics);
} else {
  startArchPhysics();
}

// Hooks globaux de test / débogage
window.viewer = viewer;
window.initModuleListeners = initModuleListeners;
window.generateTest = generateTest;
window.exportReport = exportReport;
window.loadFiles = loadFiles;
window.setMode = setMode;
window.toggleHeatmap = toggleHeatmap;
window.__arch = {
  state, db, viewer, arch, analyzeAll, collectReportData, buildReport,
  setMode, generateTest, computeBalance, exportReport, loadFiles, toggleHeatmap, initModuleListeners
};


// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & INCOMING 3D MODEL HANDLER
// -----------------------------------------------------------------------------

window.addEventListener('message', async (e) => {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.type === 'ARCHFORGE_REINIT_LISTENERS') {
    console.log('[ArchPhysics] Re-initializing module event listeners via Hub request.');
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
