const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  console.log('[Diagnostic Hub] Launching Master Hub window...');

  const win = new BrowserWindow({
    width: 1680,
    height: 1000,
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
    console.log(`[HUB CONSOLE lvl=${level}]:`, message, `at (${sourceId}:${line})`);
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error(`[HUB LOAD FAILED]: ${desc} (${code}) at ${url}`);
  });

  console.log('[Diagnostic Hub] Loading http://localhost:3800 ...');
  try {
    await win.loadURL('http://localhost:3800');
    console.log('[Diagnostic Hub] Hub loaded.');

    // Wait 3 seconds for all iframes to load and postMessage to complete
    await new Promise(r => setTimeout(r, 3000));

    // Inspect iframe frame-0
    const frameState = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('frame-0');
        if (!frame) return { error: 'frame-0 not found' };
        try {
          const doc = frame.contentDocument || frame.contentWindow.document;
          const win = frame.contentWindow;
          return {
            frameSrc: frame.src,
            docReady: doc.readyState,
            hasThree: typeof win.THREE !== 'undefined',
            hasFetchCatalog: typeof win.fetchCatalog === 'function',
            hasInitModuleListeners: typeof win.initModuleListeners === 'function',
            cardsCount: doc.querySelectorAll('.material-card').length,
            pillsCount: doc.querySelectorAll('.cat-pill').length,
            loaderDisplay: doc.getElementById('viewportLoader') ? win.getComputedStyle(doc.getElementById('viewportLoader')).display : 'none',
            btnFolder: !!doc.getElementById('btnPickFolder'),
            btnFiles: !!doc.getElementById('btnPickFiles')
          };
        } catch (e) {
          return { error: e.message };
        }
      })()
    `);

    console.log('[Diagnostic Hub] Material Library iframe state:', JSON.stringify(frameState, null, 2));

  } catch (err) {
    console.error('[Diagnostic Hub] Error:', err);
  } finally {
    app.quit();
  }
});
