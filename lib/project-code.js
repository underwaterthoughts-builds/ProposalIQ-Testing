// Detect a procurement / project / RFP reference code from a document.
// Three layers, cheapest first:
//   1. Filename regex — catches most explicit codes (NHS-2024-DIG-047)
//   2. First-page header peek — many tenders stamp the code in the
//      document header; cheap pdf-parse text scan, no LLM
//   3. AI fallback — last resort, uses gpt-4o-mini on first 2 pages
//
// Returns { code, confidence, source } or null. Code is the highest-
// confidence cluster signal during batch upload — two files sharing a
// project_code merge with very high confidence.

const { hasOpenAI, openaiGenerate, geminiGenerate, safeJSON } = require('./gemini');

// Reference-code shapes seen in real procurements:
//   NHS-2024-DIG-047 / RFP_087-2024 / CCS-RM6263-Lot4-2024
//   GLA/2024/0231 / DfE-EX-2025-00471
// Loose enough to catch most variants; strict enough to avoid matching
// random alphanumerics. Length 5-30 chars after the leading prefix.
const CODE_REGEXES = [
  // Prefix + separator + digit-heavy body. Most common shape.
  /\b([A-Z]{2,6}[-_/][A-Z0-9]{2,8}(?:[-_/][A-Z0-9]{2,8}){0,3})\b/,
  // RFP/ITT/Tender + number
  /\b((?:RFP|ITT|TENDER|REF)[-_/]\s?[A-Z0-9]{3,12}(?:[-_/][A-Z0-9]{1,6})?)\b/i,
  // Year-prefixed
  /\b(20\d{2}[-_/][A-Z]{2,5}[-_/][A-Z0-9]{2,8})\b/,
];

// Words we should NOT match — common false positives.
const BLOCKLIST = /^(PDF|DOCX|XLSX|2024|2025|2026|UK[-_]GB|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i;

function fromString(s) {
  const text = String(s || '');
  for (const re of CODE_REGEXES) {
    const m = text.match(re);
    if (m && m[1] && !BLOCKLIST.test(m[1])) {
      return m[1].toUpperCase();
    }
  }
  return null;
}

function fromFilename(originalName) {
  const code = fromString(originalName);
  if (code) return { code, confidence: 0.85, source: 'filename' };
  return null;
}

// Scan first ~3000 chars of extracted text for an explicit "Reference:"
// or "Project Code:" header line, then any code-shaped token.
function fromHeaderPeek(extractedText) {
  const head = String(extractedText || '').slice(0, 3000);

  // Explicit labels first — strongest signal in the header
  const labelled = head.match(/(?:reference|ref|project[-_ ]?code|tender[-_ ]?ref|rfp[-_ ]?ref|procurement[-_ ]?ref)[:\s]+([A-Z0-9][A-Z0-9\-_/]{4,40})/i);
  if (labelled && labelled[1] && !BLOCKLIST.test(labelled[1])) {
    return { code: labelled[1].toUpperCase(), confidence: 0.95, source: 'header_label' };
  }

  // Then the same code shapes anywhere in the head
  const code = fromString(head);
  if (code) return { code, confidence: 0.7, source: 'header_pattern' };
  return null;
}

async function fromAi(extractedText, originalName) {
  const head = String(extractedText || '').slice(0, 4000);
  if (!head.trim()) return null;
  const systemPrompt = `Identify the procurement / project / RFP reference code in this document, if any. Return ONLY JSON: { "code": "...", "confidence": 0.0-1.0 } — or { "code": null, "confidence": 0 } if none found. Examples of codes: "NHS-2024-DIG-047", "RFP_087-2024", "CCS-RM6263". Do not invent — if no code appears verbatim, return null.`;
  const userPrompt = `Filename: ${originalName || '(unknown)'}\n\nFirst pages:\n${head}`;
  let raw = null;
  if (hasOpenAI()) {
    try { raw = await openaiGenerate(systemPrompt, userPrompt, 100, 'project_code'); } catch {}
  }
  if (!raw) {
    try { raw = await geminiGenerate(`${systemPrompt}\n\n${userPrompt}`, true, 'project_code'); } catch {}
  }
  const parsed = raw ? safeJSON(raw) : null;
  if (parsed?.code && typeof parsed.code === 'string' && parsed.code.length >= 4 && parsed.code.length <= 40) {
    if (BLOCKLIST.test(parsed.code)) return null;
    return { code: parsed.code.toUpperCase(), confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)), source: 'ai' };
  }
  return null;
}

// Top-level entry. Stops at first confident hit; AI is last-resort.
async function detectProjectCode({ originalName, extractedText }) {
  const f = fromFilename(originalName);
  if (f && f.confidence >= 0.85) return f;
  const h = fromHeaderPeek(extractedText);
  if (h && h.confidence >= 0.7) return h;
  if (extractedText && String(extractedText).trim().length > 200) {
    const a = await fromAi(extractedText, originalName);
    if (a) return a;
  }
  return f || h || null;
}

module.exports = { detectProjectCode, fromFilename, fromHeaderPeek };
