// Shared email -> drafts pipeline, used by both the on-demand endpoint
// (/api/email/sync) and the nightly cron. Server-side equivalent of the client's
// Gmail scan, but it persists pending drafts to Postgres and is idempotent.
//
// PRIVACY: message bodies are fetched, passed to the estimator, and dropped.
// Only the derived narrative + a minimal evidence string are stored.
import { supabase, audit } from './supabase.js';
import { getAccessToken, listSentMessageIds, getMessage, mapMessage } from './gmail.js';
import { estimateEmailTask } from './estimate.js';

// Pull this connection's recent sent mail and upsert drafts.
// Returns { created, skipped, total }.
export async function syncEmailForConnection(connection, { anthropicKey } = {}) {
  const userId = connection.user_id;

  if (connection.source === 'outlook') {
    const err = new Error('Outlook email sync ships in Phase 2.');
    err.status = 501;
    throw err;
  }
  if (!connection.refresh_token) {
    const err = new Error('Gmail connection has no refresh token; reconnect Gmail.');
    err.status = 400;
    throw err;
  }

  let accessToken;
  let messageIds;
  try {
    accessToken = await getAccessToken(connection.refresh_token);
    messageIds = await listSentMessageIds(accessToken);
  } catch (err) {
    await supabase.from('source_connections').update({ status: 'error' }).eq('id', connection.id);
    await audit('email.sync.error', { userId, source: connection.source, detail: { message: err.message } });
    throw err;
  }

  const cursorMs = connection.cursor ? Number(connection.cursor) : 0;
  let created = 0;
  let skipped = 0;
  let newest = cursorMs;

  for (const id of messageIds.slice(0, 50)) {
    let mapped;
    try {
      mapped = mapMessage(await getMessage(accessToken, id));
    } catch (_) {
      skipped += 1;
      continue;
    }

    // Incremental: skip anything at/older than the last-synced timestamp.
    if (mapped.internalDate && cursorMs && mapped.internalDate <= cursorMs) continue;
    if (mapped.internalDate && mapped.internalDate > newest) newest = mapped.internalDate;

    const est = await estimateEmailTask(mapped, anthropicKey);
    const recipient = mapped.to ? `Email to ${mapped.to}` : 'Sent email';
    const evidence = [`${recipient}: "${mapped.subject || '(no subject)'}"`, est.reasoning].filter(Boolean).join(' · ');
    const entryDate = mapped.internalDate
      ? new Date(mapped.internalDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Idempotent upsert on (user_id, source, external_id): re-syncing the same
    // message updates its pending draft instead of duplicating, and never
    // clobbers an already-decided draft.
    const { error } = await supabase.from('drafts').upsert(
      {
        user_id: userId,
        source: connection.source, // 'gmail'
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

  await audit('email.sync', { userId, source: connection.source, detail: { created, skipped, total: messageIds.length } });
  return { created, skipped, total: messageIds.length };
}

// Load a user's connection for one email source (or null).
export async function getEmailConnection(userId, source = 'gmail') {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('source', source)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// All active email connections across users (for the cron fleet run).
export async function getActiveEmailConnections() {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .in('source', ['gmail', 'outlook'])
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}
