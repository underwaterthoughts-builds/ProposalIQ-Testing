// AI client — dual model routing
// Gemini 2.5 Flash : embeddings, prescan, narrative advice, industry news
// OpenAI           : all deep analysis tasks (with Gemini fallback)

const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai').default || require('openai');

// ── GEMINI SETUP ──────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
].filter(Boolean);

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

async function geminiGenerate(prompt, json = false) {
  let lastErr;
  for (const m of GEMINI_MODELS) {
    try {
      const cfg = json ? { responseMimeType: 'application/json' } : {};
      const model = geminiClient().getGenerativeModel({ model: m, generationConfig: cfg });
      const r = await model.generateContent(prompt);
      return r.response.text();
    } catch (e) {
      lastErr = e;
      const msg = e.message || '';
      if (msg.includes('not found') || msg.includes('404') || msg.includes('INVALID_ARGUMENT')) continue;
      throw e;
    }
  }
  throw lastErr || new Error('No Gemini model available');
}

// ── OPENAI SETUP ──────────────────────────────────────────────────────────────
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';

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

async function openaiGenerate(systemSuffix, userPrompt, maxTokens = 4000) {
  const client = openaiClient();
  const system = systemSuffix ? `${MASTER_SYSTEM}\n\n${systemSuffix}` : MASTER_SYSTEM;
  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  });
  return res.choices[0].message.content || '{}';
}

// ── SHARED HELPERS ────────────────────────────────────────────────────────────
function safeJSON(text) {
  const c = (text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(c); } catch {
    const m = c.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
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
  const ratingContext = rating >= 4 ? 'This is a HIGH-PERFORMING proposal (rated 4-5 stars). Identify what makes it excellent.' :
                        rating <= 2 ? 'This is a LOW-PERFORMING proposal (rated 1-2 stars). Identify specifically why it underperforms.' :
                        'This is an average-performing proposal.';

  const defaultSuffix = `You are analysing a proposal document to extract reusable winning intelligence.
${ratingContext}
User notes: "${userNotes || 'none'}"

Your goal is NOT to summarise the document. Your goal is to extract what makes this proposal effective or ineffective at winning work.

REJECTION CRITERIA — do not include anything that is:
- Generic (could apply to any company or proposal)
- Vague (no specific evidence, metric, or example)
- Filler language ("proven track record", "dedicated team", "delivering value")

When scoring, be calibrated:
- 80-100: Specific, evidence-rich, client-focused, differentiated
- 60-79: Reasonably specific but some vague claims
- 40-59: Mostly generic with occasional specific points
- Below 40: Generic throughout, lacks evidence`;
  const systemSuffix = getCustomPrompt('proposal_analysis', defaultSuffix);

  const schema = `{
  "executive_summary": "2-3 sentence summary of what this proposal actually does — be specific about the client, problem, and solution",
  "key_themes": ["max 6 specific themes — not generic like 'innovation' but specific like 'NHS Spine API integration'"],
  "deliverables": ["concrete named deliverables with specifics"],
  "methodologies": ["named methodologies — PRINCE2, SAFe, etc"],
  "tools_technologies": ["specific tools and platforms named in the document"],
  "client_pain_points": ["specific client problems this addresses — not generic"],
  "value_propositions": ["specific value claims backed by evidence — reject generic ones"],
  "industry_context": "one sentence on the specific sector context",
  "writing_quality": {
    "overall_score": 75,
    "tone": "executive|technical|narrative|commercial|generic",
    "tone_notes": "one specific sentence — cite actual examples from the text",
    "specificity_score": 70,
    "specificity_notes": "cite specific examples of strong or weak specificity",
    "evidence_density": 65,
    "evidence_notes": "how many named clients, metrics, statistics vs vague assertions?",
    "client_language_mirroring": 80,
    "client_language_notes": "does it use the client's own terminology and framing?",
    "executive_summary_effectiveness": 70,
    "exec_summary_notes": "does it lead with outcome or capability? is it client-focused?",
    "strengths": ["specific writing strength — cite the actual language"],
    "weaknesses": ["specific writing weakness — cite the actual language"]
  },
  "approach_quality": {
    "overall_score": 70,
    "methodology_clarity": 75,
    "methodology_notes": "is there a named, structured methodology or is it vague?",
    "phasing_logic": 65,
    "phasing_notes": "are there clear phases with rationale or just a list of activities?",
    "risk_acknowledgement": 60,
    "risk_notes": "does it name specific risks and mitigations or ignore them?",
    "innovation_evidence": 55,
    "innovation_notes": "fresh thinking specific to this client or boilerplate?",
    "strengths": ["specific approach strength with evidence"],
    "weaknesses": ["specific approach weakness with evidence"]
  },
  "credibility_signals": {
    "overall_score": 70,
    "named_past_work": true,
    "named_past_work_notes": "which specific past projects are named? are they relevant?",
    "team_credibility": 65,
    "team_notes": "are specific named individuals with relevant credentials cited?",
    "social_proof": 60,
    "social_proof_notes": "specific client quotes, named outcomes, quantified statistics?",
    "differentiator_strength": 55,
    "differentiator_notes": "what genuinely differentiates this from a generic proposal?",
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
  "standout_sentences": ["1-3 strongest sentences quoted exactly from the document"]
}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `Document:\n${docText}\n\nReturn ONLY valid JSON:\n${schema}`, 5000);
      const parsed = safeJSON(raw);
      if (parsed?.executive_summary) return parsed;
    }
  } catch (e) {
    console.error('OpenAI analyseProposal failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `You are a senior bid strategist. Analyse this proposal to extract winning intelligence. Return ONLY valid JSON.\n\n${systemSuffix}\n\nDocument:\n${docText}\n\nSchema:\n${schema}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed?.executive_summary) return parsed;
  } catch (e) {
    console.error('analyseProposal Gemini fallback failed:', e.message);
  }

  return fallbackMeta('', '', '');
}

// ── RFP EXTRACTION ────────────────────────────────────────────────────────────
async function extractRFPData(text) {
  const docText = text; // Full document

  const systemSuffix = `You are a procurement analyst and bid strategist extracting requirements from an RFP.

Your goal is to identify EVERYTHING that will be evaluated — including implicit expectations that are not explicitly stated.

Be exhaustive. A missed requirement is a lost evaluation criterion.
Classify each requirement honestly:
- MUST: failure to address = disqualification
- SHOULD: important for scoring, expected by evaluators
- COULD: differentiating factor, not mandatory`;

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
  "procurement_framework": "framework or vehicle if stated"
}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `RFP Document:\n${docText}\n\nExtract ALL requirements including implicit ones.\n\nReturn ONLY valid JSON:\n${schema}`, 5000);
      const parsed = safeJSON(raw);
      if (parsed?.requirements) {
        parsed.requirements = parsed.requirements.map(r => ({
          ...r, priority: r.priority || 'should', section: r.section || 'Other',
        }));
        return parsed;
      }
    }
  } catch (e) {
    console.error('OpenAI extractRFPData failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `You are a procurement analyst. Extract all requirements from this RFP — including implicit ones. Return ONLY valid JSON.\n\nSchema:\n${schema}\n\nDocument:\n${docText}`;
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (parsed) {
      if (parsed.requirements) {
        parsed.requirements = parsed.requirements.map(r => ({
          ...r, priority: r.priority || 'should', section: r.section || 'Other',
        }));
      }
      return parsed;
    }
  } catch (e) {
    console.error('extractRFPData Gemini fallback failed:', e.message);
  }

  return { title: 'Untitled RFP', client: 'Unknown', sector: 'Unknown', key_themes: [], requirements: [], implicit_requirements: [], evaluation_criteria: [], evaluation_logic: [], hidden_expectations: [], contract_value_hint: '', deadline: '' };
}

// ── GAP ANALYSIS ──────────────────────────────────────────────────────────────
async function analyseGaps(rfpData, matchedProposals, teamMembers) {
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

  const defaultGapSuffix = `You are a senior bid consultant identifying material gaps between the RFP requirements and what the matched proposals actually demonstrate.

Your goal is not to list everything missing. Your goal is to identify the gaps that would materially affect the probability of winning.

A gap is only a true gap if one of the following is true:
- the RFP explicitly requires it and the matched evidence does not address it
- evaluators are likely to expect it and the current evidence is weak, indirect, or absent
- it is a common bid-winning factor in this type of procurement and the current evidence is not credible enough

Prioritisation rules:
- MUST gaps come first
- then high-scoring SHOULD gaps
- then differentiating COULD gaps only if genuinely useful
- do not include trivial, cosmetic, or generic gaps

Types of gap to check: technical capability, delivery methodology, team credibility, sector/client relevance, measurable outcomes, case study evidence, risk/governance/compliance, sustainability/ESG/social value, commercial clarity, implementation realism, stakeholder/change management, local presence where relevant.

Be discriminating: do not list more than the truly important gaps. Merge overlapping gaps. If evidence is partial rather than absent, say "weak evidence" not "missing".`;
  const systemSuffix = getCustomPrompt('gap_analysis', defaultGapSuffix);

  const schema = `{
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

  const context = `RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})

Explicit Requirements:
${reqs}

${implicitReqs ? `Implicit Requirements:\n${implicitReqs}\n` : ''}
Matched Proposals (ranked by relevance):
${topMatches}

Team Available:
${teamNames}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nIdentify 5-8 genuine, specific gaps. Do not include generic gaps.\n\nReturn ONLY valid JSON:\n${schema}`);
      const parsed = safeJSON(raw);
      if (parsed?.gaps) return parsed.gaps;
    }
  } catch (e) {
    console.error('OpenAI analyseGaps failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `You are a senior bid consultant. Identify specific gaps between this RFP and matched proposals. Return ONLY valid JSON.\n\nSchema:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw)?.gaps || [];
  } catch (e) {
    console.error('analyseGaps Gemini fallback failed:', e.message);
    return [];
  }
}

// ── WIN STRATEGY GENERATOR ────────────────────────────────────────────────────
async function generateWinStrategy(rfpData, matchedProposals, gaps) {
  const wonMatches = matchedProposals.filter(p => p.outcome === 'won').slice(0, 4);
  const topGaps = (gaps || []).filter(g => g.priority === 'high').slice(0, 5);

  const wonContext = wonMatches.map(p => {
    const meta = p.ai_metadata || {};
    return `- "${p.name}" (WON, ${p.user_rating}★): ${(meta.key_themes || []).join(', ')} | win indicators: ${(meta.win_indicators || []).slice(0, 2).join('; ')}`;
  }).join('\n') || 'No won proposals in repository for this sector';

  const defaultWinSuffix = `You are a senior bid strategist advising how to win this specific RFP.

Do not give generic advice. Do not produce motivational language. Do not restate the brief.

Your job is to decide:
- what the bid should lead with
- what will matter most to evaluators
- what risks must be neutralised
- what proof should appear early
- what should be deprioritised or excluded

Be explicit about tradeoffs:
- where the team should spend effort
- where the team should not waste time
- what kind of tone and framing will help most

Output a winning thesis — one clear statement of how this bid should position itself — then priorities, risks, what to emphasise, what to avoid, and a suggested 3–5 sentence strategic opener.`;
  const systemSuffix = getCustomPrompt('win_strategy', defaultWinSuffix);

  const schema = `{
  "priorities": [
    {
      "priority": "specific priority — what to do",
      "rationale": "why this matters for this specific RFP",
      "evidence": "which matched proposal or gap supports this"
    }
  ],
  "risks": [
    {
      "risk": "specific risk to mitigate",
      "mitigation": "how to address it in the proposal"
    }
  ],
  "focus": ["specific things to emphasise — not generic, tied to this client and sector"],
  "avoid": ["specific things to avoid — generic language, approaches that lost similar bids"],
  "opening_narrative": "2-3 sentence recommended opening for the executive summary — specific to this client and RFP, not generic",
  "differentiator_angle": "the single strongest differentiating angle to take in this proposal based on the matched won proposals"
}`;

  const context = `RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})
Key themes: ${(rfpData.key_themes || []).join(', ')}
Evaluation logic: ${(rfpData.evaluation_logic || []).join('; ') || 'not extracted'}

Won proposals from similar work:
${wonContext}

High-priority gaps to address:
${topGaps.map(g => `- [${g.priority.toUpperCase()}] ${g.title}: ${g.description}`).join('\n') || 'None identified'}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nProvide a specific win strategy for this bid.\n\nReturn ONLY valid JSON:\n${schema}`);
      const parsed = safeJSON(raw);
      if (parsed?.priorities) return parsed;
    }
  } catch (e) {
    console.error('OpenAI generateWinStrategy failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `You are a senior bid strategist. Provide a specific win strategy for this RFP based on matched won proposals. Return ONLY valid JSON.\n\nSchema:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw);
  } catch (e) {
    console.error('generateWinStrategy Gemini fallback:', e.message);
    return null;
  }
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

ONLY extract language that meets ALL of these criteria:
- specific
- persuasive
- structurally clear
- strategically useful
- adaptable to other contexts

REJECT anything that is: vague, generic, filler, self-congratulatory, dependent on highly specific facts that make it non-transferable, or impressive sounding but commercially empty.

Prioritise language that: reframes the challenge sharply, states a differentiated approach, links capability to client value, introduces evidence credibly, gives structure to the proposal, or closes with clarity and confidence.

For each line: provide the original text, its likely use case, why it works, what type of client/bid it suits, and how reusable it is (high/medium/low).

Do not over-extract. Better 5 strong lines than 20 mediocre ones.`;
  const systemSuffix = getCustomPrompt('winning_language', defaultLangSuffix);

  const schema = `{
  "snippets": [
    {
      "text": "the exact sentence or phrase",
      "source_proposal": "proposal name it came from",
      "use_case": "executive summary|approach section|credibility|risk|value proposition|methodology",
      "why_it_works": "specific reason — what makes it effective: evidence, specificity, client-focus, structure",
      "adaptation_note": "how to adapt this for a different context or client"
    }
  ]
}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `High-performing proposals:\n\n${context}\n\nExtract reusable winning language. Reject anything generic.\n\nReturn ONLY valid JSON:\n${schema}`);
      const parsed = safeJSON(raw);
      return parsed?.snippets || [];
    }
  } catch (e) {
    console.error('OpenAI extractWinningLanguage failed:', e.message);
  }

  try {
    const prompt = `Extract reusable winning language from these high-performing proposals. Reject generic content. Return ONLY valid JSON.\n\nSchema:\n${schema}\n\n${context}`;
    const raw = await geminiGenerate(prompt, true);
    return safeJSON(raw)?.snippets || [];
  } catch (e) {
    return [];
  }
}

// ── MATCH EXPLANATION ─────────────────────────────────────────────────────────
// Why a specific past proposal is relevant to this RFP (trust layer for matches)
async function explainMatch(rfpData, proposal) {
  const meta = proposal.ai_metadata || {};
  const systemSuffix = `You are explaining why a past proposal is or isn't relevant to a new RFP.
Be precise and honest. If the match is weak, say so and explain what aspects are relevant.
This explanation is shown to the user to help them decide whether to reference this proposal.`;

  const schema = `{
  "relevance_score": 85,
  "industry_overlap": "specific sentence on industry/sector overlap",
  "problem_similarity": "specific sentence on whether the problems are similar",
  "deliverable_similarity": "specific sentence on deliverable overlap",
  "approach_transferability": "specific sentence on whether the approach would transfer",
  "strong_for": ["specific aspects of the past proposal that are directly relevant"],
  "not_relevant_for": ["specific aspects that do NOT transfer — be honest"],
  "recommended_use": "how to use this proposal — what to take from it and what to ignore"
}`;

  const context = `New RFP: ${rfpData.title} for ${rfpData.client} (${rfpData.sector})
RFP themes: ${(rfpData.key_themes || []).join(', ')}

Past proposal: "${proposal.name}" (${proposal.outcome}, ${proposal.user_rating}★, ${proposal.sector})
Past themes: ${(meta.key_themes || []).join(', ')}
Past deliverables: ${(meta.deliverables || []).join(', ')}
Past win indicators: ${(meta.win_indicators || []).join('; ')}`;

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

// ── INDUSTRY NEWS (Gemini — contextual generation) ───────────────────────────
async function getIndustryNews(sector, themes, clientOrg) {
  // Only return real news from Brave Search — no AI-generated fake news
  if (!process.env.BRAVE_SEARCH_KEY) {
    console.log('BRAVE_SEARCH_KEY not set — news tab will be empty');
    return [];
  }

  // Build targeted search queries
  const themeStr = (themes || []).slice(0, 3).join(' ');
  const clientStr = (clientOrg && clientOrg !== 'Unknown') ? clientOrg + ' ' : '';
  const queries = [
    `${clientStr}${sector} ${themeStr}`,
    `${sector} ${themeStr} news`,
    `${themeStr} industry`,
  ].filter(Boolean).slice(0, 3);

  let searchResults = [];
  try {
    for (const query of queries) {
      try {
        const encoded = encodeURIComponent(query);
        // freshness=pm = past month; use pw (past week) or py (past year) if needed
        // Using 6-month window via py (past year) and filtering below
        const url = `https://api.search.brave.com/res/v1/news/search?q=${encoded}&count=6&freshness=pm6`;
        const resp = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY,
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) {
          console.error('Brave news error:', resp.status, await resp.text().catch(()=>''));
          continue;
        }
        const d = await resp.json();
        const items = (d.results || []).map(item => {
          let source = '';
          try { source = item.meta_url?.hostname || new URL(item.url).hostname; } catch { source = item.source || ''; }
          return {
            title: item.title || '',
            url: item.url || '',
            source: source.replace(/^www\./, ''),
            date: item.age || item.page_age || 'Recent',
            snippet: item.description || item.extra_snippets?.[0] || '',
            raw_age: item.age || '',
          };
        }).filter(item => item.title && item.url);
        searchResults.push(...items);
      } catch (e) {
        console.error('Brave query failed:', query, e.message);
      }
    }
  } catch (e) {
    console.error('getIndustryNews search error:', e.message);
    return [];
  }

  if (!searchResults.length) return [];

  // Deduplicate by URL
  const seen = new Set();
  searchResults = searchResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url); return true;
  });

  // Use Gemini to score relevance and add "why it matters" — pass exact titles and URLs
  const resultsText = searchResults.slice(0, 12).map((r, i) => `${i+1}. TITLE: ${r.title} | SOURCE: ${r.source} | DATE: ${r.date} | URL: ${r.url} | SNIPPET: ${r.snippet}`).join(' /// ');

  const prompt = `You are a bid intelligence analyst. From these real news articles, select the 6 most relevant to this specific bid and explain why each matters.

Bid context — Sector: ${sector} | Client: ${clientOrg} | Themes: ${(themes||[]).join(', ')}

Articles: ${resultsText}

CRITICAL RULES:
- Return ONLY articles from the list above — never invent titles or URLs
- Copy TITLE and URL character-for-character — do not paraphrase or shorten
- Only include articles that are genuinely relevant to the bid context
- If fewer than 6 are relevant, return only the relevant ones

Return ONLY valid JSON:
{"news":[{"title":"EXACT title copied from above","url":"EXACT url copied from above","source":"source name","date":"date as given","snippet":"1-2 sentence summary","relevance_score":85,"why_it_matters":"one sentence on how this affects the proposal strategy"}]}`;

  try {
    const raw = await geminiGenerate(prompt, true);
    const parsed = safeJSON(raw);
    if (!parsed?.news?.length) return searchResults.slice(0, 6).map(r => ({ ...r, relevance_score: 70, why_it_matters: '' }));

    // Validate URLs exist in our original results to prevent hallucination
    const validUrls = new Set(searchResults.map(r => r.url));
    const validated = parsed.news.filter(n => n.url && (validUrls.has(n.url) || searchResults.some(r => n.title && r.title && r.title.toLowerCase().includes(n.title.toLowerCase().slice(0,20)))));

    return validated.length > 0 ? validated : searchResults.slice(0, 6).map(r => ({ ...r, relevance_score: 70, why_it_matters: '' }));
  } catch (e) {
    console.error('News relevance assessment failed:', e.message);
    return searchResults.slice(0, 6).map(r => ({ ...r, relevance_score: 70, why_it_matters: '' }));
  }
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
// Converts PDF pages to images and sends to gpt-5.4-nano vision.
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

    const client = openaiClient();
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-5.4-nano',
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
    });

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
async function analyseWinPatterns(wonProjects, lostProjects) {
  if (!wonProjects.length) return null;

  const summarise = (projects) => projects.slice(0, 8).map(p => {
    const meta = p.ai_metadata || {};
    const wq = meta.writing_quality || {};
    const aq = meta.approach_quality || {};
    const cq = meta.credibility_signals || {};
    return `- "${p.name}" (${p.sector}, £${((p.contract_value || 0) / 1000).toFixed(0)}K): writing=${wq.overall_score || '?'}/100, approach=${aq.overall_score || '?'}/100, credibility=${cq.overall_score || '?'}/100 | themes: ${(meta.key_themes || []).slice(0, 4).join(', ')} | win indicators: ${(meta.win_indicators || []).slice(0, 2).join('; ')}`;
  }).join('\n');

  const systemSuffix = `You are a bid analytics consultant identifying statistically meaningful patterns between won and lost proposals.

Be specific — cite actual score differences, theme patterns, and sector observations.
Do not state the obvious. Only identify patterns that would change what a bid team does.
Every finding must be actionable.`;

  const schema = `{
  "win_factors": [{ "factor": "specific measurable factor", "impact": "+28%", "explanation": "one sentence with evidence" }],
  "loss_factors": [{ "factor": "specific measurable factor", "impact": "-22%", "explanation": "one sentence with evidence" }],
  "writing_insight": "one specific, actionable insight about writing quality differences — not generic",
  "approach_insight": "one specific, actionable insight about approach differences",
  "credibility_insight": "one specific, actionable insight about credibility signal differences",
  "avg_won_writing_score": 75,
  "avg_lost_writing_score": 58,
  "avg_won_approach_score": 72,
  "avg_lost_approach_score": 54,
  "top_recommendation": "the single highest-impact action to improve win rate — specific, not generic"
}`;

  const context = `WON PROPOSALS (${wonProjects.length} total, showing up to 8):\n${summarise(wonProjects)}\n\nLOST PROPOSALS (${lostProjects.length} total, showing up to 8):\n${summarise(lostProjects)}`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemSuffix, `${context}\n\nIdentify genuine patterns. Be specific.\n\nReturn ONLY valid JSON:\n${schema}`);
      const parsed = safeJSON(raw);
      if (parsed?.top_recommendation) return parsed;
    }
  } catch (e) {
    console.error('OpenAI analyseWinPatterns failed, falling back to Gemini:', e.message);
  }

  try {
    const prompt = `Analyse these won and lost proposals for specific, actionable patterns. Return ONLY valid JSON:\n${schema}\n\n${context}`;
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

  const context = `RFP: ${rfpData.title || 'Untitled'} for ${rfpData.client || 'Unknown'} (${rfpData.sector || 'Unknown sector'})
Key themes: ${(rfpData.key_themes || []).join(', ') || 'not extracted'}
Evaluation logic: ${(rfpData.evaluation_logic || []).join('; ') || 'not extracted'}

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

  const context = `Proposal: "${proposal.name}" (${proposal.outcome}, ${proposal.sector})
Writing quality score: ${meta.writing_quality?.overall_score || '?'}/100

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

Be precise: call out where evidence is strong, call out where the proposal sounds persuasive but is actually thin, distinguish between "good writing" and "good proof", and identify the single highest-impact improvement.`);

  const schema = `{
  "evidence_score": 72,
  "claim_to_evidence_ratio": "e.g. 60% claims backed by evidence, 40% unsupported assertions",
  "evidence_types_found": ["named past clients", "quantified outcomes", "specific methodologies", "certifications", "named team credentials"],
  "strongest_evidence": "the single most persuasive piece of evidence in the proposal",
  "weakest_claims": ["2-3 specific claims that are made without evidence"],
  "evidence_pattern": "one of: front-loaded | distributed | back-loaded | sparse",
  "credibility_verdict": "2 sentences: overall credibility assessment and main weakness",
  "improvement_priority": "the single highest-impact evidence gap to fill"
}`;

  const context = `Proposal: "${proposal.name}" (${proposal.outcome}, ${proposal.user_rating}★)
Credibility score: ${meta.credibility_signals?.overall_score || '?'}/100
Named past work: ${meta.credibility_signals?.named_past_work ? 'yes' : 'no'}
Quantified outcomes: ${meta.credibility_signals?.quantified_outcomes ? 'yes' : 'no'}

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
// Generates actual draft content for a proposal section using matched proposals
async function generateSectionDraft(sectionName, rfpData, matchedProposals, winStrategy, winningLanguage) {
  const wonMatches = matchedProposals.filter(p => p.outcome === 'won').slice(0, 3);
  const topMatch = wonMatches[0] || matchedProposals[0];

  const matchContext = wonMatches.map(p => {
    const meta = p.ai_metadata || {};
    return `"${p.name}" (${p.outcome}): ${meta.executive_summary || p.description || ''} | Key themes: ${(meta.key_themes || []).join(', ')}`;
  }).join('\n');

  const langContext = (winningLanguage || []).slice(0, 4).map(s =>
    `USE CASE: ${s.use_case} — "${s.adapted || s.text}"`
  ).join('\n');

  const systemPrompt = `You are a senior proposal writer generating first-draft content for the "${sectionName}" section.

Rules:
- Write in first person plural (we/our)
- Be specific to this client and RFP — no generic filler
- Reference the matched won proposals as evidence of experience
- Use the winning language snippets as inspiration — adapt, don't copy
- Keep it concise — aim for 150-250 words unless the section requires more
- Leave [EVIDENCE NEEDED] markers where specific data should be inserted by the writer
- Write prose, not bullet points, unless the section is naturally a list`;

  const userPrompt = `Write the "${sectionName}" section for this proposal.

Client: ${rfpData.client || 'Unknown'} | Sector: ${rfpData.sector || 'Unknown'}
Brief themes: ${(rfpData.key_themes || []).join(', ')}
Winning thesis: ${winStrategy?.winning_thesis || winStrategy?.opening_narrative || 'Not available'}

Best matched past work:
${matchContext || 'No matches available'}

Winning language to draw from:
${langContext || 'No language extracted'}

Write the section now. Return only the draft text, no headings, no commentary.`;

  try {
    if (hasOpenAI()) {
      const raw = await openaiGenerate(systemPrompt, userPrompt, 600);
      return raw.trim();
    }
  } catch (e) { console.error('generateSectionDraft OpenAI:', e.message); }

  try {
    const raw = await geminiGenerate(`${systemPrompt}\n\n${userPrompt}`, false);
    return raw.trim();
  } catch { return null; }
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
  generateApproachAndBudget,
  scoreBid,
  reRankProposals,
  classifyWritingStyle,
  analyseEvidenceDensity,
  extractProposalStructure,
  adaptWinningLanguage,
  generateSectionDraft,
  extractPricingFromImages,
  hasOpenAI,
};
