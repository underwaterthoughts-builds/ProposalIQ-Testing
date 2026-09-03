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

// ── Markdown → styled HTML ──────────────────────────────────────────────────
// Small renderer for exactly the constructs the builders above emit:
// #/##/### headings, tables, nested "- " lists, > blockquotes, ``` fences,
// **bold**, _italic_, paragraphs. Output is a self-contained printable page.

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?]|$)/g, '$1<em>$2</em>');
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let listDepth = -1; // current open <ul> depth (-1 = none)

  const closeLists = (to = -1) => {
    while (listDepth > to) { out.push('</ul>'); listDepth--; }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    // code fence
    if (line.trim() === '```') {
      closeLists();
      const buf = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') { buf.push(esc(lines[i])); i++; }
      i++;
      out.push(`<pre>${buf.join('\n')}</pre>`);
      continue;
    }
    // table: header row + separator row
    if (line.startsWith('|') && lines[i + 1] && /^\|[\s\-|]+\|?$/.test(lines[i + 1].trim())) {
      closeLists();
      const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
      out.push('<table><thead><tr>' + cells(line).map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        out.push('<tr>' + cells(lines[i]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>');
        i++;
      }
      out.push('</tbody></table>');
      continue;
    }
    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeLists(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    // blockquote
    if (line.startsWith('> ')) { closeLists(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); i++; continue; }
    // list item (2-space nesting)
    const li = raw.match(/^(\s*)-\s?(.*)$/);
    if (li) {
      const depth = Math.floor(li[1].length / 2);
      if (depth > listDepth) { for (let d = listDepth; d < depth; d++) out.push('<ul>'); }
      else if (depth < listDepth) closeLists(depth);
      listDepth = depth;
      out.push(`<li>${inline(li[2])}</li>`);
      i++; continue;
    }
    // blank
    if (line.trim() === '') { closeLists(); i++; continue; }
    // paragraph
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeLists();
  return out.join('\n');
}

function wrapHtmlDocument(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ink:#25231f; --muted:#6d6557; --accent:#1e4a52; --gold:#8a6d1f; --line:#e3ddd0; --bg:#faf8f3; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.65 Georgia, 'Times New Roman', serif; }
  .page { max-width:820px; margin:0 auto; padding:56px 48px 96px; background:#fff;
    min-height:100vh; box-shadow:0 0 40px rgba(0,0,0,.06); }
  h1 { font-size:30px; line-height:1.25; margin:0 0 6px; color:var(--accent); }
  h2 { font-size:21px; margin:44px 0 12px; padding-bottom:8px; border-bottom:2px solid var(--line); color:var(--accent); }
  h3 { font-size:16px; margin:26px 0 8px; color:var(--ink); }
  h4 { font-size:14px; margin:18px 0 6px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  p { margin:8px 0; }
  blockquote { margin:14px 0; padding:10px 16px; border-left:3px solid var(--gold);
    background:#faf6ea; color:#5a4d2a; font-style:italic; }
  ul { margin:6px 0 12px; padding-left:22px; }
  li { margin:3px 0; }
  table { border-collapse:collapse; width:100%; margin:14px 0; font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; }
  th { text-align:left; background:var(--accent); color:#fff; padding:8px 10px; font-weight:600; }
  td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:nth-child(even) td { background:#faf8f3; }
  pre { background:#f4f1ea; border:1px solid var(--line); border-radius:6px; padding:14px;
    font:12px/1.5 ui-monospace, Menlo, monospace; white-space:pre-wrap; word-break:break-word; }
  strong { color:var(--ink); }
  .toolbar { position:sticky; top:0; background:var(--accent); color:#fff; padding:10px 48px;
    display:flex; justify-content:space-between; align-items:center;
    font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; }
  .toolbar button { background:#fff; color:var(--accent); border:0; border-radius:5px;
    padding:7px 16px; font-weight:700; font-size:12px; cursor:pointer; }
  .toolbar button:hover { opacity:.9; }
  @media print {
    .toolbar { display:none; }
    body { background:#fff; }
    .page { box-shadow:none; padding:0; max-width:none; }
    h2 { break-after:avoid; } table, blockquote, pre { break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <span>ProposalIQ export · generated ${esc(new Date().toLocaleString('en-GB'))}</span>
  <button onclick="window.print()">🖨 Print / Save as PDF</button>
</div>
<div class="page">
${bodyHtml}
</div>
</body>
</html>`;
}

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Primary download path: styled, self-contained HTML that opens in any
// browser and prints cleanly to PDF via the embedded toolbar button.
function downloadHtml(filename, markdown, title) {
  downloadFile(filename, wrapHtmlDocument(title, mdToHtml(markdown)), 'text/html;charset=utf-8');
}

function downloadMarkdown(filename, text) {
  downloadFile(filename, text, 'text/markdown;charset=utf-8');
}

export { buildSectionMarkdown, buildFullMarkdown, downloadMarkdown, downloadHtml, SECTION_LABELS };
