/**
 * Phase 1 spike: run debugDump() from the Apps Script editor.
 * It logs the raw sleep and exercise data for the last few days so the
 * parser can be built against real field shapes. It makes no calendar changes.
 */

const DEBUG_LOOKBACK_DAYS = 3;

function debugDump() {
  const today = new Date();
  const from = addDays_(today, -DEBUG_LOOKBACK_DAYS);
  const to = addDays_(today, 1); // exclusive upper bound → includes today
  console.log('Time zone: %s | window: %s → %s (exclusive)',
    Session.getScriptTimeZone(), civilDate_(from), civilDate_(to));

  dumpType_('SLEEP', function () { return fetchSleep_(from, to); }, summarizeSleep_);
  dumpType_('EXERCISE', function () { return fetchExercise_(from, to); }, summarizeExercise_);
}

/**
 * Privacy-safe: logs only the field structure (names + types, array lengths)
 * merged across all data points, with no values. Safe to share.
 */
function debugSchema() {
  const today = new Date();
  const from = addDays_(today, -DEBUG_LOOKBACK_DAYS);
  const to = addDays_(today, 1);
  [['SLEEP', fetchSleep_], ['EXERCISE', fetchExercise_]].forEach(function (pair) {
    const points = pair[1](from, to);
    const merged = {};
    points.forEach(function (dp) { mergeSchema_(merged, dp); });
    console.log('===== %s schema (%d data points) =====\n%s', pair[0], points.length, JSON.stringify(merged, null, 2));
  });
}

/**
 * Privacy-safe: for the last 30 days, lists each exerciseType enum with its
 * display names, a count, and the metricsSummary keys it carries. No values.
 */
function debugWorkoutTypes() {
  const days = 30;
  const today = new Date();
  const points = fetchExercise_(addDays_(today, -days), addDays_(today, 1));
  const byType = {};
  points.forEach(function (dp) {
    const x = dp.exercise || {};
    const t = x.exerciseType || '(none)';
    const e = byType[t] = byType[t] || { count: 0, displayNames: [], iconNow: '', metricKeys: [] };
    e.count++;
    if (e.displayNames.indexOf(x.displayName) === -1) e.displayNames.push(x.displayName);
    e.iconNow = WORKOUT_ICONS[t] || '(fallback)';
    Object.keys(x.metricsSummary || {}).forEach(function (k) {
      if (e.metricKeys.indexOf(k) === -1) e.metricKeys.push(k);
    });
  });
  console.log('===== Workout types, last %d days (%d workouts) =====\n%s',
    days, points.length, JSON.stringify(byType, null, 2));
}

function mergeSchema_(target, value) {
  Object.keys(value).forEach(function (k) {
    const v = value[k];
    if (Array.isArray(v)) {
      const slot = target[k] = target[k] || { _array: true, maxLength: 0, item: {} };
      slot.maxLength = Math.max(slot.maxLength, v.length);
      v.forEach(function (item) {
        if (item && typeof item === 'object') mergeSchema_(slot.item, item);
        else slot.item = typeof item;
      });
    } else if (v && typeof v === 'object') {
      mergeSchema_(target[k] = target[k] || {}, v);
    } else if (/Type$|^type$|^status$|Status$/.test(k) && typeof v === 'string') {
      // enum-like fields: list the distinct values (e.g. DEEP/REM, WALKING), no personal data
      const set = target[k] = typeof target[k] === 'object' ? target[k] : { _enum: [] };
      if (set._enum.indexOf(v) === -1) set._enum.push(v);
    } else if (typeof v === 'boolean' && /mainSleep|processed|hasGps/.test(k)) {
      const set = target[k] = typeof target[k] === 'object' ? target[k] : { _enum: [] };
      if (set._enum.indexOf(v) === -1) set._enum.push(v);
    } else {
      target[k] = typeof v;
    }
  });
}

function dumpType_(label, fetchFn, summarizeFn) {
  let points;
  try {
    points = fetchFn();
  } catch (e) {
    console.error('%s fetch FAILED: %s', label, e.message);
    if (e.httpCode === 401 || e.httpCode === 403) {
      console.error('→ Auth problem: check that the Health API is enabled, the scopes are on Data Access, ' +
        'you are a test user, and you approved both permissions in authorizeHealth(). ' +
        'Run resetHealthAuth() then authorizeHealth() to start over.');
    }
    return;
  }

  console.log('===== %s: %d data point(s) =====', label, points.length);
  points.forEach(function (dp, i) {
    console.log('[%s #%d] %s', label, i + 1, summarizeFn(dp));
  });
  // Full raw JSON, one point per log line (keeps each entry under the log size limit).
  points.forEach(function (dp, i) {
    console.log('[%s #%d RAW] %s', label, i + 1, JSON.stringify(dp, null, 2));
  });
}

function summarizeSleep_(dp) {
  const s = dp.sleep || {};
  const iv = s.interval || {};
  const sum = s.summary || {};
  return [
    iv.startTime + ' → ' + iv.endTime,
    'type=' + s.type,
    'mainSleep=' + (s.metadata && s.metadata.mainSleep),
    'asleep=' + sum.minutesAsleep + 'm',
    'inPeriod=' + sum.minutesInSleepPeriod + 'm',
  ].join(' | ');
}

function summarizeExercise_(dp) {
  const x = dp.exercise || {};
  const iv = x.interval || {};
  const m = x.metricsSummary || {};
  return [
    iv.startTime + ' → ' + iv.endTime,
    x.exerciseType + ' "' + x.displayName + '"',
    'active=' + x.activeDuration,
    'kcal=' + m.caloriesKcal,
    'distMm=' + m.distanceMillimeters,
    'recording=' + (dp.dataSource && dp.dataSource.recordingMethod),
  ].join(' | ');
}
