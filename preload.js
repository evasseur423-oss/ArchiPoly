/**
 * ArchiPoly — Preload Script
 * Secure IPC bridge between Electron and Studio Hub interface
 */

const { contextBridge, ipcRenderer } = require('electron');

// Main ArchiPoly Desktop Bridge
contextBridge.exposeInMainWorld('archforgeDesktop', {
  isElectron: true,
  platform: process.platform,
  openMaterialsFolder: (subPath) => ipcRenderer.invoke('app:open-materials-folder', subPath),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  revealFile: (filePath) => ipcRenderer.invoke('app:reveal-file', filePath),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
  pickTextureFiles: () => ipcRenderer.invoke('dialog:pick-texture-files'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onOpenFile: (callback) => ipcRenderer.on('app:open-file', (_e, data) => callback(data))
});

// Full compatibility bridge for 3D Inspector workspace
contextBridge.exposeInMainWorld('studio', {
  onDownloadDone: (callback) => ipcRenderer.on('download-done', (_e, payload) => callback(payload)),
  revealFile: (filePath) => ipcRenderer.invoke('app:reveal-file', filePath),
  onOpenFiles: (callback) => ipcRenderer.on('open-files', (_e, files) => callback(files)),
  ready: () => ipcRenderer.send('renderer-ready'),
  loaded: () => ipcRenderer.send('renderer-loaded')
});
