// GET /api/oauth/google/callback — Google redirects the browser here after the
// user consents. We verify the signed state (which carries the user id AND the
// source: gmail | calendar), exchange the code for tokens, store the refresh
// token in source_connections under that source, then redirect back to the app
// with a per-source status flag. No Bearer token is present on this hop — the
// signed state is what authenticates the user.
import { withApi } from '../../../lib/cors.js';
import { verifyState } from '../../../lib/oauthState.js';
import { exchangeCode } from '../../../lib/gmail.js';
import { supabase, audit } from '../../../lib/supabase.js';

const FRONTEND_BASE = (() => {
  // Explicit override wins (e.g. https://getlexclock.com/app/).
  const explicit = (process.env.APP_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/?$/, '/');
  const origin = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim() || '';
  if (!origin) return '/';
  // App is served under /app/ on the custom domain.
  return `${origin.replace(/\/$/, '')}/app/`;
})();

export default withApi(async (req, res) => {
  const redirect = (suffix) => {
    res.statusCode = 302;
    res.setHeader('Location', `${FRONTEND_BASE}?${suffix}`);
    res.end();
  };

  // Recover the source from the signed state below; default to gmail so a
  // pre-source-aware state (or a hand-built URL) still behaves like before.
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
      // Google only returns a refresh token on first consent; prompt=consent in
      // /start forces it, but guard anyway.
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
});
