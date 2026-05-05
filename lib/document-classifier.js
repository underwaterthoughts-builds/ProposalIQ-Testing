// Subtype classifier for project files. Filename heuristics first
// (cheap, deterministic, gets ~70% right), AI fallback only when those
// don't fire. Subtypes drive: per-document analysis prompt selection,
// the combined extracted_text section headers, and the repository UI
// groupings on the project detail page.
//
// SUBTYPES — keep this list in sync with document-analyzers.js
//   main_proposal / technical_proposal / commercial_proposal /
//   pricing_schedule / cv / case_study / methodology / compliance /
//   cover_letter / rfp / unknown

const path = require('path');
const fs = require('fs');
const { hasOpenAI, openaiGenerate, geminiGenerate, safeJSON, setCostContext } = require('./gemini');
const { parseDocument } = require('./parser');

const VALID_SUBTYPES = [
  'main_proposal', 'technical_proposal', 'commercial_proposal',
  'pricing_schedule', 'cv', 'case_study', 'methodology',
  'compliance', 'cover_letter', 'rfp', 'unknown',
];

// Filename heuristics, in priority order. First hit wins.
// Patterns are matched against the lowercased filename (no extension).
const FILENAME_PATTERNS = [
  // Pricing / commercial first — these are the most distinctively named
  [/\b(pricing[-_ ]schedule|cost[-_ ]schedule|fee[-_ ]schedule|commercial[-_ ]schedule)\b/, 'pricing_schedule'],
  [/\b(commercial[-_ ]proposal|commercial[-_ ]annex|commercial[-_ ]response)\b/, 'commercial_proposal'],
  [/\b(pricing|cost|budget|fees?)\b/, 'pricing_schedule'],
  // Technical
  [/\b(technical[-_ ](proposal|annex|response|approach))\b/, 'technical_proposal'],
  // RFP / brief / ITT
  [/\b(rfp|itt|tender|brief|spec(ification)?|requirements?[-_ ]doc)\b/, 'rfp'],
  // Cover letter
  [/\b(cover[-_ ]letter|covering[-_ ]letter|transmittal)\b/, 'cover_letter'],
  // Compliance
  [/\b(compliance|mandatory|certificate|cert[-_ ]of|matrix)\b/, 'compliance'],
  // Methodology
  [/\b(methodology|approach|delivery[-_ ]plan|programme[-_ ]plan)\b/, 'methodology'],
  // CV / bio
  [/\b(cv|c\.v\.|curriculum[-_ ]vitae|resume|bio|biography)\b/, 'cv'],
  // Case study
  [/\b(case[-_ ]stud(y|ies)|reference[-_ ]project|past[-_ ]project)\b/, 'case_study'],
  // Main proposal — broad catch
  [/\b(proposal|response|submission|bid)\b/, 'main_proposal'],
];

function classifyByFilename(originalName) {
  const base = path.basename(String(originalName || ''), path.extname(originalName || '')).toLowerCase();
  for (const [pattern, subtype] of FILENAME_PATTERNS) {
    if (pattern.test(base)) return { subtype, confidence: 0.85, source: 'filename' };
  }
  // Spreadsheet without "pricing" in name → still likely pricing
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    return { subtype: 'pricing_schedule', confidence: 0.55, source: 'extension' };
  }
  return null;
}

// AI fallback — read first ~2 pages and classify. Uses gpt-4o-mini for
// cost. Falls back to Gemini if OpenAI not configured.
async function classifyByContent(filePath, originalName) {
  let text = '';
  try {
    const fullText = await parseDocument(filePath);
    text = String(fullText || '').slice(0, 4000);
  } catch (e) {
    return { subtype: 'unknown', confidence: 0, source: 'error' };
  }
  if (!text.trim()) return { subtype: 'unknown', confidence: 0.2, source: 'empty' };

  const systemPrompt = `Classify this document into ONE of the following subtypes based on its content. Be strict — pick "unknown" if it doesn't clearly fit.

SUBTYPES:
  main_proposal       — full narrative response to an RFP
  technical_proposal  — technical annex / approach / methodology focus
  commercial_proposal — commercial / pricing narrative
  pricing_schedule    — line-item pricing, day rates, totals (often a spreadsheet)
  cv                  — single individual's CV / bio / resume
  case_study          — past project reference for a named client
  methodology         — methodology / approach standalone document
  compliance          — compliance matrix, certificates, mandatory checklist
  cover_letter        — cover / transmittal letter
  rfp                 — the BUYER's RFP / ITT / tender / requirements brief
  unknown             — none of the above clearly applies

Return ONLY JSON: { "subtype": "...", "confidence": 0.0-1.0 }`;

  const userPrompt = `Filename: ${originalName || '(unknown)'}\n\nFirst pages:\n${text}`;

  if (hasOpenAI()) {
    try {
      const raw = await openaiGenerate(systemPrompt, userPrompt, 200, 'classify_doc');
      const parsed = safeJSON(raw);
      if (parsed && VALID_SUBTYPES.includes(parsed.subtype)) {
        return { subtype: parsed.subtype, confidence: Math.min(1, Math.max(0, parsed.confidence || 0.6)), source: 'ai' };
      }
    } catch {}
  }
  try {
    const raw = await geminiGenerate(`${systemPrompt}\n\n${userPrompt}`, true, 'classify_doc');
    const parsed = safeJSON(raw);
    if (parsed && VALID_SUBTYPES.includes(parsed.subtype)) {
      return { subtype: parsed.subtype, confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)), source: 'ai' };
    }
  } catch {}
  return { subtype: 'unknown', confidence: 0, source: 'fallback' };
}

// Top-level entry. Filename first, AI fallback when filename returns
// null OR low confidence. Returns { subtype, confidence, source }.
async function classifyDocument(filePath, originalName) {
  const filenameHit = classifyByFilename(originalName);
  if (filenameHit && filenameHit.confidence >= 0.8) return filenameHit;

  const aiHit = await classifyByContent(filePath, originalName);
  // Take the higher-confidence answer, biased toward AI when both are present
  if (filenameHit && filenameHit.confidence > aiHit.confidence + 0.15) return filenameHit;
  return aiHit;
}

module.exports = { classifyDocument, classifyByFilename, VALID_SUBTYPES };
