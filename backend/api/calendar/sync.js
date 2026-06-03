// POST /api/calendar/sync — on-demand: pull THIS user's recent calendar events
// and upsert pending drafts. This is what a "Sync Calendar" button calls.
//
// Auth: Authorization: Bearer <user JWT or lxk_ key>.
// Body: optional { force: true } to ignore the stored cursor (full re-pull).
import { withApi, sendJson } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { getCalendarConnection, syncCalendarForConnection } from '../../lib/calendarSync.js';

export default withApi(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });

  const user = await requireUser(req);
  const connection = await getCalendarConnection(user.id);
  if (!connection || connection.status === 'revoked') {
    return sendJson(res, 404, { error: 'No Google Calendar connection for this user. Connect Calendar first.' });
  }

  let body = {};
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}
  if (body.force) connection.cursor = null;

  // Use the server's shared Anthropic key for estimates (kept off the device).
  const result = await syncCalendarForConnection(connection, { anthropicKey: process.env.ANTHROPIC_API_KEY });

  return sendJson(res, 200, { ok: true, ...result });
});
