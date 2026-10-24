'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('archAPI', {
  isElectron: true,
  saveReportHtml: (html, name) => ipcRenderer.invoke('report:save-html', html, name),
  saveReportPdf: (html, name) => ipcRenderer.invoke('report:save-pdf', html, name),
  previewReport: (html) => ipcRenderer.invoke('report:preview', html)
});
