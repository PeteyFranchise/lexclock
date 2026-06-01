// Provision a LexClock user and print a one-time API key.
// Usage:
//   node scripts/create-user.mjs <email> ["Display Name"]
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (e.g. `vercel env pull .env.local` then `node --env-file=.env.local ...`).
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const [, , email, displayName] = process.argv;
if (!email) {
  console.error('Usage: node scripts/create-user.mjs <email> ["Display Name"]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const rawKey = 'lxk_' + randomBytes(24).toString('base64url');
const apiKeyHash = createHash('sha256').update(rawKey, 'utf8').digest('hex');

const { data, error } = await supabase
  .from('users')
  .insert({ email, display_name: displayName || null, api_key_hash: apiKeyHash })
  .select('id, email')
  .single();

if (error) {
  console.error('Failed to create user:', error.message);
  process.exit(1);
}

console.log('Created user:', data.email, `(${data.id})`);
console.log('\nAPI KEY (store it now — it is not recoverable):\n');
console.log('  ' + rawKey + '\n');
console.log('Use it from the frontend as:  Authorization: Bearer ' + rawKey);
