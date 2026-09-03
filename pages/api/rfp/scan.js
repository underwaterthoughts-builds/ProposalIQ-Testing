import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureDir } from '../../../lib/storage';
import { runRfpScanPipeline } from '../../../lib/rfp-pipeline';
import { analyseProposalAgainstRfp } from '../../../lib/proposal-fit';
import { scope, ownerId } from '../../../lib/tenancy';
import { parseDocument } from '../../../lib/parser';

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const t = scope(req.user);
    const scans = db.prepare(`SELECT id,name,status,created_at,bid_score FROM rfp_scans WHERE 1=1${t.clause} ORDER BY created_at DESC LIMIT 20`).all(...t.params);
    // Parse bid_score once so the UI can read .score / .decision without
    // calling JSON.parse on every render.
    const hydrated = scans.map(s => {
      let bs = null;
      try { bs = s.bid_score ? JSON.parse(s.bid_score) : null; } catch {}
      return { ...s, bid_score: bs };
    });
    return res.status(200).json({ scans: hydrated });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const scanId = uuid();
  const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans');
  ensureDir(uploadDir);
  const form = formidable({ uploadDir, keepExtensions: true, maxFileSize: 30 * 1024 * 1024 });
  let fields, files;
  try {
    [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
    });
  } catch (e) { return res.status(400).json({ error: 'Upload failed: ' + e.message }); }

  const f = k => Array.isArray(fields[k]) ? fields[k][0] : (fields[k] || '');
  const rfpFileArr = files['rfp'];
  const rfpFile = Array.isArray(rfpFileArr) ? rfpFileArr[0] : rfpFileArr;
  if (!rfpFile?.filepath) return res.status(400).json({ error: 'RFP file required' });

  const ext = path.extname(rfpFile.originalFilename || rfpFile.filepath);
  const newName = `rfp_${scanId}${ext}`;
  const newPath = path.join(uploadDir, newName);
  fs.renameSync(rfpFile.filepath, newPath);

  // Optional companion proposal — user can attach their draft response
  // alongside the RFP at scan creation. Validated and stored here; the
  // proposal-fit pass kicks off after the main scan is up.
  const ALLOWED_PROPOSAL_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.md']);
  const propArr = files['proposal'];
  const propFile = Array.isArray(propArr) ? propArr[0] : propArr;
  let proposalSavedName = null;
  let proposalOriginalName = null;
  if (propFile?.filepath) {
    const propExt = path.extname(propFile.originalFilename || propFile.filepath).toLowerCase();
    if (ALLOWED_PROPOSAL_EXT.has(propExt)) {
      proposalSavedName = `proposal_${scanId}_${uuid()}${propExt}`;
      const propPath = path.join(uploadDir, proposalSavedName);
      try {
        fs.renameSync(propFile.filepath, propPath);
        proposalOriginalName = propFile.originalFilename || proposalSavedName;
      } catch {
        proposalSavedName = null;
        proposalOriginalName = null;
      }
    } else {
      try { fs.unlinkSync(propFile.filepath); } catch {}
    }
  }

  // Scan mode: 'fast' (gpt-4o default, ~60-90s) or 'deep' (gpt-5.5 default,
  // ~5-15 min). Tier-1 reasoning calls and tier-5 QA hardcode their own
  // models in lib/gemini.js so quality on those steps is identical in
  // both modes — the difference is the bulk extraction/scoring/news layer.
  const scanMode = f('scan_mode') === 'fast' ? 'fast' : 'deep';

  // Delivery partners for a partnership bid — JSON array of
  // { name, capabilities, website? }. Stored per-scan; the pipeline folds
  // them into the org-context block so partner capabilities count as
  // available when detecting gaps.
  let partners = [];
  try {
    const raw = JSON.parse(f('partners') || '[]');
    if (Array.isArray(raw)) {
      partners = raw
        .filter(p => p && String(p.name || '').trim())
        .slice(0, 6)
        .map(p => ({
          name: String(p.name).trim().slice(0, 200),
          capabilities: String(p.capabilities || '').trim().slice(0, 2000),
          website: String(p.website || '').trim().slice(0, 300),
        }));
    }
  } catch {}

  // Named CVs for this bid (PDF/DOCX/DOC/TXT, up to 8). Saved now; text
  // extraction happens in the fire-and-forget block before the pipeline
  // starts so the analysis can read them.
  const ALLOWED_CV_EXT = new Set(['.pdf', '.docx', '.doc', '.txt']);
  const cvArr = files['cvs'] ? (Array.isArray(files['cvs']) ? files['cvs'] : [files['cvs']]) : [];
  const savedCvs = [];
  for (const cv of cvArr.slice(0, 8)) {
    if (!cv?.filepath) continue;
    const cvExt = path.extname(cv.originalFilename || cv.filepath).toLowerCase();
    if (!ALLOWED_CV_EXT.has(cvExt)) { try { fs.unlinkSync(cv.filepath); } catch {} continue; }
    const cvName = `cv_${scanId}_${uuid()}${cvExt}`;
    try {
      fs.renameSync(cv.filepath, path.join(uploadDir, cvName));
      savedCvs.push({ filename: cvName, original: cv.originalFilename || cvName });
    } catch {}
  }

  db.prepare(
    `INSERT INTO rfp_scans (
      id, name, rfp_filename, rfp_original_name, status, owner_user_id,
      proposal_filename, proposal_original_name, proposal_uploaded_at, proposal_analysis_status, scan_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${proposalSavedName ? 'CURRENT_TIMESTAMP' : 'NULL'}, ?, ?)`
  ).run(
    scanId, f('name') || rfpFile.originalFilename || 'RFP Scan', newName, rfpFile.originalFilename || newName, 'processing', ownerId(req.user),
    proposalSavedName, proposalOriginalName, proposalSavedName ? 'pending' : null, scanMode
  );

  // Persist partner rows before responding — cheap inserts.
  for (const p of partners) {
    db.prepare('INSERT INTO rfp_scan_partners (id, scan_id, name, capabilities, website) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), scanId, p.name, p.capabilities, p.website);
  }

  res.status(202).json({ scanId, message: 'Processing started' });

  // Fire-and-forget the main RFP pipeline. When a companion proposal is
  // attached, the proposal-fit pass runs after the RFP scan finishes so
  // it has rfp_data.requirements available to score against.
  // CV text extraction runs first (a few seconds each) so the pipeline's
  // org-context load sees the extracted text.
  const userId = req.user?.id || null;
  (async () => {
    for (const cv of savedCvs) {
      let text = '';
      try {
        text = (await parseDocument(path.join(uploadDir, cv.filename)))?.slice(0, 20000) || '';
      } catch (e) {
        console.error(`[scan ${scanId}] CV parse failed for ${cv.original}:`, e.message);
      }
      const personName = cv.original.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
      try {
        db.prepare('INSERT INTO rfp_scan_cvs (id, scan_id, filename, original_name, person_name, extracted_text) VALUES (?, ?, ?, ?, ?, ?)')
          .run(uuid(), scanId, cv.filename, cv.original, personName, text);
      } catch (e) {
        console.error(`[scan ${scanId}] CV insert failed:`, e.message);
      }
    }
  })()
    .then(() => runRfpScanPipeline(scanId, newPath, userId, scanMode))
    .then(() => {
      if (proposalSavedName) {
        return analyseProposalAgainstRfp(scanId).catch(e => {
          console.error(`[proposal-fit ${scanId}] post-scan catch:`, e.message);
          try {
            db.prepare("UPDATE rfp_scans SET proposal_analysis_status='error', proposal_analysis_progress = ? WHERE id=?")
              .run(e.message?.slice(0, 200) || 'unknown error', scanId);
          } catch {}
        });
      }
    })
    .catch(e => {
      console.error(`[scan ${scanId}] outer catch:`, e.message);
      try {
        db.prepare("UPDATE rfp_scans SET status='error' WHERE id=?").run(scanId);
        // If a proposal was attached, flip its status too — otherwise the
        // proposal-fit tab spins on "Analysing…" forever waiting for a
        // pipeline that never finishes.
        if (proposalSavedName) {
          db.prepare("UPDATE rfp_scans SET proposal_analysis_status='error', proposal_analysis_progress=? WHERE id=?")
            .run('RFP scan failed before requirements were extracted', scanId);
        }
      } catch {}
    });
}

export default requireAuth(handler);
