import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureDir } from '../../../lib/storage';
import { runRfpScanPipeline } from '../../../lib/rfp-pipeline';

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const scans = db.prepare('SELECT id,name,status,created_at FROM rfp_scans ORDER BY created_at DESC LIMIT 20').all();
    return res.status(200).json({ scans });
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

  db.prepare('INSERT INTO rfp_scans (id,name,rfp_filename,rfp_original_name,status) VALUES (?,?,?,?,?)').run(
    scanId, f('name') || rfpFile.originalFilename || 'RFP Scan', newName, rfpFile.originalFilename || newName, 'processing'
  );

  res.status(202).json({ scanId, message: 'Processing started' });

  // Fire-and-forget the pipeline so the user can poll for status
  runRfpScanPipeline(scanId, newPath).catch(e => {
    console.error(`[scan ${scanId}] outer catch:`, e.message);
    try { db.prepare("UPDATE rfp_scans SET status='error' WHERE id=?").run(scanId); } catch {}
  });
}

export default requireAuth(handler);
