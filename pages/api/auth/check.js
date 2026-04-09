import { getDb } from '../../../lib/db';

export default function handler(req, res) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as n FROM users').get();
    return res.status(200).json({ hasUsers: row.n > 0 });
  } catch {
    return res.status(200).json({ hasUsers: false });
  }
}
