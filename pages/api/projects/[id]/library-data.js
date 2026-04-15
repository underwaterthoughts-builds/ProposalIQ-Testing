import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';

// Returns everything the system has saved for a project:
// - the projects row (decoded: ai_metadata, taxonomy, etc.)
// - associated files
// - indexing log entries
// - narrative entries
// - library.json from disk if present
// Output is a single pretty-printed JSON payload for user-facing display.
// Defensive single-query helper so missing columns / tables never 500 the
// whole endpoint — we just leave that section out of the dump.
function safeQuery(label, fn) {
  try { return fn(); } catch (e) { return { _error: `${label}: ${e.message}` }; }
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;

  try {
    const db = getDb();

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    // Tenant gate — hide other users' projects behind 404.
    if (!canAccess(req.user, project)) return res.status(404).json({ error: 'Project not found' });

    const decode = (v) => {
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return v; }
    };
    for (const col of ['ai_metadata', 'taxonomy', 'embedding', 'service_sectors', 'client_sectors']) {
      if (project[col] != null) project[col] = decode(project[col]);
    }
    if (Array.isArray(project.embedding)) {
      project.embedding = `[${project.embedding.length}-dim vector — omitted]`;
    }

    const files = safeQuery('files', () => db.prepare(
      'SELECT id, file_type, file_name, mime_type, size_bytes, created_at FROM project_files WHERE project_id = ? ORDER BY created_at'
    ).all(id));

    const logs = safeQuery('indexing_log', () => db.prepare(
      'SELECT stage, status, message, created_at FROM indexing_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(id));

    const narrativeEntries = safeQuery('narrative', () => db.prepare(
      'SELECT * FROM project_narrative_entries WHERE project_id = ? ORDER BY created_at'
    ).all(id));

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

    return res.status(200).json({
      project,
      files,
      indexing_log: logs,
      narrative_entries: narrativeEntries,
      library_json: libraryJson,
    });
  } catch (e) {
    return res.status(500).json({ error: 'library-data failed: ' + (e?.message || 'unknown') });
  }
}

export default requireAuth(handler);
