// ────────────────────────────────────────────────────────────────────────────
// Proposal-fit pipeline — score the user's draft proposal against the
// extracted RFP. Runs independently of the main RFP scan so re-uploading
// a revised draft re-scores in seconds without rerunning the whole 14-step
// scan. Idempotent.
//
// analyseProposalAgainstRfp(scanId)
//   1. Load scan + rfp_data + proposal file path
//   2. parseDocument(proposalFile)
//   3. analyseProposal(text, ctx={ rfp themes, mandatories, criteria })
//   4. buildCoverageMatrix(scanId, rfpData.requirements, proposalText)
//   5. compositeFit = weighted blend of: coverage, methodology, evidence,
//                     pricing, criteria fit
//   6. Persist proposal_metadata, proposal_fit_overall, status='complete'
// ────────────────────────────────────────────────────────────────────────────

const { getDb } = require('./db');
const { parseDocument } = require('./parser');
const {
  analyseProposal, openaiGenerate, geminiGenerate, safeJSON,
  detectWorkType, methodologyEvidenceBlock, hasOpenAI, setCostContext,
} = require('./gemini');
const { pMap } = require('./concurrency');
const { AI_ANALYSIS_TIMEOUT_MS, PARSE_TIMEOUT_MS } = require('./timeouts');

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
const dlog = (...args) => { if (DEBUG) console.log(...args); };

const COVERAGE_CONCURRENCY = 5;
const MAX_REQUIREMENTS     = 50;   // soft cap per spec — predictable cost
const COVERAGE_TIMEOUT_MS  = 45_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)),
  ]);
}

function setStatus(db, scanId, status, progress = null) {
  db.prepare(
    'UPDATE rfp_scans SET proposal_analysis_status = ?, proposal_analysis_progress = ? WHERE id = ?'
  ).run(status, progress, scanId);
}

// Per-requirement prompt — strict definition of evidence. Work-type
// guidance from the methodology rubric so creative/comms/brand work
// isn't penalised for structure-by-demonstration.
function buildCoverageSystemPrompt(workType) {
  return `You are evaluating whether a single proposal addresses one specific RFP requirement. Be strict — generic claims that "could appear in any proposal" are NOT evidence, they're filler.

═══════════════════════════════════════════════════════════════════════
WORK-TYPE GUIDANCE — what counts as evidence in this domain
═══════════════════════════════════════════════════════════════════════
${methodologyEvidenceBlock(workType)}

═══════════════════════════════════════════════════════════════════════
DECISION RULES
═══════════════════════════════════════════════════════════════════════
- "addressed": the proposal contains a quoted sentence (or short passage)
  that directly speaks to the requirement AND carries a specific fact
  (named real client, quantified outcome, named technology, named
  individual with credential, OR a domain-appropriate structural device
  per the work-type guidance above).
- "partial": relevant content but generic, OR addresses only some
  sub-points of a multi-part requirement, OR mentions the topic without
  evidence.
- "missing": no relevant content found in the proposal.
- Empty / near-empty proposals → "missing" for everything.
- Do NOT reward "we will" / "we can" / "our approach" without specifics.
- evidence_quote MUST be an exact substring of the proposal text. If you
  cannot find one, return empty string and status "missing" or "partial".

═══════════════════════════════════════════════════════════════════════
OUTPUT — return ONLY valid JSON, no prose, no code fences
═══════════════════════════════════════════════════════════════════════
{
  "status": "addressed" | "partial" | "missing",
  "evidence_quote": "exact sentence(s) from the proposal, or empty string",
  "strength_score": 0-100,
  "rationale": "one sentence — why this status and not the adjacent one"
}

strength_score calibration:
  85-100  Specific evidence + named fact + directly answers the requirement
  65-84   Specific evidence but partial coverage OR missing one fact type
  40-64   Topic addressed without evidence (generic claims)
  20-39   Tangentially mentioned
  0-19    Missing or unrelated`;
}

function buildCoverageUserPrompt(requirement, proposalText, rfpContextHints) {
  return `RFP REQUIREMENT to evaluate:
"""
${requirement.text || ''}
${requirement.section ? `Section: ${requirement.section}` : ''}
${requirement.mandatory ? 'Mandatory: yes' : ''}
"""

${rfpContextHints ? `RFP CONTEXT (informational, do not score against this — score against the requirement above):\n${rfpContextHints}\n` : ''}
PROPOSAL TEXT:
"""
${proposalText}
"""

Return ONLY the JSON specified in the system prompt.`;
}

async function evaluateRequirement(requirement, proposalText, workType, rfpContextHints) {
  const systemPrompt = buildCoverageSystemPrompt(workType);
  const userPrompt = buildCoverageUserPrompt(requirement, proposalText, rfpContextHints);

  if (hasOpenAI()) {
    try {
      const raw = await openaiGenerate(systemPrompt, userPrompt, 600, 'proposal_coverage');
      const parsed = safeJSON(raw);
      if (parsed && typeof parsed.status === 'string') return parsed;
    } catch (e) {
      dlog('[proposal-fit] OpenAI per-requirement failed, falling back:', e.message);
    }
  }
  // Gemini fallback — combine system + user since geminiGenerate takes one prompt
  const raw = await geminiGenerate(`${systemPrompt}\n\n${userPrompt}`, true, 'proposal_coverage');
  return safeJSON(raw) || { status: 'missing', evidence_quote: '', strength_score: 0, rationale: 'AI evaluation failed' };
}

// Build per-requirement coverage rows. Concurrency-limited; per-row
// failures are captured as 'unanalyzed' so a single bad call doesn't
// kill the matrix. Persists each row as it completes so the UI can
// show real-time progress.
async function buildCoverageMatrix(scanId, requirements, proposalText, workType, rfpData) {
  const db = getDb();
  // Clear any prior rows — re-analysis re-runs from scratch
  db.prepare('DELETE FROM proposal_coverage WHERE scan_id = ?').run(scanId);

  // Soft cap: prioritise mandatories first, then nice-to-haves
  const sorted = [...requirements].sort((a, b) => (b.mandatory ? 1 : 0) - (a.mandatory ? 1 : 0));
  const slice = sorted.slice(0, MAX_REQUIREMENTS).map((r, i) => ({ ...r, _origIndex: i }));

  // Compact RFP context for each call — themes + criteria help disambiguate
  // requirement intent without bloating tokens
  const ctxBits = [];
  if (rfpData?.client) ctxBits.push(`Client: ${rfpData.client}`);
  if (Array.isArray(rfpData?.key_themes) && rfpData.key_themes.length) ctxBits.push(`Themes: ${rfpData.key_themes.slice(0, 4).join(', ')}`);
  if (Array.isArray(rfpData?.evaluation_criteria) && rfpData.evaluation_criteria.length) {
    ctxBits.push(`Eval criteria: ${rfpData.evaluation_criteria.slice(0, 3).map(c => c.text || c).join('; ')}`);
  }
  const rfpContextHints = ctxBits.join('\n');

  let completed = 0;
  const total = slice.length;
  setStatus(db, scanId, 'processing', `0/${total}`);

  const tasks = slice.map((req, i) => async () => {
    let result;
    try {
      result = await withTimeout(
        evaluateRequirement(req, proposalText, workType, rfpContextHints),
        COVERAGE_TIMEOUT_MS,
        `req ${i}`
      );
    } catch (e) {
      dlog(`[proposal-fit] requirement ${i} failed:`, e.message);
      result = { status: 'unanalyzed', evidence_quote: '', strength_score: 0, rationale: e.message };
    }
    db.prepare(
      `INSERT OR REPLACE INTO proposal_coverage
        (scan_id, requirement_index, requirement_text, requirement_section, requirement_mandatory, status, evidence_quote, strength_score, rationale)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      scanId, i, req.text || '', req.section || null, req.mandatory ? 1 : 0,
      result.status || 'unanalyzed',
      (result.evidence_quote || '').slice(0, 4000),
      Number.isFinite(result.strength_score) ? Math.round(result.strength_score) : 0,
      (result.rationale || '').slice(0, 1000)
    );
    completed += 1;
    setStatus(db, scanId, 'processing', `${completed}/${total}`);
    return result;
  });

  await pMap(tasks, COVERAGE_CONCURRENCY);
  return { total, completed };
}

// Composite fit score — weighted blend of the dimensions we have data for.
// Pass `null` for any dimension that's not assessable (e.g. coverage when
// the RFP yielded zero requirements; pricing when neither side has a
// number). Null dimensions are dropped and the remaining weights are
// renormalised so a missing dimension doesn't drag the score down.
// All non-null inputs 0-100; output 0-100 integer.
function compositeFit({ coverage, methodology, evidence, pricing, criteria }) {
  const w = { coverage: 0.40, methodology: 0.20, evidence: 0.15, pricing: 0.10, criteria: 0.15 };
  const dims = { coverage, methodology, evidence, pricing, criteria };
  let weighted = 0;
  let weight = 0;
  for (const k of Object.keys(w)) {
    if (dims[k] == null) continue;
    weighted += dims[k] * w[k];
    weight   += w[k];
  }
  if (weight === 0) return 0;
  return Math.max(0, Math.min(100, Math.round(weighted / weight)));
}

// Coverage score — % of requirements addressed, weighted by mandatory.
// Mandatories count 2x. Strength-weighted within "addressed" so a row
// that barely scrapes through doesn't count the same as a strong hit.
function computeCoverageScore(rows) {
  if (!rows.length) return 0;
  let earned = 0, possible = 0;
  for (const r of rows) {
    const w = r.requirement_mandatory ? 2 : 1;
    possible += w * 100;
    if (r.status === 'addressed') earned += w * (r.strength_score || 80);
    else if (r.status === 'partial') earned += w * (r.strength_score || 50);
    // 'missing' / 'unanalyzed' contribute zero
  }
  return possible === 0 ? 0 : Math.round((earned / possible) * 100);
}

// Pricing alignment 0-100. 100 if within range, sliding toward 0 the
// further outside. Returns null if either side has no pricing data
// (signals "not assessable" — caller drops it from the composite).
function computePricingFit(rfpBudgetRange, proposalContractValue) {
  if (!proposalContractValue || proposalContractValue <= 0) return null;
  const lo = parseFloat(rfpBudgetRange?.low) || 0;
  const hi = parseFloat(rfpBudgetRange?.high) || 0;
  if (!lo && !hi) return null;
  if (lo && hi) {
    if (proposalContractValue >= lo && proposalContractValue <= hi) return 100;
    const dist = proposalContractValue < lo
      ? (lo - proposalContractValue) / lo
      : (proposalContractValue - hi) / hi;
    return Math.max(0, Math.round(100 * (1 - Math.min(1, dist))));
  }
  // single-sided range
  const target = lo || hi;
  const dist = Math.abs(proposalContractValue - target) / target;
  return Math.max(0, Math.round(100 * (1 - Math.min(1, dist))));
}

async function analyseProposalAgainstRfp(scanId) {
  const db = getDb();
  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(scanId);
  if (!scan) throw new Error(`scan ${scanId} not found`);
  if (!scan.proposal_filename) throw new Error('no proposal attached');

  // Tag AI calls so /api/ai-costs can attribute them.
  setCostContext({ category: 'proposal_fit', scanId, projectId: null });

  setStatus(db, scanId, 'pending', null);

  const path = require('path');
  const fs = require('fs');
  const proposalPath = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans', scan.proposal_filename);
  if (!fs.existsSync(proposalPath)) throw new Error(`proposal file not on disk: ${proposalPath}`);

  let proposalText = '';
  try {
    proposalText = await withTimeout(parseDocument(proposalPath), PARSE_TIMEOUT_MS, 'parseProposal');
  } catch (e) {
    setStatus(db, scanId, 'error', `parse failed: ${e.message}`);
    throw e;
  }
  if (!proposalText || proposalText.trim().length < 50) {
    setStatus(db, scanId, 'error', 'proposal text too short to analyse');
    throw new Error('proposal text too short');
  }

  const rfpData = (() => { try { return JSON.parse(scan.rfp_data || '{}'); } catch { return {}; } })();

  // Step 1: full proposal analysis with RFP context
  setStatus(db, scanId, 'processing', 'analysing proposal…');
  let metadata = {};
  try {
    metadata = await withTimeout(
      analyseProposal(proposalText, null, null, {
        sector: rfpData.sector,
        service_industry: rfpData.service_industry,
      }),
      AI_ANALYSIS_TIMEOUT_MS,
      'analyseProposal'
    );
  } catch (e) {
    dlog('[proposal-fit] analyseProposal failed:', e.message);
    metadata = {};
  }

  const workType = detectWorkType({
    sector: rfpData.sector,
    serviceIndustry: rfpData.service_industry,
    text: proposalText,
  });

  // Step 2: per-requirement coverage matrix
  const requirements = Array.isArray(rfpData.requirements) ? rfpData.requirements : [];
  const hasRequirements = requirements.length > 0;
  if (hasRequirements) {
    await buildCoverageMatrix(scanId, requirements, proposalText, workType, rfpData);
  }

  // Step 3: criteria fit — same engine, treats each evaluation_criterion as a
  // mini-requirement. We fold its score directly into the composite without
  // persisting separately (the criteria are usually <= 5; cheap).
  const criteria = Array.isArray(rfpData.evaluation_criteria) ? rfpData.evaluation_criteria : [];
  const hasCriteria = criteria.length > 0;
  let criteriaScore = null;
  if (hasCriteria) {
    const critTasks = criteria.slice(0, 8).map(c => async () => {
      const text = typeof c === 'string' ? c : (c.text || c.criterion || '');
      if (!text) return null;
      try {
        const result = await withTimeout(
          evaluateRequirement({ text, mandatory: true }, proposalText, workType, ''),
          COVERAGE_TIMEOUT_MS,
          'criterion'
        );
        return result.strength_score || 0;
      } catch { return 0; }
    });
    const results = await pMap(critTasks, COVERAGE_CONCURRENCY);
    const scores = results.filter(r => r.ok && typeof r.value === 'number').map(r => r.value);
    criteriaScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }

  // Step 4: composite
  // Each dimension is null when not assessable so compositeFit can drop it
  // and renormalise rather than dragging the overall down. Common "partial"
  // case: RFP parsed thinly → no requirements → no coverage → score reflects
  // methodology + evidence only.
  const coverageRows = db.prepare('SELECT * FROM proposal_coverage WHERE scan_id = ?').all(scanId);
  const coverageScore = hasRequirements ? computeCoverageScore(coverageRows) : null;
  const methodologyScore = metadata?.approach_quality?.methodology_clarity || null;
  const ws = metadata?.writing_quality || {};
  const evidenceScore = (ws.specificity_score != null && ws.evidence_density != null)
    ? Math.round((ws.specificity_score + ws.evidence_density) / 2)
    : null;

  const proposalContractValue = parseFloat(metadata?.contract_value)
    || parseFloat(metadata?.pricing?.total)
    || 0;
  const pricingScore = computePricingFit(rfpData.budget_range, proposalContractValue);

  const overall = compositeFit({
    coverage:    coverageScore,
    methodology: methodologyScore,
    evidence:    evidenceScore,
    pricing:     pricingScore,
    criteria:    criteriaScore,
  });

  // Tell the UI which dimensions actually contributed so it can render an
  // honest "score is X+Y only" note when the assessment is partial.
  const dimensionsUsed = [];
  if (coverageScore    != null) dimensionsUsed.push('coverage');
  if (methodologyScore != null) dimensionsUsed.push('methodology');
  if (evidenceScore    != null) dimensionsUsed.push('evidence');
  if (pricingScore     != null) dimensionsUsed.push('pricing');
  if (criteriaScore    != null) dimensionsUsed.push('criteria');
  const partialAssessment = !hasRequirements || !hasCriteria;

  // Persist
  db.prepare(`UPDATE rfp_scans SET
    proposal_metadata = ?,
    proposal_fit_overall = ?,
    proposal_analysis_status = 'complete',
    proposal_analysis_progress = NULL,
    last_proposal_analyzed_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(
      JSON.stringify({
        ...metadata,
        _scores: {
          coverage: coverageScore,
          methodology: methodologyScore,
          evidence: evidenceScore,
          pricing: pricingScore,
          criteria: criteriaScore,
          overall,
        },
        _work_type: workType,
        _proposal_contract_value: proposalContractValue || null,
        _dimensions_used: dimensionsUsed,
        _partial_assessment: partialAssessment,
        _missing_dimensions: {
          requirements: !hasRequirements,
          criteria: !hasCriteria,
          pricing: pricingScore == null,
        },
      }),
      overall,
      scanId
    );

  return { overall, coverageScore, methodologyScore, evidenceScore, pricingScore, criteriaScore, partialAssessment };
}

module.exports = {
  analyseProposalAgainstRfp,
  buildCoverageMatrix,
  computeCoverageScore,
  computePricingFit,
  compositeFit,
};
