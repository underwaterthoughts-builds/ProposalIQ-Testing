import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Card, OutcomeLabel, Spinner, Btn, Toast } from '../../components/ui';
import { useMode } from '../../lib/useMode';
import { useUser } from '../../lib/useUser';
import { formatMoney, currencySymbol } from '../../lib/format';
import ProposalFitTab from '../../components/ProposalFitTab';
import RfpTaxonomyBar from '../../components/rfp/RfpTaxonomyBar';
import CheckpointBanner from '../../components/rfp/CheckpointBanner';
import OutcomeCaptureModal from '../../components/rfp/OutcomeCaptureModal';
import AssemblyTab from '../../components/rfp/AssemblyTab';
import ExecutiveBrief from '../../components/rfp/ExecutiveBrief';
import TieredMatches from '../../components/rfp/TieredMatches';
import GapCard from '../../components/rfp/GapCard';
import MarketContext from '../../components/rfp/MarketContext';
import RfpDocumentTab from '../../components/rfp/RfpDocumentTab';
import RfpPlainTextTab from '../../components/rfp/RfpPlainTextTab';

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

  // Polling guards — the recursive setTimeout in fetchScan must stop when
  // the page unmounts or the id changes, or it polls a dead component
  // forever (same active-flag pattern as repository.jsx).
  const pollActiveRef = useRef(true);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    pollActiveRef.current = true;
    fetchScan();
    return () => {
      pollActiveRef.current = false;
      clearTimeout(pollTimerRef.current);
    };
  }, [id]);

  // Load client intelligence when scan completes
  useEffect(() => {
    if (!scan?.rfp_data?.client || scan.rfp_data.client === 'Unknown') return;
    fetch(`/api/clients?name=${encodeURIComponent(scan.rfp_data.client)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.client || d?.projects?.length) setClientIntel(d); })
      .catch(e => console.error('[rfp] client intel fetch failed:', e.message));
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
      .catch(e => console.error('[rfp] outcome fetch failed:', e.message));
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
    }).catch(e => console.error('[rfp] usage log failed:', e.message));
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
    let d;
    try {
      const r = await fetch(`/api/rfp/${id}`);
      if (!pollActiveRef.current) return;
      if (!r.ok) { setLoading(false); return; }
      d = await r.json();
    } catch (e) {
      console.error('[rfp] scan poll failed:', e.message);
      // Transient network error mid-scan — retry rather than stall the UI.
      if (pollActiveRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(fetchScan, 3000);
      }
      return;
    }
    if (!pollActiveRef.current) return;
    setScan(d.scan);
    setLoading(false);
    // Keep polling on processing (no data yet), fast_ready (deep pass
    // running), or while the section-repair pass has any sections in
    // 'queued' / 'retrying:*' state — those flip to 'ok'/'failed' when
    // the repair settles, and we want the UI to reflect that live.
    let sectionsRepairing = false;
    try {
      const ss = d.scan.section_status ? JSON.parse(d.scan.section_status) : null;
      if (ss && typeof ss === 'object') {
        sectionsRepairing = Object.values(ss).some(
          v => typeof v === 'string' && (v === 'queued' || v.startsWith('retrying'))
        );
      }
    } catch {}
    if (d.scan.status === 'processing' || d.scan.status === 'fast_ready' || sectionsRepairing) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(fetchScan, 3000);
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
    if (!confirm('Re-run the full analysis against this RFP?\n\nExisting results stay visible until the new ones are ready.')) return;
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

  const teamSuggestions = Array.isArray(scan.team_suggestions) ? scan.team_suggestions : [];

  const tabs = [
    { id:'brief', label:'Overview', badge: executiveBrief?.verdict?.decision ? '★' : null },
    { id:'matches', label:'Matched Proposals', count:matches.length },
    { id:'gaps', label:'Opportunity Gaps', count:gaps.length },
    { id:'writing', label:'Writing Insights', count:writingInsights.length },
    { id:'news', label:'Market Context', count:news.length },
    { id:'approach', label:'Suggested Approach', count:suggestedApproach?.suggested_phases?.length||0 },
    { id:'team', label:'Suggested Team', count: teamSuggestions.length },
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
                  Analysing your RFP — quick brief in about a minute…
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
                coveredRisks={scan.covered_risks || []}
                onCoverChange={fetchScan}
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
                    ? 'Verdict ready — full analysis running…'
                    : 'Starting analysis…')}
                </span>
                {(() => {
                  // The pipeline prefixes status_detail with circled step
                  // numbers ①–⑫ — parse them into determinate progress.
                  const STEPS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
                  const idx = STEPS.indexOf((scan.status_detail || '').charAt(0));
                  if (idx === -1) return (
                    <span className="text-[10px] font-mono opacity-60 flex-shrink-0">
                      {scan.status === 'fast_ready' ? 'full analysis' : 'quick brief'}
                    </span>
                  );
                  return (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="w-24 h-1 rounded-full overflow-hidden" style={{ background:'rgba(0,0,0,.2)' }}>
                        <span className="block h-full rounded-full transition-all duration-500" style={{ width:`${Math.round(((idx + 1) / 12) * 100)}%`, background:'currentColor', opacity:.7 }} />
                      </span>
                      <span className="text-[10px] font-mono opacity-60">step {idx + 1} of 12</span>
                    </span>
                  );
                })()}
              </div>
            )}
            {(() => {
              // Section-repair banner. Shown when the post-pipeline repair
              // pass is re-firing one or more sections that came back empty.
              // Reads section_status (JSON map: section → 'queued' | 'retrying:N/M' | 'ok' | 'failed').
              let ss = null;
              try { ss = scan.section_status ? JSON.parse(scan.section_status) : null; } catch {}
              if (!ss || typeof ss !== 'object') return null;
              const inFlight = Object.entries(ss).filter(([, v]) =>
                typeof v === 'string' && (v === 'queued' || v.startsWith('retrying'))
              );
              const failed = Object.entries(ss).filter(([, v]) => v === 'failed');
              if (inFlight.length === 0 && failed.length === 0) return null;
              const labels = {
                gaps: 'Gap analysis',
                news: 'Industry news',
                winning_language: 'Winning language',
                win_strategy: 'Win strategy',
                narrative_advice: 'Narrative advice',
                suggested_approach: 'Approach & budget',
                executive_brief: 'Executive brief',
              };
              return (
                <div className="flex items-center gap-3 px-5 py-3 text-xs border-b"
                  style={{ background: 'rgba(30,107,120,.08)', borderColor: 'rgba(30,74,82,.2)', color: '#1e4a52' }}>
                  {inFlight.length > 0 && <Spinner size={12}/>}
                  <span className="flex-1">
                    {inFlight.length > 0 && (
                      <>Re-running: {inFlight.map(([k, v]) => `${labels[k] || k} (${v})`).join(' · ')}</>
                    )}
                    {inFlight.length === 0 && failed.length > 0 && (
                      <>Some sections couldn't be regenerated: {failed.map(([k]) => labels[k] || k).join(', ')}. Use Re-analyse to try again.</>
                    )}
                  </span>
                </div>
              );
            })()}
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
                color: outcome.outcome === 'won' ? '#3d5c3a' : outcome.outcome === 'lost' ? '#b04030' : '#9b8e80',
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
                  Your quick verdict is available above; use Re-analyse to try again.
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
                        title="Full analysis — every section generated with deep reasoning"
                      >
                        FULL ANALYSIS
                      </span>
                    ) : (scan.status === 'complete' || scan.status === 'fast_ready') ? (
                      <span
                        className="px-3 py-1 text-[10px] font-label font-bold tracking-widest bg-secondary/10 text-secondary border border-secondary/20 rounded-full"
                        title="Quick analysis — re-analyse with full AI enabled for the deeper sections"
                      >
                        QUICK ANALYSIS
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
                        <strong className="text-on-surface">Full analysis running.</strong>{' '}
                        Your verdict and matches are ready now; Opportunity Gaps, Win Strategy, Winning Language,
                        Suggested Approach, Narrative Advice and Proposal Assembly will fill in over the next
                        few minutes. You can leave this page — the analysis continues in the background.
                      </span>
                    </div>
                  )}
                  {scan.status === 'complete' && scan.analysis_model === 'gemini' && (
                    <div className="mt-4 flex items-start gap-2 text-xs text-secondary bg-secondary/5 px-4 py-3 border-l-2 border-secondary">
                      <span className="material-symbols-outlined text-base flex-shrink-0">info</span>
                      <span>
                        <strong className="text-on-surface">Analysis finished — quick mode only.</strong>{' '}
                        The deeper sections (Opportunity Gaps, Win Strategy, Winning Language, Suggested
                        Approach, Narrative Advice, Proposal Assembly) need the full AI configuration,
                        which isn't currently enabled. {user?.role === 'admin'
                          ? <>Check the AI settings in <strong className="text-on-surface">Settings</strong>, then click{' '}
                            <strong className="text-on-surface">Re-analyse</strong> to regenerate everything.</>
                          : <>Ask your workspace admin to enable it, then click{' '}
                            <strong className="text-on-surface">Re-analyse</strong> to regenerate everything.</>}
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
                    title="Re-run the full analysis"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    {rescanning || scan?.status === 'processing' ? 'Re-analysing…' : 'Re-analyse'}
                  </button>
                  <button
                    onClick={() => { setActiveTab('proposal_fit'); logUsage('tab_viewed', { target_type: 'tab', target_id: 'proposal_fit' }); }}
                    className={`border px-4 py-3 text-[10px] font-label font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                      activeTab === 'proposal_fit'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                    title={scan.proposal_filename ? `Your proposal: ${scan.proposal_filename}` : 'Attach your draft proposal to score it against this RFP'}
                  >
                    <span className="material-symbols-outlined text-sm">{scan.proposal_filename ? 'task' : 'upload_file'}</span>
                    Your Proposal
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
                    onClick={() => { setActiveTab(t.id); logUsage('tab_viewed', { target_type: 'tab', target_id: t.id }); }}
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
                <div className="py-16 text-center"><Spinner size={32}/><p className="text-sm mt-4" style={{ color:'#d0c5b0' }}>Analysing your RFP — quick brief in about a minute…</p></div>
              ) : (() => {
                // Deep-pass tabs depend on output the deep pass produces
                // after the fast brief lands. If the user opens one of
                // these while the deep pass is still running, show a
                // spinner with the live status_detail rather than an
                // empty state — much clearer that the data is on its
                // way and not missing.
                const deepReady = scan.status === 'complete' || scan.status === 'deep_failed';
                const deepPassTabs = ['gaps', 'writing', 'news', 'approach', 'team', 'strategy', 'language', 'narrative', 'assembly'];
                if (!deepReady && deepPassTabs.includes(activeTab)) {
                  const labels = {
                    gaps: 'Opportunity Gaps',
                    writing: 'Writing Insights',
                    news: 'Market Context',
                    approach: 'Suggested Approach',
                    team: 'Suggested Team',
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
                <ExecutiveBrief brief={executiveBrief} bidScore={bidScore} matches={matches} onJumpTab={setActiveTab} scanName={scan.name} scanId={id} coveredRisks={scan.covered_risks || []} onCoverChange={fetchScan} />
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
                                    style={{ color: item.priority === 'must' ? '#b04030' : '#9b8e80' }}>
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
                          {Array.isArray(suggestedApproach.indicative_budget.breakdown) && suggestedApproach.indicative_budget.breakdown.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-outline-variant/20">
                              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#d0c5b0' }}>Breakdown</div>
                              <div className="space-y-1.5">
                                {suggestedApproach.indicative_budget.breakdown.map((b, i) => {
                                  const sym = currencySymbol(suggestedApproach.indicative_budget.currency);
                                  const lo = b.low ? `${sym}${(b.low/1000).toFixed(0)}K` : '';
                                  const hi = b.high ? `${sym}${(b.high/1000).toFixed(0)}K` : '';
                                  const range = (lo && hi) ? `${lo}–${hi}` : (lo || hi || '—');
                                  return (
                                    <div key={i} className="text-xs flex gap-3">
                                      <span className="font-mono whitespace-nowrap" style={{ color:'#7fb4bc', minWidth:'100px' }}>{range}</span>
                                      <span style={{ color:'#d0c5b0' }}>
                                        <strong>{b.workstream}</strong>{b.drivers ? <span style={{ color:'#99907d' }}> — {b.drivers}</span> : null}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] font-mono" style={{ color:'#99907d' }}>
                              Confidence: {suggestedApproach.indicative_budget.confidence || 'medium'}
                              {suggestedApproach.indicative_budget.rfp_range_alignment && suggestedApproach.indicative_budget.rfp_range_alignment !== 'no_range_stated' && (
                                <span style={{ color: suggestedApproach.indicative_budget.rfp_range_alignment === 'inside' ? '#7bd07a' : '#e8a87c', marginLeft: 10 }}>
                                  · {suggestedApproach.indicative_budget.rfp_range_alignment} RFP range
                                </span>
                              )}
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
              ) : activeTab === 'team' ? (
                <div className="space-y-4">
                  <div className="bg-surface-container-low p-5">
                    <div className="font-label text-[10px] uppercase tracking-widest mb-2 text-primary">Suggested Team</div>
                    <p className="text-sm text-on-surface-variant max-w-2xl">
                      Members from your Team page ranked by fit to this RFP — combining specialism overlap, sector match, CV
                      content, and past project history. Ratings flagged with{' '}
                      <span className="text-secondary">low domain fit</span> are best-effort
                      suggestions; confirm with the named person before submission.
                    </p>
                  </div>

                  {teamSuggestions.length === 0 ? (
                    <Card className="p-6 text-center">
                      <p className="text-sm text-on-surface-variant">
                        No team suggestions yet. {scan.status === 'complete' ? (
                          <>Either no team members are on file, or none cleanly matched the service domain. Add members on the <a href="/team" className="text-primary underline">Team page</a> and rescan.</>
                        ) : (
                          <>Will populate when the deep pass finishes.</>
                        )}
                      </p>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {teamSuggestions.slice(0, 12).map((m, i) => {
                        const specs = Array.isArray(m.stated_specialisms) ? m.stated_specialisms : [];
                        const history = Array.isArray(m.project_history) ? m.project_history : [];
                        const wonHistory = history.filter(h => h.outcome === 'won').length;
                        const fit = m.fit_score || 0;
                        const fitColour = fit >= 70 ? '#7bd07a' : fit >= 50 ? '#e4c366' : '#d0c5b0';
                        return (
                          <Card key={m.id || i} className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-headline text-base font-bold text-on-surface truncate">{m.name || '—'}</div>
                                <div className="text-xs text-on-surface-variant truncate">
                                  {m.title || 'role unknown'}
                                  {m.years_experience ? ` · ${m.years_experience} yrs` : ''}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-0.5">Fit</div>
                                <div className="text-xl font-bold tabular-nums" style={{ color: fitColour }}>{fit}<span className="text-sm font-normal opacity-60">/100</span></div>
                              </div>
                            </div>
                            {specs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {specs.slice(0, 4).map(s => (
                                  <span key={s} className="px-2 py-0.5 text-[10px] font-mono bg-primary/10 text-primary rounded">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {(history.length > 0 || m.cv_filename) && (
                              <div className="text-[10px] text-on-surface-variant mt-2 flex items-center gap-3">
                                {history.length > 0 && (
                                  <span>{wonHistory} won / {history.length} project{history.length !== 1 ? 's' : ''}</span>
                                )}
                                {m.cv_filename && <span className="text-primary">CV on file</span>}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : activeTab === 'proposal_fit' ? (
                <ProposalFitTab scanId={id} />
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
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(s.text).then(() => {
                                setToast('✓ Copied to clipboard');
                                // Same normalisation as lib/feedback.js#snippetHash so the
                                // usage event keys match the snippet-ranking boost.
                                const norm = String(s.text).trim().toLowerCase().replace(/\s+/g, ' ');
                                logUsage('snippet_copied', { target_type: 'snippet', target_id: norm.slice(0, 64) + ':' + norm.length });
                              }).catch(e => console.error('[rfp] snippet copy failed:', e.message));
                            }}
                            className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded mb-3 transition-colors"
                            style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}
                          >
                            ⧉ Copy
                          </button>
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
