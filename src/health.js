/**
 * Google Health API client.
 * Auth: a health-only token from auth.js. The Health API rejects
 * ScriptApp.getOAuthToken() because it carries non-health scopes.
 * Reference notes: ../docs/google-health-ref.md
 */

const HEALTH_BASE_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/';
const HEALTH_PAGE_SIZE = 25; // max for sleep and exercise
const HEALTH_MAX_RETRIES = 4;

/**
 * Calls dataPoints:reconcile for a data type and follows every page.
 * @param {string} dataType e.g. 'sleep' or 'exercise'
 * @param {string} filter AIP-160 filter expression (unencoded)
 * @return {Object[]} all data points
 */
function healthReconcile_(dataType, filter) {
  const points = [];
  let pageToken = '';
  do {
    const params = { filter: filter, pageSize: HEALTH_PAGE_SIZE };
    if (pageToken) params.pageToken = pageToken;
    const url = HEALTH_BASE_URL + dataType + '/dataPoints:reconcile?' + toQueryString_(params);
    const body = healthFetchJson_(url);
    (body.dataPoints || []).forEach(function (dp) { points.push(dp); });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return points;
}

/** Sleep sessions whose (local) end date falls in [fromDate, toDateExclusive). */
function fetchSleep_(fromDate, toDateExclusive) {
  const filter =
    'sleep.interval.civil_end_time >= "' + civilDate_(fromDate) + '"' +
    ' AND sleep.interval.civil_end_time < "' + civilDate_(toDateExclusive) + '"';
  return healthReconcile_('sleep', filter);
}

/** Exercise sessions whose (local) start falls in [fromDate, toDateExclusive). */
function fetchExercise_(fromDate, toDateExclusive) {
  const filter =
    'exercise.interval.civil_start_time >= "' + civilDate_(fromDate) + 'T00:00:00"' +
    ' AND exercise.interval.civil_start_time < "' + civilDate_(toDateExclusive) + 'T00:00:00"';
  return healthReconcile_('exercise', filter);
}

/** GET with bearer auth; retries 429/5xx with exponential backoff. */
function healthFetchJson_(url) {
  for (let attempt = 0; ; attempt++) {
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + getHealthAccessToken_() },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());

    const retryable = code === 429 || code >= 500;
    if (retryable && attempt < HEALTH_MAX_RETRIES) {
      Utilities.sleep(Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500));
      continue;
    }
    const err = new Error('Health API HTTP ' + code + ': ' + res.getContentText().slice(0, 1500));
    err.httpCode = code;
    throw err;
  }
}

/** yyyy-MM-dd in the script's time zone. */
function civilDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toQueryString_(params) {
  return Object.keys(params)
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
}

function addDays_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
