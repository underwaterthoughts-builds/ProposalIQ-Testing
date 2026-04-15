import { getDb } from '../../../lib/db';
import { requireAdmin, writeAuditLog } from '../../../lib/auth';

function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const updates = [];
    const params = [];
    if (body.role && ['admin', 'member'].includes(body.role)) {
      updates.push('role = ?'); params.push(body.role);
    }
    if (typeof body.disabled === 'boolean') {
      // Don't let an admin lock themselves out
      if (body.disabled && id === req.user.id) {
        return res.status(400).json({ error: "Can't disable your own account" });
      }
      updates.push('disabled = ?'); params.push(body.disabled ? 1 : 0);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    if (body.role) writeAuditLog(req, 'user.role_changed', { target_type: 'user', target_id: id, details: { new_role: body.role } });
    if (typeof body.disabled === 'boolean') writeAuditLog(req, body.disabled ? 'user.disabled' : 'user.enabled', { target_type: 'user', target_id: id });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (id === req.user.id) return res.status(400).json({ error: "Can't delete your own account" });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    writeAuditLog(req, 'user.deleted', { target_type: 'user', target_id: id });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
export default requireAdmin(handler);
