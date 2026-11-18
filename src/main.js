/**
 * Entry points (run from the editor or by trigger):
 *   syncDryRun()        log what would be created/updated, no calendar writes
 *   syncAll()           the real sync (what the trigger runs)
 *   installTrigger()    run syncAll every 4 hours
 *   uninstallTrigger()
 *   backfill30()        sync the last 30 days once
 *   wipeSyncedEvents()  delete every event this script created
 */

const TRIGGER_HOURS = 4;
const ALERT_COOLDOWN_HOURS = 12;

function syncAll() {
  runSync_({ dryRun: false });
}

function syncDryRun() {
  runSync_({ dryRun: true });
}

function backfill30() {
  runSync_({ dryRun: false, lookbackDays: 30 });
}

function runSync_(opts) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    console.warn('Another sync is running; skipping.');
    return;
  }
  try {
    const cfg = getConfig_();
    const lookback = opts.lookbackDays || cfg.lookbackDays;
    const today = new Date();
    const from = addDays_(today, -lookback);
    const to = addDays_(today, 1);
    const calendarId = opts.dryRun ? null : ensureCalendar_(cfg);

    const events = []
      .concat(fetchSleep_(from, to).map(function (dp) { return sleepToEvent_(dp, cfg); }))
      .concat(fetchExercise_(from, to).map(function (dp) { return exerciseToEvent_(dp, cfg); }))
      .filter(Boolean);

    const counts = { created: 0, updated: 0, unchanged: 0 };
    events.forEach(function (ev) {
      let result;
      if (opts.dryRun) {
        result = 'would create/update';
        console.log('[DRY] %s → %s\n  %s\n  %s', ev.start, ev.end, ev.summary, ev.description.replace(/\n/g, '\n  '));
      } else {
        result = upsertEvent_(calendarId, ev, cfg, false);
        counts[result]++;
        if (result !== 'unchanged') console.log('%s: %s (%s)', result, ev.summary, ev.start);
      }
    });

    console.log('%s %s → %s: %d event(s). %s',
      opts.dryRun ? 'Dry run' : 'Sync', civilDate_(from), civilDate_(to), events.length,
      opts.dryRun ? '' : JSON.stringify(counts));
  } catch (e) {
    console.error('Sync failed: %s', e.stack || e);
    if (!opts.dryRun) maybeAlert_(e);
    throw e; // marks the execution as failed in the Executions list
  } finally {
    lock.releaseLock();
  }
}

/** Emails at most once per ALERT_COOLDOWN_HOURS. */
function maybeAlert_(err) {
  try {
    const props = PropertiesService.getUserProperties();
    const last = Number(props.getProperty('LAST_ALERT_AT') || 0);
    if (Date.now() - last < ALERT_COOLDOWN_HOURS * 3600 * 1000) return;
    const cfg = getConfig_();
    const hint = err.isHealthAuthError
      ? 'Open the Apps Script project, run authorizeHealth() and open the logged URL.'
      : 'Check the Executions page of the Apps Script project for details.';
    MailApp.sendEmail(alertRecipient_(cfg),'⚠️ Fitbit Calendar Sync failed', err.message + '\n\n' + hint);
    props.setProperty('LAST_ALERT_AT', String(Date.now()));
  } catch (mailErr) {
    console.error('Could not send alert: %s', mailErr);
  }
}

function installTrigger() {
  uninstallTrigger();
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(TRIGGER_HOURS).create();
  console.log('Trigger installed: syncAll every %d hours.', TRIGGER_HOURS);
}

function uninstallTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncAll'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function wipeSyncedEvents() {
  const calendarId = ensureCalendar_(getConfig_());
  const n = deleteSyncedEvents_(calendarId);
  console.log('Deleted %d synced event(s).', n);
}
