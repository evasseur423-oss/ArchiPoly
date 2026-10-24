'use strict';
/**
 * ArchPhysics Studio — processus principal Electron.
 * Fenêtre native sans barre de menu, 1650x980, fond #0e0f11.
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1650,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0e0f11',
    icon: path.join(__dirname, 'icon.png'),
    title: 'ArchPhysics Studio',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Raccourcis utiles malgré l'absence de menu
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F12' || (ctrl && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (ctrl && input.key.toLowerCase() === 'r') {
      mainWindow.webContents.reload();
    }
  });

  // Liens externes -> navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ------------------------------------------------------------------ */
/*  Export de la note de calcul                                        */
/* ------------------------------------------------------------------ */
function writeTempHtml(html) {
  const file = path.join(os.tmpdir(), `archphysics-note-${Date.now()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

ipcMain.handle('report:save-html', async (_e, html, suggested) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer la note de calcul (HTML)',
    defaultPath: suggested || 'Note-de-calcul-ArchPhysics.html',
    filters: [{ name: 'Document HTML', extensions: ['html'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, html, 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('report:save-pdf', async (_e, html, suggested) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer la note de calcul (PDF)',
    defaultPath: (suggested || 'Note-de-calcul-ArchPhysics.html').replace(/\.html?$/i, '.pdf'),
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { ok: false };
  const tmp = writeTempHtml(html);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 400));
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'default' }
    });
    fs.writeFileSync(filePath, pdf);
    return { ok: true, filePath };
  } finally {
    win.destroy();
    fs.unlink(tmp, () => {});
  }
});

ipcMain.handle('report:preview', async (_e, html) => {
  const tmp = writeTempHtml(html);
  const win = new BrowserWindow({
    width: 1000,
    height: 900,
    parent: mainWindow || undefined,
    backgroundColor: '#ffffff',
    title: 'Note de calcul — ArchPhysics Studio',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { sandbox: true }
  });
  win.removeMenu();
  await win.loadFile(tmp);
  win.on('closed', () => fs.unlink(tmp, () => {}));
  return { ok: true };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
