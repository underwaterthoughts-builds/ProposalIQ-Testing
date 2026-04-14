import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { Btn, Card, OutcomeLabel, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';
import { formatMoney } from '../lib/format';

export default function Clients() {
  const router = useRouter();
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
  const [mobileListOpen, setMobileListOpen] = useState(false);

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
        actions={<div className="flex gap-2">
          <button onClick={()=>setMobileListOpen(true)} className="md:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-sm transition-all" aria-label="Open client list">
            <span className="material-symbols-outlined text-xl">menu_open</span>
          </button>
          <Btn variant="teal" onClick={() => { setSelected(null); setEditForm({ name:'', notes:'', sector:'', relationship_status:'prospect' }); setShowAdd(true); }}>⊕ Add Client</Btn>
        </div>}>
        <div className="flex h-full overflow-hidden bg-surface relative">
          {mobileListOpen && (
            <div className="md:hidden fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm" onClick={()=>setMobileListOpen(false)} />
          )}

          {/* Client list */}
          <aside className={`${mobileListOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed top-0 bottom-0 left-0 z-[56] w-72 md:static md:z-auto md:w-64 flex-shrink-0 flex flex-col bg-surface-container-low border-r border-outline-variant/10 transition-transform duration-200`}>
            <div className="p-6 border-b border-outline-variant/10 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-headline text-xl text-on-surface">Client Directory</h3>
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">
                  Total: {allNames.length} {allNames.length === 1 ? 'account' : 'accounts'}
                </p>
              </div>
              <button onClick={()=>setMobileListOpen(false)} className="md:hidden p-1 text-on-surface-variant hover:text-on-surface" aria-label="Close client list">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-4 border-b border-outline-variant/10">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="w-full bg-transparent border-b border-outline-variant focus:border-primary focus:ring-0 focus:outline-none py-2 text-sm placeholder:text-outline transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : (
                filtered.map(name => {
                  const profile = clients.find(c => c.name === name);
                  const raw = unprofiled.find(c => c.name === name);
                  const data = profile || raw;
                  const wr = (data.won + data.lost) > 0 ? Math.round((data.won / (data.won + data.lost)) * 100) : null;
                  const isActive = selected?.name === name;
                  return (
                    <button
                      key={name}
                      onClick={() => { selectClient(name); setMobileListOpen(false); }}
                      className={`w-full text-left p-6 border-b border-outline-variant/5 transition-colors cursor-pointer group ${
                        isActive
                          ? 'bg-surface-container-high border-l-2 border-l-primary'
                          : 'hover:bg-surface-container-high/50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`font-body text-sm font-bold truncate ${isActive ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                          {name}
                        </span>
                        {!profile && (
                          <span className="text-[9px] font-label uppercase px-1.5 py-0.5 bg-surface-container-highest text-outline">
                            auto
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-wider">
                          {data.project_count} {data.project_count === 1 ? 'project' : 'projects'}
                        </span>
                        {wr !== null && (
                          <span className={`font-label text-xs ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
                            {wr}% win
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-outline-variant/10">
              <button
                onClick={() => {
                  setSelected(null);
                  setEditForm({ name: '', notes: '', sector: '', relationship_status: 'prospect' });
                  setShowAdd(true);
                }}
                className="w-full py-3 bg-primary text-on-primary font-bold text-xs uppercase tracking-widest"
              >
                + New Client
              </button>
            </div>
          </aside>

          {/* Client detail */}
          <div className="flex-1 overflow-y-auto bg-surface relative">

            {/* Background accent */}
            <div className="absolute inset-0 pointer-events-none opacity-5 overflow-hidden">
              <div className="absolute -top-20 -right-20 w-[600px] h-[600px] bg-primary blur-[140px] rounded-full" />
            </div>

            <div className="relative z-10 p-8 md:p-12">
              {!selected && !showAdd ? (
                <div className="text-center py-32">
                  <span className="material-symbols-outlined text-6xl text-outline opacity-40">handshake</span>
                  <p className="font-body text-on-surface-variant mt-6 max-w-md mx-auto">
                    Select a client from the directory to view their intelligence profile and proposal history.
                  </p>
                </div>
              ) : showAdd ? (
                <div className="max-w-lg">
                  <h2 className="font-headline text-3xl mb-8">Add Client Profile</h2>
                  <div className="bg-surface-container-low p-8 space-y-6">
                    {[['name', 'Client Name', 'e.g. NHS England'], ['sector', 'Sector', 'e.g. Healthcare & NHS']].map(([k, l, ph]) => (
                      <div key={k}>
                        <label className="block font-label text-[10px] text-outline uppercase tracking-widest mb-2">{l}</label>
                        <input
                          value={editForm[k] || ''}
                          onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))}
                          placeholder={ph}
                          className="w-full bg-transparent border-b border-outline-variant focus:border-primary focus:ring-0 focus:outline-none py-2 text-on-surface transition-colors"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block font-label text-[10px] text-outline uppercase tracking-widest mb-2">Relationship Status</label>
                      <select
                        value={editForm.relationship_status || 'prospect'}
                        onChange={e => setEditForm(p => ({ ...p, relationship_status: e.target.value }))}
                        className="w-full bg-transparent border-b border-outline-variant focus:border-primary focus:ring-0 focus:outline-none py-2 text-on-surface appearance-none"
                      >
                        {['active', 'prospect', 'inactive', 'lost'].map(s => <option key={s} className="bg-surface-container">{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-label text-[10px] text-outline uppercase tracking-widest mb-2">Notes</label>
                      <textarea
                        value={editForm.notes || ''}
                        onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                        rows={4}
                        placeholder="Key contacts, relationship history, strategic notes…"
                        className="w-full bg-surface-container-lowest border-none focus:ring-0 focus:outline-none p-4 text-on-surface-variant text-sm resize-y"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={saveProfile}
                        disabled={saving || !editForm.name?.trim()}
                        className="bg-primary text-on-primary px-6 py-3 text-xs font-label uppercase tracking-widest font-bold disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Create Profile'}
                      </button>
                      <button
                        onClick={() => setShowAdd(false)}
                        className="px-6 py-3 border border-outline/30 text-on-surface-variant text-xs font-label uppercase tracking-widest hover:bg-surface-container-high transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-12">

                  {/* Hero header */}
                  <div className="flex justify-between items-start gap-6 flex-wrap">
                    <div className="max-w-2xl">
                      <div className="flex items-center gap-4 mb-3 flex-wrap">
                        <h1 className="font-headline text-5xl md:text-6xl font-bold text-on-surface tracking-tighter">
                          {selected.name}
                        </h1>
                        {selected.relationship_status && (
                          <span
                            className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] font-label uppercase tracking-widest rounded-full"
                            style={{ color: STATUS_COLORS[selected.relationship_status] || '#e8c357' }}
                          >
                            {selected.relationship_status}
                          </span>
                        )}
                      </div>
                      {selected.sector && (
                        <p className="text-lg text-on-surface-variant font-body leading-relaxed">
                          {selected.sector}
                        </p>
                      )}
                    </div>
                    {selected.id && (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setShowAdd(false)}
                          className="flex items-center gap-2 px-6 py-3 border border-outline/30 text-primary hover:bg-primary/5 transition-colors font-medium text-sm"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                          Edit Details
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Auto-detected banner */}
                  {!selected.id && (
                    <div className="p-8 bg-gradient-to-r from-primary-container to-secondary-container rounded-lg border border-primary/20 flex items-center justify-between gap-6 flex-wrap shadow-2xl">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-on-primary-container flex items-center justify-center rounded-full flex-shrink-0">
                          <span className="material-symbols-outlined text-primary text-3xl">auto_awesome</span>
                        </div>
                        <div>
                          <h4 className="text-on-primary-container font-headline text-2xl font-bold">Auto-Detected Opportunity</h4>
                          <p className="text-on-primary-container/80 text-sm font-body mt-1">
                            This client was found in your proposal repository but has no intelligence profile yet.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setEditForm({ name: selected.name, notes: '', sector: '', relationship_status: 'active' }); setShowAdd(true); }}
                        className="bg-primary text-on-primary px-8 py-4 font-bold text-sm tracking-widest uppercase shadow-lg hover:scale-[1.02] transition-transform"
                      >
                        Create Intelligence Profile
                      </button>
                    </div>
                  )}

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(() => {
                      const wonCount = selectedProjects.filter(p => p.outcome === 'won').length;
                      const lostCount = selectedProjects.filter(p => p.outcome === 'lost').length;
                      const pendingCount = selectedProjects.filter(p => !['won', 'lost', 'withdrawn'].includes(p.outcome)).length;
                      const winPct = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null;
                      const totalValue = selectedProjects.reduce((a, p) => a + (p.contract_value || 0), 0);
                      const metrics = [
                        { label: 'Total Contract Value', value: formatMoney(totalValue, selectedProjects[0]?.currency || 'GBP'), accent: 'border-primary-container' },
                        { label: 'Active RFPs', value: String(pendingCount).padStart(2, '0'), accent: 'border-outline-variant' },
                        { label: 'Win Rate', value: winPct !== null ? `${winPct}%` : '—', accent: 'border-primary', highlight: true },
                        { label: 'Total Projects', value: selectedProjects.length, accent: 'border-outline-variant' },
                      ];
                      return metrics.map(m => (
                        <div key={m.label} className={`p-6 md:p-8 bg-surface-container-lowest border-l-2 ${m.accent}`}>
                          <span className="block font-label text-[10px] text-on-surface-variant uppercase tracking-[0.2em] mb-2">{m.label}</span>
                          <span className={`text-2xl md:text-3xl font-headline font-bold ${m.highlight ? 'text-primary' : 'text-on-surface'}`}>
                            {m.value}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Main grid — notes + proposal history */}
                  <div className="grid grid-cols-12 gap-8 md:gap-12">

                    {/* Notes */}
                    <div className="col-span-12 md:col-span-4">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-headline text-2xl text-on-surface">Internal Notes</h3>
                        <span className="material-symbols-outlined text-on-surface-variant text-lg">add_notes</span>
                      </div>
                      {selected.id ? (
                        <div className="bg-surface-container-low p-6 rounded-md">
                          <textarea
                            value={editForm.notes || ''}
                            onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                            rows={6}
                            placeholder="Key contacts, relationship context, strategic observations…"
                            className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-body text-on-surface-variant leading-relaxed resize-y"
                          />
                          <button
                            onClick={saveProfile}
                            disabled={saving}
                            className="mt-4 bg-primary text-on-primary px-4 py-2 text-[10px] font-label uppercase tracking-widest font-bold disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Save Notes'}
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-on-surface-variant italic">Create a profile to add relationship notes.</p>
                      )}
                    </div>

                    {/* Proposal history */}
                    <div className="col-span-12 md:col-span-8">
                      <h3 className="font-headline text-2xl text-on-surface mb-8">Proposal History</h3>
                      {selectedProjects.length === 0 ? (
                        <p className="text-sm text-on-surface-variant italic">No projects found for this client yet.</p>
                      ) : (
                        <div className="bg-surface-container-lowest overflow-hidden border border-outline-variant/10">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-surface-container-low">
                                <th className="px-6 py-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Project Name</th>
                                <th className="px-6 py-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Status</th>
                                <th className="px-6 py-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant text-right">Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/10">
                              {selectedProjects.map(p => {
                                const isWon = p.outcome === 'won';
                                const isLost = p.outcome === 'lost';
                                const statusDot = isWon ? 'bg-primary' : isLost ? 'bg-error' : 'bg-outline-variant';
                                const statusColor = isWon ? 'text-primary' : isLost ? 'text-error' : 'text-on-surface-variant';
                                return (
                                  <tr key={p.id} className="group hover:bg-surface-container-high/40 transition-colors cursor-pointer" onClick={() => router.push(`/repository/${p.id}`)}>
                                    <td className="px-6 py-5">
                                      <span className="block font-body text-sm font-bold text-on-surface truncate">{p.name}</span>
                                      <span className="text-[10px] font-label text-on-surface-variant uppercase">
                                        {p.date_submitted?.slice(0, 4) || '—'} · {p.sector || 'Untagged'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-5">
                                      <span className={`flex items-center gap-2 text-[10px] font-label uppercase ${statusColor}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                                        {p.outcome || 'pending'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-5 text-right font-headline text-base text-on-surface whitespace-nowrap">
                                      {formatMoney(p.contract_value, p.currency)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}
