import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { analyseProposalAgainstRfp } from '../../../../lib/proposal-fit';

async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });

  if (req.method === 'GET') {
    const coverage = db.prepare(
      'SELECT requirement_index, requirement_text, requirement_section, requirement_mandatory, status, evidence_quote, strength_score, rationale FROM proposal_coverage WHERE scan_id = ? ORDER BY requirement_index'
    ).all(id);
    let metadata = null;
    try { metadata = scan.proposal_metadata ? JSON.parse(scan.proposal_metadata) : null; } catch {}
    return res.status(200).json({
      proposal_attached: !!scan.proposal_filename,
      proposal_original_name: scan.proposal_original_name || null,
      proposal_uploaded_at: scan.proposal_uploaded_at || null,
      status: scan.proposal_analysis_status || null,
      progress: scan.proposal_analysis_progress || null,
      overall: scan.proposal_fit_overall || null,
      last_analyzed_at: scan.last_proposal_analyzed_at || null,
      metadata,
      coverage,
    });
  }

  if (req.method === 'POST') {
    // Re-run analysis (idempotent) — UI exposes this as "Re-run analysis"
    if (!scan.proposal_filename) return res.status(400).json({ error: 'No proposal attached' });
    db.prepare("UPDATE rfp_scans SET proposal_analysis_status = 'pending', proposal_analysis_progress = NULL WHERE id = ?").run(id);
    res.status(202).json({ scanId: id, message: 'Re-analysis started' });
    analyseProposalAgainstRfp(id).catch(e => {
      console.error(`[proposal-fit ${id}] rerun outer catch:`, e.message);
      try {
        db.prepare("UPDATE rfp_scans SET proposal_analysis_status='error', proposal_analysis_progress = ? WHERE id=?")
          .run(e.message?.slice(0, 200) || 'unknown error', id);
      } catch {}
    });
    return;
  }

  return res.status(405).end();
}

export default requireAuth(handler);
