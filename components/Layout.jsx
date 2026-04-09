import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMode } from '../lib/useMode';

const NAV = [
  { href: '/dashboard',  icon: '◈', label: 'Dashboard' },
  { href: '/repository', icon: '⊞', label: 'Repository' },
  { href: '/rfp',        icon: '⊡', label: 'RFP Intelligence' },
  { href: '/team',       icon: '◉', label: 'Team' },
  { href: '/clients',    icon: '◎', label: 'Clients' },
  { href: '/settings',   icon: '⚙', label: 'Settings' },
  { href: '/users',      icon: '⊙', label: 'Users' },
];

const MODE_PAGES = ['/dashboard', '/rfp'];

export default function Layout({ children, title, subtitle, actions, user }) {
  const router = useRouter();
  const { mode, setMode } = useMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const showModeSwitcher = MODE_PAGES.some(p => router.pathname.startsWith(p));

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [router.pathname]);

  // Lock body scroll when menu open on mobile
  useEffect(() => {
    if (menuOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  async function logout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const isActive = (href) => router.pathname === href || router.pathname.startsWith(href + '/');

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── TOP NAVIGATION BAR ────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b" style={{ background: '#0f0e0c', borderColor: 'rgba(255,255,255,.08)', zIndex: 30 }}>

        {/* Main topbar row */}
        <div className="flex items-center h-14 px-4 gap-3">

          {/* Hamburger — mobile only */}
          <button onClick={() => setMenuOpen(true)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/10 no-min-h"
            style={{ color: 'rgba(255,255,255,.6)' }}>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0 no-min-h">
            <div className="w-7 h-7 rounded-md flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
              style={{ background: '#b8962e', color: '#0f0e0c' }}>P</div>
            <span className="font-serif text-base text-white tracking-tight hidden sm:block">ProposalIQ</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 ml-4">
            {NAV.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} prefetch={false}
                  className={`px-3 py-1.5 rounded-md text-[12.5px] transition-all no-min-h ${active ? 'text-amber-300' : 'text-white/45 hover:text-white/80 hover:bg-white/6'}`}
                  style={active ? { background: 'rgba(184,150,46,.2)' } : {}}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Mode switcher — only on relevant pages */}
            {showModeSwitcher && (
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button onClick={() => setMode('quick')}
                  className={`px-3 h-8 text-[11px] font-medium transition-all no-min-h ${mode === 'quick' ? 'text-ink' : 'text-white/45 hover:text-white/70'}`}
                  style={{ background: mode === 'quick' ? '#b8962e' : 'transparent' }}>
                  ⚡ Quick
                </button>
                <button onClick={() => setMode('pro')}
                  className={`px-3 h-8 text-[11px] font-medium transition-all no-min-h ${mode === 'pro' ? 'text-white' : 'text-white/45 hover:text-white/70'}`}
                  style={{ background: mode === 'pro' ? '#1e4a52' : 'transparent' }}>
                  ◈ Pro
                </button>
              </div>
            )}

            {/* AI active dot */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'rgba(255,255,255,.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0" style={{ background: '#b8962e' }} />
              AI
            </div>

            {/* User initials — desktop */}
            <div className="hidden md:flex w-8 h-8 rounded-full items-center justify-center text-[11px] font-semibold text-ink no-min-h"
              style={{ background: '#b8962e' }}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          </div>
        </div>

        {/* Page title row — mobile only */}
        <div className="md:hidden flex items-center justify-between px-4 pb-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
            {subtitle && <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,.4)' }}>{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0 ml-3">{actions}</div>}
        </div>
      </header>

      {/* ── DESKTOP PAGE TITLE (below topbar, above content) ────────────────── */}
      <div className="hidden md:flex items-center gap-4 px-6 h-12 bg-white border-b flex-shrink-0" style={{ borderColor: '#ddd5c4' }}>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-base leading-tight truncate">
            {title}
            {subtitle && <span className="text-sm font-sans italic ml-2" style={{ color: '#6b6456' }}>{subtitle}</span>}
          </h1>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>

      {/* ── CONTENT ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* ── MOBILE MENU DRAWER ───────────────────────────────────────────────── */}
      {menuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)} />
          <div className="mobile-menu-drawer" style={{ background: '#0f0e0c' }}>

            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 safe-top">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md flex items-center justify-center font-serif text-sm font-bold" style={{ background: '#b8962e', color: '#0f0e0c' }}>P</div>
                <div>
                  <div className="font-serif text-white text-base">ProposalIQ</div>
                  <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Intelligence Engine</div>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 no-min-h">
                ✕
              </button>
            </div>

            {/* User card */}
            <div className="mx-4 mt-4 rounded-xl p-3.5" style={{ background: 'rgba(184,150,46,.12)', border: '1px solid rgba(184,150,46,.22)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-ink flex-shrink-0" style={{ background: '#b8962e' }}>
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-white/80 font-medium truncate">{user?.name}</div>
                  <div className="text-xs text-white/40 truncate">{user?.org_name}</div>
                </div>
              </div>
            </div>

            {/* Mode switcher in drawer */}
            {showModeSwitcher && (
              <div className="mx-4 mt-4">
                <div className="text-[10px] font-mono tracking-widest text-white/25 uppercase mb-2">View Mode</div>
                <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.07)' }}>
                  <button onClick={() => setMode('quick')}
                    className={`flex-1 py-3 text-sm font-medium transition-all no-min-h ${mode === 'quick' ? 'text-ink' : 'text-white/40'}`}
                    style={{ background: mode === 'quick' ? '#b8962e' : 'transparent' }}>
                    ⚡ Quick
                  </button>
                  <button onClick={() => setMode('pro')}
                    className={`flex-1 py-3 text-sm font-medium transition-all no-min-h ${mode === 'pro' ? 'text-white' : 'text-white/40'}`}
                    style={{ background: mode === 'pro' ? '#1e4a52' : 'transparent' }}>
                    ◈ Pro
                  </button>
                </div>
              </div>
            )}

            {/* Nav links */}
            <nav className="px-3 mt-4 space-y-0.5">
              <div className="text-[10px] font-mono tracking-widest text-white/20 uppercase px-2 mb-2">Workspace</div>
              {NAV.map(item => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} prefetch={false}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative ${active ? 'text-amber-300' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
                    style={active ? { background: 'rgba(184,150,46,.18)' } : {}}>
                    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r" style={{ background: '#b8962e' }} />}
                    <span className="w-5 text-center opacity-70 text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Sign out */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 safe-bottom">
              <button onClick={logout} disabled={loggingOut}
                className="w-full text-sm text-white/35 hover:text-white/60 text-left px-2 py-2 transition-colors no-min-h">
                {loggingOut ? 'Signing out…' : '→ Sign out'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
