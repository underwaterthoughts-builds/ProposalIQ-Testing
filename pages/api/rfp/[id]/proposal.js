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

    const arr = files['proposal'] ? (Array.isArray(files['proposal']) ? files['proposal'] : [files['proposal']]) : [];
    if (!arr.length || !arr[0]?.filepath) {
      return res.status(400).json({ error: 'Proposal file required (field name: proposal)' });
    }

    // Backfill: pre-multi-doc scans hold a single file only in the legacy
    // columns. Register it as a doc row first so new uploads APPEND to it
    // (commercial + technical + annexes) instead of replacing it.
    const existingDocs = db.prepare('SELECT COUNT(*) n FROM rfp_scan_proposal_docs WHERE scan_id = ?').get(id).n;
    if (existingDocs === 0 && scan.proposal_filename) {
      db.prepare('INSERT INTO rfp_scan_proposal_docs (id, scan_id, filename, original_name) VALUES (?, ?, ?, ?)')
        .run(uuid(), id, scan.proposal_filename, scan.proposal_original_name || scan.proposal_filename);
    }

    const MAX_DOCS = 6;
    const already = db.prepare('SELECT COUNT(*) n FROM rfp_scan_proposal_docs WHERE scan_id = ?').get(id).n;
    let added = 0;
    for (const file of arr) {
      if (!file?.filepath) continue;
      if (already + added >= MAX_DOCS) { try { fs.unlinkSync(file.filepath); } catch {} continue; }
      const ext = path.extname(file.originalFilename || file.filepath).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        try { fs.unlinkSync(file.filepath); } catch {}
        // Single bad file in a single-file upload should still error clearly
        if (arr.length === 1) return res.status(400).json({ error: `Unsupported file type "${ext}" — use PDF, DOCX, DOC, TXT, or MD` });
        continue;
      }
      const newName = `proposal_${id}_${uuid()}${ext}`;
      try { fs.renameSync(file.filepath, path.join(uploadDir, newName)); } catch { continue; }
      db.prepare('INSERT INTO rfp_scan_proposal_docs (id, scan_id, filename, original_name) VALUES (?, ?, ?, ?)')
        .run(uuid(), id, newName, file.originalFilename || newName);
      added++;
    }
    if (added === 0) return res.status(400).json({ error: 'No valid proposal files received' });

    // Legacy columns track the FIRST doc so existing truthiness checks
    // (badges, fit triggers) keep working.
    const first = db.prepare('SELECT filename, original_name FROM rfp_scan_proposal_docs WHERE scan_id = ? ORDER BY created_at LIMIT 1').get(id);
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
    ).run(first.filename, first.original_name, id);
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
    const docId = Array.isArray(req.query.doc) ? req.query.doc[0] : req.query.doc;

    // ?doc=<id> → remove just that document, keep the rest, re-analyse
    if (docId) {
      const doc = db.prepare('SELECT * FROM rfp_scan_proposal_docs WHERE id = ? AND scan_id = ?').get(docId, id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      try { fs.unlinkSync(path.join(uploadDir, doc.filename)); } catch {}
      db.prepare('DELETE FROM rfp_scan_proposal_docs WHERE id = ?').run(docId);

      const remaining = db.prepare('SELECT filename, original_name FROM rfp_scan_proposal_docs WHERE scan_id = ? ORDER BY created_at').all(id);
      if (remaining.length > 0) {
        db.prepare(
          `UPDATE rfp_scans SET
            proposal_filename = ?, proposal_original_name = ?,
            proposal_metadata = NULL, proposal_fit_overall = NULL,
            proposal_analysis_status = 'pending', proposal_analysis_progress = NULL,
            last_proposal_analyzed_at = NULL WHERE id = ?`
        ).run(remaining[0].filename, remaining[0].original_name, id);
        db.prepare('DELETE FROM proposal_coverage WHERE scan_id = ?').run(id);
        res.status(200).json({ ok: true, remaining: remaining.length });
        analyseProposalAgainstRfp(id).catch(e => {
          console.error(`[proposal-fit ${id}] re-run after doc removal:`, e.message);
          try {
            db.prepare("UPDATE rfp_scans SET proposal_analysis_status='error', proposal_analysis_progress=? WHERE id=?")
              .run(e.message?.slice(0, 200) || 'unknown error', id);
          } catch {}
        });
        return;
      }
      // Fall through to full clear when that was the last doc
    }

    // Full clear: every doc file + rows + legacy columns
    const docs = db.prepare('SELECT filename FROM rfp_scan_proposal_docs WHERE scan_id = ?').all(id);
    for (const d of docs) {
      try { fs.unlinkSync(path.join(uploadDir, d.filename)); } catch {}
    }
    if (scan.proposal_filename && !docs.some(d => d.filename === scan.proposal_filename)) {
      try { fs.unlinkSync(path.join(uploadDir, scan.proposal_filename)); } catch {}
    }
    db.prepare('DELETE FROM rfp_scan_proposal_docs WHERE scan_id = ?').run(id);
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
