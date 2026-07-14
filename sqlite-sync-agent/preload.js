const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  selectFile: () => ipcRenderer.invoke('select-file'),
  startSync: (config) => ipcRenderer.send('start-sync', config),
  stopSync: () => ipcRenderer.send('stop-sync'),
  
  // Подписка на логи
  onSyncLog: (callback) => {
    const subscription = (event, msg) => callback(msg);
    ipcRenderer.on('sync-log', subscription);
    return () => ipcRenderer.removeListener('sync-log', subscription);
  },
  
  // Подписка на статус успешной синхронизации
  onSyncSuccess: (callback) => {
    const subscription = (event, timeStr) => callback(timeStr);
    ipcRenderer.on('sync-success', subscription);
    return () => ipcRenderer.removeListener('sync-success', subscription);
  },

  // Оповещение об остановке службы из системного трея
  onExternalStop: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('external-stop', subscription);
    return () => ipcRenderer.removeListener('external-stop', subscription);
  }
});