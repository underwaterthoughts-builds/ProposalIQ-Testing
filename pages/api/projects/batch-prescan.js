import path from 'path';
import fs from 'fs';
import os from 'os';
import { requireAuth } from '../../../lib/auth';
import { parseDocument } from '../../../lib/parser';
import { prescanDocument } from '../../../lib/gemini';

const TMP_ROOT = path.join(os.tmpdir(), 'proposaliq-batch');

// POST /api/projects/batch-prescan
// Body: { tempIds: ["uuid", ...], primaryTempId?: "uuid" }
//
// Used by the BatchModal when a clustered row contains multiple files
// (primary + attachments). Reads each file from the batch-cluster temp
// dir, concatenates their text, and runs prescanDocument on the
// combined input so values from supporting docs (e.g. AED contract
// total in a Commercial.pdf attached to a Technical.pdf primary) are
// surfaced for the per-row metadata form.
//
// Returns the same shape as /api/projects/prescan: { extracted,
// confidence, note?, text_length }.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const tempIds = Array.isArray(body.tempIds) ? body.tempIds.filter(Boolean) : [];
  if (tempIds.length === 0) return res.status(400).json({ error: 'tempIds array required' });

  // Validate each tempId looks UUID-ish (defence against path traversal —
  // we don't want a tempId like "../../etc/passwd" passed in).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!tempIds.every(id => UUID_RE.test(id))) {
    return res.status(400).json({ error: 'tempIds must be UUIDs' });
  }

  const primaryId = body.primaryTempId && tempIds.includes(body.primaryTempId)
    ? body.primaryTempId
    : tempIds[0];

  // Resolve each tempId to its on-disk path (batch-cluster saved them as
  // `${tempId}${ext}` in TMP_ROOT). Tolerate missing files — the row may
  // have been partially cleaned up.
  function findTempFile(id) {
    try {
      const entries = fs.readdirSync(TMP_ROOT);
      const hit = entries.find(e => e.startsWith(id + '.'));
      return hit ? path.join(TMP_ROOT, hit) : null;
    } catch { return null; }
  }

  let combined = '';
  let primaryPath = null;
  let parseErrors = 0;
  for (const id of tempIds) {
    const fp = findTempFile(id);
    if (!fp) { parseErrors++; continue; }
    if (id === primaryId) primaryPath = fp;
    let text = '';
    try { text = await parseDocument(fp); } catch (e) { console.error('batch-prescan parse:', e.message); parseErrors++; continue; }
    if (!text || text.trim().length < 20) continue;
    const name = path.basename(fp);
    combined += `\n\n=== ${id === primaryId ? 'PRIMARY' : 'SUPPORTING'}: ${name} ===\n${text}`;
  }

  if (combined.trim().length < 50) {
    return res.status(200).json({
      extracted: {}, confidence: 'low',
      note: parseErrors > 0
        ? `Could not parse ${parseErrors} of ${tempIds.length} file(s). Try again or fill in details manually.`
        : 'Not enough text extracted. Please fill in details manually.',
    });
  }

  // Use the primary's filename as the hint and its path for the vision
  // fallback — most likely to have the cover-page branding / title.
  const filenameHint = primaryPath ? path.basename(primaryPath) : '';
  let result;
  try {
    result = await prescanDocument(combined, filenameHint, primaryPath || null);
  } catch (e) {
    console.error('batch-prescan prescanDocument failed:', e.message);
    return res.status(200).json({ extracted: {}, confidence: 'low', note: 'AI scan failed — fill in manually.' });
  }
  return res.status(200).json({ ...result, text_length: combined.length });
}

export default requireAuth(handler);
