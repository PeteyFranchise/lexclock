// Outlook endpoints, both in one function (a Vercel dynamic route counts as a
// single Serverless Function):
//   POST   /api/outlook/sync   — pull this user's recent Outlook mail + calendar
//                                and upsert pending drafts (one Microsoft
//                                connection drives both halves).
//   GET    /api/outlook/status — is Outlook connected for this user?
//   DELETE /api/outlook/status — disconnect Outlook: revoke + purge the token.
//
// Auth: Authorization: Bearer <user JWT or lxk_ key>.
import { withApi, sendJson } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabase, audit } from '../../lib/supabase.js';
import { getOutlookConnection, syncOutlookForConnection } from '../../lib/outlookSync.js';

async function handleSync(req, res, user) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });

  const connection = await getOutlookConnection(user.id);
  if (!connection || connection.status === 'revoked') {
    return sendJson(res, 404, { error: 'No Outlook connection for this user. Connect Outlook first.' });
  }

  let body = {};
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}
  if (body.force) {
    connection.config = { ...(connection.config || {}), mailCursor: null, calCursor: null };
  }

  const result = await syncOutlookForConnection(connection, { anthropicKey: process.env.ANTHROPIC_API_KEY });
  return sendJson(res, 200, { ok: true, ...result });
}

async function handleStatus(req, res, user) {
  if (req.method === 'GET') {
    const conn = await getOutlookConnection(user.id);
    return sendJson(res, 200, {
      connected: !!(conn && conn.status === 'active'),
      status: conn?.status || 'none',
      lastSyncedAt: conn?.last_synced_at || null,
    });
  }

  if (req.method === 'DELETE') {
    await supabase.from('source_connections')
      .update({ status: 'revoked', refresh_token: null, secret: null, config: {} })
      .eq('user_id', user.id).eq('source', 'outlook');
    await audit('outlook.revoke', { userId: user.id, source: 'outlook' });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Use GET or DELETE.' });
}

export default withApi(async (req, res) => {
  const user = await requireUser(req);
  const action = (req.query && req.query.action) || '';
  if (action === 'sync') return handleSync(req, res, user);
  if (action === 'status') return handleStatus(req, res, user);
  return sendJson(res, 404, { error: 'Unknown Outlook action.' });
});
