// /api/drafts — the Review hub's server-backed draft list.
//   GET  ?status=pending           -> list this user's drafts
//   POST { id, status }            -> approve / discard a draft (the decision)
//   POST { ...draftFields }        -> create a manual draft (same addDraft shape)
//
// The frontend keeps calling an addDraft-shaped contract; only the storage moves
// from localStorage to Postgres. Nothing here bills — approval just flips status;
// the actual Clio/Log push happens elsewhere (Phase 10).
import { withApi, sendJson } from '../lib/cors.js';
import { requireUser } from '../lib/auth.js';
import { supabase, audit } from '../lib/supabase.js';

export default withApi(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === 'GET') {
    const status = (req.query?.status || 'pending').toString();
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', status)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return sendJson(res, 200, { drafts: data || [] });
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch (_) {}

    // Decision on an existing draft.
    if (body.id && body.status) {
      if (!['approved', 'discarded', 'pending'].includes(body.status)) {
        return sendJson(res, 400, { error: 'Invalid status.' });
      }
      const { data, error } = await supabase
        .from('drafts')
        .update({ status: body.status })
        .eq('id', body.id)
        .eq('user_id', user.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return sendJson(res, 404, { error: 'Draft not found.' });
      await audit(`draft.${body.status}`, { userId: user.id, source: data.source, detail: { id: data.id } });
      return sendJson(res, 200, { draft: data });
    }

    // Manual draft creation (mirrors client addDraft).
    const insert = {
      user_id: user.id,
      source: body.source || 'manual',
      external_id: body.externalId || null,
      matter_id: body.matterId || null,
      entry_date: body.date || new Date().toISOString().slice(0, 10),
      estimated_seconds: Math.max(0, Math.round(Number(body.estimatedSeconds) || 0)),
      description: String(body.description || '').trim(),
      billable: body.billable !== false,
      confidence: body.confidence == null ? null : Number(body.confidence),
      evidence: String(body.evidence || '').trim(),
      status: 'pending',
    };
    const { data, error } = await supabase.from('drafts').insert(insert).select().maybeSingle();
    if (error) throw error;
    await audit('draft.create', { userId: user.id, source: insert.source, detail: { id: data.id } });
    return sendJson(res, 201, { draft: data });
  }

  return sendJson(res, 405, { error: 'Use GET or POST.' });
});
