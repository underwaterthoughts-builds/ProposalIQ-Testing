import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { logUsageEvent, getScanUsageSummary } from '../../../../lib/feedback';

// Logs passive usage events for a scan — what the user actually did with
// the AI output. Used to bias future ranking + populate the outcome
// capture form ("you copied 3 snippets and exported 1 briefing pack").
//
// POST body:
//   {
//     event_type: 'snippet_copied' | 'match_opened' | 'briefing_exported' |
//                 'reference_copied' | 'asset_clicked' | 'section_drafted' |
//                 'tab_viewed',
//     target_type: 'project' | 'snippet' | 'briefing' | 'section' | null,
//     target_id: '...',  // project id, snippet hash, etc
//     payload: {...}     // optional structured detail
//   }
//
// GET returns the per-event-type summary for this scan.
async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Scan id required' });

  // Tenant gate — every method targets a specific scan, so enforce
  // ownership once up front (same pattern as rfp/[id].js).
  const ownerRow = db.prepare('SELECT owner_user_id FROM rfp_scans WHERE id = ?').get(id);
  if (!ownerRow || !canAccess(req.user, ownerRow)) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ summary: getScanUsageSummary(id, db) });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const ok = logUsageEvent({
      scanId: id,
      eventType: body.event_type,
      targetType: body.target_type || null,
      targetId: body.target_id || null,
      payload: body.payload || null,
      userId: req.user?.id || null,
    }, db);
    return res.status(200).json({ ok });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
