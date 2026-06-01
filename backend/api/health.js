// GET /api/health — liveness probe + config sanity (no secrets leaked).
import { withApi, sendJson } from '../lib/cors.js';

export default withApi(async (req, res) => {
  sendJson(res, 200, {
    ok: true,
    service: 'lexclock-backend',
    time: new Date().toISOString(),
    config: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      cron: Boolean(process.env.CRON_SECRET),
    },
  });
});
