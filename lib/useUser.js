// Shared auth hook
// Returns { user, loading }
// - loading=true while checking session
// - user=null and redirects to /login if not authenticated
// - user=object when authenticated
// - if user.onboarded_at is null and they're not already on /onboarding/*,
//   force-redirect to /onboarding/profile so enrollment can't be skipped.
//   Admin is pre-stamped by backfill so they never hit this path.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const ONBOARDING_EXEMPT_PREFIXES = ['/onboarding', '/login', '/logout', '/api'];

export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) {
          setUser(d.user);
          const needsOnboarding = !d.user.onboarded_at && d.user.role !== 'admin';
          const onExemptPath = ONBOARDING_EXEMPT_PREFIXES.some(p => router.pathname.startsWith(p));
          if (needsOnboarding && !onExemptPath) {
            router.replace('/onboarding/profile');
          }
        } else {
          router.replace('/login');
        }
        setLoading(false);
      })
      .catch(() => {
        router.replace('/login');
        setLoading(false);
      });
  }, []);

  return { user, loading };
}
