import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';

// Full-proposal persistence for a scan.
//   GET → return the saved full proposal text + last-saved timestamp
//   PUT → save the full proposal text (from generation or user edits)
//
// The full proposal is a ~12-16 minute AI generation — before this route it
// lived only in AssemblyTab component state and vanished on tab switch.

// 2MB cap — generous for a text proposal (a long one is ~100KB), but stops
// a runaway payload from bloating the scan row. Next's default bodyParser
// limit is 1MB, so raise it to match the cap.
const MAX_PROPOSAL_BYTES = 2 * 1024 * 1024;

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Scan id required' });

  // Tenant gate — every method targets a specific scan, so enforce
  // ownership once up front (same pattern as rfp/[id]/drafts.js).
  const ownerRow = db.prepare('SELECT owner_user_id FROM rfp_scans WHERE id = ?').get(id);
  if (!ownerRow || !canAccess(req.user, ownerRow)) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method === 'GET') {
    const row = db.prepare(
      'SELECT full_proposal_text, full_proposal_updated_at FROM rfp_scans WHERE id = ?'
    ).get(id);
    return res.status(200).json({
      text: row?.full_proposal_text || null,
      updated_at: row?.full_proposal_updated_at || null,
    });
  }

  if (req.method === 'PUT') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (typeof body?.text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    if (Buffer.byteLength(body.text, 'utf8') > MAX_PROPOSAL_BYTES) {
      return res.status(413).json({ error: 'Proposal text too large (2MB max)' });
    }
    db.prepare(
      'UPDATE rfp_scans SET full_proposal_text = ?, full_proposal_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(body.text, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
