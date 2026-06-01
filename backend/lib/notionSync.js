// Shared Notion -> drafts pipeline, used by both the on-demand endpoint
// (/api/notion/sync) and the nightly cron (/api/cron/nightly). This is the
// server-side equivalent of the client's syncNotionTasks(), but it persists
// drafts to Postgres and is idempotent across runs.
import { supabase, audit } from './supabase.js';
import { queryDatabase, mapPage } from './notion.js';
import { estimateTask } from './estimate.js';

// Pull today's tasks for one user's Notion connection and upsert drafts.
// `anthropicKey` is optional; without it we use the timestamp heuristic.
// Returns { created, skipped, total }.
export async function syncNotionForConnection(connection, { anthropicKey } = {}) {
  const userId = connection.user_id;
  const cfg = connection.config || {};
  const databaseId = cfg.databaseId;
  if (!connection.secret || !databaseId) {
    const err = new Error('Notion connection is missing a token or databaseId.');
    err.status = 400;
    throw err;
  }

  let pages;
  try {
    pages = await queryDatabase(connection.secret, databaseId, { since: connection.cursor || undefined });
  } catch (err) {
    await supabase.from('source_connections').update({ status: 'error' }).eq('id', connection.id);
    await audit('notion.sync.error', { userId, source: 'notion', detail: { message: err.message } });
    throw err;
  }

  const tasks = pages.map((p) => mapPage(p, { matterProperty: cfg.matterProperty || '' })).filter((t) => t.title);

  let created = 0;
  let skipped = 0;
  let newestEdited = connection.cursor || null;

  for (const task of tasks.slice(0, 50)) {
    if (task.lastEditedTime && (!newestEdited || task.lastEditedTime > newestEdited)) {
      newestEdited = task.lastEditedTime;
    }

    const est = await estimateTask(task, anthropicKey);
    const matterHint = task.matterHint ? `Matter hint: ${task.matterHint}` : '';
    const evidence = [`Notion task: "${task.title}"`, matterHint, est.reasoning].filter(Boolean).join(' · ');

    // Idempotent upsert: the unique (user_id, source, external_id) constraint
    // means re-syncing the same Notion page updates its draft instead of
    // duplicating it — but only while still pending (never clobber a decision).
    const { error } = await supabase
      .from('drafts')
      .upsert(
        {
          user_id: userId,
          source: 'notion',
          external_id: task.externalId,
          matter_id: null, // matter mapping happens client-side against the user's matters
          entry_date: new Date().toISOString().slice(0, 10),
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
      // 23505 / conflict on an already-decided draft -> skip, don't fail run.
      skipped += 1;
      continue;
    }
    created += 1;
  }

  await supabase
    .from('source_connections')
    .update({ status: 'active', last_synced_at: new Date().toISOString(), cursor: newestEdited })
    .eq('id', connection.id);

  await audit('notion.sync', { userId, source: 'notion', detail: { created, skipped, total: tasks.length } });

  return { created, skipped, total: tasks.length };
}

// Load a user's active Notion connection (or null).
export async function getNotionConnection(userId) {
  const { data, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'notion')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
