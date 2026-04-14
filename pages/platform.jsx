import Head from 'next/head';
import Link from 'next/link';

export default function Platform() {
  return (
    <>
      <Head>
        <title>Platform — ProposalIQ</title>
        <meta
          name="description"
          content="The intelligence engine behind better bids. ProposalIQ is not a template library — it is a high-fidelity reasoning layer for strategic proposal work."
        />
      </Head>

      <div className="min-h-screen bg-surface text-on-surface font-body">

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <nav className="bg-[#141311] fixed top-0 left-0 right-0 z-50">
          <div className="flex justify-between items-center w-full px-8 py-6 max-w-screen-2xl mx-auto">
            <Link href="/" className="text-2xl font-headline italic text-primary">ProposalIQ</Link>
            <div className="hidden md:flex items-center gap-10">
              <Link href="/platform" className="font-headline text-primary tracking-tight font-bold border-b border-primary pb-1">Platform</Link>
              <Link href="/solutions" className="font-headline text-on-surface-variant tracking-tight hover:text-primary transition-colors duration-300">Solutions</Link>
              <Link href="/how-it-works" className="font-headline text-on-surface-variant tracking-tight hover:text-primary transition-colors duration-300">How It Works</Link>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="hidden md:block font-label text-xs uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">Client Portal</Link>
              <Link href="/get-access" className="bg-primary text-on-primary px-6 py-2 text-sm font-bold scale-95 duration-200 hover:opacity-90">Get Access</Link>
              <button className="md:hidden text-primary"><span className="material-symbols-outlined">menu</span></button>
            </div>
          </div>
        </nav>

        <main className="pt-24">

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="relative min-h-[819px] flex flex-col justify-center px-8 max-w-screen-2xl mx-auto py-24">
            <div className="max-w-4xl">
              <span className="font-label text-primary tracking-[0.2em] text-xs uppercase mb-6 block">Foundation / Infrastructure</span>
              <h1 className="font-headline text-7xl md:text-8xl leading-[1.1] text-on-surface mb-12 tracking-tight">
                The intelligence engine behind better bids
              </h1>
              <div className="flex flex-col md:flex-row gap-12 items-start">
                <p className="text-lg md:text-xl text-on-surface-variant max-w-xl leading-relaxed">
                  ProposalIQ is not a template library. It is a high-fidelity reasoning layer designed to ingest complex procurement data and output strategic clarity.
                </p>
                <div className="pt-2">
                  <div className="w-16 h-[1px] bg-primary mb-4" />
                  <p className="font-label text-[10px] text-outline uppercase tracking-widest">System Status: Active<br />Latency: 42ms</p>
                </div>
              </div>
            </div>
            <div className="absolute right-8 bottom-0 hidden lg:block w-1/3 aspect-[3/4] opacity-40 mix-blend-luminosity">
              <img
                alt="Abstract digital architecture"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCWIhv-TdMpwtQ5JpTbeHkW0rFckKusvVzL-nRVQCJhMFXl5W6WDtpviUD2vbXQHrLcrSFo5j-qza8bPithITJrmrLWtqQTpqkh7IoMwyqe6CUbFAUlYknGj7zK7dDbBjQJ52ImPMaYUjUgzUO-PL2ir_bUL4TaGrR0QPmpVhOsjNL-PY3BioI-W6Uv0uKSxOeR4TMBuaAcjhCDo9_YMBFjtD0oCoHwNXJ1rltKpQNYaW2V1mUJhl24XWYi04KAX1GJK32Cv_gMjDQ"
              />
            </div>
          </section>

          {/* ── TWO MODES ────────────────────────────────────────────────── */}
          <section className="bg-surface-container-low py-32 px-8">
            <div className="max-w-screen-2xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-16">
              <div className="md:col-span-4">
                <h2 className="font-headline text-4xl text-on-surface leading-tight">Operating with dual-mode precision.</h2>
                <p className="mt-8 text-on-surface-variant font-body">Efficiency is a matter of selection. Our platform adapts to the velocity of the opportunity.</p>
              </div>
              <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-px bg-outline-variant/20">
                <div className="bg-surface p-12 hover:bg-surface-container-high transition-colors group">
                  <div className="font-label text-xs text-primary mb-12 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    Quick Mode
                  </div>
                  <h3 className="font-headline text-3xl mb-6">Velocity Intelligence</h3>
                  <p className="text-on-surface-variant leading-relaxed mb-12">Designed for rapid-response RFPs where speed is the primary constraint. Extracts core requirements and generates compliant drafts in minutes using your established evidence base.</p>
                  <div className="w-0 group-hover:w-full h-1 bg-primary transition-all duration-500" />
                </div>
                <div className="bg-surface p-12 hover:bg-surface-container-high transition-colors group">
                  <div className="font-label text-xs text-primary mb-12 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
                    Pro Mode
                  </div>
                  <h3 className="font-headline text-3xl mb-6">Strategic Architecture</h3>
                  <p className="text-on-surface-variant leading-relaxed mb-12">For high-stakes, multi-million dollar pursuits. Orchestrates deep competitive analysis, thematic consistency checks, and multi-layered executive summary reasoning.</p>
                  <div className="w-0 group-hover:w-full h-1 bg-primary transition-all duration-500" />
                </div>
              </div>
            </div>
          </section>

          {/* ── INTELLIGENCE PIPELINE ────────────────────────────────────── */}
          <section className="py-32 px-8 max-w-screen-2xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-baseline mb-24 gap-8">
              <h2 className="font-headline text-5xl md:text-6xl max-w-2xl">The Intelligence Pipeline</h2>
              <span className="font-label text-sm text-outline tracking-widest">9-STEP ANALYTIC FRAMEWORK</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { n: '01', phase: 'Understanding', bg: 'bg-surface-container-lowest', items: [['01', 'Taxonomy Extraction'], ['02', 'Constraint Mapping']] },
                { n: '02', phase: 'Matching', bg: 'bg-surface-container-low', items: [['03', 'Evidence Synthesis'], ['04', 'Expert Locator']] },
                { n: '03', phase: 'Analysis', bg: 'bg-surface-container-high', items: [['05', 'Gap Identification'], ['06', 'Ghosting Strategy'], ['07', 'Compliance Validation']] },
                { n: '04', phase: 'Strategy', bg: 'bg-surface-container-highest', items: [['08', 'Value Propositioning'], ['09', 'Thematic Overlay']] },
              ].map(phase => (
                <div key={phase.n} className={`${phase.bg} p-8 border-l border-primary/20`}>
                  <p className="font-label text-[10px] text-primary uppercase mb-12">{phase.n} / {phase.phase}</p>
                  <ul className="space-y-6">
                    {phase.items.map(([num, label]) => (
                      <li key={num} className="flex gap-4 items-start">
                        <span className="font-label text-primary text-xs">{num}</span>
                        <span className="text-sm font-body">{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ── WHAT MAKES IT DIFFERENT ──────────────────────────────────── */}
          <section className="py-32 px-8 bg-[#0f0e0c]">
            <div className="max-w-screen-2xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-16">
                <div className="md:col-span-5">
                  <div className="sticky top-32">
                    <h2 className="font-headline text-5xl mb-8">Built for Sovereignty</h2>
                    <p className="text-on-surface-variant text-lg leading-relaxed mb-12">We believe your competitive advantage should be your own. Our architectural choices prioritize your data integrity and strategic independence.</p>
                    <div className="p-8 bg-surface-container-high">
                      <span className="material-symbols-outlined text-primary text-4xl mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                      <h4 className="font-headline text-xl mb-2">Zero-Leakage Guarantee</h4>
                      <p className="text-xs text-on-surface-variant font-label uppercase tracking-widest">Your data never trains public models.</p>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-7 space-y-px bg-outline-variant/10">
                  {[
                    { l: 'A', h: 'Your data, exclusively.', b: 'Unlike generic AI, ProposalIQ only reasons over your proprietary evidence base. We eliminate hallucinations by tethering every claim to your documented history.' },
                    { l: 'B', h: 'Evidence not invention.', b: 'The system requires "ground truth" for every statement. If you haven\'t done it, we don\'t claim it. This creates defensible, audit-ready bid responses.' },
                    { l: 'C', h: 'Decision support.', b: 'We don\'t just write; we evaluate. The platform provides a "Probability of Win" score based on alignment with RFP scoring criteria before you even start drafting.' },
                    { l: 'D', h: 'Self-hosted option.', b: 'For government and high-security contractors, we offer private-cloud and on-premise deployments that never touch the public internet.' },
                  ].map(d => (
                    <div key={d.l} className="bg-surface p-12">
                      <div className="flex gap-8">
                        <span className="font-label text-primary pt-1">{d.l}</span>
                        <div>
                          <h3 className="font-headline text-2xl mb-4">{d.h}</h3>
                          <p className="text-on-surface-variant">{d.b}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── FINAL CTA ────────────────────────────────────────────────── */}
          <section className="py-48 px-8 text-center bg-surface relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <img
                alt="Texture detail"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCfuGBDN_Hx8jTCVkrXAaG9_3Fj9k4YnMDyJuqDti_zooAgL_IUBpY5egS9jmyIArUa-qrIqn5d9XIgcLiyYIvfs0WMa2GHugdgtXqa2Exo8CbBIVHjZM0dhWjAO47qNQYu5Bz4oWMmzrbSkFHAlVE3iaYZlP0eEjEmNMPKb6Rmu_TVZczjdxLXkZNUOuPyaHN7NHYs3z-PTt-10d1ExIyR6VSxMhTuLAvTlU3CJOvQtzUquy2So31M_yvw8sE95yf1WdQEAIn5Myw"
              />
            </div>
            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="font-headline text-6xl mb-12">Secure your advantage.</h2>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link href="/get-access" className="bg-primary text-on-primary px-10 py-4 font-bold text-lg hover:bg-primary/90 transition-all">Request Access</Link>
                <Link href="/solutions" className="border border-outline/30 px-10 py-4 font-body text-on-surface hover:bg-surface-container-high transition-all">View Case Studies</Link>
              </div>
            </div>
          </section>
        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="bg-[#0f0e0c] py-12 px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 w-full border-t border-[#4d4636]/20 pt-12 max-w-screen-2xl mx-auto">
            <div className="font-headline text-lg text-primary">ProposalIQ</div>
            <div className="flex flex-wrap justify-center gap-8">
              <a href="#" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest opacity-80 hover:opacity-100 hover:underline underline-offset-4 transition-opacity">Privacy Policy</a>
              <a href="#" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest opacity-80 hover:opacity-100 hover:underline underline-offset-4 transition-opacity">Terms of Service</a>
              <a href="#" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest opacity-80 hover:opacity-100 hover:underline underline-offset-4 transition-opacity">Cookie Policy</a>
            </div>
            <p className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest">© {new Date().getFullYear()} ProposalIQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
