import { getDb } from '../../../lib/db';
import { requireAdmin, signToken, setAuthCookie, writeAuditLog } from '../../../lib/auth';

// POST /api/admin/impersonate { user_id }
// Issues a session token whose user_id is the target user but whose
// impersonator_id is the calling admin. requireAdmin checks the
// CALLING admin's role, not the impersonated user's role, so view-as
// can never escalate privileges through a member account.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!body.user_id) return res.status(400).json({ error: 'user_id required' });
  if (body.user_id === req.user.id) return res.status(400).json({ error: 'Already signed in as that user' });

  const target = db.prepare('SELECT id, name, email, disabled FROM users WHERE id = ?').get(body.user_id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.disabled) return res.status(400).json({ error: 'Cannot impersonate a disabled user' });

  // The admin to record is the *real* admin — req.user._impersonator is null
  // here because requireAdmin uses the impersonator's role; the actual
  // signed-in user IS the admin in this code path.
  const adminId = req.user._impersonator?.id || req.user.id;

  // Issue impersonation token (target as primary, admin as impersonator)
  const token = signToken(target.id, adminId);
  setAuthCookie(res, token);

  writeAuditLog(req, 'impersonate.start', {
    target_type: 'user',
    target_id: target.id,
    details: { admin_id: adminId, target_email: target.email },
  });

  return res.status(200).json({ ok: true, viewing_as: { id: target.id, name: target.name, email: target.email } });
}

export default requireAdmin(handler);
