/**
 * ArchiPoly Studio — Master Electron Process
 * Window: 1680x1000 px, background #0e0f11, frameless/clean architectural header
 */

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure Electron userData path is available to server.js before requiring it
try {
  process.env.ARCHIPOLY_USER_DATA = app.getPath('userData');
  if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    const candidates = [
      path.join(exeDir, 'Workspace_Materials'),
      path.resolve(exeDir, '..', 'Workspace_Materials'),
      path.resolve(exeDir, '..', '..', 'Workspace_Materials')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          const files = fs.readdirSync(c);
          if (files.length > 0) {
            process.env.ARCHIPOLY_MATERIALS_DIR = c;
            break;
          }
        } catch (_) {}
      }
    }
  }
} catch (_) {}

// Launch master Express backend
const { server, materialsDir, getMaterialsDir } = require('./server.js');

let mainWindow = null;
const SERVER_PORT = process.env.PORT || 3800;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1280,
    minHeight: 760,
    title: "ArchiPoly — Architectural 3D Studio",
    backgroundColor: '#0e0f11',
    frame: false,
    fullscreen: true,
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true, // Injects archforgeDesktop bridge into workspace iframes
      sandbox: false,
      backgroundThrottling: false, // Ensures active WebGL stays fast
      webSecurity: false // Allows smooth iframe communication and blob textures
    }
  });

  mainWindow.removeMenu();

  // Load backend server URL with exponential backoff retry
  let retries = 0;
  function connectToServer() {
    mainWindow.loadURL(SERVER_URL).then(() => {
      console.log('[Electron] Connected to ArchiPoly Studio Hub.');
    }).catch(() => {
      retries++;
      if (retries < 25) {
        setTimeout(connectToServer, 250);
      }
    });
  }

  setTimeout(connectToServer, 350);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external web links in OS default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent navigation away from the hub
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SERVER_URL)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -----------------------------------------------------------------------------
// IPC HANDLERS
// -----------------------------------------------------------------------------

// Open materials directory in Windows Explorer
ipcMain.handle('app:open-materials-folder', async (_event, subPath = '') => {
  const currentDir = (typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir;
  const target = subPath ? path.join(currentDir, subPath) : currentDir;
  if (fs.existsSync(target)) {
    await shell.openPath(target);
    return { success: true, path: target };
  } else {
    await shell.openPath(currentDir);
    return { success: true, path: currentDir };
  }
});

// Reveal specific file in folder
ipcMain.handle('app:reveal-file', async (_event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return { success: true };
  }
  return { success: false, error: 'Fichier introuvable' };
});

// Return system info
ipcMain.handle('app:get-info', async () => {
  const currentDir = (typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir;
  return {
    version: app.getVersion(),
    materialsPath: currentDir,
    userDataPath: app.getPath('userData'),
    isPackaged: app.isPackaged
  };
});

// Native directory picker (non-modal to avoid fullscreen Win32 lockup)
ipcMain.handle('dialog:pick-directory', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Importer un dossier de matériau PBR',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths[0];
  } catch (err) {
    console.error('[Dialog Error - pick-directory]', err);
    return null;
  }
});

// Native texture files picker (non-modal to avoid fullscreen Win32 lockup)
ipcMain.handle('dialog:pick-texture-files', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Importer des textures PBR',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Textures PBR', extensions: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'exr'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths;
  } catch (err) {
    console.error('[Dialog Error - pick-texture-files]', err);
    return null;
  }
});

// Window controls
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
