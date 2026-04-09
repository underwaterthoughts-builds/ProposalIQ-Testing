import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Btn, Card, Stars, OutcomeLabel, FileChip, Spinner, Toast } from '../../components/ui';
import { useUser } from '../../lib/useUser';
import { formatMoney, currencySymbol } from '../../lib/format';

const CURRENCY_OPTIONS = ['GBP','USD','EUR','AUD','CAD','NZD','CHF','JPY','CNY','SGD','HKD','AED','SAR','ZAR','INR','KRW','TRY','BRL','MXN','RUB'];

// ── COLOUR-CODED INDICATOR ────────────────────────────────────────────────────
function Indicator({ type, children }) {
  const styles = {
    positive: { icon: '+', color: '#3d5c3a', bg: '#edf3ec', border: 'rgba(61,92,58,.2)' },
    suggestion: { icon: '?', color: '#8a6200', bg: '#faf4e2', border: 'rgba(184,150,46,.3)' },
    negative: { icon: '−', color: '#b04030', bg: '#faeeeb', border: 'rgba(176,64,48,.2)' },
  };
  const s = styles[type] || styles.suggestion;
  return (
    <div className="flex items-start gap-2 text-xs mb-1.5 last:mb-0 rounded px-2 py-1.5" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <span className="font-bold flex-shrink-0 w-3 text-center" style={{ color: s.color }}>{s.icon}</span>
      <span style={{ color: s.color }}>{children}</span>
    </div>
  );
}

function ScoreCircle({ score, label, size = 52 }) {
  if (!score) return null;
  const r = 18; const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#3d5c3a' : score >= 55 ? '#b8962e' : '#b04030';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="26" cy="26" r={r} fill="none" stroke="#f0ebe0" strokeWidth="4" />
          <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold" style={{ color }}>
          {score}
        </div>
      </div>
      <div className="text-[10px] font-mono text-center leading-tight" style={{ color: '#6b6456' }}>{label}</div>
    </div>
  );
}

function ScoreBar({ label, value, note }) {
  if (!value) return null;
  const color = value >= 75 ? '#3d5c3a' : value >= 55 ? '#b8962e' : '#b04030';
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#6b6456' }}>{label}</span>
        <span className="font-mono font-medium" style={{ color }}>{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f0ebe0' }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      {note && <div className="text-[11px] mt-1 italic" style={{ color: '#6b6456' }}>{note}</div>}
    </div>
  );
}

function TagList({ items = [], onSave, color = '#1e4a52', bg = '#e8f2f4' }) {
  const [tags, setTags] = useState(items);
  const [input, setInput] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setTags(items); }, [items.join(',')]);
  function add(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const val = input.trim().replace(/,$/, '');
      if (!tags.includes(val)) { setTags([...tags, val]); setDirty(true); }
      setInput('');
    }
  }
  function remove(tag) { setTags(tags.filter(t => t !== tag)); setDirty(true); }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 p-2.5 border rounded-md min-h-[42px]" style={{ borderColor: '#ddd5c4', background: 'white' }}>
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: bg, color }}>
            {t}<button onClick={() => remove(t)} className="opacity-50 hover:opacity-100 ml-0.5 text-[10px]">✕</button>
          </span>
        ))}
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={add}
          placeholder="Type and press Enter…" className="flex-1 min-w-24 text-xs outline-none bg-transparent" style={{ color: '#6b6456' }} />
      </div>
      {dirty && (
        <button onClick={() => { onSave(tags); setDirty(false); }}
          className="mt-1.5 text-[11px] px-2.5 py-1 rounded font-medium" style={{ background: '#1e4a52', color: 'white' }}>
          Save changes
        </button>
      )}
    </div>
  );
}

// ── Editable project details ──────────────────────────────────────────────
// Collapsible panel that lets users edit the top-level project fields that
// drive ranking + display: name, client, sector, contract value, currency,
// outcome, rating, project type, date submitted. Wraps the existing PATCH
// /api/projects/[id] endpoint (which already accepts all these fields).
//
// Collapsed by default so it doesn't take up space on the overview tab —
// click "Edit details" to expand. Each field saves on blur.
function ProjectDetailsEditor({ project, onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});

  // Reset local draft when the project changes
  useEffect(() => { setDraft({}); }, [project.id]);

  function field(key) {
    return draft[key] !== undefined ? draft[key] : (project[key] ?? '');
  }

  function setField(key, value) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function commit(key, parser = (v) => v) {
    const current = project[key];
    const next = parser(draft[key]);
    if (draft[key] === undefined) return;
    if (next === current) return;
    onSave(key, next);
    setDraft(d => { const n = { ...d }; delete n[key]; return n; });
  }

  const outcomes = ['won', 'lost', 'pending', 'active', 'withdrawn'];
  const ratings = [0, 1, 2, 3, 4, 5];

  return (
    <Card className="mb-4" style={{ background: 'white' }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>Project details</div>
          <div className="text-sm mt-0.5" style={{ color: '#1a1816' }}>
            {project.client} · {formatMoney(project.contract_value, project.currency)} · {project.date_submitted || '—'}
          </div>
        </div>
        <span className="text-xs font-mono" style={{ color: '#9b8e80' }}>
          {open ? '▴ Hide' : '▾ Edit'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#f0ebe0' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 mt-3">
            {/* Name */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Project name</label>
              <input value={field('name')} onChange={e => setField('name', e.target.value)} onBlur={() => commit('name')}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none" style={{ borderColor: '#ddd5c4' }} />
            </div>

            {/* Client */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Client</label>
              <input value={field('client')} onChange={e => setField('client', e.target.value)} onBlur={() => commit('client')}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none" style={{ borderColor: '#ddd5c4' }} />
            </div>

            {/* Sector */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Sector (legacy)</label>
              <input value={field('sector')} onChange={e => setField('sector', e.target.value)} onBlur={() => commit('sector')}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none" style={{ borderColor: '#ddd5c4' }} />
            </div>

            {/* Contract value */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Contract value</label>
              <div className="flex gap-1">
                <select value={field('currency') || 'GBP'}
                  onChange={e => { setField('currency', e.target.value); onSave('currency', e.target.value); }}
                  className="text-sm px-2 py-1.5 border rounded outline-none bg-white" style={{ borderColor: '#ddd5c4', width: 90 }}>
                  {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" value={field('contract_value')}
                  onChange={e => setField('contract_value', e.target.value)}
                  onBlur={() => commit('contract_value', v => parseFloat(v) || 0)}
                  className="flex-1 text-sm px-2.5 py-1.5 border rounded outline-none font-mono" style={{ borderColor: '#ddd5c4' }}
                  placeholder="0" />
              </div>
              <div className="text-[10px] font-mono mt-1" style={{ color: '#9b8e80' }}>
                Shows as: {formatMoney(field('contract_value') || 0, field('currency') || 'GBP')}
              </div>
            </div>

            {/* Project type */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Project type</label>
              <input value={field('project_type')} onChange={e => setField('project_type', e.target.value)} onBlur={() => commit('project_type')}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none" style={{ borderColor: '#ddd5c4' }}
                placeholder="e.g. Consultancy, Film Production" />
            </div>

            {/* Date submitted */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Date submitted</label>
              <input type="date" value={field('date_submitted')} onChange={e => setField('date_submitted', e.target.value)} onBlur={() => commit('date_submitted')}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none" style={{ borderColor: '#ddd5c4' }} />
            </div>

            {/* Outcome */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Outcome</label>
              <select value={field('outcome') || 'pending'}
                onChange={e => { setField('outcome', e.target.value); onSave('outcome', e.target.value); }}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none bg-white" style={{ borderColor: '#ddd5c4' }}>
                {outcomes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* User rating */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide block mb-1" style={{ color: '#6b6456' }}>Star rating (ranking weight)</label>
              <select value={field('user_rating') || 0}
                onChange={e => { const v = parseInt(e.target.value, 10) || 0; setField('user_rating', v); onSave('user_rating', v); }}
                className="w-full text-sm px-2.5 py-1.5 border rounded outline-none bg-white" style={{ borderColor: '#ddd5c4' }}>
                {ratings.map(r => <option key={r} value={r}>{r === 0 ? '— not rated —' : '★'.repeat(r) + '☆'.repeat(5 - r) + '  ' + r + '/5'}</option>)}
              </select>
            </div>
          </div>
          <div className="text-[10px] font-mono mt-3" style={{ color: '#9b8e80' }}>
            Changes save on blur (click out of a field) or immediately for dropdowns.
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Two-axis taxonomy editor ──────────────────────────────────────────────
// Industry dropdowns + sector chips, sourced from /api/taxonomy. Sector list
// for each axis is filtered by the currently-selected industry.
function TaxonomyEditor({ project, taxItems, onSave }) {
  const [serviceInd, setServiceInd] = useState(project.service_industry || '');
  const [serviceSecs, setServiceSecs] = useState(Array.isArray(project.service_sectors) ? project.service_sectors : []);
  const [clientInd, setClientInd] = useState(project.client_industry || '');
  const [clientSecs, setClientSecs] = useState(Array.isArray(project.client_sectors) ? project.client_sectors : []);
  const [saving, setSaving] = useState(false);

  // Re-sync if project reloads (e.g. after AI reindex)
  useEffect(() => {
    setServiceInd(project.service_industry || '');
    setServiceSecs(Array.isArray(project.service_sectors) ? project.service_sectors : []);
    setClientInd(project.client_industry || '');
    setClientSecs(Array.isArray(project.client_sectors) ? project.client_sectors : []);
  }, [project.id, project.service_industry, project.client_industry, project.indexed_at]);

  // Group taxonomy items
  const serviceIndustries = taxItems.filter(t => t.taxonomy_type === 'service' && t.category === 'Industry');
  const clientIndustries  = taxItems.filter(t => t.taxonomy_type === 'client'  && t.category === 'Industry');
  const sectorsFor = (industryName, type) => {
    const ind = taxItems.find(t => t.name === industryName && t.category === 'Industry' && t.taxonomy_type === type);
    if (!ind) return [];
    return taxItems.filter(t => t.category === 'Sector' && t.parent_id === ind.id).map(t => t.name);
  };
  const serviceSectorOptions = sectorsFor(serviceInd, 'service');
  const clientSectorOptions  = sectorsFor(clientInd, 'client');

  const dirty =
    serviceInd !== (project.service_industry || '') ||
    clientInd  !== (project.client_industry  || '') ||
    JSON.stringify([...serviceSecs].sort()) !== JSON.stringify([...(project.service_sectors || [])].sort()) ||
    JSON.stringify([...clientSecs].sort())  !== JSON.stringify([...(project.client_sectors  || [])].sort());

  function toggleSector(value, list, setter) {
    if (list.includes(value)) setter(list.filter(s => s !== value));
    else if (list.length < 3) setter([...list, value]);
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      service_industry: serviceInd || null,
      service_sectors: serviceSecs,
      client_industry: clientInd || null,
      client_sectors: clientSecs,
    });
    setSaving(false);
  }

  const provenance = project.taxonomy_source === 'user' ? 'Edited by user'
    : project.taxonomy_source === 'ai' ? 'Tagged by AI' : 'Untagged';

  return (
    <Card className="p-4 mb-4" style={{ background: '#fbf9f4', borderColor: '#ddd5c4' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>Classification</div>
        <div className="text-[10px] font-mono" style={{ color: '#9b8e80' }}>{provenance}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CLIENT axis — gold */}
        <div>
          <label className="text-[11px] font-medium block mb-1.5" style={{ color: '#8a6200' }}>Client industry</label>
          <select value={clientInd}
            onChange={e => { setClientInd(e.target.value); setClientSecs([]); }}
            className="w-full text-xs px-2 py-1.5 rounded border bg-white"
            style={{ borderColor: 'rgba(184,150,46,.45)' }}>
            <option value="">— Untagged —</option>
            {clientIndustries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
          </select>
          {clientInd && (
            <div className="mt-2">
              <div className="text-[10px] font-mono mb-1" style={{ color: '#9b8e80' }}>
                Sectors (max 3) — {clientSecs.length}/3 selected
              </div>
              <div className="flex flex-wrap gap-1">
                {clientSectorOptions.map(s => {
                  const on = clientSecs.includes(s);
                  return (
                    <button key={s} type="button" onClick={() => toggleSector(s, clientSecs, setClientSecs)}
                      className="text-[10px] px-2 py-0.5 rounded-full border transition-colors"
                      style={on
                        ? { background: 'rgba(184,150,46,.18)', borderColor: '#b8962e', color: '#8a6200' }
                        : { background: 'white', borderColor: '#ddd5c4', color: '#6b6456' }}>
                      {on ? '✓ ' : '+ '}{s}
                    </button>
                  );
                })}
                {clientSectorOptions.length === 0 && (
                  <span className="text-[10px] italic" style={{ color: '#9b8e80' }}>No sectors loaded for this industry</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SERVICE axis — teal */}
        <div>
          <label className="text-[11px] font-medium block mb-1.5" style={{ color: '#1e4a52' }}>Type of work</label>
          <select value={serviceInd}
            onChange={e => { setServiceInd(e.target.value); setServiceSecs([]); }}
            className="w-full text-xs px-2 py-1.5 rounded border bg-white"
            style={{ borderColor: 'rgba(30,74,82,.45)' }}>
            <option value="">— Untagged —</option>
            {serviceIndustries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
          </select>
          {serviceInd && (
            <div className="mt-2">
              <div className="text-[10px] font-mono mb-1" style={{ color: '#9b8e80' }}>
                Sectors (max 3) — {serviceSecs.length}/3 selected
              </div>
              <div className="flex flex-wrap gap-1">
                {serviceSectorOptions.map(s => {
                  const on = serviceSecs.includes(s);
                  return (
                    <button key={s} type="button" onClick={() => toggleSector(s, serviceSecs, setServiceSecs)}
                      className="text-[10px] px-2 py-0.5 rounded-full border transition-colors"
                      style={on
                        ? { background: 'rgba(30,74,82,.18)', borderColor: '#1e4a52', color: '#1e4a52' }
                        : { background: 'white', borderColor: '#ddd5c4', color: '#6b6456' }}>
                      {on ? '✓ ' : '+ '}{s}
                    </button>
                  );
                })}
                {serviceSectorOptions.length === 0 && (
                  <span className="text-[10px] italic" style={{ color: '#9b8e80' }}>No sectors loaded for this industry</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {dirty && (
        <div className="mt-3 flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
            style={{ background: '#1e4a52', color: 'white' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button onClick={() => {
            setServiceInd(project.service_industry || '');
            setServiceSecs(project.service_sectors || []);
            setClientInd(project.client_industry || '');
            setClientSecs(project.client_sectors || []);
          }} className="text-xs px-3 py-1.5 rounded" style={{ color: '#6b6456' }}>
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

export default function ProjectDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useUser();
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [team, setTeam] = useState([]);
  const [overviewFields, setOverviewFields] = useState([]);
  const [narrativeEntries, setNarrativeEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [newEntry, setNewEntry] = useState('');
  const [entryType, setEntryType] = useState('note');
  const [savingEntry, setSavingEntry] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureForm, setCaptureForm] = useState({ what_won_lost: '', do_differently: '', client_feedback: '' });
  const [savingCapture, setSavingCapture] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [taxItems, setTaxItems] = useState([]);

  useEffect(() => { if (id) loadProject(); }, [id]);
  useEffect(() => {
    fetch('/api/taxonomy').then(r => r.json()).then(d => setTaxItems(d.items || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (project && narrativeEntries !== null) {
      const hasOutcome = project.outcome === 'won' || project.outcome === 'lost';
      const noNarrative = narrativeEntries.length === 0;
      if (hasOutcome && noNarrative && !sessionStorage.getItem(`capture_prompted_${id}`)) {
        sessionStorage.setItem(`capture_prompted_${id}`, '1');
        setShowCaptureModal(true);
      }
    }
  }, [project, narrativeEntries]);

  async function loadProject() {
    const [pd, od, nd] = await Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch(`/api/projects/${id}/overview`).then(r => r.json()).catch(() => ({ fields: [] })),
      fetch(`/api/projects/${id}/narrative`).then(r => r.json()).catch(() => ({ entries: [] })),
    ]);
    setProject(pd.project);
    setFiles(pd.files || []);
    setTeam(pd.team || []);
    setOverviewFields(od.fields || []);
    setNarrativeEntries(nd.entries || []);
    setLoading(false);
  }

  async function saveMetaField(field, value) {
    const updated = { ...project.ai_metadata, [field]: value };
    await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_metadata: JSON.stringify(updated) }) });
    setProject(p => ({ ...p, ai_metadata: updated }));
    setToast('Saved');
  }

  // Save top-level project fields (name, client, contract_value, currency, etc).
  // Optimistic local update so the UI reflects the change immediately.
  async function saveProjectField(field, value) {
    const r = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (r.ok) {
      setProject(p => ({ ...p, [field]: value }));
      setToast('Saved');
    } else {
      setToast('Save failed');
    }
  }

  // Save taxonomy fields. Server snaps to canonical and marks taxonomy_source='user'.
  async function saveTaxonomy(updates) {
    const r = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (r.ok) {
      // Reload to pick up server-side snapping
      const fresh = await fetch(`/api/projects/${id}`).then(r => r.json());
      setProject(fresh.project);
      setToast('Classification saved');
    } else {
      setToast('Save failed');
    }
  }

  async function saveOverviewField(fieldId, value) {
    await fetch(`/api/projects/${id}/overview`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_id: fieldId, field_value: value }) });
    setOverviewFields(f => f.map(x => x.id === fieldId ? { ...x, field_value: value } : x));
    setToast('Saved');
  }

  async function addOverviewField() {
    if (!newFieldLabel.trim()) return;
    const r = await fetch(`/api/projects/${id}/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_label: newFieldLabel, field_value: newFieldValue }) });
    const d = await r.json();
    setOverviewFields(f => [...f, { id: d.id, field_key: d.field_key, field_label: newFieldLabel, field_value: newFieldValue, field_type: 'text' }]);
    setNewFieldLabel(''); setNewFieldValue(''); setAddingField(false);
    setToast('Field added');
  }

  async function deleteOverviewField(fieldId) {
    await fetch(`/api/projects/${id}/overview`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_id: fieldId }) });
    setOverviewFields(f => f.filter(x => x.id !== fieldId));
    setToast('Field removed');
  }

  async function saveCapture() {
    setSavingCapture(true);
    const entries = [
      { type: 'win_factor', content: captureForm.what_won_lost },
      { type: 'lesson', content: captureForm.do_differently },
      { type: 'client_feedback', content: captureForm.client_feedback },
    ].filter(e => e.content.trim());

    for (const entry of entries) {
      await fetch(`/api/projects/${id}/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: entry.content, entry_type: entry.type }),
      });
    }
    const nd = await fetch(`/api/projects/${id}/narrative`).then(r => r.json());
    setNarrativeEntries(nd.entries || []);
    setSavingCapture(false);
    setShowCaptureModal(false);
    setToast('✓ Learning captured — thank you');
  }

  async function addNarrativeEntry() {
    if (!newEntry.trim()) return;
    setSavingEntry(true);
    const r = await fetch(`/api/projects/${id}/narrative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newEntry, entry_type: entryType }) });
    const d = await r.json();
    setNarrativeEntries(e => [...e, d.entry]);
    setNewEntry('');
    setSavingEntry(false);
  }

  async function deleteNarrativeEntry(entryId) {
    await fetch(`/api/projects/${id}/narrative`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry_id: entryId }) });
    setNarrativeEntries(e => e.filter(x => x.id !== entryId));
  }

  async function reindex() {
    setReindexing(true);
    const prevIndexedAt = project.indexed_at;
    const r = await fetch(`/api/projects/${id}/reindex`, { method: 'POST' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setToast(d.error || 'Re-analysis failed'); setReindexing(false); return; }
    setToast('AI analysis running — 30–60 seconds…');
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      fetch(`/api/projects/${id}`).then(r => r.json()).then(d => {
        if (d.project.indexing_status === 'complete' && d.project.indexed_at !== prevIndexedAt) {
          clearInterval(poll); setProject(d.project); setReindexing(false); setToast('✓ Analysis complete');
        } else if (d.project.indexing_status === 'error') {
          clearInterval(poll); setReindexing(false); setToast('Analysis failed — check Settings for API keys');
        } else if (attempts >= 40) {
          clearInterval(poll); setReindexing(false); setToast('Taking longer than expected — refresh in a minute');
        }
      }).catch(() => {});
    }, 3000);
  }

  async function deleteProject() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const r = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/repository');
    else { setToast('Delete failed'); setDeleting(false); }
  }

  if (authLoading) return null;
  if (!user) return null;
  if (loading) return <div className="flex items-center justify-center h-screen" style={{ background: '#faf7f2' }}><Spinner size={28} /></div>;
  if (!project) return <div className="p-8">Project not found. <Link href="/repository" className="underline">Back</Link></div>;

  const meta = project.ai_metadata || {};
  const wq = meta.writing_quality || {};
  const aq = meta.approach_quality || {};
  const cq = meta.credibility_signals || {};
  const hasWritingAnalysis = wq.overall_score > 0;

  const ENTRY_TYPES = [
    { value: 'note', label: 'Note' },
    { value: 'win_factor', label: 'Win Factor' },
    { value: 'loss_factor', label: 'Loss Factor' },
    { value: 'client_feedback', label: 'Client Feedback' },
    { value: 'delivery_note', label: 'Delivery Note' },
    { value: 'lesson', label: 'Lesson Learned' },
  ];

  const ENTRY_COLORS = {
    win_factor: { bg: '#edf3ec', color: '#3d5c3a', icon: '+' },
    loss_factor: { bg: '#faeeeb', color: '#b04030', icon: '−' },
    client_feedback: { bg: '#e8f2f4', color: '#1e4a52', icon: '◎' },
    delivery_note: { bg: '#f0ebe0', color: '#6b6456', icon: '·' },
    lesson: { bg: '#faf4e2', color: '#8a6200', icon: '?' },
    note: { bg: '#f8f6f2', color: '#6b6456', icon: '·' },
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'writing', label: 'Writing Analysis', badge: hasWritingAnalysis ? `${wq.overall_score}/100` : null },
    { id: 'metadata', label: 'AI Metadata' },
    { id: 'narrative', label: 'Project Narrative', badge: narrativeEntries.length > 0 ? `${narrativeEntries.length}` : null },
  ];

  return (
    <>
      <Head><title>{project.name} — ProposalIQ</title></Head>
      <Layout title={project.name} subtitle={`${project.client} · ${project.sector}`} user={user}
        actions={
          <div className="flex gap-2">
            <Link href="/repository"><Btn variant="ghost">← Repository</Btn></Link>
            <Btn variant="danger" onClick={deleteProject} disabled={deleting}>
              {deleting ? <><Spinner size={12} /> Deleting…</> : '✕ Delete'}
            </Btn>
          </div>
        }>
        <div className="flex h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">

            {/* Header */}
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1.5">
                  <OutcomeLabel outcome={project.outcome} />
                  <Stars rating={project.user_rating} />
                  <span className="text-xs font-mono" style={{ color: '#b8962e' }}>AI weight: {Math.round((project.ai_weight || 0.4) * 100)}%</span>
                </div>
                <div className="text-sm" style={{ color: '#6b6456' }}>
                  {project.project_type} · {formatMoney(project.contract_value, project.currency)} · {project.date_submitted}
                </div>
              </div>
              <div className="flex gap-2">{files.map(f => <FileChip key={f.id} type={f.file_type} />)}</div>
            </div>

            {/* Status banners */}
            {(project.indexing_status === 'indexing' || reindexing) && (
              <div className="flex items-center gap-2 rounded-lg p-3 mb-4 text-sm" style={{ background: '#faf4e2', color: '#7a5800' }}>
                <Spinner size={14} /> AI analysis running — takes 30–60 seconds…
              </div>
            )}
            {project.indexing_status === 'error' && !reindexing && (
              <div className="rounded-lg p-4 mb-4 flex items-center justify-between" style={{ background: '#faeeeb', border: '1px solid rgba(176,64,48,.2)' }}>
                <div>
                  <div className="text-sm font-semibold mb-0.5" style={{ color: '#b04030' }}>⚠ Analysis failed</div>
                  <div className="text-xs" style={{ color: '#b04030' }}>Check API keys in Settings, then retry.</div>
                </div>
                <Btn variant="teal" onClick={reindex} className="ml-4 flex-shrink-0">⟳ Retry</Btn>
              </div>
            )}
            {project.indexing_status === 'complete' && !meta.executive_summary && !reindexing && (
              <div className="rounded-lg p-4 mb-4 flex items-center justify-between" style={{ background: '#f0ebe0', border: '1px solid #ddd5c4' }}>
                <div>
                  <div className="text-sm font-semibold mb-0.5">No AI analysis yet</div>
                  <div className="text-xs" style={{ color: '#6b6456' }}>Click to run full AI analysis on the uploaded document.</div>
                </div>
                <Btn variant="teal" onClick={reindex} className="ml-4 flex-shrink-0">⟳ Run Analysis</Btn>
              </div>
            )}

            {/* Editable project details — cost, currency, client, etc */}
            <ProjectDetailsEditor project={project} onSave={saveProjectField} />

            {/* Writing scores bar */}
            {hasWritingAnalysis && (
              <div className="flex items-center gap-6 p-4 rounded-lg mb-4 border" style={{ background: 'white', borderColor: '#ddd5c4' }}>
                <ScoreCircle score={wq.overall_score} label="Writing" />
                <ScoreCircle score={aq.overall_score} label="Approach" />
                <ScoreCircle score={cq.overall_score} label="Credibility" />
                <div className="flex-1 ml-2">
                  {(meta.standout_sentences || []).slice(0, 1).map((s, i) => (
                    <blockquote key={i} className="text-xs italic leading-relaxed border-l-2 pl-3" style={{ borderColor: '#b8962e', color: '#6b6456' }}>"{s}"</blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* Classification — always visible above the tabs so users can
                see and edit taxonomy from any tab without hunting */}
            <TaxonomyEditor project={project} taxItems={taxItems} onSave={saveTaxonomy} />

            {/* Tabs */}
            <div className="flex border-b mb-5" style={{ borderColor: '#ddd5c4' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className="px-4 py-2 text-[12.5px] font-medium border-b-2 transition-all flex items-center gap-2"
                  style={{ borderColor: activeTab === t.id ? '#1e4a52' : 'transparent', color: activeTab === t.id ? '#1e4a52' : '#6b6456' }}>
                  {t.label}
                  {t.badge && <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: activeTab === t.id ? '#1e4a52' : '#f0ebe0', color: activeTab === t.id ? 'white' : '#6b6456' }}>{t.badge}</span>}
                </button>
              ))}
            </div>

            {/* ── TAB: OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {meta.executive_summary && (
                  <Card className="p-4" style={{ background: '#f8f6f2' }}>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>AI Summary</div>
                    <p className="text-sm leading-relaxed">{meta.executive_summary}</p>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {(meta.key_themes || []).length > 0 && (
                    <Card className="p-4">
                      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Key Themes</div>
                      <div className="flex flex-wrap gap-1.5">
                        {meta.key_themes.map(t => <span key={t} className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: '#e8f2f4', color: '#1e4a52' }}>{t}</span>)}
                      </div>
                    </Card>
                  )}
                  {(meta.value_propositions || []).length > 0 && (
                    <Card className="p-4">
                      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Value Propositions</div>
                      {meta.value_propositions.map((v, i) => <Indicator key={i} type="positive">{v}</Indicator>)}
                    </Card>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {(meta.client_pain_points || []).length > 0 && (
                    <Card className="p-4">
                      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Client Pain Points</div>
                      {meta.client_pain_points.map((v, i) => <Indicator key={i} type="suggestion">{v}</Indicator>)}
                    </Card>
                  )}
                  {(meta.deliverables || []).length > 0 && (
                    <Card className="p-4">
                      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Deliverables</div>
                      {meta.deliverables.map((v, i) => <div key={i} className="text-xs mb-1.5 flex gap-2"><span style={{ color: '#1e4a52' }}>·</span>{v}</div>)}
                    </Card>
                  )}
                </div>

                {((meta.methodologies || []).length > 0 || (meta.tools_technologies || []).length > 0) && (
                  <Card className="p-4">
                    <div className="grid grid-cols-2 gap-4">
                      {(meta.methodologies || []).length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Methodologies</div>
                          <div className="flex flex-wrap gap-1.5">
                            {meta.methodologies.map(t => <span key={t} className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: '#edf3ec', color: '#3d5c3a' }}>{t}</span>)}
                          </div>
                        </div>
                      )}
                      {(meta.tools_technologies || []).length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Tools & Technologies</div>
                          <div className="flex flex-wrap gap-1.5">
                            {meta.tools_technologies.map(t => <span key={t} className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: '#f0ebe0', color: '#6b6456' }}>{t}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {((meta.win_indicators || []).length > 0 || (meta.loss_risks || []).length > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    {(meta.win_indicators || []).length > 0 && (
                      <Card className="p-4">
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#3d5c3a' }}>Win Indicators</div>
                        {meta.win_indicators.map((s, i) => <Indicator key={i} type="positive">{s}</Indicator>)}
                      </Card>
                    )}
                    {(meta.loss_risks || []).length > 0 && (
                      <Card className="p-4">
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#b04030' }}>Loss Risks</div>
                        {meta.loss_risks.map((s, i) => <Indicator key={i} type="negative">{s}</Indicator>)}
                      </Card>
                    )}
                  </div>
                )}

                {/* Custom fields */}
                {overviewFields.length > 0 && (
                  <Card className="p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Custom Fields</div>
                    {overviewFields.map(f => (
                      <div key={f.id} className="mb-3 last:mb-0">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b6456' }}>{f.field_label}</label>
                          <button onClick={() => deleteOverviewField(f.id)} className="text-[10px] opacity-40 hover:opacity-80" style={{ color: '#b04030' }}>✕</button>
                        </div>
                        <textarea defaultValue={f.field_value} rows={2}
                          onBlur={e => { if (e.target.value !== f.field_value) saveOverviewField(f.id, e.target.value); }}
                          className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]" style={{ borderColor: '#ddd5c4', resize: 'vertical' }} />
                      </div>
                    ))}
                  </Card>
                )}

                {/* Add custom field */}
                {addingField ? (
                  <Card className="p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>New Custom Field</div>
                    <div className="space-y-3">
                      <input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)}
                        placeholder="Field label (e.g. Client Relationship, Key Contact)" autoFocus
                        className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]" style={{ borderColor: '#ddd5c4' }} />
                      <textarea value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)}
                        placeholder="Value (optional — you can fill this in later)" rows={2}
                        className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]" style={{ borderColor: '#ddd5c4', resize: 'vertical' }} />
                      <div className="flex gap-2">
                        <Btn variant="teal" onClick={addOverviewField}>Add Field</Btn>
                        <Btn variant="ghost" onClick={() => { setAddingField(false); setNewFieldLabel(''); setNewFieldValue(''); }}>Cancel</Btn>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <button onClick={() => setAddingField(true)}
                    className="w-full border-2 border-dashed rounded-lg p-3 text-center text-sm transition-all hover:border-teal/50 flex items-center justify-center gap-2"
                    style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
                    <span>⊕</span> Add custom field
                  </button>
                )}

                {/* User notes */}
                {(project.description || project.went_well || project.improvements || project.lessons) && (
                  <div className="border-t pt-4" style={{ borderColor: '#ddd5c4' }}>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Your Notes</div>
                    <div className="space-y-3">
                      {project.description && <Card className="p-3"><div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: '#6b6456' }}>Description</div><p className="text-sm">{project.description}</p></Card>}
                      <div className="grid grid-cols-2 gap-3">
                        {project.went_well && <Card className="p-3"><div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: '#3d5c3a' }}>What went well</div><p className="text-sm">{project.went_well}</p></Card>}
                        {project.improvements && <Card className="p-3"><div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: '#b04030' }}>Improvements</div><p className="text-sm">{project.improvements}</p></Card>}
                      </div>
                      {project.lessons && <Card className="p-3" style={{ background: '#faf4e2', border: '1px solid rgba(184,150,46,.3)' }}><div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: '#b8962e' }}>Key Lessons</div><p className="text-sm">{project.lessons}</p></Card>}
                    </div>
                  </div>
                )}

                {team.length > 0 && (
                  <Card className="p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Team</div>
                    <div className="flex flex-wrap gap-3">
                      {team.map(m => (
                        <div key={m.id} className="flex items-center gap-2 text-xs">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: m.color || '#2d6b78' }}>
                            {m.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div><div className="font-medium">{m.name}</div><div style={{ color: '#6b6456' }}>{m.role}</div></div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── TAB: WRITING ANALYSIS ── */}
            {activeTab === 'writing' && (
              <div className="space-y-4">
                {!hasWritingAnalysis ? (
                  <div className="text-center py-10">
                    <div className="text-3xl mb-3 opacity-25">✍</div>
                    <p className="text-sm mb-2" style={{ color: '#6b6456' }}>
                      {project.indexing_status === 'indexing' || reindexing ? 'Analysis in progress…' : 'Writing analysis not yet available.'}
                    </p>
                    {project.indexing_status === 'complete' && !reindexing && (
                      <Btn variant="teal" onClick={reindex}>⟳ Run Writing Analysis</Btn>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      {[{ label: 'Writing Quality', score: wq, icon: '✍' }, { label: 'Approach Quality', score: aq, icon: '⟳' }, { label: 'Credibility Signals', score: cq, icon: '◎' }].map(({ label, score, icon }) => (
                        <Card key={label} className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-semibold">{icon} {label}</div>
                            <div className="font-mono text-lg font-bold" style={{ color: score.overall_score >= 75 ? '#3d5c3a' : score.overall_score >= 55 ? '#b8962e' : '#b04030' }}>{score.overall_score}/100</div>
                          </div>
                          {(score.strengths || []).map(s => <Indicator key={s} type="positive">{s}</Indicator>)}
                          {(score.weaknesses || []).map(s => <Indicator key={s} type="negative">{s}</Indicator>)}
                        </Card>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Card className="p-4">
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Writing Detail</div>
                        <ScoreBar label="Specificity of claims" value={wq.specificity_score} note={wq.specificity_notes} />
                        <ScoreBar label="Evidence density" value={wq.evidence_density} note={wq.evidence_notes} />
                        <ScoreBar label="Client language mirroring" value={wq.client_language_mirroring} note={wq.client_language_notes} />
                        <ScoreBar label="Executive summary" value={wq.executive_summary_effectiveness} note={wq.exec_summary_notes} />
                      </Card>
                      <Card className="p-4">
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Approach Detail</div>
                        <ScoreBar label="Methodology clarity" value={aq.methodology_clarity} note={aq.methodology_notes} />
                        <ScoreBar label="Phasing logic" value={aq.phasing_logic} note={aq.phasing_notes} />
                        <ScoreBar label="Risk acknowledgement" value={aq.risk_acknowledgement} note={aq.risk_notes} />
                        <ScoreBar label="Innovation evidence" value={aq.innovation_evidence} note={aq.innovation_notes} />
                      </Card>
                    </div>

                    {(meta.standout_sentences || []).length > 0 && (
                      <Card className="p-4" style={{ background: '#faf4e2', border: '1px solid rgba(184,150,46,.3)' }}>
                        <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#b8962e' }}>Standout Sentences</div>
                        {meta.standout_sentences.map((s, i) => (
                          <blockquote key={i} className="text-sm italic leading-relaxed border-l-2 pl-3 mb-2 last:mb-0" style={{ borderColor: '#b8962e', color: '#5a4810' }}>"{s}"</blockquote>
                        ))}
                      </Card>
                    )}

                    <div className="flex justify-end">
                      <Btn variant="ghost" size="sm" onClick={reindex} disabled={reindexing}>
                        {reindexing ? <><Spinner size={12} /> Re-analysing…</> : '⟳ Re-run Analysis'}
                      </Btn>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── TAB: AI METADATA (editable) ── */}
            {activeTab === 'metadata' && (
              <div className="space-y-4">
                <p className="text-xs" style={{ color: '#6b6456' }}>Click ✕ to remove a tag. Type and press Enter to add. Changes save immediately.</p>
                {meta.executive_summary && (
                  <Card className="p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>AI Summary</div>
                    <p className="text-sm leading-relaxed">{meta.executive_summary}</p>
                  </Card>
                )}
                {[
                  ['key_themes', 'Key Themes', '#1e4a52', '#e8f2f4'],
                  ['deliverables', 'Deliverables', '#3d5c3a', '#edf3ec'],
                  ['methodologies', 'Methodologies', '#3d5c3a', '#edf3ec'],
                  ['tools_technologies', 'Tools & Technologies', '#6b6456', '#f0ebe0'],
                  ['client_pain_points', 'Client Pain Points', '#8a6200', '#faf4e2'],
                  ['value_propositions', 'Value Propositions', '#1e4a52', '#e8f2f4'],
                  ['win_indicators', 'Win Indicators', '#3d5c3a', '#edf3ec'],
                  ['loss_risks', 'Loss Risks', '#b04030', '#faeeeb'],
                ].map(([field, label, color, bg]) => (
                  <Card key={field} className="p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>{label}</div>
                    <TagList items={meta[field] || []} color={color} bg={bg} onSave={tags => saveMetaField(field, tags)} />
                  </Card>
                ))}
              </div>
            )}

            {/* ── TAB: PROJECT NARRATIVE ── */}
            {activeTab === 'narrative' && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-serif text-base mb-1">Project Narrative</h3>
                  <p className="text-xs" style={{ color: '#6b6456' }}>
                    A running log of what happened on this project — built by the people who worked on it. Add win factors, loss factors, client feedback, delivery notes and lessons. Multiple team members can contribute. The AI uses these entries to improve future matching.
                  </p>
                </div>

                {/* AI-inferred context from metadata */}
                {(meta.win_indicators?.length > 0 || meta.loss_risks?.length > 0) && (
                  <Card className="p-4" style={{ background: '#f8f6f2', border: '1px solid #ddd5c4' }}>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>AI Inferred from Document</div>
                    <p className="text-xs mb-3" style={{ color: '#6b6456' }}>These are what the AI extracted from the document. Add your own entries below to give the human narrative.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(meta.win_indicators || []).slice(0, 3).map((s, i) => <Indicator key={i} type="positive">{s}</Indicator>)}
                      {(meta.loss_risks || []).slice(0, 3).map((s, i) => <Indicator key={i} type="negative">{s}</Indicator>)}
                    </div>
                  </Card>
                )}

                {/* Existing entries */}
                {narrativeEntries.length > 0 && (
                  <div className="space-y-2">
                    {narrativeEntries.map(entry => {
                      const ec = ENTRY_COLORS[entry.entry_type] || ENTRY_COLORS.note;
                      return (
                        <div key={entry.id} className="rounded-lg p-4 border group relative" style={{ background: ec.bg, borderColor: ec.border || '#ddd5c4' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-mono font-bold w-4 text-center" style={{ color: ec.color }}>{ec.icon}</span>
                              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: ec.color }}>
                                {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label || 'Note'}
                              </span>
                              <span className="text-[10px]" style={{ color: '#9b8e80' }}>
                                {entry.user_name} · {new Date(entry.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <button onClick={() => deleteNarrativeEntry(entry.id)}
                              className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-[10px] flex-shrink-0" style={{ color: '#b04030' }}>✕</button>
                          </div>
                          <p className="text-sm leading-relaxed" style={{ color: ec.color }}>{entry.content}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {narrativeEntries.length === 0 && (
                  <div className="text-center py-6 rounded-lg border-2 border-dashed" style={{ borderColor: '#ddd5c4' }}>
                    <div className="text-2xl mb-2 opacity-30">📝</div>
                    <p className="text-sm" style={{ color: '#6b6456' }}>No entries yet. Add the first one below.</p>
                  </div>
                )}

                {/* Add entry */}
                <Card className="p-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Add Entry</div>
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {ENTRY_TYPES.map(t => {
                        const ec = ENTRY_COLORS[t.value];
                        return (
                          <button key={t.value} onClick={() => setEntryType(t.value)}
                            className="text-[11px] font-mono px-2.5 py-1 rounded border transition-all"
                            style={{
                              background: entryType === t.value ? ec.bg : 'white',
                              borderColor: entryType === t.value ? ec.color : '#ddd5c4',
                              color: entryType === t.value ? ec.color : '#6b6456',
                            }}>
                            {ec.icon} {t.label}
                          </button>
                        );
                      })}
                    </div>
                    <textarea value={newEntry} onChange={e => setNewEntry(e.target.value)}
                      rows={3} placeholder="Describe what happened, what you learned, or what made the difference…"
                      className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]"
                      style={{ borderColor: '#ddd5c4', resize: 'vertical' }} />
                  </div>
                  <Btn variant="teal" onClick={addNarrativeEntry} disabled={savingEntry || !newEntry.trim()}>
                    {savingEntry ? <><Spinner size={12} /> Saving…</> : '⊕ Add Entry'}
                  </Btn>
                </Card>
              </div>
            )}
          </div>

          {/* Right panel */}
          <aside className="w-60 flex-shrink-0 overflow-y-auto p-4 space-y-3 border-l" style={{ background: '#f0ebe0', borderColor: '#ddd5c4' }}>
            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Project Info</div>
              {[['Sector', project.sector], ['Type', project.project_type], ['Submitted', project.date_submitted], ['Status', project.indexing_status]].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b last:border-0 text-xs" style={{ borderColor: '#f0ebe0' }}>
                  <span style={{ color: '#6b6456' }}>{k}</span><span className="font-medium">{v}</span>
                </div>
              ))}
            </Card>

            {hasWritingAnalysis && (
              <Card className="p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Quality Scores</div>
                {[['Writing', wq.overall_score], ['Approach', aq.overall_score], ['Credibility', cq.overall_score]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="mb-2">
                    <div className="flex justify-between text-xs mb-1"><span style={{ color: '#6b6456' }}>{k}</span><span className="font-mono font-medium" style={{ color: v >= 75 ? '#3d5c3a' : v >= 55 ? '#b8962e' : '#b04030' }}>{v}/100</span></div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e8e0d0' }}>
                      <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 75 ? '#3d5c3a' : v >= 55 ? '#b8962e' : '#b04030' }} />
                    </div>
                  </div>
                ))}
              </Card>
            )}

            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Knowledge Quality</div>
              {[['Recency', project.kqs_recency], ['Outcome', project.kqs_outcome_quality], ['Specificity', project.kqs_specificity]].map(([k, v]) => (
                <div key={k} className="mb-2">
                  <div className="flex justify-between text-xs mb-0.5"><span style={{ color: '#6b6456' }}>{k}</span><span className="font-mono">{Math.round((v || 0) * 100)}%</span></div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#e8e0d0' }}>
                    <div className="h-full rounded-full" style={{ width: `${(v || 0) * 100}%`, background: '#1e4a52' }} />
                  </div>
                </div>
              ))}
            </Card>

            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Re-analyse</div>
              <p className="text-[11px] mb-2" style={{ color: '#6b6456' }}>Re-run AI on uploaded document to refresh scores.</p>
              <Btn variant="ghost" size="sm" onClick={reindex} disabled={reindexing} className="w-full justify-center">
                {reindexing ? <><Spinner size={12} /> Analysing…</> : '⟳ Re-analyse'}
              </Btn>
            </Card>

            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Narrative Entries</div>
              <div className="text-xs mb-2" style={{ color: '#6b6456' }}>{narrativeEntries.length} entr{narrativeEntries.length !== 1 ? 'ies' : 'y'}</div>
              <Btn variant="ghost" size="sm" onClick={() => setActiveTab('narrative')} className="w-full justify-center">Add Entry →</Btn>
            </Card>
          </aside>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />

      {/* Post-project capture modal */}
      {showCaptureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(15,14,12,.65)', backdropFilter:'blur(4px)' }}>
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden" style={{ width: 520, maxWidth: '95vw' }}>
            <div className="px-6 py-5 border-b" style={{ background:'linear-gradient(135deg,#1e4a52,#2d6b78)' }}>
              <h2 className="font-serif text-lg text-white mb-1">Capture What Happened</h2>
              <p className="text-sm text-white/70">
                This project is marked as <strong className="text-white">{project.outcome}</strong>. Three quick questions — your answers improve future matching.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['what_won_lost', project.outcome === 'won' ? 'What specifically won this bid?' : 'What specifically lost this bid?', 'The client mentioned our phased approach reduced their perceived risk…'],
                ['do_differently', 'What would you do differently next time?', 'We would lead with data residency credentials earlier in the response…'],
                ['client_feedback', 'Any direct client feedback? (optional)', 'The evaluation panel said our pricing was competitive but…'],
              ].map(([key, label, placeholder]) => (
                <div key={key}>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color:'#6b6456' }}>{label}</label>
                  <textarea value={captureForm[key]} onChange={e => setCaptureForm(p => ({ ...p, [key]: e.target.value }))}
                    rows={2} placeholder={placeholder}
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]"
                    style={{ borderColor:'#ddd5c4', resize:'vertical' }} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor:'#ddd5c4', background:'#f8f6f2' }}>
              <button onClick={() => setShowCaptureModal(false)} className="text-sm" style={{ color:'#6b6456' }}>Skip for now</button>
              <div className="flex gap-3">
                <button onClick={() => setShowCaptureModal(false)} className="text-sm px-4 py-2 rounded-md border" style={{ borderColor:'#ddd5c4', color:'#6b6456' }}>Later</button>
                <button onClick={saveCapture} disabled={savingCapture || !Object.values(captureForm).some(v => v.trim())}
                  className="text-sm px-4 py-2 rounded-md font-medium text-white disabled:opacity-40"
                  style={{ background:'#1e4a52' }}>
                  {savingCapture ? 'Saving…' : 'Save Learning'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
