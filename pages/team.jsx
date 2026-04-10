import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { Btn, Card, Spinner, Toast, Input, Select, Textarea } from '../components/ui';
import { useUser } from '../lib/useUser';
import { currencySymbol } from '../lib/format';

const AVAILS = ['Available — Full time','Available — Part time','Partially Available','On Project (available next quarter)','Unavailable'];
const COLORS = ['#2d6b78','#3d5c3a','#8b3a5c','#5c4a2a','#4a2a5c','#2a4a3c','#7a3a1c','#1c3a7a'];

export default function Team() {
  const { user, loading: authLoading } = useUser();
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState('members');
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [showRoleImport, setShowRoleImport] = useState(false);
  const [roleImportRows, setRoleImportRows] = useState([]);
  const [roleImportLoading, setRoleImportLoading] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState(new Set());
  const [roleSelectMode, setRoleSelectMode] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editingRoleField, setEditingRoleField] = useState({});
  const roleFileRef = useRef();
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const spreadsheetRef = useRef();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  function toggleSelectMember(id) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()); }

  async function deleteSelected() {
    if (!selectedIds.size) return;
    if (!confirm(`Remove ${selectedIds.size} team member${selectedIds.size>1?'s':''}?`)) return;
    let removed = 0;
    for (const id of selectedIds) {
      const r = await fetch(`/api/team/${id}`, { method:'DELETE' });
      if (r.ok) removed++;
    }
    setToast(`${removed} member${removed>1?'s':''} removed`);
    exitSelectMode();
    loadTeam();
  }

  useEffect(() => { if (user) { loadTeam(); loadRoles(); } }, [user]);

  async function loadRoles() {
    setRolesLoading(true);
    const r = await fetch('/api/team/roles');
    const d = await r.json();
    setRoles(d.roles || []);
    setRolesLoading(false);
  }

  async function handleRoleFileSelect(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    setRoleImportLoading(true);
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/team/roles', { method: 'POST', body: fd });
    const d = await r.json();
    if (r.ok && d.rows) {
      setRoleImportRows(d.rows.map(row => ({ ...row, selected: true })));
      setShowRoleImport(true);
      if (d.duplicates_removed > 0) setToast(`${d.duplicates_removed} duplicate${d.duplicates_removed>1?'s':''} removed`);
    } else {
      setToast((d.error || 'Could not read file') + (d.hint ? ' — ' + d.hint : ''));
    }
    setRoleImportLoading(false);
  }

  async function confirmRoleImport() {
    const selected = roleImportRows.filter(r => r.selected);
    if (!selected.length) return;
    setRoleImportLoading(true);
    const r = await fetch('/api/team/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: selected }),
    });
    const d = await r.json();
    if (r.ok) {
      setToast(`✓ Imported ${d.imported} role${d.imported!==1?'s':''}`);
      setShowRoleImport(false); setRoleImportRows([]);
      loadRoles();
    } else setToast(d.error || 'Import failed');
    setRoleImportLoading(false);
  }

  async function deleteSelectedRoles() {
    if (!selectedRoleIds.size) return;
    if (!confirm(`Delete ${selectedRoleIds.size} role${selectedRoleIds.size>1?'s':''}?`)) return;
    const r = await fetch('/api/team/roles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedRoleIds] }),
    });
    const d = await r.json();
    setToast(`${d.deleted} role${d.deleted>1?'s':''} deleted`);
    setRoleSelectMode(false); setSelectedRoleIds(new Set());
    loadRoles();
  }

  async function saveRoleEdit(id) {
    await fetch('/api/team/roles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editingRoleField }),
    });
    setRoles(prev => prev.map(r => r.id === id ? { ...r, ...editingRoleField } : r));
    setEditingRoleId(null); setEditingRoleField({});
    setToast('Saved');
  }

  if (authLoading) return null;
  if (!user) return null;

  async function loadTeam() {
    const r = await fetch('/api/team');
    const d = await r.json();
    setMembers(d.members || []);
    setHistory(d.history || []);
    setLoading(false);
  }

  async function deleteMember(id, name) {
    if (!confirm(`Remove ${name}?`)) return;
    await fetch(`/api/team/${id}`, { method: 'DELETE' });
    loadTeam();
    setToast(`${name} removed`);
  }

  async function handleSpreadsheetSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportLoading(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/team/import?preview=true', { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok && d.rows) {
        setImportRows(d.rows.map(row => ({ ...row, selected: true })));
        setShowImport(true);
        const msgs = [];
        if (d.duplicates_removed > 0) msgs.push(`${d.duplicates_removed} duplicate${d.duplicates_removed>1?'s':''} removed`);
        if (d.ai_mapping_used) msgs.push('AI used to detect columns');
        if (msgs.length) setToast(msgs.join(' · '));
      } else {
        const d2 = await r.json().catch(() => ({}));
        setToast((d.error || d2.error || 'Could not read file') + (d.hint ? ' — ' + d.hint : ''));
      }
    } catch (err) {
      setToast('Error: ' + err.message);
    }
    setImportLoading(false);
  }

  async function confirmImport() {
    const selected = importRows.filter(r => r.selected);
    if (!selected.length) { setToast('No rows selected'); return; }
    setImportLoading(true);
    try {
      const r = await fetch('/api/team/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: selected }),
      });
      const d = await r.json();
      if (r.ok) {
        setImportResult(d);
        setToast(`✓ Imported ${d.imported} team member${d.imported !== 1 ? 's' : ''}`);
        setShowImport(false);
        setImportRows([]);
        loadTeam();
      } else {
        setToast('Import failed: ' + (d.error || 'Unknown error'));
      }
    } catch (err) {
      setToast('Error: ' + err.message);
    }
    setImportLoading(false);
  }

  function updateRow(i, field, value) {
    setImportRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  const avgClient = members.length ? Math.round(members.reduce((a, m) => a + m.day_rate_client, 0) / members.length) : 0;
  const avgCost = members.length ? Math.round(members.reduce((a, m) => a + m.day_rate_cost, 0) / members.length) : 0;
  const avgMargin = avgClient ? Math.round((1 - avgCost / avgClient) * 100) : 0;

  return (
    <>
      <Head><title>Team Setup — ProposalIQ</title></Head>
      <Layout title="Team Setup" subtitle="Specialists, rates and CV matching" user={user}
        actions={
          <div className="flex gap-2">
            {selectMode ? (
              <>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox"
                    checked={selectedIds.size === members.length && members.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(members.map(m=>m.id)) : new Set())} />
                  <span style={{color:'#6b6456'}}>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</span>
                </label>
                {selectedIds.size > 0 && (
                  <Btn variant="danger" onClick={deleteSelected}>✕ Remove {selectedIds.size}</Btn>
                )}
                <Btn variant="ghost" onClick={exitSelectMode}>Cancel</Btn>
              </>
            ) : (
              <>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] font-medium rounded-md border border-[#ddd5c4] hover:bg-cream cursor-pointer transition-all">
                  <input type="file" accept=".xlsx,.xls,.csv,.docx,.doc,.txt" className="hidden"
                    ref={spreadsheetRef}
                    onChange={handleSpreadsheetSelect} />
                  {importLoading ? <><Spinner size={12} /> Reading…</> : '⊞ Import team from spreadsheet'}
                </label>
                {members.length > 0 && (
                  <button onClick={() => setSelectMode(true)}
                    className="text-xs px-3 py-1.5 rounded-md border transition-all hover:bg-gray-50"
                    style={{borderColor:'#ddd5c4',color:'#6b6456'}}>
                    ☐ Select
                  </button>
                )}
                <Btn variant="teal" onClick={() => { setEditMember(null); setShowAdd(true); }}>⊕ Add Member</Btn>
              </>
            )}
          </div>
        }>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b bg-white flex-shrink-0" style={{borderColor:'#ddd5c4'}}>
            {[['members','Team Members'],['ratecard','Rate Card']].map(([id,label])=>(
              <button key={id} onClick={()=>setActiveTab(id)}
                className="px-5 py-3 text-[12.5px] font-medium border-b-2 transition-all"
                style={{borderColor:activeTab===id?'#1e4a52':'transparent',color:activeTab===id?'#1e4a52':'#6b6456'}}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">

            {/* Import preview table */}
            {showImport && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-serif text-base">Review Import</h2>
                    <p className="text-xs mt-0.5" style={{ color: '#6b6456' }}>{importRows.length} rows found — review and edit, then click Import Selected.</p>
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="ghost" onClick={() => { setShowImport(false); setImportRows([]); }}>Cancel</Btn>
                    <Btn variant="teal" onClick={confirmImport} disabled={importLoading || !importRows.some(r => r.selected)}>
                      {importLoading ? <><Spinner size={12} /> Importing…</> : `⊕ Import Selected (${importRows.filter(r => r.selected).length})`}
                    </Btn>
                  </div>
                </div>

                <Card className="overflow-auto">
                  {/* Header */}
                  <div className="grid text-[10px] font-mono uppercase tracking-widest px-3 py-2 border-b sticky top-0 bg-white z-10"
                    style={{ gridTemplateColumns: '32px 1.2fr 1fr 1fr 90px 90px 70px', borderColor: '#f0ebe0', color: '#6b6456' }}>
                    <span>
                      <input type="checkbox" checked={importRows.every(r => r.selected)}
                        onChange={e => setImportRows(rows => rows.map(r => ({ ...r, selected: e.target.checked })))} />
                    </span>
                    <span>Name</span><span>Title / Role</span><span>Specialisms</span>
                    <span>Client £/d</span><span>Cost £/d</span><span>Yrs</span>
                  </div>

                  {importRows.map((row, i) => (
                    <div key={i} className={`grid items-center px-3 py-2 border-b text-xs ${row.selected ? '' : 'opacity-40'}`}
                      style={{ gridTemplateColumns: '32px 1.2fr 1fr 1fr 90px 90px 70px', borderColor: '#f0ebe0' }}>
                      <input type="checkbox" checked={row.selected} onChange={e => updateRow(i, 'selected', e.target.checked)} />
                      <input value={row.name || ''} onChange={e => updateRow(i, 'name', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none focus:border-[#1e4a52]" style={{ borderColor: row.name ? '#ddd5c4' : '#f4a0a0' }} />
                      <input value={row.title || ''} onChange={e => updateRow(i, 'title', e.target.value)}
                        placeholder="Add title…"
                        className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none focus:border-[#1e4a52]" style={{ borderColor: '#ddd5c4' }} />
                      <input value={Array.isArray(row.stated_specialisms) ? row.stated_specialisms.join(', ') : (row.stated_specialisms || '')}
                        onChange={e => updateRow(i, 'stated_specialisms', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}
                        placeholder="e.g. Agile, PMO…"
                        className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none" style={{ borderColor: '#ddd5c4' }} />
                      <input value={row.day_rate_client || ''} onChange={e => updateRow(i, 'day_rate_client', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none" style={{ borderColor: '#ddd5c4' }} />
                      <input value={row.day_rate_cost || ''} onChange={e => updateRow(i, 'day_rate_cost', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs outline-none" style={{ borderColor: '#ddd5c4' }} />
                      <input value={row.years_experience || ''} onChange={e => updateRow(i, 'years_experience', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs outline-none" style={{ borderColor: '#ddd5c4' }} />
                    </div>
                  ))}
                </Card>

                <p className="text-xs mt-2" style={{ color: '#6b6456' }}>
                  ✓ Check the box to include a row. Edit any field inline — names highlighted in red need attention. Comma-separate multiple specialisms. Bio and CV can be added after import.
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-12 justify-center" style={{ color: '#6b6456' }}><Spinner /> Loading team…</div>
            ) : members.length === 0 && !showImport ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3 opacity-25">◉</div>
                <div className="font-serif text-lg mb-2 opacity-40">No team members yet</div>
                <p className="text-sm mb-4" style={{ color: '#6b6456' }}>Add people manually or import from a spreadsheet, Word doc, or CSV.</p>
                <div className="flex gap-3 justify-center">
                  <Btn variant="teal" onClick={() => setShowAdd(true)}>⊕ Add Manually</Btn>
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] font-medium rounded-md border border-[#ddd5c4] hover:bg-cream cursor-pointer">
                    <input type="file" accept=".xlsx,.xls,.csv,.docx,.doc,.txt" className="hidden" onChange={handleSpreadsheetSelect} />
                    ⊞ Import File
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map(m => {
                  const memberHistory = history.filter(h => h.member_id === m.id);
                  const cv = m.cv_extracted || {};
                  return (
                    <Card key={m.id} className="overflow-hidden">
                      <div className="flex items-start gap-4 p-4" style={selectedIds.has(m.id) ? {background:'#e8f2f4'} : {}}>
                        <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white flex-shrink-0"
                          style={{ background: m.color || '#2d6b78' }}>
                          {m.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold flex items-center gap-2">
                                {m.name}
                                {m.cv_filename && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#e8f2f4', color: '#1e4a52' }}>CV ✓</span>}
                              </div>
                              <div className="text-xs mb-2" style={{ color: '#6b6456' }}>{m.title} · {m.years_experience} yrs exp</div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0 items-center">
                              {selectMode ? (
                                <input type="checkbox" checked={selectedIds.has(m.id)}
                                  onChange={() => toggleSelectMember(m.id)}
                                  className="w-4 h-4 cursor-pointer" style={{accentColor:'#1e4a52'}} />
                              ) : (
                                <>
                                  <Btn size="sm" variant="ghost" onClick={() => { setEditMember(m); setShowAdd(true); }}>Edit</Btn>
                                  <Btn size="sm" variant="danger" onClick={() => deleteMember(m.id, m.name)}>Remove</Btn>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-1">
                            {(m.stated_specialisms || []).map(s => (
                              <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#e8f2f4', color: '#1e4a52' }}>{s}</span>
                            ))}
                          </div>
                          {cv.certifications?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {cv.certifications.slice(0, 3).map(c => (
                                <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#edf3ec', color: '#3d5c3a' }}>{c}</span>
                              ))}
                            </div>
                          )}
                          {memberHistory.length > 0 && (
                            <div className="mt-1 text-[10px] font-mono" style={{ color: '#6b6456' }}>
                              {memberHistory.length} project{memberHistory.length !== 1 ? 's' : ''} · {memberHistory.filter(h => h.outcome === 'won').length} won
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 border-t" style={{ borderColor: '#f0ebe0' }}>
                        {[
                          ['Client / Day', `£${m.day_rate_client.toLocaleString()}`],
                          ['Cost / Day', `£${m.day_rate_cost.toLocaleString()}`],
                          ['Margin', `${m.day_rate_client ? Math.round((1 - m.day_rate_cost / m.day_rate_client) * 100) : 0}%`],
                          ['Availability', m.availability.split(' — ')[0] || m.availability],
                        ].map(([lbl, val], i) => (
                          <div key={lbl} className={`px-3 py-2 text-center ${i > 0 ? 'border-l' : ''}`} style={{ borderColor: '#f0ebe0' }}>
                            <div className="text-xs font-mono font-medium">{val}</div>
                            <div className="text-[10px] font-mono mt-0.5" style={{ color: '#6b6456' }}>{lbl}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
                <button onClick={() => { setEditMember(null); setShowAdd(true); }}
                  className="w-full border-2 border-dashed rounded-lg p-5 text-center transition-all hover:border-teal/50" style={{ borderColor: '#ddd5c4' }}>
                  <div className="text-xl mb-1 opacity-40">⊕</div>
                  <div className="text-sm" style={{ color: '#6b6456' }}>Add another team member</div>
                </button>
              </div>
            )}
          {activeTab === 'ratecard' && (
            <div className="flex-1 overflow-y-auto p-6">
              {/* Role import preview */}
              {showRoleImport && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="font-serif text-base">Review Role Import</h2>
                      <p className="text-xs mt-0.5" style={{color:'#6b6456'}}>{roleImportRows.length} roles found — review then import.</p>
                    </div>
                    <div className="flex gap-2">
                      <Btn variant="ghost" onClick={()=>{setShowRoleImport(false);setRoleImportRows([]);}}>Cancel</Btn>
                      <Btn variant="teal" onClick={confirmRoleImport} disabled={roleImportLoading||!roleImportRows.some(r=>r.selected)}>
                        {roleImportLoading?<><Spinner size={12}/> Importing…</>:`⊕ Import Selected (${roleImportRows.filter(r=>r.selected).length})`}
                      </Btn>
                    </div>
                  </div>
                  <Card className="overflow-auto">
                    <div className="grid text-[10px] font-mono uppercase tracking-widest px-3 py-2 border-b sticky top-0 bg-white"
                      style={{gridTemplateColumns:'32px 1.5fr 100px 120px 100px 100px 80px',borderColor:'#f0ebe0',color:'#6b6456'}}>
                      <span><input type="checkbox" checked={roleImportRows.every(r=>r.selected)} onChange={e=>setRoleImportRows(rows=>rows.map(r=>({...r,selected:e.target.checked})))}/></span>
                      <span>Role Name</span><span>Grade</span><span>Category</span><span>Client £/d</span><span>Cost £/d</span><span>Currency</span>
                    </div>
                    {roleImportRows.map((row,i)=>(
                      <div key={i} className={`grid items-center px-3 py-2 border-b text-xs ${row.selected?'':'opacity-40'}`}
                        style={{gridTemplateColumns:'32px 1.5fr 100px 120px 100px 100px 80px',borderColor:'#f0ebe0'}}>
                        <input type="checkbox" checked={row.selected} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,selected:e.target.checked}:r))}/>
                        <input value={row.role_name||''} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,role_name:e.target.value}:r))}
                          className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none" style={{borderColor:'#ddd5c4'}}/>
                        <input value={row.grade||''} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,grade:e.target.value}:r))}
                          className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none" style={{borderColor:'#ddd5c4'}}/>
                        <input value={row.category||''} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,category:e.target.value}:r))}
                          className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none" style={{borderColor:'#ddd5c4'}}/>
                        <input value={row.day_rate_client||''} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,day_rate_client:e.target.value}:r))}
                          className="w-full px-2 py-1 border rounded text-xs mr-1 outline-none" style={{borderColor:'#ddd5c4'}}/>
                        <input value={row.day_rate_cost||''} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,day_rate_cost:e.target.value}:r))}
                          className="w-full px-2 py-1 border rounded text-xs outline-none" style={{borderColor:'#ddd5c4'}}/>
                        <select value={row.currency||'GBP'} onChange={e=>setRoleImportRows(rows=>rows.map((r,idx)=>idx===i?{...r,currency:e.target.value}:r))}
                          className="w-full px-1 py-1 border rounded text-xs outline-none" style={{borderColor:'#ddd5c4'}}>
                          {['GBP','USD','EUR','AED','AUD','CAD'].map(c=><option key={c}>{c}</option>)}
                        </select>
                      </div>
                    ))}
                  </Card>
                </div>
              )}

              {/* Rate card table */}
              {!showRoleImport && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-serif text-base">Rate Card</h2>
                      <p className="text-xs mt-0.5" style={{color:'#6b6456'}}>Standard job roles and day rates used for budget modelling.</p>
                    </div>
                    <div className="flex gap-2">
                      {roleSelectMode ? (
                        <>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" checked={selectedRoleIds.size===roles.length&&roles.length>0}
                              onChange={e=>setSelectedRoleIds(e.target.checked?new Set(roles.map(r=>r.id)):new Set())}/>
                            <span style={{color:'#6b6456'}}>{selectedRoleIds.size>0?`${selectedRoleIds.size} selected`:'Select all'}</span>
                          </label>
                          {selectedRoleIds.size>0&&<Btn variant="danger" onClick={deleteSelectedRoles}>✕ Delete {selectedRoleIds.size}</Btn>}
                          <Btn variant="ghost" onClick={()=>{setRoleSelectMode(false);setSelectedRoleIds(new Set());}}>Cancel</Btn>
                        </>
                      ) : (
                        <>
                          <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] font-medium rounded-md border border-[#ddd5c4] hover:bg-cream cursor-pointer transition-all">
                            <input type="file" ref={roleFileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleRoleFileSelect}/>
                            {roleImportLoading?<><Spinner size={12}/> Reading…</>:'⊞ Import Spreadsheet'}
                          </label>
                          {roles.length>0&&<button onClick={()=>setRoleSelectMode(true)}
                            className="text-xs px-3 py-1.5 rounded-md border" style={{borderColor:'#ddd5c4',color:'#6b6456'}}>☐ Select</button>}
                        </>
                      )}
                    </div>
                  </div>

                  {rolesLoading ? (
                    <div className="flex items-center gap-2 py-12 justify-center" style={{color:'#6b6456'}}><Spinner/> Loading…</div>
                  ) : roles.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="text-4xl mb-3 opacity-25">◈</div>
                      <p className="text-sm mb-4" style={{color:'#6b6456'}}>No roles yet. Import a spreadsheet with columns for Role, Grade, Category, Client Rate, Cost Rate.</p>
                      <label className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md cursor-pointer text-white" style={{background:'#1e4a52'}}>
                        <input type="file" ref={roleFileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleRoleFileSelect}/>
                        ⊞ Import Rate Card
                      </label>
                    </div>
                  ) : (
                    <>
                      {/* Group by category */}
                      {Object.entries(roles.reduce((acc,r)=>{
                        const cat=r.category||'Uncategorised';
                        if(!acc[cat]) acc[cat]=[];
                        acc[cat].push(r); return acc;
                      },{})).map(([cat,catRoles])=>(
                        <div key={cat} className="mb-6">
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#6b6456'}}>{cat}</div>
                          <Card className="overflow-hidden">
                            <div className="grid text-[10px] font-mono uppercase tracking-widest px-4 py-2 border-b"
                              style={{gridTemplateColumns:roleSelectMode?'32px 1.5fr 100px 120px 120px 80px':'1.5fr 100px 120px 120px 80px',background:'#f8f6f2',borderColor:'#f0ebe0',color:'#6b6456'}}>
                              {roleSelectMode&&<span/>}
                              <span>Role</span><span>Grade</span><span>Client £/day</span><span>Cost £/day</span><span>Margin</span>
                            </div>
                            {catRoles.map(role=>{
                              const margin = role.day_rate_client ? Math.round((1-role.day_rate_cost/role.day_rate_client)*100) : 0;
                              const isEditing = editingRoleId === role.id;
                              return (
                                <div key={role.id}
                                  className={`grid items-center px-4 py-2.5 border-b last:border-0 text-sm transition-all ${roleSelectMode&&selectedRoleIds.has(role.id)?'bg-[#e8f2f4]':''}`}
                                  style={{gridTemplateColumns:roleSelectMode?'32px 1.5fr 100px 120px 120px 80px':'1.5fr 100px 120px 120px 80px',borderColor:'#f0ebe0'}}>
                                  {roleSelectMode&&(
                                    <input type="checkbox" checked={selectedRoleIds.has(role.id)}
                                      onChange={()=>setSelectedRoleIds(prev=>{const n=new Set(prev);n.has(role.id)?n.delete(role.id):n.add(role.id);return n;})}
                                      className="w-4 h-4 cursor-pointer" style={{accentColor:'#1e4a52'}}/>
                                  )}
                                  {isEditing ? (
                                    <>
                                      <input autoFocus defaultValue={role.role_name}
                                        onChange={e=>setEditingRoleField(f=>({...f,role_name:e.target.value}))}
                                        className="px-2 py-1 border rounded text-xs outline-none focus:border-[#1e4a52]" style={{borderColor:'#ddd5c4'}}/>
                                      <input defaultValue={role.grade}
                                        onChange={e=>setEditingRoleField(f=>({...f,grade:e.target.value}))}
                                        className="px-2 py-1 border rounded text-xs outline-none" style={{borderColor:'#ddd5c4'}}/>
                                      <input defaultValue={role.day_rate_client}
                                        onChange={e=>setEditingRoleField(f=>({...f,day_rate_client:parseFloat(e.target.value)||0}))}
                                        className="px-2 py-1 border rounded text-xs outline-none" style={{borderColor:'#ddd5c4'}}/>
                                      <input defaultValue={role.day_rate_cost}
                                        onChange={e=>setEditingRoleField(f=>({...f,day_rate_cost:parseFloat(e.target.value)||0}))}
                                        className="px-2 py-1 border rounded text-xs outline-none" style={{borderColor:'#ddd5c4'}}/>
                                      <div className="flex gap-1">
                                        <button onClick={()=>saveRoleEdit(role.id)} className="text-[10px] px-2 py-1 rounded text-white" style={{background:'#1e4a52'}}>✓</button>
                                        <button onClick={()=>{setEditingRoleId(null);setEditingRoleField({});}} className="text-[10px] px-2 py-1 rounded border" style={{borderColor:'#ddd5c4',color:'#6b6456'}}>✕</button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={()=>{if(!roleSelectMode){setEditingRoleId(role.id);setEditingRoleField({role_name:role.role_name,grade:role.grade,day_rate_client:role.day_rate_client,day_rate_cost:role.day_rate_cost});}}}
                                        className="text-left hover:text-teal transition-colors font-medium text-sm">{role.role_name}</button>
                                      <span className="text-xs font-mono" style={{color:'#6b6456'}}>{role.grade}</span>
                                      <span className="font-mono text-sm">{currencySymbol(role.currency)}{(role.day_rate_client||0).toLocaleString()}</span>
                                      <span className="font-mono text-sm" style={{color:'#6b6456'}}>{currencySymbol(role.currency)}{(role.day_rate_cost||0).toLocaleString()}</span>
                                      <span className="font-mono text-sm font-medium" style={{color:margin>=40?'#3d5c3a':margin>=20?'#b8962e':'#b04030'}}>{margin}%</span>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </Card>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
          </div>

          <aside className="w-64 flex-shrink-0 overflow-y-auto p-4 space-y-4 border-l" style={{ background: '#f0ebe0', borderColor: '#ddd5c4' }}>
            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Team Overview</div>
              {[['Members', members.length], ['Avg Client Rate', `£${avgClient.toLocaleString()}/day`], ['Avg Cost Rate', `£${avgCost.toLocaleString()}/day`], ['Blended Margin', `${avgMargin}%`], ['With CV', members.filter(m => m.cv_filename).length]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b last:border-0 text-xs" style={{ borderColor: '#f0ebe0' }}>
                  <span style={{ color: '#6b6456' }}>{k}</span><span className="font-mono font-medium">{v}</span>
                </div>
              ))}
            </Card>
            <Card className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#6b6456' }}>Import Formats</div>
              <p className="text-xs leading-relaxed" style={{ color: '#6b6456' }}>
                Accepts Excel (.xlsx), CSV, Word (.docx), and plain text. Column names are detected automatically.
              </p>
            </Card>
            {activeTab === 'ratecard' && (
              <Card className="p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b6456' }}>Rate Card</div>
                {[['Roles', roles.length], ['Categories', new Set(roles.map(r=>r.category||'Uncategorised')).size]].map(([k,v])=>(
                  <div key={k} className="flex justify-between py-1.5 border-b last:border-0 text-xs" style={{borderColor:'#f0ebe0'}}>
                    <span style={{color:'#6b6456'}}>{k}</span><span className="font-mono font-medium">{v}</span>
                  </div>
                ))}
              </Card>
            )}
          </aside>
          </div>
        </div>
      </Layout>

      {showAdd && (
        <MemberModal member={editMember} onClose={() => setShowAdd(false)}
          onSaved={() => { loadTeam(); setShowAdd(false); setToast(editMember ? 'Updated' : 'Team member added'); }}
          onToast={setToast} />
      )}
      <Toast msg={toast} onClose={() => setToast('')} />
    </>
  );
}

function MemberModal({ member: m, onClose, onSaved, onToast }) {
  const [form, setForm] = useState({ name: m?.name||'', title: m?.title||'', years_experience: m?.years_experience||'', day_rate_client: m?.day_rate_client||'', day_rate_cost: m?.day_rate_cost||'', availability: m?.availability||'Available — Full time', stated_specialisms: m?.stated_specialisms||[], stated_sectors: m?.stated_sectors||'', bio: m?.bio||'', color: m?.color||COLORS[Math.floor(Math.random()*COLORS.length)] });
  const [specInput, setSpecInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [cvResult, setCvResult] = useState(m?.cv_extracted || null);
  const [pendingCvFile, setPendingCvFile] = useState(null); // CV queued for upload on save
  const [error, setError] = useState('');
  const cvRef = useRef();
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function addSpec(e) {
    if ((e.key === 'Enter' || e.key === ',') && specInput.trim()) {
      e.preventDefault();
      const val = specInput.trim().replace(/,$/, '');
      if (!form.stated_specialisms.includes(val)) f('stated_specialisms', [...form.stated_specialisms, val]);
      setSpecInput('');
    }
  }

  // Upload CV to an existing member (edit mode or after initial save)
  async function uploadCvToMember(memberId, file) {
    setUploadingCv(true);
    const fd = new FormData(); fd.append('cv', file);
    const r = await fetch(`/api/team/${memberId}`, { method: 'PATCH', body: fd });
    if (r.ok) { const d = await r.json(); setCvResult(d.extracted); onToast('CV uploaded and analysed'); }
    else onToast('CV upload failed');
    setUploadingCv(false);
  }

  // Handle CV file selection — if editing existing member, upload immediately.
  // If creating new member, queue the file to upload after save.
  function handleCvSelect(file) {
    if (!file) return;
    if (m?.id) {
      uploadCvToMember(m.id, file);
    } else {
      setPendingCvFile(file);
      onToast('CV queued — will upload when you save the member');
    }
  }

  async function save() {
    if (!form.name || !form.title) { setError('Name and title required'); return; }
    setSaving(true);
    const r = await fetch(m ? `/api/team/${m.id}` : '/api/team', {
      method: m ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      // If we have a pending CV file and this was a new member creation,
      // upload the CV now that we have the member ID.
      if (pendingCvFile && !m) {
        try {
          const d = await r.json();
          const newId = d.id || d.member?.id;
          if (newId) {
            await uploadCvToMember(newId, pendingCvFile);
          }
        } catch {}
      }
      setSaving(false);
      onSaved();
    } else {
      const d = await r.json();
      setError(d.error || 'Save failed');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,14,12,.65)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1e4a52, #2d6b78)' }}>
          <h2 className="font-serif text-lg text-white">{m ? 'Edit Team Member' : 'Add Team Member'}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white text-sm">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name" required value={form.name} onChange={e => f('name', e.target.value)} />
            <Input label="Job Title" required value={form.title} onChange={e => f('title', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Years Exp" type="number" value={form.years_experience} onChange={e => f('years_experience', e.target.value)} />
            <Input label="Client Rate/Day" type="number" value={form.day_rate_client} onChange={e => f('day_rate_client', e.target.value)} />
            <Input label="Cost Rate/Day" type="number" value={form.day_rate_cost} onChange={e => f('day_rate_cost', e.target.value)} />
          </div>
          <Select label="Availability" value={form.availability} onChange={e => f('availability', e.target.value)}>
            {AVAILS.map(a => <option key={a}>{a}</option>)}
          </Select>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: '#6b6456' }}>Specialisms — Enter to add</label>
            <div className="flex flex-wrap gap-1.5 p-2.5 border rounded-md min-h-[42px]" style={{ borderColor: '#ddd5c4' }}>
              {form.stated_specialisms.map(s => (
                <span key={s} className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: '#e8f2f4', color: '#1e4a52' }}>
                  {s}<button type="button" onClick={() => f('stated_specialisms', form.stated_specialisms.filter(x => x !== s))} className="opacity-60 hover:opacity-100">✕</button>
                </span>
              ))}
              <input value={specInput} onChange={e => setSpecInput(e.target.value)} onKeyDown={addSpec}
                placeholder="Type a specialism…" className="flex-1 min-w-24 text-xs outline-none bg-transparent" />
            </div>
          </div>
          <Input label="Key Sectors" value={form.stated_sectors} onChange={e => f('stated_sectors', e.target.value)} />
          <Textarea label="Background / Bio" rows={2} value={form.bio} onChange={e => f('bio', e.target.value)} />
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: '#6b6456' }}>CV / Bio Document</label>
            <input type="file" ref={cvRef} className="hidden" accept=".pdf,.docx,.doc,.txt" onChange={e => { if (e.target.files[0]) handleCvSelect(e.target.files[0]); }} />
            <div className={`rounded-lg p-3 border ${cvResult || pendingCvFile ? 'border-teal/30' : 'border-[#ddd5c4]'}`} style={{ background: '#f8f6f2' }}>
              {uploadingCv ? (
                <div className="flex items-center gap-2 text-sm"><Spinner size={14} /> Analysing CV…</div>
              ) : cvResult && Object.keys(cvResult).length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: '#1e4a52' }}>✓ CV Analysed</span>
                    <button type="button" onClick={() => cvRef.current?.click()} className="text-[10px]" style={{ color: '#6b6456' }}>Replace</button>
                  </div>
                  {cvResult.career_summary && <p className="text-xs mb-1" style={{ color: '#6b6456' }}>{cvResult.career_summary}</p>}
                </div>
              ) : pendingCvFile ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold" style={{ color: '#1e4a52' }}>◉ {pendingCvFile.name}</div>
                    <div className="text-[10px]" style={{ color: '#6b6456' }}>Will be uploaded and analysed when you save</div>
                  </div>
                  <button type="button" onClick={() => { setPendingCvFile(null); }} className="text-[10px]" style={{ color: '#6b6456' }}>Remove</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium mb-0.5">Upload CV or bio</div>
                    <div className="text-[10px]" style={{ color: '#6b6456' }}>PDF or DOCX · skills extracted automatically</div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => cvRef.current?.click()}>Browse</Btn>
                </div>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded p-3">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t flex-shrink-0" style={{ borderColor: '#ddd5c4' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="teal" onClick={save} disabled={saving}>{saving ? <><Spinner size={12} /> Saving…</> : m ? 'Save Changes' : 'Add Member'}</Btn>
        </div>
      </div>
    </div>
  );
}
