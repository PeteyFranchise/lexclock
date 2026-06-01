// Signed, short-lived OAuth `state` so the Google redirect can prove which user
// started the flow without us trusting an unauthenticated callback. HMAC over a
// base64url JSON payload; verified in the callback. Secret is OAUTH_STATE_SECRET
// (falls back to CRON_SECRET so a fresh deploy still works).
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET || '';
const TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the consent flow.

function badState(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

export function signState(payload) {
  if (!SECRET) throw new Error('OAUTH_STATE_SECRET / CRON_SECRET is not set.');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state) {
  if (!SECRET) throw new Error('OAUTH_STATE_SECRET / CRON_SECRET is not set.');
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw badState('Invalid OAuth state.');
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw badState('OAuth state signature mismatch.');
  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { throw badState('Invalid OAuth state payload.'); }
  if (!data.exp || Date.now() > data.exp) throw badState('OAuth state expired; retry the connection.');
  return data;
}
