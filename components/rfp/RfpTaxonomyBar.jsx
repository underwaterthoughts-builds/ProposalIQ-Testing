import { useEffect, useState, memo } from 'react';

// ── RFP Taxonomy Bar — shows classification tags above the tabs ──────────
// Displays client_industry, service_industry and their sectors so the user
// can verify at a glance that the AI classified correctly. Each tag is
// clickable to correct via inline dropdown. Saves via PATCH to rfp_scans.
const RfpTaxonomyBar = memo(function RfpTaxonomyBar({ scan, rfpData, scanId }) {
  const [editing, setEditing] = useState(null); // 'client_industry' | 'service_industry' | null
  const [saving, setSaving] = useState(false);

  const clientIndustry = scan.client_industry || null;
  const serviceIndustry = scan.service_industry || null;

  // Load taxonomy items for dropdowns — lazy, only when editing
  const [taxItems, setTaxItems] = useState(null);
  useEffect(() => {
    if (editing && !taxItems) {
      fetch('/api/taxonomy').then(r => r.json()).then(d => setTaxItems(d.items || [])).catch(e => console.error('[rfp] /api/taxonomy failed:', e.message));
    }
  }, [editing, taxItems]);

  async function saveTaxonomy(field, value) {
    setSaving(true);
    try {
      await fetch(`/api/rfp/${scanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_taxonomy', [field]: value }),
      });
      // Reload to pick up the change
      window.location.reload();
    } catch (e) { console.error('[rfp] saveTaxonomy failed:', e.message); }
    setSaving(false);
    setEditing(null);
  }

  const clientIndustries = (taxItems || []).filter(t => t.taxonomy_type === 'client' && t.category === 'Industry');
  const serviceIndustries = (taxItems || []).filter(t => t.taxonomy_type === 'service' && t.category === 'Industry');

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Client industry — gold accent */}
      {editing === 'client_industry' ? (
        <select
          autoFocus
          value={clientIndustry || ''}
          onChange={e => saveTaxonomy('client_industry', e.target.value)}
          onBlur={() => setEditing(null)}
          className="text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-full bg-surface-container-high text-primary border border-primary/30 outline-none"
        >
          <option value="">— Untagged —</option>
          {clientIndustries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
      ) : (
        <button
          onClick={() => setEditing('client_industry')}
          className={`px-3 py-1 text-[10px] font-label uppercase font-bold tracking-widest rounded-full border transition-colors flex items-center gap-1 hover:brightness-110 ${
            clientIndustry
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 border-dashed'
          }`}
          title="Click to change client industry"
          disabled={saving}
        >
          ◆ {clientIndustry || '+ Client sector'}
        </button>
      )}

      {/* Service industry — tertiary accent */}
      {editing === 'service_industry' ? (
        <select
          autoFocus
          value={serviceIndustry || ''}
          onChange={e => saveTaxonomy('service_industry', e.target.value)}
          onBlur={() => setEditing(null)}
          className="text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-full bg-surface-container-high text-tertiary border border-tertiary/30 outline-none"
        >
          <option value="">— Untagged —</option>
          {serviceIndustries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
      ) : (
        <button
          onClick={() => setEditing('service_industry')}
          className={`px-3 py-1 text-[10px] font-label uppercase font-bold tracking-widest rounded-full border transition-colors flex items-center gap-1 hover:brightness-110 ${
            serviceIndustry
              ? 'bg-tertiary-container/20 text-tertiary-container border-tertiary-container/20'
              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 border-dashed'
          }`}
          title="Click to change type of work"
          disabled={saving}
        >
          ◈ {serviceIndustry || '+ Type of work'}
        </button>
      )}
    </div>
  );
});

export default RfpTaxonomyBar;
