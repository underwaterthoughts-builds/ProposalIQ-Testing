import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { isAdmin } from '../../../lib/tenancy';

// Admin sees every user. Members see only themselves + any admins (so
// they know who to contact for support). Impersonation sessions are
// treated as the impersonated user per isAdmin() — view-as-member shows
// a member's restricted view, not the admin's full list.
function handler(req, res) {
  const db = getDb();
  if (req.method === 'GET') {
    let users;
    if (isAdmin(req.user)) {
      users = db.prepare('SELECT id, name, email, org_name, role, disabled, created_at FROM users ORDER BY created_at').all();
    } else {
      users = db.prepare(`
        SELECT id, name, email, org_name, role, disabled, created_at FROM users
        WHERE id = ? OR role = 'admin'
        ORDER BY created_at
      `).all(req.user.id);
    }
    return res.status(200).json({ users });
  }
  return res.status(405).end();
}
export default requireAuth(handler);
