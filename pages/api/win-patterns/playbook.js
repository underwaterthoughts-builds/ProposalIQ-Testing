import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { generateInsightPlaybook } from '../../../lib/gemini';
import { safe } from '../../../lib/embeddings';
import { systemPct } from '../../../lib/rating';

// POST /api/win-patterns/playbook
// Body: { scope?: 'workspace'|'repository', weakness: { title, evidence, remedy } }
//
// Picks the 6 most relevant won proposals from the caller's scope to anchor
// the playbook against, collects a sample of winning language snippets from
// the same proposals, and asks the AI to produce a concrete, referenced
// one-page playbook. Heavier than the portfolio analysis (~$0.05–$0.10 per
// call), so not cached — each call reflects the latest data and the exact
// weakness the user clicked on.

function scoreRelevance(project, weakness) {
  // Rank won proposals by how well they match the weakness. Strings match by
  // substring inclusion against title + evidence; higher rating wins ties.
  const needle = `${weakness.title || ''} ${weakness.evidence || ''} ${weakness.pattern || ''}`.toLowerCase();
  if (!needle.trim()) return project.user_rating || 0;
  const meta = project.ai_metadata || {};
  const hay = [
    project.name, project.sector, project.service_industry, project.client_industry,
    ...(meta.key_themes || []), ...(meta.methodologies || []),
    ...(meta.win_indicators || []), project.description || '',
  ].join(' ').toLowerCase();
  // System rating (0-100) weighted like a /5 score — replaces raw stars
  // so highly-rated-but-thin proposals don't rank ahead of well-evidenced ones.
  const sys = systemPct(project);
  let score = (sys ?? 0) / 10; // ~10 = 5★ equivalent under old scheme
  for (const token of needle.split(/\W+/).filter(t => t.length >= 4)) {
    if (hay.includes(token)) score += 1;
  }
  return score;
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const weakness = body.weakness || {};
  if (!weakness.title && !weakness.pattern) {
    return res.status(400).json({ error: 'weakness.title or weakness.pattern required' });
  }

  const userId = req.user?.id || null;
  const requestedScope = (body.scope || '').toLowerCase();
  let scope = requestedScope === 'workspace' ? 'workspace' : 'repository';
  let workspaceIds = null;
  if (scope === 'workspace' && userId) {
    const rows = db.prepare('SELECT project_id FROM user_workspace_projects WHERE user_id = ?').all(userId);
    if (rows.length === 0) scope = 'repository';
    else workspaceIds = new Set(rows.map(r => r.project_id));
  } else if (scope === 'workspace') {
    scope = 'repository';
  }

  let wonProjects = [];
  try {
    wonProjects = db.prepare(
      "SELECT id, name, client, sector, contract_value, user_rating, ai_metadata, service_industry, client_industry, description FROM projects WHERE outcome = 'won' AND indexing_status = 'complete'"
    ).all().map(p => ({ ...p, ai_metadata: safe(p.ai_metadata, {}) }));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load projects: ' + e.message });
  }
  if (workspaceIds) wonProjects = wonProjects.filter(p => workspaceIds.has(p.id));
  if (wonProjects.length === 0) {
    return res.status(200).json({
      playbook: null,
      message: 'No won proposals on record in this scope — playbook generation needs reference material.',
    });
  }

  const ranked = wonProjects
    .map(p => ({ p, score: scoreRelevance(p, weakness) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(x => x.p);

  // Pull winning language from the latest scan(s) that cite these projects.
  // We read winning_language from the most recent scans and filter to
  // snippets whose source project is in the picked references.
  const refIds = new Set(ranked.map(p => p.id));
  let winningLanguage = [];
  try {
    const rows = db.prepare(
      "SELECT winning_language FROM rfp_scans WHERE winning_language IS NOT NULL AND winning_language != '[]' ORDER BY created_at DESC LIMIT 20"
    ).all();
    for (const row of rows) {
      const arr = safe(row.winning_language, []);
      for (const l of Array.isArray(arr) ? arr : []) {
        if (winningLanguage.length >= 20) break;
        const src = l?.source_project_id || l?.project_id;
        if (src && refIds.has(src)) winningLanguage.push(l);
      }
      if (winningLanguage.length >= 20) break;
    }
  } catch (e) { console.warn('winningLanguage load failed:', e.message); }

  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row?.confirmed_profile) {
      try { orgProfile = { ...row, confirmed_profile: JSON.parse(row.confirmed_profile) }; }
      catch { orgProfile = row; }
    }
  } catch {}

  let playbook = null;
  try {
    playbook = await generateInsightPlaybook(weakness, ranked, winningLanguage, orgProfile);
  } catch (e) {
    return res.status(500).json({ error: 'Playbook generation failed: ' + e.message });
  }

  return res.status(200).json({
    generated_at: new Date().toISOString(),
    scope,
    weakness,
    playbook,
    references: ranked.map(p => ({ id: p.id, name: p.name, client: p.client })),
    language_sample_size: winningLanguage.length,
  });
}

export default requireAuth(handler);
