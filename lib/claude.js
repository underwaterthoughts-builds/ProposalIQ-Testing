// ────────────────────────────────────────────────────────────────────────────
// Claude (Anthropic) module — third LLM in the stack.
//
// Used for cross-model adversarial reasoning where heterogeneity matters:
// - Section drafts (proposer): Claude generates user-visible prose.
// - Full proposal (consistency critic): a final pass over the assembled
//   proposal to catch cross-section inconsistencies that per-section QA
//   can't see.
// - Executive brief (second opinion): adversarial check on the verdict.
//
// All Claude calls are gracefully optional — if ANTHROPIC_API_KEY isn't
// set, hasClaude() returns false and callers fall back to the existing
// OpenAI / Gemini paths. Adding the env var on Railway is the only
// activation step.
//
// Cost tracking flows into the same ai_cost_log table used by gemini.js
// so the admin cost dashboard sees Claude spend on the same axes.
// ────────────────────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

// Pricing per 1M tokens (USD). Updated 2026-04. Override the model via
// CLAUDE_MODEL env var; pricing entries below cover the workhorse and
// the small/cheap option. logAiCost(...) reads this table by model id.
const CLAUDE_PRICING = {
  'claude-sonnet-4-5':   { input: 3.00, output: 15.00 },
  'claude-sonnet-4-6':   { input: 3.00, output: 15.00 },
  'claude-opus-4-7':     { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':    { input: 0.80, output: 4.00 },
};

let _claudeClient = null;
function claudeClient() {
  if (!_claudeClient) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    _claudeClient = new Anthropic({ apiKey: key });
  }
  return _claudeClient;
}

function hasClaude() { return !!process.env.ANTHROPIC_API_KEY; }

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

// In-process serial queue. Anthropic has per-account TPM caps the same
// way OpenAI does; serialising prevents pile-ups when 3 scans run at
// once. Mirrors the openaiEnqueue pattern from gemini.js.
let _claudeChain = Promise.resolve();
function claudeEnqueue(taskFn) {
  const next = _claudeChain.then(taskFn, taskFn);
  _claudeChain = next.catch(() => {});
  return next;
}

function _parseRetryAfter(err) {
  const headers = err?.headers || err?.response?.headers || {};
  const ra = headers['retry-after'] || headers['retry-after-ms'];
  if (!ra) return null;
  const num = parseFloat(ra);
  if (Number.isNaN(num)) return null;
  return ra.toString().includes('-ms') ? Math.ceil(num) : Math.ceil(num * 1000);
}

async function _claudeCallWithRetry(params, _fnName) {
  const client = claudeClient();
  const MAX_ATTEMPTS = 4;
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.messages.create(params);
      const usage = res.usage;
      if (usage) {
        // Claude returns input_tokens + output_tokens; cache hits are
        // surfaced via cache_read_input_tokens. Logging the cache hit
        // makes the prompt-caching benefit visible.
        const cacheRead = usage.cache_read_input_tokens || 0;
        const cacheCreate = usage.cache_creation_input_tokens || 0;
        if (cacheRead > 0) {
          console.log(`[claude-cost ${_fnName}] cache_read=${cacheRead} cache_create=${cacheCreate} input=${usage.input_tokens} output=${usage.output_tokens}`);
        }
        // Re-use gemini.js's logAiCost so cost dashboard sees Claude
        // alongside OpenAI/Gemini. Defensive lazy require — keeps
        // module-load order independent.
        try {
          const { logAiCost } = require('./gemini');
          if (typeof logAiCost === 'function') {
            // Bill effective input as (input_tokens - cache_read) at full
            // rate plus cache_read at 10% (Anthropic's standard discount).
            // Simpler: bill input_tokens at full rate; cache discount is
            // already applied in usage.input_tokens by Anthropic, so
            // passing as-is is correct.
            logAiCost(params.model, usage.input_tokens, usage.output_tokens, _fnName);
          }
        } catch {}
      }
      return res;
    } catch (e) {
      lastErr = e;
      const status = e?.status || e?.response?.status;
      const is429 = status === 429 || /rate limit|tokens per min|tpm/i.test(e?.message || '');
      const is5xx = status >= 500 && status < 600;
      if ((!is429 && !is5xx) || attempt === MAX_ATTEMPTS - 1) throw e;
      const suggested = _parseRetryAfter(e);
      const waitMs = (suggested ?? 2000 * Math.pow(2, attempt)) + 500;
      console.warn(`Claude ${status} on ${_fnName} — waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
      await _sleep(waitMs);
    }
  }
  throw lastErr;
}

// Generate text from Claude. systemPrompt is split into a cacheable
// prefix (the long, stable instruction block) and per-call user content
// — Anthropic auto-caches >1024-token system blocks tagged with
// cache_control: ephemeral, which lasts ~5 min. That cuts cost on
// follow-up calls in the same scan.
async function claudeGenerate(systemPrompt, userPrompt, maxTokens = 4000, _fnName = 'claudeGenerate') {
  if (!hasClaude()) throw new Error('ANTHROPIC_API_KEY not set');
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: [
      // Mark the system block as cacheable. Anthropic only caches
      // prefixes >=1024 tokens; smaller systems are ignored silently
      // and behave normally.
      { type: 'text', text: systemPrompt || '', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  };
  const res = await claudeEnqueue(() => _claudeCallWithRetry(params, _fnName));
  // Anthropic responses are content blocks; we only request text.
  const text = (res.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  return text || '';
}

// JSON-mode helper: instruct Claude to return ONLY JSON, then strip
// any code fences or stray text before parse. Mirrors safeJSON behaviour
// elsewhere in the codebase.
async function claudeGenerateJson(systemPrompt, userPrompt, maxTokens = 4000, _fnName = 'claudeGenerateJson') {
  const raw = await claudeGenerate(
    `${systemPrompt}\n\nReturn ONLY valid JSON. No prose, no code fences.`,
    userPrompt,
    maxTokens,
    _fnName,
  );
  // Strip ```json fences and surrounding whitespace defensively
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return stripped;
}

module.exports = {
  hasClaude,
  claudeGenerate,
  claudeGenerateJson,
  CLAUDE_MODEL,
  CLAUDE_PRICING,
};
