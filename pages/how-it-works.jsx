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
              <span className="font-label text-primary text-xs uppercase tracking-[0.3em] mb-6 block">The ProposalIQ Protocol</span>
              <h1 className="font-headline text-6xl md:text-8xl font-light tracking-tighter leading-none mb-8">
                From RFP to recommendation in <span className="font-headline italic text-primary">60 seconds.</span>
              </h1>
              <p className="font-body text-xl text-on-surface-variant max-w-2xl leading-relaxed mb-12">
                ProposalIQ is not a template engine. It is a strategic intelligence layer that dissects complex procurement requirements and synthesizes winning responses with the precision of a master architect.
              </p>
              <div className="flex gap-4">
                <Link href="/get-access" className="bg-primary text-on-primary px-10 py-4 font-bold tracking-tight text-lg active:scale-95 duration-200">Initiate Protocol</Link>
              </div>
            </div>
            <div className="absolute right-[-10%] top-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-outline-variant/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          </section>

          {/* ── VERTICAL NARRATIVE JOURNEY ────────────────────────────────── */}
          <section className="py-32 px-8 md:px-24 bg-surface-container-lowest">
            <div className="max-w-screen-xl mx-auto">
              <div className="grid grid-cols-12 gap-12 mb-24">
                <div className="col-span-12 md:col-span-5">
                  <h2 className="font-headline text-4xl md:text-5xl font-medium tracking-tight">The Ten-Step Descent</h2>
                  <p className="font-body text-on-surface-variant mt-6 text-lg leading-relaxed">
                    A linear sequence of ProposalIQ intelligence, transforming raw data into high-stakes strategic assets. No friction, only momentum.
                  </p>
                </div>
              </div>

              <div className="relative space-y-32">
                {/* Progress line */}
                <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[1px] bg-outline-variant/30 hidden md:block" />

                {/* Step 1 — Ingestion */}
                <div className="relative grid grid-cols-12 gap-8 items-center">
                  <div className="col-span-12 md:col-span-5 md:text-right">
                    <span className="font-label text-primary-container text-sm">01. INGESTION</span>
                    <h3 className="font-headline text-3xl mt-2">Document Sovereignty</h3>
                    <p className="font-body text-on-surface-variant mt-4">Upload your RFP. Our system creates a secure, air-gapped environment for your proprietary data.</p>
                  </div>
                  <div className="hidden md:flex col-span-2 justify-center z-10">
                    <div className="w-10 h-10 bg-surface-container-highest border border-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-sm">upload_file</span>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-5">
                    <div className="bg-surface-container-high aspect-video overflow-hidden">
                      <img
                        alt="Data upload to secure cloud infrastructure"
                        className="w-full h-full object-cover opacity-60"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAbTQqLxhbje2aG2xA8U9DECKgio5BMlpIHILEHkzi5N68uyNzt1pE5xld2lFP4OiGOPGBqQ_g_G0y9VuujeO9M233kMeGYxBDaesFaT4MDmdIwkGHAhVVB0cfbCgG-A0AaRxauVToW9G2wUrqo7AV6BTvWZsjrTx0GY41gY1V20PDvHhsdnFaZTwf8fIDSinEpfsId8DEVzOb9O68anb1Aa9wrJorb3dLprPJhc8-wztOq0iUGYUiwcbQPyP47b653R6OZPeYqAyw"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 2 — Dissection */}
                <div className="relative grid grid-cols-12 gap-8 items-center">
                  <div className="col-span-12 md:col-span-5 order-2 md:order-1">
                    <div className="bg-surface-container-high aspect-video overflow-hidden">
                      <img
                        alt="Data extraction and mapping visualization"
                        className="w-full h-full object-cover opacity-60"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5KHV193ec6T1E1ouPWMuQWyCz2TdgGep_wRaT7JXrcPlLuec2Poim7ZXP547C4koCjQ1Ush0kOntfvMejCtb9VgA5HNDWBySrELq_6iPqVrkMln3WScdvlEVEZKlDWQAjmP4Is6g6T_HQqpM0NVaQZ1GAUVFhRIlggFmOPMdZTe0NLVP7ChWpNPeQSezRjcrXaxAcfa8FGXZ-oSTIDCNC7_L0CaladP4xLabWU_H9iRmjtU2qeFHYI3WKQSTfsruLA_VBVCp2cmQ"
                      />
                    </div>
                  </div>
                  <div className="hidden md:flex col-span-2 justify-center z-10 order-1 md:order-2">
                    <div className="w-10 h-10 bg-surface-container-highest border border-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-sm">analytics</span>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-5 order-3">
                    <span className="font-label text-primary-container text-sm">02. DISSECTION</span>
                    <h3 className="font-headline text-3xl mt-2">Core Requirement Mapping</h3>
                    <p className="font-body text-on-surface-variant mt-4">ProposalIQ extracts 200+ data points, identifying hidden constraints and mandatory compliance nodes.</p>
                  </div>
                </div>

                {/* Steps 3-9 summary */}
                <div className="col-span-12 flex justify-center py-12">
                  <div className="text-center max-w-lg">
                    <span className="material-symbols-outlined text-primary-container text-4xl mb-6">more_vert</span>
                    <p className="font-body text-on-surface-variant italic">The journey continues through Semantic Alignment, Competitive Benchmarking, Resource Optimization, and more...</p>
                  </div>
                </div>

                {/* Step 10 — Manifestation */}
                <div className="relative grid grid-cols-12 gap-8 items-center">
                  <div className="col-span-12 md:col-span-5 md:text-right">
                    <span className="font-label text-primary-container text-sm">10. MANIFESTATION</span>
                    <h3 className="font-headline text-3xl mt-2">The ProposalIQ Draft</h3>
                    <p className="font-body text-on-surface-variant mt-4">Receive a comprehensive, formatted, and ready-to-submit proposal that exceeds every stated requirement.</p>
                  </div>
                  <div className="hidden md:flex col-span-2 justify-center z-10">
                    <div className="w-12 h-12 bg-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-primary">auto_awesome</span>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-5">
                    <div className="bg-surface-container-high p-8 flex flex-col items-center justify-center border border-primary/20">
                      <span className="material-symbols-outlined text-primary text-5xl mb-4">description</span>
                      <div className="w-full h-2 bg-primary/10 rounded-full overflow-hidden">
                        <div className="w-full h-full bg-primary" />
                      </div>
                      <span className="font-label text-xs mt-4 uppercase tracking-widest">Protocol 100% Complete</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── TWO WAYS TO USE IT ───────────────────────────────────────── */}
          <section className="py-32 px-8 md:px-24 bg-surface">
            <div className="max-w-screen-xl mx-auto">
              <div className="text-center mb-24">
                <h2 className="font-headline text-5xl mb-6">Choose Your Velocity</h2>
                <p className="font-body text-on-surface-variant max-w-xl mx-auto">Two distinct operating modes designed for different scales of ambition.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {/* Quick Mode */}
                <div className="bg-surface-container-low p-16 flex flex-col justify-between group hover:bg-surface-container-high transition-all duration-500">
                  <div>
                    <span className="font-label text-on-surface-variant/60 text-xs tracking-[0.2em] uppercase">Mode Alpha</span>
                    <h3 className="font-headline text-4xl mt-8 mb-6">ProposalIQ Quick</h3>
                    <ul className="space-y-6 mb-12">
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                        <span className="font-body text-on-surface-variant">Instant response generation from minimal inputs.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                        <span className="font-body text-on-surface-variant">Standardized compliance checking.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">timer</span>
                        <span className="font-body text-on-surface-variant">Best for turnarounds under 24 hours.</span>
                      </li>
                    </ul>
                  </div>
                  <button className="border border-outline/30 text-on-surface py-4 font-bold tracking-tight hover:border-primary hover:text-primary transition-all">Explore Alpha</button>
                </div>

                {/* Pro Mode */}
                <div className="bg-surface-container-lowest p-16 flex flex-col justify-between border-l border-outline-variant/10 group hover:bg-surface-container-low transition-all duration-500">
                  <div>
                    <span className="font-label text-primary text-xs tracking-[0.2em] uppercase">Mode Omega</span>
                    <h3 className="font-headline text-4xl mt-8 mb-6">ProposalIQ Pro</h3>
                    <ul className="space-y-6 mb-12">
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">architecture</span>
                        <span className="font-body text-on-surface-variant">Custom multi-stage strategic modeling.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">psychology</span>
                        <span className="font-body text-on-surface-variant">Deep knowledge-base integration.</span>
                      </li>
                      <li className="flex items-start gap-4">
                        <span className="material-symbols-outlined text-primary text-xl">shield</span>
                        <span className="font-body text-on-surface-variant">Advanced security and administrative controls.</span>
                      </li>
                    </ul>
                  </div>
                  <button className="bg-primary text-on-primary py-4 font-bold tracking-tight hover:opacity-90 transition-all">Commission Omega</button>
                </div>
              </div>
            </div>
          </section>

          {/* ── GETTING STARTED ──────────────────────────────────────────── */}
          <section className="py-32 px-8 md:px-24 bg-surface-container-low">
            <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row gap-24">
              <div className="flex-1">
                <h2 className="font-headline text-5xl mb-8 leading-tight">
                  The Onboarding <br />
                  <span className="font-headline italic">Constitution</span>
                </h2>
                <p className="font-body text-on-surface-variant text-lg leading-relaxed mb-12">
                  We do not simply provide software; we provide a partnership in excellence. Transitioning your bid operations to ProposalIQ is a measured, high-touch process.
                </p>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <span className="font-headline text-3xl text-primary">0%</span>
                    <p className="font-label text-[10px] uppercase tracking-widest">Transition Friction</p>
                  </div>
                  <div className="space-y-2">
                    <span className="font-headline text-3xl text-primary">24h</span>
                    <p className="font-label text-[10px] uppercase tracking-widest">Setup Latency</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-12">
                {[
                  { num: 'I.', h: 'Technical Alignment', b: 'A session with our architects to map your current workflows and secure document silos.' },
                  { num: 'II.', h: 'Knowledge Harvest', b: 'Importing your successful past bids to train the intelligence on your specific voice and expertise.' },
                  { num: 'III.', h: 'Pilot Execution', b: 'Running your first RFP through the protocol with a dedicated strategist overseeing the output.' },
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
                Command your <span className="font-headline italic">destiny.</span>
              </h2>
              <Link href="/get-access" className="inline-block bg-primary text-on-primary px-16 py-6 text-xl font-bold tracking-tight active:scale-95 duration-200">
                Request Access to ProposalIQ
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
