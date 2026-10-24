'use strict';
/**
 * Génère icon.png (512x512) à partir de icon.svg avec le moteur Chromium d'Electron.
 * Usage : npm run make-icon
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`;
  const tmp = path.join(__dirname, '_icon.html');
  fs.writeFileSync(tmp, html);

  const win = new BrowserWindow({
    width: 512, height: 512, show: false, transparent: true, frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  });
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 600));
  let img = await win.webContents.capturePage();
  const size = img.getSize();
  if (size.width !== 512) img = img.resize({ width: 512, height: 512, quality: 'best' });
  fs.writeFileSync(path.join(root, 'icon.png'), img.toPNG());
  fs.unlinkSync(tmp);
  console.log('icon.png généré', img.getSize());
  app.quit();
});
