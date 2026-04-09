import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureDir } from '../../../lib/storage';
import { parseDocument } from '../../../lib/parser';
import {
  embed, extractRFPData, analyseGaps, getIndustryNews,
  getNarrativeAdvice, generateApproachAndBudget,
  generateWinStrategy, extractWinningLanguage, explainMatch,
  classifyWritingStyle, analyseEvidenceDensity,
  extractProposalStructure, adaptWinningLanguage,
  scoreBid, reRankProposals, hasOpenAI,
} from '../../../lib/gemini';
import { rankProposals, rankTeamMembers, safe } from '../../../lib/embeddings';

export const config = { api: { bodyParser: false } };

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms/1000}s)`)), ms)
    ),
  ]);
}

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const scans = db.prepare('SELECT id,name,status,created_at FROM rfp_scans ORDER BY created_at DESC LIMIT 20').all();
    return res.status(200).json({ scans });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const scanId = uuid();
  const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans');
  ensureDir(uploadDir);
  const form = formidable({ uploadDir, keepExtensions: true, maxFileSize: 30 * 1024 * 1024 });
  let fields, files;
  try {
    [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
    });
  } catch (e) { return res.status(400).json({ error: 'Upload failed: ' + e.message }); }

  const f = k => Array.isArray(fields[k]) ? fields[k][0] : (fields[k] || '');
  const rfpFileArr = files['rfp'];
  const rfpFile = Array.isArray(rfpFileArr) ? rfpFileArr[0] : rfpFileArr;
  if (!rfpFile?.filepath) return res.status(400).json({ error: 'RFP file required' });

  const ext = path.extname(rfpFile.originalFilename || rfpFile.filepath);
  const newName = `rfp_${scanId}${ext}`;
  const newPath = path.join(uploadDir, newName);
  fs.renameSync(rfpFile.filepath, newPath);

  db.prepare('INSERT INTO rfp_scans (id,name,rfp_filename,rfp_original_name,status) VALUES (?,?,?,?,?)').run(
    scanId, f('name') || rfpFile.originalFilename || 'RFP Scan', newName, rfpFile.originalFilename || newName, 'processing'
  );

  res.status(202).json({ scanId, message: 'Processing started' });

  ;(async () => {
    const warn = (step, msg) => console.warn(`[scan ${scanId}] ${step}:`, msg);

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1 — PARSE DOCUMENT (full text, no limits)
      // ═══════════════════════════════════════════════════════════════════════
      let rfpText = '';
      try { rfpText = await withTimeout(parseDocument(newPath), 30000, 'parse'); }
      catch (e) { warn('parse', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 2 — EXTRACT RFP REQUIREMENTS
      // Explicit + implicit requirements, evaluation logic, hidden expectations
      // All downstream steps depend on this output.
      // ═══════════════════════════════════════════════════════════════════════
      let rfpData = {
        title: 'Untitled RFP', client: 'Unknown', sector: 'Unknown',
        key_themes: [], requirements: [], implicit_requirements: [],
        evaluation_criteria: [], evaluation_logic: [], hidden_expectations: [],
        contract_value_hint: '', deadline: '',
      };
      try {
        if (rfpText.trim().length > 20)
          rfpData = await withTimeout(extractRFPData(rfpText), 90000, 'extractRFP');
      } catch (e) { warn('extract', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3 — MATCH PROPOSALS
      // Embed RFP using its full semantic content, rank all indexed proposals.
      // ═══════════════════════════════════════════════════════════════════════
      let ranked = [], rfpVec = null;
      try {
        const embParts = [
          rfpData.title, rfpData.client, rfpData.sector,
          ...(rfpData.key_themes || []),
          ...(rfpData.requirements || []).slice(0, 15).map(r => r.text || ''),
          ...(rfpData.implicit_requirements || []).slice(0, 5).map(r => r.text || ''),
        ].filter(Boolean);
        if (embParts.length > 0) {
          rfpVec = await withTimeout(embed(embParts.join(' ')), 30000, 'embed');
          const allProjects = db.prepare(
            "SELECT * FROM projects WHERE indexing_status='complete' AND embedding IS NOT NULL"
          ).all();
          ranked = rankProposals(rfpVec, allProjects);
        }
      } catch (e) { warn('embed/rank', e.message); }

      // Load team members (needed for steps 4, 9, and financial model)
      const allMembers = db.prepare('SELECT * FROM team_members').all().map(m => ({
        ...m,
        stated_specialisms: safe(m.stated_specialisms, []),
        cv_extracted: safe(m.cv_extracted, {}),
      }));

      // Load rate card (needed for approach + budget)
      let rateCardRoles = [];
      try { rateCardRoles = db.prepare('SELECT * FROM rate_card_roles ORDER BY category, sort_order, role_name').all(); } catch {}

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 4 — DEEP ANALYSIS OF MATCHED PROPOSALS
      // For each top match: style classification, evidence density, match explanation.
      // These enrich every downstream step.
      // ═══════════════════════════════════════════════════════════════════════
      const topMatches = ranked.slice(0, 5);
      const enrichedMatches = await Promise.all(topMatches.map(async (p) => {
        const [styleClass, evidenceDensity, matchExplanation] = await Promise.all([
          classifyWritingStyle(p).catch(e => { warn('styleClass', e.message); return null; }),
          analyseEvidenceDensity(p).catch(e => { warn('evidenceDensity', e.message); return null; }),
          explainMatch(rfpData, p).catch(e => { warn('explainMatch', e.message); return null; }),
        ]);
        return { ...p, style_classification: styleClass, evidence_density: evidenceDensity, match_explanation: matchExplanation };
      }));

      // Merge enriched data back into ranked (remaining proposals stay as-is)
      const enrichedIds = new Set(enrichedMatches.map(m => m.id));
      const allRanked = [
        ...enrichedMatches,
        ...ranked.filter(p => !enrichedIds.has(p.id)),
      ];

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5 — EXTRACT WINNING LANGUAGE + STRUCTURE
      // From the strongest won proposals only.
      // Structure extraction uses enriched context from step 4.
      // ═══════════════════════════════════════════════════════════════════════
      let rawWinningLanguage = [];
      let proposalStructure = null;

      const highPerformers = enrichedMatches.filter(p => p.outcome === 'won' && p.user_rating >= 4);
      const goodMatches = enrichedMatches.filter(p => p.outcome === 'won');

      try {
        if (highPerformers.length > 0)
          rawWinningLanguage = await withTimeout(extractWinningLanguage(highPerformers), 60000, 'winningLanguage');
        else if (goodMatches.length > 0)
          rawWinningLanguage = await withTimeout(extractWinningLanguage(goodMatches), 60000, 'winningLanguage');
      } catch (e) { warn('winningLanguage', e.message); }

      try {
        if (goodMatches.length > 0)
          proposalStructure = await withTimeout(extractProposalStructure(goodMatches), 60000, 'structure');
      } catch (e) { warn('structure', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 6 — GAP ANALYSIS
      // Now has richer inputs: enriched matches with evidence density + style data.
      // ═══════════════════════════════════════════════════════════════════════
      let gaps = [];
      // Use edited rfp_data if Pro user has reviewed and amended checkpoint 1
      const rfpDataForGaps = (() => {
        try {
          const scan = db.prepare('SELECT rfp_data_edited FROM rfp_scans WHERE id = ?').get(scanId);
          return scan?.rfp_data_edited ? JSON.parse(scan.rfp_data_edited) : rfpData;
        } catch { return rfpData; }
      })();

      // Enrich team members with CV data for gap analysis
      const membersWithCV = allMembers.map(m => ({
        ...m,
        cv_summary: m.cv_extracted?.career_summary || '',
        certifications_str: m.certifications || (m.cv_extracted?.certifications || []).join(', '),
        sectors_str: m.stated_sectors || (m.cv_extracted?.sectors || []).join(', '),
        specialisms_str: (m.stated_specialisms || []).join(', '),
      }));

      try {
        gaps = await withTimeout(analyseGaps(rfpDataForGaps, enrichedMatches, membersWithCV), 90000, 'gaps');
      } catch (e) { warn('gaps', e.message); }

      // Bid/no-bid score (deterministic — uses gap data from step 6)
      let bidScore = null;
      try {
        const sectorProjects = db.prepare("SELECT outcome FROM projects WHERE sector = ? AND outcome IN ('won','lost')").all(rfpData.sector || '');
        const sectorWon = sectorProjects.filter(p => p.outcome === 'won').length;
        const sectorWinRate = sectorProjects.length > 0 ? Math.round((sectorWon / sectorProjects.length) * 100) : 0;
        bidScore = await scoreBid(rfpData, allRanked, gaps, sectorWinRate, allMembers.length);
      } catch (e) { warn('bidScore', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 7 — WIN STRATEGY
      // Has: rfpData, enriched matches (with evidence density), gaps, structure.
      // ═══════════════════════════════════════════════════════════════════════
      let winStrategy = null;
      try {
        winStrategy = await withTimeout(generateWinStrategy(rfpData, enrichedMatches, gaps), 90000, 'winStrategy');
      } catch (e) { warn('winStrategy', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 8 — NARRATIVE ADVICE
      // Has: rfpData, best match with full enrichment, structure extraction.
      // ═══════════════════════════════════════════════════════════════════════
      let narrativeAdvice = '';
      try {
        const bestMatch = enrichedMatches[0] || ranked[0];
        if (bestMatch) {
          // Pass structure context into narrative advice
          const enhancedMatch = proposalStructure
            ? { ...bestMatch, _structureContext: proposalStructure }
            : bestMatch;
          narrativeAdvice = await withTimeout(getNarrativeAdvice(rfpData, enhancedMatch), 60000, 'narrative');
        }
      } catch (e) { warn('narrative', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 9 — ADAPT WINNING LANGUAGE TO THIS BID
      // Takes raw winning language + RFP context + best style classification.
      // Produces adapted versions ready to use (not raw copy-paste).
      // ═══════════════════════════════════════════════════════════════════════
      let adaptedLanguage = [];
      try {
        if (rawWinningLanguage.length > 0) {
          // Use the style from the top won match as the reference
          const styleContext = highPerformers[0]?.style_classification || null;
          adaptedLanguage = await withTimeout(
            adaptWinningLanguage(rawWinningLanguage, rfpData, styleContext),
            60000, 'adapt'
          );
        }
      } catch (e) { warn('adapt', e.message); }

      // Merge adapted versions into winning language output
      const winningLanguage = rawWinningLanguage.map((snippet, i) => ({
        ...snippet,
        adapted: adaptedLanguage[i]?.adapted || null,
        adaptation_notes: adaptedLanguage[i]?.adaptation_notes || null,
        adapted_confidence: adaptedLanguage[i]?.confidence || null,
      }));

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 10 — INDUSTRY NEWS (parallel, doesn't affect chain)
      // ═══════════════════════════════════════════════════════════════════════
      let news = [];
      try {
        news = await withTimeout(getIndustryNews(rfpData.sector, rfpData.key_themes, rfpData.client), 30000, 'news');
      } catch (e) { warn('news', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 11 — TEAM MATCHING
      // ═══════════════════════════════════════════════════════════════════════
      let teamSuggestions = [];
      try {
        const membersWithEmb = allMembers.filter(m => m.embedding);
        if (membersWithEmb.length > 0 && rfpVec) {
          const participation = db.prepare(
            'SELECT pt.member_id,p.outcome,p.user_rating FROM project_team pt JOIN projects p ON p.id=pt.project_id'
          ).all();
          teamSuggestions = rankTeamMembers(rfpVec, membersWithEmb, participation);
        }
      } catch (e) { warn('team', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 12 — WRITING QUALITY INSIGHTS
      // Now enriched with style classification + evidence density from step 4.
      // ═══════════════════════════════════════════════════════════════════════
      const writingInsights = enrichedMatches.map(p => {
        const wq = p.ai_metadata?.writing_quality;
        if (!wq) return null;
        return {
          project_id: p.id, project_name: p.name, outcome: p.outcome,
          match_label: p.match_label,
          writing_score: wq.overall_score,
          approach_score: p.ai_metadata?.approach_quality?.overall_score,
          credibility_score: p.ai_metadata?.credibility_signals?.overall_score,
          standout_sentences: p.ai_metadata?.standout_sentences || [],
          win_indicators: p.ai_metadata?.win_indicators || [],
          loss_risks: p.ai_metadata?.loss_risks || [],
          // Enriched from step 4
          style_classification: p.style_classification,
          evidence_density: p.evidence_density,
        };
      }).filter(Boolean);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 13 — COVERAGE + FINANCIAL MODEL
      // ═══════════════════════════════════════════════════════════════════════
      const coverage = {};
      ['Technical', 'Commercial', 'Team', 'Governance', 'Sustainability', 'Social Value', 'Innovation'].forEach(cat => {
        const catReqs = (rfpData.requirements || []).filter(r => r.section === cat);
        if (!catReqs.length) { coverage[cat] = null; return; }
        const base = allRanked[0] ? Math.round(allRanked[0].match_score * 0.7) : 30;
        const penalty = (cat === 'Sustainability' || cat === 'Social Value') ? -20 : 0;
        coverage[cat] = Math.max(10, Math.min(95, base + Math.floor(Math.random() * 20) - 5 + penalty));
      });

      const suggested = teamSuggestions.slice(0, 5);
      const daysEach = 24;
      const totalRevenue = suggested.reduce((s, m) => s + (m.day_rate_client || 0) * daysEach, 0);
      const totalCost = suggested.reduce((s, m) => s + (m.day_rate_cost || 0) * daysEach, 0);
      const overhead = Math.round(totalCost * 0.12);
      const netMargin = totalRevenue ? Math.round(((totalRevenue - totalCost - overhead) / totalRevenue) * 100) : 0;

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 14 — SUGGESTED APPROACH + BUDGET
      // Has: rfpData, enriched matches, structure, team, rate card.
      // ═══════════════════════════════════════════════════════════════════════
      let suggestedApproach = null;
      try {
        if (allRanked.length > 0) {
          suggestedApproach = await withTimeout(
            generateApproachAndBudget(rfpData, enrichedMatches, teamSuggestions, rateCardRoles),
            90000, 'approach'
          );
        }
      } catch (e) { warn('approach', e.message); }

      // ═══════════════════════════════════════════════════════════════════════
      // ASSEMBLE MATCH DATA (include match explanation + style from step 4)
      // ═══════════════════════════════════════════════════════════════════════
      const matchData = allRanked.map(p => ({
        id: p.id, name: p.name, client: p.client, sector: p.sector,
        contract_value: p.contract_value, currency: p.currency,
        outcome: p.outcome, user_rating: p.user_rating,
        match_score: p.match_score, raw_similarity: p.raw_similarity,
        match_label: p.match_label || 'Partial',
        ai_metadata: p.ai_metadata,
        match_reasons: [
          ...(p.ai_metadata?.key_themes || []).slice(0, 3),
          ...(p.ai_metadata?.methodologies || []).slice(0, 2),
        ],
        went_well: p.went_well, lessons: p.lessons,
        lh_status: p.lh_status, lh_what_delivered: p.lh_what_delivered,
        date_submitted: p.date_submitted,
        // Enriched fields from step 4
        match_explanation: p.match_explanation || null,
        style_classification: p.style_classification || null,
      }));

      const status = allRanked.length > 0 || gaps.length > 0 ? 'complete' : 'error';

      // ═══════════════════════════════════════════════════════════════════════
      // SAVE
      // ═══════════════════════════════════════════════════════════════════════
      db.prepare(`UPDATE rfp_scans SET
        rfp_text=?, rfp_data=?, matched_proposals=?, gaps=?, news=?,
        team_suggestions=?, financial_model=?, coverage=?,
        narrative_advice=?, suggested_approach=?,
        win_strategy=?, winning_language=?,
        bid_score=?,
        status=? WHERE id=?`).run(
        rfpText.slice(0, 50000),
        JSON.stringify(rfpData),
        JSON.stringify(matchData),
        JSON.stringify(gaps),
        JSON.stringify(news),
        JSON.stringify(teamSuggestions.slice(0, 8).map(m => ({
          id: m.id, name: m.name, title: m.title, fit_score: m.fit_score,
          stated_specialisms: m.stated_specialisms,
          day_rate_client: m.day_rate_client, day_rate_cost: m.day_rate_cost,
          availability: m.availability, color: m.color,
        }))),
        JSON.stringify({
          estimated_days: daysEach * suggested.length,
          total_revenue: Math.round(totalRevenue),
          total_labour_cost: Math.round(totalCost),
          overhead, net_margin: netMargin,
          suggested_team: suggested.map(m => ({
            id: m.id, name: m.name, title: m.title,
            day_rate_client: m.day_rate_client, day_rate_cost: m.day_rate_cost,
            fit_score: m.fit_score, estimated_days: daysEach,
          })),
        }),
        JSON.stringify(coverage),
        JSON.stringify({
          text: narrativeAdvice,
          writing_insights: writingInsights,
          proposal_structure: proposalStructure,
        }),
        JSON.stringify(suggestedApproach),
        JSON.stringify(winStrategy),
        JSON.stringify(winningLanguage),
        JSON.stringify(bidScore),
        status,
        scanId
      );

    } catch (e) {
      console.error(`[scan ${scanId}] fatal:`, e.message, e.stack);
      db.prepare("UPDATE rfp_scans SET status='error',narrative_advice=? WHERE id=?")
        .run(`Error: ${e.message}`, scanId);
    }
  })().catch(e => {
    console.error(`[scan ${scanId}] outer catch:`, e.message);
    try { db.prepare("UPDATE rfp_scans SET status='error' WHERE id=?").run(scanId); } catch {}
  });
}

export default requireAuth(handler);
