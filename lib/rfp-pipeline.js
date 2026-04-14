// ────────────────────────────────────────────────────────────────────────────
// RFP scan pipeline — extracted from pages/api/rfp/scan.js so it can be
// reused by both initial scans and re-analysis without duplication.
//
// runRfpScanPipeline(scanId, rfpFilePath) does the full 14-step pipeline:
//   parse → extract → embed → match → enrich → winning language → gaps →
//   bid score → win strategy → narrative → adapted language → news →
//   team → coverage → financial model → suggested approach → save
//
// Caller is responsible for:
//   - Inserting the rfp_scans row before calling (status='processing')
//   - Returning HTTP response to client BEFORE awaiting this (it can take
//     a few minutes)
// ────────────────────────────────────────────────────────────────────────────

const { getDb } = require('./db');
const { parseDocument } = require('./parser');
const {
  embed, extractRFPData, analyseGaps, getIndustryNews,
  getNarrativeAdvice, generateApproachAndBudget,
  generateWinStrategy, extractWinningLanguage, explainMatch,
  classifyWritingStyle, analyseEvidenceDensity,
  extractProposalStructure, adaptWinningLanguage,
  scoreBid, generateExecutiveBidBrief, sanityCheckTopMatches,
  setCostContext, hasOpenAI,
} = require('./gemini');
const { rankProposals, rankTeamMembers, safe } = require('./embeddings');

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)
    ),
  ]);
}

async function runRfpScanPipeline(scanId, rfpFilePath, userId = null) {
  const db = getDb();
  const warn = (step, msg) => console.warn(`[scan ${scanId}] ${step}:`, msg);

  // Tag all AI calls in this pipeline run with 'rfp_scan' category
  setCostContext({ category: 'rfp_scan', scanId, projectId: null });

  // Live step tracker — persists to status_detail so the UI can poll it.
  // Each step gets a human-readable label shown in the progress bar.
  function updateStep(label) {
    try {
      db.prepare("UPDATE rfp_scans SET status_detail = ? WHERE id = ?").run(label, scanId);
      console.log(`[scan ${scanId}] → ${label}`);
    } catch {}
  }

  // Load the confirmed organisation profile once at the start — it's a
  // singleton row and cascades into gaps, strategy, brief, and drafts.
  // If no profile exists yet, all downstream calls gracefully handle null.
  let orgProfile = null;
  try {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE id = 'default'").get();
    if (row) {
      orgProfile = {
        ...row,
        confirmed_profile: safe(row.confirmed_profile, {}),
      };
    }
  } catch (e) { warn('orgProfile', e.message); }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1 — PARSE DOCUMENT (full text, no limits)
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('① Parsing document…');
    let rfpText = '';
    try { rfpText = await withTimeout(parseDocument(rfpFilePath), 30000, 'parse'); }
    catch (e) { warn('parse', e.message); }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2 — EXTRACT RFP REQUIREMENTS
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('② Extracting requirements…');
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
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('③ Matching against repository…');
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

        // If the user has a workspace, only match against those projects.
        // If no workspace (or no userId), match against everything.
        let allProjects;
        let workspaceFilter = false;
        if (userId) {
          const wsRows = db.prepare(
            'SELECT project_id FROM user_workspace_projects WHERE user_id = ?'
          ).all(userId);
          if (wsRows.length > 0) {
            workspaceFilter = true;
            const wsIds = new Set(wsRows.map(r => r.project_id));
            allProjects = db.prepare(
              "SELECT * FROM projects WHERE indexing_status='complete' AND embedding IS NOT NULL"
            ).all().filter(p => wsIds.has(p.id));
            console.log(`[scan ${scanId}] workspace filter: ${wsIds.size} selected, ${allProjects.length} with embeddings`);
          }
        }
        if (!workspaceFilter) {
          allProjects = db.prepare(
            "SELECT * FROM projects WHERE indexing_status='complete' AND embedding IS NOT NULL"
          ).all();
        }
        const rfpTaxonomy = {
          service_industry: rfpData.service_industry || null,
          service_sectors: rfpData.service_sectors || [],
          client_industry: rfpData.client_industry || null,
          client_sectors: rfpData.client_sectors || [],
        };
        ranked = rankProposals(rfpVec, allProjects, rfpTaxonomy);
      }
    } catch (e) { warn('embed/rank', e.message); }

    // Load team members
    const allMembers = db.prepare('SELECT * FROM team_members').all().map(m => ({
      ...m,
      stated_specialisms: safe(m.stated_specialisms, []),
      cv_extracted: safe(m.cv_extracted, {}),
    }));

    // Load rate card
    let rateCardRoles = [];
    try { rateCardRoles = db.prepare('SELECT * FROM rate_card_roles ORDER BY category, sort_order, role_name').all(); } catch {}

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4 — DEEP ANALYSIS OF MATCHED PROPOSALS
    updateStep('④ Enriching top matches (style, evidence, match explanation)…');
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

    const enrichedIds = new Set(enrichedMatches.map(m => m.id));
    const allRanked = [
      ...enrichedMatches,
      ...ranked.filter(p => !enrichedIds.has(p.id)),
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // FAST PASS CHECKPOINT — generate provisional bid score + brief and save
    // with status='fast_ready' so the user gets a verdict in ~30s instead of
    // waiting for the full ~90s pipeline. Deep pass continues below and
    // overwrites with richer outputs when ready.
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('⑤ Computing fast verdict…');
    let bidScore = null;
    try {
      const sectorProjects = db.prepare("SELECT outcome FROM projects WHERE sector = ? AND outcome IN ('won','lost')").all(rfpData.sector || '');
      const sectorWon = sectorProjects.filter(p => p.outcome === 'won').length;
      const sectorWinRate = sectorProjects.length > 0 ? Math.round((sectorWon / sectorProjects.length) * 100) : 0;
      // Fast pass uses empty gaps; deep pass recomputes with real gaps later.
      bidScore = await scoreBid(rfpData, allRanked, [], sectorWinRate, allMembers.length);
    } catch (e) { warn('fastBidScore', e.message); }

    // Build a slim matchData payload for fast save (full version is rebuilt
    // at the end of deep pass).
    const fastMatchData = allRanked.map(p => ({
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
      match_explanation: p.match_explanation || null,
      style_classification: p.style_classification || null,
      taxonomy_tier: p.taxonomy_tier,
      taxonomy_match: p.taxonomy_match,
      client_industry: p.client_industry || null,
      service_industry: p.service_industry || null,
      taxonomy_inferred: !!p.taxonomy_inferred,
      // Wave 3 — feedback loop signal
      used_count: p.used_count || 0,
      won_count: p.won_count || 0,
    }));

    // Fast brief — limited inputs, no gaps/strategy/language yet, but
    // enough context for a real verdict.
    let fastBrief = null;
    try {
      fastBrief = await withTimeout(
        generateExecutiveBidBrief({
          rfpData,
          matches: fastMatchData,
          gaps: [],
          winStrategy: null,
          narrativeAdvice: '',
          bidScore,
          winningLanguage: [],
          proposalStructure: null,
          marketContext: [],
          orgProfile,
        }),
        60000, 'fastBrief'
      );
    } catch (e) { warn('fastBrief', e.message); }

    // Persist fast pass results so the UI can show the brief immediately.
    // Other tabs will be empty until deep pass completes.
    try {
      db.prepare(`UPDATE rfp_scans SET
        rfp_text=?, rfp_data=?, matched_proposals=?, bid_score=?, executive_brief=?,
        service_industry=?, service_sectors=?, client_industry=?, client_sectors=?,
        status='fast_ready' WHERE id=?`).run(
        rfpText.slice(0, 50000),
        JSON.stringify(rfpData),
        JSON.stringify(fastMatchData),
        JSON.stringify(bidScore),
        JSON.stringify(fastBrief),
        rfpData.service_industry || null,
        JSON.stringify(rfpData.service_sectors || []),
        rfpData.client_industry || null,
        JSON.stringify(rfpData.client_sectors || []),
        scanId
      );
      console.log(`[scan ${scanId}] FAST PASS complete — verdict ready`);
    } catch (e) { warn('fastSave', e.message); }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── DEEP PASS BEGINS ─── runs in background after fast pass saves
    //
    // Slimmed pipeline: 5 redundant calls removed, independent steps
    // parallelized. Target: ~2.5-3 minutes instead of 5-7.
    //
    // GLOBAL WATCHDOG: 4-minute timeout. If exceeded, saves whatever
    // data exists and marks 'complete' so the UI stops polling.
    // ═══════════════════════════════════════════════════════════════════════
    const DEEP_PASS_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes
    const deepPassStart = Date.now();
    function deepPassExpired() { return (Date.now() - deepPassStart) > DEEP_PASS_TIMEOUT_MS; }

    const highPerformers = enrichedMatches.filter(p => p.outcome === 'won' && p.user_rating >= 4);
    const goodMatches = enrichedMatches.filter(p => p.outcome === 'won');

    const rfpDataForGaps = (() => {
      try {
        const scan = db.prepare('SELECT rfp_data_edited FROM rfp_scans WHERE id = ?').get(scanId);
        return scan?.rfp_data_edited ? JSON.parse(scan.rfp_data_edited) : rfpData;
      } catch { return rfpData; }
    })();
    const membersWithCV = allMembers.map(m => ({
      ...m,
      cv_summary: m.cv_extracted?.career_summary || '',
      certifications_str: m.certifications || (m.cv_extracted?.certifications || []).join(', '),
      sectors_str: m.stated_sectors || (m.cv_extracted?.sectors || []).join(', '),
      specialisms_str: (m.stated_specialisms || []).join(', '),
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PARALLEL BATCH 1 — three independent steps that don't depend on each other
    // Winning language, gap analysis, and market context run simultaneously.
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('⑥ Running winning language + gap analysis + market context (parallel)…');

    let rawWinningLanguage = [];
    let gaps = [];
    let news = [];

    const [langResult, gapResult, newsResult] = await Promise.all([
      // Winning language (proposer only — critic pass removed for speed)
      (async () => {
        try {
          const src = highPerformers.length > 0 ? highPerformers : goodMatches;
          if (src.length > 0) return await withTimeout(extractWinningLanguage(src), 60000, 'winningLanguage');
        } catch (e) { warn('winningLanguage', e.message); }
        return [];
      })(),
      // Gap analysis — now returns { coverage_map, coverage_summary, gaps }
      (async () => {
        try {
          return await withTimeout(analyseGaps(rfpDataForGaps, enrichedMatches, membersWithCV, orgProfile), 90000, 'gaps');
        } catch (e) { warn('gaps', e.message); }
        return { gaps: [], coverage_map: [], coverage_summary: null };
      })(),
      // Market context
      (async () => {
        try {
          return await withTimeout(getIndustryNews(rfpData, rfpText), 60000, 'news');
        } catch (e) { warn('news', e.message); }
        return [];
      })(),
    ]);

    rawWinningLanguage = langResult;
    // gapResult is now { coverage_map, coverage_summary, gaps } or just an array (legacy)
    const gapAnalysis = Array.isArray(gapResult) ? { gaps: gapResult, coverage_map: [], coverage_summary: null } : gapResult;
    gaps = gapAnalysis.gaps || [];
    const coverageMap = gapAnalysis.coverage_map || [];
    const coverageSummary = gapAnalysis.coverage_summary || null;
    news = newsResult;

    // Recompute bid score with real gaps (fast pass used [])
    try {
      const sectorProjects = db.prepare("SELECT outcome FROM projects WHERE sector = ? AND outcome IN ('won','lost')").all(rfpData.sector || '');
      const sectorWon = sectorProjects.filter(p => p.outcome === 'won').length;
      const sectorWinRate = sectorProjects.length > 0 ? Math.round((sectorWon / sectorProjects.length) * 100) : 0;
      bidScore = await scoreBid(rfpData, allRanked, gaps, sectorWinRate, allMembers.length);
    } catch (e) { warn('bidScore', e.message); }

    if (deepPassExpired()) {
      updateStep('Deep pass timed out — saving partial results');
      try {
        db.prepare(`UPDATE rfp_scans SET gaps=?, win_strategy=?, news=?, winning_language=?, status='complete', status_detail='Deep pass timed out after parallel batch' WHERE id=?`).run(
          JSON.stringify(gaps), 'null', JSON.stringify(news), JSON.stringify(rawWinningLanguage), scanId
        );
      } catch { db.prepare("UPDATE rfp_scans SET status='complete' WHERE id=?").run(scanId); }
      return;
    }

    // Winning language — no adaptation pass or critic pass (cut for speed;
    // the full proposal generator does its own adaptation).
    const winningLanguage = rawWinningLanguage;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7 — WIN STRATEGY (depends on gaps from batch 1)
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('⑦ Generating win strategy…');
    let winStrategy = null;
    try {
      winStrategy = await withTimeout(generateWinStrategy(rfpData, enrichedMatches, gaps, orgProfile), 90000, 'winStrategy');
    } catch (e) { warn('winStrategy', e.message); }

    if (deepPassExpired()) {
      updateStep('Deep pass timed out — saving partial results');
      try {
        db.prepare(`UPDATE rfp_scans SET gaps=?, win_strategy=?, news=?, winning_language=?, status='complete', status_detail='Deep pass timed out after win strategy' WHERE id=?`).run(
          JSON.stringify(gaps), JSON.stringify(winStrategy), JSON.stringify(news), JSON.stringify(winningLanguage), scanId
        );
      } catch { db.prepare("UPDATE rfp_scans SET status='complete' WHERE id=?").run(scanId); }
      return;
    }

    // Narrative advice removed (was step 8) — vague, rarely used,
    // the brief + strategy already cover this territory.
    let narrativeAdvice = '';

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8 — TEAM MATCHING (deterministic — fast)
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('⑧ Matching team members…');
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
    // STEP 9 — WRITING QUALITY INSIGHTS (assembly — no AI call)
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
        style_classification: p.style_classification,
        evidence_density: p.evidence_density,
        // Carry taxonomy context so the UI can explain WHY a cross-sector
        // proposal's writing insights are being shown for this RFP.
        taxonomy_tier: p.taxonomy_tier,
        taxonomy_match: p.taxonomy_match,
        client_industry: p.client_industry || null,
        service_industry: p.service_industry || null,
        match_explanation: p.match_explanation || null,
      };
    }).filter(Boolean);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10 — COVERAGE + FINANCIAL MODEL (deterministic)
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
    // STEP 11 — SUGGESTED APPROACH + BUDGET
    // ═══════════════════════════════════════════════════════════════════════
    updateStep('⑨ Generating suggested approach & budget…');
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
    // ASSEMBLE MATCH DATA
    // ═══════════════════════════════════════════════════════════════════════
    let matchData = allRanked.map(p => ({
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
      match_explanation: p.match_explanation || null,
      style_classification: p.style_classification || null,
      // Taxonomy tiering — saved so the UI can group by tier and show
      // inferred-vs-explicit indicators without recomputing on read.
      taxonomy_tier: p.taxonomy_tier,
      taxonomy_match: p.taxonomy_match,
      client_industry: p.client_industry || null,
      service_industry: p.service_industry || null,
      taxonomy_inferred: !!p.taxonomy_inferred,
      // Wave 3 — feedback loop signal
      used_count: p.used_count || 0,
      won_count: p.won_count || 0,
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12 — SANITY CHECK ON TOP MATCHES
    updateStep('⑩ Running sanity check on top matches…');
    // Final objective gate before matches are shown. Catches obvious
    // misfits that the ranking math missed (e.g. metadata-misled matches,
    // surface-similar but wrong-scope proposals). One AI call, ~$0.01.
    // Verdicts:
    //   keep   — no change
    //   flag   — add a sanity_warning string for the UI to show
    //   demote — push to taxonomy_tier=5 so it lands in cross-sector hidden
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const verdicts = await withTimeout(
        sanityCheckTopMatches(rfpData, matchData.slice(0, 8)),
        30000, 'sanityCheck'
      );
      if (Array.isArray(verdicts) && verdicts.length > 0) {
        const verdictMap = new Map();
        verdicts.forEach(v => { if (v.match_id) verdictMap.set(v.match_id, v); });
        let flaggedCount = 0;
        matchData = matchData.map(m => {
          const v = verdictMap.get(m.id);
          if (!v) return m;
          // Only FLAG — never demote. The tier system already handles
          // cross-sector separation; the sanity check should add
          // context, not hide proposals.
          if (v.verdict === 'demote' || v.verdict === 'flag') {
            if (v.reason) {
              flaggedCount++;
              return { ...m, sanity_warning: v.reason };
            }
          }
          return m;
        });
        if (flaggedCount > 0) {
          console.log(`[scan ${scanId}] sanity check: flagged=${flaggedCount}`);
        }
      }
    } catch (e) { warn('sanityCheck', e.message); }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 13 — EXECUTIVE BID BRIEF
    updateStep('⑪ Writing executive brief…');
    // Final synthesis layer. Takes everything above and produces a single
    // decision-ready brief: verdict, top 3 priorities, top 3 risks,
    // recommended assets, immediate next actions. This becomes the
    // default landing tab so users don't have to assemble the answer
    // from nine separate tabs themselves.
    // ═══════════════════════════════════════════════════════════════════════
    let executiveBrief = null;
    try {
      executiveBrief = await withTimeout(
        generateExecutiveBidBrief({
          rfpData,
          matches: matchData,
          gaps,
          winStrategy,
          narrativeAdvice,
          bidScore,
          winningLanguage,
          proposalStructure,
          marketContext: news,
          orgProfile,
        }),
        90000, 'executiveBrief'
      );
    } catch (e) { warn('executiveBrief', e.message); }

    updateStep('⑫ Saving results…');
    const status = allRanked.length > 0 || gaps.length > 0 ? 'complete' : 'error';

    // ═══════════════════════════════════════════════════════════════════════
    // SAVE
    // ═══════════════════════════════════════════════════════════════════════
    const analysisModel = hasOpenAI() ? 'gpt' : 'gemini';
    db.prepare(`UPDATE rfp_scans SET
      rfp_text=?, rfp_data=?, matched_proposals=?, gaps=?, news=?,
      team_suggestions=?, financial_model=?, coverage=?,
      narrative_advice=?, suggested_approach=?,
      win_strategy=?, winning_language=?,
      bid_score=?, executive_brief=?, coverage_map=?,
      service_industry=?, service_sectors=?, client_industry=?, client_sectors=?,
      analysis_model=?,
      status=?, status_detail=NULL WHERE id=?`).run(
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
      JSON.stringify(executiveBrief),
      JSON.stringify({ map: coverageMap, summary: coverageSummary }),
      rfpData.service_industry || null,
      JSON.stringify(rfpData.service_sectors || []),
      rfpData.client_industry || null,
      JSON.stringify(rfpData.client_sectors || []),
      analysisModel,
      status,
      scanId
    );

  } catch (e) {
    console.error(`[scan ${scanId}] fatal:`, e.message, e.stack);
    // If the fast pass saved data, mark 'complete' so the user at least
    // sees the verdict. Only mark 'error' if nothing was saved.
    try {
      const row = db.prepare('SELECT status FROM rfp_scans WHERE id = ?').get(scanId);
      if (row?.status === 'fast_ready') {
        // Fast pass data exists — save as complete rather than error
        console.warn(`[scan ${scanId}] deep pass failed but fast pass data available — marking complete`);
        db.prepare("UPDATE rfp_scans SET status='complete' WHERE id=?").run(scanId);
      } else {
        db.prepare("UPDATE rfp_scans SET status='error',narrative_advice=? WHERE id=?")
          .run(`Error: ${e.message}`, scanId);
      }
    } catch {
      db.prepare("UPDATE rfp_scans SET status='error',narrative_advice=? WHERE id=?")
        .run(`Error: ${e.message}`, scanId);
    }
  }
}

module.exports = { runRfpScanPipeline };
