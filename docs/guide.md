# Setup Guide: Fitbit Calendar Sync

A step-by-step guide to setting up the Google Cloud project and Apps Script for this sync. Work through it in order and tick off each box.

> **Why is a Cloud project needed at all?** The code runs in Apps Script under your own account. But Apps Script's default hidden Cloud project can't turn on the Google Health API, so the script must be linked to a Cloud project you own. That project also needs a *consent screen*. This is a private record (you're the only user), not a published app.

---

## Part A: Google Cloud project

### A1. Create the project ✅
- [x] https://console.cloud.google.com → project selector → **New project**
- [x] Name it, e.g. `fitbit-sync`. In this setup the **Project ID** is `fitbit-sync-515114`.

### A2. Enable the APIs
Do this **before** the consent screen. Otherwise the health scopes won't appear in the list.
- [x] Left menu → **APIs and services → Library**
- [x] Search for **Google Health API** → **Enable**
- [x] Search for **Google Calendar API** → **Enable**
- [x] Check: **APIs and services → Enabled APIs and services** lists both.

### A3. Consent screen: initial setup ✅
- [x] **APIs and services → OAuth consent screen**, or the **Configure consent screen** button in the yellow banner on *Credentials*. This opens the **Google Auth Platform** pages.
- [x] **Get started** wizard:
  - App information: name `Naik Health-to-Calendar` (it must identify you and must not contain Google brands such as *Fitbit*; `Fitbit Calendar Sync` was rejected), user support email = your Gmail
  - Audience: **External** (Internal is greyed out for personal Gmail)
  - Contact information: your Gmail
  - Agree to the policy → **Create**

### A4. Data Access (scopes)
- [x] Google Auth Platform sidebar → **Data Access** → **Add or remove scopes**
- [x] Scroll to the bottom → **Manually add scopes** → paste:
  ```
  https://www.googleapis.com/auth/calendar
  https://www.googleapis.com/auth/googlehealth.sleep.readonly
  https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
  https://www.googleapis.com/auth/script.external_request
  https://www.googleapis.com/auth/script.scriptapp
  https://www.googleapis.com/auth/script.send_mail
  ```
- [x] **Add to table** → **Update** → **Save** at the bottom of the page. "Sensitive" or "restricted" labels are expected.

### A5. Audience: test user
- [x] Sidebar → **Audience** → **Test users** → **+ Add users** → your Gmail → **Save**
- [x] Leave **Publishing status = Testing** for now. Everything works in Testing; the only drawback is that authorization expires about every **7 days** (see Part D).

### A6. Copy the project **number**
- [x] Project selector (top bar) → your project. Or go to **Cloud overview → Dashboard** → *Project info* card.
- [x] Copy the **Project number** (`93924028331`). This is **not** the project ID `fitbit-sync-515114`. Apps Script needs the number.

### A7. Create an OAuth client for the Health API
> **Why:** the Health API rejects Apps Script's built-in token (`403 DISALLOWED_OAUTH_SCOPES`) because that token also carries Calendar/UrlFetch/trigger scopes. The script therefore gets a separate **health-only** token through its own OAuth client (`src/auth.js`).

- [x] **APIs and services → Credentials → + Create credentials → OAuth client ID**
- [x] Application type: **Web application**, Name: `Apps Script health client`
- [x] **Authorised redirect URIs → + Add URI**, then paste exactly:
  ```
  https://script.google.com/macros/d/16DOUHlh0xMNw8u6J23cS4ebv2_qH0UfM9REINFH3RfCEpMbhyjuYMZhb/usercallback
  ```
- [x] Leave *Authorised JavaScript origins* empty → **Create**
- [x] Copy the **Client ID** and **Client secret** from the dialog. Keep the secret out of git and chat.

---

## Part B: Apps Script project

### B1. Create the script
- [x] https://script.google.com → **New project** → rename it to `Fitbit Calendar Sync`

### B2. Link it to the Cloud project
- [x] ⚙️ **Project Settings** (left sidebar) → *Google Cloud Platform (GCP) Project* → **Change project**
- [x] Paste the **project number** from A6 → **Set project**
- _If it errors with "consent screen not configured", go back and finish A3–A5._

### B3. Show the manifest and copy the script ID
- [x] Project Settings → tick **Show "appsscript.json" manifest file in editor**
- [x] Project Settings → **IDs** → copy the **Script ID** (16DOUHlh0xMNw8u6J23cS4ebv2_qH0UfM9REINFH3RfCEpMbhyjuYMZhb)

### B4. Store the OAuth client in Script properties
- [x] Apps Script → ⚙️ **Project Settings** → scroll to **Script properties** → **Add script property**:
  | Property | Value |
  |---|---|
  | `HEALTH_CLIENT_ID` | Client ID from A7 |
  | `HEALTH_CLIENT_SECRET` | Client secret from A7 |
- [x] **Save script properties**. They live only in the Apps Script project, never in the code or git.

---

## Part C: Local development with clasp

Run these in a terminal inside `GoogleAppScripts/fitbit-calendar-sync/`.

- [x] Turn on the Apps Script API for your account: https://script.google.com/home/usersettings → **Google Apps Script API: On**
- [x] **Install Node.js** (it brings `npm`; not installed on this machine yet):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
  Then **close and reopen the terminal** (and VS Code, if you use its terminal) so `node` and `npm` are on PATH. Check with `node --version` and `npm --version`.
- [x] Install clasp: `npm install -g @google/clasp`
  - If PowerShell then says *"clasp.ps1 cannot be loaded because running scripts is disabled"*, run this once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- [x] Log in: `clasp login` (a browser window opens; approve it with the same Gmail)
- [x] Clone (from inside `GoogleAppScripts/fitbit-calendar-sync/`):
  ```powershell
  clasp clone 16DOUHlh0xMNw8u6J23cS4ebv2_qH0UfM9REINFH3RfCEpMbhyjuYMZhb --rootDir src
  ```
  This creates `.clasp.json` here and pulls `appsscript.json` + `Code.js` into `src/`.
  ⚠️ Run it **inside** `fitbit-calendar-sync/`. clasp writes to the current folder; if `.clasp.json` and `src/` land one level up, move them into `fitbit-calendar-sync/`.
- [ ] Day-to-day: edit locally → `clasp push` → run functions in the Apps Script editor.

- [ ] First push (from `fitbit-calendar-sync/`): `clasp push`. If it asks to overwrite the manifest, answer **y**.

---

## Part D: Publish to "In production" (optional, stops the 7-day expiry)

In **Testing** mode, Google expires the authorization for External apps after 7 days, so the trigger would stop syncing until you re-authorize. Publishing removes that, but Google first requires a **home page**, **privacy policy** and **terms of service** link on **Branding**, all on a domain you own.

### D1. Host the website on GitHub Pages
The site lives in [`site/`](../site/): `index.html` (home page), `privacy.html` and `terms.html`. The workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) publishes **only that folder**. It runs on every push that changes `site/`, and it can also be started by hand.

- [ ] Create the GitHub repo (e.g. `fitbit-calendar-sync`) and push this project to it.
  - On a free GitHub plan, Pages needs the repo to be **public**. Check first that nothing secret is committed. The OAuth **client secret** lives only in Script properties; the script ID and project number are identifiers, not secrets.
- [ ] Repo → **Settings → Pages** → *Build and deployment* → Source: **GitHub Actions**. (Do this once, before or after the first push.)
- [ ] Repo → **Actions** → *Deploy site to GitHub Pages*. Check that it went green. If it ran before Pages was enabled, open it → **Run workflow**.
- [x] The site is live at `https://<github-username>.github.io/<repo-name>/`. Here the GitHub user site has a custom domain, so `suyash-naik.github.io/...` redirects (301) to **`https://suyashnaik.com/fitbit-calendar-sync/`**. Use the final `suyashnaik.com` URLs and domain in D2, not the redirecting `github.io` ones: the links must sit on an authorised domain.
- [ ] Open `/`, `/privacy.html` and `/terms.html` in a private window to check they load.

> Links pointing at `github.com/.../blob/...` or `sites.google.com` won't work. The domain must be one you can add under *Authorised domains*. Here that's your `<github-username>.github.io`.
>
> **Alternative:** if you'd rather use your own website, upload the three files from `site/` there and use that domain in D2.

### D2. Fill in Branding
- [ ] Google Auth Platform → **Branding**
- [ ] *Application home page*: `https://suyashnaik.com/fitbit-calendar-sync/`
- [ ] *Application privacy policy link*: `https://suyashnaik.com/fitbit-calendar-sync/privacy.html`
- [ ] *Application Terms of Service link*: `https://suyashnaik.com/fitbit-calendar-sync/terms.html`
- [ ] *Authorised domains* → **+ Add domain** → `suyashnaik.com` (lowercase, no `https://`, no path)
  - Without a custom domain these would be `https://<github-username>.github.io/<repo-name>/…` and `<github-username>.github.io`.
- [ ] If Google asks you to prove you own the domain: [Google Search Console](https://search.google.com/search-console) → **Add property → Domain** → `suyashnaik.com` → add the TXT record it shows at your DNS provider → **Verify**. Use the same Google account as the Cloud project.
- [ ] **Don't upload a logo.** A logo forces full verification.
- [ ] **Save**

### D3. Publish
- [ ] **Audience** → **Publish app** → Confirm
- [ ] If it warns about verification for sensitive or restricted scopes, you can still continue unverified. Google's cap for unverified apps is 100 users, and you're one. On first authorization you'll see **"Google hasn't verified this app"** → click **Advanced** → **Go to Naik Health-to-Calendar (unsafe)** → Allow.
- [ ] **Re-authorize once after publishing.** Tokens issued while the app was in Testing keep their 7-day expiry. Run `resetHealthAuth`, then `authorizeHealth`, and open the logged URL again. Only the new refresh token is long-lived.
- [ ] If publishing is **blocked outright** for the restricted health scopes, revert to Testing. The script will email you when authorization expires, and you re-run it once in the editor to re-authorize, about once a week.

---

## Part E: First run (Phase 1 spike)

> Functions ending in `_` are private and don't appear in the Run dropdown. Open the file that contains the function you want (e.g. `debug.gs`) to pick it.

- [ ] `clasp push` (after any code change)
- [ ] Open `auth.gs` → select **`authorizeHealth`** → **Run**. The first time, approve the Apps Script prompt (Calendar, external requests, triggers, email).
- [ ] In the **Execution log**, copy the long `https://accounts.google.com/...` URL → open it in the browser → choose your Gmail → *unverified app* → **Advanced → Go to Naik Health-to-Calendar** → tick **both health permissions** → Continue.
- [ ] You land on a page saying **"✅ Google Health authorized"**. Close the tab.
- [ ] Open `debug.gs` → select **`debugDump`** → **Run**
- [ ] Check the log for raw sleep and exercise JSON.
- [ ] Share the output (scrubbed if you like) so the parser can be built against your real data.

---

## Part F: Go live

- [ ] `clasp push`
- [ ] *(Optional, shareable)* `debug.gs` → **`debugSchema`** → Run. It logs only field names, types and enum values (e.g. `DEEP`, `WALKING`), never your numbers or times.
- [ ] `main.gs` → **`syncDryRun`** → Run. The log shows every event it *would* create (titles + descriptions), with no calendar changes.
- [ ] Happy with it? → **`syncAll`** → Run. It creates the **Fitbit** calendar and the events. Check them in Google Calendar.
- [ ] Run **`syncAll`** a second time. The log should say `"created":0`, all `unchanged` (no duplicates).
- [ ] **`installTrigger`** → Run. From now on it syncs every 4 hours. Check under ⏰ **Triggers** in the left sidebar.
- [ ] *(Optional)* **`backfill30`** → Run, to fill in the last 30 days.
- [ ] Tune under **Project Settings → Script properties** (no code change needed):
  | Property | Default | Example |
  |---|---|---|
  | `MIN_WORKOUT_MINUTES` | `0` | `15` hides short auto-detected walks |
  | `EXCLUDE_TYPES` | *(empty)* | `WALKING,OTHER` |
  | `INCLUDE_NAPS` | `true` | `false` |
  | `LOOKBACK_DAYS` | `2` | `3` |
  | `WORKOUT_COLOR_ID` | `10` | `''` for the calendar colour |
  | `ALERT_EMAIL` | your address | another address |
- [ ] Start over at any time: **`wipeSyncedEvents`** deletes only the events this script created.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| Health scopes not in the Data Access list | Enable the Google Health API (A2), then use *Manually add scopes* |
| "Change project" fails in Apps Script | Use the project **number**, not the ID, and finish the consent screen first |
| `403 DISALLOWED_OAUTH_SCOPES` | The Health API was called with Apps Script's built-in token. Use `getHealthAccessToken_()` (auth.js) |
| `403 PERMISSION_DENIED` from health.googleapis.com | API not enabled, scope missing from Data Access, you're not a test user, or a health box was left unticked. Run `resetHealthAuth` then `authorizeHealth` |
| `redirect_uri_mismatch` when opening the auth URL | The redirect URI on the OAuth client (A7) must exactly match the one `authorizeHealth` logs |
| `invalid_grant` / "authorization expired" | Testing-mode 7-day expiry: run `authorizeHealth` again, or do Part D |
| Run button greyed out / "No functions" | The open file only has private `_` functions. Switch to `debug.gs` or `auth.gs` |
| `clasp push` → "User has not enabled the Apps Script API" | Turn it on at script.google.com/home/usersettings |
