# Fitbit → Calendar Sync (Sleep, Naps & Workouts): Plan

_Researched 2026-11-18. Revised the same day after review. Raw API notes are in [google-health-ref.md](google-health-ref.md)._

## 0. Decisions

| Topic | Decision |
|---|---|
| Data source | **Google Health API** (`health.googleapis.com/v4`), the successor to the Fitbit Web API (switched off 2 Nov 2026) and to Google Fit |
| What gets synced | Main sleep, **naps**, and **tracked workouts** |
| Target calendar | A dedicated **"Fitbit"** calendar, created by the script on first run |
| Sleep score | Dropped (not exposed by any API). Efficiency is computed instead |
| Event properties | Free (`transparency: transparent`), private, dedup via a hidden ID |
| Schedule | Every **4 h**, with a 2-day lookback. Re-runs are idempotent |
| Runtime | **Google Apps Script** (script.google.com), owned by and running as you |
| Account | Personal Gmail |

## 1. "Apps Script, not an app": what setup is actually needed

All of the code lives and runs in **Apps Script** under your account. Nothing is published, listed, or shared, and there's no web app or add-on.

There is one unavoidable piece of plumbing. Apps Script attaches every script to a Google Cloud project behind the scenes. The **default hidden project can't enable the Google Health API**, so you link the script to a **standard Cloud project you own**. That project needs an *OAuth consent screen* entry because Google requires one before any script can ask for health scopes. It is a private config record with you as the only user, not an "app" anyone else sees.

The one setting that matters is the consent screen's **publishing status**:
- **Testing:** the health permission expires every **7 days**, so the trigger would silently stop working each week.
- **In production (unverified):** the permission persists. You'll click through a one-time "Google hasn't verified this app" screen when you authorize your own script. No review is needed for personal use (under 100 users).

So "In production" here is only a toggle to stop weekly re-auth. It doesn't make anything public. Step 0 below covers it, and Phase 1 verifies it. If Google ever blocks unverified production for these scopes, the fallback is the weekly re-auth with an email reminder from the script.

## 2. Architecture

```
Time-driven trigger (every 4 h)
        │
        ▼
syncAll()   ── LockService (no overlapping runs)
  ├─ syncSleep(lookbackDays=2)
  │    GET …/dataTypes/sleep/dataPoints:reconcile      filter on civil_END_time
  │    → main sleep + naps (metadata.mainSleep true/false)
  ├─ syncWorkouts(lookbackDays=2)
  │    GET …/dataTypes/exercise/dataPoints:reconcile   filter on civil_START_time
  │
  └─ for each record → upsertEvent(record)
         Calendar.Events.list(privateExtendedProperty="fitbitSyncId=<id>")
         → insert if missing, patch if changed, skip otherwise
```

Auth: `UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } })`. The scopes come from the manifest. No OAuth2 library is needed.

### 2a. Sleep (incl. naps)
- Endpoint: `dataTypes/sleep/dataPoints:reconcile`. Use reconcile, not `list`, which double-counts multi-source records.
- Filter: `sleep.interval.civil_end_time >= "D-2" AND sleep.interval.civil_end_time < "D+1"`. End time only, `AND` only. `pageSize` ≤ 25 + `nextPageToken`.
- `metadata.mainSleep == true` → 💤 **Sleep** event; `false` → 😴 **Nap** event.
- Fields: `interval.startTime/endTime` (UTC), `summary.minutesAsleep`, `summary.minutesInSleepPeriod`, and `summary.stagesSummary[]` with `DEEP`/`REM`/`LIGHT`/`AWAKE`. **The numbers are strings.**
- Efficiency = `round(minutesAsleep / minutesInSleepPeriod * 100)`.
- `type: CLASSIC` sessions (common for short naps) have no stages, so the description omits that section.

| | Example |
|---|---|
| Title (sleep) | `💤 Sleep 7h 30m · 92%` |
| Title (nap) | `😴 Nap 45m` |
| Description | `Deep 1h 45m · REM 2h 10m · Light 3h 30m · Awake 25m` / `Efficiency 92% · Time in bed 8h 05m` |

### 2b. Workouts
- Endpoint: `dataTypes/exercise/dataPoints:reconcile`. Scope `googlehealth.activity_and_fitness.readonly`.
- Filter: `exercise.interval.civil_start_time >= "YYYY-MM-DDT00:00:00" AND … < "…"`. **Start time only** for exercise (the opposite of sleep).
- Fields: `exerciseType` (enum, e.g. `RUNNING`, `WALKING`, `BIKING`, `SWIMMING`, `YOGA`, `WEIGHTLIFTING`, `OTHER`, …, and new values may appear), `displayName`, `activeDuration` (`"1800s"`), and `metricsSummary` with `caloriesKcal`, `distanceMillimeters`, `steps` (string), `averageHeartRateBeatsPerMinute` (string), `averagePaceSecondsPerMeter`, and `heartRateZoneDurations` (to verify).
- Icon map: RUNNING 🏃, WALKING 🚶, BIKING 🚴, SWIMMING 🏊, YOGA 🧘, WEIGHTLIFTING 🏋️, default 💪. Unknown enum values fall back to `displayName`.
- Optional per-type filter (`MIN_WORKOUT_MINUTES`, `EXCLUDE_TYPES`) so that, for example, auto-detected 10-minute walks don't flood the calendar.

| | Example |
|---|---|
| Title | `🏃 Run · 5.02 km · 30m` (non-distance types: `🏋️ Weights · 45m`) |
| Description | `Active 30m (total 35m) · 380 kcal · 6,200 steps` / `Avg HR 148 bpm · Pace 6:00 /km` / `Zones: light 5m · moderate 12m · vigorous 10m · peak 3m` |

Not available or unverified: max HR, and an explicit auto-detected vs manual flag. `dataSource.recordingMethod` may help; check it in the Phase 1 output.

### 2c. Calendar event (shared upsert)
```js
const ev = {
  summary, description,
  start: { dateTime: startIso }, end: { dateTime: endIso },   // UTC ISO; calendar renders in its own zone
  transparency: 'transparent',
  visibility: 'private',
  colorId: kind === 'workout' ? '10' : '9',
  extendedProperties: { private: { fitbitSyncId: id, kind, hash } },  // hash = digest of the summary/description
};
```
- Find the existing event with `Calendar.Events.list(calId, { privateExtendedProperty: 'fitbitSyncId=' + id })`.
- If the `hash` differs, `patch` the event. This catches Fitbit reprocessing stages hours later. Identical events are skipped.
- `ensureCalendar()` creates the **"Fitbit"** calendar if it doesn't exist and stores its ID in `PropertiesService`.

### 2d. Manifest (`appsscript.json`)
```json
{
  "timeZone": "Europe/Vienna",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Calendar", "serviceId": "calendar", "version": "v3" }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.send_mail"
  ]
}
```

## 3. Tooling

| Tool | Purpose |
|---|---|
| **clasp** (`npm i -g @google/clasp`) | Edit locally, `clasp push`, version in this repo. Enable "Google Apps Script API" at script.google.com/home/usersettings |
| **@types/google-apps-script** | VS Code autocomplete (dev-dependency) |
| **Advanced Calendar service** | transparency, extended properties, patch |
| **UrlFetchApp + `ScriptApp.getOAuthToken()`** | Calls the Health API |
| **PropertiesService** | Config: `CALENDAR_ID`, `LOOKBACK_DAYS`, `INCLUDE_NAPS`, `MIN_WORKOUT_MINUTES`, `EXCLUDE_TYPES`, `ALERT_EMAIL` |
| **LockService / MailApp** | Prevent overlapping runs / send failure alerts |
| **`node --test`** | Unit tests for the pure parse/format functions against JSON fixtures |

## 4. Phases

**Phase 0: One-time setup (manual, about 20 min)**
1. console.cloud.google.com → new project → enable the **Google Health API** and the **Google Calendar API**.
2. Google Auth Platform → Branding / Audience: External. Add yourself as a test user. On Data Access, add the scopes from the manifest. Then on Audience, **Publish app → In production** (see §1).
3. script.google.com → new project → Project Settings → *Change Google Cloud project* → paste the project **number**.
4. `clasp login` → `clasp clone <scriptId> --rootDir src` into this folder.

**Phase 1: Spike (de-risk auth + data shapes)**
- `debugDump()` logs raw reconcile output for sleep and exercise over the last 3 days.
- Confirm: (a) `getOAuthToken()` carries the googlehealth scopes; (b) the authorization survives past 7 days; (c) real field names (`civilStartTime`, `heartRateZoneDurations`, `recordingMethod`, nap `type`).
- Save scrubbed samples to `test/fixtures/`.

**Phase 2: Core**
- `health.js` (fetch, pagination, backoff on 429/5xx), `parse.js` (pure: sleep/nap/workout → event model), `calendar.js` (ensureCalendar, upsert), `main.js` (`syncAll`, `installTrigger`, `uninstallTrigger`).

**Phase 3: Hardening**
- Lock, failure emails (always on 401/403, since an auth break means re-authorizing), `backfill(days)` for history, and a `wipeSyncedEvents()` utility that deletes only events tagged with `fitbitSyncId`.

**Phase 4: Tests & docs**
- `node --test` against the fixtures, and a README covering setup, config properties and troubleshooting.

## 5. Layout
_As built. See the top-level [README](../README.md) for the authoritative tree._
```
GoogleAppScripts/fitbit-calendar-sync/
├─ README.md  package.json  .clasp.json  .gitignore
├─ docs/   index.md  guide.md  PLAN.md  google-health-ref.md
├─ site/   index.html  privacy.html  terms.html   (GitHub Pages)
├─ .github/workflows/pages.yml
├─ src/    appsscript.json  main.js  config.js  auth.js  health.js  parse.js  calendar.js  debug.js
└─ test/   parse.test.js  fixtures/{exercise-walk,sleep-docs}.json
```

## 6. Risks & open items
- **R1, auth persistence.** Covered in §1 and verified in Phase 1.
- **R2, sync lag / reprocessing.** Mitigated by the 4-hour runs, the 2-day lookback, and hash-based patching.
- **R3, workout noise.** Use the min-duration and type filters. Defaults to be tuned after seeing real data.
- **R4, overlaps.** A nap inside a main-sleep window, or a workout overlapping another, shows as stacked events. That's harmless because they're all "Free".
- **R5, unverified fields.** `heartRateZoneDurations`, the split/lap structure, `recordingMethod` values and whether reconcile dedupes exercise all came from summarized docs. Check them against the Phase 1 output.
- **R6, quotas.** UrlFetch and Calendar quotas are far above roughly 6 runs/day × 2–4 calls.

## Sources
- Sleep: https://developers.google.com/health/data-types/sleep
- Workouts: https://developers.google.com/health/data-types/workouts
- Scopes: https://developers.google.com/health/scopes
- Setup: https://developers.google.com/health/setup
- dataPoints reference: https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
- Fitbit Web API shutdown: https://dev.to/msavas2544/the-fitbit-web-api-was-switched-off-on-2-november-heres-a-python-path-to-the-google-health-api-38kg
- Google Fit turndown: https://9to5google.com/2024/05/04/google-fit-api-shutdown/

## 7. Findings log
- **2026-11-18, first spike run.** The Health API returned `403 DISALLOWED_OAUTH_SCOPES` for `ScriptApp.getOAuthToken()`. It rejects any token that also carries non-health scopes (here: Calendar, `script.external_request`, `script.scriptapp`, `script.send_mail`). **Change:** health calls now use a separate health-only token from our own OAuth client (Web application type, redirect `https://script.google.com/macros/d/{SCRIPT_ID}/usercallback`). The refresh token is stored in UserProperties (`src/auth.js`). The health scopes were removed from `appsscript.json`. They stay on the consent screen's Data Access page. R1 (7-day Testing expiry) now applies to this refresh token; an `invalid_grant` error means re-running `authorizeHealth`.
- **2026-11-18, health-only token works.** Exercise data matches the docs: `heartRateZoneDurations` and `elevationGainMillimeters` are confirmed. **`dataSource`/`recordingMethod` is absent from reconcile results**, so auto-detected and manual workouts can't be told apart; `MIN_WORKOUT_MINUTES`/`EXCLUDE_TYPES` handle the noise instead. The sleep shape is still unverified against real data; `debugSchema()` provides a values-free check.
- **2026-11-18, sleep schema verified** with `debugSchema()` (values-free). It matches the parser: summary minutes are strings and stages are `AWAKE`/`LIGHT`/`DEEP`/`REM`. New fields: `metadata.manuallyEdited` and `metadata.externalId`, plus a `shortAwakenings[]` array (ignored). Exercise added `STRENGTH_TRAINING` and `metricsSummary.activeZoneMinutes` (string). No naps were in the window yet, so nap handling is covered only by a synthetic test.
- **2026-11-18, workout types (30 days, via `debugWorkoutTypes`):** `WALKING` (38), `STRENGTH_TRAINING` (5), `INDOOR_CLIMBING` (1). Climbing and strength have no distance or steps; climbing has elevation gain. Icons are mapped only for verified enum values; anything else falls back to 💪.
