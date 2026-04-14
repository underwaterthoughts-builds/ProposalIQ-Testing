import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { analyseWinPatterns } from '../../lib/gemini';
import { safe } from '../../lib/embeddings';
import path from 'path';
import fs from 'fs';

// ── Win-pattern analysis endpoint ─────────────────────────────────────────
// GET  → return cached analysis (never calls the AI; just aggregates stats
//        from DB and returns the last cached ai_patterns if present)
// POST → force-refresh (re-runs analyseWinPatterns)
//
// Scope is selected via `?scope=workspace` or `?scope=repository`
// (default=repository for back-compat). Workspace scope filters to the
// caller's curated `user_workspace_projects` set; if empty, falls back
// to repository so the result is never empty.
//
// Cache is keyed per (scope, user) so a user's workspace analysis doesn't
// leak into another user's, and the global repo analysis is shared.

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_TTL_MS = 6 * 3600 * 1000;

function cachePath(scope, userId) {
  const safeId = (userId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `win_patterns_cache_${scope}_${safeId}.json`);
}

function readCache(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
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

async function handler(req, res) {
  const forceRefresh = req.method === 'POST';
  const requestedScope = (req.query?.scope || '').toString().toLowerCase();
  const userId = req.user?.id || null;

  let db;
  try { db = getDb(); } catch (e) {
    return res.status(200).json({ summary: { total: 0, won: 0, lost: 0, win_rate: 0 }, generated_at: new Date().toISOString(), scope: 'repository' });
  }

  // Resolve scope. Workspace falls back to repository when the user has no
  // workspace selections so the view is never mysteriously empty.
  let scope = requestedScope === 'workspace' ? 'workspace' : 'repository';
  let workspaceIds = null;
  if (scope === 'workspace' && userId) {
    const rows = db.prepare('SELECT project_id FROM user_workspace_projects WHERE user_id = ?').all(userId);
    if (rows.length === 0) {
      scope = 'repository';
    } else {
      workspaceIds = new Set(rows.map(r => r.project_id));
    }
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

  if (workspaceIds) {
    allProjects = allProjects.filter(p => workspaceIds.has(p.id));
  }

  const won = allProjects.filter(p => p.outcome === 'won');
  const lost = allProjects.filter(p => p.outcome === 'lost');

  const byRating = [1, 2, 3, 4, 5].map(r => {
    const rated = allProjects.filter(p => p.user_rating === r && ['won', 'lost'].includes(p.outcome));
    return {
      rating: r,
      count: allProjects.filter(p => p.user_rating === r).length,
      win_rate: rated.length ? Math.round(rated.filter(p => p.outcome === 'won').length / rated.length * 100) : null,
    };
  });

  const bySector = {};
  allProjects.filter(p => ['won', 'lost'].includes(p.outcome) && p.sector).forEach(p => {
    if (!bySector[p.sector]) bySector[p.sector] = { won: 0, lost: 0 };
    bySector[p.sector][p.outcome]++;
  });
  const sectorStats = Object.entries(bySector)
    .map(([sector, v]) => ({ sector, won: v.won, lost: v.lost, win_rate: Math.round(v.won / (v.won + v.lost) * 100) }))
    .sort((a, b) => b.win_rate - a.win_rate);

  // Per-client aggregation — helps spot "always lose to X" or concentration
  const byClient = {};
  allProjects.filter(p => ['won', 'lost'].includes(p.outcome) && p.client).forEach(p => {
    if (!byClient[p.client]) byClient[p.client] = { won: 0, lost: 0 };
    byClient[p.client][p.outcome]++;
  });
  const clientStats = Object.entries(byClient)
    .map(([client, v]) => ({ client, won: v.won, lost: v.lost, total: v.won + v.lost, win_rate: Math.round(v.won / (v.won + v.lost) * 100) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 25);

  const avgScore = (projects, key) => {
    const vals = projects.map(p => p.ai_metadata?.[key]?.overall_score).filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  const wonScores = won.length ? {
    writing: avgScore(won, 'writing_quality'),
    approach: avgScore(won, 'approach_quality'),
    credibility: avgScore(won, 'credibility_signals'),
  } : null;
  const lostScores = lost.length ? {
    writing: avgScore(lost, 'writing_quality'),
    approach: avgScore(lost, 'approach_quality'),
    credibility: avgScore(lost, 'credibility_signals'),
  } : null;

  const total = allProjects.length;

  // Load org profile singleton so the AI grounds patterns in what the org
  // actually offers, rather than treating proposals as context-free text.
  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row?.confirmed_profile) {
      try { orgProfile = { ...row, confirmed_profile: JSON.parse(row.confirmed_profile) }; }
      catch { orgProfile = row; }
    }
  } catch {}

  // Only call AI on forced refresh with enough data. A single-scope run
  // costs roughly $0.05–$0.15 on OpenAI, so the CTA-driven flow keeps
  // spend bounded.
  let aiPatterns = null;
  if (forceRefresh && won.length >= 2) {
    try {
      aiPatterns = await analyseWinPatterns(won, lost, { orgProfile, sectorStats, clientStats, scope });
    } catch (e) { console.error('Win pattern AI error:', e.message); }
  }

  const result = {
    generated_at: new Date().toISOString(),
    scope,
    summary: {
      total,
      won: won.length,
      lost: lost.length,
      win_rate: won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0,
    },
    by_rating: byRating,
    by_sector: sectorStats,
    by_client: clientStats,
    quality_scores: { won: wonScores, lost: lostScores },
    ai_patterns: aiPatterns,
    health: {
      total_projects: total,
      learning_history_coverage: total ? Math.round(allProjects.filter(p => p.lh_status === 'complete').length / total * 100) : 0,
      writing_analysis_coverage: total ? Math.round(allProjects.filter(p => p.ai_metadata?.writing_quality?.overall_score > 0).length / total * 100) : 0,
    },
  };

  writeCache(file, result);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json(result);
}

export default requireAuth(handler);
