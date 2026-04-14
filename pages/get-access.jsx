import Head from 'next/head';
import Link from 'next/link';

export default function GetAccess() {
  return (
    <>
      <Head>
        <title>Get Access — ProposalIQ</title>
        <meta
          name="description"
          content="Request access to ProposalIQ. An elite circle of bid professionals leveraging proprietary intelligence to dominate high-stakes procurement."
        />
      </Head>

      <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary selection:text-on-primary">

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <header className="bg-[#141311] sticky top-0 z-50">
          <nav className="flex justify-between items-center w-full px-8 py-6 max-w-screen-2xl mx-auto">
            <Link href="/" className="text-2xl font-headline italic text-primary">ProposalIQ</Link>
            <div className="hidden md:flex gap-8 font-headline text-on-surface tracking-tight">
              <Link href="/platform" className="text-on-surface-variant hover:text-primary transition-colors duration-300">Platform</Link>
              <Link href="/solutions" className="text-on-surface-variant hover:text-primary transition-colors duration-300">Solutions</Link>
              <Link href="/how-it-works" className="text-on-surface-variant hover:text-primary transition-colors duration-300">How It Works</Link>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="font-headline text-on-surface-variant hover:text-primary transition-colors duration-300">Client Portal</Link>
              <Link
                href="/get-access"
                className="bg-primary text-on-primary px-5 py-2 font-label uppercase tracking-widest text-xs font-bold border-b-2 border-primary"
              >
                Get Access
              </Link>
            </div>
          </nav>
        </header>

        <main className="min-h-screen pt-16 pb-32">

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="max-w-screen-xl mx-auto px-8 mb-20 text-center">
            <div className="mb-4">
              <span className="font-label text-primary uppercase tracking-[0.3em] text-[10px]">Secure Gateway</span>
            </div>
            <h1 className="font-headline text-5xl md:text-7xl italic leading-tight text-on-surface mb-8">
              Request access to <br />ProposalIQ
            </h1>
            <p className="font-body text-on-surface-variant max-w-2xl mx-auto text-lg leading-relaxed">
              Join bid professionals who use institutional knowledge to win high-stakes procurement. Our intake is selective to maintain system integrity.
            </p>
          </section>

          {/* ── FORM + NEXT STEPS ──────────────────────────────────────── */}
          <div className="max-w-screen-xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">

            {/* Left: form */}
            <div className="lg:col-span-7 bg-surface-container-lowest p-8 md:p-16 relative">
              <div className="absolute inset-0 border border-outline-variant/10 pointer-events-none" />
              <form className="space-y-10" onSubmit={e => e.preventDefault()}>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <Field label="Name" placeholder="Julian Vane" />
                  <Field label="Email" placeholder="j.vane@company.com" type="email" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <Field label="Company" placeholder="Vane Consulting Group" />
                  <Field label="Website" placeholder="https://vane.io" type="url" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <SelectField label="Team Size">
                    <option className="bg-surface-container-highest">1–10 Members</option>
                    <option className="bg-surface-container-highest">11–50 Members</option>
                    <option className="bg-surface-container-highest">51–200 Members</option>
                    <option className="bg-surface-container-highest">200+ Members</option>
                  </SelectField>
                  <Field label="How Heard" placeholder="Industry referral" />
                </div>

                <div className="group">
                  <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 group-focus-within:text-primary transition-colors">
                    Message
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe your bid frequency and specific intelligence needs…"
                    className="w-full bg-transparent border-0 border-b border-outline-variant py-2 text-on-surface focus:border-primary focus:ring-0 focus:outline-none transition-colors resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary text-on-primary py-5 font-label uppercase tracking-[0.2em] text-sm font-bold hover:brightness-110 transition-all"
                >
                  Submit Application
                </button>
              </form>
            </div>

            {/* Right: next steps + editorial image */}
            <aside className="lg:col-span-5 space-y-16 lg:pt-16">
              <div>
                <h3 className="font-headline text-3xl mb-6 text-on-surface">What happens next</h3>
                <p className="font-body text-on-surface-variant leading-relaxed mb-8">
                  Our vetting process ensures that every participant in the ProposalIQ ecosystem brings value and maintains the high standard of bid integrity we require.
                </p>
                <div className="space-y-8">
                  {[
                    { n: '01', label: 'Curation Phase', body: "Our analysts review your firm's profile and bidding history within 24 business hours." },
                    { n: '02', label: 'Intelligence Briefing', body: 'Accepted applicants receive a personalised briefing on the ProposalIQ capabilities.' },
                    { n: '03', label: 'Provisioning', body: 'Access keys are generated for your secure dedicated bid instance.' },
                  ].map(step => (
                    <div key={step.n} className="flex gap-6">
                      <div className="flex-none w-10 h-10 border border-primary/20 flex items-center justify-center font-label text-primary text-sm">
                        {step.n}
                      </div>
                      <div>
                        <h4 className="font-label text-[11px] uppercase tracking-widest text-primary mb-1">{step.label}</h4>
                        <p className="text-on-surface-variant text-sm leading-relaxed">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Editorial image anchor */}
              <div className="aspect-[4/5] bg-surface-container-low overflow-hidden relative group">
                <img
                  alt="Executive reviewing digital documents"
                  className="w-full h-full object-cover grayscale opacity-40 group-hover:opacity-60 transition-opacity duration-700"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDa5YvWOHSKJatUOh7vyHb_q5ux-ewkqRJjrceeBbW7VSmaBq7puwUKFPlgRmlejbS1eVYa-ZKoJSbn9cWF493cBtOpEDGMye7CsxJWNxVX2ArldMgzEau_tYR3vI_0WDlKGjAvz7kP6FeNk9xbO_R-GQo0D5-wAChojnkbqd6OP3_3W9SEyncIMyIaablpb8sfZLFFV7BpzWrw7dSd9mmHTc_S3vQFFcAAcbjq4jIpG_hW8IL3V2WxyRUpm7oflbAJNL-yfGmvhBY"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent opacity-80" />
                <div className="absolute bottom-8 left-8 right-8">
                  <p className="font-headline italic text-lg text-primary">
                    "The ultimate advantage in complex procurement is not just data, but informed foresight."
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="bg-[#0f0e0c] py-12 px-8 border-t border-[#4d4636]/20">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 w-full max-w-screen-2xl mx-auto">
            <div className="font-headline text-lg text-primary">ProposalIQ</div>
            <div className="flex gap-8 font-sans text-[10px] text-on-surface-variant uppercase tracking-widest">
              <a href="#" className="hover:text-primary underline underline-offset-4 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary underline underline-offset-4 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-primary underline underline-offset-4 transition-colors">Cookie Policy</a>
            </div>
            <div className="font-sans text-[10px] text-on-surface-variant uppercase tracking-widest">
              © {new Date().getFullYear()} ProposalIQ. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

function Field({ label, placeholder, type = 'text' }) {
  return (
    <div className="group">
      <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 group-focus-within:text-primary transition-colors">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full bg-transparent border-0 border-b border-outline-variant py-2 text-on-surface focus:border-primary focus:ring-0 focus:outline-none transition-colors placeholder:text-outline"
      />
    </div>
  );
}

function SelectField({ label, children }) {
  return (
    <div className="group">
      <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 group-focus-within:text-primary transition-colors">
        {label}
      </label>
      <select
        className="w-full bg-transparent border-0 border-b border-outline-variant py-2 text-on-surface focus:border-primary focus:ring-0 focus:outline-none transition-colors appearance-none cursor-pointer"
      >
        {children}
      </select>
    </div>
  );
}
