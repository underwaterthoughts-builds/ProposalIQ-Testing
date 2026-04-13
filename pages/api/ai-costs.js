import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

// GET /api/ai-costs — returns aggregated AI spending breakdown
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const db = getDb();

  // Total spend
  const total = db.prepare(`
    SELECT
      COALESCE(SUM(estimated_cost), 0) AS total_cost,
      COALESCE(SUM(input_tokens), 0) AS total_input,
      COALESCE(SUM(output_tokens), 0) AS total_output,
      COUNT(*) AS total_calls
    FROM ai_cost_log
  `).get();

  // By category
  const byCategory = db.prepare(`
    SELECT
      category,
      COALESCE(SUM(estimated_cost), 0) AS cost,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COUNT(*) AS calls
    FROM ai_cost_log
    GROUP BY category
    ORDER BY cost DESC
  `).all();

  // By model
  const byModel = db.prepare(`
    SELECT
      model,
      COALESCE(SUM(estimated_cost), 0) AS cost,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COUNT(*) AS calls
    FROM ai_cost_log
    GROUP BY model
    ORDER BY cost DESC
  `).all();

  // Last 7 days daily breakdown
  const daily = db.prepare(`
    SELECT
      DATE(created_at) AS day,
      COALESCE(SUM(estimated_cost), 0) AS cost,
      COUNT(*) AS calls
    FROM ai_cost_log
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `).all();

  // Most expensive individual functions
  const byFunction = db.prepare(`
    SELECT
      function_name,
      category,
      COALESCE(SUM(estimated_cost), 0) AS cost,
      COUNT(*) AS calls,
      ROUND(COALESCE(AVG(estimated_cost), 0), 6) AS avg_cost_per_call
    FROM ai_cost_log
    GROUP BY function_name
    ORDER BY cost DESC
    LIMIT 15
  `).all();

  return res.status(200).json({
    total: {
      cost: Math.round(total.total_cost * 100) / 100,
      input_tokens: total.total_input,
      output_tokens: total.total_output,
      calls: total.total_calls,
    },
    by_category: byCategory.map(r => ({
      ...r, cost: Math.round(r.cost * 100) / 100,
    })),
    by_model: byModel.map(r => ({
      ...r, cost: Math.round(r.cost * 100) / 100,
    })),
    daily,
    by_function: byFunction.map(r => ({
      ...r, cost: Math.round(r.cost * 100) / 100,
      avg_cost_per_call: Math.round(r.avg_cost_per_call * 10000) / 10000,
    })),
  });
}

export default requireAuth(handler);
