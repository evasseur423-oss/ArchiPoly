const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const { server } = require('../server.js');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1680,
    height: 1000,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  win.webContents.on('console-message', (e, level, msg, line, src) => {
    console.log(`[Renderer lvl ${level}]: ${msg} (${path.basename(src || '')}:${line})`);
  });

  await win.loadURL('http://localhost:3800');
  console.log('Studio Hub loaded.');

  // Wait 4 seconds for all workspaces to initialize
  await new Promise(r => setTimeout(r, 4000));

  // Inspect frames
  const frames = win.webContents.mainFrame.frames;
  console.log(`Number of child frames: ${frames.length}`);

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    console.log(`\n--- FRAME ${i}: ${f.url} ---`);
    try {
      const state = await f.executeJavaScript(`
        (() => {
          return {
            title: document.title,
            bodyChildren: document.body.children.length,
            canvases: document.querySelectorAll('canvas').length,
            buttons: document.querySelectorAll('button').length,
            inputs: document.querySelectorAll('input').length,
            hasThree: typeof THREE !== 'undefined' || !!window.__viewer || !!window.__slicerApp || !!window.__arch,
            active: window.isWorkspaceActive ?? window.isStudioActive ?? null,
            visible: window.getComputedStyle(document.body).display !== 'none'
          };
        })()
      `);
      console.log('Frame state:', JSON.stringify(state));
    } catch (err) {
      console.log('Frame inspection error:', err.message);
    }
  }

  console.log('\nClosing test...');
  server.close(() => {
    app.quit();
  });
});
