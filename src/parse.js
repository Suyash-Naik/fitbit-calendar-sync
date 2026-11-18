/**
 * Pure functions: Health API data point → calendar event model.
 * No Apps Script globals here, so `node --test` can run them (see ../test).
 *
 * Event model: { syncId, kind, start, end, summary, description }
 *   start/end: RFC-3339 strings straight from the API (UTC, "Z").
 */

const WORKOUT_ICONS = {
  RUNNING: '🏃', WALKING: '🚶', HIKING: '🥾', BIKING: '🚴', SWIMMING: '🏊',
  YOGA: '🧘', WEIGHTLIFTING: '🏋️', STRENGTH_TRAINING: '🏋️', AEROBIC_WORKOUT: '🤸', ELLIPTICAL: '🏃',
  ROWING: '🚣', TENNIS: '🎾', SKIING: '⛷️', DANCING: '💃', PILATES: '🧘',
  INDOOR_CLIMBING: '🧗',
};
const DEFAULT_WORKOUT_ICON = '💪';

// ---------- Sleep ----------

/**
 * @param {Object} dp reconcile data point with a `sleep` field
 * @param {{includeNaps:boolean}} opts
 * @return {Object|null} event model, or null if filtered out
 */
function sleepToEvent_(dp, opts) {
  const s = dp.sleep;
  if (!s || !s.interval) return null;
  const isMain = !!(s.metadata && s.metadata.mainSleep);
  if (!isMain && opts && opts.includeNaps === false) return null;

  const sum = s.summary || {};
  const periodMin = num_(sum.minutesInSleepPeriod) ||
    Math.round((Date.parse(s.interval.endTime) - Date.parse(s.interval.startTime)) / 60000);
  const asleepMin = num_(sum.minutesAsleep) || periodMin;
  const efficiency = periodMin > 0 ? Math.round((asleepMin / periodMin) * 100) : null;

  const stages = {};
  (sum.stagesSummary || []).forEach(function (st) { stages[st.type] = num_(st.minutes); });

  const summary = isMain
    ? '💤 Sleep ' + fmtMinutes_(asleepMin) + (efficiency != null ? ' · ' + efficiency + '%' : '')
    : '😴 Nap ' + fmtMinutes_(asleepMin);

  const lines = [];
  const stageOrder = ['DEEP', 'REM', 'LIGHT', 'AWAKE'];
  const stageParts = stageOrder
    .filter(function (k) { return stages[k] != null; })
    .map(function (k) { return titleCase_(k) + ' ' + fmtMinutes_(stages[k]); });
  if (stageParts.length) lines.push(stageParts.join(' · '));
  lines.push('Asleep ' + fmtMinutes_(asleepMin) + ' · In bed ' + fmtMinutes_(periodMin) +
    (efficiency != null ? ' · Efficiency ' + efficiency + '%' : ''));
  if (sum.minutesToFallAsleep != null && num_(sum.minutesToFallAsleep) > 0) {
    lines.push('Fell asleep in ' + fmtMinutes_(num_(sum.minutesToFallAsleep)));
  }
  lines.push('', 'Synced from Google Health (' + (s.type || 'sleep').toLowerCase() +
    (s.metadata && s.metadata.manuallyEdited ? ', manually updated for score' : '') + ')');

  return {
    syncId: 'sleep:' + lastSegment_(dp.dataPointName || dp.name),
    kind: isMain ? 'sleep' : 'nap',
    start: s.interval.startTime,
    end: s.interval.endTime,
    summary: summary,
    description: lines.join('\n'),
  };
}

// ---------- Exercise ----------

/**
 * @param {Object} dp reconcile data point with an `exercise` field
 * @param {{minWorkoutMinutes:number, excludeTypes:string[]}} opts
 * @return {Object|null}
 */
function exerciseToEvent_(dp, opts) {
  const x = dp.exercise;
  if (!x || !x.interval) return null;
  opts = opts || {};
  const type = x.exerciseType || 'OTHER';
  if ((opts.excludeTypes || []).indexOf(type) !== -1) return null;

  const totalMin = Math.round((Date.parse(x.interval.endTime) - Date.parse(x.interval.startTime)) / 60000);
  const activeMin = x.activeDuration != null ? Math.round(durSec_(x.activeDuration) / 60) : totalMin;
  if (activeMin < (opts.minWorkoutMinutes || 0)) return null;

  const m = x.metricsSummary || {};
  const distKm = num_(m.distanceMillimeters) / 1e6;
  const name = x.displayName || titleCase_(type.replace(/_/g, ' '));
  const icon = WORKOUT_ICONS[type] || DEFAULT_WORKOUT_ICON;

  const titleParts = [icon + ' ' + name];
  if (distKm >= 0.05) titleParts.push(distKm.toFixed(2) + ' km');
  titleParts.push(fmtMinutes_(activeMin));

  const lines = [];
  const l1 = ['Active ' + fmtMinutes_(activeMin) + (totalMin !== activeMin ? ' (total ' + fmtMinutes_(totalMin) + ')' : '')];
  if (m.caloriesKcal != null) l1.push(thousands_(Math.round(num_(m.caloriesKcal))) + ' kcal');
  if (m.steps != null) l1.push(thousands_(num_(m.steps)) + ' steps');
  lines.push(l1.join(' · '));

  const l2 = [];
  if (m.averageHeartRateBeatsPerMinute != null) l2.push('Avg HR ' + num_(m.averageHeartRateBeatsPerMinute) + ' bpm');
  if (num_(m.activeZoneMinutes) > 0) l2.push(num_(m.activeZoneMinutes) + ' Zone Minutes');
  if (m.averagePaceSecondsPerMeter && distKm >= 0.05) l2.push('Pace ' + fmtPace_(num_(m.averagePaceSecondsPerMeter)) + ' /km');
  if (m.elevationGainMillimeters != null && num_(m.elevationGainMillimeters) >= 1000) {
    l2.push('Elevation +' + Math.round(num_(m.elevationGainMillimeters) / 1000) + ' m');
  }
  if (l2.length) lines.push(l2.join(' · '));

  const z = m.heartRateZoneDurations;
  if (z) {
    const zoneParts = [['light', z.lightTime], ['moderate', z.moderateTime], ['vigorous', z.vigorousTime], ['peak', z.peakTime]]
      .filter(function (p) { return p[1] != null && durSec_(p[1]) >= 60; })
      .map(function (p) { return p[0] + ' ' + fmtMinutes_(Math.round(durSec_(p[1]) / 60)); });
    if (zoneParts.length) lines.push('HR zones: ' + zoneParts.join(' · '));
  }
  if (x.notes) lines.push('', x.notes);
  lines.push('', 'Synced from Google Health (' + type.toLowerCase() + ')');

  return {
    syncId: 'exercise:' + lastSegment_(dp.dataPointName || dp.name),
    kind: 'workout',
    start: x.interval.startTime,
    end: x.interval.endTime,
    summary: titleParts.join(' · '),
    description: lines.join('\n'),
  };
}

// ---------- Helpers ----------

/** Numbers arrive as numbers or strings ("407"). */
function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/** "1693s" or "1693.5s" → seconds. */
function durSec_(v) {
  return num_(String(v).replace(/s$/, ''));
}

/** 450 → "7h 30m", 45 → "45m", 60 → "1h 00m" */
function fmtMinutes_(min) {
  min = Math.round(min);
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
}

/** seconds per meter → "m:ss" per km */
function fmtPace_(secPerMeter) {
  const total = Math.round(secPerMeter * 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return mm + ':' + (ss < 10 ? '0' : '') + ss;
}

function thousands_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function titleCase_(s) {
  return String(s).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function lastSegment_(name) {
  const parts = String(name || '').split('/');
  return parts[parts.length - 1];
}

// Node test hook. `module` doesn't exist in Apps Script, so this is skipped there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sleepToEvent_, exerciseToEvent_, fmtMinutes_, fmtPace_, durSec_, thousands_ };
}
