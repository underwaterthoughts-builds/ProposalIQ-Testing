import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';

// GET /api/rfp/[id]/download — serves the original uploaded RFP file
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const db = getDb();
  const { id } = req.query;

  const scan = db.prepare('SELECT rfp_filename, rfp_original_name FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !scan.rfp_filename) return res.status(404).json({ error: 'RFP file not found' });

  const filePath = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans', scan.rfp_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File no longer exists on disk' });

  const ext = path.extname(scan.rfp_filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const fileName = scan.rfp_original_name || scan.rfp_filename;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}

export default requireAuth(handler);
