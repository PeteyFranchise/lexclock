// Minimal bearer-token auth for v1. The frontend sends `Authorization: Bearer
// <apiKey>`; we hash it and look up the user. Swap for Supabase Auth / Clio SSO
// later — every endpoint just calls requireUser(req), so the contract is stable.
import { createHash } from 'node:crypto';
import { supabase } from './supabase.js';

export function hashApiKey(rawKey) {
  return createHash('sha256').update(String(rawKey), 'utf8').digest('hex');
}

export function getBearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

// Returns the user, or throws an Error with a `.status` for the handler.
//
// Auth precedence (see AUTH_PLAN.md, Phase A):
//   1. Supabase Auth JWT  — real logged-in users (email/password, magic link,
//      Google). The on-signup trigger in db/auth.sql guarantees a matching
//      public.users row, so we can trust the JWT's user id directly.
//   2. Legacy lxk_ API key — admin / headless / cron tooling. Kept as a
//      secondary path so nothing breaks during the migration.
export async function requireUser(req) {
  const token = getBearer(req);
  if (!token) {
    const err = new Error('Missing Authorization bearer token.');
    err.status = 401;
    throw err;
  }

  // 1. Supabase Auth JWT. lxk_ keys are not JWTs, so skip the auth-server
  //    round-trip for them.
  if (!token.startsWith('lxk_')) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      const u = data.user;
      return { id: u.id, email: u.email, display_name: u.user_metadata?.display_name || null };
    }
  }

  // 2. Legacy lxk_ API key.
  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name')
    .eq('api_key_hash', hashApiKey(token))
    .maybeSingle();

  if (error) {
    const err = new Error('Auth lookup failed.');
    err.status = 500;
    throw err;
  }
  if (!data) {
    const err = new Error('Invalid credentials.');
    err.status = 401;
    throw err;
  }
  return data;
}

// Guards the cron endpoint: Vercel Cron sends a secret we configure, so random
// callers cannot trigger a full-fleet sync.
export function requireCronSecret(req) {
  const provided = req.headers?.['x-cron-secret'] || getBearer(req);
  const expected = process.env.CRON_SECRET;
  if (!expected || provided !== expected) {
    const err = new Error('Forbidden.');
    err.status = 403;
    throw err;
  }
}
