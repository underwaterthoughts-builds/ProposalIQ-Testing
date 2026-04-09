import { getDb } from '../../../lib/db';
import { hashPassword, signToken, setAuthCookie } from '../../../lib/auth';
import { v4 as uuid } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { name, email, password, org_name } = body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  // First user becomes admin
  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get();
  const role = userCount.n === 0 ? 'admin' : 'member';

  const hash = await hashPassword(password);
  const id = uuid();
  db.prepare('INSERT INTO users (id, name, email, password_hash, org_name, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name.trim(), email.toLowerCase().trim(), hash, (org_name || 'My Organisation').trim(), role);

  const token = signToken(id);
  setAuthCookie(res, token);
  return res.status(201).json({ user: { id, name: name.trim(), email: email.toLowerCase().trim(), org_name: org_name || 'My Organisation', role } });
}
