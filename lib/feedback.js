// ────────────────────────────────────────────────────────────────────────────
// Feedback loop helpers — derive recommendation performance from usage
// events + scan outcomes.
//
// Purpose: turn "we recommended X and user did Y" into a signal that biases
// future recommendations. The ranking layer reads these helpers to add a
// small boost for proposals/snippets that have actually been used in
// winning bids.
//
// Design notes:
// - Derived on-the-fly from scan_usage_events JOIN scan_outcomes. No
//   materialised table — keeps it simple, query is cheap.
// - Boost is intentionally small so it can never override semantic +
//   taxonomy match. Compounds gradually as evidence accumulates.
// - "Used in winning bid" requires BOTH (a) a usage event AND (b) the
//   scan outcome marked as 'won'. We never assume a recommendation was
//   used just because the bid won.
// ────────────────────────────────────────────────────────────────────────────

const { getDb } = require('./db');

// Returns a Map<projectId, { used_count, won_count, last_used }>
// representing how often each project has been used in past scans, with
// breakdown by outcome.
function getProjectUsageStats(db = null) {
  const _db = db || getDb();
  try {
    const rows = _db.prepare(`
      SELECT
        u.target_id AS project_id,
        COUNT(*) AS used_count,
        SUM(CASE WHEN o.outcome = 'won' THEN 1 ELSE 0 END) AS won_count,
        MAX(u.created_at) AS last_used
      FROM scan_usage_events u
      LEFT JOIN scan_outcomes o ON o.scan_id = u.scan_id
      WHERE u.target_type = 'project'
        AND u.target_id IS NOT NULL
      GROUP BY u.target_id
    `).all();

    const stats = new Map();
    for (const r of rows) {
      stats.set(r.project_id, {
        used_count: r.used_count || 0,
        won_count: r.won_count || 0,
        last_used: r.last_used || null,
      });
    }
    return stats;
  } catch (e) {
    console.error('getProjectUsageStats:', e.message);
    return new Map();
  }
}

// Compute the feedback boost for a single project. Returns 0 if no
// usage history, scaled up to a max of 0.08 with diminishing returns.
//
// Intentionally small so it nudges close-tier matches but never crosses
// tier walls. Tier match is still the primary ordering signal.
function projectFeedbackBoost(stats) {
  if (!stats) return 0;
  const used = stats.used_count || 0;
  const won = stats.won_count || 0;
  // Used in any past scan: +0.01 per use, capped at +0.04
  const useBoost = Math.min(used * 0.01, 0.04);
  // Used in WINNING bid: +0.02 per win, capped at +0.04
  const winBoost = Math.min(won * 0.02, 0.04);
  return useBoost + winBoost;
}

// Snippet usage — same idea but keyed on a hash of the snippet text
// (since snippets don't have stable IDs). Used by extractWinningLanguage
// to prefer snippets that have actually been copied/inserted before.
function getSnippetUsageStats(db = null) {
  const _db = db || getDb();
  try {
    const rows = _db.prepare(`
      SELECT
        u.target_id AS snippet_hash,
        COUNT(*) AS used_count,
        SUM(CASE WHEN o.outcome = 'won' THEN 1 ELSE 0 END) AS won_count
      FROM scan_usage_events u
      LEFT JOIN scan_outcomes o ON o.scan_id = u.scan_id
      WHERE u.target_type = 'snippet'
        AND u.target_id IS NOT NULL
      GROUP BY u.target_id
    `).all();

    const stats = new Map();
    for (const r of rows) {
      stats.set(r.snippet_hash, {
        used_count: r.used_count || 0,
        won_count: r.won_count || 0,
      });
    }
    return stats;
  } catch (e) {
    return new Map();
  }
}

// Cheap stable hash for snippet text — used as the target_id key for
// snippet usage events. Same text → same hash, regardless of context.
function snippetHash(text) {
  if (!text) return null;
  // Strip whitespace + lowercase, then take first 64 chars + length as suffix
  const normalised = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  return normalised.slice(0, 64) + ':' + normalised.length;
}

// Aggregate stats for a single scan — what was used, how often, what
// outcome the scan reached. Used for the outcome capture form to show
// "you copied 3 snippets and exported 1 briefing pack" before asking
// the user to confirm what was useful.
function getScanUsageSummary(scanId, db = null) {
  const _db = db || getDb();
  try {
    const rows = _db.prepare(`
      SELECT event_type, COUNT(*) AS n
      FROM scan_usage_events
      WHERE scan_id = ?
      GROUP BY event_type
    `).all(scanId);
    const summary = {};
    for (const r of rows) summary[r.event_type] = r.n;
    return summary;
  } catch (e) {
    return {};
  }
}

// Insert a usage event. Idempotent for duplicate clicks within ~5s
// (same scan_id + event_type + target_id combo).
function logUsageEvent({ scanId, eventType, targetType = null, targetId = null, payload = null, userId = null }, db = null) {
  if (!scanId || !eventType) return false;
  const _db = db || getDb();
  try {
    const { v4: uuid } = require('uuid');
    // Dedupe within 5s — prevents double-click noise
    if (targetId) {
      const recent = _db.prepare(`
        SELECT id FROM scan_usage_events
        WHERE scan_id = ? AND event_type = ? AND target_id = ?
          AND datetime(created_at) >= datetime('now', '-5 seconds')
        LIMIT 1
      `).get(scanId, eventType, targetId);
      if (recent) return false;
    }
    _db.prepare(`
      INSERT INTO scan_usage_events (id, scan_id, event_type, target_type, target_id, payload, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), scanId, eventType, targetType, targetId,
      JSON.stringify(payload || {}), userId || null
    );
    return true;
  } catch (e) {
    console.error('logUsageEvent:', e.message);
    return false;
  }
}

module.exports = {
  getProjectUsageStats,
  projectFeedbackBoost,
  getSnippetUsageStats,
  snippetHash,
  getScanUsageSummary,
  logUsageEvent,
};
