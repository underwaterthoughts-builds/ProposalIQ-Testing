const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const COOKIE = 'piq_session';
const SECRET = process.env.JWT_SECRET || 'proposaliq-dev-secret-change-me';

async function hashPassword(pw) { return bcrypt.hash(pw, 12); }
async function verifyPassword(pw, hash) { return bcrypt.compare(pw, hash); }

function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: '30d' });
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
    return db.prepare('SELECT id, name, email, org_name, role FROM users WHERE id = ?').get(payload.userId) || null;
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

module.exports = {
  hashPassword, verifyPassword, signToken, verifyToken,
  getUserFromReq, setAuthCookie, clearAuthCookie, requireAuth, COOKIE,
};
