// AI client — dual model routing
// Gemini 2.5 Flash : embeddings, prescan, narrative advice, industry news
// OpenAI           : all deep analysis tasks (with Gemini fallback)

const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai').default || require('openai');
const { SERVICE_INDUSTRY_ENUM, CLIENT_INDUSTRY_ENUM, snapTaxonomyFields } = require('./taxonomy');

// ── AI Cost Tracking ──────────────────────────────────────────────────────
// Logs token usage and estimated cost per AI call. Uses a thread-local
// context (set by the caller) to tag costs by category (e.g. 'rfp_scan',
// 'proposal_analysis', 'proposal_generation').
//
// Pricing (approximate, per 1M tokens — update when models change):
const PRICING = {
  // OpenAI
  'gpt-4o':       { input: 2.50, output: 10.00 },
  'gpt-4o-mini':  { input: 0.15, output: 0.60 },
  // Gemini
  'gemini-2.5-flash':  { input: 0.15, output: 0.60 },
  'gemini-2.0-flash':  { input: 0.10, output: 0.40 },
  'gemini-1.5-flash':  { input: 0.075, output: 0.30 },
  // Embeddings (per 1M tokens, output=0)
  'text-embedding-004':    { input: 0.006, output: 0 },
  'text-embedding-3-small': { input: 0.020, output: 0 },
};

// Context for tagging costs — set before calling AI functions
let _costContext = { category: 'unknown', scanId: null, projectId: null };
function setCostContext(ctx) { _costContext = { ..._costContext, ...ctx }; }
function getCostContext() { return _costContext; }

function logAiCost(model, inputTokens, outputTokens, functionName) {
  try {
    const pricing = PRICING[model] || PRICING['gemini-2.5-flash'];
    const cost = ((inputTokens / 1_000_000) * pricing.input) + ((outputTokens / 1_000_000) * pricing.output);
    const { getDb } = require('./db');
    const db = getDb();
    db.prepare(`INSERT INTO ai_cost_log (category, function_name, model, input_tokens, output_tokens, estimated_cost, scan_id, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      _costContext.category || 'unknown',
      functionName || 'unknown',
      model,
      inputTokens || 0,
      outputTokens || 0,
      Math.round(cost * 1_000_000) / 1_000_000, // 6dp precision
      _costContext.scanId || null,
      _costContext.projectId || null,
    );
  } catch (e) {
    // Non-fatal — never let cost logging break the AI call
  }
}

// ── GEMINI SETUP ──────────────────────────────────────────────────────────────
// Deduped so each model is only tried once per request. `gemini-1.5-flash`
// was removed on 2026-04 — it now 404s on the v1beta endpoint. `flash-latest`
// is Google's always-valid alias and is kept as a true last resort.
const GEMINI_MODELS = Array.from(new Set([
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
].filter(Boolean)));

const EMB_MODELS = [
  'models/text-embedding-004',
  'text-embedding-004',
  'gemini-embedding-exp-03-07',
  'models/gemini-embedding-exp-03-07',
];

let _geminiClient = null;
function geminiClient() {
  if (!_geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set in .env.local');
    _geminiClient = new GoogleGenerativeAI(key);
  }
  return _geminiClient;
}

// Sleep helper for retry backoff
const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Classify Gemini errors:
//  - "missing"   → model doesn't exist or wrong args; skip to next model
//  - "transient" → 503/429/overload/quota; retry once then move on
//  - "fatal"     → auth, network, anything else; throw immediately
function _classifyGeminiError(e) {
  const msg = (e.message || '').toLowerCase();
  if (msg.includes('not found') || msg.includes('404') || msg.includes('invalid_argument')) return 'missing';
  if (msg.includes('503') || msg.includes('429') ||
      msg.includes('unavailable') || msg.includes('overloaded') ||
      msg.includes('high demand') || msg.includes('quota') ||
      msg.includes('rate limit') || msg.includes('resource_exhausted')) return 'transient';
  return 'fatal';
}

async function geminiGenerate(prompt, json = false, _fnName = 'geminiGenerate') {
  let lastErr;
  for (const m of GEMINI_MODELS) {
    // Try each model with one retry on transient errors
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cfg = json ? { responseMimeType: 'application/json' } : {};
        const model = geminiClient().getGenerativeModel({ model: m, generationConfig: cfg });
        const r = await model.generateContent(prompt);
        // Log cost — Gemini returns usageMetadata on the response
        try {
          const meta = r.response.usageMetadata;
          if (meta) logAiCost(m, meta.promptTokenCount || 0, meta.candidatesTokenCount || 0, _fnName);
        } catch {}
        return r.response.text();
      } catch (e) {
        lastErr = e;
        const kind = _classifyGeminiError(e);
        if (kind === 'missing') break; // try next model immediately
        if (kind === 'transient') {
          if (attempt === 0) {
            // Backoff: 2s on first retry. Quick enough to not block the
            // pipeline noticeably; long enough that Google's "spike" usually clears.
            console.warn(`Gemini ${m} transient error, retrying in 2s:`, e.message);
            await _sleep(2000);
            continue;
          }
          // Second attempt also failed — fall through to next model in list
          console.warn(`Gemini ${m} still failing after retry, trying next model`);
          break;
        }
        // Fatal — auth, network, etc. Don't waste more calls.
        throw e;
      }
    }
  }
  throw lastErr || new Error('No Gemini model available');
}

// ── OPENAI SETUP ──────────────────────────────────────────────────────────────
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

let _openaiClient = null;
function openaiClient() {
  if (!_openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set in .env.local');
    _openaiClient = new OpenAI({ apiKey: key });
  }
  return _openaiClient;
}

function hasOpenAI() { return !!process.env.OPENAI_API_KEY; }

// ── CUSTOM PROMPT LOADER ─────────────────────────────────────────────────────
// Loads user-customised prompts from DB, falls back to hardcoded defaults
function getCustomPrompt(key, defaultContent) {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'proposaliq.db');
    const db = new Database(dbPath);
    const row = db.prepare('SELECT content FROM custom_prompts WHERE prompt_key = ?').get(key);
    db.close();
    if (row?.content) return row.content;
  } catch {}
  return defaultContent;
}

// ── MASTER SYSTEM PROMPT ──────────────────────────────────────────────────────
// Applied to every OpenAI call. Establishes the role, objective, and rejection criteria.
const MASTER_SYSTEM = `You are a senior bid strategist operating within ProposalIQ — a knowledge intelligence system that helps organisations win proposals by learning from their past work.

Your objective is NOT to summarise documents. Your objective is to extract, evaluate, and apply what has worked before to increase the probability of winning the current bid.

Every output you produce must follow this logic:
1. Understand the context (industry, problem, audience, deliverable)
2. Identify what is genuinely relevant based on meaning, not keywords
3. Prioritise evidence from high-performing, won proposals
4. Extract reusable intelligence: structures, approaches, proof points, strong language
5. Apply that intelligence to the new context with appropriate adaptation

General rules:
- Be specific, concrete, and commercially useful.
- Prefer evidence, structure, and strategic relevance over surface similarity.
- Do not praise the material.
- Do not repeat the brief back unless doing so adds strategic value.
- Do not include generic proposal advice.
- Only include points that would materially improve the quality of the bid or the usefulness of the repository.
- Where evidence is weak or absent, say so clearly.
- Where you make an inference, label it as an inference.

HARD RULES — violations will make the output useless:
- NEVER copy content directly — always adapt it to context
- NEVER produce generic phrases such as "we are experts", "we deliver value", "proven track record", "innovative solutions" — reject them explicitly
- ALWAYS prefer specific, evidence-based language over general claims
- ALWAYS explain WHY something is relevant or effective
- ALWAYS optimise for clarity, credibility, and likelihood of winning
- Return ONLY valid JSON. No markdown, no commentary, no preamble.`;

// In-process serial queue for OpenAI chat completions. The free/default
// gpt-4o tier caps at 30,000 tokens/min, so firing multiple analyses in
// parallel (e.g. batch uploads, reindex) reliably triggers 429s. A single
// in-flight request at a time keeps the TPM window from spiking and lets
// us cleanly apply 429-retry logic per call.
let _openaiQueue = Promise.resolve();
function openaiEnqueue(fn) {
  const next = _openaiQueue.then(fn, fn);
  // Prevent the chain from holding onto rejections
  _openaiQueue = next.catch(() => {});
  return next;
}

// Parse the "Please try again in Xs/Xms" hint OpenAI returns with 429s so
// we wait exactly long enough instead of guessing.
function _parseRetryAfterMs(err) {
  const msg = err?.message || '';
  const mMs = msg.match(/try again in ([\d.]+)\s*ms/i);
  if (mMs) return Math.ceil(parseFloat(mMs[1]));
  const mS = msg.match(/try again in ([\d.]+)\s*s/i);
  if (mS) return Math.ceil(parseFloat(mS[1]) * 1000);
  const header = err?.headers?.['retry-after'] || err?.response?.headers?.['retry-after'];
  if (header) return Math.ceil(parseFloat(header) * 1000);
  return null;
}

async function _openaiCallWithRetry(params, _fnName) {
  const client = openaiClient();
  const MAX_ATTEMPTS = 4;
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.chat.completions.create(params);
      const usage = res.usage;
      if (usage) logAiCost(params.model, usage.prompt_tokens, usage.completion_tokens, _fnName);
      return res;
    } catch (e) {
      lastErr = e;
      const status = e?.status || e?.response?.status;
      const is429 = status === 429 || /rate limit|tokens per min|tpm/i.test(e?.message || '');
      if (!is429 || attempt === MAX_ATTEMPTS - 1) throw e;
      const suggested = _parseRetryAfterMs(e);
      // Back off for the suggested window plus a small jitter buffer so the
      // next request lands just after the TPM window rolls over.
      const waitMs = (suggested ?? 2000 * Math.pow(2, attempt)) + 500;
      console.warn(`OpenAI 429 on ${_fnName} — waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
      await _sleep(waitMs);
    }
  }
  throw lastErr;
}

async function openaiGenerate(systemSuffix, userPrompt, maxTokens = 4000, _fnName = 'openaiGenerate') {
  const system = systemSuffix ? `${MASTER_SYSTEM}\n\n${systemSuffix}` : MASTER_SYSTEM;
  const params = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  };
  const res = await openaiEnqueue(() => _openaiCallWithRetry(params, _fnName));
  return res.choices[0].message.content || '{}';
}

async function openaiGenerateText(systemSuffix, userPrompt, maxTokens = 4000, _fnName = 'openaiGenerateText') {
  const system = systemSuffix ? `${MASTER_SYSTEM}\n\n${systemSuffix}` : MASTER_SYSTEM;
  const params = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
  };
  const res = await openaiEnqueue(() => _openaiCallWithRetry(params, _fnName));
  return res.choices[0].message.content || '';
}

// ── SHARED HELPERS ────────────────────────────────────────────────────────────

// Strip <thinking>...</thinking> blocks before JSON parse.
// Refined prompts ask the model to "warm up" inside a thinking tag before
// committing to structured output — this improves quality but the tag must
// be removed before JSON.parse.
function stripThinking(text) {
  return (text || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

// Build the ORGANISATION CONTEXT prompt block injected into downstream
// AI calls (gaps, win strategy, brief, drafts). Kept centralised so the
// format stays consistent across prompts. Returns empty string if there's
// no confirmed profile yet — prompts should degrade gracefully.
function buildOrgProfileBlock(orgProfile) {
  if (!orgProfile || !orgProfile.confirmed_profile) return '';
  const c = orgProfile.confirmed_profile;
  const offerings = Array.isArray(c.offerings) ? c.offerings : [];
  if (offerings.length === 0) return '';

  const core = offerings.filter(o => o.is_core);
  const other = offerings.filter(o => !o.is_core);
  const clientTypes = Array.isArray(c.client_types) ? c.client_types : [];
  const positioning = Array.isArray(c.positioning_phrases) ? c.positioning_phrases : [];
  const differentiators = Array.isArray(c.differentiators) ? c.differentiators : [];

  const lines = [
    '═══════════════════════════════════════════════════════════════════════════',
    'ORGANISATION CONTEXT — what the user\'s org actually does (user-confirmed)',
    '═══════════════════════════════════════════════════════════════════════════',
    orgProfile.org_name ? `Org: ${orgProfile.org_name}` : null,
  ];
  if (core.length > 0) {
    lines.push('', 'Core offerings (central to the business):');
    core.forEach(o => {
      lines.push(`  · ${o.label}${o.canonical_taxonomy_match ? ` (${o.canonical_taxonomy_match})` : ''}`);
    });
  }
  if (other.length > 0) {
    lines.push('', 'Other offerings:');
    other.forEach(o => {
      lines.push(`  · ${o.label}${o.canonical_taxonomy_match ? ` (${o.canonical_taxonomy_match})` : ''}`);
    });
  }
  if (clientTypes.length > 0) {
    lines.push('', `Client types served: ${clientTypes.map(c => c.label).join(', ')}`);
  }
  if (positioning.length > 0) {
    lines.push('', 'Positioning:');
    positioning.forEach(p => lines.push(`  "${p}"`));
  }
  if (differentiators.length > 0) {
    lines.push('', 'Differentiators:');
    differentiators.forEach(d => lines.push(`  · ${d}`));
  }
  lines.push('', 'IMPORTANT: When assessing fit, recommending capabilities, or writing drafts, stay grounded in these confirmed offerings. Do not suggest or imply capabilities the org has not confirmed.');
  return lines.filter(l => l !== null).join('\n');
}

// ── Interpretive context block ────────────────────────────────────────────
// Small, prompt-ready paragraph describing the project / RFP in terms the
// AI can use to CALIBRATE its interpretation (tone expectations, what
// counts as evidence, sector terminology norms) WITHOUT changing the
// scoring bands or hard caps. Injected into downstream analyses that
// would otherwise run context-blind.
//
// Important: the header is "INTERPRETIVE CONTEXT — informational only".
// Prompts that consume this block MUST say explicitly that the rubric
// stays unchanged so scores remain comparable across projects.
function buildContextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const bits = [];
  if (ctx.client) bits.push(`Client: ${ctx.client}`);
  const taxonomy = [ctx.service_industry, ctx.client_industry].filter(Boolean).join(' / ');
  if (taxonomy) bits.push(`Taxonomy: ${taxonomy}`);
  if (ctx.sector) bits.push(`Legacy sector tag: ${ctx.sector}`);
  if (ctx.contract_value) bits.push(`Scale: ~£${Math.round((ctx.contract_value || 0) / 1000)}K`);
  const deliverables = Array.isArray(ctx.deliverables) ? ctx.deliverables.slice(0, 6) : [];
  if (deliverables.length > 0) bits.push(`Deliverables in scope: ${deliverables.join('; ')}`);
  const themes = Array.isArray(ctx.key_themes) ? ctx.key_themes.slice(0, 5) : [];
  if (themes.length > 0) bits.push(`Themes: ${themes.join(', ')}`);
  if (ctx.outcome && ctx.outcome !== 'pending') bits.push(`Known outcome: ${ctx.outcome}`);
  if (bits.length === 0) return '';
  return [
    'INTERPRETIVE CONTEXT — informational only; rubric and scoring bands are unchanged:',
    ...bits.map(b => `  · ${b}`),
    'Use this to calibrate what counts as domain-appropriate evidence, tone, and terminology. Do not adjust score caps or bands.',
  ].join('\n');
}

// RFP-side equivalent of buildContextBlock. Same pattern: condensed
// interpretive framing prepended to RFP-stage AI calls so they calibrate
// their judgments (what's a fair methodology, what's domain-appropriate
// tone, what proof points competitors will bring) to the actual work on
// offer — without relaxing any scoring bands or caps that keep output
// comparable across scans.
function buildRfpContextBlock(rfpData) {
  if (!rfpData || typeof rfpData !== 'object') return '';
  const bits = [];
  if (rfpData.title) bits.push(`Title: ${rfpData.title}`);
  if (rfpData.client) bits.push(`Client: ${rfpData.client}`);
  const taxonomy = [rfpData.service_industry, rfpData.client_industry].filter(Boolean).join(' / ');
  if (taxonomy) bits.push(`Taxonomy: ${taxonomy}`);
  if (rfpData.sector) bits.push(`Legacy sector tag: ${rfpData.sector}`);
  if (rfpData.contract_value) bits.push(`Apparent scale: ~£${Math.round((rfpData.contract_value || 0) / 1000)}K`);
  else if (rfpData.budget) bits.push(`Apparent scale: ${rfpData.budget}`);
  if (rfpData.timeline) bits.push(`Timeline: ${rfpData.timeline}`);
  const deliverables = Array.isArray(rfpData.deliverables) ? rfpData.deliverables.slice(0, 6) : [];
  if (deliverables.length > 0) bits.push(`Deliverables requested: ${deliverables.join('; ')}`);
  const scope = Array.isArray(rfpData.scope) ? rfpData.scope.slice(0, 5) : (rfpData.scope ? [rfpData.scope] : []);
  if (scope.length > 0) bits.push(`Scope: ${scope.join('; ')}`);
  const themes = Array.isArray(rfpData.key_themes) ? rfpData.key_themes.slice(0, 5) : [];
  if (themes.length > 0) bits.push(`RFP themes: ${themes.join(', ')}`);
  const mandatories = Array.isArray(rfpData.mandatory_requirements) ? rfpData.mandatory_requirements.slice(0, 5) : [];
  if (mandatories.length > 0) bits.push(`Mandatories highlighted: ${mandatories.join('; ')}`);
  if (bits.length === 0) return '';
  return [
    'INTERPRETIVE CONTEXT — informational only; rubric and scoring bands are unchanged:',
    ...bits.map(b => `  · ${b}`),
    'Use this to calibrate what counts as a domain-appropriate match, methodology, evidence type, and approach. A creative bid and a data-migration bid have very different norms. Do not relax gap severities, match-relevance caps, or verdict thresholds.',
  ].join('\n');
}

function safeJSON(text) {
  const stripped = stripThinking(text);
  const c = stripped.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(c); } catch {
    const m = c.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    // Last resort — try to find a JSON array
    const a = c.match(/\[[\s\S]*\]/);
    if (a) try { return JSON.parse(a[0]); } catch {}
    return null;
  }
}

function fallbackMeta(name, sector, description) {
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
    writing_style: null, winning_language: [],
  };
}

// ── EMBEDDINGS (Gemini → OpenAI fallback) ─────────────────────────────────────
async function embed(text) {
  const textSlice = text.slice(0, 8000);

  if (process.env.GEMINI_API_KEY) {
    for (const modelName of EMB_MODELS) {
      try {
        const model = geminiClient().getGenerativeModel({ model: modelName });
        const result = await model.embedContent(textSlice);
        return result.embedding.values;
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('not found') || msg.includes('404') || msg.includes('not supported')) continue;
        throw e;
      }
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await openaiClient().embeddings.create({
        model: 'text-embedding-3-small',
        input: textSlice,
      });
      return result.data[0].embedding;
    } catch (e) {
      throw new Error('Both Gemini and OpenAI embeddings failed: ' + e.message);
    }
  }

  throw new Error('No embedding model available — set GEMINI_API_KEY or OPENAI_API_KEY in .env.local');
}

// ── FULL PROPOSAL ANALYSIS ────────────────────────────────────────────────────
async function analyseProposal(text, rating, userNotes) {
  // Send full document — OpenAI supports up to 128k tokens
  const docText = text;
  // Rating context: deliberately neutral. Earlier versions said "this is a
  // high-performing proposal" which primed the model to rationalise high
  // scores. We now only supply it for context without anchoring.
  const ratingContext = rating >= 4
    ? 'Reviewer rating: 4-5/5 (good). Score on the text itself — do not inflate to match the rating.'
    : rating <= 2
    ? 'Reviewer rating: 1-2/5 (poor). Score on the text itself — do not deflate to match the rating.'
    : 'Reviewer rating: not provided or middling. Score strictly on the text itself.';

  const defaultSuffix = `You are a senior bid strategist grading a proposal against public-sector / FTSE-250 procurement standards. This is NOT a generous exercise. Most proposals you see are mediocre and should score there; excellent proposals are rare.
${ratingContext}
User notes: "${userNotes || 'none'}"

YOUR GOAL: extract what actually makes this proposal win or lose — not what it says, but what about it would persuade or fail to persuade an evaluator reviewing it against 5-8 competitors.

═══════════════════════════════════════════════════════════════════════════
ANTI-BIAS DIRECTIVES — read before scoring
═══════════════════════════════════════════════════════════════════════════

1. The example numbers in the JSON schema are PLACEHOLDER TYPES (integer 0–100).
   They are NOT suggested values. Do not anchor to them. Start from zero and
   award points only where the text earns them.
2. "Structurally complete" ≠ "good". A proposal with an exec summary,
   approach, experience, team, and pricing is structurally complete and
   still scores 30–45 if the content of each section is generic.
3. If the text contains placeholder patterns ("Example 1", "Client A",
   "[Insert client name]", round-numbered day counts, generic role bios),
   treat it as a template that has not been written for this client. Cap
   credibility_signals.overall_score at 35 and writing_quality.specificity_score at 50.
4. Count SPECIFIC facts before scoring. A specific fact is: a named real
   client, a quantified outcome (%, £, days, users), a named technology
   (PRINCE2, FHIR, Snowflake, Kafka), a named individual with a verifiable
   credential, or a named regulatory framework. If the text contains fewer
   than 3 specific facts across the entire document, no score can exceed 50.
5. Generic verbs ("enable", "establish", "build capabilities", "unlock value",
   "drive transformation") are evidence of template language, not substance.
   Presence of 5+ such phrases without specific support = writing_quality
   weakness; do not reward them.
6. "Pain points" that could apply to any company in the sector ("improve
   data quality", "enable data-driven decisions") are boilerplate, not
   understanding. They do not raise the understanding score.

═══════════════════════════════════════════════════════════════════════════
REJECT vs ACCEPT — concrete examples
═══════════════════════════════════════════════════════════════════════════

❌ REJECT — generic "could apply to anyone":
   "Our team has a proven track record of delivering value"
   "We bring deep sector expertise to every engagement"
   "Our methodology ensures successful outcomes"
   "Trusted partner of choice for transformation"
   "Example 1: Retail Data Transformation – Built central data platform"
   "Phase 1: Maturity Assessment. Outputs: gap analysis."

✅ ACCEPT — specific, evidence-bearing, anchored to a real fact:
   "Reduced HMRC's onboarding cycle from 14 days to 3 by replacing the
    legacy SAP IDoc layer with an event-driven Kafka pipeline"
   "Our lead architect ran the Met Office's £12M data migration —
    referenced explicitly in the G-Cloud 14 procurement framework"
   "Delivered 47 NHS Trust integrations using the same FHIR adapter
    pattern referenced in section 4.2 of this RFP"

❌ REJECT — vague theme:
   "key_themes": ["digital transformation", "innovation", "data"]

✅ ACCEPT — specific theme:
   "key_themes": ["NHS Spine FHIR API integration",
                  "OAuth 2.0 federation across 47 trusts",
                  "PRINCE2 + SAFe 5.0 hybrid delivery"]

═══════════════════════════════════════════════════════════════════════════
SCORING CALIBRATION — anchor every score to real-world reference points
═══════════════════════════════════════════════════════════════════════════

  95–100  Bain/McKinsey published case study quality — every claim cited,
          every number sourced, every methodology named with rationale,
          multiple named senior individuals with verifiable past work.
          Reserved for genuinely exceptional work. <2% of real proposals.

  85–94   Strong specialist firm — every claim has a named client or
          quantified outcome, no filler, clear differentiation. ~5% of real
          proposals reach this bar.

  75–84   Solid mid-tier with specific evidence — at least 60% of claims
          anchored, named clients in experience section, at least one named
          methodology, explicit risk list with mitigations, named team with
          credentials. A "well-written competent proposal".

  65–74   Competent — structurally sound but several claims unsupported,
          some filler, some generic sections. Would be middle-of-the-pack
          against serious competitors.

  55–64   Generic in places — could have been written by any competitor in
          this sector with light editing. Recognisable template language in
          the executive summary or approach.

  40–54   Mostly boilerplate — recognisably template-driven. Experience
          section has weak or no named clients. Approach section is a
          generic phased structure with no client-specific content. Pain
          points could apply to any company in the sector.

  25–39   Placeholder-driven — literal "Example 1 / Example 2" in experience,
          no named clients, no named methodologies, no named technologies,
          no risks, no measurable outcomes. This is an unfinished draft or
          a raw template, not a competitive proposal.

  Below 25  Pure boilerplate — assemble-from-stock-phrases quality, would
          be disqualified in a serious procurement.

═══════════════════════════════════════════════════════════════════════════
GENERIC-PHRASE BLACKLIST — penalise density, not presence
═══════════════════════════════════════════════════════════════════════════

Phrases that signal template language. Presence of 1-2 is forgivable;
5+ across the document is a red flag. Count hits before scoring.

  proven track record · trusted partner · deep expertise · holistic
  approach · tailored solution · drive value · unlock potential ·
  world-class · best-in-class · cutting-edge · innovative solutions ·
  we deliver value · end-to-end · leading provider · strategic partner ·
  value-add · commitment to excellence · customer-centric approach ·
  best-of-breed · results-driven · next-generation · industry-leading

═══════════════════════════════════════════════════════════════════════════
LENGTH CALIBRATION — concision is a skill, not a symptom
═══════════════════════════════════════════════════════════════════════════

Length should match the scope of the bid. Evaluators scan, so dense
concise writing beats padded prose; but too short signals lack of effort.
Tight heuristic:

  <500 words for a commercial bid:      too thin, cap length_calibration ≤ 30
  500-1,500 words:                      only fine for small/simple bids
  1,500-6,000 words:                    typical competitive range
  6,000-15,000 words:                   appropriate for complex engagements
  15,000+ words:                        must be justified by scope; otherwise
                                        cap length_calibration ≤ 60 for
                                        unfocused padding

Judge the content, not just the word count. A dense 3,000-word proposal
with specifics beats a 12,000-word proposal padded with generic narrative.

═══════════════════════════════════════════════════════════════════════════
HARD CAPS — apply BEFORE writing the scores
═══════════════════════════════════════════════════════════════════════════

Apply these caps when the corresponding condition is true. They override
everything else.

- No named real clients in the experience section (or "Example 1/2/3"
  placeholders): credibility_signals.overall_score ≤ 35, credibility_signals.named_past_work = false,
  credibility_signals.social_proof ≤ 25
- Zero named methodologies OR named structured approaches (examples by
  domain — this list is NOT exhaustive, accept any equivalent named
  framework from the relevant field):
    Consulting / IT:     PRINCE2, SAFe, Agile/Scrum, DAMA-DMBOK, TOGAF,
                         FHIR, HIPAA, ISO 27001, ITIL, Six Sigma, Lean,
                         DevOps / SRE, DevSecOps, data-mesh, zero-trust
    Creative / Film:     observational documentary, fly-on-the-wall,
                         cinéma vérité, run-and-gun, stop-motion,
                         Dogme 95, three-act structure, hero's journey,
                         storyboarding-first, director-led, agency model
    Comms / PR:          RACE, SOSTAC, PESO model, earned-media-first,
                         issues-and-crisis framework, message-house,
                         stakeholder-mapping, strategic narrative
    Design / UX:         double-diamond, design thinking, IDEO 3-lens,
                         jobs-to-be-done, service-design blueprint,
                         user-centred design, Atomic Design
    Research:            ethnographic, grounded-theory, mixed-methods,
                         MEAL, theory-of-change, RCT design, conjoint,
                         jobs-to-be-done interviews
    Learning / L&D:      ADDIE, SAM, 70-20-10, Kirkpatrick evaluation
    Proprietary named frameworks (e.g. "our three-pillar Authenticity
    / Trust / Time framework") count as named methodologies IF the
    proposal actually names and explains them. Unnamed "our approach"
    blobs do not count.
  If none of the above or an equivalent appears:
  approach_quality.methodology_clarity ≤ 50
- Zero risks AND zero mitigations named OR addressed anywhere in the
  document: approach_quality.risk_acknowledgement ≤ 25
  NOTE: in creative / PR / research / brand / editorial domains,
  risk registers are rarely formal. Treat substantive discussion of
  confidentiality, access, subject availability, schedule pressure,
  logistics, legal/ethical handling, or stakeholder management as
  addressing risk — it does not have to be labelled "risk" to count.
  In data / IT / infrastructure / public-sector bids, a proper risk
  register IS standard; apply the cap strictly.
- Zero named tools / technologies / platforms:
  writing_quality.specificity_score ≤ 55, tools_technologies = []
- Zero quantified outcomes (no %, no £/$ figures beyond pricing, no user
  counts, no durations in experience): writing_quality.evidence_density ≤ 40
- Generic pain points that could apply to any company in the sector:
  win_indicators should not include "client understanding"; loss_risks
  should include "fails to demonstrate genuine understanding of the client"
- Phased approach where each phase is 1 sentence and has no
  client-specific content: approach_quality.phasing_logic ≤ 50,
  approach_quality.innovation_evidence ≤ 30
- 5+ generic-phrase hits from the blacklist above:
  writing_quality.generic_language_score ≤ 40
- 10+ generic-phrase hits: writing_quality.overall_score ≤ 55
- Dominant passive voice OR no first-person use across the document:
  writing_quality.voice_quality ≤ 50
- <500 words total: writing_quality.length_calibration ≤ 30
- 15,000+ words with substantial repetition/filler: writing_quality.length_calibration ≤ 60

Fewer than 3 specific facts across the whole document (as defined in
ANTI-BIAS directive 4): no score in any category can exceed 50.

═══════════════════════════════════════════════════════════════════════════
OVERALL-SCORE CONSISTENCY
═══════════════════════════════════════════════════════════════════════════

Each of writing_quality.overall_score, approach_quality.overall_score
and credibility_signals.overall_score MUST be within ±8 points of the
arithmetic mean of its own sub-scores (the numeric *_score fields
directly beneath it, ignoring soft signals marked "(soft)"). Examples:

  writing sub-scores: specificity 60, evidence 55, client_lang 70,
  exec_summary 65, length 70, voice 60, generic 75
  mean = 65 → writing_quality.overall_score must be 57–73

If you believe the overall should diverge beyond ±8 from that mean,
you MUST include an "overall_rationale" field on the category explaining
why (e.g. "weighted down heavily by the zero-fact cap despite
reasonable sub-scores"). Otherwise adjust the overall to fit the band.

This rule keeps scores comparable across projects. A high overall with
low sub-scores is a calibration bug, not insight.

═══════════════════════════════════════════════════════════════════════════
SOFT SIGNALS — surface as notes, do NOT hard-cap
═══════════════════════════════════════════════════════════════════════════

These vary by firm type. Large established firms often skip individual
client citations or give only sector-level references, and that is fine.
Treat as directional observations rather than penalties.

- Cited work recency: if most cited experience is 5+ years old, note it
  in credibility_signals.weaknesses but do not cap any score.
- Cited work scale-match: if cited examples are much smaller/larger than
  the bid's implied scope, note it — but small references can still be
  relevant if the methodology is transferable.
- Absence of individual client names when sector references are given:
  reduce cited_work_scale_match_score modestly; do not cap overall.
- Compliance matrix presence: bonus, not cap. Note in strengths if present.

═══════════════════════════════════════════════════════════════════════════
GROUNDING REQUIREMENT
═══════════════════════════════════════════════════════════════════════════

For "standout_sentences" — quote EXACTLY from the document, character for
character. Do not paraphrase. If you cannot find sentences that meet the
"specific + evidence-bearing" bar, return fewer (or zero) — never invent.

For "key_themes" and "deliverables" — each must be traceable to a specific
phrase or section in the document. If you cannot point to one, drop it.

For every *_notes field: cite the actual text from the document. Do not
write generic observations. If the text gives you nothing to cite, the
score is too high.`;
  const systemSuffix = getCustomPrompt('proposal_analysis', defaultSuffix);

  const schema = `{
  "executive_summary": "2-3 sentence summary of what this proposal actually does — be specific about the client, problem, and solution",
  "key_themes": ["max 6 specific themes — not generic like 'innovation' but specific like 'NHS Spine API integration'"],
  "deliverables": ["concrete named deliverables with specifics"],
  "methodologies": ["named methodologies — PRINCE2, SAFe, etc. Empty array if none named."],
  "tools_technologies": ["specific tools and platforms named in the document. Empty array if none named."],
  "client_pain_points": ["specific client problems this addresses — not generic. Empty array if only generic pain points are present."],
  "value_propositions": ["specific value claims backed by evidence — reject generic ones"],
  "industry_context": "one sentence on the specific sector context",
  "fact_count": "integer — number of specific facts found across the whole document (named real clients, quantified outcomes, named technologies, named individuals with credentials, named regulatory frameworks). Be strict.",
  "writing_quality": {
    "overall_score": "integer 0-100 per the calibration bands. Must sit within ±8 of the arithmetic mean of this category's sub-scores unless overall_rationale explains the divergence.",
    "overall_rationale": "OPTIONAL. Include only when overall_score diverges from the sub-score mean by more than ±8. Explain why in one sentence.",
    "tone": "executive|technical|narrative|commercial|generic",
    "tone_notes": "one specific sentence — cite actual examples from the text",
    "specificity_score": "integer 0-100",
    "specificity_notes": "cite specific examples of strong or weak specificity from the actual text",
    "evidence_density": "integer 0-100",
    "evidence_notes": "count the named clients, metrics, statistics in the text; quote two examples if any exist, or state there are none",
    "client_language_mirroring": "integer 0-100",
    "client_language_notes": "does it use the client's own terminology and framing? Cite the text.",
    "executive_summary_effectiveness": "integer 0-100",
    "exec_summary_notes": "does it lead with outcome or capability? is it client-focused? Quote the opening sentence.",
    "length_calibration": "integer 0-100 per the length heuristic. 100 = dense and concise for the apparent scope; 50 = reasonable length but padded; 30 or below = too short for effort OR grossly padded.",
    "length_notes": "state approximate word count and whether it's proportionate to the apparent scope. One sentence.",
    "voice_quality": "integer 0-100 measuring active voice + first-person use. 100 = consistently active, first-person plural, confident. 50 = mixed. 20 = heavy passive voice or third-person corporate distancing.",
    "voice_notes": "one sentence — quote an active/first-person example, or quote a passive/third-person example if that dominates.",
    "generic_language_score": "integer 0-100 — INVERSE of generic-phrase density. 100 = zero blacklist hits. 40 or below = 5+ hits. Below 20 = saturated.",
    "generic_phrase_hits": ["exact quotes from the proposal that match the generic-phrase blacklist. Empty array if none."],
    "generic_language_notes": "one sentence — total hit count and the most egregious example if any.",
    "strengths": ["specific writing strength — cite the actual language"],
    "weaknesses": ["specific writing weakness — cite the actual language"]
  },
  "approach_quality": {
    "overall_score": "integer 0-100. Must sit within ±8 of the arithmetic mean of this category's sub-scores unless overall_rationale explains the divergence.",
    "overall_rationale": "OPTIONAL. Include only when overall_score diverges from the sub-score mean by more than ±8. Explain why in one sentence.",
    "methodology_clarity": "integer 0-100",
    "methodology_notes": "is there a named, structured methodology or is it vague? Name it if named.",
    "phasing_logic": "integer 0-100",
    "phasing_notes": "are there clear phases with rationale or just a list of activities? Quote the phase descriptions.",
    "risk_acknowledgement": "integer 0-100. 0 if zero risks are named.",
    "risk_notes": "does it name specific risks and mitigations or ignore them? Quote any risks named.",
    "innovation_evidence": "integer 0-100",
    "innovation_notes": "fresh thinking specific to this client or boilerplate? Cite the evidence.",
    "compliance_matrix_present": "boolean — true only if the proposal contains an explicit compliance/requirements matrix mapping its responses to RFP section numbers or requirement IDs.",
    "compliance_notes": "one sentence. If present, describe what it maps. If absent, state that the proposal does not demonstrate section-by-section compliance.",
    "strengths": ["specific approach strength with evidence"],
    "weaknesses": ["specific approach weakness with evidence"]
  },
  "credibility_signals": {
    "overall_score": "integer 0-100. Max 35 if experience section uses Example 1/2/3 placeholders or no real client names. Must also sit within ±8 of the arithmetic mean of this category's sub-scores (ignoring soft signals) unless overall_rationale explains the divergence.",
    "overall_rationale": "OPTIONAL. Include only when overall_score diverges from the sub-score mean by more than ±8 (e.g. the named-client hard cap forced a value below the sub-score mean). Explain in one sentence.",
    "named_past_work": "boolean — true only if real client names appear in the experience section. Placeholders like 'Example 1' = false.",
    "named_past_work_notes": "which specific past projects are named? are they relevant? If placeholders, say so.",
    "team_credibility": "integer 0-100",
    "team_notes": "are specific named individuals with verifiable credentials cited? Name them.",
    "social_proof": "integer 0-100. Max 25 if no specific client quotes, named outcomes, or quantified statistics.",
    "social_proof_notes": "specific client quotes, named outcomes, quantified statistics? Quote any.",
    "differentiator_strength": "integer 0-100",
    "differentiator_notes": "what genuinely differentiates this from a generic proposal? Cite the text.",
    "cited_work_recency_score": "integer 0-100 — SOFT signal. 100 = cited work is within the last 3 years. 50 = mix of recent and older. 20 = mostly 5+ years old. Does NOT hard-cap other scores — some firms legitimately rely on sector references over recent citations.",
    "cited_work_recency_notes": "one sentence — state the approximate date range of cited work, or 'no dates given'.",
    "cited_work_scale_match_score": "integer 0-100 — SOFT signal. 100 = cited work is comparable scale to this bid. 50 = some comparable examples. 20 = cited work is much smaller/larger than implied bid scope. Does NOT hard-cap overall — methodology can still transfer across scales.",
    "cited_work_scale_match_notes": "one sentence — state whether cited scale matches this bid's apparent scope.",
    "strengths": ["specific credibility strength"],
    "weaknesses": ["specific credibility weakness"]
  },
  "writing_style": {
    "primary_style": "executive|technical|narrative|commercial",
    "tone": "formal|conversational|visionary|analytical",
    "complexity": "low|medium|high",
    "notes": "one sentence characterising the overall style"
  },
  "winning_language": [
    {
      "text": "exact sentence quoted from the proposal that is non-generic and high-impact",
      "use_case": "executive summary|approach|credibility|value proposition|risk",
      "why_it_works": "specific reason — evidence, specificity, client-focus, differentiation"
    }
  ],
  "win_indicators": ["specific reasons this proposal would help win — cite actual content"],
  "loss_risks": ["specific reasons this proposal could lose — cite actual content"],
  "standout_sentences": ["1-3 strongest sentences quoted exactly from the document"],
  "service_industry": "WHAT TYPE OF WORK was delivered — the SERVICE, not the client's business. A film made for a bank = Film, Video & Audio. A strategy project for a hospital = Strategy & Advisory. Pick ONE: ${SERVICE_INDUSTRY_ENUM}",
  "service_sectors": ["UP TO 3 sub-sectors from the chosen service industry — must exactly match canonical sector names"],
  "client_industry": "WHO IS THE CLIENT — what industry does the CLIENT ORGANISATION operate in, regardless of what work was done for them. A film for Airbus = Industrial & Manufacturing (because Airbus is aerospace). A website for NHS = Healthcare & Life Sciences (because NHS is healthcare). Do NOT confuse the work type with the client's sector. Pick ONE: ${CLIENT_INDUSTRY_ENUM}",
  "client_sectors": ["UP TO 3 sub-sectors from the chosen client industry — must exactly match canonical sector names"]
}`;

  // Refined user prompt — chain-of-thought + self-critique in one call.
  // The <thinking> block "warms up" the model before structured output.
  // The self-critique step catches generic outputs before they're returned.
  const userPrompt = `Document to analyse:
${docText}

══════════════════════════════════════════════════════════════════════════
STEP 1 — Think before you write. Inside <thinking> tags, work through:
══════════════════════════════════════════════════════════════════════════
  a. List every specific fact in the document: named clients, named
     systems, named methodologies, quantified outcomes, named team
     members, certifications. These are your evidence pool.
  b. Identify the 5 strongest sentences in the document and why they
     are strong (cite the specific evidence each one carries).
  c. Identify 3 weakest stretches — places where the language sounds
     persuasive but carries no evidence.
  d. Decide the calibration band (40 / 55 / 65 / 75 / 85 / 95) based
     on the evidence-to-filler ratio you observed.

══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft the JSON to this schema:
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning, review your draft against:
══════════════════════════════════════════════════════════════════════════
  □ Does any "key_theme" pass the "could this appear in a competitor's
    proposal verbatim?" test? If yes, replace or drop it.
  □ Does every "value_proposition" name a specific client, number,
    system, or methodology? If not, replace or drop it.
  □ Are all "standout_sentences" quoted EXACTLY from the document
    (not paraphrased)? If not, fix or drop them.
  □ Is your writing_quality.overall_score consistent with the
    calibration anchors above? Adjust if drifted.
  □ Do "win_indicators" and "loss_risks" cite specific content rather
    than generic statements?

If any field fails the critique, rewrite that field. Then return final JSON.

Return the final JSON after </thinking>. Return ONLY valid JSON in your final answer (no prose, no code fences).`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 6000);
      const parsed = safeJSON(raw);
      if (parsed?.executive_summary) return { ...parsed, ...snapTaxonomyFields(parsed) };
    }
  } catch (e) {
    console.error('OpenAI analyseProposal failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\n${userPrompt}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed?.executive_summary) return { ...parsed, ...snapTaxonomyFields(parsed) };
  } catch (e) {
    console.error('analyseProposal Gemini fallback failed:', e.message);
  }

  return fallbackMeta('', '', '');
}

// ── RFP EXTRACTION ────────────────────────────────────────────────────────────
async function extractRFPData(text) {
  const docText = text; // Full document

  const systemSuffix = `You are a senior procurement analyst and bid strategist extracting requirements from an RFP.

YOUR GOAL: identify EVERYTHING that will be evaluated — including implicit expectations that are not explicitly stated. A missed requirement is a lost evaluation criterion.

═══════════════════════════════════════════════════════════════════════════
CLASSIFICATION RULES — MUST vs SHOULD vs COULD
═══════════════════════════════════════════════════════════════════════════

MUST  — failure to address = disqualification or auto-fail score.
        Trigger words: "must", "shall", "is required to", "mandatory",
        "minimum", "essential", "non-negotiable", "pass/fail".
        Also: any pre-qualification or eligibility criterion.

SHOULD — important for scoring, expected by evaluators, will lose marks
        if absent but won't disqualify.
        Trigger words: "should", "is expected to", "will be assessed on",
        "will be scored", "preferred", "evaluated against".

COULD — differentiating factor, optional but rewarded.
        Trigger words: "may", "additional credit for", "where possible",
        "advantageous", "would welcome", "consider".

═══════════════════════════════════════════════════════════════════════════
IMPLICIT REQUIREMENTS — what evaluators expect but don't say
═══════════════════════════════════════════════════════════════════════════

These are real and must be extracted. Examples of what to look for:

  • Public-sector RFPs almost always implicitly require: social value
    response, modern slavery statement, cyber essentials, GDPR/DPIA
    posture, accessibility (WCAG), Welsh-language consideration if Wales.
  • Healthcare RFPs implicitly expect: information governance toolkit
    compliance, NHS DSPT, clinical safety standards (DCB0129/0160).
  • High-value RFPs (>£500k) implicitly expect: financial standing
    evidence, insurance levels, SME-supply-chain commitment.
  • Digital transformation RFPs implicitly expect: agile/SAFe methodology,
    user research, accessibility, sustainability of code.

If the RFP's tone, sector, or value class implies an expectation that
isn't explicitly stated, capture it as an implicit_requirement and
explain WHY it's expected based on context.

═══════════════════════════════════════════════════════════════════════════
EXAMPLES — explicit vs implicit
═══════════════════════════════════════════════════════════════════════════

✅ EXPLICIT (cite the clause):
   "REQ-014 [MUST] Technical: Bidder shall demonstrate ISO 27001
    certification valid for the contract term"
   → Source: Section 4.2.1 of the RFP, exact quote.

✅ IMPLICIT (justified by context):
   "The RFP is from an NHS Foundation Trust valued at £2.4M for clinical
    workflow software. NHS DSPT compliance and DCB0129 clinical safety
    case are not explicitly listed but will be evaluated — every NHS
    procurement of this type assesses them."
   → Reason: sector + value + clinical scope.

❌ DO NOT INVENT requirements that have no basis in the document or
   sector norms. Better to extract fewer, stronger requirements than
   to pad with speculation.`;

  const schema = `{
  "title": "specific RFP title",
  "client": "client organisation name",
  "sector": "industry sector",
  "key_themes": ["3-6 specific themes — not generic"],
  "requirements": [
    {
      "id": "REQ-001",
      "section": "Technical|Commercial|Governance|Deliverables|Team|Sustainability|Social Value|Innovation",
      "text": "exact requirement as stated",
      "priority": "must|should|could",
      "implicit": false,
      "evaluation_weight": "high|medium|low"
    }
  ],
  "implicit_requirements": [
    {
      "text": "unstated expectation",
      "reason": "why this is expected based on context, tone, or sector norms",
      "priority": "must|should|could"
    }
  ],
  "evaluation_criteria": ["named evaluation criteria from the document"],
  "evaluation_logic": ["what will determine winning vs losing based on the document structure and emphasis"],
  "hidden_expectations": ["tone expectations, level of detail expected, risk sensitivity, stakeholder expectations"],
  "contract_value_hint": "value hint if mentioned",
  "deadline": "submission deadline if stated",
  "procurement_framework": "framework or vehicle if stated",
  "service_industry": "WHAT WORK is being procured — the SERVICE TYPE. A film production brief = Film, Video & Audio. A cloud migration = Technology & Digital. Pick ONE: ${SERVICE_INDUSTRY_ENUM}",
  "service_sectors": ["UP TO 3 sub-sectors from the chosen service industry that match what this RFP needs"],
  "client_industry": "WHO IS ISSUING THIS RFP — what industry does the BUYING ORGANISATION operate in, regardless of what work they're procuring. An airline buying a film = Transport, Logistics & Supply Chain. A bank buying software = Financial Services. Pick ONE: ${CLIENT_INDUSTRY_ENUM}",
  "client_sectors": ["UP TO 3 sub-sectors from the chosen client industry"]
}`;

  const userPrompt = `RFP Document:
${docText}

══════════════════════════════════════════════════════════════════════════
STEP 1 — Think before extracting. Inside <thinking> tags, work through:
══════════════════════════════════════════════════════════════════════════
  a. Identify the issuing organisation and its sector. What sector-norm
     expectations come with this type of buyer?
  b. Identify the contract value class (≤£100k, £100k–£500k, £500k–£2M, >£2M).
     Different value classes carry different implicit requirements.
  c. Scan for explicit requirements section by section. List MUSTs first,
     then SHOULDs, then COULDs. Do not skip the small print.
  d. Identify the evaluation methodology (most economically advantageous,
     quality/price split, pass/fail gates). This shapes priorities.
  e. List 5–10 implicit requirements based on sector + value + scope.
     For each, write the specific reason an evaluator will expect it.

══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft the JSON to this schema:
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning, review your draft against:
══════════════════════════════════════════════════════════════════════════
  □ Did you capture EVERY MUST? Re-scan the document for trigger words
    ("must", "shall", "mandatory") and confirm coverage.
  □ Is each requirement traceable to a specific section or sentence in
    the document? If not, drop or move to implicit_requirements.
  □ Are implicit_requirements actually justified by context, or are
    they speculation? Drop any without a clear "why".
  □ Is the priority for each MUST actually pass/fail? Demote SHOULDs
    that are merely strongly preferred.
  □ CRITICAL — did you confuse the CLIENT'S industry with the WORK TYPE?
    A film project for a defence company → client = Industrial & Manufacturing,
    service = Film, Video & Audio. NOT client = Technology/Media.
    Ask: "What business is the CLIENT in?" — that's client_industry.
    Ask: "What work did WE deliver?" — that's service_industry.
    These must be different answers for cross-sector work.

If any field fails the critique, fix it. Then return final JSON after
</thinking>. Return ONLY valid JSON in your final answer.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 6000);
      const parsed = safeJSON(raw);
      if (parsed?.requirements) {
        parsed.requirements = parsed.requirements.map(r => ({
          ...r, priority: r.priority || 'should', section: r.section || 'Other',
        }));
        return { ...parsed, ...snapTaxonomyFields(parsed) };
      }
    }
  } catch (e) {
    console.error('OpenAI extractRFPData failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\n${userPrompt}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed) {
      if (parsed.requirements) {
        parsed.requirements = parsed.requirements.map(r => ({
          ...r, priority: r.priority || 'should', section: r.section || 'Other',
        }));
      }
      return { ...parsed, ...snapTaxonomyFields(parsed) };
    }
  } catch (e) {
    console.error('extractRFPData Gemini fallback failed:', e.message);
  }

  return { title: 'Untitled RFP', client: 'Unknown', sector: 'Unknown', key_themes: [], requirements: [], implicit_requirements: [], evaluation_criteria: [], evaluation_logic: [], hidden_expectations: [], contract_value_hint: '', deadline: '' };
}

// ── GAP ANALYSIS ──────────────────────────────────────────────────────────────
async function analyseGaps(rfpData, matchedProposals, teamMembers, orgProfile = null) {
  const topMatches = (matchedProposals || []).slice(0, 5).map(p => {
    const meta = p.ai_metadata || {};
    const wq = meta.writing_quality || {};
    return `- "${p.name}" (${p.outcome}, ${p.user_rating}★, writing: ${wq.overall_score || '?'}/100): themes: ${(meta.key_themes || []).join(', ')} | credibility signals: ${(meta.credibility_signals?.named_past_work ? 'has named work' : 'no named work')}`;
  }).join('\n') || 'No matched proposals';

  const reqs = (rfpData.requirements || []).slice(0, 25)
    .map(r => `[${(r.priority || 'should').toUpperCase()}] ${r.section}: ${r.text}`).join('\n') || 'No requirements extracted';

  const teamNames = (teamMembers || []).slice(0, 15).map(m => {
    const cv = m.cv_extracted || {};
    const certs = m.certifications_str || (cv.certifications || []).slice(0, 3).join(', ');
    const sectors = m.sectors_str || m.stated_sectors || (cv.sectors || []).slice(0, 3).join(', ');
    const specs = m.specialisms_str || (m.stated_specialisms || []).join(', ');
    const cvSummary = m.cv_summary || cv.career_summary || '';
    return [
      `${m.name} (${m.title})`,
      specs ? `specialisms: ${specs}` : '',
      sectors ? `sectors: ${sectors}` : '',
      certs ? `certifications: ${certs}` : '',
      cvSummary ? `background: ${cvSummary.slice(0, 120)}` : '',
    ].filter(Boolean).join(' | ');
  }).join('\n') || 'No team configured';

  const implicitReqs = (rfpData.implicit_requirements || []).slice(0, 10)
    .map(r => `[${(r.priority || 'should').toUpperCase()}] ${r.text} — ${r.reason}`).join('\n');

  const defaultGapSuffix = `You are a senior bid consultant identifying material gaps between an RFP and the matched past proposals.

YOUR GOAL: identify the gaps that would MATERIALLY change the probability of winning. Not every difference is a gap. Not every weakness is a deal-breaker.

═══════════════════════════════════════════════════════════════════════════
WHAT COUNTS AS A GAP — and what doesn't
═══════════════════════════════════════════════════════════════════════════

✅ A REAL gap (one of these must be true):
  • The RFP explicitly requires it AND the matched evidence does not
    address it. (highest priority)
  • Evaluators in this sector reliably expect it AND the current
    evidence is weak, indirect, or absent.
  • It is a common bid-winning factor in this type of procurement AND
    the current evidence isn't credible enough to score well.

❌ NOT a gap:
  • The matched proposal uses different wording but covers the same point
  • The matched proposal is from a different sector but the methodology
    transfers cleanly
  • A "nice to have" that won't affect scoring
  • Anything cosmetic, structural, or stylistic
  • Generic categories like "could be more compelling"

═══════════════════════════════════════════════════════════════════════════
EXAMPLES — what good gap analysis looks like
═══════════════════════════════════════════════════════════════════════════

❌ WEAK GAP (vague, generic, won't help the bid team):
   {
     "title": "Limited evidence of past performance",
     "description": "The proposals could include more case studies"
   }

✅ STRONG GAP (specific, actionable, names the requirement):
   {
     "title": "No NHS DSPT compliance evidence (REQ-014, MUST)",
     "description": "RFP REQ-014 requires evidence of NHS Data Security
       and Protection Toolkit compliance for the contract term. Matched
       proposal 'HMRC Onboarding' shows ISO 27001 but does not mention
       DSPT. Two of the three remaining matches are private sector and
       do not address NHS-specific governance.",
     "type": "evidence",
     "priority": "high",
     "impact": "high",
     "suggested_action": "Add a one-page DSPT compliance annex citing
       current toolkit submission status, named DPO, and evidence of
       last audit. Reference Trust DSPT IDs we have submitted for.",
     "suggested_person": "Sarah Chen",
     "suggested_person_reason": "Held the IG lead role on the Imperial
       College Healthcare contract and is a current DSPT auditor",
     "suggested_person_cv": "ISACA CISA, NHS DSPT auditor since 2021"
   }

❌ WEAK GAP (overlap with another, padding):
   "Limited team experience"  +  "Need stronger team credentials"

✅ MERGED, STRONGER GAP:
   "Team CV section lacks named cybersecurity lead" — single, specific.

═══════════════════════════════════════════════════════════════════════════
DISCIPLINE
═══════════════════════════════════════════════════════════════════════════

  • Better 5 sharp gaps than 12 mediocre ones.
  • MUST gaps come first, then high-impact SHOULDs, then COULDs only
    if genuinely differentiating.
  • If evidence is partial not absent, write "weak evidence" not "missing".
  • Every suggested_action must be doable inside the bid response — no
    "build a new product line".
  • If you suggest a person, check their stated specialisms or CV
    actually contain something relevant. If not, omit the person.

Types of gap to consider: technical capability, delivery methodology,
team credibility, sector/client relevance, measurable outcomes, case
study evidence, risk/governance/compliance, sustainability/ESG/social
value, commercial clarity, implementation realism, stakeholder/change
management, local presence where relevant.`;
  const systemSuffix = getCustomPrompt('gap_analysis', defaultGapSuffix);

  const schema = `{
  "coverage_map": [
    {
      "requirement": "the requirement text (abbreviated if long)",
      "priority": "must|should|could",
      "status": "covered|partial|not_covered",
      "evidence_from": "name of the matched proposal that covers this, or null",
      "evidence_summary": "one sentence: what specific evidence exists in the matched proposal, or why it's missing",
      "confidence": "high|medium|low"
    }
  ],
  "coverage_summary": {
    "total": 0,
    "covered": 0,
    "partial": 0,
    "not_covered": 0,
    "coverage_percentage": 80
  },
  "gaps": [
    {
      "title": "specific gap title referencing the RFP requirement",
      "type": "coverage|depth|evidence|capability|tone",
      "priority": "high|med|low",
      "description": "2-3 sentences: what is missing, why it matters, what the evaluator will notice",
      "impact": "high|med|low",
      "suggested_action": "specific action — not generic",
      "escalate_to_human": false,
      "suggested_person": "team member name best placed to address this, or null",
      "suggested_person_reason": "specific reason based on their specialisms or CV",
      "suggested_person_cv": "relevant certification or experience from their CV that directly addresses this gap, or null",
      "source_proposals": ["names of matched proposals that partially address this gap"],
      "source_hint": "which matched proposal partially addresses this, if any"
    }
  ]
}`;

  const rfpCtx = buildRfpContextBlock(rfpData);

  const context = `RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})

${rfpCtx}

Explicit Requirements:
${reqs}

${implicitReqs ? `Implicit Requirements:\n${implicitReqs}\n` : ''}
Matched Proposals (ranked by relevance):
${topMatches}

Team Available:
${teamNames}

${buildOrgProfileBlock(orgProfile)}`;

  const userPrompt = `${context}

══════════════════════════════════════════════════════════════════════════
STEP 1 — COVERAGE MAP FIRST. Inside <thinking> tags, work through
         every requirement one by one:
══════════════════════════════════════════════════════════════════════════

  For EACH requirement listed above (explicit AND implicit):
    a. Does ANY matched proposal contain evidence that directly
       addresses this requirement? Search the themes, deliverables,
       methodologies, and credibility signals of each match.
    b. If yes: status = "covered", name the proposal, summarise
       the specific evidence in one sentence.
    c. If partially: status = "partial", explain what's there and
       what's missing.
    d. If no matched proposal addresses it: status = "not_covered".
    e. Set confidence: high (evidence is explicit and specific),
       medium (evidence is indirect or the scope differs), low
       (inferring from tangential mentions).

  If the ORGANISATION CONTEXT shows we DON'T have a capability
  at all, that's not_covered regardless of matched proposals.

  This coverage map is the PRIMARY output — the gaps are derived
  from it, not the other way around.

══════════════════════════════════════════════════════════════════════════
STEP 2 — GAPS. From the coverage map, extract the "not_covered" and
         "partial" items and frame them as actionable gaps:
══════════════════════════════════════════════════════════════════════════

  a. Group overlapping gaps and pick the strongest framing.
  b. Rank by impact on win probability. Cut anything below the bar.
  c. For each gap, identify whether a specific team member is
     genuinely a fit (check their actual specialisms/CV — do not
     suggest people who only loosely match).

══════════════════════════════════════════════════════════════════════════
STEP 3 — Draft the JSON using this schema (coverage_map FIRST, then gaps):
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 4 — Self-critique. Before returning, review:
══════════════════════════════════════════════════════════════════════════
  □ Does each gap title reference a SPECIFIC requirement, REQ ID, or
    sector expectation? If not, rewrite or drop.
  □ Does each suggested_action describe something doable INSIDE the
    bid response (not a multi-month internal change)? If not, fix.
  □ For each suggested_person — does their CV actually contain
    something directly relevant? If you can't quote it, set to null.
  □ Are any two gaps describing the same underlying issue? Merge them.
  □ Did you accidentally include a "stylistic" or "tone" gap that
    wouldn't move the score? Drop it.
  □ Are MUST gaps listed before SHOULD gaps?

If any gap fails the critique, fix or remove it. Then return final
JSON after </thinking>. Return ONLY valid JSON.`;

  // Returns { coverage_map, coverage_summary, gaps } — the full object.
  // The pipeline saves coverage_map + coverage_summary alongside gaps.
  // For backward compat: if parsed has no coverage_map, return gaps in
  // the old format so downstream code doesn't break.
  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 5000);
      const parsed = safeJSON(raw);
      if (parsed?.coverage_map) return parsed; // full object
      if (parsed?.gaps) return { gaps: parsed.gaps, coverage_map: [], coverage_summary: null }; // legacy
    }
  } catch (e) {
    console.error('OpenAI analyseGaps failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\n${userPrompt}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed?.coverage_map) return parsed;
    if (parsed?.gaps) return { gaps: parsed.gaps, coverage_map: [], coverage_summary: null };
    return { gaps: [], coverage_map: [], coverage_summary: null };
  } catch (e) {
    console.error('analyseGaps Gemini fallback failed:', e.message);
    return { gaps: [], coverage_map: [], coverage_summary: null };
  }
}

// ── WIN STRATEGY GENERATOR ────────────────────────────────────────────────────
async function generateWinStrategy(rfpData, matchedProposals, gaps, orgProfile = null) {
  const wonMatches = matchedProposals.filter(p => p.outcome === 'won').slice(0, 4);
  const topGaps = (gaps || []).filter(g => g.priority === 'high').slice(0, 5);

  const wonContext = wonMatches.map(p => {
    const meta = p.ai_metadata || {};
    return `- "${p.name}" (WON, ${p.user_rating}★): ${(meta.key_themes || []).join(', ')} | win indicators: ${(meta.win_indicators || []).slice(0, 2).join('; ')}`;
  }).join('\n') || 'No won proposals in repository for this sector';

  const defaultWinSuffix = `You are a senior bid strategist advising the team how to win THIS specific RFP.

YOUR JOB: make decisions, not observations. The output is a battle plan.

═══════════════════════════════════════════════════════════════════════════
WHAT THIS IS NOT
═══════════════════════════════════════════════════════════════════════════

  ❌ A summary of the RFP
  ❌ Motivational language ("Showcase our expertise...")
  ❌ Generic best-practice ("Demonstrate value", "Tell a story")
  ❌ Tradeoff-free advice ("Cover everything thoroughly")
  ❌ Restating what the matched proposals already do

═══════════════════════════════════════════════════════════════════════════
WHAT IT IS
═══════════════════════════════════════════════════════════════════════════

  ✅ Specific decisions about positioning, emphasis, and exclusion
  ✅ A clear winning thesis — one sentence anyone on the team can repeat
  ✅ Explicit tradeoffs: what to invest in, what to deprioritise
  ✅ Named risks with concrete mitigations
  ✅ A differentiator angle drawn from what actually won similar bids

═══════════════════════════════════════════════════════════════════════════
EXAMPLES — generic vs class-leading
═══════════════════════════════════════════════════════════════════════════

❌ GENERIC (low value):
   "winning_thesis": "Position as the trusted partner with deep expertise"
   "priorities": ["Demonstrate capability", "Show value", "Build trust"]
   "avoid": ["Generic language", "Unsubstantiated claims"]

✅ CLASS-LEADING (specific, decisive):
   "winning_thesis": "We are the only bidder who has shipped this exact
     FHIR-to-Spine integration pattern in production at scale (47 trusts,
     zero downtime over 18 months) — every section reinforces that proof."
   "priorities": [
     {
       "priority": "Open the executive summary with the 47-trust number,
         not capability statements. Make the evaluator anchor on it before
         page 2.",
       "rationale": "REQ-014 specifically asks for 'production-scale
         evidence'. The matched HMRC and Imperial proposals show this
         opening pattern wins on average 12 marks higher.",
       "evidence": "HMRC Onboarding (won, 5★) opened with the same number-
         first pattern; analysis shows it scored 87/100 on writing quality."
     }
   ]
   "avoid": [
     "Do not include the SAFe 5.0 section — this Trust uses Lean Agile
      and our SAFe story will read as misalignment",
     "Do not lead with team CVs — this Trust scores team after technical;
      put the technical depth first to anchor the score"
   ]

═══════════════════════════════════════════════════════════════════════════
OUTPUT DISCIPLINE
═══════════════════════════════════════════════════════════════════════════

  • Every priority must be a DECISION, not an observation.
  • Every risk must have a mitigation that's executable in the bid.
  • The differentiator_angle must be defensible against the question
    "what stops a competitor saying this?"
  • The opening_narrative must read like the actual first 3 sentences of
    the executive summary, not a description of what to write.`;
  const systemSuffix = getCustomPrompt('win_strategy', defaultWinSuffix);

  const schema = `{
  "winning_thesis": "ONE sentence anyone on the team can repeat — the central positioning that every section reinforces. Must be specific and defensible.",
  "priorities": [
    {
      "priority": "specific decision — what to do, structurally or rhetorically",
      "rationale": "why this matters for this specific RFP — cite a matched proposal, gap, or evaluation criterion",
      "evidence": "the matched proposal name, gap title, or REQ ID this is grounded in"
    }
  ],
  "risks": [
    {
      "risk": "specific risk to win probability",
      "mitigation": "concrete action inside the bid response — not aspirational"
    }
  ],
  "focus": ["specific things to emphasise — tied to this client, sector, and the matched won proposals"],
  "avoid": ["specific things to avoid — sections that misalign, language that lost similar bids, framing that wastes evaluator attention"],
  "opening_narrative": "the ACTUAL first 3 sentences of the executive summary — not a description of what to write. Specific to this client and RFP.",
  "differentiator_angle": "the single strongest differentiating angle, defensible against 'what stops a competitor saying this?'"
}`;

  const rfpCtx = buildRfpContextBlock(rfpData);

  const context = `RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})
Key themes: ${(rfpData.key_themes || []).join(', ')}
Evaluation logic: ${(rfpData.evaluation_logic || []).join('; ') || 'not extracted'}

${rfpCtx}

Won proposals from similar work:
${wonContext}

High-priority gaps to address:
${topGaps.map(g => `- [${g.priority.toUpperCase()}] ${g.title}: ${g.description}`).join('\n') || 'None identified'}

${buildOrgProfileBlock(orgProfile)}`;

  // ── PROPOSER PASS ──────────────────────────────────────────────────────
  // First call drafts the strategy with chain-of-thought + self-critique.
  const proposerPrompt = `${context}

══════════════════════════════════════════════════════════════════════════
STEP 1 — Think before drafting. Inside <thinking> tags, work through:
══════════════════════════════════════════════════════════════════════════
  a. What is the SINGLE most defensible differentiator we can claim,
     based on the won proposals? Name the specific evidence.
  b. What are the 3 highest-impact decisions the team needs to make
     about emphasis, sequencing, and exclusion?
  c. What sections or angles should we DEPRIORITISE or cut entirely
     because they would dilute the thesis?
  d. What are the 2–3 risks that could lose this bid even with the
     right strategy, and what mitigation belongs IN the proposal?
  e. Draft the actual first 3 sentences of the executive summary —
     not a description, the real prose.

══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft the JSON to this schema:
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning:
══════════════════════════════════════════════════════════════════════════
  □ Could a competitor's bid use your winning_thesis verbatim? If yes,
    rewrite — make it more specific to our actual evidence.
  □ Is each priority a DECISION (do/don't) or just an observation?
    Rewrite observations as decisions.
  □ Do the "avoid" items name something specific, or are they generic
    "avoid generic language"-style filler? Rewrite as named omissions.
  □ Is opening_narrative actual prose ready to paste, or a description?
    If description, rewrite as prose.
  □ Does each risk mitigation describe something actionable in the bid?

If any field fails the critique, fix it. Then return final JSON after
</thinking>. Return ONLY valid JSON.`;

  let draft = null;
  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, proposerPrompt, 4000);
      draft = safeJSON(raw);
    }
  } catch (e) {
    console.error('OpenAI generateWinStrategy proposer failed:', e.message);
  }

  if (!draft?.priorities) {
    try {
      const prompt = `${systemSuffix}\n\n${proposerPrompt}`;
      const raw = await geminiGenerate(prompt, true);
      draft = safeJSON(raw);
    } catch (e) {
      console.error('generateWinStrategy Gemini proposer fallback:', e.message);
    }
  }

  if (!draft?.priorities) return null;

  // ── CRITIC PASS ────────────────────────────────────────────────────────
  // A second call with a different system prompt reads the draft and tears
  // it apart. The critic returns a refined strategy — same schema, sharper
  // content. This catches generic survivors that slipped past self-critique.
  const criticSystem = `You are a tough, specific bid strategy reviewer.

You are reviewing a draft win strategy for an RFP. Your job is to find every place it has drifted toward generic, vague, or undecided language — and rewrite those sections to be sharper.

Be ruthless about:
  • Generic positioning that any competitor could claim
  • Priorities that are observations rather than decisions
  • "Avoid" items that don't actually name something
  • Opening narratives that describe rather than provide actual prose
  • Mitigations that are aspirational rather than executable
  • Differentiators that don't have a specific defensible proof point

If a section is already strong, KEEP IT — do not rewrite for the sake of rewriting. If a section is generic, REWRITE IT to be specific, citing the same source evidence the original draft uses.

Output the refined strategy in EXACTLY the same JSON schema as the input. Same fields, same structure. Just sharper content.`;

  const criticPrompt = `RFP CONTEXT:
${context}

═══════════════════════════════════════════════════════════════════════════
DRAFT STRATEGY TO REVIEW:
═══════════════════════════════════════════════════════════════════════════
${JSON.stringify(draft, null, 2)}

═══════════════════════════════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════════════════════════════

Inside <thinking> tags:
  1. For each field in the draft, mark it KEEP or REWRITE.
  2. For each REWRITE, write the sharper version that cites the same
     evidence but is more specific and decision-driven.
  3. Pay special attention to: winning_thesis (must be defensible),
     priorities (must be decisions), opening_narrative (must be actual
     prose), differentiator_angle (must be hard to copy).

Then return the final refined strategy JSON in the same schema:
${schema}

Return ONLY valid JSON after </thinking>.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(criticSystem, criticPrompt, 4000);
      const refined = safeJSON(raw);
      if (refined?.priorities) return refined;
    }
  } catch (e) {
    console.error('generateWinStrategy critic pass failed, returning draft:', e.message);
  }

  // If critic fails, return the draft — never return nothing when we have
  // a working draft. The critic is a quality lift, not a hard requirement.
  return draft;
}

// ── WINNING LANGUAGE EXTRACTION ────────────────────────────────────────────────
async function extractWinningLanguage(proposals) {
  // Only extract from high-rated won proposals
  const highPerformers = proposals
    .filter(p => p.outcome === 'won' && p.user_rating >= 4 && p.ai_metadata?.standout_sentences?.length > 0)
    .slice(0, 6);

  if (!highPerformers.length) return [];

  const context = highPerformers.map(p => {
    const meta = p.ai_metadata || {};
    return `Proposal: "${p.name}" (WON, ${p.user_rating}★, ${p.sector})
Standout sentences: ${(meta.standout_sentences || []).join(' | ')}
Win indicators: ${(meta.win_indicators || []).join(' | ')}
Key themes: ${(meta.key_themes || []).join(', ')}`;
  }).join('\n\n');

  const defaultLangSuffix = `You are extracting reusable high-performing language from won proposals.

YOUR GOAL: pull the small number of sentences that demonstrate a TRANSFERABLE rhetorical move — language another bid could adapt without copying. Not the most impressive sentences. Not the most quoted. The most reusable.

═══════════════════════════════════════════════════════════════════════════
ACCEPT vs REJECT — concrete tests
═══════════════════════════════════════════════════════════════════════════

ONLY extract language that meets ALL of these:
  ✓ SPECIFIC (names a real thing or uses a defined structure)
  ✓ PERSUASIVE (makes a point, doesn't just describe)
  ✓ STRUCTURALLY CLEAR (a writer can copy the shape, not the words)
  ✓ STRATEGICALLY USEFUL (would change a bid's tone or framing)
  ✓ ADAPTABLE (works in a different sector with different evidence)

REJECT immediately if any of:
  ✗ Vague or generic ("we deliver value")
  ✗ Filler ("our dedicated team")
  ✗ Self-congratulatory ("we're proud to")
  ✗ Tied to a specific fact that doesn't transfer ("our 2023 NHS contract")
  ✗ Impressive sounding but commercially empty ("transforming the future")

═══════════════════════════════════════════════════════════════════════════
EXAMPLES — not reusable vs reusable
═══════════════════════════════════════════════════════════════════════════

❌ NOT REUSABLE (impressive but unique to that bid):
   "We delivered the £47M Met Office migration with zero downtime"
   → Too tied to that specific contract. The bid team can't reuse it.

✅ REUSABLE (the rhetorical move transfers):
   "We have done this exact integration before, in production, at scale —
    not a pilot, not a POC, the full live system handling [specific load]"
   why_it_works: "Pre-empts the evaluator's 'have they actually built
    this?' question by claiming production scale upfront, then
    structurally distinguishes from POC/pilot work."
   adaptation_note: "Replace [specific load] with your own production
    metric. Move 'not a pilot, not a POC' verbatim — that phrase is the
    rhetorical move."

❌ NOT REUSABLE (generic boilerplate):
   "Our approach combines technical excellence with deep sector knowledge"

✅ REUSABLE (defines a rhetorical pattern):
   "Three things distinguish this proposal from a competent alternative,
    and we'll prove each one in the section that follows: [thing 1],
    [thing 2], [thing 3]"
   why_it_works: "Pre-commits to specific differentiators and binds the
    rest of the proposal to delivering on them. Hard to write generically
    once you've made this promise."
   adaptation_note: "Drop in the bid's actual three differentiators.
    The 'three things' framing is the move."

═══════════════════════════════════════════════════════════════════════════
DISCIPLINE
═══════════════════════════════════════════════════════════════════════════

  • Better 5 strong reusable lines than 20 mediocre ones.
  • If a line is impressive but locked to its source context, REJECT it.
  • Each "why_it_works" must explain the rhetorical mechanism, not just
    say "specific" or "persuasive".
  • Each "adaptation_note" must tell the bid writer what to keep
    verbatim and what to swap.`;
  const systemSuffix = getCustomPrompt('winning_language', defaultLangSuffix);

  const schema = `{
  "snippets": [
    {
      "text": "the exact sentence or phrase",
      "source_proposal": "proposal name it came from",
      "use_case": "executive summary|approach section|credibility|risk|value proposition|methodology",
      "why_it_works": "explain the rhetorical mechanism — what move is being made, not just that it is good",
      "adaptation_note": "tell the writer what to keep verbatim and what to swap"
    }
  ]
}`;

  // ── PROPOSER PASS ──────────────────────────────────────────────────────
  const proposerPrompt = `High-performing proposals:

${context}

══════════════════════════════════════════════════════════════════════════
STEP 1 — Inside <thinking> tags, work through:
══════════════════════════════════════════════════════════════════════════
  a. For each candidate sentence, ask: would this STILL work for a
     completely different sector if you swapped the evidence?
  b. Reject any sentence whose persuasive power is tied to a unique
     fact that another bid couldn't claim.
  c. Identify the rhetorical mechanism in each survivor — naming the
     move (pre-emption, three-part list, scale-claim, etc).
  d. Pick the 5 strongest.

══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft using this schema:
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning:
══════════════════════════════════════════════════════════════════════════
  □ For each snippet: does why_it_works name the rhetorical mechanism,
    or just say it's "specific" / "persuasive"? Rewrite if vague.
  □ For each snippet: does adaptation_note distinguish what stays
    verbatim from what gets swapped? If not, rewrite.
  □ Are any two snippets making the same rhetorical move? Keep the
    sharpest, drop the other.
  □ Did you accept anything that's locked to its source context? Drop it.

If any snippet fails, fix or remove. Then return final JSON after
</thinking>. Return ONLY valid JSON.`;

  let draft = null;
  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, proposerPrompt, 3000);
      draft = safeJSON(raw);
    }
  } catch (e) {
    console.error('OpenAI extractWinningLanguage proposer failed:', e.message);
  }

  if (!draft?.snippets) {
    try {
      const prompt = `${systemSuffix}\n\n${proposerPrompt}`;
      const raw = await geminiGenerate(prompt, true);
      draft = safeJSON(raw);
    } catch (e) {
      console.error('extractWinningLanguage Gemini proposer fallback:', e.message);
    }
  }

  if (!draft?.snippets || draft.snippets.length === 0) return [];

  // ── CRITIC PASS ────────────────────────────────────────────────────────
  // A second call reads the snippets and tightens any that drift toward
  // generic. Returns refined snippets in the same schema.
  const criticSystem = `You are a tough reviewer of "reusable winning language" extracted from proposals.

Your job is to look at each snippet and decide:
  • REJECT if it's actually locked to its source context and not reusable
  • REJECT if why_it_works is vague or just says "specific/persuasive"
  • REWRITE if the rhetorical mechanism could be named more precisely
  • KEEP if it's already strong

For each KEEP/REWRITE survivor, sharpen why_it_works to name the EXACT rhetorical move (pre-emption, three-part list, scale-claim, contrast, anchoring number, structural binding, etc) and sharpen adaptation_note to be explicit about what stays verbatim and what gets swapped.

Return the refined snippets in the same JSON schema as the input.`;

  const criticPrompt = `DRAFT SNIPPETS TO REVIEW:
${JSON.stringify(draft, null, 2)}

═══════════════════════════════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════════════════════════════

Inside <thinking> tags:
  1. For each snippet, mark it KEEP / REWRITE / REJECT.
  2. For REWRITE: name the exact rhetorical mechanism in why_it_works
     and sharpen adaptation_note.
  3. For REJECT: explain briefly (will be removed).

Then return the refined snippets in this schema:
${schema}

Return ONLY valid JSON after </thinking>.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(criticSystem, criticPrompt, 3000);
      const refined = safeJSON(raw);
      if (refined?.snippets && refined.snippets.length > 0) return refined.snippets;
    }
  } catch (e) {
    console.error('extractWinningLanguage critic pass failed, returning draft:', e.message);
  }

  return draft.snippets;
}

// ── MATCH EXPLANATION ─────────────────────────────────────────────────────────
// Why a specific past proposal is relevant to this RFP (trust layer for matches)
async function explainMatch(rfpData, proposal, orgProfile = null) {
  const meta = proposal.ai_metadata || {};
  const orgBlock = buildOrgProfileBlock(orgProfile);
  const systemSuffix = `You are explaining why a past proposal is or isn't relevant to a new RFP. Your default stance is sceptical — most past proposals are only partially relevant, and saying so clearly is more useful than padding the score.

Anti-bias directives:
- The example number in the schema is a PLACEHOLDER TYPE (integer 0–100). It is not a suggested value. Compute from the actual overlap you can see.
- Score bands:
    80–100  Near-perfect fit. Same sector + same problem + transferable approach + comparable scale. Reserved for genuine twins.
    60–79   Strong fit. Same sector OR same problem type, with transferable approach. Most "good matches" land here.
    40–59   Partial. Some transferable elements (methodology, specific deliverable, team experience) but wrong sector or wrong scale.
    20–39   Thin. A few elements translate but using this proposal as a template would mislead the new bid.
    0–19    Unrelated. Cite why and move on.
- Hard caps (apply before scoring):
    - Different client industry AND different service industry: max 40.
    - No deliverable overlap between past and new: max 50.
    - Outcome was 'lost' AND user_rating ≤ 2: max 40 regardless of thematic overlap (the past proposal failed at this type of work).
    - Past proposal has zero win_indicators or standout_sentences: max 55.
- Organisation-profile context: if the caller supplied a confirmed
  profile (see block below), INFORM the user about how this past
  proposal relates to their stated capabilities — but DO NOT penalise
  the relevance score for work outside the profile. Companies
  legitimately diversify, and a past proposal outside current stated
  offerings may still be a strong reference. Populate the
  "capability_context" field in the output accordingly (see schema).
  When no profile is supplied, set capability_context to null.
- "Relevant" does not mean "uses some of the same words". Themes that overlap but describe a different problem type (e.g. both mention "data" but one is governance, the other is visualisation) are not relevance.
- Be honest about what does NOT transfer. The user reads this to decide whether to reference the proposal — over-selling a weak match wastes their time.`;

  const schema = `{
  "relevance_score": "integer 0-100 per the bands and caps above",
  "industry_overlap": "specific sentence on industry/sector overlap — state 'same sector', 'adjacent', or 'different' and why",
  "problem_similarity": "specific sentence on whether the problems are similar — name both problem types",
  "deliverable_similarity": "specific sentence on deliverable overlap — list specific deliverables that match or state 'none'",
  "approach_transferability": "specific sentence on whether the approach would transfer",
  "strong_for": ["specific aspects of the past proposal that are directly relevant — empty array if none"],
  "not_relevant_for": ["specific aspects that do NOT transfer — be honest, do not pad"],
  "recommended_use": "how to use this proposal — what to take from it and what to ignore. If the score is below 40, say 'do not use as a template'.",
  "capability_context": {
    "status": "'within_core' | 'within_offered' | 'adjacent' | 'outside_stated' | null — null when no organisation profile is supplied. 'within_core' if this past proposal aligns with a confirmed offering marked is_core. 'within_offered' if it aligns with any confirmed offering. 'adjacent' if it's in an obvious extension of a confirmed offering. 'outside_stated' if it's outside what the org says it does.",
    "statement": "one short sentence informing the user of how this proposal sits relative to their stated capabilities. Neutral, factual tone. Examples: 'Within your core capabilities — you've confirmed this as a core offering.', 'Inside your stated offerings but not flagged as core.', 'Adjacent to your confirmed Data & AI offering — transferable methodology.', 'Outside what you've told us your company does — still useful reference if you're expanding into this space.' Set to null when no profile is supplied."
  }
}`;

  const rfpCtx = buildRfpContextBlock(rfpData);

  const context = `New RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})
RFP themes: ${(rfpData.key_themes || []).join(', ')}

${rfpCtx}

Past proposal: "${proposal.name}" (${proposal.outcome}, ${proposal.user_rating}★, ${proposal.sector})
Past themes: ${(meta.key_themes || []).join(', ')}
Past deliverables: ${(meta.deliverables || []).join(', ')}
Past win indicators: ${(meta.win_indicators || []).join('; ')}

${orgBlock}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nExplain why this past proposal is or isn't relevant.\n\nReturn ONLY valid JSON:\n${schema}`);
      return safeJSON(raw);
    }
  } catch (e) {
    console.error('OpenAI explainMatch failed:', e.message);
  }

  try {
    const prompt = `Explain why this past proposal is relevant to this RFP. Be specific and honest. Return ONLY valid JSON.\n\nSchema:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw);
  } catch (e) {
    return null;
  }
}

// ── MARKET CONTEXT (was getIndustryNews) ────────────────────────────────────
// Multi-stage pipeline:
//   STAGE 1 — extract precise searchable entities from the RFP
//   STAGE 2 — build tiered queries (programme > org > tech > sector)
//   STAGE 3 — search Brave with each tier; filter junk sources
//   STAGE 4 — structured relevance scoring with hard threshold + categorise
//
// Returns categorised market context items with why_it_matters,
// where_to_use_in_bid, tone_supported, argument_strengthened — designed
// to be a strategic input, not a decorative news feed.

// STAGE 1 — extract precise procurement entities from the RFP text
async function extractSearchableEntities(rfpData, rfpText) {
  if (!hasOpenAI() && !process.env.GEMINI_API_KEY) return null;

  // Trim text to first ~4000 chars — most RFPs put procurement vehicle,
  // programme name, and issuing org in the front matter.
  const text = (rfpText || '').slice(0, 4000);

  const prompt = `You are extracting precise procurement entities from an RFP for use in news search.

RFP context — Title: ${rfpData.title || 'Unknown'} | Client: ${rfpData.client || 'Unknown'} | Sector: ${rfpData.sector || 'Unknown'}

RFP excerpt:
${text}

Your job: extract ONLY entities that would appear verbatim in trade press, gov.uk announcements, or industry publications. NOT abstract themes — specific named things.

Return JSON with these arrays. Each item should be a SEARCHABLE STRING (will be put in quotes in a Brave search):
{
  "programmes": ["named programme/project names — e.g. 'Project NETRINO', 'MORPHEUS', 'GP IT Futures'"],
  "frameworks": ["procurement frameworks/vehicles — e.g. 'G-Cloud 14', 'RM6116', 'DPS'"],
  "issuing_bodies": ["specific orgs/agencies — e.g. 'DE&S', 'NHS Digital', 'Cabinet Office'. NOT generic like 'NHS'"],
  "regulations": ["specific standards/regulations — e.g. 'DCB0129', 'CAP 1789', 'DSPT'"],
  "technology_classes": ["specific tech/equipment classes — e.g. 'Group 3 UAS', 'FHIR R4', 'MOSA architecture'"],
  "competitors": ["named competitor companies if mentioned in RFP"]
}

Rules:
- Each entity must be 2-6 words. NOT a full sentence.
- Return [] for any category with no clear hits — DO NOT pad.
- Better 4 precise entities than 20 vague ones.
- If you cannot find anything specific, return all empty arrays.

Return ONLY valid JSON.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(
        'You are a precise procurement analyst. Extract only specific named entities, never generic descriptions.',
        prompt, 800
      );
      return safeJSON(raw);
    }
  } catch (e) { console.error('extractSearchableEntities OpenAI:', e.message); }

  try {
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw);
  } catch (e) {
    console.error('extractSearchableEntities Gemini:', e.message);
    return null;
  }
}

// Source quality filtering — denylist of low-signal domains
const NEWS_DENYLIST = [
  'reddit.com', 'pinterest.com', 'wikipedia.org', 'wikiwand.com',
  'quora.com', 'medium.com', 'linkedin.com/pulse',
  // Generic content farms
  'examiner.com', 'ezinearticles.com', 'hubpages.com',
];

function passesSourceFilter(item) {
  const url = (item.url || '').toLowerCase();
  return !NEWS_DENYLIST.some(d => url.includes(d));
}

// STAGE 2 — build tiered queries from the extracted entities
function buildTieredQueries(entities, rfpData) {
  const queries = [];

  // Tier 1: programme/framework names — highest signal
  for (const programme of (entities?.programmes || []).slice(0, 2)) {
    queries.push({ tier: 1, query: `"${programme}"`, label: 'programme' });
  }
  for (const framework of (entities?.frameworks || []).slice(0, 2)) {
    queries.push({ tier: 1, query: `"${framework}" procurement`, label: 'framework' });
  }

  // Tier 2: issuing body + tech class
  const topBody = (entities?.issuing_bodies || [])[0];
  const topTech = (entities?.technology_classes || [])[0];
  if (topBody && topTech) {
    queries.push({ tier: 2, query: `"${topBody}" "${topTech}"`, label: 'org+tech' });
  } else if (topBody) {
    queries.push({ tier: 2, query: `"${topBody}" procurement`, label: 'org' });
  }

  // Tier 3: regulation + tech class
  const topReg = (entities?.regulations || [])[0];
  if (topReg) {
    queries.push({ tier: 3, query: `"${topReg}"`, label: 'regulation' });
  }

  // Tier 4 fallback: sector + most specific technology
  if (queries.length === 0 && rfpData.sector) {
    queries.push({ tier: 4, query: `${rfpData.sector} procurement news`, label: 'sector' });
  }

  // Tier 5 last resort: client name
  if (queries.length === 0 && rfpData.client && rfpData.client !== 'Unknown') {
    queries.push({ tier: 5, query: `"${rfpData.client}"`, label: 'client' });
  }

  return queries.slice(0, 6);
}

// STAGE 3 — call Brave for each tiered query
async function searchBraveForQueries(queries) {
  const allResults = [];
  for (const q of queries) {
    try {
      const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(q.query)}&count=8&freshness=pm6`;
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const d = await resp.json();
      (d.results || []).forEach(item => {
        let source = '';
        try { source = item.meta_url?.hostname || new URL(item.url).hostname; } catch { source = item.source || ''; }
        const result = {
          title: item.title || '',
          url: item.url || '',
          source: source.replace(/^www\./, ''),
          date: item.age || item.page_age || 'Recent',
          snippet: item.description || item.extra_snippets?.[0] || '',
          raw_age: item.age || '',
          query_tier: q.tier,
          query_label: q.label,
          query_used: q.query,
        };
        if (result.title && result.url && passesSourceFilter(result)) {
          allResults.push(result);
        }
      });
    } catch (e) {
      console.error('Brave query failed:', q.query, e.message);
    }
  }
  // Dedupe by URL, keeping the highest-tier version of each
  const seen = new Map();
  allResults.forEach(r => {
    const existing = seen.get(r.url);
    if (!existing || r.query_tier < existing.query_tier) seen.set(r.url, r);
  });
  return [...seen.values()];
}

// STAGE 4 — score relevance with structured rubric, categorise, threshold
async function scoreAndCategoriseMarketContext(searchResults, entities, rfpData) {
  if (!searchResults.length) return [];

  // Compact context for the AI — pass title, source, snippet, and which
  // query tier it came from so the model knows the precision context.
  const articles = searchResults.slice(0, 16).map((r, i) =>
    `${i+1}. [tier${r.query_tier} ${r.query_label}] TITLE: ${r.title} | SOURCE: ${r.source} | DATE: ${r.date} | URL: ${r.url} | SNIPPET: ${r.snippet}`
  ).join('\n');

  const entityContext = `Programmes mentioned: ${(entities?.programmes || []).join(', ') || 'none'}
Frameworks: ${(entities?.frameworks || []).join(', ') || 'none'}
Issuing bodies: ${(entities?.issuing_bodies || []).join(', ') || 'none'}
Regulations: ${(entities?.regulations || []).join(', ') || 'none'}
Technologies: ${(entities?.technology_classes || []).join(', ') || 'none'}
Competitors: ${(entities?.competitors || []).join(', ') || 'none'}`;

  const systemSuffix = `You are a bid intelligence analyst scoring news articles for relevance to a specific RFP.

RUTHLESS QUALITY BAR: an article is RELEVANT only if it would change what the bid team writes, references, or worries about.

═══════════════════════════════════════════════════════════════════════════
SCORING RUBRIC (out of 100)
═══════════════════════════════════════════════════════════════════════════
  +25  Mentions a named programme, framework, or contract vehicle from the RFP
  +20  Mentions the specific issuing body or buying organisation
  +20  Mentions the specific technology class or equipment from the RFP
  +15  Mentions a specific regulation or standard from the RFP
  +10  Mentions a known competitor in this space
  +10  Published in trade press or gov source for this sector
  -30  Obviously off-topic (different country, consumer, hobbyist, unrelated)
  -20  Generic industry-wide story with no specific tie to this bid

HARD THRESHOLD: any article scoring below 50 must be REJECTED. Return fewer
results, never pad.

═══════════════════════════════════════════════════════════════════════════
CATEGORIES
═══════════════════════════════════════════════════════════════════════════
For each surviving article, assign ONE category:
  - "programme"   = news about the named programme/framework/contract
  - "buyer"       = news about the issuing body (leadership, budget, restructure)
  - "tech_reg"    = new standards, regulations, capability announcements
  - "competitive" = competitor wins, M&A, market shifts in the supplier base

═══════════════════════════════════════════════════════════════════════════
WHAT TO RETURN PER ARTICLE
═══════════════════════════════════════════════════════════════════════════
For each survivor:
  - relevance_score (50-100, calibrated to the rubric above)
  - category (one of the four above)
  - why_it_matters: one sentence on how this affects the bid strategy
  - where_to_use_in_bid: which section of the bid this should inform
  - tone_supported: what tone/argument this enables (e.g. "credibility", "urgency", "differentiation")

NEVER invent titles or URLs. Copy them character-for-character from the input.`;

  const prompt = `${systemSuffix}

═══════════════════════════════════════════════════════════════════════════
RFP CONTEXT
═══════════════════════════════════════════════════════════════════════════
Title: ${rfpData.title || 'Unknown'}
Client: ${rfpData.client || 'Unknown'}
Sector: ${rfpData.sector || 'Unknown'}
Themes: ${(rfpData.key_themes || []).join(', ') || 'none'}

Extracted entities to look for:
${entityContext}

═══════════════════════════════════════════════════════════════════════════
ARTICLES TO SCORE (${searchResults.length})
═══════════════════════════════════════════════════════════════════════════
${articles}

═══════════════════════════════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════════════════════════════
Inside <thinking> tags, score each article using the rubric. List the
score breakdown for each.

Then return JSON with the survivors only (score >= 50). Better 0 articles
than 6 irrelevant ones.

{
  "items": [
    {
      "title": "EXACT title from input — character for character",
      "url": "EXACT url from input",
      "source": "source domain",
      "date": "date as given",
      "snippet": "1-2 sentence summary",
      "relevance_score": 75,
      "category": "programme | buyer | tech_reg | competitive",
      "why_it_matters": "one specific sentence",
      "where_to_use_in_bid": "executive summary | technical approach | risk section | credibility | commercial",
      "tone_supported": "credibility | urgency | differentiation | reassurance | challenger"
    }
  ]
}

Return ONLY valid JSON after </thinking>.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, prompt, 3000);
      const parsed = safeJSON(raw);
      if (parsed?.items) {
        // Validate URLs exist in input to prevent hallucination
        const validUrls = new Set(searchResults.map(r => r.url));
        return parsed.items
          .filter(it => it.url && validUrls.has(it.url))
          .filter(it => (it.relevance_score || 0) >= 50);
      }
    }
  } catch (e) { console.error('scoreAndCategorise OpenAI:', e.message); }

  try {
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed?.items) {
      const validUrls = new Set(searchResults.map(r => r.url));
      return parsed.items
        .filter(it => it.url && validUrls.has(it.url))
        .filter(it => (it.relevance_score || 0) >= 50);
    }
  } catch (e) { console.error('scoreAndCategorise Gemini:', e.message); }

  return [];
}

// Main entry — replaces the old getIndustryNews. Called from rfp-pipeline.
// Signature changed to take rfpData + rfpText instead of (sector, themes, client).
async function getIndustryNews(rfpData, rfpText) {
  if (!process.env.BRAVE_SEARCH_KEY) {
    console.log('BRAVE_SEARCH_KEY not set — market context tab will be empty');
    return [];
  }

  // STAGE 1 — extract precise entities from the RFP
  let entities = null;
  try {
    entities = await extractSearchableEntities(rfpData, rfpText);
  } catch (e) { console.error('extractSearchableEntities failed:', e.message); }

  // If extraction returned nothing useful, fall back to legacy behaviour
  // (sector + themes free-text query) so we still surface SOMETHING.
  let queries;
  if (entities && (
    (entities.programmes || []).length ||
    (entities.frameworks || []).length ||
    (entities.issuing_bodies || []).length ||
    (entities.regulations || []).length ||
    (entities.technology_classes || []).length
  )) {
    queries = buildTieredQueries(entities, rfpData);
  } else {
    // Legacy fallback — build simple queries from sector + top theme + client
    const sector = rfpData?.sector || '';
    const theme = (rfpData?.key_themes || [])[0] || '';
    const client = rfpData?.client && rfpData.client !== 'Unknown' ? rfpData.client : '';
    queries = [
      client ? { tier: 4, query: `"${client}" procurement`, label: 'client' } : null,
      sector ? { tier: 4, query: `${sector} ${theme}`.trim(), label: 'sector' } : null,
    ].filter(Boolean);
  }

  if (queries.length === 0) return [];

  // STAGE 3 — search
  const searchResults = await searchBraveForQueries(queries);
  if (searchResults.length === 0) return [];

  // STAGE 4 — score, threshold, categorise
  const items = await scoreAndCategoriseMarketContext(searchResults, entities, rfpData);

  // Sort by category-then-score so the UI can group sensibly
  const categoryOrder = { programme: 1, buyer: 2, tech_reg: 3, competitive: 4 };
  return items.sort((a, b) => {
    const ca = categoryOrder[a.category] || 5;
    const cb = categoryOrder[b.category] || 5;
    if (ca !== cb) return ca - cb;
    return (b.relevance_score || 0) - (a.relevance_score || 0);
  });
}

// ── NARRATIVE ADVICE (Gemini with comparative context) ────────────────────────
async function getNarrativeAdvice(rfpData, topMatch) {
  const matchContext = topMatch ? `Best matched past proposal: "${topMatch.name}" (${topMatch.outcome}, ${topMatch.user_rating}★)
${topMatch.ai_metadata?.writing_quality ? `Writing quality: ${topMatch.ai_metadata.writing_quality.overall_score}/100 — ${topMatch.ai_metadata.writing_quality.tone_notes || ''}` : ''}
${topMatch.ai_metadata?.win_indicators?.length ? `What won it: ${topMatch.ai_metadata.win_indicators.slice(0,2).join('; ')}` : ''}` : 'No high-performing past match found in repository.';

  const prompt = `You are a senior bid strategist giving specific narrative structure advice for a proposal.

RFP: ${rfpData.title} for ${rfpData.client} in ${rfpData.sector}
Key themes: ${(rfpData.key_themes || []).join(', ')}
Evaluation logic: ${(rfpData.evaluation_logic || []).join('; ') || 'not extracted'}

${matchContext}

Give 3 to 5 propositions only. Each must be specific, actionable, and include why it matters.
Do not give generic writing advice. Do not say "show understanding", "demonstrate expertise", or similar filler.
Each point must tell the writer exactly what to do structurally, strategically, or rhetorically.
Where useful, distinguish between executive narrative and delivery narrative.
Start with "For this bid:" and be direct.`;

  try { return await geminiGenerate(prompt, false); }
  catch (e) { console.error('getNarrativeAdvice:', e.message); return ''; }
}

// ── PRESCAN (Gemini — fast metadata extraction) ───────────────────────────────

// ── VISION PRICING EXTRACTOR ──────────────────────────────────────────────────
// Used when text extraction misses contract value due to non-standard fonts,
// coloured cells, complex tables, or image-based PDFs.
// Converts PDF pages to images and sends to gpt-4o-mini vision.
async function extractPricingFromImages(filePath) {
  if (!hasOpenAI()) return null;
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');
  const os = require('os');

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf') return null; // Only needed for PDFs

  const tmpDir = path.join(os.tmpdir(), `piq_vision_${Date.now()}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Convert first 3 pages to JPEG images via pdftoppm
    execSync(
      `pdftoppm -jpeg -r 120 -f 1 -l 3 "${filePath}" "${path.join(tmpDir, 'page')}"`,
      { timeout: 20000, stdio: 'pipe' }
    );

    const imageFiles = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .sort()
      .slice(0, 3);

    if (!imageFiles.length) return null;

    // Build vision message with all page images
    const imageContent = imageFiles.map(imgFile => {
      const imgData = fs.readFileSync(path.join(tmpDir, imgFile));
      return {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imgData.toString('base64')}`,
          detail: 'low', // 'low' = faster + cheaper, still good for tables
        },
      };
    });

    const visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
    const resp = await openaiEnqueue(() => _openaiCallWithRetry({
      model: visionModel,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Look at these proposal/tender document pages and extract pricing information.

Find: total contract value, total fee, total budget, project cost, or any clear monetary total.
Ignore: individual day rates, unit prices, or line items unless they are the only values shown.
Currency: identify GBP (£), USD ($), EUR (€), AED, AUD, or other.

Return ONLY valid JSON:
{
  "contract_value": 250000,
  "currency": "GBP",
  "confidence": "high|medium|low",
  "found_in": "brief description of where you found it e.g. fee summary table page 2"
}

If no clear total value found, return: {"contract_value": null, "currency": null, "confidence": "low", "found_in": "not found"}`,
          },
        ],
      }],
    }, 'extractPricingFromImages'));

    const raw = resp.choices[0]?.message?.content || '';
    const parsed = safeJSON(raw);
    return parsed?.contract_value ? parsed : null;

  } catch (e) {
    console.error('extractPricingFromImages:', e.message);
    return null;
  } finally {
    // Clean up temp files
    try {
      const fs2 = require('fs');
      const files = fs2.readdirSync(tmpDir);
      files.forEach(f => fs2.unlinkSync(path.join(tmpDir, f)));
      fs2.rmdirSync(tmpDir);
    } catch {}
  }
}

async function prescanDocument(text, filenameHint = '', filePath = null) {
  const docText = text; // Read full document
  const prompt = `Extract structured metadata from this proposal or tender document.

Filename hint: "${filenameHint}"

EXTRACTION RULES:
- Client: Look for "prepared for", "submitted to", "client:", addressee, or infer from filename. Company names before "proposal/bid/tender" in filename = likely client.
- Contract value: Search entire document. Look for: total contract value, budget, pricing schedule, fee proposal, contract sum. Convert £250K → 250000, $1.2M → 1200000. Use the largest total, not day rates.
- Be specific — extract what is actually in the document, not what you would expect.

Document:
${docText}

Return ONLY valid JSON:
{
  "project_name": "full project name or null",
  "client": "client organisation or null — look hard, use filename hint",
  "sector": "one of: Government & Public Sector|Healthcare & NHS|Financial Services|Aerospace & Defence|Technology|Retail & Consumer|Energy & Utilities|Transport|Education|Film & Media|Creative & Production|Other",
  "contract_value": "numeric only e.g. 250000, or null",
  "currency": "GBP|USD|EUR|AUD|CAD|AED or null",
  "project_type": "one of: Digital Transformation|Data & Analytics|Cloud Migration|Infrastructure|Software Development|Consultancy|Managed Services|Change Management|ERP Integration|Cybersecurity|Film & Media Production|Creative Production|Other",
  "date_hint": "YYYY-MM-DD or null",
  "outcome_hint": "won|lost|pending or null",
  "description": "2-3 sentence summary of what this proposal actually proposes — specific, not generic",
  "confidence": "high|medium|low",
  "suggested_rating": 4,
  "rating_rationale": "brief reason for suggested rating — e.g. Well-structured with named case studies and quantified outcomes",
  "strengths": ["2-3 specific strengths observed in this proposal"],
  "weaknesses": ["2-3 specific weaknesses or areas for improvement"],
  "service_offerings": ["up to 3 service offering tags that best describe this proposal"]
}`;

  try {
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (!parsed) return { extracted: {}, confidence: 'low' };
    const extracted = {};
    if (parsed.project_name) extracted.name = parsed.project_name;
    if (parsed.client) extracted.client = parsed.client;
    if (parsed.sector) extracted.sector = parsed.sector;
    if (parsed.contract_value) extracted.contract_value = String(parsed.contract_value).replace(/[^0-9.]/g, '');
    if (parsed.currency) extracted.currency = parsed.currency;
    if (parsed.project_type) extracted.project_type = parsed.project_type;
    if (parsed.date_hint) extracted.date_submitted = parsed.date_hint;
    if (parsed.outcome_hint) extracted.outcome = parsed.outcome_hint;
    if (parsed.description) extracted.description = parsed.description;
    // Vision fallback: if contract value is missing or confidence is low, try image extraction
    const needsVisionFallback = !extracted.contract_value && filePath && parsed.confidence !== 'high';
    if (needsVisionFallback) {
      try {
        const visionResult = await extractPricingFromImages(filePath);
        if (visionResult?.contract_value) {
          extracted.contract_value = String(visionResult.contract_value).replace(/[^0-9.]/g, '');
          if (visionResult.currency) extracted.currency = visionResult.currency;
          console.log(`Vision pricing extraction: ${extracted.contract_value} ${extracted.currency} (${visionResult.found_in})`);
        }
      } catch (e) {
        console.error('Vision pricing fallback failed:', e.message);
      }
    }

    return {
      extracted,
      confidence: parsed.confidence || 'medium',
      suggested_rating: parsed.suggested_rating || null,
      rating_rationale: parsed.rating_rationale || '',
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      service_offerings: parsed.service_offerings || [],
    };
  } catch (e) {
    console.error('prescanDocument:', e.message);
    return { extracted: {}, confidence: 'low', note: e.message };
  }
}

// ── CV ANALYSIS ───────────────────────────────────────────────────────────────
async function analyseCv(text) {
  const systemSuffix = 'You are extracting structured professional data from a CV or biography. Be specific — extract what is actually stated, not what you would assume. Return ONLY valid JSON.';
  const schema = `{
  "career_summary": "2-3 sentence professional summary — specific, not generic",
  "sectors": ["specific sectors worked in"],
  "technologies": ["specific technologies, platforms, tools — named explicitly"],
  "methodologies": ["named methodologies — PRINCE2, SAFe, etc"],
  "certifications": ["professional certifications with full names"],
  "notable_clients": ["named clients or employers"],
  "years_experience_hint": 12,
  "seniority_level": "junior|mid|senior|director|partner",
  "key_strengths": ["top 3-4 specific professional strengths — not generic"]
}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `Document:\n${text.slice(0, 6000)}\n\nReturn ONLY valid JSON:\n${schema}`);
      const parsed = safeJSON(raw);
      if (parsed?.career_summary) return parsed;
    }
  } catch (e) {
    console.error('OpenAI analyseCv failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `Extract structured professional data from this CV. Return ONLY valid JSON:\n${schema}\n\nDocument:\n${text.slice(0, 6000)}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw) || {};
  } catch (e) {
    return {};
  }
}

// ── WIN PATTERN ANALYSIS ──────────────────────────────────────────────────────
// Org-level analysis across the caller's proposal portfolio. Takes won + lost
// sets and optional context (org profile, pre-aggregated sector/client stats,
// scope label) and returns a structured view of strengths, weaknesses,
// concentration risks, language/positioning observations, and concrete plays.
//
// Sampling: up to 12 won + 12 lost proposals (prioritising highest-rated
// so the signal isn't diluted by throwaway bids). AI-derived metadata is
// still the primary input, but client/sector context now flows through too.
async function analyseWinPatterns(wonProjects, lostProjects, opts = {}) {
  if (!wonProjects.length) return null;
  const { orgProfile = null, sectorStats = [], clientStats = [], scope = 'repository', confidenceLevel = 'medium' } = opts;

  const { computeSystemRating } = require('./rating');
  const pickSample = (projects, limit = 12) =>
    [...projects]
      // Sort by system rating (user + AI blend) so the AI sees the
      // most-trusted proposals first, not the highest-star-count.
      .map(p => ({ p, sr: computeSystemRating(p) }))
      .sort((a, b) => (b.sr.system_pct ?? -1) - (a.sr.system_pct ?? -1))
      .slice(0, limit)
      .map(x => ({ ...x.p, _sys: x.sr }));

  const summarise = (projects) => pickSample(projects).map(p => {
    const meta = p.ai_metadata || {};
    const wq = meta.writing_quality || {};
    const aq = meta.approach_quality || {};
    const cq = meta.credibility_signals || {};
    const year = p.date_submitted?.slice(0, 4) || '?';
    const value = p.contract_value ? `£${(p.contract_value / 1000).toFixed(0)}K` : 'value n/a';
    const taxonomy = [p.service_industry, p.client_industry].filter(Boolean).join(' / ') || p.sector || 'unspecified';
    const sr = p._sys || {};
    const ratingStr = `user=${p.user_rating || 0}/5, ai=${sr.ai_pct ?? '?'}/100, system=${sr.system_pct ?? '?'}/100`;
    return `- "${p.name}" — ${p.client || 'unknown client'} (${taxonomy}, ${value}, ${year}, ${ratingStr}): writing=${wq.overall_score || '?'}/100, approach=${aq.overall_score || '?'}/100, credibility=${cq.overall_score || '?'}/100 | themes: ${(meta.key_themes || []).slice(0, 4).join(', ') || 'none'} | methodologies: ${(meta.methodologies || []).slice(0, 3).join(', ') || 'none'} | win/loss indicators: ${(meta.win_indicators || meta.loss_indicators || []).slice(0, 2).join('; ') || 'none'}`;
  }).join('\n');

  const topSectors = sectorStats.slice(0, 8).map(s => `${s.sector}: ${s.won}W/${s.lost}L (${s.win_rate}%)`).join('; ') || 'none provided';
  const topClients = clientStats.slice(0, 10).map(c => `${c.client}: ${c.won}W/${c.lost}L (${c.total} bids)`).join('; ') || 'none provided';

  const orgBlock = (() => {
    const cp = orgProfile?.confirmed_profile;
    if (!cp) return 'No confirmed organisation profile on record.';
    const offerings = (cp.offerings || []).slice(0, 12).map(o => o?.name || o).filter(Boolean).join(', ');
    const clients = (cp.client_types || []).slice(0, 8).map(c => c?.name || c).filter(Boolean).join(', ');
    const diffs = (cp.differentiators || []).slice(0, 6).map(d => d?.text || d).filter(Boolean).join('; ');
    return [
      orgProfile.org_name ? `Org: ${orgProfile.org_name}` : null,
      offerings ? `Offerings: ${offerings}` : null,
      clients ? `Typical client types: ${clients}` : null,
      diffs ? `Stated differentiators: ${diffs}` : null,
    ].filter(Boolean).join('\n') || 'Profile present but empty.';
  })();

  const systemSuffix = `You are a bid analytics analyst producing a BALANCED, EVIDENCE-BASED organisation-level portfolio analysis across a set of won and lost proposals.

Your job is not to flatter. If the portfolio is thin or the patterns are weak, say so in plain language. Partial data should produce partial conclusions. An organisation with a handful of wins against no losses, or a structurally narrow sample, cannot support confident recommendations — and you must surface that.

Anti-bias directives:
- Role framing ("analytics consultant") does not mean writing positively. You are a diligent, sceptical reviewer producing a candid internal memo.
- The example scores and percentages in the schema are PLACEHOLDER TYPES (integer 0–100 or 0–100%). They are NOT suggested outputs. Compute from the data provided.
- Caller-supplied confidence level: ${confidenceLevel}. If "low", prefix the headline with "LOW CONFIDENCE — " and limit strengths/weaknesses to entries backed by at least 3 projects. If "medium", explicitly caveat any pattern drawn from fewer than 3 projects.
- Do not fabricate sector names, client names, or metrics that weren't in the input. If the input has none, return empty arrays rather than inventing content to fill the schema.
- "Strengths" with no specific evidence are not strengths. Prefer an empty array to generic claims.
- Call out concentration risk when the numbers show it, not by default. 60% of wins from one client IS risk; four wins across four different clients is not.
- Flag when bids are drifting outside the stated organisation profile — this is a real finding, not decoration.`;

  const schema = `{
  "headline": "one-sentence org-level verdict that captures the most important pattern. Prefix 'LOW CONFIDENCE — ' if applicable.",
  "strengths": [
    { "title": "short label", "evidence": "specific cited evidence from the sample — quote the number or named project(s)", "leverage": "how to lean into this in future bids" }
  ],
  "weaknesses": [
    { "title": "short label", "evidence": "specific cited evidence", "remedy": "concrete change to address it" }
  ],
  "concentration_risks": [
    { "risk": "state the actual concentration observed, e.g. 60% of wins come from one client", "severity": "low|medium|high", "action": "what to do about it" }
  ],
  "sector_strengths": [{ "sector": "name from the data", "win_rate": "integer 0-100, the actual rate observed", "observation": "why this sector works — cite the evidence" }],
  "sector_weaknesses": [{ "sector": "name from the data", "win_rate": "integer 0-100", "observation": "why bids fail here — cite the evidence" }],
  "recurring_losing_patterns": [
    { "pattern": "short label", "evidence": "specific cited evidence from the sample", "fix": "concrete change" }
  ],
  "language_observations": [
    { "observation": "specific pattern in tone/positioning/phrasing that tracks with outcomes", "example": "short quote or phrase if available" }
  ],
  "profile_alignment": "one sentence on how aligned the portfolio is with the stated organisation profile, or 'no profile on record'",
  "writing_insight": "one specific, actionable insight about writing quality differences between won and lost — cite the score delta",
  "approach_insight": "one specific, actionable insight about approach differences",
  "credibility_insight": "one specific, actionable insight about credibility signal differences",
  "avg_won_writing_score": "integer 0-100, computed from the sample",
  "avg_lost_writing_score": "integer 0-100, computed from the sample",
  "avg_won_approach_score": "integer 0-100",
  "avg_lost_approach_score": "integer 0-100",
  "concrete_plays": [
    { "play": "specific action the bid team should take in the next 30 days", "expected_impact": "what this moves", "based_on": "which pattern this comes from" }
  ],
  "top_recommendation": "the single highest-impact action to improve win rate — specific, not generic. If confidence is low, frame as 'gather more data before acting on X'."
}`;

  const context = `SCOPE: ${scope === 'workspace' ? 'User workspace (curated subset)' : 'Full repository'}

ORGANISATION PROFILE:
${orgBlock}

PORTFOLIO AGGREGATES:
- Sector outcomes (top 8): ${topSectors}
- Client outcomes (top 10 by volume): ${topClients}

WON PROPOSALS (${wonProjects.length} total, showing up to 12 ranked by user_rating):
${summarise(wonProjects)}

LOST PROPOSALS (${lostProjects.length} total, showing up to 12 ranked by user_rating):
${summarise(lostProjects)}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nProduce the org-level analysis. Be specific and evidence-backed.\n\nReturn ONLY valid JSON:\n${schema}`, 6000, 'analyseWinPatterns');
      const parsed = safeJSON(raw);
      if (parsed?.top_recommendation) return parsed;
    }
  } catch (e) {
    console.error('OpenAI analyseWinPatterns failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\nAnalyse this portfolio for specific, actionable organisation-level patterns. Return ONLY valid JSON:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw);
  } catch (e) {
    return null;
  }
}

// ── INSIGHT PLAYBOOK ──────────────────────────────────────────────────────────
// For a single weakness/pattern the portfolio analysis surfaced, produce a
// one-page playbook anchored to specific won proposals and winning language
// the user already owns. The goal is actionable, referenced advice — not a
// generic "you should do X" output.
//
// Inputs:
//   weakness      — { title, evidence, remedy } from analyseWinPatterns output
//   wonReferences — sampled won proposals (up to 6) most relevant to the
//                   weakness; caller decides relevance (sector match etc.)
//   winningLanguage — array of winning phrases/snippets with source project ids
//   orgProfile    — organisation profile singleton
async function generateInsightPlaybook(weakness, wonReferences = [], winningLanguage = [], orgProfile = null) {
  if (!weakness?.title && !weakness?.pattern) return null;

  const refBlock = wonReferences.slice(0, 6).map(p => {
    const meta = p.ai_metadata || {};
    const themes = (meta.key_themes || []).slice(0, 4).join(', ');
    const methods = (meta.methodologies || []).slice(0, 3).join(', ');
    return `- id="${p.id}" "${p.name}" (${p.client || '?'}, ${p.sector || '?'}, ${p.service_industry || '?'} / ${p.client_industry || '?'}, rating=${p.user_rating || 0}/5, £${((p.contract_value || 0) / 1000).toFixed(0)}K) | themes: ${themes || 'none'} | methodologies: ${methods || 'none'} | win indicators: ${(meta.win_indicators || []).slice(0, 3).join('; ') || 'none'}`;
  }).join('\n') || 'No matching won proposals supplied.';

  const langBlock = winningLanguage.slice(0, 12).map(l =>
    `- "${(l?.phrase || l?.snippet || l || '').toString().slice(0, 220)}" (from project id="${l?.source_project_id || l?.project_id || '?'}")`
  ).join('\n') || 'No winning language snippets supplied.';

  const orgBlock = (() => {
    const cp = orgProfile?.confirmed_profile;
    if (!cp) return 'No confirmed organisation profile on record.';
    const offerings = (cp.offerings || []).slice(0, 8).map(o => o?.name || o).filter(Boolean).join(', ');
    const diffs = (cp.differentiators || []).slice(0, 4).map(d => d?.text || d).filter(Boolean).join('; ');
    return [offerings ? `Offerings: ${offerings}` : null, diffs ? `Differentiators: ${diffs}` : null].filter(Boolean).join('\n') || 'Profile present but empty.';
  })();

  const thinInputs = wonReferences.length < 3 || winningLanguage.length < 3;
  const systemSuffix = `You are a senior bid strategist writing a one-page playbook that the bid team will actually use in the next 30 days.

Rules:
- Every action must be specific and anchored. Reference project ids from the supplied won proposals (e.g. "borrow the methodology structure from id=abc123"). Reference winning language from the supplied snippets verbatim where appropriate.
- Do NOT invent project names, numbers, or snippets that were not in the input.
- Do NOT produce generic advice. "Improve writing quality" is a failure; "Adopt the three-phase discovery structure from id=abc123 and mirror the evidence density of id=def456 (two named clients per section)" is a success.
- If the inputs are too thin to produce real advice, say so in the summary field rather than faking confidence.

Input-quality guardrails (apply before drafting):
- Won proposals supplied: ${wonReferences.length}. Winning language snippets supplied: ${winningLanguage.length}.
${thinInputs ? `- INPUTS ARE THIN. confidence MUST be "low". Your summary MUST open with a sentence acknowledging that the playbook is directional because the reference pool is limited, and action_steps MUST prioritise "gather more reference material" style moves over assertive tactical changes.` : `- Inputs are sufficient for a concrete playbook. Confidence may be "high" only if at least 4 referenced won proposals share the weakness's sector/context.`}
- If you cannot cite at least two specific references across reference_proposals and borrow_from_language combined, downgrade confidence to "low" and set caveats accordingly.`;

  const schema = `{
  "title": "short, specific playbook name",
  "summary": "2-3 sentence plain-English explanation of what's going wrong and the single biggest lever",
  "reference_proposals": [
    { "id": "project id from inputs", "name": "project name from inputs", "why_relevant": "one sentence explaining what to borrow" }
  ],
  "borrow_from_language": [
    { "phrase": "short snippet from supplied winning language", "source_project_id": "id from inputs", "how_to_use": "where/how to deploy it" }
  ],
  "action_steps": [
    { "step": "the concrete action, short imperative", "rationale": "one sentence citing the pattern this addresses", "owner_hint": "who on a typical bid team would do this" }
  ],
  "stop_doing": [
    { "behaviour": "specific thing to drop", "evidence": "why the data says to stop" }
  ],
  "success_signal": "one measurable signal that tells you within the next 2-3 bids whether this is working",
  "risks": [
    { "risk": "how this could backfire", "mitigation": "quick check to avoid it" }
  ],
  "confidence": "high|medium|low",
  "caveats": "one sentence if the input data was thin; otherwise omit or leave empty"
}`;

  const context = `WEAKNESS / PATTERN TO ADDRESS:
title: ${weakness.title || weakness.pattern || ''}
evidence: ${weakness.evidence || ''}
${weakness.remedy ? `user-suggested remedy: ${weakness.remedy}` : ''}

ORGANISATION PROFILE:
${orgBlock}

RELEVANT WON PROPOSALS (cite by id):
${refBlock}

WINNING LANGUAGE SNIPPETS AVAILABLE:
${langBlock}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nProduce the playbook. Anchor every recommendation to the supplied inputs.\n\nReturn ONLY valid JSON:\n${schema}`, 4000, 'generateInsightPlaybook');
      const parsed = safeJSON(raw);
      if (parsed?.title) return parsed;
    }
  } catch (e) {
    console.error('OpenAI generateInsightPlaybook failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\nProduce the playbook. Anchor every recommendation to the supplied inputs. Return ONLY valid JSON:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw);
  } catch (e) {
    return null;
  }
}

// ── SUGGESTED APPROACH & BUDGET ───────────────────────────────────────────────
async function generateApproachAndBudget(rfpData, matchedProposals, teamSuggestions, rateCardRoles = []) {
  const wonMatches = matchedProposals.filter(p => p.outcome === 'won').slice(0, 4);
  const allMatches = matchedProposals.slice(0, 5);

  const matchContext = allMatches.map(p => {
    const meta = p.ai_metadata || {};
    return `- "${p.name}" (${p.outcome}, £${((p.contract_value || 0) / 1000).toFixed(0)}K, ${p.date_submitted?.slice(0, 4) || '?'}): methodology: ${(meta.methodologies || []).join(', ') || 'not specified'} | deliverables: ${(meta.deliverables || []).slice(0, 3).join(', ') || 'not specified'} | approach score: ${meta.approach_quality?.overall_score || '?'}/100`;
  }).join('\n') || 'No matched proposals';

  const teamContext = teamSuggestions.slice(0, 5).map(m =>
    `${m.name} (${m.title}): £${m.day_rate_client || 0}/day client, £${m.day_rate_cost || 0}/day cost`
  ).join('\n') || 'No named team members';

  // Rate card gives role-based costing even without named people
  const rateCardContext = rateCardRoles.length > 0
    ? rateCardRoles.slice(0, 20).map(r =>
        `${r.role_name}${r.grade ? ` (${r.grade})` : ''}${r.category ? ` [${r.category}]` : ''}: £${r.day_rate_client || 0}/day client, £${r.day_rate_cost || 0}/day cost`
      ).join('\n')
    : null;

  const systemSuffix = `You are a senior bid consultant with expertise in delivery planning and pricing.

Base your approach on what has actually worked in similar won proposals.
Be specific — reference the methodology and structure from matched won proposals.
Budgets must be grounded in the actual day rates of the available team.
Do not generate generic phases — every phase must have a clear rationale from the matched work.`;

  const schema = `{
  "suggested_phases": [
    {
      "phase": "Phase 1",
      "name": "specific phase name",
      "duration": "4 weeks",
      "key_activities": ["specific activities — not generic"],
      "team_roles": ["specific roles from team"],
      "rationale": "why this phase based on matched won proposals — cite specific examples"
    }
  ],
  "indicative_budget": {
    "low": 250000,
    "mid": 320000,
    "high": 420000,
    "currency": "GBP",
    "basis": "Grounded in team day rates and matched project scope. Main cost drivers: [specific].",
    "confidence": "high|medium|low"
  },
  "recommended_approach": "2-3 sentences on the methodology — specific to this sector and client, based on what won similar bids",
  "key_risks": ["specific risks relevant to this RFP and sector"],
  "differentiators_to_emphasise": ["specific differentiators based on what won similar bids — not generic"]
}`;

  const rfpCtx = buildRfpContextBlock(rfpData);

  const context = `RFP: ${rfpData.title || 'Untitled'} for ${rfpData.client || 'Unknown'} (${rfpData.sector || 'Unknown sector'})
Key themes: ${(rfpData.key_themes || []).join(', ') || 'not extracted'}
Evaluation logic: ${(rfpData.evaluation_logic || []).join('; ') || 'not extracted'}

${rfpCtx}

Matched proposals (${wonMatches.length} won):
${matchContext}

${rateCardContext ? `Rate card (standard role day rates for budget modelling):
${rateCardContext}

` : ''}Named team members available:
${teamContext}

Budget guidance: Use rate card role costs for budget ranges. Named team members override rate card costs where available.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nGenerate a specific approach and budget grounded in the matched won proposals.\n\nReturn ONLY valid JSON:\n${schema}`);
      const parsed = safeJSON(raw);
      if (parsed?.suggested_phases) return parsed;
    }
  } catch (e) {
    console.error('OpenAI generateApproachAndBudget failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `Generate a specific delivery approach and budget based on matched won proposals. Return ONLY valid JSON:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw);
  } catch (e) {
    return null;
  }
}

// ── LLM RE-RANKING ───────────────────────────────────────────────────────────
// Takes the top N embedding-ranked proposals and re-ranks them by practical relevance
// using a lightweight LLM pass. Returns re-ranked list with reasoning per proposal.
async function reRankProposals(rfpData, candidates) {
  if (!candidates?.length) return candidates;
  // Only re-rank the top 10 — fast, targeted
  const top = candidates.slice(0, 10);

  const candidateContext = top.map((p, i) => {
    const meta = p.ai_metadata || {};
    const themes = (meta.key_themes || []).slice(0, 4).join(', ');
    const deliverables = (meta.deliverables || []).slice(0, 3).join(', ');
    const methods = (meta.methodologies || []).slice(0, 3).join(', ');
    const sector = p.sector || '?';
    const outcome = p.outcome || '?';
    const year = p.date_submitted?.slice(0, 4) || 'unknown';
    return `${i+1}. [ID:${p.id}] "${p.name}" — ${sector}, ${outcome}, ${year}
   Themes: ${themes || 'not extracted'}
   Deliverables: ${deliverables || 'not extracted'}
   Methods: ${methods || 'not extracted'}`;
  }).join('\n');

  const systemPrompt = `You are re-ranking proposal matches for practical relevance to an RFP.
Semantic similarity scores exist but may miss practical fit. Your job is to apply judgement.
Prioritise proposals that: share the same sector or client type, have similar scope and deliverables, used comparable methodology, and have won. Deprioritise proposals that: are from very different sectors, have unrelated deliverables, or are only thematically similar at a surface level.`;

  const userPrompt = `RFP: ${rfpData.title || 'Untitled'} for ${rfpData.client || 'Unknown'} (${rfpData.sector || 'Unknown sector'})
Key themes: ${(rfpData.key_themes || []).join(', ')}
Key requirements: ${(rfpData.requirements || []).slice(0, 5).map(r => r.text || r).join('; ')}

Candidates to re-rank (by embedding score):
${candidateContext}

Return ONLY valid JSON — an array in your preferred order:
[{"id":"proposal_id","rank":1,"relevance":"high|medium|low","reason":"one specific sentence why this is or isn't a strong practical match"}]`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemPrompt, userPrompt, 800);
      const parsed = safeJSON(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Build lookup of re-rank data
        const rankMap = {};
        parsed.forEach(r => { rankMap[r.id] = r; });

        // Re-order top proposals according to LLM ranking
        const reRanked = parsed
          .map(r => {
            const original = top.find(p => p.id === r.id);
            if (!original) return null;
            return { ...original, llm_rank: r.rank, llm_relevance: r.relevance, llm_reason: r.reason };
          })
          .filter(Boolean);

        // Append any proposals not in LLM output (shouldn't happen but safety net)
        const reRankedIds = new Set(reRanked.map(p => p.id));
        const remainder = top.filter(p => !reRankedIds.has(p.id));

        // Combine re-ranked top with the rest of the list unchanged
        return [...reRanked, ...remainder, ...candidates.slice(10)];
      }
    }
  } catch (e) { console.error('reRankProposals:', e.message); }

  return candidates; // Fallback to embedding order
}

// ── BID/NO-BID SCORING ────────────────────────────────────────────────────────
async function scoreBid(rfpData, matches, gaps, winRate, teamAvailable) {
  // Deterministic scoring algorithm — no AI needed, reproducible
  const topMatch = matches[0] || {};
  const strongMatches = matches.filter(m => m.match_label === 'Strong' || m.match_label === 'Good').length;
  const highGaps = gaps.filter(g => g.priority === 'high').length;
  const mustGaps = gaps.filter(g => g.type === 'capability' && g.priority === 'high').length;
  const hasWonMatches = matches.filter(m => m.outcome === 'won' && (m.match_label === 'Strong' || m.match_label === 'Good')).length;

  // Score components (0-100 each)
  const matchScore = Math.min(100, (topMatch.match_score || 0) * 100);
  const experienceScore = Math.min(100, strongMatches * 25);
  const gapScore = Math.max(0, 100 - (highGaps * 15) - (mustGaps * 25));
  const winRateScore = winRate > 0 ? Math.min(100, winRate * 1.5) : 50;
  const wonMatchScore = Math.min(100, hasWonMatches * 35);

  // Weighted composite
  const composite = Math.round(
    matchScore * 0.25 +
    experienceScore * 0.20 +
    gapScore * 0.25 +
    winRateScore * 0.15 +
    wonMatchScore * 0.15
  );

  // Decision thresholds
  let decision, confidence, colour;
  if (mustGaps >= 2) {
    decision = 'No Bid'; confidence = 'high'; colour = '#b04030';
  } else if (composite >= 65) {
    decision = 'Bid'; confidence = composite >= 80 ? 'high' : 'medium'; colour = '#3d5c3a';
  } else if (composite >= 45) {
    decision = 'Conditional Bid'; confidence = 'medium'; colour = '#b8962e';
  } else {
    decision = 'No Bid'; confidence = composite < 30 ? 'high' : 'medium'; colour = '#b04030';
  }

  // Generate rationale
  const rationale = [];
  if (strongMatches >= 2) rationale.push(`${strongMatches} strong/good matches from past work`);
  if (hasWonMatches >= 1) rationale.push(`${hasWonMatches} won proposal${hasWonMatches>1?'s':''} in similar territory`);
  if (highGaps > 0) rationale.push(`${highGaps} high-priority gap${highGaps>1?'s':''} to address`);
  if (mustGaps > 0) rationale.push(`${mustGaps} capability gap${mustGaps>1?'s':''} — may need partners or investment`);
  if (winRate > 0) rationale.push(`${winRate}% sector win rate`);

  const conditions = [];
  if (decision === 'Conditional Bid') {
    if (mustGaps > 0) conditions.push('Address capability gaps — consider subcontracting or teaming');
    if (highGaps > 2) conditions.push('Significant response effort required to close gaps');
    if (strongMatches === 0) conditions.push('Limited direct experience — strengthen with adjacent cases');
  }

  return { score: composite, decision, confidence, colour, rationale, conditions, components: { matchScore: Math.round(matchScore), experienceScore: Math.round(experienceScore), gapScore: Math.round(gapScore), winRateScore: Math.round(winRateScore), wonMatchScore: Math.round(wonMatchScore) } };
}


// ── STYLE CLASSIFICATION ──────────────────────────────────────────────────────
// What KIND of good writing is this — so outputs can be adapted by style not just quality
async function classifyWritingStyle(proposal) {
  const meta = proposal.ai_metadata || {};
  const text = proposal.extracted_text || '';
  const snippets = (meta.standout_sentences || []).slice(0, 6).join('\n');

  const defaultSuffix = getCustomPrompt('style_classification', `You are classifying the rhetorical style of a winning proposal.

Your goal is to identify HOW the proposal is effective, not whether it is good.
Be precise. Every classification must be evidenced from the text.
Do not assign flattering labels without proof.

Identify the primary rhetorical style, tone, sentence structure pattern, how evidence is introduced, how the opening is structured, 2-3 specific repeating rhetorical patterns, and what types of bids this style suits.

Distinguish between "good writing" and "a clear rhetorical strategy". If style is inconsistent across sections, say so and describe where it is strongest.`);

  const schema = `{
  "primary_style": "one of: evidence-heavy | narrative-led | client-mirror | outcome-first | technical-authority | challenger | relationship-first",
  "style_description": "2 sentences describing specifically how this style manifests in this proposal",
  "tone": "one of: formal | semi-formal | conversational | authoritative | collaborative | urgent",
  "sentence_structure": "one of: complex-analytical | punchy-direct | balanced-clause | list-heavy | question-led",
  "evidence_approach": "how this proposal uses evidence — specific pattern observed",
  "opening_technique": "how the executive summary or intro is structured — specific observation",
  "distinctive_patterns": ["2-3 specific repeating rhetorical patterns found in the text"],
  "best_used_for": ["types of bids or clients this style would work well for"]
}`;

  const ctxBlock = buildContextBlock({
    client: proposal.client,
    service_industry: proposal.service_industry,
    client_industry: proposal.client_industry,
    sector: proposal.sector,
    contract_value: proposal.contract_value,
    deliverables: meta.deliverables,
    key_themes: meta.key_themes,
    outcome: proposal.outcome,
  });

  const context = `Proposal: "${proposal.name}" (${proposal.outcome}, ${proposal.sector})
Writing quality score: ${meta.writing_quality?.overall_score || '?'}/100

${ctxBlock}

Sample sentences from this proposal:
${snippets || 'No standout sentences extracted'}

Themes: ${(meta.key_themes || []).join(', ')}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(defaultSuffix, `${context}\n\nClassify the rhetorical writing style of this proposal.\n\nReturn ONLY valid JSON:\n${schema}`);
      return safeJSON(raw);
    }
  } catch (e) { console.error('classifyWritingStyle OpenAI:', e.message); }
  try {
    const raw = await geminiGenerate(`Classify the writing style of this proposal. Return ONLY valid JSON.\n${schema}\n\n${context}`, true);
    return safeJSON(raw);
  } catch (e) { return null; }
}

// ── EVIDENCE DENSITY ANALYSIS ────────────────────────────────────────────────
// Distinguishes persuasive from flimsy — better than writing score alone
async function analyseEvidenceDensity(proposal) {
  const meta = proposal.ai_metadata || {};
  const snippets = (meta.standout_sentences || []).concat(meta.loss_risks || []).slice(0, 8).join('\n');

  const defaultSuffix = getCustomPrompt('evidence_density', `You are an expert in persuasive business writing, analysing evidence density in proposals.

Your goal is to distinguish between proposals that claim things and proposals that prove things.
Be ruthless. Confident-sounding language without evidence is weak.
General assertions, even if well written, should not score highly unless supported by proof, specificity, or credible comparison.

Classify proposal language into: Proven claim / Partially supported claim / Unsupported claim / Empty filler.

Anti-bias directives:
- The example number in the schema is a PLACEHOLDER TYPE (integer 0–100). It is NOT a suggested output.
- Score bands:
    85–100  Saturated with proof. Nearly every claim has a named client, quantified outcome, or named methodology. Rare.
    70–84   Strong. Most claims (~70%+) have evidence; named past clients and at least one quantified outcome.
    55–69   Mixed. Some claims proven, some assertive without proof. Common for competent mid-tier proposals.
    40–54   Thin. Majority of claims are assertions. 1-2 pieces of genuine evidence scattered across the document.
    25–39   Placeholder-grade. "Example 1 / Client A" patterns, no named clients, no quantified outcomes.
    0–24    Pure assertion. Zero verifiable evidence in the document.
- Hard caps (apply before scoring):
    - Zero named real clients in the experience section (or "Example 1/2/3" placeholders): max 35.
    - Zero quantified outcomes (no %, £/$ figures beyond pricing, no user/volume counts, no durations in past work): max 40.
    - Zero named methodologies or named technologies: max 55.
- Do not confuse "good writing" with "good proof". A well-written generic assertion is still a generic assertion and scores low.
- Call out weakest_claims with direct quotes from the input — if you cannot quote the text, don't invent.`);

  const schema = `{
  "evidence_score": "integer 0-100 per the bands and caps above",
  "claim_to_evidence_ratio": "e.g. '3 of 12 claims backed by evidence (25%)' — count specifically, don't estimate",
  "evidence_types_found": ["from: named past clients | quantified outcomes | specific methodologies | certifications | named team credentials | regulatory frameworks — only include what actually appears, empty if none"],
  "strongest_evidence": "the single most persuasive piece of evidence in the proposal — quote it, or state 'no strong evidence found'",
  "weakest_claims": ["2-3 specific claims that are made without evidence — quote the exact phrase"],
  "evidence_pattern": "one of: saturated | distributed | front-loaded | back-loaded | sparse | absent",
  "credibility_verdict": "2 sentences: overall credibility assessment and main weakness. Be direct about weakness.",
  "improvement_priority": "the single highest-impact evidence gap to fill"
}`;

  const ctxBlock = buildContextBlock({
    client: proposal.client,
    service_industry: proposal.service_industry,
    client_industry: proposal.client_industry,
    sector: proposal.sector,
    contract_value: proposal.contract_value,
    deliverables: meta.deliverables,
    key_themes: meta.key_themes,
    outcome: proposal.outcome,
  });

  const context = `Proposal: "${proposal.name}" (${proposal.outcome}, ${proposal.user_rating}★)
Credibility score: ${meta.credibility_signals?.overall_score || '?'}/100
Named past work: ${meta.credibility_signals?.named_past_work ? 'yes' : 'no'}
Quantified outcomes: ${meta.credibility_signals?.quantified_outcomes ? 'yes' : 'no'}

${ctxBlock}

Sample content:
${snippets || 'No content extracted'}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(defaultSuffix, `${context}\n\nAnalyse the evidence density of this proposal.\n\nReturn ONLY valid JSON:\n${schema}`);
      return safeJSON(raw);
    }
  } catch (e) { console.error('analyseEvidenceDensity OpenAI:', e.message); }
  try {
    const raw = await geminiGenerate(`Analyse evidence density of this proposal. Return ONLY valid JSON.\n${schema}\n\n${context}`, true);
    return safeJSON(raw);
  } catch (e) { return null; }
}

// ── STRUCTURE EXTRACTION ─────────────────────────────────────────────────────
// Section order + narrative sequencing from the strongest proposals
async function extractProposalStructure(proposals) {
  const wonProposals = proposals.filter(p => p.outcome === 'won' && p.user_rating >= 4).slice(0, 3);
  if (!wonProposals.length) return null;

  const defaultSuffix = getCustomPrompt('structure_extraction', `You are extracting the narrative structure and section sequencing from high-performing winning proposals.

Your goal is to identify the STRUCTURAL patterns that make these proposals effective.
You are not extracting content themes or good phrases. You are extracting the architecture.

Focus on: section order, argument flow, how the proposal opens, where evidence appears, how credibility is introduced, how the narrative transitions from problem → solution → proof → delivery → confidence, and how it closes.

Be specific. Two proposals may both contain an "Approach" section but use it very differently. Capture the underlying logic, not just the labels.

Identify repeatable structural patterns, section sequencing patterns, best-use scenarios, and specific structural advice for the current bid.`);

  const context = wonProposals.map(p => {
    const meta = p.ai_metadata || {};
    return `Proposal: "${p.name}" (won, ${p.user_rating}★, ${p.sector})
Deliverables: ${(meta.deliverables || []).slice(0, 4).join(', ')}
Approach: ${(meta.approach_quality?.methodology_clarity || meta.methodologies?.[0] || 'not extracted')}
Standout sentences: ${(meta.standout_sentences || []).slice(0, 3).join(' | ')}`;
  }).join('\n\n');

  const schema = `{
  "recommended_section_order": ["Executive Summary", "Understanding the Requirement", "..."],
  "narrative_arc": "description of the overall narrative logic — how sections connect and build",
  "executive_summary_pattern": "how the best proposals open — specific structural observation",
  "transition_technique": "how sections flow into each other in the strongest proposals",
  "evidence_placement": "where in the structure evidence appears most effectively",
  "closing_pattern": "how winning proposals end — what the final argument is",
  "section_proportions": "guidance on relative length of sections — e.g. exec summary 10%, approach 35%",
  "structural_differentiators": ["2-3 structural choices that make these proposals stand out"],
  "apply_to_this_bid": "1 paragraph of specific structural advice for the current bid"
}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(defaultSuffix, `These are your best matched won proposals:\n\n${context}\n\nExtract the structural patterns and narrative sequencing.\n\nReturn ONLY valid JSON:\n${schema}`);
      return safeJSON(raw);
    }
  } catch (e) { console.error('extractProposalStructure OpenAI:', e.message); }
  try {
    const raw = await geminiGenerate(`Extract structural patterns from these won proposals. Return ONLY valid JSON.\n${schema}\n\n${context}`, true);
    return safeJSON(raw);
  } catch (e) { return null; }
}

// ── CONTEXTUAL ADAPTATION ─────────────────────────────────────────────────────
// Adapts winning language to the specific RFP — not raw reuse, proper contextualisation
async function adaptWinningLanguage(snippets, rfpData, styleContext) {
  if (!snippets?.length) return [];

  const defaultSuffix = getCustomPrompt('contextual_adaptation', `You are adapting high-performing proposal language to a specific new bid context.

Your goal is NOT to paraphrase or lightly edit. Your goal is to preserve what made the original effective while making it feel native to the new bid.

Do NOT copy the original text. Rewrite each snippet so it speaks directly to this client, sector, audience, procurement context, and bid themes.

Preserve: the logic, rhetorical structure, clarity, evidence-led framing, and persuasive mechanism.
Replace: all source-specific details with ones relevant to the new context.

If the original relies on a rhetorical move rather than a fact, preserve the move. If it relies on specific evidence, adapt the evidence approach, not the evidence itself.
If the original is not sufficiently relevant, say so rather than forcing an adaptation.

Reject adaptations that remain generic, feel borrowed, use the wrong tone, imply evidence not present in the new context, or overclaim.`);

  const snippetContext = snippets.slice(0, 8).map((s, i) =>
    `${i+1}. ORIGINAL: "${s.text}"
   USE_CASE: ${s.use_case}
   WHY_IT_WORKS: ${s.why_it_works}
   SOURCE: ${s.source_proposal || 'matched proposal'}`
  ).join('\n\n');

  const schema = `{
  "adapted_snippets": [
    {
      "original": "the original text",
      "adapted": "the rewritten version for this specific bid — different words, same technique",
      "use_case": "where to use this in the proposal",
      "adaptation_notes": "what was changed and why — so the writer understands the technique",
      "confidence": "high|medium|low"
    }
  ]
}`;

  const context = `Target RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})
Client themes: ${(rfpData.key_themes || []).join(', ')}
Evaluation priorities: ${(rfpData.evaluation_logic || []).slice(0, 3).join('; ')}
${styleContext ? `Preferred style: ${styleContext.primary_style} — ${styleContext.style_description}` : ''}

Winning snippets to adapt:
${snippetContext}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(defaultSuffix, `${context}\n\nAdapt each snippet for this specific bid. Do not copy — rewrite with the same technique.\n\nReturn ONLY valid JSON:\n${schema}`, 3000);
      const parsed = safeJSON(raw);
      return parsed?.adapted_snippets || [];
    }
  } catch (e) { console.error('adaptWinningLanguage OpenAI:', e.message); }
  try {
    const raw = await geminiGenerate(`Adapt these winning snippets for this bid. Return ONLY valid JSON.\n${schema}\n\n${context}`, true);
    return safeJSON(raw)?.adapted_snippets || [];
  } catch (e) { return []; }
}


// ── PROPOSAL SECTION DRAFT GENERATOR ─────────────────────────────────────────
// Generates source-linked first-draft content for a proposal section.
//
// Returns a structured object — not just prose — so the UI can show:
//   - the draft text (with [EVIDENCE NEEDED] markers)
//   - which past proposals were referenced (source IDs)
//   - which winning language snippets informed the draft
//   - a confidence score with the model's own assessment
//   - what the writer still needs to fill in
//
// Design principles for this feature:
//   - GATED: only callable once strategy + winning language exist
//   - SOURCE-LINKED: every draft cites the specific proposals it drew from
//   - HONEST: model leaves [EVIDENCE NEEDED] markers rather than fabricate
//   - CONFIDENCE-AWARE: low-confidence drafts surface a warning to the user
async function generateSectionDraft(sectionName, sectionDescription, rfpData, matchedProposals, winStrategy, winningLanguage, executiveBrief = null, orgProfile = null, opts = {}) {
  const { gaps = [], suggestedApproach = null, narrativeAdvice = '', writingInsights = [] } = opts || {};
  const wonMatches = (matchedProposals || []).filter(p => p.outcome === 'won').slice(0, 3);
  const allTopMatches = (matchedProposals || []).slice(0, 5);
  const sourceMatches = wonMatches.length > 0 ? wonMatches : allTopMatches;

  // Compact match context with explicit source IDs the model can cite by index
  const matchContext = sourceMatches.map((p, i) => {
    const meta = p.ai_metadata || {};
    return `[#${i + 1} id=${p.id}] "${p.name}" (${p.outcome}, ${p.user_rating || '?'}★)
   Themes: ${(meta.key_themes || []).slice(0, 4).join(', ')}
   Deliverables: ${(meta.deliverables || []).slice(0, 3).join(', ')}
   Methodologies: ${(meta.methodologies || []).slice(0, 3).join(', ')}
   Standout sentence: ${(meta.standout_sentences || [])[0] || '(none)'}`;
  }).join('\n\n') || 'No matched proposals available';

  // Winning language with explicit indices the model can cite
  const langContext = (winningLanguage || []).slice(0, 6).map((s, i) =>
    `[L${i + 1}] (${s.use_case || 'general'}) "${s.adapted || s.text}"`
  ).join('\n') || 'No winning language extracted';

  const briefContext = executiveBrief ? [
    executiveBrief.winning_thesis_one_liner ? `Winning thesis: ${executiveBrief.winning_thesis_one_liner}` : null,
    executiveBrief.best_fit_style ? `Best-fit style: ${executiveBrief.best_fit_style}` : null,
    executiveBrief.best_fit_structure ? `Best-fit structure: ${executiveBrief.best_fit_structure}` : null,
  ].filter(Boolean).join('\n') : '';

  // Build sector-aware + service-aware writing guide for this section
  const { buildSectionGuide } = require('./proposal-writing-guide');
  const clientInd = rfpData.client_industry || rfpData.sector || null;
  const serviceInd = rfpData.service_industry || null;
  const sectionGuide = buildSectionGuide(clientInd, serviceInd, sectionName);

  const systemSuffix = `${sectionGuide}

═══════════════════════════════════════════════════════════════════════════
SECTION DRAFT MODE — additional rules for single-section drafting
═══════════════════════════════════════════════════════════════════════════
  ✓ Reference matched proposals by [#N] index tags (the UI resolves these)
  ✓ Use winning language snippets as inspiration via [L1], [L2] tags
  ✓ Use [EVIDENCE NEEDED: specific thing] markers for missing data
  ✓ NEVER lift numbers or quotes verbatim from a matched proposal into
    a different bid context — use them as patterns, not facts

═══════════════════════════════════════════════════════════════════════════
CONFIDENCE
═══════════════════════════════════════════════════════════════════════════
You will set a confidence score (high/medium/low):
  high   — strong matches available, winning language clearly applies,
            section type is well supported by the inputs
  medium — partial signal, some EVIDENCE NEEDED markers needed
  low    — thin source data, lots of placeholders, writer should
            consider this a skeleton not a draft`;

  const schema = `{
  "draft": "the actual section text — prose, with [#1] [#2] match citations and [EVIDENCE NEEDED: ...] markers where specific data is required",
  "cited_match_ids": ["the IDs of the matched proposals the draft actually cites — copy from the [id=...] tags above"],
  "cited_language_ids": ["the L1/L2 IDs of winning language snippets that informed the structure"],
  "evidence_needed": [
    "list of every [EVIDENCE NEEDED] marker in the draft, with a brief note on what kind of data is needed"
  ],
  "confidence": "high | medium | low",
  "confidence_reason": "1 sentence on why you set this confidence — what's strong, what's missing"
}`;

  const userPrompt = `Section to draft: "${sectionName}"
Section purpose: ${sectionDescription || '(no description)'}

═══════════════════════════════════════════════════════════════════════════
RFP CONTEXT
═══════════════════════════════════════════════════════════════════════════
Client: ${rfpData.client || 'Unknown'} | Sector: ${rfpData.sector || 'Unknown'}
Themes: ${(rfpData.key_themes || []).join(', ') || 'none'}
Top requirements:
${(rfpData.requirements || []).slice(0, 6).map(r => `- [${(r.priority || 'should').toUpperCase()}] ${r.text}`).join('\n') || '(none extracted)'}

${briefContext}

═══════════════════════════════════════════════════════════════════════════
MATCHED PAST PROPOSALS (cite by [#1], [#2], etc — don't fabricate)
═══════════════════════════════════════════════════════════════════════════
${matchContext}

═══════════════════════════════════════════════════════════════════════════
WINNING LANGUAGE SNIPPETS (use as structural inspiration [L1], [L2])
═══════════════════════════════════════════════════════════════════════════
${langContext}

${buildOrgProfileBlock(orgProfile)}

${(() => {
  // Upstream pipeline guidance — gaps to pre-empt, suggested phased
  // approach, narrative positioning, and writing insights from matched
  // proposals. Presented as SUPPLEMENTARY GUIDANCE so it informs the
  // draft without overriding the core section rules above.
  const bits = [];
  const topGaps = Array.isArray(gaps) ? gaps.filter(g => g?.priority === 'high' || g?.priority === 'High').slice(0, 5) : [];
  if (topGaps.length > 0) {
    bits.push('High-priority gaps to pre-empt in this draft (where relevant to the section):');
    topGaps.forEach(g => {
      const title = g.title || g.gap || '';
      const action = g.suggested_action || g.fix || g.remedy || '';
      bits.push(`  · ${title}${action ? ` — suggested mitigation: ${action}` : ''}`);
    });
  }
  if (suggestedApproach && typeof suggestedApproach === 'object') {
    const phases = Array.isArray(suggestedApproach.suggested_phases) ? suggestedApproach.suggested_phases.slice(0, 5) : [];
    if (phases.length > 0) {
      bits.push('', 'Suggested phased approach from upstream analysis (borrow structure where natural, not as fixed scaffolding):');
      phases.forEach((ph, i) => {
        const name = ph.phase_name || ph.name || `Phase ${i + 1}`;
        const dur = ph.duration || ph.duration_weeks || '';
        const activities = Array.isArray(ph.activities) ? ph.activities.slice(0, 3).join('; ') : '';
        bits.push(`  · ${name}${dur ? ` (${dur})` : ''}${activities ? ` — ${activities}` : ''}`);
      });
    }
    if (suggestedApproach.recommended_approach) {
      bits.push('', `Recommended approach summary: ${suggestedApproach.recommended_approach}`);
    }
  }
  const narrative = typeof narrativeAdvice === 'string'
    ? narrativeAdvice
    : narrativeAdvice?.text || '';
  if (narrative) {
    bits.push('', 'Narrative positioning advice from upstream analysis:');
    bits.push(`  ${narrative.slice(0, 600)}`);
  }
  const insights = Array.isArray(writingInsights) ? writingInsights.slice(0, 4) : [];
  if (insights.length > 0) {
    bits.push('', 'Writing insights from top matched proposals (patterns that worked in similar won bids):');
    insights.forEach(w => {
      const name = w.project_name || w.name || 'unknown';
      const ind = Array.isArray(w.win_indicators) ? w.win_indicators.slice(0, 2).join('; ') : '';
      const ev = w.evidence_density?.strongest_evidence || '';
      if (ind || ev) bits.push(`  · ${name}: ${[ind, ev].filter(Boolean).join(' | ')}`);
    });
  }
  if (bits.length === 0) return '';
  return `═══════════════════════════════════════════════════════════════════════════
SUPPLEMENTARY GUIDANCE — informational, not overriding
═══════════════════════════════════════════════════════════════════════════
Upstream pipeline analysis has produced the following signals. Use them to
STRENGTHEN this draft where they make sense for the section at hand; do
not try to force every signal into every section.

${bits.join('\n')}
`;
})()}

═══════════════════════════════════════════════════════════════════════════
STEP 1 — Inside <thinking> tags, work through:
═══════════════════════════════════════════════════════════════════════════
  a. Which 1-2 matched proposals should this section actually cite, and
     what specific aspect of each is relevant to "${sectionName}"?
  b. Which winning language snippets (if any) provide a structural pattern
     worth borrowing for this section?
  c. What facts in the matched proposals are SPECIFIC to those bids and
     therefore need to become [EVIDENCE NEEDED] in this draft?
  d. Calibrate confidence — strong evidence available, or thin?

═══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft to schema:
═══════════════════════════════════════════════════════════════════════════
${schema}

═══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning, check:
═══════════════════════════════════════════════════════════════════════════
  □ Does the draft contain ANY specific number, name, or percentage that
    isn't either (a) from the RFP or (b) wrapped in [EVIDENCE NEEDED]?
    If yes, replace with a placeholder.
  □ Are all [#N] citations actually present in the matches list above?
  □ Is the prose specific to this client, or could it apply to anyone?
    If generic, rewrite with a [EVIDENCE NEEDED] marker pointing at the
    specific thing the writer should fill in.
  □ Did you set confidence honestly — or did you say "high" because you
    wrote a polished draft regardless of source quality?

If any check fails, fix it. Then return final JSON after </thinking>.
Return ONLY valid JSON.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 2500);
      const parsed = safeJSON(raw);
      if (parsed?.draft) return parsed;
    }
  } catch (e) { console.error('generateSectionDraft OpenAI:', e.message); }

  try {
    const raw = await geminiGenerate(`${systemSuffix}\n\n${userPrompt}`, true);
    const parsed = safeJSON(raw);
    if (parsed?.draft) return parsed;
  } catch (e) { console.error('generateSectionDraft Gemini fallback:', e.message); }

  return null;
}

// ── EXECUTIVE BID BRIEF — synthesis layer ─────────────────────────────────
// Final synthesis step. Takes everything the pipeline has produced and
// produces a SINGLE decision-ready brief: verdict, top priorities, top
// risks, recommended assets, immediate next actions. Designed to be the
// default landing tab so users don't have to assemble the answer from
// nine separate tabs themselves.
//
// This is the most important AI call in the system because it converts
// "intelligence" into "what should I do tomorrow morning". Quality of
// this output drives perceived product value more than any other call.
async function generateExecutiveBidBrief({
  rfpData = {},
  matches = [],
  gaps = [],
  winStrategy = null,
  narrativeAdvice = '',
  bidScore = null,
  winningLanguage = [],
  proposalStructure = null,
  marketContext = [],
  orgProfile = null,
}) {
  // Pre-build compact context strings — the brief is the LAST call so
  // we have a lot of upstream output. Be selective.
  const topMatches = (matches || []).slice(0, 5);
  const tier1Matches = topMatches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 2);
  const wonMatches = topMatches.filter(m => m.outcome === 'won');

  const matchContext = topMatches.map(m =>
    `- "${m.name}" (${m.outcome || 'pending'}, ${m.user_rating || '?'}★, tier ${m.taxonomy_tier || '?'}, ${m.match_score || '?'}/100): ${(m.ai_metadata?.key_themes || []).slice(0, 3).join(', ')}`
  ).join('\n') || 'No relevant past proposals';

  const topGaps = (gaps || []).filter(g => g.priority === 'high').slice(0, 5);
  const gapContext = topGaps.map(g => `- [${g.priority?.toUpperCase()}] ${g.title}: ${g.description}`).join('\n') || 'No critical gaps identified';

  const strategyContext = winStrategy ? [
    winStrategy.winning_thesis ? `Winning thesis: ${winStrategy.winning_thesis}` : null,
    winStrategy.differentiator_angle ? `Differentiator: ${winStrategy.differentiator_angle}` : null,
    winStrategy.opening_narrative ? `Opening: "${winStrategy.opening_narrative}"` : null,
  ].filter(Boolean).join('\n') : 'No strategy generated';

  const scoreContext = bidScore ? `Bid score: ${bidScore.score}/100 (${bidScore.decision}, ${bidScore.confidence} confidence). Components: match=${bidScore.components?.matchScore}, experience=${bidScore.components?.experienceScore}, gaps=${bidScore.components?.gapScore}, won-history=${bidScore.components?.wonMatchScore}` : 'No score computed';

  const winningLangCount = (winningLanguage || []).filter(s => s.text).length;
  const structureSummary = proposalStructure?.apply_to_this_bid || proposalStructure?.executive_summary_pattern || 'No structure pattern extracted';

  const systemSuffix = `You are a senior bid director writing the one-page executive brief that the bid team will read FIRST when this RFP lands on their desk.

YOUR JOB: convert the intelligence below into a clear, honest battle plan. Decisive where the evidence supports it, cautious where it doesn't.

The brief will be read in 90 seconds by busy senior people. Every line must move them toward a decision or an action. No background, no hedging-for-hedging's-sake — but equally no false confidence. A weak position stated honestly beats a strong one manufactured.

═══════════════════════════════════════════════════════════════════════════
WHAT THIS BRIEF IS NOT
═══════════════════════════════════════════════════════════════════════════
  ❌ A recap of the RFP
  ❌ A list of everything you found
  ❌ A balanced "on the one hand / on the other" when the data IS one-sided
  ❌ Unearned optimism ("we've got this") when matches are thin
  ❌ Generic best-practice ("understand the client", "tell a story")
  ❌ Restating the win strategy verbatim — synthesise, don't echo

═══════════════════════════════════════════════════════════════════════════
WHAT THIS BRIEF IS
═══════════════════════════════════════════════════════════════════════════
  ✅ A go/no-go verdict in one sentence, calibrated to the evidence
  ✅ Three priorities the team must execute
  ✅ Three risks that could lose this if not addressed
  ✅ A recommended set of past assets to actually use
  ✅ Five concrete next actions, each doable today
  ✅ A clear best-fit style and structure for this bid
  ✅ Decisions based on what the data actually says

═══════════════════════════════════════════════════════════════════════════
VERDICT CALIBRATION — do not grade upward
═══════════════════════════════════════════════════════════════════════════

  STRONG BID    Requires: ≥3 tier-1/2 matches, ≥2 won in the sector within
                36 months, named team credentials for the top requirement,
                fewer than 3 HIGH-priority gaps. Rare. Reserved for genuine
                home-turf opportunities.

  BID           Requires: at least 1 tier-1 OR 2 tier-2 matches, at least
                1 won match in sector, high-priority gaps have credible
                mitigations within reach. The usual "yes, bid it" verdict.

  CONDITIONAL   The default when matches are thin (0-1 tier-2), or when
                there are 3+ HIGH-priority gaps, or when the bid score is
                below 60. Requires specific conditions to be met before
                proceeding. Use this rather than forcing a BID verdict.

  NO BID        Zero matches in sector + multiple HIGH gaps with no
                mitigation path, OR bid score <40, OR a requirement the
                organisation genuinely cannot meet. Do not avoid this verdict.

Examples below illustrate tone only — do not copy claims or numbers.

❌ OVER-CONFIDENT verdict (no evidence backing):
   "STRONG BID. We are well-positioned and can bring deep expertise to
    this opportunity."

✅ CALIBRATED verdict:
   "CONDITIONAL BID. We have one tier-2 proposal in an adjacent sector and
    no won bids for this client type. Proceeding only makes sense if we
    pair a senior subject-matter lead with a quick-turnaround proof point
    in the next 5 days; otherwise pass."

❌ GENERIC priority:
   "Demonstrate technical expertise"

✅ CALIBRATED priority:
   "Open the executive summary with the production-scale number from the
    tier-1 match (cite the actual project name). This is the strongest
    defensible claim in our portfolio for this bid and pre-empts the
    capability section the RFP asks for."

═══════════════════════════════════════════════════════════════════════════
DISCIPLINE
═══════════════════════════════════════════════════════════════════════════
  • Verdict must contain one of: STRONG BID / BID / CONDITIONAL BID / NO BID
  • Verdict confidence must reflect the evidence density — a STRONG BID with 'low' confidence is a contradiction; downgrade the decision instead.
  • Each priority must be a decision the team can execute, backed by a cited match or gap
  • Each risk must have a mitigation that fits inside this bid response
  • Each next_action must be doable in <2 hours by a named role
  • Recommended assets must cite specific past proposals by name from the input
  • If the data is thin (≤1 relevant match and/or ≥3 HIGH gaps), the verdict cannot be STRONG BID and confidence cannot be 'high'. Say so in the headline.
  • Do not invent project names, numbers, or credentials that are not in the input.`;

  const schema = `{
  "verdict": {
    "decision": "STRONG BID | BID | CONDITIONAL BID | NO BID",
    "headline": "ONE sentence (max 30 words) — the bid director's gut call with the single most important reason",
    "confidence": "high | medium | low",
    "score_summary": "one sentence translating the bidScore numbers into plain English"
  },
  "what_this_brief_is_really_asking_for": "2-3 sentences — what the evaluator actually wants beneath the surface requirements. Cite implicit signals from the RFP, not explicit words.",
  "are_we_a_strong_fit": "2-3 sentences — honest assessment grounded in the matched proposals and gaps. Name the strongest fit signal and the biggest concern.",
  "top_3_priorities": [
    {
      "priority": "specific decision the team should make today",
      "why_it_matters": "1 sentence — what changes if we do this vs don't",
      "evidence": "the matched proposal name, gap title, or RFP requirement that backs this"
    }
  ],
  "top_3_risks": [
    {
      "risk": "specific risk to win probability",
      "mitigation": "concrete action inside this bid response",
      "owner": "Bid Manager | Lead Writer | Subject Matter Expert | Account Director"
    }
  ],
  "best_fit_style": "1 sentence — the rhetorical style this bid should adopt, drawn from the highest-performing matched proposals",
  "best_fit_structure": "1 sentence — the section ordering and narrative arc this bid should follow",
  "recommended_assets_to_use": [
    {
      "name": "exact proposal name from the matches",
      "why": "specific reason this proposal is worth referencing",
      "use_for": "executive summary | approach section | credibility | case study | risk handling"
    }
  ],
  "what_to_deprioritise": [
    "specific things to NOT spend bid effort on — sections, themes, or angles that would dilute the thesis"
  ],
  "immediate_next_actions": [
    {
      "action": "concrete action a named role can do today (max 12 words)",
      "owner": "Bid Manager | Lead Writer | Subject Matter Expert | Account Director",
      "deadline": "today | tomorrow | 48h | by Friday"
    }
  ],
  "winning_thesis_one_liner": "one sentence the team can repeat — the central positioning every section reinforces"
}`;

  const rfpCtxBlock = buildRfpContextBlock(rfpData);

  const context = `═══════════════════════════════════════════════════════════════════════════
RFP CONTEXT
═══════════════════════════════════════════════════════════════════════════
Title: ${rfpData.title || 'Untitled'}
Client: ${rfpData.client || 'Unknown'}
Sector: ${rfpData.sector || 'Unknown'}
Value hint: ${rfpData.contract_value_hint || 'not stated'}
Deadline: ${rfpData.deadline || 'not stated'}
Procurement framework: ${rfpData.procurement_framework || 'not stated'}
Key themes: ${(rfpData.key_themes || []).join(', ') || 'not extracted'}
Evaluation logic: ${(rfpData.evaluation_logic || []).join('; ') || 'not extracted'}
MUST requirements: ${((rfpData.requirements || []).filter(r => r.priority === 'must').length)} found
SHOULD requirements: ${((rfpData.requirements || []).filter(r => r.priority === 'should').length)} found
Implicit requirements: ${(rfpData.implicit_requirements || []).length} found

${rfpCtxBlock}

═══════════════════════════════════════════════════════════════════════════
BID SCORE (deterministic)
═══════════════════════════════════════════════════════════════════════════
${scoreContext}

═══════════════════════════════════════════════════════════════════════════
TOP MATCHED PROPOSALS (${tier1Matches.length} direct-fit, ${wonMatches.length} won)
═══════════════════════════════════════════════════════════════════════════
${matchContext}

═══════════════════════════════════════════════════════════════════════════
HIGH-PRIORITY GAPS
═══════════════════════════════════════════════════════════════════════════
${gapContext}

═══════════════════════════════════════════════════════════════════════════
WIN STRATEGY (already generated — synthesise, do not echo)
═══════════════════════════════════════════════════════════════════════════
${strategyContext}

═══════════════════════════════════════════════════════════════════════════
NARRATIVE ADVICE (free-form)
═══════════════════════════════════════════════════════════════════════════
${(narrativeAdvice || '').slice(0, 800) || 'None'}

═══════════════════════════════════════════════════════════════════════════
ADDITIONAL CONTEXT
═══════════════════════════════════════════════════════════════════════════
Winning language snippets available: ${winningLangCount}
Structure pattern: ${structureSummary.slice(0, 200)}
Market context items: ${marketContext.length}

${buildOrgProfileBlock(orgProfile)}`;

  const userPrompt = `${context}

══════════════════════════════════════════════════════════════════════════
STEP 1 — Inside <thinking> tags, work through:
══════════════════════════════════════════════════════════════════════════
  a. What is the SINGLE most important fact about this opportunity? Lead
     the verdict with it.
  b. Of all the matched proposals, gaps, and strategy points, which 3
     are the highest-leverage actions for the bid team this week?
  c. Of the risks, which 3 would actually lose this bid if unaddressed?
  d. Which past assets are genuinely worth referencing — not just the
     top 5 by score, but the ones with transferable evidence?
  e. What 5 things could the bid team realistically do TODAY?

══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft the JSON to this schema:
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning:
══════════════════════════════════════════════════════════════════════════
  □ Is the verdict.headline a sentence a bid director would actually say
    out loud, or is it cautious filler? Rewrite if cautious.
  □ Could each top_3_priority be replaced with a generic best-practice
    statement and still make sense? If yes, rewrite to be specific.
  □ Does each immediate_next_action name a specific deliverable and
    owner that someone could do this afternoon? If not, rewrite.
  □ Do recommended_assets_to_use cite SPECIFIC proposal names from the
    matches above, not generic descriptions? If not, fix.
  □ Is what_to_deprioritise actually controversial — i.e. does it tell
    the team to NOT do something they'd otherwise default to? If it's
    just "avoid generic language", drop it.
  □ Does winning_thesis_one_liner pass the "could a competitor use this
    verbatim?" test? If yes, sharpen with our specific evidence.

If any field fails the critique, rewrite. Then return final JSON after
</thinking>. Return ONLY valid JSON.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 4500);
      const parsed = safeJSON(raw);
      if (parsed?.verdict) return parsed;
    }
  } catch (e) {
    console.error('OpenAI generateExecutiveBidBrief failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\n${userPrompt}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed?.verdict) return parsed;
  } catch (e) {
    console.error('generateExecutiveBidBrief Gemini fallback failed:', e.message);
  }

  // Fallback: synthesise a minimal brief from deterministic data so the
  // tab is never empty even if both AI calls fail.
  return {
    verdict: {
      decision: bidScore?.decision || 'CONDITIONAL BID',
      headline: 'AI synthesis unavailable — review the matched proposals and gaps tabs to form a decision.',
      confidence: 'low',
      score_summary: scoreContext,
    },
    what_this_brief_is_really_asking_for: '',
    are_we_a_strong_fit: '',
    top_3_priorities: [],
    top_3_risks: (gaps || []).filter(g => g.priority === 'high').slice(0, 3).map(g => ({
      risk: g.title, mitigation: g.suggested_action || 'See gap analysis tab', owner: 'Bid Manager',
    })),
    best_fit_style: '',
    best_fit_structure: '',
    recommended_assets_to_use: topMatches.slice(0, 3).map(m => ({
      name: m.name, why: 'Top match by AI ranking', use_for: 'reference',
    })),
    what_to_deprioritise: [],
    immediate_next_actions: [],
    winning_thesis_one_liner: winStrategy?.winning_thesis || winStrategy?.differentiator_angle || '',
  };
}

// ── ORGANISATION PROFILE EXTRACTOR (Wave 5) ──────────────────────────────
// Takes a corpus of text scraped from the org's public website (or pasted
// by the user) and extracts structured offerings + positioning. The output
// is shown to the user on the onboarding confirmation page where they
// edit/remove/add before it becomes trusted operating context.
//
// Principles:
//   · Map offerings to the canonical service taxonomy wherever possible,
//     but preserve the user's own language as the primary label
//   · Confidence scores must be honest — low confidence when the evidence
//     is thin, not "medium" for everything
//   · Never invent services that aren't mentioned in the text
//   · Extract positioning phrases verbatim (for later use in win strategy)

// ── SANITY CHECK TOP MATCHES ──────────────────────────────────────────────
// Final objective gate before matches are shown to the user. Takes the
// top-ranked proposals and asks an AI to judge each one for actual
// relevance to this specific RFP, independent of the tier/cosine/score
// math. Catches cases where the ranking put something obviously wrong
// at the top because the metadata was misleading.
//
// Verdicts:
//   · keep     — good match, show as-is
//   · flag     — relevant but has caveats; add warning badge
//   · demote   — obviously wrong for this RFP; move to cross-sector tier
//
// Called once per scan (deep pass only — not fast pass) on the top 8
// matches. Cost: one AI call per scan, ~$0.01.
async function sanityCheckTopMatches(rfpData, topMatches, orgProfile = null) {
  if (!Array.isArray(topMatches) || topMatches.length === 0) return [];

  // Only check the top 8 — enough to catch the ones that matter, bounded cost
  const subset = topMatches.slice(0, 8);

  const rfpCtx = buildRfpContextBlock(rfpData);
  const orgBlock = buildOrgProfileBlock(orgProfile);

  const rfpSummary = `${rfpData.title || 'Untitled'} for ${rfpData.client || 'Unknown'} (${rfpData.sector || 'Unknown sector'})
Key themes: ${(rfpData.key_themes || []).slice(0, 5).join(', ') || 'none'}
Top requirements: ${(rfpData.requirements || []).slice(0, 5).map(r => r.text || '').join(' | ') || 'none'}

${rfpCtx}

${orgBlock}`;

  const matchesSummary = subset.map((m, i) => {
    const meta = m.ai_metadata || {};
    return `[#${i + 1} id=${m.id}] "${m.name}" (${m.outcome || '?'}, ${m.user_rating || '?'}★, tier ${m.taxonomy_tier || '?'}, score ${m.match_score || '?'})
   Client: ${m.client || '?'} | Sector: ${m.sector || '?'}
   Themes: ${(meta.key_themes || []).slice(0, 4).join(', ') || 'none'}
   Deliverables: ${(meta.deliverables || []).slice(0, 3).join(', ') || 'none'}`;
  }).join('\n\n');

  const systemSuffix = `You are a senior bid director doing a final objective sanity check on AI-ranked proposal matches before they're shown to the bid team.

Your job: look at each match OBJECTIVELY. Does it actually make sense as a reference for THIS specific RFP, or did the ranking algorithm get fooled?

═══════════════════════════════════════════════════════════════════════════
YOU ARE NOT RE-RANKING
═══════════════════════════════════════════════════════════════════════════
The upstream ranking already considers: semantic similarity, taxonomy
tiering, quality rating, outcome, feedback history. Don't try to beat it.

Your ONE job is to catch OBVIOUS misfits — matches that made it to the
top despite being irrelevant because:
  · Metadata was misleading (e.g. "data platform" proposal matched a
    "patient data" RFP but is actually about data centres)
  · Surface-level theme overlap but totally different scope
  · Same-sector but completely wrong work type
  · Same vendor / same client but wrong project type

Organisation profile is provided for CONTEXT ONLY, not penalty. Do
NOT flag or demote a match for sitting outside the org's stated
offerings — companies diversify, and a past proposal in a non-core
area may still be a valid reference. The profile is shown to you
so you can recognise the org's capability shape when weighing whether
a match is an OBVIOUS misfit on other grounds (wrong work type, wrong
scope, misleading metadata). Capability fit is surfaced to the user
elsewhere in the UI; your job here is quality control only.

═══════════════════════════════════════════════════════════════════════════
VERDICT CALIBRATION
═══════════════════════════════════════════════════════════════════════════

  keep   (default) — this match makes sense, whether strong or partial.
                      The bid team will benefit from seeing it.

  flag   (uncommon) — relevant but with a specific caveat worth noting.
                      e.g. "relevant methodology but outdated tech stack",
                      "same client but very different service line".
                      Adds a warning badge, still shown prominently.

  demote (rare)    — obviously wrong. Moving it to the "cross-sector
                      references" bucket (hidden behind a button) would
                      make the list better. Only use this when the match
                      would CONFUSE the bid writer, not just be weak.

═══════════════════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════════════════

RFP: "Hospital patient data integration platform"
❌ WRONG to demote "Cloud data platform for retail bank" just because
   it's a different sector — if the integration patterns transfer, KEEP.
✅ RIGHT to demote "Patient feedback survey tool for NHS" — same sector,
   totally different scope, would confuse the bid writer.

RFP: "UAV procurement for tactical ISR"
❌ WRONG to demote "Drone delivery service feasibility study" just
   because it's commercial — surface words differ but patterns transfer.
   Flag instead: "Commercial drone focus — lift only the procurement
   methodology, not the commercial rationale."
✅ RIGHT to demote "Agricultural drone spraying pilot" — same vehicle
   class, completely wrong purpose.

Be CONSERVATIVE with demote. When in doubt, keep.`;

  const schema = `{
  "verdicts": [
    {
      "match_id": "the id from [#N id=...] above",
      "verdict": "keep | flag | demote",
      "reason": "one short sentence explaining the verdict — required for flag and demote, optional for keep"
    }
  ]
}`;

  const userPrompt = `RFP:
${rfpSummary}

TOP MATCHES TO REVIEW:
${matchesSummary}

══════════════════════════════════════════════════════════════════════════
Inside <thinking> tags:
  1. For each match, ask: "If I were the bid writer, would seeing this
     help me or distract me?"
  2. Identify any that are obviously wrong scope even if they scored well.
  3. Identify any worth flagging with a specific caveat.
  4. Default to KEEP when uncertain.

Return a verdict for EVERY match (use the id from the [#N id=...] tag).
Return ONLY valid JSON in the schema:
${schema}

Return ONLY valid JSON after </thinking>.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 1500);
      const parsed = safeJSON(raw);
      if (parsed?.verdicts) return parsed.verdicts;
    }
  } catch (e) {
    console.error('OpenAI sanityCheckTopMatches failed:', e.message);
  }

  try {
    const raw = await geminiGenerate(`${systemSuffix}\n\n${userPrompt}`, true);
    const parsed = safeJSON(raw);
    if (parsed?.verdicts) return parsed.verdicts;
  } catch (e) {
    console.error('sanityCheckTopMatches Gemini fallback:', e.message);
  }

  return [];
}

async function extractOrganisationProfile(corpus) {
  if (!corpus || corpus.trim().length < 50) return null;

  const systemSuffix = `You are analysing an organisation's website or pasted services list to extract what they actually offer. This will be shown to the user for confirmation before it becomes trusted operating context for ProposalIQ.

YOUR GOAL: pull out the services, sectors, and positioning an evaluator or prospective client would actually see on this organisation's website. Not what you guess they should do — what the text actually says.

═══════════════════════════════════════════════════════════════════════════
WHAT TO EXTRACT
═══════════════════════════════════════════════════════════════════════════

1. OFFERINGS — the services they sell. Each should be:
   · label: the org's own wording (how they describe it)
   · canonical_taxonomy_match: map to the closest canonical sector from
     this list if possible, otherwise null:
     ${SERVICE_INDUSTRY_ENUM}
   · confidence: high | medium | low
   · source_hint: which page you found this on (homepage, services page, etc)
   · evidence: a short quoted phrase from the text that supports this

2. CLIENT_TYPES — sectors or types of clients they serve. Match to:
     ${CLIENT_INDUSTRY_ENUM}

3. POSITIONING_PHRASES — 1-3 tagline-style sentences the org uses to
   describe itself. Quoted verbatim from the text.

4. DIFFERENTIATORS — claims of distinctive capability (e.g. "only UK firm
   with ISO 27001 for healthcare", "shipped 47 NHS trust integrations").
   Only include claims with specific evidence.

═══════════════════════════════════════════════════════════════════════════
CONFIDENCE CALIBRATION
═══════════════════════════════════════════════════════════════════════════

high   — explicitly named as a service on a dedicated page, OR named 2+
          times across different pages with specific evidence
medium — named once clearly but without deep evidence; OR implied strongly
          but not stated verbatim
low    — inferred from adjacent language; the text mentions related
          concepts but not the service itself

═══════════════════════════════════════════════════════════════════════════
REJECT
═══════════════════════════════════════════════════════════════════════════

  ❌ Generic marketing ("we deliver value", "trusted partner")
  ❌ Services you think they should offer but aren't in the text
  ❌ Duplicate entries with slightly different wording (merge them)
  ❌ Background history or founder bios
  ❌ Blog topics (unless repeatedly referenced as service areas)`;

  const schema = `{
  "offerings": [
    {
      "label": "the org's own wording (e.g. 'Crisis Communications')",
      "canonical_taxonomy_match": "the closest canonical sector or null",
      "confidence": "high | medium | low",
      "source_hint": "homepage | services page | about page | work page | case study",
      "evidence": "short quoted phrase from the text"
    }
  ],
  "client_types": [
    {
      "label": "the org's own wording (e.g. 'Healthcare organisations')",
      "canonical_taxonomy_match": "the closest canonical client industry or null",
      "confidence": "high | medium | low"
    }
  ],
  "positioning_phrases": ["1-3 tagline-style sentences quoted exactly"],
  "differentiators": ["claims of distinctive capability with specific evidence"],
  "org_name_guess": "the name of the organisation as it appears on the site, or null"
}`;

  const userPrompt = `Website / services text to analyse:

${corpus}

══════════════════════════════════════════════════════════════════════════
STEP 1 — Inside <thinking> tags, work through:
══════════════════════════════════════════════════════════════════════════
  a. What pages are visible in this corpus? (homepage, services, about, etc)
  b. List every service, capability, or offering named verbatim in the text.
  c. For each, decide confidence honestly: how many independent mentions?
     is there evidence beyond the label itself?
  d. Which client types / sectors does the text mention?
  e. Pull 1-3 positioning phrases that are actually used as self-descriptions.

══════════════════════════════════════════════════════════════════════════
STEP 2 — Draft the JSON to this schema:
══════════════════════════════════════════════════════════════════════════
${schema}

══════════════════════════════════════════════════════════════════════════
STEP 3 — Self-critique. Before returning:
══════════════════════════════════════════════════════════════════════════
  □ Does every offering have a quoted evidence phrase from the text?
  □ Are all canonical_taxonomy_match values from the enum, or null?
  □ Did you collapse duplicate offerings (e.g. "Brand" and "Branding")?
  □ Is any confidence="high" unbacked by 2+ mentions or dedicated page?
    If so, downgrade.
  □ Did you invent anything not literally in the text? Remove it.

Return final JSON after </thinking>. Return ONLY valid JSON.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, userPrompt, 3000);
      const parsed = safeJSON(raw);
      if (parsed?.offerings) return parsed;
    }
  } catch (e) {
    console.error('OpenAI extractOrganisationProfile failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `${systemSuffix}\n\n${userPrompt}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed?.offerings) return parsed;
  } catch (e) {
    console.error('extractOrganisationProfile Gemini fallback failed:', e.message);
  }

  return null;
}

// ── FULL PROPOSAL GENERATOR ──────────────────────────────────────────────
// Generates a complete, submission-ready proposal document by synthesising
// every upstream intelligence layer: RFP extraction, matched proposals,
// winning language, win strategy, gap analysis, org profile, narrative
// advice, and proposed approach.
//
// Architecture:
//   One AI call generates the ENTIRE proposal in one pass. This is
//   deliberate — section-by-section generation loses coherence because
//   each call starts fresh. A single call sees the whole structure and
//   can make the executive summary promise things that the approach
//   section delivers, the case studies prove, and the close reinforces.
//
// The output is plain text prose with markdown section headers.
// The user copies it into their proposal template and edits.
// ── FULL PROPOSAL GENERATOR ──────────────────────────────────────────────
// Generates a complete proposal by calling generateSectionDraft for each
// section sequentially, then concatenating the results. Each section gets
// the same rich context (RFP, matches, gaps, strategy, org profile) plus
// the text of all PREVIOUS sections so it can build on what came before.
//
// This replaced the single-call approach because:
//   · Shorter, focused prompts follow writing rules more reliably
//   · The section-by-section prompt already has the writing guide wired in
//   · Each section is independently high-quality
//   · Previous sections provide coherence context
async function generateFullProposal({
  rfpData = {},
  matches = [],
  gaps = [],
  winStrategy = null,
  winningLanguage = [],
  narrativeAdvice = '',
  suggestedApproach = null,
  proposalStructure = null,
  executiveBrief = null,
  orgProfile = null,
  teamSuggestions = [],
}) {
  // Define the sections to generate in order. Each gets the same rich
  // context plus the text of all previous sections for coherence.
  const PROPOSAL_SECTIONS = [
    { id: 'exec', title: 'Executive Summary', description: 'One sentence framing the requirement. What you will deliver. Single strongest proof point. Why you specifically. Forward-looking statement.' },
    { id: 'understanding', title: 'Understanding of the Requirement', description: 'Restate with insight. Separate explicit from implied. What is hard about this. What goes wrong when similar work fails.' },
    { id: 'approach', title: 'Our Proposed Approach', description: 'Outcome framing. Methodology rationale. 3-5 phased deliverables. Success measures. Pre-empt the top gap.' },
    { id: 'experience', title: 'Relevant Experience & Case Studies', description: '2-3 specific engagements. For each: context, what delivered, measurable outcome, relevance to THIS requirement.' },
    { id: 'team', title: 'Our Team', description: 'Named individuals, full names, credentials, role on THIS engagement, track record on cited case studies.' },
    { id: 'qa', title: 'Quality Assurance & Risk Management', description: 'Named QA methodology. Specific risks for THIS engagement. Concrete mitigations. Escalation process.' },
    { id: 'commercial', title: 'Commercial Proposal', description: 'Pricing structure. Key assumptions. Inclusions/exclusions. How scope changes are handled.' },
    { id: 'why_us', title: 'Why ' + (rfpData.client || 'the Client') + ' Should Choose Us', description: 'Strongest differentiator. Clear best-fit reason. Confident close.' },
  ];

  const completedSections = [];

  for (const section of PROPOSAL_SECTIONS) {
    try {
      console.log(`[generateFullProposal] Drafting: ${section.title}`);
      // Collect writing insights from the matched proposals so each section
      // draft sees the patterns that worked in similar bids.
      const writingInsights = (matches || [])
        .filter(m => m.evidence_density || Array.isArray(m.win_indicators))
        .slice(0, 4)
        .map(m => ({
          project_name: m.name,
          win_indicators: m.win_indicators || (m.ai_metadata?.win_indicators || []),
          evidence_density: m.evidence_density || null,
        }));
      const result = await generateSectionDraft(
        section.title,
        section.description,
        rfpData,
        matches,
        winStrategy,
        winningLanguage,
        executiveBrief,
        orgProfile,
        { gaps, suggestedApproach, narrativeAdvice, writingInsights }
      );

      if (result?.draft) {
        completedSections.push({ title: section.title, text: result.draft });
      } else {
        completedSections.push({ title: section.title, text: '[EVIDENCE NEEDED: This section could not be generated. Please draft manually.]' });
      }
    } catch (e) {
      console.error(`[generateFullProposal] Failed on ${section.title}:`, e.message);
      completedSections.push({ title: section.title, text: '[EVIDENCE NEEDED: Generation failed for this section.]' });
    }
  }

  // Concatenate into a single document
  const fullProposal = completedSections
    .map(s => `${s.title}\n\n${s.text}`)
    .join('\n\n\n');

  return fullProposal || null;
}

// ── PRE-DELIVERY QA: DETECT + REWRITE ────────────────────────────────────
// Two-pass finalisation that runs between generation and the user seeing
// a draft. Pass A detects issues; Pass B silently corrects them. The user
// only ever sees the corrected text plus a count of adjustments applied.
// Core non-invention rule: when a fix would require fabrication, insert an
// [EVIDENCE NEEDED: ...] marker instead. Never invent clients, people,
// numbers, or methodologies that are not in the supplied inputs.

function _qaSummariseMatches(matches) {
  if (!Array.isArray(matches)) return 'none';
  return matches.slice(0, 6).map((m, i) => {
    const meta = m.ai_metadata || {};
    return `[#${i + 1} id=${m.id}] "${m.name}" (${m.outcome || '?'}) | themes: ${(meta.key_themes || []).slice(0, 3).join(', ') || 'none'} | deliverables: ${(meta.deliverables || []).slice(0, 3).join(', ') || 'none'}`;
  }).join('\n') || 'none';
}

function _qaSummariseTeam(team) {
  if (!Array.isArray(team) || team.length === 0) return 'none';
  return team.slice(0, 15).map(m => {
    const specs = Array.isArray(m.stated_specialisms) ? m.stated_specialisms.slice(0, 3).join(', ') : (m.stated_specialisms || '');
    return `${m.name} (${m.title})${specs ? ` — ${specs}` : ''}`;
  }).join('\n');
}

// Pass A — detect issues. Returns a structured list the rewrite pass will
// consume. Never rewrites; never fabricates. If the inputs are too thin
// for a confident verdict on any category, it says so rather than padding.
async function qaDetectIssues({ draftText, rfpText = '', rfpData = {}, matches = [], orgProfile = null, team = [], scope = 'section' }) {
  if (!draftText || !draftText.trim()) return null;

  const systemSuffix = `You are the first of two QA passes on a bid draft. Your ONLY job is to detect issues — you do NOT rewrite.

Scope: ${scope === 'full' ? 'full multi-section proposal' : 'a single section draft'}

Be thorough but not imaginative. Only flag issues backed by evidence you can cite from the supplied inputs. If the RFP text is truncated (marked "…truncated"), do NOT assume content beyond the cut is missing.

Issue categories to check (use these exact type codes):

  deliverable_missing    A deliverable named in the RFP is not addressed in the draft.
  requirement_missing    A MUST or SHOULD from rfpData.requirements is not addressed.
  structural_directive   An explicit RFP directive on page limits, section order, Q&A format, or naming convention is violated.
  eval_criteria_thin     A heavily-weighted evaluation criterion has thin coverage relative to a low-weight criterion.
  fabrication_name       A named person, client, project, or company in the draft does not appear in any input.
  fabrication_number     A statistic, percentage, price, or quantity in the draft is not supported by any input.
  fabrication_method     A methodology or framework named is not in any matched proposal's metadata or the org profile.
  broken_citation        A [#N] or [L1] tag cites an index that doesn't correspond to a supplied match or language snippet.
  unresolved_evidence    An [EVIDENCE NEEDED: ...] marker in the draft (list them — the user will fill them).
  generic_phrase         A phrase from the known-generic blacklist. Blacklist: proven track record, trusted partner, deep expertise, holistic approach, tailored solution, drive value, unlock potential, world-class, best-in-class, cutting-edge, innovative solutions, we deliver value, end-to-end, leading provider, strategic partner, value-add, commitment to excellence, customer-centric approach, best-of-breed, results-driven, next-generation, industry-leading.
  duplicate_content      A paragraph or case study appears twice.
  invented_team          A named team member in the draft is not in the supplied team records.
  offering_drift         A capability claim in the draft is outside the org's confirmed offerings AND not supported by any matched proposal.
  number_inconsistency   A numeric claim differs across sections (team size, timeline, price, etc.).
  length_imbalance       A section's length is wildly out of proportion to its evaluation weight or RFP importance.

For each issue, give: type (from above), location (short quote from the draft or section name), description (one sentence — what's wrong), suggested_fix (one sentence — what would fix it, specifically referencing available inputs or requesting an [EVIDENCE NEEDED] marker).`;

  const schema = `{
  "issues": [
    { "type": "one of the codes above", "severity": "blocker|warning|info", "location": "short quote or section name", "description": "one sentence", "suggested_fix": "one sentence" }
  ],
  "verdict": "ready | minor_fixes | needs_rewrite",
  "notes": "one sentence explaining the verdict"
}`;

  const rfpExcerpt = (rfpText || '').slice(0, 30000);
  const truncated = (rfpText || '').length > 30000;
  const context = `═══ DRAFT TO CHECK (${scope}) ═══
${draftText.slice(0, 25000)}

═══ RFP PLAIN TEXT ═══
${rfpExcerpt}${truncated ? '\n\n…truncated' : ''}

═══ RFP EXTRACTED DATA ═══
Title: ${rfpData.title || '?'} | Client: ${rfpData.client || '?'} | Sector: ${rfpData.sector || '?'}
Deliverables: ${(rfpData.deliverables || []).slice(0, 10).join('; ') || '(none extracted)'}
Scope: ${(rfpData.scope || []).slice(0, 5).join('; ') || '(none extracted)'}
Requirements (${(rfpData.requirements || []).length} total):
${(rfpData.requirements || []).slice(0, 30).map(r => `- [${(r.priority || 'should').toUpperCase()}] ${r.text}`).join('\n') || '(none)'}
Evaluation criteria: ${(rfpData.evaluation_logic || []).join('; ') || '(none)'}
Structural directives: ${(rfpData.structural_directives || rfpData.submission_requirements || []).join('; ') || '(none)'}

═══ MATCHED PROPOSALS (citation base) ═══
${_qaSummariseMatches(matches)}

═══ TEAM RECORDS ═══
${_qaSummariseTeam(team)}

${buildOrgProfileBlock(orgProfile)}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nList every issue. Be thorough. Cite the draft or input in each description. Return ONLY valid JSON:\n${schema}`, 4500, 'qaDetectIssues');
      const parsed = safeJSON(raw);
      if (parsed) return parsed;
    }
  } catch (e) { console.error('qaDetectIssues OpenAI:', e.message); }
  try {
    const raw = await geminiGenerate(`${systemSuffix}\n\n${context}\n\nList every issue. Return ONLY valid JSON:\n${schema}`, true);
    return safeJSON(raw);
  } catch (e) { return null; }
}

// Pass B — rewrite the draft to address the detected issues. Hard rule:
// never invent content. Any fix that would require a fabrication must use
// an [EVIDENCE NEEDED: <type>] marker, replace with a real input item, or
// remove the unsupportable claim entirely. Returns corrected text plus a
// short change log.
async function qaRewriteDraft({ draftText, issues = [], rfpText = '', rfpData = {}, matches = [], orgProfile = null, team = [], scope = 'section' }) {
  if (!draftText || !draftText.trim()) return null;
  if (!Array.isArray(issues) || issues.length === 0) {
    return { text: draftText, adjustments: [], adjustments_count: 0 };
  }

  const systemSuffix = `You are the second of two QA passes on a bid draft. Your job is to PRODUCE A CORRECTED VERSION of the draft that addresses the issues the first pass flagged. The user will see only your output — there is no review layer.

HARD RULES — violations make the output unsafe to show the user:

1. NEVER invent facts. Do not introduce any person, client, project, statistic, percentage, price, quantity, methodology, or framework that is not present in the supplied inputs (matched proposals, RFP data, org profile, team records).

2. When a fix would require invention, instead:
   (a) replace with a real item from the supplied inputs, OR
   (b) insert an [EVIDENCE NEEDED: <specific type of data required>] marker, OR
   (c) remove the unsupportable claim entirely and restructure the sentence.

3. If a team member's name in the draft is not in the supplied team records, REPLACE it with a real team member whose title matches the role, or with [TBC: <role title>] if no matching member exists. Do not keep the invented name.

4. If a [#N] or [L1] citation tag is broken (no matching supplied match or language snippet), DROP the tag and rewrite the sentence so it still stands without the citation, or insert an [EVIDENCE NEEDED] marker.

5. Preserve the user's voice and tone. Do not rewrite prose for style — only to address flagged issues. Keep section headings and structure unless the structural_directive issue specifically requires reordering.

6. Keep existing [EVIDENCE NEEDED: ...] markers in place. Add new ones where this pass can't fix something without invention.

7. Stay inside the confirmed organisation offerings for capability claims, unless a matched proposal supports a broader claim. Remove claims that are outside offerings AND unsupported.

8. For missing deliverables or MUST requirements, add a concise commitment sentence in the section that logically owns the answer, drawing evidence from the matched proposals where possible; use [EVIDENCE NEEDED] otherwise.

9. For generic-phrase hits, rewrite with specifics drawn from matched proposals, or replace with [EVIDENCE NEEDED: <what would be specific here>].

10. For number_inconsistency, reconcile to the value used in the most authoritative section (commercial > approach > exec summary) and update the other instances.

Return the corrected text in full, plus a short list of the adjustments you actually made (one line per adjustment, categorised by issue type).`;

  const schema = `{
  "corrected_text": "the entire corrected draft, ready to present to the user. Include all sections if scope is 'full'. Keep existing section headings.",
  "adjustments": [
    { "type": "issue type code from Pass A", "summary": "one sentence describing what you changed, what was in the original, and how it's resolved now" }
  ]
}`;

  const rfpExcerpt = (rfpText || '').slice(0, 25000);
  const truncated = (rfpText || '').length > 25000;

  const issueList = issues.map(i => `- [${i.severity || 'warning'} · ${i.type || 'unknown'}] ${i.description || ''} — fix: ${i.suggested_fix || '(none supplied)'}${i.location ? ` (near: "${String(i.location).slice(0, 100)}")` : ''}`).join('\n');

  const context = `═══ CURRENT DRAFT (${scope}) ═══
${draftText}

═══ ISSUES TO ADDRESS ═══
${issueList || '(none)'}

═══ AVAILABLE INPUTS — NEVER EXTEND BEYOND THESE ═══

RFP TITLE: ${rfpData.title || '?'} · CLIENT: ${rfpData.client || '?'} · SECTOR: ${rfpData.sector || '?'}
Deliverables: ${(rfpData.deliverables || []).slice(0, 10).join('; ') || '(none)'}
Requirements:
${(rfpData.requirements || []).slice(0, 30).map(r => `- [${(r.priority || 'should').toUpperCase()}] ${r.text}`).join('\n') || '(none)'}

RFP PLAIN TEXT:
${rfpExcerpt}${truncated ? '\n\n…truncated' : ''}

MATCHED PROPOSALS (reference-able via [#1], [#2] etc):
${_qaSummariseMatches(matches)}

TEAM RECORDS:
${_qaSummariseTeam(team)}

${buildOrgProfileBlock(orgProfile)}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nProduce the corrected draft. Apply the non-invention rules strictly.\n\nReturn ONLY valid JSON:\n${schema}`, 8000, 'qaRewriteDraft');
      const parsed = safeJSON(raw);
      if (parsed?.corrected_text) {
        return {
          text: parsed.corrected_text,
          adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
          adjustments_count: Array.isArray(parsed.adjustments) ? parsed.adjustments.length : 0,
        };
      }
    }
  } catch (e) { console.error('qaRewriteDraft OpenAI:', e.message); }

  try {
    const raw = await geminiGenerate(`${systemSuffix}\n\n${context}\n\nProduce the corrected draft. Return ONLY valid JSON:\n${schema}`, true);
    const parsed = safeJSON(raw);
    if (parsed?.corrected_text) {
      return {
        text: parsed.corrected_text,
        adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
        adjustments_count: Array.isArray(parsed.adjustments) ? parsed.adjustments.length : 0,
      };
    }
  } catch (e) { console.error('qaRewriteDraft Gemini:', e.message); }

  // Unrecoverable — return the original text untouched rather than present
  // something half-done or fabricated.
  return { text: draftText, adjustments: [], adjustments_count: 0 };
}

// Convenience: detect + rewrite in sequence. Returns { text, adjustments,
// adjustments_count } where text is the corrected draft ready to present.
// Falls back to the original text if either stage fails — never blocks.
async function qaFinaliseDraft(args) {
  try {
    const detected = await qaDetectIssues(args);
    const issues = (detected?.issues || []).filter(Boolean);
    if (issues.length === 0) {
      return { text: args.draftText, adjustments: [], adjustments_count: 0 };
    }
    const rewritten = await qaRewriteDraft({ ...args, issues });
    return rewritten || { text: args.draftText, adjustments: [], adjustments_count: 0 };
  } catch (e) {
    console.error('qaFinaliseDraft failed:', e.message);
    return { text: args.draftText, adjustments: [], adjustments_count: 0 };
  }
}

// ── REQUIREMENTS COVERAGE CHECK ──────────────────────────────────────────
// Post-generation sense check: takes the draft proposal and the extracted
// RFP requirements, and checks every MUST and SHOULD is explicitly addressed.
// Returns a structured report the UI shows as a coverage checklist.
// OpenAI only — needs strong instruction-following for the line-by-line match.
async function checkRequirementsCoverage(proposalText, rfpData) {
  if (!hasOpenAI()) return null;
  if (!proposalText || !rfpData?.requirements?.length) return null;

  const requirements = (rfpData.requirements || []).map((r, i) => ({
    id: r.id || `REQ-${i + 1}`,
    text: r.text || '',
    priority: r.priority || 'should',
    section: r.section || 'Other',
  }));

  const implicitReqs = (rfpData.implicit_requirements || []).slice(0, 8).map((r, i) => ({
    id: `IMP-${i + 1}`,
    text: r.text || '',
    priority: r.priority || 'should',
  }));

  const allReqs = [...requirements, ...implicitReqs];

  const reqList = allReqs.map(r =>
    `[${r.id}] [${r.priority.toUpperCase()}] ${r.section ? r.section + ': ' : ''}${r.text}`
  ).join('\n');

  const systemSuffix = `You are a procurement evaluator checking whether a proposal response addresses every requirement from the RFP.

YOUR JOB: for each requirement, determine whether the proposal draft explicitly addresses it, partially addresses it, or misses it entirely.

Be STRICT on MUST requirements — if the proposal doesn't explicitly demonstrate compliance, mark it as missed regardless of how well written it is.

Be FAIR on SHOULD requirements — partial coverage counts if the proposal clearly acknowledges the topic even without deep detail.`;

  const schema = `{
  "coverage_summary": {
    "total_requirements": 0,
    "fully_addressed": 0,
    "partially_addressed": 0,
    "missed": 0,
    "coverage_percentage": 85
  },
  "requirements": [
    {
      "id": "REQ-001",
      "priority": "must",
      "text": "the requirement text",
      "status": "addressed | partial | missed",
      "where_addressed": "section name where this is addressed, or null",
      "note": "brief note on what's covered or what's missing"
    }
  ],
  "critical_gaps": ["list of MUST requirements that are missed — these would lose marks"],
  "improvement_suggestions": ["2-3 specific suggestions for what to add to improve coverage"]
}`;

  const userPrompt = `═══════════════════════════════════════════════════════════════════════════
RFP REQUIREMENTS TO CHECK AGAINST
═══════════════════════════════════════════════════════════════════════════
${reqList}

═══════════════════════════════════════════════════════════════════════════
PROPOSAL DRAFT TO CHECK
═══════════════════════════════════════════════════════════════════════════
${proposalText.slice(0, 12000)}

═══════════════════════════════════════════════════════════════════════════
TASK: Check every requirement above against the proposal. Return JSON.
═══════════════════════════════════════════════════════════════════════════
${schema}`;

  try {
    const raw = await openaiGenerate(systemSuffix, userPrompt, 3000);
    return safeJSON(raw);
  } catch (e) {
    console.error('checkRequirementsCoverage:', e.message);
    return null;
  }
}

// ── WRITING STYLE CONFORMANCE ────────────────────────────────────────────
// Takes the generated proposal and rewrites it to match the writing style,
// tone, and voice from the user's best won proposals. Uses the style
// classification + standout sentences from the top matched proposals as
// the style reference, then does a full rewrite pass.
//
// OpenAI only — the style transfer task needs the strongest model available.
// Returns the rewritten proposal as plain text (not JSON).
async function conformToWritingStyle(proposalText, styleReference, rfpData) {
  if (!hasOpenAI()) return proposalText;
  if (!proposalText || !styleReference) return proposalText;

  const systemSuffix = `You are a senior proposal editor. Your ONLY job is to rewrite this proposal draft so its writing style, tone, sentence structure, and voice match the reference style samples provided.

═══════════════════════════════════════════════════════════════════════════
WHAT YOU ARE DOING
═══════════════════════════════════════════════════════════════════════════
  ✓ Matching sentence length and structure patterns
  ✓ Matching formality level
  ✓ Matching how evidence is introduced
  ✓ Matching how claims are structured
  ✓ Matching opening/closing patterns per section
  ✓ Preserving all factual content, [#N] citations, and [EVIDENCE NEEDED] markers

═══════════════════════════════════════════════════════════════════════════
WHAT YOU ARE NOT DOING
═══════════════════════════════════════════════════════════════════════════
  ❌ Changing the substance, facts, or arguments
  ❌ Removing or adding sections
  ❌ Changing the strategic positioning
  ❌ Removing [#N] or [EVIDENCE NEEDED] markers
  ❌ Making it longer or shorter (same approximate word count)
  ❌ Adding filler or generic language

Output the COMPLETE rewritten proposal. All sections, all headers, same structure. Just different voice.`;

  const userPrompt = `═══════════════════════════════════════════════════════════════════════════
STYLE REFERENCE — match this voice
═══════════════════════════════════════════════════════════════════════════
${styleReference}

═══════════════════════════════════════════════════════════════════════════
CLIENT CONTEXT (for tone calibration)
═══════════════════════════════════════════════════════════════════════════
Client: ${rfpData?.client || 'Unknown'} | Sector: ${rfpData?.sector || 'Unknown'}

═══════════════════════════════════════════════════════════════════════════
PROPOSAL TO REWRITE IN THE ABOVE STYLE
═══════════════════════════════════════════════════════════════════════════
${proposalText}

═══════════════════════════════════════════════════════════════════════════
Rewrite the proposal now. Same content, same structure, matched voice.
Output ONLY the rewritten proposal text with ## section headers.
═══════════════════════════════════════════════════════════════════════════`;

  try {
    const raw = await openaiGenerateText(systemSuffix, userPrompt, 8000);
    if (raw && raw.trim().length > 500) return raw.trim();
  } catch (e) {
    console.error('conformToWritingStyle:', e.message);
  }

  return proposalText; // Fallback: return the original if rewrite fails
}

module.exports = {
  embed,
  analyseProposal,
  extractRFPData,
  analyseGaps,
  generateWinStrategy,
  extractWinningLanguage,
  explainMatch,
  getIndustryNews,
  getNarrativeAdvice,
  prescanDocument,
  analyseCv,
  analyseWinPatterns,
  generateInsightPlaybook,
  generateApproachAndBudget,
  scoreBid,
  reRankProposals,
  classifyWritingStyle,
  analyseEvidenceDensity,
  extractProposalStructure,
  adaptWinningLanguage,
  generateSectionDraft,
  generateExecutiveBidBrief,
  extractOrganisationProfile,
  sanityCheckTopMatches,
  generateFullProposal,
  checkRequirementsCoverage,
  conformToWritingStyle,
  qaDetectIssues,
  qaRewriteDraft,
  qaFinaliseDraft,
  extractPricingFromImages,
  hasOpenAI,
  setCostContext,
};
