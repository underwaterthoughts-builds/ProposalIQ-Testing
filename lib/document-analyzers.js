// Per-document subtype-specific AI analysis. Each subtype gets a
// focused prompt that extracts only what's actually present in that
// kind of document — a CV doesn't have methodologies, a pricing
// schedule doesn't have evidence quality scores.
//
// Every subtype output includes an `assumptions` array — the highest-
// value cross-cutting field. Bids are won and lost on assumptions
// buried in the technical / commercial annex; surfacing them as a
// structured field lets the synthesis pass roll them up project-wide
// and the proposal-fit pipeline flag conflicts with the parent RFP.
//
// All per-doc analyses are stored on project_files.ai_metadata; the
// project-level synthesis (lib/proposal-synthesis.js) merges them.

const {
  analyseProposal, extractRFPData, hasOpenAI, openaiGenerate,
  geminiGenerate, safeJSON, setCostContext,
} = require('./gemini');

const { AI_ANALYSIS_TIMEOUT_MS } = require('./timeouts');

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
const dlog = (...args) => { if (DEBUG) console.log(...args); };

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)),
  ]);
}

// ── Shared assumption-extraction snippet. Every subtype-specific schema
//    that follows includes this field; phrasing kept identical across
//    subtypes so the synthesis pass can roll them up cleanly.
const ASSUMPTIONS_SCHEMA = `"assumptions": [
    {
      "text": "exact statement of the assumption from the document",
      "category": "commercial | technical | scope | timeline | dependencies | other",
      "risk_level": "lo | med | hi  // hi if the assumption is unusual or could clash with an RFP requirement"
    }
  ]`;

// ── TECHNICAL PROPOSAL ──────────────────────────────────────────────────
async function analyzeTechnical(text, filename) {
  const systemPrompt = `Extract structured intelligence from a TECHNICAL proposal / annex / approach document. Be strict — this is for a strategist comparing bids, not a sales summary.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 60000)}

Return ONLY this JSON shape:
{
  "summary": "1-2 sentence summary of the technical approach",
  "methodologies": ["named methodologies / frameworks — empty if none named"],
  "tools_technologies": ["named tools, platforms, languages, services"],
  "integration_points": ["named systems / APIs / standards this integrates with"],
  "phases": ["phase or workstream names with brief description"],
  "technical_dependencies": ["what the supplier needs from the client to deliver"],
  ${ASSUMPTIONS_SCHEMA},
  "risks_named": ["risks the document explicitly names"],
  "specificity_score": "integer 0-100 — how specific (named tech, named clients) vs generic"
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_technical');
}

// ── COMMERCIAL PROPOSAL ─────────────────────────────────────────────────
async function analyzeCommercial(text, filename) {
  const systemPrompt = `Extract commercial / pricing intelligence from a COMMERCIAL proposal or pricing-narrative document. Focus on pricing structure, totals, validity, and commercial assumptions.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 60000)}

Return ONLY this JSON shape:
{
  "summary": "1-2 sentence summary of the commercial position",
  "contract_value": "total contract value as a number (no currency), or null if not stated",
  "currency": "ISO code like GBP/USD/EUR/AED, or null",
  "pricing_structure": "fixed_price | time_and_materials | phased | hybrid | other | unknown",
  "validity_period": "e.g. '90 days from submission', or null",
  "rate_card_named": true,
  "discount_or_rebate": "any stated discount/rebate text, or null",
  ${ASSUMPTIONS_SCHEMA},
  "out_of_scope": ["explicitly stated out-of-scope items"]
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_commercial');
}

// ── PRICING SCHEDULE (often a spreadsheet) ──────────────────────────────
async function analyzePricingSchedule(text, filename) {
  const systemPrompt = `Extract structured pricing data from a PRICING SCHEDULE / cost spreadsheet. The text is sheet-by-sheet CSV-like — preserve numbers exactly as given.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document (sheet-by-sheet text):
${text.slice(0, 40000)}

Return ONLY this JSON shape:
{
  "summary": "1-2 sentence summary of the pricing shape",
  "contract_value": "grand total as a number, or null",
  "currency": "ISO code, or null",
  "line_items_count": "integer count of distinct priced line items",
  "day_rates_named": ["roles with day rates, e.g. 'Principal Consultant: £1,200/day'"],
  "phases_priced": ["phase names with their priced values"],
  ${ASSUMPTIONS_SCHEMA}
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_pricing');
}

// ── CV ──────────────────────────────────────────────────────────────────
async function analyzeCV(text, filename) {
  const systemPrompt = `Extract structured intelligence from a single individual's CV / bio.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 30000)}

Return ONLY this JSON shape:
{
  "name": "individual's name, or null",
  "title": "job title / role",
  "years_experience": "integer or null",
  "credentials": ["named certifications, qualifications, memberships"],
  "named_past_clients": ["named real clients on past projects"],
  "specialisms": ["domains / capabilities the CV emphasises"],
  "languages": ["spoken/written languages, if listed"],
  "summary": "1 sentence professional summary"
}`;
  // CVs don't carry assumptions; omit that field
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_cv');
}

// ── CASE STUDY ──────────────────────────────────────────────────────────
async function analyzeCaseStudy(text, filename) {
  const systemPrompt = `Extract intelligence from a CASE STUDY / past-project reference document.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 40000)}

Return ONLY this JSON shape:
{
  "client_name": "named real client, or null",
  "client_industry": "client's industry / sector, or null",
  "year_delivered": "year as a string, or null",
  "duration": "project duration if stated, or null",
  "named_outcomes": ["quantified outcomes — e.g. 'reduced onboarding from 14 days to 3'"],
  "tools_technologies": ["named tools / platforms used"],
  "methodologies": ["named methodologies applied"],
  "team_size": "integer or null",
  "summary": "2-3 sentence summary of what was delivered"
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_case_study');
}

// ── METHODOLOGY ─────────────────────────────────────────────────────────
async function analyzeMethodology(text, filename) {
  const systemPrompt = `Extract intelligence from a METHODOLOGY / approach standalone document.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 50000)}

Return ONLY this JSON shape:
{
  "summary": "1-2 sentence summary of the methodology",
  "named_frameworks": ["explicit framework names — PRINCE2, SAFe, double-diamond, etc."],
  "phases": ["phase names with brief description"],
  "deliverables_per_phase": ["deliverable names mapped roughly to phases"],
  "governance_model": "1-sentence description of governance / decision-making approach, or null",
  ${ASSUMPTIONS_SCHEMA}
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_methodology');
}

// ── COMPLIANCE ──────────────────────────────────────────────────────────
async function analyzeCompliance(text, filename) {
  const systemPrompt = `Extract intelligence from a COMPLIANCE / mandatory-checklist / certificate document.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 40000)}

Return ONLY this JSON shape:
{
  "summary": "1 sentence summary",
  "certifications_referenced": ["named certifications — ISO 27001, Cyber Essentials Plus, etc."],
  "mandatory_responses": [
    { "requirement_ref": "the RFP requirement number / name being responded to", "response": "compliance response text" }
  ],
  "gaps_admitted": ["any items where the supplier admits non-compliance"]
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_compliance');
}

// ── COVER LETTER ────────────────────────────────────────────────────────
async function analyzeCoverLetter(text, filename) {
  const systemPrompt = `Extract intelligence from a COVER / TRANSMITTAL LETTER. Short prompt — these are short documents.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 12000)}

Return ONLY this JSON shape:
{
  "summary": "1 sentence summary of the letter's stance",
  "win_themes": ["named win themes — typically 3-5 short phrases"],
  "stated_commitments": ["explicit commitments made in the letter"],
  "addressee": "named individual or role at the buyer side, or null",
  "signatory": "named signatory, or null"
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_cover');
}

// ── UNKNOWN — light pass to extract whatever's identifiable ─────────────
async function analyzeUnknown(text, filename) {
  const systemPrompt = `This document's subtype could not be classified. Extract whatever structured intelligence you can without forcing it.`;
  const userPrompt = `Filename: ${filename || '(unknown)'}

Document:
${text.slice(0, 30000)}

Return ONLY this JSON shape:
{
  "summary": "1-2 sentence summary",
  "key_topics": ["topics the document covers"],
  "named_entities": ["named clients, products, technologies, individuals"],
  ${ASSUMPTIONS_SCHEMA}
}`;
  return runJsonAnalysis(systemPrompt, userPrompt, 'analyze_unknown');
}

// ── Common runner ───────────────────────────────────────────────────────
async function runJsonAnalysis(systemPrompt, userPrompt, fnName) {
  if (hasOpenAI()) {
    try {
      const raw = await openaiGenerate(systemPrompt, userPrompt, 1500, fnName);
      const parsed = safeJSON(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {
      dlog(`[doc-analyzer ${fnName}] OpenAI failed:`, e.message);
    }
  }
  try {
    const raw = await geminiGenerate(`${systemPrompt}\n\n${userPrompt}`, true, fnName);
    const parsed = safeJSON(raw);
    if (parsed) return parsed;
  } catch (e) {
    dlog(`[doc-analyzer ${fnName}] Gemini failed:`, e.message);
  }
  return null;
}

// ── Dispatch ────────────────────────────────────────────────────────────
// analyzeDocument(filePath, subtype, { text, filename, projectCtx })
//
// projectCtx is the project's row metadata (sector, service_industry,
// rating, notes) — used by the main_proposal subtype which reuses
// analyseProposal. Not used by the other subtypes.
async function analyzeDocument({ subtype, text, filename, projectCtx = {} }) {
  if (!text || text.trim().length < 50) {
    return { _error: 'text_too_short', _subtype: subtype };
  }
  setCostContext({ category: 'proposal_doc_analysis', scanId: null, projectId: projectCtx.projectId || null });

  let result = null;
  try {
    switch (subtype) {
      case 'main_proposal':
        result = await withTimeout(
          analyseProposal(text, projectCtx.user_rating || null, projectCtx.notes || '', {
            sector: projectCtx.sector,
            service_industry: projectCtx.service_industry,
          }),
          AI_ANALYSIS_TIMEOUT_MS,
          'main_proposal'
        );
        break;
      case 'technical_proposal':  result = await withTimeout(analyzeTechnical(text, filename),     AI_ANALYSIS_TIMEOUT_MS, 'technical');     break;
      case 'commercial_proposal': result = await withTimeout(analyzeCommercial(text, filename),    AI_ANALYSIS_TIMEOUT_MS, 'commercial');    break;
      case 'pricing_schedule':    result = await withTimeout(analyzePricingSchedule(text, filename), AI_ANALYSIS_TIMEOUT_MS, 'pricing');     break;
      case 'cv':                  result = await withTimeout(analyzeCV(text, filename),            AI_ANALYSIS_TIMEOUT_MS, 'cv');            break;
      case 'case_study':          result = await withTimeout(analyzeCaseStudy(text, filename),     AI_ANALYSIS_TIMEOUT_MS, 'case_study');    break;
      case 'methodology':         result = await withTimeout(analyzeMethodology(text, filename),   AI_ANALYSIS_TIMEOUT_MS, 'methodology');   break;
      case 'compliance':          result = await withTimeout(analyzeCompliance(text, filename),    AI_ANALYSIS_TIMEOUT_MS, 'compliance');    break;
      case 'cover_letter':        result = await withTimeout(analyzeCoverLetter(text, filename),   AI_ANALYSIS_TIMEOUT_MS, 'cover_letter');  break;
      case 'rfp':                 result = await withTimeout(extractRFPData(text),                 AI_ANALYSIS_TIMEOUT_MS, 'rfp');           break;
      default:                    result = await withTimeout(analyzeUnknown(text, filename),       AI_ANALYSIS_TIMEOUT_MS, 'unknown');       break;
    }
  } catch (e) {
    dlog(`[doc-analyzer ${subtype}] failed:`, e.message);
    return { _error: e.message?.slice(0, 200) || 'unknown error', _subtype: subtype };
  }
  return { _subtype: subtype, ...(result || {}) };
}

module.exports = { analyzeDocument };
