import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Card, Btn, Spinner, Toast } from '../../components/ui';
import { useUser } from '../../lib/useUser';

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
    <div className="flex items-center justify-center h-screen" style={{ background: '#faf7f2' }}>
      <Spinner size={28} />
    </div>
  );

  return (
    <>
      <Head><title>Organisation Profile — ProposalIQ</title></Head>
      <Layout title="Organisation Profile" subtitle="Tell ProposalIQ what your organisation actually does — so recommendations match your real capabilities." user={user}>
        <div className="max-w-4xl mx-auto p-6">

          {/* Existing-profile banner — only when returning to edit */}
          {existing && existing.confirmed_profile?.offerings?.length > 0 && (
            <div className="rounded-lg p-3 mb-5 text-xs flex items-center gap-3"
              style={{ background: '#edf3ec', border: '1px solid rgba(61,92,58,.25)', color: '#3d5c3a' }}>
              <span style={{ fontSize: 14 }}>✓</span>
              <span className="flex-1">
                Editing the confirmed profile for <strong>{existing.org_name || 'your organisation'}</strong>.
                Changes save when you click "Save confirmed profile" at the bottom.
                To switch to a different company entirely, use <a href="/settings" className="underline">Settings → Danger Zone</a>.
              </span>
            </div>
          )}

          {/* Step 1: website URL + scan */}
          <Card className="p-6 mb-6">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>
              {existing?.confirmed_profile?.offerings?.length > 0 ? 'Re-scan website (optional)' : 'Step 1 · Tell us where to look'}
            </div>

            <label className="text-xs font-medium block mb-1.5" style={{ color: '#1a1816' }}>Organisation name</label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. NorthStar Consulting"
              className="w-full text-sm px-3 py-2 mb-4 border rounded outline-none"
              style={{ borderColor: '#ddd5c4' }} />

            {!showPaste ? (
              <>
                <label className="text-xs font-medium block mb-1.5" style={{ color: '#1a1816' }}>Website URL</label>
                <div className="flex gap-2">
                  <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourcompany.com"
                    className="flex-1 text-sm px-3 py-2 border rounded outline-none"
                    style={{ borderColor: '#ddd5c4' }} />
                  <Btn variant="teal" onClick={runScan} disabled={scanning || !websiteUrl.trim()}>
                    {scanning ? <><Spinner size={12} /> Scanning…</> : 'Scan website'}
                  </Btn>
                </div>
                <button onClick={() => setShowPaste(true)} className="mt-2 text-[11px] underline" style={{ color: '#6b6456' }}>
                  Can't scan your site? Paste your services list instead →
                </button>
              </>
            ) : (
              <>
                <label className="text-xs font-medium block mb-1.5" style={{ color: '#1a1816' }}>Paste your services / capabilities text</label>
                <textarea value={pastedText} onChange={e => setPastedText(e.target.value)}
                  rows={8} placeholder="Paste the services section from your website, a capability statement, or a credentials deck. The AI will extract structured offerings from whatever you give it."
                  className="w-full text-sm px-3 py-2 border rounded outline-none font-serif"
                  style={{ borderColor: '#ddd5c4' }} />
                <div className="flex gap-2 mt-2">
                  <Btn variant="teal" onClick={runScan} disabled={scanning || pastedText.trim().length < 20}>
                    {scanning ? <><Spinner size={12} /> Extracting…</> : 'Extract offerings'}
                  </Btn>
                  <button onClick={() => setShowPaste(false)} className="text-[11px] underline" style={{ color: '#6b6456' }}>
                    ← Back to website URL
                  </button>
                </div>
              </>
            )}

            {scanError && (
              <div className="mt-3 rounded-lg p-3 text-xs" style={{ background: '#faeeeb', color: '#b04030' }}>
                {scanError}
              </div>
            )}
            {source && source.pages_scraped > 0 && (
              <div className="mt-3 text-[11px] font-mono" style={{ color: '#9b8e80' }}>
                Scanned {source.pages_scraped} page{source.pages_scraped > 1 ? 's' : ''} from {source.hostname}
              </div>
            )}
          </Card>

          {/* Step 2: Review extracted offerings */}
          {offerings.length > 0 && (
            <Card className="p-6 mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>Step 2 · Confirm offerings</div>
                  <h2 className="font-serif text-xl mt-0.5">Here's what we think your offerings are</h2>
                </div>
              </div>
              <p className="text-xs mb-5" style={{ color: '#6b6456' }}>
                Remove anything wrong, edit wording, and add anything missing.
                Pin the most central ones as <strong>core</strong>.
                Your confirmed profile will cascade into gap analysis, win strategy,
                and recommendations — overwriting any future website scans.
              </p>

              {/* Core offerings section */}
              {coreOfferings.length > 0 && (
                <div className="mb-5">
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#3d5c3a' }}>
                    ★ Core offerings
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {coreOfferings.map((o) => {
                      const i = offerings.indexOf(o);
                      return <OfferingChip key={i} offering={o} onRemove={() => removeOffering(i)}
                        onEdit={(f) => editOffering(i, f)} onToggleCore={() => toggleCore(i)} isCore={true} />;
                    })}
                  </div>
                </div>
              )}

              {/* All / secondary offerings */}
              <div className="mb-4">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>
                  {coreOfferings.length > 0 ? 'Other offerings' : 'Offerings'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {secondaryOfferings.length === 0 && coreOfferings.length === 0 && (
                    <span className="text-xs italic" style={{ color: '#9b8e80' }}>No offerings yet — scan a site or add one manually below.</span>
                  )}
                  {secondaryOfferings.map((o) => {
                    const i = offerings.indexOf(o);
                    return <OfferingChip key={i} offering={o} onRemove={() => removeOffering(i)}
                      onEdit={(f) => editOffering(i, f)} onToggleCore={() => toggleCore(i)} isCore={false} />;
                  })}
                </div>
              </div>

              {/* Add new offering */}
              <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: '#f0ebe0' }}>
                <input value={newOfferingLabel} onChange={e => setNewOfferingLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOffering(); } }}
                  placeholder="Add an offering we missed (e.g. Crisis Communications)"
                  className="flex-1 text-sm px-3 py-2 border rounded outline-none"
                  style={{ borderColor: '#ddd5c4' }} />
                <Btn variant="ghost" onClick={addOffering} disabled={!newOfferingLabel.trim()}>+ Add</Btn>
              </div>
            </Card>
          )}

          {/* Client types */}
          {clientTypes.length > 0 && (
            <Card className="p-6 mb-6">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Client types you serve</div>
              <div className="flex flex-wrap gap-2">
                {clientTypes.map((c, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-full border"
                    style={{ borderColor: 'rgba(184,150,46,.4)', background: 'rgba(184,150,46,.08)', color: '#8a6200' }}>
                    ◆ {c.label}
                    <button onClick={() => setClientTypes(p => p.filter((_, idx) => idx !== i))}
                      className="ml-2 opacity-60 hover:opacity-100">×</button>
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Positioning */}
          {positioningPhrases.length > 0 && (
            <Card className="p-6 mb-6">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Positioning phrases</div>
              {positioningPhrases.map((p, i) => (
                <div key={i} className="text-sm italic font-serif mb-2 pl-3 border-l-2" style={{ borderColor: '#b8962e', color: '#5a4810' }}>
                  "{p}"
                  <button onClick={() => setPositioningPhrases(arr => arr.filter((_, idx) => idx !== i))}
                    className="ml-2 text-xs opacity-50 hover:opacity-100">remove</button>
                </div>
              ))}
            </Card>
          )}

          {/* Differentiators */}
          {differentiators.length > 0 && (
            <Card className="p-6 mb-6">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Differentiators</div>
              <ul className="space-y-1.5">
                {differentiators.map((d, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="flex-shrink-0" style={{ color: '#3d5c3a' }}>▸</span>
                    <span className="flex-1" style={{ color: '#1a1816' }}>{d}</span>
                    <button onClick={() => setDifferentiators(arr => arr.filter((_, idx) => idx !== i))}
                      className="text-xs opacity-50 hover:opacity-100">remove</button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Save */}
          {offerings.length > 0 && (
            <div className="flex items-center gap-3 sticky bottom-4">
              <Btn variant="teal" onClick={saveProfile} disabled={saving}>
                {saving ? <><Spinner size={12} /> Saving…</> : '✓ Save confirmed profile'}
              </Btn>
              <Link href="/settings" className="text-xs" style={{ color: '#6b6456' }}>← Back to settings</Link>
              {existing?.updated_at && (
                <span className="text-[11px] ml-auto font-mono" style={{ color: '#9b8e80' }}>
                  Last saved {new Date(existing.updated_at).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}

// ── Single offering chip with inline edit + remove + pin ───────────────────
function OfferingChip({ offering, onRemove, onEdit, onToggleCore, isCore }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(offering.label);

  const confColor = offering.confidence === 'high' ? '#3d5c3a' :
                    offering.confidence === 'low'  ? '#b04030' : '#b8962e';
  const bg = isCore ? 'rgba(61,92,58,.10)' : 'rgba(30,74,82,.06)';
  const borderColor = isCore ? 'rgba(61,92,58,.5)' : 'rgba(30,74,82,.3)';
  const textColor = isCore ? '#3d5c3a' : '#1e4a52';

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border px-2 py-1"
        style={{ background: 'white', borderColor: '#1e4a52' }}>
        <input value={label} onChange={e => setLabel(e.target.value)} autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') { onEdit({ label: label.trim() }); setEditing(false); }
            if (e.key === 'Escape') { setLabel(offering.label); setEditing(false); }
          }}
          className="text-xs px-1 outline-none" style={{ minWidth: 120 }} />
        <button onClick={() => { onEdit({ label: label.trim() }); setEditing(false); }}
          className="text-[10px] px-1" style={{ color: '#1e4a52' }}>✓</button>
        <button onClick={() => { setLabel(offering.label); setEditing(false); }}
          className="text-[10px] px-1" style={{ color: '#9b8e80' }}>×</button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5"
      style={{ background: bg, borderColor, color: textColor }}
      title={offering.evidence ? `"${offering.evidence}"` : undefined}>
      <button onClick={onToggleCore}
        className="text-[10px] leading-none"
        title={isCore ? 'Unpin as core' : 'Pin as core'}>
        {isCore ? '★' : '☆'}
      </button>
      <span className="text-xs font-medium">{offering.label}</span>
      {offering.canonical_taxonomy_match && (
        <span className="text-[9px] font-mono opacity-60" title={`Canonical match: ${offering.canonical_taxonomy_match}`}>
          ◈
        </span>
      )}
      {offering.confidence && offering.source === 'website' && (
        <span className="text-[9px] font-mono" style={{ color: confColor }}>{offering.confidence[0]}</span>
      )}
      <button onClick={() => setEditing(true)} className="text-[10px] opacity-50 hover:opacity-100" title="Edit">✎</button>
      <button onClick={onRemove} className="text-[11px] opacity-50 hover:opacity-100" title="Remove">×</button>
    </div>
  );
}
