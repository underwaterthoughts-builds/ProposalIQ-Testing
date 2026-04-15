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
  let allText = '';

  for (const ft of ['proposal', 'rfp', 'budget']) {
    const arr = files[ft];
    const uploaded = Array.isArray(arr) ? arr[0] : arr;
    if (!uploaded?.filepath) continue;
    const newName = `${ft}_${uuid()}${path.extname(uploaded.originalFilename || uploaded.filepath)}`;
    const newPath = path.join(uploadDir, newName);
    try { fs.renameSync(uploaded.filepath, newPath); } catch { continue; }
    fileInsert.run(uuid(), projectId, ft, newName, uploaded.originalFilename || newName, uploaded.size || 0, newPath);
    try {
      const text = await parseDocument(newPath);
      if (text) {
        allText += `\n\n=== ${ft.toUpperCase()} ===\n${text}`;
        if (ft === 'proposal') proposalText = text;
      }
    } catch (e) { console.error('Parse error:', ft, e.message); }
  }

  for (const up of (Array.isArray(files['additional']) ? files['additional'] : (files['additional'] ? [files['additional']] : []))) {
    if (!up?.filepath) continue;
    const newName = `extra_${uuid()}${path.extname(up.originalFilename || up.filepath)}`;
    const newPath = path.join(uploadDir, newName);
    try { fs.renameSync(up.filepath, newPath); fileInsert.run(uuid(), projectId, 'additional', newName, up.originalFilename || newName, up.size || 0, newPath); } catch {}
  }

  // Save extracted text for future reindex without re-parsing
  if (allText.trim().length > 50) {
    try { fs.writeFileSync(path.join(uploadDir, 'extracted_text.txt'), allText, 'utf8'); } catch {}
  }

  res.status(201).json({ projectId, message: 'Upload received — AI indexing in progress' });

  // Use IIFE with outer catch to ensure status is always updated on failure
  ;(async () => {
    setCostContext({ category: 'proposal_analysis', scanId: null, projectId });
    logStage(projectId, name, 'upload', 'info', 'File received and saved');
    try {
      const textToAnalyse = proposalText || allText;
      logStage(projectId, name, 'text_extraction', textToAnalyse.length > 200 ? 'info' : 'warn',
        textToAnalyse.length > 200 ? `${textToAnalyse.length} characters extracted` : 'Limited text extracted — manual review may be needed');
      const notes = [f('went_well'), f('improvements'), f('lessons')].filter(Boolean).join('. ');

      // Try full AI analysis — fall back gracefully on any failure
      logStage(projectId, name, 'ai_analysis', 'info', 'Starting AI proposal analysis');
      let metadata = buildFallbackMeta(name, f('sector'), f('description'));
      if (textToAnalyse.length > 200) {
        try {
          const analysed = await Promise.race([
            analyseProposal(textToAnalyse, rating, notes),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Analysis timeout')), 90000))
          ]);
          if (analysed && analysed.executive_summary) {
            metadata = analysed;
            logStage(projectId, name, 'ai_analysis', 'success', 'AI analysis complete');
          }
        } catch (e) {
          console.error('analyseProposal failed, using fallback:', e.message);
          logStage(projectId, name, 'ai_analysis', 'warn', `AI analysis failed: ${e.message} — using basic metadata`);
          // fallback already set above — continue with basic metadata
        }
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
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
  });
}

export default requireAuth(handler);
