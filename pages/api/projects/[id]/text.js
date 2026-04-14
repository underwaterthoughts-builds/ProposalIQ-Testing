import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';

// Returns the plain-text extraction that was saved during indexing.
// Looks for `extracted_text.txt` in the upload directory of the first file.
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  const db = getDb();

  const file = db.prepare(
    "SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at LIMIT 1"
  ).get(id);

  if (!file?.path) return res.status(404).json({ error: 'No files found for this project' });

  const uploadDir = path.dirname(file.path);
  const txtPath = path.join(uploadDir, 'extracted_text.txt');

  if (!fs.existsSync(txtPath)) {
    return res.status(404).json({
      error: 'No extracted text available',
      hint: 'Re-analyse this proposal to regenerate the plain-text extraction.',
    });
  }

  try {
    const text = fs.readFileSync(txtPath, 'utf8');
    return res.status(200).json({
      text,
      length: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read extracted text: ' + e.message });
  }
}

export default requireAuth(handler);
