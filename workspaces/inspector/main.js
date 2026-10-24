'use strict';

const { app, BrowserWindow, Menu, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// Une seule instance de l'application à la fois.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/* --------------------------------------------------------------------------
   Arguments de ligne de commande
     <fichier.glb> …   ouvre les modèles passés en argument
     --dev             active F12 (outils de développement)
     --shot=<png>      enregistre une capture de la fenêtre puis quitte (tests)
     --exec=<js>       exécute un script dans la page après chargement (tests)
     --mode=<mode>     shaded | overlay | wire | uv
     --drawer          ouvre le tiroir d'inspection au démarrage
     --hidepanels      masque les panneaux latéraux au démarrage
   -------------------------------------------------------------------------- */
const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'dae', 'stl', 'ply'];
const RESOURCE_EXTS = ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'ktx2'];
const argv = process.argv.slice(1);
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const shotPath = flag('shot');
const execPath = flag('exec');

function collectStartupFiles() {
  const out = [];
  const main = argv.find((a) => !a.startsWith('--') && MODEL_EXTS.includes(path.extname(a).slice(1).toLowerCase()) && fs.existsSync(a));
  if (!main) return out;
  const mainExt = path.extname(main).slice(1).toLowerCase();
  const push = (p) => out.push({ name: path.basename(p), data: fs.readFileSync(p) });
  push(main);
  // Ressources voisines (textures, .bin, .mtl) pour les formats multi-fichiers
  if (['gltf', 'obj', 'fbx', 'dae'].includes(mainExt)) {
    const dir = path.dirname(main);
    try {
      fs.readdirSync(dir)
        .filter((f) => RESOURCE_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
        .slice(0, 300)
        .forEach((f) => {
          const p = path.join(dir, f);
          if (fs.statSync(p).size < 64 * 1024 * 1024) push(p);
        });
    } catch { /* ignoré */ }
  }
  return out;
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1550,
    height: 950,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0e0f11',
    title: '3D Viewer Studio',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const query = {};
  if (flag('mode')) query.mode = flag('mode');
  if (argv.includes('--drawer')) query.drawer = '1';
  if (argv.includes('--hidepanels')) query.hidepanels = '1';
  mainWindow.loadFile(path.join(__dirname, 'index.html'), { query });

  // Un fichier déposé ne doit jamais faire naviguer la fenêtre.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  if (shotPath || execPath) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${path.basename(source || '')}:${line})`);
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (argv.includes('--dev')) {
    mainWindow.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') mainWindow.webContents.toggleDevTools();
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Les captures HD sont enregistrées directement dans le dossier Téléchargements.
function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    const dir = app.getPath('downloads');
    const parsed = path.parse(item.getFilename());
    let target = path.join(dir, parsed.base);
    for (let i = 1; fs.existsSync(target); i++) {
      target = path.join(dir, `${parsed.name} (${i})${parsed.ext}`);
    }
    item.setSavePath(target);
    item.once('done', (_e, state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-done', { state, path: target });
      }
    });
  });
}

async function takeShotAndQuit() {
  setTimeout(async () => {
    try {
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.resolve(shotPath), image.toPNG());
    } finally {
      app.quit();
    }
  }, 2500);
}

async function afterLoad() {
  if (execPath && mainWindow) {
    try {
      const result = await mainWindow.webContents.executeJavaScript(fs.readFileSync(path.resolve(execPath), 'utf8'));
      console.log('[exec]', typeof result === 'string' ? result : JSON.stringify(result, null, 1));
    } catch (err) {
      console.log('[exec:error]', err && err.message);
    }
  }
  if (shotPath) takeShotAndQuit();
}

ipcMain.on('renderer-ready', (event) => {
  const files = collectStartupFiles();
  if (files.length) event.sender.send('open-files', files);
  else if (shotPath || execPath) afterLoad();
});
ipcMain.on('renderer-loaded', () => { if (shotPath || execPath) afterLoad(); });

ipcMain.on('reveal-file', (_e, filePath) => {
  if (typeof filePath === 'string' && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  setupDownloads();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
