const Scheduler = {
  WINDOWS: [
    { key: 'morning', label: '오전 체크인', start: 8, end: 10, message: '좋은 아침이에요 🌱 잠깐 들르실래요?' },
    { key: 'afternoon', label: '오후 체크인', start: 13, end: 15, message: '오후에 잠깐 멈춰서 나를 돌아볼 시간이에요' },
    { key: 'evening', label: '저녁 체크인', start: 19, end: 21, message: '오늘 하루 어땠나요? 잠깐 기록해볼까요?' }
  ],

  generateForToday() {
    const today = new Date();
    const times = this.WINDOWS.map(w => {
      const hour = w.start + Math.floor(Math.random() * (w.end - w.start));
      const minute = Math.floor(Math.random() * 60);
      return {
        ...w,
        scheduledAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute)
      };
    });
    return times;
  },

  generateForTomorrow() {
    const tomorrow = new Date(Date.now() + 86400000);
    const times = this.WINDOWS.map(w => {
      const hour = w.start + Math.floor(Math.random() * (w.end - w.start));
      const minute = Math.floor(Math.random() * 60);
      return {
        ...w,
        scheduledAt: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hour, minute)
      };
    });
    return times;
  },

  ensureSchedule() {
    const today = new Date().toISOString().slice(0, 10);
    let schedule = MG.getSchedule();

    if (!schedule || schedule.date !== today) {
      const todayTimes = this.generateForToday();
      const tomorrowTimes = this.generateForTomorrow();
      schedule = {
        date: today,
        today: todayTimes,
        tomorrow: tomorrowTimes
      };
      MG.saveSchedule(schedule);
    }

    return schedule;
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
      const wMin = w.scheduledAt.getHours() * 60 + w.scheduledAt.getMinutes();
      const diff = wMin - nowMinutes;
      if (diff > 0 && diff < nextDiff) {
        nextDiff = diff;
        nextWindow = w;
      }
    }

    return nextWindow || schedule.today[0];
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

    schedule.today.forEach(w => {
      const delay = w.scheduledAt.getTime() - now;
      if (delay > 0) {
        setTimeout(() => {
          new Notification('MoodGarden 🌱', { body: w.message, icon: '🌱' });
        }, delay);
      }
    });

    schedule.tomorrow.forEach(w => {
      const delay = w.scheduledAt.getTime() - now;
      if (delay > 0) {
        setTimeout(() => {
          new Notification('MoodGarden 🌱', { body: w.message, icon: '🌱' });
        }, delay);
      }
    });
  }
};
