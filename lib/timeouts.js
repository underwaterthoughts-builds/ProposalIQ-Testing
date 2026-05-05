// Centralised timeouts for AI / parsing / embedding work.
// Tune here rather than chasing magic numbers across 6+ call sites.
const AI_ANALYSIS_TIMEOUT_MS = 150_000;  // OpenAI analyseProposal / extractRFPData / draft section gen.
                                          // 90s was tight for real-world bids (telecoms / public-sector
                                          // tenders are routinely 30k+ words plus annexes); raised after
                                          // observed silent fallback on Joseph's Salam EVD project.
const PARSE_TIMEOUT_MS       = 30_000;   // parseDocument (PDF/DOCX/XLSX) + heavy text work
const EMBED_TIMEOUT_MS       = 30_000;   // Gemini/OpenAI embeddings
const VISION_TIMEOUT_MS      = 20_000;   // pdftoppm + gpt-4o-mini vision pass
const BATCH_STAGGER_MS       = 3_000;    // Stagger between batched reindex jobs

module.exports = {
  AI_ANALYSIS_TIMEOUT_MS,
  PARSE_TIMEOUT_MS,
  EMBED_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
  BATCH_STAGGER_MS,
};
