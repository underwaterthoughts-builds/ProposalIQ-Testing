import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

async function handler(req, res) {
  const db = getDb();
  if (req.method === 'GET') {
    const rows = db.prepare('SELECT key,value FROM settings').all();
    const settings = Object.fromEntries(rows.map(r=>[r.key,r.value]));
    // Defaults
    return res.status(200).json({
      org_name: settings.org_name || 'My Organisation',
      target_margin: settings.target_margin || '30',
      default_currency: settings.default_currency || 'GBP',
      gemini_model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      has_api_key: !!process.env.GEMINI_API_KEY,
      has_openai: !!process.env.OPENAI_API_KEY,
      openai_model: process.env.OPENAI_MODEL || 'gpt-4o',
    });
  }
  if (req.method === 'POST') {
    const body = typeof req.body==='string'?JSON.parse(req.body):req.body;
    const upsert = db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP');
    const allowed = ['org_name','target_margin','default_currency'];
    for (const [k,v] of Object.entries(body)) {
      if (allowed.includes(k)) upsert.run(k, String(v));
    }
    return res.status(200).json({ ok:true });
  }
  return res.status(405).end();
}
export default requireAuth(handler);
