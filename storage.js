const MG = {
  SCHEMA_VERSION: 2,

  KEYS: {
    profile: 'mg_profile',
    checkins: 'mg_checkins',
    stamps: 'mg_stamps',
    streak: 'mg_streak',
    schedule: 'mg_schedule',
    settings: 'mg_settings',
    unlocked: 'mg_unlocked'
  },

  RESPONSE_KEYS: ['mood', 'anhedonia', 'energy', 'hopelessness', 'rumination'],
  CONTEXT_KEYS: ['sleepPoor', 'socialActivity', 'exercise', 'stressEvent', 'medicationTaken', 'ateMeal', 'alcohol', 'therapy'],
  WINDOWS: ['morning', 'afternoon', 'evening'],

  parseJSON(value, fallback) {
    try {
      return JSON.parse(value || JSON.stringify(fallback));
    } catch (err) {
      return fallback;
    }
  },

  pad2(value) {
    return String(value).padStart(2, '0');
  },

  toLocalDate(date) {
    const d = date ? new Date(date) : new Date();
    return [d.getFullYear(), this.pad2(d.getMonth() + 1), this.pad2(d.getDate())].join('-');
  },

  getTimezoneOffset(date) {
    return (date ? new Date(date) : new Date()).getTimezoneOffset();
  },

  buildCheckinId(localDate, windowKey) {
    return localDate + '_' + windowKey;
  },

  getCheckinSubmittedAt(checkin) {
    return checkin.submittedAt || checkin.timestamp || checkin.scheduledAt || '';
  },

  getCheckinLocalDate(checkin) {
    if (checkin.localDate) return checkin.localDate;
    return this.toLocalDate(this.getCheckinSubmittedAt(checkin) || new Date());
  },

  normalizeCheckin(raw) {
    const submittedAt = raw.submittedAt || raw.timestamp || new Date().toISOString();
    const localDate = raw.localDate || this.toLocalDate(submittedAt);
    const windowKey = raw.window || 'unknown';
    const responses = {};
    const context = {};

    this.RESPONSE_KEYS.forEach(key => {
      const value = raw.responses && raw.responses[key];
      responses[key] = Number.isFinite(Number(value)) ? Number(value) : 0;
    });

    this.CONTEXT_KEYS.forEach(key => {
      context[key] = Boolean(raw.context && raw.context[key]);
    });

    return {
      id: raw.id || this.buildCheckinId(localDate, windowKey),
      schemaVersion: this.SCHEMA_VERSION,
      localDate,
      window: windowKey,
      scheduledAt: raw.scheduledAt || '',
      submittedAt,
      timestamp: submittedAt,
      timezoneOffset: Number.isFinite(Number(raw.timezoneOffset)) ? Number(raw.timezoneOffset) : this.getTimezoneOffset(submittedAt),
      responses,
      context,
      note: raw.note || ''
    };
  },

  normalizeCheckins(checkins) {
    return checkins
      .map(c => this.normalizeCheckin(c))
      .sort((a, b) => this.getCheckinSubmittedAt(a).localeCompare(this.getCheckinSubmittedAt(b)));
  },

  getProfile() {
    return this.parseJSON(localStorage.getItem(this.KEYS.profile), null);
  },

  saveProfile(data) {
    localStorage.setItem(this.KEYS.profile, JSON.stringify({
      ...data,
      createdAt: new Date().toISOString()
    }));
  },

  getCheckins() {
    const raw = this.parseJSON(localStorage.getItem(this.KEYS.checkins), []);
    const normalized = this.normalizeCheckins(Array.isArray(raw) ? raw : []);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      localStorage.setItem(this.KEYS.checkins, JSON.stringify(normalized));
    }
    return normalized;
  },

  saveCheckins(checkins) {
    localStorage.setItem(this.KEYS.checkins, JSON.stringify(this.normalizeCheckins(checkins)));
  },

  upsertCheckin(checkin) {
    const normalized = this.normalizeCheckin(checkin);
    const checkins = this.getCheckins();
    const index = checkins.findIndex(c => c.id === normalized.id);
    const replaced = index !== -1;

    if (replaced) {
      checkins[index] = normalized;
    } else {
      checkins.push(normalized);
    }

    this.saveCheckins(checkins);

    if (typeof Sync !== 'undefined') {
      Sync.enqueue(normalized.id);
    }

    return { checkin: normalized, replaced };
  },

  addCheckin(checkin) {
    return this.upsertCheckin(checkin);
  },

  getTodayCheckins() {
    const today = this.toLocalDate();
    return this.getCheckins().filter(c => this.getCheckinLocalDate(c) === today);
  },

  getUniqueDays() {
    const dates = new Set();
    this.getCheckins().forEach(c => dates.add(this.getCheckinLocalDate(c)));
    return dates.size;
  },

  getStamps() {
    return this.parseJSON(localStorage.getItem(this.KEYS.stamps), { stamps: 0, slots: [], completedCards: 0 });
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
    return this.parseJSON(localStorage.getItem(this.KEYS.streak), { count: 0, lastDate: null, freezes: 2, milestones: [] });
  },

  updateStreak() {
    const streak = this.getStreak();
    const today = this.toLocalDate();

    if (streak.lastDate === today) return streak;

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = this.toLocalDate(yesterdayDate);

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
    return this.parseJSON(localStorage.getItem(this.KEYS.schedule), null);
  },

  saveSchedule(schedule) {
    localStorage.setItem(this.KEYS.schedule, JSON.stringify(schedule));
  },

  getUnlocked() {
    return this.parseJSON(localStorage.getItem(this.KEYS.unlocked), { trajectory: false, variability: false, lag: false });
  },

  getDataQuality() {
    const checkins = this.getCheckins();
    const days = [...new Set(checkins.map(c => this.getCheckinLocalDate(c)))].sort();
    const windowCounts = this.WINDOWS.reduce((acc, key) => {
      acc[key] = checkins.filter(c => c.window === key).length;
      return acc;
    }, {});
    const expectedByWindow = days.length;
    const missingByWindow = this.WINDOWS.reduce((acc, key) => {
      acc[key] = Math.max(0, expectedByWindow - windowCounts[key]);
      return acc;
    }, {});
    const totalExpected = days.length * this.WINDOWS.length;
    const completionRate = totalExpected ? Math.min(1, checkins.length / totalExpected) : 0;

    return {
      totalCheckins: checkins.length,
      uniqueDays: days.length,
      averagePerDay: days.length ? checkins.length / days.length : 0,
      completionRate,
      windowCounts,
      missingByWindow,
      totalMissing: Object.values(missingByWindow).reduce((sum, value) => sum + value, 0)
    };
  },

  checkUnlocks() {
    const days = this.getUniqueDays();
    const pairCount = Math.max(0, this.getCheckins().length - 1);
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
    if (pairCount >= 20 && !unlocked.lag) {
      unlocked.lag = true;
      changed = true;
    }

    if (changed) {
      localStorage.setItem(this.KEYS.unlocked, JSON.stringify(unlocked));
    }
    return { unlocked, days, pairCount };
  },

  escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  },

  exportCSV() {
    const checkins = this.getCheckins();
    if (checkins.length === 0) return null;

    const headers = [
      'id', 'schemaVersion', 'localDate', 'window', 'scheduledAt', 'submittedAt', 'timestamp', 'timezoneOffset',
      'mood', 'anhedonia', 'energy', 'hopelessness', 'rumination',
      'sleepPoor', 'socialActivity', 'exercise', 'stressEvent', 'medicationTaken', 'ateMeal', 'alcohol', 'therapy', 'note'
    ];

    const rows = checkins.map(c => [
      c.id,
      c.schemaVersion,
      this.getCheckinLocalDate(c),
      c.window,
      c.scheduledAt || '',
      c.submittedAt || '',
      c.timestamp || c.submittedAt || '',
      c.timezoneOffset,
      c.responses.mood,
      c.responses.anhedonia,
      c.responses.energy,
      c.responses.hopelessness,
      c.responses.rumination,
      c.context.sleepPoor,
      c.context.socialActivity,
      c.context.exercise,
      c.context.stressEvent,
      c.context.medicationTaken,
      c.context.ateMeal,
      c.context.alcohol,
      c.context.therapy,
      c.note || ''
    ].map(value => this.escapeCSV(value)).join(','));

    return [headers.join(','), ...rows].join('\n');
  },

  downloadCSV() {
    const csv = this.exportCSV();
    if (!csv) return;
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moodgarden_' + this.toLocalDate() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  clear() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  },

  parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  },

  importCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return { imported: 0, skipped: 0 };

    const headers = this.parseCSVLine(lines[0]);
    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = this.parseCSVLine(line);
      if (values.length < headers.length) { skipped++; continue; }

      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx]; });

      this.upsertCheckin({
        id: row.id,
        submittedAt: row.submittedAt,
        timestamp: row.timestamp || row.submittedAt,
        localDate: row.localDate,
        window: row.window,
        scheduledAt: row.scheduledAt || '',
        timezoneOffset: row.timezoneOffset,
        responses: {
          mood: Number(row.mood) || 0,
          anhedonia: Number(row.anhedonia) || 0,
          energy: Number(row.energy) || 0,
          hopelessness: Number(row.hopelessness) || 0,
          rumination: Number(row.rumination) || 0
        },
        context: {
          sleepPoor: row.sleepPoor === 'true',
          socialActivity: row.socialActivity === 'true',
          exercise: row.exercise === 'true',
          stressEvent: row.stressEvent === 'true',
          medicationTaken: row.medicationTaken === 'true',
          ateMeal: row.ateMeal === 'true',
          alcohol: row.alcohol === 'true',
          therapy: row.therapy === 'true'
        },
        note: row.note || ''
      });
      imported++;
    }

    return { imported, skipped };
  }
};

if (typeof module !== 'undefined') {
  module.exports = MG;
}
