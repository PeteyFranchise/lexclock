// POST /api/notion/sync — on-demand: pull THIS user's Notion tasks completed
// today and upsert drafts. This is what the "Sync Notion" button calls once the
// frontend points at the backend (replacing the CORS-blocked browser fetch).
//
// Auth: Authorization: Bearer <user apiKey>.
// Body: optional { force: true } to ignore the stored cursor (full re-pull).
import { withApi, sendJson } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { getNotionConnection, syncNotionForConnection } from '../../lib/notionSync.js';

export default withApi(async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Use POST.' });
  }

  const user = await requireUser(req);
  const connection = await getNotionConnection(user.id);
  if (!connection) {
    return sendJson(res, 404, { error: 'No Notion connection for this user. Connect Notion first.' });
  }

  // Optional full re-pull.
  let body = {};
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}
  if (body.force) connection.cursor = null;

  // Use the server's shared Anthropic key for estimates (kept off the device).
  const result = await syncNotionForConnection(connection, { anthropicKey: process.env.ANTHROPIC_API_KEY });

  return sendJson(res, 200, { ok: true, ...result });
});
