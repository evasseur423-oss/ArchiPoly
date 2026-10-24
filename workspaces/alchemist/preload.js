const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alchemistAPI', {
  getDefaultExportDir: () => ipcRenderer.invoke('app:get-default-export-dir'),
  selectDirectory: (defaultPath) => ipcRenderer.invoke('dialog:select-directory', defaultPath),
  openImageFile: () => ipcRenderer.invoke('dialog:open-image-file'),
  loadSampleImage: (sampleName) => ipcRenderer.invoke('app:load-sample-image', sampleName),
  exportPack: (payload) => ipcRenderer.invoke('export:save-pack', payload),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:open-folder', folderPath)
});
