const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let syncIntervalId = null;
let lastMtime = 0;
let isQuitting = false;
const configPath = path.join(app.getPath('userData'), 'config.json');

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  const hasIcon = fs.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: 850,
    height: 550,
    minWidth: 700,
    minHeight: 550,
    icon: hasIcon ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        try {
          tray.displayBalloon({
            title: 'SQLite Sync Agent',
            content: 'Приложение свернуто в трей и продолжает работу.',
            iconType: 'info'
          });
        } catch (e) {
          console.log('Не удалось показать уведомление трея');
        }
      }
    }
  });
}

// Динамическое меню: меняет текст кнопки "Запустить/Остановить"
function updateTrayMenu() {
  if (!tray) return;

  const isSyncing = syncIntervalId !== null;

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Открыть', 
      click: () => {
        showAndFocusWindow();
      } 
    },
    { 
      label: isSyncing ? 'Остановить службу' : 'Запустить службу', 
      click: () => {
        if (isSyncing) {
          stopSyncLogic();
        } else {
          startSyncFromTray();
        }
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

  tray.setContextMenu(contextMenu);
}

function showAndFocusWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  
  if (!fs.existsSync(iconPath)) {
    console.warn('\x1b[33m%s\x1b[0m', '[Предупреждение] Файл icon.png не найден. Трей не создан.');
    return;
  }

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('SQLite Sync Agent');
    updateTrayMenu();

    tray.on('click', () => {
      showAndFocusWindow();
    });
  } catch (err) {
    console.error('Ошибка создания трея:', err.message);
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showAndFocusWindow();
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

// Работа с конфигурацией
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

// Отправка базы данных
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

// Логика запуска службы
function startSyncLogic(config) {
  if (syncIntervalId) clearInterval(syncIntervalId);
  lastMtime = 0;
  
  performSync(config);

  const intervalMs = (parseInt(config.interval, 10) || 60) * 1000;
  syncIntervalId = setInterval(() => {
    performSync(config);
  }, intervalMs);

  updateTrayMenu();
}

// Логика запуска службы из системного трея (считывает сохраненный конфиг)
function startSyncFromTray() {
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.dbPath && config.serverUrl && config.sourceName) {
        startSyncLogic(config);
        if (mainWindow) {
          mainWindow.webContents.send('external-start', config);
        }
      } else {
        showAndFocusWindow();
        dialog.showErrorBox('Запуск службы', 'Сначала заполните все поля настроек в открывшемся окне приложения.');
      }
    } catch (e) {
      showAndFocusWindow();
      dialog.showErrorBox('Ошибка', 'Не удалось прочитать файл конфигурации.');
    }
  } else {
    showAndFocusWindow();
    dialog.showErrorBox('Запуск службы', 'Сначала укажите параметры синхронизации в интерфейсе приложения.');
  }
}

// Логика остановки службы
function stopSyncLogic() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    updateTrayMenu();
    if (mainWindow) {
      mainWindow.webContents.send('sync-log', `Синхронизация остановлена.`);
      mainWindow.webContents.send('external-stop');
    }
  }
}

ipcMain.on('start-sync', (event, config) => {
  startSyncLogic(config);
});

ipcMain.on('stop-sync', () => {
  stopSyncLogic();
});