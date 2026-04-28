import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { safe } from '../../../../lib/embeddings';
import {
  generateFullProposal, checkRequirementsCoverage,
  conformToWritingStyle, hasOpenAI, setCostContext,
  qaFinaliseDraft,
} from '../../../../lib/gemini';
import { logUsageEvent } from '../../../../lib/feedback';

// POST /api/rfp/[id]/generate-proposal
//
// Three-stage pipeline:
//   1. Generate the full proposal from scan intelligence
//   2. Style conformance pass — rewrite to match the user's winning voice
//   3. Requirements coverage check — verify every MUST/SHOULD is addressed
//
// All three stages use OpenAI (strongest model). Total: ~60-90s, ~$0.15-0.25.
// User-initiated only, never automatic.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  const { id } = req.query;

  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });
  if (scan.status !== 'complete') {
    return res.status(400).json({
      error: 'Full proposal generation requires a completed scan with all analysis tabs populated.',
      hint: 'Wait for the deep pass to finish, then retry.',
    });
  }

  const rfpData = safe(scan.rfp_data, {});
  const matches = safe(scan.matched_proposals, []);
  const gaps = safe(scan.gaps, []);
  const winStrategy = safe(scan.win_strategy, null);
  const winningLanguage = safe(scan.winning_language, []);
  const suggestedApproach = safe(scan.suggested_approach, null);
  const executiveBrief = safe(scan.executive_brief, null);

  // Mirror the single-section endpoint's upstream-data guards. Without
  // matches or winning-language/strategy, drafts are forced to invent
  // content — the non-invention rule then redacts most of it as
  // [EVIDENCE NEEDED] markers and the user gets a hollow proposal.
  // Fail loud at the API boundary instead.
  if (!matches.length) {
    return res.status(400).json({
      error: 'No matched proposals available for this scan — full proposal drafts must be source-linked.',
      hint: 'Re-scan the RFP after uploading at least one relevant past proposal to your repository.',
    });
  }
  if (!winningLanguage.length && !winStrategy) {
    return res.status(400).json({
      error: 'No winning language or strategy available for this scan — re-run the scan first to generate them.',
      hint: 'A scan stuck in "fast_ready" hasn\'t generated these yet. Click Rescan to complete the deep pass.',
    });
  }

  // narrative_advice may be a plain string or a JSON object
  // { text, writing_insights, proposal_structure }. Extract both
  // so the full-proposal generator gets the same rich writing-insights
  // context the single-section endpoint receives — without this the two
  // code paths fed generateSectionDraft different (and weaker)
  // writingInsights, producing visibly lower-quality full proposals
  // even though the per-section drafts on their own were strong.
  let narrativeAdvice = '';
  let writingInsights = [];
  try {
    const parsed = JSON.parse(scan.narrative_advice);
    if (parsed && typeof parsed === 'object') {
      narrativeAdvice = parsed.text || '';
      writingInsights = Array.isArray(parsed.writing_insights) ? parsed.writing_insights : [];
    } else {
      narrativeAdvice = parsed || scan.narrative_advice || '';
    }
  } catch { narrativeAdvice = scan.narrative_advice || ''; }

  const proposalStructure = (() => {
    try {
      const parsed = JSON.parse(scan.narrative_advice);
      return parsed?.proposal_structure || null;
    } catch { return null; }
  })();

  const teamSuggestions = safe(scan.team_suggestions, []);

  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE user_id = ?").get(req.user.id);
    if (row) orgProfile = { ...row, confirmed_profile: safe(row.confirmed_profile, {}) };
  } catch {}

  setCostContext({ category: 'proposal_generation', scanId: id, projectId: null });

  // Real team records — used by section drafts so the Team section uses
  // real names instead of [TBC] placeholders, and so any phase owner
  // referenced in Approach can resolve to a real person.
  // Tenant-scope the team pool to the scan's owner (admin bypass).
  const teamOwnerRow = scan.owner_user_id ? db.prepare('SELECT role FROM users WHERE id = ?').get(scan.owner_user_id) : null;
  const teamIsAdminOwned = teamOwnerRow?.role === 'admin';
  const teamSql = teamIsAdminOwned || !scan.owner_user_id
    ? 'SELECT id, name, title, stated_specialisms, stated_sectors FROM team_members'
    : 'SELECT id, name, title, stated_specialisms, stated_sectors FROM team_members WHERE owner_user_id = ?';
  const teamParams = teamIsAdminOwned || !scan.owner_user_id ? [] : [scan.owner_user_id];
  const team = db.prepare(teamSql).all(...teamParams)
    .map(m => ({ ...m, stated_specialisms: safe(m.stated_specialisms, []) }));

  // Generate. QA now runs PER SECTION inside generateFullProposal with each
  // section's own depth contract — previously we ran one full-document QA
  // pass with no contract, which compressed the substantive sections
  // (Approach especially) to fit the rewrite token budget. Per-section QA
  // matches the single-section endpoint exactly so a full proposal reads
  // at the same depth as 8 single-section drafts concatenated.
  let result;
  try {
    result = await generateFullProposal({
      rfpData,
      rfpText: scan.rfp_text || '',
      matches, gaps, winStrategy, winningLanguage,
      narrativeAdvice, writingInsights, suggestedApproach, proposalStructure,
      executiveBrief, orgProfile, teamSuggestions, team,
    });
  } catch (e) {
    console.error(`[generate-proposal ${id}] stage 1 error:`, e.message);
    return res.status(500).json({ error: 'Proposal generation failed: ' + e.message });
  }

  if (!result || !result.text) {
    return res.status(500).json({ error: 'Generation returned no content.' });
  }

  const finalProposal = result.text;
  const qaAdjustments = result.qa_adjustments || [];
  const qaCount = result.qa_adjustments_count || qaAdjustments.length;

  logUsageEvent({
    scanId: id,
    eventType: 'full_proposal_generated',
    targetType: 'proposal',
    targetId: id,
    payload: {
      length: finalProposal.length,
      qa_adjustments_count: qaCount,
      sections: (result.sections || []).length,
    },
    userId: req.user?.id || null,
  }, db);

  return res.status(200).json({
    proposal: finalProposal,
    qa_adjustments_count: qaCount,
    qa_adjustments: qaAdjustments,
  });
}

export default requireAuth(handler);
