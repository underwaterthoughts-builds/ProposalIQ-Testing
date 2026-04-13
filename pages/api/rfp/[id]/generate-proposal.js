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

  // ── STAGE 2: Style conformance (OpenAI only) ─────────────────────────
  // Build a style reference from the top matched won proposals: their
  // style classification, standout sentences, and writing quality notes.
  // This gives the model a concrete voice to match, not just an abstract
  // style label.
  let styledProposal = proposal;
  if (hasOpenAI()) {
    try {
      const wonMatches = matches.filter(m => m.outcome === 'won').slice(0, 3);
      const styleRef = wonMatches.map(m => {
        const meta = m.ai_metadata || {};
        const wq = meta.writing_quality || {};
        const sc = m.style_classification || {};
        return [
          `Proposal: "${m.name}" (${m.outcome}, ${m.user_rating}★)`,
          sc.primary_style ? `Style: ${sc.primary_style} — ${sc.style_description || ''}` : null,
          sc.tone ? `Tone: ${sc.tone}` : null,
          sc.sentence_structure ? `Sentence structure: ${sc.sentence_structure}` : null,
          sc.evidence_approach ? `Evidence approach: ${sc.evidence_approach}` : null,
          sc.opening_technique ? `Opening technique: ${sc.opening_technique}` : null,
          wq.tone_notes ? `Writing notes: ${wq.tone_notes}` : null,
          (meta.standout_sentences || []).length > 0
            ? `Voice samples (quote exactly for tone matching):\n${meta.standout_sentences.slice(0, 4).map(s => `  "${s}"`).join('\n')}`
            : null,
        ].filter(Boolean).join('\n');
      }).join('\n\n');

      if (styleRef.trim().length > 100) {
        console.log(`[generate-proposal ${id}] running style conformance pass`);
        styledProposal = await conformToWritingStyle(proposal, styleRef, rfpData);
      }
    } catch (e) {
      console.error(`[generate-proposal ${id}] stage 2 style error (non-fatal):`, e.message);
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
