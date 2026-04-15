const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const COOKIE = 'piq_session';
const SECRET = process.env.JWT_SECRET || 'proposaliq-dev-secret-change-me';

async function hashPassword(pw) { return bcrypt.hash(pw, 12); }
async function verifyPassword(pw, hash) { return bcrypt.compare(pw, hash); }

// Token payload now optionally carries impersonator_id so an admin
// "view as user" session attributes actions to both. Old single-id
// tokens still verify (we just leave impersonator_id null).
function signToken(userId, impersonatorId = null) {
  const payload = impersonatorId ? { userId, impersonator_id: impersonatorId } : { userId };
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, SECRET); }
  catch { return null; }
}

function getUserFromReq(req) {
  const raw = req.headers?.cookie || '';
  const cookies = Object.fromEntries(
    raw.split(';').map(c => {
      const parts = c.trim().split('=');
      return [decodeURIComponent(parts[0] || ''), decodeURIComponent(parts.slice(1).join('=') || '')];
    }).filter(([k]) => k)
  );
  const token = cookies[COOKIE];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, org_name, role, disabled, onboarded_at FROM users WHERE id = ?').get(payload.userId) || null;
    if (!user) return null;
    if (user.disabled) return null;
    // Attach the impersonator (real admin) when this session is a view-as
    if (payload.impersonator_id) {
      const imp = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.impersonator_id);
      if (imp && imp.role === 'admin' && !imp.disabled) {
        user._impersonator = imp;
      }
    }
    return user;
  } catch { return null; }
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    return handler(req, res);
  };
}

function requireAdmin(handler) {
  return async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    // Impersonating admins should still be admins for admin-route access:
    // we deliberately use the IMPERSONATOR's role (the real signed-in user)
    // when present, so view-as-X never grants admin privileges through a
    // non-admin target user.
    const effectiveRole = user._impersonator ? user._impersonator.role : user.role;
    if (effectiveRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = user;
    return handler(req, res);
  };
}

// writeAuditLog — fire-and-forget. The action string is a short verb code
// the admin viewer can filter on (e.g. 'user.role_changed', 'user.disabled',
// 'impersonate.start', 'project.deleted'). impersonator_id is auto-pulled
// from req.user._impersonator if not passed explicitly.
function writeAuditLog(req, action, opts = {}) {
  try {
    const db = getDb();
    const user = req?.user || {};
    const impersonatorId = opts.impersonator_id ?? user._impersonator?.id ?? null;
    const ip = (req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || '').toString().split(',')[0].trim() || null;
    db.prepare(`
      INSERT INTO audit_log (user_id, impersonator_id, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id || null,
      impersonatorId,
      action,
      opts.target_type || null,
      opts.target_id || null,
      JSON.stringify(opts.details || {}),
      ip,
    );
  } catch (e) {
    console.error('writeAuditLog failed:', e.message);
  }
}

module.exports = {
  hashPassword, verifyPassword, signToken, verifyToken,
  getUserFromReq, setAuthCookie, clearAuthCookie,
  requireAuth, requireAdmin, writeAuditLog, COOKIE,
};
