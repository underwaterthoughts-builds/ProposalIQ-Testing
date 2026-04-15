import { getDb } from '../../../lib/db';
import { requireAdmin } from '../../../lib/auth';

// GET /api/admin/audit?limit=200&user_id=...&action=...
// Returns the latest audit entries with the user + impersonator names
// joined in for the admin viewer. Capped at 500 rows per request.
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const filters = [];
  const params = [];
  if (req.query.user_id) { filters.push('al.user_id = ?'); params.push(req.query.user_id); }
  if (req.query.action) { filters.push('al.action = ?'); params.push(req.query.action); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      al.id, al.action, al.target_type, al.target_id, al.details,
      al.ip, al.created_at,
      al.user_id, u.name AS user_name, u.email AS user_email,
      al.impersonator_id, ai.name AS impersonator_name, ai.email AS impersonator_email
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN users ai ON ai.id = al.impersonator_id
    ${where}
    ORDER BY al.id DESC
    LIMIT ?
  `).all(...params, limit);
  const entries = rows.map(r => ({ ...r, details: safeParse(r.details) }));
  return res.status(200).json({ entries, limit });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

export default requireAdmin(handler);
