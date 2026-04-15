import { requireAuth, signToken, setAuthCookie, writeAuditLog } from '../../../lib/auth';

// POST /api/admin/end-impersonation
// Restores the admin's own session (re-issues a normal token for the
// impersonator id) and logs the end. Anyone with an impersonated
// session can call this — it only un-does what was already in flight.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const impersonator = req.user._impersonator;
  if (!impersonator) return res.status(400).json({ error: 'Not currently impersonating' });

  writeAuditLog(req, 'impersonate.end', {
    target_type: 'user',
    target_id: req.user.id,
    details: { admin_id: impersonator.id, target_email: req.user.email },
  });

  // Issue plain token for the original admin
  const token = signToken(impersonator.id, null);
  setAuthCookie(res, token);
  return res.status(200).json({ ok: true, restored_to: { id: impersonator.id, name: impersonator.name } });
}

export default requireAuth(handler);
