const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0e0f11',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Allows loading local models and assets easily
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.TEST_MODE === '1') {
      console.log('ELECTRON_TEST_READY: Window showed successfully!');
      setTimeout(() => app.quit(), 1500);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler for Native File Open Dialog
ipcMain.handle('dialog:open-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer un fichier 3D (Architecture)',
    filters: [
      { name: 'Modèles 3D compatibles', extensions: ['stl', 'obj', 'gltf', 'glb', 'fbx'] },
      { name: 'Stéréolithographie (*.stl)', extensions: ['stl'] },
      { name: 'Wavefront OBJ (*.obj)', extensions: ['obj'] },
      { name: 'GL Transmission Format (*.gltf, *.glb)', extensions: ['gltf', 'glb'] },
      { name: 'Filmbox FBX (*.fbx)', extensions: ['fbx'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileExt = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  return {
    name: fileName,
    ext: fileExt,
    path: filePath,
    buffer: fileBuffer.buffer
  };
});

// IPC handler for Native File Save Dialog (SVG, DXF, etc.)
ipcMain.handle('dialog:save-file', async (event, { defaultName, content, filterType }) => {
  let filters = [];
  if (filterType === 'svg') {
    filters = [{ name: 'Planches de découpe Vectorielles (*.svg)', extensions: ['svg'] }];
  } else if (filterType === 'dxf') {
    filters = [{ name: 'Fichiers CAO AutoCAD / Rhino (*.dxf)', extensions: ['dxf'] }];
  } else {
    filters = [{ name: 'Tous les fichiers', extensions: ['*'] }];
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le plan de fabrication',
    defaultPath: defaultName || 'maquette-plans',
    filters: filters
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content, typeof content === 'string' ? 'utf8' : undefined);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
