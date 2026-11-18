/**
 * Settings, overridable under Project Settings → Script properties.
 * Defaults are used when a property is not set.
 */
const CONFIG_DEFAULTS = {
  CALENDAR_NAME: 'Fitbit',
  LOOKBACK_DAYS: '2',          // days before today to (re)sync each run
  INCLUDE_NAPS: 'true',
  MIN_WORKOUT_MINUTES: '0',    // skip workouts shorter than this (active minutes)
  EXCLUDE_TYPES: '',           // comma-separated exerciseType values, e.g. "WALKING,OTHER"
  WORKOUT_COLOR_ID: '10',      // Calendar event colour for workouts ('' = calendar default)
  ALERT_EMAIL: '',             // '' = your own address
};

function getConfig_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const get = function (k) { return props[k] != null && props[k] !== '' ? props[k] : CONFIG_DEFAULTS[k]; };
  return {
    calendarName: get('CALENDAR_NAME'),
    lookbackDays: Number(get('LOOKBACK_DAYS')),
    includeNaps: String(get('INCLUDE_NAPS')).toLowerCase() === 'true',
    minWorkoutMinutes: Number(get('MIN_WORKOUT_MINUTES')),
    excludeTypes: String(get('EXCLUDE_TYPES')).split(',')
      .map(function (s) { return s.trim().toUpperCase(); }).filter(String),
    workoutColorId: get('WORKOUT_COLOR_ID'),
    alertEmail: get('ALERT_EMAIL'), // '' → resolved lazily by alertRecipient_()
  };
}

/**
 * The address for failure alerts. Without ALERT_EMAIL this is the owner's
 * primary calendar ID, which equals their address. It needs only the calendar
 * scope we already have, not userinfo.email (unlike Session.getEffectiveUser()).
 */
function alertRecipient_(cfg) {
  return cfg.alertEmail || CalendarApp.getDefaultCalendar().getId();
}
