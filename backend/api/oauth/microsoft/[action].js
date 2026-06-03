// Server-side Microsoft OAuth, both legs in one function (a Vercel dynamic route
// counts as a single Serverless Function):
//   POST /api/oauth/microsoft/start    — begin the Outlook connect flow
//   GET  /api/oauth/microsoft/callback — Microsoft redirects here after consent
//
// ONE connection grants both Outlook mail (Mail.Read) and calendar
// (Calendars.Read), so there is a single source ('outlook'). `start` returns a
// Microsoft consent URL with a signed `state` carrying the user id; `callback`
// verifies that state, exchanges the code for tokens, and stores the refresh
// token in source_connections under source 'outlook'.
import { withApi, sendJson } from '../../../lib/cors.js';
import { requireUser } from '../../../lib/auth.js';
import { signState, verifyState } from '../../../lib/oauthState.js';
import { exchangeCode, MICROSOFT_SCOPES } from '../../../lib/microsoft.js';
import { supabase, audit } from '../../../lib/supabase.js';

const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

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

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return sendJson(res, 500, { error: 'Microsoft OAuth is not configured on the server.' });
  }

  const state = signState({ uid: user.id, source: 'outlook' });
  const url = `${AUTHORIZE_URL}?` + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES.join(' '),
    prompt: 'consent', // force a refresh token on (re)connect
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
  if (state) {
    try {
      const claims = verifyState(state);
      uid = claims.uid;
    } catch (e) {
      console.error('microsoft oauth callback: bad state', e);
      return redirect('outlook=error');
    }
  }

  if (error) return redirect('outlook=denied');
  if (!code || !uid) return redirect('outlook=error');

  try {
    const tokens = await exchangeCode(code, process.env.MICROSOFT_OAUTH_REDIRECT_URI);
    if (!tokens.refresh_token) {
      return redirect('outlook=norefresh');
    }

    const { error: upsertErr } = await supabase.from('source_connections').upsert(
      {
        user_id: uid,
        source: 'outlook',
        refresh_token: tokens.refresh_token,
        secret: null,
        config: {}, // resets mailCursor/calCursor on (re)connect
        status: 'active',
        cursor: null,
      },
      { onConflict: 'user_id,source' }
    );
    if (upsertErr) {
      console.error('microsoft oauth callback: upsert failed', upsertErr);
      return redirect('outlook=error');
    }

    await audit('outlook.connect', { userId: uid, source: 'outlook' });
    return redirect('outlook=connected');
  } catch (e) {
    console.error('microsoft oauth callback: exchange failed', e);
    return redirect('outlook=error');
  }
}

export default withApi(async (req, res) => {
  const action = (req.query && req.query.action) || '';
  if (action === 'start') return handleStart(req, res);
  if (action === 'callback') return handleCallback(req, res);
  return sendJson(res, 404, { error: 'Unknown OAuth action.' });
});
