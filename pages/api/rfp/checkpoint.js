import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { canAccess } from '../../../lib/tenancy';
import { safe } from '../../../lib/embeddings';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const { id } = req.query;
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { checkpoint, edited_data } = body;

  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });

  if (checkpoint === 'rfp') {
    db.prepare('UPDATE rfp_scans SET checkpoint_rfp_approved=1, rfp_data_edited=? WHERE id=?')
      .run(edited_data ? JSON.stringify(edited_data) : null, id);
  } else if (checkpoint === 'gaps') {
    db.prepare('UPDATE rfp_scans SET checkpoint_gaps_approved=1, gaps_edited=? WHERE id=?')
      .run(edited_data ? JSON.stringify(edited_data) : null, id);
  } else if (checkpoint === 'strategy') {
    db.prepare('UPDATE rfp_scans SET checkpoint_strategy_approved=1, strategy_edited=? WHERE id=?')
      .run(edited_data ? JSON.stringify(edited_data) : null, id);
  } else {
    return res.status(400).json({ error: 'Unknown checkpoint' });
  }

  return res.status(200).json({ ok: true, checkpoint });
}

export default requireAuth(handler);
