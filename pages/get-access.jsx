import Head from 'next/head';
import Link from 'next/link';

const NAV = [
  { href: '/platform', label: 'Platform' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/how-it-works', label: 'How It Works' },
];

const TITLES = {
  'platform': 'Platform',
  'solutions': 'Solutions',
  'how-it-works': 'How It Works',
  'get-access': 'Get Access',
};

const SLUG = 'get-access';

export default function Page() {
  return (
    <>
      <Head><title>{TITLES[SLUG]} — ProposalIQ</title></Head>
      <div style={{ minHeight: '100vh', background: '#0f0e0c', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <header style={{ borderBottom: '1px solid rgba(255,255,255,.07)', position: 'sticky', top: 0, zIndex: 50, background: '#0f0e0c' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 40 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, background: '#b8962e', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 16, fontWeight: 'bold', color: '#0f0e0c' }}>P</div>
              <span style={{ fontFamily: 'Georgia,serif', fontSize: 18, color: 'white' }}>ProposalIQ</span>
            </Link>
            <nav style={{ display: 'flex', gap: 8, flex: 1 }}>
              {NAV.map(n => (
                <Link key={n.href} href={n.href} style={{ color: n.href === '/' + SLUG ? 'white' : 'rgba(255,255,255,.5)', fontSize: 14, textDecoration: 'none', padding: '6px 14px', borderRadius: 6 }}>{n.label}</Link>
              ))}
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Link href="/login" style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, textDecoration: 'none', padding: '7px 16px', border: '1px solid rgba(255,255,255,.15)', borderRadius: 6 }}>Client Portal</Link>
              <Link href="/get-access" style={{ background: '#b8962e', color: 'white', fontSize: 14, textDecoration: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 500 }}>Get Access</Link>
            </div>
          </div>
        </header>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '120px 32px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 48, fontWeight: 'normal', color: 'white', marginBottom: 16 }}>{TITLES[SLUG]}</h1>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 16 }}>This page is coming soon.</p>
          <div style={{ marginTop: 40 }}>
            <Link href="/" style={{ color: '#d4b458', fontSize: 14, textDecoration: 'none' }}>← Back to home</Link>
          </div>
        </div>
      </div>
      <style>{'* { box-sizing: border-box; margin: 0; padding: 0; }'}</style>
    </>
  );
}
