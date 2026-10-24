/**
 * Maquette Slicer Studio - Main Application Controller
 * Architecture & Fabrication
 */

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

import { StudioViewport } from './view3d/viewport.js';
import { SlicerEngine } from './geometry/slicer.js';
import { ModelPresets } from './geometry/samples.js';
import { SheetPacker } from './view2d/sheetPacker.js';
import { SheetRenderer } from './view2d/sheetRenderer.js';
import { SvgExporter } from './export/svgExporter.js';
import { PdfExporter } from './export/pdfExporter.js';

// Electron IPC Bridge (if available)
let ipcRenderer = null;
try {
  if (typeof window !== 'undefined' && window.require) {
    const electron = window.require('electron');
    ipcRenderer = electron.ipcRenderer;
  }
} catch (e) {
  console.log("Running in standard browser environment or context isolation.");
}

class MaquetteApp {
  constructor() {
    // State
    this.sourceUnit = 'm';
    this.scale = 200;
    this.materialThickness = 1.5;
    this.materialStyle = 'kraft';
    this.currentPreset = 'topo';
    this.currentMesh = null;
    this.slicingResult = null;
    this.packedResult = null;
    this.selectedSheetFormat = 'A3';

    // Animation state
    this.isPlayingStack = false;
    this.playInterval = null;

    // Initialize Viewport and 2D Renderer
    const viewportContainer = document.getElementById('three-canvas-container');
    this.viewport = new StudioViewport(viewportContainer);

    const twodCanvas = document.getElementById('twod-canvas');
    this.sheetRenderer = new SheetRenderer(twodCanvas);

    this.bindUI();
    if (window.__pendingModel) {
      const pm = window.__pendingModel;
      window.__pendingModel = null;
      if (pm.ext === '.glb' || pm.ext === '.gltf') {
        this.loadModelFromBuffer(pm.buffer, pm.ext, pm.name);
      } else {
        const blob = new Blob([pm.buffer], { type: 'application/octet-stream' });
        const file = new File([blob], pm.name);
        this.loadUserFile(file);
      }
    } else {
      this.loadPreset('topo');
    }
  }

  switchViewMode(mode) {
    const tabPhys = document.getElementById('tab-mode-phys');
    const tabOrig = document.getElementById('tab-mode-orig');
    const tab2D = document.getElementById('tab-mode-2d');

    const twodContainer = document.getElementById('twod-sheet-container');
    const threedControls = document.getElementById('viewport-3d-controls');

    if (tabPhys) tabPhys.classList.toggle('active', mode === 'physical');
    if (tabOrig) tabOrig.classList.toggle('active', mode === 'original');
    if (tab2D) tab2D.classList.toggle('active', mode === '2d');

    if (mode === '2d') {
      if (twodContainer) twodContainer.style.display = 'block';
      if (threedControls) threedControls.style.display = 'none';
      if (this.sheetRenderer) this.sheetRenderer.render();
    } else {
      if (twodContainer) twodContainer.style.display = 'none';
      if (threedControls) threedControls.style.display = 'flex';
      if (this.viewport) this.viewport.setViewMode(mode);
    }
  }

  bindUI() {
    this.initModuleListeners();
  }

  initModuleListeners() {
    // 1. View Mode Tabs (Header)
    const tabPhys = document.getElementById('tab-mode-phys');
    const tabOrig = document.getElementById('tab-mode-orig');
    const tab2D = document.getElementById('tab-mode-2d');

    if (tabPhys && !tabPhys.dataset.slicBound) {
      tabPhys.dataset.slicBound = 'true';
      tabPhys.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Mode Maquette Physique 3D');
        this.switchViewMode('physical');
      });
    }
    if (tabOrig && !tabOrig.dataset.slicBound) {
      tabOrig.dataset.slicBound = 'true';
      tabOrig.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Mode Modèle 3D Source');
        this.switchViewMode('original');
      });
    }
    if (tab2D && !tab2D.dataset.slicBound) {
      tab2D.dataset.slicBound = 'true';
      tab2D.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Mode Planches Découpe 2D');
        this.switchViewMode('2d');
      });
    }

    // 2. Presets Selection
    const btnTopo = document.getElementById('preset-topo');
    const btnVilla = document.getElementById('preset-villa');
    const btnAmphi = document.getElementById('preset-amphi');

    if (btnTopo && !btnTopo.dataset.slicBound) {
      btnTopo.dataset.slicBound = 'true';
      btnTopo.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Preset Colline Relief');
        this.loadPreset('topo');
      });
    }
    if (btnVilla && !btnVilla.dataset.slicBound) {
      btnVilla.dataset.slicBound = 'true';
      btnVilla.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Preset Villa Gradins');
        this.loadPreset('villa');
      });
    }
    if (btnAmphi && !btnAmphi.dataset.slicBound) {
      btnAmphi.dataset.slicBound = 'true';
      btnAmphi.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Preset Amphithéâtre');
        this.loadPreset('amphi');
      });
    }
    const btnPavilion = document.getElementById('preset-pavilion');
    if (btnPavilion && !btnPavilion.dataset.slicBound) {
      btnPavilion.dataset.slicBound = 'true';
      btnPavilion.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Preset Pavillon Sculptural');
        this.loadPreset('pavilion');
      });
    }

    // 3. File Dropzone & Browse
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const linkBrowse = document.getElementById('link-browse');

    if (dropzone && !dropzone.dataset.slicBound) {
      dropzone.dataset.slicBound = 'true';
      dropzone.addEventListener('click', (e) => {
        if (e.target !== linkBrowse) {
          console.log('Bouton cliqué : [Maquette Slicer] Dropzone Import 3D');
          this.openFilePicker();
        }
      });
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          console.log('Fichier déposé : [Maquette Slicer]', e.dataTransfer.files[0].name);
          this.loadUserFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (linkBrowse && !linkBrowse.dataset.slicBound) {
      linkBrowse.dataset.slicBound = 'true';
      linkBrowse.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Bouton cliqué : [Maquette Slicer] Parcourir fichiers 3D');
        this.openFilePicker();
      });
    }

    if (fileInput && !fileInput.dataset.slicBound) {
      fileInput.dataset.slicBound = 'true';
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          console.log('Fichier sélectionné : [Maquette Slicer]', e.target.files[0].name);
          this.loadUserFile(e.target.files[0]);
        }
      });
    }

    // 4. Source Unit Selector
    const unitButtons = document.querySelectorAll('[data-unit]');
    unitButtons.forEach(btn => {
      if (btn.dataset.slicBound) return;
      btn.dataset.slicBound = 'true';
      btn.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Unité :', btn.dataset.unit);
        unitButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.sourceUnit = btn.dataset.unit;

        const labels = { 'm': 'Mètres (m)', 'cm': 'Centimètres (cm)', 'mm': 'Millimètres (mm)' };
        const lbl = document.getElementById('unit-label');
        if (lbl) lbl.textContent = labels[this.sourceUnit] || this.sourceUnit;

        this.updateLiveCalculations();
      });
    });

    // 5. Scale Selector & Custom Input
    const scaleButtons = document.querySelectorAll('[data-scale]');
    const customScaleInput = document.getElementById('custom-scale-input');
    const scaleBadge = document.getElementById('scale-badge');
    const summaryScaleTag = document.getElementById('summary-scale-tag');
    const pillScale = document.getElementById('pill-scale');

    scaleButtons.forEach(btn => {
      if (btn.dataset.slicBound) return;
      btn.dataset.slicBound = 'true';
      btn.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Échelle 1:' + btn.dataset.scale);
        scaleButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.scale = parseFloat(btn.dataset.scale);
        if (customScaleInput) customScaleInput.value = this.scale;
        if (scaleBadge) scaleBadge.textContent = `1:${this.scale}`;
        if (summaryScaleTag) summaryScaleTag.textContent = `1:${this.scale}`;
        if (pillScale) pillScale.textContent = `1:${this.scale}`;
        this.updateLiveCalculations();
      });
    });

    if (customScaleInput && !customScaleInput.dataset.slicBound) {
      customScaleInput.dataset.slicBound = 'true';
      customScaleInput.addEventListener('input', () => {
        const val = parseFloat(customScaleInput.value);
        if (val > 0) {
          this.scale = val;
          scaleButtons.forEach(b => b.classList.toggle('active', parseFloat(b.dataset.scale) === val));
          if (scaleBadge) scaleBadge.textContent = `1:${this.scale}`;
          if (summaryScaleTag) summaryScaleTag.textContent = `1:${this.scale}`;
          if (pillScale) pillScale.textContent = `1:${this.scale}`;
          this.updateLiveCalculations();
        }
      });
    }

    // 6. Thickness Selector & Custom Input
    const thickButtons = document.querySelectorAll('[data-thick]');
    const customThickInput = document.getElementById('custom-thick-input');
    const thicknessBadge = document.getElementById('thickness-badge');
    const pillThick = document.getElementById('pill-thick');

    thickButtons.forEach(btn => {
      if (btn.dataset.slicBound) return;
      btn.dataset.slicBound = 'true';
      btn.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Épaisseur ' + btn.dataset.thick + ' mm');
        thickButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.materialThickness = parseFloat(btn.dataset.thick);
        if (customThickInput) customThickInput.value = this.materialThickness;
        if (thicknessBadge) thicknessBadge.textContent = `${this.materialThickness} mm`;
        if (pillThick) pillThick.textContent = `${this.materialThickness} mm`;
        this.updateLiveCalculations();
      });
    });

    if (customThickInput && !customThickInput.dataset.slicBound) {
      customThickInput.dataset.slicBound = 'true';
      customThickInput.addEventListener('input', () => {
        const val = parseFloat(customThickInput.value);
        if (val > 0) {
          this.materialThickness = val;
          thickButtons.forEach(b => b.classList.toggle('active', parseFloat(b.dataset.thick) === val));
          if (thicknessBadge) thicknessBadge.textContent = `${this.materialThickness} mm`;
          if (pillThick) pillThick.textContent = `${this.materialThickness} mm`;
          this.updateLiveCalculations();
        }
      });
    }

    // 7. Re-Slice Button
    const btnReSlice = document.getElementById('btn-re-slice');
    if (btnReSlice && !btnReSlice.dataset.slicBound) {
      btnReSlice.dataset.slicBound = 'true';
      btnReSlice.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Calculer & Découper');
        this.performSlicing();
      });
    }

    // 8. Material Style Selector (Kraft, Balsa, Museum)
    const matButtons = document.querySelectorAll('[data-mat]');
    matButtons.forEach(btn => {
      if (btn.dataset.slicBound) return;
      btn.dataset.slicBound = 'true';
      btn.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Matériau :', btn.dataset.mat);
        matButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.materialStyle = btn.dataset.mat;
        if (this.viewport) this.viewport.setMaterialStyle(this.materialStyle);
      });
    });

    // 9. Layer Inspection Slider & Play/Pause
    const layerSlider = document.getElementById('layer-slider');
    const layerSliderVal = document.getElementById('layer-slider-val');
    const btnPlayStack = document.getElementById('btn-play-stack');
    const isolateToggle = document.getElementById('isolate-toggle');

    const updateLayerInspection = () => {
      if (!layerSlider) return;
      const maxVal = parseInt(layerSlider.value, 10);
      const total = parseInt(layerSlider.max, 10);
      const isIsolated = isolateToggle ? isolateToggle.checked : false;

      if (layerSliderVal) {
        if (maxVal >= total && !isIsolated) {
          layerSliderVal.textContent = `Toutes les couches (${total}/${total})`;
        } else {
          layerSliderVal.textContent = isIsolated
            ? `Couche isolée : #${String(maxVal).padStart(2, '0')}`
            : `Couches 1 à ${maxVal} (${maxVal}/${total})`;
        }
      }

      if (this.viewport) this.viewport.setLayerInspection(maxVal - 1, maxVal - 1, isIsolated);
    };

    if (layerSlider && !layerSlider.dataset.slicBound) {
      layerSlider.dataset.slicBound = 'true';
      layerSlider.addEventListener('input', updateLayerInspection);
    }
    if (isolateToggle && !isolateToggle.dataset.slicBound) {
      isolateToggle.dataset.slicBound = 'true';
      isolateToggle.addEventListener('change', updateLayerInspection);
    }

    if (btnPlayStack && !btnPlayStack.dataset.slicBound) {
      btnPlayStack.dataset.slicBound = 'true';
      btnPlayStack.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Animer empilement strates');
        if (this.isPlayingStack) {
          this.stopStackAnimation();
        } else {
          this.startStackAnimation();
        }
      });
    }

    // 10. Exploded View Slider
    const explodedSlider = document.getElementById('exploded-slider');
    const explodedSliderVal = document.getElementById('exploded-slider-val');

    if (explodedSlider && !explodedSlider.dataset.slicBound) {
      explodedSlider.dataset.slicBound = 'true';
      explodedSlider.addEventListener('input', () => {
        const gap = parseFloat(explodedSlider.value);
        if (explodedSliderVal) explodedSliderVal.textContent = `${gap.toFixed(1)} mm`;
        if (this.viewport) this.viewport.setExplodedGap(gap);
      });
    }

    // 11. Viewport 3D Camera Shortcuts
    const btnViewIso = document.getElementById('btn-view-iso');
    const btnViewTop = document.getElementById('btn-view-top');
    const btnViewFront = document.getElementById('btn-view-front');
    const btnViewFocus = document.getElementById('btn-view-focus');

    if (btnViewIso && !btnViewIso.dataset.slicBound) {
      btnViewIso.dataset.slicBound = 'true';
      btnViewIso.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Caméra Vue Isométrique');
        if (this.viewport) {
          this.viewport.camera.position.set(250, 180, 250);
          this.viewport.controls.target.set(0, 30, 0);
          this.viewport.controls.update();
        }
      });
    }

    if (btnViewTop && !btnViewTop.dataset.slicBound) {
      btnViewTop.dataset.slicBound = 'true';
      btnViewTop.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Caméra Vue du Dessus');
        if (this.viewport) {
          this.viewport.camera.position.set(0, 350, 0.1);
          this.viewport.controls.target.set(0, 0, 0);
          this.viewport.controls.update();
        }
      });
    }

    if (btnViewFront && !btnViewFront.dataset.slicBound) {
      btnViewFront.dataset.slicBound = 'true';
      btnViewFront.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Caméra Vue de Face');
        if (this.viewport) {
          this.viewport.camera.position.set(0, 30, 320);
          this.viewport.controls.target.set(0, 30, 0);
          this.viewport.controls.update();
        }
      });
    }

    if (btnViewFocus && !btnViewFocus.dataset.slicBound) {
      btnViewFocus.dataset.slicBound = 'true';
      btnViewFocus.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Caméra Cadrer la maquette');
        if (this.viewport) this.viewport.focusModel();
      });
    }

    // 12. 2D Sheet Format Selector & Controls
    const sheetFormatSelect = document.getElementById('sheet-format-select');
    if (sheetFormatSelect && !sheetFormatSelect.dataset.slicBound) {
      sheetFormatSelect.dataset.slicBound = 'true';
      sheetFormatSelect.addEventListener('change', () => {
        console.log('Format planche changé : [Maquette Slicer]', sheetFormatSelect.value);
        this.selectedSheetFormat = sheetFormatSelect.value;
        this.repackSheets();
      });
    }

    const btnPrevSheet = document.getElementById('btn-prev-sheet');
    const btnNextSheet = document.getElementById('btn-next-sheet');
    const btnFitSheet = document.getElementById('btn-fit-sheet');

    if (btnPrevSheet && !btnPrevSheet.dataset.slicBound) {
      btnPrevSheet.dataset.slicBound = 'true';
      btnPrevSheet.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Planche précédente');
        if (this.packedResult && this.sheetRenderer.currentSheetIndex > 0) {
          this.sheetRenderer.setSheetIndex(this.sheetRenderer.currentSheetIndex - 1);
          this.updateSheetPageIndicator();
        }
      });
    }

    if (btnNextSheet && !btnNextSheet.dataset.slicBound) {
      btnNextSheet.dataset.slicBound = 'true';
      btnNextSheet.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Planche suivante');
        if (this.packedResult && this.sheetRenderer.currentSheetIndex < this.packedResult.sheets.length - 1) {
          this.sheetRenderer.setSheetIndex(this.sheetRenderer.currentSheetIndex + 1);
          this.updateSheetPageIndicator();
        }
      });
    }

    if (btnFitSheet && !btnFitSheet.dataset.slicBound) {
      btnFitSheet.dataset.slicBound = 'true';
      btnFitSheet.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Recadrer la planche 2D');
        if (this.sheetRenderer) {
          this.sheetRenderer.fitToScreen();
          this.sheetRenderer.render();
        }
      });
    }

    // 2D Layer Toggles
    const toggleCut = document.getElementById('toggle-layer-cut');
    const toggleGuides = document.getElementById('toggle-layer-guides');
    const toggleLabels = document.getElementById('toggle-layer-labels');

    if (toggleCut && !toggleCut.dataset.slicBound) {
      toggleCut.dataset.slicBound = 'true';
      toggleCut.addEventListener('change', () => {
        if (this.sheetRenderer) {
          this.sheetRenderer.showCutLines = toggleCut.checked;
          this.sheetRenderer.render();
        }
      });
    }

    if (toggleGuides && !toggleGuides.dataset.slicBound) {
      toggleGuides.dataset.slicBound = 'true';
      toggleGuides.addEventListener('change', () => {
        if (this.sheetRenderer) {
          this.sheetRenderer.showGuides = toggleGuides.checked;
          this.sheetRenderer.render();
        }
      });
    }

    if (toggleLabels && !toggleLabels.dataset.slicBound) {
      toggleLabels.dataset.slicBound = 'true';
      toggleLabels.addEventListener('change', () => {
        if (this.sheetRenderer) {
          this.sheetRenderer.showLabels = toggleLabels.checked;
          this.sheetRenderer.render();
        }
      });
    }

    // 13. Export Buttons
    const btnExportSvg = document.getElementById('btn-export-svg');
    if (btnExportSvg && !btnExportSvg.dataset.slicBound) {
      btnExportSvg.dataset.slicBound = 'true';
      btnExportSvg.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Export SVG');
        this.exportSVG();
      });
    }

    const btnExportPdfZip = document.getElementById('btn-export-pdf-zip');
    if (btnExportPdfZip && !btnExportPdfZip.dataset.slicBound) {
      btnExportPdfZip.dataset.slicBound = 'true';
      btnExportPdfZip.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Export Planches PDF (.ZIP)');
        this.exportPdfZip();
      });
    }

    const btnExportSheetPdf = document.getElementById('btn-export-sheet-pdf');
    if (btnExportSheetPdf && !btnExportSheetPdf.dataset.slicBound) {
      btnExportSheetPdf.dataset.slicBound = 'true';
      btnExportSheetPdf.addEventListener('click', () => {
        console.log('Bouton cliqué : [Maquette Slicer] Export PDF Planche Active');
        this.exportSinglePdf();
      });
    }
  }

  /**
   * Load Built-in Presets
   */
  loadPreset(type) {
    this.currentPreset = type;
    document.getElementById('preset-topo').classList.toggle('active', type === 'topo');
    document.getElementById('preset-villa').classList.toggle('active', type === 'villa');
    document.getElementById('preset-amphi').classList.toggle('active', type === 'amphi');
    const pPav = document.getElementById('preset-pavilion');
    if (pPav) pPav.classList.toggle('active', type === 'pavilion');

    let mesh;
    let name;

    if (type === 'villa') {
      mesh = ModelPresets.createArchitecturalVilla();
      name = "Villa Contemporaine";
      this.sourceUnit = 'm';
      this.scale = 100;
      this.materialThickness = 2.0;
    } else if (type === 'amphi') {
      mesh = ModelPresets.createAmphitheater();
      name = "Amphithéâtre Urbain";
      this.sourceUnit = 'm';
      this.scale = 100;
      this.materialThickness = 1.5;
    } else if (type === 'pavilion') {
      mesh = ModelPresets.createParametricPavilion();
      name = "Pavillon Paramétrique";
      this.sourceUnit = 'm';
      this.scale = 100;
      this.materialThickness = 1.5;
    } else {
      mesh = ModelPresets.createTopography();
      name = "Topographie & Relief";
      this.sourceUnit = 'm';
      this.scale = 200;
      this.materialThickness = 1.5;
    }

    document.getElementById('mesh-info-badge').textContent = name;

    // Sync UI controls with preset defaults
    this.syncControls();

    this.currentMesh = mesh;
    this.viewport.setOriginalMesh(this.currentMesh);

    this.performSlicing();
    this.viewport.focusModel();
  }

  syncControls() {
    // Unit
    document.querySelectorAll('[data-unit]').forEach(b => {
      b.classList.toggle('active', b.dataset.unit === this.sourceUnit);
    });
    const labels = { 'm': 'Mètres (m)', 'cm': 'Centimètres (cm)', 'mm': 'Millimètres (mm)' };
    document.getElementById('unit-label').textContent = labels[this.sourceUnit];

    // Scale
    document.querySelectorAll('[data-scale]').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.scale) === this.scale);
    });
    document.getElementById('custom-scale-input').value = this.scale;
    document.getElementById('scale-badge').textContent = `1:${this.scale}`;
    document.getElementById('summary-scale-tag').textContent = `1:${this.scale}`;
    document.getElementById('pill-scale').textContent = `1:${this.scale}`;

    // Thickness
    document.querySelectorAll('[data-thick]').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.thick) === this.materialThickness);
    });
    document.getElementById('custom-thick-input').value = this.materialThickness;
    document.getElementById('thickness-badge').textContent = `${this.materialThickness} mm`;
    document.getElementById('pill-thick').textContent = `${this.materialThickness} mm`;
  }

  /**
   * File Picker Handler (Native Dialog in Electron or HTML input)
   */
  async openFilePicker() {
    if (ipcRenderer) {
      try {
        const fileData = await ipcRenderer.invoke('dialog:open-file');
        if (fileData) {
          this.loadModelFromBuffer(fileData.buffer, fileData.ext, fileData.name);
        }
        return;
      } catch (err) {
        console.warn("Electron dialog failed, falling back to input", err);
      }
    }

    document.getElementById('file-input').click();
  }

  /**
   * Load file selected from input or dropped
   */
  loadUserFile(file) {
    const reader = new FileReader();
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    reader.onload = (e) => {
      this.loadModelFromBuffer(e.target.result, ext, file.name);
    };

    if (ext === '.obj') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  /**
   * Parse 3D file from buffer/text and load into scene
   */
  loadModelFromBuffer(bufferOrText, ext, fileName) {
    try {
      let object3D = null;

      if (ext === '.stl') {
        const loader = new STLLoader();
        const geometry = loader.parse(bufferOrText);
        geometry.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        object3D = new THREE.Mesh(geometry, mat);
      } else if (ext === '.obj') {
        const loader = new OBJLoader();
        object3D = loader.parse(typeof bufferOrText === 'string' ? bufferOrText : new TextDecoder().decode(bufferOrText));
      } else if (ext === '.gltf' || ext === '.glb') {
        const loader = new GLTFLoader();
        loader.parse(bufferOrText, '', (gltf) => {
          this.onModelLoaded(gltf.scene, fileName);
        }, (err) => {
          this.showToast(`Erreur GLTF : ${err.message}`);
        });
        return;
      } else if (ext === '.fbx') {
        const loader = new FBXLoader();
        object3D = loader.parse(bufferOrText, '');
      } else {
        this.showToast(`Format non pris en charge : ${ext}`);
        return;
      }

      if (object3D) {
        this.onModelLoaded(object3D, fileName);
      }
    } catch (err) {
      console.error(err);
      this.showToast(`Erreur de lecture du fichier : ${err.message}`);
    }
  }

  onModelLoaded(object3D, fileName) {
    this.currentMesh = object3D;
    this.currentPreset = null;

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mesh-info-badge').textContent = fileName || "Fichier importé";

    this.viewport.setOriginalMesh(this.currentMesh);
    this.performSlicing();
    this.viewport.focusModel();

    this.showToast(`Modèle "${fileName}" importé et tranché avec succès !`);
  }

  /**
   * Run Slicing Algorithm and Update 3D & 2D views
   */
  performSlicing() {
    if (!this.currentMesh) return;

    try {
      // 1. Slice
      this.slicingResult = SlicerEngine.sliceModel(this.currentMesh, {
        sourceUnit: this.sourceUnit,
        scale: this.scale,
        materialThickness: this.materialThickness
      });

      // 2. Update Live Stats UI
      this.updateStatsUI(this.slicingResult.summary);

      // 3. Build 3D Physical Model
      this.viewport.buildPhysicalModel(this.slicingResult);

      // 4. Update Layer Inspection Slider
      const totalLayers = this.slicingResult.layers.length;
      const layerSlider = document.getElementById('layer-slider');
      layerSlider.max = totalLayers;
      layerSlider.value = totalLayers;
      document.getElementById('layer-slider-val').textContent = `Toutes les couches (${totalLayers}/${totalLayers})`;
      document.getElementById('isolate-toggle').checked = false;

      // 5. Pack and Render 2D Sheets
      this.repackSheets();

    } catch (err) {
      console.error("Slicing error:", err);
      this.showToast(`Erreur de tranchage : ${err.message}`);
    }
  }

  /**
   * Pack layers onto 2D cut sheets according to selected format
   */
  repackSheets() {
    if (!this.slicingResult) return;

    const formatInfo = SheetPacker.FORMATS[this.selectedSheetFormat] || SheetPacker.FORMATS['A3'];

    this.packedResult = SheetPacker.packLayers(this.slicingResult.layers, {
      sheetWidth: formatInfo.width,
      sheetHeight: formatInfo.height,
      margin: 8,
      spacing: 5
    });

    this.sheetRenderer.setData(this.packedResult, 0);
    this.updateSheetPageIndicator();
  }

  updateSheetPageIndicator() {
    if (!this.packedResult) return;
    const cur = this.sheetRenderer.currentSheetIndex + 1;
    const total = this.packedResult.sheets.length;
    document.getElementById('sheet-page-indicator').textContent = `Planche ${cur} / ${total}`;
  }

  /**
   * Update Summary Box Numbers
   */
  updateStatsUI(summary) {
    const { physicalDimensionsCm, layerRealHeightM, totalLayers, triangleCount } = summary;

    const dimStr = `${physicalDimensionsCm.x.toFixed(1)} × ${physicalDimensionsCm.z.toFixed(1)} × ${physicalDimensionsCm.y.toFixed(1)} cm`;
    document.getElementById('stat-dimensions').textContent = dimStr;
    document.getElementById('pill-dims').textContent = dimStr;

    // Real elevation per layer formatted nicely
    let elevStr = '';
    if (layerRealHeightM >= 1.0) {
      elevStr = `${layerRealHeightM.toFixed(2)} m par couche`;
    } else {
      elevStr = `${(layerRealHeightM * 100).toFixed(1)} cm par couche`;
    }
    document.getElementById('stat-elevation-per-layer').textContent = elevStr;

    document.getElementById('stat-total-layers').textContent = `${totalLayers} strates`;
    document.getElementById('pill-layers').textContent = totalLayers;
    document.getElementById('stat-triangles').textContent = triangleCount.toLocaleString('fr-FR');
  }

  /**
   * Live calculation updates before pressing re-slice
   */
  updateLiveCalculations() {
    this.performSlicing();
  }

  /**
   * Animate stacking / deconstructing stratum by stratum
   */
  startStackAnimation() {
    this.isPlayingStack = true;
    const layerSlider = document.getElementById('layer-slider');
    const playIcon = document.getElementById('play-icon');

    // Change icon to Pause
    playIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;

    let currentVal = 1;
    layerSlider.value = 1;
    layerSlider.dispatchEvent(new Event('input'));

    const maxVal = parseInt(layerSlider.max, 10);

    this.playInterval = setInterval(() => {
      currentVal++;
      if (currentVal > maxVal) {
        currentVal = 1;
      }
      layerSlider.value = currentVal;
      layerSlider.dispatchEvent(new Event('input'));
    }, 120);
  }

  stopStackAnimation() {
    this.isPlayingStack = false;
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
    const playIcon = document.getElementById('play-icon');
    playIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }

  /**
   * Export SVG (All sheets or current sheet)
   */
  async exportSVG() {
    if (!this.packedResult) {
      this.showToast("Veuillez d'abord trancher un modèle 3D.");
      return;
    }

    try {
      const svgContent = SvgExporter.generateSVG(this.packedResult);
      const defaultFilename = `maquette-decoupe-echelle-1_${this.scale}.svg`;

      if (ipcRenderer) {
        const res = await ipcRenderer.invoke('dialog:save-file', {
          defaultName: defaultFilename,
          content: svgContent,
          filterType: 'svg'
        });

        if (res.success) {
          this.showToast(`SVG exporté avec succès dans : ${res.filePath}`);
          return;
        } else if (res.canceled) {
          return;
        }
      }

      // Browser Fallback Download
      this.downloadBlob(svgContent, 'image/svg+xml;charset=utf-8', defaultFilename);
      this.showToast(`Fichier "${defaultFilename}" exporté avec succès !`);

    } catch (err) {
      console.error(err);
      this.showToast(`Erreur lors de l'export SVG : ${err.message}`);
    }
  }

  /**
   * Export all cutting sheets in calibrated vector PDF format inside a compressed ZIP archive
   */
  async exportPdfZip() {
    if (!this.packedResult || !this.packedResult.sheets || this.packedResult.sheets.length === 0) {
      this.showToast("Veuillez d'abord trancher un modèle 3D avant d'exporter.");
      return;
    }

    try {
      this.showToast("Génération des planches PDF et compression du dossier ZIP en cours...");

      const modelBadge = document.getElementById('mesh-info-badge');
      const modelName = modelBadge ? modelBadge.textContent.trim() : (this.currentPreset || 'Maquette');

      let svgContent = null;
      try {
        svgContent = SvgExporter.generateSVG(this.packedResult, {
          showGuides: this.sheetRenderer ? this.sheetRenderer.showGuides : true,
          showLabels: this.sheetRenderer ? this.sheetRenderer.showLabels : true,
          showCutLines: this.sheetRenderer ? this.sheetRenderer.showCutLines : true
        });
      } catch (e) {
        console.warn("SVG generation for ZIP archive:", e);
      }

      const zipBlob = await PdfExporter.generatePlanchesZip(this.packedResult, {
        modelName,
        scale: this.scale,
        thickness: this.materialThickness,
        materialStyle: this.materialStyle,
        formatLabel: this.selectedSheetFormat,
        showGuides: this.sheetRenderer ? this.sheetRenderer.showGuides : true,
        showLabels: this.sheetRenderer ? this.sheetRenderer.showLabels : true,
        showCutLines: this.sheetRenderer ? this.sheetRenderer.showCutLines : true,
        svgContent
      });

      const cleanModelName = modelName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
      const defaultFilename = `maquette-${cleanModelName}-planches-pdf-1_${this.scale}.zip`;

      this.downloadBlob(zipBlob, 'application/zip', defaultFilename);
      this.showToast(`Dossier ZIP téléchargé avec succès (${this.packedResult.sheets.length} planches PDF) !`);

    } catch (err) {
      console.error("[Export PDF ZIP Error]:", err);
      this.showToast(`Erreur lors de l'export ZIP des planches : ${err.message}`);
    }
  }

  /**
   * Export currently active 2D sheet as a single vector PDF
   */
  async exportSinglePdf() {
    if (!this.packedResult || !this.packedResult.sheets || this.packedResult.sheets.length === 0) {
      this.showToast("Veuillez d'abord trancher un modèle 3D.");
      return;
    }

    try {
      const sheetIdx = this.sheetRenderer ? this.sheetRenderer.currentSheetIndex : 0;
      const sheet = this.packedResult.sheets[sheetIdx] || this.packedResult.sheets[0];

      const modelBadge = document.getElementById('mesh-info-badge');
      const modelName = modelBadge ? modelBadge.textContent.trim() : (this.currentPreset || 'Maquette');

      const pdfBytes = PdfExporter.generateSingleSheetPdf(sheet, {
        modelName,
        scale: this.scale,
        thickness: this.materialThickness,
        materialStyle: this.materialStyle,
        formatLabel: this.selectedSheetFormat,
        showGuides: this.sheetRenderer ? this.sheetRenderer.showGuides : true,
        showLabels: this.sheetRenderer ? this.sheetRenderer.showLabels : true,
        showCutLines: this.sheetRenderer ? this.sheetRenderer.showCutLines : true
      });

      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const filename = `planche_${String(sheet.sheetNumber).padStart(2, '0')}_${this.selectedSheetFormat}_${sheet.width}x${sheet.height}mm.pdf`;

      this.downloadBlob(pdfBlob, 'application/pdf', filename);
      this.showToast(`Planche ${sheet.sheetNumber} exportée en PDF vectoriel avec succès !`);

    } catch (err) {
      console.error("[Export Single PDF Error]:", err);
      this.showToast(`Erreur lors de l'export PDF : ${err.message}`);
    }
  }

  downloadBlob(content, mimeType, filename) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }
}

// Bootstrap application dès que le DOM est prêt
function startSlicerApp() {
  if (!window.__slicerApp) {
    window.app = window.__slicerApp = new MaquetteApp();
    initModuleListeners();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startSlicerApp);
} else {
  startSlicerApp();
}

export function initModuleListeners() {
  if (window.__slicerApp) {
    window.__slicerApp.initModuleListeners();
  }
}

// Expose functions globally for cross-context & testing
window.initModuleListeners = initModuleListeners;
window.switchViewMode = (mode) => (window.__slicerApp || window.app)?.switchViewMode(mode);
window.loadPreset = (preset) => (window.__slicerApp || window.app)?.loadPreset(preset);
window.openFilePicker = () => (window.__slicerApp || window.app)?.openFilePicker();
window.exportSVG = () => (window.__slicerApp || window.app)?.exportSVG();
window.exportDXF = () => (window.__slicerApp || window.app)?.exportDXF();
window.performSlicing = () => (window.__slicerApp || window.app)?.performSlicing();

// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & INCOMING 3D MODEL HANDLER
// -----------------------------------------------------------------------------

window.addEventListener('message', async (e) => {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.type === 'ARCHFORGE_REINIT_LISTENERS') {
    console.log('[Maquette Slicer] Re-initializing module event listeners via Hub request.');
    if (window.initModuleListeners) window.initModuleListeners();
  }

  if (e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    if (e.data.active && window.initModuleListeners) {
      window.initModuleListeners();
    }
    if (window.__slicerApp && window.__slicerApp.viewport) {
      window.__slicerApp.viewport.isStudioActive = !!e.data.active;
      if (window.__slicerApp.viewport.isStudioActive && !window.__slicerApp.viewport.animId) {
        window.__slicerApp.viewport.animate();
      }
    }
    if (e.data.active && window.__pendingModel && (window.__slicerApp || window.app)) {
      const pm = window.__pendingModel;
      window.__pendingModel = null;
      const app = window.__slicerApp || window.app;
      app.loadModelFromBuffer(pm.buffer, pm.ext, pm.name);
    }
  }

  if (e.data.type === 'ARCHFORGE_LOAD_MODEL') {
    console.log('[Maquette Slicer] Received 3D model from Hub:', e.data.name);
    try {
      const { buffer, name, ext } = e.data;
      const fileName = name || 'imported_model.glb';
      const fileExt = (ext ? (ext.startsWith('.') ? ext : '.' + ext) : '.' + fileName.split('.').pop()).toLowerCase();
      const app = window.__slicerApp || window.app;
      if (app) {
        if (fileExt === '.glb' || fileExt === '.gltf') {
          app.loadModelFromBuffer(buffer, fileExt, fileName);
        } else {
          const blob = new Blob([buffer], { type: 'application/octet-stream' });
          const file = new File([blob], fileName);
          app.loadUserFile(file);
        }
      } else {
        window.__pendingModel = { buffer, name: fileName, ext: fileExt };
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
