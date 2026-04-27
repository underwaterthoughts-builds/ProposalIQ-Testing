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
                <div className="bg-surface-container-low p-6">
                  <h2 className="font-headline text-lg text-on-surface mb-4">Organisation</h2>
                  <div className="space-y-5">
                    <DarkField label="Organisation Name" value={form.org_name} onChange={v => f('org_name', v)} placeholder="Acme Consulting" />
                    <div className="grid grid-cols-2 gap-4">
                      <DarkField label="Target Margin %" type="number" value={form.target_margin} onChange={v => f('target_margin', v)} placeholder="30" hint="Used in financial modelling on RFP scans" />
                      <DarkSelect label="Default Currency" value={form.default_currency} onChange={v => f('default_currency', v)}>
                        {['GBP','USD','EUR','AUD','CAD','CHF','AED'].map(c => <option key={c} className="bg-surface-container">{c}</option>)}
                      </DarkSelect>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-lowest p-6 border-l-2 border-primary">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h2 className="font-headline text-lg text-on-surface mb-2">Organisation Profile</h2>
                      <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
                        Tell ProposalIQ what you actually do. The AI will scan your website and pull
                        out services, client types, and positioning — you confirm the list. Your confirmed
                        profile cascades into gap analysis, win strategy, executive brief, and section
                        drafts so recommendations are grounded in your real capabilities.
                      </p>
                      <div className="flex gap-4 flex-wrap">
                        <a href="/onboarding/profile" className="text-xs font-label uppercase tracking-widest text-primary hover:brightness-110">
                          Set up or edit your profile →
                        </a>
                        <a href="/onboarding/profile" className="text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
                          Change company details
                        </a>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-3xl text-primary/40">auto_awesome</span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="bg-primary text-on-primary px-6 py-3 text-xs font-label uppercase tracking-widest font-bold disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Settings'}
                  </button>
                </div>

                {/* Clear organisation profile */}
                <div className="bg-surface-container-lowest p-6 mt-8 border-l-2 border-error/40">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h2 className="font-headline text-lg text-on-surface mb-2">Switch to a different company</h2>
                      <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
                        Clears your organisation name, website URL, and confirmed offerings so you can
                        set up a different company's profile. Projects, RFP scans, team members,
                        drafts, and all other data are kept.
                      </p>
                      <button
                        onClick={() => setShowClearProfileModal(true)}
                        className="text-xs font-label uppercase tracking-widest px-4 py-2 border border-outline/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                      >
                        Clear organisation profile
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'costs' && <AiCostsTab />}

            {activeTab === 'ai' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <div className="bg-surface-container-low p-6">
                  <h2 className="font-headline text-lg text-on-surface mb-6">AI Configuration</h2>

                  <div className="font-label text-[10px] uppercase tracking-widest text-primary mb-3">Gemini — Fast tasks &amp; embeddings</div>
                  {[
                    ['API Key', info.has_api_key ? 'Configured' : 'Not set — required', info.has_api_key ? '#6ab187' : '#ffb4ab'],
                    ['Model', info.gemini_model || 'gemini-2.5-flash', null],
                  ].map(([l, v, dot]) => (
                    <div key={l} className="flex items-center justify-between py-3 text-sm">
                      <span className="text-on-surface-variant">{l}</span>
                      <div className="flex items-center gap-2">
                        {dot && <div className="w-2 h-2 rounded-full" style={{ background: dot }} />}
                        <span className="font-label text-xs text-on-surface">{v}</span>
                      </div>
                    </div>
                  ))}

                  <div className="font-label text-[10px] uppercase tracking-widest text-primary mt-6 mb-3">OpenAI — Deep analysis &amp; document scanning</div>
                  {[
                    ['API Key', info.has_openai ? 'Configured' : 'Not set — falls back to Gemini', info.has_openai ? '#6ab187' : '#e4c366'],
                    ['Model', info.openai_model || 'gpt-4.5-preview', null],
                  ].map(([l, v, dot]) => (
                    <div key={l} className="flex items-center justify-between py-3 text-sm">
                      <span className="text-on-surface-variant">{l}</span>
                      <div className="flex items-center gap-2">
                        {dot && <div className="w-2 h-2 rounded-full" style={{ background: dot }} />}
                        <span className="font-label text-xs text-on-surface">{v}</span>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs mt-4 text-on-surface-variant/70 leading-relaxed">
                    Set API keys in Railway → Variables tab. Use OPENAI_MODEL and GEMINI_MODEL variables to override model names.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'prompts' && (
              <div className="flex gap-5 h-full" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                {/* Prompt list */}
                <div className="w-64 flex-shrink-0 space-y-1 bg-surface-container-low p-3">
                  <p className="text-xs mb-3 px-2 text-on-surface-variant">Select a prompt. Modified prompts are marked with ✎.</p>
                  {promptsLoading ? <Spinner /> : prompts.map(p => {
                    const active = selectedPrompt?.prompt_key === p.prompt_key;
                    return (
                      <button
                        key={p.prompt_key}
                        onClick={() => selectPrompt(p)}
                        className={`w-full text-left px-3 py-2.5 transition-all text-sm ${
                          active
                            ? 'bg-surface-container-high text-primary font-medium border-l-2 border-primary'
                            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{p.prompt_label}</span>
                          {p.is_modified && <span className="text-[10px] text-primary">✎</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Prompt editor */}
                <div className="flex-1 flex flex-col min-w-0">
                  {!selectedPrompt ? (
                    <div className="text-center py-12"><p className="text-sm text-on-surface-variant">Select a prompt to edit.</p></div>
                  ) : (
                    <div className="bg-surface-container-low flex-1 flex flex-col p-6 overflow-hidden">
                      <div className="flex items-start justify-between mb-4 gap-4">
                        <div className="min-w-0">
                          <h3 className="font-headline text-base text-on-surface">{selectedPrompt.prompt_label}</h3>
                          <p className="text-xs mt-0.5 text-on-surface-variant">{selectedPrompt.prompt_description}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {selectedPrompt.is_modified && (
                            <button
                              onClick={resetPrompt}
                              disabled={savingPrompt}
                              className="px-3 py-2 text-[10px] font-label uppercase tracking-widest border border-outline/30 text-on-surface-variant hover:bg-surface-container-high transition-colors"
                            >
                              Reset to Template
                            </button>
                          )}
                          <button
                            onClick={savePrompt}
                            disabled={savingPrompt || promptContent === selectedPrompt.content}
                            className="px-4 py-2 text-[10px] font-label uppercase tracking-widest font-bold bg-primary text-on-primary disabled:opacity-50"
                          >
                            {savingPrompt ? 'Saving…' : 'Save Prompt'}
                          </button>
                        </div>
                      </div>

                      {selectedPrompt.is_modified && (
                        <div className="px-3 py-2 mb-3 text-xs bg-primary/10 text-primary border-l-2 border-primary">
                          ✎ Modified from default. Click "Reset to Template" to restore.
                        </div>
                      )}

                      <div className="font-label text-[10px] uppercase tracking-widest mb-2 text-primary">
                        System Instruction — prepended to every AI call for this function
                      </div>
                      <textarea
                        value={promptContent}
                        onChange={e => setPromptContent(e.target.value)}
                        className="flex-1 w-full px-4 py-3 text-sm font-mono outline-none leading-relaxed bg-surface-container-lowest text-on-surface border border-outline-variant/20 focus:border-primary transition-colors"
                        style={{ resize: 'none', minHeight: 300 }}
                      />
                      <p className="text-[10px] mt-2 text-on-surface-variant/60">
                        Changes apply to the next scan. The JSON schema and output format are controlled separately.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'taxonomy' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <div className="bg-surface-container-low p-6">
                  <h2 className="font-headline text-lg text-on-surface mb-2">Service Offering &amp; Sector Taxonomy</h2>
                  <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                    Centrally managed tags used for proposal classification, directory browsing, and RFP matching. Add your own or edit the defaults.
                  </p>

                  {/* Add new item */}
                  <div className="flex gap-2 mb-6">
                    <select
                      value={newItemCategory}
                      onChange={e => setNewItemCategory(e.target.value)}
                      className="px-3 py-2 bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm outline-none focus:border-primary"
                      style={{ minWidth: 160 }}
                    >
                      <option className="bg-surface-container">Service Offering</option>
                      <option className="bg-surface-container">Sector</option>
                    </select>
                    <input
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTaxItem()}
                      placeholder="Add new item…"
                      className="flex-1 px-3 py-2 bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm outline-none focus:border-primary placeholder:text-outline"
                    />
                    <button
                      onClick={addTaxItem}
                      disabled={!newItemName.trim()}
                      className="px-4 py-2 bg-primary text-on-primary text-[10px] font-label uppercase tracking-widest font-bold disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>

                  {taxonomyLoading ? <div className="flex justify-center py-6"><Spinner /></div> : (
                    ['Service Offering', 'Sector'].map(cat => {
                      const items = taxonomy.filter(i => i.category === cat);
                      if (!items.length) return null;
                      return (
                        <div key={cat} className="mb-6">
                          <div className="font-label text-[10px] uppercase tracking-widest mb-3 text-primary">{cat}</div>
                          <div className="space-y-1">
                            {items.map(item => (
                              <div key={item.id} className="flex items-center gap-2 py-2 px-3 group bg-surface-container-lowest hover:bg-surface-container-high transition-colors">
                                {editingTaxId === item.id ? (
                                  <>
                                    <input
                                      autoFocus
                                      value={editingTaxName}
                                      onChange={e => setEditingTaxName(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') renameTaxItem(item.id); if (e.key === 'Escape') setEditingTaxId(null); }}
                                      className="flex-1 px-2 py-1 bg-surface text-on-surface border border-primary text-sm outline-none"
                                    />
                                    <button onClick={() => renameTaxItem(item.id)} className="text-xs px-2 py-1 bg-primary text-on-primary no-min-h">✓</button>
                                    <button onClick={() => setEditingTaxId(null)} className="text-xs px-1.5 py-1 no-min-h text-on-surface-variant hover:text-on-surface">✕</button>
                                  </>
                                ) : (
                                  <>
                                    <span className="flex-1 text-sm text-on-surface">{item.name}</span>
                                    {item.is_default ? (
                                      <span className="text-[10px] font-label uppercase tracking-widest px-1.5 py-0.5 text-on-surface-variant/60">default</span>
                                    ) : null}
                                    <div className="hidden group-hover:flex gap-1">
                                      <button
                                        onClick={() => { setEditingTaxId(item.id); setEditingTaxName(item.name); }}
                                        className="text-xs px-2 py-1 no-min-h text-on-surface-variant hover:text-primary"
                                      >
                                        ✎
                                      </button>
                                      <button
                                        onClick={() => deleteTaxItem(item.id)}
                                        className="text-xs px-2 py-1 no-min-h text-on-surface-variant hover:text-error"
                                      >
                                        ✕
                                      </button>
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
                </div>
              </div>
            )}

            {activeTab === 'storage' && (
              <div className="max-w-2xl mx-auto space-y-5">
                <div className="bg-surface-container-low p-6">
                  <h2 className="font-headline text-lg text-on-surface mb-6">Data &amp; Storage</h2>
                  <div className="space-y-1 text-sm">
                    {[
                      ['Database', '/app/data/proposaliq.db'],
                      ['Uploaded files', '/app/data/uploads/'],
                      ['RFP files', '/app/data/uploads/rfp_scans/'],
                      ['Team CVs', '/app/data/uploads/team_cvs/'],
                      ['Win patterns cache', '/app/data/win_patterns_cache.json'],
                    ].map(([label, loc]) => (
                      <div key={label} className="flex items-center justify-between py-3 border-b border-outline-variant/10">
                        <span className="text-on-surface-variant">{label}</span>
                        <code className="text-xs font-label px-2 py-0.5 bg-surface-container-lowest text-primary">{loc}</code>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-4 text-on-surface-variant/70 leading-relaxed">
                    All persistent data is stored in the Railway volume mounted at{' '}
                    <code className="font-label px-1 text-primary bg-surface-container-lowest">/app/data</code>.
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />

      {/* Clear organisation profile confirmation modal */}
      {showClearProfileModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.65)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !clearingProfile) setShowClearProfileModal(false); }}
        >
          <div className="bg-surface-container-lowest w-full max-w-md shadow-2xl border border-outline-variant/10">
            <div className="px-6 py-5 border-b border-outline-variant/10">
              <h2 className="font-headline text-xl text-on-surface">Clear organisation profile?</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm mb-3 text-on-surface leading-relaxed">
                This will delete your organisation name, website URL, extracted website scan,
                and confirmed offerings. You'll be taken back to onboarding to set up a different company.
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Your projects, RFP scans, team members, drafts, and all other data are <strong className="text-on-surface">kept</strong>.
                Only the organisation profile itself is cleared.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant/10 flex items-center justify-end gap-2 bg-surface-container-low">
              <button
                onClick={() => setShowClearProfileModal(false)}
                disabled={clearingProfile}
                className="text-[10px] font-label uppercase tracking-widest px-4 py-2 text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearOrganisationProfile}
                disabled={clearingProfile}
                className="text-[10px] font-label uppercase tracking-widest px-4 py-2 bg-primary text-on-primary font-bold disabled:opacity-50"
              >
                {clearingProfile ? 'Clearing…' : 'Clear profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Dark form helpers for Settings ──────────────────────────────────────
function DarkField({ label, value, onChange, type = 'text', placeholder, hint }) {
  return (
    <div>
      <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-0 border-b border-outline-variant/30 focus:border-primary focus:ring-0 focus:outline-none py-2 text-on-surface transition-colors placeholder:text-outline"
      />
      {hint && <p className="text-[11px] mt-1 text-on-surface-variant/60">{hint}</p>}
    </div>
  );
}

function DarkSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent border-0 border-b border-outline-variant/30 focus:border-primary focus:ring-0 focus:outline-none py-2 text-on-surface appearance-none"
      >
        {children}
      </select>
    </div>
  );
}

// ── AI Costs Tab ─────────────────────────────────────────────────────────
function AiCostsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai-costs').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center gap-2 py-12 justify-center text-on-surface-variant"><Spinner/> Loading costs…</div>;
  if (!data || !data.total) return <div className="text-center py-12 text-sm text-on-surface-variant">No cost data yet. Costs are tracked from the first AI call after this update deploys.</div>;

  const CATEGORY_LABELS = {
    rfp_scan: 'RFP Intelligence scans',
    proposal_analysis: 'Proposal analysis (upload/reindex)',
    proposal_generation: 'Full proposal generation',
    unknown: 'Other / uncategorised',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Total spend */}
      <div className="bg-surface-container-low p-6">
        <h2 className="font-headline text-lg text-on-surface mb-6">Total AI Spend</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            ['Total cost', `$${data.total.cost.toFixed(2)}`],
            ['API calls', data.total.calls.toLocaleString()],
            ['Input tokens', `${(data.total.input_tokens / 1000).toFixed(0)}K`],
            ['Output tokens', `${(data.total.output_tokens / 1000).toFixed(0)}K`],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="font-label text-[10px] uppercase tracking-widest mb-1 text-on-surface-variant">{label}</div>
              <div className="font-headline text-xl text-primary">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By category */}
      <div className="bg-surface-container-low p-6">
        <h2 className="font-headline text-lg text-on-surface mb-6">Spend by Feature</h2>
        {data.by_category.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No data yet.</p>
        ) : (
          <div className="space-y-4">
            {data.by_category.map(c => {
              const pct = data.total.cost > 0 ? Math.round((c.cost / data.total.cost) * 100) : 0;
              return (
                <div key={c.category}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm text-on-surface">{CATEGORY_LABELS[c.category] || c.category}</span>
                    <span className="font-label text-sm font-semibold text-primary">${c.cost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1 bg-surface-container-lowest overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-label text-on-surface-variant/60">{pct}% · {c.calls} calls</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* By model */}
      <div className="bg-surface-container-low p-6">
        <h2 className="font-headline text-lg text-on-surface mb-4">Spend by Model</h2>
        <div className="bg-surface-container-lowest overflow-hidden">
          <div className="grid text-[10px] font-label uppercase tracking-widest px-4 py-3 text-on-surface-variant" style={{ gridTemplateColumns: '1fr 80px 80px 80px' }}>
            <span>Model</span><span className="text-right">Cost</span><span className="text-right">Calls</span><span className="text-right">Tokens</span>
          </div>
          {data.by_model.map(m => (
            <div key={m.model} className="grid items-center px-4 py-2 text-xs border-t border-outline-variant/10" style={{ gridTemplateColumns: '1fr 80px 80px 80px' }}>
              <span className="font-label text-on-surface">{m.model}</span>
              <span className="text-right font-label font-semibold text-primary">${m.cost.toFixed(2)}</span>
              <span className="text-right font-label text-on-surface-variant">{m.calls}</span>
              <span className="text-right font-label text-on-surface-variant">{((m.input_tokens + m.output_tokens) / 1000).toFixed(0)}K</span>
            </div>
          ))}
        </div>
      </div>

      {/* Most expensive functions */}
      <div className="bg-surface-container-low p-6">
        <h2 className="font-headline text-lg text-on-surface mb-4">Most Expensive Functions</h2>
        <div className="bg-surface-container-lowest overflow-hidden">
          <div className="grid text-[10px] font-label uppercase tracking-widest px-4 py-3 text-on-surface-variant" style={{ gridTemplateColumns: '1fr 1fr 70px 50px 70px' }}>
            <span>Function</span><span>Category</span><span className="text-right">Total</span><span className="text-right">Calls</span><span className="text-right">Avg/call</span>
          </div>
          {data.by_function.slice(0, 10).map(f => (
            <div key={f.function_name} className="grid items-center px-4 py-2 text-xs border-t border-outline-variant/10" style={{ gridTemplateColumns: '1fr 1fr 70px 50px 70px' }}>
              <span className="font-label text-on-surface truncate">{f.function_name}</span>
              <span className="font-label text-on-surface-variant truncate">{CATEGORY_LABELS[f.category] || f.category}</span>
              <span className="text-right font-label font-semibold text-primary">${f.cost.toFixed(2)}</span>
              <span className="text-right font-label text-on-surface-variant">{f.calls}</span>
              <span className="text-right font-label text-on-surface-variant/60">${f.avg_cost_per_call.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily trend */}
      {data.daily.length > 0 && (
        <div className="bg-surface-container-low p-6">
          <h2 className="font-headline text-lg text-on-surface mb-4">Last 7 Days</h2>
          <div className="space-y-2">
            {data.daily.map(d => (
              <div key={d.day} className="flex items-center justify-between text-xs py-1">
                <span className="font-label text-on-surface-variant">{d.day}</span>
                <div className="flex items-center gap-3">
                  <span className="font-label text-on-surface-variant/60">{d.calls} calls</span>
                  <span className="font-label font-semibold text-primary">${(d.cost || 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
