import { useEffect, useState, memo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Card, Btn, Spinner, Toast } from '../../components/ui';
import { useUser } from '../../lib/useUser';
import { DebouncedInput, DebouncedTextarea } from '../../lib/useDebounce';

// ──────────────────────────────────────────────────────────────────────────
// Organisation Profile Onboarding
//
// Flow:
//   1. User enters company name + website URL (or pastes services list)
//   2. Click "Scan website" → calls POST /api/onboarding/scan-website
//   3. AI returns extracted offerings / client types / positioning
//   4. User edits: remove, edit label, add new, pin as core
//   5. Click "Save confirmed profile" → POST /api/onboarding/profile
//
// The saved profile becomes trusted operating context that cascades into
// gap analysis, win strategy, executive brief, and section drafts.
// ──────────────────────────────────────────────────────────────────────────

export default function OnboardingProfile() {
  const { user, loading: authLoading } = useUser();

  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [source, setSource] = useState(null);

  // Editable confirmed profile — initialised from scan result or existing saved row
  const [offerings, setOfferings] = useState([]);
  const [clientTypes, setClientTypes] = useState([]);
  const [positioningPhrases, setPositioningPhrases] = useState([]);
  const [differentiators, setDifferentiators] = useState([]);

  const [newOfferingLabel, setNewOfferingLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Load existing profile on mount
  useEffect(() => {
    fetch('/api/onboarding/profile')
      .then(r => r.json())
      .then(d => {
        if (d?.profile) {
          setExisting(d.profile);
          setOrgName(d.profile.org_name || '');
          setWebsiteUrl(d.profile.website_url || '');
          const c = d.profile.confirmed_profile || {};
          setOfferings(c.offerings || []);
          setClientTypes(c.client_types || []);
          setPositioningPhrases(c.positioning_phrases || []);
          setDifferentiators(c.differentiators || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const body = showPaste
        ? { pasted_text: pastedText }
        : { url: websiteUrl };
      const r = await fetch('/api/onboarding/scan-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) {
        setScanError(d.error);
        if (d.suggest_paste) setShowPaste(true);
        setScanning(false);
        return;
      }
      setSource(d.source);
      // Merge extracted offerings with existing confirmed ones (extracted wins
      // if the user has no existing confirmed version).
      const extracted = d.profile;
      setOfferings(
        (extracted.offerings || []).map(o => ({
          label: o.label || '',
          canonical_taxonomy_match: o.canonical_taxonomy_match || null,
          confidence: o.confidence || 'medium',
          source: 'website',
          evidence: o.evidence || '',
          source_hint: o.source_hint || '',
          is_core: false,
        }))
      );
      setClientTypes(
        (extracted.client_types || []).map(c => ({
          label: c.label || '',
          canonical_taxonomy_match: c.canonical_taxonomy_match || null,
        }))
      );
      setPositioningPhrases(extracted.positioning_phrases || []);
      setDifferentiators(extracted.differentiators || []);
      if (extracted.org_name_guess && !orgName) setOrgName(extracted.org_name_guess);
      setToast(`✓ Extracted ${(extracted.offerings || []).length} offerings — review and confirm below`);
    } catch (e) {
      setScanError('Scan failed: ' + e.message);
    }
    setScanning(false);
  }

  function removeOffering(i) {
    setOfferings(prev => prev.filter((_, idx) => idx !== i));
  }
  function editOffering(i, fields) {
    setOfferings(prev => prev.map((o, idx) => idx === i ? { ...o, ...fields } : o));
  }
  function addOffering() {
    if (!newOfferingLabel.trim()) return;
    setOfferings(prev => [...prev, {
      label: newOfferingLabel.trim(),
      canonical_taxonomy_match: null,
      source: 'user_added',
      confidence: null,
      evidence: '',
      is_core: false,
    }]);
    setNewOfferingLabel('');
  }
  function toggleCore(i) {
    setOfferings(prev => prev.map((o, idx) => idx === i ? { ...o, is_core: !o.is_core } : o));
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const r = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: orgName,
          website_url: websiteUrl,
          confirmed_profile: {
            offerings,
            client_types: clientTypes,
            positioning_phrases: positioningPhrases,
            differentiators,
          },
        }),
      });
      if (!r.ok) { setToast('Save failed'); setSaving(false); return; }
      setToast('✓ Profile saved — it will now inform future RFP scans');
      // If user was being held at onboarding (onboarded_at NULL), send
      // them into the app now that their profile exists.
      if (user && !user.onboarded_at && user.role !== 'admin') {
        setTimeout(() => { window.location.href = '/dashboard'; }, 800);
      }
    } catch (e) {
      setToast('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  const coreOfferings = offerings.filter(o => o.is_core);
  const secondaryOfferings = offerings.filter(o => !o.is_core);

  if (authLoading) return null;
  if (!user) return null;
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-surface">
      <Spinner size={28} />
    </div>
  );

  return (
    <>
      <Head><title>Organisation Profile — ProposalIQ</title></Head>
      <Layout title="Organisation Profile" user={user}>
        <div className="bg-surface min-h-screen">
        <div className="max-w-4xl mx-auto p-6 md:p-8">

          {/* Editorial header */}
          <header className="mb-10">
            <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tight text-on-surface mb-3">Organisation Profile</h1>
            <p className="text-on-surface-variant font-body max-w-2xl leading-relaxed">
              Tell ProposalIQ what your organisation actually does — so recommendations match your real capabilities.
            </p>
          </header>

          {/* Existing-profile banner — only when returning to edit */}
          {existing && existing.confirmed_profile?.offerings?.length > 0 && (
            <div className="bg-primary/5 border-l-2 border-primary p-4 mb-6 text-sm flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-base flex-shrink-0">check_circle</span>
              <span className="flex-1 text-on-surface leading-relaxed">
                Editing the confirmed profile for <strong className="text-primary">{existing.org_name || 'your organisation'}</strong>.
                Changes save when you click "Save confirmed profile" at the bottom.
                To switch to a different company entirely, use <a href="/settings" className="underline hover:text-primary">Settings → Danger Zone</a>.
              </span>
            </div>
          )}

          {/* Step 1: website URL + scan */}
          <div className="bg-surface-container-low p-6 md:p-8 mb-5">
            <div className="font-label text-[10px] uppercase tracking-widest mb-4 text-primary">
              {existing?.confirmed_profile?.offerings?.length > 0 ? 'Re-scan website (optional)' : 'Step 1 · Tell us where to look'}
            </div>

            <label className="font-label text-[10px] uppercase tracking-widest block mb-2 text-on-surface-variant">Organisation name</label>
            <DebouncedInput
              value={orgName}
              onCommit={setOrgName}
              delay={300}
              placeholder="e.g. NorthStar Consulting"
              className="w-full bg-transparent border-0 border-b border-outline-variant/30 focus:border-primary focus:ring-0 focus:outline-none py-2 mb-6 text-on-surface placeholder:text-outline transition-colors"
            />

            {!showPaste ? (
              <>
                <label className="font-label text-[10px] uppercase tracking-widest block mb-2 text-on-surface-variant">Website URL</label>
                <div className="flex gap-3 items-end">
                  <DebouncedInput
                    value={websiteUrl}
                    onCommit={setWebsiteUrl}
                    delay={300}
                    placeholder="https://yourcompany.com"
                    className="flex-1 bg-transparent border-0 border-b border-outline-variant/30 focus:border-primary focus:ring-0 focus:outline-none py-2 text-on-surface placeholder:text-outline transition-colors"
                  />
                  <button
                    onClick={runScan}
                    disabled={scanning || !websiteUrl.trim()}
                    className="bg-primary text-on-primary px-4 py-2 text-[10px] font-label uppercase tracking-widest font-bold disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                  >
                    {scanning ? <><Spinner size={12} /> Scanning…</> : <>Scan website</>}
                  </button>
                </div>
                <button onClick={() => setShowPaste(true)} className="mt-3 text-[11px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">
                  Can't scan your site? Paste your services list instead →
                </button>
              </>
            ) : (
              <>
                <label className="font-label text-[10px] uppercase tracking-widest block mb-2 text-on-surface-variant">Paste your services / capabilities text</label>
                <DebouncedTextarea
                  value={pastedText}
                  onCommit={setPastedText}
                  delay={400}
                  rows={8}
                  placeholder="Paste the services section from your website, a capability statement, or a credentials deck. The AI will extract structured offerings from whatever you give it."
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary focus:ring-0 focus:outline-none p-3 text-sm text-on-surface placeholder:text-outline transition-colors font-body"
                />
                <div className="flex gap-3 mt-3 items-center">
                  <button
                    onClick={runScan}
                    disabled={scanning || pastedText.trim().length < 20}
                    className="bg-primary text-on-primary px-4 py-2 text-[10px] font-label uppercase tracking-widest font-bold disabled:opacity-50 flex items-center gap-2"
                  >
                    {scanning ? <><Spinner size={12} /> Extracting…</> : 'Extract offerings'}
                  </button>
                  <button onClick={() => setShowPaste(false)} className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">
                    ← Back to website URL
                  </button>
                </div>
              </>
            )}

            {scanError && (
              <div className="mt-4 bg-error-container/20 border-l-2 border-error p-3 text-xs text-error">
                {scanError}
              </div>
            )}
            {source && source.pages_scraped > 0 && (
              <div className="mt-4 text-[11px] font-label uppercase tracking-widest text-on-surface-variant/60">
                Scanned {source.pages_scraped} page{source.pages_scraped > 1 ? 's' : ''} from {source.hostname}
              </div>
            )}
          </div>

          {/* Step 2: Review extracted offerings */}
          {offerings.length > 0 && (
            <div className="bg-surface-container-low p-6 md:p-8 mb-5">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <div className="font-label text-[10px] uppercase tracking-widest text-primary">Step 2 · Confirm offerings</div>
                  <h2 className="font-headline text-xl md:text-2xl mt-1 text-on-surface">Here's what we think your offerings are</h2>
                </div>
              </div>
              <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                Remove anything wrong, edit wording, and add anything missing.
                Pin the most central ones as <strong className="text-on-surface">core</strong>.
                Your confirmed profile will cascade into gap analysis, win strategy,
                and recommendations.
              </p>

              {coreOfferings.length > 0 && (
                <div className="mb-6">
                  <div className="font-label text-[10px] uppercase tracking-widest mb-3 text-primary">★ Core offerings</div>
                  <div className="flex flex-wrap gap-2">
                    {coreOfferings.map((o) => {
                      const i = offerings.indexOf(o);
                      return <OfferingChip key={i} offering={o} onRemove={() => removeOffering(i)}
                        onEdit={(f) => editOffering(i, f)} onToggleCore={() => toggleCore(i)} isCore={true} />;
                    })}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <div className="font-label text-[10px] uppercase tracking-widest mb-3 text-on-surface-variant">
                  {coreOfferings.length > 0 ? 'Other offerings' : 'Offerings'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {secondaryOfferings.length === 0 && coreOfferings.length === 0 && (
                    <span className="text-xs italic text-on-surface-variant/60">No offerings yet — scan a site or add one manually below.</span>
                  )}
                  {secondaryOfferings.map((o) => {
                    const i = offerings.indexOf(o);
                    return <OfferingChip key={i} offering={o} onRemove={() => removeOffering(i)}
                      onEdit={(f) => editOffering(i, f)} onToggleCore={() => toggleCore(i)} isCore={false} />;
                  })}
                </div>
              </div>

              <div className="flex gap-3 items-center mt-6 pt-6 border-t border-outline-variant/10">
                <DebouncedInput
                  value={newOfferingLabel}
                  onCommit={setNewOfferingLabel}
                  delay={200}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOffering(); } }}
                  placeholder="Add an offering we missed (e.g. Crisis Communications)"
                  className="flex-1 bg-transparent border-0 border-b border-outline-variant/30 focus:border-primary focus:ring-0 focus:outline-none py-2 text-on-surface placeholder:text-outline transition-colors"
                />
                <button
                  onClick={addOffering}
                  disabled={!newOfferingLabel.trim()}
                  className="px-4 py-2 border border-outline/30 text-on-surface-variant hover:text-primary hover:border-primary text-[10px] font-label uppercase tracking-widest disabled:opacity-40 transition-colors"
                >
                  + Add
                </button>
              </div>
            </div>
          )}

          {/* Client types */}
          {clientTypes.length > 0 && (
            <div className="bg-surface-container-low p-6 md:p-8 mb-5">
              <div className="font-label text-[10px] uppercase tracking-widest mb-4 text-primary">Client types you serve</div>
              <div className="flex flex-wrap gap-2">
                {clientTypes.map((c, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary flex items-center"
                  >
                    ◆ {c.label}
                    <button
                      onClick={() => setClientTypes(p => p.filter((_, idx) => idx !== i))}
                      className="ml-2 opacity-60 hover:opacity-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Positioning */}
          {positioningPhrases.length > 0 && (
            <div className="bg-surface-container-low p-6 md:p-8 mb-5">
              <div className="font-label text-[10px] uppercase tracking-widest mb-4 text-primary">Positioning phrases</div>
              {positioningPhrases.map((p, i) => (
                <div
                  key={i}
                  className="text-sm italic font-headline mb-3 pl-4 border-l-2 border-primary text-on-surface-variant leading-relaxed"
                >
                  "{p}"
                  <button
                    onClick={() => setPositioningPhrases(arr => arr.filter((_, idx) => idx !== i))}
                    className="ml-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 hover:text-error transition-colors not-italic"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Differentiators */}
          {differentiators.length > 0 && (
            <div className="bg-surface-container-low p-6 md:p-8 mb-5">
              <div className="font-label text-[10px] uppercase tracking-widest mb-4 text-primary">Differentiators</div>
              <ul className="space-y-2">
                {differentiators.map((d, i) => (
                  <li key={i} className="text-sm flex items-start gap-3">
                    <span className="flex-shrink-0 text-primary">▸</span>
                    <span className="flex-1 text-on-surface leading-relaxed">{d}</span>
                    <button
                      onClick={() => setDifferentiators(arr => arr.filter((_, idx) => idx !== i))}
                      className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 hover:text-error transition-colors"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Save */}
          {offerings.length > 0 && (
            <div className="flex items-center gap-4 mt-6 flex-wrap">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="bg-primary text-on-primary px-6 py-3 text-[10px] font-label uppercase tracking-widest font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <><Spinner size={12} /> Saving…</> : 'Save confirmed profile'}
              </button>
              <Link href="/settings" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">
                ← Back to settings
              </Link>
              {existing?.updated_at && (
                <span className="text-[10px] ml-auto font-label text-on-surface-variant/60 uppercase tracking-widest">
                  Last saved {new Date(existing.updated_at).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}

// ── Single offering chip with inline edit + remove + pin ───────────────────
const OfferingChip = memo(function OfferingChip({ offering, onRemove, onEdit, onToggleCore, isCore }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(offering.label);

  const chipClass = isCore
    ? 'bg-primary/10 border-primary/40 text-primary'
    : 'bg-surface-container-highest border-outline-variant/30 text-on-surface-variant';

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border border-primary px-3 py-1 bg-surface-container">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') { onEdit({ label: label.trim() }); setEditing(false); }
            if (e.key === 'Escape') { setLabel(offering.label); setEditing(false); }
          }}
          className="text-xs px-1 outline-none bg-transparent text-on-surface"
          style={{ minWidth: 120 }}
        />
        <button onClick={() => { onEdit({ label: label.trim() }); setEditing(false); }}
          className="text-[10px] px-1 text-primary">✓</button>
        <button onClick={() => { setLabel(offering.label); setEditing(false); }}
          className="text-[10px] px-1 text-on-surface-variant">×</button>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${chipClass}`}
      title={offering.evidence ? `"${offering.evidence}"` : undefined}
    >
      <button onClick={onToggleCore}
        className="text-[10px] leading-none hover:brightness-125"
        title={isCore ? 'Unpin as core' : 'Pin as core'}>
        {isCore ? '★' : '☆'}
      </button>
      <span className="text-xs font-medium">{offering.label}</span>
      {offering.canonical_taxonomy_match && (
        <span className="text-[9px] font-label opacity-60" title={`Canonical match: ${offering.canonical_taxonomy_match}`}>
          ◈
        </span>
      )}
      {offering.confidence && offering.source === 'website' && (
        <span className={`text-[9px] font-label uppercase ${
          offering.confidence === 'high' ? 'text-[#6ab187]' :
          offering.confidence === 'low' ? 'text-error' :
          'text-secondary'
        }`}>{offering.confidence[0]}</span>
      )}
      <button onClick={() => setEditing(true)} className="text-[10px] opacity-50 hover:opacity-100" title="Edit">✎</button>
      <button onClick={onRemove} className="text-[11px] opacity-50 hover:opacity-100" title="Remove">×</button>
    </div>
  );
});
