const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1280,
    minHeight: 768,
    backgroundColor: '#0e0f11',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    title: 'PBR Alchemist Studio',
    titleBarStyle: 'default',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false // allow loading local sample textures and blob URLs seamlessly
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on('console-message', (event) => {
    console.log('[Renderer]', event.message);
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Automated test mode
  if (process.argv.includes('--test')) {
    mainWindow.webContents.once('did-finish-load', async () => {
      console.log('[TEST] Application loaded. Waiting 3.5s for initial PBR computation...');
      await new Promise(r => setTimeout(r, 3500));

      const screenshot = await mainWindow.webContents.capturePage();
      const previewPath = path.join(__dirname, 'app_preview.png');
      fs.writeFileSync(previewPath, screenshot.toPNG());
      console.log(`[TEST] Screenshot saved to ${previewPath}`);

      // Trigger export via renderer evaluate
      console.log('[TEST] Triggering automated pack export...');
      const exportRes = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const btn = document.getElementById('btnExportPack');
          if (btn) btn.click();
          await new Promise(r => setTimeout(r, 2000));
          return {
            canvasWidth: document.getElementById('inspectorCanvas').width,
            has3D: !!document.querySelector('#threeViewport canvas')
          };
        })()
      `);
      console.log('[TEST] Export triggered. Verification status:', exportRes);

      // Verify files in exported_materials
      const testDir = path.join(__dirname, 'exported_materials', 'Beton', 'Beton_Brut_01');
      console.log(`[TEST] Checking exported folder: ${testDir}`);
      if (fs.existsSync(testDir)) {
        const files = fs.readdirSync(testDir);
        console.log('[TEST] Exported files found:', files);
      }

      console.log('[TEST] SUCCESS! Closing application.');
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==================== IPC HANDLERS ====================

// Default export directory: in user's Documents or local ./exported_materials
ipcMain.handle('app:get-default-export-dir', async () => {
  const localDefault = path.join(__dirname, 'exported_materials');
  if (!fs.existsSync(localDefault)) {
    try {
      fs.mkdirSync(localDefault, { recursive: true });
    } catch (e) {
      console.warn('Could not create default exported_materials folder:', e);
    }
  }
  return localDefault;
});

// Directory selection dialog
ipcMain.handle('dialog:select-directory', async (event, defaultPath) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner le dossier de destination pour le pack PBR',
    defaultPath: defaultPath || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Single image file selection dialog
ipcMain.handle('dialog:open-image-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer une photographie de texture brute',
    properties: ['openFile'],
    filters: [
      { name: 'Images de texture', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
  const base64 = `data:${mime};base64,${buffer.toString('base64')}`;

  return {
    path: filePath,
    name: path.basename(filePath, path.extname(filePath)),
    dataUrl: base64
  };
});

// Read local sample image
ipcMain.handle('app:load-sample-image', async (event, sampleFileName) => {
  const filePath = path.join(__dirname, 'samples', sampleFileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sample file not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  return {
    path: filePath,
    name: path.basename(filePath, path.extname(filePath)),
    dataUrl: base64
  };
});

// Export PBR pack to disk
ipcMain.handle('export:save-pack', async (event, payload) => {
  try {
    const { outputDir, materialName, category, subfolder, maps, meta } = payload;

    if (!outputDir) {
      throw new Error("Le dossier de destination n'est pas spécifié.");
    }
    if (!materialName) {
      throw new Error("Le nom du matériau n'est pas spécifié.");
    }

    // Determine target directory: optionally subcategorized or directly inside
    let targetDir = outputDir;
    if (category && category.trim()) {
      targetDir = path.join(outputDir, category.trim());
    }
    if (subfolder) {
      targetDir = path.join(targetDir, materialName);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const savedFiles = [];

    // Helper to decode dataUrl and save file
    const saveMap = (mapDataUrl, suffix) => {
      if (!mapDataUrl) return;
      const cleanBase64 = mapDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const fileName = `${materialName}_${suffix}.png`;
      const fullPath = path.join(targetDir, fileName);
      fs.writeFileSync(fullPath, buffer);
      savedFiles.push({ name: fileName, path: fullPath, size: buffer.length });
    };

    // Strict naming specification:
    // [Nom]_baseColor.png
    // [Nom]_normal.png
    // [Nom]_roughness.png
    // [Nom]_height.png
    // [Nom]_ambientOcclusion.png
    saveMap(maps.baseColor, 'baseColor');
    saveMap(maps.normal, 'normal');
    saveMap(maps.roughness, 'roughness');
    saveMap(maps.height, 'height');
    saveMap(maps.ambientOcclusion, 'ambientOcclusion');

    // Save metadata JSON
    const metaFile = `${materialName}_material.json`;
    const metaPath = path.join(targetDir, metaFile);
    const metaContent = {
      name: materialName,
      category: category || 'General',
      resolution: meta.resolution || 2048,
      exportedAt: new Date().toISOString(),
      maps: {
        baseColor: `${materialName}_baseColor.png`,
        normal: `${materialName}_normal.png`,
        roughness: `${materialName}_roughness.png`,
        height: `${materialName}_height.png`,
        ambientOcclusion: `${materialName}_ambientOcclusion.png`
      },
      settings: meta.settings || {}
    };
    fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2), 'utf8');
    savedFiles.push({ name: metaFile, path: metaPath, size: Buffer.byteLength(JSON.stringify(metaContent)) });

    return {
      success: true,
      targetDir,
      files: savedFiles,
      count: savedFiles.length
    };
  } catch (err) {
    console.error('Error during export:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// Open folder in Windows Explorer
ipcMain.handle('shell:open-folder', async (event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
    return true;
  }
  return false;
});
