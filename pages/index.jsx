import Head from 'next/head';
import Link from 'next/link';

const NAV = [
  { href: '/platform', label: 'Platform' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/how-it-works', label: 'How It Works' },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>ProposalIQ — Bid Intelligence Platform</title>
        <meta name="description" content="Turn your proposal history into competitive intelligence. ProposalIQ helps teams qualify faster, respond better, and win more of the right work." />
      </Head>

      <div style={{ minHeight: '100vh', background: '#0f0e0c', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

        {/* ── NAVIGATION ─────────────────────────────────────────────────── */}
        <header style={{ borderBottom: '1px solid rgba(255,255,255,.07)', position: 'sticky', top: 0, zIndex: 50, background: '#0f0e0c' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 40 }}>

            {/* Logo */}
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, background: '#b8962e', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 16, fontWeight: 'bold', color: '#0f0e0c' }}>P</div>
              <span style={{ fontFamily: 'Georgia,serif', fontSize: 18, color: 'white' }}>ProposalIQ</span>
            </Link>

            {/* Nav links */}
            <nav style={{ display: 'flex', gap: 8, flex: 1 }}>
              {NAV.map(n => (
                <Link key={n.href} href={n.href}
                  style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, textDecoration: 'none', padding: '6px 14px', borderRadius: 6, transition: 'color .15s' }}
                  onMouseEnter={e => e.target.style.color = 'white'}
                  onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,.5)'}>
                  {n.label}
                </Link>
              ))}
            </nav>

            {/* Right side CTAs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Link href="/login"
                style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, textDecoration: 'none', padding: '7px 16px', border: '1px solid rgba(255,255,255,.15)', borderRadius: 6 }}>
                Client Portal
              </Link>
              <Link href="/get-access"
                style={{ background: '#b8962e', color: 'white', fontSize: 14, textDecoration: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 500 }}>
                Get Access
              </Link>
            </div>
          </div>
        </header>

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '120px 32px 100px' }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(184,150,46,.12)', border: '1px solid rgba(184,150,46,.25)', borderRadius: 20, padding: '5px 14px', marginBottom: 32 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#b8962e', animation: 'pulse 2s infinite' }} />
              <span style={{ color: '#d4b458', fontSize: 12, fontFamily: "'Courier New',monospace", letterSpacing: '.08em' }}>AI-Powered Bid Intelligence</span>
            </div>
            <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 56, fontWeight: 'normal', color: 'white', lineHeight: 1.15, marginBottom: 24 }}>
              Your institutional knowledge,<br />
              <span style={{ color: '#d4b458' }}>working for every bid.</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 18, lineHeight: 1.7, marginBottom: 40, maxWidth: 580 }}>
              ProposalIQ turns your history of proposals, pitches, and project knowledge into a competitive asset — surfacing the right past work, identifying gaps, and generating a strategy for every new brief.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/get-access"
                style={{ background: '#b8962e', color: 'white', textDecoration: 'none', padding: '14px 28px', borderRadius: 8, fontSize: 15, fontWeight: 500 }}>
                Request Access →
              </Link>
              <Link href="/how-it-works"
                style={{ color: 'rgba(255,255,255,.6)', textDecoration: 'none', padding: '14px 28px', borderRadius: 8, fontSize: 15, border: '1px solid rgba(255,255,255,.12)' }}>
                See How It Works
              </Link>
            </div>
          </div>
        </section>

        {/* ── FOUR PROMISES ─────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
            {[
              { n: '01', label: 'Qualify faster', desc: 'Bid/no-bid signal in seconds. Know which opportunities are worth pursuing before you invest resource.' },
              { n: '02', label: 'Respond better', desc: 'Past winning language, matched case studies, and structure guidance — surfaced automatically for every brief.' },
              { n: '03', label: 'Win more', desc: 'Apply what consistently worked — the approaches, proof points, and patterns from your strongest bids.' },
              { n: '04', label: 'Work efficiently', desc: 'Less wasted bid effort. The knowledge in every past proposal compounds rather than sitting in a folder.' },
            ].map(p => (
              <div key={p.n} style={{ padding: '40px 32px', borderRight: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: 'rgba(255,255,255,.2)', letterSpacing: '.15em', marginBottom: 16 }}>{p.n}</div>
                <div style={{ fontFamily: 'Georgia,serif', fontSize: 20, color: 'white', marginBottom: 12 }}>{p.label}</div>
                <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 14, lineHeight: 1.65 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS SUMMARY ──────────────────────────────────────── */}
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '100px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: '#b8962e', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>One engine, two views</div>
              <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 38, fontWeight: 'normal', color: 'white', lineHeight: 1.25, marginBottom: 20 }}>Full intelligence pipeline. Presented the way you need it.</h2>
              <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
                ProposalIQ runs the same 14-step AI analysis for every scan. The difference is how it's presented — a fast decision brief for account directors, or a full working workspace for bid writers.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { mode: 'QuickIQ', desc: 'Fit signal, winning thesis, priorities, risks, matched work. A 2-minute read before any decision.' },
                  { mode: 'ProIQ', desc: 'Full matched proposals, gap analysis, win strategy, winning language, team suggestions, assembly tracker.' },
                ].map(m => (
                  <div key={m.mode} style={{ display: 'flex', gap: 16, padding: '16px 20px', background: 'rgba(255,255,255,.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: 14, color: '#d4b458', flexShrink: 0, paddingTop: 1 }}>{m.mode}</div>
                    <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{m.desc}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 32 }}>
                <Link href="/how-it-works" style={{ color: '#d4b458', fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  See the full pipeline →
                </Link>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                'Upload RFP document',
                'Extract requirements (explicit + implicit)',
                'Match against proposal repository',
                'AI re-rank by practical fit',
                'Gap analysis with team CV matching',
                'Win strategy + recommended angle',
                'Winning language + contextual adaptation',
                'Industry news + narrative advice',
                'Suggested approach + indicative budget',
              ].map((step, i) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: i === 0 ? 'rgba(184,150,46,.1)' : 'rgba(255,255,255,.03)', borderRadius: 8, border: `1px solid ${i === 0 ? 'rgba(184,150,46,.2)' : 'rgba(255,255,255,.05)'}` }}>
                  <span style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: 'rgba(255,255,255,.2)', width: 20, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ color: i === 0 ? '#d4b458' : 'rgba(255,255,255,.5)', fontSize: 14 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WHO IT'S FOR ──────────────────────────────────────────────── */}
        <section style={{ background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 36, fontWeight: 'normal', color: 'white', marginBottom: 12 }}>Built for every team that responds to briefs</h2>
              <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 16 }}>Consulting, agency, professional services — if you respond to RFPs, ProposalIQ is for you.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                { type: 'Management Consulting', desc: 'Turn your bid library into a strategic asset. Surface what won, identify gaps, and apply proven approaches to every new tender.' },
                { type: 'Creative & PR Agencies', desc: 'Qualify briefs in minutes. Know your fit, find the angle, reference the right reel — before a single word is written.' },
                { type: 'Technology & IT', desc: 'Match methodology, surface relevant case studies, and generate structured approaches grounded in past delivery.' },
                { type: 'Architecture & Design', desc: 'Reference comparable projects intelligently. Identify evaluator expectations and adapt winning structure to each tender.' },
                { type: 'Recruitment & Staffing', desc: 'Match team credentials to tender requirements. Flag missing certifications and suggest the right people for each bid.' },
                { type: 'Charity & Third Sector', desc: 'Apply grant-writing intelligence at scale. Surface what worked, identify gaps, and build stronger applications faster.' },
              ].map(s => (
                <div key={s.type} style={{ padding: '24px', background: 'rgba(255,255,255,.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: 16, color: 'white', marginBottom: 10 }}>{s.type}</div>
                  <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '100px 32px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 42, fontWeight: 'normal', color: 'white', marginBottom: 16 }}>
            Ready to start winning more?
          </h2>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 17, marginBottom: 40, maxWidth: 500, margin: '0 auto 40px' }}>
            Request access and see what ProposalIQ finds in your repository.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <Link href="/get-access"
              style={{ background: '#b8962e', color: 'white', textDecoration: 'none', padding: '14px 32px', borderRadius: 8, fontSize: 15, fontWeight: 500 }}>
              Request Access
            </Link>
            <Link href="/login"
              style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none', padding: '14px 32px', borderRadius: 8, fontSize: 15, border: '1px solid rgba(255,255,255,.12)' }}>
              Client Portal
            </Link>
          </div>
        </section>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, background: '#b8962e', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 12, fontWeight: 'bold', color: '#0f0e0c' }}>P</div>
            <span style={{ fontFamily: 'Georgia,serif', fontSize: 14, color: 'rgba(255,255,255,.3)' }}>ProposalIQ</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[...NAV, { href: '/login', label: 'Client Portal' }].map(n => (
              <Link key={n.href} href={n.href} style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, textDecoration: 'none' }}>{n.label}</Link>
            ))}
          </div>
          <div style={{ color: 'rgba(255,255,255,.2)', fontSize: 12, fontFamily: "'Courier New',monospace" }}>© 2026 ProposalIQ</div>
        </footer>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media (max-width: 768px) {
          h1 { font-size: 36px !important; }
          section > div { grid-template-columns: 1fr !important; gap: 40px !important; }
          header > div { padding: 0 16px !important; }
          nav { display: none !important; }
        }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  return { props: {} };
}
