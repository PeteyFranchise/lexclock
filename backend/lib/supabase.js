// Server-side Supabase client using the SERVICE ROLE key.
// This key bypasses RLS and must NEVER reach the browser — it lives only in
// Vercel environment variables and is imported by serverless functions.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // Fail loudly at cold start rather than silently mis-writing data.
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Append-only audit helper. Best-effort: a logging failure must not block the
// user-facing action, but we surface it in server logs.
export async function audit(action, { userId = null, source = null, detail = {} } = {}) {
  try {
    await supabase.from('audit_log').insert({ user_id: userId, action, source, detail });
  } catch (err) {
    console.error('[audit] failed to write', action, err?.message);
  }
}
