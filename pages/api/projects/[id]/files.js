import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { projectDir } from '../../../../lib/storage';
import { parseDocument } from '../../../../lib/parser';
import { classifyDocument } from '../../../../lib/document-classifier';
import { analyzeDocument } from '../../../../lib/document-analyzers';
import { synthesiseProject } from '../../../../lib/proposal-synthesis';
import { detectProjectCode } from '../../../../lib/project-code';
import { pMap } from '../../../../lib/concurrency';
import { setCostContext, hasOpenAI } from '../../../../lib/gemini';

export const config = { api: { bodyParser: false } };

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.csv', '.txt', '.md']);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// POST /api/projects/[id]/files — attach one or more files to an existing
// project. Each file is classified, parsed, analysed; the project's
// extracted_text.txt is rebuilt; the project-level ai_metadata is
// re-synthesised. Used by the post-import "Attach more files" affordance
// on /repository/[id].
//
// DELETE /api/projects/[id]/files?fileId=... — remove a single attachment.
// Triggers the same rebuild + re-synthesis on the remaining files.
async function handler(req, res) {
  const db = getDb();
  const { id } = req.query;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project || !canAccess(req.user, project)) return res.status(404).json({ error: 'Project not found' });

  const uploadDir = projectDir(id);

  if (req.method === 'POST') {
    const form = formidable({ uploadDir, keepExtensions: true, maxFileSize: MAX_FILE_BYTES, multiples: true });
    let files;
    try {
      [, files] = await new Promise((resolve, reject) => {
        form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
      });
    } catch (e) { return res.status(400).json({ error: 'Upload failed: ' + e.message }); }

    const incoming = []
      .concat(Array.isArray(files['files']) ? files['files'] : (files['files'] ? [files['files']] : []))
      .concat(Array.isArray(files['supporting']) ? files['supporting'] : (files['supporting'] ? [files['supporting']] : []));
    if (!incoming.length) return res.status(400).json({ error: 'At least one file required (field: files)' });

    const accepted = [];
    for (const up of incoming) {
      if (!up?.filepath) continue;
      const ext = path.extname(up.originalFilename || up.filepath).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        try { fs.unlinkSync(up.filepath); } catch {}
        continue;
      }
      const newName = `extra_${uuid()}${ext}`;
      const newPath = path.join(uploadDir, newName);
      try {
        fs.renameSync(up.filepath, newPath);
        const rowId = uuid();
        db.prepare(
          'INSERT INTO project_files (id, project_id, file_type, filename, original_name, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(rowId, id, 'additional', newName, up.originalFilename || newName, up.size || 0, newPath);
        accepted.push({ rowId, savedPath: newPath, originalName: up.originalFilename || newName });
      } catch (e) { console.error('attach save failed:', e.message); }
    }

    if (!accepted.length) return res.status(400).json({ error: 'No valid files (allowed: PDF, DOCX, DOC, XLSX, CSV, TXT, MD)' });

    res.status(202).json({ ok: true, attached: accepted.length, message: 'Re-analysing project with new documents' });

    // Background: parse + classify + analyse the new files, rebuild combined
    // text, re-synthesise project metadata.
    ;(async () => {
      try {
        await rebuildAndSynthesise(db, project, id);
      } catch (e) {
        console.error('[files attach] rebuild failed:', e.message);
        try { db.prepare("UPDATE projects SET indexing_status = 'error' WHERE id = ?").run(id); } catch {}
      }
    })();
    return;
  }

  if (req.method === 'DELETE') {
    const fileId = req.query.fileId;
    if (!fileId) return res.status(400).json({ error: 'fileId required' });
    const row = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(fileId, id);
    if (!row) return res.status(404).json({ error: 'File not found' });
    try { if (row.path && fs.existsSync(row.path)) fs.unlinkSync(row.path); } catch {}
    db.prepare('DELETE FROM project_files WHERE id = ?').run(fileId);

    res.status(202).json({ ok: true, message: 'File removed; re-synthesising project metadata' });
    ;(async () => {
      try { await rebuildAndSynthesise(db, project, id); }
      catch (e) { console.error('[files delete] rebuild failed:', e.message); }
    })();
    return;
  }

  return res.status(405).end();
}

// Re-parse, re-classify (only files without a subtype), re-analyse,
// rewrite extracted_text.txt, re-synthesise project ai_metadata. Idempotent.
async function rebuildAndSynthesise(db, project, projectId) {
  setCostContext({ category: 'proposal_doc_analysis', scanId: null, projectId });
  db.prepare("UPDATE projects SET indexing_status = 'indexing', indexed_at = CURRENT_TIMESTAMP WHERE id = ?").run(projectId);

  const files = db.prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at').all(projectId);
  const parsed = [];
  for (const f of files) {
    if (!fs.existsSync(f.path)) continue;
    let text = '';
    try { text = await parseDocument(f.path); } catch (e) { console.error('parse fail:', e.message); }
    parsed.push({
      fileRowId: f.id, file_type: f.file_type,
      originalName: f.original_name || f.filename, savedPath: f.path,
      text: text || '', subtype: f.subtype || null,
      analysis: null,
    });
  }

  await pMap(parsed.filter(p => !p.subtype).map(p => async () => {
    try {
      const c = await classifyDocument(p.savedPath, p.originalName);
      p.subtype = c?.subtype || (p.file_type === 'proposal' ? 'main_proposal' : 'unknown');
      p.confidence = c?.confidence || 0;
    } catch { p.subtype = p.file_type === 'proposal' ? 'main_proposal' : 'unknown'; p.confidence = 0; }
    try {
      db.prepare('UPDATE project_files SET subtype = ?, classification_confidence = ? WHERE id = ?').run(p.subtype, p.confidence, p.fileRowId);
    } catch {}
  }), 5);

  const combined = parsed
    .filter(p => p.text && p.text.trim().length > 20)
    .map(p => `\n\n=== ${(p.subtype || 'unknown').toUpperCase()}: ${p.originalName} ===\n${p.text}`)
    .join('');
  const txtPath = path.join(path.dirname(parsed[0]?.savedPath || projectDir(projectId)), 'extracted_text.txt');
  if (combined.trim().length > 50) {
    try { fs.writeFileSync(txtPath, combined, 'utf8'); } catch {}
  }

  // Project code (only if not already set)
  if (!project.project_code) {
    try {
      const codeSource = parsed.find(p => p.subtype === 'main_proposal' && p.text)
                      || parsed.find(p => p.text);
      if (codeSource) {
        const codeHit = await detectProjectCode({ originalName: codeSource.originalName, extractedText: codeSource.text });
        if (codeHit?.code) db.prepare('UPDATE projects SET project_code = ? WHERE id = ?').run(codeHit.code, projectId);
      }
    } catch {}
  }

  const projectCtx = {
    sector: project.sector,
    service_industry: project.service_industry,
    user_rating: project.user_rating,
    notes: [project.went_well, project.improvements, project.lessons].filter(Boolean).join('. '),
    projectId,
  };
  await pMap(parsed.map(p => async () => {
    if (!p.text || p.text.trim().length < 50) {
      p.analysis = { _error: 'text_too_short', _subtype: p.subtype };
      return;
    }
    p.analysis = await analyzeDocument({ subtype: p.subtype, text: p.text, filename: p.originalName, projectCtx });
    try { db.prepare('UPDATE project_files SET ai_metadata = ? WHERE id = ?').run(JSON.stringify(p.analysis || {}), p.fileRowId); } catch {}
  }), 5);

  const synthesised = synthesiseProject(parsed.map(p => ({ filename: p.originalName, subtype: p.subtype, analysis: p.analysis })));
  // Refresh analysis_model so the "Quick scan" banner clears once OpenAI
  // is connected and a re-synthesis has run with it. Mirrors the same
  // hasOpenAI() check used by upload.js and reindex.js.
  const analysisModel = hasOpenAI() ? 'gpt' : 'gemini';
  if (synthesised) {
    try {
      db.prepare("UPDATE projects SET ai_metadata = ?, analysis_model = ?, indexing_status = 'complete', indexed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(JSON.stringify(synthesised), analysisModel, projectId);
      // Mirror reindex.js: if the synthesis surfaced contract_value /
      // currency from a Commercial / pricing_schedule attachment, write
      // it back to the projects row so the UI reflects the real value.
      // Never overwrites a user-set non-zero contract_value.
      const synthValue = parseFloat(synthesised.contract_value);
      const synthCurrency = synthesised.currency;
      if (Number.isFinite(synthValue) && synthValue > 0 && (!project.contract_value || project.contract_value === 0)) {
        db.prepare("UPDATE projects SET contract_value = ?, currency = COALESCE(NULLIF(currency,''), ?) WHERE id = ?")
          .run(synthValue, synthCurrency || null, projectId);
      }
    } catch {}
  } else {
    db.prepare("UPDATE projects SET analysis_model = ?, indexing_status = 'complete', indexed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(analysisModel, projectId);
  }
}

export default requireAuth(handler);
