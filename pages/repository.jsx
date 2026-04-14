import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../components/Layout';
import { Btn, Card, Stars, OutcomeLabel, FileChip, Spinner, Toast } from '../components/ui';
import { useUser } from '../lib/useUser';
import { formatMoney } from '../lib/format';
import { DebouncedSearch } from '../lib/useDebounce';

const OUTCOMES = ['won','lost','pending','active','withdrawn'];
const DEFAULT_SECTORS = ['Government & Public Sector','Healthcare & NHS','Aerospace & Defence','Financial Services','Technology','Retail & Consumer','Other'];
const DEFAULT_TYPES = ['Digital Transformation','Data & Analytics','Cloud Migration','Infrastructure','Software Development','Consultancy','Managed Services','Other'];
const DEFAULT_CURRENCIES = ['GBP','USD','EUR','AUD','CAD','CHF','JPY','SGD','AED'];
const AI_WEIGHT_DESC = { 1:'5% — loss analysis only', 2:'15% — negative example', 3:'40% — moderate influence', 4:'75% — high influence', 5:'100% — gold standard' };

// ─── STABLE FIELD COMPONENTS (module-level — never remount on re-render) ─────

const AiBadge = memo(function AiBadge({ show }) {
  if (!show) return null;
  return <span className="ml-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded align-middle" style={{ background:'rgba(30,74,82,.12)',color:'#1e4a52' }}>AI ✦</span>;
});

const FieldInput = memo(function FieldInput({ label, required, isAi, error, value, onChange, type='text', placeholder, inputMode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#6b6456'}}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}<AiBadge show={isAi} />
      </label>
      <input type={type} inputMode={inputMode} value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-md text-sm outline-none transition-colors bg-paper focus:bg-white ${error?'border-red-400':isAi?'border-teal/40 bg-teal-pale/20':'border-[#ddd5c4] focus:border-[#1e4a52]'}`} />
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
});

const FieldSelect = memo(function FieldSelect({ label, required, isAi, value, onChange, children }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#6b6456'}}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}<AiBadge show={isAi} />
      </label>
      <select value={value} onChange={onChange}
        className={`w-full px-3 py-2 border rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-[#1e4a52] transition-colors ${isAi?'border-teal/40 bg-teal-pale/20':'border-[#ddd5c4]'}`}>
        {children}
      </select>
    </div>
  );
});

const FieldTextarea = memo(function FieldTextarea({ label, value, onChange, rows=2, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#6b6456'}}>{label}</label>
      <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} style={{resize:'vertical'}}
        className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-[#1e4a52] transition-colors" />
    </div>
  );
});

const AddNewInline = memo(function AddNewInline({ field, label, placeholder, showParent, active, onActivate, onSave, onCancel, value, onValueChange, parentValue, onParentChange, rootFolders, saving }) {
  if (!active) return (
    <button type="button" onClick={onActivate} className="text-xs flex items-center gap-1 mt-1" style={{color:'#1e4a52'}}>
      <span>⊕</span> Add new {label||field}
    </button>
  );
  return (
    <div className="mt-1.5 rounded-md border p-2.5 space-y-2" style={{borderColor:'#1e4a52',background:'#e8f2f4'}}>
      <div className="text-[10px] font-mono uppercase tracking-wider" style={{color:'#1e4a52'}}>New {label||field}</div>
      {showParent && (
        <select value={parentValue} onChange={e=>onParentChange(e.target.value)} className="w-full px-2 py-1.5 border rounded text-xs outline-none bg-white" style={{borderColor:'#ddd5c4'}}>
          <option value="">Top level (no parent)</option>
          {rootFolders.map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <input autoFocus value={value} onChange={e=>onValueChange(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSave();}if(e.key==='Escape')onCancel();}}
          placeholder={placeholder} className="flex-1 px-2.5 py-1.5 border rounded text-xs outline-none bg-white" style={{borderColor:'#ddd5c4'}} />
        <button type="button" onClick={onSave} disabled={saving||!value.trim()} className="px-3 py-1.5 rounded text-xs text-white disabled:opacity-50" style={{background:'#1e4a52'}}>{saving?'…':'Add'}</button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 rounded text-xs" style={{color:'#6b6456'}}>Cancel</button>
      </div>
    </div>
  );
});

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────

const ProjectCard = memo(function ProjectCard({ project: p, onToast, onDeleted, onUpdated, selectMode, selected, onToggleSelect, inWorkspace, onToggleWorkspace }) {
  const router = useRouter();
  const meta = p.ai_metadata || {};
  const fileTypes = p.file_types || [];
  const ribbonColor = p.outcome==='won'?'#6ab187':p.outcome==='lost'?'#b04030':'transparent';
  const isFailed = p.indexing_status === 'error';
  const isIndexing = p.indexing_status === 'indexing';
  const [reanalysing, setReanalysing] = useState(false);
  const [liveStage, setLiveStage] = useState(null);

  useEffect(() => {
    if (!isIndexing) { setLiveStage(null); return; }
    let active = true;
    async function pollLog() {
      try {
        const r = await fetch(`/api/projects/indexing-log?project_id=${p.id}&limit=1`);
        const d = await r.json();
        const latest = d.logs?.[0];
        if (latest && active) setLiveStage(latest);
      } catch {}
      if (active && isIndexing) setTimeout(pollLog, 3000);
    }
    pollLog();
    return () => { active = false; };
  }, [isIndexing, p.id]);

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Delete "${p.name}"?\n\nThis cannot be undone.`)) return;
    const r = await fetch(`/api/projects/${p.id}`, { method:'DELETE' });
    if (r.ok) { onDeleted(p.id); onToast('Project deleted'); }
    else onToast('Delete failed');
  }

  async function handleReanalyse(e) {
    e.stopPropagation();
    setReanalysing(true);
    const r = await fetch(`/api/projects/${p.id}/reindex`, { method:'POST' });
    if (r.ok) onToast(`Re-analysis started for "${p.name}" — refresh in 60 seconds`);
    else onToast('Re-analysis failed — check API keys in Settings');
    setReanalysing(false);
  }

  // Status pill style per outcome
  const outcomeStyle = p.outcome === 'won'
    ? 'bg-green-900/30 text-green-400 border-green-400/20'
    : p.outcome === 'lost'
    ? 'bg-error-container/20 text-error border-error/20'
    : p.outcome === 'withdrawn'
    ? 'bg-surface-container-highest text-outline border-outline/20'
    : 'bg-primary/20 text-primary border-primary/20';
  const outcomeLabel = (p.outcome || 'pending').toUpperCase();

  // Short project code derived from id
  const projectCode = `${(p.id || '').slice(0, 2).toUpperCase()}-${(p.id || '').slice(-2).toUpperCase() || '00'}`;

  return (
    <div
      onClick={() => selectMode ? onToggleSelect() : router.push(`/repository/${p.id}`)}
      className={`group relative bg-surface-container-low hover:bg-surface-container-high transition-all p-6 flex flex-col gap-5 cursor-pointer ${selected ? 'border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
    >
      {/* Select mode checkbox */}
      {selectMode && (
        <div className="absolute top-3 right-3 z-20">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 cursor-pointer"
            style={{ accentColor: '#e8c357' }}
          />
        </div>
      )}

      {/* Header: project code + title + status */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-label text-[10px] text-outline uppercase tracking-widest mb-1">
            {p.sector || 'Untagged'} · {projectCode}
          </span>
          <h2 className="font-headline text-xl md:text-2xl font-medium leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {p.name}
          </h2>
        </div>
        {!selectMode && (
          <span className={`px-2 py-0.5 text-[10px] font-label font-bold tracking-widest border flex-shrink-0 ${outcomeStyle}`}>
            {outcomeLabel}
          </span>
        )}
      </div>

      {/* Status panel — indexing / failed / normal */}
      {isFailed ? (
        <div className="rounded p-3 bg-error-container/20 border border-error/20 text-error text-xs">
          <div className="mb-2 font-bold uppercase font-label tracking-widest">Analysis failed</div>
          <button
            onClick={handleReanalyse}
            disabled={reanalysing}
            className="w-full py-2 bg-primary text-on-primary text-xs font-label uppercase tracking-widest hover:brightness-110 transition-all"
          >
            {reanalysing ? 'Retrying…' : 'Re-run Analysis'}
          </button>
        </div>
      ) : isIndexing ? (
        <div className="rounded p-3 bg-secondary/10 border border-secondary/20 text-secondary text-xs">
          <div className="flex items-center gap-2 font-label uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            {liveStage?.stage === 'upload' ? '① File received'
              : liveStage?.stage === 'text_extraction' ? '② Extracting text'
              : liveStage?.stage === 'ai_analysis' ? '③ AI analysing'
              : liveStage?.stage === 'embedding' ? '④ Building index'
              : 'Analysing…'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Client</span>
            <span className="text-sm font-medium truncate block">{p.client || '—'}</span>
          </div>
          <div className="text-right">
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Year</span>
            <span className="text-sm">{p.date_submitted?.slice(0, 4) || '—'}</span>
          </div>
          <div>
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Value</span>
            <span className="text-sm text-primary font-bold">{formatMoney(p.contract_value, p.currency)}</span>
          </div>
          <div className="text-right">
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Rating</span>
            <Stars rating={p.user_rating} />
          </div>
        </div>
      )}

      {/* Taxonomy tag chips */}
      <div className="flex flex-wrap gap-2">
        {p.client_industry ? (
          <span className="text-[10px] bg-surface-container-highest px-2 py-1 text-on-surface-variant font-label">
            ◆ {p.client_industry}
          </span>
        ) : (
          <span className="text-[10px] bg-surface-container-highest/50 px-2 py-1 text-outline font-label border border-dashed border-outline/30">
            ◆ + client
          </span>
        )}
        {p.service_industry ? (
          <span className="text-[10px] bg-surface-container-highest px-2 py-1 text-on-surface-variant font-label">
            ◈ {p.service_industry}
          </span>
        ) : (
          <span className="text-[10px] bg-surface-container-highest/50 px-2 py-1 text-outline font-label border border-dashed border-outline/30">
            ◈ + service
          </span>
        )}
      </div>

      {/* File chip row */}
      {fileTypes.length > 0 && (
        <div className="flex gap-1">
          {['proposal', 'rfp', 'budget'].map(ft =>
            fileTypes.includes(ft)
              ? <span key={ft} className="text-[9px] font-label uppercase tracking-widest px-1.5 py-0.5 bg-primary/10 text-primary">{ft}</span>
              : null
          )}
        </div>
      )}

      {/* Hover-reveal footer — workspace toggle + outcome + actions */}
      {!selectMode && (
        <div className="pt-4 border-t border-outline-variant/10 flex justify-between items-center gap-2 flex-wrap">
          {onToggleWorkspace && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleWorkspace(); }}
              className={`text-[10px] font-label uppercase tracking-widest px-2 py-1 border transition-colors ${
                inWorkspace
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-outline/30 text-on-surface-variant hover:text-primary'
              }`}
              title={inWorkspace ? 'In your workspace' : 'Add to workspace'}
            >
              {inWorkspace ? '✓ In workspace' : '+ Workspace'}
            </button>
          )}
          <select
            value={p.outcome || 'pending'}
            onClick={e => e.stopPropagation()}
            onChange={async (e) => {
              e.stopPropagation();
              const newOutcome = e.target.value;
              try {
                const r = await fetch(`/api/projects/${p.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ outcome: newOutcome }),
                });
                if (r.ok) {
                  if (onUpdated) onUpdated(p.id, { outcome: newOutcome });
                  onToast(`Marked as ${newOutcome}`);
                } else onToast('Update failed');
              } catch { onToast('Update failed'); }
            }}
            className="text-[10px] font-label uppercase tracking-widest bg-transparent border border-outline/30 text-on-surface-variant px-2 py-1 outline-none cursor-pointer"
          >
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          <div className="ml-auto flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleReanalyse}
              disabled={reanalysing || isIndexing}
              className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary flex items-center gap-1"
              title="Re-analyse"
            >
              {reanalysing ? '…' : '⟳'} Re-run
            </button>
            <button
              onClick={handleDelete}
              className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-error flex items-center gap-1"
              title="Delete"
            >
              ✕ Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── CUSTOM VALUES HOOK ───────────────────────────────────────────────────────

function useCustomValues() {
  const [sectors, setSectors] = useState(DEFAULT_SECTORS);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [currencies, setCurrencies] = useState(DEFAULT_CURRENCIES);

  useEffect(()=>{
    fetch('/api/custom-values').then(r=>r.json()).then(d=>{
      if(d.values?.sector) setSectors(d.values.sector);
      if(d.values?.project_type) setTypes(d.values.project_type);
      if(d.values?.currency) setCurrencies(d.values.currency);
    }).catch(()=>{});
  },[]);

  async function persist(category, value) {
    try { await fetch('/api/custom-values',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,value})}); } catch {}
  }

  const addSector = useCallback((v)=>{ if(!sectors.includes(v)){ setSectors(s=>[...s,v]); persist('sector',v); }}, [sectors]);
  const addType = useCallback((v)=>{ if(!types.includes(v)){ setTypes(t=>[...t,v]); persist('project_type',v); }}, [types]);
  const addCurrency = useCallback((v)=>{ const u=v.toUpperCase().slice(0,8); if(!currencies.includes(u)){ setCurrencies(c=>[...c,u]); persist('currency',u); } return u; }, [currencies]);

  return { sectors, types, currencies, addSector, addType, addCurrency };
}

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
    }).catch(()=>{});
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
      // Reload after a delay to pick up any fast completions
      setTimeout(() => { loadProjects(); checkAnalysisHealth(); }, 5000);
    } catch { setToast('Failed to start analysis'); }
    setRunningAnalysis(false);
  }
  useEffect(()=>{ loadProjects(); },[selectedFolder,search,semanticSearch,selectedOffering,selectedServiceIndustry,selectedClientIndustry]);

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
    {id:'won',label:'Won',icon:'✓',count:projects.filter(p=>p.outcome==='won').length,color:'#3d5c3a'},
    {id:'lost',label:'Lost',icon:'✗',count:projects.filter(p=>p.outcome==='lost').length,color:'#b04030'},
    {id:'pending',label:'Pending / Active',icon:'◷',count:projects.filter(p=>['pending','active'].includes(p.outcome)).length,color:'#b8962e'},
    ...(failedCount>0?[{id:'failed',label:'Failed Uploads',icon:'⚠',count:failedCount,color:'#b04030'}]:[]),
  ];

  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Repository — ProposalIQ</title></Head>
      <Layout title="Repository" subtitle={`${projects.length} projects`} user={user}
        actions={<div className="flex gap-2"><Btn variant="ghost" onClick={()=>setShowBatch(true)}>⊞ Batch Import</Btn><Btn variant="gold" onClick={()=>setShowUpload(true)}>⊕ Upload Project</Btn></div>}>
        <div className="flex h-full overflow-hidden bg-surface">
          <aside className="w-60 flex-shrink-0 flex flex-col border-r border-outline-variant/10 overflow-y-auto bg-surface-container-lowest/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
              <span className="font-label text-[10px] uppercase tracking-widest text-outline">Status</span>
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
                    className="flex-1 px-2 py-1 text-xs border rounded outline-none" style={{borderColor:'#ddd5c4'}}/>
                  <button onClick={createFolder} className="px-2 py-1 rounded text-white text-xs no-min-h" style={{background:'#1e4a52'}}>+</button>
                  <button onClick={()=>{setCreatingFolder(false);setNewFolderName('');}} className="px-1.5 py-1 rounded text-xs no-min-h" style={{color:'#6b6456'}}>✕</button>
                </div>
              ) : (
                <button onClick={()=>setCreatingFolder(true)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] mb-2 transition-all no-min-h"
                  style={{color:'#9b8e80',border:'1px dashed #ddd5c4'}}>
                  ⊕ New folder
                </button>
              )}

              {rootFolders.length === 0 && !creatingFolder && (
                <p className="text-[11px] px-2 pb-2" style={{color:'#9b8e80'}}>No folders yet — create one above to organise your proposals.</p>
              )}

              {rootFolders.map(folder=>{
                const children=childFolders(folder.id); const isOpen=expandedFolders[folder.id];
                return (
                  <div key={folder.id}>
                    {editingFolderId === folder.id ? (
                      <div className="flex gap-1 mb-0.5">
                        <input autoFocus value={editingFolderName} onChange={e=>setEditingFolderName(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')renameFolder(folder.id,editingFolderName);if(e.key==='Escape')setEditingFolderId(null);}}
                          className="flex-1 px-2 py-1 text-xs border rounded outline-none" style={{borderColor:'#1e4a52'}}/>
                        <button onClick={()=>renameFolder(folder.id,editingFolderName)} className="px-2 py-1 rounded text-white text-xs no-min-h" style={{background:'#1e4a52'}}>✓</button>
                        <button onClick={()=>setEditingFolderId(null)} className="px-1.5 py-1 rounded text-xs no-min-h" style={{color:'#6b6456'}}>✕</button>
                      </div>
                    ) : (
                    <div className="flex items-center gap-1 group/folder">
                    <button onClick={()=>toggle(folder.id)}
                      className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12.5px] transition-all mb-0.5 ${selectedFolder===folder.id?'bg-white shadow-sm font-medium':'hover:bg-black/5'}`}>
                      <span className="text-[10px]" style={{color:'#6b6456'}}>{isOpen?'▾':'▸'}</span>
                      <span className="text-sm">📁</span>
                      <span className="flex-1 truncate">{folder.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{background:'rgba(0,0,0,.06)',color:'#6b6456'}}>{folder.project_count}</span>
                    </button>
                    <div className="hidden group-hover/folder:flex gap-0.5">
                      <button onClick={()=>{setEditingFolderId(folder.id);setEditingFolderName(folder.name);}}
                        className="p-1 rounded text-[10px] hover:bg-black/10 no-min-h" style={{color:'#9b8e80'}} title="Rename">✎</button>
                      <button onClick={()=>deleteFolder(folder.id)}
                        className="p-1 rounded text-[10px] hover:bg-red-50 no-min-h" style={{color:'#b04030'}} title="Delete">✕</button>
                    </div>
                    </div>
                    )}
                    {isOpen&&children.map(child=>(
                      <button key={child.id} onClick={()=>setSelectedFolder(child.id)}
                        className={`w-full flex items-center gap-2 pl-8 pr-2.5 py-1.5 rounded-md text-left text-[12px] transition-all mb-0.5 ${selectedFolder===child.id?'bg-white shadow-sm font-medium':'hover:bg-black/5'}`}>
                        <span className="text-xs">📂</span>
                        <span className="flex-1 truncate">{child.name}</span>
                        <span className="text-[10px] font-mono" style={{color:'#6b6456'}}>{child.project_count}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {/* TYPE OF WORK — service_industry filter (teal) */}
              {taxonomy.serviceIndustries.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{borderColor:'#ddd5c4'}}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-2.5" style={{color:'#1e4a52'}}>Type of Work</div>
                  <button onClick={()=>setSelectedServiceIndustry(null)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${!selectedServiceIndustry?'bg-white shadow-sm font-medium':'hover:bg-black/5'}`}>
                    <span style={{color:'#1e4a52'}}>◈</span>
                    <span className="flex-1">All Types</span>
                  </button>
                  {taxonomy.serviceIndustries.map(item=>(
                    <button key={item.id} onClick={()=>setSelectedServiceIndustry(selectedServiceIndustry===item.name?null:item.name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${selectedServiceIndustry===item.name?'shadow-sm font-medium':'hover:bg-black/5'}`}
                      style={selectedServiceIndustry===item.name?{background:'rgba(30,74,82,.12)',color:'#1e4a52'}:{}}>
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{background:selectedServiceIndustry===item.name?'#1e4a52':'#ddd5c4'}}/>
                      <span className="flex-1 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* CLIENT SECTOR — client_industry filter (gold) */}
              {taxonomy.clientIndustries.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{borderColor:'#ddd5c4'}}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-2.5" style={{color:'#8a6200'}}>Client Sector</div>
                  <button onClick={()=>setSelectedClientIndustry(null)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${!selectedClientIndustry?'bg-white shadow-sm font-medium':'hover:bg-black/5'}`}>
                    <span style={{color:'#8a6200'}}>◆</span>
                    <span className="flex-1">All Sectors</span>
                  </button>
                  {taxonomy.clientIndustries.map(item=>(
                    <button key={item.id} onClick={()=>setSelectedClientIndustry(selectedClientIndustry===item.name?null:item.name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${selectedClientIndustry===item.name?'shadow-sm font-medium':'hover:bg-black/5'}`}
                      style={selectedClientIndustry===item.name?{background:'rgba(184,150,46,.15)',color:'#8a6200'}:{}}>
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{background:selectedClientIndustry===item.name?'#b8962e':'#ddd5c4'}}/>
                      <span className="flex-1 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Legacy Service Offering taxonomy — kept for back-compat with pre-migration projects */}
              {taxonomy.offerings.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{borderColor:'#ddd5c4'}}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-2.5" style={{color:'#6b6456'}}>Legacy Tags</div>
                  <button onClick={()=>setSelectedOffering(null)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${!selectedOffering?'bg-white shadow-sm font-medium':'hover:bg-black/5'}`}>
                    <span style={{color:'#6b6456'}}>◈</span>
                    <span className="flex-1">All Offerings</span>
                  </button>
                  {taxonomy.offerings.map(item=>(
                    <button key={item.id} onClick={()=>setSelectedOffering(selectedOffering===item.name?null:item.name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-left text-[11.5px] transition-all mb-0.5 no-min-h ${selectedOffering===item.name?'bg-white shadow-sm font-medium':'hover:bg-black/5'}`}>
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{background:selectedOffering===item.name?'#1e4a52':'#ddd5c4'}}/>
                      <span className="flex-1 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden md:flex bg-surface">
            <header className="px-8 py-8">
              <div className="flex items-baseline justify-between mb-8 gap-6 flex-wrap">
                <h1 className="font-headline text-4xl md:text-5xl font-light tracking-tight">Repository</h1>
                <p className="text-on-surface-variant text-sm max-w-xs text-right">
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
                      placeholder={semanticSearch ? "Search by meaning — e.g. 'NHS data integration'…" : "Search by client, sector, or project keyword…"}
                      className="w-full bg-transparent border-none focus:ring-0 focus:outline-none pl-10 text-sm placeholder:text-outline"
                    />
                  </div>
                  <div className="h-8 w-px bg-outline-variant/20"/>
                  <div className="flex items-center gap-3 px-2">
                    <span className="text-xs font-label text-outline uppercase tracking-wider whitespace-nowrap">AI Analysis</span>
                    <button onClick={()=>setSemanticSearch(s=>!s)}
                      className="w-10 h-5 bg-surface-container-highest rounded-full relative flex items-center px-1 transition-colors"
                      title={semanticSearch ? "Switch to keyword search" : "Switch to AI semantic search"}>
                      <div className={`w-3 h-3 rounded-full transition-all ${semanticSearch ? 'bg-primary ml-auto' : 'bg-outline'}`}/>
                    </button>
                  </div>
                  <span className="text-[10px] font-label text-outline uppercase tracking-widest whitespace-nowrap">{projects.length} results</span>
                  <button onClick={()=>setSelectMode(true)}
                    className="text-[10px] font-label uppercase tracking-widest px-3 py-2 border border-outline/30 text-on-surface-variant hover:text-on-surface transition-all">
                    Select
                  </button>
                  <button onClick={()=>setShowUpload(true)}
                    className="bg-primary text-on-primary px-6 py-2 text-[10px] font-label uppercase tracking-widest font-bold flex items-center gap-2 hover:brightness-110 transition-all">
                    <span className="material-symbols-outlined text-sm">upload</span>
                    Upload New
                  </button>
                </div>
              )}
            </header>
            <div className="flex-1 overflow-y-auto px-8 pb-8">
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
                    className="text-[11px] px-2 py-1 rounded border transition-colors hover:bg-white"
                    style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
                    Clear workspace
                  </button>
                </div>
              )}
              {workspaceLoaded && workspaceIds.size === 0 && !loading && projects.length > 0 && (
                <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-lg border border-dashed"
                  style={{ borderColor: '#ddd5c4', color: '#9b8e80' }}>
                  <span className="text-xs">
                    No workspace set — RFP scans will match against all projects. Click "+ Workspace" on any project to curate your scanning set.
                  </span>
                </div>
              )}
              {loading?(
                <div className="flex items-center gap-2 py-12 justify-center" style={{color:'#6b6456'}}><Spinner/> Loading projects…</div>
              ):projects.length===0?(
                <div className="text-center py-16">
                  <div className="text-4xl mb-3 opacity-25">⊞</div>
                  <div className="font-serif text-lg mb-2 opacity-40">No projects found</div>
                  <p className="text-sm mb-4" style={{color:'#6b6456'}}>{search?'Try a different search term':'Upload your first proposal to get started'}</p>
                  {!search&&<Btn variant="gold" onClick={()=>setShowUpload(true)}>⊕ Upload Project</Btn>}
                </div>
              ):(
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

// ─── UPLOAD MODAL ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, folders: initialFolders, onToast }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({name:'',client:'',sector:'',contract_value:'',currency:'GBP',outcome:'pending',user_rating:0,project_type:'',date_submitted:'',folder_id:'',description:'',went_well:'',improvements:'',lessons:''});
  const [files, setFiles] = useState({proposal:null,rfp:null,budget:null});
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [indexingStage, setIndexingStage] = useState(null);
  const [scanConfidence, setScanConfidence] = useState(null);
  const [scanNote, setScanNote] = useState('');
  const [aiFields, setAiFields] = useState(new Set());
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputs = {proposal:useRef(),rfp:useRef(),budget:useRef()};
  const {sectors,types,currencies,addSector,addType,addCurrency} = useCustomValues();
  const [folders, setFolders] = useState(initialFolders);
  const [addingField, setAddingField] = useState(null);
  const [newVal, setNewVal] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  // useCallback on ALL handlers — prevents remount of memo'd children
  const setF = useCallback((k,v)=>setForm(p=>({...p,[k]:v})),[]);
  const clearAi = useCallback((k)=>setAiFields(prev=>{const n=new Set(prev);n.delete(k);return n;}),[]);
  const WEIGHT = {1:'5%',2:'15%',3:'40%',4:'75%',5:'100%'};
  const leafFolders = folders.filter(fl=>!folders.find(p=>p.parent_id===fl.id));
  const rootFolders = folders.filter(fl=>!fl.parent_id);
  const stepLabels = ['Upload Files','Review Details','Rate & Review','Confirm'];
  const activateAdd = useCallback((field)=>{setAddingField(field);setNewVal('');},[]);
  const cancelAdd = useCallback(()=>{setAddingField(null);setNewVal('');},[]);

  async function saveNew() {
    const val = newVal.trim(); if(!val) return;
    setSavingNew(true);
    if(addingField==='sector'){addSector(val);setF('sector',val);}
    else if(addingField==='type'){addType(val);setF('project_type',val);}
    else if(addingField==='currency'){const u=addCurrency(val);setF('currency',u);}
    else if(addingField==='folder'){
      const r=await fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:val,parent_id:newFolderParent||null})});
      if(r.ok){const d=await r.json();setFolders(prev=>[...prev,{id:d.id,name:val,parent_id:newFolderParent||null,project_count:0}]);setF('folder_id',d.id);}
      else onToast('Could not save folder');
    }
    setAddingField(null);setNewVal('');setNewFolderParent('');setSavingNew(false);
  }

  async function runPrescan() {
    if(!files.proposal&&!files.rfp&&!files.budget) return;
    setScanning(true);setScanNote('');
    try {
      const fd=new FormData();
      if(files.proposal) fd.append('proposal',files.proposal);
      else if(files.rfp) fd.append('rfp',files.rfp);
      else fd.append('budget',files.budget);
      const r=await fetch('/api/projects/prescan',{method:'POST',body:fd});
      if(!r.ok){setScanning(false);return;}
      const d=await r.json(); const ex=d.extracted||{};
      if(!Object.keys(ex).length){setScanNote(d.note||'Could not extract — fill in manually.');setScanning(false);return;}
      const filled=new Set(); const updates={};
      const map={name:'name',client:'client',sector:'sector',contract_value:'contract_value',currency:'currency',project_type:'project_type',date_submitted:'date_submitted',outcome:'outcome',description:'description'};
      Object.entries(map).forEach(([ek,fk])=>{if(ex[ek]?.trim?.()){updates[fk]=ex[ek];filled.add(fk);}});
      if(ex.sector) addSector(ex.sector);
      if(ex.project_type) addType(ex.project_type);
      if(ex.currency) addCurrency(ex.currency);
      setForm(prev=>({...prev,...updates}));setAiFields(filled);setScanConfidence(d.confidence);
      if(d.note) setScanNote(d.note);
    } catch { setScanNote('AI scan failed — fill in manually.'); }
    setScanning(false);
  }

  function validate(s) {
    const e={};
    if(s>=1){if(!files.proposal&&!files.rfp&&!files.budget) e.files='At least one document required';}
    if(s>=2){if(!form.name) e.name='Required';if(!form.client) e.client='Required';if(!form.sector) e.sector='Required';}
    if(s>=3&&form.user_rating===0) e.rating='Please rate this project';
    return e;
  }

  async function next() {
    const e=validate(step); if(Object.keys(e).length){setErrors(e);return;} setErrors({});
    if(step===1){setStep(2);await runPrescan();return;}
    if(step<4){setStep(s=>s+1);return;}
    submit();
  }

  async function submit() {
    setUploading(true);
    const fd=new FormData();
    Object.entries(form).forEach(([k,v])=>fd.append(k,String(v)));
    if(files.proposal) fd.append('proposal',files.proposal);
    if(files.rfp) fd.append('rfp',files.rfp);
    if(files.budget) fd.append('budget',files.budget);
    const r=await fetch('/api/projects/upload',{method:'POST',body:fd});
    setUploading(false);
    if(r.ok){setDone(true);onToast('Project uploaded — AI indexing in progress');}
    else{const d=await r.json();setErrors({submit:d.error||'Upload failed'});}
  }

  // Stable onChange callbacks — guaranteed not to cause remounting
  const onChangeName = useCallback(e=>{setF('name',e.target.value);clearAi('name');},[setF,clearAi]);
  const onChangeClient = useCallback(e=>{setF('client',e.target.value);clearAi('client');},[setF,clearAi]);
  const onChangeValue = useCallback(e=>{setF('contract_value',e.target.value);clearAi('contract_value');},[setF,clearAi]);
  const onChangeCurr = useCallback(e=>{setF('currency',e.target.value);clearAi('currency');},[setF,clearAi]);
  const onChangeDate = useCallback(e=>{setF('date_submitted',e.target.value);clearAi('date_submitted');},[setF,clearAi]);
  const onChangeSector = useCallback(e=>{setF('sector',e.target.value);clearAi('sector');},[setF,clearAi]);
  const onChangeOutcome = useCallback(e=>setF('outcome',e.target.value),[setF]);
  const onChangeType = useCallback(e=>{setF('project_type',e.target.value);clearAi('project_type');},[setF,clearAi]);
  const onChangeFolder = useCallback(e=>setF('folder_id',e.target.value),[setF]);
  const onChangeDesc = useCallback(e=>{setF('description',e.target.value);clearAi('description');},[setF,clearAi]);
  const onChangeWW = useCallback(e=>setF('went_well',e.target.value),[setF]);
  const onChangeImp = useCallback(e=>setF('improvements',e.target.value),[setF]);
  const onChangeLes = useCallback(e=>setF('lessons',e.target.value),[setF]);

  const addCommon = {onSave:saveNew,onCancel:cancelAdd,value:newVal,onValueChange:setNewVal,parentValue:newFolderParent,onParentChange:setNewFolderParent,rootFolders,saving:savingNew};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(15,14,12,.65)',backdropFilter:'blur(4px)'}}>
      <div className="w-full max-w-xl bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col" style={{maxHeight:'92vh'}}>
        <div className="px-6 py-4 border-b flex items-start justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#1e4a52,#2d6b78)'}}>
          <div><h2 className="font-serif text-lg text-white mb-0.5">Upload Project</h2><p className="text-xs font-mono text-white/40">Add to knowledge base</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 text-sm">✕</button>
        </div>

        {!done&&(
          <div className="flex items-center gap-1 px-6 py-3 border-b flex-shrink-0" style={{background:'#f0ebe0',borderColor:'#ddd5c4'}}>
            {stepLabels.map((lbl,i)=>{
              const n=i+1;
              return(
                <div key={n} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 text-xs ${n===step?'font-semibold':n<step?'':'opacity-40'}`} style={{color:n===step?'#1e4a52':n<step?'#3d5c3a':'#6b6456'}}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono flex-shrink-0 ${n<step?'text-white':n===step?'text-amber-300':'border border-[#ddd5c4]'}`} style={{background:n<step?'#3d5c3a':n===step?'#0f0e0c':undefined}}>
                      {n<step?'✓':n}
                    </div>
                    <span className="hidden sm:inline whitespace-nowrap">{lbl}</span>
                  </div>
                  {i<stepLabels.length-1&&<div className="w-5 h-px mx-1 flex-shrink-0" style={{background:n<step?'#3d5c3a':'#ddd5c4'}}/>}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {done?(
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="font-serif text-xl mb-2">Project Added</h3>
              <p className="text-sm mb-3" style={{color:'#6b6456'}}>AI is indexing your documents (~60 seconds). A library file is saved so future loads are instant — no re-scanning needed.</p>
            </div>
          ):step===1?(
            <div className="space-y-4">
              <p className="text-sm" style={{color:'#6b6456'}}>Upload your documents first. The AI will scan them and pre-fill the details on the next screen.</p>
              <div className="grid grid-cols-3 gap-3">
                {['proposal','rfp','budget'].map(ft=>{
                  const icons={proposal:'📄',rfp:'📋',budget:'💰'};
                  const labels={proposal:'Proposal',rfp:'RFP / ITT',budget:'Budget'};
                  return(
                    <div key={ft}>
                      <input type="file" ref={fileInputs[ft]} className="hidden" accept=".pdf,.docx,.doc,.xlsx,.csv,.txt"
                        onChange={e=>{if(e.target.files[0]) setFiles(prev=>({...prev,[ft]:e.target.files[0]}));}}/>
                      <button type="button" onClick={()=>fileInputs[ft].current?.click()}
                        className={`w-full rounded-lg p-4 text-center border-2 transition-all ${files[ft]?'border-solid':'border-dashed hover:border-teal/50'}`}
                        style={{borderColor:files[ft]?'#1e4a52':errors.files?'#b04030':'#ddd5c4',background:files[ft]?'#e8f2f4':'white'}}>
                        <div className="text-2xl mb-1">{files[ft]?'✅':icons[ft]}</div>
                        <div className="text-xs font-semibold mb-0.5">{labels[ft]}</div>
                        <div className="text-[10px] font-mono" style={{color:ft==='proposal'?'#b04030':'#6b6456'}}>{ft==='proposal'?'Required':'Recommended'}</div>
                        {files[ft]&&<div className="text-[10px] font-mono mt-1 truncate" style={{color:'#1e4a52'}}>{files[ft].name}</div>}
                      </button>
                    </div>
                  );
                })}
              </div>
              {errors.files&&<p className="text-xs text-red-500">{errors.files}</p>}
              <div className="rounded-lg p-3 text-xs" style={{background:'#f0ebe0',color:'#6b6456'}}>
                ⓘ By uploading documents you confirm you are authorised to do so and that this does not breach any confidentiality agreement or NDA.
              </div>
            </div>
          ):step===2?(
            <div className="space-y-4">
              {scanning?(
                <div className="flex items-center gap-3 rounded-lg p-3 text-sm" style={{background:'#faf4e2',color:'#7a5800'}}><Spinner size={14}/><span>AI scanning document and extracting details…</span></div>
              ):aiFields.size>0?(
                <div className="rounded-lg p-3 text-xs" style={{background:'#e8f2f4',color:'#1e4a52'}}>
                  ✦ <strong>AI pre-filled {aiFields.size} field{aiFields.size!==1?'s':''}</strong>{scanConfidence?` (confidence: ${scanConfidence})`:''}. Tinted fields were auto-filled — edit anything incorrect.
                </div>
              ):scanNote?(<div className="rounded-lg p-3 text-xs" style={{background:'#faeeeb',color:'#7a2010'}}>⚠ {scanNote}</div>):null}

              <div className="grid grid-cols-2 gap-3">
                <FieldInput label="Project Name" required isAi={aiFields.has('name')} value={form.name} onChange={onChangeName} placeholder="e.g. NHS Digital Transformation" error={errors.name}/>
                <FieldInput label="Client / Organisation" required isAi={aiFields.has('client')} value={form.client} onChange={onChangeClient} placeholder="e.g. NHS England" error={errors.client}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FieldInput label="Contract Value" isAi={aiFields.has('contract_value')} value={form.contract_value} onChange={onChangeValue} placeholder="850000" inputMode="decimal"/>
                  </div>
                  <div>
                    <FieldSelect label="Currency" isAi={aiFields.has('currency')} value={form.currency} onChange={onChangeCurr}>
                      {currencies.map(c=><option key={c}>{c}</option>)}
                    </FieldSelect>
                    <AddNewInline field="currency" label="currency" placeholder="e.g. NOK" {...addCommon} active={addingField==='currency'} onActivate={()=>activateAdd('currency')}/>
                  </div>
                </div>
                <FieldInput label="Date Submitted" type="date" isAi={aiFields.has('date_submitted')} value={form.date_submitted} onChange={onChangeDate}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldSelect label="Sector" required isAi={aiFields.has('sector')} value={form.sector} onChange={onChangeSector}>
                    <option value="">Select sector…</option>{sectors.map(s=><option key={s}>{s}</option>)}
                  </FieldSelect>
                  <AddNewInline field="sector" placeholder="e.g. Energy & Utilities" {...addCommon} active={addingField==='sector'} onActivate={()=>activateAdd('sector')}/>
                  {errors.sector&&<p className="text-[11px] text-red-500 mt-1">{errors.sector}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#6b6456'}}>Outcome</label>
                  <select value={form.outcome} onChange={onChangeOutcome} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-[#1e4a52]">
                    {OUTCOMES.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldSelect label="Project Type" isAi={aiFields.has('project_type')} value={form.project_type} onChange={onChangeType}>
                    <option value="">Select type…</option>{types.map(t=><option key={t}>{t}</option>)}
                  </FieldSelect>
                  <AddNewInline field="type" label="project type" placeholder="e.g. Change Management" {...addCommon} active={addingField==='type'} onActivate={()=>activateAdd('type')}/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#6b6456'}}>Save to Folder</label>
                  <select value={form.folder_id} onChange={onChangeFolder} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-[#1e4a52]">
                    <option value="">Choose folder…</option>{leafFolders.map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}
                  </select>
                  <AddNewInline field="folder" placeholder="e.g. Central Government" showParent={true} {...addCommon} active={addingField==='folder'} onActivate={()=>activateAdd('folder')}/>
                </div>
              </div>
              <FieldTextarea label="Description" value={form.description} onChange={onChangeDesc} rows={3} placeholder="What was this project about? Key technologies, deliverables, scope…"/>
            </div>
          ):step===3?(
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{background:'#faf4e2',border:'1px solid rgba(184,150,46,.3)'}}>
                <h3 className="text-sm font-semibold mb-1">How successful was this project?</h3>
                <p className="text-xs mb-4" style={{color:'#6b6456'}}>Controls how much the AI learns from this. 5★ = gold standard. 1★ = loss analysis only.</p>
                <div className="flex gap-3 mb-2">
                  {[1,2,3,4,5].map(n=><button key={n} type="button" onClick={()=>setF('user_rating',n)} className="text-3xl transition-all hover:scale-110" style={{color:n<=form.user_rating?'#b8962e':'#ddd5c4'}}>★</button>)}
                </div>
                {form.user_rating>0&&<div className="text-xs font-mono mt-2" style={{color:'#6b6456'}}><span style={{color:'#b8962e',fontWeight:600}}>AI Weight: {WEIGHT[form.user_rating]}</span> — {AI_WEIGHT_DESC[form.user_rating]}</div>}
                {errors.rating&&<p className="text-xs text-red-500 mt-2">{errors.rating}</p>}
                {/* AI rating suggestion */}
                {aiSuggestions?.rating && (
                  <div className="mt-3 rounded-lg p-3" style={{background:'rgba(30,74,82,.07)',border:'1px solid rgba(30,74,82,.15)'}}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-mono uppercase tracking-widest" style={{color:'#1e4a52'}}>AI Suggests: {aiSuggestions.rating}★</div>
                      <button type="button" onClick={()=>setF('user_rating', aiSuggestions.rating)}
                        className="text-[10px] px-2 py-0.5 rounded font-medium" style={{background:'#1e4a52',color:'white'}}>
                        Accept
                      </button>
                    </div>
                    <p className="text-xs" style={{color:'#1e4a52'}}>{aiSuggestions.rationale}</p>
                    {aiSuggestions.strengths.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {aiSuggestions.strengths.slice(0,2).map((s,i)=><span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{background:'#edf3ec',color:'#3d5c3a'}}>+ {s}</span>)}
                        {aiSuggestions.weaknesses.slice(0,1).map((w,i)=><span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{background:'#faeeeb',color:'#b04030'}}>− {w}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <FieldTextarea label="What went well?" value={form.went_well} onChange={onChangeWW} placeholder="Key strengths, what evaluators praised…"/>
              <FieldTextarea label="What could be improved?" value={form.improvements} onChange={onChangeImp} placeholder="Gaps, weaknesses, post-award feedback…"/>
              <FieldTextarea label="Key lessons for the AI" value={form.lessons} onChange={onChangeLes} placeholder="Notes the AI should use when referencing this work…"/>
            </div>
          ):(
            <div className="space-y-4">
              <div className="rounded-lg p-4 bg-cream border" style={{borderColor:'#ddd5c4'}}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{color:'#6b6456'}}>Project Details</div>
                {[['Name',form.name],['Client',form.client],['Value',`${form.currency} ${parseInt(form.contract_value||0).toLocaleString()}`],['Sector',form.sector],['Outcome',form.outcome],['Folder',leafFolders.find(fl=>fl.id===form.folder_id)?.name||'None']].map(([k,v])=>(
                  <div key={k} className="flex justify-between py-1.5 border-b text-sm last:border-0" style={{borderColor:'#ddd5c4'}}>
                    <span style={{color:'#6b6456'}}>{k}</span><span className="font-medium">{v||'—'}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-4 bg-cream border" style={{borderColor:'#ddd5c4'}}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#6b6456'}}>Rating</div>
                <div className="flex items-center gap-3"><Stars rating={form.user_rating} size="base"/><span className="text-sm font-mono" style={{color:'#b8962e'}}>AI Weight: {WEIGHT[form.user_rating]||'—'}</span></div>
              </div>
              <div className="rounded-lg p-4 bg-cream border" style={{borderColor:'#ddd5c4'}}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#6b6456'}}>Files</div>
                <div className="flex gap-2">{Object.entries(files).filter(([,v])=>v).map(([k])=><FileChip key={k} type={k}/>)}</div>
              </div>
              {errors.submit&&<p className="text-sm text-red-500 bg-red-50 rounded p-3">{errors.submit}</p>}
            </div>
          )}
        </div>

        {!done?(
          <div className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0" style={{background:'#f0ebe0',borderColor:'#ddd5c4'}}>
            <div>{step>1&&<Btn variant="ghost" onClick={()=>setStep(s=>s-1)} disabled={uploading||scanning}>← Back</Btn>}</div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono" style={{color:'#6b6456'}}>Step {step} of 4</span>
              <Btn variant={step===4?'gold':'teal'} onClick={next} disabled={uploading||scanning}>
                {uploading?<><Spinner size={12}/> Uploading…</>:scanning?<><Spinner size={12}/> Scanning…</>:step===1?'Scan & Continue →':step===4?'Upload ⊕':'Continue →'}
              </Btn>
            </div>
          </div>
        ):(
          <div className="px-6 py-4 border-t flex-shrink-0 flex justify-end" style={{background:'#f0ebe0',borderColor:'#ddd5c4'}}>
            <Btn variant="teal" onClick={onClose}>Done ✓</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BATCH IMPORT MODAL ───────────────────────────────────────────────────────

function BatchModal({ onClose, folders: initialFolders, onToast }) {
  const [queue, setQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const {sectors,types,currencies,addSector,addType,addCurrency} = useCustomValues();
  const [folders] = useState(initialFolders);
  const leafFolders = folders.filter(fl=>!folders.find(p=>p.parent_id===fl.id));

  // Delay between sequential AI-backed calls (prescan, upload) so we don't
  // hammer the Gemini/OpenAI API rate limits in rapid succession. 3 seconds
  // empirically clears the "too many concurrent" failure mode we were seeing
  // on batch uploads of 5+ files without adding noticeable total time.
  const STAGGER_MS = 3000;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function handleFileSelect(e) {
    const selected = Array.from(e.target.files);
    setQueue(selected.map(f=>({
      file:f, status:'queued',
      form:{name:f.name.replace(/\.[^.]+$/,''),client:'',sector:'',contract_value:'',currency:'GBP',outcome:'pending',user_rating:3,project_type:'',folder_id:'',description:'',went_well:'',improvements:'',lessons:''},
      error:null,
    })));
  }

  async function scanAll() {
    setUploading(true);
    for(let i=0;i<queue.length;i++){
      // Stagger: wait before firing each call (except the first) so rapid
      // successive AI calls don't hit rate limits.
      if (i > 0) await sleep(STAGGER_MS);
      setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'scanning'}:q));
      try{
        const fd=new FormData(); fd.append('proposal',queue[i].file);
        const r=await fetch('/api/projects/prescan',{method:'POST',body:fd});
        const d=await r.json(); const ex=d.extracted||{};
        setQueue(prev=>prev.map((q,idx)=>{
          if(idx!==i) return q;
          const u={};
          if(ex.name) u.name=ex.name;
          if(ex.client) u.client=ex.client;
          if(ex.sector){u.sector=ex.sector;addSector(ex.sector);}
          if(ex.contract_value) u.contract_value=ex.contract_value;
          if(ex.currency){u.currency=ex.currency;addCurrency(ex.currency);}
          if(ex.project_type){u.project_type=ex.project_type;addType(ex.project_type);}
          if(ex.description) u.description=ex.description;
          return {...q,status:'ready',form:{...q.form,...u}};
        }));
      }catch{
        setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'ready',error:'Scan failed — fill in manually'}:q));
      }
    }
    setUploading(false);
    setCurrentIdx(0);
  }

  async function uploadAll() {
    setUploading(true);
    // Track how many non-done items we've already kicked off so the FIRST
    // one doesn't wait (only subsequent ones stagger).
    let fired = 0;
    for(let i=0;i<queue.length;i++){
      const item=queue[i]; if(item.status==='done') continue;
      // Stagger: wait before firing each call (except the first eligible one)
      // so the server doesn't start N concurrent background analyses and
      // hit Gemini/OpenAI rate limits.
      if (fired > 0) await sleep(STAGGER_MS);
      fired++;
      setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'uploading'}:q));
      try{
        const fd=new FormData();
        // Ensure required fields have values
        const safeForm = {
          ...item.form,
          name: item.form.name || item.file.name.replace(/\.[^.]+$/,''),
          client: item.form.client || 'Unknown',
          user_rating: item.form.user_rating || 3,
        };
        Object.entries(safeForm).forEach(([k,v])=>fd.append(k,String(v)));
        fd.append('proposal',item.file);
        const r=await fetch('/api/projects/upload',{method:'POST',body:fd});
        if(r.ok){
          setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'done',error:null}:q));
        } else {
          const d=await r.json().catch(()=>({}));
          setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'error',error:d.error||'Upload failed'}:q));
        }
      }catch(e){
        setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'error',error:e.message||'Upload failed'}:q));
      }
    }
    setUploading(false);
  }

  function upd(i,k,v){ setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,form:{...q.form,[k]:v}}:q)); }
  const statusColor={queued:'#6b6456',scanning:'#b8962e',ready:'#1e4a52',uploading:'#b8962e',done:'#3d5c3a',error:'#b04030'};
  const statusIcon={queued:'○',scanning:'⟳',ready:'●',uploading:'⟳',done:'✓',error:'✗'};
  const allReady=queue.length>0&&queue.every(q=>['ready','done'].includes(q.status));
  const allDone=queue.length>0&&queue.every(q=>q.status==='done');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(15,14,12,.65)',backdropFilter:'blur(4px)'}}>
      <div className="bg-white rounded-xl overflow-hidden shadow-2xl flex" style={{width:'860px',maxWidth:'95vw',maxHeight:'88vh'}}>
        <div className="w-64 flex-shrink-0 flex flex-col border-r" style={{borderColor:'#ddd5c4',background:'#f0ebe0'}}>
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between" style={{borderColor:'#ddd5c4'}}>
            <div><div className="text-sm font-semibold">Batch Import</div><div className="text-xs" style={{color:'#6b6456'}}>{queue.length} files</div></div>
            <button onClick={onClose} className="text-sm opacity-40 hover:opacity-80">✕</button>
          </div>
          {queue.length===0?(
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <input type="file" ref={fileRef} className="hidden" multiple accept=".pdf,.docx,.doc,.txt" onChange={handleFileSelect}/>
              <div className="text-3xl mb-3 opacity-30">📄</div>
              <p className="text-sm mb-3" style={{color:'#6b6456'}}>Select multiple proposal files to import at once</p>
              <Btn variant="teal" onClick={()=>fileRef.current?.click()}>Select Files</Btn>
            </div>
          ):(
            <>
              <div className="flex-1 overflow-y-auto p-2">
                {queue.map((item,i)=>(
                  <button key={i} onClick={()=>setCurrentIdx(i)}
                    className={`w-full text-left px-3 py-2.5 rounded-md mb-1 text-xs transition-all ${currentIdx===i?'bg-white shadow-sm':'hover:bg-white/60'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span style={{color:statusColor[item.status]}}>{statusIcon[item.status]}</span>
                      <span className="font-medium truncate flex-1">{item.form.name||item.file.name}</span>
                    </div>
                    <div className="truncate pl-4" style={{color:'#6b6456'}}>{item.form.client||'No client'}</div>
                  </button>
                ))}
              </div>
              <div className="p-3 border-t space-y-2" style={{borderColor:'#ddd5c4'}}>
                {/* Progress summary */}
                {queue.length>0&&(()=>{
                  const done=queue.filter(q=>q.status==='done').length;
                  const errs=queue.filter(q=>q.status==='error').length;
                  const total=queue.length;
                  if(done>0||errs>0) return(
                    <div className="text-xs rounded px-2 py-1.5 mb-1" style={{background:'#f0ebe0',color:'#6b6456'}}>
                      {done>0&&<span style={{color:'#3d5c3a'}}>✓ {done} uploaded</span>}
                      {done>0&&errs>0&&<span> · </span>}
                      {errs>0&&<span style={{color:'#b04030'}}>✗ {errs} failed</span>}
                      <span> / {total} total</span>
                    </div>
                  );
                  return null;
                })()}
                {!allDone&&!allReady&&!uploading&&<Btn variant="teal" onClick={scanAll} disabled={uploading} className="w-full justify-center">⟳ Scan All with AI</Btn>}
                {!allDone&&!allReady&&uploading&&<Btn variant="teal" disabled className="w-full justify-center"><Spinner size={12}/> Scanning…</Btn>}
                {allReady&&!allDone&&!uploading&&<Btn variant="gold" onClick={uploadAll} className="w-full justify-center">⊕ Upload All ({queue.length})</Btn>}
                {allReady&&!allDone&&uploading&&<Btn variant="gold" disabled className="w-full justify-center"><Spinner size={12}/> Uploading…</Btn>}
                {allDone&&(
                  <div className="text-center space-y-2">
                    <div className="text-sm font-semibold py-2" style={{color:'#3d5c3a'}}>✅ All uploaded</div>
                    <Btn variant="teal" onClick={onClose} className="w-full justify-center">Close & View Repository</Btn>
                  </div>
                )}
                {!allDone&&queue.some(q=>q.status==='error')&&allReady&&(
                  <button onClick={uploadAll} disabled={uploading} className="w-full text-xs underline text-center" style={{color:'#b04030'}}>Retry failed uploads</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {currentIdx===null?(
            <div className="flex items-center justify-center h-full text-center">
              <div><div className="text-4xl mb-3 opacity-20">📝</div><p className="text-sm" style={{color:'#6b6456'}}>Click "Scan All with AI" to extract details, then click each file on the left to review before uploading.</p></div>
            </div>
          ):(()=>{
            const item=queue[currentIdx];
            return(
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div><h3 className="font-serif text-base">{item.file.name}</h3><div className="text-xs font-mono" style={{color:statusColor[item.status]}}>{item.status}</div></div>
                  <div className="flex gap-2">
                    {currentIdx>0&&<Btn variant="ghost" size="sm" onClick={()=>setCurrentIdx(i=>i-1)}>← Prev</Btn>}
                    {currentIdx<queue.length-1&&<Btn variant="ghost" size="sm" onClick={()=>setCurrentIdx(i=>i+1)}>Next →</Btn>}
                  </div>
                </div>
                {item.error&&<div className="text-xs rounded p-2" style={{background:'#faeeeb',color:'#b04030'}}>⚠ {item.error}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Project Name</label><input value={item.form.name} onChange={e=>upd(currentIdx,'name',e.target.value)} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none focus:border-[#1e4a52]"/></div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Client</label><input value={item.form.client} onChange={e=>upd(currentIdx,'client',e.target.value)} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none focus:border-[#1e4a52]"/></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Value</label><input value={item.form.contract_value} onChange={e=>upd(currentIdx,'contract_value',e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none focus:border-[#1e4a52]"/></div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Currency</label><select value={item.form.currency} onChange={e=>upd(currentIdx,'currency',e.target.value)} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none">{currencies.map(c=><option key={c}>{c}</option>)}</select></div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Outcome</label><select value={item.form.outcome} onChange={e=>upd(currentIdx,'outcome',e.target.value)} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none">{OUTCOMES.map(o=><option key={o}>{o}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Sector</label><select value={item.form.sector} onChange={e=>upd(currentIdx,'sector',e.target.value)} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none"><option value="">Select…</option>{sectors.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Folder</label><select value={item.form.folder_id} onChange={e=>upd(currentIdx,'folder_id',e.target.value)} className="w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none"><option value="">Choose…</option>{leafFolders.map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}</select></div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#6b6456'}}>Rating</label>
                  <div className="flex gap-2">{[1,2,3,4,5].map(n=><button key={n} type="button" onClick={()=>upd(currentIdx,'user_rating',n)} className="text-2xl transition-all hover:scale-110" style={{color:n<=item.form.user_rating?'#b8962e':'#ddd5c4'}}>★</button>)}</div>
                </div>
                {item.status==='done'&&(
                  <div className="rounded-lg p-4 text-center" style={{background:'#edf3ec',border:'1px solid rgba(61,92,58,.3)'}}>
                    <div className="text-2xl mb-1">✅</div>
                    <div className="font-semibold text-sm" style={{color:'#3d5c3a'}}>Uploaded successfully</div>
                    <div className="text-xs mt-1" style={{color:'#6b6456'}}>AI is indexing in the background — appears in repository within 60s</div>
                    {currentIdx<queue.length-1&&<button onClick={()=>setCurrentIdx(i=>i+1)} className="mt-3 text-xs underline" style={{color:'#1e4a52'}}>Review next file →</button>}
                  </div>
                )}
                {item.status==='error'&&(
                  <div className="rounded-lg p-4" style={{background:'#faeeeb',border:'1px solid rgba(176,64,48,.2)'}}>
                    <div className="font-semibold text-sm mb-1" style={{color:'#b04030'}}>⚠ Upload failed</div>
                    <div className="text-xs" style={{color:'#b04030'}}>{item.error||'Unknown error'}</div>
                    <div className="text-xs mt-2" style={{color:'#6b6456'}}>Check that Name and Client fields are filled in, then try uploading again.</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
