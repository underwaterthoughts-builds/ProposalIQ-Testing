import Head from 'next/head';
import Link from 'next/link';

const PROMISES = [
  { n: '01', title: 'Qualify faster', body: 'Receive a comprehensive bid/no-bid signal in seconds based on historical win patterns and resource constraints.' },
  { n: '02', title: 'Respond better', body: 'Past winning language and strategic positioning are surfaced automatically the moment a query is initiated.' },
  { n: '03', title: 'Win more', body: 'Stop reinventing the wheel. Systematically apply what has consistently resonated with procurement panels.' },
  { n: '04', title: 'Work efficiently', body: 'Every proposal your team writes compounds into a smarter engine, reducing burnout and increasing throughput.' },
];

const INDUSTRIES = [
  { name: 'Management Consulting', body: 'Synthesize complex frameworks and past engagement successes into persuasive technical proposals.' },
  { name: 'Creative & PR', body: 'Protect your creative IP while ensuring historical campaign data supports every brand pitch.' },
  { name: 'Technology & IT', body: 'Map technical capabilities to RFP requirements with surgical precision and zero compliance drift.' },
  { name: 'Architecture & Design', body: 'Leverage project portfolios and sustainability credentials to win major infrastructure tenders.' },
  { name: 'Recruitment & Staffing', body: 'Respond to Master Service Agreements with verified placement data and regional compliance docs.' },
  { name: 'Charity & Third Sector', body: 'Maximize social impact reporting to secure grant funding and public sector service contracts.' },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>ProposalIQ — The Modern Archivist</title>
        <meta
          name="description"
          content="Transform decades of disparate proposals into a unified competitive advantage. ProposalIQ automates the extraction of your best ideas so your team can focus on the win."
        />
      </Head>

      <div className="min-h-screen bg-background text-on-background font-body">

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <nav className="fixed top-0 w-full z-50 bg-[#141311] flex justify-between items-center px-6 md:px-12 py-6 max-w-full mx-auto">
          <Link href="/" className="text-2xl font-headline font-bold text-primary uppercase tracking-widest">
            ProposalIQ
          </Link>
          <div className="hidden md:flex items-center space-x-12">
            <Link href="/platform" className="text-primary border-b border-primary pb-1 font-body text-sm tracking-wide transition-colors duration-300">
              Platform
            </Link>
            <Link href="/solutions" className="text-on-surface-variant font-body text-sm tracking-wide hover:text-primary transition-colors duration-300">
              Solutions
            </Link>
            <Link href="/how-it-works" className="text-on-surface-variant font-body text-sm tracking-wide hover:text-primary transition-colors duration-300">
              How It Works
            </Link>
          </div>
          <div className="flex items-center space-x-4 md:space-x-8">
            <Link href="/login" className="text-on-surface-variant font-body text-sm tracking-wide hover:text-primary transition-colors duration-300 hidden sm:inline">
              Client Portal
            </Link>
            <Link href="/get-access" className="bg-primary text-on-primary px-6 py-2 text-sm font-bold tracking-tight transition-transform active:scale-95 active:duration-75">
              Get Access
            </Link>
          </div>
        </nav>

        <main className="pt-24">

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="min-h-[870px] flex flex-col items-center justify-center text-center px-6 py-24 bg-[#0f0e0c]">
            <div className="inline-flex items-center space-x-3 mb-8 px-4 py-1.5 bg-surface-container rounded-full border border-outline-variant/20">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">AI-Powered Bid Intelligence</span>
            </div>
            <h1 className="font-headline text-5xl md:text-7xl leading-[1.1] max-w-4xl tracking-tight mb-8">
              Your institutional knowledge,
              <br />
              <span className="text-primary italic">working for every bid.</span>
            </h1>
            <p className="font-body text-lg md:text-xl text-[#6b6456] max-w-2xl mb-12 leading-relaxed">
              Transform decades of disparate proposals into a unified competitive advantage. We automate the extraction of your best ideas so your team can focus on the win.
            </p>
            <div className="flex flex-col md:flex-row gap-6">
              <Link href="/get-access" className="bg-primary-container text-on-primary-container px-10 py-4 font-bold tracking-tight hover:brightness-110 transition-all flex items-center justify-center group">
                Request Access
                <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
              <Link href="/how-it-works" className="border border-outline/30 text-on-surface-variant px-10 py-4 font-bold tracking-tight hover:bg-surface-container-high transition-all text-center">
                See How It Works
              </Link>
            </div>
          </section>

          {/* ── FOUR PROMISES ────────────────────────────────────────────── */}
          <section className="bg-background py-24 px-6 md:px-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-0">
              {PROMISES.map((p, i) => (
                <div
                  key={p.n}
                  className={`p-8 ${i < PROMISES.length - 1 ? 'md:border-r border-[rgba(77,70,54,0.2)]' : ''}`}
                >
                  <span className="font-label text-primary text-xs tracking-widest block mb-12">{p.n}</span>
                  <h3 className="font-headline text-2xl mb-4">{p.title}</h3>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── WHO IT'S FOR ─────────────────────────────────────────────── */}
          <section className="py-32 px-6 md:px-12 bg-background">
            <h2 className="font-headline text-5xl mb-20 text-center">Built for teams that bid</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-outline-variant/10">
              {INDUSTRIES.map(ind => (
                <div key={ind.name} className="bg-surface p-12 hover:bg-surface-container-low transition-colors duration-500">
                  <h3 className="font-headline text-2xl mb-6">{ind.name}</h3>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed">{ind.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── FINAL CTA ────────────────────────────────────────────────── */}
          <section className="py-40 px-6 bg-[#0f0e0c] text-center relative overflow-hidden">
            <div className="relative z-10 max-w-4xl mx-auto">
              <h2 className="font-headline text-5xl md:text-6xl mb-12">Ready to start winning more?</h2>
              <div className="flex flex-col md:flex-row justify-center gap-6">
                <Link href="/get-access" className="bg-primary text-on-primary px-12 py-5 font-bold tracking-tight text-lg transition-transform active:scale-95 text-center">
                  Request Institutional Access
                </Link>
                <Link href="/get-access" className="border border-outline/30 text-on-surface-variant px-12 py-5 font-bold tracking-tight text-lg hover:bg-surface-container-high transition-all text-center">
                  Schedule a Consultation
                </Link>
              </div>
              <p className="mt-12 font-label text-[10px] uppercase tracking-[0.3em] text-[#6b6456]">Limited availability for Q1 cohort</p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
              <span className="font-headline italic text-[30vw] whitespace-nowrap">Proposals Done Right</span>
            </div>
          </section>
        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="w-full py-16 px-6 md:px-12 bg-[#0f0e0c] flex flex-col md:flex-row justify-between items-center border-t border-[#4d4636]/20">
          <div className="mb-8 md:mb-0 text-center md:text-left">
            <div className="text-lg font-headline italic text-on-surface-variant mb-2">ProposalIQ</div>
            <div className="font-label text-[10px] uppercase tracking-[0.2em] text-primary-container">
              © {new Date().getFullYear()} ProposalIQ. The Modern Archivist. All rights reserved.
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            {['Privacy Policy', 'Terms of Service', 'Contact', 'Archive'].map(label => (
              <a
                key={label}
                href="#"
                className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-opacity duration-300 opacity-80 hover:opacity-100"
              >
                {label}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
