const Scheduler = {
  WINDOWS: [
    { key: 'morning', label: '오전 체크인', start: 8, end: 10, message: '좋은 아침이에요 🌱 잠깐 들르실래요?' },
    { key: 'afternoon', label: '오후 체크인', start: 13, end: 15, message: '오후에 잠깐 멈춰서 나를 돌아볼 시간이에요' },
    { key: 'evening', label: '저녁 체크인', start: 19, end: 21, message: '오늘 하루 어땠나요? 잠깐 기록해볼까요?' }
  ],

  localDate(date) {
    if (typeof MG !== 'undefined' && MG.toLocalDate) return MG.toLocalDate(date);
    const d = date ? new Date(date) : new Date();
    const pad = value => String(value).padStart(2, '0');
    return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  },

  randomTimeForWindow(baseDate, windowDef) {
    const hour = windowDef.start + Math.floor(Math.random() * (windowDef.end - windowDef.start + 1));
    const minute = Math.floor(Math.random() * 60);
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute);
  },

  generateForDate(baseDate) {
    return this.WINDOWS.map(w => ({
      ...w,
      scheduledAt: this.randomTimeForWindow(baseDate, w).toISOString()
    }));
  },

  generateForToday() {
    return this.generateForDate(new Date());
  },

  generateForTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.generateForDate(tomorrow);
  },

  hydrateWindow(windowDef) {
    return {
      ...windowDef,
      scheduledAtDate: new Date(windowDef.scheduledAt)
    };
  },

  getWindowForTime(date) {
    const target = date ? new Date(date) : new Date();
    const minutes = target.getHours() * 60 + target.getMinutes();
    return this.WINDOWS.find(w => {
      const startMin = w.start * 60;
      const endMin = w.end * 60 + 59;
      return minutes >= startMin && minutes <= endMin;
    }) || null;
  },

  getNearestWindow(date) {
    const target = date ? new Date(date) : new Date();
    const schedule = this.ensureSchedule();
    const candidates = schedule.today.length ? schedule.today : this.WINDOWS;

    return candidates.reduce((nearest, current) => {
      const currentDate = current.scheduledAtDate || new Date(current.scheduledAt || target);
      const diff = Math.abs(currentDate.getTime() - target.getTime());
      if (!nearest || diff < nearest.diff) return { window: current, diff };
      return nearest;
    }, null).window;
  },

  getSubmissionWindow(date) {
    const target = date ? new Date(date) : new Date();
    const activeWindow = this.getWindowForTime(target);
    if (activeWindow) {
      const scheduled = this.getWindowByKey(activeWindow.key) || activeWindow;
      return { ...scheduled, isWithinWindow: true };
    }

    const nearest = this.getNearestWindow(target);
    return { ...nearest, isWithinWindow: false };
  },

  ensureSchedule() {
    const today = this.localDate();
    let schedule = MG.getSchedule();

    if (!schedule || schedule.date !== today) {
      schedule = {
        date: today,
        today: this.generateForToday(),
        tomorrow: this.generateForTomorrow()
      };
      MG.saveSchedule(schedule);
    }

    return {
      ...schedule,
      today: schedule.today.map(w => this.hydrateWindow(w)),
      tomorrow: schedule.tomorrow.map(w => this.hydrateWindow(w))
    };
  },

  getCurrentWindow() {
    const schedule = this.ensureSchedule();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const w of schedule.today) {
      const startMin = w.start * 60;
      const endMin = w.end * 60 + 59;
      if (nowMinutes >= startMin && nowMinutes <= endMin) {
        return w;
      }
    }

    let nextWindow = null;
    let nextDiff = Infinity;
    for (const w of schedule.today) {
      const wDate = w.scheduledAtDate;
      const wMin = wDate.getHours() * 60 + wDate.getMinutes();
      const diff = wMin - nowMinutes;
      if (diff > 0 && diff < nextDiff) {
        nextDiff = diff;
        nextWindow = w;
      }
    }

    return nextWindow || schedule.tomorrow[0] || schedule.today[0];
  },

  getWindowByKey(key) {
    return this.ensureSchedule().today.find(w => w.key === key) || this.WINDOWS.find(w => w.key === key) || null;
  },

  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  scheduleNotifications() {
    const schedule = this.ensureSchedule();

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const now = Date.now();

    [...schedule.today, ...schedule.tomorrow].forEach(w => {
      const scheduledAt = w.scheduledAtDate || new Date(w.scheduledAt);
      const delay = scheduledAt.getTime() - now;
      if (delay > 0) {
        setTimeout(() => {
          new Notification('MoodGarden 🌱', { body: w.message, icon: '🌱' });
        }, delay);
      }
    });
  }
};

if (typeof module !== 'undefined') {
  module.exports = Scheduler;
}
