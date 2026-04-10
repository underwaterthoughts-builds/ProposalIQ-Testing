import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

// Per-user workspace — which projects to use for RFP Intelligence scans.
//
// GET    → list of project IDs in the current user's workspace
// POST   → add project(s) to workspace  { project_ids: ['...'] }
// DELETE → remove project(s) from workspace { project_ids: ['...'] }
// PATCH  → replace entire workspace { project_ids: ['...'] } (bulk set)
async function handler(req, res) {
  const db = getDb();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const rows = db.prepare(
      'SELECT project_id FROM user_workspace_projects WHERE user_id = ?'
    ).all(userId);
    return res.status(200).json({
      project_ids: rows.map(r => r.project_id),
      count: rows.length,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const ids = Array.isArray(body?.project_ids) ? body.project_ids.filter(Boolean) : [];

  if (req.method === 'POST') {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO user_workspace_projects (user_id, project_id) VALUES (?, ?)'
    );
    let added = 0;
    for (const pid of ids) {
      const r = insert.run(userId, pid);
      if (r.changes) added++;
    }
    return res.status(200).json({ ok: true, added });
  }

  if (req.method === 'DELETE') {
    if (body?.clear_all) {
      const r = db.prepare('DELETE FROM user_workspace_projects WHERE user_id = ?').run(userId);
      return res.status(200).json({ ok: true, removed: r.changes });
    }
    const del = db.prepare(
      'DELETE FROM user_workspace_projects WHERE user_id = ? AND project_id = ?'
    );
    let removed = 0;
    for (const pid of ids) {
      const r = del.run(userId, pid);
      if (r.changes) removed++;
    }
    return res.status(200).json({ ok: true, removed });
  }

  if (req.method === 'PATCH') {
    // Replace entire workspace — clear then insert
    db.prepare('DELETE FROM user_workspace_projects WHERE user_id = ?').run(userId);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO user_workspace_projects (user_id, project_id) VALUES (?, ?)'
    );
    for (const pid of ids) insert.run(userId, pid);
    return res.status(200).json({ ok: true, count: ids.length });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
