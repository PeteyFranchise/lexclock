// Microsoft Graph wrapper for Outlook calendar — the Outlook equivalent of
// calendar.js. Lists events that have ALREADY happened in the recent window and
// maps each into the SAME minimal shape estimate.js's estimateCalendarTask
// consumes, so the estimator is shared across Google and Outlook calendars.
// Read-only: LexClock can never create, edit, or delete events.
//
// PRIVACY: event titles/notes are fetched, fed to the estimator, and dropped.
import { graphGet } from './microsoft.js';

// List events whose time window fell in the recent past. calendarView expands
// recurring meetings into instances so each occurrence becomes its own draft.
// We request UTC so start/end parse unambiguously.
export async function listRecentEvents(accessToken, { sinceDays = 2 } = {}) {
  const now = Date.now();
  const startDateTime = new Date(now - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const endDateTime = new Date(now).toISOString();
  const query =
    `/me/calendarView?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    '&$select=id,subject,bodyPreview,start,end,location,organizer,attendees,isAllDay,isCancelled,responseStatus' +
    '&$top=50&$orderby=start/dateTime';
  const data = await graphGet(accessToken, query, { prefer: 'outlook.timezone="UTC"' });
  return Array.isArray(data.value) ? data.value : [];
}

function personLabel(p) {
  const e = p?.emailAddress;
  if (!e) return '';
  return e.name || e.address || '';
}

// Normalize a Graph event into the minimal shape the estimator consumes.
// Returns null for events that should never become a billable draft (all-day,
// cancelled, or ones the attorney declined).
export function mapEvent(event) {
  if (!event || event.isCancelled) return null;
  if (event.isAllDay) return null; // all-day entries have no measurable billable duration

  // The attorney's own response to this event.
  const myResponse = (event.responseStatus?.response || '').toLowerCase();
  if (myResponse === 'declined') return null;

  const startMs = event.start?.dateTime ? Date.parse(`${event.start.dateTime}Z`.replace(/Z+$/, 'Z')) : NaN;
  const endMs = event.end?.dateTime ? Date.parse(`${event.end.dateTime}Z`.replace(/Z+$/, 'Z')) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const organizerLabel = personLabel(event.organizer);
  const others = attendees
    .filter((a) => (a.type || '').toLowerCase() !== 'resource')
    .map(personLabel)
    .filter((name) => name && name !== organizerLabel);

  const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));

  return {
    externalId: event.id,
    summary: (event.subject || '').trim(),
    description: (event.bodyPreview || '').trim(),
    location: (event.location?.displayName || '').trim(),
    organizer: organizerLabel,
    attendees: others,
    startMs,
    endMs,
    durationMin,
  };
}
