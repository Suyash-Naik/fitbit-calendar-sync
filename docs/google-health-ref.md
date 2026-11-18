# Google Health API: Sleep Reference Notes

_Pages read 2026-11-18 by a web-fetch research agent. Items marked **[summary]** came from a model-extracted summary of a truncated page, not verbatim text. Everything else is verbatim or close paraphrase._

## Pages read
- https://developers.google.com/health/data-types/sleep
- https://developers.google.com/health/migration/api-specifications
- https://developers.google.com/health/scopes.md.txt
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list.md.txt
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/reconcile.md.txt
- https://developers.google.com/health/setup.md.txt
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints.md.txt (truncated at 39,899 of 168,164 chars; Sleep schema from **[summary]**)
- https://developers.google.com/health/data-types.md.txt (truncated; historical-query section from **[summary]**)

## 1. Endpoints

- **Base URL:** `https://health.googleapis.com/v4`
- **Use `reconcile` for this project.** The sleep guide says to query `reconcile` rather than `list`, because `list` returns every overlapping record from multiple sources (e.g. tracker plus Health Connect), so summing it can double-count. `reconcile` deduplicates and sets `sleep.metadata.mainSleep` to true on each day's primary session.
  - reconcile: `GET https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:reconcile`
  - list: `GET https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints`
- The request body must be empty for both. Use `me` (user inferred from the token) or a user ID.

### Query parameters (both endpoints)
- **`filter`** (AIP-160 syntax). Sleep can be filtered **only by session end time**:
  - `sleep.interval.end_time` (RFC-3339 UTC, e.g. `"2026-03-01T00:00:00Z"`)
  - `sleep.interval.civil_end_time` (ISO 8601 local, e.g. `"2026-03-01"`)
  - Operators `>=` and `<`, combined with `AND`.
  - Example from the guide: `filter=sleep.interval.civil_end_time >= "2026-03-01" AND sleep.interval.civil_end_time < "2026-03-15"`
  - ⚠️ **Conflict:** the list reference says the sleep filter supports `AND` and `OR`. The sleep guide says `OR` returns 400 `INVALID_DATA_POINT_FILTER_EXPRESSION_STRUCTURE`, and that filtering on `sleep.interval.start_time` or `civil_start_time` returns 400 `INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER`. **Use `AND` with end-time bounds only.**
- **`pageSize`:** default and maximum are both **25** for sleep. Larger values are clamped; negative values return 400.
- **`pageToken`:** pass the previous response's `nextPageToken`. Keep requesting until it is empty.
- **`dataSourceFamily`:** not supported for sleep. Setting it returns `INVALID_ARGUMENT`, so omit it.
- Results are ordered by interval start time, descending (list reference).

### Response shape
- Reconcile returns `{"dataPoints": [ ... ], "nextPageToken": "..."}`. Each item has a `dataPointName` and a `sleep` object. (Reconcile uses `dataPointName` for the identifier; list uses `name`.)
- Example request (guide):
  ```
  GET https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:reconcile?filter=sleep.interval.civil_end_time >= "2026-03-01" AND sleep.interval.civil_end_time < "2026-03-15"&pageSize=25
  Authorization: Bearer <access-token>
  ```
  URL-encode the filter in Apps Script.
- **Last night** (civil date D): `sleep.interval.civil_end_time >= "D" AND sleep.interval.civil_end_time < "D+1"`, or use `end_time` with UTC bounds.

## 2. Sample sleep session (reconcile response, from the guide, trimmed)

```json
{
  "dataPoints": [{
    "dataPointName": "users/user-id/dataTypes/sleep/dataPoints/data-point-id",
    "sleep": {
      "interval": {
        "startTime": "2026-03-03T20:57:30Z",
        "startUtcOffset": "0s",
        "endTime": "2026-03-04T04:41:30Z",
        "endUtcOffset": "0s"
      },
      "type": "STAGES",
      "stages": [
        {"startTime": "...Z", "startUtcOffset": "0s", "endTime": "...Z", "endUtcOffset": "0s", "type": "AWAKE"}
      ],
      "metadata": {"stagesStatus": "SUCCEEDED", "processed": true, "mainSleep": true},
      "summary": {
        "minutesInSleepPeriod": "464",
        "minutesAfterWakeUp": "0",
        "minutesToFallAsleep": "0",
        "minutesAsleep": "407",
        "minutesAwake": "57",
        "stagesSummary": [
          {"type": "AWAKE", "minutes": "56", "count": "12"},
          {"type": "LIGHT", "minutes": "198", "count": "19"},
          {"type": "DEEP", "minutes": "114", "count": "10"},
          {"type": "REM", "minutes": "94", "count": "4"}
        ]
      }
    }
  }],
  "nextPageToken": "..."
}
```

### Field notes
- **Time zone:** there is no IANA zone name. Each timestamp has an offset string such as `"-14400s"` in `startUtcOffset` / `endUtcOffset`.
- **All numbers in `summary` are strings.**
- **Stage types in the sample:** `AWAKE`, `LIGHT`, `DEEP`, `REM`. Session `type` is `STAGES` (classic logs use `CLASSIC`).
- **Additional stage enum values [summary]:** `SLEEP_STAGE_TYPE_UNSPECIFIED`, `ASLEEP`, `RESTLESS`. Not verified verbatim.
- **Other fields [summary]:** `shortAwakenings[]` (output only; can overlap stages), `outOfBedSegments[]`, `createTime`, `updateTime`. The interval also has `civilStartTime` and `civilEndTime` according to the summary, but no sample shows them.
- **Summary fields:** `minutesInSleepPeriod`, `minutesAsleep`, `minutesAwake`, `minutesToFallAsleep`, `minutesAfterWakeUp`, plus `stagesSummary[]` entries with `type`, `minutes`, `count`.
- **Sleep duration:** `summary.minutesAsleep`. **Deep sleep:** the `stagesSummary` entry with `type == "DEEP"`, or the sum of the DEEP stage intervals.
- Don't sum `list` results. Use `mainSleep` from reconcile to pick the primary session.

## 3. OAuth scopes
- **Read:** `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
- Write (not needed): `https://www.googleapis.com/auth/googlehealth.sleep.writeonly`
- Reconcile and list accept any scope from the full list of readonly/writeonly scopes; `googlehealth.sleep.readonly` is among them.
- All scopes start with `https://www.googleapis.com/auth/googlehealth`. The consent screen shows only the scopes requested, and the access token contains only the scopes the user approved.

## 4. Google Cloud project requirements (setup page)
- Enable the **Google Health API** (https://console.developers.google.com/apis/library/health.googleapis.com) and create an OAuth client on the Credentials page.
- The setup flow suggests a "Web Server" client with the redirect URI `https://www.google.com`. The page doesn't cover Apps Script; check separately.
- **Consent screen** (Audience page): publishing status "Testing", user type "External", and each user's email added under "Test users".
- **Scopes:** add them on the Data Access page under the "Google Health API" column.
- **Unverified apps:** "By default, newly created OAuth clients are in an unverified state with a cap of 100 users for both testing and production purposes." More than 100 users requires a third-party security review.
- ⚠️ **Testing refresh tokens:** "the refresh tokens issued are time-based and expire after 7 days." Published (In Production) tokens "generally don't expire unless they are revoked or remain unused for a prolonged period (typically six months)."
- Token refresh responses include `refresh_token_expires_in` (example value 112154).
- OAuth grant quota: more than 10,000 sign-ups or re-auths in 24 hours requires a quota increase.
- **No sandbox:** there is no separate staging environment, so every call hits production.
- Sensitive/restricted classification of the scopes: **not found**. Check the OAuth consent / Data Access UI.

## 5. Sleep score and efficiency
- **No sleep score field exists.** The Sleep, SleepSummary and SleepMetadata sections have no efficiency or score field **[summary]**.
- Efficiency is documented as a formula, not a field:
  `Sleep Efficiency Score = round( (Total Minutes Asleep / Total Minutes In Bed) * 100 )`
  → in Apps Script: `Math.round(minutesAsleep / minutesInSleepPeriod * 100)`

## 6. Fitbit Web API shutdown date
Not found on these pages. The migration page calls the Google Health API a "strategic evolution of the legacy Fitbit Web API" and maps scopes and data types, but gives no date. (Other sources cite the shutdown as 2 Nov 2026; see PLAN.md.)

## 7. Rate limits
- **No numbers found** on the pages read. The data-types page says historical queries "are still governed by standard rate limits" and links to a separate rate-limits page, which was not fetched.
- **Retry guidance [summary]:** strict exponential backoff for 429 and 504 responses, and never retry large failed payloads immediately.
- **Historical-query limits [summary]:** no data retention cap. Rollup windows are 14 days (heart rate, active minutes, etc.) or 90 days (other types). Sleep pages are capped at 25 results.

## Unclear / not found
- Sensitive/restricted scope classification, the Fitbit shutdown date, and rate-limit numbers.
- The OAuth redirect URI for Apps Script (the setup page uses `https://www.google.com` for a web-server client).
- The full stage enum list beyond `AWAKE`/`LIGHT`/`DEEP`/`REM`, and the `civilStartTime`/`civilEndTime` field names (both come from the summary, not verbatim text).
- Times carry only an offset (e.g. `"-14400s"`), with no IANA zone name.

---

# Part 2: Workouts (`exercise`)

_Follow-up research, 2026-11-18. Tags: **[verbatim]** = text read directly on the page; **[summary]** = model-extracted from a truncated page._

Pages read: https://developers.google.com/health/data-types/workouts.md.txt (full) and https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints.md.txt (from offset 39899; cut at 79,798 of 168,164 chars).

## 1. Data type & endpoints
- dataType: `exercise` (record type Session) [verbatim]
- reconcile: `GET https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints:reconcile` [verbatim]
- list: `GET https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints` [verbatim]
- Operations: list, get, reconcile, create, update, batchDelete [verbatim]

## 2. Filters & paging
- "`exercise` only supports filtering by `civil_start_time`" [verbatim]. Example:
  `exercise.interval.civil_start_time >= "2026-04-20T00:00:00" AND exercise.interval.civil_start_time < "2026-04-21T00:00:00"`
- `>=`, `<`, `AND` only. No end-time filter is documented. The generic `{type}.interval.start_time` (UTC) pattern is **unconfirmed** for exercise.
- pageSize default and max are **25** [verbatim]. Results are ordered by start time, descending. Paginate with `nextPageToken`.

## 3. Sample response (workouts guide, condensed) [verbatim]
```json
{
  "name": "users/<user>/dataTypes/exercise/dataPoints/<id>",
  "dataSource": {"recordingMethod": "ACTIVELY_MEASURED", "application": {}, "platform": "GOOGLE_WEB_API"},
  "exercise": {
    "interval": {"startTime": "2026-04-20T08:00:00Z", "startUtcOffset": "0s", "endTime": "2026-04-20T08:35:00Z", "endUtcOffset": "0s"},
    "exerciseType": "RUNNING",
    "metricsSummary": {"caloriesKcal": 380, "distanceMillimeters": 5000000, "steps": "6200",
                       "averagePaceSecondsPerMeter": 0.36, "averageHeartRateBeatsPerMinute": "148"},
    "exerciseMetadata": {},
    "displayName": "Run",
    "activeDuration": "1800s",
    "exerciseEvents": [{"eventTime": "...", "eventUtcOffset": "0s", "exerciseEventType": "PAUSE"}],
    "updateTime": "...", "createTime": "..."
  }
}
```

## 4. Exercise schema
- Fields [verbatim]: `interval`, `exerciseType`, `splits`, `exerciseEvents`, `splitSummaries`, `metricsSummary`, `exerciseMetadata`, `displayName`, `activeDuration`, `notes`, `updateTime`, `createTime`.
- `interval` is a `SessionTimeInterval`: `startTime`, `startUtcOffset`, `endTime`, `endUtcOffset`, `civilStartTime`, `civilEndTime`.
- `displayName`: "For all exercise types other than `OTHER`, the system ignores client input" [verbatim], i.e. it is set by the server.
- `exerciseType` enum [verbatim, partial]: `EXERCISE_TYPE_UNSPECIFIED`, `AEROBIC_WORKOUT`, `BIKING`, `RUNNING`, `SWIMMING`, `WALKING`, `WEIGHTLIFTING`, `YOGA`, `OTHER`, … The docs say it "may receive new values in the future."
- `activeDuration`: "Duration excluding pauses" (e.g. `"1800s"`) [verbatim]. There is no total-duration field; use `endTime − startTime`.

### metricsSummary
| Field | Notes | Source |
|---|---|---|
| `caloriesKcal` | number | verbatim |
| `distanceMillimeters` | number | verbatim |
| `steps` | string | verbatim |
| `averageHeartRateBeatsPerMinute` | string | verbatim |
| `averagePaceSecondsPerMeter` | number | verbatim |
| `heartRateZoneDurations` → `lightTime`, `moderateTime`, `vigorousTime`, `peakTime` | durations | summary |
| `averageSpeedMillimetersPerSecond`, `elevationGainMillimeters`, `activeZoneMinutes`, `runVo2Max`, `totalSwimLengths`, `mobilityMetrics` | | summary |
| max heart rate | **not found** | n/a |

### Splits, events, metadata
- `splitSummaries[]` "segments the session by lap or split" [verbatim]. Each entry has `startTime`, `startUtcOffset`, `endTime`, `endUtcOffset`, `activeDuration`, `metricsSummary`, `splitType` [summary]. `splitType`: `SPLIT_TYPE_UNSPECIFIED`, `MANUAL`, `DURATION`, `DISTANCE`, `CALORIES` [summary].
- `splits[]`: the default split is 1 km / 1 mile [verbatim]. The guide and reference disagree on which field holds laps; prefer `splitSummaries`.
- `exerciseEvents[]`: `eventTime`, `eventUtcOffset`, `exerciseEventType` ∈ `START`, `STOP`, `PAUSE`, `RESUME`, `AUTO_PAUSE`, `AUTO_RESUME` [summary].
- `exerciseMetadata.hasGps`, `poolLengthMillimeters` [summary]. GPS export: `GET .../dataPoints/{id}:exportExerciseTcx?alt=media` [verbatim]; needs the location scope.

## 5. Scopes
- Workouts: `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` [verbatim]
- Heart-rate telemetry endpoint: `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` [verbatim]
- GPS export: `https://www.googleapis.com/auth/googlehealth.location.readonly` [verbatim]

## 6. Open questions
- **Reconcile dedupe for exercise:** the reference says reconcile merges "data points from multiple data sources into a single data stream" [verbatim], but nothing describes exercise dedupe specifically. Likely, but unverified.
- **Auto-detected vs manual workouts:** there is no explicit flag. Candidates are `dataSource.recordingMethod` (enum values not read), `notes` ("captured at manual logging" [verbatim]), and `splitType: MANUAL`.
- **Apps Script:** none of the Health API pages mention Apps Script or `ScriptApp.getOAuthToken`. The documented path is a standard GCP project with the API enabled. Whether a default (managed) Apps Script project works is undocumented.
