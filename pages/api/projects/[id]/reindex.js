import path from 'path';
import fs from 'fs';
import { getDb } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { canAccess } from '../../../../lib/tenancy';
import { parseDocument, RMS_SENTINEL } from '../../../../lib/parser';
import { embed, analyseProposal, extractPricingFromImages, hasOpenAI } from '../../../../lib/gemini';
import { AI_ANALYSIS_TIMEOUT_MS, PARSE_TIMEOUT_MS, EMBED_TIMEOUT_MS, VISION_TIMEOUT_MS } from '../../../../lib/timeouts';
import { classifyDocument } from '../../../../lib/document-classifier';
import { detectProjectCode } from '../../../../lib/project-code';
import { analyzeDocument } from '../../../../lib/document-analyzers';
import { synthesiseProject } from '../../../../lib/proposal-synthesis';
import { pMap } from '../../../../lib/concurrency';

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
      // ── 1. PARSE EVERY FILE INDIVIDUALLY (so we can subtype + analyse per-doc)
      // Skip the cached extracted_text.txt — reindex is the place we re-do
      // text extraction so multi-doc submissions get proper subtype-tagged
      // output even on projects uploaded before the multi-doc feature shipped.
      const txtPath = path.join(uploadDir, 'extracted_text.txt');
      const parsedFiles = [];
      const encryptedNames = [];
      for (const f of files) {
        if (!fs.existsSync(f.path)) continue;
        let parsed = '';
        try {
          parsed = await withTimeout(parseDocument(f.path), PARSE_TIMEOUT_MS, 'parseDocument');
        } catch (e) { console.error('Parse error:', f.file_type, e.message); }
        // RMS-encrypted file — record for diagnostic, drop from analysis pool.
        if (parsed === RMS_SENTINEL) {
          encryptedNames.push(f.original_name || f.filename);
          parsed = '';
        }
        parsedFiles.push({
          fileRowId: f.id,
          file_type: f.file_type,
          originalName: f.original_name || f.filename,
          savedPath: f.path,
          text: parsed || '',
          subtype: f.subtype || null,
        });
      }
      if (encryptedNames.length) {
        console.error(`[reindex ${id}] IRM-protected files cannot be analysed: ${encryptedNames.join(', ')}`);
      }

      // ── 2. CLASSIFY any file that doesn't already have a subtype
      await pMap(parsedFiles.filter(pf => !pf.subtype).map(pf => async () => {
        try {
          const c = await classifyDocument(pf.savedPath, pf.originalName);
          if (pf.file_type === 'proposal' && (!c || c.subtype === 'unknown' || c.confidence < 0.4)) {
            pf.subtype = 'main_proposal'; pf.confidence = 0.7;
          } else if (pf.file_type === 'rfp' && (!c || c.confidence < 0.5)) {
            pf.subtype = 'rfp'; pf.confidence = 0.9;
          } else if (pf.file_type === 'budget' && (!c || c.confidence < 0.5)) {
            pf.subtype = 'pricing_schedule'; pf.confidence = 0.85;
          } else {
            pf.subtype = c?.subtype || 'unknown';
            pf.confidence = c?.confidence || 0;
          }
        } catch {
          pf.subtype = pf.file_type === 'proposal' ? 'main_proposal'
                     : pf.file_type === 'rfp'      ? 'rfp'
                     : pf.file_type === 'budget'   ? 'pricing_schedule'
                     : 'unknown';
          pf.confidence = 0;
        }
        try {
          db.prepare('UPDATE project_files SET subtype = ?, classification_confidence = ? WHERE id = ?')
            .run(pf.subtype, pf.confidence, pf.fileRowId);
        } catch {}
      }), 5);

      // ── 3. WRITE subtype-tagged combined text
      const text = parsedFiles
        .filter(pf => pf.text && pf.text.trim().length > 20)
        .map(pf => `\n\n=== ${(pf.subtype || 'unknown').toUpperCase()}: ${pf.originalName} ===\n${pf.text}`)
        .join('');
      if (text.trim().length > 50) {
        try { fs.writeFileSync(txtPath, text, 'utf8'); } catch {}
      }

      // ── 4. PROJECT CODE detection
      try {
        if (!project.project_code) {
          const codeSource = parsedFiles.find(pf => pf.subtype === 'main_proposal' && pf.text)
                          || parsedFiles.find(pf => pf.subtype === 'rfp' && pf.text)
                          || parsedFiles.find(pf => pf.text);
          if (codeSource) {
            const codeHit = await detectProjectCode({ originalName: codeSource.originalName, extractedText: codeSource.text });
            if (codeHit?.code) {
              db.prepare('UPDATE projects SET project_code = ? WHERE id = ?').run(codeHit.code, id);
            }
          }
        }
      } catch (e) { console.error('detectProjectCode failed:', e.message); }

      // ── 5. PER-DOCUMENT AI ANALYSIS
      const notes = [project.went_well, project.improvements, project.lessons].filter(Boolean).join('. ');
      const projectCtx = {
        sector: project.sector,
        service_industry: project.service_industry,
        user_rating: project.user_rating,
        notes,
        projectId: id,
      };
      await pMap(parsedFiles.map(pf => async () => {
        if (!pf.text || pf.text.trim().length < 50) {
          pf.analysis = { _error: 'text_too_short', _subtype: pf.subtype };
          return;
        }
        pf.analysis = await analyzeDocument({
          subtype: pf.subtype, text: pf.text, filename: pf.originalName, projectCtx,
        });
        try {
          db.prepare('UPDATE project_files SET ai_metadata = ? WHERE id = ?')
            .run(JSON.stringify(pf.analysis || {}), pf.fileRowId);
        } catch {}
      }), 5);

      // ── 6. SYNTHESISE project-level metadata
      let metadata;
      try {
        metadata = synthesiseProject(parsedFiles.map(pf => ({
          filename: pf.originalName, subtype: pf.subtype, analysis: pf.analysis,
        })));
        if (!metadata?.executive_summary) {
          // Synthesis failed to produce a useful spine — fall back to prior metadata
          metadata = JSON.parse(project.ai_metadata || '{}');
          if (!metadata.executive_summary) metadata.executive_summary = project.description || project.name;
        }
      } catch (e) {
        console.error('synthesis failed for', id, ':', e.message);
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
        vec = await withTimeout(embed(embParts.join(' ')), EMBED_TIMEOUT_MS, 'embed');
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

      // Multi-doc synthesis pulls contract_value/currency from the
      // pricing_schedule or commercial_proposal annex. Write those back to
      // the projects row so the repository UI shows the real number rather
      // than the form's default 0. Only overwrites when the row is
      // currently 0/null/unset — never clobbers a user-entered value.
      try {
        const synthValue = parseFloat(metadata.contract_value);
        const synthCurrency = metadata.currency;
        if (Number.isFinite(synthValue) && synthValue > 0 && (!project.contract_value || project.contract_value === 0)) {
          db.prepare("UPDATE projects SET contract_value = ?, currency = COALESCE(NULLIF(currency,''), ?) WHERE id = ?")
            .run(synthValue, synthCurrency || null, id);
          project.contract_value = synthValue; // so the vision-pricing fallback below skips
        }
      } catch {}

      // Vision pricing fallback — if contract_value is still 0 or null, try image extraction
      if (!project.contract_value || project.contract_value === 0) {
        try {
          const pdfFile = files.find(f => f.path?.toLowerCase().endsWith('.pdf'));
          if (pdfFile && fs.existsSync(pdfFile.path)) {
            const visionResult = await withTimeout(
              extractPricingFromImages(pdfFile.path),
              VISION_TIMEOUT_MS, 'visionPricing'
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
