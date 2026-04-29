// Shared auth hook
// Returns { user, loading }
// - loading=true while checking session
// - user=null and redirects to /login if not authenticated
// - user=object when authenticated
// - if the org profile is empty (no org_name + no offerings), redirect
//   to /onboarding/profile every login until it's filled in. Applies to
//   admins too — seeded admins start with an empty profile.
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
          const onExemptPath = ONBOARDING_EXEMPT_PREFIXES.some(p => router.pathname.startsWith(p));
          if (d.user.needs_onboarding && !onExemptPath) {
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
