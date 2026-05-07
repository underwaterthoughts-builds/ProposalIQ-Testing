// Centralised timeouts for AI / parsing / embedding work.
// Tune here rather than chasing magic numbers across 6+ call sites.
//
// Reasoning-class default model (gpt-5.5) — first-token latency is
// 15–30s and total response 30–90s on long prompts, so the legacy
// gpt-4o-era budgets (60s / 150s) blew up on real scans. Raised
// after observed timeouts on winningLanguage / news / gaps with the
// gpt-5.5 default.
// gpt-4o takes 10-45s per call. Tighter per-step caps so a hung call
// fails fast — this enforces the 5-min total-pipeline target naturally
// rather than leaving 600s budgets that swallow real failures.
const AI_ANALYSIS_TIMEOUT_MS = 180_000;  // Heavy: analyseProposal / extractRFPData / gaps / winStrategy / approach.
const AI_LIGHT_TIMEOUT_MS    = 90_000;   // Lighter narrative work: winningLanguage / news / narrativeAdvice / fastBrief.
const PARSE_TIMEOUT_MS       = 30_000;   // parseDocument (PDF/DOCX/XLSX) + heavy text work
const EMBED_TIMEOUT_MS       = 30_000;   // Gemini/OpenAI embeddings
const VISION_TIMEOUT_MS      = 20_000;   // pdftoppm + gpt-4o-mini vision pass
const BATCH_STAGGER_MS       = 3_000;    // Stagger between batched reindex jobs

module.exports = {
  AI_ANALYSIS_TIMEOUT_MS,
  AI_LIGHT_TIMEOUT_MS,
  PARSE_TIMEOUT_MS,
  EMBED_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
  BATCH_STAGGER_MS,
};
