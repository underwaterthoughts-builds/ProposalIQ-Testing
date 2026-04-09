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

function rankProposals(queryVec, projects) {
  // Always return ALL projects — no cutoff. Ranked from strongest to weakest.
  return projects
    .filter(p => p.embedding)
    .map(p => {
      const vec = safe(p.embedding, null);
      if (!vec) return null;
      const raw = cosine(queryVec, vec);
      const w = AI_WEIGHT[p.user_rating] ?? 0.40;
      const ob = OUTCOME_BOOST[p.outcome] ?? 1.0;
      const kqs = kqsBonus(p);
      const weighted = (raw * w * ob) + kqs;
      const aiMeta = safe(p.ai_metadata, {});
      return {
        ...p,
        ai_metadata: aiMeta,
        taxonomy: safe(p.taxonomy, {}),
        raw_similarity: Math.round(raw * 100),
        match_score: Math.min(Math.round(weighted * 130), 99),
        match_label: matchLabel(raw),   // Strong / Good / Partial / Weak
        _weighted: weighted,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b._weighted - a._weighted);
  // No .slice() — caller decides how many to show
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
