# Fitbit Calendar Sync

A Google Apps Script that copies your **sleep, naps and workouts** from the **Google Health API** (the successor to the Fitbit Web API) into a private **"Fitbit"** Google Calendar. It runs every 4 hours under your own Google account.

```
💤 Sleep 8h 05m · 95%                    🏋️ Strength training · 59m
Deep 1h 11m · Rem 1h 19m · Light 5h 35m   Active 59m · 458 kcal
· Awake 24m                               Avg HR 124 bpm · 51 Zone Minutes
Asleep 8h 05m · In bed 8h 29m             HR zones: light 12m · moderate 43m
· Efficiency 95%                          · vigorous 4m
```

Every event is **Free** (it doesn't block availability) and **private**. Re-runs never duplicate events: each event carries a hidden ID, and an event is updated in place when Fitbit reprocesses the data.

## How it works

```
Time trigger (every 4 h) ─► syncAll()
   ├─ Google Health API  dataPoints:reconcile  (sleep by end date, exercise by start date)
   │    auth: a separate health-only OAuth token (auth.js). The API rejects
   │    Apps Script's built-in token because it carries non-health scopes.
   ├─ parse.js     data point → { summary, description, start, end }
   └─ calendar.js  find by fitbitSyncId → insert / patch / skip
```

## Layout

```
fitbit-calendar-sync/
├─ README.md            ← you are here
├─ .clasp.json          clasp config (scriptId, rootDir: src)
├─ package.json         npm test / push scripts
├─ src/                 ← everything here is pushed to Apps Script
│  ├─ appsscript.json   manifest: scopes, Calendar advanced service
│  ├─ main.js           entry points: syncAll, syncDryRun, installTrigger, backfill30, wipeSyncedEvents
│  ├─ config.js         settings and their defaults (overridable via Script properties)
│  ├─ auth.js           health-only OAuth flow: authorizeHealth, authCallback, resetHealthAuth
│  ├─ health.js         Google Health API client (pagination, retries)
│  ├─ parse.js          pure formatting: sleep, nap and workout → event (unit-tested)
│  ├─ calendar.js       "Fitbit" calendar + idempotent upsert
│  └─ debug.js          debugDump, debugSchema, debugWorkoutTypes (schema views are values-free)
├─ test/                node --test unit tests + scrubbed fixtures
├─ docs/                reference material, see docs/index.md
├─ site/                public website: index.html, privacy.html, terms.html
└─ .github/workflows/
   └─ pages.yml         deploys site/ to GitHub Pages on push
```

**Website:** `site/` is published to GitHub Pages at `https://<github-username>.github.io/<repo-name>/`. Google's consent screen needs these home, privacy and terms URLs to publish the app. One-time setup: repo **Settings → Pages → Source: GitHub Actions** (details in [docs/guide.md](docs/guide.md), Part D).

## Quick start

First-time setup (Cloud project, OAuth client, Apps Script link) is a one-off. Follow **[docs/guide.md](docs/guide.md)**. After that:

```powershell
npm test          # unit tests for parse.js (Node 18+)
clasp push        # upload src/ to Apps Script
```

In the Apps Script editor (functions ending in `_` are private and hidden from the Run menu):

| Function | File | What it does |
|---|---|---|
| `authorizeHealth` | auth.gs | Logs a link for the one-time Google Health consent. Re-run it when the authorization expires |
| `syncDryRun` | main.gs | Logs the events it would create, with no calendar changes |
| `syncAll` | main.gs | The real sync. The trigger calls this |
| `installTrigger` / `uninstallTrigger` | main.gs | Start / stop the 4-hourly sync |
| `backfill30` | main.gs | Sync the last 30 days once |
| `wipeSyncedEvents` | main.gs | Delete every event this script created (and nothing else) |
| `debugSchema` / `debugWorkoutTypes` | debug.gs | Show data structure and workout types without personal values |

## Settings

**Project Settings → Script properties.** Optional; defaults are shown.

| Property | Default | Meaning |
|---|---|---|
| `HEALTH_CLIENT_ID` / `HEALTH_CLIENT_SECRET` | *required* | OAuth client from the guide, step A7 |
| `CALENDAR_NAME` | `Fitbit` | Target calendar (created automatically) |
| `LOOKBACK_DAYS` | `2` | Days re-checked on each run |
| `INCLUDE_NAPS` | `true` | Sync non-main sleep sessions |
| `MIN_WORKOUT_MINUTES` | `0` | Skip shorter workouts (e.g. `15` to hide short auto-detected walks) |
| `EXCLUDE_TYPES` | *(empty)* | Comma-separated types, e.g. `WALKING` |
| `WORKOUT_COLOR_ID` | `10` | Event colour for workouts (`''` = calendar colour) |
| `ALERT_EMAIL` | your address | Where failure alerts go (at most one per 12 h) |

## Known limitations

- **7-day re-authorization.** The OAuth consent screen is in *Testing*, so the health authorization expires weekly. You get an alert email; fix it by running `authorizeHealth`. Publishing removes the limit. Next steps. 
- **No Sleep Score.** The Google Health API doesn't expose it. Efficiency is computed as asleep ÷ in bed.
- **No auto-detected vs manual flag** for workouts. Use `MIN_WORKOUT_MINUTES` / `EXCLUDE_TYPES` to filter.
- **Workout icons** are mapped only for types seen in real data or the docs. Unknown types show 💪. Run `debugWorkoutTypes` to find the exact enum before adding one in `parse.js`.

## Docs

See **[docs/index.md](docs/index.md)** for the setup guide, the design plan and its findings log, and the API reference notes.
