// Shared calendar -> drafts pipeline, used by both the on-demand endpoint
// (/api/calendar/sync) and the nightly cron. Server-side equivalent of the
// email sync: it persists pending drafts to Postgres and is idempotent.
//
// PRIVACY: event titles/notes are fetched, passed to the estimator, and dropped.
// Only the derived narrative + a minimal evidence string are stored.
import { supabase, audit } from './supabase.js';
import { getAccessToken, listRecentEvents, mapEvent } from './calendar.js';
import { estimateCalendarTask } from './estimate.js';

// Pull this connection's recent calendar events and upsert drafts.
// Returns { created, skipped, total }.
export async function syncCalendarForConnection(connection, { anthropicKey } = {}) {
  const userId = connection.user_id;

  if (!connection.refresh_token) {
    const err = new Error('Calendar connection has no refresh token; reconnect Google Calendar.');
    err.status = 400;
    throw err;
  }

  let accessToken;
  let events;
  try {
    accessToken = await getAccessToken(connection.refresh_token);
    events = await listRecentEvents(accessToken);
  } catch (err) {
    await supabase.from('source_connections').update({ status: 'error' }).eq('id', connection.id);
    await audit('calendar.sync.error', { userId, source: connection.source, detail: { message: err.message } });
    throw err;
  }

  const cursorMs = connection.cursor ? Number(connection.cursor) : 0;
  let created = 0;
  let skipped = 0;
  let newest = cursorMs;

  for (const raw of events.slice(0, 50)) {
    const mapped = mapEvent(raw);
    if (!mapped) { skipped += 1; continue; } // all-day, cancelled, or declined

    // Incremental: skip anything that started at/before the last-synced time.
    if (mapped.startMs && cursorMs && mapped.startMs <= cursorMs) continue;
    if (mapped.startMs && mapped.startMs > newest) newest = mapped.startMs;

    const est = await estimateCalendarTask(mapped, anthropicKey);
    const label = mapped.summary || 'Calendar event';
    const withWho = mapped.attendees.length ? ` with ${mapped.attendees.slice(0, 3).join(', ')}` : '';
    const evidence = [
      `Calendar event: "${label}"${withWho} (${mapped.durationMin} min)`,
      est.reasoning,
    ].filter(Boolean).join(' · ');
    const entryDate = mapped.startMs
      ? new Date(mapped.startMs).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Idempotent upsert on (user_id, source, external_id): re-syncing the same
    // event updates its pending draft instead of duplicating, and never
    // clobbers an already-decided draft.
    const { error } = await supabase.from('drafts').upsert(
      {
        user_id: userId,
        source: connection.source, // 'calendar'
        external_id: mapped.externalId,
        matter_id: null, // matter mapping happens client-side against the user's matters
        entry_date: entryDate,
        estimated_seconds: Math.round((Number(est.minutes) || 0) * 60),
        description: est.narrative,
        billable: true,
        confidence: est.confidence,
        evidence,
        status: 'pending',
      },
      { onConflict: 'user_id,source,external_id', ignoreDuplicates: false }
    );

    if (error) {
      skipped += 1;
      continue;
    }
    created += 1;
  }

  await supabase
    .from('source_connections')
    .update({ status: 'active', last_synced_at: new Date().toISOString(), cursor: newest ? String(newest) : connection.cursor })
    .eq('id', connection.id);

  await audit('calendar.sync', { userId, source: connection.source, detail: { created, skipped, total: events.length } });
  return { created, skipped, total: events.length };
}

// Load a user's calendar connection (or null).
export async function getCalendarConnection(userId) {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'calendar')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// All active calendar connections across users (for the cron fleet run).
export async function getActiveCalendarConnections() {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('source', 'calendar')
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}
