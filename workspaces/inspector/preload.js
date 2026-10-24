'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Pont minimal et sécurisé entre le processus principal et la page.
contextBridge.exposeInMainWorld('studio', {
  // Retour des téléchargements (captures HD)
  onDownloadDone: (callback) => ipcRenderer.on('download-done', (_e, payload) => callback(payload)),
  revealFile: (filePath) => ipcRenderer.send('reveal-file', filePath),

  // Ouverture de fichiers passés en ligne de commande (« Ouvrir avec… »)
  onOpenFiles: (callback) => ipcRenderer.on('open-files', (_e, files) => callback(files)),
  ready: () => ipcRenderer.send('renderer-ready'),
  loaded: () => ipcRenderer.send('renderer-loaded'),
});
