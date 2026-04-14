import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';

// Returns everything the system has saved for a project:
// - the projects row (decoded: ai_metadata, taxonomy, etc.)
// - associated files
// - indexing log entries
// - narrative entries
// - library.json from disk if present
// Output is a single pretty-printed JSON payload for user-facing display.
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  const db = getDb();

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Decode JSON-stringified columns for readability
  const decode = (v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  for (const col of [
    'ai_metadata', 'taxonomy', 'embedding',
    'service_sectors', 'client_sectors',
  ]) {
    if (project[col] != null) project[col] = decode(project[col]);
  }

  // Files
  const files = db.prepare(
    'SELECT id, file_type, file_name, mime_type, size_bytes, created_at FROM project_files WHERE project_id = ? ORDER BY created_at'
  ).all(id);

  // Indexing log
  const logs = db.prepare(
    'SELECT stage, status, message, created_at FROM indexing_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(id);

  // Narrative entries
  let narrativeEntries = [];
  try {
    narrativeEntries = db.prepare(
      'SELECT * FROM project_narrative_entries WHERE project_id = ? ORDER BY created_at'
    ).all(id);
  } catch {}

  // library.json on disk (written during indexing)
  let libraryJson = null;
  try {
    const firstFile = db.prepare(
      'SELECT path FROM project_files WHERE project_id = ? ORDER BY created_at LIMIT 1'
    ).get(id);
    if (firstFile?.path) {
      const libPath = path.join(path.dirname(firstFile.path), 'library.json');
      if (fs.existsSync(libPath)) {
        libraryJson = JSON.parse(fs.readFileSync(libPath, 'utf8'));
      }
    }
  } catch (e) {
    libraryJson = { error: 'Failed to read library.json: ' + e.message };
  }

  // Trim embedding — it's a 768+-dim vector, noisy in human view
  if (Array.isArray(project.embedding)) {
    project.embedding = `[${project.embedding.length}-dim vector — omitted]`;
  }

  return res.status(200).json({
    project,
    files,
    indexing_log: logs,
    narrative_entries: narrativeEntries,
    library_json: libraryJson,
  });
}

export default requireAuth(handler);
