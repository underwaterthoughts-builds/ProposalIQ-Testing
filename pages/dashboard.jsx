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

          {/* ── MAIN GRID ──────────────────────────────────────────────── */}
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
        </div>
      </Layout>
    </>
  );
}
