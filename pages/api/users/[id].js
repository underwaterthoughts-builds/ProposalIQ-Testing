import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body.role && ['admin', 'member'].includes(body.role)) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (id === req.user.id) return res.status(400).json({ error: "Can't delete your own account" });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
export default requireAuth(handler);
