const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  startSync: (config) => ipcRenderer.send('start-sync', config),
  stopSync: () => ipcRenderer.send('stop-sync'),
  onSyncLog: (callback) => {
    const listener = (event, value) => callback(value);
    ipcRenderer.on('sync-log', listener);
    return () => ipcRenderer.off('sync-log', listener);
  },
  onSyncSuccess: (callback) => {
    const listener = (event, value) => callback(value);
    ipcRenderer.on('sync-success', listener);
    return () => ipcRenderer.off('sync-success', listener);
  }
});