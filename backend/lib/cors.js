// CORS + small JSON helpers shared by the serverless handlers.
// The frontend (GitHub Pages) is a different origin from the API (Vercel), so
// every response needs CORS headers and every handler must answer OPTIONS.

const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function applyCors(req, res) {
  const origin = req.headers?.origin || '';
  // If ALLOWED_ORIGINS is unset, fall back to reflecting the caller (dev only).
  const allow = ALLOWED.length === 0 ? origin || '*' : (ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Returns true if it handled a preflight (caller should then return).
export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(body));
}

// Wraps a handler with CORS, preflight, and uniform error handling.
export function withApi(handler) {
  return async (req, res) => {
    applyCors(req, res);
    if (handlePreflight(req, res)) return;
    try {
      await handler(req, res);
    } catch (err) {
      const status = err?.status || 500;
      if (status >= 500) console.error('[api] error', err);
      sendJson(res, status, { error: err?.message || 'Internal error.' });
    }
  };
}
