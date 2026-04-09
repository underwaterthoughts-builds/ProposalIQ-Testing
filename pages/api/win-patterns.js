import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { analyseWinPatterns } from '../../lib/gemini';
import { safe } from '../../lib/embeddings';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_PATH = path.join(DATA_DIR, 'win_patterns_cache.json');
const CACHE_TTL_MS = 6 * 3600 * 1000;

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (Date.now() - new Date(data.generated_at).getTime() < CACHE_TTL_MS) return data;
  } catch {}
  return null;
}

function writeCache(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Cache write error:', e.message); }
}

async function handler(req, res) {
  const forceRefresh = req.method === 'POST';
  if (forceRefresh) { try { fs.unlinkSync(CACHE_PATH); } catch {} }

  const cached = readCache();
  if (cached) return res.status(200).json(cached);

  let db;
  try { db = getDb(); } catch (e) {
    return res.status(200).json({ summary: { total: 0, won: 0, lost: 0, win_rate: 0 }, generated_at: new Date().toISOString() });
  }

  let allProjects = [];
  try {
    allProjects = db.prepare(
      "SELECT id, name, outcome, sector, contract_value, user_rating, ai_metadata, kqs_composite, lh_status FROM projects WHERE indexing_status = 'complete'"
    ).all().map(p => ({ ...p, ai_metadata: safe(p.ai_metadata, {}) }));
  } catch (e) {
    return res.status(200).json({ summary: { total: 0, won: 0, lost: 0, win_rate: 0 }, generated_at: new Date().toISOString() });
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

  // Only call Gemini AI on forced refresh with enough data
  let aiPatterns = null;
  if (forceRefresh && won.length >= 2) {
    try { aiPatterns = await analyseWinPatterns(won, lost); }
    catch (e) { console.error('Win pattern AI error:', e.message); }
  }

  const result = {
    generated_at: new Date().toISOString(),
    summary: {
      total,
      won: won.length,
      lost: lost.length,
      win_rate: won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0,
    },
    by_rating: byRating,
    by_sector: sectorStats,
    quality_scores: { won: wonScores, lost: lostScores },
    ai_patterns: aiPatterns,
    health: {
      total_projects: total,
      learning_history_coverage: total ? Math.round(allProjects.filter(p => p.lh_status === 'complete').length / total * 100) : 0,
      writing_analysis_coverage: total ? Math.round(allProjects.filter(p => p.ai_metadata?.writing_quality?.overall_score > 0).length / total * 100) : 0,
    },
  };

  writeCache(result);
  return res.status(200).json(result);
}

export default requireAuth(handler);
