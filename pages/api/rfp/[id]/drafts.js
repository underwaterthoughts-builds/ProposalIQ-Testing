import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { safe } from '../../../../lib/embeddings';
import { logUsageEvent } from '../../../../lib/feedback';

// CRUD for section drafts on a scan.
//   GET    → list all drafts for this scan
//   PATCH  → update draft text or accept the draft
//   DELETE → discard a draft
async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Scan id required' });

  if (req.method === 'GET') {
    const rows = db.prepare(
      'SELECT * FROM section_drafts WHERE scan_id = ? ORDER BY created_at'
    ).all(id);
    const drafts = rows.map(r => ({
      ...r,
      cited_match_ids: safe(r.cited_match_ids, []),
      cited_language_ids: safe(r.cited_language_ids, []),
      evidence_needed: safe(r.evidence_needed, []),
      qa_adjustments: safe(r.qa_adjustments, []),
      qa_adjustments_count: r.qa_adjustments_count || 0,
    }));
    return res.status(200).json({ drafts });
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body?.draft_id) return res.status(400).json({ error: 'draft_id required' });

    const existing = db.prepare(
      'SELECT * FROM section_drafts WHERE id = ? AND scan_id = ?'
    ).get(body.draft_id, id);
    if (!existing) return res.status(404).json({ error: 'Draft not found' });

    // Allowed updates: draft_text (user edits), status (accept/discard)
    const updates = {};
    if (typeof body.draft_text === 'string') updates.draft_text = body.draft_text;
    if (body.status && ['draft', 'accepted', 'discarded'].includes(body.status)) {
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const setVals = Object.values(updates);
    const acceptedClause = updates.status === 'accepted' ? ', accepted_at = CURRENT_TIMESTAMP' : '';

    db.prepare(
      `UPDATE section_drafts SET ${setClause}${acceptedClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...setVals, body.draft_id);

    // Wave 3 — log usage event for accept/edit
    if (updates.status === 'accepted') {
      logUsageEvent({
        scanId: id,
        eventType: 'section_accepted',
        targetType: 'section',
        targetId: existing.section_id,
        payload: { draft_id: body.draft_id },
        userId: req.user?.id || null,
      }, db);
    } else if ('draft_text' in updates) {
      logUsageEvent({
        scanId: id,
        eventType: 'section_edited',
        targetType: 'section',
        targetId: existing.section_id,
        payload: { draft_id: body.draft_id },
        userId: req.user?.id || null,
      }, db);
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const draftId = body?.draft_id || req.query?.draft_id;
    if (!draftId) return res.status(400).json({ error: 'draft_id required' });
    db.prepare('DELETE FROM section_drafts WHERE id = ? AND scan_id = ?').run(draftId, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
