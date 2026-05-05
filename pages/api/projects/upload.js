import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ownerId } from '../../../lib/tenancy';
import { projectDir } from '../../../lib/storage';
import { parseDocument } from '../../../lib/parser';
import { embed, analyseProposal, extractPricingFromImages, setCostContext, hasOpenAI } from '../../../lib/gemini';
import { AI_ANALYSIS_TIMEOUT_MS, VISION_TIMEOUT_MS } from '../../../lib/timeouts';
import { classifyDocument } from '../../../lib/document-classifier';
import { detectProjectCode } from '../../../lib/project-code';
import { analyzeDocument } from '../../../lib/document-analyzers';
import { synthesiseProject } from '../../../lib/proposal-synthesis';
import { pMap } from '../../../lib/concurrency';

export const config = { api: { bodyParser: false } };

// Log an indexing stage to the DB for visibility
function logStage(projectId, projectName, stage, status, message) {
  try {
    const { getDb } = require('../../../lib/db');
    const { v4: uuid } = require('uuid');
    const db = getDb();
    db.prepare('INSERT INTO indexing_log (id, project_id, project_name, stage, status, message) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), projectId, projectName, stage, status, message
    );
  } catch {}
}

const AI_WEIGHT = { 0:0.30, 1:0.05, 2:0.15, 3:0.40, 4:0.75, 5:1.00 };

// Safe fallback metadata when Gemini fails or returns bad JSON
function buildFallbackMeta(name, sector, description) {
  return {
    executive_summary: description || name,
    key_themes: sector ? [sector] : [],
    deliverables: [], methodologies: [],
    tools_technologies: [], client_pain_points: [],
    value_propositions: [], industry_context: sector || '',
    writing_quality: { overall_score: 0, strengths: [], weaknesses: [] },
    approach_quality: { overall_score: 0, strengths: [], weaknesses: [] },
    credibility_signals: { overall_score: 0, strengths: [], weaknesses: [] },
    win_indicators: [], loss_risks: [], standout_sentences: [],
  };
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const projectId = uuid();
  const uploadDir = projectDir(projectId);

  const form = formidable({
    uploadDir, keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024,
    maxFieldsSize: 2 * 1024 * 1024,
  });

  let fields, files;
  try {
    [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
    });
  } catch (e) {
    return res.status(400).json({ error: 'File upload failed: ' + e.message });
  }

  const f = k => Array.isArray(fields[k]) ? fields[k][0] : (fields[k] || '');
  const name = f('name');
  const client = f('client');
  if (!name || !client) return res.status(400).json({ error: 'Name and client required' });

  const rating = parseInt(f('user_rating') || '3', 10);
  const outcome = f('outcome') || 'pending';
  const db = getDb();

  db.prepare(`INSERT INTO projects
    (id, name, client, sector, contract_value, currency, outcome, user_rating, ai_weight,
     project_type, date_submitted, folder_id, description, went_well, improvements, lessons, indexing_status, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexing', ?)`).run(
    projectId, name, client,
    f('sector'), parseFloat(f('contract_value') || '0'),
    f('currency') || 'GBP', outcome, rating, AI_WEIGHT[rating] ?? 0.40,
    f('project_type'), f('date_submitted'), f('folder_id') || null,
    f('description'), f('went_well'), f('improvements'), f('lessons'),
    ownerId(req.user)
  );

  const fileInsert = db.prepare(
    'INSERT INTO project_files (id, project_id, file_type, filename, original_name, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  let proposalText = '';
  // savedFiles[i] = { fileRowId, file_type, originalName, savedPath, text, subtype, confidence }
  // Built up here at request-handling time so the IIFE below can classify + analyse
  // and write a subtype-tagged combined text without re-parsing.
  const savedFiles = [];

  // Existing slots: proposal / rfp / budget — single file each, behaviour unchanged
  // beyond every saved file now also entering the supporting-doc analysis pool.
  for (const ft of ['proposal', 'rfp', 'budget']) {
    const arr = files[ft];
    const uploaded = Array.isArray(arr) ? arr[0] : arr;
    if (!uploaded?.filepath) continue;
    const newName = `${ft}_${uuid()}${path.extname(uploaded.originalFilename || uploaded.filepath)}`;
    const newPath = path.join(uploadDir, newName);
    try { fs.renameSync(uploaded.filepath, newPath); } catch { continue; }
    const rowId = uuid();
    fileInsert.run(rowId, projectId, ft, newName, uploaded.originalFilename || newName, uploaded.size || 0, newPath);
    try {
      const text = await parseDocument(newPath);
      savedFiles.push({
        fileRowId: rowId, file_type: ft, originalName: uploaded.originalFilename || newName,
        savedPath: newPath, text: text || '',
      });
      if (ft === 'proposal') proposalText = text || '';
    } catch (e) { console.error('Parse error:', ft, e.message); }
  }

  // Additional / supporting multi-file slot — accept either form field name.
  // Real-world submissions include CVs, case studies, technical/commercial
  // annexes, methodology, compliance, cover letters, etc. Each gets its own
  // subtype classification + dedicated analysis below.
  const supportingArr = []
    .concat(Array.isArray(files['additional']) ? files['additional'] : (files['additional'] ? [files['additional']] : []))
    .concat(Array.isArray(files['supporting']) ? files['supporting'] : (files['supporting'] ? [files['supporting']] : []));
  for (const up of supportingArr) {
    if (!up?.filepath) continue;
    const newName = `extra_${uuid()}${path.extname(up.originalFilename || up.filepath)}`;
    const newPath = path.join(uploadDir, newName);
    try {
      fs.renameSync(up.filepath, newPath);
      const rowId = uuid();
      fileInsert.run(rowId, projectId, 'additional', newName, up.originalFilename || newName, up.size || 0, newPath);
      try {
        const text = await parseDocument(newPath);
        savedFiles.push({
          fileRowId: rowId, file_type: 'additional', originalName: up.originalFilename || newName,
          savedPath: newPath, text: text || '',
        });
      } catch (e) { console.error('Parse error: supporting', e.message); }
    } catch {}
  }

  res.status(201).json({ projectId, message: 'Upload received — AI indexing in progress' });

  // Use IIFE with outer catch to ensure status is always updated on failure
  ;(async () => {
    setCostContext({ category: 'proposal_analysis', scanId: null, projectId });
    logStage(projectId, name, 'upload', 'info', 'File received and saved');
    try {
      // ── 1. Classify each file's subtype (filename heuristics + AI fallback)
      logStage(projectId, name, 'classify', 'info', `Classifying ${savedFiles.length} file(s)`);
      await pMap(savedFiles.map(sf => async () => {
        try {
          const c = await classifyDocument(sf.savedPath, sf.originalName);
          // Bias proposal-slot toward main_proposal when classifier returns
          // unknown/low-conf — the user explicitly placed it in that slot.
          if (sf.file_type === 'proposal' && (!c || c.subtype === 'unknown' || c.confidence < 0.4)) {
            sf.subtype = 'main_proposal';
            sf.confidence = 0.7;
          } else if (sf.file_type === 'rfp' && (!c || c.confidence < 0.5)) {
            sf.subtype = 'rfp';
            sf.confidence = 0.9;
          } else if (sf.file_type === 'budget' && (!c || c.confidence < 0.5)) {
            sf.subtype = 'pricing_schedule';
            sf.confidence = 0.85;
          } else {
            sf.subtype = c?.subtype || 'unknown';
            sf.confidence = c?.confidence || 0;
          }
        } catch (e) {
          sf.subtype = sf.file_type === 'proposal' ? 'main_proposal'
                     : sf.file_type === 'rfp'      ? 'rfp'
                     : sf.file_type === 'budget'   ? 'pricing_schedule'
                     : 'unknown';
          sf.confidence = 0;
        }
        try {
          db.prepare('UPDATE project_files SET subtype = ?, classification_confidence = ? WHERE id = ?')
            .run(sf.subtype, sf.confidence, sf.fileRowId);
        } catch {}
      }), 5);

      // ── 2. Build subtype-tagged combined text (replaces old allText format)
      const combinedText = savedFiles
        .filter(sf => sf.text && sf.text.trim().length > 20)
        .map(sf => `\n\n=== ${(sf.subtype || 'unknown').toUpperCase()}: ${sf.originalName} ===\n${sf.text}`)
        .join('');
      if (combinedText.trim().length > 50) {
        try { fs.writeFileSync(path.join(uploadDir, 'extracted_text.txt'), combinedText, 'utf8'); } catch {}
      }

      // ── 3. Detect project code from highest-text-confidence file
      try {
        const codeSource = savedFiles.find(sf => sf.subtype === 'main_proposal' && sf.text)
                        || savedFiles.find(sf => sf.subtype === 'rfp' && sf.text)
                        || savedFiles.find(sf => sf.text);
        if (codeSource) {
          const codeHit = await detectProjectCode({ originalName: codeSource.originalName, extractedText: codeSource.text });
          if (codeHit?.code) {
            db.prepare('UPDATE projects SET project_code = ? WHERE id = ?').run(codeHit.code, projectId);
            logStage(projectId, name, 'project_code', 'info', `Detected project code "${codeHit.code}" (${codeHit.source})`);
          }
        }
      } catch (e) { console.error('detectProjectCode failed:', e.message); }

      // ── 4. Per-document subtype-specific analysis (concurrency-limited)
      const projectCtx = {
        sector: f('sector'),
        service_industry: null, // set after main analyseProposal
        user_rating: rating,
        notes: [f('went_well'), f('improvements'), f('lessons')].filter(Boolean).join('. '),
        projectId,
      };
      logStage(projectId, name, 'doc_analysis', 'info', `Analysing ${savedFiles.filter(sf => sf.text?.trim().length > 50).length} document(s)`);
      await pMap(savedFiles.map(sf => async () => {
        if (!sf.text || sf.text.trim().length < 50) {
          sf.analysis = { _error: 'text_too_short', _subtype: sf.subtype };
          return;
        }
        sf.analysis = await analyzeDocument({
          subtype: sf.subtype,
          text: sf.text,
          filename: sf.originalName,
          projectCtx,
        });
        try {
          db.prepare('UPDATE project_files SET ai_metadata = ? WHERE id = ?')
            .run(JSON.stringify(sf.analysis || {}), sf.fileRowId);
        } catch {}
      }), 5);

      // ── 5. Synthesise project-level metadata from the per-doc analyses
      const fallback = buildFallbackMeta(name, f('sector'), f('description'));
      let metadata = fallback;
      try {
        const synthInput = savedFiles.map(sf => ({
          filename: sf.originalName,
          subtype: sf.subtype,
          analysis: sf.analysis,
        }));
        const synthesised = synthesiseProject(synthInput);
        // Synthesis is only useful if main_proposal analysis succeeded
        if (synthesised && synthesised.executive_summary) {
          metadata = synthesised;
          logStage(projectId, name, 'ai_analysis', 'success', `AI analysis complete (${savedFiles.length} doc${savedFiles.length === 1 ? '' : 's'})`);
        } else {
          logStage(projectId, name, 'ai_analysis', 'warn', 'Main proposal analysis did not produce useful metadata — using basic');
        }
      } catch (e) {
        console.error('synthesis failed:', e.message);
        logStage(projectId, name, 'ai_analysis', 'warn', `Synthesis failed: ${e.message} — using basic metadata`);
      }

      // Build embedding — include sector/description even if AI failed
      const embParts = [
        name, client, f('sector'), f('description'),
        metadata.executive_summary || '',
        (metadata.key_themes || []).join(' '),
        (metadata.deliverables || []).join(' '),
        (metadata.methodologies || []).join(' '),
        (metadata.tools_technologies || []).join(' '),
        (metadata.value_propositions || []).join(' '),
      ].filter(Boolean);

      // Embedding must succeed — if it fails that's a real error
      // Vision pricing fallback — if contract_value is 0 or missing from form, try image extraction
      const storedContractValue = parseFloat(f('contract_value') || '0');
      const proposalFilePath = db.prepare("SELECT path FROM project_files WHERE project_id = ? AND file_type = 'proposal' LIMIT 1").get(projectId)?.path;
      if ((!storedContractValue || storedContractValue === 0) && proposalFilePath && fs.existsSync(proposalFilePath)) {
        try {
          const visionResult = await Promise.race([
            extractPricingFromImages(proposalFilePath),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), VISION_TIMEOUT_MS))
          ]);
          if (visionResult?.contract_value) {
            const numVal = parseFloat(String(visionResult.contract_value).replace(/[^0-9.]/g, '')) || 0;
            if (numVal > 0) {
              db.prepare('UPDATE projects SET contract_value = ? WHERE id = ?').run(numVal, projectId);
              logStage(projectId, name, 'vision_pricing', 'success', `Found ${numVal} via vision (${visionResult.found_in})`);
            }
          }
        } catch (e) { console.error('upload vision pricing:', e.message); }
      }

      logStage(projectId, name, 'embedding', 'info', 'Generating semantic embedding');
      const vec = await embed(embParts.join(' '));

      const submitted = f('date_submitted');
      const ageYears = submitted
        ? (Date.now() - new Date(submitted).getTime()) / (1000 * 60 * 60 * 24 * 365)
        : 1;
      const kqsRecency = Math.max(0.2, Math.min(1, 1 - ageYears / 5));
      const kqsOutcome = outcome === 'won' ? 1.0 : outcome === 'lost' ? 0.35 : 0.6;
      const kqsSpecificity = textToAnalyse.length > 500
        ? Math.min(1, 0.5 + (metadata.credibility_signals?.overall_score || 50) / 200)
        : 0.50;
      const kqsComposite = (kqsRecency + kqsOutcome + kqsSpecificity) / 3;

      const analysisModel = hasOpenAI() ? 'gpt' : 'gemini';

      db.prepare(`UPDATE projects SET
        ai_metadata = ?, embedding = ?,
        kqs_recency = ?, kqs_outcome_quality = ?, kqs_specificity = ?, kqs_composite = ?,
        service_industry = ?, service_sectors = ?, client_industry = ?, client_sectors = ?, taxonomy_source = 'ai',
        analysis_model = ?,
        indexing_status = 'complete', indexed_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        JSON.stringify(metadata), JSON.stringify(vec),
        kqsRecency, kqsOutcome, kqsSpecificity, kqsComposite,
        metadata.service_industry || null,
        JSON.stringify(metadata.service_sectors || []),
        metadata.client_industry || null,
        JSON.stringify(metadata.client_sectors || []),
        analysisModel,
        projectId
      );

      // Write library file
      fs.writeFileSync(path.join(uploadDir, 'library.json'), JSON.stringify({
        project_id: projectId,
        indexed_at: new Date().toISOString(),
        schema_version: 2,
        metadata,
        kqs: { recency: kqsRecency, outcome_quality: kqsOutcome, specificity: kqsSpecificity, composite: kqsComposite },
      }, null, 2));

      // Auto-tag taxonomy from AI metadata
      try {
        const aiMeta = metadata || {};
        const offeringTags = [
          ...(aiMeta.key_themes || []).slice(0, 3),
          ...(aiMeta.methodologies || []).slice(0, 2),
          ...(aiMeta.deliverables || []).slice(0, 2),
        ].filter(Boolean);
        const sector = f('sector') || aiMeta.sector_classification || '';
        const taxonomyObj = { service_offerings: offeringTags, sector, auto_tagged: true };
        db.prepare('UPDATE projects SET taxonomy = ? WHERE id = ?').run(JSON.stringify(taxonomyObj), projectId);
      } catch {}

      logStage(projectId, name, 'complete', 'success', 'Proposal indexed and ready for matching');
    } catch (e) {
      console.error('Indexing failed for', projectId, ':', e.message);
      logStage(projectId, name || 'unknown', 'error', 'error', `Indexing failed: ${e.message}`);
      // Still try to save whatever we have so it's not a total loss
      try {
        const fallback = buildFallbackMeta(name, f('sector'), f('description'));
        let vec = null;
        try { vec = await embed([name, client, f('sector')].filter(Boolean).join(' ')); } catch {}
        db.prepare(`UPDATE projects SET
          ai_metadata = ?, embedding = ?,
          kqs_recency = 0.5, kqs_outcome_quality = 0.5, kqs_specificity = 0.5, kqs_composite = 0.5,
          indexing_status = 'complete', indexed_at = CURRENT_TIMESTAMP
          WHERE id = ?`).run(JSON.stringify(fallback), vec ? JSON.stringify(vec) : null, projectId);
      } catch (e2) {
        db.prepare("UPDATE projects SET indexing_status = 'error' WHERE id = ?").run(projectId);
      }
    }
  })().catch(err => {
    console.error(`[upload ${projectId}] indexing IIFE outer error:`, err.message);
    try { getDb().prepare("UPDATE projects SET indexing_status = 'error' WHERE id = ?").run(projectId); } catch {}
  });
}

export default requireAuth(handler);
