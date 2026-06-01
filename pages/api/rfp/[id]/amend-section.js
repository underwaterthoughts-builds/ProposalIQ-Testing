import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { parseJsonField } from '../../../../lib/embeddings';
import { amendSectionDraft } from '../../../../lib/gemini';
import { logUsageEvent } from '../../../../lib/feedback';

// POST /api/rfp/[id]/amend-section
//
// Natural-language revise. Takes an existing section_drafts row and a
// user's free-text instruction (e.g. "make this more confident", "add a
// paragraph about our Arabic-speaking team"), runs amendSectionDraft to
// produce a revised text, and persists the new text back to the same row.
//
// Citations and metadata are preserved. The prompt is constrained to
// apply ONLY the requested change — see lib/gemini.js amendSectionDraft
// for the full rules.
//
// Body: { draft_id, instruction }
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  const { id } = req.query;
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (!id) return res.status(400).json({ error: 'Scan id required' });
  if (!body?.draft_id) return res.status(400).json({ error: 'draft_id required' });
  const instruction = (body.instruction || '').trim();
  if (!instruction) return res.status(400).json({ error: 'instruction required' });
  if (instruction.length > 2000) {
    return res.status(400).json({ error: 'instruction too long (max 2000 chars)' });
  }

  // Tenant gate on scan
  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });

  // Load the draft row
  const draft = db.prepare(
    'SELECT * FROM section_drafts WHERE id = ? AND scan_id = ?'
  ).get(body.draft_id, id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });

  if (draft.status === 'accepted' && !body.force) {
    return res.status(409).json({
      error: 'This draft is marked accepted. Pass {force: true} to revise an accepted draft.',
    });
  }

  // Load the same source context the original draft was generated with
  const rfpData = parseJsonField(scan.rfp_data, {});
  const matches = parseJsonField(scan.matched_proposals, []);
  const winningLanguage = parseJsonField(scan.winning_language, []);

  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE user_id = ?").get(req.user.id);
    if (row) {
      orgProfile = { ...row, confirmed_profile: parseJsonField(row.confirmed_profile, {}) };
    }
  } catch {}

  // Revise
  let result;
  try {
    result = await amendSectionDraft(
      draft.draft_text || '',
      instruction,
      rfpData,
      matches,
      winningLanguage,
      orgProfile,
      {}
    );
  } catch (e) {
    console.error(`[amend ${id}/${draft.section_id}] error:`, e.message);
    return res.status(500).json({ error: 'Amend failed: ' + e.message });
  }

  const newText = result?.text || draft.draft_text;
  const changeSummary = result?.change_summary || 'revised';
  const textChanged = newText && newText !== draft.draft_text;

  // Only persist when there's an actual change — otherwise the no-op
  // shouldn't bump updated_at or appear in the audit trail.
  if (textChanged) {
    db.prepare(`
      UPDATE section_drafts
      SET draft_text = ?, status = 'draft', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newText, draft.id);

    logUsageEvent({
      scanId: id,
      eventType: 'section_amended',
      targetType: 'section',
      targetId: draft.section_id,
      payload: {
        instruction: instruction.slice(0, 500),
        change_summary: changeSummary,
        chars_before: (draft.draft_text || '').length,
        chars_after: newText.length,
      },
      userId: req.user?.id || null,
    }, db);
  }

  return res.status(200).json({
    draft: {
      id: draft.id,
      scan_id: id,
      section_id: draft.section_id,
      section_name: draft.section_name,
      draft_text: newText,
      cited_match_ids: parseJsonField(draft.cited_match_ids, []),
      cited_language_ids: parseJsonField(draft.cited_language_ids, []),
      evidence_needed: parseJsonField(draft.evidence_needed, []),
      confidence: draft.confidence,
      confidence_reason: draft.confidence_reason,
      qa_adjustments_count: draft.qa_adjustments_count,
      qa_adjustments: parseJsonField(draft.qa_adjustments, []),
      status: textChanged ? 'draft' : draft.status,
    },
    change_summary: changeSummary,
    changed: !!textChanged,
  });
}

export default requireAuth(handler);
