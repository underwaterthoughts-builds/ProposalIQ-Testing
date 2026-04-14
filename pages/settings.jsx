import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../components/Layout';
import { Card, Btn, Input, Select, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';

export default function Settings() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [form, setForm] = useState({ org_name: '', target_margin: '30', default_currency: 'GBP' });
  const [showClearProfileModal, setShowClearProfileModal] = useState(false);
  const [clearingProfile, setClearingProfile] = useState(false);
  const [info, setInfo] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const [prompts, setPrompts] = useState([]);
  const [taxonomy, setTaxonomy] = useState([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Service Offering');
  const [editingTaxId, setEditingTaxId] = useState(null);
  const [editingTaxName, setEditingTaxName] = useState('');
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [promptContent, setPromptContent] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      setForm({ org_name: d.org_name || '', target_margin: d.target_margin || '30', default_currency: d.default_currency || 'GBP' });
      setInfo({ gemini_model: d.gemini_model, has_api_key: d.has_api_key, has_openai: d.has_openai, openai_model: d.openai_model });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'prompts' && prompts.length === 0) {
      setPromptsLoading(true);
      fetch('/api/prompts').then(r => r.json()).then(d => {
        setPrompts(d.prompts || []);
        if (d.prompts?.length > 0 && !selectedPrompt) {
          setSelectedPrompt(d.prompts[0]);
          setPromptContent(d.prompts[0].content);
        }
        setPromptsLoading(false);
      }).catch(() => setPromptsLoading(false));
    }
    if (activeTab === 'taxonomy' && taxonomy.length === 0) {
      setTaxonomyLoading(true);
      fetch('/api/taxonomy').then(r => r.json()).then(d => {
        setTaxonomy(d.items || []);
        setTaxonomyLoading(false);
      }).catch(() => setTaxonomyLoading(false));
    }
  }, [activeTab]);

  async function addTaxItem() {
    if (!newItemName.trim()) return;
    const r = await fetch('/api/taxonomy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newItemName.trim(), category: newItemCategory }) });
    const d = await r.json();
    setTaxonomy(prev => [...prev, { id: d.id, name: newItemName.trim(), category: newItemCategory, is_default: 0 }]);
    setNewItemName('');
    setToast('Added');
  }

  async function renameTaxItem(id) {
    if (!editingTaxName.trim()) return;
    await fetch('/api/taxonomy', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: editingTaxName.trim() }) });
    setTaxonomy(prev => prev.map(i => i.id === id ? { ...i, name: editingTaxName.trim() } : i));
    setEditingTaxId(null);
    setToast('Saved');
  }

  async function deleteTaxItem(id) {
    if (!confirm('Delete this taxonomy item?')) return;
    await fetch('/api/taxonomy', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setTaxonomy(prev => prev.filter(i => i.id !== id));
    setToast('Deleted');
  }

  function selectPrompt(p) {
    setSelectedPrompt(p);
    setPromptContent(p.content);
  }

  async function savePrompt() {
    if (!selectedPrompt) return;
    setSavingPrompt(true);
    await fetch('/api/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_key: selectedPrompt.prompt_key, content: promptContent }),
    });
    setPrompts(prev => prev.map(p => p.prompt_key === selectedPrompt.prompt_key ? { ...p, content: promptContent, is_modified: promptContent !== p.default_content } : p));
    setSelectedPrompt(prev => ({ ...prev, content: promptContent, is_modified: promptContent !== prev.default_content }));
    setSavingPrompt(false);
    setToast('Prompt saved');
  }

  async function resetPrompt() {
    if (!selectedPrompt || !confirm('Reset this prompt to the default template?')) return;
    setSavingPrompt(true);
    const r = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_key: selectedPrompt.prompt_key }),
    });
    const d = await r.json();
    setPromptContent(d.content);
    setPrompts(prev => prev.map(p => p.prompt_key === selectedPrompt.prompt_key ? { ...p, content: d.content, is_modified: false } : p));
    setSelectedPrompt(prev => ({ ...prev, content: d.content, is_modified: false }));
    setSavingPrompt(false);
    setToast('Reset to default template');
  }

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setToast('Settings saved');
    } catch { setToast('Save failed'); }
    setSaving(false);
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Clear the organisation profile so the user can set up a different
  // company. Deletes ONLY the profile row and resets settings.org_name —
  // all projects, RFP scans, team members, drafts, and other data stay.
  async function clearOrganisationProfile() {
    setClearingProfile(true);
    try {
      const r = await fetch('/api/onboarding/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setToast(err.error || 'Failed to clear profile');
        setClearingProfile(false);
        return;
      }
      setForm(p => ({ ...p, org_name: '' }));
      setShowClearProfileModal(false);
      router.push('/onboarding/profile');
    } catch (e) {
      setToast('Failed to clear profile: ' + e.message);
      setClearingProfile(false);
    }
  }

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Settings — ProposalIQ</title></Head>
      <Layout title="Settings" subtitle="Platform configuration" user={user}>
        <div className="flex flex-col h-full overflow-hidden bg-surface">

          {/* Editorial header */}
          <header className="px-8 pt-12 pb-8">
            <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tight text-on-surface mb-2">Settings</h1>
            <p className="text-on-surface-variant font-body">Configure ProposalIQ workspace intelligence and data governance.</p>
          </header>

          {/* Bento-style tabs */}
          <div className="px-8 mb-8">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {[['general','General'],['ai','AI Configuration'],['costs','AI Costs'],['prompts','AI Prompts'],['taxonomy','Taxonomy'],['storage','Data & Storage']].map(([id,label], i) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex flex-col gap-2 p-4 text-left transition-colors ${
                      active
                        ? 'bg-surface-container-low border-b-2 border-primary-container text-primary'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low border-b-2 border-transparent'
                    }`}
                  >
                    <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                      Section {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-medium text-sm">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 pb-8 bg-surface">

            {activeTab === 'general' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <Card className="p-5">
                  <h2 className="font-serif text-base mb-4">Organisation</h2>
                  <div className="space-y-4">
                    <Input label="Organisation Name" value={form.org_name} onChange={e => f('org_name', e.target.value)} placeholder="Acme Consulting" />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Target Margin %" type="number" value={form.target_margin} onChange={e => f('target_margin', e.target.value)} placeholder="30" hint="Used in financial modelling on RFP scans" />
                      <Select label="Default Currency" value={form.default_currency} onChange={e => f('default_currency', e.target.value)}>
                        {['GBP','USD','EUR','AUD','CAD','CHF','AED'].map(c => <option key={c}>{c}</option>)}
                      </Select>
                    </div>
                  </div>
                </Card>
                <Card className="p-5" style={{ background: '#fbf9f4' }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h2 className="font-serif text-base mb-1">Organisation Profile</h2>
                      <p className="text-xs mb-3" style={{ color: '#6b6456' }}>
                        Tell ProposalIQ what you actually do. The AI will scan your website and pull
                        out services, client types, and positioning — you confirm the list. Your confirmed
                        profile cascades into gap analysis, win strategy, executive brief, and section
                        drafts so recommendations are grounded in your real capabilities.
                      </p>
                      <div className="flex gap-3 flex-wrap">
                        <a href="/onboarding/profile" className="text-xs font-medium inline-flex items-center gap-1" style={{ color: '#1e4a52' }}>
                          Set up or edit your profile →
                        </a>
                        <a href="/onboarding/profile" className="text-xs inline-flex items-center gap-1" style={{ color: '#6b6456' }}>
                          Change company details
                        </a>
                      </div>
                    </div>
                    <div className="text-3xl opacity-30">★</div>
                  </div>
                </Card>
                <div className="flex justify-end">
                  <Btn variant="teal" onClick={save} disabled={saving}>
                    {saving ? <><Spinner size={12} /> Saving…</> : 'Save Settings'}
                  </Btn>
                </div>

                {/* ── Clear organisation profile ─────────────────────── */}
                <Card className="p-5 mt-8" style={{ borderColor: '#ddd5c4', background: '#fbf9f4' }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h2 className="font-serif text-base mb-1">Switch to a different company</h2>
                      <p className="text-xs mb-3" style={{ color: '#6b6456' }}>
                        Clears your organisation name, website URL, and confirmed offerings so you can
                        set up a different company's profile. Projects, RFP scans, team members,
                        drafts, and all other data are kept.
                      </p>
                      <button onClick={() => setShowClearProfileModal(true)}
                        className="text-xs px-3 py-2 rounded border font-medium"
                        style={{ borderColor: '#ddd5c4', color: '#1e4a52', background: 'white' }}>
                        ↺ Clear organisation profile
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === 'costs' && <AiCostsTab />}

            {activeTab === 'ai' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <Card className="p-5">
                  <h2 className="font-serif text-base mb-4">AI Configuration</h2>
                  <div className="space-y-0">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-2 mt-1" style={{ color:'#6b6456' }}>Gemini — Fast tasks &amp; embeddings</div>
                    {[['API Key', info.has_api_key ? 'Configured' : 'Not set — required', info.has_api_key ? '#6ab187' : '#b04030'],
                      ['Model', info.gemini_model || 'gemini-2.5-flash', null]].map(([l,v,dot]) => (
                      <div key={l} className="flex items-center justify-between py-2.5 border-b text-sm" style={{ borderColor:'#f0ebe0' }}>
                        <span style={{ color:'#6b6456' }}>{l}</span>
                        <div className="flex items-center gap-2">
                          {dot && <div className="w-2 h-2 rounded-full" style={{ background: dot }} />}
                          <span className="font-mono text-xs">{v}</span>
                        </div>
                      </div>
                    ))}

                    <div className="text-[10px] font-mono uppercase tracking-widest mb-2 mt-4" style={{ color:'#6b6456' }}>OpenAI — Deep analysis &amp; document scanning</div>
                    {[['API Key', info.has_openai ? 'Configured' : 'Not set — falls back to Gemini', info.has_openai ? '#6ab187' : '#b8962e'],
                      ['Model', info.openai_model || 'gpt-4.5-preview', null]].map(([l,v,dot]) => (
                      <div key={l} className="flex items-center justify-between py-2.5 border-b text-sm" style={{ borderColor:'#f0ebe0' }}>
                        <span style={{ color:'#6b6456' }}>{l}</span>
                        <div className="flex items-center gap-2">
                          {dot && <div className="w-2 h-2 rounded-full" style={{ background: dot }} />}
                          <span className="font-mono text-xs">{v}</span>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs mt-3" style={{ color:'#6b6456' }}>
                      Set API keys in Railway → Variables tab. Use OPENAI_MODEL and GEMINI_MODEL variables to override model names.
                    </p>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === 'prompts' && (
              <div className="flex gap-5 h-full" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                {/* Prompt list */}
                <div className="w-56 flex-shrink-0 space-y-1">
                  <p className="text-xs mb-3" style={{ color:'#6b6456' }}>Select a prompt to view and edit. Modified prompts are marked with ✎.</p>
                  {promptsLoading ? <Spinner /> : prompts.map(p => (
                    <button key={p.prompt_key} onClick={() => selectPrompt(p)}
                      className={`w-full text-left px-3 py-2.5 rounded-md transition-all text-sm ${selectedPrompt?.prompt_key === p.prompt_key ? 'bg-white shadow-sm font-medium' : 'hover:bg-white/60'}`}
                      style={{ background: selectedPrompt?.prompt_key === p.prompt_key ? 'white' : 'transparent' }}>
                      <div className="flex items-center justify-between">
                        <span>{p.prompt_label}</span>
                        {p.is_modified && <span className="text-[10px]" style={{ color:'#b8962e' }}>✎</span>}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Prompt editor */}
                <div className="flex-1 flex flex-col min-w-0">
                  {!selectedPrompt ? (
                    <div className="text-center py-12"><p className="text-sm" style={{ color:'#6b6456' }}>Select a prompt to edit.</p></div>
                  ) : (
                    <Card className="flex-1 flex flex-col p-5 overflow-hidden">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-serif text-base">{selectedPrompt.prompt_label}</h3>
                          <p className="text-xs mt-0.5" style={{ color:'#6b6456' }}>{selectedPrompt.prompt_description}</p>
                        </div>
                        <div className="flex gap-2">
                          {selectedPrompt.is_modified && (
                            <Btn variant="ghost" size="sm" onClick={resetPrompt} disabled={savingPrompt}>
                              ↺ Reset to Template
                            </Btn>
                          )}
                          <Btn variant="teal" size="sm" onClick={savePrompt} disabled={savingPrompt || promptContent === selectedPrompt.content}>
                            {savingPrompt ? <><Spinner size={12}/> Saving…</> : 'Save Prompt'}
                          </Btn>
                        </div>
                      </div>

                      {selectedPrompt.is_modified && (
                        <div className="rounded-md px-3 py-2 mb-3 text-xs" style={{ background:'#faf4e2', color:'#8a6200' }}>
                          ✎ This prompt has been modified from the default template. Click "Reset to Template" to restore the original.
                        </div>
                      )}

                      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#6b6456' }}>
                        System Instruction — this is prepended to every AI call for this function
                      </div>
                      <textarea
                        value={promptContent}
                        onChange={e => setPromptContent(e.target.value)}
                        className="flex-1 w-full px-4 py-3 border rounded-md text-sm font-mono outline-none focus:border-[#1e4a52] leading-relaxed"
                        style={{ borderColor:'#ddd5c4', resize:'none', minHeight: 300, background:'#faf7f2' }}
                      />
                      <p className="text-[10px] mt-2" style={{ color:'#9b8e80' }}>
                        Changes apply to the next scan or analysis — existing results are not affected. The JSON schema and output format are controlled separately and cannot be modified here.
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'taxonomy' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <Card className="p-5">
                  <h2 className="font-serif text-base mb-1">Service Offering & Sector Taxonomy</h2>
                  <p className="text-xs mb-5" style={{ color:'#6b6456' }}>
                    Centrally managed tags used for proposal classification, directory browsing, and RFP matching. Add your own or edit the defaults.
                  </p>

                  {/* Add new item */}
                  <div className="flex gap-2 mb-5">
                    <select value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}
                      className="px-3 py-2 border rounded-md text-sm outline-none" style={{ borderColor:'#ddd5c4', minWidth: 160 }}>
                      <option>Service Offering</option>
                      <option>Sector</option>
                    </select>
                    <input value={newItemName} onChange={e => setNewItemName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTaxItem()}
                      placeholder="Add new item…"
                      className="flex-1 px-3 py-2 border rounded-md text-sm outline-none focus:border-teal" style={{ borderColor:'#ddd5c4' }} />
                    <Btn variant="teal" onClick={addTaxItem} disabled={!newItemName.trim()}>Add</Btn>
                  </div>

                  {taxonomyLoading ? <div className="flex justify-center py-6"><Spinner /></div> : (
                    ['Service Offering', 'Sector'].map(cat => {
                      const items = taxonomy.filter(i => i.category === cat);
                      if (!items.length) return null;
                      return (
                        <div key={cat} className="mb-5">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color:'#6b6456' }}>{cat}</div>
                          <div className="space-y-1">
                            {items.map(item => (
                              <div key={item.id} className="flex items-center gap-2 py-2 px-3 rounded-lg group" style={{ background:'#f8f6f2' }}>
                                {editingTaxId === item.id ? (
                                  <>
                                    <input autoFocus value={editingTaxName} onChange={e => setEditingTaxName(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') renameTaxItem(item.id); if (e.key === 'Escape') setEditingTaxId(null); }}
                                      className="flex-1 px-2 py-1 border rounded text-sm outline-none" style={{ borderColor:'#1e4a52' }} />
                                    <button onClick={() => renameTaxItem(item.id)} className="text-xs px-2 py-1 rounded text-white no-min-h" style={{ background:'#1e4a52' }}>✓</button>
                                    <button onClick={() => setEditingTaxId(null)} className="text-xs px-1.5 py-1 rounded no-min-h" style={{ color:'#6b6456' }}>✕</button>
                                  </>
                                ) : (
                                  <>
                                    <span className="flex-1 text-sm">{item.name}</span>
                                    {item.is_default ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#9b8e80' }}>default</span> : null}
                                    <div className="hidden group-hover:flex gap-1">
                                      <button onClick={() => { setEditingTaxId(item.id); setEditingTaxName(item.name); }}
                                        className="text-xs px-2 py-1 rounded no-min-h hover:bg-black/5" style={{ color:'#6b6456' }}>✎</button>
                                      <button onClick={() => deleteTaxItem(item.id)}
                                        className="text-xs px-2 py-1 rounded no-min-h hover:bg-red-50" style={{ color:'#b04030' }}>✕</button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>
              </div>
            )}

            {activeTab === 'storage' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <Card className="p-5">
                  <h2 className="font-serif text-base mb-4">Data &amp; Storage</h2>
                  <div className="space-y-1 text-sm">
                    {[
                      ['Database', '/app/data/proposaliq.db'],
                      ['Uploaded files', '/app/data/uploads/'],
                      ['RFP files', '/app/data/uploads/rfp_scans/'],
                      ['Team CVs', '/app/data/uploads/team_cvs/'],
                      ['Win patterns cache', '/app/data/win_patterns_cache.json'],
                    ].map(([label, loc]) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor:'#f0ebe0' }}>
                        <span style={{ color:'#6b6456' }}>{label}</span>
                        <code className="text-xs px-2 py-0.5 rounded" style={{ background:'#f0ebe0', color:'#1e4a52' }}>{loc}</code>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-3" style={{ color:'#6b6456' }}>
                    All persistent data is stored in the Railway volume mounted at <code style={{ background:'#f0ebe0', padding:'0 4px', borderRadius:3 }}>/app/data</code>.
                  </p>
                </Card>
              </div>
            )}

          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />

      {/* Clear organisation profile confirmation modal */}
      {showClearProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,14,12,.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !clearingProfile) setShowClearProfileModal(false); }}>
          <div className="rounded-xl bg-white w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b" style={{ borderColor: '#ddd5c4' }}>
              <h2 className="font-serif text-xl">Clear organisation profile?</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm mb-3" style={{ color: '#1a1816' }}>
                This will delete your organisation name, website URL, extracted website scan,
                and confirmed offerings. You'll be taken back to onboarding to set up a different company.
              </p>
              <p className="text-xs mb-4" style={{ color: '#6b6456' }}>
                Your projects, RFP scans, team members, drafts, and all other data are <strong>kept</strong>.
                Only the organisation profile itself is cleared.
              </p>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#ddd5c4', background: '#faf7f2' }}>
              <button onClick={() => setShowClearProfileModal(false)}
                disabled={clearingProfile}
                className="text-xs px-4 py-2 rounded-lg" style={{ color: '#6b6456' }}>
                Cancel
              </button>
              <button onClick={clearOrganisationProfile}
                disabled={clearingProfile}
                className="text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                style={{ background: '#1e4a52', color: 'white' }}>
                {clearingProfile ? <><Spinner size={12} /> Clearing…</> : 'Clear profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── AI Costs Tab ─────────────────────────────────────────────────────────
function AiCostsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai-costs').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center gap-2 py-12 justify-center" style={{color:'#6b6456'}}><Spinner/> Loading costs…</div>;
  if (!data || !data.total) return <div className="text-center py-12 text-sm" style={{color:'#6b6456'}}>No cost data yet. Costs are tracked from the first AI call after this update deploys.</div>;

  const CATEGORY_LABELS = {
    rfp_scan: 'RFP Intelligence scans',
    proposal_analysis: 'Proposal analysis (upload/reindex)',
    proposal_generation: 'Full proposal generation',
    unknown: 'Other / uncategorised',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Total spend */}
      <Card className="p-5">
        <h2 className="font-serif text-base mb-4">Total AI Spend</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            ['Total cost', `$${data.total.cost.toFixed(2)}`],
            ['API calls', data.total.calls.toLocaleString()],
            ['Input tokens', `${(data.total.input_tokens / 1000).toFixed(0)}K`],
            ['Output tokens', `${(data.total.output_tokens / 1000).toFixed(0)}K`],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>{label}</div>
              <div className="font-serif text-xl">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* By category — the main breakdown the user asked for */}
      <Card className="p-5">
        <h2 className="font-serif text-base mb-4">Spend by Feature</h2>
        {data.by_category.length === 0 ? (
          <p className="text-sm" style={{color:'#6b6456'}}>No data yet.</p>
        ) : (
          <div className="space-y-3">
            {data.by_category.map(c => {
              const pct = data.total.cost > 0 ? Math.round((c.cost / data.total.cost) * 100) : 0;
              return (
                <div key={c.category}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm font-medium">{CATEGORY_LABELS[c.category] || c.category}</span>
                    <span className="font-mono text-sm font-semibold" style={{color:'#1e4a52'}}>${c.cost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'#f0ebe0'}}>
                      <div className="h-full rounded-full" style={{width:`${pct}%`, background:'#1e4a52'}} />
                    </div>
                    <span className="text-[10px] font-mono" style={{color:'#9b8e80'}}>{pct}% · {c.calls} calls</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* By model */}
      <Card className="p-5">
        <h2 className="font-serif text-base mb-4">Spend by Model</h2>
        <div className="rounded-lg border overflow-hidden" style={{borderColor:'#ddd5c4'}}>
          <div className="grid text-[10px] font-mono uppercase tracking-widest px-4 py-2" style={{gridTemplateColumns:'1fr 80px 80px 80px', background:'#f0ebe0', color:'#6b6456'}}>
            <span>Model</span><span className="text-right">Cost</span><span className="text-right">Calls</span><span className="text-right">Tokens</span>
          </div>
          {data.by_model.map(m => (
            <div key={m.model} className="grid items-center px-4 py-2 border-t text-xs" style={{gridTemplateColumns:'1fr 80px 80px 80px', borderColor:'#f0ebe0'}}>
              <span className="font-mono">{m.model}</span>
              <span className="text-right font-mono font-semibold" style={{color:'#1e4a52'}}>${m.cost.toFixed(2)}</span>
              <span className="text-right font-mono" style={{color:'#6b6456'}}>{m.calls}</span>
              <span className="text-right font-mono" style={{color:'#6b6456'}}>{((m.input_tokens + m.output_tokens) / 1000).toFixed(0)}K</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Most expensive functions */}
      <Card className="p-5">
        <h2 className="font-serif text-base mb-4">Most Expensive Functions</h2>
        <div className="rounded-lg border overflow-hidden" style={{borderColor:'#ddd5c4'}}>
          <div className="grid text-[10px] font-mono uppercase tracking-widest px-4 py-2" style={{gridTemplateColumns:'1fr 1fr 70px 50px 70px', background:'#f0ebe0', color:'#6b6456'}}>
            <span>Function</span><span>Category</span><span className="text-right">Total</span><span className="text-right">Calls</span><span className="text-right">Avg/call</span>
          </div>
          {data.by_function.slice(0, 10).map(f => (
            <div key={f.function_name} className="grid items-center px-4 py-2 border-t text-xs" style={{gridTemplateColumns:'1fr 1fr 70px 50px 70px', borderColor:'#f0ebe0'}}>
              <span className="font-mono truncate">{f.function_name}</span>
              <span className="font-mono truncate" style={{color:'#6b6456'}}>{CATEGORY_LABELS[f.category] || f.category}</span>
              <span className="text-right font-mono font-semibold" style={{color:'#1e4a52'}}>${f.cost.toFixed(2)}</span>
              <span className="text-right font-mono" style={{color:'#6b6456'}}>{f.calls}</span>
              <span className="text-right font-mono" style={{color:'#9b8e80'}}>${f.avg_cost_per_call.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Daily trend */}
      {data.daily.length > 0 && (
        <Card className="p-5">
          <h2 className="font-serif text-base mb-4">Last 7 Days</h2>
          <div className="space-y-2">
            {data.daily.map(d => (
              <div key={d.day} className="flex items-center justify-between text-xs">
                <span className="font-mono" style={{color:'#6b6456'}}>{d.day}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono" style={{color:'#9b8e80'}}>{d.calls} calls</span>
                  <span className="font-mono font-semibold" style={{color:'#1e4a52'}}>${(d.cost || 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
