import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { parseDocument } from '../../../../lib/parser';
import { embed, analyseProposal, extractPricingFromImages, hasOpenAI } from '../../../../lib/gemini';

// Wrap any promise with a timeout
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms/1000}s — ${label}`)), ms)
    ),
  ]);
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id } = req.query;
  const db = getDb();

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  // Tenant gate — can't reindex other users' projects.
  if (!canAccess(req.user, project)) return res.status(404).json({ error: 'Project not found' });

  const files = db.prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at').all(id);
  if (!files.length) return res.status(400).json({ error: 'No files found — please re-upload' });

  const uploadDir = path.dirname(files[0].path);

  db.prepare("UPDATE projects SET indexing_status = 'indexing', indexed_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  res.status(202).json({ message: 'Re-analysis started' });

  // Use a genuine async background process — not setImmediate which can be reaped
  ;(async () => {
    // Safety net: if anything throws at all, mark as error
    const fail = (msg) => {
      console.error('Reindex failed for', id, ':', msg);
      try { db.prepare("UPDATE projects SET indexing_status = 'error' WHERE id = ?").run(id); } catch {}
    };

    try {
      // ── 1. GET TEXT ────────────────────────────────────────────────────────
      let text = '';
      const txtPath = path.join(uploadDir, 'extracted_text.txt');
      if (fs.existsSync(txtPath)) {
        try { text = fs.readFileSync(txtPath, 'utf8'); } catch {}
      }

      if (!text || text.trim().length < 50) {
        for (const f of files) {
          if (!fs.existsSync(f.path)) continue;
          try {
            const parsed = await withTimeout(parseDocument(f.path), 30000, 'parseDocument');
            if (parsed && parsed.trim().length > text.trim().length) {
              text += `\n\n=== ${f.file_type.toUpperCase()} ===\n${parsed}`;
            }
          } catch (e) { console.error('Parse error:', f.file_type, e.message); }
        }
        if (text.trim().length > 50) {
          try { fs.writeFileSync(txtPath, text, 'utf8'); } catch {}
        }
      }

      // ── 2. AI ANALYSIS (with timeout) ─────────────────────────────────────
      const notes = [project.went_well, project.improvements, project.lessons].filter(Boolean).join('. ');
      let metadata;

      if (text.trim().length > 200) {
        try {
          metadata = await withTimeout(
            analyseProposal(text, project.user_rating, notes),
            90000, // 90s timeout for OpenAI
            'analyseProposal'
          );
        } catch (e) {
          console.error('Analysis timed out or failed for', id, ':', e.message);
          // Fall back to existing metadata rather than failing entirely
          metadata = JSON.parse(project.ai_metadata || '{}');
          if (!metadata.executive_summary) metadata.executive_summary = project.description || project.name;
        }
      } else {
        metadata = JSON.parse(project.ai_metadata || '{}');
        if (!metadata.executive_summary) metadata.executive_summary = project.description || project.name;
      }

      // ── 3. EMBEDDING (with timeout) ───────────────────────────────────────
      const embParts = [
        project.name, project.client, project.sector, project.description,
        metadata.executive_summary || '',
        (metadata.key_themes || []).join(' '),
        (metadata.deliverables || []).join(' '),
        (metadata.methodologies || []).join(' '),
        (metadata.tools_technologies || []).join(' '),
        (metadata.value_propositions || []).join(' '),
      ].filter(Boolean);

      let vec;
      try {
        vec = await withTimeout(embed(embParts.join(' ')), 30000, 'embed');
      } catch (e) {
        console.error('Embedding failed for', id, ':', e.message);
        // Keep existing embedding if we have one, rather than nulling it
        try {
          const existing = db.prepare('SELECT embedding FROM projects WHERE id = ?').get(id);
          vec = existing?.embedding ? JSON.parse(existing.embedding) : null;
        } catch { vec = null; }
      }

      // ── 4. KQS SCORES ─────────────────────────────────────────────────────
      const submitted = project.date_submitted;
      const ageYears = submitted
        ? (Date.now() - new Date(submitted).getTime()) / (1000 * 60 * 60 * 24 * 365) : 1;
      const kqsRecency = Math.max(0.2, Math.min(1, 1 - ageYears / 5));
      const kqsOutcome = project.outcome === 'won' ? 1.0 : project.outcome === 'lost' ? 0.35 : 0.6;
      const kqsSpecificity = text.length > 500
        ? Math.min(1, 0.5 + (metadata.credibility_signals?.overall_score || 50) / 200) : 0.50;
      const kqsComposite = (kqsRecency + kqsOutcome + kqsSpecificity) / 3;

      // ── 5. SAVE ────────────────────────────────────────────────────────────
      // Don't overwrite a user-edited taxonomy on reindex.
      const existingSrc = db.prepare('SELECT taxonomy_source FROM projects WHERE id = ?').get(id);
      const userEdited = existingSrc?.taxonomy_source === 'user';
      const taxFields = userEdited ? '' :
        ', service_industry = ?, service_sectors = ?, client_industry = ?, client_sectors = ?, taxonomy_source = \'ai\'';
      const taxParams = userEdited ? [] : [
        metadata.service_industry || null,
        JSON.stringify(metadata.service_sectors || []),
        metadata.client_industry || null,
        JSON.stringify(metadata.client_sectors || []),
      ];

      // Record which model did the heavy lifting. OpenAI configured → 'gpt'
      // (deep analysis ran). No OpenAI key → Gemini-only fast path → 'gemini'.
      const analysisModel = hasOpenAI() ? 'gpt' : 'gemini';

      db.prepare(`UPDATE projects SET
        ai_metadata = ?, ${vec ? 'embedding = ?,' : ''}
        kqs_recency = ?, kqs_outcome_quality = ?, kqs_specificity = ?, kqs_composite = ?,
        analysis_model = ?
        ${taxFields},
        indexing_status = 'complete', indexed_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        ...[
          JSON.stringify(metadata),
          ...(vec ? [JSON.stringify(vec)] : []),
          kqsRecency, kqsOutcome, kqsSpecificity, kqsComposite,
          analysisModel,
          ...taxParams,
          id,
        ]
      );

      // Vision pricing fallback — if contract_value is still 0 or null, try image extraction
      if (!project.contract_value || project.contract_value === 0) {
        try {
          const pdfFile = files.find(f => f.path?.toLowerCase().endsWith('.pdf'));
          if (pdfFile && fs.existsSync(pdfFile.path)) {
            const visionResult = await withTimeout(
              extractPricingFromImages(pdfFile.path),
              20000, 'visionPricing'
            );
            if (visionResult?.contract_value) {
              const numVal = parseFloat(String(visionResult.contract_value).replace(/[^0-9.]/g, '')) || 0;
              if (numVal > 0) {
                db.prepare('UPDATE projects SET contract_value = ?, currency = COALESCE(NULLIF(currency,\'\'), ?) WHERE id = ?')
                  .run(numVal, visionResult.currency || 'GBP', id);
                console.log(`[reindex ${id}] Vision pricing: ${numVal} ${visionResult.currency} (${visionResult.found_in})`);
              }
            }
          }
        } catch (e) { console.error('reindex vision pricing fallback:', e.message); }
      }

      // Update library.json
      try {
        fs.writeFileSync(path.join(uploadDir, 'library.json'), JSON.stringify({
          project_id: id, indexed_at: new Date().toISOString(), schema_version: 2,
          metadata, kqs: { recency: kqsRecency, outcome_quality: kqsOutcome, specificity: kqsSpecificity, composite: kqsComposite },
        }, null, 2));
      } catch {}

    } catch (e) {
      fail(e.message || String(e));
    }
  })().catch(e => {
    // Final catch — should never reach here but ensures status is always updated
    console.error('Reindex outer catch for', id, ':', e.message);
    try { db.prepare("UPDATE projects SET indexing_status = 'error' WHERE id = ?").run(id); } catch {}
  });
}

export default requireAuth(handler);
