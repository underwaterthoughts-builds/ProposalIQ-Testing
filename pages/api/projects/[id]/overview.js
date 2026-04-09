import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  if (req.method === 'GET') {
    const fields = db.prepare('SELECT * FROM project_overview_fields WHERE project_id = ? ORDER BY sort_order, created_at').all(id);
    return res.status(200).json({ fields });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { field_label, field_value, field_type, field_key } = body;
    if (!field_label) return res.status(400).json({ error: 'Label required' });
    const key = field_key || field_label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM project_overview_fields WHERE project_id = ?').get(id);
    const newId = uuid();
    db.prepare('INSERT INTO project_overview_fields (id, project_id, field_key, field_label, field_value, field_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId, id, key, field_label, field_value || '', field_type || 'text', (maxOrder?.m || 0) + 1);
    return res.status(201).json({ id: newId, field_key: key });
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { field_id, field_value, field_label } = body;
    if (!field_id) return res.status(400).json({ error: 'field_id required' });
    if (field_value !== undefined) db.prepare('UPDATE project_overview_fields SET field_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?').run(field_value, field_id, id);
    if (field_label !== undefined) db.prepare('UPDATE project_overview_fields SET field_label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?').run(field_label, field_id, id);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    db.prepare('DELETE FROM project_overview_fields WHERE id = ? AND project_id = ?').run(body.field_id, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
