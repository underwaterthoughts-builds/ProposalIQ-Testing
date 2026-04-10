import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Card, ScoreRing, Stars, OutcomeLabel, Badge, Spinner, ProgressBar, Btn, Toast } from '../../components/ui';
import QuickView from '../../components/QuickView';
import { useMode } from '../../lib/useMode';
import { useUser } from '../../lib/useUser';
import { formatMoney, currencySymbol } from '../../lib/format';

const PRIORITY_COLOR = { high:'#b04030', med:'#b8962e', low:'#2d6b78' };

function CheckpointBanner({ label, approved, onApprove, saving, children }) {
  if (approved) return (
    <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl text-sm" style={{ background:'#edf3ec', border:'1px solid rgba(61,92,58,.2)' }}>
      <span style={{ color:'#3d5c3a' }}>✓</span>
      <span className="font-medium" style={{ color:'#3d5c3a' }}>{label} reviewed and approved</span>
    </div>
  );
  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{ border:'1.5px solid rgba(184,150,46,.4)', background:'#faf4e2' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold" style={{ color:'#7a5800' }}>⚑ Review checkpoint: {label}</div>
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
}

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
    <div className="flex items-center justify-center h-screen" style={{ background: '#faf7f2' }}>
      <div className="text-center"><Spinner size={32} /><p className="text-sm mt-3" style={{ color: '#6b6456' }}>Loading…</p></div>
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
  const news = scan.news || [];
  const team = scan.team_suggestions || [];
  const financial = scan.financial_model || {};
  const coverage = scan.coverage || {};
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
    { id:'brief', label:'Brief', badge: executiveBrief?.verdict?.decision ? '★' : null },
    { id:'matches', label:'Matched Proposals', count:matches.length },
    { id:'gaps', label:'Opportunity Gaps', count:gaps.length },
    { id:'writing', label:'Writing Insights', count:writingInsights.length },
    { id:'news', label:'Market Context', count:news.length },
    { id:'approach', label:'Suggested Approach', count:suggestedApproach?.suggested_phases?.length||0 },
    { id:'strategy', label:'Win Strategy', badge: winStrategy ? '⚡' : null },
    { id:'language', label:'Winning Language', count:winningLanguage.length },
    { id:'narrative', label:'Narrative Advice', badge: narrativeText ? '✎' : null },
    { id:'assembly', label:'Proposal Assembly', badge: '⊞' },
  ];

  // Quick view — single scroll editorial layout
  if (isQuick) {
    return (
      <>
        <Head><title>{scan.name} — RFP Intelligence</title></Head>
        <Layout title={scan.name} subtitle={rfpData.client ? `${rfpData.client} · ${rfpData.sector}` : 'RFP Intelligence'} user={user}>
          <QuickView
            scan={scan}
            scanId={id}
            onExport={exportBriefing}
            onTemplate={(d) => generateTemplate(d)}
            onDelete={deleteScan}
            exporting={exporting}
            generatingTemplate={generatingTemplate}
            deleting={deleting}
            clientIntel={clientIntel}
          />
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
            <Btn variant="ghost" onClick={exportBriefing} disabled={exporting}>
              {exporting ? <><Spinner size={12}/> Exporting…</> : '↓ Export Briefing'}
            </Btn>
            <div className="flex rounded-lg overflow-hidden border border-teal" style={{ borderColor:'#1e4a52' }}>
              <Btn variant="teal" onClick={() => { setTemplateDraftMode(false); generateTemplate(); }} disabled={generatingTemplate}
                className="rounded-none border-0 no-min-h px-3 py-1.5">
                {generatingTemplate && !templateDraftMode ? <><Spinner size={12}/> Building…</> : '📄 Template'}
              </Btn>
              <div className="w-px" style={{ background:'rgba(255,255,255,.3)' }}/>
              <Btn variant="teal" onClick={() => { setTemplateDraftMode(true); generateTemplate(); }} disabled={generatingTemplate}
                className="rounded-none border-0 no-min-h px-3 py-1.5">
                {generatingTemplate && templateDraftMode ? <><Spinner size={12}/> Writing…</> : '✍ Draft'}
              </Btn>
            </div>
            <Btn variant="ghost" onClick={() => router.push('/rfp')}>← All Scans</Btn>
            <Btn variant="ghost" onClick={rescan} disabled={rescanning || scan?.status === 'processing'}
              title="Re-run the full intelligence pipeline against this RFP">
              {rescanning || scan?.status === 'processing' ? <><Spinner size={12}/> Re-analysing…</> : '⟳ Re-analyse'}
            </Btn>
            <Btn variant="ghost" onClick={deleteScan} disabled={deleting}
              style={{ color:'#b04030', borderColor:'#f5c6c0' }}>
              {deleting ? <><Spinner size={12}/> Deleting…</> : '✕ Delete Scan'}
            </Btn>
          </div>
        }>
        <div className="flex h-full overflow-hidden">
          {/* Main */}
          <div className="flex-1 flex flex-col overflow-hidden md:border-r" style={{ borderColor:'#ddd5c4' }}>
            {scan.status === 'processing' && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm border-b" style={{ background:'#faf4e2', borderColor:'rgba(184,150,46,.3)', color:'#7a5800' }}>
                <Spinner size={14}/><span>Fast pass running — verdict in ~30s, full analysis in ~90s…</span>
              </div>
            )}
            {scan.status === 'fast_ready' && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm border-b" style={{ background:'#e8f2f4', borderColor:'rgba(30,74,82,.25)', color:'#1e4a52' }}>
                <Spinner size={14}/><span>Verdict ready — deep analysis (gaps, win strategy, winning language, news, approach) running in background…</span>
              </div>
            )}
            {/* Wave 3 — outcome capture banner. Shown once scan is complete
                if no outcome has been captured yet, OR shows a small badge
                with the captured outcome if it exists. */}
            {scan.status === 'complete' && !outcome && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm border-b" style={{ background:'#fbf9f4', borderColor:'#ddd5c4', color:'#5a4810' }}>
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
                background: outcome.outcome === 'won' ? '#edf3ec' : outcome.outcome === 'lost' ? '#faeeeb' : '#f8f6f2',
                borderColor: outcome.outcome === 'won' ? 'rgba(61,92,58,.25)' : outcome.outcome === 'lost' ? 'rgba(176,64,48,.25)' : '#ddd5c4',
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
            {scan.status === 'error' && (
              <div className="px-5 py-3 text-sm border-b" style={{ background:'#faeeeb', borderColor:'rgba(176,64,48,.2)', color:'#b04030' }}>
                <div className="font-semibold mb-1">⚠ Scan error</div>
                {scan.narrative_advice?.startsWith?.('Error:') && <div className="text-xs font-mono mb-1">{scan.narrative_advice}</div>}
                <div className="text-xs">Check terminal for details. Try setting <code>GEMINI_MODEL=gemini-2.0-flash</code> in .env.local and restarting.</div>
              </div>
            )}

            {/* Tabs — scrollable pills on mobile, border tabs on desktop */}
            <div className="hidden md:flex border-b bg-white" style={{ borderColor:'#ddd5c4' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-3 text-[12.5px] font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab===t.id?'border-teal':' border-transparent hover:text-ink'}`}
                  style={{ borderColor:activeTab===t.id?'#1e4a52':'transparent', color:activeTab===t.id?'#1e4a52':'#6b6456' }}>
                  {t.label}
                  {t.count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-white" style={{ background:t.id==='gaps'?'#b04030':t.id==='writing'?'#b8962e':'#1e4a52' }}>{t.count}</span>}
                </button>
              ))}
            </div>
            <div className="tab-pills-scroll md:hidden border-b pt-3" style={{ borderColor:'#f0ebe0' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                  style={{
                    background: activeTab===t.id ? '#1e4a52' : '#f0ebe0',
                    color: activeTab===t.id ? 'white' : '#6b6456',
                    minHeight: '36px',
                  }}>
                  {t.label}
                  {t.count > 0 && <span className="text-[10px] font-mono opacity-80">{t.count}</span>}
                </button>
              ))}
            </div>

            {/* Mobile action strip */}
            <div className="md:hidden flex gap-2 px-3 py-2 border-b bg-white flex-shrink-0" style={{ borderColor:'#f0ebe0' }}>
              <button onClick={exportBriefing} disabled={exporting}
                className="flex-1 py-2 text-xs font-medium rounded-lg border" style={{ borderColor:'#ddd5c4', color:'#6b6456' }}>
                {exporting ? 'Exporting…' : '↓ Export'}
              </button>
              <button onClick={generateTemplate} disabled={generatingTemplate}
                className="flex-1 py-2 text-xs font-medium rounded-lg text-white" style={{ background:'#1e4a52' }}>
                {generatingTemplate ? 'Building…' : '📄 Template'}
              </button>
              <button onClick={rescan} disabled={rescanning || scan?.status === 'processing'}
                className="px-3 py-2 text-xs font-medium rounded-lg border" style={{ borderColor:'#ddd5c4', color:'#1e4a52' }}
                title="Re-analyse">
                {rescanning || scan?.status === 'processing' ? '…' : '⟳'}
              </button>
              <button onClick={deleteScan} disabled={deleting}
                className="px-3 py-2 text-xs font-medium rounded-lg border" style={{ borderColor:'#f5c6c0', color:'#b04030' }}>
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-4">
              {scan.status === 'processing' ? (
                <div className="py-16 text-center"><Spinner size={32}/><p className="text-sm mt-4" style={{ color:'#6b6456' }}>Running intelligence pipeline — fast brief in ~30s…</p></div>
              ) : activeTab === 'brief' ? (
                <ExecutiveBrief brief={executiveBrief} bidScore={bidScore} matches={matches} onJumpTab={setActiveTab} />
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
                  <p className="text-sm mb-4" style={{ color:'#6b6456' }}>
                    {scan.status_detail === 'awaiting_rfp_review' && isPro
                      ? '⚑ Approve the RFP extraction above before gap analysis runs.'
                      : 'Grouped by industry fit. Direct matches are at the top; cross-sector references are hidden by default — click to reveal.'}
                  </p>
                  {matches.length === 0 ? (
                    <div className="text-center py-12"><p className="text-sm" style={{ color:'#6b6456' }}>No matches found. Add more proposals to your repository.</p></div>
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
                  <p className="text-sm mb-4" style={{ color:'#6b6456' }}>Requirements in this RFP not fully addressed by your matched proposals. Team members with relevant CV data are suggested per gap.</p>
                  {gaps.length === 0 ? <div className="text-center py-12"><p className="text-sm" style={{ color:'#6b6456' }}>No gaps identified.</p></div>
                  : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {gaps.map((g, i) => <GapCard key={i} gap={g} />)}
                    </div>}
                </div>
              ) : activeTab === 'writing' ? (
                <div>
                  <p className="text-sm mb-4" style={{ color:'#6b6456' }}>Writing quality analysis across your matched proposals. Use this to understand what made the best bids effective.</p>
                  {writingInsights.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">✍</div>
                      <p className="text-sm" style={{ color:'#6b6456' }}>No writing analysis available. This appears for proposals indexed with writing quality scanning enabled.</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary table */}
                      <div className="bg-white rounded-lg border overflow-hidden mb-4" style={{ borderColor:'#ddd5c4' }}>
                        <div className="grid text-[10px] font-mono uppercase tracking-widest px-4 py-2" style={{ gridTemplateColumns:'1fr 80px 80px 80px 100px', background:'#f0ebe0', color:'#6b6456' }}>
                          <span>Proposal</span><span className="text-center">Writing</span><span className="text-center">Approach</span><span className="text-center">Credibility</span><span className="text-center">Outcome</span>
                        </div>
                        {writingInsights.map(w => (
                          <Link key={w.project_id} href={`/repository/${w.project_id}`}
                            className="grid items-center px-4 py-3 border-t hover:bg-[#faf7f2] transition-colors text-sm"
                            style={{ gridTemplateColumns:'1fr 80px 80px 80px 100px', borderColor:'#f0ebe0' }}>
                            <span className="font-medium truncate">{w.project_name}</span>
                            <span className="text-center font-mono" style={{ color:w.writing_score>=75?'#3d5c3a':w.writing_score>=55?'#b8962e':'#b04030' }}>{w.writing_score||'—'}</span>
                            <span className="text-center font-mono" style={{ color:(w.approach_score||0)>=75?'#3d5c3a':(w.approach_score||0)>=55?'#b8962e':'#b04030' }}>{w.approach_score||'—'}</span>
                            <span className="text-center font-mono" style={{ color:(w.credibility_score||0)>=75?'#3d5c3a':(w.credibility_score||0)>=55?'#b8962e':'#b04030' }}>{w.credibility_score||'—'}</span>
                            <span className="text-center"><OutcomeLabel outcome={w.outcome}/></span>
                          </Link>
                        ))}
                      </div>
                      {/* Evidence density highlights */}
                      {writingInsights.filter(w=>w.evidence_density).slice(0,2).map(w => (
                        <div key={w.project_id + '_ev'} className="rounded-lg p-4 mb-3 border" style={{ borderColor:'#ddd5c4' }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium">{w.project_name}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#e8f2f4', color:'#1e4a52' }}>
                                Evidence score: {w.evidence_density.evidence_score}/100
                              </span>
                              {w.style_classification && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#6b6456' }}>
                                  {w.style_classification.primary_style}
                                </span>
                              )}
                            </div>
                          </div>
                          {w.evidence_density.strongest_evidence && (
                            <p className="text-xs mb-1" style={{ color:'#3d5c3a' }}>✓ {w.evidence_density.strongest_evidence}</p>
                          )}
                          {w.evidence_density.improvement_priority && (
                            <p className="text-xs" style={{ color:'#b8962e' }}>△ {w.evidence_density.improvement_priority}</p>
                          )}
                        </div>
                      ))}

                      {/* Win indicators */}
                      {writingInsights.filter(w=>w.outcome==='won'&&w.win_indicators?.length>0).slice(0,2).map(w => (
                        <Card key={w.project_id} className="p-4 mb-3" style={{ background:'#edf3ec', border:'1px solid rgba(61,92,58,.2)' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#3d5c3a' }}>Win Indicators — {w.project_name}</div>
                          {w.win_indicators.map((ind, i) => <div key={i} className="text-xs mb-1 flex gap-2"><span style={{ color:'#3d5c3a' }}>↑</span>{ind}</div>)}
                          {w.standout_sentences?.slice(0,1).map((s, i) => <blockquote key={i} className="text-xs italic border-l-2 pl-3 mt-2" style={{ borderColor:'#3d5c3a', color:'#2a4a28' }}>"{s}"</blockquote>)}
                        </Card>
                      ))}
                    </>
                  )}
                </div>
              ) : activeTab === 'news' ? (
                <MarketContext news={news} />
              ) : activeTab === 'approach' ? (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color:'#6b6456' }}>A suggested delivery approach and indicative budget grounded in your matched won proposals and rate card.</p>
                  {!suggestedApproach ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">◈</div>
                      <p className="text-sm mb-1" style={{ color:'#6b6456' }}>No suggested approach available for this scan.</p>
                      <p className="text-xs" style={{ color:'#9b8e80' }}>This requires at least one matched proposal in your repository. Add proposals and re-run the scan.</p>
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
                                  <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color:'#6b6456' }}>{ph.phase}</div>
                                  <div className="font-semibold text-sm mt-0.5">{ph.name}</div>
                                </div>
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded flex-shrink-0" style={{ background:'#e8f2f4', color:'#1e4a52' }}>{ph.duration}</span>
                              </div>
                              {ph.rationale && <p className="text-xs mb-3 italic leading-relaxed" style={{ color:'#6b6456' }}>{ph.rationale}</p>}
                              {(ph.key_activities||[]).length > 0 && (
                                <div className="space-y-1">
                                  {ph.key_activities.map((a, j) => (
                                    <div key={j} className="flex gap-2 text-xs"><span style={{ color:'#1e4a52' }}>→</span><span>{a}</span></div>
                                  ))}
                                </div>
                              )}
                              {(ph.team_roles||[]).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {ph.team_roles.map((r, j) => <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#6b6456' }}>{r}</span>)}
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}

                      {suggestedApproach.indicative_budget && (
                        <Card className="p-5">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Indicative Budget</div>
                          <div className="grid grid-cols-3 gap-4 mb-3">
                            {[['Low', suggestedApproach.indicative_budget.low], ['Mid', suggestedApproach.indicative_budget.mid], ['High', suggestedApproach.indicative_budget.high]].map(([label, val]) => (
                              <div key={label} className="text-center rounded-lg p-3" style={{ background:'#f8f6f2' }}>
                                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#6b6456' }}>{label}</div>
                                <div className="font-mono font-bold text-lg" style={{ color:'#1e4a52' }}>
                                  {currencySymbol(suggestedApproach.indicative_budget.currency)}{((val||0)/1000).toFixed(0)}K
                                </div>
                              </div>
                            ))}
                          </div>
                          {suggestedApproach.indicative_budget.basis && (
                            <p className="text-xs leading-relaxed" style={{ color:'#6b6456' }}>{suggestedApproach.indicative_budget.basis}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] font-mono" style={{ color:'#9b8e80' }}>
                              Confidence: {suggestedApproach.indicative_budget.confidence || 'medium'}
                            </span>
                          </div>
                        </Card>
                      )}

                      {(suggestedApproach.key_risks||[]).length > 0 && (
                        <Card className="p-4">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#6b6456' }}>Key Risks</div>
                          <div className="space-y-1">
                            {suggestedApproach.key_risks.map((r, i) => (
                              <div key={i} className="flex gap-2 text-xs"><span style={{ color:'#b04030' }}>△</span><span>{r}</span></div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {(suggestedApproach.differentiators_to_emphasise||[]).length > 0 && (
                        <Card className="p-4">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#6b6456' }}>Differentiators to Emphasise</div>
                          <div className="space-y-1">
                            {suggestedApproach.differentiators_to_emphasise.map((d, i) => (
                              <div key={i} className="flex gap-2 text-xs"><span style={{ color:'#3d5c3a' }}>✓</span><span>{d}</span></div>
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
                  <p className="text-sm" style={{ color:'#6b6456' }}>Based on your matched won proposals and identified gaps — specific actions to improve your chances of winning this bid.</p>
                  {!winStrategy ? (
                    <div className="text-center py-12"><div className="text-3xl mb-3 opacity-25">⚡</div><p className="text-sm" style={{ color:'#6b6456' }}>Win strategy not available for this scan. Re-run the scan to generate one.</p></div>
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
                        <div className="rounded-lg p-4 border" style={{ background:'#faf4e2', borderColor:'rgba(184,150,46,.3)' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#8a6200' }}>Differentiator Angle</div>
                          <p className="text-sm" style={{ color:'#5a4810' }}>{winStrategy.differentiator_angle}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top priorities */}
                        {(winStrategy.priorities||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'#edf3ec', borderColor:'rgba(61,92,58,.2)' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#3d5c3a' }}>Top Priorities</div>
                            {winStrategy.priorities.map((p, i) => (
                              <div key={i} className="mb-3 last:mb-0">
                                <div className="flex gap-2 text-xs mb-1">
                                  <span className="font-bold flex-shrink-0" style={{ color:'#3d5c3a' }}>+</span>
                                  <span className="font-semibold">{p.priority || p}</span>
                                </div>
                                {p.rationale && <p className="text-xs pl-4" style={{ color:'#3d5c3a' }}>{p.rationale}</p>}
                                {p.evidence && <p className="text-[10px] pl-4 italic mt-0.5" style={{ color:'#6b8a68' }}>Evidence: {p.evidence}</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Risks */}
                        {(winStrategy.risks||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'#faeeeb', borderColor:'rgba(176,64,48,.2)' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#b04030' }}>Risks to Mitigate</div>
                            {winStrategy.risks.map((r, i) => (
                              <div key={i} className="mb-3 last:mb-0">
                                <div className="flex gap-2 text-xs mb-1">
                                  <span className="font-bold flex-shrink-0" style={{ color:'#b04030' }}>−</span>
                                  <span className="font-semibold">{r.risk || r}</span>
                                </div>
                                {r.mitigation && <p className="text-xs pl-4" style={{ color:'#b04030' }}>{r.mitigation}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Focus */}
                        {(winStrategy.focus||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'#e8f2f4', borderColor:'rgba(30,74,82,.2)' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#1e4a52' }}>Emphasise These</div>
                            {winStrategy.focus.map((f, i) => (
                              <div key={i} className="flex gap-2 text-xs mb-1.5"><span style={{ color:'#1e4a52' }}>→</span><span>{f}</span></div>
                            ))}
                          </div>
                        )}

                        {/* Avoid */}
                        {(winStrategy.avoid||[]).length > 0 && (
                          <div className="rounded-lg p-4 border" style={{ background:'#f8f6f2', borderColor:'#ddd5c4' }}>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Avoid These</div>
                            {winStrategy.avoid.map((a, i) => (
                              <div key={i} className="flex gap-2 text-xs mb-1.5"><span style={{ color:'#b04030' }}>✕</span><span>{a}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : activeTab === 'language' ? (
                <div className="space-y-4">
                  <p className="text-sm" style={{ color:'#6b6456' }}>High-performing language extracted from your won proposals. Specific, evidence-based sentences that can be adapted for this bid.</p>
                  {winningLanguage.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">✍</div>
                      <p className="text-sm mb-1" style={{ color:'#6b6456' }}>No winning language available.</p>
                      <p className="text-xs" style={{ color:'#9b8e80' }}>This requires won proposals rated 4+ stars with writing analysis completed. Run Re-analyse on your best proposals first.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {winningLanguage.map((s, i) => (
                        <div key={i} className="rounded-lg border overflow-hidden" style={{ background:'white', borderColor:'#ddd5c4' }}>
                          <div className="p-4">
                          <blockquote className="text-sm italic leading-relaxed border-l-3 pl-3 mb-3" style={{ borderLeft:'3px solid #b8962e', color:'#1a1a1a' }}>
                            "{s.text}"
                          </blockquote>
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#6b6456' }}>Why it works</div>
                              <p className="text-xs" style={{ color:'#6b6456' }}>{s.why_it_works}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#6b6456' }}>Use in</div>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background:'#e8f2f4', color:'#1e4a52' }}>{s.use_case}</span>
                            </div>
                          </div>
                          {s.source_proposal && <div className="text-[10px] font-mono mt-2 pt-2 border-t" style={{ color:'#9b8e80', borderColor:'#f0ebe0' }}>From: {s.source_proposal}</div>}
                          {s.adaptation_note && (
                            <div className="mt-2 pt-2 border-t" style={{ borderColor:'#f0ebe0' }}>
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#b8962e' }}>How to adapt</div>
                              <p className="text-xs" style={{ color:'#8a6200' }}>{s.adaptation_note}</p>
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
                  <p className="text-sm" style={{ color:'#6b6456' }}>
                    Specific narrative structure advice for this bid — grounded in your best matched proposals.
                  </p>
                  {!scan.narrative_advice || scan.narrative_advice.startsWith('Error:') ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3 opacity-25">✎</div>
                      <p className="text-sm" style={{ color:'#6b6456' }}>No narrative advice available for this scan.</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl p-5" style={{ background:'#1e4a52', color:'white' }}>
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-3 opacity-70">Bid Strategist Advice</div>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{narrativeText}</p>
                      </div>

                      {proposalStructure && (
                        <div className="rounded-xl p-5 border" style={{ background:'#faf7f2', borderColor:'#ddd5c4' }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>
                            Recommended Proposal Structure — from {goodMatchCount || 'your'} won proposals
                          </div>
                          {proposalStructure.narrative_arc && (
                            <p className="text-sm mb-4 italic" style={{ color:'#6b6456' }}>{proposalStructure.narrative_arc}</p>
                          )}
                          {proposalStructure.recommended_section_order?.length > 0 && (
                            <div className="mb-4">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#9b8e80' }}>Section Order</div>
                              <div className="flex flex-wrap gap-2">
                                {proposalStructure.recommended_section_order.map((s, i) => (
                                  <span key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background:'#e8f2f4', color:'#1e4a52' }}>
                                    <span className="font-mono text-[10px] opacity-60">{i+1}</span> {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {proposalStructure.apply_to_this_bid && (
                            <div className="rounded-lg p-3 text-xs" style={{ background:'#faf4e2', color:'#8a6200' }}>
                              <span className="font-semibold">For this bid: </span>{proposalStructure.apply_to_this_bid}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Writing insights from matched proposals */}
                      {writingInsights.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>
                            Writing Quality — Top Matched Proposals
                          </div>
                          <div className="space-y-2">
                            {writingInsights.map((w, i) => (
                              <div key={i} className="rounded-lg p-3 border flex items-center gap-4"
                                style={{ background:'white', borderColor:'#ddd5c4' }}>
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
                                      <div style={{ color:'#9b8e80' }}>{lbl}</div>
                                    </div>
                                  ))}
                                </div>
                                {w.standout_sentences?.length > 0 && (
                                  <div className="text-xs italic max-w-xs truncate" style={{ color:'#6b6456' }}>
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
              ) : (
                <div className="text-center py-12"><p className="text-sm" style={{ color:'#6b6456' }}>Select a tab above.</p></div>
              )}
            </div>
          </div>

          {/* Right panel - hidden on mobile */}
          <div className="hidden lg:block w-80 flex-shrink-0 overflow-y-auto p-4 space-y-4" style={{ background:'#f0ebe0' }}>
            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Scan Summary</div>
              <div className="grid grid-cols-2 gap-2">
                {[['Matches',matches.length,'#1e4a52'],['Gaps',gaps.length,'#b04030'],['News',news.length,'#3d5c3a'],['Team Fits',team.length,'#b8962e']].map(([l,v,c]) => (
                  <div key={l} className="rounded-lg p-2.5 text-center" style={{ background:'#f0ebe0' }}>
                    <div className="font-serif text-2xl" style={{ color:c }}>{v}</div>
                    <div className="text-[10px] font-mono" style={{ color:'#6b6456' }}>{l}</div>
                  </div>
                ))}
              </div>
            </Card>

            {rfpData.title && (
              <Card className="p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>RFP Details</div>
                {[['Client',rfpData.client],['Sector',rfpData.sector],['Value hint',rfpData.contract_value_hint],['Deadline',rfpData.deadline],['Framework',rfpData.procurement_framework]].filter(([,v])=>v).map(([k,v]) => (
                  <div key={k} className="flex justify-between py-1.5 border-b text-xs last:border-0" style={{ borderColor:'#f0ebe0' }}>
                    <span style={{ color:'#6b6456' }}>{k}</span><span className="font-medium text-right max-w-[160px]">{v}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Coverage */}
            {Object.keys(coverage).length > 0 && (
              <Card className="p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Criteria Coverage</div>
                {Object.entries(coverage).filter(([,v])=>v!==null).map(([sec,pct]) => (
                  <div key={sec} className="mb-2">
                    <div className="flex justify-between text-xs mb-1"><span>{sec}</span><span className="font-mono" style={{ color:pct<40?'#b04030':pct<70?'#b8962e':'#3d5c3a' }}>{pct}%</span></div>
                    <ProgressBar value={pct} color={pct<40?'#b04030':pct<70?'#b8962e':'#3d5c3a'} />
                  </div>
                ))}
              </Card>
            )}

            {/* Narrative advice — now in its own tab */}
            {narrativeText && !narrativeText.startsWith('Error:') && (
              <Card className="p-4 cursor-pointer hover:bg-[#f8f6f2] transition-colors" onClick={() => setActiveTab('narrative')}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color:'#6b6456' }}>Narrative Advice</div>
                <p className="text-xs leading-relaxed line-clamp-3" style={{ color:'#6b6456' }}>{narrativeText}</p>
                <div className="text-[10px] mt-2 font-mono" style={{ color:'#1e4a52' }}>View full advice →</div>
              </Card>
            )}

            {/* Team */}
            {team.length > 0 && (
              <Card>
                <div className="px-4 py-3 border-b text-[9px] font-mono uppercase tracking-widest" style={{ borderColor:'#f0ebe0', color:'#6b6456' }}>Suggested Team</div>
                {team.slice(0,5).map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0" style={{ borderColor:'#f0ebe0' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background:m.color||'#2d6b78' }}>
                      {m.name.split(' ').map(n=>n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{m.name}</div>
                      <div className="text-[10px] truncate" style={{ color:'#6b6456' }}>{m.title}</div>
                    </div>
                    <div className="text-[10px] font-mono font-medium" style={{ color:'#1e4a52' }}>{m.fit_score}%</div>
                  </div>
                ))}
                <div className="p-3"><Link href="/team"><Btn variant="ghost" size="sm" className="w-full justify-center">View Team →</Btn></Link></div>
              </Card>
            )}

            {/* Financial model */}
            {financial.total_revenue > 0 && (
              <Card className="p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Indicative Financial Model</div>
                {[['Revenue',`£${(financial.total_revenue).toLocaleString()}`],['Labour Cost',`£${(financial.total_labour_cost).toLocaleString()}`],['Overhead (12%)',`£${(financial.overhead).toLocaleString()}`],['Est. Margin',`${financial.net_margin}%`]].map(([k,v]) => (
                  <div key={k} className="flex justify-between py-1.5 border-b text-xs last:border-0 last:font-semibold" style={{ borderColor:'#f0ebe0' }}>
                    <span style={{ color:'#6b6456' }}>{k}</span><span className="font-mono" style={{ color:k==='Est. Margin'?(financial.net_margin>25?'#3d5c3a':'#b04030'):undefined }}>{v}</span>
                  </div>
                ))}
                <p className="text-[10px] mt-2" style={{ color:'#6b6456' }}>Based on {financial.estimated_days} days · indicative only</p>
              </Card>
            )}

            <Link href="/rfp"><Btn variant="ghost" size="sm" className="w-full justify-center">← New Scan</Btn></Link>
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
function SectionDraftPanel({ draft, matches, winningLanguage, onUpdateText, onAccept, onRegenerate, onDiscard, onClose, regenerating }) {
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

  // Highlighting helper — wraps [#N] match citations and [EVIDENCE NEEDED]
  // markers in coloured spans so the writer can see what's a placeholder.
  function renderHighlighted(t) {
    if (!t) return null;
    // Split by markers but keep them
    const parts = t.split(/(\[#\d+\]|\[EVIDENCE NEEDED[^\]]*\])/g);
    return parts.map((part, i) => {
      if (/^\[#\d+\]$/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(30,74,82,.12)', color: '#1e4a52' }}>{part}</span>;
      }
      if (/^\[EVIDENCE NEEDED/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(184,150,46,.18)', color: '#8a6200' }}>{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="border-t" style={{ borderColor: '#f0ebe0', background: '#faf7f2' }}>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>AI Draft</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: confColor + '14', color: confColor, border: `1px solid ${confColor}40` }}>
              {draft.confidence} confidence
            </span>
            {isAccepted && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: '#3d5c3a', color: 'white' }}>
                ✓ accepted
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[11px]" style={{ color: '#9b8e80' }}>hide</button>
        </div>

        {draft.confidence_reason && (
          <p className="text-[11px] italic mb-3" style={{ color: '#6b6456' }}>{draft.confidence_reason}</p>
        )}

        {/* Draft body */}
        <div className="rounded-lg p-4 mb-3" style={{ background: 'white', border: '1px solid #ddd5c4' }}>
          {editing ? (
            <textarea value={text} onChange={e => setText(e.target.value)}
              rows={Math.max(8, text.split('\n').length + 2)}
              className="w-full text-sm leading-relaxed outline-none resize-y font-serif"
              style={{ color: '#1a1816' }} />
          ) : (
            <p className="text-sm leading-relaxed font-serif whitespace-pre-wrap" style={{ color: '#1a1816' }}>
              {renderHighlighted(text)}
            </p>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {!editing && !isAccepted && (
            <button onClick={() => setEditing(true)}
              className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
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
                className="text-[11px] px-2.5 py-1.5 rounded" style={{ color: '#6b6456' }}>
                Cancel
              </button>
            </>
          )}
          {!editing && (
            <>
              <button onClick={() => navigator.clipboard.writeText(text)}
                className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
                ⎘ Copy
              </button>
              <button onClick={onRegenerate} disabled={regenerating}
                className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#1e4a52' }}>
                {regenerating ? 'Regenerating…' : '⟳ Regenerate'}
              </button>
              {!isAccepted && (
                <button onClick={onAccept}
                  className="text-[11px] px-2.5 py-1.5 rounded font-medium" style={{ background: '#3d5c3a', color: 'white' }}>
                  ✓ Accept draft
                </button>
              )}
              <button onClick={onDiscard}
                className="text-[11px] px-2.5 py-1.5 rounded border ml-auto" style={{ borderColor: '#f5c6c0', color: '#b04030' }}>
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
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#1e4a52' }}>Matches cited</div>
                <ul className="space-y-1">
                  {citedMatches.map((m, i) => (
                    <li key={m.id}>
                      <Link href={`/repository/${m.id}`} className="hover:underline" style={{ color: '#1e4a52' }}>
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
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#8a6200' }}>Language patterns</div>
                <ul className="space-y-1">
                  {citedLanguage.map((s, i) => (
                    <li key={i} className="italic" style={{ color: '#5a4810' }}>
                      "{(s.adapted || s.text || '').slice(0, 100)}{(s.adapted || s.text || '').length > 100 ? '…' : ''}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(draft.evidence_needed || []).length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(176,64,48,.05)', border: '1px solid rgba(176,64,48,.15)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#b04030' }}>Writer must fill in</div>
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
}

// ── Outcome Capture Modal — Wave 3 closed feedback loop ───────────────────
// Active capture form for the bid outcome. Records what happened with the
// bid, whether ProposalIQ contributed materially, and free-text on what was
// useful / what was missing. Feeds into lib/feedback.js to bias future
// ranking toward proposals that have actually been used in winning bids.
function OutcomeCaptureModal({ existing, usageSummary, scanName, onSave, onClose }) {
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
      <div className="rounded-xl bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b flex items-baseline justify-between" style={{ borderColor: '#ddd5c4' }}>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>Bid outcome</div>
            <h2 className="font-serif text-xl mt-0.5">{scanName}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: '#9b8e80' }}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {usageHint && (
            <div className="rounded-lg p-3 text-xs" style={{ background: '#fbf9f4', color: '#6b6456' }}>
              <span className="font-semibold" style={{ color: '#1a1816' }}>You used this scan to: </span>{usageHint}
            </div>
          )}

          {/* Outcome */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: '#6b6456' }}>Outcome</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { val: 'won',     label: '★ Won',         color: '#3d5c3a' },
                { val: 'lost',    label: '✕ Lost',        color: '#b04030' },
                { val: 'pending', label: '◷ Pending',     color: '#b8962e' },
                { val: 'no_bid',  label: '✕ Did not bid', color: '#6b6456' },
              ].map(opt => (
                <button key={opt.val} onClick={() => setOutcomeVal(opt.val)}
                  className="text-xs py-2 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: outcome === opt.val ? opt.color : '#ddd5c4',
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
            <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-lg border" style={{ borderColor: '#ddd5c4' }}>
              <input type="checkbox" checked={submitted} onChange={e => setSubmitted(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium" style={{ color: '#1a1816' }}>Submitted to client</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#6b6456' }}>Tick if the bid was actually submitted (not just drafted).</div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-lg border" style={{ borderColor: '#ddd5c4' }}>
              <input type="checkbox" checked={piqUsed} onChange={e => setPiqUsed(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium" style={{ color: '#1a1816' }}>ProposalIQ contributed materially</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#6b6456' }}>Used the verdict, copied snippets, applied recommendations, etc.</div>
              </div>
            </label>
          </div>

          {/* Free text */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>What was most useful?</label>
            <textarea value={mostUseful} onChange={e => setMostUseful(e.target.value)}
              rows={2} placeholder="e.g. The matched proposals from the HMRC contract, the gap analysis flagging DSPT compliance, the win strategy opening narrative…"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#ddd5c4' }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>What was missing or wrong?</label>
            <textarea value={whatMissing} onChange={e => setWhatMissing(e.target.value)}
              rows={2} placeholder="e.g. Should have flagged the social value requirement, off-sector matches in cross-sector list, win strategy too generic…"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#ddd5c4' }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Client feedback (optional)</label>
            <textarea value={clientFeedback} onChange={e => setClientFeedback(e.target.value)}
              rows={2} placeholder="e.g. Strong on technical, weak on commercials. They noted the 47-trust scale claim specifically."
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#ddd5c4' }} />
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#ddd5c4', background: '#faf7f2' }}>
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg" style={{ color: '#6b6456' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            style={{ background: '#1e4a52', color: 'white' }}>
            {saving ? 'Saving…' : 'Save outcome'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PROPOSAL ASSEMBLY TAB ─────────────────────────────────────────────────────
const SECTION_STATUSES = ['not started', 'in progress', 'draft ready', 'complete'];
const STATUS_COLORS = { 'not started':'#ddd5c4', 'in progress':'#b8962e', 'draft ready':'#1e4a52', 'complete':'#3d5c3a' };

function AssemblyTab({ scan, matches, winStrategy, suggestedApproach, onToast,
  onGenerateTemplate, onExportBriefing, generatingTemplate, templateDraftMode, setTemplateDraftMode, exporting }) {
  const rfpData = scan?.rfp_data || {};
  const storageKey = `piq_assembly_${scan?.id}`;
  // Wave 4 — section drafts state
  const [drafts, setDrafts] = useState({});  // section_id → draft object
  const [generating, setGenerating] = useState(null); // section_id currently generating
  const [openDraftId, setOpenDraftId] = useState(null); // section_id whose panel is expanded
  // Full proposal state
  const [fullProposal, setFullProposal] = useState(null);
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
      onToast('✓ Full proposal draft ready — style-matched and coverage-checked');
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
                <div className="flex rounded overflow-hidden border border-white/30">
                  <button onClick={() => { setTemplateDraftMode(false); onGenerateTemplate(); }} disabled={generatingTemplate}
                    className="text-xs px-3 py-1.5 text-white/80 hover:text-white">
                    {generatingTemplate && !templateDraftMode ? 'Building…' : '📄 Template'}
                  </button>
                  <div className="w-px bg-white/20" />
                  <button onClick={() => { setTemplateDraftMode(true); onGenerateTemplate(); }} disabled={generatingTemplate}
                    className="text-xs px-3 py-1.5 text-white/80 hover:text-white">
                    {generatingTemplate && templateDraftMode ? 'Writing…' : '✍ Draft'}
                  </button>
                </div>
              )}
              {onExportBriefing && (
                <button onClick={onExportBriefing} disabled={exporting}
                  className="text-xs px-3 py-1.5 rounded text-white/70 hover:text-white border border-white/20">
                  {exporting ? 'Exporting…' : '↓ Export briefing'}
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
          style={{ background: '#faf4e2', border: '1px solid rgba(184,150,46,.3)', color: '#7a5800' }}>
          <span className="flex-shrink-0">✦</span>
          <span>
            This is a first draft grounded in your intelligence. <strong>[#N]</strong> markers reference your matched proposals.
            <strong> [EVIDENCE NEEDED]</strong> markers show where you need to fill in specific data.
            Edit directly below, then copy into your proposal template.
          </span>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setEditingFull(!editingFull)}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#1e4a52' }}>
            {editingFull ? '◉ Preview' : '✎ Edit'}
          </button>
          <button onClick={() => {
            navigator.clipboard.writeText(fullProposalText);
            onToast('Proposal copied to clipboard');
          }}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
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
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
            ↓ Download .txt
          </button>
          <button onClick={generateFullProposalDoc} disabled={generatingFull}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#ddd5c4', color: '#1e4a52' }}>
            {generatingFull ? 'Regenerating…' : '⟳ Regenerate'}
          </button>
          <span className="text-[10px] font-mono ml-auto" style={{ color: '#9b8e80' }}>
            {fullProposalText.split(/\s+/).length.toLocaleString()} words
          </span>
        </div>

        {/* Document body */}
        <div className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: '#ddd5c4' }}>
          {editingFull ? (
            <textarea value={fullProposalText} onChange={e => setFullProposalText(e.target.value)}
              rows={Math.max(30, fullProposalText.split('\n').length + 5)}
              className="w-full text-sm leading-relaxed p-8 outline-none resize-y font-serif"
              style={{ color: '#1a1816', minHeight: '80vh' }} />
          ) : (
            <div className="p-8 prose prose-sm max-w-none font-serif" style={{ color: '#1a1816' }}>
              {fullProposalText.split('\n').map((line, i) => {
                if (!line.trim()) return <br key={i} />;
                if (line.startsWith('## ')) {
                  return <h2 key={i} className="text-lg font-serif font-semibold mt-8 mb-3 pb-2 border-b" style={{ color: '#1e4a52', borderColor: '#f0ebe0' }}>{line.replace(/^## /, '')}</h2>;
                }
                if (line.startsWith('### ')) {
                  return <h3 key={i} className="text-base font-serif font-semibold mt-5 mb-2" style={{ color: '#3d5c3a' }}>{line.replace(/^### /, '')}</h3>;
                }
                // Highlight [#N] references and [EVIDENCE NEEDED] markers
                const parts = line.split(/(\[#\d+\]|\[EVIDENCE NEEDED[^\]]*\])/g);
                return (
                  <p key={i} className="text-sm leading-relaxed mb-3">
                    {parts.map((part, j) => {
                      if (/^\[#\d+\]$/.test(part)) return <span key={j} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(30,74,82,.12)', color: '#1e4a52' }}>{part}</span>;
                      if (/^\[EVIDENCE NEEDED/.test(part)) return <span key={j} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(184,150,46,.18)', color: '#8a6200' }}>{part}</span>;
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
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#ddd5c4' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#fbf9f4' }}>
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>Requirements coverage check</div>
                {coverageReport.coverage_summary && (
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: coverageReport.coverage_summary.coverage_percentage >= 80 ? '#edf3ec' :
                        coverageReport.coverage_summary.coverage_percentage >= 60 ? '#faf4e2' : '#faeeeb',
                      color: coverageReport.coverage_summary.coverage_percentage >= 80 ? '#3d5c3a' :
                        coverageReport.coverage_summary.coverage_percentage >= 60 ? '#8a6200' : '#b04030',
                    }}>
                    {coverageReport.coverage_summary.coverage_percentage}% covered
                  </span>
                )}
              </div>
              {coverageReport.coverage_summary && (
                <div className="text-[11px] font-mono" style={{ color: '#9b8e80' }}>
                  {coverageReport.coverage_summary.fully_addressed} addressed · {coverageReport.coverage_summary.partially_addressed} partial · {coverageReport.coverage_summary.missed} missed
                </div>
              )}
            </div>

            {/* Critical gaps warning */}
            {coverageReport.critical_gaps?.length > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: '#f0ebe0', background: '#faeeeb' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#b04030' }}>Critical — MUST requirements not addressed</div>
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
            <div className="px-5 py-3 border-t max-h-80 overflow-y-auto" style={{ borderColor: '#f0ebe0' }}>
              {(coverageReport.requirements || []).map((r, i) => {
                const statusIcon = r.status === 'addressed' ? '✓' : r.status === 'partial' ? '◐' : '✕';
                const statusColor = r.status === 'addressed' ? '#3d5c3a' : r.status === 'partial' ? '#b8962e' : '#b04030';
                return (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-0 text-xs" style={{ borderColor: '#f8f6f2' }}>
                    <span className="flex-shrink-0 font-bold mt-0.5" style={{ color: statusColor }}>{statusIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] flex-shrink-0" style={{ color: r.priority === 'must' ? '#b04030' : '#6b6456' }}>
                          [{r.priority?.toUpperCase()}]
                        </span>
                        <span className="truncate" style={{ color: '#1a1816' }}>{r.text}</span>
                      </div>
                      {r.note && <div className="text-[11px] mt-0.5" style={{ color: '#6b6456' }}>{r.note}</div>}
                    </div>
                    {r.where_addressed && (
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#9b8e80' }}>
                        {r.where_addressed}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Improvement suggestions */}
            {coverageReport.improvement_suggestions?.length > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: '#f0ebe0', background: '#fbf9f4' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#1e4a52' }}>Suggestions to improve coverage</div>
                <ul className="space-y-1">
                  {coverageReport.improvement_suggestions.map((s, i) => (
                    <li key={i} className="text-xs flex gap-2" style={{ color: '#1e4a52' }}>
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
            </div>
            <button onClick={generateFullProposalDoc} disabled={generatingFull}
              className="flex-shrink-0 text-sm px-5 py-3 rounded-lg font-semibold transition-all disabled:opacity-60"
              style={{ background: '#b8962e', color: 'white' }}>
              {generatingFull ? <><Spinner size={14} /> Writing proposal…</> : '✍ Generate proposal'}
            </button>
          </div>
          {generatingFull && (
            <div className="px-5 py-3 text-xs flex items-center gap-2" style={{ background: '#faf4e2', color: '#7a5800' }}>
              <Spinner size={12} />
              <span>Writing 8 sections in your winning style — this takes 30–60 seconds…</span>
            </div>
          )}
        </div>
      )}

      {/* Quick actions — Template / Draft / Export inline */}
      {onGenerateTemplate && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#9b8e80' }}>Export:</span>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: '#1e4a52' }}>
            <button onClick={() => { setTemplateDraftMode(false); onGenerateTemplate(); }} disabled={generatingTemplate}
              className="text-xs px-3 py-1.5 transition-colors hover:bg-teal-50" style={{ color: '#1e4a52' }}>
              {generatingTemplate && !templateDraftMode ? <><Spinner size={10} /> Building…</> : '📄 Template (.docx)'}
            </button>
            <div className="w-px" style={{ background: '#1e4a52' }} />
            <button onClick={() => { setTemplateDraftMode(true); onGenerateTemplate(); }} disabled={generatingTemplate}
              className="text-xs px-3 py-1.5 transition-colors hover:bg-teal-50" style={{ color: '#1e4a52' }}>
              {generatingTemplate && templateDraftMode ? <><Spinner size={10} /> Writing…</> : '✍ AI Draft (.docx)'}
            </button>
          </div>
          <button onClick={onExportBriefing} disabled={exporting}
            className="text-xs px-3 py-1.5 rounded border transition-colors hover:bg-gray-50" style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
            {exporting ? 'Exporting…' : '↓ Export briefing (.html)'}
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
          <div key={s} className="flex items-center gap-1.5 text-[11px]" style={{ color:'#6b6456' }}>
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
          <div key={s.id} className="rounded-xl border overflow-hidden" style={{ background:'white', borderColor:'#ddd5c4' }}>
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
                <div className="text-xs mt-0.5" style={{ color:'#9b8e80' }}>{s.description}</div>
              </div>
              {/* Status selector */}
              <select value={s.status} onChange={e => updateSection(s.id, { status: e.target.value })}
                className="text-xs border rounded-lg px-2 py-1.5 outline-none no-min-h flex-shrink-0"
                style={{ borderColor:'#ddd5c4', color:STATUS_COLORS[s.status], minWidth:120 }}>
                {SECTION_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>

            {/* Source traceability + notes */}
            <div className="px-4 pb-3 flex items-start gap-3 border-t" style={{ borderColor:'#f8f6f2' }}>
              <div className="flex-1 pt-2">
                {relevantMatch && (
                  <div className="text-[10px] font-mono mb-1.5" style={{ color:'#1e4a52' }}>
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
                  style={{ borderColor:'#ddd5c4', color:'#3a3530' }}
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
                    style={{ borderColor: '#1e4a52', color: '#1e4a52' }}
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
        className="w-full py-3 rounded-xl border text-sm font-medium transition-all hover:bg-cream no-min-h"
        style={{ borderColor:'#ddd5c4', color:'#1e4a52' }}>
        ⊡ Copy Assembly Plan to Clipboard
      </button>
    </div>
  );
}

// ── Executive Bid Brief — synthesis layer landing page ────────────────────
// The default tab. Renders the verdict at the top, then top priorities,
// risks, recommended assets, and immediate next actions. Designed so the
// bid director can read it in 90 seconds and walk away with a decision.
function ExecutiveBrief({ brief, bidScore, matches, onJumpTab }) {
  if (!brief) {
    return (
      <div className="py-16 text-center">
        <div className="text-3xl mb-3 opacity-25">★</div>
        <p className="text-sm" style={{ color: '#6b6456' }}>Executive brief not available for this scan.</p>
        <p className="text-xs mt-2" style={{ color: '#9b8e80' }}>Re-run the scan to generate one.</p>
      </div>
    );
  }

  const verdict = brief.verdict || {};
  const decision = String(verdict.decision || '').toUpperCase();
  const decisionColor =
    decision.includes('STRONG') ? '#3d5c3a' :
    decision.includes('NO BID') ? '#b04030' :
    decision.includes('CONDITIONAL') ? '#b8962e' :
    decision.includes('BID') ? '#1e4a52' : '#6b6456';
  const decisionBg = decisionColor + '14';

  const priorities = Array.isArray(brief.top_3_priorities) ? brief.top_3_priorities : [];
  const risks = Array.isArray(brief.top_3_risks) ? brief.top_3_risks : [];
  const assets = Array.isArray(brief.recommended_assets_to_use) ? brief.recommended_assets_to_use : [];
  const nextActions = Array.isArray(brief.immediate_next_actions) ? brief.immediate_next_actions : [];
  const deprioritise = Array.isArray(brief.what_to_deprioritise) ? brief.what_to_deprioritise : [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* ── VERDICT BANNER ── */}
      <div className="rounded-xl p-5 border-2" style={{ borderColor: decisionColor, background: decisionBg }}>
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: decisionColor, opacity: 0.7 }}>Verdict</span>
            <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ background: decisionColor, color: 'white' }}>
              {decision || 'CONDITIONAL'}
            </span>
            {verdict.confidence && (
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: decisionColor, opacity: 0.6 }}>
                {verdict.confidence} confidence
              </span>
            )}
          </div>
          {bidScore?.score != null && (
            <div className="text-right">
              <div className="font-serif text-2xl" style={{ color: decisionColor }}>{bidScore.score}<span className="text-sm opacity-50">/100</span></div>
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: decisionColor, opacity: 0.6 }}>Bid score</div>
            </div>
          )}
        </div>
        {verdict.headline && (
          <p className="text-base leading-relaxed font-serif" style={{ color: '#1a1816' }}>{verdict.headline}</p>
        )}
        {verdict.score_summary && (
          <p className="text-xs mt-2 italic" style={{ color: '#6b6456' }}>{verdict.score_summary}</p>
        )}
      </div>

      {/* ── WINNING THESIS ── */}
      {brief.winning_thesis_one_liner && (
        <div className="rounded-lg p-4" style={{ background: '#1e4a52', color: 'white' }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2 opacity-70">Winning Thesis</div>
          <p className="text-sm leading-relaxed italic">"{brief.winning_thesis_one_liner}"</p>
        </div>
      )}

      {/* ── WHAT IT'S REALLY ASKING / FIT ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {brief.what_this_brief_is_really_asking_for && (
          <div className="rounded-lg p-4 border" style={{ background: 'white', borderColor: '#ddd5c4' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>What this RFP is really asking for</div>
            <p className="text-sm leading-relaxed" style={{ color: '#1a1816' }}>{brief.what_this_brief_is_really_asking_for}</p>
          </div>
        )}
        {brief.are_we_a_strong_fit && (
          <div className="rounded-lg p-4 border" style={{ background: 'white', borderColor: '#ddd5c4' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Are we a strong fit?</div>
            <p className="text-sm leading-relaxed" style={{ color: '#1a1816' }}>{brief.are_we_a_strong_fit}</p>
          </div>
        )}
      </div>

      {/* ── PRIORITIES + RISKS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {priorities.length > 0 && (
          <div className="rounded-lg p-4 border" style={{ background: '#edf3ec', borderColor: 'rgba(61,92,58,.25)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#3d5c3a' }}>Top 3 priorities</div>
            <ol className="space-y-3">
              {priorities.slice(0, 3).map((p, i) => (
                <li key={i} className="text-sm">
                  <div className="flex gap-2">
                    <span className="font-mono font-bold flex-shrink-0" style={{ color: '#3d5c3a' }}>{i + 1}.</span>
                    <div className="flex-1">
                      <div className="font-medium" style={{ color: '#1a1816' }}>{p.priority || p}</div>
                      {p.why_it_matters && <div className="text-xs mt-1 italic" style={{ color: '#3d5c3a' }}>Why: {p.why_it_matters}</div>}
                      {p.evidence && <div className="text-xs mt-0.5 font-mono" style={{ color: '#6b6456' }}>Evidence: {p.evidence}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {risks.length > 0 && (
          <div className="rounded-lg p-4 border" style={{ background: '#faeeeb', borderColor: 'rgba(176,64,48,.25)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#b04030' }}>Top 3 risks</div>
            <ol className="space-y-3">
              {risks.slice(0, 3).map((r, i) => (
                <li key={i} className="text-sm">
                  <div className="flex gap-2">
                    <span className="font-mono font-bold flex-shrink-0" style={{ color: '#b04030' }}>{i + 1}.</span>
                    <div className="flex-1">
                      <div className="font-medium" style={{ color: '#1a1816' }}>{r.risk || r}</div>
                      {r.mitigation && <div className="text-xs mt-1" style={{ color: '#b04030' }}>→ {r.mitigation}</div>}
                      {r.owner && <div className="text-[10px] mt-0.5 font-mono uppercase tracking-wide" style={{ color: '#6b6456' }}>{r.owner}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* ── STYLE / STRUCTURE ── */}
      {(brief.best_fit_style || brief.best_fit_structure) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {brief.best_fit_style && (
            <div className="rounded-lg p-4 border" style={{ background: '#faf4e2', borderColor: 'rgba(184,150,46,.3)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#8a6200' }}>Best-fit style</div>
              <p className="text-sm" style={{ color: '#5a4810' }}>{brief.best_fit_style}</p>
            </div>
          )}
          {brief.best_fit_structure && (
            <div className="rounded-lg p-4 border" style={{ background: '#faf4e2', borderColor: 'rgba(184,150,46,.3)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#8a6200' }}>Best-fit structure</div>
              <p className="text-sm" style={{ color: '#5a4810' }}>{brief.best_fit_structure}</p>
            </div>
          )}
        </div>
      )}

      {/* ── RECOMMENDED ASSETS ── */}
      {assets.length > 0 && (
        <div className="rounded-lg p-4 border" style={{ background: 'white', borderColor: '#ddd5c4' }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#1e4a52' }}>Past assets to use</div>
            <button onClick={() => onJumpTab && onJumpTab('matches')} className="text-[11px] font-mono" style={{ color: '#1e4a52' }}>
              See all matches →
            </button>
          </div>
          <div className="space-y-2">
            {assets.slice(0, 5).map((a, i) => (
              <div key={i} className="flex gap-3 text-sm py-2 border-b last:border-0" style={{ borderColor: '#f0ebe0' }}>
                <span className="font-mono text-xs flex-shrink-0 mt-0.5" style={{ color: '#1e4a52' }}>◆</span>
                <div className="flex-1">
                  <div className="font-medium" style={{ color: '#1a1816' }}>{a.name}</div>
                  {a.why && <div className="text-xs mt-0.5" style={{ color: '#6b6456' }}>{a.why}</div>}
                  {a.use_for && <div className="text-[10px] mt-0.5 font-mono uppercase tracking-wide" style={{ color: '#9b8e80' }}>Use for: {a.use_for}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DEPRIORITISE ── */}
      {deprioritise.length > 0 && (
        <div className="rounded-lg p-4 border" style={{ background: '#f8f6f2', borderColor: '#ddd5c4' }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Do not waste effort on</div>
          <ul className="space-y-1">
            {deprioritise.map((d, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: '#6b6456' }}>
                <span className="flex-shrink-0">✕</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── IMMEDIATE NEXT ACTIONS ── */}
      {nextActions.length > 0 && (
        <div className="rounded-lg p-4 border-2" style={{ background: '#1e4a52', borderColor: '#1e4a52', color: 'white' }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-3 opacity-70">Do these today</div>
          <ol className="space-y-2">
            {nextActions.slice(0, 5).map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono font-bold opacity-60 flex-shrink-0">{i + 1}.</span>
                <div className="flex-1">
                  <div>{a.action || a}</div>
                  <div className="flex gap-3 mt-0.5 text-[10px] font-mono uppercase tracking-wide opacity-70">
                    {a.owner && <span>👤 {a.owner}</span>}
                    {a.deadline && <span>⏱ {a.deadline}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Tiered match grouping ────────────────────────────────────────────────
// Groups matches by their taxonomy_tier and renders each group as a section.
// Direct-fit tiers (1, 2, 3) are always expanded. The "different sector"
// group (tier 5) is collapsed by default behind a click-to-reveal button so
// off-sector noise doesn't drown out direct matches. Untagged (tier 4) is
// shown when present but framed as a neutral fallback.
function TieredMatches({ matches, expandedMatches, setExpandedMatches, suppress, setToast, onLog }) {
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

  function renderGroup(label, sublabel, items, accentColor) {
    if (!items.length) return null;
    return (
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: accentColor }}>
              {label}
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#6b6456' }}>{sublabel}</div>
          </div>
          <div className="text-[11px] font-mono" style={{ color: '#9b8e80' }}>{items.length} {items.length === 1 ? 'match' : 'matches'}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((m) => {
            // Use the global index from `matches` so expand state stays consistent.
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

  // Empty state — nothing matched at all
  if (matches.length === 0) {
    return <div className="text-center py-12"><p className="text-sm" style={{ color: '#6b6456' }}>No matches found. Add more proposals to your repository.</p></div>;
  }

  return (
    <>
      {/* Filter buttons — match by sector / type of work / all */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-[11px] font-mono uppercase tracking-widest mr-1" style={{ color: '#9b8e80' }}>Filter:</span>
        {[
          { val: 'all',     label: 'All matches',         count: matches.length, color: '#6b6456' },
          { val: 'sector',  label: 'Same client sector',  count: sectorCount,    color: '#8a6200' },
          { val: 'service', label: 'Same type of work',   count: serviceCount,   color: '#1e4a52' },
        ].map(opt => {
          const active = filterMode === opt.val;
          return (
            <button key={opt.val} onClick={() => setFilterMode(opt.val)}
              className="text-[11px] px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5"
              style={{
                borderColor: active ? opt.color : '#ddd5c4',
                background: active ? opt.color + '14' : 'white',
                color: active ? opt.color : '#6b6456',
                fontWeight: active ? 600 : 400,
              }}>
              {opt.label}
              <span className="font-mono text-[10px] opacity-70">{opt.count}</span>
            </button>
          );
        })}
      </div>

      {/* Empty state for filter that produced no results */}
      {filteredMatches.length === 0 && (
        <div className="text-center py-10 rounded-lg border border-dashed" style={{ borderColor: '#ddd5c4' }}>
          <p className="text-sm" style={{ color: '#6b6456' }}>
            No matches in this filter. Try "All matches" to see everything.
          </p>
        </div>
      )}

      {/* Direct-fit groupings — always expanded.
          Ordered: tier 1 first, then tier 3 (same type of work), then
          tier 2 (same sector). This puts the "same work" matches higher
          because a same-work-different-sector proposal is usually a
          better transferable reference than a same-sector-different-work
          one, from a bid writer's perspective. */}
      {renderGroup(
        '◆ Direct fit · same sector and same type of work',
        'Strongest matches — same client industry and same service line as this RFP.',
        tier1, '#3d5c3a'
      )}
      {renderGroup(
        '◈ Same type of work · different sector',
        'Same service line, but the client was in a different industry.',
        tier3, '#1e4a52'
      )}
      {renderGroup(
        '◆ Same sector · different type of work',
        'Same client industry but a different service line.',
        tier2, '#8a6200'
      )}
      {renderGroup(
        '◌ Untagged proposals',
        'Industry could not be inferred from the proposal text — re-analyse to classify.',
        tier4, '#9b8e80'
      )}

      {/* Cross-sector — hidden by default */}
      {tier5.length > 0 && (
        <div className="mt-6 border-t pt-5" style={{ borderColor: '#ddd5c4' }}>
          {!showCrossSector ? (
            <button
              onClick={() => setShowCrossSector(true)}
              className="w-full py-4 rounded-lg border border-dashed transition-all hover:bg-white"
              style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
              <div className="text-sm font-medium mb-1">
                Show {tier5.length} cross-sector {tier5.length === 1 ? 'proposal' : 'proposals'}
              </div>
              <div className="text-[11px]" style={{ color: '#9b8e80' }}>
                Different industry and different service line. May still be useful for tone, structure, or rhetorical approach — but not for direct content reuse.
              </div>
            </button>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#9b8e80' }}>
                    ◌ Cross-sector references
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#6b6456' }}>
                    Different industry — useful for tone, structure or approach only.
                  </div>
                </div>
                <button onClick={() => setShowCrossSector(false)}
                  className="text-[11px] font-mono" style={{ color: '#9b8e80' }}>
                  hide
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tier5.map((m) => {
                  const i = matches.indexOf(m);
                  return (
                    <MatchCard key={m.id} match={m}
                      expanded={expandedMatches[i]}
                      onToggle={() => setExpandedMatches(e => ({ ...e, [i]: !e[i] }))}
                      onSuppress={() => suppress(m.id)}
                      onToast={setToast} />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Banner if everything is in tier 4/5 — likely means the user hasn't
          re-analysed proposals against the new taxonomy yet */}
      {topFit.length === 0 && (tier4.length > 0 || tier5.length > 0) && (
        <div className="mt-4 rounded-lg p-3 text-xs border" style={{ background: '#faf4e2', borderColor: 'rgba(184,150,46,.3)', color: '#7a5800' }}>
          <strong>No direct sector matches yet.</strong> Re-analyse your repository so proposals get tagged against the new taxonomy — until then matching falls back to text inference and may be less precise.
        </div>
      )}
    </>
  );
}

function MatchCard({ match: m, expanded, onToggle, onSuppress, onToast, onLog }) {
  const meta = m.ai_metadata || {};
  const wq = meta.writing_quality;
  const labelColor = m.match_label==='Strong'?'#3d5c3a':m.match_label==='Good'?'#1e4a52':m.match_label==='Partial'?'#b8962e':'#6b6456';
  return (
    <Card className="mb-3 overflow-visible">
      <div className="flex items-start gap-3 p-4">
        <ScoreRing score={m.match_score || 0} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-semibold text-sm">{m.name}</div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Wave 3 — feedback signal: how often this proposal has been
                  used in past scans, and how many of those scans were won */}
              {(m.won_count > 0 || m.used_count > 0) && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                  style={{
                    borderColor: m.won_count > 0 ? 'rgba(61,92,58,.4)' : 'rgba(30,74,82,.3)',
                    background: m.won_count > 0 ? 'rgba(61,92,58,.08)' : 'rgba(30,74,82,.06)',
                    color: m.won_count > 0 ? '#3d5c3a' : '#1e4a52',
                  }}
                  title={`Used in ${m.used_count} past scans, ${m.won_count} of which won`}>
                  {m.won_count > 0 ? `★ used in ${m.won_count} won bid${m.won_count > 1 ? 's' : ''}` : `· used ${m.used_count}×`}
                </span>
              )}
              <OutcomeLabel outcome={m.outcome} />
              <button onClick={(e) => { e.stopPropagation(); onSuppress(); }} className="text-[10px] px-2 py-0.5 rounded border transition-colors hover:bg-red-50" style={{ borderColor:'#ddd5c4', color:'#6b6456' }} title="Exclude from this scan">Exclude</button>
            </div>
          </div>
          <div className="text-xs font-mono mb-2 flex flex-wrap gap-x-2 gap-y-0.5" style={{ color:'#6b6456' }}>
            <span>{m.client}</span>
            <span>·</span>
            <span>{m.date_submitted?.slice(0,4) || 'Date unknown'}</span>
            <span>·</span>
            <span>{formatMoney(m.contract_value, m.currency)}</span>
            {m.llm_relevance && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: m.llm_relevance==='high'?'#edf3ec':m.llm_relevance==='medium'?'#faf4e2':'#f0ebe0', color: m.llm_relevance==='high'?'#3d5c3a':m.llm_relevance==='medium'?'#7a5800':'#6b6456' }}>
                ◈ {m.llm_relevance} relevance
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {(m.match_reasons||[]).slice(0,4).map(t => <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background:'#e8f2f4', color:'#1e4a52' }}>{t}</span>)}
          </div>
          {/* Sanity check warning — shown when the AI gatekeeper flagged
              the match with a specific caveat. Visible by default so the
              writer sees the heads-up before they spend time on it. */}
          {m.sanity_warning && (
            <div className="rounded px-2 py-1.5 mb-2 text-[11px] flex items-start gap-1.5"
              style={{
                background: m.sanity_demoted ? 'rgba(176,64,48,.06)' : 'rgba(184,150,46,.10)',
                border: `1px solid ${m.sanity_demoted ? 'rgba(176,64,48,.2)' : 'rgba(184,150,46,.3)'}`,
                color: m.sanity_demoted ? '#7a3023' : '#7a5800',
              }}>
              <span className="flex-shrink-0">⚠</span>
              <span className="flex-1"><strong>{m.sanity_demoted ? 'Demoted by AI sanity check:' : 'AI flag:'}</strong> {m.sanity_warning}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Stars rating={m.user_rating} />
            {wq?.overall_score > 0 && <span className="text-[10px] font-mono" style={{ color:wq.overall_score>=75?'#3d5c3a':wq.overall_score>=55?'#b8962e':'#b04030' }}>✍ {wq.overall_score}/100</span>}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2 animate-fadeIn" style={{ borderColor:'#f0ebe0' }}>
          {/* LLM re-ranking reason — source traceability */}
          {m.llm_reason && (
            <div className="rounded-lg p-3 mb-2" style={{ background:'#faf4e2', border:'1px solid rgba(184,150,46,.2)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#b8962e' }}>Why this was selected by AI</div>
              <p className="text-xs leading-relaxed" style={{ color:'#7a5800' }}>{m.llm_reason}</p>
            </div>
          )}
          {/* Match explanation from AI chain */}
          {m.match_explanation && (
            <div className="rounded-lg p-3 mb-2" style={{ background:'#e8f2f4' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#1e4a52' }}>Why this was matched</div>
              <p className="text-xs leading-relaxed" style={{ color:'#1e4a52' }}>{m.match_explanation.recommended_use}</p>
              {m.match_explanation.strong_for?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {m.match_explanation.strong_for.slice(0,3).map((s,i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background:'#d0e8ed', color:'#1e4a52' }}>✓ {s}</span>)}
                </div>
              )}
              {m.match_explanation.not_relevant_for?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.match_explanation.not_relevant_for.slice(0,2).map((s,i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#9b8e80' }}>≠ {s}</span>)}
                </div>
              )}
            </div>
          )}
          {/* Style classification */}
          {m.style_classification && (
            <div className="flex gap-2 text-xs py-1.5 border-b" style={{ borderColor:'#f0ebe0' }}>
              <span className="flex-shrink-0 font-medium w-36" style={{ color:'#6b6456' }}>Writing style</span>
              <span className="font-mono" style={{ color:'#1e4a52' }}>{m.style_classification.primary_style}</span>
              <span style={{ color:'#9b8e80' }}>·</span>
              <span style={{ color:'#6b6456' }}>{m.style_classification.tone}</span>
            </div>
          )}
          {m.went_well && <div className="flex gap-2 text-xs py-1.5 border-b" style={{ borderColor:'#f0ebe0' }}><span className="flex-shrink-0 font-medium w-36" style={{ color:'#6b6456' }}>What won it</span><span>{m.went_well}</span></div>}
          {(meta.deliverables||[]).length>0 && <div className="flex gap-2 text-xs py-1.5 border-b" style={{ borderColor:'#f0ebe0' }}><span className="flex-shrink-0 font-medium w-36" style={{ color:'#6b6456' }}>Deliverables</span><span>{(meta.deliverables||[]).join(' · ')}</span></div>}
          {(meta.methodologies||[]).length>0 && <div className="flex gap-2 text-xs py-1.5 border-b" style={{ borderColor:'#f0ebe0' }}><span className="flex-shrink-0 font-medium w-36" style={{ color:'#6b6456' }}>Methodologies</span><span>{(meta.methodologies||[]).join(' · ')}</span></div>}
          {(meta.standout_sentences||[]).slice(0,1).map((s,i)=><blockquote key={i} className="text-xs italic border-l-2 pl-3 my-2" style={{ borderColor:'#b8962e', color:'#6b6456' }}>"{s}"</blockquote>)}
          {m.lh_status==='complete'&&m.lh_what_delivered&&<div className="flex gap-2 text-xs py-1.5 rounded px-2" style={{ background:'#edf3ec' }}><span className="flex-shrink-0 font-medium w-36" style={{ color:'#3d5c3a' }}>What was delivered</span><span>{m.lh_what_delivered}</span></div>}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t" style={{ borderColor:'#f0ebe0', background:'#faf7f2' }}>
        <Btn variant="ghost" size="sm" onClick={() => { onToggle(); if (!expanded && onLog) onLog('match_expanded', { target_type: 'project', target_id: m.id }); }}>{expanded?'▴ Less':'▾ More detail'}</Btn>
        <button onClick={() => {
          navigator.clipboard.writeText(`Reference: "${m.name}" (${m.outcome}, ${m.date_submitted?.slice(0,4)}) — ${m.went_well||m.client}`);
          onToast('Reference copied to clipboard');
          if (onLog) onLog('reference_copied', { target_type: 'project', target_id: m.id });
        }}
          className="text-xs px-2 py-1 rounded border transition-colors hover:bg-white" style={{ borderColor:'#ddd5c4', color:'#6b6456' }}>Copy Reference</button>
        <a href={`/api/projects/${m.id}/download`} target="_blank" rel="noopener noreferrer"
          className="text-xs px-2 py-1 rounded border transition-colors hover:bg-white" style={{ borderColor:'#ddd5c4', color:'#1e4a52' }}
          onClick={e => { e.stopPropagation(); if (onLog) onLog('match_downloaded', { target_type: 'project', target_id: m.id }); }}>↓ Download</a>
        <Link href={`/repository/${m.id}`}
          onClick={() => { if (onLog) onLog('match_opened', { target_type: 'project', target_id: m.id }); }}
          className="ml-auto text-xs" style={{ color:'#1e4a52' }}>Open →</Link>
      </div>
    </Card>
  );
}

function GapCard({ gap: g }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background:PRIORITY_COLOR[g.priority]||'#ddd5c4' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-sm font-semibold">{g.title}</div>
            <div className="flex gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:(PRIORITY_COLOR[g.priority]||'#ddd5c4')+'18', color:PRIORITY_COLOR[g.priority]||'#6b6456' }}>{g.type}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:(PRIORITY_COLOR[g.priority]||'#ddd5c4')+'18', color:PRIORITY_COLOR[g.priority]||'#6b6456' }}>{g.priority}</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed mb-1" style={{ color:'#6b6456' }}>{g.description}</p>
          {g.source_hint && <p className="text-xs italic" style={{ color:'#1e4a52' }}>Partial coverage in: {g.source_hint}</p>}
          {g.suggested_person && (
            <div className="mt-2 rounded-lg px-3 py-2.5 text-xs" style={{ background:'#faf4e2', border:'1px solid rgba(184,150,46,.2)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#b8962e' }}>Suggested team lead</div>
              <div className="font-semibold mb-0.5" style={{ color:'#7a5800' }}>{g.suggested_person}</div>
              {g.suggested_person_reason && <div style={{ color:'#9a7820' }}>{g.suggested_person_reason}</div>}
              {g.suggested_person_cv && <div className="mt-1 pt-1 border-t" style={{ borderColor:'rgba(184,150,46,.2)', color:'#9a7820' }}>CV: {g.suggested_person_cv}</div>}
            </div>
          )}
          {g.source_proposals?.length > 0 && (
            <div className="mt-2 text-[10px] font-mono" style={{ color:'#9b8e80' }}>
              Partial coverage in: {g.source_proposals.join(' · ')}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-t" style={{ borderColor:'#f0ebe0', background:'#faf7f2' }}>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#6b6456' }}>Impact: {g.impact}</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#6b6456' }}>{g.suggested_action}</span>
      </div>
    </Card>
  );
}

// Market Context — categorised, scored, strategically framed news.
// Replaces the old "Industry News" tab. News items are grouped by category
// (programme/buyer/tech_reg/competitive) so the user can scan by relevance
// type, not just by date. Anything below 50% relevance has been filtered out
// upstream — the UI never shows junk results.
const CATEGORY_META = {
  programme: { label: 'Programme & Procurement', icon: '◆', color: '#3d5c3a', desc: 'News directly about the named programme, framework, or contract vehicle' },
  buyer:     { label: 'Buyer & Issuing Body',    icon: '◈', color: '#1e4a52', desc: 'News about the issuing organisation — leadership, budget, restructure' },
  tech_reg:  { label: 'Technology & Regulation', icon: '◇', color: '#8a6200', desc: 'New standards, regulations, or capability announcements' },
  competitive: { label: 'Competitive Landscape', icon: '◉', color: '#b04030', desc: 'Competitor wins, M&A, market shifts in the supplier base' },
};

function MarketContext({ news }) {
  if (!news || news.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-3 opacity-25">◆</div>
        <p className="text-sm" style={{ color: '#6b6456' }}>No relevant market context found.</p>
        <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: '#9b8e80' }}>
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
      <p className="text-sm" style={{ color: '#6b6456' }}>
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
                <div className="text-xs mt-0.5" style={{ color: '#6b6456' }}>{meta.desc}</div>
              </div>
              <div className="text-[11px] font-mono" style={{ color: '#9b8e80' }}>
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
}

function MarketContextCard({ item: n, accent }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: accent + '14', color: accent }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color: '#6b6456' }}>{n.date}</span>
          <span className="ml-auto text-[10px] font-mono font-semibold" style={{ color: accent }}>{n.relevance_score}/100</span>
        </div>
        <h3 className="text-sm font-semibold mb-1.5 leading-snug">{n.title}</h3>
        <p className="text-xs leading-relaxed mb-3" style={{ color: '#6b6456' }}>{n.snippet}</p>

        {n.why_it_matters && (
          <div className="rounded-md p-3 text-xs leading-relaxed mb-2" style={{ background: '#faf4e2' }}>
            <span className="font-semibold" style={{ color: '#8a6200' }}>Why this matters: </span>
            <span style={{ color: '#5a4810' }}>{n.why_it_matters}</span>
          </div>
        )}

        {(n.where_to_use_in_bid || n.tone_supported) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {n.where_to_use_in_bid && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(30,74,82,.3)', color: '#1e4a52' }}>
                Use in: {n.where_to_use_in_bid}
              </span>
            )}
            {n.tone_supported && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(184,150,46,.3)', color: '#8a6200' }}>
                Supports: {n.tone_supported}
              </span>
            )}
          </div>
        )}
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 border-t text-xs transition-colors hover:bg-[#f0f8ff]"
          style={{ borderColor: '#f0ebe0', color: '#1e4a52' }}>
          <span className="flex-1 truncate">{n.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
          <span className="flex-shrink-0">↗</span>
        </a>
      )}
    </Card>
  );
}

function NewsCard({ item: n }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#e8f2f4', color:'#1e4a52' }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color:'#6b6456' }}>{n.date}</span>
          <span className="ml-auto text-[10px] font-mono" style={{ color:'#b8962e' }}>⟡ {n.relevance_score}% relevant</span>
        </div>
        <h3 className="text-sm font-semibold mb-1.5 leading-snug">{n.title}</h3>
        <p className="text-xs leading-relaxed mb-3" style={{ color:'#6b6456' }}>{n.snippet}</p>
        <div className="rounded-md p-3 text-xs leading-relaxed" style={{ background:'#faf4e2' }}>
          <span className="font-semibold" style={{ color:'#b8962e' }}>⟡ Why this matters: </span>{n.why_it_matters}
        </div>
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 border-t text-xs transition-colors hover:bg-[#f0f8ff]"
          style={{ borderColor:'#f0ebe0', color:'#1e4a52' }}>
          <span className="flex-1 truncate">{n.url.replace(/^https?:\/\/(www\.)?/,'')}</span>
          <span className="flex-shrink-0">↗</span>
        </a>
      )}
    </Card>
  );
}
