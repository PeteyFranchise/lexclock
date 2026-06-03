// GET    /api/calendar/status — is Google Calendar connected for this user?
// DELETE /api/calendar/status — disconnect Calendar: revoke + purge the token.
//
// Auth: Authorization: Bearer <user JWT or lxk_ key>.
import { withApi, sendJson } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabase, audit } from '../../lib/supabase.js';
import { getCalendarConnection } from '../../lib/calendarSync.js';

export default withApi(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === 'GET') {
    const conn = await getCalendarConnection(user.id);
    return sendJson(res, 200, {
      connected: !!(conn && conn.status === 'active'),
      status: conn?.status || 'none',
      lastSyncedAt: conn?.last_synced_at || null,
    });
  }

  if (req.method === 'DELETE') {
    await supabase.from('source_connections')
      .update({ status: 'revoked', refresh_token: null, secret: null })
      .eq('user_id', user.id).eq('source', 'calendar');
    await audit('calendar.revoke', { userId: user.id, source: 'calendar' });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Use GET or DELETE.' });
});
