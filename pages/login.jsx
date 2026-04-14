import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState('loading'); // loading | login | setup
  const [form, setForm] = useState({ name: '', email: '', password: '', org_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) { router.replace('/dashboard'); return; }
        fetch('/api/auth/check')
          .then(r => r.json())
          .then(d => setMode(d.hasUsers ? 'login' : 'setup'))
          .catch(() => setMode('login'));
      })
      .catch(() => setMode('login'));
  }, []);

  const f = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

  async function submit(e) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Email and password required'); return; }
    if (mode === 'setup' && !form.name) { setError('Your name is required'); return; }
    if (mode === 'setup' && form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const endpoint = mode === 'setup' ? '/api/auth/register' : '/api/auth/login';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Something went wrong'); return; }
      router.push('/dashboard');
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }

  if (mode === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest">
      <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  const isSetup = mode === 'setup';
  const heading = isSetup ? 'Create Workspace' : 'Sign In';
  const subHeading = isSetup
    ? 'Initialize your organization and first administrator account.'
    : 'Enter your credentials to access the intelligence gateway.';
  const altLinkText = isSetup ? 'Sign in instead' : 'Create a workspace';
  const ctaText = loading ? 'Processing…' : isSetup ? 'Initialize Workspace' : 'Access Gateway';

  return (
    <>
      <Head><title>ProposalIQ — {isSetup ? 'Create Workspace' : 'Sign In'}</title></Head>

      <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary selection:text-on-primary overflow-hidden">
        <div className="flex h-screen w-full">

          {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
          <aside className="hidden lg:flex w-[380px] flex-col justify-between bg-surface-container-lowest p-12 border-r border-outline-variant/10">
            <div className="space-y-12">
              <div>
                <span className="font-headline italic text-3xl text-primary font-medium tracking-tight">ProposalIQ</span>
              </div>
              <div className="space-y-6">
                <h1 className="font-headline text-4xl leading-tight text-on-surface font-light">
                  The art of <span className="text-primary italic">precision</span> in procurement intelligence.
                </h1>
                <p className="text-on-surface-variant text-sm leading-relaxed max-w-[280px]">
                  Harnessing proprietary data and predictive analysis to secure your most critical bid opportunities.
                </p>
              </div>
              <ul className="space-y-6">
                {[
                  { icon: 'analytics', n: '01', label: 'Bespoke Intelligence Engine' },
                  { icon: 'psychology', n: '02', label: 'Predictive Bid Modeling' },
                  { icon: 'architecture', n: '03', label: 'Structural Integrity Audit' },
                ].map(m => (
                  <li key={m.n} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-primary-container text-xl">{m.icon}</span>
                    <div>
                      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-1">Module {m.n}</span>
                      <span className="text-sm font-medium">{m.label}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <footer className="space-y-4">
              <div className="h-px bg-outline-variant/20 w-12" />
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60">
                © {new Date().getFullYear()} ProposalIQ.
              </p>
            </footer>
          </aside>

          {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
          <main className="flex-1 bg-surface flex items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
            {/* Decorative background */}
            <div className="absolute inset-0 opacity-5 pointer-events-none">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
            </div>

            <div className="w-full max-w-md z-10">
              {/* Mobile logo */}
              <div className="lg:hidden mb-12 text-center">
                <Link href="/" className="font-headline italic text-2xl text-primary font-medium tracking-tight">
                  ProposalIQ
                </Link>
              </div>

              {/* Error banner */}
              {error && (
                <div className="mb-8 p-4 bg-error-container/30 border-l-2 border-error flex items-center gap-3">
                  <span className="material-symbols-outlined text-error">warning</span>
                  <p className="text-xs text-on-error-container uppercase tracking-wider font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-10">
                <header>
                  <h2 className="font-headline text-3xl text-on-surface mb-2">{heading}</h2>
                  <p className="text-on-surface-variant text-sm">{subHeading}</p>
                </header>

                <form onSubmit={submit} className="space-y-8">
                  <div className="space-y-6">

                    {/* Setup-only: Org Name + Your Name */}
                    {isSetup && (
                      <>
                        <Field
                          id="org_name"
                          label="Organization Name"
                          placeholder="e.g. Acme Global Systems"
                          value={form.org_name}
                          onChange={v => f('org_name', v)}
                        />
                        <Field
                          id="user_name"
                          label="Your Name"
                          placeholder="Alexander Hamilton"
                          value={form.name}
                          onChange={v => f('name', v)}
                        />
                      </>
                    )}

                    {/* Always: Email + Password */}
                    <Field
                      id="email"
                      type="email"
                      label="Professional Email"
                      placeholder="name@company.com"
                      value={form.email}
                      onChange={v => f('email', v)}
                      autoComplete="email"
                    />
                    <Field
                      id="password"
                      type="password"
                      label="Password"
                      placeholder={isSetup ? 'At least 8 characters' : '••••••••••••'}
                      value={form.password}
                      onChange={v => f('password', v)}
                      autoComplete={isSetup ? 'new-password' : 'current-password'}
                    />
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-primary hover:bg-secondary text-on-primary font-bold py-4 px-8 rounded-none transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.98] font-label text-xs uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {ctaText}
                    </button>
                  </div>
                </form>

                {/* Alt action + footer links */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-outline-variant/10">
                  <div className="flex gap-4">
                    <a href="#" className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">Terms</a>
                    <a href="#" className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">Privacy</a>
                  </div>
                  <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/40">v2.4.0-Stable</span>
                </div>
              </div>
            </div>

            {/* Decorative grid dots */}
            <div className="absolute bottom-12 right-12 opacity-10 pointer-events-none">
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 h-1 ${[0, 5, 10, 15].includes(i) ? 'bg-primary' : 'bg-outline-variant'}`}
                  />
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

function Field({ id, label, type = 'text', placeholder, value, onChange, autoComplete }) {
  return (
    <div className="group relative">
      <label
        htmlFor={id}
        className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant group-focus-within:text-primary transition-colors"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full bg-transparent border-0 border-b border-outline-variant py-3 px-0 text-on-surface placeholder:text-on-surface-variant/30 focus:ring-0 focus:border-primary focus:outline-none transition-all duration-300"
      />
    </div>
  );
}
