import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState('loading'); // loading | login | setup
  const [form, setForm] = useState({ name: '', email: '', password: '', org_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) { router.replace('/dashboard'); return; }
        // Check if any users exist
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0e0c' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid #b8962e', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <Head><title>ProposalIQ — {mode === 'setup' ? 'Create Workspace' : 'Sign In'}</title></Head>
      <div className="min-h-screen flex" style={{ background: '#0f0e0c', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        {/* Left panel */}
        <div className="hidden lg:flex flex-col justify-between w-96 flex-shrink-0 p-12" style={{ borderRight: '1px solid rgba(255,255,255,.07)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
              <div style={{ width: 36, height: 36, background: '#b8962e', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 18, fontWeight: 'bold', color: '#0f0e0c' }}>P</div>
              <span style={{ fontFamily: 'Georgia,serif', fontSize: 20, color: 'white' }}>ProposalIQ</span>
            </div>
            <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 30, color: 'white', fontWeight: 'normal', lineHeight: 1.2, marginBottom: 16 }}>
              Your institutional knowledge,<br /><span style={{ color: '#d4b458' }}>working for every bid.</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 14, lineHeight: 1.7 }}>
              Cross-reference your entire proposal repository in seconds. Find gaps, match past work, generate suggested approaches and budgets.
            </p>
          </div>
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
            {['Repository intelligence', 'RFP gap analysis', 'Team matching', 'Writing quality scoring'].map(f => (
              <div key={f} style={{ marginBottom: 8 }}>✓ {f}</div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ background: '#1a1917', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, color: 'white', fontWeight: 'normal', marginBottom: 4 }}>
                  {mode === 'setup' ? 'Create your workspace' : 'Sign in to ProposalIQ'}
                </h1>
                <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
                  {mode === 'setup' ? 'Set up your organisation and first account.' : 'Enter your credentials to continue.'}
                </p>
              </div>
              <form onSubmit={submit} style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {mode === 'setup' && (
                  <>
                    <Field label="Organisation Name" value={form.org_name} onChange={v => f('org_name', v)} placeholder="e.g. Acme Consulting" />
                    <Field label="Your Name *" value={form.name} onChange={v => f('name', v)} placeholder="e.g. James Horsman" />
                  </>
                )}
                <Field label="Email *" type="email" value={form.email} onChange={v => f('email', v)} placeholder="you@company.com" />
                <Field label="Password *" type="password" value={form.password} onChange={v => f('password', v)} placeholder={mode === 'setup' ? 'At least 8 characters' : '••••••••'} />
                {error && (
                  <div style={{ background: 'rgba(176,64,48,.15)', border: '1px solid rgba(176,64,48,.3)', borderRadius: 6, padding: '10px 14px', color: '#f87171', fontSize: 13 }}>
                    {error}
                  </div>
                )}
                <button type="submit" disabled={loading}
                  style={{ background: '#b8962e', color: 'white', border: 'none', borderRadius: 6, padding: '11px 0', fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}>
                  {loading ? 'Please wait…' : mode === 'setup' ? 'Create Workspace' : 'Sign In'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontFamily: "'Courier New',monospace", textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={type === 'password' ? 'current-password' : 'on'}
        style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, padding: '10px 12px', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}
