import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { safe } from '../../../../lib/embeddings';
import { generateFullProposal } from '../../../../lib/gemini';
import { logUsageEvent } from '../../../../lib/feedback';

// POST /api/rfp/[id]/generate-proposal
//
// Generates a complete, submission-ready proposal document using every
// intelligence layer from the scan. Returns plain-text prose with markdown
// section headers. The user copies it into their template and edits.
//
// Gated: scan must be 'complete' (deep pass done — needs winning language,
// win strategy, gaps, matches at minimum).
//
// This is the most expensive single AI call in the system (~$0.05-0.10
// per generation, 8000 output tokens). User-initiated only, never automatic.
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

  // narrative_advice may be string or {text, ...}
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

  // Load org profile
  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row) orgProfile = { ...row, confirmed_profile: safe(row.confirmed_profile, {}) };
  } catch {}

  // Generate — this is the big call, ~30-60s, ~$0.05-0.10
  let proposal;
  try {
    proposal = await generateFullProposal({
      rfpData,
      matches,
      gaps,
      winStrategy,
      winningLanguage,
      narrativeAdvice,
      suggestedApproach,
      proposalStructure,
      executiveBrief,
      orgProfile,
      teamSuggestions,
    });
  } catch (e) {
    console.error(`[generate-proposal ${id}] error:`, e.message);
    return res.status(500).json({ error: 'Proposal generation failed: ' + e.message });
  }

  if (!proposal) {
    return res.status(500).json({ error: 'Generation returned no content.' });
  }

  // Log usage
  logUsageEvent({
    scanId: id,
    eventType: 'full_proposal_generated',
    targetType: 'proposal',
    targetId: id,
    payload: { length: proposal.length },
    userId: req.user?.id || null,
  }, db);

  return res.status(200).json({ proposal });
}

export default requireAuth(handler);
