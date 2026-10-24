const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const logFile = path.join(__dirname, 'hub_diag_output.txt');
fs.writeFileSync(logFile, '[START HUB FULL DIAGNOSTIC]\n');
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// Ensure Electron userData path is available to server.js before requiring it
process.env.ARCHIPOLY_USER_DATA = app.getPath('userData');
const { server, materialsDir, getMaterialsDir } = require('../server.js');

let mainWindow = null;
const SERVER_PORT = process.env.PORT || 3800;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Register IPC handlers as in main.js
ipcMain.handle('app:open-materials-folder', async (_event, subPath = '') => {
  log('[IPC] app:open-materials-folder called');
  return { success: true };
});

ipcMain.handle('app:reveal-file', async (_event, filePath) => {
  return { success: true };
});

ipcMain.handle('app:get-info', async () => {
  return { version: '1.0.0', materialsPath: materialsDir };
});

ipcMain.handle('dialog:pick-directory', async () => {
  log('[IPC] dialog:pick-directory called');
  return null;
});

ipcMain.handle('dialog:pick-texture-files', async () => {
  log('[IPC] dialog:pick-texture-files called');
  return null;
});

app.whenReady().then(async () => {
  log('[Diagnostic] Electron Hub ready...');

  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log(`[HUB CONSOLE lvl=${level}]: ${message} at (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    log(`[HUB LOAD FAILED]: ${desc} (${code}) at ${url}`);
  });

  log(`[Diagnostic] Loading ${SERVER_URL} ...`);
  try {
    await mainWindow.loadURL(SERVER_URL);
    log('[Diagnostic] Hub URL loaded.');

    // Wait 3 seconds for all iframes to initialize
    await new Promise(r => setTimeout(r, 3000));

    // Inspect Hub DOM
    const hubState = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const frame0 = document.getElementById('frame-0');
        let frame0Accessible = false;
        let frame0State = null;
        let frame0Error = null;

        try {
          if (frame0 && frame0.contentWindow) {
            frame0Accessible = true;
            const doc = frame0.contentDocument || frame0.contentWindow.document;
            frame0State = {
              readyState: doc.readyState,
              hasThree: typeof frame0.contentWindow.THREE !== 'undefined',
              materialsCardsCount: doc.querySelectorAll('.material-card').length,
              catalogTotalBadge: doc.getElementById('catalogTotalBadge') ? doc.getElementById('catalogTotalBadge').textContent : null,
              categoryPills: doc.querySelectorAll('.cat-pill').length,
              viewportLoaderDisplay: doc.getElementById('viewportLoader') ? frame0.contentWindow.getComputedStyle(doc.getElementById('viewportLoader')).display : null,
              hudDisplay: doc.getElementById('activeMatHud') ? frame0.contentWindow.getComputedStyle(doc.getElementById('activeMatHud')).display : null,
              hudName: doc.getElementById('hudName') ? doc.getElementById('hudName').textContent : null,
              hasArchforgeDesktop: typeof frame0.contentWindow.archforgeDesktop !== 'undefined',
              parentHasArchforgeDesktop: typeof frame0.contentWindow.parent.archforgeDesktop !== 'undefined',
              canvasCount: doc.querySelectorAll('canvas').length
            };
          }
        } catch (e) {
          frame0Error = e.message;
        }

        return {
          hubTitle: document.title,
          activeTab: document.querySelector('.nav-tab.active') ? document.querySelector('.nav-tab.active').textContent.trim() : null,
          frame0Accessible,
          frame0State,
          frame0Error
        };
      })()
    `);

    log('[Diagnostic] Hub State:', JSON.stringify(hubState, null, 2));

    // Now test clicking on a material inside frame 0
    const clickMatResult = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const frame0 = document.getElementById('frame-0');
        if (!frame0 || !frame0.contentDocument) return 'frame-0 not accessible';
        const doc = frame0.contentDocument;
        const firstCard = doc.querySelector('.material-card');
        if (!firstCard) return 'No material cards in frame-0';
        const matName = firstCard.dataset.matName;
        const btnView = firstCard.querySelector('.btn-view');
        if (btnView) {
          btnView.click();
          return 'Clicked view on ' + matName;
        }
        firstCard.click();
        return 'Clicked card ' + matName;
      })()
    `);

    log('[Diagnostic] Material card click result:', clickMatResult);

    await new Promise(r => setTimeout(r, 2000));

    // Re-check frame 0 state after material click
    const afterClickState = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const frame0 = document.getElementById('frame-0');
        if (!frame0 || !frame0.contentDocument) return null;
        const doc = frame0.contentDocument;
        return {
          activeMatHudDisplay: doc.getElementById('activeMatHud') ? frame0.contentWindow.getComputedStyle(doc.getElementById('activeMatHud')).display : null,
          hudName: doc.getElementById('hudName') ? doc.getElementById('hudName').textContent : null,
          viewportLoaderDisplay: doc.getElementById('viewportLoader') ? frame0.contentWindow.getComputedStyle(doc.getElementById('viewportLoader')).display : null,
          canvasCount: doc.querySelectorAll('canvas').length
        };
      })()
    `);
    log('[Diagnostic] Frame 0 state after click:', JSON.stringify(afterClickState, null, 2));

  } catch (err) {
    log('[Diagnostic] Exception:', err.stack || err.message);
  } finally {
    log('[Diagnostic] Full Hub Test Complete.');
    app.quit();
  }
});
