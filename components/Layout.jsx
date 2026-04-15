import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMode } from '../lib/useMode';

// Primary nav (shown in topbar on desktop)
const NAV = [
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/repository', label: 'Repository' },
  { href: '/rfp',        label: 'Intelligence' },
  { href: '/team',       label: 'Team' },
  { href: '/clients',    label: 'Clients' },
  { href: '/settings',   label: 'Settings' },
  { href: '/users',      label: 'Users' },
];

// Secondary nav (mobile drawer only)
const SECONDARY_NAV = [
  { href: '/onboarding/profile', label: 'Organisation Profile' },
];

// Pages that expose the Quick / Pro mode toggle in the topbar
const LENS_PAGES = ['/dashboard', '/rfp'];

export default function Layout({ children, title, subtitle, actions, user }) {
  const router = useRouter();
  const { mode, setMode } = useMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [router.pathname]);

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

  async function endImpersonation() {
    try {
      await fetch('/api/admin/end-impersonation', { method: 'POST' });
    } catch {}
    window.location.href = '/admin';
  }

  const isActive = (href) => router.pathname === href || router.pathname.startsWith(href + '/');

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body">

      {/* ── IMPERSONATION BANNER ────────────────────────────────────────── */}
      {/* Fixed top stripe at z-[60] (above the header). Header's top
          offset and main's padding-top are bumped down by ~32px when
          this is showing so nothing overlaps. */}
      {user?._impersonator && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-error text-on-error-container px-4 py-1.5 flex items-center justify-center gap-3 text-xs font-label uppercase tracking-widest" style={{ height: 32 }}>
          <span className="material-symbols-outlined text-base">visibility</span>
          <span>Viewing as <strong>{user.name}</strong> · signed in as <strong>{user._impersonator.name}</strong></span>
          <button onClick={endImpersonation} className="ml-2 underline hover:no-underline font-bold">End view-as</button>
        </div>
      )}

      {/* ── TOP NAV ──────────────────────────────────────────────────────── */}
      <header className="fixed left-0 right-0 z-50 bg-[#141311] border-b border-outline-variant/10" style={{ top: user?._impersonator ? 32 : 0 }}>
        <div className="flex justify-between items-center w-full px-4 md:px-8 py-3">
          {/* Left: hamburger (mobile) + logo + nav */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden text-on-surface-variant p-2 hover:bg-surface-container-high rounded-sm transition-all"
              aria-label="Open menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <Link href="/dashboard" className="text-xl font-headline font-bold tracking-tighter text-primary">
              ProposalIQ
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              {[
                ...NAV,
                // Admin link only for actual admins (impersonator role wins
                // over impersonated role for nav visibility, so admins
                // viewing-as a member still see it).
                ...((user?._impersonator?.role === 'admin' || user?.role === 'admin') ? [{ href: '/admin', label: 'Admin' }] : []),
              ].map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`font-headline tracking-tight leading-tight pb-1 transition-colors ${
                      active
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: mode toggle + utility + CTA + avatar */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Quick / Pro mode toggle — only on Dashboard + RFP pages */}
            {LENS_PAGES.some(p => router.pathname.startsWith(p)) && (
              <div className="hidden sm:flex items-center gap-1">
                <button
                  onClick={() => setMode('quick')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-label uppercase tracking-widest transition-colors ${
                    mode === 'quick'
                      ? 'bg-surface-container-high text-primary font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Quick lens — fast decision brief"
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                  Quick
                </button>
                <button
                  onClick={() => setMode('pro')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-label uppercase tracking-widest transition-colors ${
                    mode === 'pro'
                      ? 'bg-surface-container-high text-primary font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Pro lens — full strategic workspace"
                >
                  <span className="material-symbols-outlined text-sm">psychology</span>
                  Pro
                </button>
              </div>
            )}
            <div className="hidden sm:flex gap-1">
              <button className="p-2 hover:bg-surface-container-high rounded-sm transition-all" aria-label="Search">
                <span className="material-symbols-outlined text-on-surface-variant">search</span>
              </button>
              <button className="p-2 hover:bg-surface-container-high rounded-sm transition-all" aria-label="Notifications">
                <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
              </button>
            </div>
            <Link
              href="/rfp"
              className="hidden sm:inline-block bg-primary text-on-primary px-4 py-1.5 rounded-sm font-bold text-sm tracking-tight hover:scale-95 transition-transform"
            >
              New Analysis
            </Link>
            <button
              onClick={logout}
              disabled={loggingOut}
              className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-sm hover:bg-surface-container-highest transition-colors"
              aria-label="Sign out"
              title={loggingOut ? 'Signing out…' : `Sign out (${user?.name || ''})`}
            >
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </button>
          </div>
        </div>

        {/* Page title row (mobile only) */}
        {(title || subtitle || actions) && (
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-t border-outline-variant/10">
            <div className="min-w-0">
              {title && <h1 className="text-sm font-bold text-on-surface truncate">{title}</h1>}
              {subtitle && <p className="text-[11px] text-on-surface-variant truncate">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-shrink-0 ml-3">{actions}</div>}
          </div>
        )}
      </header>

      {/* ── CONTENT ──────────────────────────────────────────────────────── */}
      <main className="min-h-screen" style={{ paddingTop: user?._impersonator ? 88 : 56 }}>
        {children}
      </main>

      {/* ── MOBILE DRAWER ───────────────────────────────────────────────── */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-0 left-0 bottom-0 w-72 bg-surface-container-lowest z-[51] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-2.5">
                <span className="font-headline font-bold text-xl text-primary tracking-tighter">ProposalIQ</span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* User card */}
            {user && (
              <div className="mx-4 mt-4 rounded p-3.5 bg-primary-container/10 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-sm">
                    {user.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-on-surface font-medium truncate">{user.name}</div>
                    <div className="text-xs text-on-surface-variant truncate">{user.org_name}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Nav */}
            <nav className="px-3 mt-4 space-y-0.5">
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 px-2 mb-2">Workspace</div>
              {[...NAV, ...SECONDARY_NAV].map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`block px-3 py-2.5 rounded text-sm transition-all ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="px-3 mt-6">
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 px-2 mb-2">Mode</div>
              <div className="flex rounded overflow-hidden bg-surface">
                <button
                  onClick={() => setMode('quick')}
                  className={`flex-1 py-3 text-sm font-medium transition-all ${
                    mode === 'quick' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                  }`}
                >
                  Quick
                </button>
                <button
                  onClick={() => setMode('pro')}
                  className={`flex-1 py-3 text-sm font-medium transition-all ${
                    mode === 'pro' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'
                  }`}
                >
                  Pro
                </button>
              </div>
            </div>

            {/* Sign out */}
            <div className="px-3 mt-8 mb-4">
              <button
                onClick={logout}
                disabled={loggingOut}
                className="w-full text-sm text-on-surface-variant hover:text-on-surface text-left px-3 py-2 transition-colors"
              >
                {loggingOut ? 'Signing out…' : '→ Sign out'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
