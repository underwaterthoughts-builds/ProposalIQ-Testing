import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMode } from '../lib/useMode';

const NAV = [
  { href: '/dashboard', icon: '◈', label: 'Home' },
  { href: '/repository', icon: '⊞', label: 'Repository' },
  { href: '/rfp', icon: '⊡', label: 'Intelligence' },
  { href: '/team', icon: '◉', label: 'Team' },
  { href: '/settings', icon: '⚙', label: 'Settings' },
];

export default function BottomNav() {
  const router = useRouter();
  const { mode, setMode } = useMode();
  const showModeSwitcher = router.pathname.startsWith('/rfp') || router.pathname.startsWith('/dashboard');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t bottom-nav-safe md:hidden"
      style={{ borderColor: '#e8e0d0' }}>
      {/* Quick/Pro toggle strip — only on relevant pages */}
      {showModeSwitcher && (
        <div className="flex border-b" style={{ borderColor: '#f0ebe0' }}>
          {[['quick', '⚡', 'Quick'], ['pro', '◈', 'Pro']].map(([m, icon, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all"
              style={{
                background: mode === m ? (m === 'quick' ? '#b8962e' : '#1e4a52') : 'transparent',
                color: mode === m ? 'white' : '#9b8e80',
              }}>
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      {/* Main tab bar */}
      <div className="flex">
        {NAV.map(item => {
          const active = router.pathname === item.href || router.pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 transition-all"
              style={{ color: active ? '#1e4a52' : '#9b8e80', minHeight: '56px' }}>
              <span className="text-base leading-none mb-0.5"
                style={{ filter: active ? 'none' : 'opacity(0.5)' }}>
                {item.icon}
              </span>
              <span className="text-[9px] font-medium tracking-wide"
                style={{ color: active ? '#1e4a52' : '#9b8e80' }}>
                {item.label}
              </span>
              {active && (
                <div className="absolute bottom-0 w-6 h-0.5 rounded-full" style={{ background: '#1e4a52' }} />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
