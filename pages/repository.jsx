import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../components/Layout';
import { Btn, Spinner, Toast } from '../components/ui';
import OnboardingPrompt from '../components/OnboardingPrompt';
import { useUser } from '../lib/useUser';
import { DebouncedSearch } from '../lib/useDebounce';
import ProjectCard from '../components/repository/ProjectCard';
import ProjectListRow from '../components/repository/ProjectListRow';
import UploadModal from '../components/repository/UploadModal';
import BatchModal from '../components/repository/BatchModal';

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Repository() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [folders, setFolders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [toast, setToast] = useState('');
  // Per-user workspace — which projects to use for RFP Intelligence
  const [workspaceIds, setWorkspaceIds] = useState(new Set());
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({'f-gov':true,'f-health':true});
  const [semanticSearch, setSemanticSearch] = useState(false);
  // View mode — persisted in localStorage so the user's preference survives
  // page reloads. Default to cards; switch to list for large repositories
  // where density and faster render matter more than the image-rich card.
  const [viewMode, setViewMode] = useState('card');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('repo_view_mode');
      if (saved === 'list' || saved === 'card') setViewMode(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('repo_view_mode', viewMode); } catch {}
  }, [viewMode]);
  const [analysisHealth, setAnalysisHealth] = useState(null);
  const [taxonomy, setTaxonomy] = useState({ offerings: [], sectors: [], serviceIndustries: [], clientIndustries: [] });
  const [selectedOffering, setSelectedOffering] = useState(null);
  const [selectedServiceIndustry, setSelectedServiceIndustry] = useState(null);
  const [selectedClientIndustry, setSelectedClientIndustry] = useState(null);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Session-scoped retry counter for auto-retrying failed analyses.
  // In-memory only — reloads reset the count, so a persistently broken
  // analysis won't loop forever.
  const retryTracker = useRef({});

  useEffect(()=>{
    loadFolders(); loadProjects(true);
    checkAnalysisHealth();
    // Load workspace selections for this user
    fetch('/api/workspace').then(r=>r.json()).then(d=>{
      setWorkspaceIds(new Set(d.project_ids || []));
      setWorkspaceLoaded(true);
    }).catch(()=>setWorkspaceLoaded(true));
    fetch('/api/taxonomy').then(r=>r.json()).then(d=>{
      const items = d.items || [];
      setTaxonomy({
        // Legacy single-axis taxonomy (kept for back-compat with old proposals)
        offerings: items.filter(i=>i.category==='Service Offering'),
        sectors: items.filter(i=>i.category==='Sector' && !i.parent_id),
        // New two-axis taxonomy
        serviceIndustries: items.filter(i=>i.category==='Industry' && i.taxonomy_type==='service'),
        clientIndustries: items.filter(i=>i.category==='Industry' && i.taxonomy_type==='client'),
      });
    }).catch(e => console.error('[repository] taxonomy load:', e.message));
  },[]);

  // Auto-retry logic for failed analyses.
  // Scans the current projects list for any in 'error' state and triggers
  // /reindex for them with a stagger, up to 3 tries per project per session.
  // Gets re-evaluated each time projects reload.
  useEffect(() => {
    if (!projects.length) return;
    const failed = projects.filter(p =>
      p.indexing_status === 'error' &&
      (retryTracker.current[p.id] || 0) < 3
    );
    if (!failed.length) return;

    let cancelled = false;
    (async () => {
      for (const p of failed) {
        if (cancelled) break;
        const attempt = (retryTracker.current[p.id] || 0) + 1;
        retryTracker.current[p.id] = attempt;
        console.log(`[auto-retry] ${p.id} attempt ${attempt}/3`);
        try {
          await fetch(`/api/projects/${p.id}/reindex`, { method: 'POST' });
        } catch {}
        // Stagger retries so they don't all hit the API at once
        await new Promise(r => setTimeout(r, 4000));
      }
      // After the retry batch, reload projects to pick up the new statuses
      if (!cancelled) setTimeout(() => loadProjects(), 5000);
    })();

    return () => { cancelled = true; };
  }, [projects.length]);

  async function checkAnalysisHealth() {
    try {
      const r = await fetch('/api/projects/check-analysis');
      const d = await r.json();
      setAnalysisHealth(d);
    } catch {}
  }

  async function runMissingAnalysis() {
    if (!analysisHealth?.unanalysedIds?.length) return;
    setRunningAnalysis(true);
    try {
      const r = await fetch('/api/projects/check-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: analysisHealth.unanalysedIds.map(p => p.id) }),
      });
      const d = await r.json();
      setToast(`✓ ${d.message} — this may take several minutes`);
      setAnalysisHealth(prev => ({ ...prev, unanalysed: 0, unanalysedIds: [] }));
      setTimeout(() => { loadProjects(); checkAnalysisHealth(); }, 5000);
    } catch { setToast('Failed to start analysis'); }
    setRunningAnalysis(false);
  }

  // Rescan every project in the repository. Staggered 1.5s between calls so
  // we don't flood the API. Confirms first because this incurs real AI cost
  // and can take a while for large libraries.
  async function rescanAll() {
    if (!projects.length) return;
    if (!confirm(
      `Re-analyse all ${projects.length} project${projects.length === 1 ? '' : 's'}?\n\n` +
      `This re-runs AI analysis across the full repository. It will cost money and take several minutes.`
    )) return;
    setRunningAnalysis(true);
    setToast(`Re-analysing ${projects.length} project${projects.length === 1 ? '' : 's'} — this may take a while…`);
    let started = 0, failed = 0;
    for (const p of projects) {
      try {
        const r = await fetch(`/api/projects/${p.id}/reindex`, { method: 'POST' });
        if (r.ok) started++; else failed++;
      } catch { failed++; }
      // 3s stagger matches batch import — the server-side OpenAI queue
      // serialises anyway, but a tighter client loop just piles work into
      // the backlog without getting through faster.
      await new Promise(res => setTimeout(res, 3000));
    }
    setToast(`✓ Kicked off ${started} rescans${failed ? ` (${failed} failed to start)` : ''}. Refresh in 60s to see updated analyses.`);
    setRunningAnalysis(false);
    setTimeout(() => { loadProjects(); checkAnalysisHealth(); }, 8000);
  }
  useEffect(()=>{ loadProjects(); },[selectedFolder,search,semanticSearch,selectedOffering,selectedServiceIndustry,selectedClientIndustry]);

  // Refetch when the tab becomes visible after being hidden. Covers the case
  // where AI analysis was triggered from another tab, an admin tool, or an
  // auto-retry the user wasn't watching — their User/AI/System ratings
  // reflect the latest state on return without requiring a manual reload.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') loadProjects();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  async function loadFolders(){ const r=await fetch('/api/folders'); const d=await r.json(); setFolders(d.folders||[]); }
  async function loadProjects(resetStuck = false){    setLoading(true);
    // Auto-reset projects stuck in 'indexing' state before loading
    if (resetStuck) {
      try { await fetch('/api/projects/reset-stuck', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }); } catch {}
    }
    const params=new URLSearchParams();
    if(selectedFolder==='failed') params.set('indexing_status','error');
    else if(selectedFolder!=='all') params.set('folder',selectedFolder);
    if(selectedOffering) params.set('offering',selectedOffering);
    if(selectedServiceIndustry) params.set('service_industry',selectedServiceIndustry);
    if(selectedClientIndustry) params.set('client_industry',selectedClientIndustry);
    if(search) params.set('search',search);
    if(search && semanticSearch) params.set('semantic','true');
    const r=await fetch('/api/projects?'+params.toString());
    const d=await r.json();
    setProjects(d.projects||[]);
    setLoading(false);
    // Refresh analysis health alongside the project list so the banner's
    // counts stay current as analyses complete / fail in the background.
    checkAnalysisHealth();
  }

  function toggle(fid){ setExpandedFolders(e=>({...e,[fid]:!e[fid]})); }
  const rootFolders = folders.filter(f=>!f.parent_id);
  const childFolders = (pid)=>folders.filter(f=>f.parent_id===pid);
  const handleDeleted = useCallback((id)=>setProjects(prev=>prev.filter(x=>x.id!==id)),[]);
  const handleUpdated = useCallback((id, fields)=>setProjects(prev=>prev.map(x=>x.id===id?{...x,...fields}:x)),[]);
  const handleToast = useCallback((msg)=>setToast(msg),[]);

  // Workspace toggle — add/remove a single project
  async function toggleWorkspace(projectId) {
    const inWorkspace = workspaceIds.has(projectId);
    // Optimistic update
    setWorkspaceIds(prev => {
      const next = new Set(prev);
      if (inWorkspace) next.delete(projectId); else next.add(projectId);
      return next;
    });
    try {
      await fetch('/api/workspace', {
        method: inWorkspace ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: [projectId] }),
      });
    } catch {
      // Revert on failure
      setWorkspaceIds(prev => {
        const next = new Set(prev);
        if (inWorkspace) next.add(projectId); else next.delete(projectId);
        return next;
      });
      setToast('Failed to update workspace');
    }
  }

  // Bulk add all visible projects to workspace
  async function addAllVisibleToWorkspace() {
    const ids = projects.map(p => p.id);
    setWorkspaceIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
    try {
      await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_ids: ids }) });
      setToast(`Added ${ids.length} projects to your workspace`);
    } catch { setToast('Failed'); }
  }

  // Clear workspace
  async function clearWorkspace() {
    setWorkspaceIds(new Set());
    try {
      await fetch('/api/workspace', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear_all: true }) });
      setToast('Workspace cleared — RFP scans will use all projects');
    } catch { setToast('Failed'); }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const r = await fetch('/api/folders', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:newFolderName.trim()}) });
    if (r.ok) { setNewFolderName(''); setCreatingFolder(false); loadFolders(); }
    else setToast('Failed to create folder');
  }

  async function renameFolder(id, name) {
    if (!name.trim()) return;
    await fetch(`/api/folders/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:name.trim()}) });
    setEditingFolderId(null);
    loadFolders();
  }

  async function deleteFolder(id) {
    if (!confirm('Delete this folder? Projects inside will be moved to All Projects.')) return;
    await fetch(`/api/folders?id=${id}`, { method:'DELETE' });
    loadFolders();
    if (selectedFolder === id) setSelectedFolder('all');
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()); }

  async function deleteSelected() {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} project${selectedIds.size>1?'s':''}? This cannot be undone.`)) return;
    let deleted = 0;
    for (const id of selectedIds) {
      const r = await fetch(`/api/projects/${id}`, { method:'DELETE' });
      if (r.ok) { deleted++; setProjects(prev=>prev.filter(x=>x.id!==id)); }
    }
    setToast(`${deleted} project${deleted>1?'s':''} deleted`);
    exitSelectMode();
  }
  const failedCount = projects.filter(p=>p.indexing_status==='error').length;

  const folderItems = [
    {id:'all',label:'All Projects',icon:'⊞',count:projects.length},
    {id:'starred',label:'Top Rated (4–5★)',icon:'★',count:projects.filter(p=>p.user_rating>=4).length},
    {id:'won',label:'Won',icon:'✓',count:projects.filter(p=>p.outcome==='won').length,color:'#7bd07a'},
    {id:'lost',label:'Lost',icon:'✗',count:projects.filter(p=>p.outcome==='lost').length,color:'#ffb4ab'},
    {id:'pending',label:'Pending / Active',icon:'◷',count:projects.filter(p=>['pending','active'].includes(p.outcome)).length,color:'#b8962e'},
    ...(failedCount>0?[{id:'failed',label:'Failed Uploads',icon:'⚠',count:failedCount,color:'#ffb4ab'}]:[]),
  ];

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Repository — ProposalIQ</title></Head>
      <Layout title="Repository" subtitle={`${projects.length} projects`} user={user}
        actions={<div className="flex gap-2">
          <button onClick={()=>setMobileFiltersOpen(true)} className="md:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-sm transition-all" aria-label="Open filters">
            <span className="material-symbols-outlined text-xl">tune</span>
          </button>
          <Btn variant="ghost" onClick={()=>setShowBatch(true)}>⊞ Batch Import</Btn>
          <Btn variant="gold" onClick={()=>setShowUpload(true)}>⊕ Upload Project</Btn>
        </div>}>
        <div className="flex h-full overflow-hidden bg-surface relative">
          {mobileFiltersOpen && (
            <div className="md:hidden fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm" onClick={()=>setMobileFiltersOpen(false)} />
          )}
          <aside className={`${mobileFiltersOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed top-0 bottom-0 left-0 z-[56] w-72 md:static md:z-auto md:w-60 flex-shrink-0 flex flex-col border-r border-outline-variant/10 overflow-y-auto bg-surface-container-lowest transition-transform duration-200`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
              <span className="font-label text-[10px] uppercase tracking-widest text-outline">Filters</span>
              <button onClick={()=>setMobileFiltersOpen(false)} className="md:hidden p-1 text-on-surface-variant hover:text-on-surface" aria-label="Close filters">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-3">
              {folderItems.map(fi=>(
                <button key={fi.id} onClick={()=>setSelectedFolder(fi.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-left text-sm transition-all mb-1 ${selectedFolder===fi.id?'text-primary bg-primary/5 font-medium':'text-on-surface-variant hover:bg-surface-container-high'}`}>
                  <span className="w-4 text-center text-xs">{fi.icon}</span>
                  <span className="flex-1">{fi.label}</span>
                  <span className="text-[10px] font-label text-outline">{fi.count}</span>
                </button>
              ))}
              <div className="font-label text-[10px] uppercase tracking-[0.2em] mt-6 mb-3 px-3 text-outline">By Sector</div>
              {/* Folder creation */}
              {creatingFolder ? (
                <div className="flex gap-1 mb-2">
                  <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')createFolder();if(e.key==='Escape'){setCreatingFolder(false);setNewFolderName('');}}}
                    placeholder="Folder name…"
                    className="flex-1 px-2 py-1 text-xs border rounded outline-none" style={{borderColor:'#4d4636'}}/>
                  <button onClick={createFolder} className="px-2 py-1 rounded text-white text-xs no-min-h" style={{background:'#1e4a52'}}>+</button>
                  <button onClick={()=>{setCreatingFolder(false);setNewFolderName('');}} className="px-1.5 py-1 rounded text-xs no-min-h" style={{color:'#d0c5b0'}}>✕</button>
                </div>
              ) : (
                <button onClick={()=>setCreatingFolder(true)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] mb-2 transition-all no-min-h"
                  style={{color:'#99907d',border:'1px dashed #ddd5c4'}}>
                  ⊕ New folder
                </button>
              )}

              {rootFolders.length === 0 && !creatingFolder && (
                <p className="text-[11px] px-2 pb-2" style={{color:'#99907d'}}>No folders yet — create one above to organise your proposals.</p>
              )}

              {rootFolders.map(folder=>{
                const children=childFolders(folder.id); const isOpen=expandedFolders[folder.id];
                return (
                  <div key={folder.id}>
                    {editingFolderId === folder.id ? (
                      <div className="flex gap-1 mb-0.5">
                        <input autoFocus value={editingFolderName} onChange={e=>setEditingFolderName(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')renameFolder(folder.id,editingFolderName);if(e.key==='Escape')setEditingFolderId(null);}}
                          className="flex-1 px-2 py-1 text-xs border rounded outline-none" style={{borderColor:'#7fb4bc'}}/>
                        <button onClick={()=>renameFolder(folder.id,editingFolderName)} className="px-2 py-1 rounded text-white text-xs no-min-h" style={{background:'#1e4a52'}}>✓</button>
                        <button onClick={()=>setEditingFolderId(null)} className="px-1.5 py-1 rounded text-xs no-min-h" style={{color:'#d0c5b0'}}>✕</button>
                      </div>
                    ) : (
                    <div className="flex items-center gap-1 group/folder">
                    <button onClick={()=>toggle(folder.id)}
                      className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12.5px] transition-all mb-0.5 ${selectedFolder===folder.id?'bg-surface-container shadow-sm font-medium':'hover:bg-black/5'}`}>
                      <span className="text-[10px]" style={{color:'#d0c5b0'}}>{isOpen?'▾':'▸'}</span>
                      <span className="text-sm">📁</span>
                      <span className="flex-1 truncate">{folder.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{background:'rgba(0,0,0,.06)',color:'#d0c5b0'}}>{folder.project_count}</span>
                    </button>
                    <div className="hidden group-hover/folder:flex gap-0.5">
                      <button onClick={()=>{setEditingFolderId(folder.id);setEditingFolderName(folder.name);}}
                        className="p-1 rounded text-[10px] hover:bg-black/10 no-min-h" style={{color:'#99907d'}} title="Rename">✎</button>
                      <button onClick={()=>deleteFolder(folder.id)}
                        className="p-1 rounded text-[10px] hover:bg-red-50 no-min-h" style={{color:'#ffb4ab'}} title="Delete">✕</button>
                    </div>
                    </div>
                    )}
                    {isOpen&&children.map(child=>(
                      <button key={child.id} onClick={()=>setSelectedFolder(child.id)}
                        className={`w-full flex items-center gap-2 pl-8 pr-2.5 py-1.5 rounded-md text-left text-[12px] transition-all mb-0.5 ${selectedFolder===child.id?'bg-surface-container shadow-sm font-medium':'hover:bg-black/5'}`}>
                        <span className="text-xs">📂</span>
                        <span className="flex-1 truncate">{child.name}</span>
                        <span className="text-[10px] font-mono" style={{color:'#d0c5b0'}}>{child.project_count}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {/* TYPE OF WORK — service_industry filter (teal) */}
              {taxonomy.serviceIndustries.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{borderColor:'#4d4636'}}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-2.5" style={{color:'#7fb4bc'}}>Type of Work</div>
                  <button onClick={()=>setSelectedServiceIndustry(null)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${!selectedServiceIndustry?'bg-surface-container shadow-sm font-medium':'hover:bg-black/5'}`}>
                    <span style={{color:'#7fb4bc'}}>◈</span>
                    <span className="flex-1">All Types</span>
                  </button>
                  {taxonomy.serviceIndustries.map(item=>(
                    <button key={item.id} onClick={()=>setSelectedServiceIndustry(selectedServiceIndustry===item.name?null:item.name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${selectedServiceIndustry===item.name?'shadow-sm font-medium':'hover:bg-black/5'}`}
                      style={selectedServiceIndustry===item.name?{background:'rgba(30,74,82,.12)',color:'#7fb4bc'}:{}}>
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{background:selectedServiceIndustry===item.name?'#1e4a52':'#4d4636'}}/>
                      <span className="flex-1 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* CLIENT SECTOR — client_industry filter (gold) */}
              {taxonomy.clientIndustries.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{borderColor:'#4d4636'}}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-2.5" style={{color:'#e8c357'}}>Client Sector</div>
                  <button onClick={()=>setSelectedClientIndustry(null)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${!selectedClientIndustry?'bg-surface-container shadow-sm font-medium':'hover:bg-black/5'}`}>
                    <span style={{color:'#e8c357'}}>◆</span>
                    <span className="flex-1">All Sectors</span>
                  </button>
                  {taxonomy.clientIndustries.map(item=>(
                    <button key={item.id} onClick={()=>setSelectedClientIndustry(selectedClientIndustry===item.name?null:item.name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${selectedClientIndustry===item.name?'shadow-sm font-medium':'hover:bg-black/5'}`}
                      style={selectedClientIndustry===item.name?{background:'rgba(184,150,46,.15)',color:'#e8c357'}:{}}>
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{background:selectedClientIndustry===item.name?'#b8962e':'#4d4636'}}/>
                      <span className="flex-1 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Legacy Service Offering taxonomy — kept for back-compat with pre-migration projects */}
              {taxonomy.offerings.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{borderColor:'#4d4636'}}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-2.5" style={{color:'#d0c5b0'}}>Legacy Tags</div>
                  <button onClick={()=>setSelectedOffering(null)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${!selectedOffering?'bg-surface-container shadow-sm font-medium':'hover:bg-black/5'}`}>
                    <span style={{color:'#d0c5b0'}}>◈</span>
                    <span className="flex-1">All Offerings</span>
                  </button>
                  {taxonomy.offerings.map(item=>(
                    <button key={item.id} onClick={()=>setSelectedOffering(selectedOffering===item.name?null:item.name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${selectedOffering===item.name?'bg-surface-container shadow-sm font-medium':'hover:bg-black/5'}`}>
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{background:selectedOffering===item.name?'#1e4a52':'#4d4636'}}/>
                      <span className="flex-1 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden bg-surface min-w-0">
            <header className="px-4 md:px-8 py-4 md:py-8">
              <div className="flex items-baseline justify-between mb-4 md:mb-8 gap-4 md:gap-6 flex-wrap">
                <h1 className="font-headline text-3xl md:text-5xl font-light tracking-tight">Repository</h1>
                <p className="hidden md:block text-on-surface-variant text-sm max-w-xs text-right">
                  Access curated intelligence from {projects.length} historical proposal{projects.length === 1 ? '' : 's'} and strategic assets.
                </p>
              </div>
              {selectMode ? (
                <div className="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg">
                  <label className="flex items-center gap-2 text-xs cursor-pointer px-2">
                    <input type="checkbox"
                      checked={selectedIds.size === projects.length && projects.length > 0}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(projects.map(p=>p.id)) : new Set())} />
                    <span className="text-on-surface-variant">{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</span>
                  </label>
                  <div className="flex-1"/>
                  {selectedIds.size > 0 && (
                    <button onClick={deleteSelected}
                      className="text-xs px-4 py-2 font-label uppercase tracking-widest bg-error-container text-on-error-container">
                      ✕ Delete {selectedIds.size}
                    </button>
                  )}
                  <button onClick={exitSelectMode}
                    className="text-xs px-4 py-2 font-label uppercase tracking-widest border border-outline/30 text-on-surface-variant hover:bg-surface-container-high transition-all">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg flex-wrap">
                  <div className="flex-grow relative min-w-[200px]">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
                    <DebouncedSearch
                      value={search}
                      onSearch={setSearch}
                      delay={400}
                      placeholder="Search by client, sector, or project keyword…"
                      className="w-full bg-transparent border-none focus:ring-0 focus:outline-none pl-10 text-sm placeholder:text-outline"
                    />
                  </div>
                  <div className="h-8 w-px bg-outline-variant/20"/>
                  <div className="flex items-center gap-1 px-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('card')}
                      title="Card view"
                      aria-label="Card view"
                      className={`p-1.5 rounded transition-colors ${viewMode === 'card' ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">grid_view</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      title="List view"
                      aria-label="List view"
                      className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">view_list</span>
                    </button>
                  </div>
                  <span className="text-[10px] font-label text-outline uppercase tracking-widest whitespace-nowrap">{projects.length} results</span>
                  <button onClick={()=>setSelectMode(true)}
                    className="text-[10px] font-label uppercase tracking-widest px-3 py-2 border border-outline/30 text-on-surface-variant hover:text-on-surface transition-all">
                    Select
                  </button>
                  <button onClick={rescanAll}
                    disabled={runningAnalysis || !projects.length}
                    title={`Re-analyse all ${projects.length} project${projects.length === 1 ? '' : 's'}`}
                    className="text-[10px] font-label uppercase tracking-widest px-3 py-2 border border-outline/30 text-on-surface-variant hover:text-primary hover:border-primary transition-all disabled:opacity-40 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">sync</span>
                    {runningAnalysis ? 'Rescanning…' : 'Rescan All'}
                  </button>
                  <button onClick={()=>setShowBatch(true)}
                    className="bg-primary text-on-primary px-6 py-2 text-[10px] font-label uppercase tracking-widest font-bold flex items-center gap-2 hover:brightness-110 transition-all">
                    <span className="material-symbols-outlined text-sm">library_add</span>
                    Batch Import
                  </button>
                  <button onClick={()=>setShowUpload(true)}
                    className="bg-primary text-on-primary px-6 py-2 text-[10px] font-label uppercase tracking-widest font-bold flex items-center gap-2 hover:brightness-110 transition-all">
                    <span className="material-symbols-outlined text-sm">upload</span>
                    Upload New
                  </button>
                </div>
              )}
            </header>
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
              {/* Workspace bar — shown when user has workspace selections */}
              {workspaceLoaded && workspaceIds.size > 0 && !loading && (
                <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg bg-tertiary-container/20 border border-tertiary-container/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse flex-shrink-0"/>
                  <span className="font-label text-[11px] uppercase tracking-widest text-tertiary">
                    Workspace: {workspaceIds.size} project{workspaceIds.size !== 1 ? 's' : ''} selected for RFP Intelligence
                  </span>
                  <div className="flex-1" />
                  <button onClick={addAllVisibleToWorkspace}
                    className="text-[10px] font-label uppercase tracking-widest px-2 py-1 text-tertiary hover:text-on-surface transition-colors">
                    + Add all visible
                  </button>
                  <button onClick={clearWorkspace}
                    className="text-[11px] px-2 py-1 rounded border transition-colors hover:bg-surface-container"
                    style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
                    Clear workspace
                  </button>
                </div>
              )}
              {workspaceLoaded && workspaceIds.size === 0 && !loading && projects.length > 0 && (
                <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-lg border border-dashed"
                  style={{ borderColor: '#4d4636', color: '#99907d' }}>
                  <span className="text-xs">
                    No workspace set — RFP scans will match against all projects. Click "+ Workspace" on any project to curate your scanning set.
                  </span>
                </div>
              )}
              <div className="mb-4">
                <OnboardingPrompt />
              </div>
              {analysisHealth && analysisHealth.unanalysed > 0 && !loading && (
                <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-lg border border-error/30 bg-error/10">
                  <span className="material-symbols-outlined text-error text-lg">warning</span>
                  <div className="flex-1 text-sm text-on-surface">
                    <div className="font-semibold text-error">
                      {analysisHealth.unanalysed} project{analysisHealth.unanalysed === 1 ? '' : 's'} need{analysisHealth.unanalysed === 1 ? 's' : ''} re-analysis
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {[
                        analysisHealth.errored && `${analysisHealth.errored} errored`,
                        analysisHealth.stuck_indexing && `${analysisHealth.stuck_indexing} stuck`,
                        analysisHealth.silently_empty && `${analysisHealth.silently_empty} empty result`,
                        analysisHealth.unindexed && `${analysisHealth.unindexed} never indexed`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Btn variant="gold" onClick={runMissingAnalysis} disabled={runningAnalysis}>
                    {runningAnalysis ? <><Spinner size={12}/> Queuing…</> : '⟳ Re-analyse all'}
                  </Btn>
                </div>
              )}
              {loading?(
                <div className="flex items-center gap-2 py-12 justify-center" style={{color:'#d0c5b0'}}><Spinner/> Loading projects…</div>
              ):projects.length===0?(
                <div className="text-center py-16">
                  <div className="text-4xl mb-3 opacity-25">⊞</div>
                  <div className="font-serif text-lg mb-2 opacity-40">No projects found</div>
                  <p className="text-sm mb-4" style={{color:'#d0c5b0'}}>{search?'Try a different search term':'Upload your first proposal to get started'}</p>
                  {!search&&<Btn variant="gold" onClick={()=>setShowUpload(true)}>⊕ Upload Project</Btn>}
                </div>
              ) : viewMode === 'list' ? (
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-sm overflow-hidden">
                  <div
                    className="grid items-center gap-3 px-4 py-2 bg-surface-container-high border-b border-outline-variant/20 text-[10px] font-label uppercase tracking-widest text-on-surface-variant"
                    style={{ gridTemplateColumns: '10px minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1fr) 70px 70px 60px 70px' }}
                  >
                    <span />
                    <span>Project</span>
                    <span>Client</span>
                    <span>Sector</span>
                    <span className="text-right">Value</span>
                    <span className="text-center">Outcome</span>
                    <span className="text-right">System</span>
                    <span className="text-right">Scanned</span>
                  </div>
                  {projects.map(p => <ProjectListRow key={p.id} project={p} />)}
                </div>
              ) : (
                <div className="grid gap-4" style={{gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))'}}>
                  {projects.map(p=><ProjectCard key={p.id} project={p} onToast={handleToast} onDeleted={handleDeleted} onUpdated={handleUpdated} selectMode={selectMode} selected={selectedIds.has(p.id)} onToggleSelect={()=>toggleSelect(p.id)} inWorkspace={workspaceIds.has(p.id)} onToggleWorkspace={()=>toggleWorkspace(p.id)}/>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
      {showUpload&&<UploadModal onClose={()=>{setShowUpload(false);loadProjects();loadFolders();}} folders={folders} onToast={handleToast}/>}
      {showBatch&&<BatchModal onClose={()=>{setShowBatch(false);loadProjects();}} folders={folders} onToast={handleToast}/>}
      <Toast msg={toast} onClose={()=>setToast('')}/>
    </>
  );
}
