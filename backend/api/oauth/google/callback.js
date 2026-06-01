// GET /api/oauth/google/callback — Google redirects the browser here after the
// user consents. We verify the signed state, exchange the code for tokens, store
// the refresh token in source_connections (source 'gmail'), then redirect back
// to the app with a status flag. No Bearer token is present on this hop — the
// signed state is what authenticates the user.
import { withApi } from '../../../lib/cors.js';
import { verifyState } from '../../../lib/oauthState.js';
import { exchangeCode } from '../../../lib/gmail.js';
import { supabase, audit } from '../../../lib/supabase.js';

const FRONTEND_BASE = (() => {
  const origin = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim() || '';
  if (!origin) return '/';
  // GitHub Pages serves the app under /lexclock/; harmless if hosted at root.
  return `${origin.replace(/\/$/, '')}/lexclock/`;
})();

export default withApi(async (req, res) => {
  const redirect = (suffix) => {
    res.statusCode = 302;
    res.setHeader('Location', `${FRONTEND_BASE}?${suffix}`);
    res.end();
  };

  const { code, state, error } = req.query || {};
  if (error) return redirect('gmail=denied');
  if (!code || !state) return redirect('gmail=error');

  let uid;
  try {
    uid = verifyState(state).uid;
  } catch (_) {
    return redirect('gmail=error');
  }

  try {
    const tokens = await exchangeCode(code, process.env.GOOGLE_OAUTH_REDIRECT_URI);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent; prompt=consent in
      // /start forces it, but guard anyway.
      return redirect('gmail=norefresh');
    }

    const { error: upsertErr } = await supabase.from('source_connections').upsert(
      {
        user_id: uid,
        source: 'gmail',
        refresh_token: tokens.refresh_token,
        secret: null,
        config: {},
        status: 'active',
        cursor: null, // reset incremental cursor on (re)connect
      },
      { onConflict: 'user_id,source' }
    );
    if (upsertErr) return redirect('gmail=error');

    await audit('gmail.connect', { userId: uid, source: 'gmail' });
    return redirect('gmail=connected');
  } catch (_) {
    return redirect('gmail=error');
  }
});
