import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { runRfpScanPipeline } from '../../../../lib/rfp-pipeline';

// Re-runs the full RFP scan pipeline against the existing uploaded file.
// Useful when prompts/taxonomy/ranking logic have improved since the
// original scan, or when a transient error needs retrying.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  const { id } = req.query;

  const scan = db.prepare('SELECT id, rfp_filename FROM rfp_scans WHERE id = ?').get(id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  if (!scan.rfp_filename) return res.status(400).json({ error: 'No source file recorded for this scan' });

  const filePath = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans', scan.rfp_filename);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Source file no longer exists on disk — please re-upload' });
  }

  // Mark as processing and clear status_detail so the UI shows the spinner.
  // We deliberately do NOT wipe the existing results — they stay visible
  // until the new pipeline overwrites them, so the user always has
  // something to look at.
  db.prepare("UPDATE rfp_scans SET status='processing' WHERE id=?").run(id);

  res.status(202).json({ scanId: id, message: 'Re-analysis started' });

  // Fire-and-forget. Pipeline writes status='complete' or 'error' on its own.
  const userId = req.user?.id || null;
  runRfpScanPipeline(id, filePath, userId).catch(e => {
    console.error(`[rescan ${id}] outer catch:`, e.message);
    try { db.prepare("UPDATE rfp_scans SET status='error' WHERE id=?").run(id); } catch {}
  });
}

export default requireAuth(handler);
