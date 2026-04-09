import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { Card, Stars, OutcomeLabel, Badge, Spinner, ProgressBar, Btn } from '../components/ui';
import { useUser } from '../lib/useUser';
import { useMode } from '../lib/useMode';

// Intent modes
const MODES = {
  write: { label: 'Write Proposals', icon: '✍', desc: 'Quick access to scan an RFP and find matching past work', color: '#1e4a52' },
  intelligence: { label: 'Full Intelligence', icon: '◈', desc: 'Deep analytics, win patterns, writing quality scores', color: '#b8962e' },
  repository: { label: 'Manage Repository', icon: '⊞', desc: 'Upload, organise and review past proposals', color: '#3d5c3a' },
};

function Metric({ label, value, sub, accent }) {
  return (
    <Card className="p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent }} />
      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>{label}</div>
      <div className="font-serif text-3xl mb-1">{value}</div>
      {sub && <div className="text-xs" style={{ color: '#6b6456' }}>{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading } = useUser();
  const [projects, setProjects] = useState([]);
  const [scans, setScans] = useState([]);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [needsSeed, setNeedsSeed] = useState(false);
  const { isQuick, isPro } = useMode();
  const [mode, setMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('piq_dash_mode') || 'write';
    return 'write';
  });
  function setModePersist(m) {
    setMode(m);
    if (typeof window !== 'undefined') localStorage.setItem('piq_dash_mode', m);
  }

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => {
      const p = d.projects || [];
      setProjects(p);
      setNeedsSeed(p.length === 0);
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/rfp/scan').then(r => r.json()).then(d => setScans(d.scans || [])).catch(() => {});
    fetch('/api/win-patterns').then(r => r.json()).then(d => setPatterns(d)).catch(() => {});
  }, []);

  async function runSeed() {
    setSeeding(true);
    try {
      await fetch('/api/seed');
      const d = await fetch('/api/projects').then(r => r.json());
      setProjects(d.projects || []);
      setNeedsSeed(false);
      fetch('/api/win-patterns').then(r => r.json()).then(setPatterns).catch(() => {});
    } catch {}
    setSeeding(false);
  }

  const won = projects.filter(p => p.outcome === 'won').length;
  const lost = projects.filter(p => p.outcome === 'lost').length;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const recent = [...projects].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const health = patterns?.health || {};
  // Projects that are complete but have no narrative entries — surface for knowledge capture
  const needsNarrative = projects.filter(p =>
    (p.outcome === 'won' || p.outcome === 'lost') &&
    (!p.lh_status || p.lh_status === 'none')
  ).slice(0, 5);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Dashboard — ProposalIQ</title></Head>
      <Layout title="Dashboard" subtitle={`Welcome back, ${user.name}`} user={user}
        actions={<Link href="/rfp"><Btn variant="teal">⊡ New RFP Scan</Btn></Link>}>
        <div className="h-full overflow-y-auto p-4 md:p-6" style={{ background: '#faf7f2' }}>

          {/* Intent selector */}
          <div className="flex gap-3 mb-6">
            {Object.entries(MODES).map(([key, m]) => (
              <button key={key} onClick={() => setModePersist(key)}
                className={`flex-1 rounded-lg p-4 text-left border-2 transition-all ${mode === key ? 'border-solid' : 'border-dashed border-[#ddd5c4] hover:border-gray-300'}`}
                style={mode === key ? { borderColor: m.color, background: m.color + '0d' } : { background: 'white' }}>
                <div className="text-xl mb-1">{m.icon}</div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: mode === key ? m.color : '#1a1816' }}>{m.label}</div>
                <div className="text-xs" style={{ color: '#6b6456' }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Seed banner */}
          {!loading && needsSeed && (
            <div className="mb-6 rounded-lg p-5 border" style={{ background: '#faf4e2', borderColor: 'rgba(184,150,46,.3)' }}>
              <h3 className="font-serif text-lg mb-1">Set up your knowledge base</h3>
              <p className="text-sm mb-4" style={{ color: '#6b6456' }}>Load 10 example proposals to see ProposalIQ in action, or upload your own.</p>
              <div className="flex gap-3">
                <Btn variant="gold" onClick={runSeed} disabled={seeding}>
                  {seeding ? <><Spinner size={12} /> Generating examples (~60s)…</> : '⊞ Load 10 Example Proposals'}
                </Btn>
                <Link href="/repository"><Btn variant="ghost">Upload my own →</Btn></Link>
              </div>
            </div>
          )}

          {/* MODE: Write Proposals */}
          {mode === 'write' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-4">
                <h2 className="font-serif text-base">Start a New Scan</h2>
                <Link href="/rfp">
                  <Card className="p-6 border-2 cursor-pointer hover:shadow-md transition-all" style={{ borderColor: '#1e4a52', borderStyle: 'dashed' }}>
                    <div className="text-3xl mb-2">⊡</div>
                    <div className="font-serif text-lg mb-1">Upload an RFP</div>
                    <p className="text-sm" style={{ color: '#6b6456' }}>
                      Drop in a tender document and get matched past proposals, gap analysis, suggested approach, and team in 60 seconds.
                    </p>
                  </Card>
                </Link>
                <h2 className="font-serif text-base mt-2">Recent Scans</h2>
                {scans.length === 0 ? (
                  <div className="text-sm py-4" style={{ color: '#6b6456' }}>No scans yet — upload an RFP above.</div>
                ) : (
                  <Card>
                    {scans.slice(0, 5).map((s, i) => (
                      <Link key={s.id} href={`/rfp/${s.id}`}
                        className={`flex items-center gap-3 p-3 hover:bg-[#faf7f2] transition-colors ${i > 0 ? 'border-t' : ''}`}
                        style={{ borderColor: '#f0ebe0' }}>
                        <span className="text-lg">⊡</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{s.name}</div>
                          <div className="text-xs font-mono" style={{ color: '#6b6456' }}>{new Date(s.created_at).toLocaleDateString()}</div>
                        </div>
                        <Badge color={s.status === 'complete' ? 'sage' : s.status === 'processing' ? 'gold' : 'rust'}>{s.status}</Badge>
                        <span className="text-xs" style={{ color: '#1e4a52' }}>→</span>
                      </Link>
                    ))}
                  </Card>
                )}
              </div>
              <div className="space-y-4">
                <h2 className="font-serif text-base">Quick Stats</h2>
                <Card className="p-4 space-y-3">
                  {[['Repository', `${projects.length} proposals`, '#1e4a52'],
                    ['Win Rate', `${winRate}%`, won >= lost ? '#3d5c3a' : '#b04030'],
                    ['Scans Run', `${scans.length}`, '#b8962e']].map(([l, v, c]) => (
                    <div key={l} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0" style={{ borderColor: '#f0ebe0' }}>
                      <span style={{ color: '#6b6456' }}>{l}</span>
                      <span className="font-semibold font-mono" style={{ color: c }}>{v}</span>
                    </div>
                  ))}
                </Card>
                {needsNarrative.length > 0 && (
                  <div className="rounded-lg p-3 mt-2" style={{background:'#faf4e2',border:'1px solid rgba(184,150,46,.3)'}}>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#8a6200'}}>
                      ? {needsNarrative.length} project{needsNarrative.length>1?'s':''} need learning history
                    </div>
                    <p className="text-xs mb-2" style={{color:'#8a6200'}}>Add what happened — it improves future matching.</p>
                    {needsNarrative.slice(0,3).map(p=>(
                      <Link key={p.id} href={`/repository/${p.id}?tab=narrative`}>
                        <div className="text-xs py-1 truncate hover:underline" style={{color:'#5a4810'}}>
                          → {p.name} <span className="font-mono" style={{color:p.outcome==='won'?'#3d5c3a':'#b04030'}}>({p.outcome})</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                <Link href="/repository">
                  <Btn variant="ghost" className="w-full justify-center">View Repository →</Btn>
                </Link>
              </div>
            </div>
          )}

          {/* MODE: Full Intelligence */}
          {mode === 'intelligence' && (
            <div>
              {/* Top recommendation — most prominent insight */}
              {patterns?.ai_analysis?.top_recommendation && (
                <div className="rounded-xl p-5 mb-5 flex items-start gap-4" style={{background:'#1e4a52',color:'white'}}>
                  <div className="text-2xl flex-shrink-0">⚡</div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-1 opacity-70">Top Recommendation from Win Analysis</div>
                    <p className="text-sm leading-relaxed font-medium">{patterns.ai_analysis.top_recommendation}</p>
                  </div>
                  <button onClick={()=>{setPatterns(null);fetch('/api/win-patterns',{method:'POST'}).then(r=>r.json()).then(setPatterns).catch(()=>{});}}
                    className="flex-shrink-0 text-[10px] opacity-60 hover:opacity-100 font-mono mt-1">⟳ Refresh</button>
                </div>
              )}
              {/* Learning history prompt in intelligence mode */}
              {needsNarrative.length > 0 && (
                <div className="rounded-xl p-4 mb-5 flex items-center justify-between" style={{background:'#faf4e2',border:'1px solid rgba(184,150,46,.3)'}}>
                  <div>
                    <div className="text-sm font-semibold mb-0.5" style={{color:'#8a6200'}}>
                      ? {needsNarrative.length} project{needsNarrative.length>1?'s':''} need learning history
                    </div>
                    <p className="text-xs" style={{color:'#8a6200'}}>
                      {needsNarrative.slice(0,3).map(p=>p.name).join(', ')}{needsNarrative.length>3?` and ${needsNarrative.length-3} more`:''} — add what happened to improve future matching.
                    </p>
                  </div>
                  <Link href="/repository">
                    <Btn variant="ghost" size="sm">Review →</Btn>
                  </Link>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Metric label="Total Projects" value={loading ? '…' : projects.length} sub={`${won} won · ${lost} lost`} accent="#b8962e" />
                <Metric label="Win Rate" value={`${winRate}%`} sub="decided bids" accent="#2d6b78" />
                <Metric label="Avg Rating" value={projects.length ? (projects.reduce((a,p)=>a+(p.user_rating||0),0)/projects.length).toFixed(1) : '—'} sub="quality score" accent="#3d5c3a" />
                <Metric label="RFP Scans" value={scans.length} sub="intelligence runs" accent="#b04030" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-4">
                  {/* Win patterns */}
                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-serif text-base">Win Patterns</h2>
                      <button onClick={() => { setPatterns(null); fetch('/api/win-patterns',{method:'POST'}).then(r=>r.json()).then(setPatterns).catch(()=>{}); }}
                        className="text-xs" style={{ color: '#6b6456' }}>Refresh</button>
                    </div>
                    {!patterns ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#6b6456' }}><Spinner size={12} /> Analysing…</div>
                    ) : projects.length < 3 ? (
                      <p className="text-xs" style={{ color: '#6b6456' }}>Upload at least 3 proposals to see patterns.</p>
                    ) : (
                      <div className="space-y-4">
                        {patterns.quality_scores?.won && patterns.quality_scores?.lost && (
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Quality Scores — Won vs Lost</div>
                            {[['Writing', 'writing'], ['Approach', 'approach'], ['Credibility', 'credibility']].map(([l, k]) => {
                              const w = patterns.quality_scores.won?.[k];
                              const lo = patterns.quality_scores.lost?.[k];
                              if (!w && !lo) return null;
                              return (
                                <div key={k} className="mb-2">
                                  <div className="flex justify-between text-xs mb-1"><span style={{ color: '#6b6456' }}>{l}</span><span className="font-mono">{w||'—'} won / {lo||'—'} lost</span></div>
                                  <div className="flex gap-1 h-1.5">
                                    {w && <div className="rounded-full" style={{ width: `${w}%`, background: '#2d6b78' }} />}
                                    {lo && <div className="rounded-full opacity-40" style={{ width: `${lo}%`, background: '#b04030' }} />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {(patterns.by_sector || []).slice(0, 6).map(s => (
                          <div key={s.sector} className="flex items-center gap-2 py-1.5 border-t text-xs" style={{ borderColor: '#f0ebe0' }}>
                            <span className="flex-1 truncate" style={{ color: '#6b6456' }}>{s.sector}</span>
                            <span className="font-mono text-[10px]">{s.won}W / {s.lost}L</span>
                            <span className="font-mono font-medium w-8 text-right" style={{ color: s.win_rate >= 60 ? '#3d5c3a' : s.win_rate >= 40 ? '#b8962e' : '#b04030' }}>{s.win_rate}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Knowledge health */}
                  {projects.length > 0 && (
                    <Card className="p-5">
                      <h2 className="font-serif text-base mb-4">Knowledge Base Health</h2>
                      {[
                        ['Writing Analysis', health.writing_analysis_coverage, 'proposals with full AI writing quality scores'],
                        ['Learning Histories', health.learning_history_coverage, 'proposals with post-project learning notes'],
                      ].map(([l, pct, sub]) => pct !== undefined ? (
                        <div key={l} className="mb-4 last:mb-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span>{l}</span>
                            <span className="font-mono" style={{ color: (pct||0) >= 70 ? '#3d5c3a' : (pct||0) >= 40 ? '#b8962e' : '#b04030' }}>{pct||0}%</span>
                          </div>
                          <ProgressBar value={pct||0} color={(pct||0) >= 70 ? '#3d5c3a' : (pct||0) >= 40 ? '#b8962e' : '#b04030'} />
                          <div className="text-[10px] mt-0.5" style={{ color: '#6b6456' }}>{sub}</div>
                        </div>
                      ) : null)}
                    </Card>
                  )}
                </div>
                <div className="space-y-4">
                  <h2 className="font-serif text-base">Recent Projects</h2>
                  <Card>
                    {recent.length === 0 ? (
                      <div className="p-4 text-sm text-center" style={{ color: '#6b6456' }}>No projects yet.</div>
                    ) : recent.map((p, i) => {
                      const wq = p.ai_metadata?.writing_quality?.overall_score;
                      return (
                        <Link key={p.id} href={`/repository/${p.id}`}
                          className={`flex items-center gap-2 p-3 hover:bg-[#faf7f2] transition-colors ${i > 0 ? 'border-t' : ''}`}
                          style={{ borderColor: '#f0ebe0' }}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.outcome==='won'?'#2d6b78':p.outcome==='lost'?'#b04030':'#b8962e' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{p.name}</div>
                            {wq > 0 && <div className="text-[10px] font-mono" style={{ color: '#6b6456' }}>✍ {wq}/100</div>}
                          </div>
                        </Link>
                      );
                    })}
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* MODE: Repository Management */}
          {mode === 'repository' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Link href="/repository">
                    <Card className="p-5 cursor-pointer hover:shadow-md transition-all text-center">
                      <div className="text-2xl mb-2">⊞</div>
                      <div className="font-semibold text-sm mb-1">Repository</div>
                      <div className="text-xs" style={{ color: '#6b6456' }}>{projects.length} proposals</div>
                    </Card>
                  </Link>
                  <Link href="/team">
                    <Card className="p-5 cursor-pointer hover:shadow-md transition-all text-center">
                      <div className="text-2xl mb-2">◉</div>
                      <div className="font-semibold text-sm mb-1">Team Setup</div>
                      <div className="text-xs" style={{ color: '#6b6456' }}>Rates & specialisms</div>
                    </Card>
                  </Link>
                  <Link href="/settings">
                    <Card className="p-5 cursor-pointer hover:shadow-md transition-all text-center">
                      <div className="text-2xl mb-2">⚙</div>
                      <div className="font-semibold text-sm mb-1">Settings</div>
                      <div className="text-xs" style={{ color: '#6b6456' }}>API key, margins</div>
                    </Card>
                  </Link>
                </div>
                <h2 className="font-serif text-base">Recent Activity</h2>
                <Card>
                  {loading ? (
                    <div className="p-4 flex items-center gap-2 text-sm" style={{ color: '#6b6456' }}><Spinner size={14} /> Loading…</div>
                  ) : recent.map((p, i) => (
                    <Link key={p.id} href={`/repository/${p.id}`}
                      className={`flex items-center gap-3 p-3 hover:bg-[#faf7f2] transition-colors ${i > 0 ? 'border-t' : ''}`}
                      style={{ borderColor: '#f0ebe0' }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: p.outcome==='won'?'#2d6b78':p.outcome==='lost'?'#b04030':'#b8962e' }}>
                        {p.outcome==='won'?'✓':p.outcome==='lost'?'✗':'◷'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs font-mono truncate" style={{ color: '#6b6456' }}>{p.client} · {p.indexing_status}</div>
                      </div>
                      <OutcomeLabel outcome={p.outcome} />
                    </Link>
                  ))}
                </Card>
              </div>
              <div className="space-y-4">
                <h2 className="font-serif text-base">Quick Actions</h2>
                <Card className="p-4 space-y-2">
                  {[
                    ['/repository', '⊕', 'Upload a Proposal'],
                    ['/rfp', '⊡', 'Run RFP Scan'],
                    ['/team', '◉', 'Add Team Member'],
                  ].map(([href, icon, label]) => (
                    <Link key={href} href={href}>
                      <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-cream transition-colors cursor-pointer">
                        <span className="text-base" style={{ color: '#1e4a52' }}>{icon}</span>
                        <span className="text-sm">{label}</span>
                        <span className="ml-auto text-xs" style={{ color: '#6b6456' }}>→</span>
                      </div>
                    </Link>
                  ))}
                </Card>
                <Card className="p-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Breakdown</div>
                  {[['Won', 'won', '#2d6b78'], ['Lost', 'lost', '#b04030'], ['Pending', 'pending', '#b8962e']].map(([l, k, color]) => {
                    const n = projects.filter(p => p.outcome === k || (k === 'pending' && ['pending','active'].includes(p.outcome))).length;
                    return (
                      <div key={k} className="mb-2">
                        <div className="flex justify-between text-xs mb-0.5"><span style={{ color: '#6b6456' }}>{l}</span><span className="font-mono">{n}</span></div>
                        <ProgressBar value={projects.length ? n/projects.length*100 : 0} color={color} />
                      </div>
                    );
                  })}
                </Card>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
}
