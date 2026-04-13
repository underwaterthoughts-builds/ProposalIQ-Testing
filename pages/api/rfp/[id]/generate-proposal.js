import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { safe } from '../../../../lib/embeddings';
import {
  generateFullProposal, checkRequirementsCoverage,
  conformToWritingStyle, hasOpenAI, setCostContext,
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
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
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

  let narrativeAdvice = '';
  try {
    const parsed = JSON.parse(scan.narrative_advice);
    narrativeAdvice = typeof parsed === 'string' ? parsed : (parsed?.text || '');
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
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row) orgProfile = { ...row, confirmed_profile: safe(row.confirmed_profile, {}) };
  } catch {}

  setCostContext({ category: 'proposal_generation', scanId: id, projectId: null });

  // ── STAGE 1: Generate the raw proposal ─────────────────────────────────
  let proposal;
  try {
    proposal = await generateFullProposal({
      rfpData, matches, gaps, winStrategy, winningLanguage,
      narrativeAdvice, suggestedApproach, proposalStructure,
      executiveBrief, orgProfile, teamSuggestions,
    });
  } catch (e) {
    console.error(`[generate-proposal ${id}] stage 1 error:`, e.message);
    return res.status(500).json({ error: 'Proposal generation failed: ' + e.message });
  }

  if (!proposal) {
    return res.status(500).json({ error: 'Generation returned no content.' });
  }

  // STAGE 2 (style conformance) REMOVED.
  // The writing guide already handles sector tone + service structure
  // per-section via buildSectionGuide(). The conformToWritingStyle pass
  // was rewriting all 8 sections in one massive call, reintroducing the
  // exact problem (theatrical language, ignored rules) that the section-
  // by-section approach fixed. Skipping it makes the output match what
  // the user sees in individual section drafts.
  let styledProposal = proposal;
  if (false) { // kept for reference, not executed
    try {
      // Non-fatal — use the unstyled proposal
    }
  }

  // ── STAGE 3: Requirements coverage check (OpenAI only) ─────────────
  let coverageReport = null;
  if (hasOpenAI()) {
    try {
      console.log(`[generate-proposal ${id}] running requirements coverage check`);
      coverageReport = await checkRequirementsCoverage(styledProposal, rfpData);
    } catch (e) {
      console.error(`[generate-proposal ${id}] stage 3 coverage error (non-fatal):`, e.message);
    }
  }

  // Log usage
  logUsageEvent({
    scanId: id,
    eventType: 'full_proposal_generated',
    targetType: 'proposal',
    targetId: id,
    payload: {
      length: styledProposal.length,
      style_applied: styledProposal !== proposal,
      coverage_pct: coverageReport?.coverage_summary?.coverage_percentage || null,
    },
    userId: req.user?.id || null,
  }, db);

  return res.status(200).json({
    proposal: styledProposal,
    coverage: coverageReport,
  });
}

export default requireAuth(handler);
