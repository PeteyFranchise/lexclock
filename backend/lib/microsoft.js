// Server-side Microsoft identity wrapper for the Outlook pipeline. Mirrors the
// Google token handling in gmail.js but talks to the Microsoft identity platform
// (login.microsoftonline.com) and Microsoft Graph. ONE Microsoft connection
// grants both Mail.Read and Calendars.Read, so a single refresh token drives the
// Outlook mail AND Outlook calendar syncs.
//
// PRIVACY: access tokens are used in-memory only and never persisted. Message and
// event bodies are fetched, fed to the estimator, and dropped.
//
// NOTE on refresh-token rotation: unlike Google, the Microsoft identity platform
// ROTATES the refresh token on most refreshes. Callers MUST persist the returned
// refresh_token when present, or the connection will eventually stop working.

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
export const GRAPH_API = 'https://graph.microsoft.com/v1.0';

// Delegated, read-only scopes. offline_access is what yields a refresh token.
// LexClock can never send, delete, or modify mail or calendar with these.
export const MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Calendars.Read',
];

function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Exchange the stored refresh token for a short-lived access token. Returns BOTH
// the access token and the (possibly rotated) refresh token so the sync can
// persist the new refresh token.
export async function getAccessToken(refreshToken) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw httpErr(500, 'Microsoft OAuth env vars are not set on the server.');
  if (!refreshToken) throw httpErr(400, 'Outlook connection has no refresh token; reconnect Outlook.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES.join(' '),
    }),
  });
  if (!res.ok) {
    throw httpErr(res.status === 400 || res.status === 401 ? 401 : 502,
      'Microsoft rejected the Outlook refresh token; reconnect Outlook.');
  }
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token || null };
}

// Exchange an authorization code for tokens (used by the OAuth callback).
// Returns { access_token, refresh_token, expires_in, ... }.
export async function exchangeCode(code, redirectUri) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: MICROSOFT_SCOPES.join(' '),
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error_description || ''; } catch (_) {}
    throw httpErr(502, `Microsoft token exchange failed${detail ? `: ${detail}` : ''}.`);
  }
  return res.json();
}

// Authenticated GET against Microsoft Graph. `path` is relative to GRAPH_API.
export async function graphGet(accessToken, path, { prefer } = {}) {
  const headers = { authorization: `Bearer ${accessToken}` };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${GRAPH_API}${path}`, { headers });
  if (!res.ok) throw httpErr(res.status === 401 ? 401 : 502, `Microsoft Graph request failed (${res.status}).`);
  return res.json();
}
