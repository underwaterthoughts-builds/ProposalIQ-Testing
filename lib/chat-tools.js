// ────────────────────────────────────────────────────────────────────────────
// Chat-assistant tool registry. Every tool here is read-only and runs
// scoped to the calling user's tenant — admin sees their own data plus
// every member's data; members see only their own. The chat backend
// at /api/chat/message wires these into Claude via tool-calling.
//
// Adding a new tool = three things:
//   1. JSON schema in TOOLS (Anthropic format)
//   2. handler in TOOL_HANDLERS (async, takes input + ctx)
//   3. system prompt mention if the tool needs explanation
//
// ctx is { user, db } — db handle and tenancy helpers come from
// lib/tenancy.js so every query enforces ownership.
// ────────────────────────────────────────────────────────────────────────────

const { getDb } = require('./db');
const { scope, isAdmin } = require('./tenancy');
const { safe, cosine } = require('./embeddings');

// Anthropic tool schema. The descriptions matter — Claude picks tools
// based on these. Be specific about what each returns and when to use it.
const TOOLS = [
  {
    name: 'list_projects',
    description: "Lists projects in the user's repository. Use when the user asks about their past proposals, won/lost work, or what's in their archive. Returns a slim summary per project (id, name, client, outcome, year, sector, taxonomy). Defaults to 20 results.",
    input_schema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['won', 'lost', 'pending', 'withdrawn'], description: 'Filter to a single outcome' },
        client: { type: 'string', description: 'Substring match on client name' },
        sector: { type: 'string', description: 'Substring match on sector' },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'get_project',
    description: "Returns full details for a single project — name, client, outcome, AI metadata (themes, methodologies, deliverables), what went well, lessons. Use when the user asks about one specific past proposal by name or id.",
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Project UUID' } },
      required: ['id'],
    },
  },
  {
    name: 'search_projects',
    description: "Semantic search across the user's repository — finds projects by meaning, not keywords. Use when the user describes the kind of work they want to find ('brand transformations for energy clients', 'training programs in financial services'). Returns top matches ranked by relevance.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text description of what to search for' },
        limit: { type: 'integer', default: 6 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_scans',
    description: "Lists RFP intelligence scans the user has run. Returns id, name, status, verdict (Bid/Conditional/No Bid), score, and date. Use when the user asks 'show me my recent scans', 'which RFPs did I look at last month', etc.",
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['complete', 'fast_ready', 'processing', 'error'] },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'get_scan',
    description: "Returns full intelligence for a single RFP scan — verdict, score, matched proposals, gaps, win strategy, exec brief. Use when the user asks about a specific scan, wants you to explain the verdict or scoring, or asks 'why did you recommend X for this RFP?'.",
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Scan UUID' } },
      required: ['id'],
    },
  },
  {
    name: 'compare_scans',
    description: "Compares two RFP scans — score deltas, gap overlap, match overlap, taxonomy alignment, win-strategy theme overlap. Use when the user asks 'compare these two RFPs' or 'what changed between scan A and scan B'.",
    input_schema: {
      type: 'object',
      properties: {
        id_a: { type: 'string', description: 'First scan UUID' },
        id_b: { type: 'string', description: 'Second scan UUID' },
      },
      required: ['id_a', 'id_b'],
    },
  },
  {
    name: 'list_team',
    description: "Lists team members on file — names, titles, years experience, specialisms, sectors. Use when the user asks who's on their team, who has X expertise, or 'who would be best for this RFP'.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_clients',
    description: "Lists client profiles with project counts and win/loss tally. Use when the user asks about specific clients, who they've worked with, or where their relationships are strongest.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_dashboard_stats',
    description: "Returns top-line counts and rates: total projects, won/lost, win rate by sector, average rating, scan count. Use when the user asks 'how am I doing overall', 'what's my win rate', 'do I have enough data yet'.",
    input_schema: { type: 'object', properties: {} },
  },
];

// ── HANDLERS ──────────────────────────────────────────────────────────────

async function listProjects(input, { user }) {
  const db = getDb();
  const t = scope(user);
  const where = ['indexing_status = \'complete\''];
  const params = [];
  if (input.outcome) { where.push('outcome = ?'); params.push(input.outcome); }
  if (input.client) { where.push('LOWER(client) LIKE LOWER(?)'); params.push(`%${input.client}%`); }
  if (input.sector) { where.push('LOWER(sector) LIKE LOWER(?)'); params.push(`%${input.sector}%`); }
  const limit = Math.min(parseInt(input.limit || 20, 10), 100);
  const sql = `SELECT id, name, client, sector, outcome, user_rating, contract_value, currency, date_submitted, service_industry, client_industry FROM projects WHERE ${where.join(' AND ')}${t.clause} ORDER BY date_submitted DESC LIMIT ${limit}`;
  const rows = db.prepare(sql).all(...params, ...t.params);
  return { count: rows.length, projects: rows };
}

async function getProject(input, { user }) {
  if (!input.id) return { error: 'id required' };
  const db = getDb();
  const t = scope(user);
  const row = db.prepare(`SELECT id, name, client, sector, outcome, user_rating, contract_value, currency, date_submitted, description, went_well, improvements, lessons, ai_metadata, service_industry, client_industry FROM projects WHERE id = ?${t.clause}`).get(input.id, ...t.params);
  if (!row) return { error: 'Project not found or not accessible' };
  return { ...row, ai_metadata: safe(row.ai_metadata, {}) };
}

async function searchProjects(input, { user }) {
  const { embed } = require('./gemini');
  if (!input.query || !input.query.trim()) return { error: 'query required' };
  const db = getDb();
  const t = scope(user);
  let queryVec = null;
  try { queryVec = await embed(input.query); } catch (e) { return { error: 'embedding failed: ' + e.message }; }
  if (!queryVec) return { error: 'no embedding produced' };
  const candidates = db.prepare(`SELECT id, name, client, sector, outcome, embedding, ai_metadata FROM projects WHERE indexing_status = 'complete' AND embedding IS NOT NULL${t.clause}`).all(...t.params);
  const limit = Math.min(parseInt(input.limit || 6, 10), 20);
  const scored = candidates
    .map(p => {
      const vec = safe(p.embedding, null);
      if (!vec) return null;
      const sim = cosine(queryVec, vec);
      return { id: p.id, name: p.name, client: p.client, sector: p.sector, outcome: p.outcome, ai_metadata: safe(p.ai_metadata, {}), similarity: Math.round(sim * 100) };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return { count: scored.length, results: scored };
}

async function listScans(input, { user }) {
  const db = getDb();
  const t = scope(user);
  const where = [];
  const params = [];
  if (input.status) { where.push('status = ?'); params.push(input.status); }
  const limit = Math.min(parseInt(input.limit || 20, 10), 100);
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}${t.clause}` : `WHERE 1=1${t.clause}`;
  const rows = db.prepare(`SELECT id, name, status, bid_score, created_at FROM rfp_scans ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`).all(...params, ...t.params);
  return {
    count: rows.length,
    scans: rows.map(s => {
      const bs = s.bid_score ? safe(s.bid_score, null) : null;
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        score: bs?.score ?? null,
        decision: bs?.decision ?? null,
        confidence: bs?.confidence ?? null,
        created_at: s.created_at,
      };
    }),
  };
}

async function getScan(input, { user }) {
  if (!input.id) return { error: 'id required' };
  const db = getDb();
  const t = scope(user);
  const row = db.prepare(`SELECT * FROM rfp_scans WHERE id = ?${t.clause}`).get(input.id, ...t.params);
  if (!row) return { error: 'Scan not found or not accessible' };
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    rfp_data: safe(row.rfp_data, {}),
    bid_score: safe(row.bid_score, null),
    matched_proposals: (safe(row.matched_proposals, []) || []).slice(0, 8),
    gaps: safe(row.gaps, []),
    win_strategy: safe(row.win_strategy, null),
    winning_language: (safe(row.winning_language, []) || []).slice(0, 6),
    suggested_approach: safe(row.suggested_approach, null),
    executive_brief: safe(row.executive_brief, null),
    team_suggestions: (safe(row.team_suggestions, []) || []).slice(0, 6),
  };
}

async function compareScans(input, ctx) {
  const a = await getScan({ id: input.id_a }, ctx);
  const b = await getScan({ id: input.id_b }, ctx);
  if (a.error) return { error: `Scan A: ${a.error}` };
  if (b.error) return { error: `Scan B: ${b.error}` };

  const matchIdsA = new Set((a.matched_proposals || []).map(m => m.id));
  const matchIdsB = new Set((b.matched_proposals || []).map(m => m.id));
  const sharedMatchIds = [...matchIdsA].filter(id => matchIdsB.has(id));

  const gapTitlesA = new Set((a.gaps || []).map(g => (g.title || '').toLowerCase().trim()));
  const gapTitlesB = new Set((b.gaps || []).map(g => (g.title || '').toLowerCase().trim()));
  const sharedGapTitles = [...gapTitlesA].filter(t => gapTitlesB.has(t));

  const themesA = new Set(((a.win_strategy?.focus) || []).map(s => s.toLowerCase().trim()));
  const themesB = new Set(((b.win_strategy?.focus) || []).map(s => s.toLowerCase().trim()));
  const sharedThemes = [...themesA].filter(t => themesB.has(t));

  return {
    a: { id: a.id, name: a.name, score: a.bid_score?.score, decision: a.bid_score?.decision, gap_count: (a.gaps || []).length },
    b: { id: b.id, name: b.name, score: b.bid_score?.score, decision: b.bid_score?.decision, gap_count: (b.gaps || []).length },
    score_delta: (b.bid_score?.score ?? 0) - (a.bid_score?.score ?? 0),
    shared_match_count: sharedMatchIds.length,
    shared_match_ids: sharedMatchIds.slice(0, 6),
    shared_gap_count: sharedGapTitles.length,
    shared_gap_titles: sharedGapTitles.slice(0, 6),
    shared_strategy_themes: sharedThemes.slice(0, 6),
    taxonomy_alignment: {
      same_service_industry: a.rfp_data?.service_industry === b.rfp_data?.service_industry,
      same_client_industry: a.rfp_data?.client_industry === b.rfp_data?.client_industry,
    },
  };
}

async function listTeam(input, { user }) {
  const db = getDb();
  const t = scope(user);
  const rows = db.prepare(`SELECT id, name, title, years_experience, stated_specialisms, stated_sectors, day_rate_client, currency FROM team_members WHERE 1=1${t.clause} ORDER BY name`).all(...t.params);
  return {
    count: rows.length,
    members: rows.map(m => ({ ...m, stated_specialisms: safe(m.stated_specialisms, []) })),
  };
}

async function listClients(input, { user }) {
  const db = getDb();
  const t = scope(user);
  const pt = scope(user);
  const clients = db.prepare(`SELECT * FROM client_profiles WHERE 1=1${t.clause} ORDER BY name`).all(...t.params);
  return {
    count: clients.length,
    clients: clients.map(c => {
      const projects = db.prepare(`SELECT outcome FROM projects WHERE LOWER(client) LIKE LOWER(?)${pt.clause}`).all(`%${c.name}%`, ...pt.params);
      const won = projects.filter(p => p.outcome === 'won').length;
      const lost = projects.filter(p => p.outcome === 'lost').length;
      return { id: c.id, name: c.name, sector: c.sector, project_count: projects.length, won, lost };
    }),
  };
}

async function getDashboardStats(input, { user }) {
  const db = getDb();
  const t = scope(user);
  const ts = scope(user);
  const tot = db.prepare(`SELECT COUNT(*) as c FROM projects WHERE indexing_status = 'complete'${t.clause}`).get(...t.params).c;
  const won = db.prepare(`SELECT COUNT(*) as c FROM projects WHERE outcome = 'won'${t.clause}`).get(...t.params).c;
  const lost = db.prepare(`SELECT COUNT(*) as c FROM projects WHERE outcome = 'lost'${t.clause}`).get(...t.params).c;
  const decided = won + lost;
  const winRate = decided ? Math.round((won / decided) * 100) : null;
  const ratingRow = db.prepare(`SELECT AVG(user_rating) as avg FROM projects WHERE user_rating > 0${t.clause}`).get(...t.params);
  const avgRating = ratingRow?.avg ? Math.round(ratingRow.avg * 10) / 10 : null;
  const scanCount = db.prepare(`SELECT COUNT(*) as c FROM rfp_scans WHERE 1=1${ts.clause}`).get(...ts.params).c;

  // Win rate by sector — top 5
  const sectorRows = db.prepare(`SELECT sector, outcome, COUNT(*) as c FROM projects WHERE outcome IN ('won','lost') AND sector IS NOT NULL AND sector != ''${t.clause} GROUP BY sector, outcome`).all(...t.params);
  const sectorMap = {};
  for (const r of sectorRows) {
    if (!sectorMap[r.sector]) sectorMap[r.sector] = { won: 0, lost: 0 };
    sectorMap[r.sector][r.outcome] = r.c;
  }
  const winRateBySector = Object.entries(sectorMap)
    .map(([sector, { won: w, lost: l }]) => ({ sector, won: w, lost: l, win_rate: w + l > 0 ? Math.round((w / (w + l)) * 100) : null }))
    .filter(s => s.win_rate !== null)
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, 5);

  return {
    total_projects: tot,
    won,
    lost,
    decided,
    win_rate: winRate,
    avg_user_rating: avgRating,
    scan_count: scanCount,
    win_rate_by_sector_top5: winRateBySector,
    is_admin: isAdmin(user),
  };
}

const TOOL_HANDLERS = new Map([
  ['list_projects', listProjects],
  ['get_project', getProject],
  ['search_projects', searchProjects],
  ['list_scans', listScans],
  ['get_scan', getScan],
  ['compare_scans', compareScans],
  ['list_team', listTeam],
  ['list_clients', listClients],
  ['get_dashboard_stats', getDashboardStats],
]);

module.exports = { TOOLS, TOOL_HANDLERS };
