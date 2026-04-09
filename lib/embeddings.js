const AI_WEIGHT = { 0:0.30, 1:0.05, 2:0.15, 3:0.40, 4:0.75, 5:1.00 };
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
// Tier 4 = untagged (either side has no tag — legacy benefit-of-doubt)
// Tier 5 = cross    (both tagged, neither matches — guaranteed bottom)
//
// Within each tier, the proposal is ordered by base score:
//   cosine × ai_weight × outcome_boost + kqs + small_sector_bonus
// Sector bonuses are intentionally small enough to never cross tier walls.
function taxonomyTier(proposal, rfp) {
  const propClient = proposal.client_industry || null;
  const propService = proposal.service_industry || null;
  const rfpClient = rfp.client_industry || null;
  const rfpService = rfp.service_industry || null;

  const eitherUntagged =
    (!propClient && !propService) ||
    (!rfpClient && !rfpService);
  if (eitherUntagged) return { tier: 4, label: 'untagged' };

  const clientMatch = propClient && rfpClient && propClient === rfpClient;
  const serviceMatch = propService && rfpService && propService === rfpService;

  if (clientMatch && serviceMatch) return { tier: 1, label: 'full' };
  if (clientMatch) return { tier: 2, label: 'client' };
  if (serviceMatch) return { tier: 3, label: 'service' };
  return { tier: 5, label: 'cross' };
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
  // Always return ALL projects — no cutoff. Ranked by tier then by score within tier.
  return projects
    .filter(p => p.embedding)
    .map(p => {
      const vec = safe(p.embedding, null);
      if (!vec) return null;
      const raw = cosine(queryVec, vec);
      const w = AI_WEIGHT[p.user_rating] ?? 0.40;
      const ob = OUTCOME_BOOST[p.outcome] ?? 1.0;
      const kqs = kqsBonus(p);
      const tax = taxonomyTier(p, rfp);
      const sectorB = sectorBonus(p, rfp);
      const weighted = (raw * w * ob) + kqs + sectorB;
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
