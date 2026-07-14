const inputSourceName = document.getElementById('sourceName');
const inputDbPath = document.getElementById('dbPath');
const inputServerUrl = document.getElementById('serverUrl');
const inputInterval = document.getElementById('interval');

const btnBrowse = document.getElementById('btnBrowse');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const lastSyncTime = document.getElementById('lastSyncTime');
const terminal = document.getElementById('terminal');

// Логирование в "консоль" на UI
function logToTerminal(message) {
  const timestamp = new Date().toLocaleTimeString();
  terminal.innerText += `\n[${timestamp}] ${message}`;
  terminal.scrollTop = terminal.scrollHeight; // автопрокрутка вниз
}

// Загрузка настроек при старте приложения
window.addEventListener('DOMContentLoaded', async () => {
  const config = await window.api.loadConfig();
  if (config.sourceName) inputSourceName.value = config.sourceName;
  if (config.dbPath) inputDbPath.value = config.dbPath;
  if (config.serverUrl) inputServerUrl.value = config.serverUrl;
  if (config.interval) inputInterval.value = config.interval;
});

// Кнопка "Обзор"
btnBrowse.addEventListener('click', async () => {
  const filePath = await window.api.selectFile();
  if (filePath) {
    inputDbPath.value = filePath;
  }
});

// Кнопка "Старт"
btnStart.addEventListener('click', async () => {
  const sourceName = inputSourceName.value.trim();
  const dbPath = inputDbPath.value.trim();
  const serverUrl = inputServerUrl.value.trim();
  const interval = parseInt(inputInterval.value, 10);

  // Валидация
  if (!sourceName) {
    alert('Пожалуйста, укажите имя источника.');
    return;
  }
  if (!dbPath) {
    alert('Пожалуйста, выберите файл базы данных SQLite.');
    return;
  }
  if (!serverUrl) {
    alert('Пожалуйста, укажите адрес сервера SQLite Viewer.');
    return;
  }
  if (isNaN(interval) || interval < 5) {
    alert('Интервал должен быть не менее 5 секунд.');
    return;
  }

  const config = { sourceName, dbPath, serverUrl, interval };

  // Сохраняем конфигурацию
  await window.api.saveConfig(config);

  // Меняем интерфейс в режим "Активен"
  btnStart.style.display = 'none';
  btnStop.style.display = 'inline-block';
  
  // Блокируем поля во время работы
  inputSourceName.disabled = true;
  inputServerUrl.disabled = true;
  inputInterval.disabled = true;
  btnBrowse.disabled = true;

  statusDot.classList.add('active');
  statusText.innerText = 'Активен (синхронизация запущена)';

  // Передаем команду в main процесс
  window.api.startSync(config);
});

// Кнопка "Стоп"
btnStop.addEventListener('click', () => {
  // Меняем интерфейс обратно
  btnStart.style.display = 'inline-block';
  btnStop.style.display = 'none';

  inputSourceName.disabled = false;
  inputServerUrl.disabled = false;
  inputInterval.disabled = false;
  btnBrowse.disabled = false;

  statusDot.classList.remove('active');
  statusText.innerText = 'Остановлено';

  window.api.stopSync();
});

// Принимаем логи из фонового процесса
window.api.onSyncLog((msg) => {
  logToTerminal(msg);
});

// При успешной отправке обновляем время последнего обмена
window.api.onSyncSuccess((timeStr) => {
  lastSyncTime.innerText = timeStr;
});