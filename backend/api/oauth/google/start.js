// POST /api/oauth/google/start — begin the server-side Gmail OAuth flow.
// The logged-in app calls this with its Bearer token; we return a Google consent
// URL with a signed `state` carrying the user id. The frontend then redirects
// the browser to that URL. This keeps the user's token in the Authorization
// header (never in a query string).
//
// Auth: Authorization: Bearer <user JWT or lxk_ key>.
import { withApi, sendJson } from '../../../lib/cors.js';
import { requireUser } from '../../../lib/auth.js';
import { signState } from '../../../lib/oauthState.js';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export default withApi(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const user = await requireUser(req);

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return sendJson(res, 500, { error: 'Gmail OAuth is not configured on the server.' });
  }

  const state = signState({ uid: user.id });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',   // ask for a refresh token
    prompt: 'consent',        // force refresh-token issuance on reconnect
    include_granted_scopes: 'true',
    scope: GMAIL_SCOPE,
    state,
  }).toString();

  return sendJson(res, 200, { url });
});
