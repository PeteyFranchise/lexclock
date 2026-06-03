// POST /api/oauth/google/start — begin a server-side Google OAuth flow for one
// source (gmail | calendar). The logged-in app calls this with its Bearer token
// and a { source } body; we return a Google consent URL with a signed `state`
// carrying the user id AND the source. The frontend then redirects the browser
// to that URL. This keeps the user's token in the Authorization header (never in
// a query string), and the source in a signed/tamper-proof state.
//
// Each source is an independent connection (its own refresh token + scope), so a
// user can connect Gmail, Calendar, or both. include_granted_scopes lets Google
// stack a new scope onto an existing grant for the same account.
//
// Auth: Authorization: Bearer <user JWT or lxk_ key>.
import { withApi, sendJson } from '../../../lib/cors.js';
import { requireUser } from '../../../lib/auth.js';
import { signState } from '../../../lib/oauthState.js';

// Per-source Google scope. All read-only — LexClock can never modify anything.
const SCOPES = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
};

export default withApi(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const user = await requireUser(req);

  let body = {};
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}
  const source = SCOPES[body.source] ? body.source : 'gmail'; // default keeps the old Gmail behavior
  const scope = SCOPES[source];

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return sendJson(res, 500, { error: 'Google OAuth is not configured on the server.' });
  }

  const state = signState({ uid: user.id, source });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',   // ask for a refresh token
    prompt: 'consent',        // force refresh-token issuance on reconnect
    include_granted_scopes: 'true',
    scope,
    state,
  }).toString();

  return sendJson(res, 200, { url });
});
