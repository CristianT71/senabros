const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('senaNative', {
  kind: 'windows',
  version: ipcRenderer.sendSync('app:version'),
  check: () => ipcRenderer.invoke('upd:check'),
  download: () => ipcRenderer.invoke('upd:download'),
  install: () => ipcRenderer.invoke('upd:install'),
  onUpdate: cb => ipcRenderer.on('upd', (_, d) => cb(d))
});
