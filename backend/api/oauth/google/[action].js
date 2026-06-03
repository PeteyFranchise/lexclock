// Server-side Google OAuth, both legs in one function (Vercel counts a dynamic
// route as a single Serverless Function, which keeps us under the plan's limit):
//   POST /api/oauth/google/start    — begin a flow for one source (gmail|calendar)
//   GET  /api/oauth/google/callback — Google redirects here after consent
//
// `start` returns a Google consent URL with a signed `state` carrying the user id
// AND the source; the user's token stays in the Authorization header (never a
// query string). `callback` verifies that state, exchanges the code for tokens,
// and stores the refresh token in source_connections under that source. No Bearer
// token is present on the callback hop — the signed state authenticates the user.
import { withApi, sendJson } from '../../../lib/cors.js';
import { requireUser } from '../../../lib/auth.js';
import { signState, verifyState } from '../../../lib/oauthState.js';
import { exchangeCode } from '../../../lib/gmail.js';
import { supabase, audit } from '../../../lib/supabase.js';

// Per-source Google scope. All read-only — LexClock can never modify anything.
const SCOPES = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
};

const FRONTEND_BASE = (() => {
  const explicit = (process.env.APP_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/?$/, '/');
  const origin = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim() || '';
  if (!origin) return '/';
  return `${origin.replace(/\/$/, '')}/app/`;
})();

async function handleStart(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const user = await requireUser(req);

  let body = {};
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}
  const source = SCOPES[body.source] ? body.source : 'gmail'; // default keeps old Gmail behavior
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
}

async function handleCallback(req, res) {
  const redirect = (suffix) => {
    res.statusCode = 302;
    res.setHeader('Location', `${FRONTEND_BASE}?${suffix}`);
    res.end();
  };

  const { code, state, error } = req.query || {};

  let uid;
  let source = 'gmail';
  if (state) {
    try {
      const claims = verifyState(state);
      uid = claims.uid;
      if (claims.source === 'calendar' || claims.source === 'gmail') source = claims.source;
    } catch (e) {
      console.error('oauth callback: bad state', e);
      return redirect('gmail=error');
    }
  }

  if (error) return redirect(`${source}=denied`);
  if (!code || !uid) return redirect(`${source}=error`);

  try {
    const tokens = await exchangeCode(code, process.env.GOOGLE_OAUTH_REDIRECT_URI);
    if (!tokens.refresh_token) {
      return redirect(`${source}=norefresh`);
    }

    const { error: upsertErr } = await supabase.from('source_connections').upsert(
      {
        user_id: uid,
        source,
        refresh_token: tokens.refresh_token,
        secret: null,
        config: {},
        status: 'active',
        cursor: null, // reset incremental cursor on (re)connect
      },
      { onConflict: 'user_id,source' }
    );
    if (upsertErr) {
      console.error('oauth callback: upsert failed', upsertErr);
      return redirect(`${source}=error`);
    }

    await audit(`${source}.connect`, { userId: uid, source });
    return redirect(`${source}=connected`);
  } catch (e) {
    console.error('oauth callback: exchange failed', e);
    return redirect(`${source}=error`);
  }
}

export default withApi(async (req, res) => {
  const action = (req.query && req.query.action) || '';
  if (action === 'start') return handleStart(req, res);
  if (action === 'callback') return handleCallback(req, res);
  return sendJson(res, 404, { error: 'Unknown OAuth action.' });
});
