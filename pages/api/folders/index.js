import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { v4 as uuid } from 'uuid';

function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const folders = db.prepare('SELECT f.*, (SELECT COUNT(*) FROM projects p WHERE p.folder_id = f.id) as project_count FROM folders f ORDER BY f.sort_order, f.name').all();
    return res.status(200).json({ folders });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, parent_id, sector } = body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuid();
    db.prepare('INSERT INTO folders (id, name, parent_id, sector) VALUES (?, ?, ?, ?)').run(id, name, parent_id || null, sector || '');
    return res.status(201).json({ id });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    if (body.name) db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(body.name.trim(), id);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    db.prepare('UPDATE projects SET folder_id = NULL WHERE folder_id = ?').run(id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
