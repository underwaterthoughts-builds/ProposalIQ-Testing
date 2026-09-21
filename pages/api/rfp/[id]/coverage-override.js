import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { recomputeFitOverall } from '../../../../lib/proposal-fit';
import { logUsageEvent } from '../../../../lib/feedback';

// POST /api/rfp/[id]/coverage-override
// Body: { requirement_index, covered: true|false, note? }
//
// "We have this" on a coverage-matrix requirement. The AI's grading
// (status + strength + evidence) is preserved untouched — the user's
// assertion sits alongside it, the fit score immediately re-grades
// counting the asserted row as covered, and covered=false undoes it.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  const { id } = req.query;

  // Tenant gate — same pattern as rfp/[id].js.
  const ownerRow = db.prepare('SELECT owner_user_id FROM rfp_scans WHERE id = ?').get(id);
  if (!ownerRow || !canAccess(req.user, ownerRow)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const reqIndex = Number(body?.requirement_index);
  if (!Number.isInteger(reqIndex)) return res.status(400).json({ error: 'requirement_index required' });

  const row = db.prepare('SELECT * FROM proposal_coverage WHERE scan_id = ? AND requirement_index = ?').get(id, reqIndex);
  if (!row) return res.status(404).json({ error: 'Coverage row not found' });

  const covered = !!body.covered;
  const note = covered ? String(body.note || '').slice(0, 500) || null : null;
  db.prepare('UPDATE proposal_coverage SET user_override = ?, override_note = ? WHERE scan_id = ? AND requirement_index = ?')
    .run(covered ? 'covered' : null, note, id, reqIndex);

  const { overall, coverage } = recomputeFitOverall(db, id);

  try {
    logUsageEvent({
      scanId: id,
      eventType: 'coverage_overridden',
      targetType: 'requirement',
      targetId: String(reqIndex),
      payload: { covered, note },
      userId: req.user?.id || null,
    }, db);
  } catch {}

  return res.status(200).json({ ok: true, overall, coverage_score: coverage, requirement_index: reqIndex, covered });
}

export default requireAuth(handler);
