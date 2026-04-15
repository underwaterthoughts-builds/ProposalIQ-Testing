import { useEffect, useState, memo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Card, ScoreRing, Stars, OutcomeLabel, Badge, Spinner, ProgressBar, Btn, Toast } from '../../components/ui';
import { useMode } from '../../lib/useMode';
import { useUser } from '../../lib/useUser';
import { formatMoney, currencySymbol } from '../../lib/format';
import { DebouncedInput, DebouncedTextarea, DebouncedSearch } from '../../lib/useDebounce';

const PRIORITY_COLOR = { high:'#b04030', med:'#b8962e', low:'#2d6b78' };

// ── RFP Taxonomy Bar — shows classification tags above the tabs ──────────
// Displays client_industry, service_industry and their sectors so the user
// can verify at a glance that the AI classified correctly. Each tag is
// clickable to correct via inline dropdown. Saves via PATCH to rfp_scans.
const RfpTaxonomyBar = memo(function RfpTaxonomyBar({ scan, rfpData, scanId }) {
  const [editing, setEditing] = useState(null); // 'client_industry' | 'service_industry' | null
  const [saving, setSaving] = useState(false);

  const clientIndustry = scan.client_industry || null;
  const serviceIndustry = scan.service_industry || null;

  // Load taxonomy items for dropdowns — lazy, only when editing
  const [taxItems, setTaxItems] = useState(null);
  useEffect(() => {
    if (editing && !taxItems) {
      fetch('/api/taxonomy').then(r => r.json()).then(d => setTaxItems(d.items || [])).catch(() => {});
    }
  }, [editing, taxItems]);

  async function saveTaxonomy(field, value) {
    setSaving(true);
    try {
      await fetch(`/api/rfp/${scanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_taxonomy', [field]: value }),
      });
      // Reload to pick up the change
      window.location.reload();
    } catch {}
    setSaving(false);
    setEditing(null);
  }

  const clientIndustries = (taxItems || []).filter(t => t.taxonomy_type === 'client' && t.category === 'Industry');
  const serviceIndustries = (taxItems || []).filter(t => t.taxonomy_type === 'service' && t.category === 'Industry');

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Client industry — gold accent */}
      {editing === 'client_industry' ? (
        <select
          autoFocus
          value={clientIndustry || ''}
          onChange={e => saveTaxonomy('client_industry', e.target.value)}
          onBlur={() => setEditing(null)}
          className="text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-full bg-surface-container-high text-primary border border-primary/30 outline-none"
        >
          <option value="">— Untagged —</option>
          {clientIndustries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
      ) : (
        <button
          onClick={() => setEditing('client_industry')}
          className={`px-3 py-1 text-[10px] font-label uppercase font-bold tracking-widest rounded-full border transition-colors flex items-center gap-1 hover:brightness-110 ${
            clientIndustry
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 border-dashed'
          }`}
          title="Click to change client industry"
          disabled={saving}
        >
          ◆ {clientIndustry || '+ Client sector'}
        </button>
      )}

      {/* Service industry — tertiary accent */}
      {editing === 'service_industry' ? (
        <select
          autoFocus
          value={serviceIndustry || ''}
          onChange={e => saveTaxonomy('service_industry', e.target.value)}
          onBlur={() => setEditing(null)}
          className="text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-full bg-surface-container-high text-tertiary border border-tertiary/30 outline-none"
        >
          <option value="">— Untagged —</option>
          {serviceIndustries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
      ) : (
        <button
          onClick={() => setEditing('service_industry')}
          className={`px-3 py-1 text-[10px] font-label uppercase font-bold tracking-widest rounded-full border transition-colors flex items-center gap-1 hover:brightness-110 ${
            serviceIndustry
              ? 'bg-tertiary-container/20 text-tertiary-container border-tertiary-container/20'
              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 border-dashed'
          }`}
          title="Click to change type of work"
          disabled={saving}
        >
          ◈ {serviceIndustry || '+ Type of work'}
        </button>
      )}
    </div>
  );
});

const CheckpointBanner = memo(function CheckpointBanner({ label, approved, onApprove, saving, children }) {
  if (approved) return (
    <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl text-sm" style={{ background:'rgba(61,92,58,.15)', border:'1px solid rgba(61,92,58,.2)' }}>
      <span style={{ color:'#7bd07a' }}>✓</span>
      <span className="font-medium" style={{ color:'#7bd07a' }}>{label} reviewed and approved</span>
    </div>
  );
  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{ border:'1.5px solid rgba(184,150,46,.4)', background:'rgba(232,195,87,.08)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold" style={{ color:'#e8c357' }}>⚑ Review checkpoint: {label}</div>
          <div className="text-xs mt-0.5" style={{ color:'#9a7820' }}>Review this output before proceeding. Approve to continue, or edit first.</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onApprove} disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60 no-min-h"
            style={{ background:'#3d5c3a' }}>
            {saving ? <><Spinner size={12}/> Saving…</> : '✓ Approve & Continue'}
          </button>
        </div>
      </div>
      {children && <div className="border-t px-4 py-3" style={{ borderColor:'rgba(184,150,46,.2)' }}>{children}</div>}
    </div>
  );
});

export default function RFPResults() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useUser();
  const { isQuick, isPro } = useMode();
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('brief');
  const [expandedMatches, setExpandedMatches] = useState({});
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [templateDraftMode, setTemplateDraftMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [clientIntel, setClientIntel] = useState(null);
  const [checkpoints, setCheckpoints] = useState({ rfp: false, gaps: false, strategy: false });
  const [editingRfp, setEditingRfp] = useState(false);
  const [rfpEditData, setRfpEditData] = useState(null);
  const [savingCheckpoint, setSavingCheckpoint] = useState(null);
  // Wave 3 — outcome capture state
  const [outcome, setOutcome] = useState(null);
  const [usageSummary, setUsageSummary] = useState({});
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchScan();
  }, [id]);

  // Load client intelligence when scan completes
  useEffect(() => {
    if (!scan?.rfp_data?.client || scan.rfp_data.client === 'Unknown') return;
    fetch(`/api/clients?name=${encodeURIComponent(scan.rfp_data.client)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.client || d?.projects?.length) setClientIntel(d); })
      .catch(() => {});
  }, [scan?.rfp_data?.client]);

  // Wave 3 — load existing outcome + usage summary once scan is complete
  useEffect(() => {
    if (!id || scan?.status !== 'complete') return;
    fetch(`/api/rfp/${id}/outcome`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setOutcome(d.outcome || null);
          setUsageSummary(d.usage_summary || {});
        }
      })
      .catch(() => {});
  }, [id, scan?.status]);

  // Wave 3 — fire-and-forget usage event logger. Used by passive hooks.
  function logUsage(eventType, opts = {}) {
    if (!id) return;
    fetch(`/api/rfp/${id}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        target_type: opts.target_type || null,
        target_id: opts.target_id || null,
        payload: opts.payload || null,
      }),
    }).catch(() => {});
  }

  async function saveOutcome(form) {
    try {
      const r = await fetch(`/api/rfp/${id}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { setToast('Failed to save outcome'); return; }
      setToast('✓ Outcome saved — thanks. This improves future ranking.');
      setShowOutcomeModal(false);
      // Refresh outcome state
      const fresh = await fetch(`/api/rfp/${id}/outcome`).then(x => x.json()).catch(() => null);
      if (fresh?.outcome) setOutcome(fresh.outcome);
    } catch (e) {
      setToast('Failed to save outcome');
    }
  }

  async function fetchScan() {
    const r = await fetch(`/api/rfp/${id}`);
    if (!r.ok) { setLoading(false); return; }
    const d = await r.json();
    setScan(d.scan);
    setLoading(false);
    // Keep polling on both processing (no data yet) and fast_ready
    // (verdict is shown but deep pass still running in background).
    if (d.scan.status === 'processing' || d.scan.status === 'fast_ready') {
      setTimeout(fetchScan, 3000);
    }
  }

  async function suppress(projectId) {
    await fetch(`/api/rfp/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'suppress', project_id:projectId }) });
    fetchScan();
    setToast('Project excluded from this scan');
  }

  async function deleteScan() {
    if (!confirm('Delete this scan permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/rfp/${id}`, { method: 'DELETE' });
      if (r.ok) { router.push('/rfp'); }
      else setToast('Delete failed');
    } catch { setToast('Delete failed'); }
    setDeleting(false);
  }

  async function rescan() {
    if (!confirm('Re-run the full intelligence pipeline against this RFP?\n\nExisting results stay visible until the new ones are ready (~60 seconds).')) return;
    setRescanning(true);
    try {
      const r = await fetch(`/api/rfp/${id}/rescan`, { method: 'POST' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setToast(d.error || 'Re-analysis failed to start');
        setRescanning(false);
        return;
      }
      setToast('Re-analysis started — refreshing every 3s…');
      // Update local scan state to reflect processing — fetchScan already polls
      setScan(s => s ? { ...s, status: 'processing' } : s);
      fetchScan();
    } catch (e) {
      setToast('Re-analysis failed: ' + e.message);
    }
    setRescanning(false);
  }

  async function generateTemplate(draftOverride) {
    const useDraft = draftOverride !== undefined ? draftOverride : templateDraftMode;
    if (draftOverride !== undefined) setTemplateDraftMode(draftOverride);
    logUsage(useDraft ? 'template_drafted' : 'template_generated', { target_type: 'briefing', target_id: id });
    setGeneratingTemplate(true);
    try {
      const r = await fetch(`/api/rfp/template?id=${id}&draft=${useDraft}`, { method: 'POST' });
      if (!r.ok) { const d = await r.json().catch(()=>({})); setToast(d.error || 'Template generation failed'); setGeneratingTemplate(false); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers.get('content-disposition');
      a.download = cd ? cd.split('filename="')[1]?.replace('"','') : 'proposal_template.docx';
      a.click();
      URL.revokeObjectURL(url);
      setToast('✓ Proposal template downloaded');
    } catch(e) { setToast('Template generation failed: ' + e.message); }
    setGeneratingTemplate(false);
  }

  async function exportBriefing() {
    logUsage('briefing_exported', { target_type: 'briefing', target_id: id });
    setExporting(true);
    const s = scan;
    const rd = rfpData;

    const sectionHtml = (title, content) => content ? `<div class="section"><h2>${title}</h2>${content}</div>` : '';

    const matchesHtml = (s.matched_proposals||[]).slice(0,8).map(m=>{
      const wq = m.ai_metadata?.writing_quality;
      return `<div class="match ${m.outcome}">
        <div class="match-header">
          <strong>${m.name}</strong>
          <span class="label ${m.outcome}">${m.outcome}</span>
          <span class="match-label">${m.match_label||'Match'}</span>
        </div>
        <div class="meta">${m.client} · ${m.sector} · ${formatMoney(m.contract_value, m.currency)} · ${m.date_submitted?.slice(0,4)||'?'}</div>
        ${wq?.overall_score?`<div class="scores">Writing: ${wq.overall_score}/100 · Approach: ${m.ai_metadata?.approach_quality?.overall_score||'—'}/100 · Credibility: ${m.ai_metadata?.credibility_signals?.overall_score||'—'}/100</div>`:''}
      </div>`;
    }).join('');

    const gapsHtml = (s.gaps||[]).map(g=>
      `<div class="gap priority-${g.priority}">
        <div class="gap-header"><span class="priority">[${(g.priority||'med').toUpperCase()}]</span> <strong>${g.title}</strong></div>
        <p>${g.description}</p>
        ${g.suggested_action?`<div class="action">→ ${g.suggested_action}${g.suggested_person?` — escalate to ${g.suggested_person}`:''}</div>`:''}
      </div>`
    ).join('');

    const strategyHtml = winStrategy ? `
      ${winStrategy.opening_narrative?`<div class="narrative"><strong>Opening Narrative:</strong> <em>"${winStrategy.opening_narrative}"</em></div>`:''}
      ${winStrategy.differentiator_angle?`<div class="differentiator"><strong>Differentiator:</strong> ${winStrategy.differentiator_angle}</div>`:''}
      <div class="two-col">
        <div>
          <h3>Priorities</h3>
          ${(winStrategy.priorities||[]).map(p=>`<div class="item positive">+ ${p.priority||p}${p.rationale?`<br/><small>${p.rationale}</small>`:''}</div>`).join('')}
        </div>
        <div>
          <h3>Risks to Mitigate</h3>
          ${(winStrategy.risks||[]).map(r=>`<div class="item negative">− ${r.risk||r}${r.mitigation?`<br/><small>${r.mitigation}</small>`:''}</div>`).join('')}
        </div>
      </div>
      <div class="two-col">
        <div><h3>Emphasise</h3>${(winStrategy.focus||[]).map(f=>`<div class="item">→ ${f}</div>`).join('')}</div>
        <div><h3>Avoid</h3>${(winStrategy.avoid||[]).map(a=>`<div class="item">✕ ${a}</div>`).join('')}</div>
      </div>
    ` : '';

    const languageHtml = (winningLanguage||[]).map(s=>
      `<div class="snippet">
        <blockquote>"${s.text}"</blockquote>
        <div class="snippet-meta">
          <span class="use-case">${s.use_case}</span>
          <span>${s.why_it_works}</span>
        </div>
        ${s.adaptation_note?`<div class="adapt">Adapt: ${s.adaptation_note}</div>`:''}
        ${s.source_proposal?`<div class="source">From: ${s.source_proposal}</div>`:''}
      </div>`
    ).join('');

    const approachHtml = scan.suggested_approach ? `
      ${(scan.suggested_approach.suggested_phases||[]).map(ph=>`
        <div class="phase">
          <h3>${ph.phase}: ${ph.name} <span class="duration">${ph.duration}</span></h3>
          <ul>${(ph.key_activities||[]).map(a=>`<li>${a}</li>`).join('')}</ul>
          <div class="rationale">${ph.rationale}</div>
        </div>`).join('')}
      ${scan.suggested_approach.indicative_budget?`
        <div class="budget">
          <h3>Indicative Budget</h3>
          <div class="budget-range">
            <span>Low: £${(scan.suggested_approach.indicative_budget.low||0).toLocaleString()}</span>
            <span>Mid: £${(scan.suggested_approach.indicative_budget.mid||0).toLocaleString()}</span>
            <span>High: £${(scan.suggested_approach.indicative_budget.high||0).toLocaleString()}</span>
          </div>
          <p>${scan.suggested_approach.indicative_budget.basis}</p>
        </div>`:''}
    ` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${s.name} — Bid Briefing</title>
<style>
  body{font-family:Georgia,serif;max-width:900px;margin:40px auto;padding:0 30px;color:#222;line-height:1.6}
  h1{font-size:24px;border-bottom:3px solid #1e4a52;padding-bottom:12px;color:#1e4a52}
  h2{font-size:16px;color:#1e4a52;margin:28px 0 12px;text-transform:uppercase;letter-spacing:.08em;font-family:monospace;font-size:11px}
  h3{font-size:14px;color:#333;margin:16px 0 8px}
  .section{margin-bottom:36px;padding-bottom:24px;border-bottom:1px solid #eee}
  .match{background:#f8f6f2;border-radius:6px;padding:12px;margin-bottom:10px;border-left:3px solid #ddd}
  .match.won{border-left-color:#3d5c3a}.match.lost{border-left-color:#b04030}
  .match-header{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .label{font-size:10px;font-family:monospace;padding:1px 6px;border-radius:3px;font-weight:bold}
  .label.won{background:#edf3ec;color:#3d5c3a}.label.lost{background:#faeeeb;color:#b04030}
  .match-label{font-size:10px;font-family:monospace;color:#888}
  .meta,.scores{font-size:12px;color:#666;margin:2px 0}
  .gap{background:#f8f6f2;border-radius:6px;padding:12px;margin-bottom:10px;border-left:3px solid #b8962e}
  .gap.priority-high{border-left-color:#b04030}.gap.priority-low{border-left-color:#3d5c3a}
  .priority{font-family:monospace;font-size:11px;font-weight:bold;color:#b8962e}
  .action{font-size:12px;color:#1e4a52;margin-top:6px;font-style:italic}
  .narrative{background:#1e4a52;color:white;padding:16px;border-radius:6px;margin-bottom:12px}
  .differentiator{background:#faf4e2;border:1px solid rgba(184,150,46,.3);padding:12px;border-radius:6px;margin-bottom:12px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px}
  .item{font-size:13px;padding:4px 0;border-bottom:1px solid #f0ebe0}
  .item small{color:#888;font-size:11px}
  .item.positive{color:#3d5c3a}.item.negative{color:#b04030}
  .phase{background:#f8f6f2;border-radius:6px;padding:14px;margin-bottom:10px}
  .duration{font-size:12px;color:#888;font-family:monospace;font-weight:normal}
  .rationale{font-size:12px;color:#666;font-style:italic;margin-top:6px}
  .budget{background:#e8f2f4;border-radius:6px;padding:14px;margin-top:10px}
  .budget-range{display:flex;gap:24px;font-family:monospace;font-weight:bold;margin:8px 0;font-size:16px}
  .snippet{background:#f8f6f2;border-radius:6px;padding:14px;margin-bottom:10px;border-left:3px solid #b8962e}
  blockquote{font-style:italic;margin:0 0 8px;font-size:14px;color:#333}
  .snippet-meta{display:flex;gap:12px;font-size:12px;color:#666;margin-bottom:4px}
  .use-case{background:#e8f2f4;color:#1e4a52;font-family:monospace;font-size:10px;padding:1px 6px;border-radius:3px}
  .adapt{font-size:12px;color:#b8962e;margin-top:4px}
  .source{font-size:11px;color:#aaa;margin-top:4px;font-family:monospace}
  @media print{.section{page-break-inside:avoid}}
</style></head><body>
<h1>${s.name}</h1>
<p style="color:#666;font-size:13px;margin-top:-8px">RFP Intelligence Briefing · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p>

${rd.client||rd.sector?`<div style="display:flex;gap:24px;margin:16px 0;font-size:13px">
  ${rd.client?`<span><strong>Client:</strong> ${rd.client}</span>`:''}
  ${rd.sector?`<span><strong>Sector:</strong> ${rd.sector}</span>`:''}
  ${rd.deadline?`<span><strong>Deadline:</strong> ${rd.deadline}</span>`:''}
</div>`:''}

${sectionHtml('Win Strategy', strategyHtml)}
${sectionHtml('Matched Proposals', matchesHtml)}
${sectionHtml('Opportunity Gaps', gapsHtml)}
${sectionHtml('Suggested Approach & Budget', approachHtml)}
${sectionHtml('Winning Language', languageHtml)}
</body></html>`;

    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${s.name.replace(/[^a-z0-9]/gi,'_')}_briefing.html`;
    a.click(); URL.revokeObjectURL(url);
    setToast('Briefing exported — open in browser and print to PDF');
    setExporting(false);
  }

  // Load checkpoint state — MUST be declared before any early returns to
  // satisfy the rules of hooks. Guarded by `if (!scan) return` inside the
  // effect body so it's a no-op until the scan finishes loading.
  useEffect(() => {
    if (!scan) return;
    setCheckpoints({
      rfp: !!scan.checkpoint_rfp_approved,
      gaps: !!scan.checkpoint_gaps_approved,
      strategy: !!scan.checkpoint_strategy_approved,
    });
    setRfpEditData(scan.rfp_data_edited || scan.rfp_data || {});
  }, [scan]);

  if (authLoading) return null;
  if (!user) return null;

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ background: '#1d1b19' }}>
      <div className="text-center"><Spinner size={32} /><p className="text-sm mt-3" style={{ color: '#d0c5b0' }}>Loading…</p></div>
    </div>
  );
  if (!scan) return <div className="p-8 text-center">Scan not found. <Link href="/rfp" className="underline">Back</Link></div>;

  async function approveCheckpoint(checkpoint, editedData) {
    setSavingCheckpoint(checkpoint);
    try {
      await fetch(`/api/rfp/checkpoint?id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpoint, edited_data: editedData || null }),
      });
      setCheckpoints(prev => ({ ...prev, [checkpoint]: true }));
      setToast(`✓ ${checkpoint === 'rfp' ? 'RFP extraction' : checkpoint === 'gaps' ? 'Gap analysis' : 'Win strategy'} approved`);
    } catch { setToast('Failed to save checkpoint'); }
    setSavingCheckpoint(null);
  }

  const rfpData = scan.rfp_data || {};
  const matches = scan.matched_proposals || [];
  const gaps = scan.gaps || [];
  const coverageData = scan.coverage_map || null;
  const coverageMapItems = coverageData?.map || [];
  const coverageSummary = coverageData?.summary || null;
  const news = scan.news || [];
  const team = scan.team_suggestions || [];
  const writingInsights = scan.writing_insights || [];
  const suggestedApproach = scan.suggested_approach || null;
  const winStrategy = scan.win_strategy || null;
  const winningLanguage = scan.winning_language || [];
  const narrativeText = scan.narrative_advice?.text || (typeof scan.narrative_advice === 'string' ? scan.narrative_advice : '') || '';
  const proposalStructure = scan.narrative_advice?.proposal_structure || null;
  const bidScore = scan.bid_score || null;
  const executiveBrief = scan.executive_brief || null;
  const goodMatchCount = matches.filter(m => m.outcome === 'won').length;

  const tabs = [
    { id:'brief', label:'Overview', badge: executiveBrief?.verdict?.decision ? '★' : null },
    { id:'matches', label:'Matched Proposals', count:matches.length },
    { id:'gaps', label:'Opportunity Gaps', count:gaps.length },
    { id:'writing', label:'Writing Insights', count:writingInsights.length },
    { id:'news', label:'Market Context', count:news.length },
    { id:'approach', label:'Suggested Approach', count:suggestedApproach?.suggested_phases?.length||0 },
    { id:'strategy', label:'Win Strategy', badge: winStrategy ? '⚡' : null },
    { id:'language', label:'Winning Language', count:winningLanguage.length },
    { id:'narrative', label:'Narrative Advice', badge: narrativeText ? '✎' : null },
    { id:'assembly', label:'Proposal Assembly', badge: '⊞' },
    { id:'document', label:'View RFP', badge: scan.rfp_filename ? '📄' : null },
    { id:'plaintext', label:'Plain Text', count: scan.rfp_text ? Math.round((scan.rfp_text.length || 0) / 1000) : 0 },
  ];

  // Quick view — uses the same ExecutiveBrief component as the Overview tab
  // in Pro mode, wrapped in a simple scroll layout. One shared component,
  // no duplication between Quick and Pro.
  if (isQuick) {
    return (
      <>
        <Head><title>{scan.name} — RFP Intelligence</title></Head>
        <Layout title={scan.name} user={user}>
          <div className="min-h-screen bg-surface px-6 md:px-8">
            {scan.status === 'processing' ? (
              <div className="py-24 text-center max-w-4xl mx-auto">
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="font-body text-sm mt-6 text-on-surface-variant">
                  Running intelligence pipeline — fast brief in ~60s…
                </p>
              </div>
            ) : (
              <ExecutiveBrief
                brief={executiveBrief}
                bidScore={bidScore}
                matches={matches}
                onJumpTab={null}
                scanName={scan.name}
                scanId={id}
                onExport={exportBriefing}
                onGenerateTemplate={generateTemplate}
                exporting={exporting}
                generatingTemplate={generatingTemplate}
              />
            )}
          </div>
        </Layout>
        <Toast msg={toast} onClose={() => setToast('')} />
      </>
    );
  }

  return (
    <>
      <Head><title>{scan.name} — RFP Intelligence</title></Head>
      <Layout title={scan.name} subtitle={rfpData.client?`${rfpData.client} · ${rfpData.sector}`:'RFP Intelligence'} user={user}
        actions={
          <div className="hidden md:flex gap-2">
            <a href={`/api/rfp/${id}/download`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] font-medium rounded-md border border-outline-variant hover:bg-surface-container-high transition-all"
              style={{ color: '#d0c5b0' }}>
              View RFP ↗
            </a>
            <Btn variant="ghost" onClick={exportBriefing} disabled={exporting}>
              {exporting ? <><Spinner size={12}/> Exporting…</> : '↓ Export briefing for your team'}
            </Btn>
            <Btn variant="teal" onClick={() => { setTemplateDraftMode(false); generateTemplate(); }} disabled={generatingTemplate}
              className="no-min-h px-3 py-1.5">
              {generatingTemplate && !templateDraftMode ? <><Spinner size={12}/> Building…</> : '📄 Template'}
            </Btn>
            <Btn variant="ghost" onClick={deleteScan} disabled={deleting}
              style={{ color:'#ffb4ab', borderColor:'#f5c6c0' }}>
              {deleting ? <><Spinner size={12}/> Deleting…</> : '✕ Delete Scan'}
            </Btn>
          </div>
        }>
        <div className="flex h-full overflow-hidden bg-surface">
          {/* Main */}
          <div className="flex-1 flex flex-col overflow-hidden md:border-r border-outline-variant/10">
            {(scan.status === 'processing' || scan.status === 'fast_ready') && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm border-b"
                style={{
                  background: scan.status === 'fast_ready' ? 'rgba(30,107,120,.15)' : 'rgba(232,195,87,.08)',
                  borderColor: scan.status === 'fast_ready' ? 'rgba(30,74,82,.25)' : 'rgba(184,150,46,.3)',
                  color: scan.status === 'fast_ready' ? '#1e4a52' : '#7a5800',
                }}>
                <Spinner size={14}/>
                <span className="flex-1">
                  {scan.status_detail || (scan.status === 'fast_ready'
                    ? 'Verdict ready — deep analysis running…'
                    : 'Starting intelligence pipeline…')}
                </span>
                <span className="text-[10px] font-mono opacity-60 flex-shrink-0">
                  {scan.status === 'fast_ready' ? 'deep pass' : 'fast pass'}
                </span>
              </div>
            )}
            {/* Wave 3 — outcome capture banner. Shown once scan is complete
                if no outcome has been captured yet, OR shows a small badge
                with the captured outcome if it exists. */}
            {scan.status === 'complete' && !outcome && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm border-b" style={{ background:'#1d1b19', borderColor:'#4d4636', color:'#e4c366' }}>
                <span style={{ fontSize: 16 }}>✦</span>
                <span className="flex-1">
                  How did this bid go? Capturing the outcome trains future ranking — won proposals get boosted in similar future scans.
                </span>
                <button onClick={() => setShowOutcomeModal(true)}
                  className="text-xs px-3 py-1.5 rounded font-medium"
                  style={{ background:'#1e4a52', color:'white' }}>
                  Capture outcome →
                </button>
              </div>
            )}
            {scan.status === 'complete' && outcome && (
              <div className="flex items-center gap-3 px-5 py-3 text-xs border-b" style={{
                background: outcome.outcome === 'won' ? 'rgba(61,92,58,.15)' : outcome.outcome === 'lost' ? 'rgba(176,64,48,.12)' : '#211f1d',
                borderColor: outcome.outcome === 'won' ? 'rgba(61,92,58,.25)' : outcome.outcome === 'lost' ? 'rgba(176,64,48,.25)' : '#4d4636',
                color: outcome.outcome === 'won' ? '#3d5c3a' : outcome.outcome === 'lost' ? '#b04030' : '#6b6456',
              }}>
                <span style={{ fontSize: 14 }}>
                  {outcome.outcome === 'won' ? '★' : outcome.outcome === 'lost' ? '✕' : '◌'}
                </span>
                <span className="font-mono uppercase tracking-wide">
                  Outcome: {outcome.outcome}
                  {outcome.piq_used_materially ? ' · ProposalIQ contributed' : ''}
                </span>
                <button onClick={() => setShowOutcomeModal(true)}
                  className="ml-auto text-[11px] underline opacity-70 hover:opacity-100">
                  edit
                </button>
              </div>
            )}
            {scan.status === 'deep_failed' && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm border-b" style={{ background:'rgba(176,64,48,.12)', borderColor:'rgba(176,64,48,.25)', color:'#ffb4ab' }}>
                <span style={{ fontSize: 16 }}>⚠</span>
                <span className="flex-1">
                  {scan.status_detail || 'Deep analysis failed after retries.'}{' '}
                  Fast verdict is available above; use Re-scan to try again.
                </span>
              </div>
            )}
            {scan.status === 'error' && (
              <div className="px-5 py-3 text-sm border-b" style={{ background:'rgba(176,64,48,.12)', borderColor:'rgba(176,64,48,.2)', color:'#ffb4ab' }}>
                <div className="font-semibold mb-1">⚠ Scan error</div>
                {scan.narrative_advice?.startsWith?.('Error:') && <div className="text-xs font-mono mb-1">{scan.narrative_advice}</div>}
                <div className="text-xs">Check terminal for details. Try setting <code>GEMINI_MODEL=gemini-2.0-flash</code> in .env.local and restarting.</div>
              </div>
            )}

            {/* RFP classification tags — shown inline in the breadcrumb
                header below; the editable dropdown bar is still available
                for correction via the tag chips (future enhancement). */}

            {/* Breadcrumb + Intelligence Workbench title + RFP Details + Actions */}
            <section className="px-6 md:px-8 py-6 bg-surface">

              {/* Top row: breadcrumb/title on the left, stacked buttons on the right */}
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-label text-on-surface-variant/50 uppercase tracking-widest mb-2">
                    <Link href="/rfp" className="hover:text-primary transition-colors">Intelligence</Link>
                    <span className="material-symbols-outlined text-xs">chevron_right</span>
                    <span className="text-on-surface truncate max-w-[240px]">{scan.name}</span>
                  </div>
                  <div className="flex items-baseline gap-4 mb-4 flex-wrap">
                    <h1 className="text-3xl md:text-4xl font-headline font-medium tracking-tight text-on-surface">
                      Intelligence Workbench
                    </h1>
                    {scan.analysis_model === 'gpt' ? (
                      <span
                        className="px-3 py-1 text-[10px] font-label font-bold tracking-widest bg-[#1f3a1c] text-[#7bd07a] border border-[#7bd07a]/30 rounded-full"
                        title="Full scan — analysed with OpenAI (deep reasoning)"
                      >
                        FULL SCAN
                      </span>
                    ) : (scan.status === 'complete' || scan.status === 'fast_ready') ? (
                      <span
                        className="px-3 py-1 text-[10px] font-label font-bold tracking-widest bg-secondary/10 text-secondary border border-secondary/20 rounded-full"
                        title="Quick scan — analysed with Gemini 2.5 Flash. Rescan with OpenAI configured for full thinking."
                      >
                        QUICK SCAN
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-label text-xs text-on-surface-variant uppercase">Active Tags:</span>
                    <RfpTaxonomyBar scan={scan} rfpData={rfpData} scanId={id} />
                  </div>

                  {scan.status === 'fast_ready' && (
                    <div className="mt-4 flex items-start gap-2 text-xs text-secondary bg-secondary/5 px-4 py-3 border-l-2 border-secondary">
                      <span className="material-symbols-outlined text-base flex-shrink-0 animate-pulse">sync</span>
                      <span>
                        <strong className="text-on-surface">Deep pass running.</strong>{' '}
                        Verdict and matches are ready; Opportunity Gaps, Win Strategy, Winning Language,
                        Suggested Approach, Narrative Advice and Proposal Assembly will populate over the next
                        2–3 minutes. Refresh the page if they don't appear after that.
                      </span>
                    </div>
                  )}
                  {scan.status === 'complete' && scan.analysis_model !== 'gpt' && (
                    <div className="mt-4 flex items-start gap-2 text-xs text-secondary bg-secondary/5 px-4 py-3 border-l-2 border-secondary">
                      <span className="material-symbols-outlined text-base flex-shrink-0">info</span>
                      <span>
                        <strong className="text-on-surface">Pipeline finished — quick scan only.</strong>{' '}
                        The deep tabs (Opportunity Gaps, Win Strategy, Winning Language, Suggested Approach,
                        Narrative Advice, Proposal Assembly) need OpenAI to generate quality content; on Gemini
                        alone they finish empty. Set <code className="px-1 bg-surface-container-highest text-primary">OPENAI_API_KEY</code> in
                        Railway, then click <strong className="text-on-surface">Rescan</strong> on this page to
                        regenerate everything.
                      </span>
                    </div>
                  )}
                </div>

                {/* Stacked action buttons */}
                <div className="flex flex-col gap-2 w-[140px] flex-shrink-0">
                  <button
                    onClick={rescan}
                    disabled={rescanning || scan?.status === 'processing'}
                    className="bg-primary text-on-primary px-4 py-3 text-[10px] font-label font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    title="Re-run the full intelligence pipeline"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    {rescanning || scan?.status === 'processing' ? 'Rescanning…' : 'Rescan'}
                  </button>
                  <Link
                    href="/rfp"
                    className="border border-outline/30 text-on-surface-variant px-4 py-3 text-[10px] font-label font-bold uppercase tracking-widest hover:bg-surface-container-high hover:text-on-surface transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    New Scan
                  </Link>
                </div>
              </div>

              {/* RFP Details strip — full-width horizontal row so the header
                  doesn't get taller than the Active Tags line. */}
              {(rfpData.client || rfpData.sector || rfpData.contract_value_hint || rfpData.deadline || rfpData.procurement_framework) && (
                <div className="mt-5 bg-surface-container-lowest px-5 py-3 flex flex-wrap gap-x-8 gap-y-3">
                  {[
                    ['Client', rfpData.client],
                    ['Sector', rfpData.sector],
                    ['Value hint', rfpData.contract_value_hint],
                    ['Deadline', rfpData.deadline],
                    ['Framework', rfpData.procurement_framework],
                  ]
                    .filter(([, v]) => v && v !== 'Unknown')
                    .map(([k, v]) => (
                      <div key={k} className="min-w-0 flex-1 md:flex-none md:max-w-[22%]">
                        <div className="font-label text-[9px] uppercase tracking-widest text-primary mb-1">{k}</div>
                        <div className="text-xs text-on-surface leading-snug line-clamp-2" title={v}>
                          {v}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* Tabs — Stitch editorial style */}
            <nav className="px-6 md:px-8 border-b border-outline-variant/10 bg-surface-container-low/30 overflow-x-auto flex">
              <div className="flex gap-6 md:gap-8">
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`py-4 text-xs font-label uppercase tracking-widest whitespace-nowrap transition-colors flex items-center gap-2 ${
                      activeTab === t.id
                        ? 'text-primary border-b-2 border-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                        t.id === 'gaps' ? 'bg-error/20 text-error' :
                        t.id === 'writing' ? 'bg-secondary/20 text-secondary' :
                        'bg-primary/15 text-primary'
                      }`}>{t.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </nav>

            {/* Mobile action strip */}
            <div className="md:hidden flex gap-2 px-3 py-2 border-b bg-surface-container flex-shrink-0" style={{ borderColor:'#2b2a27' }}>
              <button onClick={exportBriefing} disabled={exporting}
                className="flex-1 py-2 text-xs font-medium rounded-lg border" style={{ borderColor:'#4d4636', color:'#d0c5b0' }}>
                {exporting ? 'Exporting…' : '↓ Export'}
              </button>
              <button onClick={generateTemplate} disabled={generatingTemplate}
                className="flex-1 py-2 text-xs font-medium rounded-lg text-white" style={{ background:'#1e4a52' }}>
                {generatingTemplate ? 'Building…' : '📄 Template'}
              </button>
              <button onClick={rescan} disabled={rescanning || scan?.status === 'processing'}
                className="px-3 py-2 text-xs font-medium rounded-lg border" style={{ borderColor:'#4d4636', color:'#7fb4bc' }}
                title="Re-analyse">
                {rescanning || scan?.status === 'processing' ? '…' : '⟳'}
              </button>
              <button onClick={deleteScan} disabled={deleting}
                className="px-3 py-2 text-xs font-medium rounded-lg border" style={{ borderColor:'#f5c6c0', color:'#ffb4ab' }}>
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-surface-container-lowest">
              {scan.status === 'processing' ? (
                <div className="py-16 text-center"><Spinner size={32}/><p className="text-sm mt-4" style={{ color:'#d0c5b0' }}>Running intelligence pipeline — fast brief in ~60s…</p></div>
              ) : (() => {
                // Deep-pass tabs depend on output the deep pass produces
                // after the fast brief lands. If the user opens one of
                // these while the deep pass is still running, show a
                // spinner with the live status_detail rather than an
                // empty state — much clearer that the data is on its
                // way and not missing.
                const deepReady = scan.status === 'complete' || scan.status === 'deep_failed';
                const deepPassTabs = ['gaps', 'writing', 'news', 'approach', 'strategy', 'language', 'narrative', 'assembly'];
                if (!deepReady && deepPassTabs.includes(activeTab)) {
                  const labels = {
                    gaps: 'Opportunity Gaps',
                    writing: 'Writing Insights',
                    news: 'Market Context',
                    approach: 'Suggested Approach',
                    strategy: 'Win Strategy',
                    language: 'Winning Language',
                    narrative: 'Narrative Advice',
                    assembly: 'Proposal Assembly',
                  };
                  return (
                    <div className="py-16 text-center">
                      <Spinner size={28}/>
                      <p className="text-sm mt-4" style={{ color:'#d0c5b0' }}>
                        Generating {labels[activeTab] || 'this section'} — usually 2–3 minutes.
                      </p>
                      {scan.status_detail && (
                        <p className="text-[11px] mt-2 font-mono" style={{ color:'#99907d' }}>
                          {scan.status_detail}
                        </p>
                      )}
                    </div>
                  );
                }
                return null;
              })() || (activeTab === 'brief' ? (
                <ExecutiveBrief brief={executiveBrief} bidScore={bidScore} matches={matches} onJumpTab={setActiveTab} scanName={scan.name} scanId={id} />
              ) : activeTab === 'matches' ? (
                <div>
                  {isPro && (
                    <CheckpointBanner
                      label="RFP extraction"
                      approved={checkpoints.rfp}
                      onApprove={() => approveCheckpoint('rfp')}
                      saving={savingCheckpoint === 'rfp'}
                    />
                  )}
                  <p className="text-sm mb-4" style={{ color:'#d0c5b0' }}>
                    {scan.status_detail === 'awaiting_rfp_review' && isPro
                      ? '⚑ Approve the RFP extraction above before gap analysis runs.'
                      : 'Grouped by industry fit. Direct matches are at the top; cross-sector references are hidden by default — click to reveal.'}
                  </p>
                  {matches.length === 0 ? (
                    <div className="text-center py-12"><p className="text-sm" style={{ color:'#d0c5b0' }}>No matches found. Add more proposals to your repository.</p></div>
                  ) : (
                    <TieredMatches
                      matches={matches}
                      expandedMatches={expandedMatches}
                      setExpandedMatches={setExpandedMatches}
                      suppress={suppress}
                      setToast={setToast}
                      onLog={logUsage}
                    />
                  )}
                </div>
              ) : activeTab === 'gaps' ? (
                <div>
                  {isPro && (
                    <CheckpointBanner
                      label="Gap analysis"
                      approved={checkpoints.gaps}
                      onApprove={() => approveCheckpoint('gaps')}
                      saving={savingCheckpoint === 'gaps'}
                    />
                  )}

                  {/* COVERAGE MAP — shown first, before gaps */}
                  {coverageMapItems.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-baseline justify-between mb-3">
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#7fb4bc' }}>Requirements coverage</div>
                          <p className="text-xs mt-0.5" style={{ color: '#d0c5b0' }}>For each requirement, do we have evidence from our matched proposals?</p>
                        </div>
                        {coverageSummary && (
                          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full"
                            style={{
                              background: (coverageSummary.coverage_percentage || 0) >= 80 ? 'rgba(61,92,58,.15)' :
                                (coverageSummary.coverage_percentage || 0) >= 60 ? 'rgba(232,195,87,.08)' : 'rgba(176,64,48,.12)',
                              color: (coverageSummary.coverage_percentage || 0) >= 80 ? '#3d5c3a' :
                                (coverageSummary.coverage_percentage || 0) >= 60 ? '#8a6200' : '#b04030',
                            }}>
                            {coverageSummary.coverage_percentage || 0}% covered
                          </span>
                        )}
                      </div>
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#4d4636', background: '#211f1d' }}>
                        {coverageMapItems.map((item, i) => {
                          const icon = item.status === 'covered' ? '✓' : item.status === 'partial' ? '◐' : '✕';
                          const color = item.status === 'covered' ? '#3d5c3a' : item.status === 'partial' ? '#b8962e' : '#b04030';
                          return (
                            <div key={i} className="flex items-start gap-2.5 px-4 py-2.5 border-b last:border-0 text-xs" style={{ borderColor: '#2b2a27' }}>
                              <span className="flex-shrink-0 font-bold mt-0.5" style={{ color }}>{icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-mono text-[10px] flex-shrink-0 uppercase"
                                    style={{ color: item.priority === 'must' ? '#b04030' : '#6b6456' }}>
                                    [{item.priority}]
                                  </span>
                                  <span style={{ color: '#e6e2de' }}>{item.requirement}</span>
                                </div>
                                <div className="text-[11px]" style={{ color: '#d0c5b0' }}>
                                  {item.evidence_summary}
                                  {item.evidence_from && (
                                    <span className="font-mono ml-1" style={{ color: '#7fb4bc' }}>
                                      — {item.evidence_from}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {coverageSummary && (
                        <div className="flex gap-4 mt-2 text-[10px] font-mono" style={{ color: '#99907d' }}>
                          <span>{coverageSummary.covered || 0} covered</span>
                          <span>{coverageSummary.partial || 0} partial</span>
                          <span>{coverageSummary.not_covered || 0} not covered</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* GAPS — derived from the coverage map's not_covered + partial items */}
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#ffb4ab' }}>Opportunity gaps</div>
                      <p className="text-xs mt-0.5" style={{ color: '#d0c5b0' }}>Material gaps that would affect win probability, with suggested actions.</p>
                    </div>
                  </div>
                  {gaps.length === 0 ? <div className="text-center py-8"><p className="text-sm" style={{ color:'#d0c5b0' }}>No material gaps identified.</p></div>
                  : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {gaps.map((g, i) => <GapCard key={i} gap={g} />)}
                    </div>}
                </div>
              ) : activeTab === 'writing' ? (
                <div>
                  <p className="text-sm mb-4" style={{ color:'#d0c5b0' }}>Writing quality analysis across your top matched proposals. Cross-sector matches are included when their writing approach is transferable — the content differs but the technique may be useful.</p>
                  {writingInsights.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">✍</div>
                      <p className="text-sm" style={{ color:'#d0c5b0' }}>No writing analysis available. This appears for proposals indexed with writing quality scanning enabled.</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary table */}
                      <div className="bg-surface-container rounded-lg border overflow-hidden mb-4" style={{ borderColor:'#4d4636' }}>
                        <div className="grid text-[10px] font-mono uppercase tracking-widest px-4 py-2" style={{ gridTemplateColumns:'1fr 80px 80px 80px 100px', background:'#2b2a27', color:'#d0c5b0' }}>
                          <span>Proposal</span><span className="text-center">Writing</span><span className="text-center">Approach</span><span className="text-center">Credibility</span><span className="text-center">Outcome</span>
                        </div>
                        {writingInsights.map(w => {
                          const isCrossSector = w.taxonomy_tier >= 4 || w.taxonomy_match === 'cross';
                          const relevanceHint = isCrossSector
                            ? (w.match_explanation?.recommended_use || 'Different sector — included for writing technique, not content relevance')
                            : null;
                          return (
                            <div key={w.project_id} className="border-t" style={{ borderColor:'#2b2a27' }}>
                              <Link href={`/repository/${w.project_id}`}
                                className="grid items-center px-4 py-3 hover:bg-surface-container-high transition-colors text-sm"
                                style={{ gridTemplateColumns:'1fr 80px 80px 80px 100px' }}>
                                <span className="font-medium truncate">{w.project_name}</span>
                                <span className="text-center font-mono" style={{ color:w.writing_score>=75?'#3d5c3a':w.writing_score>=55?'#b8962e':'#b04030' }}>{w.writing_score||'—'}</span>
                                <span className="text-center font-mono" style={{ color:(w.approach_score||0)>=75?'#3d5c3a':(w.approach_score||0)>=55?'#b8962e':'#b04030' }}>{w.approach_score||'—'}</span>
                                <span className="text-center font-mono" style={{ color:(w.credibility_score||0)>=75?'#3d5c3a':(w.credibility_score||0)>=55?'#b8962e':'#b04030' }}>{w.credibility_score||'—'}</span>
                                <span className="text-center"><OutcomeLabel outcome={w.outcome}/></span>
                              </Link>
                              {relevanceHint && (
                                <div className="px-4 pb-2 text-[11px] italic flex items-start gap-1.5" style={{ color: '#99907d' }}>
                                  <span className="flex-shrink-0">◌</span>
                                  <span>Different industry — shown because the <strong>writing approach</strong> is transferable: {relevanceHint}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Evidence density highlights */}
                      {writingInsights.filter(w=>w.evidence_density).slice(0,2).map(w => {
                        const isCross = w.taxonomy_tier >= 4 || w.taxonomy_match === 'cross';
                        return (
                        <div key={w.project_id + '_ev'} className="rounded-lg p-4 mb-3 border" style={{ borderColor:'#4d4636' }}>
                          {isCross && (
                            <div className="text-[10px] italic mb-2 px-2 py-1 rounded" style={{ background: '#211f1d', color: '#99907d' }}>
                              ◌ Different industry — analyse the writing technique, not the subject matter
                            </div>
                          )}
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium">{w.project_name}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}>
                                Evidence score: {w.evidence_density.evidence_score}/100
                              </span>
                              {w.style_classification && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#2b2a27', color:'#d0c5b0' }}>
                                  {w.style_classification.primary_style}
                                </span>
                              )}
                            </div>
                          </div>
                          {w.evidence_density.strongest_evidence && (
                            <p className="text-xs mb-1" style={{ color:'#7bd07a' }}>✓ {w.evidence_density.strongest_evidence}</p>
                          )}
                          {w.evidence_density.improvement_priority && (
                            <p className="text-xs" style={{ color:'#b8962e' }}>△ {w.evidence_density.improvement_priority}</p>
                          )}
                        </div>
                        );
                      })}

                      {/* Win indicators */}
                      {writingInsights.filter(w=>w.outcome==='won'&&w.win_indicators?.length>0).slice(0,2).map(w => {
                        const isCross = w.taxonomy_tier >= 4 || w.taxonomy_match === 'cross';
                        return (
                        <Card key={w.project_id} className="p-4 mb-3" style={{ background:'rgba(61,92,58,.15)', border:'1px solid rgba(61,92,58,.2)' }}>
                          {isCross && (
                            <div className="text-[10px] italic mb-2 px-2 py-1 rounded" style={{ background: 'rgba(61,92,58,.08)', color: '#6b8a64' }}>
                              ◌ Different industry — these win indicators reflect writing technique and positioning approach, not sector-specific content
                            </div>
                          )}
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#7bd07a' }}>Win Indicators — {w.project_name}</div>
                          {w.win_indicators.map((ind, i) => <div key={i} className="text-xs mb-1 flex gap-2"><span style={{ color:'#7bd07a' }}>↑</span>{ind}</div>)}
                          {w.standout_sentences?.slice(0,1).map((s, i) => <blockquote key={i} className="text-xs italic border-l-2 pl-3 mt-2" style={{ borderColor:'#7bd07a', color:'#7bd07a' }}>"{s}"</blockquote>)}
                        </Card>
                        );
                      })}
                    </>
                  )}
                </div>
              ) : activeTab === 'news' ? (
                <MarketContext news={news} />
              ) : activeTab === 'approach' ? (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color:'#d0c5b0' }}>A suggested delivery approach and indicative budget grounded in your matched won proposals and rate card.</p>
                  {!suggestedApproach ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">◈</div>
                      <p className="text-sm mb-1" style={{ color:'#d0c5b0' }}>No suggested approach available for this scan.</p>
                      <p className="text-xs" style={{ color:'#99907d' }}>This requires at least one matched proposal in your repository. Add proposals and re-run the scan.</p>
                    </div>
                  ) : (
                    <>
                      {suggestedApproach.recommended_approach && (
                        <div className="rounded-xl p-5" style={{ background:'#1e4a52', color:'white' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2 opacity-70">Recommended Approach</div>
                          <p className="text-sm leading-relaxed">{suggestedApproach.recommended_approach}</p>
                        </div>
                      )}

                      {(suggestedApproach.suggested_phases||[]).length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {suggestedApproach.suggested_phases.map((ph, i) => (
                            <Card key={i} className="p-4">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color:'#d0c5b0' }}>{ph.phase}</div>
                                  <div className="font-semibold text-sm mt-0.5">{ph.name}</div>
                                </div>
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded flex-shrink-0" style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}>{ph.duration}</span>
                              </div>
                              {ph.rationale && <p className="text-xs mb-3 italic leading-relaxed" style={{ color:'#d0c5b0' }}>{ph.rationale}</p>}
                              {(ph.key_activities||[]).length > 0 && (
                                <div className="space-y-1">
                                  {ph.key_activities.map((a, j) => (
                                    <div key={j} className="flex gap-2 text-xs"><span style={{ color:'#7fb4bc' }}>→</span><span>{a}</span></div>
                                  ))}
                                </div>
                              )}
                              {(ph.team_roles||[]).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {ph.team_roles.map((r, j) => <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background:'#2b2a27', color:'#d0c5b0' }}>{r}</span>)}
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}

                      {suggestedApproach.indicative_budget && (
                        <Card className="p-5">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#d0c5b0' }}>Indicative Budget</div>
                          <div className="grid grid-cols-3 gap-4 mb-3">
                            {[['Low', suggestedApproach.indicative_budget.low], ['Mid', suggestedApproach.indicative_budget.mid], ['High', suggestedApproach.indicative_budget.high]].map(([label, val]) => (
                              <div key={label} className="text-center rounded-lg p-3" style={{ background:'#211f1d' }}>
                                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#d0c5b0' }}>{label}</div>
                                <div className="font-mono font-bold text-lg" style={{ color:'#7fb4bc' }}>
                                  {currencySymbol(suggestedApproach.indicative_budget.currency)}{((val||0)/1000).toFixed(0)}K
                                </div>
                              </div>
                            ))}
                          </div>
                          {suggestedApproach.indicative_budget.basis && (
                            <p className="text-xs leading-relaxed" style={{ color:'#d0c5b0' }}>{suggestedApproach.indicative_budget.basis}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] font-mono" style={{ color:'#99907d' }}>
                              Confidence: {suggestedApproach.indicative_budget.confidence || 'medium'}
                            </span>
                          </div>
                        </Card>
                      )}

                      {(suggestedApproach.key_risks||[]).length > 0 && (
                        <Card className="p-4">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#d0c5b0' }}>Key Risks</div>
                          <div className="space-y-1">
                            {suggestedApproach.key_risks.map((r, i) => (
                              <div key={i} className="flex gap-2 text-xs"><span style={{ color:'#ffb4ab' }}>△</span><span>{r}</span></div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {(suggestedApproach.differentiators_to_emphasise||[]).length > 0 && (
                        <Card className="p-4">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#d0c5b0' }}>Differentiators to Emphasise</div>
                          <div className="space-y-1">
                            {suggestedApproach.differentiators_to_emphasise.map((d, i) => (
                              <div key={i} className="flex gap-2 text-xs"><span style={{ color:'#7bd07a' }}>✓</span><span>{d}</span></div>
                            ))}
                          </div>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              ) : activeTab === 'strategy' ? (
                <div className="space-y-4">
                  {isPro && (
                    <CheckpointBanner
                      label="Win strategy"
                      approved={checkpoints.strategy}
                      onApprove={() => approveCheckpoint('strategy')}
                      saving={savingCheckpoint === 'strategy'}
                    />
                  )}
                  <p className="text-sm" style={{ color:'#d0c5b0' }}>Based on your matched won proposals and identified gaps — specific actions to improve your chances of winning this bid.</p>
                  {!winStrategy ? (
                    <div className="text-center py-12"><div className="text-3xl mb-3 opacity-25">⚡</div><p className="text-sm" style={{ color:'#d0c5b0' }}>Win strategy not available for this scan. Re-run the scan to generate one.</p></div>
                  ) : (
                    <>
                      {/* Opening narrative */}
                      {winStrategy.opening_narrative && (
                        <div className="rounded-lg p-4" style={{ background:'#1e4a52', color:'white' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2 opacity-70">Suggested Opening Narrative</div>
                          <p className="text-sm leading-relaxed italic">"{winStrategy.opening_narrative}"</p>
                        </div>
                      )}

                      {/* Differentiator angle */}
                      {winStrategy.differentiator_angle && (
                        <div className="rounded-lg p-4 border" style={{ background:'rgba(232,195,87,.08)', borderColor:'rgba(184,150,46,.3)' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#e8c357' }}>Differentiator Angle</div>
                          <p className="text-sm" style={{ color:'#e4c366' }}>{winStrategy.differentiator_angle}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top priorities */}
                        {(winStrategy.priorities||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'rgba(61,92,58,.15)', borderColor:'rgba(61,92,58,.2)' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#7bd07a' }}>Top Priorities</div>
                            {winStrategy.priorities.map((p, i) => (
                              <div key={i} className="mb-3 last:mb-0">
                                <div className="flex gap-2 text-xs mb-1">
                                  <span className="font-bold flex-shrink-0" style={{ color:'#7bd07a' }}>+</span>
                                  <span className="font-semibold">{p.priority || p}</span>
                                </div>
                                {p.rationale && <p className="text-xs pl-4" style={{ color:'#7bd07a' }}>{p.rationale}</p>}
                                {p.evidence && <p className="text-[10px] pl-4 italic mt-0.5" style={{ color:'#6b8a68' }}>Evidence: {p.evidence}</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Risks */}
                        {(winStrategy.risks||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'rgba(176,64,48,.12)', borderColor:'rgba(176,64,48,.2)' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#ffb4ab' }}>Risks to Mitigate</div>
                            {winStrategy.risks.map((r, i) => (
                              <div key={i} className="mb-3 last:mb-0">
                                <div className="flex gap-2 text-xs mb-1">
                                  <span className="font-bold flex-shrink-0" style={{ color:'#ffb4ab' }}>−</span>
                                  <span className="font-semibold">{r.risk || r}</span>
                                </div>
                                {r.mitigation && <p className="text-xs pl-4" style={{ color:'#ffb4ab' }}>{r.mitigation}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Focus */}
                        {(winStrategy.focus||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'rgba(30,107,120,.15)', borderColor:'rgba(30,74,82,.2)' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#7fb4bc' }}>Emphasise These</div>
                            {winStrategy.focus.map((f, i) => (
                              <div key={i} className="flex gap-2 text-xs mb-1.5"><span style={{ color:'#7fb4bc' }}>→</span><span>{f}</span></div>
                            ))}
                          </div>
                        )}

                        {/* Avoid */}
                        {(winStrategy.avoid||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'#211f1d', borderColor:'#4d4636' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#d0c5b0' }}>Avoid These</div>
                            {winStrategy.avoid.map((a, i) => (
                              <div key={i} className="flex gap-2 text-xs mb-1.5"><span style={{ color:'#ffb4ab' }}>✕</span><span>{a}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : activeTab === 'language' ? (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color:'#d0c5b0' }}>High-performing language extracted from your won proposals. Specific, evidence-based sentences that can be adapted for this bid.</p>
                  {winningLanguage.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">✍</div>
                      <p className="text-sm mb-1" style={{ color:'#d0c5b0' }}>No winning language available.</p>
                      <p className="text-xs" style={{ color:'#99907d' }}>This requires won proposals rated 4+ stars with writing analysis completed. Run Re-analyse on your best proposals first.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {winningLanguage.map((s, i) => (
                        <div key={i} className="rounded-lg border overflow-hidden" style={{ background:'#211f1d', borderColor:'#4d4636' }}>
                          <div className="p-4">
                          <blockquote className="text-sm italic leading-relaxed border-l-3 pl-3 mb-3" style={{ borderLeft:'3px solid #e8c357', color:'#e6e2de' }}>
                            "{s.text}"
                          </blockquote>
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#d0c5b0' }}>Why it works</div>
                              <p className="text-xs" style={{ color:'#d0c5b0' }}>{s.why_it_works}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#d0c5b0' }}>Use in</div>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}>{s.use_case}</span>
                            </div>
                          </div>
                          {s.source_proposal && <div className="text-[10px] font-mono mt-2 pt-2 border-t" style={{ color:'#99907d', borderColor:'#2b2a27' }}>From: {s.source_proposal}</div>}
                          {s.adaptation_note && (
                            <div className="mt-2 pt-2 border-t" style={{ borderColor:'#2b2a27' }}>
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#b8962e' }}>How to adapt</div>
                              <p className="text-xs" style={{ color:'#e8c357' }}>{s.adaptation_note}</p>
                            </div>
                          )}
                        </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'narrative' ? (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color:'#d0c5b0' }}>
                    Specific narrative structure advice for this bid — grounded in your best matched proposals.
                  </p>
                  {!scan.narrative_advice || scan.narrative_advice.startsWith('Error:') ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">✎</div>
                      <p className="text-sm" style={{ color:'#d0c5b0' }}>No narrative advice available for this scan.</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl p-5" style={{ background:'#1e4a52', color:'white' }}>
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-3 opacity-70">Bid Strategist Advice</div>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{narrativeText}</p>
                      </div>

                      {proposalStructure && (
                        <div className="rounded-xl p-5 border" style={{ background:'#1d1b19', borderColor:'#4d4636' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#d0c5b0' }}>
                            Recommended Proposal Structure — from {goodMatchCount || 'your'} won proposals
                          </div>
                          {proposalStructure.narrative_arc && (
                            <p className="text-sm mb-4 italic" style={{ color:'#d0c5b0' }}>{proposalStructure.narrative_arc}</p>
                          )}
                          {proposalStructure.recommended_section_order?.length > 0 && (
                            <div className="mb-4">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#99907d' }}>Section Order</div>
                              <div className="flex flex-wrap gap-2">
                                {proposalStructure.recommended_section_order.map((s, i) => (
                                  <span key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}>
                                    <span className="font-mono text-[10px] opacity-60">{i+1}</span> {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {proposalStructure.apply_to_this_bid && (
                            <div className="rounded-lg p-3 text-xs" style={{ background:'rgba(232,195,87,.08)', color:'#e8c357' }}>
                              <span className="font-semibold">For this bid: </span>{proposalStructure.apply_to_this_bid}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Writing insights from matched proposals */}
                      {writingInsights.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#d0c5b0' }}>
                            Writing Quality — Top Matched Proposals
                          </div>
                          <div className="space-y-2">
                            {writingInsights.map((w, i) => (
                              <div key={i} className="rounded-lg p-3 border flex items-center gap-4"
                                style={{ background:'#211f1d', borderColor:'#4d4636' }}>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{w.project_name}</div>
                                  <div className="text-xs mt-0.5" style={{ color: w.outcome==='won'?'#3d5c3a':'#b04030' }}>
                                    {w.outcome} · {w.match_label}
                                  </div>
                                </div>
                                <div className="flex gap-4 flex-shrink-0 text-xs font-mono">
                                  {[['Writing', w.writing_score], ['Approach', w.approach_score], ['Credibility', w.credibility_score]].map(([lbl, score]) => (
                                    <div key={lbl} className="text-center">
                                      <div className="font-bold" style={{ color: score>=75?'#3d5c3a':score>=55?'#b8962e':'#b04030' }}>{score||'—'}</div>
                                      <div style={{ color:'#99907d' }}>{lbl}</div>
                                    </div>
                                  ))}
                                </div>
                                {w.standout_sentences?.length > 0 && (
                                  <div className="text-xs italic max-w-xs truncate" style={{ color:'#d0c5b0' }}>
                                    "{w.standout_sentences[0]}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : activeTab === 'assembly' ? (
                <AssemblyTab scan={scan} matches={matches} winStrategy={winStrategy} suggestedApproach={suggestedApproach} onToast={setToast}
                  onGenerateTemplate={generateTemplate} onExportBriefing={exportBriefing}
                  generatingTemplate={generatingTemplate} templateDraftMode={templateDraftMode}
                  setTemplateDraftMode={setTemplateDraftMode} exporting={exporting} />
              ) : activeTab === 'document' ? (
                <RfpDocumentTab scan={scan} />
              ) : activeTab === 'plaintext' ? (
                <RfpPlainTextTab scan={scan} />
              ) : (
                <div className="text-center py-12"><p className="text-sm" style={{ color:'#d0c5b0' }}>Select a tab above.</p></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
      {showOutcomeModal && (
        <OutcomeCaptureModal
          existing={outcome}
          usageSummary={usageSummary}
          scanName={scan.name}
          onSave={saveOutcome}
          onClose={() => setShowOutcomeModal(false)}
        />
      )}
    </>
  );
}


// ── Section Draft Panel — Wave 4 source-linked drafting ──────────────────
// Inline panel that appears below a section in the Assembly tab when the
// user has generated a draft. Shows:
//   · Confidence badge (high/medium/low) with the model's reason
//   · Editable draft text with [#1] and [EVIDENCE NEEDED:...] highlighting
//   · "Sources used" panel listing the matched proposals + winning language
//     snippets the model cited (clickable in the matches case)
//   · Edit / Regenerate / Accept / Discard controls
//
// Source links: the draft text uses [#1] [#2] markers — the panel resolves
// these to the actual proposals from the matches array via index. We
// preserve the markers in the editable text rather than rewriting them
// inline so the writer always sees what was cited.
// Compact footer showing how many silent QA corrections were applied to
// this draft before the user saw it. Expandable to show the change log.
// Quiet when the count is 0.
const QaAdjustmentsFooter = memo(function QaAdjustmentsFooter({ adjustments, count }) {
  const [open, setOpen] = useState(false);
  const n = typeof count === 'number' ? count : (Array.isArray(adjustments) ? adjustments.length : 0);
  if (!n || n === 0) return null;
  const list = Array.isArray(adjustments) ? adjustments : [];
  return (
    <div className="mb-3 text-[11px]">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        title="Pre-delivery QA applied these adjustments before you saw the draft"
      >
        <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
        <span>{n} QA adjustment{n === 1 ? '' : 's'} applied</span>
        <span className="material-symbols-outlined text-[14px] opacity-70">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && list.length > 0 && (
        <ul className="mt-2 pl-4 space-y-1 text-on-surface-variant">
          {list.map((a, i) => (
            <li key={i} className="leading-relaxed">
              <span className="font-label text-[9px] uppercase tracking-widest text-outline mr-2">{a.type || 'fix'}</span>
              {a.summary || ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const SectionDraftPanel = memo(function SectionDraftPanel({ draft, matches, winningLanguage, onUpdateText, onAccept, onRegenerate, onDiscard, onClose, regenerating }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.draft_text || '');
  const [saving, setSaving] = useState(false);

  // Sync text when draft changes (e.g. after regenerate)
  useEffect(() => { setText(draft.draft_text || ''); }, [draft.id, draft.draft_text]);

  // Resolve cited matches: the AI returns the IDs it actually cited.
  // Match those against the matches array to get the names/details.
  const citedMatches = (draft.cited_match_ids || [])
    .map(id => matches.find(m => m.id === id))
    .filter(Boolean);

  // Resolve cited language by L-index — winningLanguage is an array
  const citedLanguage = (draft.cited_language_ids || [])
    .map(id => {
      const idx = parseInt(String(id).replace(/^L/i, ''), 10) - 1;
      return idx >= 0 && idx < (winningLanguage || []).length ? winningLanguage[idx] : null;
    })
    .filter(Boolean);

  const confColor = draft.confidence === 'high' ? '#3d5c3a' :
                    draft.confidence === 'low'  ? '#b04030' : '#b8962e';
  const isAccepted = draft.status === 'accepted';

  async function handleSaveEdits() {
    setSaving(true);
    await onUpdateText(text);
    setSaving(false);
    setEditing(false);
  }

  // Build a list of past project + client name tokens we want to
  // highlight in the draft prose so the user can spot every reference
  // at a glance and verify it's the right one. Sorted longest-first so
  // multi-word names match before any subset of those words.
  const refTokens = (() => {
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
    return tokens.sort((a, b) => b.length - a.length);
  })();
  const refRegex = refTokens.length > 0
    ? new RegExp('(' + refTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi')
    : null;

  // Highlighting helper — wraps [#N] match citations, [EVIDENCE NEEDED],
  // [TBC: ...] markers AND any reference to a past client / project name
  // in coloured spans so the writer can see at a glance what's a
  // placeholder vs a real reference, and verify each citation.
  function renderHighlighted(t) {
    if (!t) return null;
    const parts = t.split(/(\[#\d+\]|\[EVIDENCE NEEDED[^\]]*\]|\[TBC[^\]]*\])/g);
    return parts.map((part, i) => {
      if (/^\[#\d+\]$/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(30,74,82,.12)', color: '#7fb4bc' }}>{part}</span>;
      }
      if (/^\[EVIDENCE NEEDED/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(184,150,46,.18)', color: '#e8c357' }}>{part}</span>;
      }
      if (/^\[TBC/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(255,180,171,.18)', color: '#ffb4ab' }} title="Team role to assign — open the team page or edit inline">{part}</span>;
      }
      // Reference name highlighting — break the prose down further by ref
      // tokens. Tinted purple to distinguish from the marker colours.
      if (refRegex) {
        const subParts = part.split(refRegex);
        return (
          <span key={i}>
            {subParts.map((sp, j) => {
              if (refTokens.some(r => r.toLowerCase() === sp.toLowerCase())) {
                return <span key={j} className="px-1 rounded" style={{ background: 'rgba(183,196,255,.18)', color: '#b7c4ff' }} title="Past client or project — verify this reference is correct">{sp}</span>;
              }
              return sp;
            })}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="border-t" style={{ borderColor: '#2b2a27', background: '#1d1b19' }}>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#d0c5b0' }}>AI Draft</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: confColor + '14', color: confColor, border: `1px solid ${confColor}40` }}>
              {draft.confidence} confidence
            </span>
            {isAccepted && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: '#3d5c3a', color: 'white' }}>
                ✓ accepted
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[11px]" style={{ color: '#99907d' }}>hide</button>
        </div>

        {draft.confidence_reason && (
          <p className="text-[11px] italic mb-3" style={{ color: '#d0c5b0' }}>{draft.confidence_reason}</p>
        )}

        <QaAdjustmentsFooter adjustments={draft.qa_adjustments} count={draft.qa_adjustments_count} />

        {/* Draft body */}
        <div className="rounded-lg p-4 mb-3" style={{ background: '#211f1d', border: '1px solid #4d4636' }}>
          {editing ? (
            <DebouncedTextarea value={text} onCommit={setText} delay={400}
              rows={Math.max(8, text.split('\n').length + 2)}
              className="w-full text-sm leading-relaxed outline-none resize-y font-serif"
              style={{ color: '#e6e2de' }} />
          ) : (
            <p className="text-sm leading-relaxed font-serif whitespace-pre-wrap" style={{ color: '#e6e2de' }}>
              {renderHighlighted(text)}
            </p>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {!editing && !isAccepted && (
            <button onClick={() => setEditing(true)}
              className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
              ✎ Edit
            </button>
          )}
          {editing && (
            <>
              <button onClick={handleSaveEdits} disabled={saving}
                className="text-[11px] px-2.5 py-1.5 rounded font-medium" style={{ background: '#1e4a52', color: 'white' }}>
                {saving ? 'Saving…' : 'Save edits'}
              </button>
              <button onClick={() => { setText(draft.draft_text || ''); setEditing(false); }}
                className="text-[11px] px-2.5 py-1.5 rounded" style={{ color: '#d0c5b0' }}>
                Cancel
              </button>
            </>
          )}
          {!editing && (
            <>
              <button onClick={() => navigator.clipboard.writeText(text)}
                className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
                ⎘ Copy
              </button>
              <button onClick={onRegenerate} disabled={regenerating}
                className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#7fb4bc' }}>
                {regenerating ? 'Regenerating…' : '⟳ Regenerate'}
              </button>
              {!isAccepted && (
                <button onClick={onAccept}
                  className="text-[11px] px-2.5 py-1.5 rounded font-medium" style={{ background: '#3d5c3a', color: 'white' }}>
                  ✓ Accept draft
                </button>
              )}
              <button onClick={onDiscard}
                className="text-[11px] px-2.5 py-1.5 rounded border ml-auto" style={{ borderColor: '#f5c6c0', color: '#ffb4ab' }}>
                ✕ Discard
              </button>
            </>
          )}
        </div>

        {/* Sources panel */}
        {(citedMatches.length > 0 || citedLanguage.length > 0 || (draft.evidence_needed || []).length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
            {citedMatches.length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(30,74,82,.06)', border: '1px solid rgba(30,74,82,.15)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#7fb4bc' }}>Matches cited</div>
                <ul className="space-y-1">
                  {citedMatches.map((m, i) => (
                    <li key={m.id}>
                      <Link href={`/repository/${m.id}`} className="hover:underline" style={{ color: '#7fb4bc' }}>
                        [#{i + 1}] {m.name}
                      </Link>
                      <span className="ml-1 opacity-60">({m.outcome})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {citedLanguage.length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(184,150,46,.08)', border: '1px solid rgba(184,150,46,.2)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#e8c357' }}>Language patterns</div>
                <ul className="space-y-1">
                  {citedLanguage.map((s, i) => (
                    <li key={i} className="italic" style={{ color: '#e4c366' }}>
                      "{(s.adapted || s.text || '').slice(0, 100)}{(s.adapted || s.text || '').length > 100 ? '…' : ''}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(draft.evidence_needed || []).length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(176,64,48,.05)', border: '1px solid rgba(176,64,48,.15)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#ffb4ab' }}>Writer must fill in</div>
                <ul className="space-y-1" style={{ color: '#7a3023' }}>
                  {(draft.evidence_needed || []).slice(0, 6).map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Outcome Capture Modal — Wave 3 closed feedback loop ───────────────────
// Active capture form for the bid outcome. Records what happened with the
// bid, whether ProposalIQ contributed materially, and free-text on what was
// useful / what was missing. Feeds into lib/feedback.js to bias future
// ranking toward proposals that have actually been used in winning bids.
const OutcomeCaptureModal = memo(function OutcomeCaptureModal({ existing, usageSummary, scanName, onSave, onClose }) {
  const [outcome, setOutcomeVal] = useState(existing?.outcome || 'pending');
  const [submitted, setSubmitted] = useState(existing?.submitted ? true : false);
  const [piqUsed, setPiqUsed] = useState(existing?.piq_used_materially ? true : false);
  const [mostUseful, setMostUseful] = useState(existing?.most_useful || '');
  const [whatMissing, setWhatMissing] = useState(existing?.what_was_missing || '');
  const [clientFeedback, setClientFeedback] = useState(existing?.client_feedback || '');
  const [saving, setSaving] = useState(false);

  // Build a usage hint string from the summary so the user remembers what
  // they actually did with the scan.
  const usageHint = (() => {
    const bits = [];
    if (usageSummary.briefing_exported) bits.push(`exported briefing × ${usageSummary.briefing_exported}`);
    if (usageSummary.template_generated) bits.push(`generated template × ${usageSummary.template_generated}`);
    if (usageSummary.template_drafted) bits.push(`AI drafted template × ${usageSummary.template_drafted}`);
    if (usageSummary.reference_copied) bits.push(`copied reference × ${usageSummary.reference_copied}`);
    if (usageSummary.match_opened) bits.push(`opened ${usageSummary.match_opened} match${usageSummary.match_opened > 1 ? 'es' : ''}`);
    if (usageSummary.match_downloaded) bits.push(`downloaded ${usageSummary.match_downloaded} match${usageSummary.match_downloaded > 1 ? 'es' : ''}`);
    if (usageSummary.snippet_copied) bits.push(`copied ${usageSummary.snippet_copied} snippet${usageSummary.snippet_copied > 1 ? 's' : ''}`);
    return bits.join(' · ');
  })();

  async function handleSave() {
    setSaving(true);
    await onSave({
      outcome, submitted, piq_used_materially: piqUsed,
      most_useful: mostUseful, what_was_missing: whatMissing,
      client_feedback: clientFeedback,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,14,12,.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl bg-surface-container w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b flex items-baseline justify-between" style={{ borderColor: '#4d4636' }}>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#d0c5b0' }}>Bid outcome</div>
            <h2 className="font-serif text-xl mt-0.5">{scanName}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: '#99907d' }}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {usageHint && (
            <div className="rounded-lg p-3 text-xs" style={{ background: '#1d1b19', color: '#d0c5b0' }}>
              <span className="font-semibold" style={{ color: '#e6e2de' }}>You used this scan to: </span>{usageHint}
            </div>
          )}

          {/* Outcome */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: '#d0c5b0' }}>Outcome</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { val: 'won',     label: '★ Won',         color: '#7bd07a' },
                { val: 'lost',    label: '✕ Lost',        color: '#ffb4ab' },
                { val: 'pending', label: '◷ Pending',     color: '#b8962e' },
                { val: 'no_bid',  label: '✕ Did not bid', color: '#d0c5b0' },
              ].map(opt => (
                <button key={opt.val} onClick={() => setOutcomeVal(opt.val)}
                  className="text-xs py-2 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: outcome === opt.val ? opt.color : '#4d4636',
                    background: outcome === opt.val ? opt.color + '14' : 'white',
                    color: outcome === opt.val ? opt.color : '#6b6456',
                    fontWeight: outcome === opt.val ? 600 : 400,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submitted + PIQ used checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-lg border" style={{ borderColor: '#4d4636' }}>
              <input type="checkbox" checked={submitted} onChange={e => setSubmitted(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium" style={{ color: '#e6e2de' }}>Submitted to client</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#d0c5b0' }}>Tick if the bid was actually submitted (not just drafted).</div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-lg border" style={{ borderColor: '#4d4636' }}>
              <input type="checkbox" checked={piqUsed} onChange={e => setPiqUsed(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium" style={{ color: '#e6e2de' }}>ProposalIQ contributed materially</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#d0c5b0' }}>Used the verdict, copied snippets, applied recommendations, etc.</div>
              </div>
            </label>
          </div>

          {/* Free text */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#d0c5b0' }}>What was most useful?</label>
            <DebouncedTextarea value={mostUseful} onCommit={setMostUseful} delay={300}
              rows={2} placeholder="e.g. The matched proposals from the HMRC contract, the gap analysis flagging DSPT compliance, the win strategy opening narrative…"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#4d4636' }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#d0c5b0' }}>What was missing or wrong?</label>
            <DebouncedTextarea value={whatMissing} onCommit={setWhatMissing} delay={300}
              rows={2} placeholder="e.g. Should have flagged the social value requirement, off-sector matches in cross-sector list, win strategy too generic…"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#4d4636' }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#d0c5b0' }}>Client feedback (optional)</label>
            <DebouncedTextarea value={clientFeedback} onCommit={setClientFeedback} delay={300}
              rows={2} placeholder="e.g. Strong on technical, weak on commercials. They noted the 47-trust scale claim specifically."
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#4d4636' }} />
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#4d4636', background: '#1d1b19' }}>
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg" style={{ color: '#d0c5b0' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            style={{ background: '#1e4a52', color: 'white' }}>
            {saving ? 'Saving…' : 'Save outcome'}
          </button>
        </div>
      </div>
    </div>
  );
});

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
      .catch(() => {});
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
                        <span className="font-mono text-[10px] flex-shrink-0" style={{ color: r.priority === 'must' ? '#b04030' : '#6b6456' }}>
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

// ── Executive Bid Brief — synthesis layer landing page ────────────────────
// The default tab. Renders the verdict at the top, then top priorities,
// risks, recommended assets, and immediate next actions. Designed so the
// bid director can read it in 90 seconds and walk away with a decision.
const ExecutiveBrief = memo(function ExecutiveBrief({ brief, bidScore, matches, onJumpTab, scanName, scanId, onExport, onGenerateTemplate, exporting, generatingTemplate }) {
  if (!brief) {
    return (
      <div className="py-16 text-center">
        <div className="text-3xl mb-3 opacity-25 text-primary">★</div>
        <p className="text-sm text-on-surface-variant">Executive brief not available for this scan.</p>
        <p className="text-xs mt-2 text-on-surface-variant/60">Re-run the scan to generate one.</p>
      </div>
    );
  }

  const verdict = brief.verdict || {};
  const decision = String(verdict.decision || '').toUpperCase();

  // Verdict panel colour map — dark theme (Stitch palette)
  const isNoBid = decision.includes('NO BID');
  const isConditional = decision.includes('CONDITIONAL');
  const verdictPanel = isNoBid
    ? { bg: '#3a1f1a', label: 'text-[#e6a29b]', title: 'text-[#f5c8c1]' }
    : isConditional
    ? { bg: '#3d2f00', label: 'text-[#d4b458]', title: 'text-primary-fixed' }
    : { bg: '#1e2d24', label: 'text-[#8fb49a]', title: 'text-[#c5e1cd]' };

  const priorities = Array.isArray(brief.top_3_priorities) ? brief.top_3_priorities : [];
  const risks = Array.isArray(brief.top_3_risks) ? brief.top_3_risks : [];
  const assets = Array.isArray(brief.recommended_assets_to_use) ? brief.recommended_assets_to_use : [];
  const nextActions = Array.isArray(brief.immediate_next_actions) ? brief.immediate_next_actions : [];

  // Score ring — SVG arc maths
  const score = bidScore?.score != null ? Math.max(0, Math.min(100, bidScore.score)) : null;
  const confidenceText = verdict.confidence ? String(verdict.confidence).toUpperCase() : null;

  // Project code — derived from scanId for the editorial label
  const projectCode = scanId ? `CODE: ${String(scanId).slice(0, 8).toUpperCase()}` : null;

  return (
    <div className="max-w-4xl mx-auto py-8 md:py-12">

      {/* ── EDITORIAL HEADER ────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {projectCode && (
            <span className="font-label text-xs uppercase tracking-[0.2em] text-outline">{projectCode}</span>
          )}
          <span className="h-px w-8 bg-outline-variant" />
          <span className="font-label text-xs uppercase tracking-[0.2em] text-outline">Intelligence Brief</span>
        </div>
        <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-on-surface leading-[1.1] mb-2">
          {scanName || 'RFP Intelligence'}
        </h1>
        <p className="font-headline text-lg md:text-xl text-on-surface-variant italic">
          Executive briefing prepared for the decision committee
        </p>
      </section>

      {/* ── VERDICT BANNER ──────────────────────────────────────── */}
      <section className="bg-surface-container-low rounded-xl p-1 mb-16 overflow-hidden shadow-lg">
        <div className="flex flex-col md:flex-row items-stretch border border-outline-variant/10 rounded-lg overflow-hidden">

          {/* Recommendation panel */}
          <div className="flex-1 flex flex-col items-center justify-center py-10 px-8 text-center" style={{ backgroundColor: verdictPanel.bg }}>
            <span className={`font-label text-[10px] uppercase tracking-[0.3em] ${verdictPanel.label} mb-2`}>
              Recommendation
            </span>
            <h2 className={`text-5xl md:text-6xl font-black tracking-tighter ${verdictPanel.title} font-headline`}>
              {decision || 'PENDING'}
            </h2>
            {verdict.headline && (
              <p className={`mt-4 ${verdictPanel.label} font-body text-sm max-w-[280px] leading-relaxed`}>
                {verdict.headline}
              </p>
            )}
          </div>

          {/* Metrics panel */}
          <div className="flex-[1.5] bg-surface-container-high flex flex-wrap md:flex-nowrap items-center justify-between p-8 md:p-10 gap-6">
            <div className="flex-1 min-w-[120px]">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-4xl font-bold text-primary font-label">{score != null ? score : '—'}</span>
                {score != null && <span className="text-lg text-outline font-label">%</span>}
              </div>
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Intelligence Score</p>
            </div>
            <div className="hidden md:block h-16 w-px bg-outline-variant/30" />
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-on-surface font-label whitespace-nowrap">{confidenceText || '—'}</span>
              </div>
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Confidence</p>
            </div>

            {/* Score ring */}
            {score != null && (
              <div className="hidden sm:block relative w-20 h-20 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                  <circle className="text-surface-variant" cx="40" cy="40" r="34" fill="transparent" stroke="currentColor" strokeWidth="4" />
                  <circle
                    className="text-primary"
                    cx="40" cy="40" r="34"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={(2 * Math.PI * 34) * (1 - score / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── WINNING THESIS + FIT ASSESSMENT ─────────────────────── */}
      {(brief.winning_thesis_one_liner || brief.are_we_a_strong_fit || brief.what_this_brief_is_really_asking_for) && (
        <section className="mb-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <h3 className="font-headline text-2xl md:text-3xl font-bold leading-tight text-on-surface border-l-2 border-primary pl-6">
                Winning Thesis
              </h3>
            </div>
            <div className="md:col-span-8">
              {brief.winning_thesis_one_liner && (
                <p className="font-body text-lg leading-relaxed text-on-surface-variant mb-8">
                  {brief.winning_thesis_one_liner}
                </p>
              )}
              {brief.are_we_a_strong_fit && (
                <div className="bg-surface-container-lowest p-8 border-l-2 border-primary-container">
                  <h4 className="font-label text-xs uppercase tracking-widest text-primary-container mb-4">Fit Assessment</h4>
                  <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                    {brief.are_we_a_strong_fit}
                  </p>
                </div>
              )}
              {!brief.are_we_a_strong_fit && brief.what_this_brief_is_really_asking_for && (
                <div className="bg-surface-container-lowest p-8 border-l-2 border-primary-container">
                  <h4 className="font-label text-xs uppercase tracking-widest text-primary-container mb-4">What this RFP is really asking for</h4>
                  <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                    {brief.what_this_brief_is_really_asking_for}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── PRIORITIES + RISKS ──────────────────────────────────── */}
      {(priorities.length > 0 || risks.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 mb-24">

          {priorities.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary-container">priority_high</span>
                <h3 className="font-headline text-2xl font-bold">Strategic Priorities</h3>
              </div>
              <ul className="space-y-6">
                {priorities.slice(0, 3).map((p, i) => (
                  <li key={i} className="group">
                    <span className="font-label text-[10px] text-primary-container block mb-1">
                      PRIORITY {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-on-surface-variant group-hover:text-on-surface transition-colors">
                      {p.priority || p}
                    </p>
                    {p.why_it_matters && (
                      <p className="text-xs mt-1 italic text-on-surface-variant/70">{p.why_it_matters}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {risks.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-error">warning</span>
                <h3 className="font-headline text-2xl font-bold">Identified Risks</h3>
              </div>
              <ul className="space-y-6">
                {risks.slice(0, 3).map((r, i) => (
                  <li key={i} className="flex gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-error mt-2.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-on-surface text-sm">{r.risk || r}</p>
                      {r.mitigation && (
                        <p className="text-xs text-on-surface-variant leading-relaxed mt-1">{r.mitigation}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── RECOMMENDED ASSETS ──────────────────────────────────── */}
      {assets.length > 0 && (
        <section className="border-t border-outline-variant pt-16">
          <div className="flex justify-between items-end mb-10 flex-wrap gap-4">
            <div>
              <h3 className="font-headline text-2xl md:text-3xl font-bold">Recommended Assets</h3>
              <p className="text-on-surface-variant font-body mt-2">AI-matched historical documents for rapid assembly.</p>
            </div>
            {onJumpTab && (
              <button
                onClick={() => onJumpTab('matches')}
                className="text-primary font-label text-xs uppercase tracking-widest hover:underline"
              >
                View All
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {assets.slice(0, 4).map((a, i) => (
              <div
                key={i}
                className="flex items-center p-6 bg-surface-container-low hover:bg-surface-container-high transition-all group"
              >
                <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center text-primary-container group-hover:text-primary transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div className="ml-4 flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-on-surface truncate">{a.name}</h4>
                  {(a.why || a.use_for) && (
                    <p className="text-xs text-on-surface-variant mt-1 truncate">{a.why || a.use_for}</p>
                  )}
                </div>
                <span className="material-symbols-outlined text-outline group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">
                  arrow_outward
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── IMMEDIATE NEXT ACTIONS (preserved) ──────────────────── */}
      {nextActions.length > 0 && (
        <section className="mt-16 rounded-lg p-8 bg-primary-container/10 border border-primary/20">
          <div className="font-label text-[10px] uppercase tracking-widest mb-4 text-primary">Do these today</div>
          <ol className="space-y-3">
            {nextActions.slice(0, 5).map((a, i) => (
              <li key={i} className="flex gap-3 text-sm text-on-surface">
                <span className="font-mono font-bold opacity-60 flex-shrink-0 text-primary">{i + 1}.</span>
                <div className="flex-1">
                  <div>{a.action || a}</div>
                  <div className="flex gap-3 mt-0.5 text-[10px] font-mono uppercase tracking-wide text-on-surface-variant">
                    {a.owner && <span>{a.owner}</span>}
                    {a.deadline && <span>{a.deadline}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── FOOTER ACTIONS ──────────────────────────────────────── */}
      {(onExport || onGenerateTemplate) && (
        <footer className="mt-20 pt-12 border-t border-outline-variant/20 flex flex-wrap justify-between items-center gap-4">
          <p className="font-label text-xs text-outline uppercase tracking-widest">
            Intelligence Brief · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <div className="flex gap-4">
            {onExport && (
              <button
                onClick={onExport}
                disabled={exporting}
                className="bg-surface-container-high px-6 py-2 text-xs font-bold font-label uppercase tracking-widest hover:bg-surface-container-highest transition-colors disabled:opacity-50"
              >
                {exporting ? 'Exporting…' : 'Download'}
              </button>
            )}
            {onGenerateTemplate && (
              <button
                onClick={onGenerateTemplate}
                disabled={generatingTemplate}
                className="bg-primary text-on-primary px-6 py-2 text-xs font-bold font-label uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                {generatingTemplate ? 'Building…' : 'Begin Drafting'}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
});


// ── Tiered match grouping ────────────────────────────────────────────────
// Groups matches by their taxonomy_tier and renders each group as a section.
// Direct-fit tiers (1, 2, 3) are always expanded. The "different sector"
// group (tier 5) is collapsed by default behind a click-to-reveal button so
// off-sector noise doesn't drown out direct matches. Untagged (tier 4) is
// shown when present but framed as a neutral fallback.
const TieredMatches = memo(function TieredMatches({ matches, expandedMatches, setExpandedMatches, suppress, setToast, onLog }) {
  const [showCrossSector, setShowCrossSector] = useState(false);
  // Filter mode: 'all' shows the full tier hierarchy, 'sector' shows only
  // matches that share the RFP's client industry, 'service' shows only
  // matches that share the RFP's service industry.
  const [filterMode, setFilterMode] = useState('all');

  // Pre-filter the matches array based on the active filter button
  const filteredMatches = (() => {
    if (filterMode === 'sector') {
      // Same client industry = tiers 1 and 2
      return matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 2);
    }
    if (filterMode === 'service') {
      // Same service industry = tiers 1 and 3
      return matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 3);
    }
    return matches;
  })();

  // Counts for the filter button labels — based on full matches, not filtered
  const sectorCount = matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 2).length;
  const serviceCount = matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 3).length;

  // Bucket by tier — keep within-tier ordering as the API delivered it.
  const tier1 = filteredMatches.filter(m => m.taxonomy_tier === 1);
  const tier2 = filteredMatches.filter(m => m.taxonomy_tier === 2);
  const tier3 = filteredMatches.filter(m => m.taxonomy_tier === 3);
  const tier4 = filteredMatches.filter(m => m.taxonomy_tier === 4);
  const tier5 = filteredMatches.filter(m => m.taxonomy_tier === 5);

  // Top-fit = tiers 1+2+3 — anything that has at least one taxonomy axis
  // matching the RFP. Renders together at the top.
  const topFit = [...tier1, ...tier2, ...tier3];

  function renderGroup(label, sublabel, items) {
    if (!items.length) return null;
    return (
      <div className="mb-10">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <div className="text-[10px] font-label uppercase tracking-widest text-primary">
              {label}
            </div>
            <div className="text-xs mt-1 text-on-surface-variant">{sublabel}</div>
          </div>
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">
            {items.length} {items.length === 1 ? 'match' : 'matches'}
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {items.map((m) => {
            const i = matches.indexOf(m);
            return (
              <MatchCard key={m.id} match={m}
                expanded={expandedMatches[i]}
                onToggle={() => setExpandedMatches(e => ({ ...e, [i]: !e[i] }))}
                onSuppress={() => suppress(m.id)}
                onToast={setToast}
                onLog={onLog} />
            );
          })}
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-on-surface-variant">No matches found. Add more proposals to your repository.</p>
      </div>
    );
  }

  return (
    <>
      {/* Editorial intro */}
      <header className="mb-10 max-w-3xl">
        <h2 className="font-headline text-2xl font-headline italic text-primary mb-2">High-Fidelity Asset Matching</h2>
        <p className="text-on-surface-variant text-base leading-relaxed">
          ProposalIQ has identified {matches.length} historical asset{matches.length === 1 ? '' : 's'} that align with this RFP. Assets are tiered by relevance and compliance.
        </p>
      </header>

      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-[10px] font-label uppercase tracking-widest mr-2 text-on-surface-variant/60">Filter:</span>
        {[
          { val: 'all',     label: 'All matches',        count: matches.length },
          { val: 'sector',  label: 'Same client sector', count: sectorCount },
          { val: 'service', label: 'Same type of work',  count: serviceCount },
        ].map(opt => {
          const active = filterMode === opt.val;
          return (
            <button
              key={opt.val}
              onClick={() => setFilterMode(opt.val)}
              className={`text-[10px] font-label uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors flex items-center gap-2 ${
                active
                  ? 'border-primary bg-primary/10 text-primary font-bold'
                  : 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline'
              }`}
            >
              {opt.label}
              <span className="opacity-60">{opt.count}</span>
            </button>
          );
        })}
      </div>

      {filteredMatches.length === 0 && (
        <div className="text-center py-10 rounded-lg border border-dashed border-outline-variant/30">
          <p className="text-sm text-on-surface-variant">
            No matches in this filter. Try "All matches" to see everything.
          </p>
        </div>
      )}

      {renderGroup(
        'Direct fit · same sector and same type of work',
        'Strongest matches — same client industry and same service line.',
        tier1
      )}
      {renderGroup(
        'Same type of work · different sector',
        'Same service line, but the client was in a different industry.',
        tier3
      )}
      {renderGroup(
        'Same sector · different type of work',
        'Same client industry but a different service line.',
        tier2
      )}
      {renderGroup(
        'Untagged proposals',
        'Industry could not be inferred from the proposal text — re-analyse to classify.',
        tier4
      )}

      {/* Cross-sector — hidden by default */}
      {tier5.length > 0 && (
        <div className="mt-6 border-t border-outline-variant/10 pt-8">
          {!showCrossSector ? (
            <button
              onClick={() => setShowCrossSector(true)}
              className="w-full py-6 rounded-lg border border-dashed border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-all"
            >
              <div className="text-sm font-medium mb-1 text-on-surface">
                Show {tier5.length} cross-sector {tier5.length === 1 ? 'proposal' : 'proposals'}
              </div>
              <div className="text-[11px] text-on-surface-variant/60 max-w-lg mx-auto">
                Different industry and different service line. May still be useful for tone, structure, or approach — but not for direct content reuse.
              </div>
            </button>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">
                    Cross-sector references
                  </div>
                  <div className="text-xs mt-1 text-on-surface-variant">
                    Different industry — useful for tone, structure or approach only.
                  </div>
                </div>
                <button
                  onClick={() => setShowCrossSector(false)}
                  className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
                >
                  hide
                </button>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {tier5.map((m) => {
                  const i = matches.indexOf(m);
                  return (
                    <MatchCard key={m.id} match={m}
                      expanded={expandedMatches[i]}
                      onToggle={() => setExpandedMatches(e => ({ ...e, [i]: !e[i] }))}
                      onSuppress={() => suppress(m.id)}
                      onToast={setToast}
                      onLog={onLog} />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {topFit.length === 0 && (tier4.length > 0 || tier5.length > 0) && (
        <div className="mt-6 rounded-lg p-4 text-xs bg-primary/10 border border-primary/20 text-primary">
          <strong>No direct sector matches yet.</strong> Re-analyse your repository so proposals get tagged — until then matching falls back to text inference and may be less precise.
        </div>
      )}
    </>
  );
});

const MatchCard = memo(function MatchCard({ match: m, expanded, onToggle, onSuppress, onToast, onLog }) {
  const meta = m.ai_metadata || {};
  const wq = meta.writing_quality;

  // Score → SVG arc maths
  const score = Math.max(0, Math.min(100, m.match_score || 0));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - score / 100);

  // Label for match quality — maps to Stitch "Optimal/Partial"
  const labelText =
    m.match_label === 'Strong' ? 'OPTIMAL MATCH' :
    m.match_label === 'Good'   ? 'STRONG MATCH' :
    m.match_label === 'Partial'? 'PARTIAL MATCH' :
    'RELATED';
  const labelIsPrimary = m.match_label === 'Strong' || m.match_label === 'Good';
  const arcColorClass = labelIsPrimary ? 'text-primary' : 'text-secondary';
  const labelColorClass = labelIsPrimary ? 'text-primary' : 'text-secondary';

  // Match summary — prefer AI recommended_use, fall back to went_well or client blurb
  const summary = m.match_explanation?.recommended_use || m.went_well || meta.summary || '';

  // Time-ago label for "6 months ago" style
  const timeAgo = (() => {
    if (!m.date_submitted) return '';
    const d = new Date(m.date_submitted);
    if (Number.isNaN(d.getTime())) return '';
    const months = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months < 1) return 'this month';
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.round(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  })();

  return (
    <div className="bg-surface-container group p-6 rounded-lg transition-all hover:bg-surface-container-high relative overflow-hidden cursor-pointer"
      onClick={() => { onToggle(); if (!expanded && onLog) onLog('match_expanded', { target_type: 'project', target_id: m.id }); }}
    >
      {/* Score ring — top right */}
      <div className="absolute top-0 right-0 p-4">
        <div className="relative w-16 h-16 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
            <circle className="text-outline-variant/20" cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4" />
            <circle
              className={arcColorClass}
              cx="32" cy="32" r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-sm font-label font-bold text-on-surface">{score}</span>
        </div>
      </div>

      <div className="pr-20">
        <span className={`text-[10px] font-label font-bold tracking-[0.2em] ${labelColorClass} uppercase mb-2 block`}>
          {labelText}
        </span>
        <h3 className="text-lg md:text-xl font-headline font-bold text-on-surface leading-tight mb-3">
          {m.name}
        </h3>
        {summary && (
          <p className="text-on-surface-variant text-sm leading-relaxed mb-4 line-clamp-2">
            {summary}
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap text-[10px] font-label">
          {m.outcome && (
            <span
              className="px-2 py-0.5 uppercase border"
              style={{
                background: m.outcome === 'won' ? 'rgba(79,209,197,.1)' : m.outcome === 'lost' ? 'rgba(176,64,48,.1)' : 'rgba(232,195,87,.1)',
                color: m.outcome === 'won' ? '#4fd1c5' : m.outcome === 'lost' ? '#ffb4ab' : '#e8c357',
                borderColor: m.outcome === 'won' ? 'rgba(79,209,197,.2)' : m.outcome === 'lost' ? 'rgba(176,64,48,.2)' : 'rgba(232,195,87,.2)',
              }}
            >
              {m.outcome}
            </span>
          )}
          {m.sanity_warning && (
            <span className="px-2 py-0.5 uppercase border bg-secondary/10 text-secondary border-secondary/20">
              Adjustment needed
            </span>
          )}
          <span className="text-on-surface-variant/60 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">history</span>
            {timeAgo || 'unknown'}
          </span>
          {m.client && <span className="text-on-surface-variant/60">{m.client}</span>}
        </div>

        {(m.match_reasons || []).slice(0, 3).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(m.match_reasons || []).slice(0, 3).map(t => (
              <span key={t} className="text-[10px] font-label px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Expanded content — progressive disclosure */}
        {expanded && (
          <div className="mt-6 space-y-3 animate-fadeIn border-t border-outline-variant/10 pt-4">
            {m.llm_reason && (
              <div className="rounded p-3 bg-primary-container/10 border border-primary/20">
                <div className="text-[10px] font-label uppercase tracking-widest mb-1 text-primary">Why AI selected this</div>
                <p className="text-xs leading-relaxed text-on-surface-variant">{m.llm_reason}</p>
              </div>
            )}
            {m.match_explanation && (
              <div className="rounded p-3 bg-surface-container-highest space-y-2">
                <div>
                  <div className="text-[10px] font-label uppercase tracking-widest mb-1 text-on-surface-variant">Why matched</div>
                  <p className="text-xs leading-relaxed text-on-surface">{m.match_explanation.recommended_use}</p>
                </div>
                {m.match_explanation.capability_context?.statement && (
                  <div className={`flex items-start gap-2 text-xs leading-relaxed pt-2 border-t border-outline-variant/10 ${
                    m.match_explanation.capability_context.status === 'within_core' ? 'text-[#7bd07a]' :
                    m.match_explanation.capability_context.status === 'within_offered' ? 'text-on-surface' :
                    m.match_explanation.capability_context.status === 'adjacent' ? 'text-primary' :
                    m.match_explanation.capability_context.status === 'outside_stated' ? 'text-on-surface-variant' :
                    'text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined text-[14px] mt-0.5">{
                      m.match_explanation.capability_context.status === 'within_core' ? 'verified' :
                      m.match_explanation.capability_context.status === 'within_offered' ? 'check_circle' :
                      m.match_explanation.capability_context.status === 'adjacent' ? 'north_east' :
                      m.match_explanation.capability_context.status === 'outside_stated' ? 'info' :
                      'info'
                    }</span>
                    <span>{m.match_explanation.capability_context.statement}</span>
                  </div>
                )}
              </div>
            )}
            {m.style_classification && (
              <div className="text-xs text-on-surface-variant">
                <span className="font-label uppercase tracking-widest text-[10px] mr-2">Style</span>
                <span className="text-on-surface">{m.style_classification.primary_style}</span>
                <span className="mx-2">·</span>
                <span>{m.style_classification.tone}</span>
              </div>
            )}
            {m.lh_status === 'complete' && m.lh_what_delivered && (
              <div className="rounded p-3 bg-primary/5 border border-primary/20">
                <div className="text-[10px] font-label uppercase tracking-widest mb-1 text-primary">What was delivered</div>
                <p className="text-xs leading-relaxed text-on-surface-variant">{m.lh_what_delivered}</p>
              </div>
            )}
            {/* Card actions */}
            <div className="flex items-center gap-3 flex-wrap pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(`Reference: "${m.name}" (${m.outcome || ''}, ${m.date_submitted?.slice(0, 4) || ''}) — ${m.went_well || m.client || ''}`);
                  onToast('Reference copied');
                  if (onLog) onLog('reference_copied', { target_type: 'project', target_id: m.id });
                }}
                className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                Copy Reference
              </button>
              <a
                href={`/api/projects/${m.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); if (onLog) onLog('match_downloaded', { target_type: 'project', target_id: m.id }); }}
                className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                Download
              </a>
              <Link
                href={`/repository/${m.id}`}
                onClick={(e) => { e.stopPropagation(); if (onLog) onLog('match_opened', { target_type: 'project', target_id: m.id }); }}
                className="ml-auto text-[10px] font-label uppercase tracking-widest text-primary hover:underline"
              >
                Open →
              </Link>
              <button
                onClick={(e) => { e.stopPropagation(); onSuppress(); }}
                className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50 hover:text-error transition-colors"
                title="Exclude from this scan"
              >
                Exclude
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const GapCard = memo(function GapCard({ gap: g }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background:PRIORITY_COLOR[g.priority]||'#4d4636' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-sm font-semibold">{g.title}</div>
            <div className="flex gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:(PRIORITY_COLOR[g.priority]||'#4d4636')+'18', color:PRIORITY_COLOR[g.priority]||'#6b6456' }}>{g.type}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:(PRIORITY_COLOR[g.priority]||'#4d4636')+'18', color:PRIORITY_COLOR[g.priority]||'#6b6456' }}>{g.priority}</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed mb-1" style={{ color:'#d0c5b0' }}>{g.description}</p>
          {g.source_hint && <p className="text-xs italic" style={{ color:'#7fb4bc' }}>Partial coverage in: {g.source_hint}</p>}
          {g.suggested_person && (
            <div className="mt-2 rounded-lg px-3 py-2.5 text-xs" style={{ background:'rgba(232,195,87,.08)', border:'1px solid rgba(184,150,46,.2)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#b8962e' }}>Suggested team lead</div>
              <div className="font-semibold mb-0.5" style={{ color:'#e8c357' }}>{g.suggested_person}</div>
              {g.suggested_person_reason && <div style={{ color:'#9a7820' }}>{g.suggested_person_reason}</div>}
              {g.suggested_person_cv && <div className="mt-1 pt-1 border-t" style={{ borderColor:'rgba(184,150,46,.2)', color:'#9a7820' }}>CV: {g.suggested_person_cv}</div>}
            </div>
          )}
          {g.source_proposals?.length > 0 && (
            <div className="mt-2 text-[10px] font-mono" style={{ color:'#99907d' }}>
              Partial coverage in: {g.source_proposals.join(' · ')}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-t" style={{ borderColor:'#2b2a27', background:'#1d1b19' }}>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#2b2a27', color:'#d0c5b0' }}>Impact: {g.impact}</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#2b2a27', color:'#d0c5b0' }}>{g.suggested_action}</span>
      </div>
    </Card>
  );
});

// Market Context — categorised, scored, strategically framed news.
// Replaces the old "Industry News" tab. News items are grouped by category
// (programme/buyer/tech_reg/competitive) so the user can scan by relevance
// type, not just by date. Anything below 50% relevance has been filtered out
// upstream — the UI never shows junk results.
const CATEGORY_META = {
  programme: { label: 'Programme & Procurement', icon: '◆', color: '#7bd07a', desc: 'News directly about the named programme, framework, or contract vehicle' },
  buyer:     { label: 'Buyer & Issuing Body',    icon: '◈', color: '#7fb4bc', desc: 'News about the issuing organisation — leadership, budget, restructure' },
  tech_reg:  { label: 'Technology & Regulation', icon: '◇', color: '#e8c357', desc: 'New standards, regulations, or capability announcements' },
  competitive: { label: 'Competitive Landscape', icon: '◉', color: '#ffb4ab', desc: 'Competitor wins, M&A, market shifts in the supplier base' },
};

const MarketContext = memo(function MarketContext({ news }) {
  if (!news || news.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-3 opacity-25">◆</div>
        <p className="text-sm" style={{ color: '#d0c5b0' }}>No relevant market context found.</p>
        <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: '#99907d' }}>
          We searched for news tied to specific programmes, frameworks, regulators and competitors — none scored above the relevance threshold. Better empty than misleading.
        </p>
      </div>
    );
  }

  // Group by category
  const groups = {};
  news.forEach(n => {
    const cat = n.category || 'tech_reg';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(n);
  });

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: '#d0c5b0' }}>
        News scored against this RFP's specific entities. Each item is tagged with where to use it in the bid and what argument it strengthens.
      </p>

      {['programme', 'buyer', 'tech_reg', 'competitive'].map(cat => {
        const items = groups[cat];
        if (!items || items.length === 0) return null;
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat}>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: meta.color }}>
                  {meta.icon} {meta.label}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#d0c5b0' }}>{meta.desc}</div>
              </div>
              <div className="text-[11px] font-mono" style={{ color: '#99907d' }}>
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((n, i) => <MarketContextCard key={i} item={n} accent={meta.color} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
});

const MarketContextCard = memo(function MarketContextCard({ item: n, accent }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: accent + '14', color: accent }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color: '#d0c5b0' }}>{n.date}</span>
          <span className="ml-auto text-[10px] font-mono font-semibold" style={{ color: accent }}>{n.relevance_score}/100</span>
        </div>
        <h3 className="text-sm font-semibold mb-1.5 leading-snug">{n.title}</h3>
        <p className="text-xs leading-relaxed mb-3" style={{ color: '#d0c5b0' }}>{n.snippet}</p>

        {n.why_it_matters && (
          <div className="rounded-md p-3 text-xs leading-relaxed mb-2" style={{ background: 'rgba(232,195,87,.08)' }}>
            <span className="font-semibold" style={{ color: '#e8c357' }}>Why this matters: </span>
            <span style={{ color: '#e4c366' }}>{n.why_it_matters}</span>
          </div>
        )}

        {(n.where_to_use_in_bid || n.tone_supported) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {n.where_to_use_in_bid && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(30,74,82,.3)', color: '#7fb4bc' }}>
                Use in: {n.where_to_use_in_bid}
              </span>
            )}
            {n.tone_supported && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(184,150,46,.3)', color: '#e8c357' }}>
                Supports: {n.tone_supported}
              </span>
            )}
          </div>
        )}
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 border-t text-xs transition-colors hover:bg-[#f0f8ff]"
          style={{ borderColor: '#2b2a27', color: '#7fb4bc' }}>
          <span className="flex-1 truncate">{n.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
          <span className="flex-shrink-0">↗</span>
        </a>
      )}
    </Card>
  );
});

const NewsCard = memo(function NewsCard({ item: n }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color:'#d0c5b0' }}>{n.date}</span>
          <span className="ml-auto text-[10px] font-mono" style={{ color:'#b8962e' }}>⟡ {n.relevance_score}% relevant</span>
        </div>
        <h3 className="text-sm font-semibold mb-1.5 leading-snug">{n.title}</h3>
        <p className="text-xs leading-relaxed mb-3" style={{ color:'#d0c5b0' }}>{n.snippet}</p>
        <div className="rounded-md p-3 text-xs leading-relaxed" style={{ background:'rgba(232,195,87,.08)' }}>
          <span className="font-semibold" style={{ color:'#b8962e' }}>⟡ Why this matters: </span>{n.why_it_matters}
        </div>
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 border-t text-xs transition-colors hover:bg-[#f0f8ff]"
          style={{ borderColor:'#2b2a27', color:'#7fb4bc' }}>
          <span className="flex-1 truncate">{n.url.replace(/^https?:\/\/(www\.)?/,'')}</span>
          <span className="flex-shrink-0">↗</span>
        </a>
      )}
    </Card>
  );
});

// ── VIEW RFP DOCUMENT TAB ───────────────────────────────────────────────
// Inline iframe of the uploaded source RFP. PDFs embed directly; other
// types show a download CTA since browsers can't preview them natively.
const RfpDocumentTab = memo(function RfpDocumentTab({ scan }) {
  const [loaded, setLoaded] = useState(false);
  const filename = scan.rfp_original_name || scan.rfp_filename || '';
  const ext = filename.toLowerCase().split('.').pop();
  const isPdf = ext === 'pdf';

  if (!scan.rfp_filename) {
    return <div className="text-center py-16 text-on-surface-variant">No source file attached to this scan.</div>;
  }

  if (!loaded) {
    return (
      <div className="text-center py-16 bg-surface-container-low">
        <span className="material-symbols-outlined text-5xl text-primary/40">picture_as_pdf</span>
        <h3 className="font-headline text-xl mt-4 text-on-surface">{filename || 'RFP document'}</h3>
        <p className="font-body text-sm mt-2 text-on-surface-variant max-w-md mx-auto">
          {isPdf
            ? 'Click to load the full PDF inline. Deferred so the workbench stays snappy.'
            : `This document is a .${ext} file — inline preview is only supported for PDFs. Use the download link to view it.`}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          {isPdf && (
            <button
              onClick={() => setLoaded(true)}
              className="bg-primary text-on-primary px-6 py-3 text-[10px] font-label uppercase tracking-widest font-bold"
            >
              Load PDF
            </button>
          )}
          <a
            href={`/api/rfp/${scan.id}/download`}
            target="_blank" rel="noopener noreferrer"
            className="border border-outline/30 text-on-surface-variant hover:text-on-surface px-6 py-3 text-[10px] font-label uppercase tracking-widest flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Open / Download
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest">
      <iframe
        src={`/api/rfp/${scan.id}/download`}
        title="RFP document"
        className="w-full"
        style={{ height: 'calc(100vh - 280px)', minHeight: 600, border: 'none' }}
      />
    </div>
  );
});

// ── RFP PLAIN TEXT TAB ──────────────────────────────────────────────────
// Full RFP text is now stored and returned uncapped — no truncation.
const RfpPlainTextTab = memo(function RfpPlainTextTab({ scan }) {
  const text = scan.rfp_text || '';
  if (!text) {
    return <div className="text-center py-16 text-on-surface-variant">No extracted text available for this scan.</div>;
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="bg-surface-container-low">
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant/10">
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
          Extracted Text
        </div>
        <div className="font-label text-[10px] text-on-surface-variant/60">
          {words.toLocaleString()} words · {text.length.toLocaleString()} chars
        </div>
      </div>
      <pre className="font-body text-sm leading-relaxed whitespace-pre-wrap text-on-surface p-6 overflow-auto max-h-[75vh]">
        {text}
      </pre>
    </div>
  );
});
