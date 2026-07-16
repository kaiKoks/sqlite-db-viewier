import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [sourceName, setSourceName] = useState('my-pc');
  const [dbPath, setDbPath] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [interval, setIntervalVal] = useState(60);
  const [logs, setLogs] = useState(['Агент готов к работе...']);
  const [isActive, setIsActive] = useState(false);
  const [lastSync, setLastSync] = useState('--:--:--');
  const terminalEndRef = useRef(null);

  useEffect(() => {
    // Загрузка сохраненной конфигурации при старте
    window.api.loadConfig().then((config) => {
      if (config.sourceName) setSourceName(config.sourceName);
      if (config.dbPath) setDbPath(config.dbPath);
      if (config.serverUrl) setServerUrl(config.serverUrl);
      if (config.interval) setIntervalVal(config.interval);
    });

    // Подписка на логи и успешную синхронизацию
    const logCleanup = window.api.onSyncLog((msg) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
    });

    const successCleanup = window.api.onSyncSuccess((timeStr) => {
      setLastSync(timeStr);
    });

    // Подписка на остановку службы из системного трея
    const stopCleanup = window.api.onExternalStop(() => {
      setIsActive(false);
    });

    return () => {
      logCleanup();
      successCleanup();
      stopCleanup();
    };
  }, []);

  // Автопрокрутка консоли вниз при появлении новых записей
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleBrowse = async () => {
    const filePath = await window.api.selectFile();
    if (filePath) setDbPath(filePath);
  };

  const handleStart = async () => {
    if (!sourceName.trim()) return alert('Укажите имя источника');
    if (!dbPath.trim()) return alert('Выберите файл базы данных');
    if (!serverUrl.trim()) return alert('Укажите адрес сервера');
    if (!interval || interval < 5) return alert('Интервал должен быть не менее 5 секунд');

    const config = { sourceName, dbPath, serverUrl, interval };
    await window.api.saveConfig(config);

    setIsActive(true);
    window.api.startSync(config);
  };

  const handleStop = () => {
    setIsActive(false);
    window.api.stopSync();
  };

  const clearLogs = () => {
    setLogs([`[${new Date().toLocaleTimeString()}] Логи очищены.`]);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-bold text-sky-400 flex items-center gap-2">
          <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          SQLite Sync Agent
        </h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Левая колонка: Настройки */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-300">Имя источника (Source Name):</label>
            <input
              type="text"
              className="w-full bg-[#252538] border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-sky-400 disabled:opacity-50"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              disabled={isActive}
              placeholder="Например: office-pc"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-300">Путь к БД SQLite:</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 bg-[#252538] border border-slate-700 rounded-lg p-2 text-white text-xs truncate focus:outline-none"
                value={dbPath}
                readOnly
                placeholder="Выберите .db файл..."
              />
              <button
                onClick={handleBrowse}
                disabled={isActive}
                className="bg-sky-500 hover:bg-sky-600 disabled:bg-slate-700 text-slate-900 font-bold px-3 py-2 rounded-lg text-sm transition-colors"
              >
                Обзор
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-300">Адрес сервера:</label>
            <input
              type="text"
              className="w-full bg-[#252538] border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-sky-400 disabled:opacity-50"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isActive}
              placeholder="https://your-app.vercel.app"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-300">Интервал синхронизации (сек):</label>
            <input
              type="number"
              className="w-full bg-[#252538] border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-sky-400 disabled:opacity-50"
              value={interval}
              onChange={(e) => setIntervalVal(parseInt(e.target.value, 10) || 60)}
              disabled={isActive}
              min="5"
            />
          </div>

          <div className="pt-2">
            {!isActive ? (
              <button
                onClick={handleStart}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Запустить службу
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="w-full bg-rose-500 hover:bg-rose-600 text-slate-900 font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
                Остановить службу
              </button>
            )}
          </div>
        </div>

        {/* Правая колонка: Статус и Консоль */}
        <div className="space-y-4">
          {/* Статус службы */}
          <div className="bg-[#252538] border border-slate-700 rounded-lg p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className={`w-3.5 h-3.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <div>
                <div className="text-xs text-slate-400">Статус службы</div>
                <div className="font-bold text-sm text-slate-200">{isActive ? 'Служба активна' : 'Служба остановлена'}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Последний обмен</div>
              <div className="font-mono font-bold text-sky-400">{lastSync}</div>
            </div>
          </div>

          <div className="bg-[#11111b] border border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-slate-900 px-3 py-2 flex justify-between items-center border-b border-slate-800 h-9">
              <span className="text-xs text-slate-400 font-mono">Консоль логов</span>
              <button onClick={clearLogs} className="text-xs text-rose-400 hover:underline">Очистить</button>
            </div>
            
            <div className="h-[240px] overflow-y-auto p-3 font-mono text-[11px] space-y-1 text-slate-300">
              {logs.map((log, index) => (
                <div key={index} className="break-all whitespace-pre-wrap leading-relaxed">
                  {log}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}