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

export default withApi(async (req, res) => {
  requireCronSecret(req);

  const { data: connections, error } = await supabase
    .from('source_connections')
    .select('*')
    .eq('source', 'notion')
    .eq('status', 'active');
  if (error) throw error;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const results = [];

  for (const connection of connections || []) {
    try {
      const r = await syncNotionForConnection(connection, { anthropicKey });
      results.push({ userId: connection.user_id, ok: true, ...r });
    } catch (err) {
      results.push({ userId: connection.user_id, ok: false, error: err.message });
    }
  }

  await audit('cron.nightly', { detail: { connections: results.length } });
  return sendJson(res, 200, { ok: true, ran: results.length, results });
});
