import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { v4 as uuid } from 'uuid';

// Default built-in values — always shown even if not in DB
const DEFAULTS = {
  sector: ['Government & Public Sector','Healthcare & NHS','Aerospace & Defence','Financial Services','Technology','Retail & Consumer','Other'],
  project_type: ['Digital Transformation','Data & Analytics','Cloud Migration','Infrastructure','Software Development','Consultancy','Managed Services','Other'],
  currency: ['GBP','USD','EUR','AUD','CAD','CHF','JPY','SGD','AED'],
};

function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const { category } = req.query;
    const rows = category
      ? db.prepare('SELECT value FROM custom_values WHERE category = ? ORDER BY created_at').all(category)
      : db.prepare('SELECT category, value FROM custom_values ORDER BY category, created_at').all();

    if (category) {
      const customs = rows.map(r => r.value);
      const defaults = DEFAULTS[category] || [];
      // Merge: defaults first, then any custom values not already in defaults
      const merged = [...defaults, ...customs.filter(v => !defaults.includes(v))];
      return res.status(200).json({ values: merged, custom: customs });
    }

    // Return all categories merged with defaults
    const result = {};
    for (const [cat, defs] of Object.entries(DEFAULTS)) {
      result[cat] = [...defs];
    }
    for (const row of rows) {
      if (!result[row.category]) result[row.category] = [];
      if (!result[row.category].includes(row.value)) {
        result[row.category].push(row.value);
      }
    }
    return res.status(200).json({ values: result });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { category, value } = body;
    if (!category || !value) return res.status(400).json({ error: 'category and value required' });

    // Don't save if it's already a default
    const defs = DEFAULTS[category] || [];
    if (!defs.includes(value)) {
      try {
        db.prepare('INSERT OR IGNORE INTO custom_values (id, category, value) VALUES (?, ?, ?)')
          .run(uuid(), category, value.trim());
      } catch (e) {
        // UNIQUE constraint — already exists, that's fine
      }
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { category, value } = body;
    if (!category || !value) return res.status(400).json({ error: 'category and value required' });
    db.prepare('DELETE FROM custom_values WHERE category = ? AND value = ?').run(category, value);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
