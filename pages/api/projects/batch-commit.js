import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ownerId } from '../../../lib/tenancy';
import { projectDir, ensureDir } from '../../../lib/storage';

const TMP_ROOT = path.join(os.tmpdir(), 'proposaliq-batch');

// POST /api/projects/batch-commit
// Body: {
//   rows: [
//     {
//       primary_temp_id: "uuid",
//       attachment_temp_ids: ["uuid", ...],
//       form: { name, client, sector, ... }
//     },
//     ...
//   ]
// }
//
// For each row, this:
//   1. Creates a project record
//   2. Moves the primary tempfile from TMP_ROOT into the project's
//      upload dir as the 'proposal' file
//   3. Moves each attachment tempfile in as 'additional' files
//   4. Returns 202 with the projectIds; the existing reindex pipeline
//      handles per-doc classification + analysis + synthesis on first
//      load (status 'pending' until reindex picks it up — caller can
//      hit /api/projects/[id]/reindex if it wants immediate analysis,
//      or rely on the upload.js pipeline being kicked next time the
//      project is touched).
//
// To trigger immediate analysis, the caller can POST to
// /api/projects/[id]/reindex per project after this endpoint returns.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'rows array required' });

  const owner = ownerId(req.user);
  const created = [];
  const errors = [];

  for (const row of rows) {
    try {
      const primaryId = row.primary_temp_id;
      if (!primaryId) { errors.push({ error: 'primary_temp_id missing' }); continue; }

      // Locate the primary file. Tolerant of any extension since the
      // batch-cluster endpoint stamped tempId+ext.
      const primaryPath = findTempFile(primaryId);
      if (!primaryPath) { errors.push({ error: `primary tempfile ${primaryId} not found` }); continue; }

      // ── Move primary file FIRST, before any DB write. If the move
      //    fails (temp dir wiped by a redeploy, disk error, etc.) we
      //    bail without leaving an orphan project row in the DB.
      //    Previous version inserted the project row first and only
      //    moved files after; a redeploy between batch-cluster and
      //    batch-commit wiped /tmp and produced fileless project rows
      //    that the user could neither analyse nor delete cleanly.
      const projectId = uuid();
      const dest = projectDir(projectId);
      ensureDir(dest);

      const pExt = path.extname(primaryPath);
      const pName = `proposal_${uuid()}${pExt}`;
      const pDest = path.join(dest, pName);
      try {
        fs.renameSync(primaryPath, pDest);
      } catch (e) {
        errors.push({ error: `failed to move primary tempfile ${primaryId}: ${e.message}` });
        // No project row was created yet — clean up the empty dir and skip.
        try { fs.rmdirSync(dest); } catch {}
        continue;
      }

      // Move attachments next; a missing attachment is recoverable (skip
      // that attachment, keep the project) but a missing primary is fatal.
      const attachmentDests = [];
      for (const attTempId of (row.attachment_temp_ids || [])) {
        const attPath = findTempFile(attTempId);
        if (!attPath) continue;
        const aExt = path.extname(attPath);
        const aName = `extra_${uuid()}${aExt}`;
        const aDest = path.join(dest, aName);
        try {
          fs.renameSync(attPath, aDest);
          attachmentDests.push({ tempId: attTempId, name: aName, path: aDest });
        } catch { /* skip this attachment */ }
      }

      // ── Now do all the DB writes inside a single transaction so
      //    they either all land or none do.
      const form = row.form || {};
      const rating = parseInt(form.user_rating || '3', 10);
      const AI_WEIGHT = { 0: 0.30, 1: 0.05, 2: 0.15, 3: 0.40, 4: 0.75, 5: 1.00 };
      const insertProject = db.prepare(`INSERT INTO projects
        (id, name, client, sector, contract_value, currency, outcome, user_rating, ai_weight,
         project_type, date_submitted, folder_id, description, went_well, improvements, lessons,
         indexing_status, owner_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`);
      const insertFile = db.prepare(
        'INSERT INTO project_files (id, project_id, file_type, filename, original_name, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      try {
        const tx = db.transaction(() => {
          insertProject.run(
            projectId,
            form.name || path.basename(primaryPath, path.extname(primaryPath)),
            form.client || 'Unknown',
            form.sector || null,
            parseFloat(form.contract_value || '0'),
            form.currency || 'GBP',
            form.outcome || 'pending',
            rating,
            AI_WEIGHT[rating] ?? 0.40,
            form.project_type || null,
            form.date_submitted || null,
            form.folder_id || null,
            form.description || null,
            form.went_well || null,
            form.improvements || null,
            form.lessons || null,
            owner
          );
          insertFile.run(
            uuid(), projectId, 'proposal', pName,
            row.primary_original_name || pName,
            statSize(pDest), pDest
          );
          for (const a of attachmentDests) {
            const origName = (row.attachment_original_names || {})[a.tempId] || a.name;
            insertFile.run(uuid(), projectId, 'additional', a.name, origName, statSize(a.path), a.path);
          }
        });
        tx();
      } catch (e) {
        // DB write failed after files moved — clean up the orphan files
        // so we don't leak disk on retry.
        for (const f of [pDest, ...attachmentDests.map(a => a.path)]) {
          try { fs.unlinkSync(f); } catch {}
        }
        try { fs.rmdirSync(dest); } catch {}
        errors.push({ error: `db write failed for ${form.name || primaryId}: ${e.message}` });
        continue;
      }

      created.push({ projectId, name: form.name, fileCount: 1 + attachmentDests.length });
    } catch (e) {
      console.error('[batch-commit] row failed:', e.message);
      errors.push({ error: e.message });
    }
  }

  return res.status(202).json({
    created: created.length,
    errors: errors.length,
    projects: created,
    message: 'Projects created. Trigger /api/projects/[id]/reindex per project to run AI analysis.',
  });
}

function findTempFile(tempId) {
  if (!tempId) return null;
  try {
    const entries = fs.readdirSync(TMP_ROOT);
    const hit = entries.find(e => e.startsWith(tempId + '.'));
    return hit ? path.join(TMP_ROOT, hit) : null;
  } catch { return null; }
}

function statSize(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

export default requireAuth(handler);
