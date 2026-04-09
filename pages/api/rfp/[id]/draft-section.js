import { v4 as uuid } from 'uuid';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { safe } from '../../../../lib/embeddings';
import { generateSectionDraft } from '../../../../lib/gemini';
import { logUsageEvent } from '../../../../lib/feedback';

// POST /api/rfp/[id]/draft-section
//
// Generates source-linked draft content for a single proposal section.
// Gated: scan must be 'complete' (i.e. matches + winning language exist).
// One row per (scan_id, section_id) — re-generating overwrites the existing
// draft unless the user has marked it accepted.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  const { id } = req.query;
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (!id) return res.status(400).json({ error: 'Scan id required' });
  if (!body?.section_id || !body?.section_name) {
    return res.status(400).json({ error: 'section_id and section_name required' });
  }

  // Load scan + verify it's ready for drafting (deep pass complete)
  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  if (scan.status !== 'complete') {
    return res.status(400).json({
      error: 'Section drafting requires the full scan to be complete (winning language + win strategy must exist).',
      hint: 'Wait for the deep pass to finish, then retry.',
    });
  }

  const rfpData = safe(scan.rfp_data, {});
  const matches = safe(scan.matched_proposals, []);
  const winStrategy = safe(scan.win_strategy, null);
  const winningLanguage = safe(scan.winning_language, []);
  const executiveBrief = safe(scan.executive_brief, null);

  // Load confirmed org profile so drafts stay grounded in what we actually do
  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row) {
      orgProfile = { ...row, confirmed_profile: safe(row.confirmed_profile, {}) };
    }
  } catch {}

  if (!matches.length) {
    return res.status(400).json({ error: 'No matched proposals available — drafts must be source-linked.' });
  }
  if (!winningLanguage.length && !winStrategy) {
    return res.status(400).json({
      error: 'No winning language or strategy available — re-run the scan first to generate them.',
    });
  }

  // Don't overwrite an accepted draft unless explicitly forced
  const existing = db.prepare(
    'SELECT id, status FROM section_drafts WHERE scan_id = ? AND section_id = ?'
  ).get(id, body.section_id);
  if (existing && existing.status === 'accepted' && !body.force) {
    return res.status(409).json({
      error: 'A previously accepted draft exists for this section. Pass {force: true} to regenerate.',
    });
  }

  // Generate
  let draft;
  try {
    draft = await generateSectionDraft(
      body.section_name,
      body.section_description || '',
      rfpData,
      matches,
      winStrategy,
      winningLanguage,
      executiveBrief,
      orgProfile
    );
  } catch (e) {
    console.error(`[draft ${id}/${body.section_id}] generation error:`, e.message);
    return res.status(500).json({ error: 'Draft generation failed: ' + e.message });
  }

  if (!draft || !draft.draft) {
    return res.status(500).json({ error: 'Draft generation returned no content.' });
  }

  // Persist (upsert by scan_id + section_id)
  const draftId = existing?.id || uuid();
  if (existing) {
    db.prepare(`
      UPDATE section_drafts SET
        section_name = ?, draft_text = ?, cited_match_ids = ?,
        cited_language_ids = ?, evidence_needed = ?, confidence = ?,
        confidence_reason = ?, status = 'draft', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.section_name,
      draft.draft,
      JSON.stringify(draft.cited_match_ids || []),
      JSON.stringify(draft.cited_language_ids || []),
      JSON.stringify(draft.evidence_needed || []),
      draft.confidence || 'medium',
      draft.confidence_reason || '',
      draftId
    );
  } else {
    db.prepare(`
      INSERT INTO section_drafts (
        id, scan_id, section_id, section_name, draft_text,
        cited_match_ids, cited_language_ids, evidence_needed,
        confidence, confidence_reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      draftId, id, body.section_id, body.section_name, draft.draft,
      JSON.stringify(draft.cited_match_ids || []),
      JSON.stringify(draft.cited_language_ids || []),
      JSON.stringify(draft.evidence_needed || []),
      draft.confidence || 'medium',
      draft.confidence_reason || ''
    );
  }

  // Wave 3 — log usage event so the feedback loop sees this happened
  logUsageEvent({
    scanId: id,
    eventType: 'section_drafted',
    targetType: 'section',
    targetId: body.section_id,
    payload: { confidence: draft.confidence, cited_match_count: (draft.cited_match_ids || []).length },
    userId: req.user?.id || null,
  }, db);

  return res.status(200).json({
    draft: {
      id: draftId,
      scan_id: id,
      section_id: body.section_id,
      section_name: body.section_name,
      draft_text: draft.draft,
      cited_match_ids: draft.cited_match_ids || [],
      cited_language_ids: draft.cited_language_ids || [],
      evidence_needed: draft.evidence_needed || [],
      confidence: draft.confidence || 'medium',
      confidence_reason: draft.confidence_reason || '',
      status: 'draft',
    },
  });
}

export default requireAuth(handler);
