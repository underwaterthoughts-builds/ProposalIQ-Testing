import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

  if (body.id) {
    // Reset a single project
    const p = db.prepare('SELECT id, indexing_status FROM projects WHERE id = ?').get(body.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE projects SET indexing_status = 'complete' WHERE id = ?").run(body.id);
    return res.status(200).json({ reset: 1 });
  }

  // Reset all stuck projects (indexing for more than 10 minutes)
  // We use indexed_at as a proxy — if it was set to 'indexing' and indexed_at is old
  const result = db.prepare(`
    UPDATE projects SET indexing_status = 'error'
    WHERE indexing_status = 'indexing'
    AND (indexed_at IS NULL OR indexed_at < datetime('now', '-10 minutes'))
  `).run();

  return res.status(200).json({ reset: result.changes });
}

export default requireAuth(handler);
