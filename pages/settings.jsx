import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../components/Layout';
import { Card, Btn, Input, Select, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';

const WIPE_CONFIRM_PHRASE = 'DELETE ALL DATA';

export default function Settings() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [form, setForm] = useState({ org_name: '', target_margin: '30', default_currency: 'GBP' });
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wiping, setWiping] = useState(false);
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

  // Nuclear wipe — deletes all company data and redirects to fresh onboarding.
  // The typed confirmation phrase must match exactly; modal stays open otherwise.
  async function wipeData() {
    if (wipeConfirmText !== WIPE_CONFIRM_PHRASE) return;
    setWiping(true);
    try {
      const r = await fetch('/api/onboarding/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: WIPE_CONFIRM_PHRASE }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setToast(err.error || 'Wipe failed');
        setWiping(false);
        return;
      }
      // Clear local form state and redirect to onboarding
      setForm({ org_name: '', target_margin: '30', default_currency: 'GBP' });
      setShowWipeModal(false);
      setWipeConfirmText('');
      router.push('/onboarding/profile');
    } catch (e) {
      setToast('Wipe failed: ' + e.message);
      setWiping(false);
    }
  }

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Settings — ProposalIQ</title></Head>
      <Layout title="Settings" subtitle="Platform configuration" user={user}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b bg-white flex-shrink-0" style={{ borderColor:'#ddd5c4' }}>
            {[['general','General'],['ai','AI Configuration'],['prompts','AI Prompts'],['taxonomy','Taxonomy'],['storage','Data & Storage']].map(([id,label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className="px-5 py-3 text-[12.5px] font-medium border-b-2 transition-all"
                style={{ borderColor: activeTab===id?'#1e4a52':'transparent', color: activeTab===id?'#1e4a52':'#6b6456' }}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6" style={{ background:'#faf7f2' }}>

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

                {/* ── Danger Zone ─────────────────────────────────────── */}
                <Card className="p-5 mt-8" style={{ borderColor: 'rgba(176,64,48,.3)', background: '#faeeeb' }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h2 className="font-serif text-base mb-1" style={{ color: '#b04030' }}>Danger zone</h2>
                      <p className="text-xs mb-3" style={{ color: '#8a3628' }}>
                        Delete all company data and start fresh — useful when switching
                        to a different organisation or clearing out test data. This
                        permanently removes all proposals, uploaded files, RFP scans,
                        drafts, team members, folders, outcomes, feedback history, and
                        your organisation profile. Your login and AI configuration are
                        kept. This cannot be undone.
                      </p>
                      <button onClick={() => { setShowWipeModal(true); setWipeConfirmText(''); }}
                        className="text-xs px-3 py-2 rounded border font-medium"
                        style={{ borderColor: '#b04030', color: '#b04030', background: 'white' }}>
                        ✕ Delete all company data and start fresh
                      </button>
                    </div>
                    <div className="text-3xl opacity-30" style={{ color: '#b04030' }}>⚠</div>
                  </div>
                </Card>
              </div>
            )}

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

      {/* Wipe confirmation modal — requires typed phrase */}
      {showWipeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,14,12,.65)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !wiping) setShowWipeModal(false); }}>
          <div className="rounded-xl bg-white w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b" style={{ borderColor: '#ddd5c4' }}>
              <div className="flex items-center gap-3">
                <div className="text-2xl" style={{ color: '#b04030' }}>⚠</div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#b04030' }}>Danger · irreversible</div>
                  <h2 className="font-serif text-xl mt-0.5">Delete all company data?</h2>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm mb-4" style={{ color: '#1a1816' }}>
                This will permanently delete:
              </p>
              <ul className="text-xs mb-4 space-y-1" style={{ color: '#6b6456' }}>
                <li>· All projects and uploaded files</li>
                <li>· All RFP scans, gaps, strategies, drafts, feedback</li>
                <li>· Team members, folders, client profiles, rate card</li>
                <li>· Your confirmed organisation profile</li>
              </ul>
              <p className="text-xs mb-5" style={{ color: '#6b6456' }}>
                Your login and AI configuration are kept. <strong style={{ color: '#b04030' }}>This cannot be undone.</strong>
              </p>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#1a1816' }}>
                Type <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: '#f0ebe0' }}>{WIPE_CONFIRM_PHRASE}</code> to confirm
              </label>
              <input value={wipeConfirmText} onChange={e => setWipeConfirmText(e.target.value)}
                placeholder={WIPE_CONFIRM_PHRASE}
                className="w-full text-sm px-3 py-2 border rounded outline-none font-mono"
                style={{ borderColor: wipeConfirmText === WIPE_CONFIRM_PHRASE ? '#b04030' : '#ddd5c4' }}
                autoFocus />
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#ddd5c4', background: '#faf7f2' }}>
              <button onClick={() => { setShowWipeModal(false); setWipeConfirmText(''); }}
                disabled={wiping}
                className="text-xs px-4 py-2 rounded-lg" style={{ color: '#6b6456' }}>
                Cancel
              </button>
              <button onClick={wipeData}
                disabled={wiping || wipeConfirmText !== WIPE_CONFIRM_PHRASE}
                className="text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#b04030', color: 'white' }}>
                {wiping ? <><Spinner size={12} /> Deleting…</> : 'Permanently delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
