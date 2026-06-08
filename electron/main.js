const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let notificationTimers = [];
let todaySchedule = null;
let midnightTimer = null;

const WINDOWS = [
  { key: 'morning', label: '오전', start: 8, end: 10, message: '좋은 아침이에요 🌱 잠깐 들르실래요?' },
  { key: 'afternoon', label: '오후', start: 13, end: 15, message: '오후에 잠깐 멈춰서 나를 돌아볼 시간이에요' },
  { key: 'evening', label: '저녁', start: 19, end: 21, message: '오늘 하루 어땠나요? 잠깐 기록해볼까요?' }
];

function pad2(n) { return String(n).padStart(2, '0'); }

function localDate(d) {
  const date = d || new Date();
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join('-');
}

function randomTimeForWindow(baseDate, w) {
  const hour = w.start + Math.floor(Math.random() * (w.end - w.start + 1));
  const minute = Math.floor(Math.random() * 60);
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute);
}

function generateForDate(baseDate) {
  return WINDOWS.map(w => ({
    ...w,
    scheduledAt: randomTimeForWindow(baseDate, w)
  }));
}

function scheduleNotifications() {
  clearNotificationTimers();
  const now = Date.now();

  if (!todaySchedule || todaySchedule.date !== localDate()) {
    todaySchedule = {
      date: localDate(),
      windows: generateForDate(new Date())
    };
  }

  todaySchedule.windows.forEach(w => {
    const delay = w.scheduledAt.getTime() - now;
    if (delay > 0 && delay < 86400000) {
      const timer = setTimeout(() => {
        const n = new Notification({
          title: 'MoodGarden 🌱',
          body: w.message,
          silent: false
        });
        n.on('click', () => {
          showWindow();
          mainWindow.webContents.send('open-checkin');
        });
        n.show();
      }, delay);
      notificationTimers.push(timer);
    }
  });
}

function clearNotificationTimers() {
  notificationTimers.forEach(t => clearTimeout(t));
  notificationTimers = [];
}

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  midnightTimer = setTimeout(() => {
    todaySchedule = { date: localDate(), windows: generateForDate(new Date()) };
    scheduleNotifications();
    scheduleMidnightRefresh();
  }, midnight.getTime() - now.getTime());
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function createTrayIcon() {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4);
  // Simple leaf shape as template image (black/alpha only for macOS)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x - size / 2;
      const cy = y - size / 2;
      const idx = (y * size + x) * 4;
      // Stem
      const onStem = Math.abs(cx) < 1.5 && cy > -2 && cy < 8;
      // Left leaf
      const onLeft = cx < 0 && cx > -7 && cy < 1 && cy > -6 &&
        (cx + 3) * (cx + 3) / 36 + (cy + 3) * (cy + 3) / 16 < 1;
      // Right leaf
      const onRight = cx > 0 && cx < 7 && cy < 1 && cy > -6 &&
        (cx - 3) * (cx - 3) / 36 + (cy + 3) * (cy + 3) / 16 < 1;
      if (onStem || onLeft || onRight) {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = onStem ? 200 : 180;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('MoodGarden');

  const contextMenu = Menu.buildFromTemplate([
    { label: '열기', click: showWindow },
    { label: '지금 체크인', click: () => { showWindow(); mainWindow.webContents.send('open-checkin'); } },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', showWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 740,
    minWidth: 380,
    minHeight: 600,
    title: 'MoodGarden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// IPC handlers
ipcMain.handle('save-csv', async (event, csvContent, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'CSV 내보내기',
    defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, '\ufeff' + csvContent, 'utf-8');
    return result.filePath;
  }
  return null;
});

ipcMain.handle('import-csv', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'CSV 가져오기',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return fs.readFileSync(result.filePaths[0], 'utf-8');
  }
  return null;
});

ipcMain.handle('export-json', async (event, jsonContent, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'JSON 내보내기',
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, jsonContent, 'utf-8');
    return result.filePath;
  }
  return null;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduleNotifications();
  scheduleMidnightRefresh();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', showWindow);

app.on('before-quit', () => {
  app.isQuitting = true;
  clearNotificationTimers();
  if (midnightTimer) clearTimeout(midnightTimer);
});
