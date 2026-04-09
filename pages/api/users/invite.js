import { getDb } from '../../../lib/db';
import { requireAuth, hashPassword, signToken } from '../../../lib/auth';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { name, email, password } = body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = await hashPassword(password);
  const id = uuid();
  const orgRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('org_name');
  const orgName = orgRow?.value || 'My Organisation';

  db.prepare('INSERT INTO users (id, name, email, password_hash, org_name, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name.trim(), email.toLowerCase().trim(), hash, orgName, 'member');

  return res.status(201).json({ id, name: name.trim(), email: email.toLowerCase().trim(), role: 'member' });
}
export default requireAuth(handler);
