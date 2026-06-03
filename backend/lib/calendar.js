// Server-side Google Calendar wrapper for the calendar-scanning pipeline.
// Mirrors gmail.js: it reuses the shared Google token exchange and exposes a
// listRecentEvents() + mapEvent() that keep only the minimum the estimator
// needs. Read-only: LexClock can never create, edit, or delete calendar events.
//
// PRIVACY: event titles/descriptions are fetched, fed to the estimator, and
// dropped. Only the derived narrative + a minimal evidence string are persisted.
import { getAccessToken } from './gmail.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Re-export the shared Google token exchange so calendarSync can import from one
// place. The refresh-token -> access-token flow is scope-independent.
export { getAccessToken };

// List events that have ALREADY happened in the recent window. We bill on past
// events (a finished meeting is evidence of billable time); future events are
// not yet performed. singleEvents expands recurring meetings into instances so
// each occurrence becomes its own draft.
export async function listRecentEvents(accessToken, { sinceDays = 2 } = {}) {
  const now = Date.now();
  const timeMin = new Date(now - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now).toISOString();
  const url = `${CALENDAR_API}?` + new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    maxResults: '50',
  }).toString();

  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw httpErr(res.status === 401 ? 401 : 502, `Calendar list failed (${res.status}).`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

function personLabel(p) {
  if (!p) return '';
  return p.displayName || p.email || '';
}

// Normalize a Calendar event into the minimal shape the estimator consumes.
// Returns null for events that should never become a billable draft (all-day,
// cancelled, or ones the attorney declined).
export function mapEvent(event) {
  if (!event || event.status === 'cancelled') return null;

  // Timed events only — all-day entries (start.date, no dateTime) have no
  // measurable billable duration.
  const startIso = event.start?.dateTime;
  const endIso = event.end?.dateTime;
  if (!startIso || !endIso) return null;

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const self = attendees.find((a) => a.self);
  // Skip meetings the attorney explicitly declined — they did not attend.
  if (self && self.responseStatus === 'declined') return null;

  const others = attendees
    .filter((a) => !a.self && !a.resource)
    .map(personLabel)
    .filter(Boolean);

  const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));

  return {
    externalId: event.id,
    summary: (event.summary || '').trim(),
    description: (event.description || '').trim(),
    location: (event.location || '').trim(),
    organizer: personLabel(event.organizer),
    attendees: others,
    startMs,
    endMs,
    durationMin,
  };
}
