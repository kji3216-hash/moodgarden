const assert = require('assert');
const MG = require('../storage.js');
global.MG = MG;
const Insights = require('../insights.js');
const Scheduler = require('../scheduler.js');
const Sync = require('../sync.js');

const store = new Map();
global.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  }
};

function reset() {
  store.clear();
}

function makeCheckin(date, windowKey, mood, extra = {}) {
  const submittedAt = date + 'T10:00:00.000Z';
  return {
    id: date + '_' + windowKey,
    localDate: date,
    window: windowKey,
    scheduledAt: date + 'T09:00:00.000Z',
    submittedAt,
    timezoneOffset: -540,
    responses: {
      mood,
      anhedonia: 100 - mood,
      energy: mood,
      hopelessness: 100 - mood,
      rumination: 100 - mood
    },
    context: {
      sleepPoor: false,
      socialActivity: false,
      exercise: false,
      stressEvent: false,
      medicationTaken: false,
      ateMeal: false,
      alcohol: false,
      therapy: false
    },
    note: extra.note || ''
  };
}

reset();
localStorage.setItem(MG.KEYS.checkins, JSON.stringify([{
  timestamp: '2026-06-01T23:30:00.000Z',
  window: 'evening',
  responses: { mood: 42, anhedonia: 30, energy: 50, hopelessness: 10, rumination: 60 },
  context: { exercise: true },
  note: 'legacy row'
}]));
const migrated = MG.getCheckins()[0];
assert.strictEqual(migrated.schemaVersion, 2);
assert.strictEqual(migrated.submittedAt, '2026-06-01T23:30:00.000Z');
assert.strictEqual(migrated.id, migrated.localDate + '_evening');
assert.strictEqual(migrated.context.exercise, true);

reset();
localStorage.setItem(MG.KEYS.checkins, JSON.stringify([
  makeCheckin('2026-06-02', 'morning', 40),
  makeCheckin('2026-06-02', 'morning', 80)
]));
assert.strictEqual(MG.getCheckins().length, 1);
assert.strictEqual(MG.getCheckins()[0].responses.mood, 80);

reset();
let result = MG.upsertCheckin(makeCheckin('2026-06-02', 'morning', 40));
assert.strictEqual(result.replaced, false);
result = MG.upsertCheckin(makeCheckin('2026-06-02', 'morning', 75));
assert.strictEqual(result.replaced, true);
assert.strictEqual(MG.getCheckins().length, 1);
assert.strictEqual(MG.getCheckins()[0].responses.mood, 75);

reset();
MG.upsertCheckin(makeCheckin('2026-06-03', 'morning', 55, { note: 'comma, quote " and newline\ninside' }));
const csv = MG.exportCSV();
assert(csv.startsWith('id,schemaVersion,localDate,window,scheduledAt,submittedAt,timestamp,timezoneOffset'));
assert(csv.includes('"comma, quote "" and newline\ninside"'));

reset();
for (let day = 1; day <= 7; day++) {
  MG.upsertCheckin(makeCheckin('2026-06-' + String(day).padStart(2, '0'), 'morning', 50 + day));
}
let unlocks = MG.checkUnlocks();
assert.strictEqual(unlocks.unlocked.trajectory, true);
assert.strictEqual(unlocks.unlocked.variability, false);
assert.strictEqual(unlocks.unlocked.lag, false);

reset();
for (let i = 0; i < 21; i++) {
  const day = String(Math.floor(i / 3) + 1).padStart(2, '0');
  const windowKey = MG.WINDOWS[i % MG.WINDOWS.length];
  MG.upsertCheckin(makeCheckin('2026-07-' + day, windowKey, 20 + i * 3));
}
unlocks = MG.checkUnlocks();
assert.strictEqual(unlocks.pairCount, 20);
assert.strictEqual(unlocks.unlocked.lag, true);
const correlations = Insights.computeLagCorrelations();
assert(correlations.length > 0);
assert(correlations.every(c => c.n >= 20));

const quality = MG.getDataQuality();
assert.strictEqual(quality.totalCheckins, 21);
assert.strictEqual(quality.uniqueDays, 7);
assert.strictEqual(quality.averagePerDay, 3);
assert.strictEqual(quality.totalMissing, 0);

assert.strictEqual(Scheduler.getWindowForTime(new Date('2026-06-08T08:30:00')).key, 'morning');
assert.strictEqual(Scheduler.getWindowForTime(new Date('2026-06-08T12:30:00')), null);
assert.strictEqual(Scheduler.getWindowForTime(new Date('2026-06-08T20:30:00')).key, 'evening');

reset();
Sync.configure();
assert.strictEqual(Sync.isConfigured(), false);
assert.strictEqual(Sync.enqueue('2026-06-08_morning'), false);
assert.strictEqual(JSON.parse(localStorage.getItem('mg_sync_queue') || '[]').length, 0);

console.log('storage-insights tests passed');
