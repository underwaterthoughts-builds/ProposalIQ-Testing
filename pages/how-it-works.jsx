import Head from 'next/head';
import Link from 'next/link';

export default function HowItWorks() {
  return (
    <>
      <Head>
        <title>How It Works — ProposalIQ</title>
        <meta
          name="description"
          content="From RFP to recommendation in 60 seconds. A strategic intelligence layer that dissects complex procurement requirements and synthesizes winning responses."
        />
      </Head>

      <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary selection:text-on-primary">

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <nav className="bg-[#141311] fixed top-0 left-0 right-0 z-50">
          <div className="flex justify-between items-center w-full px-8 py-6 max-w-screen-2xl mx-auto">
            <Link href="/" className="text-2xl font-headline italic text-primary">ProposalIQ</Link>
            <div className="hidden md:flex items-center gap-10 font-headline text-on-surface tracking-tight">
              <Link href="/platform" className="text-on-surface-variant hover:text-primary transition-colors duration-300">Platform</Link>
              <Link href="/solutions" className="text-on-surface-variant hover:text-primary transition-colors duration-300">Solutions</Link>
              <Link href="/how-it-works" className="text-primary font-bold border-b border-primary pb-1">How It Works</Link>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors">Client Portal</Link>
              <Link href="/get-access" className="bg-primary text-on-primary px-6 py-2 font-body font-bold text-sm hover:opacity-90 transition-all active:scale-95 duration-200">Get Access</Link>
              <button className="md:hidden text-primary"><span className="material-symbols-outlined">menu</span></button>
            </div>
          </div>
        </nav>

        <main className="pt-24">

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="relative min-h-[716px] flex items-center px-8 md:px-24 overflow-hidden bg-surface">
            <div className="max-w-4xl z-10">
              <span className="font-label text-primary text-xs uppercase tracking-[0.3em] mb-6 block">How ProposalIQ works</span>
              <h1 className="font-headline text-6xl md:text-8xl font-light tracking-tighter leading-none mb-8">
                From RFP to recommendation in <span className="font-headline italic text-primary">60 seconds.</span>
              </h1>
              <p className="font-body text-xl text-on-surface-variant max-w-2xl leading-relaxed mb-12">
                ProposalIQ is not a template engine. It is a strategic intelligence layer that dissects complex procurement requirements and synthesizes winning responses with the precision of a master architect.
              </p>
              <div className="flex gap-4">
                <Link href="/get-access" className="bg-primary text-on-primary px-10 py-4 font-bold tracking-tight text-lg active:scale-95 duration-200">Try it on your next RFP</Link>
              </div>
            </div>
            <div className="absolute right-[-10%] top-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-outline-variant/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          </section>

          {/* ── FIVE STEPS THE USER ACTUALLY SEES ────────────────────────── */}
          <section className="py-32 px-8 md:px-24 bg-surface-container-lowest">
            <div className="max-w-screen-xl mx-auto">
              <div className="grid grid-cols-12 gap-12 mb-24">
                <div className="col-span-12 md:col-span-7">
                  <h2 className="font-headline text-4xl md:text-5xl font-medium tracking-tight">Five steps from upload to decision</h2>
                  <p className="font-body text-on-surface-variant mt-6 text-lg leading-relaxed">
                    The pipeline behind ProposalIQ is twelve internal steps; what you actually see and act on is five. Each one returns a concrete artefact you could take to a partner meeting and defend.
                  </p>
                </div>
              </div>

              <div className="relative space-y-24">
                <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[1px] bg-outline-variant/30 hidden md:block" />

                {[
                  {
                    num: '01',
                    label: 'UPLOAD',
                    icon: 'upload_file',
                    h: 'Upload an RFP',
                    b: 'PDF, DOCX, or paste. The system parses the brief into requirements and themes in seconds. Your data stays inside your tenant; no cross-customer training.',
                  },
                  {
                    num: '02',
                    label: 'QUICK VERDICT (≈60s)',
                    icon: 'bolt',
                    h: 'Bid / Conditional Bid / No Bid',
                    b: 'Top matches from your repository, a confidence score, and a short rationale grounded in your past work. Enough signal to triage the opportunity-list call before any real bid hours go in.',
                  },
                  {
                    num: '03',
                    label: 'DEEP PASS (≈3 min)',
                    icon: 'analytics',
                    h: 'Full intelligence pack',
                    b: 'Opportunity gaps the RFP demands but your archive doesn\'t evidence yet. Win strategy. Winning-language library mined from your own past wins. Suggested team. Indicative budget breakdown. A sanity-check pass on the matches.',
                  },
                  {
                    num: '04',
                    label: 'SECTION DRAFTS',
                    icon: 'edit_document',
                    h: 'Drafts on demand, sourced from your repository',
                    b: 'Generate any section of the response. The system flags [EVIDENCE NEEDED] markers rather than fabricating claims. A pre-delivery QA pass corrects the draft against contract rules before you ever see it.',
                  },
                  {
                    num: '05',
                    label: 'OUTCOME CAPTURE',
                    icon: 'flag',
                    h: 'Tell it what happened',
                    b: 'Won, lost, no-bid, withdrawn. Future scans weight matches toward the projects that actually convert in your hands. Every bid makes the next decision sharper.',
                  },
                ].map((step, i) => (
                  <div key={step.num} className={`relative grid grid-cols-12 gap-8 items-center`}>
                    <div className={`col-span-12 md:col-span-5 ${i % 2 === 0 ? 'md:text-right' : 'md:order-3'}`}>
                      <span className="font-label text-primary-container text-sm">{step.num}. {step.label}</span>
                      <h3 className="font-headline text-3xl mt-2">{step.h}</h3>
                      <p className="font-body text-on-surface-variant mt-4">{step.b}</p>
                    </div>
                    <div className={`hidden md:flex col-span-2 justify-center z-10 ${i % 2 === 0 ? '' : 'md:order-2'}`}>
                      <div className="w-10 h-10 bg-surface-container-highest border border-primary flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-sm">{step.icon}</span>
                      </div>
                    </div>
                    <div className={`col-span-12 md:col-span-5 ${i % 2 === 0 ? '' : 'md:order-1'}`}>
                      <div className="bg-surface-container-high p-8 flex flex-col justify-center border border-primary/10 aspect-video">
                        <span className="material-symbols-outlined text-primary/40 text-6xl mb-4">{step.icon}</span>
                        <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-[0.2em]">Step {step.num} artefact</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── TWO MODES ────────────────────────────────────────────────── */}
          <section className="py-32 px-8 md:px-24 bg-surface">
            <div className="max-w-screen-xl mx-auto">
              <div className="text-center mb-24">
                <h2 className="font-headline text-5xl mb-6">Pick the right depth for the moment</h2>
                <p className="font-body text-on-surface-variant max-w-xl mx-auto">Two modes for two different jobs: the bid/no-bid triage call, and the bid you've decided to commit to.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {/* Quick scan */}
                <div className="bg-surface-container-low p-16 flex flex-col justify-between group hover:bg-surface-container-high transition-all duration-500">
                  <div>
                    <span className="font-label text-on-surface-variant/60 text-xs tracking-[0.2em] uppercase">≈60 seconds</span>
                    <h3 className="font-headline text-4xl mt-8 mb-6">Quick scan</h3>
                    <ul className="space-y-6 mb-12">
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                        <span className="font-body text-on-surface-variant">Verdict + confidence score in under a minute.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                        <span className="font-body text-on-surface-variant">Top 5 matched proposals from your repository.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">timer</span>
                        <span className="font-body text-on-surface-variant">Best for the bid/no-bid triage call.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Deep scan */}
                <div className="bg-surface-container-lowest p-16 flex flex-col justify-between border-l border-outline-variant/10 group hover:bg-surface-container-low transition-all duration-500">
                  <div>
                    <span className="font-label text-primary text-xs tracking-[0.2em] uppercase">≈3 minutes</span>
                    <h3 className="font-headline text-4xl mt-8 mb-6">Deep scan</h3>
                    <ul className="space-y-6 mb-12">
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">architecture</span>
                        <span className="font-body text-on-surface-variant">Opportunity gaps, win strategy, suggested approach with budget.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">psychology</span>
                        <span className="font-body text-on-surface-variant">Winning-language library mined from your past wins.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">shield</span>
                        <span className="font-body text-on-surface-variant">Suggested team + sanity-check on top matches.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── GETTING STARTED ──────────────────────────────────────────── */}
          <section className="py-32 px-8 md:px-24 bg-surface-container-low">
            <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row gap-24">
              <div className="flex-1">
                <h2 className="font-headline text-5xl mb-8 leading-tight">
                  Getting <br />
                  <span className="font-headline italic">started</span>
                </h2>
                <p className="font-body text-on-surface-variant text-lg leading-relaxed mb-12">
                  No multi-week implementation. The fastest way to evaluate ProposalIQ is to load your repository, scan a real RFP you've already submitted, and compare what the system flags vs what actually happened.
                </p>
              </div>
              <div className="flex-1 space-y-12">
                {[
                  { num: 'I.', h: 'Upload your repository', b: 'Past proposals (won, lost, withdrawn), CVs, rate cards. We parse and tag each one automatically using a two-axis taxonomy; you correct anything that\'s wrong.' },
                  { num: 'II.', h: 'Confirm what you offer', b: 'A quick website scan suggests your service offerings; you trim or add. This becomes the canonical filter for what counts as in-scope when an RFP arrives.' },
                  { num: 'III.', h: 'First scan', b: 'Drop in a real RFP — ideally one you\'ve already submitted. Compare what ProposalIQ would have flagged against what actually happened. The honesty of the answer is the proof.' },
                ].map(step => (
                  <div key={step.num} className="flex gap-8 group">
                    <div className="font-label text-outline-variant group-hover:text-primary transition-colors text-xl">{step.num}</div>
                    <div>
                      <h4 className="font-headline text-2xl mb-2">{step.h}</h4>
                      <p className="font-body text-on-surface-variant">{step.b}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FINAL CTA ────────────────────────────────────────────────── */}
          <section className="py-32 px-8 flex justify-center bg-surface relative overflow-hidden">
            <div className="text-center z-10">
              <h2 className="font-headline text-6xl md:text-7xl tracking-tighter mb-12">
                See it on your <span className="font-headline italic">archive.</span>
              </h2>
              <Link href="/get-access" className="inline-block bg-primary text-on-primary px-16 py-6 text-xl font-bold tracking-tight active:scale-95 duration-200">
                Get your first scan
              </Link>
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-50" />
          </section>
        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="bg-[#0f0e0c] py-12 px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 w-full border-t border-[#4d4636]/20 pt-12 max-w-screen-2xl mx-auto">
            <div className="font-headline text-lg text-primary">ProposalIQ</div>
            <div className="flex flex-wrap justify-center gap-8">
              <a href="#" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest hover:text-primary underline-offset-4 hover:underline transition-all">Privacy Policy</a>
              <a href="#" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest hover:text-primary underline-offset-4 hover:underline transition-all">Terms of Service</a>
              <a href="#" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest hover:text-primary underline-offset-4 hover:underline transition-all">Cookie Policy</a>
            </div>
            <div className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest opacity-80">
              © {new Date().getFullYear()} ProposalIQ. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
