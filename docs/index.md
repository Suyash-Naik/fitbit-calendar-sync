# Docs index

**Fitbit Calendar Sync** is a Google Apps Script that puts your Fitbit sleep, naps and workouts into a private Google Calendar. It reads them from the Google Health API, because the Fitbit Web API was switched off on 2 Nov 2026. Code and usage are in the [project README](../README.md).

| Document | Read it when… |
|---|---|
| [guide.md](guide.md) | **Setting up** from scratch, or fixing auth: Cloud project, consent screen, OAuth client, clasp, first run, go-live, troubleshooting |
| [PLAN.md](PLAN.md) | You want to know **why** it's built this way: decisions, architecture, risks, and a dated **findings log** from real runs |
| [google-health-ref.md](google-health-ref.md) | You're **changing the API code**: endpoints, filters, scopes, sleep and exercise field reference (each item marked verbatim or summarised from Google's docs) |
| [../site/](../site/) | The public **website** (home, privacy, terms) needed to publish the consent screen. Deployed to GitHub Pages by `.github/workflows/pages.yml` (guide, Part D) |

**Key lessons so far** (details in PLAN.md §7):
1. The Google Health API rejects Apps Script's built-in token, so health calls use a separate health-only OAuth token.
2. Sleep is filtered by **end** time and exercise by **start** time, with `AND` only and at most 25 results per page.
3. There's no Sleep Score and no flag for auto-detected vs manual workouts.
