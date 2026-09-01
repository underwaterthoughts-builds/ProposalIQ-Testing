import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  // Tenant gate — every method targets a specific project, so enforce
  // ownership once up front.
  const ownerRow = db.prepare('SELECT owner_user_id FROM projects WHERE id = ?').get(id);
  if (!ownerRow || !canAccess(req.user, ownerRow)) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method === 'GET') {
    const entries = db.prepare('SELECT * FROM project_narrative_entries WHERE project_id = ? ORDER BY created_at ASC').all(id);
    return res.status(200).json({ entries });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { content, entry_type } = body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const entryId = uuid();
    db.prepare('INSERT INTO project_narrative_entries (id, project_id, user_id, user_name, entry_type, content) VALUES (?, ?, ?, ?, ?, ?)')
      .run(entryId, id, req.user?.id || 'guest', req.user?.name || 'User', entry_type || 'note', content.trim());
    const entry = db.prepare('SELECT * FROM project_narrative_entries WHERE id = ?').get(entryId);
    return res.status(201).json({ entry });
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    db.prepare('DELETE FROM project_narrative_entries WHERE id = ? AND project_id = ?').run(body.entry_id, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
