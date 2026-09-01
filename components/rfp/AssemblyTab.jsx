import { useEffect, useState } from 'react';
import { Spinner } from '../ui';
import { DebouncedTextarea } from '../../lib/useDebounce';
import SectionDraftPanel from './SectionDraftPanel';
import QaAdjustmentsFooter from './QaAdjustmentsFooter';

// ── PROPOSAL ASSEMBLY TAB ─────────────────────────────────────────────────────
const SECTION_STATUSES = ['not started', 'in progress', 'draft ready', 'complete'];
const STATUS_COLORS = { 'not started':'#4d4636', 'in progress':'#b8962e', 'draft ready':'#1e4a52', 'complete':'#3d5c3a' };

function AssemblyTab({ scan, matches, winStrategy, suggestedApproach, onToast,
  onGenerateTemplate, onExportBriefing, generatingTemplate, templateDraftMode, setTemplateDraftMode, exporting }) {
  const rfpData = scan?.rfp_data || {};

  // Past-project + client name tokens for the full-proposal renderer to
  // highlight inline (so the user can spot every reference at a glance
  // and verify each one is the correct citation).
  const fullProposalRefRegex = (() => {
    const seen = new Set();
    const tokens = [];
    (matches || []).forEach(m => {
      [m.name, m.client].forEach(v => {
        const s = (v || '').trim();
        if (!s || s.length < 4) return;
        const lower = s.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        tokens.push(s);
      });
    });
    if (tokens.length === 0) return null;
    tokens.sort((a, b) => b.length - a.length);
    return new RegExp('(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  })();
  const fullProposalRefSet = new Set((matches || []).flatMap(m => [m.name, m.client]).filter(Boolean).map(s => s.toLowerCase()));
  const storageKey = `piq_assembly_${scan?.id}`;
  // Wave 4 — section drafts state
  const [drafts, setDrafts] = useState({});  // section_id → draft object
  const [generating, setGenerating] = useState(null); // section_id currently generating
  const [openDraftId, setOpenDraftId] = useState(null); // section_id whose panel is expanded
  // Full proposal state
  const [fullProposal, setFullProposal] = useState(null);
  const [fullProposalQa, setFullProposalQa] = useState({ count: 0, adjustments: [] });
  const [generatingFull, setGeneratingFull] = useState(false);
  const [editingFull, setEditingFull] = useState(false);
  const [fullProposalText, setFullProposalText] = useState('');
  const [coverageReport, setCoverageReport] = useState(null);

  // Load existing drafts on mount
  useEffect(() => {
    if (!scan?.id) return;
    fetch(`/api/rfp/${scan.id}/drafts`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.drafts) {
          const map = {};
          d.drafts.forEach(x => { map[x.section_id] = x; });
          setDrafts(map);
        }
      })
      .catch(e => console.error('[rfp] drafts fetch failed:', e.message));
  }, [scan?.id]);

  async function generateDraft(section, force = false) {
    if (scan.status !== 'complete') {
      onToast('Wait for the full scan to complete before drafting sections.');
      return;
    }
    setGenerating(section.id);
    onToast(`Drafting "${section.title}" + pre-delivery QA — typically 1–3 minutes…`);
    try {
      const r = await fetch(`/api/rfp/${scan.id}/draft-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_id: section.id,
          section_name: section.title,
          section_description: section.description,
          force,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        onToast(err.error || 'Draft generation failed');
        setGenerating(null);
        return;
      }
      const d = await r.json();
      setDrafts(prev => ({ ...prev, [section.id]: d.draft }));
      setOpenDraftId(section.id);
      onToast('✓ Draft ready');
    } catch (e) {
      onToast('Draft generation failed: ' + e.message);
    }
    setGenerating(null);
  }

  async function updateDraft(section, fields) {
    const draft = drafts[section.id];
    if (!draft) return;
    try {
      const r = await fetch(`/api/rfp/${scan.id}/drafts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, ...fields }),
      });
      if (!r.ok) { onToast('Failed to save'); return; }
      // Optimistic local update
      setDrafts(prev => ({ ...prev, [section.id]: { ...prev[section.id], ...fields } }));
      if (fields.status === 'accepted') {
        onToast('✓ Draft accepted');
        updateSection(section.id, { status: 'draft ready' });
      }
    } catch (e) {
      onToast('Save failed');
    }
  }

  // Natural-language revise. Sends the user's instruction to the
  // amend-section endpoint, which returns the revised draft text. We
  // replace the cached draft on success and surface the change summary
  // back to the panel for inline confirmation.
  async function amendDraft(section, instruction) {
    const draft = drafts[section.id];
    if (!draft) return '';
    try {
      const r = await fetch(`/api/rfp/${scan.id}/amend-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, instruction }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        onToast(err.error || 'Revision failed');
        return '';
      }
      const d = await r.json();
      if (d.changed && d.draft) {
        setDrafts(prev => ({ ...prev, [section.id]: { ...prev[section.id], ...d.draft } }));
        onToast(d.change_summary ? `✓ ${d.change_summary}` : '✓ Draft revised');
      } else {
        onToast(d.change_summary || 'No change applied');
      }
      return d.change_summary || '';
    } catch (e) {
      onToast('Revision failed: ' + e.message);
      return '';
    }
  }

  async function discardDraft(section) {
    const draft = drafts[section.id];
    if (!draft) return;
    if (!confirm('Discard this draft? You can regenerate later.')) return;
    try {
      await fetch(`/api/rfp/${scan.id}/drafts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id }),
      });
      setDrafts(prev => {
        const next = { ...prev };
        delete next[section.id];
        return next;
      });
      setOpenDraftId(null);
      onToast('Draft discarded');
    } catch {
      onToast('Discard failed');
    }
  }

  const defaultSections = [
    { id:'cover', title:'Cover Page', description:'Client name, project title, submission date, contact details', status:'not started', source:null, notes:'' },
    { id:'exec', title:'Executive Summary', description:'Winning thesis, top 3 priorities, why you win this', status:'not started', source:null, notes:'' },
    { id:'understanding', title:'Our Understanding', description:'Paraphrase brief, show insight into what they really want', status:'not started', source:null, notes:'' },
    { id:'approach', title:'Our Proposed Approach', description:'Methodology, phasing, delivery logic', status:'not started', source:null, notes:'' },
    { id:'experience', title:'Relevant Experience', description:'Case studies from matched proposals', status:'not started', source:null, notes:'' },
    { id:'team', title:'Our Team', description:'Key personnel, roles, CVs', status:'not started', source:null, notes:'' },
    { id:'quality', title:'Quality & Risk', description:'Risk register, QA approach, mitigations', status:'not started', source:null, notes:'' },
    { id:'commercial', title:'Commercial Proposal', description:'Pricing, day rates, assumptions, payment terms', status:'not started', source:null, notes:'' },
    { id:'appendix', title:'Appendices', description:'CVs, case studies, certifications', status:'not started', source:null, notes:'' },
  ];

  const [sections, setSections] = useState(() => {
    if (typeof window === 'undefined') return defaultSections;
    try { return JSON.parse(localStorage.getItem(storageKey)) || defaultSections; } catch { return defaultSections; }
  });

  function updateSection(id, updates) {
    const updated = sections.map(s => s.id === id ? { ...s, ...updates } : s);
    setSections(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
  }

  function moveSection(id, dir) {
    const idx = sections.findIndex(s => s.id === id);
    if (idx < 0) return;
    const next = [...sections];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    setSections(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  }

  const complete = sections.filter(s => s.status === 'complete').length;
  const progress = Math.round((complete / sections.length) * 100);

  // Suggest source proposal per section based on match data
  const wonMatches = matches.filter(m => m.outcome === 'won').slice(0, 3);
  const topMatchNames = wonMatches.map(m => m.name).join(', ') || 'no matched proposals';

  async function generateFullProposalDoc() {
    if (scan.status !== 'complete') {
      onToast('Wait for the full scan to complete before generating a proposal.');
      return;
    }
    setGeneratingFull(true);
    try {
      const r = await fetch(`/api/rfp/${scan.id}/generate-proposal`, { method: 'POST' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        onToast(err.error || 'Proposal generation failed');
        setGeneratingFull(false);
        return;
      }
      const d = await r.json();
      setFullProposal(d.proposal);
      setFullProposalText(d.proposal);
      setCoverageReport(d.coverage || null);
      setFullProposalQa({ count: d.qa_adjustments_count || 0, adjustments: d.qa_adjustments || [] });
      const qaNote = d.qa_adjustments_count ? ` · ${d.qa_adjustments_count} QA adjustment${d.qa_adjustments_count === 1 ? '' : 's'} applied` : '';
      onToast(`✓ Full proposal draft ready${qaNote}`);
    } catch (e) {
      onToast('Generation failed: ' + e.message);
    }
    setGeneratingFull(false);
  }

  // If a full proposal exists, show the proposal view
  if (fullProposal) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl p-5" style={{ background: '#1e4a52' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-white font-semibold text-base mb-1">Draft Proposal</div>
              <div className="text-white/60 text-xs">
                {rfpData.title || 'Untitled'} for {rfpData.client || 'Unknown'} · Grounded in: {topMatchNames}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {onGenerateTemplate && (
                <button onClick={() => { setTemplateDraftMode(false); onGenerateTemplate(); }} disabled={generatingTemplate}
                  className="text-xs px-3 py-1.5 rounded text-white/80 hover:text-white border border-white/30">
                  {generatingTemplate && !templateDraftMode ? 'Building…' : '📄 Template'}
                </button>
              )}
              {onExportBriefing && (
                <button onClick={onExportBriefing} disabled={exporting}
                  className="text-xs px-3 py-1.5 rounded text-white/70 hover:text-white border border-white/20">
                  {exporting ? 'Exporting…' : '↓ Export briefing for your team'}
                </button>
              )}
              <button onClick={() => setFullProposal(null)}
                className="text-xs px-3 py-1.5 rounded text-white/70 hover:text-white border border-white/20">
                ← Back to sections
              </button>
            </div>
          </div>
        </div>

        {/* Guidance */}
        <div className="rounded-lg p-3 text-xs flex items-start gap-2"
          style={{ background: 'rgba(232,195,87,.08)', border: '1px solid rgba(184,150,46,.3)', color: '#e8c357' }}>
          <span className="flex-shrink-0">✦</span>
          <span>
            This is a first draft grounded in your intelligence. <strong>(Proposal: "Name")</strong> citations
            reference your matched past work. <strong>[EVIDENCE NEEDED]</strong> markers show where you
            need to fill in specific data. Copy into your proposal template and edit.
          </span>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setEditingFull(!editingFull)}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#7fb4bc' }}>
            {editingFull ? '◉ Preview' : '✎ Edit'}
          </button>
          <button onClick={() => {
            navigator.clipboard.writeText(fullProposalText);
            onToast('Proposal copied to clipboard');
          }}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
            ⎘ Copy to clipboard
          </button>
          <button onClick={() => {
            const blob = new Blob([fullProposalText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(rfpData.title || scan.name || 'proposal').replace(/[^a-z0-9]/gi, '_')}_draft.txt`;
            a.click();
            URL.revokeObjectURL(url);
            onToast('Draft downloaded');
          }}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
            ↓ Download .txt
          </button>
          <button onClick={generateFullProposalDoc} disabled={generatingFull}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#7fb4bc' }}>
            {generatingFull ? 'Regenerating…' : '⟳ Regenerate'}
          </button>
          <span className="text-[10px] font-mono ml-auto" style={{ color: '#99907d' }}>
            {fullProposalText.split(/\s+/).length.toLocaleString()} words
          </span>
        </div>

        <QaAdjustmentsFooter adjustments={fullProposalQa.adjustments} count={fullProposalQa.count} />

        {/* Document body */}
        <div className="rounded-xl border overflow-hidden" style={{ background: '#211f1d', borderColor: '#4d4636' }}>
          {editingFull ? (
            <DebouncedTextarea value={fullProposalText} onCommit={setFullProposalText} delay={500}
              rows={Math.max(30, (fullProposalText || '').split('\n').length + 5)}
              className="w-full text-sm leading-relaxed p-8 outline-none resize-y font-serif"
              style={{ color: '#e6e2de', minHeight: '80vh' }} />
          ) : (
            <div className="p-8 max-w-none font-serif" style={{ color: '#e6e2de' }}>
              {fullProposalText.split('\n').map((line, i, arr) => {
                if (!line.trim()) return <br key={i} />;

                // Detect section titles: standalone line that is short
                // (<80 chars), doesn't end with a period, and is followed
                // by a blank line or is at the start. Also catch ## / ###
                // if the model still uses them, and strip the markers.
                const cleanLine = line.replace(/^#{1,4}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1');
                const nextLine = arr[i + 1] || '';
                const prevLine = arr[i - 1] || '';
                const looksLikeTitle = (
                  cleanLine.length < 80 &&
                  !cleanLine.endsWith('.') &&
                  !cleanLine.endsWith(',') &&
                  (!nextLine.trim() || prevLine.trim() === '') &&
                  cleanLine.length > 3
                ) || /^#{1,4}\s+/.test(line);

                if (looksLikeTitle && cleanLine.length < 80) {
                  return (
                    <div key={i} className="mt-8 mb-3 pb-2 border-b" style={{ borderColor: '#2b2a27' }}>
                      <h2 className="text-base font-serif font-bold" style={{ color: '#7fb4bc' }}>{cleanLine}</h2>
                    </div>
                  );
                }

                // Normal paragraph — highlight (Proposal: "..."), [#N],
                // [EVIDENCE NEEDED:...], [TBC:...] markers AND past
                // client / project references so the user can verify
                // every citation at a glance.
                const parts = cleanLine.split(/(\(Proposal: "[^"]*"\)|\[EVIDENCE NEEDED[^\]]*\]|\[TBC[^\]]*\]|\[#\d+\])/g);
                return (
                  <p key={i} className="text-sm leading-relaxed mb-3">
                    {parts.map((part, j) => {
                      if (/^\(Proposal: "/.test(part)) {
                        return <span key={j} className="text-[11px] italic" style={{ color: '#7fb4bc' }}>{part}</span>;
                      }
                      if (/^\[#\d+\]$/.test(part)) {
                        return <span key={j} className="text-[11px] italic" style={{ color: '#7fb4bc' }}>{part}</span>;
                      }
                      if (/^\[EVIDENCE NEEDED/.test(part)) {
                        return <span key={j} className="text-[11px] px-1 rounded" style={{ background: 'rgba(184,150,46,.18)', color: '#e8c357' }}>{part}</span>;
                      }
                      if (/^\[TBC/.test(part)) {
                        return <span key={j} className="text-[11px] px-1 rounded" style={{ background: 'rgba(255,180,171,.18)', color: '#ffb4ab' }} title="Team role to assign">{part}</span>;
                      }
                      if (fullProposalRefRegex) {
                        const subParts = part.split(fullProposalRefRegex);
                        return (
                          <span key={j}>
                            {subParts.map((sp, k) => {
                              if (sp && fullProposalRefSet.has(sp.toLowerCase())) {
                                return <span key={k} className="px-1 rounded" style={{ background: 'rgba(183,196,255,.18)', color: '#b7c4ff' }} title="Past client or project — verify this reference is correct">{sp}</span>;
                              }
                              return sp;
                            })}
                          </span>
                        );
                      }
                      return <span key={j}>{part}</span>;
                    })}
                  </p>
                );
              })}
            </div>
          )}
        </div>

        {/* Requirements coverage report */}
        {coverageReport && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#4d4636' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#1d1b19' }}>
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#d0c5b0' }}>Requirements coverage check</div>
                {coverageReport.coverage_summary && (
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: coverageReport.coverage_summary.coverage_percentage >= 80 ? 'rgba(61,92,58,.15)' :
                        coverageReport.coverage_summary.coverage_percentage >= 60 ? 'rgba(232,195,87,.08)' : 'rgba(176,64,48,.12)',
                      color: coverageReport.coverage_summary.coverage_percentage >= 80 ? '#3d5c3a' :
                        coverageReport.coverage_summary.coverage_percentage >= 60 ? '#8a6200' : '#b04030',
                    }}>
                    {coverageReport.coverage_summary.coverage_percentage}% covered
                  </span>
                )}
              </div>
              {coverageReport.coverage_summary && (
                <div className="text-[11px] font-mono" style={{ color: '#99907d' }}>
                  {coverageReport.coverage_summary.fully_addressed} addressed · {coverageReport.coverage_summary.partially_addressed} partial · {coverageReport.coverage_summary.missed} missed
                </div>
              )}
            </div>

            {/* Critical gaps warning */}
            {coverageReport.critical_gaps?.length > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: '#2b2a27', background: 'rgba(176,64,48,.12)' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#ffb4ab' }}>Critical — MUST requirements not addressed</div>
                <ul className="space-y-1">
                  {coverageReport.critical_gaps.map((g, i) => (
                    <li key={i} className="text-xs flex gap-2" style={{ color: '#7a3023' }}>
                      <span className="flex-shrink-0">✕</span><span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Per-requirement checklist */}
            <div className="px-5 py-3 border-t max-h-80 overflow-y-auto" style={{ borderColor: '#2b2a27' }}>
              {(coverageReport.requirements || []).map((r, i) => {
                const statusIcon = r.status === 'addressed' ? '✓' : r.status === 'partial' ? '◐' : '✕';
                const statusColor = r.status === 'addressed' ? '#3d5c3a' : r.status === 'partial' ? '#b8962e' : '#b04030';
                return (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-0 text-xs" style={{ borderColor: '#211f1d' }}>
                    <span className="flex-shrink-0 font-bold mt-0.5" style={{ color: statusColor }}>{statusIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] flex-shrink-0" style={{ color: r.priority === 'must' ? '#b04030' : '#9b8e80' }}>
                          [{r.priority?.toUpperCase()}]
                        </span>
                        <span className="truncate" style={{ color: '#e6e2de' }}>{r.text}</span>
                      </div>
                      {r.note && <div className="text-[11px] mt-0.5" style={{ color: '#d0c5b0' }}>{r.note}</div>}
                    </div>
                    {r.where_addressed && (
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#99907d' }}>
                        {r.where_addressed}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Improvement suggestions */}
            {coverageReport.improvement_suggestions?.length > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: '#2b2a27', background: '#1d1b19' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#7fb4bc' }}>Suggestions to improve coverage</div>
                <ul className="space-y-1">
                  {coverageReport.improvement_suggestions.map((s, i) => (
                    <li key={i} className="text-xs flex gap-2" style={{ color: '#7fb4bc' }}>
                      <span className="flex-shrink-0">→</span><span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Generate full proposal CTA */}
      {scan.status === 'complete' && (
        <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: '#b8962e' }}>
          <div className="p-5 flex items-start gap-4" style={{ background: 'linear-gradient(135deg, #1e4a52 0%, #2d6b78 100%)' }}>
            <div className="flex-1">
              <div className="text-white font-semibold text-base mb-1">Generate full proposal</div>
              <div className="text-white/70 text-sm leading-relaxed">
                Build a complete, submission-ready proposal using everything from this scan — matched proposals, win strategy,
                winning language, gap analysis, team, and your organisation profile. Written in your winning style.
              </div>
              <div className="mt-3 text-[11px] text-white/60 leading-relaxed">
                <strong className="text-white/80">Heads-up:</strong> Full proposal takes ~15 minutes (8 sections + per-section QA).
                Need it faster? Draft section-by-section below — each one takes ~2 minutes and lets you control which sections to generate first.
              </div>
            </div>
            <button onClick={generateFullProposalDoc} disabled={generatingFull}
              className="flex-shrink-0 text-sm px-5 py-3 rounded-lg font-semibold transition-all disabled:opacity-60"
              style={{ background: '#b8962e', color: 'white' }}>
              {generatingFull ? <><Spinner size={14} /> Writing proposal…</> : '✍ Generate proposal'}
            </button>
          </div>
          {generatingFull && (
            <div className="px-5 py-3 text-xs flex items-center gap-2" style={{ background: 'rgba(232,195,87,.08)', color: '#e8c357' }}>
              <Spinner size={12} />
              <span>Writing 8 sections in your winning style and running pre-delivery QA on each — typically 12–16 minutes. We'll show the finalised draft when it's ready.</span>
            </div>
          )}
        </div>
      )}

      {/* Quick actions — Template / Briefing inline */}
      {onGenerateTemplate && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#99907d' }}>Export:</span>
          <button onClick={() => { setTemplateDraftMode(false); onGenerateTemplate(); }} disabled={generatingTemplate}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-teal-50" style={{ borderColor: '#7fb4bc', color: '#7fb4bc' }}>
            {generatingTemplate && !templateDraftMode ? <><Spinner size={10} /> Building…</> : '📄 Template (.docx)'}
          </button>
          <button onClick={onExportBriefing} disabled={exporting}
            className="text-xs px-3 py-1.5 rounded border transition-colors hover:bg-gray-50" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
            {exporting ? 'Exporting…' : '↓ Export briefing for your team (.html)'}
          </button>
        </div>
      )}

      {/* Progress header */}
      <div className="rounded-xl p-4 flex items-center gap-4" style={{ background:'#1e4a52' }}>
        <div className="flex-1">
          <div className="text-white font-semibold text-sm mb-1">Section-by-section assembly</div>
          <div className="text-white/60 text-xs">{complete} of {sections.length} sections complete · Grounded in: {topMatchNames}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-white font-serif text-2xl">{progress}%</div>
          <div className="text-white/50 text-xs">complete</div>
        </div>
      </div>

      {/* Section status legend */}
      <div className="flex flex-wrap gap-2">
        {SECTION_STATUSES.map(s => (
          <div key={s} className="flex items-center gap-1.5 text-[11px]" style={{ color:'#d0c5b0' }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background:STATUS_COLORS[s] }}/>
            {s}
          </div>
        ))}
      </div>

      {/* Sections */}
      {sections.map((s, i) => {
        // Find relevant matched proposal for this section
        const relevantMatch = s.id === 'experience' ? wonMatches[0] :
          s.id === 'approach' ? matches.find(m => m.ai_metadata?.methodologies?.length > 0) :
          s.id === 'commercial' && suggestedApproach?.indicative_budget ? null : null;

        return (
          <div key={s.id} className="rounded-xl border overflow-hidden" style={{ background:'#211f1d', borderColor:'#4d4636' }}>
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Status indicator + controls */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => moveSection(s.id, -1)} disabled={i === 0}
                  className="text-[10px] text-center opacity-30 hover:opacity-70 disabled:opacity-10 no-min-h leading-none">▲</button>
                <button onClick={() => moveSection(s.id, 1)} disabled={i === sections.length - 1}
                  className="text-[10px] text-center opacity-30 hover:opacity-70 disabled:opacity-10 no-min-h leading-none">▼</button>
              </div>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background:STATUS_COLORS[s.status] }}/>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="text-xs mt-0.5" style={{ color:'#99907d' }}>{s.description}</div>
              </div>
              {/* Status selector */}
              <select value={s.status} onChange={e => updateSection(s.id, { status: e.target.value })}
                className="text-xs border rounded-lg px-2 py-1.5 outline-none no-min-h flex-shrink-0"
                style={{ borderColor:'#4d4636', color:STATUS_COLORS[s.status], minWidth:120 }}>
                {SECTION_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>

            {/* Source traceability + notes */}
            <div className="px-4 pb-3 flex items-start gap-3 border-t" style={{ borderColor:'#211f1d' }}>
              <div className="flex-1 pt-2">
                {relevantMatch && (
                  <div className="text-[10px] font-mono mb-1.5" style={{ color:'#7fb4bc' }}>
                    ◈ Source: "{relevantMatch.name}" ({relevantMatch.date_submitted?.slice(0,4) || 'date unknown'}, {relevantMatch.outcome})
                  </div>
                )}
                {s.id === 'exec' && winStrategy?.winning_thesis && (
                  <div className="text-[10px] font-mono mb-1.5 italic" style={{ color:'#b8962e' }}>
                    Thesis: {winStrategy.winning_thesis}
                  </div>
                )}
                <input
                  value={s.notes}
                  onChange={e => updateSection(s.id, { notes: e.target.value })}
                  placeholder="Add notes, owner, or deadline…"
                  className="w-full text-xs px-2 py-1.5 border rounded-lg outline-none"
                  style={{ borderColor:'#4d4636', color:'#3a3530' }}
                />
              </div>
              {/* Wave 4 — Draft section button */}
              <div className="pt-2 flex-shrink-0">
                {drafts[s.id] ? (
                  <button onClick={() => setOpenDraftId(openDraftId === s.id ? null : s.id)}
                    className="text-[11px] px-2.5 py-1.5 rounded border transition-colors flex items-center gap-1.5"
                    style={{
                      borderColor: drafts[s.id].status === 'accepted' ? '#3d5c3a' : '#1e4a52',
                      background: drafts[s.id].status === 'accepted' ? 'rgba(61,92,58,.08)' : 'rgba(30,74,82,.06)',
                      color: drafts[s.id].status === 'accepted' ? '#3d5c3a' : '#1e4a52',
                    }}>
                    {drafts[s.id].status === 'accepted' ? '✓' : '✎'} {openDraftId === s.id ? 'Hide draft' : 'View draft'}
                  </button>
                ) : (
                  <button onClick={() => generateDraft(s)} disabled={generating === s.id || scan.status !== 'complete'}
                    className="text-[11px] px-2.5 py-1.5 rounded border transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    style={{ borderColor: '#7fb4bc', color: '#7fb4bc' }}
                    title={scan.status !== 'complete' ? 'Wait for full scan to complete' : 'AI-draft this section'}>
                    {generating === s.id ? <><Spinner size={10} /> Drafting…</> : '✍ Draft section'}
                  </button>
                )}
              </div>
            </div>

            {/* Wave 4 — inline draft panel */}
            {openDraftId === s.id && drafts[s.id] && (
              <SectionDraftPanel
                draft={drafts[s.id]}
                matches={matches}
                winningLanguage={scan.winning_language || []}
                onUpdateText={(text) => updateDraft(s, { draft_text: text })}
                onAccept={() => updateDraft(s, { status: 'accepted' })}
                onRegenerate={() => generateDraft(s, true)}
                onAmend={(instruction) => amendDraft(s, instruction)}
                onDiscard={() => discardDraft(s)}
                onClose={() => setOpenDraftId(null)}
                regenerating={generating === s.id}
              />
            )}
          </div>
        );
      })}

      {/* Export assembly plan */}
      <button onClick={() => {
        const plan = sections.map(s => `[${s.status.toUpperCase()}] ${s.title}\n${s.description}${s.notes ? '\nNotes: ' + s.notes : ''}`).join('\n\n');
        navigator.clipboard.writeText(`PROPOSAL ASSEMBLY PLAN — ${rfpData.client || ''}\n${'='.repeat(40)}\n\n${plan}`);
        onToast('Assembly plan copied to clipboard');
      }}
        className="w-full py-3 rounded-xl border text-sm font-medium transition-all hover:bg-surface-container-high no-min-h"
        style={{ borderColor:'#4d4636', color:'#7fb4bc' }}>
        ⊡ Copy Assembly Plan to Clipboard
      </button>
    </div>
  );
}

export default AssemblyTab;
