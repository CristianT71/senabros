const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('senaNative', {
  kind: 'windows',
  version: ipcRenderer.sendSync('app:version'),
  check: () => ipcRenderer.invoke('upd:check'),
  download: () => ipcRenderer.invoke('upd:download'),
  install: () => ipcRenderer.invoke('upd:install'),
  onAuthUrl: cb => ipcRenderer.on('authurl', (_, u) => cb(u)),
  onUpdate: cb => ipcRenderer.on('upd', (_, d) => cb(d))
});
