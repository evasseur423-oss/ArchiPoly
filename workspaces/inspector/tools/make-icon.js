'use strict';

// Génère icon.png (512x512) à partir de icon.svg avec le moteur de rendu d'Electron.
// Usage : npm run icon

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 600));

  let image = await win.webContents.capturePage();
  const { width } = image.getSize();
  if (width !== 512) image = image.resize({ width: 512, height: 512, quality: 'best' });

  fs.writeFileSync(path.join(root, 'icon.png'), image.toPNG());
  console.log('icon.png généré :', image.getSize());
  app.quit();
});
