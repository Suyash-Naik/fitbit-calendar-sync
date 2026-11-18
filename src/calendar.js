/**
 * Calendar side: find/create the "Fitbit" calendar and upsert events.
 * Each synced event carries private extended properties:
 *   fitbitSync=1, fitbitSyncId=<kind:id>, fitbitHash=<content digest>
 */

const PROP_CALENDAR_ID = 'CALENDAR_ID'; // user property, set automatically

/** Returns the target calendar ID, creating the calendar on first use. */
function ensureCalendar_(cfg) {
  const props = PropertiesService.getUserProperties();
  const saved = props.getProperty(PROP_CALENDAR_ID);
  if (saved && CalendarApp.getCalendarById(saved)) return saved;

  const existing = CalendarApp.getOwnedCalendarsByName(cfg.calendarName);
  const cal = existing.length
    ? existing[0]
    : CalendarApp.createCalendar(cfg.calendarName, {
        summary: 'Sleep, naps and workouts synced from Google Health / Fitbit.',
        timeZone: Session.getScriptTimeZone(),
      });
  props.setProperty(PROP_CALENDAR_ID, cal.getId());
  console.log('%s calendar "%s"', existing.length ? 'Using existing' : 'Created', cfg.calendarName);
  return cal.getId();
}

/**
 * Insert, patch or skip one event.
 * @return {'created'|'updated'|'unchanged'}
 */
function upsertEvent_(calendarId, ev, cfg, dryRun) {
  const hash = contentHash_(ev);
  const resource = {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.start },
    end: { dateTime: ev.end },
    transparency: 'transparent',
    visibility: 'private',
    extendedProperties: {
      private: { fitbitSync: '1', fitbitSyncId: ev.syncId, fitbitHash: hash },
    },
  };
  if (ev.kind === 'workout' && cfg.workoutColorId) resource.colorId = cfg.workoutColorId;

  const found = Calendar.Events.list(calendarId, {
    privateExtendedProperty: 'fitbitSyncId=' + ev.syncId,
    showDeleted: false,
    maxResults: 5,
  }).items || [];

  if (!found.length) {
    if (!dryRun) Calendar.Events.insert(resource, calendarId);
    return 'created';
  }
  const current = found[0];
  const currentHash = current.extendedProperties && current.extendedProperties.private &&
    current.extendedProperties.private.fitbitHash;
  if (currentHash === hash) return 'unchanged';
  if (!dryRun) Calendar.Events.patch(resource, calendarId, current.id);
  return 'updated';
}

/** Deletes every event this script created (tagged fitbitSync=1). */
function deleteSyncedEvents_(calendarId) {
  let deleted = 0;
  let pageToken;
  do {
    const res = Calendar.Events.list(calendarId, {
      privateExtendedProperty: 'fitbitSync=1',
      showDeleted: false,
      maxResults: 250,
      pageToken: pageToken,
    });
    (res.items || []).forEach(function (e) {
      Calendar.Events.remove(calendarId, e.id);
      deleted++;
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return deleted;
}

function contentHash_(ev) {
  const raw = [ev.summary, ev.description, ev.start, ev.end].join('|');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
