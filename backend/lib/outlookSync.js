// Shared Outlook -> drafts pipeline, used by both the on-demand endpoint
// (/api/outlook/sync) and the nightly cron. ONE Microsoft connection (source
// 'outlook') grants both Mail.Read and Calendars.Read, so this module runs the
// mail AND calendar syncs off a single refresh token and writes idempotent
// pending drafts to Postgres.
//
// Because both halves share one connection row, their incremental cursors live
// side-by-side in the connection's `config` JSON ({ mailCursor, calCursor })
// rather than the single `cursor` column — mail tracks sentDateTime, calendar
// tracks event start time, and the two must not clobber each other.
//
// PRIVACY: message and event bodies are fetched, passed to the estimator, and
// dropped. Only the derived narrative + a minimal evidence string are stored.
import { supabase, audit } from './supabase.js';
import { getAccessToken } from './microsoft.js';
import { listSentMessages, mapMessage } from './outlookMail.js';
import { listRecentEvents, mapEvent } from './outlookCalendar.js';
import { estimateEmailTask, estimateCalendarTask } from './estimate.js';

const SOURCE = 'outlook';

function num(v) { return v == null ? 0 : Number(v) || 0; }

// Persist a pending draft idempotently on (user_id, source, external_id).
async function upsertDraft(userId, mapped, est, evidence, entryMs) {
  const entryDate = entryMs
    ? new Date(entryMs).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('drafts').upsert(
    {
      user_id: userId,
      source: SOURCE,
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
  return !error;
}

// Pull this connection's recent Outlook mail + calendar and upsert drafts.
// Returns { created, skipped, total, mail:{...}, calendar:{...} }.
export async function syncOutlookForConnection(connection, { anthropicKey } = {}) {
  const userId = connection.user_id;

  if (!connection.refresh_token) {
    const err = new Error('Outlook connection has no refresh token; reconnect Outlook.');
    err.status = 400;
    throw err;
  }

  let accessToken;
  let rotatedRefresh = null;
  try {
    const tok = await getAccessToken(connection.refresh_token);
    accessToken = tok.accessToken;
    // Microsoft rotates refresh tokens; persist the new one so the next sync works.
    if (tok.refreshToken && tok.refreshToken !== connection.refresh_token) {
      rotatedRefresh = tok.refreshToken;
    }
  } catch (err) {
    await supabase.from('source_connections').update({ status: 'error' }).eq('id', connection.id);
    await audit('outlook.sync.error', { userId, source: SOURCE, detail: { message: err.message } });
    throw err;
  }
  if (rotatedRefresh) {
    await supabase.from('source_connections').update({ refresh_token: rotatedRefresh }).eq('id', connection.id);
  }

  const config = (connection.config && typeof connection.config === 'object') ? { ...connection.config } : {};

  // ---- Mail half -------------------------------------------------------------
  let mail = { created: 0, skipped: 0, total: 0 };
  try {
    const messages = await listSentMessages(accessToken);
    mail.total = messages.length;
    const cursorMs = num(config.mailCursor);
    let newest = cursorMs;
    for (const raw of messages.slice(0, 50)) {
      let mapped;
      try { mapped = mapMessage(raw); } catch (_) { mail.skipped += 1; continue; }
      if (!mapped.externalId) { mail.skipped += 1; continue; }
      if (mapped.internalDate && cursorMs && mapped.internalDate <= cursorMs) continue;
      if (mapped.internalDate && mapped.internalDate > newest) newest = mapped.internalDate;

      const est = await estimateEmailTask(mapped, anthropicKey);
      const recipient = mapped.to ? `Email to ${mapped.to}` : 'Sent email';
      const evidence = [`${recipient}: "${mapped.subject || '(no subject)'}"`, est.reasoning].filter(Boolean).join(' · ');
      if (await upsertDraft(userId, mapped, est, evidence, mapped.internalDate)) mail.created += 1;
      else mail.skipped += 1;
    }
    config.mailCursor = newest ? String(newest) : (config.mailCursor || null);
  } catch (err) {
    await supabase.from('source_connections').update({ status: 'error' }).eq('id', connection.id);
    await audit('outlook.sync.error', { userId, source: SOURCE, detail: { half: 'mail', message: err.message } });
    throw err;
  }

  // ---- Calendar half ---------------------------------------------------------
  let calendar = { created: 0, skipped: 0, total: 0 };
  try {
    const events = await listRecentEvents(accessToken);
    calendar.total = events.length;
    const cursorMs = num(config.calCursor);
    let newest = cursorMs;
    for (const raw of events.slice(0, 50)) {
      const mapped = mapEvent(raw);
      if (!mapped) { calendar.skipped += 1; continue; } // all-day, cancelled, or declined
      if (mapped.startMs && cursorMs && mapped.startMs <= cursorMs) continue;
      if (mapped.startMs && mapped.startMs > newest) newest = mapped.startMs;

      const est = await estimateCalendarTask(mapped, anthropicKey);
      const label = mapped.summary || 'Calendar event';
      const withWho = mapped.attendees.length ? ` with ${mapped.attendees.slice(0, 3).join(', ')}` : '';
      const evidence = [
        `Calendar event: "${label}"${withWho} (${mapped.durationMin} min)`,
        est.reasoning,
      ].filter(Boolean).join(' · ');
      if (await upsertDraft(userId, mapped, est, evidence, mapped.startMs)) calendar.created += 1;
      else calendar.skipped += 1;
    }
    config.calCursor = newest ? String(newest) : (config.calCursor || null);
  } catch (err) {
    await supabase.from('source_connections').update({ status: 'error' }).eq('id', connection.id);
    await audit('outlook.sync.error', { userId, source: SOURCE, detail: { half: 'calendar', message: err.message } });
    throw err;
  }

  await supabase
    .from('source_connections')
    .update({ status: 'active', last_synced_at: new Date().toISOString(), config })
    .eq('id', connection.id);

  const created = mail.created + calendar.created;
  const skipped = mail.skipped + calendar.skipped;
  const total = mail.total + calendar.total;
  await audit('outlook.sync', { userId, source: SOURCE, detail: { created, skipped, total } });
  return { created, skipped, total, mail, calendar };
}

// Load a user's Outlook connection (or null).
export async function getOutlookConnection(userId) {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('source', SOURCE)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// All active Outlook connections across users (for the cron fleet run).
export async function getActiveOutlookConnections() {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('source', SOURCE)
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}
