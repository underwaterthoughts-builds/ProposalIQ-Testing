import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useUser } from '../lib/useUser';
import { useMode } from '../lib/useMode';

const INTENT_MODES = [
  {
    key: 'write',
    label: 'Write Proposals',
    icon: 'edit_document',
    desc: 'Synthesize RFP data with historical wins to draft compelling responses.',
  },
  {
    key: 'intelligence',
    label: 'Full Intelligence',
    icon: 'hub',
    desc: 'Cross-analyze market trends, competitor pricing, and internal capacity.',
  },
  {
    key: 'repository',
    label: 'Manage Repository',
    icon: 'database',
    desc: 'Audit and organize your proposal blocks, case studies, and compliance assets.',
  },
];

function statusPill(status) {
  if (status === 'complete' || status === 'fast_ready') {
    return (
      <div className="px-3 py-1 rounded bg-green-900/20 border border-green-800/40 text-green-400 text-[10px] font-bold uppercase tracking-widest">
        Complete
      </div>
    );
  }
  if (status === 'processing' || status === 'indexing') {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest">
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
        Processing
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="px-3 py-1 rounded bg-error-container/20 border border-error-container/40 text-error text-[10px] font-bold uppercase tracking-widest">
        Error
      </div>
    );
  }
  return (
    <div className="px-3 py-1 rounded bg-surface-container border border-outline-variant/20 text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">
      {status || 'Pending'}
    </div>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading } = useUser();
  const [projects, setProjects] = useState([]);
  const [scans, setScans] = useState([]);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsSeed, setNeedsSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [intent, setIntent] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('piq_dash_mode') || 'write';
    return 'write';
  });

  function setIntentPersist(m) {
    setIntent(m);
    if (typeof window !== 'undefined') localStorage.setItem('piq_dash_mode', m);
  }

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => {
        const p = d.projects || [];
        setProjects(p);
        setNeedsSeed(p.length === 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch('/api/rfp/scan')
      .then(r => r.json())
      .then(d => setScans(d.scans || []))
      .catch(() => {});
    fetch('/api/win-patterns')
      .then(r => r.json())
      .then(d => setPatterns(d))
      .catch(() => {});
  }, []);

  async function runSeed() {
    setSeeding(true);
    try {
      await fetch('/api/seed');
      const d = await fetch('/api/projects').then(r => r.json());
      setProjects(d.projects || []);
      setNeedsSeed(false);
    } catch {}
    setSeeding(false);
  }

  const won = projects.filter(p => p.outcome === 'won').length;
  const lost = projects.filter(p => p.outcome === 'lost').length;
  const winRate = won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(1) : '—';
  const needsNarrative = projects.filter(
    p => (p.outcome === 'won' || p.outcome === 'lost') && (!p.lh_status || p.lh_status === 'none')
  );

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Dashboard — ProposalIQ</title></Head>
      <Layout title="Dashboard" subtitle={`Welcome back, ${user.name}`} user={user}>
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 md:py-12">

          {/* ── INTENT MODE SELECTOR ───────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {INTENT_MODES.map(m => {
              const active = intent === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setIntentPersist(m.key)}
                  className={`relative p-6 rounded-lg text-left transition-all duration-300 ${
                    active
                      ? 'bg-primary-container/10 border border-primary ring-4 ring-primary/5'
                      : 'bg-surface-container border border-outline-variant/30 border-dashed hover:border-outline'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <span
                      className={`material-symbols-outlined text-3xl ${active ? 'text-primary' : 'text-on-surface-variant'}`}
                      style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
                    >
                      {m.icon}
                    </span>
                    {active && (
                      <div className="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                        Active
                      </div>
                    )}
                  </div>
                  <h3 className="text-2xl font-headline font-bold text-on-surface mb-1">{m.label}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{m.desc}</p>
                </button>
              );
            })}
          </div>

          {/* ── SEED BANNER ────────────────────────────────────────────── */}
          {!loading && needsSeed && (
            <div className="mb-12 p-6 rounded-lg bg-primary/5 border border-primary/20">
              <h3 className="font-headline text-xl font-bold mb-2">Set up your knowledge base</h3>
              <p className="text-sm text-on-surface-variant mb-4">
                Load 10 example proposals to see ProposalIQ in action, or upload your own.
              </p>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={runSeed}
                  disabled={seeding}
                  className="bg-primary text-on-primary px-6 py-2.5 rounded-sm font-bold text-sm tracking-tight hover:scale-95 transition-transform disabled:opacity-60"
                >
                  {seeding ? 'Generating…' : 'Load 10 Example Proposals'}
                </button>
                <Link
                  href="/repository"
                  className="border border-outline/30 text-on-surface px-6 py-2.5 rounded-sm font-bold text-sm tracking-tight hover:bg-surface-container-high transition-colors"
                >
                  Upload my own →
                </Link>
              </div>
            </div>
          )}

          {/* ── MAIN GRID — WRITE MODE ─────────────────────────────────── */}
          {intent === 'write' && (
          <div className="grid grid-cols-12 gap-8 md:gap-12">

            {/* Primary workspace */}
            <div className="col-span-12 lg:col-span-8 space-y-12">

              {/* Upload card — dashed border */}
              <Link href="/rfp">
                <div className="w-full aspect-[21/9] rounded-xl flex flex-col items-center justify-center p-12 text-center group cursor-pointer hover:bg-surface-container-low transition-colors"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%234d4636' stroke-width='2' stroke-dasharray='8%2c 8' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e")`,
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-primary text-4xl">upload_file</span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-headline font-bold text-on-surface mb-3">Upload an RFP</h2>
                  <p className="text-on-surface-variant max-w-md mx-auto leading-relaxed">
                    Drop your PDF or DOCX file here to begin the intelligence scan. ProposalIQ will extract requirements and map them to your repository.
                  </p>
                </div>
              </Link>

              {/* Recent Scans */}
              <section>
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-headline font-bold text-on-surface">Recent Scans</h2>
                    <p className="text-on-surface-variant font-label text-xs uppercase tracking-widest mt-2">
                      Latest activity from your intelligence engine
                    </p>
                  </div>
                  <Link href="/rfp" className="text-primary font-bold text-sm flex items-center gap-2 hover:underline">
                    View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </div>

                {loading ? (
                  <div className="text-center py-12 text-on-surface-variant text-sm">Loading scans…</div>
                ) : scans.length === 0 ? (
                  <div className="text-center py-12 text-on-surface-variant text-sm">
                    No scans yet — upload an RFP above to begin.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {scans.slice(0, 5).map(s => (
                      <Link key={s.id} href={`/rfp/${s.id}`}>
                        <div className="flex items-center justify-between p-5 bg-surface-container-low rounded hover:bg-surface-container transition-colors cursor-pointer">
                          <div className="flex items-center gap-5 min-w-0">
                            <div className="w-12 h-12 bg-surface-container-high rounded flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-primary-container">description</span>
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-on-surface truncate">{s.name}</h4>
                              <p className="text-xs text-on-surface-variant font-label uppercase">
                                {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            {statusPill(s.status)}
                            <span className="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar: Insights & Stats */}
            <aside className="col-span-12 lg:col-span-4 space-y-8">

              {/* Quick Stats */}
              <div className="bg-surface-container p-8 rounded-lg">
                <h3 className="text-2xl font-headline font-bold mb-8">Quick Stats</h3>
                <div className="space-y-8">
                  <div>
                    <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-widest mb-1">Repository Size</p>
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-headline font-bold text-on-surface">{projects.length}</span>
                      <span className="text-sm text-on-surface-variant mb-1.5">proposals</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-widest mb-1">Win Rate</p>
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-headline font-bold text-on-surface">
                        {winRate === '—' ? '—' : `${winRate}%`}
                      </span>
                      <span className="text-sm text-on-surface-variant mb-1.5">
                        {won}W / {lost}L decided
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-widest mb-1">Scans Run</p>
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-headline font-bold text-on-surface">{scans.length}</span>
                      <span className="text-sm text-on-surface-variant mb-1.5">total</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Learning History prompt */}
              {needsNarrative.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 p-8 rounded-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary/10 rounded-full blur-2xl" />
                  <span className="material-symbols-outlined text-primary text-3xl mb-4">history_edu</span>
                  <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Learning History</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
                    {needsNarrative.length} recent proposal{needsNarrative.length > 1 ? 's' : ''} awaiting outcome capture. Your feedback directly improves future draft intelligence.
                  </p>
                  <Link href="/repository" className="flex items-center gap-2 text-primary font-bold text-sm group">
                    Capture Outcomes
                    <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </Link>
                </div>
              )}

              {/* Archive pick image */}
              <div className="relative h-64 rounded-lg overflow-hidden group">
                <img
                  alt="Strategic workspace"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDllOZfCMEkvzGzMELK9mgYKIjaPjSkh0HspyaxVv7mWdNn6cSBV-4Yy5MB-zcwGspUx4CQGPiaBoMa36fk5rq9Rd2n8QkYb1uecAIVqg-D7WQT_U4QDgo9ckONaUET65qIdcfGgSoF-VlMhNh7E2uk0eSg9cbblU3bR9Cd8CHBuxchwkkqTny5rP2eDBLK1fXwLgvoz0vlLh0aKPRIfQFnxGvMcOMuLgIRc8z11ktdZGwTss3VYJa5GPB1f4L6EmtXIlGOJwhCcsg"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent opacity-80" />
                <div className="absolute bottom-0 p-6">
                  <span className="bg-primary text-on-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-sm">
                    Archive Pick
                  </span>
                  <h4 className="text-lg font-headline font-bold text-on-surface mt-2">The Architecture of Persuasion</h4>
                  <p className="text-on-surface-variant text-xs mt-1">Read our internal whitepaper on winning technical RFPs.</p>
                </div>
              </div>
            </aside>
          </div>
          )}

          {/* ── INTELLIGENCE MODE ──────────────────────────────────────── */}
          {intent === 'intelligence' && <IntelligenceMode projects={projects} scans={scans} patterns={patterns} winRate={winRate} won={won} lost={lost} />}

          {/* ── REPOSITORY MODE ────────────────────────────────────────── */}
          {intent === 'repository' && <RepositoryMode projects={projects} />}

        </div>
      </Layout>

      {/* Floating action button — shown on Intelligence mode only */}
      {intent === 'intelligence' && (
        <Link href="/rfp" className="fixed bottom-8 right-8 z-50 bg-primary hover:bg-primary-container text-on-primary w-14 h-14 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-3xl">add</span>
        </Link>
      )}
    </>
  );
}

// ── INTELLIGENCE MODE ───────────────────────────────────────────────────
function IntelligenceMode({ projects, scans, patterns, winRate, won, lost }) {
  const avgRating = projects.length
    ? (projects.reduce((a, p) => a + (p.user_rating || 0), 0) / projects.length).toFixed(1)
    : '—';

  // Win patterns — derive from API `patterns.by_sector` if available, fall
  // back to empty until the win-patterns API responds.
  const sectorPatterns = (patterns?.by_sector || []).slice(0, 5);
  const patternRows = sectorPatterns.length > 0
    ? sectorPatterns.map(s => ({
        label: s.sector || 'Unspecified',
        current: typeof s.win_rate === 'number' ? s.win_rate : 0,
        benchmark: 50, // industry-average placeholder
      }))
    : [];

  // Knowledge health — real values from `patterns.health` when available
  const health = patterns?.health || {};
  const knowledgeHealth = [
    {
      label: 'Writing Analysis',
      pct: health.writing_analysis_coverage ?? 0,
      color: 'bg-primary',
    },
    {
      label: 'Learning Histories',
      pct: health.learning_history_coverage ?? 0,
      color: 'bg-secondary',
    },
    {
      label: 'Taxonomy Coverage',
      pct: health.taxonomy_coverage ?? Math.round(
        (projects.filter(p => p.client_industry || p.service_industry).length / Math.max(1, projects.length)) * 100
      ),
      color: 'bg-primary',
    },
  ];

  const overallHealth = Math.round(
    knowledgeHealth.reduce((a, h) => a + (h.pct || 0), 0) / knowledgeHealth.length
  );

  const topRecommendation = patterns?.ai_patterns?.top_recommendation;

  const recent = [...projects]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 4);

  return (
    <div className="space-y-10">

      {/* AI Strategic Insight — live top_recommendation if the patterns API has one */}
      {topRecommendation ? (
        <section className="bg-[#1a2e2e] p-8 rounded-lg flex flex-col md:flex-row items-center gap-8 border-l-4 border-[#4fd1c5]">
          <div className="md:w-1/3">
            <span className="font-label text-xs uppercase tracking-widest text-[#4fd1c5] mb-2 block">AI Strategic Insight</span>
            <h3 className="font-headline text-3xl md:text-4xl text-white font-semibold leading-tight">
              Top Recommendation
            </h3>
          </div>
          <div className="md:w-1/2">
            <p className="text-on-surface font-body text-lg leading-relaxed mb-4">
              {topRecommendation}
            </p>
            <Link href="/rfp" className="text-[#4fd1c5] font-label text-sm uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform">
              Act on this insight
              <span className="material-symbols-outlined text-base">trending_up</span>
            </Link>
          </div>
          <div className="md:w-1/6 hidden md:block">
            <div className="w-24 h-24 bg-[#4fd1c5]/10 rounded-full flex items-center justify-center border border-[#4fd1c5]/20">
              <span className="material-symbols-outlined text-4xl text-[#4fd1c5]">lightbulb</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-surface-container-low p-8 rounded-lg flex items-center gap-4 border-l-4 border-outline-variant/30">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant">insights</span>
          <div>
            <span className="font-label text-xs uppercase tracking-widest text-on-surface-variant block mb-1">
              AI Strategic Insight
            </span>
            <p className="text-on-surface-variant font-body">
              {patterns === null
                ? 'Analysing your repository…'
                : projects.length < 3
                ? 'Upload at least 3 proposals for ProposalIQ to surface strategic recommendations.'
                : 'No strategic recommendation yet — try refreshing after your next scan.'}
            </p>
          </div>
        </section>
      )}

      {/* 4-Metric Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: projects.length, sub: `${won}W / ${lost}L` },
          { label: 'Win Rate', value: winRate === '—' ? '—' : `${winRate}%`, sub: 'Decided' },
          { label: 'Avg Rating', value: avgRating, sub: '/ 5.0' },
          { label: 'RFP Scans', value: scans.length, sub: 'Lifetime' },
        ].map(m => (
          <div key={m.label} className="bg-surface-container-lowest p-6 rounded-sm border-b border-outline-variant/10">
            <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-4">{m.label}</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-4xl font-bold text-primary">{m.value}</span>
              <span className="text-[10px] text-primary/60 font-label">{m.sub}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Main grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Win Patterns (8 cols) */}
        <div className="lg:col-span-8 bg-surface-container p-8 rounded-lg space-y-8">
          <div className="flex justify-between items-end border-b border-outline-variant/20 pb-4">
            <h3 className="font-headline text-3xl font-semibold">Win Patterns</h3>
            <div className="flex gap-4">
              <span className="flex items-center gap-1 text-[10px] font-label text-on-surface-variant">
                <div className="w-2 h-2 bg-primary" /> Current
              </span>
              <span className="flex items-center gap-1 text-[10px] font-label text-on-surface-variant">
                <div className="w-2 h-2 bg-outline" /> Benchmark
              </span>
            </div>
          </div>

          {patternRows.length === 0 ? (
            <div className="py-16 text-center text-on-surface-variant">
              <p className="font-body text-sm max-w-md mx-auto">
                {patterns === null
                  ? 'Loading win patterns…'
                  : projects.length < 3
                  ? 'Upload at least 3 proposals and capture outcomes to unlock sector win-rate patterns.'
                  : 'No sector breakdown available yet — try refreshing.'}
              </p>
            </div>
          ) : (
            <div className="h-64 flex items-end justify-between gap-4">
              {patternRows.map(p => (
                <div key={p.label} className="flex-1 space-y-2 group">
                  <div className="relative h-60 flex flex-col justify-end gap-1">
                    <div className="bg-outline/20 w-full rounded-t-sm" style={{ height: `${p.benchmark}%` }} />
                    <div className="bg-primary w-full rounded-t-sm transition-all group-hover:bg-primary-container" style={{ height: `${p.current}%` }} />
                  </div>
                  <span className="font-label text-[9px] text-center block text-on-surface-variant uppercase truncate" title={p.label}>
                    {p.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quality score insights — derived from patterns.quality_scores */}
          {patterns?.quality_scores?.won && patterns?.quality_scores?.lost && (
            <div className="grid grid-cols-2 gap-8 pt-6">
              {[['Writing', 'writing'], ['Approach', 'approach']].map(([label, key]) => {
                const wonScore = patterns.quality_scores.won[key];
                const lostScore = patterns.quality_scores.lost[key];
                if (!wonScore || !lostScore) return null;
                const delta = wonScore - lostScore;
                return (
                  <div key={key} className="p-4 bg-surface-container-low border border-outline-variant/10">
                    <p className="text-xs font-body italic text-on-surface-variant mb-2">
                      Won bids score <span className="text-primary font-bold">{wonScore}</span> on {label.toLowerCase()} vs <span className="opacity-70">{lostScore}</span> for losses ({delta > 0 ? '+' : ''}{delta} points).
                    </p>
                    <span className="font-label text-[10px] text-primary uppercase tracking-widest">Insight: {label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Knowledge Health + Recent Projects (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          <div className="bg-surface-container-high p-6 rounded-lg">
            <h4 className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant mb-6 flex justify-between">
              Knowledge Health
              <span className="text-primary">{overallHealth}%</span>
            </h4>
            <div className="space-y-6">
              {knowledgeHealth.map(h => (
                <div key={h.label} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-label text-on-surface-variant uppercase">
                    <span>{h.label}</span>
                    <span>{h.pct}%</span>
                  </div>
                  <div className="w-full h-1 bg-surface-container-lowest overflow-hidden">
                    <div className={`h-full ${h.color}`} style={{ width: `${h.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-surface-container-lowest p-6 border border-outline-variant/5">
            <h4 className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant mb-6">Recent Projects</h4>
            {recent.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No projects yet.</p>
            ) : (
              <ul className="space-y-4">
                {recent.map(p => {
                  const icon = p.outcome === 'won' ? 'stars' : p.indexing_status === 'indexing' ? null : p.outcome === 'lost' ? 'close' : 'edit';
                  const iconColor = p.outcome === 'won' ? 'text-[#4fd1c5]' : p.outcome === 'lost' ? 'text-error' : 'text-on-surface-variant';
                  return (
                    <li key={p.id}>
                      <Link href={`/repository/${p.id}`} className="flex items-center justify-between group cursor-pointer">
                        <div className="flex flex-col min-w-0">
                          <span className="font-headline font-medium text-on-surface group-hover:text-primary transition-colors truncate">{p.name}</span>
                          <span className="text-[10px] text-on-surface-variant font-label uppercase">{p.indexing_status || p.outcome || 'pending'}</span>
                        </div>
                        {icon ? (
                          <span className={`material-symbols-outlined text-sm ${iconColor}`}>{icon}</span>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/repository" className="w-full mt-8 block text-center text-on-surface-variant font-label text-[10px] uppercase tracking-widest hover:text-on-surface transition-colors">
              View All Projects
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── REPOSITORY MODE ─────────────────────────────────────────────────────
function RepositoryMode({ projects }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Link href="/repository" className="bg-surface-container p-8 rounded-lg hover:bg-surface-container-high transition-colors group">
        <span className="material-symbols-outlined text-primary text-4xl mb-4">inventory_2</span>
        <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">Repository</h3>
        <p className="text-on-surface-variant text-sm mb-4">{projects.length} proposals indexed</p>
        <span className="font-label text-xs uppercase tracking-widest text-primary group-hover:translate-x-1 inline-flex items-center gap-1 transition-transform">
          Browse <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </span>
      </Link>
      <Link href="/team" className="bg-surface-container p-8 rounded-lg hover:bg-surface-container-high transition-colors group">
        <span className="material-symbols-outlined text-primary text-4xl mb-4">groups</span>
        <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">Team Setup</h3>
        <p className="text-on-surface-variant text-sm mb-4">Rates, specialisms, CVs</p>
        <span className="font-label text-xs uppercase tracking-widest text-primary group-hover:translate-x-1 inline-flex items-center gap-1 transition-transform">
          Manage <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </span>
      </Link>
      <Link href="/settings" className="bg-surface-container p-8 rounded-lg hover:bg-surface-container-high transition-colors group">
        <span className="material-symbols-outlined text-primary text-4xl mb-4">tune</span>
        <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">Settings</h3>
        <p className="text-on-surface-variant text-sm mb-4">Org profile, AI, taxonomy</p>
        <span className="font-label text-xs uppercase tracking-widest text-primary group-hover:translate-x-1 inline-flex items-center gap-1 transition-transform">
          Configure <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </span>
      </Link>
    </div>
  );
}
