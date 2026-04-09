// Shared auth hook
// Returns { user, loading }
// - loading=true while checking session
// - user=null and redirects to / if not authenticated
// - user=object when authenticated
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

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
