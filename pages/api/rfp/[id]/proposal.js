import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { ensureDir } from '../../../../lib/storage';
import { analyseProposalAgainstRfp } from '../../../../lib/proposal-fit';

export const config = { api: { bodyParser: false } };

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.md']);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });

  const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans');
  ensureDir(uploadDir);

  if (req.method === 'POST') {
    const form = formidable({ uploadDir, keepExtensions: true, maxFileSize: MAX_FILE_BYTES });
    let files;
    try {
      [, files] = await new Promise((resolve, reject) => {
        form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
      });
    } catch (e) { return res.status(400).json({ error: 'Upload failed: ' + e.message }); }

    const arr = files['proposal'];
    const file = Array.isArray(arr) ? arr[0] : arr;
    if (!file?.filepath) return res.status(400).json({ error: 'Proposal file required (field name: proposal)' });

    const ext = path.extname(file.originalFilename || file.filepath).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      try { fs.unlinkSync(file.filepath); } catch {}
      return res.status(400).json({ error: `Unsupported file type "${ext}" — use PDF, DOCX, DOC, TXT, or MD` });
    }

    // Replace any prior proposal file in place
    if (scan.proposal_filename) {
      try { fs.unlinkSync(path.join(uploadDir, scan.proposal_filename)); } catch {}
    }

    const newName = `proposal_${id}_${uuid()}${ext}`;
    const newPath = path.join(uploadDir, newName);
    try { fs.renameSync(file.filepath, newPath); }
    catch (e) { return res.status(500).json({ error: 'Failed to save file: ' + e.message }); }

    db.prepare(
      `UPDATE rfp_scans SET
        proposal_filename = ?, proposal_original_name = ?,
        proposal_uploaded_at = CURRENT_TIMESTAMP,
        proposal_metadata = NULL,
        proposal_fit_overall = NULL,
        proposal_analysis_status = 'pending',
        proposal_analysis_progress = NULL,
        last_proposal_analyzed_at = NULL
        WHERE id = ?`
    ).run(newName, file.originalFilename || newName, id);
    db.prepare('DELETE FROM proposal_coverage WHERE scan_id = ?').run(id);

    res.status(202).json({ scanId: id, message: 'Proposal received — analysis started' });

    // Fire-and-forget — caller polls /proposal-fit for progress
    analyseProposalAgainstRfp(id).catch(e => {
      console.error(`[proposal-fit ${id}] outer catch:`, e.message);
      try {
        db.prepare("UPDATE rfp_scans SET proposal_analysis_status='error', proposal_analysis_progress = ? WHERE id=?")
          .run(e.message?.slice(0, 200) || 'unknown error', id);
      } catch {}
    });
    return;
  }

  if (req.method === 'DELETE') {
    if (scan.proposal_filename) {
      try { fs.unlinkSync(path.join(uploadDir, scan.proposal_filename)); } catch {}
    }
    db.prepare(
      `UPDATE rfp_scans SET
        proposal_filename = NULL, proposal_original_name = NULL,
        proposal_uploaded_at = NULL, proposal_metadata = NULL,
        proposal_fit_overall = NULL,
        proposal_analysis_status = NULL,
        proposal_analysis_progress = NULL,
        last_proposal_analyzed_at = NULL
        WHERE id = ?`
    ).run(id);
    db.prepare('DELETE FROM proposal_coverage WHERE scan_id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
