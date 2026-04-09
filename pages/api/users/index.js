import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

function handler(req, res) {
  const db = getDb();
  if (req.method === 'GET') {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const users = db.prepare('SELECT id, name, email, org_name, role, created_at FROM users ORDER BY created_at').all();
    return res.status(200).json({ users });
  }
  return res.status(405).end();
}
export default requireAuth(handler);
