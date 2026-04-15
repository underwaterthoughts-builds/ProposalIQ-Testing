import { getDb } from '../../../lib/db';
import { requireAdmin } from '../../../lib/auth';

function handler(req, res) {
  const db = getDb();
  if (req.method === 'GET') {
    const users = db.prepare('SELECT id, name, email, org_name, role, disabled, created_at FROM users ORDER BY created_at').all();
    return res.status(200).json({ users });
  }
  return res.status(405).end();
}
export default requireAdmin(handler);
