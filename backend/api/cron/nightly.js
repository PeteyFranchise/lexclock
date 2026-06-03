// GET /api/cron/nightly — invoked by Vercel Cron (see vercel.json). Walks every
// active source connection and runs its sync, so drafts appear in the Review hub
// without the app being open. This is the capability a static page cannot have
// and the whole reason the backend exists.
//
// Auth: requires the CRON_SECRET (Vercel Cron sends it via header). Returns a
// per-user summary; individual failures are isolated so one bad token doesn't
// abort the fleet run.
import { withApi, sendJson } from '../../lib/cors.js';
import { requireCronSecret } from '../../lib/auth.js';
import { supabase, audit } from '../../lib/supabase.js';
import { syncNotionForConnection } from '../../lib/notionSync.js';
import { getActiveEmailConnections, syncEmailForConnection } from '../../lib/emailSync.js';
import { getActiveCalendarConnections, syncCalendarForConnection } from '../../lib/calendarSync.js';
import { getActiveOutlookConnections, syncOutlookForConnection } from '../../lib/outlookSync.js';

export default withApi(async (req, res) => {
  requireCronSecret(req);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const results = [];

  // 1. Notion connections.
  const { data: notionConns, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('source', 'notion')
    .eq('status', 'active');
  if (error) throw error;

  for (const connection of notionConns || []) {
    try {
      const r = await syncNotionForConnection(connection, { anthropicKey });
      results.push({ userId: connection.user_id, source: 'notion', ok: true, ...r });
    } catch (err) {
      results.push({ userId: connection.user_id, source: 'notion', ok: false, error: err.message });
    }
  }

  // 2. Email connections (Gmail today; Outlook in Phase 2).
  for (const connection of await getActiveEmailConnections()) {
    try {
      const r = await syncEmailForConnection(connection, { anthropicKey });
      results.push({ userId: connection.user_id, source: connection.source, ok: true, ...r });
    } catch (err) {
      results.push({ userId: connection.user_id, source: connection.source, ok: false, error: err.message });
    }
  }

  // 3. Google Calendar connections.
  for (const connection of await getActiveCalendarConnections()) {
    try {
      const r = await syncCalendarForConnection(connection, { anthropicKey });
      results.push({ userId: connection.user_id, source: 'calendar', ok: true, ...r });
    } catch (err) {
      results.push({ userId: connection.user_id, source: 'calendar', ok: false, error: err.message });
    }
  }

  // 4. Outlook connections (one Microsoft connection drives mail + calendar).
  for (const connection of await getActiveOutlookConnections()) {
    try {
      const r = await syncOutlookForConnection(connection, { anthropicKey });
      results.push({ userId: connection.user_id, source: 'outlook', ok: true, ...r });
    } catch (err) {
      results.push({ userId: connection.user_id, source: 'outlook', ok: false, error: err.message });
    }
  }

  await audit('cron.nightly', { detail: { connections: results.length } });
  return sendJson(res, 200, { ok: true, ran: results.length, results });
});
