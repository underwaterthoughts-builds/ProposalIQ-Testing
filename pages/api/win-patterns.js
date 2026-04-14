import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { analyseWinPatterns } from '../../lib/gemini';
import { safe } from '../../lib/embeddings';
import path from 'path';
import fs from 'fs';

// ── Organisation-level Overview & Insights endpoint ───────────────────────
// GET  → return cached analysis (never calls the AI; always returns fresh
//        deterministic aggregates but the cached AI pass if one exists)
// POST → force-refresh (re-runs deterministic aggregates and analyseWinPatterns)
//
// Scope is selected via `?scope=workspace|repository` (default repository).
// Workspace filters to the caller's curated user_workspace_projects set;
// empty workspace silently falls back to repository so the view is never
// mysteriously empty.
//
// Cache keyed per (scope, user). Workspace caches are per-user; repository
// cache is shared because the analysis is global by definition.

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_TTL_MS = 6 * 3600 * 1000;
// Bump when the response shape changes so the client never receives an
// old payload that's missing keys it depends on.
const CACHE_VERSION = 2;

function cachePath(scope, userId) {
  const safeId = (userId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `win_patterns_cache_${scope}_${safeId}.json`);
}

function readCache(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Reject caches from an older schema — their shape will crash the UI.
    if (data.cache_version !== CACHE_VERSION) return null;
    if (Date.now() - new Date(data.generated_at).getTime() < CACHE_TTL_MS) return data;
  } catch {}
  return null;
}

function writeCache(file, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Cache write error:', e.message); }
}

// ── Aggregation helpers ───────────────────────────────────────────────────

function groupBy(projects, keyFn) {
  const map = {};
  for (const p of projects) {
    if (!['won', 'lost'].includes(p.outcome)) continue;
    const k = keyFn(p);
    if (!k) continue;
    if (!map[k]) map[k] = { won: 0, lost: 0 };
    map[k][p.outcome]++;
  }
  return Object.entries(map)
    .map(([name, v]) => ({ name, won: v.won, lost: v.lost, total: v.won + v.lost, win_rate: Math.round(v.won / (v.won + v.lost) * 100) }))
    .sort((a, b) => b.total - a.total);
}

function valueBand(v) {
  if (!v || v <= 0) return 'unspecified';
  if (v < 100_000) return '<100K';
  if (v < 500_000) return '100K–500K';
  if (v < 2_000_000) return '500K–2M';
  if (v < 10_000_000) return '2M–10M';
  return '10M+';
}

// Herfindahl–Hirschman index over wins, normalised to 0–1. 1.0 means every
// win came from one client; 0 means perfectly evenly distributed.
function concentrationHHI(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const sumSq = counts.reduce((a, c) => a + Math.pow(c / total, 2), 0);
  return Math.round(sumSq * 1000) / 1000;
}

async function handler(req, res) {
  const forceRefresh = req.method === 'POST';
  const requestedScope = (req.query?.scope || '').toString().toLowerCase();
  const userId = req.user?.id || null;

  let db;
  try { db = getDb(); } catch (e) {
    return res.status(200).json({ summary: { total: 0, won: 0, lost: 0, win_rate: 0 }, generated_at: new Date().toISOString(), scope: 'repository' });
  }

  let scope = requestedScope === 'workspace' ? 'workspace' : 'repository';
  let workspaceIds = null;
  if (scope === 'workspace' && userId) {
    const rows = db.prepare('SELECT project_id FROM user_workspace_projects WHERE user_id = ?').all(userId);
    if (rows.length === 0) scope = 'repository';
    else workspaceIds = new Set(rows.map(r => r.project_id));
  } else if (scope === 'workspace') {
    scope = 'repository';
  }

  const file = cachePath(scope, scope === 'workspace' ? userId : null);
  if (forceRefresh) { try { fs.unlinkSync(file); } catch {} }

  const cached = readCache(file);
  if (cached) {
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(cached);
  }

  let allProjects = [];
  try {
    allProjects = db.prepare(
      "SELECT id, name, client, outcome, sector, contract_value, currency, user_rating, ai_metadata, kqs_composite, lh_status, service_industry, client_industry, date_submitted FROM projects WHERE indexing_status = 'complete'"
    ).all().map(p => ({ ...p, ai_metadata: safe(p.ai_metadata, {}) }));
  } catch (e) {
    return res.status(200).json({ summary: { total: 0, won: 0, lost: 0, win_rate: 0 }, generated_at: new Date().toISOString(), scope });
  }

  if (workspaceIds) allProjects = allProjects.filter(p => workspaceIds.has(p.id));

  const won = allProjects.filter(p => p.outcome === 'won');
  const lost = allProjects.filter(p => p.outcome === 'lost');
  const decided = [...won, ...lost];
  const total = allProjects.length;

  // ── Outcome aggregates (deterministic) ──────────────────────────────────
  const byRating = [1, 2, 3, 4, 5].map(r => {
    const rated = allProjects.filter(p => p.user_rating === r && ['won', 'lost'].includes(p.outcome));
    return {
      rating: r,
      count: allProjects.filter(p => p.user_rating === r).length,
      win_rate: rated.length ? Math.round(rated.filter(p => p.outcome === 'won').length / rated.length * 100) : null,
    };
  });

  const bySector = groupBy(allProjects, p => p.sector).map(r => ({ sector: r.name, won: r.won, lost: r.lost, win_rate: r.win_rate }));
  const byClient = groupBy(allProjects, p => p.client).slice(0, 25).map(r => ({ client: r.name, ...r }));
  const byServiceIndustry = groupBy(allProjects, p => p.service_industry).map(r => ({ industry: r.name, won: r.won, lost: r.lost, total: r.total, win_rate: r.win_rate }));
  const byClientIndustry = groupBy(allProjects, p => p.client_industry).map(r => ({ industry: r.name, won: r.won, lost: r.lost, total: r.total, win_rate: r.win_rate }));
  const byValueBand = groupBy(allProjects, p => valueBand(p.contract_value)).map(r => {
    const sample = decided.filter(p => valueBand(p.contract_value) === r.name);
    const avg = sample.length ? Math.round(sample.reduce((a, p) => a + (p.contract_value || 0), 0) / sample.length) : 0;
    return { band: r.name, won: r.won, lost: r.lost, total: r.total, win_rate: r.win_rate, avg_value: avg };
  });
  const byYear = groupBy(allProjects, p => (p.date_submitted || '').slice(0, 4) || null).map(r => ({ year: r.name, won: r.won, lost: r.lost, total: r.total, win_rate: r.win_rate }));

  // ── Concentration ───────────────────────────────────────────────────────
  // HHI is a standard measure of client concentration. We also expose top-1
  // and top-3 client share so the UI can narrate concentration risk plainly.
  const wonCounts = {};
  for (const p of won) { if (p.client) wonCounts[p.client] = (wonCounts[p.client] || 0) + 1; }
  const wonValues = Object.values(wonCounts).sort((a, b) => b - a);
  const wonTotal = won.length;
  const wonSectorCounts = {};
  for (const p of won) { if (p.sector) wonSectorCounts[p.sector] = (wonSectorCounts[p.sector] || 0) + 1; }
  const wonSectorValues = Object.values(wonSectorCounts).sort((a, b) => b - a);
  const concentration = {
    client_hhi: concentrationHHI(wonValues),
    top_client_pct: wonTotal ? Math.round(((wonValues[0] || 0) / wonTotal) * 100) : 0,
    top3_client_pct: wonTotal ? Math.round((wonValues.slice(0, 3).reduce((a, b) => a + b, 0) / wonTotal) * 100) : 0,
    top_sector_pct: wonTotal ? Math.round(((wonSectorValues[0] || 0) / wonTotal) * 100) : 0,
    distinct_winning_clients: wonValues.length,
    distinct_winning_sectors: wonSectorValues.length,
  };

  // ── Quality scores ──────────────────────────────────────────────────────
  const avgScore = (projects, key) => {
    const vals = projects.map(p => p.ai_metadata?.[key]?.overall_score).filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const wonScores = won.length ? { writing: avgScore(won, 'writing_quality'), approach: avgScore(won, 'approach_quality'), credibility: avgScore(won, 'credibility_signals') } : null;
  const lostScores = lost.length ? { writing: avgScore(lost, 'writing_quality'), approach: avgScore(lost, 'approach_quality'), credibility: avgScore(lost, 'credibility_signals') } : null;

  // ── Capability intelligence ─────────────────────────────────────────────
  // Frequent gaps across all RFP scans: clusters the same requirement type
  // showing up repeatedly as unaddressed across bids. Heuristic grouping by
  // lowercased category + first 40 chars of the gap description — enough
  // signal to cluster obvious repeats without a second AI pass.
  let frequentGaps = [];
  try {
    const scanRows = db.prepare("SELECT gaps FROM rfp_scans WHERE gaps IS NOT NULL AND gaps != '[]' AND status IN ('complete', 'fast_ready', 'deep_failed')").all();
    const gapFreq = {};
    for (const row of scanRows) {
      const gaps = safe(row.gaps, []);
      const seen = new Set();
      for (const g of Array.isArray(gaps) ? gaps : []) {
        const cat = (g?.category || g?.title || '').toLowerCase().trim();
        const desc = (g?.description || g?.detail || '').toLowerCase().slice(0, 50).trim();
        const key = (cat || desc).slice(0, 60);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!gapFreq[key]) gapFreq[key] = { key, label: g?.category || g?.title || g?.description?.slice(0, 60) || 'unlabelled', count: 0, impact: g?.impact || null, sample_description: g?.description || '' };
        gapFreq[key].count++;
      }
    }
    frequentGaps = Object.values(gapFreq).filter(g => g.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);
  } catch (e) { console.warn('frequentGaps aggregation failed:', e.message); }

  // Winning methodologies: count how often each named methodology/framework
  // appears in ai_metadata for won vs lost proposals. Low-effort proxy for
  // "what approaches correlate with wins".
  let topMethodologies = [];
  try {
    const methoCount = {};
    const bump = (arr, outcome) => {
      for (const m of Array.isArray(arr) ? arr : []) {
        const k = String(m).trim();
        if (!k) continue;
        if (!methoCount[k]) methoCount[k] = { name: k, won: 0, lost: 0 };
        methoCount[k][outcome]++;
      }
    };
    for (const p of won) bump(p.ai_metadata?.methodologies, 'won');
    for (const p of lost) bump(p.ai_metadata?.methodologies, 'lost');
    topMethodologies = Object.values(methoCount)
      .filter(m => m.won + m.lost >= 2)
      .map(m => ({ ...m, total: m.won + m.lost, win_rate: Math.round((m.won / (m.won + m.lost)) * 100) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  } catch (e) { console.warn('topMethodologies aggregation failed:', e.message); }

  // Team presence on wins: who shows up on winning bids most?
  let teamOnWins = [];
  try {
    const scopeFilter = workspaceIds ? ` AND p.id IN (${[...workspaceIds].map(() => '?').join(',')})` : '';
    const params = workspaceIds ? [...workspaceIds] : [];
    const rows = db.prepare(`
      SELECT tm.id, tm.name, tm.title, p.outcome, COUNT(*) as appearances
      FROM project_team pt
      JOIN team_members tm ON tm.id = pt.member_id
      JOIN projects p ON p.id = pt.project_id
      WHERE p.indexing_status = 'complete' AND p.outcome IN ('won', 'lost')${scopeFilter}
      GROUP BY tm.id, p.outcome
    `).all(...params);
    const agg = {};
    for (const r of rows) {
      if (!agg[r.id]) agg[r.id] = { id: r.id, name: r.name, title: r.title, won: 0, lost: 0 };
      agg[r.id][r.outcome] = r.appearances;
    }
    teamOnWins = Object.values(agg)
      .map(t => ({ ...t, total: t.won + t.lost, win_rate: t.won + t.lost > 0 ? Math.round((t.won / (t.won + t.lost)) * 100) : 0 }))
      .filter(t => t.total >= 2)
      .sort((a, b) => b.won - a.won || b.total - a.total)
      .slice(0, 15);
  } catch (e) { console.warn('teamOnWins aggregation failed:', e.message); }

  const capability = {
    frequent_gaps: frequentGaps,
    top_methodologies: topMethodologies,
    team_on_wins: teamOnWins,
  };

  // ── Confidence ──────────────────────────────────────────────────────────
  // Communicates to the UI (and to the AI) when the sample is too thin to
  // trust the results. Callers should render caveats accordingly.
  const confidenceReasons = [];
  let confidenceLevel = 'high';
  if (won.length < 5) { confidenceReasons.push(`Only ${won.length} won ${won.length === 1 ? 'proposal' : 'proposals'} — patterns are directional at best.`); confidenceLevel = 'low'; }
  else if (won.length < 10) { confidenceReasons.push(`${won.length} won proposals — patterns are useful but not strongly validated.`); confidenceLevel = 'medium'; }
  if (lost.length < 3) { confidenceReasons.push(`${lost.length} lost ${lost.length === 1 ? 'proposal' : 'proposals'} on record — loss-side insight is limited.`); confidenceLevel = confidenceLevel === 'high' ? 'medium' : 'low'; }
  const decidedPct = total ? Math.round(((won.length + lost.length) / total) * 100) : 0;
  if (decidedPct < 50 && total >= 5) { confidenceReasons.push(`${100 - decidedPct}% of projects have no recorded outcome — mark more as won/lost/withdrawn for better patterns.`); }
  const writingCov = total ? Math.round(allProjects.filter(p => p.ai_metadata?.writing_quality?.overall_score > 0).length / total * 100) : 0;
  if (writingCov < 50 && total >= 5) confidenceReasons.push(`Only ${writingCov}% of projects have writing-quality analysis — re-index older projects to unlock language insights.`);

  // ── Org profile ─────────────────────────────────────────────────────────
  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row?.confirmed_profile) {
      try { orgProfile = { ...row, confirmed_profile: JSON.parse(row.confirmed_profile) }; }
      catch { orgProfile = row; }
    }
  } catch {}

  // ── AI pass (opt-in via POST) ───────────────────────────────────────────
  let aiPatterns = null;
  if (forceRefresh && won.length >= 2) {
    try {
      aiPatterns = await analyseWinPatterns(won, lost, {
        orgProfile,
        sectorStats: bySector,
        clientStats: byClient,
        scope,
        capability,
        confidenceLevel,
      });
    } catch (e) { console.error('Win pattern AI error:', e.message); }
  }

  const result = {
    cache_version: CACHE_VERSION,
    generated_at: new Date().toISOString(),
    scope,
    summary: {
      total,
      won: won.length,
      lost: lost.length,
      decided: won.length + lost.length,
      win_rate: won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0,
    },
    outcomes: {
      by_rating: byRating,
      by_sector: bySector,
      by_client: byClient,
      by_service_industry: byServiceIndustry,
      by_client_industry: byClientIndustry,
      by_value_band: byValueBand,
      by_year: byYear,
    },
    concentration,
    quality_scores: { won: wonScores, lost: lostScores },
    capability,
    ai_patterns: aiPatterns,
    confidence: { level: confidenceLevel, reasons: confidenceReasons },
    health: {
      total_projects: total,
      decided_pct: decidedPct,
      learning_history_coverage: total ? Math.round(allProjects.filter(p => p.lh_status === 'complete').length / total * 100) : 0,
      writing_analysis_coverage: writingCov,
    },
    // Back-compat with earlier dashboard consumer (kept while the dashboard
    // card still reads these paths). New UI should use .outcomes.by_sector.
    by_rating: byRating,
    by_sector: bySector,
    by_client: byClient,
  };

  writeCache(file, result);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json(result);
}

export default requireAuth(handler);
