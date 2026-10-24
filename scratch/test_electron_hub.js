const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Launch express server for test
const { server, materialsDir } = require('../server.js');

const logFile = path.join(__dirname, 'hub_diag.log');
fs.writeFileSync(logFile, '[START DIAGNOSTIC - ' + new Date().toISOString() + ']\n');

function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// IPC handlers matching main.js
ipcMain.handle('dialog:pick-directory', async () => {
  log('[IPC] dialog:pick-directory received and handled cleanly');
  return null;
});
ipcMain.handle('dialog:pick-texture-files', async () => {
  log('[IPC] dialog:pick-texture-files received and handled cleanly');
  return null;
});
ipcMain.handle('app:open-materials-folder', async () => {
  log('[IPC] app:open-materials-folder received');
  return { success: true };
});
ipcMain.handle('app:get-info', async () => {
  return { version: '1.0.0', materialsPath: materialsDir, isPackaged: false };
});

app.whenReady().then(async () => {
  log('[Diag] App ready. Creating window with same settings as main.js...');

  const win = new BrowserWindow({
    width: 1680,
    height: 1000,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  // Capture ALL console messages from all frames
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log(`[CONSOLE lvl=${level}]: ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log(`[LOAD FAILED]: ${desc} (${code}) at ${url}`);
  });

  win.webContents.on('render-process-gone', (e, details) => {
    log(`[RENDER PROCESS GONE]:`, details);
  });

  log('[Diag] Loading http://localhost:3800 ...');
  try {
    await win.loadURL('http://localhost:3800');
    log('[Diag] Main URL loaded. Waiting 3.5 seconds for all iframes and scripts...');
    await new Promise(r => setTimeout(r, 3500));

    // Inspect main window
    const hubState = await win.webContents.executeJavaScript(`
      (() => {
        return {
          title: document.title,
          activeTab: document.querySelector('.nav-tab.active') ? document.querySelector('.nav-tab.active').innerText : 'NONE',
          gpuStatus: document.getElementById('gpuStatusText') ? document.getElementById('gpuStatusText').innerText : 'NONE',
          hasArchforgeDesktop: typeof window.archforgeDesktop !== 'undefined',
          framesCount: document.querySelectorAll('iframe').length
        };
      })()
    `);
    log('[Diag] Hub State:', hubState);

    // Now inspect Frame 0 (Material Library)
    log('[Diag] Inspecting Frame 0 (Material Library)...');
    
    // We can execute JavaScript inside the frame using webContents.mainFrame.frames
    const subFrames = win.webContents.mainFrame.frames;
    log(`[Diag] Found ${subFrames.length} subframes`);
    
    let libFrame = null;
    for (const f of subFrames) {
      log(`[Diag] Subframe url: ${f.url}`);
      if (f.url.includes('material-library')) {
        libFrame = f;
      }
    }

    if (!libFrame) {
      log('[Diag] ERROR: Material Library subframe not found!');
    } else {
      log('[Diag] Inspecting libFrame contents...');
      const libState = await libFrame.executeJavaScript(`
        (() => {
          const loader = document.getElementById('viewportLoader');
          const catalog = document.getElementById('catalog');
          const cards = document.querySelectorAll('.material-card');
          const pills = document.querySelectorAll('.cat-pill');
          const canvas = document.querySelector('canvas');
          
          return {
            title: document.title,
            readyState: document.readyState,
            hasThree: typeof window.THREE !== 'undefined',
            hasOrbitControls: typeof window.OrbitControls !== 'undefined',
            hasFetchCatalog: typeof window.fetchCatalog === 'function',
            hasGlobalCatalog: typeof globalCatalog !== 'undefined',
            globalCatalogKeys: typeof globalCatalog !== 'undefined' ? Object.keys(globalCatalog) : [],
            loaderStyleDisplay: loader ? loader.style.display : 'NO_LOADER',
            loaderComputedDisplay: loader ? window.getComputedStyle(loader).display : 'NO_LOADER',
            cardsCount: cards.length,
            pillsCount: pills.length,
            hasCanvas: !!canvas,
            canvasWidth: canvas ? canvas.width : 0,
            canvasHeight: canvas ? canvas.height : 0,
            archforgeDesktopOnWindow: typeof window.archforgeDesktop !== 'undefined',
            archforgeDesktopOnParent: typeof window.parent.archforgeDesktop !== 'undefined',
            electronAPIOnWindow: typeof window.electronAPI !== 'undefined'
          };
        })()
      `);
      log('[Diag] Material Library State:', libState);

      // Test clicking on the first material card
      log('[Diag] Testing click on first material card...');
      const clickMatResult = await libFrame.executeJavaScript(`
        (() => {
          const card = document.querySelector('.material-card');
          if (!card) return 'NO_CARDS';
          const btnView = card.querySelector('.btn-view') || card;
          btnView.click();
          return 'CLICKED: ' + (card.dataset.matName || 'unnamed');
        })()
      `);
      log('[Diag] Click Material result:', clickMatResult);

      await new Promise(r => setTimeout(r, 1000));

      const afterMatClickState = await libFrame.executeJavaScript(`
        (() => {
          const hud = document.getElementById('activeMatHud');
          const hudName = document.getElementById('hudName');
          const loader = document.getElementById('viewportLoader');
          return {
            hudDisplay: hud ? window.getComputedStyle(hud).display : 'NO_HUD',
            hudName: hudName ? hudName.innerText : '',
            loaderDisplay: loader ? window.getComputedStyle(loader).display : 'NO_LOADER'
          };
        })()
      `);
      log('[Diag] After Material Click State:', afterMatClickState);

      // Test clicking Browse Folder
      log('[Diag] Testing click on Browse Folder button (#btnPickFolder)...');
      const clickFolderResult = await libFrame.executeJavaScript(`
        (() => {
          const btn = document.getElementById('btnPickFolder');
          if (!btn) return 'NO_BTN_PICK_FOLDER';
          try {
            btn.click();
            return 'CLICKED_OK';
          } catch(e) {
            return 'ERROR: ' + e.message;
          }
        })()
      `);
      log('[Diag] Click Browse Folder result:', clickFolderResult);

      await new Promise(r => setTimeout(r, 500));

      // Test clicking Browse Files
      log('[Diag] Testing click on Browse Files button (#btnPickFiles)...');
      const clickFilesResult = await libFrame.executeJavaScript(`
        (() => {
          const btn = document.getElementById('btnPickFiles');
          if (!btn) return 'NO_BTN_PICK_FILES';
          try {
            btn.click();
            return 'CLICKED_OK';
          } catch(e) {
            return 'ERROR: ' + e.message;
          }
        })()
      `);
      log('[Diag] Click Browse Files result:', clickFilesResult);

      // Test switching workspace away and back
      log('[Diag] Testing tab switch to Inspector (1) and back to Material Library (0)...');
      await win.webContents.executeJavaScript(`
        (() => {
          document.getElementById('tab-1').click();
        })()
      `);
      await new Promise(r => setTimeout(r, 1000));

      await win.webContents.executeJavaScript(`
        (() => {
          document.getElementById('tab-0').click();
        })()
      `);
      await new Promise(r => setTimeout(r, 1000));

      const afterSwitchState = await libFrame.executeJavaScript(`
        (() => {
          const loader = document.getElementById('viewportLoader');
          return {
            loaderDisplay: loader ? window.getComputedStyle(loader).display : 'NO_LOADER',
            cardsCount: document.querySelectorAll('.material-card').length
          };
        })()
      `);
      log('[Diag] After Switch State:', afterSwitchState);
    }

  } catch(err) {
    log('[Diag] Error occurred:', err.stack || err);
  } finally {
    log('[Diag] Done. Exiting.');
    app.quit();
  }
});
