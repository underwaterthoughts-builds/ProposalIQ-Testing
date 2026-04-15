import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { scope, ownerId, canAccess } from '../../../lib/tenancy';
import { v4 as uuid } from 'uuid';

function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const t = scope(req.user, 'f.owner_user_id');
    const pt = scope(req.user, 'p.owner_user_id');
    const folders = db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM projects p WHERE p.folder_id = f.id${pt.clause}) as project_count FROM folders f WHERE 1=1${t.clause} ORDER BY f.sort_order, f.name`).all(...pt.params, ...t.params);
    return res.status(200).json({ folders });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, parent_id, sector } = body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuid();
    db.prepare('INSERT INTO folders (id, name, parent_id, sector, owner_user_id) VALUES (?, ?, ?, ?, ?)').run(id, name, parent_id || null, sector || '', ownerId(req.user));
    return res.status(201).json({ id });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const existing = db.prepare('SELECT owner_user_id FROM folders WHERE id = ?').get(id);
    if (!existing || !canAccess(req.user, existing)) return res.status(404).json({ error: 'Not found' });
    if (body.name) db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(body.name.trim(), id);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const existing = db.prepare('SELECT owner_user_id FROM folders WHERE id = ?').get(id);
    if (!existing || !canAccess(req.user, existing)) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE projects SET folder_id = NULL WHERE folder_id = ?').run(id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
