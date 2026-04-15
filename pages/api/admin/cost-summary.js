import { getDb } from '../../../lib/db';
import { requireAdmin } from '../../../lib/auth';

// GET /api/admin/cost-summary?days=30
// Aggregates ai_cost_log into headline numbers for the admin dashboard:
// total spend, spend by category, spend by model, spend by day, top
// scans / projects by spend. Window defaults to 30 days; caller can
// request 7 / 30 / 90.
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const db = getDb();
  const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 365));
  const since = `datetime('now', '-${days} days')`;

  function safeQ(label, sql) {
    try { return db.prepare(sql).all(); } catch (e) {
      console.error(`[admin/cost-summary] ${label}:`, e.message);
      return [];
    }
  }
  function safeOne(label, sql) {
    try { return db.prepare(sql).get() || {}; } catch (e) {
      console.error(`[admin/cost-summary] ${label}:`, e.message);
      return {};
    }
  }

  const totals = safeOne('totals', `
    SELECT
      COUNT(*) AS calls,
      COALESCE(SUM(estimated_cost), 0) AS total_cost,
      COALESCE(SUM(input_tokens), 0)  AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS total_output_tokens
    FROM ai_cost_log
    WHERE created_at >= ${since}
  `);

  const byCategory = safeQ('byCategory', `
    SELECT category, COUNT(*) AS calls, ROUND(SUM(estimated_cost), 4) AS cost
    FROM ai_cost_log
    WHERE created_at >= ${since}
    GROUP BY category
    ORDER BY cost DESC
  `);

  const byModel = safeQ('byModel', `
    SELECT model, COUNT(*) AS calls, ROUND(SUM(estimated_cost), 4) AS cost,
      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
    FROM ai_cost_log
    WHERE created_at >= ${since}
    GROUP BY model
    ORDER BY cost DESC
  `);

  const byDay = safeQ('byDay', `
    SELECT date(created_at) AS day, COUNT(*) AS calls, ROUND(SUM(estimated_cost), 4) AS cost
    FROM ai_cost_log
    WHERE created_at >= ${since}
    GROUP BY date(created_at)
    ORDER BY day DESC
  `);

  const topScans = safeQ('topScans', `
    SELECT al.scan_id, ROUND(SUM(al.estimated_cost), 4) AS cost, COUNT(*) AS calls,
      rs.name AS scan_name
    FROM ai_cost_log al
    LEFT JOIN rfp_scans rs ON rs.id = al.scan_id
    WHERE al.created_at >= ${since} AND al.scan_id IS NOT NULL
    GROUP BY al.scan_id
    ORDER BY cost DESC
    LIMIT 10
  `);

  const topProjects = safeQ('topProjects', `
    SELECT al.project_id, ROUND(SUM(al.estimated_cost), 4) AS cost, COUNT(*) AS calls,
      p.name AS project_name
    FROM ai_cost_log al
    LEFT JOIN projects p ON p.id = al.project_id
    WHERE al.created_at >= ${since} AND al.project_id IS NOT NULL
    GROUP BY al.project_id
    ORDER BY cost DESC
    LIMIT 10
  `);

  return res.status(200).json({
    window_days: days,
    totals,
    by_category: byCategory,
    by_model: byModel,
    by_day: byDay,
    top_scans: topScans,
    top_projects: topProjects,
  });
}

export default requireAdmin(handler);
