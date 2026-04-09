import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const items = db.prepare('SELECT * FROM taxonomy_items ORDER BY category, sort_order, name').all();
    return res.status(200).json({ items });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, category } = body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM taxonomy_items WHERE category = ?').get(category || 'Service Offering');
    const id = uuid();
    db.prepare('INSERT INTO taxonomy_items (id, name, category, sort_order) VALUES (?, ?, ?, ?)').run(
      id, name.trim(), category || 'Service Offering', (maxOrder?.m || 0) + 1
    );
    return res.status(201).json({ id });
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { id, name, category } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    if (name) db.prepare('UPDATE taxonomy_items SET name = ? WHERE id = ?').run(name.trim(), id);
    if (category) db.prepare('UPDATE taxonomy_items SET category = ? WHERE id = ?').run(category, id);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const id = body?.id || req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    db.prepare('DELETE FROM taxonomy_items WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
