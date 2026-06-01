// GET    /api/email/status — is Gmail connected for this user? (no secrets returned)
// DELETE /api/email/status — disconnect Gmail: revoke + purge the refresh token.
//
// Auth: Authorization: Bearer <user JWT or lxk_ key>.
import { withApi, sendJson } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabase, audit } from '../../lib/supabase.js';
import { getEmailConnection } from '../../lib/emailSync.js';

export default withApi(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === 'GET') {
    const conn = await getEmailConnection(user.id, 'gmail');
    return sendJson(res, 200, {
      connected: !!(conn && conn.status === 'active'),
      status: conn?.status || 'none',
      lastSyncedAt: conn?.last_synced_at || null,
    });
  }

  if (req.method === 'DELETE') {
    // Phase 3 will also call Google's token-revocation endpoint here.
    await supabase.from('source_connections')
      .update({ status: 'revoked', refresh_token: null, secret: null })
      .eq('user_id', user.id).eq('source', 'gmail');
    await audit('gmail.revoke', { userId: user.id, source: 'gmail' });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Use GET or DELETE.' });
});
