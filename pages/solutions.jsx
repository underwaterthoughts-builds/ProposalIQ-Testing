import Head from 'next/head';
import Link from 'next/link';

export default function Solutions() {
  return (
    <>
      <Head>
        <title>Solutions — ProposalIQ</title>
        <meta
          name="description"
          content="Built for the way your team actually bids. Industry-specific logic for consulting, creative, aerospace, SaaS, infrastructure, and private equity."
        />
      </Head>

      <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary selection:text-on-primary">

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <header className="bg-[#141311] fixed top-0 left-0 right-0 z-50">
          <nav className="flex justify-between items-center w-full px-8 py-6 max-w-screen-2xl mx-auto">
            <Link href="/" className="text-2xl font-headline italic text-primary">ProposalIQ</Link>
            <div className="hidden md:flex items-center gap-10 font-headline text-on-surface tracking-tight">
              <Link href="/platform" className="text-on-surface-variant hover:text-primary transition-colors duration-300">Platform</Link>
              <Link href="/solutions" className="text-primary font-bold border-b border-primary pb-1">Solutions</Link>
              <Link href="/how-it-works" className="text-on-surface-variant hover:text-primary transition-colors duration-300">How It Works</Link>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors">Client Portal</Link>
              <Link href="/get-access" className="bg-primary text-on-primary px-5 py-2.5 text-sm font-bold uppercase tracking-wider rounded-none hover:opacity-90 transition-opacity">Get Access</Link>
              <button className="md:hidden text-primary"><span className="material-symbols-outlined">menu</span></button>
            </div>
          </nav>
        </header>

        <main className="pt-24">

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="min-h-[819px] flex flex-col justify-center px-8 max-w-screen-2xl mx-auto mb-32">
            <div className="grid grid-cols-12 gap-8 items-end">
              <div className="col-span-12 lg:col-span-8">
                <span className="font-label text-primary text-sm tracking-[0.3em] uppercase mb-6 block">Industry Specific Logic</span>
                <h1 className="font-headline text-7xl md:text-8xl leading-[1.1] text-on-surface tracking-tight">
                  Built for the way your team <span className="italic text-on-surface-variant">actually</span> bids.
                </h1>
              </div>
              <div className="col-span-12 lg:col-span-4 lg:pb-6">
                <p className="font-body text-xl text-on-surface-variant leading-relaxed border-l border-outline-variant/30 pl-8">
                  Generalist tools fail the nuance of high-stakes proposals. We provide the editorial precision required by firms that don't just participate—they dominate.
                </p>
              </div>
            </div>
            <div className="mt-24 aspect-[21/9] w-full bg-surface-container-lowest overflow-hidden">
              <div
                className="w-full h-full opacity-60 mix-blend-luminosity grayscale contrast-125"
                style={{
                  backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuD5YQlYXKa7XtGDIR0Oa0AqfIMuAgTdDTPWUM8Sn3ZUFVlwcJwe-ZGqqJItDtoqgQW_nB6ZRSQY7hw8Vo2jST3fDsD9NRO9NKgl5CQDXPLX7mW0twvcrwZcO_aJOJPUNFLS4jfPlW4da031akwJXRqvV_1y5j7_3ViFWErOKoXZNJ-uSmOwWvpKBW7WbnUyw-XeHbZ5IotPXVDhkdcr7zMS4gjimG7gK729xgjeeKR-fzCMKcNzAcopNzM-iOP5Gn7Jg__XIJ9IWAM')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            </div>
          </section>

          {/* ── TWO-AXIS TAXONOMY ────────────────────────────────────────── */}
          <section className="bg-surface-container-low py-32 px-8 mb-32">
            <div className="max-w-screen-2xl mx-auto grid grid-cols-12 gap-8">
              <div className="col-span-12 lg:col-span-4">
                <h2 className="font-headline text-4xl text-primary font-bold mb-8">The Two-Axis Taxonomy</h2>
                <p className="font-body text-on-surface-variant mb-6">
                  Most platforms organize by "type." We organize by <strong>Strategic Intent</strong> and <strong>Operational Complexity</strong>.
                </p>
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-[1px] bg-primary" />
                  <span className="font-label text-xs uppercase tracking-widest text-primary">ProposalIQ Methodology</span>
                </div>
              </div>
              <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-px bg-outline-variant/20">
                <div className="bg-surface p-12 flex flex-col justify-between h-80">
                  <span className="font-label text-primary-container text-2xl">01</span>
                  <div>
                    <h3 className="font-headline text-2xl mb-4">Vertical Nuance</h3>
                    <p className="text-sm text-on-surface-variant">Custom data engines built for the specific regulatory and competitive landscape of your industry.</p>
                  </div>
                </div>
                <div className="bg-surface p-12 flex flex-col justify-between h-80">
                  <span className="font-label text-primary-container text-2xl">02</span>
                  <div>
                    <h3 className="font-headline text-2xl mb-4">Bid Dynamics</h3>
                    <p className="text-sm text-on-surface-variant">Adapting interface and intelligence based on whether you are defending a legacy or capturing new territory.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── 01 MANAGEMENT CONSULTING ─────────────────────────────────── */}
          <section className="px-8 max-w-screen-2xl mx-auto mb-48">
            <div className="flex items-baseline gap-4 mb-16">
              <span className="font-label text-xs text-outline tracking-widest">INDUSTRY 01</span>
              <h2 className="font-headline text-5xl md:text-7xl font-bold">Management Consulting</h2>
            </div>
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-12 lg:col-span-5 mb-12">
                <div
                  className="aspect-[4/5] bg-surface-container-lowest"
                  style={{
                    backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBdTA3bwDN2LodERXQi94E_hW7jVvzNIC8rYZj9xeuTHyvhGGql1tPN184SIbqtbtr2A9LhmfXiOEUEU0RnY_ChFPiraeF6cj7__RfE8Tsu5zm11p3-BUEfZLfqWn5T5SsXBGAgHfAgYcrgF5RUriFoLbg7Lkq_Sr3hX5hZ2xHBTUuOq0yLLrb8x7DJ4KOQ87k6SxbynK1csmUAOli7H0TZKnfDR4CDCYCmdyo45nXOYuJyP4l0IuZARukua615V6WbBv7ARS6hksI')",
                    backgroundSize: 'cover',
                  }}
                />
              </div>
              <div className="col-span-12 lg:col-span-7 flex flex-col justify-center">
                <div className="max-w-xl ml-auto">
                  <h3 className="font-headline text-3xl mb-8 italic">Where methodology is the product.</h3>
                  <p className="font-body text-lg text-on-surface-variant leading-relaxed mb-8">
                    In consulting, the bid is the first deliverable. ProposalIQ parses your firm's unique intellectual property to ensure every proposal reflects the deep methodology that sets you apart.
                  </p>
                  <ul className="space-y-6">
                    <li className="flex items-start gap-4">
                      <span className="material-symbols-outlined text-primary mt-1">architecture</span>
                      <div>
                        <h4 className="font-label text-sm uppercase tracking-wider text-on-surface">Framework Integration</h4>
                        <p className="text-sm text-on-surface-variant">Auto-inject proprietary models into technical responses.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-4">
                      <span className="material-symbols-outlined text-primary mt-1">analytics</span>
                      <div>
                        <h4 className="font-label text-sm uppercase tracking-wider text-on-surface">Impact Forecasting</h4>
                        <p className="text-sm text-on-surface-variant">Project-based ROI modeling integrated directly into the pricing module.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* ── 02 CREATIVE & PR ─────────────────────────────────────────── */}
          <section className="bg-surface-container-lowest py-32 px-8 mb-48">
            <div className="max-w-screen-2xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-end mb-24 border-b border-outline-variant/10 pb-12">
                <div>
                  <span className="font-label text-xs text-outline tracking-widest">INDUSTRY 02</span>
                  <h2 className="font-headline text-5xl md:text-7xl font-bold mt-4">Creative &amp; PR</h2>
                </div>
                <p className="font-body text-lg text-on-surface-variant max-w-sm mt-8 md:mt-0">
                  Winning on "The Big Idea" requires a platform that doesn't restrict your vision with rigid templates.
                </p>
              </div>
              <div className="grid grid-cols-12 gap-12">
                <div className="col-span-12 lg:col-span-8 bg-surface-container-high p-1 px-1">
                  <div
                    className="aspect-video bg-surface overflow-hidden"
                    style={{
                      backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAZ2ui5YvJdVMcZ_XkMES2VzhEEoH101CT0c0Z0znhGcRTglNcCm7jEUfxvz35VNZc2F0FDFjrMU5p2_dCUavsc118ZTWQlE5YXpDPqYfXK-87jKcYePLdI9vB8Mh4O1dOsvjWVsGHpqeko2Q4qAbB0RgHr0dzQEz33Gvx5mZJ-Agwa1-9XtHgbOQvj0TZxt5Ax0640sqLwlAGEbVYOiZfj4GMZcLNxhMG_FHzJmwaJpXSLIGNNyg4zshWfANNG6O6bMbzUiuC1iHs')",
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                </div>
                <div className="col-span-12 lg:col-span-4 flex flex-col justify-between">
                  <div className="space-y-12">
                    <div>
                      <h3 className="font-headline text-2xl text-primary mb-4">Narrative Intelligence</h3>
                      <p className="text-on-surface-variant leading-relaxed">AI that understands brand voice. Ensure your tone remains consistent from the pitch deck to the master service agreement.</p>
                    </div>
                    <div>
                      <h3 className="font-headline text-2xl text-primary mb-4">Visual-First Workflow</h3>
                      <p className="text-on-surface-variant leading-relaxed">Integrated asset management that treats images and video with the same metadata precision as text.</p>
                    </div>
                  </div>
                  <button className="w-full mt-12 py-4 border border-outline/30 font-label text-xs uppercase tracking-[0.2em] text-on-surface hover:bg-surface-container-high transition-colors">
                    Explore Creative Cases
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── 03 AEROSPACE & DEFENSE ───────────────────────────────────── */}
          <section className="px-8 max-w-screen-2xl mx-auto mb-48">
            <div className="grid grid-cols-12 gap-12">
              <div className="col-span-12 lg:col-span-4 order-2 lg:order-1">
                <span className="font-label text-xs text-outline tracking-widest">INDUSTRY 03</span>
                <h2 className="font-headline text-5xl font-bold mt-4 mb-8 leading-tight">Aerospace &amp; Defense</h2>
                <p className="font-body text-on-surface-variant mb-12 leading-relaxed">
                  Precision isn't a goal—it's a requirement. In sectors where technical compliance is a pass/fail metric, ProposalIQ provides the ultimate safety net.
                </p>
                <div className="p-8 bg-surface-container-low border-l-4 border-primary">
                  <h4 className="font-label text-xs uppercase tracking-widest text-primary mb-2">Compliance Engine</h4>
                  <p className="text-sm font-headline italic">"99% compliance is a failure. We automate the trace-ability matrix so your engineers can focus on the solution, not the paperwork."</p>
                </div>
              </div>
              <div className="col-span-12 lg:col-span-8 order-1 lg:order-2">
                <div
                  className="aspect-video bg-surface-container-lowest grayscale"
                  style={{
                    backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDfU_G_TnzRvUXNnIASOx0qKStUx2X6Fqsod5Wb0Vp7Oy6smgXAN-x2Xr9FVLdInvEiseIMarns7XY6BBDap-bmac2r-0AodVjrlPjGEOXnX-TW8bqUhAeYJWBk3Ci_6IsEwrFJk-xA-wwcGRsQgOXRQllni80U1kQD6P64w9X_Aby7ioDq8pPHqtj5bTBBS8jjHN-Y9Jzl63crsoXZi8hunl92naDUMRR8svIqnlp08p2Kjeub7qbX9hdOBVpFKfnzBPFfbrNB384')",
                    backgroundSize: 'cover',
                  }}
                />
              </div>
            </div>
          </section>

          {/* ── 04 ENTERPRISE SAAS ───────────────────────────────────────── */}
          <section className="bg-surface py-32 px-8 mb-48">
            <div className="max-w-screen-2xl mx-auto flex flex-col items-center text-center">
              <span className="font-label text-xs text-outline tracking-widest mb-6">INDUSTRY 04</span>
              <h2 className="font-headline text-6xl md:text-8xl font-bold mb-12 max-w-4xl mx-auto">Enterprise SaaS</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-left max-w-5xl">
                {[
                  { icon: 'security', h: 'Security Infusion', b: 'Auto-sync with your Trust Center to answer security questionnaires in seconds, not days.' },
                  { icon: 'hub', h: 'Stack Awareness', b: 'Smart mapping of integrations and API capabilities to buyer tech stacks.' },
                  { icon: 'monitoring', h: 'Value Realization', b: "Dynamic case study injection based on the buyer's industry and pain points." },
                ].map(card => (
                  <div key={card.icon} className="p-10 bg-surface-container-low transition-all hover:bg-surface-container-high group">
                    <span className="material-symbols-outlined text-4xl text-primary/40 group-hover:text-primary transition-colors">{card.icon}</span>
                    <h3 className="font-headline text-xl mt-6 mb-4">{card.h}</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{card.b}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── 05 INFRASTRUCTURE & ENERGY ───────────────────────────────── */}
          <section className="px-8 max-w-screen-2xl mx-auto mb-48 overflow-hidden">
            <div className="grid grid-cols-12 gap-8 items-center">
              <div className="col-span-12 lg:col-span-6 relative">
                <div
                  className="aspect-square bg-surface-container-lowest"
                  style={{
                    backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB6jFOb72TPY3x4aqsVkjjw8EKDULkOz2W8FpauvC3ufUGhTAgbrcF8aTy01WS2E19YOJwQ3PwivDX_fHDjCNsU-znL3utA5zX9613rEKtPCj-DoZKGT3l8VWclrY56lLBP5dxzlOXNGTl8gc1AdCuyqkR1oNFigR5TenGr8S4nj1fK-kOoz7CqrL8gM91UHCZX_s4cmu5uu_UEk59IanHusvzRYf-LbXsQKntWFQ2j_TX62WbeaOBksUysIDDl8MarTklnDcg0nxE')",
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div className="absolute -bottom-8 -right-8 p-12 bg-primary text-on-primary hidden lg:block max-w-xs">
                  <h4 className="font-label text-sm uppercase font-bold mb-4 tracking-tighter">The Scale Factor</h4>
                  <p className="font-body text-sm leading-relaxed">Managing multi-decade project bids requires more than document storage—it requires version control for the future.</p>
                </div>
              </div>
              <div className="col-span-12 lg:col-span-5 lg:offset-1 pl-0 lg:pl-16">
                <span className="font-label text-xs text-outline tracking-widest">INDUSTRY 05</span>
                <h2 className="font-headline text-5xl font-bold mt-4 mb-8">Infrastructure &amp; Energy</h2>
                <p className="font-body text-lg text-on-surface-variant mb-8 leading-relaxed">
                  Scale shouldn't equal friction. ProposalIQ handles the thousands of moving parts in massive infrastructure tenders with the grace of a high-end editorial desk.
                </p>
                <div className="space-y-4">
                  {['Asset Lifecycle Mapping', 'Regulatory Compliance Audit', 'Supply Chain Intelligence'].map(item => (
                    <div key={item} className="flex justify-between border-b border-outline-variant/30 py-4">
                      <span className="font-label text-xs uppercase text-on-surface">{item}</span>
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── 06 PRIVATE EQUITY & M&A ──────────────────────────────────── */}
          <section className="mb-48 px-8">
            <div className="max-w-screen-xl mx-auto bg-surface-container-highest p-16 md:p-24 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-10">
                <span className="material-symbols-outlined text-[200px]" style={{ fontVariationSettings: "'wght' 100" }}>monetization_on</span>
              </div>
              <div className="relative z-10 max-w-2xl">
                <span className="font-label text-xs text-primary tracking-widest mb-6 block">INDUSTRY 06</span>
                <h2 className="font-headline text-5xl font-bold mb-8 text-on-surface">Private Equity &amp; M&amp;A</h2>
                <p className="font-body text-xl text-on-surface-variant mb-12 leading-relaxed">
                  In high-velocity deal-making, the speed of your intelligence determines your leverage. ProposalIQ automates the heavy lifting of due diligence and investment committee reporting.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-label text-xs uppercase tracking-widest text-primary mb-4">Deal Speed</h4>
                    <p className="text-sm text-on-surface-variant">Reduce the time from first data room entry to first-draft investment memo by 70%.</p>
                  </div>
                  <div>
                    <h4 className="font-label text-xs uppercase tracking-widest text-primary mb-4">Value Creation</h4>
                    <p className="text-sm text-on-surface-variant">Identify operational synergies automatically using our cross-portfolio pattern matching.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── FINAL CTA ────────────────────────────────────────────────── */}
          <section className="py-32 px-8 bg-surface-container-lowest text-center">
            <h2 className="font-headline text-4xl md:text-6xl italic mb-12">Ready to move beyond generic?</h2>
            <div className="flex flex-col md:flex-row gap-6 justify-center">
              <Link href="/get-access" className="bg-primary text-on-primary px-12 py-5 font-bold uppercase tracking-widest text-sm hover:scale-[1.02] transition-transform">
                Request a Custom Demo
              </Link>
              <Link href="/platform" className="border border-outline/30 text-on-surface px-12 py-5 font-bold uppercase tracking-widest text-sm hover:bg-surface-container-high transition-colors">
                View Platform Specs
              </Link>
            </div>
          </section>
        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="bg-[#0f0e0c] py-12 px-8 border-t border-[#4d4636]/20">
          <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 w-full">
            <div className="font-headline text-lg text-primary">ProposalIQ</div>
            <div className="flex flex-wrap justify-center gap-8 font-sans text-[10px] text-on-surface-variant uppercase tracking-widest">
              <a href="#" className="hover:text-primary underline underline-offset-4 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary underline underline-offset-4 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-primary underline underline-offset-4 transition-colors">Cookie Policy</a>
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
