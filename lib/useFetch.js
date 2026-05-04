import { useEffect, useState, useCallback } from 'react';

// Lightweight GET hook for component-level fetches. Returns
// { data, loading, error, refetch }. Errors are surfaced rather than
// swallowed — pages that need to show a toast on failure can read `error`
// or pass an `onError` callback.
//
// Replaces the .catch(() => {}) pattern that was scattered across pages.
export function useFetch(url, { onError } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async r => {
        if (!r.ok) {
          let msg = `Request failed (${r.status})`;
          try { const body = await r.json(); if (body?.error) msg = body.error; } catch {}
          throw new Error(msg);
        }
        return r.json();
      })
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => {
        if (!alive) return;
        console.error(`[useFetch] ${url} failed:`, e.message);
        setError(e);
        setLoading(false);
        if (typeof onError === 'function') onError(e);
      });
    return () => { alive = false; };
  }, [url, tick]);

  return { data, loading, error, refetch };
}

// One-shot apiFetch — for event handlers (onClick, onSubmit). Throws on
// non-OK response with the server's error message if available.
export async function apiFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { const body = await r.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return r.json();
}
