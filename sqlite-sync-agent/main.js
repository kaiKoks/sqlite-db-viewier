const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let syncIntervalId = null;
let lastMtime = 0;
let isQuitting = false;
const configPath = path.join(app.getPath('userData'), 'config.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 550,
    minWidth: 700,
    minHeight: 550,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Всегда загружаем скомпилированную сборку напрямую из папки dist
  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  // Перехват события закрытия для сворачивания в трей
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'SQLite Sync Agent',
          content: 'Приложение продолжает работу в фоновом режиме.',
          iconType: 'info'
        });
      }
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Показать агент', 
      click: () => {
        mainWindow.show();
      } 
    },
    { type: 'separator' },
    { 
      label: 'Выйти из приложения', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('SQLite Sync Agent');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Конфигурация и диалоги
ipcMain.handle('load-config', () => {
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
});

ipcMain.handle('save-config', (event, config) => {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});

// Функция отправки БД
async function performSync(config) {
  const { dbPath, serverUrl, sourceName } = config;
  const cleanUrl = serverUrl.replace(/\/$/, '');

  try {
    if (!fs.existsSync(dbPath)) {
      mainWindow.webContents.send('sync-log', `[Ошибка] Файл не найден: ${dbPath}`);
      return;
    }

    const stat = fs.statSync(dbPath);
    if (stat.mtimeMs === lastMtime) {
      mainWindow.webContents.send('sync-log', `БД без изменений (пропуск)`);
      return;
    }

    const body = fs.readFileSync(dbPath);
    const endpoint = `${cleanUrl}/api/push?source=${encodeURIComponent(sourceName)}`;

    mainWindow.webContents.send('sync-log', `Отправка БД (${(body.byteLength / 1024).toFixed(1)} KB)...`);
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(body.byteLength)
      },
      body
    });

    if (res.ok) {
      lastMtime = stat.mtimeMs;
      const timeStr = new Date().toLocaleTimeString();
      mainWindow.webContents.send('sync-log', `Успешно отправлено!`);
      mainWindow.webContents.send('sync-success', timeStr);
    } else {
      let errMsg = res.statusText;
      try {
        const json = await res.json();
        errMsg = json.error || JSON.stringify(json);
      } catch(e) {}
      mainWindow.webContents.send('sync-log', `Ошибка сервера [${res.status}]: ${errMsg}`);
    }
  } catch (err) {
    mainWindow.webContents.send('sync-log', `Ошибка сети: ${err.message}`);
  }
}

ipcMain.on('start-sync', (event, config) => {
  if (syncIntervalId) clearInterval(syncIntervalId);
  lastMtime = 0;
  
  performSync(config);

  const intervalMs = (parseInt(config.interval, 10) || 60) * 1000;
  syncIntervalId = setInterval(() => {
    performSync(config);
  }, intervalMs);
});

ipcMain.on('stop-sync', () => {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    mainWindow.webContents.send('sync-log', `Синхронизация остановлена.`);
  }
});