const { inferTaxonomyFromProposal } = require('./taxonomy');
const { referenceWeight } = require('./rating');

const OUTCOME_BOOST = { won:1.25, lost:0.75, pending:1.0, active:1.0, withdrawn:0.65 };

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot=0, na=0, nb=0;
  for (let i=0; i<a.length; i++) { dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  if (!na||!nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function safe(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function kqsBonus(p) {
  const composite = p.kqs_composite || 0.5;
  const hasLH = p.lh_status === 'complete' ? 0.05 : 0;
  return composite * 0.10 + hasLH;
}

// Match label based on raw similarity score
function matchLabel(raw) {
  if (raw >= 0.72) return 'Strong';
  if (raw >= 0.50) return 'Good';
  if (raw >= 0.30) return 'Partial';
  return 'Weak';
}

// ── Tiered taxonomy ranking ────────────────────────────────────────────────
// Tier 1 = full     (client industry match AND service industry match)
// Tier 2 = client   (only client industry match)
// Tier 3 = service  (only service industry match)
// Tier 4 = untagged (no signal either way — neutral)
// Tier 5 = cross    (both tagged, neither matches — guaranteed bottom)
//
// Within each tier, the proposal is ordered by base score:
//   cosine × ai_weight × outcome_boost + kqs + small_sector_bonus
// Sector bonuses are intentionally small enough to never cross tier walls.
//
// IMPORTANT: this function uses TEXT-BASED INFERENCE as a fallback when a
// proposal has no explicit client_industry/service_industry tags. This means
// proposals uploaded before the taxonomy was added still get tiered correctly
// without requiring re-analysis. Inference is non-AI, runs in microseconds.
function taxonomyTier(proposal, rfp) {
  let propClient = proposal.client_industry || null;
  let propService = proposal.service_industry || null;
  let inferred = false;

  // Fallback: infer from proposal text fields if not explicitly tagged.
  if (!propClient || !propService) {
    const inf = inferTaxonomyFromProposal(proposal);
    if (!propClient && inf.client_industry) { propClient = inf.client_industry; inferred = true; }
    if (!propService && inf.service_industry) { propService = inf.service_industry; inferred = true; }
  }

  const rfpClient = rfp.client_industry || null;
  const rfpService = rfp.service_industry || null;

  // If the RFP itself has no taxonomy, we can't tier — everything is tier 4.
  if (!rfpClient && !rfpService) return { tier: 4, label: 'untagged', inferred };

  // If neither side of the proposal could be determined (even after
  // inference), treat as untagged neutral.
  if (!propClient && !propService) return { tier: 4, label: 'untagged', inferred };

  const clientMatch = propClient && rfpClient && propClient === rfpClient;
  const serviceMatch = propService && rfpService && propService === rfpService;

  if (clientMatch && serviceMatch) return { tier: 1, label: 'full', inferred, propClient, propService };
  if (clientMatch) return { tier: 2, label: 'client', inferred, propClient, propService };
  if (serviceMatch) return { tier: 3, label: 'service', inferred, propClient, propService };
  return { tier: 5, label: 'cross', inferred, propClient, propService };
}

function sectorBonus(proposal, rfp) {
  let bonus = 0;
  // Client sectors: +0.03 each, capped at 3 → max 0.09
  if (proposal.client_industry && rfp.client_industry &&
      proposal.client_industry === rfp.client_industry) {
    const propSecs = safe(proposal.client_sectors, []) || [];
    const rfpSecs = rfp.client_sectors || [];
    const overlap = propSecs.filter(s => rfpSecs.includes(s)).length;
    bonus += Math.min(overlap, 3) * 0.03;
  }
  // Service sectors: +0.02 each, capped at 3 → max 0.06
  if (proposal.service_industry && rfp.service_industry &&
      proposal.service_industry === rfp.service_industry) {
    const propSecs = safe(proposal.service_sectors, []) || [];
    const rfpSecs = rfp.service_sectors || [];
    const overlap = propSecs.filter(s => rfpSecs.includes(s)).length;
    bonus += Math.min(overlap, 3) * 0.02;
  }
  return bonus;
}

function rankProposals(queryVec, projects, rfpTaxonomy) {
  const rfp = rfpTaxonomy || {};

  // Wave 3 — feedback boost: load past usage stats once for all projects
  // in this scan. The boost is intentionally tiny (max +0.08 total) so it
  // can never override taxonomy tier — it just nudges close-tier matches
  // toward proposals that have actually been used in winning bids.
  // Lazy-load to avoid a circular import (feedback → db → embeddings).
  let usageStats = new Map();
  try {
    const { getProjectUsageStats } = require('./feedback');
    usageStats = getProjectUsageStats();
  } catch (e) {
    // Feedback module unavailable — boost defaults to 0
  }

  // Always return ALL projects — no cutoff. Ranked by tier then by score within tier.
  return projects
    .filter(p => p.embedding)
    .map(p => {
      const vec = safe(p.embedding, null);
      if (!vec) return null;
      const raw = cosine(queryVec, vec);
      // System rating (60% user, 40% AI) drives reference weight. Replaces
      // the previous table keyed on user_rating alone so AI-detected
      // weakness can discount a proposal even if the user rated it high.
      const w = referenceWeight(p);
      const ob = OUTCOME_BOOST[p.outcome] ?? 1.0;
      const kqs = kqsBonus(p);
      const tax = taxonomyTier(p, rfp);
      const sectorB = sectorBonus(p, rfp);

      // Feedback loop boost — small, never crosses tier walls
      const stats = usageStats.get(p.id);
      let feedbackB = 0;
      if (stats) {
        const used = stats.used_count || 0;
        const won = stats.won_count || 0;
        feedbackB = Math.min(used * 0.01, 0.04) + Math.min(won * 0.02, 0.04);
      }

      const weighted = (raw * w * ob) + kqs + sectorB + feedbackB;
      const aiMeta = safe(p.ai_metadata, {});
      return {
        ...p,
        ai_metadata: aiMeta,
        taxonomy: safe(p.taxonomy, {}),
        raw_similarity: Math.round(raw * 100),
        match_score: Math.min(Math.round(weighted * 130), 99),
        match_label: matchLabel(raw),
        taxonomy_tier: tax.tier,
        taxonomy_match: tax.label,
        // Carry the resolved (possibly inferred) industries forward so the
        // UI and downstream consumers can show "inferred" badges and the
        // PATCH editor can suggest pre-filled values.
        client_industry: tax.propClient || p.client_industry || null,
        service_industry: tax.propService || p.service_industry || null,
        taxonomy_inferred: !!tax.inferred,
        // Feedback signal — surfaced as a UI badge
        used_count: stats?.used_count || 0,
        won_count: stats?.won_count || 0,
        _weighted: weighted,
      };
    })
    .filter(Boolean)
    // Sort by tier asc (1 best), then by weighted desc within tier.
    // This guarantees a tier-5 result can never beat a tier-1 result regardless of score.
    .sort((a, b) => {
      if (a.taxonomy_tier !== b.taxonomy_tier) return a.taxonomy_tier - b.taxonomy_tier;
      return b._weighted - a._weighted;
    });
}

function rankTeamMembers(queryVec, members, participationHistory) {
  return members
    .filter(m => m.embedding)
    .map(m => {
      const vec = safe(m.embedding, null);
      if (!vec) return null;
      const cvSim = cosine(queryVec, vec);
      const history = participationHistory.filter(h => h.member_id === m.id);
      const histBoost = Math.min(history.reduce((acc, h) => {
        return acc + ((AI_WEIGHT[h.rating]??0.4) * (OUTCOME_BOOST[h.outcome]??1.0) * 0.08);
      }, 0), 0.35);
      const cvExtracted = safe(m.cv_extracted, {});
      const cvBonus = Object.keys(cvExtracted).length > 3 ? 0.05 : 0;
      const total = cvSim * 0.65 + histBoost + cvBonus;
      return {
        ...m,
        stated_specialisms: safe(m.stated_specialisms, []),
        cv_extracted: cvExtracted,
        fit_score: Math.min(Math.round(total * 130), 99),
        project_history: history,
        _score: total,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

module.exports = { cosine, rankProposals, rankTeamMembers, safe, matchLabel };
