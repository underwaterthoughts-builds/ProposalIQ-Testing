import { useEffect, useState } from 'react';
import Link from 'next/link';

// ── Onboarding prompt banner ──────────────────────────────────────────────
// Renders when the organisation_profile singleton is missing or empty.
// The profile drives ground-truth constraints in proposal generation,
// influences match fit judgments, and powers the profile_alignment signal
// in Overview & Insights — without it, several downstream AI calls
// operate without the "stay inside our confirmed offerings" guardrail.
//
// Dismissible per-session via localStorage. Lightweight one-shot fetch;
// shown as a soft primary-tinted banner so it reads as guidance, not
// as an error.

const DISMISS_KEY = 'onboarding_prompt_dismissed';

export default function OnboardingPrompt() {
  const [state, setState] = useState({ show: false, missing: [] });

  useEffect(() => {
    // Respect a prior dismiss for this session
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch {}
    if (dismissed) return;

    let alive = true;
    fetch('/api/onboarding/profile')
      .then(r => r.ok ? r.json() : { profile: null })
      .then(d => {
        if (!alive) return;
        const cp = d?.profile?.confirmed_profile;
        const offerings = Array.isArray(cp?.offerings) ? cp.offerings : [];
        const clientTypes = Array.isArray(cp?.client_types) ? cp.client_types : [];
        const website = d?.profile?.website_url;
        const missing = [];
        if (!website) missing.push('website URL');
        if (offerings.length === 0) missing.push('service offerings');
        if (clientTypes.length === 0) missing.push('client sectors');
        if (missing.length > 0) setState({ show: true, missing });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!state.show) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setState(s => ({ ...s, show: false }));
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-primary/30 bg-primary/10 text-sm">
      <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">rocket_launch</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-on-surface">
          Complete your organisation profile
        </div>
        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
          Add your {state.missing.join(', ')} so ProposalIQ can judge proposal fit,
          constrain drafts to real capabilities, and surface portfolio drift. Every AI
          analysis improves once this is in place.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link href="/onboarding/profile"
          className="px-3 py-1.5 text-[11px] font-label uppercase tracking-widest bg-primary text-on-primary font-bold hover:opacity-90 transition-opacity">
          Set up
        </Link>
        <button onClick={dismiss}
          className="text-on-surface-variant hover:text-on-surface p-1"
          aria-label="Dismiss">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>
    </div>
  );
}
