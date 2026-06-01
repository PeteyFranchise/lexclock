// Server-side Gmail wrapper for the email-scanning pipeline (Phase 1).
// Mirrors notion.js: OAuth token handling + raw fetch + a mapMessage() that
// keeps only the minimum. No extra dependencies.
//
// PRIVACY: message bodies returned here are fed to the AI estimator and then
// dropped. Nothing in this module persists a body or an access token.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Exchange the stored refresh token for a short-lived access token.
// Access tokens are used in-memory only and never persisted (data minimization).
export async function getAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw httpErr(500, 'Google OAuth env vars are not set on the server.');
  if (!refreshToken) throw httpErr(400, 'Gmail connection has no refresh token; reconnect Gmail.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw httpErr(res.status === 400 || res.status === 401 ? 401 : 502,
      'Google rejected the Gmail refresh token; reconnect Gmail.');
  }
  const data = await res.json();
  return data.access_token;
}

// Exchange an authorization code for tokens (used by the OAuth callback).
// Returns { access_token, refresh_token, expires_in, ... }.
export async function exchangeCode(code, redirectUri) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error_description || ''; } catch (_) {}
    throw httpErr(502, `Google token exchange failed${detail ? `: ${detail}` : ''}.`);
  }
  return res.json();
}

// List SENT message ids from the last couple of days. We scan sent mail because
// a sent message is evidence the attorney performed billable work (drafting /
// advising). The stored internalDate cursor de-dupes precisely on the sync side.
export async function listSentMessageIds(accessToken) {
  const q = 'in:sent newer_than:2d';
  const url = `${GMAIL_API}/messages?q=${encodeURIComponent(q)}&maxResults=50`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw httpErr(res.status === 401 ? 401 : 502, `Gmail list failed (${res.status}).`);
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages.map((m) => m.id) : [];
}

export async function getMessage(accessToken, id) {
  const url = `${GMAIL_API}/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw httpErr(res.status === 401 ? 401 : 502, `Gmail get failed (${res.status}).`);
  return res.json();
}

function header(payload, name) {
  const h = (payload?.headers || []).find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function decodeB64Url(data) {
  try {
    return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch (_) { return ''; }
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Walk a (possibly multipart) payload, preferring text/plain, falling back to
// stripped text/html. Returns decoded body text.
export function extractPlainTextFromPayload(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeB64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts) && payload.parts.length) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain) return extractPlainTextFromPayload(plain);
    for (const part of payload.parts) {
      const text = extractPlainTextFromPayload(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeB64Url(payload.body.data));
  }
  return '';
}

// Normalize a Gmail message into the minimal shape the estimator consumes.
// bodyText is used to estimate and is NOT persisted by the sync.
export function mapMessage(msg) {
  const payload = msg.payload || {};
  return {
    externalId: msg.id,
    subject: header(payload, 'Subject'),
    to: header(payload, 'To'),
    from: header(payload, 'From'),
    date: header(payload, 'Date'),
    internalDate: Number(msg.internalDate) || null, // epoch ms
    snippet: msg.snippet || '',
    bodyText: extractPlainTextFromPayload(payload),
  };
}
