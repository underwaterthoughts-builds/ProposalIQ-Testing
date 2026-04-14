// ────────────────────────────────────────────────────────────────────────────
// System rating — 60% user stars + 40% AI composite
// ────────────────────────────────────────────────────────────────────────────
// Where we used to take the user's 1-5 stars as the sole quality signal, we
// now blend that with the AI's own calibrated read of the proposal.
//
// - User rating dominates (60%) because the user knows the real outcome,
//   the client context, and the commercial fit in a way the AI cannot.
// - AI rating weighs in (40%) because it catches textual weaknesses — thin
//   evidence, placeholder language, missing methodologies — that users
//   tend to skim past.
//
// Fallbacks (so the blend is never misleading):
// - If the user hasn't rated (user_rating = 0 / null / missing), the system
//   rating equals the AI rating — we don't blend a real number with zero.
// - If the AI hasn't analysed the project yet (no overall_score on any of
//   writing_quality / approach_quality / credibility_signals), the system
//   rating equals the user rating — same reasoning in reverse.
// - If both are missing, system_pct is null and callers fall back to their
//   own default (typically a neutral weight).
//
// Disagreement: when both are present and the gap between them is wide,
// the callers expose that to the user as a signal — it usually means the
// user rated on outcome while the text is thinner than the outcome suggests,
// or vice versa. The blend smooths it, but the gap is worth surfacing.

const USER_WEIGHT = 0.60;
const AI_WEIGHT = 0.40;
const DISAGREEMENT_THRESHOLD = 35; // pct-points

function userPct(userRating) {
  const r = Number(userRating);
  if (!Number.isFinite(r) || r <= 0) return null;
  return Math.max(0, Math.min(100, r * 20));
}

function aiPct(aiMetadata) {
  if (!aiMetadata || typeof aiMetadata !== 'object') return null;
  const scores = [
    aiMetadata.writing_quality?.overall_score,
    aiMetadata.approach_quality?.overall_score,
    aiMetadata.credibility_signals?.overall_score,
  ].filter(v => Number.isFinite(v) && v > 0);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// Returns a structured object. Callers pick the fields they need.
// project may be a DB row or an object with user_rating + ai_metadata parsed.
function computeSystemRating(project) {
  if (!project) return emptyBreakdown();
  const rawMeta = project.ai_metadata;
  const meta = typeof rawMeta === 'string'
    ? safeParse(rawMeta)
    : (rawMeta || null);
  const u = userPct(project.user_rating);
  const a = aiPct(meta);

  let system = null;
  let source = 'none';
  if (u !== null && a !== null) {
    system = Math.round(u * USER_WEIGHT + a * AI_WEIGHT);
    source = 'blend';
  } else if (u !== null) {
    system = u;
    source = 'user-only';
  } else if (a !== null) {
    system = a;
    source = 'ai-only';
  }

  const disagreement = (u !== null && a !== null && Math.abs(u - a) >= DISAGREEMENT_THRESHOLD)
    ? { gap: Math.abs(u - a), user_higher: u > a }
    : null;

  return {
    user_pct: u,
    ai_pct: a,
    system_pct: system,
    source,
    disagreement,
  };
}

// Convenience: just the numeric system score, for places that don't need
// the breakdown (ranking math, sampling, etc.).
function systemPct(project) {
  return computeSystemRating(project).system_pct;
}

// Weight used when treating a past proposal as a reference. Replaces the
// fixed AI_WEIGHT table that was keyed on user_rating alone. Calibrated so
// existing behaviour is preserved at round star values: 1★→0.05, 2★→0.15,
// 3★→0.40, 4★→0.75, 5★→1.00; unrated but with AI signal gets a reasoned
// value from the AI score; unrated with no AI falls through to a neutral 0.30.
function referenceWeight(project) {
  const { system_pct, source } = computeSystemRating(project);
  if (system_pct === null) return 0.30;
  if (system_pct >= 90) return 1.00;
  if (system_pct >= 75) return 0.85;
  if (system_pct >= 55) return 0.60;
  if (system_pct >= 45) return 0.40;
  if (system_pct >= 30) return 0.20;
  return 0.05;
}

function emptyBreakdown() {
  return { user_pct: null, ai_pct: null, system_pct: null, source: 'none', disagreement: null };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = {
  computeSystemRating,
  systemPct,
  referenceWeight,
  userPct,
  aiPct,
  USER_WEIGHT,
  AI_WEIGHT,
  DISAGREEMENT_THRESHOLD,
};
