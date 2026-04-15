import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { scope, canAccess } from '../../../lib/tenancy';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

  if (body.id) {
    // Reset a single project — only if the caller owns it (or is admin).
    const p = db.prepare('SELECT id, indexing_status, owner_user_id FROM projects WHERE id = ?').get(body.id);
    if (!p || !canAccess(req.user, p)) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE projects SET indexing_status = 'complete' WHERE id = ?").run(body.id);
    return res.status(200).json({ reset: 1 });
  }

  // Reset all stuck projects (indexing for more than 10 minutes).
  // Scope by owner so a member only clears their own stuck rows.
  const sc = scope(req.user);
  const result = db.prepare(`
    UPDATE projects SET indexing_status = 'error'
    WHERE indexing_status = 'indexing'
    AND (indexed_at IS NULL OR indexed_at < datetime('now', '-10 minutes'))
    ${sc.clause}
  `).run(...sc.params);

  return res.status(200).json({ reset: result.changes });
}

export default requireAuth(handler);
