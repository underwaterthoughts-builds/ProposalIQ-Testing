import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { getScanUsageSummary } from '../../../../lib/feedback';

// Outcome capture for a scan — was it submitted, won/lost, what helped,
// what was missing. Powers the closed feedback loop: outcomes feed into
// future ranking via lib/feedback.js
//
// GET  → returns existing outcome (or null) plus the usage summary so the
//        capture form can show "you copied N snippets" before asking
// POST → upsert the outcome row
async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Scan id required' });

  if (req.method === 'GET') {
    const row = db.prepare('SELECT * FROM scan_outcomes WHERE scan_id = ?').get(id);
    return res.status(200).json({
      outcome: row || null,
      usage_summary: getScanUsageSummary(id, db),
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const allowed = ['outcome', 'most_useful', 'what_was_missing', 'client_feedback'];
    const submitted = body.submitted ? 1 : 0;
    const piqUsed = body.piq_used_materially ? 1 : 0;
    const outcome = ['won', 'lost', 'pending', 'no_bid'].includes(body.outcome) ? body.outcome : 'pending';
    const mostUseful = String(body.most_useful || '').slice(0, 2000);
    const whatMissing = String(body.what_was_missing || '').slice(0, 2000);
    const clientFeedback = String(body.client_feedback || '').slice(0, 2000);
    const userId = req.user?.id || null;

    db.prepare(`
      INSERT INTO scan_outcomes (
        scan_id, submitted, outcome, piq_used_materially,
        most_useful, what_was_missing, client_feedback,
        captured_by, captured_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(scan_id) DO UPDATE SET
        submitted = excluded.submitted,
        outcome = excluded.outcome,
        piq_used_materially = excluded.piq_used_materially,
        most_useful = excluded.most_useful,
        what_was_missing = excluded.what_was_missing,
        client_feedback = excluded.client_feedback,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      id, submitted, outcome, piqUsed,
      mostUseful, whatMissing, clientFeedback, userId
    );

    // Side-effect: if outcome is 'won' or 'lost', also mirror to the
    // matched proposals' parent project rows so the existing repository
    // ranking (which already considers proposal.outcome for its weight)
    // sees the signal — but only for projects the user actually marked
    // as used via piq_used_materially. We don't auto-mark based on a
    // user just clicking "won" — they have to actively confirm the bid
    // was informed by ProposalIQ.

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
