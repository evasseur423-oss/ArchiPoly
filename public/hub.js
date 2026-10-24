/**
 * ArchForge Studio — Master Hub Controller
 * Manages:
 *  - Blender-style workspace switching
 *  - Strict WebGL GPU lifecycle optimization (pausing inactive tabs)
 *  - Inter-module shared state bridges (Alchemist -> Library, Inspector -> Slicer/ArchPhysics)
 *  - Desktop integration (opening external storage folder)
 *  - Toast notification system
 */

(function () {
  'use strict';

  const WORKSPACES = [
    { id: 0, key: 'library', name: '[01. Material Library]', frameId: 'frame-0', containerId: 'ws-container-0' },
    { id: 1, key: 'inspector', name: '[02. 3D Inspector]', frameId: 'frame-1', containerId: 'ws-container-1' },
    { id: 2, key: 'alchemist', name: '[03. PBR Alchemist]', frameId: 'frame-2', containerId: 'ws-container-2' },
    { id: 3, key: 'slicer', name: '[04. Maquette Slicer]', frameId: 'frame-3', containerId: 'ws-container-3' },
    { id: 4, key: 'archphysics', name: '[05. ArchPhysics]', frameId: 'frame-4', containerId: 'ws-container-4' }
  ];

  let currentWorkspaceIndex = 0;

  // DOM Elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const containers = WORKSPACES.map(w => document.getElementById(w.containerId));
  const frames = WORKSPACES.map(w => document.getElementById(w.frameId));
  const gpuStatusText = document.getElementById('gpuStatusText');
  const btnOpenMaterialsDir = document.getElementById('btnOpenMaterialsDir');
  const btnOpenAbout = document.getElementById('btnOpenAbout');
  const btnCloseAbout = document.getElementById('btnCloseAbout');
  const aboutModal = document.getElementById('aboutModal');
  const hubToastHost = document.getElementById('hubToastHost');

  // =========================================================================
  // WORKSPACE SWITCHER & STRICT GPU LIFECYCLE
  // =========================================================================

  function switchWorkspace(newIndex) {
    if (newIndex < 0 || newIndex >= WORKSPACES.length) return;
    if (newIndex === currentWorkspaceIndex && containers[newIndex].classList.contains('active')) return;

    const oldIndex = currentWorkspaceIndex;
    currentWorkspaceIndex = newIndex;
    const target = WORKSPACES[newIndex];

    console.log(`Bouton cliqué : [Studio Hub] Basculement vers l'onglet ${target.name}`);

    // 1. Notify OLD workspace to SUSPEND WebGL render loop (GPU 0%)
    const oldFrame = frames[oldIndex];
    if (oldFrame && oldFrame.contentWindow) {
      try {
        oldFrame.contentWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: false }, '*');
      } catch (_) {}
    }

    // 2. Update Tab Styles
    navTabs.forEach((tab, idx) => {
      tab.classList.toggle('active', idx === newIndex);
    });

    // 3. Toggle Visibility of Container Frames
    containers.forEach((container, idx) => {
      container.classList.toggle('active', idx === newIndex);
    });

    // 4. Notify NEW workspace to RESUME WebGL render loop and re-verify listeners
    const newFrame = frames[newIndex];
    if (newFrame && newFrame.contentWindow) {
      try {
        newFrame.contentWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: true }, '*');
        newFrame.contentWindow.postMessage({ type: 'ARCHFORGE_REINIT_LISTENERS', active: true }, '*');
      } catch (_) {}
    }

    // 5. Update GPU Status Monitor
    if (gpuStatusText) {
      gpuStatusText.textContent = `GPU: ${target.name} active (4 suspended)`;
    }

    // 6. Re-sync listeners on tab switch
    initModuleListeners();
  }

  // Keyboard Shortcuts (Alt+1 to Alt+5)
  window.addEventListener('keydown', (e) => {
    const isAlt = e.altKey;
    const tag = (e.target.tagName || '').toLowerCase();
    const inInput = (tag === 'input' || tag === 'textarea' || tag === 'select');

    if (isAlt && ['1', '2', '3', '4', '5'].includes(e.key)) {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      switchWorkspace(idx);
    } else if (!isAlt && !inInput && ['1', '2', '3', '4', '5'].includes(e.key)) {
      // In Blender style, numeric keys can switch top modes if no focus
      const idx = parseInt(e.key, 10) - 1;
      switchWorkspace(idx);
    }
  });

  // =========================================================================
  // INTER-MODULE BRIDGES & SHARED STATE
  // =========================================================================

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    const { type } = event.data;

    // 1. Child Frame Ready Signal: ensure correct initial active state
    if (type === 'ARCHFORGE_FRAME_READY') {
      const senderWindow = event.source;
      frames.forEach((frame, idx) => {
        if (frame.contentWindow === senderWindow) {
          const isActive = (idx === currentWorkspaceIndex);
          senderWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: isActive }, '*');
        }
      });
    }

    // 2. BRIDGE 1: [03. PBR Alchemist] -> [01. Material Library]
    if (type === 'ARCHFORGE_ALCHEMIST_SAVED') {
      const { category, materialName } = event.data;
      console.log(`[Hub Bridge] Alchemist saved new material: ${category}/${materialName}`);

      // Forward refresh signal to Material Library iframe
      const libFrame = frames[0];
      if (libFrame && libFrame.contentWindow) {
        libFrame.contentWindow.postMessage({
          type: 'ARCHFORGE_REFRESH_CATALOG',
          category,
          materialName
        }, '*');
      }

      showToast(`✨ New material '${materialName}' saved to '${category}'!`, {
        actionLabel: 'View in Library',
        actionFn: () => switchWorkspace(0)
      });
    }

    // 3. BRIDGE 2: [02. 3D Inspector] -> [04. Scale Slicer] OR [05. ArchPhysics]
    if (type === 'ARCHFORGE_TRANSFER_MODEL') {
      const { target, name, buffer, ext } = event.data;
      console.log(`[Hub Bridge] Transferring 3D model '${name}' to ${target}`);

      if (target === 'slicer') {
        switchWorkspace(3); // Switch to Scale Slicer
        setTimeout(() => {
          const slicerFrame = frames[3];
          if (slicerFrame && slicerFrame.contentWindow) {
            slicerFrame.contentWindow.postMessage({
              type: 'ARCHFORGE_LOAD_MODEL',
              name,
              buffer,
              ext
            }, '*');
          }
        }, 150);

        showToast(`📐 3D model '${name}' transferred to Scale Slicer!`);
      } else if (target === 'archphysics') {
        switchWorkspace(4); // Switch to ArchPhysics
        setTimeout(() => {
          const physFrame = frames[4];
          if (physFrame && physFrame.contentWindow) {
            physFrame.contentWindow.postMessage({
              type: 'ARCHFORGE_LOAD_MODEL',
              name,
              buffer,
              ext
            }, '*');
          }
        }, 150);

        showToast(`⚡ 3D model '${name}' transferred to ArchPhysics for analysis!`);
      }
    }
  });

  // =========================================================================
  // ACTIONS DU STUDIO HUB & CENTRALISATION DES EVENT LISTENERS
  // =========================================================================

  let isOpeningMaterialsDir = false;

  async function openMaterialsDir() {
    if (isOpeningMaterialsDir) return;
    isOpeningMaterialsDir = true;
    console.log('Button clicked: [Studio Hub] Materials Folder');
    try {
      if (window.archforgeDesktop && window.archforgeDesktop.openMaterialsFolder) {
        const res = await window.archforgeDesktop.openMaterialsFolder();
        showToast(`📁 Materials folder opened in File Explorer: ${res.path || 'Workspace_Materials'}`);
      } else {
        const resp = await fetch('/api/open-folder');
        const data = await resp.json();
        showToast(`📁 Materials folder opened: ${data.path || 'Workspace_Materials'}`);
      }
    } catch (err) {
      console.error('Error opening materials directory:', err);
      showToast('Unable to open folder automatically.');
    } finally {
      setTimeout(() => { isOpeningMaterialsDir = false; }, 1000);
    }
  }

  function openAboutModal() {
    console.log('Bouton cliqué : [Studio Hub] Ouvrir À Propos');
    const modal = document.getElementById('aboutModal');
    if (modal) modal.removeAttribute('hidden');
  }

  function closeAboutModal() {
    console.log('Bouton cliqué : [Studio Hub] Fermer À Propos');
    const modal = document.getElementById('aboutModal');
    if (modal) modal.setAttribute('hidden', '');
  }

  function closeApp() {
    console.log('Bouton cliqué : [Studio Hub] Fermer Application (✕)');
    if (window.archforgeDesktop && typeof window.archforgeDesktop.close === 'function') {
      window.archforgeDesktop.close();
    } else {
      window.close();
    }
  }

  // Centralisation de l'initialisation des boutons du Hub
  function initModuleListeners() {
    // 1. Boutons d'onglets
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      if (!tab.dataset.hubBound) {
        tab.dataset.hubBound = 'true';
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetIndex = parseInt(tab.dataset.workspace, 10);
          switchWorkspace(targetIndex);
        });
      }
    });

    // 2. Bouton Dossier Matériaux (liaison unique avec stopPropagation)
    const btnMat = document.getElementById('btnOpenMaterialsDir');
    if (btnMat && !btnMat.dataset.hubBound) {
      btnMat.dataset.hubBound = 'true';
      btnMat.addEventListener('click', (e) => {
        e.stopPropagation();
        openMaterialsDir();
      });
    }

    // 3. Bouton À Propos
    const btnAbout = document.getElementById('btnOpenAbout');
    if (btnAbout && !btnAbout.dataset.hubBound) {
      btnAbout.dataset.hubBound = 'true';
      btnAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        openAboutModal();
      });
    }

    // 4. Fermeture À Propos
    const btnCloseAb = document.getElementById('btnCloseAbout');
    if (btnCloseAb && !btnCloseAb.dataset.hubBound) {
      btnCloseAb.dataset.hubBound = 'true';
      btnCloseAb.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAboutModal();
      });
    }

    // 5. Bouton Fermer Application
    const btnClose = document.getElementById('btnCloseApp');
    if (btnClose && !btnClose.dataset.hubBound) {
      btnClose.dataset.hubBound = 'true';
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeApp();
      });
    }
  }

  // Fermeture de la modale en cliquant en dehors (sur l'arrière-plan sombre)
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('aboutModal');
    if (modal && e.target === modal) {
      closeAboutModal();
    }
  });

  // Échappement clavier
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('aboutModal');
      if (modal && !modal.hasAttribute('hidden')) {
        closeAboutModal();
      }
    }
  });

  // Initialisation initiale des écouteurs du Hub
  initModuleListeners();



  // =========================================================================
  // TOAST NOTIFICATIONS
  // =========================================================================

  function showToast(message, { actionLabel = null, actionFn = null, duration = 5000 } = {}) {
    if (!hubToastHost) return;

    const toast = document.createElement('div');
    toast.className = 'hub-toast';

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    if (actionLabel && typeof actionFn === 'function') {
      const btn = document.createElement('button');
      btn.className = 'hub-toast-action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        actionFn();
        toast.remove();
      });
      toast.appendChild(btn);
    }

    hubToastHost.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  
  // Ensure iframes receive activation immediately when loaded
  frames.forEach((frame, idx) => {
    frame.addEventListener('load', () => {
      const isActive = (idx === currentWorkspaceIndex);
      try {
        frame.contentWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: isActive }, '*');
        frame.contentWindow.dispatchEvent(new Event('resize'));
      } catch (_) {}
    });
  });

  // Expose Hub API for debugging and inter-frame calls
  window.archforgeHub = {
    switchWorkspace,
    initModuleListeners,
    openMaterialsDir,
    openAboutModal,
    closeAboutModal,
    closeApp,
    showToast,
    getCurrentWorkspace: () => WORKSPACES[currentWorkspaceIndex]
  };
  window.initModuleListeners = initModuleListeners;
  window.switchWorkspace = switchWorkspace;

  // Initial setup: ensure Workspace 0 is active and others are suspended once loaded
  setTimeout(() => {
    switchWorkspace(0);
  }, 200);

})();
