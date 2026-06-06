const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveCSV: (content, defaultName) => ipcRenderer.invoke('save-csv', content, defaultName),
  exportJSON: (content, defaultName) => ipcRenderer.invoke('export-json', content, defaultName),
  onOpenCheckin: (callback) => ipcRenderer.on('open-checkin', callback)
});
