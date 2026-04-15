import { v4 as uuid } from 'uuid';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { safe } from '../../../../lib/embeddings';
import { generateSectionDraft, qaFinaliseDraft, getSectionContract } from '../../../../lib/gemini';
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
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });
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
  const gaps = safe(scan.gaps, []);
  const suggestedApproach = safe(scan.suggested_approach, null);
  // narrative_advice may be a plain string or a JSON { text, writing_insights }
  let narrativeAdvice = '';
  let writingInsights = [];
  try {
    const parsed = JSON.parse(scan.narrative_advice);
    if (parsed && typeof parsed === 'object') {
      narrativeAdvice = parsed.text || '';
      writingInsights = Array.isArray(parsed.writing_insights) ? parsed.writing_insights : [];
    } else {
      narrativeAdvice = scan.narrative_advice || '';
    }
  } catch {
    narrativeAdvice = scan.narrative_advice || '';
  }

  // Load confirmed org profile so drafts stay grounded in what we actually do
  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE user_id = ?").get(req.user.id);
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
    // Resolve the section contract (target_words, required_content, etc)
    // by section_id so single-section drafts get the same depth contract
    // the full-proposal generator uses.
    const contract = getSectionContract(body.section_id) || null;
    // Real team records — used so the Team section can use real names
    // instead of [TBC] placeholders, and any phase owner can resolve.
    const teamRecords = db.prepare(
      'SELECT id, name, title, stated_specialisms, stated_sectors FROM team_members'
    ).all().map(m => ({ ...m, stated_specialisms: safe(m.stated_specialisms, []) }));
    draft = await generateSectionDraft(
      body.section_name,
      body.section_description || '',
      rfpData,
      matches,
      winStrategy,
      winningLanguage,
      executiveBrief,
      orgProfile,
      { gaps, suggestedApproach, narrativeAdvice, writingInsights, team: teamRecords, contract }
    );
  } catch (e) {
    console.error(`[draft ${id}/${body.section_id}] generation error:`, e.message);
    return res.status(500).json({ error: 'Draft generation failed: ' + e.message });
  }

  if (!draft || !draft.draft) {
    return res.status(500).json({ error: 'Draft generation returned no content.' });
  }

  // ── Pre-delivery QA finalisation (detect + silent correct) ─────────
  // Runs before the user sees anything. Non-invention rule: fixes that
  // would require fabrication are replaced with [EVIDENCE NEEDED] markers.
  let finalText = draft.draft;
  let qaAdjustments = [];
  let qaCount = 0;
  try {
    const team = db.prepare('SELECT id, name, title, stated_specialisms FROM team_members').all()
      .map(m => ({ ...m, stated_specialisms: safe(m.stated_specialisms, []) }));
    const finalised = await qaFinaliseDraft({
      draftText: draft.draft,
      rfpText: scan.rfp_text || '',
      rfpData,
      matches,
      orgProfile,
      team,
      scope: 'section',
      contract: getSectionContract(body.section_id) || null,
    });
    if (finalised?.text) {
      finalText = finalised.text;
      qaAdjustments = finalised.adjustments || [];
      qaCount = finalised.adjustments_count || qaAdjustments.length;
    }
  } catch (e) {
    console.error(`[draft ${id}/${body.section_id}] QA finalise error (non-fatal):`, e.message);
  }

  // Persist (upsert by scan_id + section_id)
  const draftId = existing?.id || uuid();
  if (existing) {
    db.prepare(`
      UPDATE section_drafts SET
        section_name = ?, draft_text = ?, cited_match_ids = ?,
        cited_language_ids = ?, evidence_needed = ?, confidence = ?,
        confidence_reason = ?, qa_adjustments_count = ?, qa_adjustments = ?,
        status = 'draft', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.section_name,
      finalText,
      JSON.stringify(draft.cited_match_ids || []),
      JSON.stringify(draft.cited_language_ids || []),
      JSON.stringify(draft.evidence_needed || []),
      draft.confidence || 'medium',
      draft.confidence_reason || '',
      qaCount,
      JSON.stringify(qaAdjustments),
      draftId
    );
  } else {
    db.prepare(`
      INSERT INTO section_drafts (
        id, scan_id, section_id, section_name, draft_text,
        cited_match_ids, cited_language_ids, evidence_needed,
        confidence, confidence_reason, qa_adjustments_count, qa_adjustments, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      draftId, id, body.section_id, body.section_name, finalText,
      JSON.stringify(draft.cited_match_ids || []),
      JSON.stringify(draft.cited_language_ids || []),
      JSON.stringify(draft.evidence_needed || []),
      draft.confidence || 'medium',
      draft.confidence_reason || '',
      qaCount,
      JSON.stringify(qaAdjustments)
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
      draft_text: finalText,
      cited_match_ids: draft.cited_match_ids || [],
      cited_language_ids: draft.cited_language_ids || [],
      evidence_needed: draft.evidence_needed || [],
      confidence: draft.confidence || 'medium',
      confidence_reason: draft.confidence_reason || '',
      qa_adjustments_count: qaCount,
      qa_adjustments: qaAdjustments,
      status: 'draft',
    },
  });
}

export default requireAuth(handler);
