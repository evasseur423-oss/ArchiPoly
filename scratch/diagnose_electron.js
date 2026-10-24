const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const fs = require('fs');
const logFile = path.join(__dirname, 'diag_output.txt');
fs.writeFileSync(logFile, '[START DIAGNOSTIC]\n');
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

app.whenReady().then(async () => {
  log('[Diagnostic] Electron ready, launching test window...');

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      sandbox: false,
      webSecurity: false
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log(`[PAGE CONSOLE lvl=${level}]: ${message} at (${sourceId}:${line})`);
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log(`[LOAD FAILED]: ${desc} (${code}) at ${url}`);
  });

  log('[Diagnostic] Loading http://localhost:3800/workspaces/material-library/index.html ...');
  try {
    await win.loadURL('http://localhost:3800/workspaces/material-library/index.html');
    log('[Diagnostic] Page loaded successfully.');

    // Wait 2 seconds for scripts, Three.js, fetchCatalog, etc. to run
    await new Promise(r => setTimeout(r, 2000));

    const state = await win.webContents.executeJavaScript(`
      (() => {
        return {
          readyState: document.readyState,
          hasThree: typeof window.THREE !== 'undefined',
          hasFetchCatalog: typeof window.fetchCatalog === 'function',
          hasInitModuleListeners: typeof window.initModuleListeners === 'function',
          catalogContainerHtmlLength: document.getElementById('catalog') ? document.getElementById('catalog').innerHTML.length : -1,
          catalogCardsCount: document.querySelectorAll('.material-card').length,
          categoryPillsCount: document.querySelectorAll('.cat-pill').length,
          viewportLoaderDisplay: document.getElementById('viewportLoader') ? window.getComputedStyle(document.getElementById('viewportLoader')).display : 'none',
          btnPickFolderExists: !!document.getElementById('btnPickFolder'),
          btnPickFilesExists: !!document.getElementById('btnPickFiles'),
          bodyChildrenCount: document.body.children.length
        };
      })()
    `);

    log('[Diagnostic] Page State:', JSON.stringify(state, null, 2));

    log('[Diagnostic] Testing click on #btnPickFolder...');
    const clickResult = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById('btnPickFolder');
        if (!btn) return 'Button not found';
        btn.click();
        return 'Clicked';
      })()
    `);
    log('[Diagnostic] Click result:', clickResult);

    await new Promise(r => setTimeout(r, 1000));
  } catch (err) {
    log('[Diagnostic] Error during test:', err);
  } finally {
    log('[Diagnostic] Finished.');
    app.quit();
  }
});
