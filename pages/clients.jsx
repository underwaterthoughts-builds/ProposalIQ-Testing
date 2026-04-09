import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { Btn, Card, OutcomeLabel, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';
import { formatMoney } from '../lib/format';

export default function Clients() {
  const { user, loading: authLoading } = useUser();
  const [clients, setClients] = useState([]);
  const [unprofiled, setUnprofiled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [toast, setToast] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { if (user) load(); }, [user]);

  if (authLoading) return null;
  if (!user) return null;

  async function load() {
    setLoading(true);
    const r = await fetch('/api/clients');
    const d = await r.json();
    setClients(d.clients || []);
    setUnprofiled(d.unprofiled || []);
    setLoading(false);
  }

  async function selectClient(name) {
    const r = await fetch(`/api/clients?name=${encodeURIComponent(name)}`);
    const d = await r.json();
    setSelected(d.client || { name, auto: true });
    setSelectedProjects(d.projects || []);
    setEditForm(d.client || { name, notes: '', sector: '', relationship_status: 'active' });
  }

  async function saveProfile() {
    setSaving(true);
    if (selected?.id) {
      await fetch('/api/clients', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id, ...editForm }) });
    } else {
      await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) });
    }
    setSaving(false);
    setToast('Saved');
    load();
  }

  const STATUS_COLORS = { active: '#3d5c3a', prospect: '#b8962e', inactive: '#6b6456', lost: '#b04030' };
  const allNames = [...clients.map(c => c.name), ...unprofiled.map(c => c.name)];
  const filtered = allNames.filter(n => !search || n.toLowerCase().includes(search.toLowerCase()));

  const totalWon = clients.reduce((a, c) => a + (c.won || 0), 0) + unprofiled.reduce((a, c) => a + (c.won || 0), 0);
  const totalLost = clients.reduce((a, c) => a + (c.lost || 0), 0) + unprofiled.reduce((a, c) => a + (c.lost || 0), 0);

  return (
    <>
      <Head><title>Client Intelligence — ProposalIQ</title></Head>
      <Layout title="Client Intelligence" subtitle="Relationship history and account context" user={user}
        actions={<Btn variant="teal" onClick={() => { setSelected(null); setEditForm({ name:'', notes:'', sector:'', relationship_status:'prospect' }); setShowAdd(true); }}>⊕ Add Client</Btn>}>
        <div className="flex h-full overflow-hidden">

          {/* Client list */}
          <div className="w-64 flex-shrink-0 border-r flex flex-col" style={{ borderColor:'#ddd5c4', background:'#f0ebe0' }}>
            <div className="p-3 border-b" style={{ borderColor:'#ddd5c4' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                className="w-full px-3 py-1.5 border rounded-md text-xs outline-none" style={{ borderColor:'#ddd5c4' }} />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? <div className="flex justify-center py-8"><Spinner /></div> : (
                <>
                  {filtered.map(name => {
                    const profile = clients.find(c => c.name === name);
                    const raw = unprofiled.find(c => c.name === name);
                    const data = profile || raw;
                    const wr = (data.won + data.lost) > 0 ? Math.round((data.won / (data.won + data.lost)) * 100) : null;
                    return (
                      <button key={name} onClick={() => selectClient(name)}
                        className={`w-full text-left px-3 py-2.5 rounded-md mb-1 transition-all ${selected?.name === name ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{name}</span>
                          {!profile && <span className="text-[9px] font-mono px-1 rounded" style={{ background:'#f0ebe0', color:'#9b8e80' }}>auto</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono" style={{ color:'#6b6456' }}>{data.project_count} project{data.project_count!==1?'s':''}</span>
                          {wr !== null && <span className="text-[10px] font-mono" style={{ color: wr>=60?'#3d5c3a':wr>=40?'#b8962e':'#b04030' }}>{wr}% win</span>}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <div className="p-3 border-t" style={{ borderColor:'#ddd5c4' }}>
              <div className="flex justify-between text-xs font-mono" style={{ color:'#6b6456' }}>
                <span>{allNames.length} clients</span>
                <span>{totalWon}W / {totalLost}L</span>
              </div>
            </div>
          </div>

          {/* Client detail */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selected && !showAdd ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-3 opacity-20">◎</div>
                <p className="text-sm" style={{ color:'#6b6456' }}>Select a client to view their history and relationship notes.</p>
              </div>
            ) : showAdd ? (
              <div className="max-w-lg">
                <h2 className="font-serif text-xl mb-5">Add Client Profile</h2>
                <Card className="p-5 space-y-4">
                  {[['name','Client Name','e.g. NHS England'],['sector','Sector','e.g. Healthcare & NHS']].map(([k,l,ph]) => (
                    <div key={k}>
                      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color:'#6b6456' }}>{l}</label>
                      <input value={editForm[k]||''} onChange={e => setEditForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}
                        className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]" style={{ borderColor:'#ddd5c4' }} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color:'#6b6456' }}>Relationship Status</label>
                    <select value={editForm.relationship_status||'prospect'} onChange={e => setEditForm(p=>({...p,relationship_status:e.target.value}))}
                      className="w-full px-3 py-2 border rounded-md text-sm outline-none" style={{ borderColor:'#ddd5c4' }}>
                      {['active','prospect','inactive','lost'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color:'#6b6456' }}>Notes</label>
                    <textarea value={editForm.notes||''} onChange={e => setEditForm(p=>({...p,notes:e.target.value}))} rows={3}
                      placeholder="Key contacts, relationship history, strategic notes…"
                      className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52]" style={{ borderColor:'#ddd5c4', resize:'vertical' }} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Btn variant="teal" onClick={saveProfile} disabled={saving || !editForm.name?.trim()}>
                      {saving ? <><Spinner size={12}/> Saving…</> : 'Create Profile'}
                    </Btn>
                    <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="max-w-3xl space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-serif text-2xl">{selected.name}</h2>
                    {selected.sector && <p className="text-sm mt-0.5" style={{ color:'#6b6456' }}>{selected.sector}</p>}
                  </div>
                  {selected.relationship_status && (
                    <span className="text-[11px] font-mono px-3 py-1 rounded-full capitalize" style={{ background: (STATUS_COLORS[selected.relationship_status]||'#6b6456')+'20', color: STATUS_COLORS[selected.relationship_status]||'#6b6456' }}>
                      {selected.relationship_status}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ['Projects', selectedProjects.length],
                    ['Won', selectedProjects.filter(p=>p.outcome==='won').length],
                    ['Lost', selectedProjects.filter(p=>p.outcome==='lost').length],
                    ['Win Rate', selectedProjects.filter(p=>['won','lost'].includes(p.outcome)).length > 0
                      ? Math.round(selectedProjects.filter(p=>p.outcome==='won').length / selectedProjects.filter(p=>['won','lost'].includes(p.outcome)).length * 100) + '%'
                      : '—'],
                  ].map(([l,v]) => (
                    <Card key={l} className="p-3 text-center">
                      <div className="font-mono text-xl font-bold" style={{ color:'#1e4a52' }}>{v}</div>
                      <div className="text-[10px] font-mono uppercase tracking-widest mt-0.5" style={{ color:'#6b6456' }}>{l}</div>
                    </Card>
                  ))}
                </div>

                {/* Notes */}
                {selected.id && (
                  <Card className="p-5">
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Relationship Notes</div>
                    <textarea value={editForm.notes||''} onChange={e => setEditForm(p=>({...p,notes:e.target.value}))} rows={4}
                      placeholder="Key contacts, relationship context, strategic observations, incumbent info…"
                      className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[#1e4a52] mb-3" style={{ borderColor:'#ddd5c4', resize:'vertical' }} />
                    <Btn variant="teal" onClick={saveProfile} disabled={saving}>
                      {saving ? <><Spinner size={12}/> Saving…</> : 'Save Notes'}
                    </Btn>
                  </Card>
                )}
                {!selected.id && (
                  <Card className="p-4" style={{ background:'#faf4e2', border:'1px solid rgba(184,150,46,.3)' }}>
                    <p className="text-sm" style={{ color:'#8a6200' }}>This client was detected from your proposals but has no profile yet.</p>
                    <Btn variant="teal" size="sm" className="mt-3" onClick={() => { setEditForm({ name:selected.name, notes:'', sector:'', relationship_status:'active' }); setShowAdd(true); }}>Create Profile →</Btn>
                  </Card>
                )}

                {/* Project history */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color:'#6b6456' }}>Project History</div>
                  <div className="space-y-2">
                    {selectedProjects.map(p => (
                      <Link key={p.id} href={`/repository/${p.id}`}>
                        <Card className="p-4 flex items-center gap-4 hover:bg-[#f8f6f2] transition-colors cursor-pointer">
                          <OutcomeLabel outcome={p.outcome} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="text-xs mt-0.5" style={{ color:'#6b6456' }}>{p.date_submitted?.slice(0,4)} · {p.sector}</div>
                          </div>
                          <div className="text-sm font-mono font-medium flex-shrink-0" style={{ color:'#1e4a52' }}>
                            {formatMoney(p.contract_value, p.currency)}
                          </div>
                          <span className="text-xs" style={{ color:'#1e4a52' }}>→</span>
                        </Card>
                      </Link>
                    ))}
                    {selectedProjects.length === 0 && <p className="text-sm py-4" style={{ color:'#6b6456' }}>No projects found for this client yet.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}
