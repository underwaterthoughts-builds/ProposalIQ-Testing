import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { canAccess } from '../../../lib/tenancy';
import { safe } from '../../../lib/embeddings';
import { generateSectionDraft } from '../../../lib/gemini';
import { currencySymbol } from '../../../lib/format';
import path from 'path';
import fs from 'fs';

export const config = { api: { bodyParser: true } };

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { id, draft } = req.query;
  const draftMode = draft === 'true';
  const db = getDb();

  const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
  if (!scan || !canAccess(req.user, scan)) return res.status(404).json({ error: 'Scan not found' });

  const rfpData = safe(scan.rfp_data, {});
  const gaps = safe(scan.gaps, []);
  const winStrategy = safe(scan.win_strategy, null);
  const suggestedApproach = safe(scan.suggested_approach, null);
  const winningLanguage = safe(scan.winning_language, []);
  const matches = safe(scan.matched_proposals, []).filter(m => m.match_label === 'Strong' || m.match_label === 'Good').slice(0, 4);

  // Generate draft content before building sections (so placeholders can use it)
  const drafts = {};
  if (draftMode) {
    const keyDraftSections = ['Executive Summary', 'Our Understanding of the Requirement', 'Our Proposed Approach'];
    for (const sectionName of keyDraftSections) {
      try {
        const draft = await generateSectionDraft(sectionName, rfpData, matches, winStrategy, winningLanguage);
        if (draft) drafts[sectionName] = draft;
      } catch (e) { console.error('Draft generation failed for', sectionName, e.message); }
    }
  }

  // Generate proposal section structure
  const sections = [];

  // Cover / title info
  sections.push({ type: 'cover', title: scan.name, client: rfpData.client, sector: rfpData.sector });

  // Executive Summary
  sections.push({
    type: 'section',
    heading: 'Executive Summary',
    level: 1,
    guidance: winStrategy?.opening_narrative
      ? `Suggested opening: "${winStrategy.opening_narrative}"`
      : 'Lead with client-focused outcome, not company capability.',
    key_messages: [
      ...(winStrategy?.focus || []).slice(0, 3),
      ...(rfpData.key_themes || []).slice(0, 2).map(t => `Address: ${t}`),
    ].filter(Boolean),
    placeholder: '[Write 3-4 paragraphs. Lead with the client\'s challenge, then your approach, then why you. Use the winning language below as inspiration.]',
    winning_language: winningLanguage.filter(l => l.use_case === 'executive summary').slice(0, 2),
  });

  // Understanding / Our Approach to the Brief
  sections.push({
    type: 'section',
    heading: 'Our Understanding of the Requirement',
    level: 1,
    guidance: 'Demonstrate you have read and understood the RFP in depth, including unstated expectations.',
    key_messages: [
      ...(rfpData.implicit_requirements || []).slice(0, 3).map(r => `Implicit: ${r.text}`),
      ...(rfpData.evaluation_criteria || []).slice(0, 2).map(c => `Evaluation criterion: ${c}`),
    ].filter(Boolean),
    placeholder: '[Paraphrase the brief back to the client. Reference their specific language. Show you understand the context, not just the stated requirements.]',
  });

  // Proposed Approach
  if (suggestedApproach?.suggested_phases?.length > 0) {
    sections.push({
      type: 'section',
      heading: 'Our Proposed Approach',
      level: 1,
      guidance: suggestedApproach.recommended_approach || '',
      placeholder: drafts['Our Proposed Approach'] || '[Describe your overall methodology and why it suits this brief.]',
      winning_language: winningLanguage.filter(l => l.use_case === 'approach section').slice(0, 2),
    });

    // Sub-sections for each phase
    suggestedApproach.suggested_phases.forEach(phase => {
      sections.push({
        type: 'section',
        heading: `${phase.phase}: ${phase.name}`,
        level: 2,
        guidance: `Duration: ${phase.duration}. ${phase.rationale}`,
        key_messages: phase.key_activities || [],
        placeholder: `[Describe activities, deliverables, and team involvement for this phase. Duration: ${phase.duration}]`,
      });
    });
  }

  // Our Experience
  if (matches.length > 0) {
    sections.push({
      type: 'section',
      heading: 'Relevant Experience',
      level: 1,
      guidance: 'Reference specific past projects. Use named outcomes, not generic claims.',
      placeholder: '[Introduce your relevant experience and why it qualifies you for this work.]',
      winning_language: winningLanguage.filter(l => l.use_case === 'credibility').slice(0, 2),
    });

    matches.forEach(m => {
      sections.push({
        type: 'case_study',
        heading: m.name,
        level: 2,
        client: m.client,
        outcome: m.outcome,
        value: m.contract_value,
        currency: m.currency,
        year: m.date_submitted?.slice(0, 4),
        themes: (m.ai_metadata?.key_themes || []).slice(0, 4),
        went_well: m.went_well || '',
        placeholder: '[Describe the challenge, your approach, and the measurable outcome. 150-200 words.]',
      });
    });
  }

  // Team — single section, populated from team_members when available so
  // we don't end up with two "Our Team" headings (the basic placeholder
  // one + the credentialled one was a duplicate that landed in the
  // generated template). When no team records exist, fall back to a
  // generic placeholder.
  try {
    const { safe: safeParse } = require('../../../lib/embeddings');
    const teamMembers = db.prepare('SELECT * FROM team_members LIMIT 8').all();
    if (teamMembers.length > 0) {
      sections.push({
        type: 'section',
        heading: 'Our Team',
        level: 1,
        guidance: 'Introduce proposed team. Lead with the Project Lead. For each person: name, role on this project, specific relevant experience from matched proposals.',
        key_messages: teamMembers.slice(0, 4).map(m => {
          const cv = safeParse(m.cv_extracted, {});
          const summary = cv.career_summary || '';
          return `${m.name} (${m.title})${summary ? ' — ' + summary.slice(0, 100) : ''}`;
        }),
        placeholder: drafts['Our Team'] || '[Name each team member, their role on this project, and one specific example of relevant past experience. Pull from the case studies above.]',
      });
    } else {
      sections.push({
        type: 'section',
        heading: 'Our Team',
        level: 1,
        guidance: 'Name individuals. State their specific credentials for this bid.',
        placeholder: '[Introduce the proposed team. Lead with the Project Lead, then key specialists. For each person: name, role on this project, specific relevant experience.]',
      });
    }
  } catch {
    sections.push({
      type: 'section',
      heading: 'Our Team',
      level: 1,
      guidance: 'Name individuals. State their specific credentials for this bid.',
      placeholder: '[Introduce the proposed team. Lead with the Project Lead, then key specialists. For each person: name, role on this project, specific relevant experience.]',
    });
  }

  // Addressing the Gaps
  const highGaps = gaps.filter(g => g.priority === 'high').slice(0, 4);
  if (highGaps.length > 0) {
    sections.push({
      type: 'section',
      heading: 'Risk, Quality and Assurance',
      level: 1,
      guidance: 'Address the following gaps identified by the intelligence scan — evaluators will be looking for these:',
      key_messages: highGaps.map(g => `[GAP] ${g.title}: ${g.description}`),
      placeholder: '[Address each flagged gap. Do not leave these unanswered — they are MUST requirements.]',
    });
  }

  // Commercials
  if (suggestedApproach?.indicative_budget) {
    const b = suggestedApproach.indicative_budget;
    const sym = currencySymbol(b.currency);
    sections.push({
      type: 'section',
      heading: 'Commercial Proposal',
      level: 1,
      guidance: `Indicative range: ${sym}${(b.low/1000).toFixed(0)}K–${sym}${(b.high/1000).toFixed(0)}K. ${b.basis}`,
      key_messages: (suggestedApproach.key_risks || []).slice(0, 2).map(r => `Risk to price: ${r}`),
      placeholder: '[Present your commercial model. Explain what drives cost. Reference similar project benchmarks.]',
    });
  }

  // What to avoid
  if (winStrategy?.avoid?.length > 0) {
    sections.push({
      type: 'internal_note',
      heading: 'INTERNAL NOTES — Do Not Include in Submission',
      avoid: winStrategy.avoid,
      conditions: winStrategy.conditions || [],
    });
  }

  // Build HTML document (Word-compatible via MIME type)
  try {
    const sectionHtml = (s) => {
      if (s.type === 'cover') return '';
      if (s.type === 'internal_note') {
        if (!s.avoid?.length) return '';
        return `<div class="internal-note">
          <div class="int-header">⚠ INTERNAL ONLY — DELETE BEFORE SUBMISSION</div>
          ${s.avoid.map(a => `<div class="avoid-item">✕ Avoid: ${a}</div>`).join('')}
        </div>`;
      }
      const headingTag = s.level === 1 ? 'h1' : 'h2';
      const caseStudyMeta = s.type === 'case_study' ? `
        <div class="case-meta">${[s.client, s.year, s.outcome?.toUpperCase()].filter(Boolean).join(' · ')}</div>
        ${s.went_well ? `<div class="went-well">✓ What worked: ${s.went_well}</div>` : ''}
      ` : '';
      const guidance = s.guidance ? `<div class="guidance">💡 ${s.guidance}</div>` : '';
      const keyMessages = s.key_messages?.length ? `<ul class="key-messages">${s.key_messages.map(m => `<li>${m}</li>`).join('')}</ul>` : '';
      const winLang = s.winning_language?.length ? `
        <div class="win-lang-header">✍ Suggested Language (adapt — do not copy)</div>
        ${s.winning_language.map(l => `
          <div class="win-lang-item">
            <blockquote>"${l.text}"</blockquote>
            <div class="win-lang-meta">Use in: ${l.use_case} · ${l.why_it_works || ''}</div>
          </div>`).join('')}
      ` : '';
      const placeholder = s.placeholder ? `<div class="placeholder">${s.placeholder}</div>` : '';
      return `<div class="section">
        <${headingTag}>${s.heading}</${headingTag}>
        ${caseStudyMeta}${guidance}${keyMessages}${winLang}${placeholder}
      </div>`;
    };

    const sectionsHtml = sections.filter(s => s.type !== 'cover').map(sectionHtml).join('\n');

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name=ProgId content=Word.Document>
<meta name=Generator content="Microsoft Word">
<title>${scan.name}</title>
<style>
  @page { margin: 2.5cm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; }
  h1 { font-size: 18pt; color: #1E4A52; border-bottom: 3px solid #1E4A52; padding-bottom: 10px; margin-top: 32px; margin-bottom: 14px; }
  h2 { font-size: 14pt; color: #1E4A52; margin-top: 24px; margin-bottom: 10px; }
  .cover { text-align: center; padding: 60px 0 40px; border-bottom: 2px solid #1E4A52; margin-bottom: 40px; }
  .cover h1 { border: none; font-size: 28pt; }
  .cover .subtitle { color: #6B6456; font-size: 13pt; }
  .cover .generated { color: #aaa; font-size: 9pt; margin-top: 20px; }
  .section { margin-bottom: 32px; page-break-inside: avoid; }
  .guidance { background: #FAF4E2; border-left: 4px solid #B8962E; padding: 12px 16px; margin: 12px 0; font-size: 10pt; color: #5A4810; font-style: italic; }
  .guidance::before { content: ""; }
  .key-messages { margin: 10px 0 10px 20px; }
  .key-messages li { margin-bottom: 6px; font-size: 10pt; color: #333; }
  .placeholder { background: #F8F6F2; border: 1px dashed #CCC; padding: 14px 16px; color: #999; font-style: italic; font-size: 10pt; margin: 12px 0; }
  .win-lang-header { font-size: 9pt; font-weight: bold; color: #B8962E; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em; }
  .win-lang-item { background: #FAF4E2; border-left: 4px solid #B8962E; padding: 10px 14px; margin: 6px 0; }
  .win-lang-item blockquote { margin: 0 0 6px; font-style: italic; color: #3A2800; }
  .win-lang-meta { font-size: 9pt; color: #8A6200; }
  .case-meta { color: #6B6456; font-size: 10pt; margin-bottom: 8px; }
  .went-well { background: #EDF3EC; border-left: 3px solid #3D5C3A; padding: 8px 12px; font-size: 10pt; color: #1A3318; margin: 8px 0; }
  .internal-note { background: #FAEEEB; border: 2px solid #B04030; padding: 16px; margin: 20px 0; page-break-inside: avoid; }
  .int-header { font-weight: bold; color: #B04030; font-size: 11pt; margin-bottom: 10px; }
  .avoid-item { color: #B04030; font-size: 10pt; margin: 4px 0; }
  @media print { .section { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="cover">
  <h1>${scan.name}</h1>
  <div class="subtitle">${rfpData.client || ''}${rfpData.sector ? ' · ' + rfpData.sector : ''}</div>
  <div class="generated">Proposal ${draftMode ? 'Draft' : 'Template'} · Generated by ProposalIQ · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</div>
${sectionsHtml}
</body>
</html>`;

    const filename = `${scan.name.replace(/[^a-z0-9]/gi, '_')}_proposal_${draftMode ? 'draft' : 'template'}.doc`;
    // Send as .doc with Word-compatible HTML — opens directly in Word/Pages/Google Docs
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);

  } catch (e) {
    console.error('Template generation failed:', e.message, e.stack);
    res.status(500).json({ error: 'Template generation failed: ' + e.message });
  }
}
export default requireAuth(handler);
