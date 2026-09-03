// Client-side Markdown export for the Intelligence Workbench.
//
// Serialises the workbench's CURRENT state — the "final state as of
// clicking the button": covered risks and their bid-score re-weighting,
// suppressed matches already filtered out, corrected taxonomy, partner/CV
// bid team, annotations, and (for the full summary) accepted section
// drafts and the saved full proposal fetched fresh at export time.
//
// Everything renders to portable Markdown so the output can be pasted or
// imported into any other platform.

function line(s = '') { return s + '\n'; }

function fmtVal(v, depth = 0) {
  const pad = '  '.repeat(depth);
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') return pad + v.trim() + '\n';
  if (typeof v === 'number' || typeof v === 'boolean') return pad + String(v) + '\n';
  if (Array.isArray(v)) {
    let out = '';
    for (const item of v) {
      if (item === null || item === undefined) continue;
      if (typeof item === 'object') out += pad + '-\n' + fmtVal(item, depth + 1);
      else out += pad + '- ' + String(item) + '\n';
    }
    return out;
  }
  if (typeof v === 'object') {
    let out = '';
    for (const [k, val] of Object.entries(v)) {
      if (val === null || val === undefined || val === '') continue;
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (typeof val === 'object') out += pad + `- **${label}:**\n` + fmtVal(val, depth + 1);
      else out += pad + `- **${label}:** ${val}\n`;
    }
    return out;
  }
  return pad + String(v) + '\n';
}

function header(ctx) {
  const { scan, bidScore } = ctx;
  let s = '';
  s += line(`# ${scan.name} — Intelligence Workbench Export`);
  s += line();
  s += line(`**Exported:** ${new Date().toLocaleString('en-GB')} · **Analysed:** ${scan.created_at} · **Engine:** ${scan.analysis_model === 'gpt' ? 'OpenAI' : 'Gemini'} (ProposalIQ)`);
  if (bidScore?.score != null) {
    s += line(`**Bid verdict:** ${bidScore.score}/100 — ${bidScore.decision || ''} (${bidScore.confidence || 'n/a'} confidence)`);
    if (bidScore.covered_bonus) s += line(`_Score includes +${bidScore.covered_bonus} adjustment from risks you marked as covered._`);
  }
  const partners = scan.bid_partners || [];
  const cvs = scan.bid_cvs || [];
  if (partners.length || cvs.length) {
    s += line(`**Bid team:** ${[...partners.map(p => p.name), ...cvs.map(c => '📄 ' + (c.person_name || c.original_name))].join(' · ')}`);
  }
  s += line();
  return s;
}

// ── Per-section builders ────────────────────────────────────────────────────

const SECTION_BUILDERS = {
  brief(ctx) {
    const eb = ctx.executiveBrief || {};
    let s = line('## Executive Brief') + line();
    if (ctx.bidScore) {
      s += line('### Bid Score');
      s += fmtVal({
        score: ctx.bidScore.score, decision: ctx.bidScore.decision,
        confidence: ctx.bidScore.confidence, components: ctx.bidScore.components,
        rationale: ctx.bidScore.rationale, conditions: ctx.bidScore.conditions,
        covered_risk_bonus: ctx.bidScore.covered_bonus || 0,
      });
      s += line();
    }
    for (const [k, v] of Object.entries(eb)) {
      s += line(`### ${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
      s += fmtVal(v) + line();
    }
    const covered = ctx.scan.covered_risks || [];
    if (covered.length) {
      s += line('### Risks Marked as Covered (user-approved)');
      s += fmtVal(covered) + line();
    }
    return s;
  },

  matches(ctx) {
    const ms = ctx.matches || [];
    let s = line(`## Matched Proposals (${ms.length} — suppressed matches excluded)`) + line();
    s += line('| # | Proposal | Client | Score | Label | Outcome | Tier |');
    s += line('|---|---|---|---|---|---|---|');
    ms.forEach((m, i) => {
      s += line(`| ${i + 1} | ${m.name || ''} | ${m.client || ''} | ${m.match_score ?? ''} | ${m.match_label || ''} | ${m.outcome || ''} | ${m.taxonomy_match || ''} |`);
    });
    s += line();
    for (const m of ms.slice(0, 10)) {
      if (m.llm_reason) s += line(`- **${m.name}** — ${m.llm_reason}`);
    }
    return s + line();
  },

  gaps(ctx) {
    const gs = ctx.gaps || [];
    const covered = new Set((ctx.scan.covered_risks || []).map(r => (typeof r === 'string' ? r : r.risk || r.text || '')));
    let s = line(`## Opportunity Gaps (${gs.length})`) + line();
    gs.forEach((g, i) => {
      const title = g.title || g.gap || `Gap ${i + 1}`;
      const isCovered = [...covered].some(c => c && (title.includes(c) || c.includes(title)));
      s += line(`### ${i + 1}. ${title} — ${(g.priority || g.severity || '').toUpperCase()}${isCovered ? ' ✅ MARKED COVERED' : ''}`);
      s += fmtVal(Object.fromEntries(Object.entries(g).filter(([k]) => !['title', 'gap', 'priority', 'severity'].includes(k))));
      s += line();
    });
    return s;
  },

  writing(ctx) {
    return line('## Writing Insights') + line() + fmtVal(ctx.writingInsights || []) + line();
  },

  news(ctx) {
    return line('## Market Context') + line() + fmtVal(ctx.news || []) + line();
  },

  approach(ctx) {
    return line('## Suggested Approach & Budget') + line() + fmtVal(ctx.suggestedApproach || {}) + line();
  },

  team(ctx) {
    const ts = ctx.teamSuggestions || [];
    let s = line(`## Suggested Team (${ts.length})`) + line();
    s += line('| Name | Title | Fit | Day rate |') + line('|---|---|---|---|');
    ts.forEach(t => { s += line(`| ${t.name || ''} | ${t.title || ''} | ${t.fit_score ?? ''} | ${t.day_rate_client ?? ''} |`); });
    const cvs = ctx.scan.bid_cvs || [];
    if (cvs.length) {
      s += line() + line(`**Named CVs attached to this bid:** ${cvs.map(c => c.person_name || c.original_name).join(', ')}`);
    }
    return s + line();
  },

  strategy(ctx) {
    return line('## Win Strategy') + line() + fmtVal(ctx.winStrategy || {}) + line();
  },

  language(ctx) {
    const wl = ctx.winningLanguage || [];
    let s = line(`## Winning Language (${wl.length} snippets)`) + line();
    wl.forEach((x, i) => {
      s += line(`### Snippet ${i + 1} — from ${x.source_proposal || '?'} (${x.use_case || ''})`);
      s += line(`> "${x.text || ''}"`) + line();
      if (x.why_it_works) s += line(`**Why it works:** ${x.why_it_works}`);
      if (x.adaptation_note) s += line(`**How to adapt:** ${x.adaptation_note}`);
      s += line();
    });
    return s;
  },

  narrative(ctx) {
    const na = ctx.scan.narrative_advice;
    const obj = typeof na === 'string' ? { text: na } : (na || {});
    let s = line('## Narrative Advice') + line();
    if (obj.text) s += line(obj.text) + line();
    if (obj.proposal_structure) s += line('### Recommended Structure') + fmtVal(obj.proposal_structure) + line();
    return s;
  },

  plaintext(ctx) {
    return line('## RFP Plain Text') + line() + line('```') + line((ctx.scan.rfp_text || '').trim()) + line('```');
  },
};

// Assembly + proposal-fit need fresh fetches (their data lives in tab-local
// state, and "final state" means what's persisted right now).
async function buildAssemblySection(scanId) {
  let s = line('## Proposal Assembly — Section Drafts (current saved state)') + line();
  try {
    const d = await fetch(`/api/rfp/${scanId}/drafts`).then(r => r.json());
    const drafts = d.drafts || [];
    if (!drafts.length) s += line('_No section drafts generated._');
    for (const dr of drafts) {
      s += line(`### ${dr.section_title || dr.section_key} — status: ${(dr.status || 'draft').toUpperCase()}${dr.qa_adjustments_count ? ` · ${dr.qa_adjustments_count} QA adjustment(s) applied` : ''}`);
      s += line() + line(dr.draft_text || '_empty_') + line();
    }
  } catch (e) { s += line(`_Could not load drafts: ${e.message}_`); }
  try {
    const fp = await fetch(`/api/rfp/${scanId}/full-proposal`).then(r => r.ok ? r.json() : null);
    if (fp?.text) {
      s += line('### Full Assembled Proposal (saved)') + line() + line(fp.text) + line();
    }
  } catch {}
  return s;
}

async function buildFitSection(scanId) {
  let s = line('## Your Proposal — Fit Analysis') + line();
  try {
    const d = await fetch(`/api/rfp/${scanId}/proposal-fit`).then(r => r.ok ? r.json() : null);
    if (!d || (!d.overall && !(d.coverage || []).length)) return s + line('_No proposal attached / analysed._');
    if (d.overall) s += line(`**Overall fit:** ${typeof d.overall === 'object' ? JSON.stringify(d.overall) : d.overall}`) + line();
    s += fmtVal(d.coverage || d.map || d);
  } catch (e) { s += line(`_Could not load fit analysis: ${e.message}_`); }
  return s + line();
}

const SECTION_LABELS = {
  brief: 'Executive Brief', matches: 'Matched Proposals', gaps: 'Opportunity Gaps',
  writing: 'Writing Insights', news: 'Market Context', approach: 'Suggested Approach',
  team: 'Suggested Team', strategy: 'Win Strategy', language: 'Winning Language',
  narrative: 'Narrative Advice', assembly: 'Proposal Assembly', proposal_fit: 'Your Proposal',
  plaintext: 'RFP Plain Text', document: 'RFP Document',
};

async function buildSectionMarkdown(sectionId, ctx) {
  let body;
  if (sectionId === 'assembly') body = await buildAssemblySection(ctx.scan.id);
  else if (sectionId === 'proposal_fit') body = await buildFitSection(ctx.scan.id);
  else if (sectionId === 'document') body = SECTION_BUILDERS.plaintext(ctx);
  else if (SECTION_BUILDERS[sectionId]) body = SECTION_BUILDERS[sectionId](ctx);
  else body = '_Nothing exportable on this tab._\n';
  return header(ctx) + body;
}

async function buildFullMarkdown(ctx) {
  const order = ['brief', 'matches', 'gaps', 'strategy', 'language', 'narrative', 'approach', 'team', 'writing', 'news'];
  let s = header(ctx);
  s += line('> Complete workbench export — reflects the current saved state including approved/covered risks (and their score re-weighting), suppressed matches removed, corrected tags, attached bid team, and accepted drafts.') + line();
  const rd = ctx.rfpData || {};
  s += line('## RFP Profile');
  s += fmtVal({ client: rd.client, sector: rd.sector, deadline: rd.deadline, value: rd.contract_value_hint, framework: rd.procurement_framework }) + line();
  for (const id of order) { try { s += SECTION_BUILDERS[id](ctx); } catch {} }
  s += await buildAssemblySection(ctx.scan.id);
  s += await buildFitSection(ctx.scan.id);
  const ann = ctx.scan.annotations || [];
  if (ann.length) {
    s += line('## Annotations & Notes');
    ann.forEach(a => { s += line(`- **[${a.section || 'general'}]** ${a.content} _(${a.created_at})_`); });
    s += line();
  }
  return s;
}

function downloadMarkdown(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { buildSectionMarkdown, buildFullMarkdown, downloadMarkdown, SECTION_LABELS };
