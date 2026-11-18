const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/parse.js');
const walk = require('./fixtures/exercise-walk.json');
const sleep = require('./fixtures/sleep-docs.json');

test('formatters', () => {
  assert.equal(p.fmtMinutes_(45), '45m');
  assert.equal(p.fmtMinutes_(450), '7h 30m');
  assert.equal(p.fmtMinutes_(60), '1h 00m');
  assert.equal(p.fmtPace_(0.36), '6:00');
  assert.equal(p.durSec_('1693s'), 1693);
  assert.equal(p.thousands_(6200), '6,200');
});

test('main sleep → event', () => {
  const ev = p.sleepToEvent_(sleep, { includeNaps: true });
  assert.equal(ev.kind, 'sleep');
  assert.equal(ev.syncId, 'sleep:data-point-id');
  assert.equal(ev.summary, '💤 Sleep 6h 47m · 88%');
  assert.match(ev.description, /^Deep 1h 54m · Rem 1h 34m · Light 3h 18m · Awake 56m/);
  assert.equal(ev.start, '2026-03-03T20:57:30Z');
});

test('nap → event, and excluded when naps are off', () => {
  const nap = JSON.parse(JSON.stringify(sleep));
  nap.sleep.metadata.mainSleep = false;
  nap.sleep.type = 'CLASSIC';
  nap.sleep.summary = { minutesInSleepPeriod: '50', minutesAsleep: '45' };
  const ev = p.sleepToEvent_(nap, { includeNaps: true });
  assert.equal(ev.kind, 'nap');
  assert.equal(ev.summary, '😴 Nap 45m');
  assert.equal(p.sleepToEvent_(nap, { includeNaps: false }), null);
});

test('walk → event', () => {
  const ev = p.exerciseToEvent_(walk, {});
  assert.equal(ev.kind, 'workout');
  assert.equal(ev.summary, '🚶 Walk · 0.79 km · 28m');
  assert.match(ev.description, /Active 28m · 138 kcal · 1,203 steps/);
  assert.match(ev.description, /Avg HR 84 bpm · Pace 35:53 \/km · Elevation \+5 m/);
  assert.match(ev.description, /HR zones: light 28m/);
  assert.doesNotMatch(ev.description, /moderate/);
});

test('workout filters', () => {
  assert.equal(p.exerciseToEvent_(walk, { minWorkoutMinutes: 30 }), null);
  assert.equal(p.exerciseToEvent_(walk, { excludeTypes: ['WALKING'] }), null);
  assert.ok(p.exerciseToEvent_(walk, { minWorkoutMinutes: 20 }));
});

test('strength training: icon, no distance, Zone Minutes, pauses', () => {
  const st = JSON.parse(JSON.stringify(walk));
  st.exercise.exerciseType = 'STRENGTH_TRAINING';
  st.exercise.displayName = 'Strength training';
  st.exercise.metricsSummary.distanceMillimeters = 0;
  st.exercise.metricsSummary.activeZoneMinutes = '12';
  st.exercise.activeDuration = '1200s'; // paused: total 28m, active 20m
  const ev = p.exerciseToEvent_(st, {});
  assert.equal(ev.summary, '🏋️ Strength training · 20m');
  assert.match(ev.description, /Active 20m \(total 28m\)/);
  assert.match(ev.description, /12 Zone Minutes/);
  assert.doesNotMatch(ev.description, /Pace/);
});

test('manually edited sleep is noted', () => {
  const s = JSON.parse(JSON.stringify(sleep));
  s.sleep.metadata.manuallyEdited = true;
  assert.match(p.sleepToEvent_(s, {}).description, /stages, manually updated for score\)$/);
});

test('indoor climbing → 🧗, unknown types → 💪', () => {
  const c = JSON.parse(JSON.stringify(walk));
  c.exercise.metricsSummary.distanceMillimeters = 0;
  c.exercise.exerciseType = 'INDOOR_CLIMBING';
  c.exercise.displayName = 'Indoor climbing';
  assert.match(p.exerciseToEvent_(c, {}).summary, /^🧗 Indoor climbing · /);
  c.exercise.exerciseType = 'SOME_UNKNOWN_TYPE';
  c.exercise.displayName = 'Mystery';
  assert.match(p.exerciseToEvent_(c, {}).summary, /^💪 Mystery · /);
});
