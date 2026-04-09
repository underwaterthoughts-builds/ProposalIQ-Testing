import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const { project_id, limit } = req.query;
    let sql = 'SELECT * FROM indexing_log';
    const params = [];
    if (project_id) { sql += ' WHERE project_id = ?'; params.push(project_id); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit) || 50);
    const logs = db.prepare(sql).all(...params);
    return res.status(200).json({ logs });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { project_id, project_name, stage, status, message } = body;
    if (!project_id || !stage) return res.status(400).json({ error: 'project_id and stage required' });
    db.prepare('INSERT INTO indexing_log (id, project_id, project_name, stage, status, message) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), project_id, project_name || '', stage, status || 'info', message || ''
    );
    return res.status(201).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
