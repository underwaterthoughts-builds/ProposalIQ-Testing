import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { canAccess, scope } from '../../../lib/tenancy';
import { v4 as uuid } from 'uuid';

// Indexing log endpoint. The indexing_log table itself doesn't carry an
// owner_user_id column — instead, we gate access by project ownership at
// the API layer. A user can only read or append to logs for projects they
// own (or any project if they are admin).
async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const { project_id, limit } = req.query;
    const lim = parseInt(limit) || 50;

    if (project_id) {
      // Scope by project ownership — fetch the project, verify access, only
      // then read its logs.
      const project = db.prepare('SELECT owner_user_id FROM projects WHERE id = ?').get(project_id);
      if (!project || !canAccess(req.user, project)) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const logs = db.prepare(
        'SELECT * FROM indexing_log WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(project_id, lim);
      return res.status(200).json({ logs });
    }

    // No project_id → return only logs for projects the caller owns
    // (admin sees everything via empty scope clause).
    const sc = scope(req.user, 'p.owner_user_id');
    const logs = db.prepare(
      `SELECT il.* FROM indexing_log il
       JOIN projects p ON p.id = il.project_id
       WHERE 1=1${sc.clause}
       ORDER BY il.created_at DESC LIMIT ?`
    ).all(...sc.params, lim);
    return res.status(200).json({ logs });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { project_id, project_name, stage, status, message } = body;
    if (!project_id || !stage) return res.status(400).json({ error: 'project_id and stage required' });

    // Verify the caller owns (or admin-can-access) this project before
    // appending to its log.
    const project = db.prepare('SELECT owner_user_id FROM projects WHERE id = ?').get(project_id);
    if (!project || !canAccess(req.user, project)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.prepare('INSERT INTO indexing_log (id, project_id, project_name, stage, status, message) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), project_id, project_name || '', stage, status || 'info', message || ''
    );
    return res.status(201).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
