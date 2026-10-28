const { contextBridge, ipcRenderer } = require('electron');

// Only used by the local setup / offline screens.
contextBridge.exposeInMainWorld('gamut', {
  setServer: (url) => ipcRenderer.invoke('gamut:set-server', url),
  getConfig: () => ipcRenderer.invoke('gamut:get-config'),
  retry: () => ipcRenderer.invoke('gamut:retry'),
});
