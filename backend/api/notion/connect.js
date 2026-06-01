// POST /api/notion/connect — store this user's Notion integration token + DB
// config server-side. This is where the secret moves OFF the device: the
// frontend Settings form posts here once, and the token then lives only in
// Postgres (source_connections.secret), read solely by server functions.
//
// Auth: Authorization: Bearer <user apiKey>.
// Body: { token, databaseId, matterProperty? }
// DELETE: revoke the connection.
import { withApi, sendJson } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabase, audit } from '../../lib/supabase.js';

export default withApi(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === 'DELETE') {
    await supabase.from('source_connections').update({ status: 'revoked', secret: null })
      .eq('user_id', user.id).eq('source', 'notion');
    await audit('notion.revoke', { userId: user.id, source: 'notion' });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST or DELETE.' });

  let body = {};
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}
  const token = String(body.token || '').trim();
  const databaseId = String(body.databaseId || '').trim();
  const matterProperty = String(body.matterProperty || '').trim();

  if (!token || !databaseId) {
    return sendJson(res, 400, { error: 'token and databaseId are required.' });
  }

  const { error } = await supabase.from('source_connections').upsert(
    {
      user_id: user.id,
      source: 'notion',
      secret: token,
      config: { databaseId, matterProperty },
      status: 'active',
      cursor: null, // reset incremental cursor on reconnect
    },
    { onConflict: 'user_id,source' }
  );
  if (error) throw error;

  await audit('notion.connect', { userId: user.id, source: 'notion', detail: { databaseId } });
  return sendJson(res, 200, { ok: true, connected: true });
});
