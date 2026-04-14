import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { Btn, Card, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';

// ── Overview & Insights ────────────────────────────────────────────────────
// Portfolio-level analysis UI. Pulls from /api/win-patterns which returns
// deterministic aggregates always and AI-derived patterns on force refresh.
// Four layers surface here:
//   1. Verdict + headline  — the single top pattern across the portfolio
//   2. Three levers        — concrete_plays (start / stop / keep) with the
//                            option to generate a per-weakness playbook
//   3. Evidence tables     — sortable cuts by sector, client, service industry,
//                            client industry, year, value band; plus team-on-
//                            wins, top methodologies, frequent RFP gaps
//   4. Playbook modal      — /api/win-patterns/playbook per weakness
//
// Confidence caveats from the endpoint are surfaced prominently so users
// understand when the analysis is directional vs validated.

function fmtPct(n) { return typeof n === 'number' ? `${n}%` : '—'; }
function fmtMoney(n) {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}K`;
  return `£${n}`;
}
function fmtHHI(v) {
  if (typeof v !== 'number') return '—';
  if (v >= 0.5) return `${v} (highly concentrated)`;
  if (v >= 0.25) return `${v} (concentrated)`;
  if (v >= 0.15) return `${v} (moderate)`;
  return `${v} (diverse)`;
}

const CONFIDENCE_STYLE = {
  high:   { label: 'High',   colour: 'text-[#7bd07a]', bg: 'bg-[#1f3a1c]/40', border: 'border-[#7bd07a]/30' },
  medium: { label: 'Medium', colour: 'text-primary',   bg: 'bg-primary/10',   border: 'border-primary/30' },
  low:    { label: 'Low',    colour: 'text-error',     bg: 'bg-error/10',     border: 'border-error/30' },
};

export default function IntelligencePage() {
  const { user, loading: authLoading } = useUser();
  const [scope, setScope] = useState('repository');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [toast, setToast] = useState('');
  const [playbookState, setPlaybookState] = useState({ open: false, weakness: null, data: null, loading: false, error: null });

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    fetch(`/api/win-patterns?scope=${scope}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setToast(`Load failed: ${e.message}`); setLoading(false); });
  }, [authLoading, user, scope]);

  async function runAnalysis() {
    setAnalysing(true);
    try {
      const r = await fetch(`/api/win-patterns?scope=${scope}`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
      setToast('Analysis complete');
    } catch (e) {
      setToast(`Analysis failed: ${e.message}`);
    }
    setAnalysing(false);
  }

  async function generatePlaybook(weakness) {
    setPlaybookState({ open: true, weakness, data: null, loading: true, error: null });
    try {
      const r = await fetch('/api/win-patterns/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, weakness }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPlaybookState({ open: true, weakness, data: d, loading: false, error: null });
    } catch (e) {
      setPlaybookState({ open: true, weakness, data: null, loading: false, error: e.message });
    }
  }

  const ai = data?.ai_patterns;
  const hasData = data && data.summary?.total > 0;
  const conf = data?.confidence || { level: 'high', reasons: [] };
  const confStyle = CONFIDENCE_STYLE[conf.level] || CONFIDENCE_STYLE.medium;

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Overview & Insights — ProposalIQ</title></Head>
      <Layout title="Overview & Insights" subtitle="Portfolio-level analysis across your proposals" user={user}>
        <div className="min-h-screen bg-surface">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 md:py-12 space-y-10">

            {/* ── Header with scope picker + run CTA ──────────────────── */}
            <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div className="max-w-2xl">
                <span className="font-label text-[11px] uppercase tracking-widest text-primary">ProposalIQ Intelligence</span>
                <h1 className="font-headline text-4xl md:text-5xl font-light tracking-tight text-on-surface mt-2">Overview & Insights</h1>
                <p className="text-on-surface-variant mt-4 leading-relaxed">
                  Scan your portfolio for strengths, weaknesses, concentration risks, and concrete plays grounded in your own won proposals.
                  Deterministic aggregates refresh on load; the deep AI pass runs on demand and caches for 6 hours.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="inline-flex items-center bg-surface-container-lowest border border-outline-variant/20 rounded-sm overflow-hidden">
                  <button onClick={() => setScope('repository')}
                    className={`px-4 py-2 text-[11px] font-label uppercase tracking-widest transition-colors ${scope === 'repository' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                    Full Repository
                  </button>
                  <button onClick={() => setScope('workspace')}
                    className={`px-4 py-2 text-[11px] font-label uppercase tracking-widest transition-colors ${scope === 'workspace' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
                    title="Restrict to your curated workspace projects">
                    My Workspace
                  </button>
                </div>
                <Btn variant="gold" onClick={runAnalysis} disabled={analysing || loading || !hasData}>
                  {analysing ? <><Spinner size={14}/> Running deep analysis…</> : ai ? '↻ Refresh analysis' : '✦ Run deep analysis'}
                </Btn>
                {data?.generated_at && (
                  <span className="text-[10px] font-label text-outline uppercase tracking-widest text-right">
                    Cached: {new Date(data.generated_at).toLocaleString()} · {data.scope}
                  </span>
                )}
              </div>
            </header>

            {loading && (
              <div className="py-24 flex justify-center"><Spinner/></div>
            )}

            {!loading && !hasData && (
              <Card className="p-12 text-center">
                <span className="material-symbols-outlined text-5xl text-outline opacity-40">insights</span>
                <h3 className="font-headline text-xl mt-4">Nothing to analyse yet</h3>
                <p className="text-sm text-on-surface-variant mt-2">
                  Upload some proposals to the <Link href="/repository" className="text-primary underline">repository</Link> first, then come back for portfolio-level patterns.
                </p>
              </Card>
            )}

            {!loading && hasData && (
              <>
                {/* ── Confidence + summary band ─────────────────────── */}
                <section className={`${confStyle.bg} ${confStyle.border} border rounded-lg p-5 flex flex-wrap gap-x-8 gap-y-3 items-start`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Confidence:</span>
                    <span className={`font-label text-xs uppercase tracking-widest font-bold ${confStyle.colour}`}>{confStyle.label}</span>
                  </div>
                  <div className="flex-1 min-w-[280px]">
                    {conf.reasons.length > 0 ? (
                      <ul className="text-xs text-on-surface-variant space-y-1">
                        {conf.reasons.map((r, i) => <li key={i}>· {r}</li>)}
                      </ul>
                    ) : (
                      <span className="text-xs text-on-surface-variant">Sample size and coverage are sufficient for reliable patterns.</span>
                    )}
                  </div>
                </section>

                <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Projects', value: data.summary.total, sub: `${data.summary.decided} decided` },
                    { label: 'Won', value: data.summary.won, sub: `${data.summary.win_rate}% win rate` },
                    { label: 'Lost', value: data.summary.lost, sub: '' },
                    { label: 'Client HHI', value: data.concentration.client_hhi ?? '—', sub: `Top: ${data.concentration.top_client_pct}%` },
                    { label: 'Top sector', value: `${data.concentration.top_sector_pct}%`, sub: 'of wins' },
                  ].map(m => (
                    <div key={m.label} className="bg-surface-container-lowest border border-outline-variant/10 p-4 rounded-sm">
                      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">{m.label}</span>
                      <div className="font-headline text-2xl font-bold text-primary">{m.value}</div>
                      {m.sub && <div className="text-[10px] font-label text-outline mt-1">{m.sub}</div>}
                    </div>
                  ))}
                </section>

                {/* ── Verdict headline ──────────────────────────────── */}
                {ai?.headline && (
                  <section className="bg-[#1a2e2e] border-l-4 border-[#4fd1c5] p-8 rounded-lg">
                    <span className="font-label text-[10px] uppercase tracking-widest text-[#4fd1c5] block mb-3">Verdict</span>
                    <p className="font-headline text-2xl md:text-3xl text-on-surface leading-snug">{ai.headline}</p>
                    {ai.top_recommendation && ai.top_recommendation !== ai.headline && (
                      <p className="text-on-surface-variant mt-4 text-sm leading-relaxed">{ai.top_recommendation}</p>
                    )}
                  </section>
                )}

                {!ai && (
                  <section className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-8 text-center">
                    <span className="material-symbols-outlined text-4xl text-primary/50">auto_awesome</span>
                    <h3 className="font-headline text-xl mt-3">Deep analysis not yet run for this scope</h3>
                    <p className="text-sm text-on-surface-variant mt-2 max-w-lg mx-auto">
                      Click <strong>Run deep analysis</strong> above to generate the AI-derived verdict, strengths, weaknesses, and concrete plays. The deterministic evidence tables below are live regardless.
                    </p>
                  </section>
                )}

                {/* ── 3 Levers (concrete plays) ─────────────────────── */}
                {ai?.concrete_plays?.length > 0 && (
                  <section>
                    <div className="flex items-baseline justify-between mb-5">
                      <h2 className="font-headline text-2xl text-on-surface">Three levers</h2>
                      <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                        Actions for the next 30 days
                      </span>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      {ai.concrete_plays.slice(0, 3).map((p, i) => (
                        <div key={i} className="bg-surface-container-low border-t-2 border-primary p-5 rounded-sm space-y-3">
                          <div className="font-headline text-base font-semibold text-on-surface leading-snug">{p.play}</div>
                          {p.expected_impact && <p className="text-xs text-on-surface-variant"><span className="font-label uppercase tracking-widest text-[10px] text-outline block mb-1">Expected impact</span>{p.expected_impact}</p>}
                          {p.based_on && <p className="text-xs text-on-surface-variant"><span className="font-label uppercase tracking-widest text-[10px] text-outline block mb-1">Based on</span>{p.based_on}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Strengths / Weaknesses ────────────────────────── */}
                {(ai?.strengths?.length > 0 || ai?.weaknesses?.length > 0) && (
                  <section className="grid md:grid-cols-2 gap-4">
                    <div className="bg-surface-container-low p-5 rounded-sm border-l-2 border-[#7bd07a]">
                      <h3 className="font-headline text-xl mb-3 text-on-surface">Strengths</h3>
                      {ai.strengths?.length > 0 ? (
                        <ul className="space-y-4">
                          {ai.strengths.map((s, i) => (
                            <li key={i}>
                              <div className="font-semibold text-sm text-on-surface">{s.title}</div>
                              {s.evidence && <div className="text-xs text-on-surface-variant mt-1">Evidence: {s.evidence}</div>}
                              {s.leverage && <div className="text-xs text-on-surface-variant mt-1">Leverage: {s.leverage}</div>}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-on-surface-variant">No clear strengths surfaced yet — add ratings and outcomes.</p>}
                    </div>
                    <div className="bg-surface-container-low p-5 rounded-sm border-l-2 border-error">
                      <h3 className="font-headline text-xl mb-3 text-on-surface">Weaknesses</h3>
                      {ai.weaknesses?.length > 0 ? (
                        <ul className="space-y-4">
                          {ai.weaknesses.map((w, i) => (
                            <li key={i}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="font-semibold text-sm text-on-surface flex-1">{w.title}</div>
                                <button onClick={() => generatePlaybook({ title: w.title, evidence: w.evidence, remedy: w.remedy })}
                                  className="flex-shrink-0 text-[10px] font-label uppercase tracking-widest text-primary hover:underline">
                                  Generate playbook →
                                </button>
                              </div>
                              {w.evidence && <div className="text-xs text-on-surface-variant mt-1">Evidence: {w.evidence}</div>}
                              {w.remedy && <div className="text-xs text-on-surface-variant mt-1">Remedy: {w.remedy}</div>}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-on-surface-variant">No weaknesses surfaced.</p>}
                    </div>
                  </section>
                )}

                {/* ── Concentration risks ───────────────────────────── */}
                {ai?.concentration_risks?.length > 0 && (
                  <section>
                    <h2 className="font-headline text-2xl mb-4 text-on-surface">Concentration risk</h2>
                    <div className="space-y-3">
                      {ai.concentration_risks.map((r, i) => (
                        <div key={i} className="bg-surface-container-low p-4 rounded-sm flex gap-4 items-start">
                          <span className={`text-[10px] font-label uppercase tracking-widest px-2 py-1 font-bold flex-shrink-0 ${
                            r.severity === 'high' ? 'bg-error/20 text-error' :
                            r.severity === 'medium' ? 'bg-primary/20 text-primary' :
                            'bg-surface-container-high text-on-surface-variant'
                          }`}>{r.severity}</span>
                          <div className="flex-1 text-sm">
                            <div className="text-on-surface">{r.risk}</div>
                            {r.action && <div className="text-xs text-on-surface-variant mt-1">Action: {r.action}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Language observations ─────────────────────────── */}
                {ai?.language_observations?.length > 0 && (
                  <section className="bg-surface-container-low p-6 rounded-sm">
                    <h3 className="font-headline text-xl mb-4 text-on-surface">Language patterns</h3>
                    <ul className="space-y-3">
                      {ai.language_observations.map((o, i) => (
                        <li key={i}>
                          <p className="text-sm text-on-surface">{o.observation}</p>
                          {o.example && <p className="text-xs text-on-surface-variant italic mt-1">"{o.example}"</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* ── Evidence tables ───────────────────────────────── */}
                <section className="space-y-6">
                  <h2 className="font-headline text-2xl text-on-surface">Evidence</h2>
                  <p className="text-sm text-on-surface-variant -mt-4">
                    Deterministic cuts across your portfolio. These refresh whenever you load the page — no AI cost.
                  </p>

                  <EvidenceTable
                    title="By service industry"
                    columns={['Industry', 'Won', 'Lost', 'Win rate']}
                    rows={data.outcomes.by_service_industry.map(r => [r.industry || 'Unspecified', r.won, r.lost, fmtPct(r.win_rate)])}
                    emptyMsg="No projects tagged with a service industry yet."
                  />

                  <EvidenceTable
                    title="By client industry"
                    columns={['Industry', 'Won', 'Lost', 'Win rate']}
                    rows={data.outcomes.by_client_industry.map(r => [r.industry || 'Unspecified', r.won, r.lost, fmtPct(r.win_rate)])}
                    emptyMsg="No projects tagged with a client industry yet."
                  />

                  <EvidenceTable
                    title="By sector"
                    columns={['Sector', 'Won', 'Lost', 'Win rate']}
                    rows={data.outcomes.by_sector.slice(0, 12).map(r => [r.sector, r.won, r.lost, fmtPct(r.win_rate)])}
                  />

                  <EvidenceTable
                    title="By client (top 15)"
                    columns={['Client', 'Won', 'Lost', 'Total', 'Win rate']}
                    rows={data.outcomes.by_client.slice(0, 15).map(r => [r.client, r.won, r.lost, r.total, fmtPct(r.win_rate)])}
                  />

                  <EvidenceTable
                    title="By contract value"
                    columns={['Band', 'Won', 'Lost', 'Win rate', 'Avg value']}
                    rows={data.outcomes.by_value_band.map(r => [r.band, r.won, r.lost, fmtPct(r.win_rate), fmtMoney(r.avg_value)])}
                  />

                  <EvidenceTable
                    title="By year"
                    columns={['Year', 'Won', 'Lost', 'Win rate']}
                    rows={data.outcomes.by_year
                      .filter(r => r.year && r.year !== 'unspecified')
                      .sort((a, b) => a.year.localeCompare(b.year))
                      .map(r => [r.year, r.won, r.lost, fmtPct(r.win_rate)])}
                  />

                  {data.capability.top_methodologies.length > 0 && (
                    <EvidenceTable
                      title="Methodology appearance vs outcome"
                      columns={['Methodology', 'Won', 'Lost', 'Win rate']}
                      rows={data.capability.top_methodologies.map(m => [m.name, m.won, m.lost, fmtPct(m.win_rate)])}
                      caption="Named frameworks or methodologies extracted from proposal metadata. Needs 2+ appearances to show."
                    />
                  )}

                  {data.capability.team_on_wins.length > 0 && (
                    <EvidenceTable
                      title="Team members on wins"
                      columns={['Member', 'Title', 'Won', 'Lost', 'Win rate']}
                      rows={data.capability.team_on_wins.map(t => [t.name, t.title, t.won, t.lost, fmtPct(t.win_rate)])}
                      caption="Who appears on winning bids disproportionately. Does not imply causation — useful for staffing patterns."
                    />
                  )}

                  {data.capability.frequent_gaps.length > 0 && (
                    <EvidenceTable
                      title="Frequent RFP gaps"
                      columns={['Pattern', 'Appeared in', 'Impact']}
                      rows={data.capability.frequent_gaps.map(g => [g.label, `${g.count} scans`, g.impact || '—'])}
                      caption="Requirements repeatedly flagged as unaddressed across your RFP scans."
                    />
                  )}

                  <div className="grid md:grid-cols-2 gap-4 pt-4">
                    <div className="bg-surface-container-low p-4 rounded-sm">
                      <h4 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">Client concentration</h4>
                      <dl className="text-xs space-y-1 text-on-surface">
                        <div><dt className="inline text-on-surface-variant">HHI: </dt><dd className="inline">{fmtHHI(data.concentration.client_hhi)}</dd></div>
                        <div><dt className="inline text-on-surface-variant">Top client: </dt><dd className="inline">{data.concentration.top_client_pct}% of wins</dd></div>
                        <div><dt className="inline text-on-surface-variant">Top 3 clients: </dt><dd className="inline">{data.concentration.top3_client_pct}% of wins</dd></div>
                        <div><dt className="inline text-on-surface-variant">Distinct winning clients: </dt><dd className="inline">{data.concentration.distinct_winning_clients}</dd></div>
                      </dl>
                    </div>
                    {data.quality_scores.won && (
                      <div className="bg-surface-container-low p-4 rounded-sm">
                        <h4 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">Quality score deltas</h4>
                        <dl className="text-xs space-y-1 text-on-surface">
                          {['writing', 'approach', 'credibility'].map(k => {
                            const w = data.quality_scores.won?.[k];
                            const l = data.quality_scores.lost?.[k];
                            const delta = (w && l) ? w - l : null;
                            return (
                              <div key={k}>
                                <dt className="inline text-on-surface-variant capitalize">{k}: </dt>
                                <dd className="inline">{w ?? '—'}/100 won vs {l ?? '—'}/100 lost {delta !== null && <span className={delta > 0 ? 'text-[#7bd07a]' : 'text-error'}>({delta > 0 ? '+' : ''}{delta})</span>}</dd>
                              </div>
                            );
                          })}
                        </dl>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
      {playbookState.open && (
        <PlaybookModal state={playbookState} onClose={() => setPlaybookState({ open: false, weakness: null, data: null, loading: false, error: null })} />
      )}
    </>
  );
}

// ── Evidence table component ───────────────────────────────────────────────
function EvidenceTable({ title, columns, rows, caption, emptyMsg }) {
  if (!rows || rows.length === 0) {
    return (
      <div>
        <h3 className="font-headline text-lg text-on-surface mb-2">{title}</h3>
        <p className="text-xs text-on-surface-variant">{emptyMsg || 'Nothing to show yet.'}</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="font-headline text-lg text-on-surface mb-2">{title}</h3>
      {caption && <p className="text-xs text-on-surface-variant mb-3">{caption}</p>}
      <div className="overflow-x-auto bg-surface-container-low rounded-sm border border-outline-variant/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-high">
              {columns.map((c, i) => (
                <th key={i} className="px-4 py-2 text-left font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-outline-variant/10">
                {r.map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-on-surface">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Playbook modal ─────────────────────────────────────────────────────────
function PlaybookModal({ state, onClose }) {
  const p = state.data?.playbook;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} style={{ background: 'rgba(15,14,12,.75)', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-container rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-outline-variant/20">
        <div className="sticky top-0 bg-surface-container border-b border-outline-variant/20 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="font-label text-[10px] uppercase tracking-widest text-primary">Playbook</div>
            <h2 className="font-headline text-xl text-on-surface mt-1">{state.weakness?.title || 'Weakness'}</h2>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-6">
          {state.loading && <div className="py-12 text-center"><Spinner/> <p className="text-sm text-on-surface-variant mt-3">Generating playbook — ~30–60s</p></div>}
          {state.error && <div className="bg-error/10 border border-error/30 text-error p-4 rounded-sm text-sm">{state.error}</div>}
          {p && (
            <>
              {p.confidence === 'low' && p.caveats && (
                <div className="bg-primary/10 border border-primary/30 text-primary text-xs p-3 rounded-sm">⚠ Low confidence: {p.caveats}</div>
              )}
              {p.summary && <p className="text-sm text-on-surface leading-relaxed">{p.summary}</p>}
              {p.action_steps?.length > 0 && (
                <section>
                  <h3 className="font-headline text-lg mb-3 text-on-surface">Action steps</h3>
                  <ol className="space-y-3">
                    {p.action_steps.map((s, i) => (
                      <li key={i} className="bg-surface-container-low p-4 rounded-sm">
                        <div className="flex items-start gap-3">
                          <span className="font-headline text-xl text-primary">{i + 1}</span>
                          <div className="flex-1">
                            <div className="font-semibold text-sm text-on-surface">{s.step}</div>
                            {s.rationale && <div className="text-xs text-on-surface-variant mt-1">{s.rationale}</div>}
                            {s.owner_hint && <div className="text-[10px] font-label uppercase tracking-widest text-outline mt-2">Owner: {s.owner_hint}</div>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {p.stop_doing?.length > 0 && (
                <section>
                  <h3 className="font-headline text-lg mb-3 text-on-surface">Stop doing</h3>
                  <ul className="space-y-2">
                    {p.stop_doing.map((s, i) => (
                      <li key={i} className="bg-error/5 border-l-2 border-error p-3 rounded-sm text-sm">
                        <div className="text-on-surface">{s.behaviour}</div>
                        {s.evidence && <div className="text-xs text-on-surface-variant mt-1">{s.evidence}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {p.reference_proposals?.length > 0 && (
                <section>
                  <h3 className="font-headline text-lg mb-3 text-on-surface">Reference these won proposals</h3>
                  <ul className="space-y-2">
                    {p.reference_proposals.map((r, i) => (
                      <li key={i} className="bg-surface-container-low p-3 rounded-sm text-sm">
                        <Link href={`/repository/${r.id}`} className="font-semibold text-primary hover:underline">{r.name}</Link>
                        {r.why_relevant && <div className="text-xs text-on-surface-variant mt-1">{r.why_relevant}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {p.borrow_from_language?.length > 0 && (
                <section>
                  <h3 className="font-headline text-lg mb-3 text-on-surface">Language to borrow</h3>
                  <ul className="space-y-2">
                    {p.borrow_from_language.map((l, i) => (
                      <li key={i} className="bg-surface-container-low p-3 rounded-sm text-sm">
                        <blockquote className="italic text-on-surface">"{l.phrase}"</blockquote>
                        {l.how_to_use && <div className="text-xs text-on-surface-variant mt-2">How to use: {l.how_to_use}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {p.success_signal && (
                <section className="bg-[#1f3a1c]/30 border-l-2 border-[#7bd07a] p-4 rounded-sm">
                  <span className="font-label text-[10px] uppercase tracking-widest text-[#7bd07a] block mb-1">Success signal</span>
                  <p className="text-sm text-on-surface">{p.success_signal}</p>
                </section>
              )}
              {p.risks?.length > 0 && (
                <section>
                  <h3 className="font-headline text-lg mb-3 text-on-surface">Risks</h3>
                  <ul className="space-y-2">
                    {p.risks.map((r, i) => (
                      <li key={i} className="bg-surface-container-low p-3 rounded-sm text-sm">
                        <div className="text-on-surface">{r.risk}</div>
                        {r.mitigation && <div className="text-xs text-on-surface-variant mt-1">Mitigation: {r.mitigation}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {state.data && !p && (
            <p className="text-sm text-on-surface-variant">{state.data.message || 'No playbook could be generated.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
