const MG = {
  KEYS: {
    profile: 'mg_profile',
    checkins: 'mg_checkins',
    stamps: 'mg_stamps',
    streak: 'mg_streak',
    schedule: 'mg_schedule',
    settings: 'mg_settings',
    unlocked: 'mg_unlocked'
  },

  getProfile() {
    return JSON.parse(localStorage.getItem(this.KEYS.profile) || 'null');
  },

  saveProfile(data) {
    localStorage.setItem(this.KEYS.profile, JSON.stringify({
      ...data,
      createdAt: new Date().toISOString()
    }));
  },

  getCheckins() {
    return JSON.parse(localStorage.getItem(this.KEYS.checkins) || '[]');
  },

  addCheckin(checkin) {
    const checkins = this.getCheckins();
    checkins.push(checkin);
    localStorage.setItem(this.KEYS.checkins, JSON.stringify(checkins));
  },

  getTodayCheckins() {
    const today = new Date().toISOString().slice(0, 10);
    return this.getCheckins().filter(c => c.timestamp.slice(0, 10) === today);
  },

  getUniqueDays() {
    const dates = new Set();
    this.getCheckins().forEach(c => dates.add(c.timestamp.slice(0, 10)));
    return dates.size;
  },

  getStamps() {
    return JSON.parse(localStorage.getItem(this.KEYS.stamps) || '{"stamps":0,"slots":[],"completedCards":0}');
  },

  addStamp() {
    const stamps = this.getStamps();
    stamps.stamps += 1;
    stamps.slots.push(true);

    if (stamps.slots.length >= 7) {
      stamps.completedCards += 1;
      stamps.slots = [];
      stamps.stamps = 0;
    }

    localStorage.setItem(this.KEYS.stamps, JSON.stringify(stamps));
    return stamps;
  },

  getStreak() {
    return JSON.parse(localStorage.getItem(this.KEYS.streak) || '{"count":0,"lastDate":null,"freezes":2,"milestones":[]}');
  },

  updateStreak() {
    const streak = this.getStreak();
    const today = new Date().toISOString().slice(0, 10);

    if (streak.lastDate === today) return streak;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (streak.lastDate === yesterday) {
      streak.count += 1;
    } else if (streak.lastDate && streak.freezes > 0) {
      streak.freezes -= 1;
    } else if (streak.lastDate) {
      streak.count = 1;
    } else {
      streak.count = 1;
    }

    if (streak.count === 7 && !streak.milestones.includes(7)) {
      streak.milestones.push(7);
      streak.freezes = Math.min(streak.freezes + 1, 3);
    }
    if (streak.count === 14 && !streak.milestones.includes(14)) {
      streak.milestones.push(14);
    }
    if (streak.count === 30 && !streak.milestones.includes(30)) {
      streak.milestones.push(30);
    }

    streak.lastDate = today;
    localStorage.setItem(this.KEYS.streak, JSON.stringify(streak));
    return streak;
  },

  getSchedule() {
    return JSON.parse(localStorage.getItem(this.KEYS.schedule) || 'null');
  },

  saveSchedule(schedule) {
    localStorage.setItem(this.KEYS.schedule, JSON.stringify(schedule));
  },

  getUnlocked() {
    return JSON.parse(localStorage.getItem(this.KEYS.unlocked) || '{"trajectory":false,"variability":false,"lag":false}');
  },

  checkUnlocks() {
    const days = this.getUniqueDays();
    const unlocked = this.getUnlocked();
    let changed = false;

    if (days >= 4 && !unlocked.trajectory) {
      unlocked.trajectory = true;
      changed = true;
    }
    if (days >= 8 && !unlocked.variability) {
      unlocked.variability = true;
      changed = true;
    }
    if (days >= 15 && !unlocked.lag) {
      unlocked.lag = true;
      changed = true;
    }

    if (changed) {
      localStorage.setItem(this.KEYS.unlocked, JSON.stringify(unlocked));
    }
    return { unlocked, days };
  },

  exportCSV() {
    const checkins = this.getCheckins();
    if (checkins.length === 0) return null;

    const headers = ['timestamp', 'window', 'mood', 'anhedonia', 'energy', 'hopelessness', 'rumination', 'sleepPoor', 'socialActivity', 'exercise', 'stressEvent', 'medicationTaken', 'ateMeal', 'alcohol', 'therapy', 'note'];
    const rows = checkins.map(c => [
      c.timestamp,
      c.window,
      c.responses.mood,
      c.responses.anhedonia,
      c.responses.energy,
      c.responses.hopelessness,
      c.responses.rumination,
      c.context.sleepPoor || false,
      c.context.socialActivity || false,
      c.context.exercise || false,
      c.context.stressEvent || false,
      c.context.medicationTaken || false,
      c.context.ateMeal || false,
      c.context.alcohol || false,
      c.context.therapy || false,
      '"' + (c.note || '').replace(/"/g, '""') + '"'
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  },

  downloadCSV() {
    const csv = this.exportCSV();
    if (!csv) return;
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moodgarden_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  clear() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  }
};
