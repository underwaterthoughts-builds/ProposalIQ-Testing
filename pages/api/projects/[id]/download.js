import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  const db = getDb();

  const files = db.prepare(
    "SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at LIMIT 1"
  ).all(id);

  if (!files.length) return res.status(404).json({ error: 'No files found for this project' });

  // Prefer the proposal file, fall back to first file
  const file = files.find(f => f.file_type === 'proposal') || files[0];

  if (!file?.path || !fs.existsSync(file.path)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(id);
  const ext = path.extname(file.path);
  const safeName = (project?.name || 'proposal').replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_');
  const filename = `${safeName}${ext}`;

  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const contentType = contentTypes[ext.toLowerCase()] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(file.path);
  stream.on('error', () => res.status(500).end());
  stream.pipe(res);
}

export default requireAuth(handler);
