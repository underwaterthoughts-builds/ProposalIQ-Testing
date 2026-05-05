import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../../../lib/auth';
import { parseDocument } from '../../../lib/parser';
import { classifyDocument } from '../../../lib/document-classifier';
import { detectProjectCode } from '../../../lib/project-code';
import { pMap } from '../../../lib/concurrency';
import { setCostContext } from '../../../lib/gemini';

export const config = { api: { bodyParser: false } };

// POST /api/projects/batch-cluster
//
// Accepts a multi-file form upload. For each file:
//   - parses first ~5000 chars
//   - classifies subtype (filename → AI fallback)
//   - detects project code (filename regex → header peek → AI)
//
// Then groups files into clusters using:
//   1. Shared project_code (very high confidence)
//   2. Shared filename prefix ≥ 6 chars (high if combined with subtype heterogeneity)
//   3. AI-extracted client/title overlap (medium)
//
// Returns:
//   {
//     items: [{ tempId, name, size, subtype, confidence, project_code }],
//     clusters: [{
//       id, members: [tempId, ...], confidence, signal, project_code, suggested_primary
//     }]
//   }
//
// Files persist in a temp dir keyed by tempId so the subsequent
// /api/projects/upload calls can re-find them. The client passes the
// tempId list back when committing. This avoids re-uploading the bytes
// just to commit a confirmed cluster.

const TMP_ROOT = path.join(os.tmpdir(), 'proposaliq-batch');
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.csv', '.txt', '.md']);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  setCostContext({ category: 'batch_cluster', scanId: null, projectId: null });

  try { fs.mkdirSync(TMP_ROOT, { recursive: true }); } catch {}

  const form = formidable({
    uploadDir: TMP_ROOT, keepExtensions: true,
    maxFileSize: MAX_FILE_BYTES, multiples: true,
  });
  let fields, files;
  try {
    [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
    });
  } catch (e) { return res.status(400).json({ error: 'Upload failed: ' + e.message }); }

  const incoming = []
    .concat(Array.isArray(files['files']) ? files['files'] : (files['files'] ? [files['files']] : []));
  if (!incoming.length) return res.status(400).json({ error: 'At least one file required (field: files)' });

  // Persist each file under a stable tempId, parse + classify + detect code
  const items = [];
  for (const up of incoming) {
    if (!up?.filepath) continue;
    const ext = path.extname(up.originalFilename || up.filepath).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      try { fs.unlinkSync(up.filepath); } catch {}
      continue;
    }
    const tempId = uuid();
    const stableName = `${tempId}${ext}`;
    const stablePath = path.join(TMP_ROOT, stableName);
    try { fs.renameSync(up.filepath, stablePath); }
    catch (e) { console.error('batch-cluster save failed:', e.message); continue; }
    items.push({
      tempId, stablePath,
      originalName: up.originalFilename || stableName,
      size: up.size || 0,
      ext,
    });
  }

  // Parallel classify + project-code, capped concurrency
  await pMap(items.map(it => async () => {
    try {
      it.text = await parseDocument(it.stablePath);
    } catch (e) { it.text = ''; }
    try {
      const c = await classifyDocument(it.stablePath, it.originalName);
      it.subtype = c?.subtype || 'unknown';
      it.confidence = c?.confidence || 0;
    } catch { it.subtype = 'unknown'; it.confidence = 0; }
    try {
      const code = await detectProjectCode({ originalName: it.originalName, extractedText: it.text });
      it.project_code = code?.code || null;
      it.code_confidence = code?.confidence || 0;
      it.code_source = code?.source || null;
    } catch { it.project_code = null; }
  }), 5);

  // Build clusters
  const clusters = buildClusters(items);

  // Trim text from response — large
  const itemsResp = items.map(it => ({
    tempId: it.tempId,
    name: it.originalName,
    size: it.size,
    subtype: it.subtype,
    classification_confidence: it.confidence,
    project_code: it.project_code,
    code_confidence: it.code_confidence,
  }));

  return res.status(200).json({ items: itemsResp, clusters });
}

function commonPrefix(a, b) {
  let n = 0;
  const len = Math.min(a.length, b.length);
  while (n < len && a[n].toLowerCase() === b[n].toLowerCase()) n++;
  return n;
}

function buildClusters(items) {
  if (items.length < 2) return [];
  const used = new Set();
  const clusters = [];

  // Pass 1: shared project_code (highest confidence)
  const byCode = new Map();
  for (const it of items) {
    if (!it.project_code) continue;
    const arr = byCode.get(it.project_code) || [];
    arr.push(it);
    byCode.set(it.project_code, arr);
  }
  for (const [code, members] of byCode) {
    if (members.length < 2) continue;
    for (const m of members) used.add(m.tempId);
    clusters.push({
      id: `code-${code}`,
      members: members.map(m => m.tempId),
      confidence: 'high',
      signal: 'shared_project_code',
      project_code: code,
      suggested_primary: pickPrimary(members),
    });
  }

  // Pass 2: shared filename prefix (medium confidence)
  // Use a simple greedy: for each pair of unused items, if the common
  // prefix on the basename (excluding extension) is ≥ 8 chars AND not a
  // boring stem like "proposal_", group them.
  const remaining = items.filter(it => !used.has(it.tempId));
  for (let i = 0; i < remaining.length; i++) {
    if (used.has(remaining[i].tempId)) continue;
    const basei = path.basename(remaining[i].originalName, path.extname(remaining[i].originalName));
    const cluster = [remaining[i]];
    for (let j = i + 1; j < remaining.length; j++) {
      if (used.has(remaining[j].tempId)) continue;
      const basej = path.basename(remaining[j].originalName, path.extname(remaining[j].originalName));
      const cp = commonPrefix(basei, basej);
      // Require 8+ chars common AND not a generic word like "proposal" / "response"
      if (cp >= 8) {
        const stem = basei.slice(0, cp).toLowerCase();
        if (!/^(proposal|response|submission|document|untitled|copy[-_ ]of)\b/.test(stem)) {
          cluster.push(remaining[j]);
        }
      }
    }
    if (cluster.length >= 2) {
      for (const m of cluster) used.add(m.tempId);
      clusters.push({
        id: `prefix-${cluster[0].tempId}`,
        members: cluster.map(m => m.tempId),
        confidence: 'medium',
        signal: 'shared_filename_prefix',
        project_code: null,
        suggested_primary: pickPrimary(cluster),
      });
    }
  }

  return clusters;
}

// Heuristic for the primary file in a cluster: prefer a main_proposal,
// then technical_proposal, then largest file. Returns the tempId.
const PRIMARY_PRIORITY = ['main_proposal', 'technical_proposal', 'commercial_proposal', 'rfp', 'methodology', 'cover_letter'];
function pickPrimary(members) {
  for (const subtype of PRIMARY_PRIORITY) {
    const hit = members.find(m => m.subtype === subtype);
    if (hit) return hit.tempId;
  }
  return [...members].sort((a, b) => (b.size || 0) - (a.size || 0))[0].tempId;
}

export default requireAuth(handler);
