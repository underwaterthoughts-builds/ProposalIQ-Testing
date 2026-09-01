import { useState, useRef, useCallback } from 'react';
import { Btn, Spinner } from '../ui';
import { OUTCOMES } from './shared';
import { useCustomValues } from './useCustomValues';
import { AddNewInline } from './fields';

// ─── BATCH IMPORT MODAL ───────────────────────────────────────────────────────

// Subtype label map shared with the project detail page; kept inline here so
// repository.jsx doesn't pull a new import path
const BATCH_SUBTYPE_LABEL = {
  main_proposal: 'Main proposal', technical_proposal: 'Technical', commercial_proposal: 'Commercial',
  pricing_schedule: 'Pricing', cv: 'CV', case_study: 'Case study', methodology: 'Methodology',
  compliance: 'Compliance', cover_letter: 'Cover letter', rfp: 'RFP / brief', unknown: 'Unclassified',
};

function BatchModal({ onClose, folders: initialFolders, onToast }) {
  // phase: 'pick' → 'clustering' → 'review_clusters' (only if any) → 'queue'
  const [phase, setPhase] = useState('pick');
  const [clusterItems, setClusterItems] = useState([]); // [{tempId, name, size, subtype, classification_confidence, project_code}]
  const [clusters, setClusters] = useState([]); // [{id, members, confidence, signal, project_code, suggested_primary, decision}]
  const [queue, setQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const {sectors,types,currencies,addSector,addType,addCurrency} = useCustomValues();
  const [folders] = useState(initialFolders);
  const leafFolders = folders.filter(fl=>!folders.find(p=>p.parent_id===fl.id));

  // Add-new state (sector/currency/type) for the currently-displayed file.
  // The button-then-input pattern matches the single upload modal so users
  // see one consistent affordance everywhere.
  const [addingField, setAddingField] = useState(null);
  const [newValue, setNewValue] = useState('');
  const activateAdd = useCallback((field) => { setAddingField(field); setNewValue(''); }, []);
  const cancelAdd = useCallback(() => { setAddingField(null); setNewValue(''); }, []);
  const saveAdd = useCallback(() => {
    const v = newValue.trim();
    if (!v || currentIdx == null) return;
    if (addingField === 'sector') { addSector(v); upd(currentIdx, 'sector', v); }
    else if (addingField === 'currency') { const u = addCurrency(v); upd(currentIdx, 'currency', u); }
    else if (addingField === 'type') { addType(v); upd(currentIdx, 'project_type', v); }
    cancelAdd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingField, newValue, currentIdx, addSector, addCurrency, addType, cancelAdd]);

  // Delay between sequential AI-backed calls (prescan, upload) so we don't
  // hammer the Gemini/OpenAI API rate limits in rapid succession. 3 seconds
  // empirically clears the "too many concurrent" failure mode we were seeing
  // on batch uploads of 5+ files without adding noticeable total time.
  const STAGGER_MS = 3000;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function handleFileSelect(e) {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setPhase('clustering');
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of selected) fd.append('files', f);
      const r = await fetch('/api/projects/batch-cluster', { method: 'POST', body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Clustering failed (${r.status})`);
      }
      const d = await r.json();
      const items = (d.items || []);
      const cls = (d.clusters || []).map(c => ({ ...c, decision: null, excluded: [] }));
      setClusterItems(items);
      setClusters(cls);
      // If no clusters were detected, skip directly to building the queue
      if (cls.length === 0) buildQueueFromDecisions(items, []);
      else setPhase('review_clusters');
    } catch (err) {
      onToast(`AI clustering failed: ${err.message}. Falling back to one-file-per-row.`);
      // Fallback: build a basic queue without server-side analysis (legacy behaviour)
      setQueue(selected.map(f => ({
        file: f, tempId: null, primaryName: f.name, attachments: [], status: 'queued',
        form: { name: f.name.replace(/\.[^.]+$/, ''), client: '', sector: '', contract_value: '', currency: 'GBP', outcome: 'pending', user_rating: 3, project_type: '', folder_id: '', description: '', went_well: '', improvements: '', lessons: '' },
        error: null,
      })));
      setPhase('queue');
    }
    setUploading(false);
  }

  // After the user resolves cluster suggestions, build the queue. Each row
  // is either a single item (kept-separate) or a primary + attachments
  // (combine confirmed). Form metadata seeds from the primary's filename;
  // user can edit per row in the existing review step.
  function buildQueueFromDecisions(items, cls) {
    const used = new Set();
    const rows = [];
    for (const c of cls) {
      if (c.decision !== 'combine') continue;
      const memberIds = (c.members || []).filter(id => !c.excluded?.includes(id));
      if (memberIds.length < 2) continue;
      const primaryId = memberIds.includes(c.suggested_primary) ? c.suggested_primary : memberIds[0];
      const primary = items.find(it => it.tempId === primaryId);
      if (!primary) continue;
      memberIds.forEach(id => used.add(id));
      const attachments = memberIds
        .filter(id => id !== primaryId)
        .map(id => items.find(it => it.tempId === id))
        .filter(Boolean);
      rows.push({
        tempId: primary.tempId,
        primaryName: primary.name,
        attachments,
        project_code: c.project_code || primary.project_code || null,
        status: 'queued',
        form: {
          name: deriveProjectName(primary.name, c.project_code),
          client: '', sector: '', contract_value: '', currency: 'GBP', outcome: 'pending',
          user_rating: 3, project_type: '', folder_id: '', description: '', went_well: '', improvements: '', lessons: '',
        },
        error: null,
      });
    }
    // Anything not absorbed into a combined cluster becomes its own row.
    // Includes files from clusters the user kept separate, files excluded
    // per-file, and files that were never in any cluster suggestion.
    for (const it of items) {
      if (used.has(it.tempId)) continue;
      rows.push({
        tempId: it.tempId,
        primaryName: it.name,
        attachments: [],
        project_code: it.project_code || null,
        status: 'queued',
        form: {
          name: deriveProjectName(it.name, it.project_code),
          client: '', sector: '', contract_value: '', currency: 'GBP', outcome: 'pending',
          user_rating: 3, project_type: '', folder_id: '', description: '', went_well: '', improvements: '', lessons: '',
        },
        error: null,
      });
    }
    setQueue(rows);
    setPhase('queue');
  }

  function deriveProjectName(filename, projectCode) {
    const stem = filename.replace(/\.[^.]+$/, '');
    return projectCode ? `${projectCode} — ${stem}` : stem;
  }

  // Live preview of how many rows the queue will end up with given the
  // current cluster decisions. Used by the "Apply groupings" button label.
  function queueCountAfterDecisions(items, cls) {
    let absorbed = 0;
    for (const c of cls) {
      if (c.decision === 'combine') {
        const ms = (c.members || []).filter(id => !(c.excluded || []).includes(id));
        if (ms.length >= 2) absorbed += ms.length;
      }
    }
    const groupRows = cls.filter(c => c.decision === 'combine' && (c.members || []).filter(id => !(c.excluded || []).includes(id)).length >= 2).length;
    return items.length - absorbed + groupRows;
  }

  function setClusterDecision(clusterId, decision) {
    setClusters(prev => prev.map(c => c.id === clusterId ? { ...c, decision } : c));
  }
  function toggleClusterExclude(clusterId, tempId) {
    setClusters(prev => prev.map(c => {
      if (c.id !== clusterId) return c;
      const ex = c.excluded || [];
      return { ...c, excluded: ex.includes(tempId) ? ex.filter(x => x !== tempId) : [...ex, tempId] };
    }));
  }
  function applyClusterDecisions() {
    // Default-decide any cluster the user hasn't touched: if user dismissed
    // the screen with no answer, treat as "keep separate" (safe default).
    const finalised = clusters.map(c => ({ ...c, decision: c.decision || 'keep_separate' }));
    buildQueueFromDecisions(clusterItems, finalised);
  }

  async function scanAll() {
    setUploading(true);
    for(let i=0;i<queue.length;i++){
      // Stagger: wait before firing each call (except the first) so rapid
      // successive AI calls don't hit rate limits.
      if (i > 0) await sleep(STAGGER_MS);
      setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'scanning'}:q));
      try{
        // tempId rows route to /api/projects/batch-prescan which reads
        // the primary + every attachment from the server-side temp dir
        // and concatenates their text before extraction. Otherwise the
        // budget hidden in a Commercial annex never gets seen because
        // prescan only reads the primary file.
        if (!queue[i].file) {
          const ids = [queue[i].tempId, ...((queue[i].attachments || []).map(a => a.tempId))].filter(Boolean);
          if (ids.length === 0) {
            setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'ready' } : q));
            continue;
          }
          const r = await fetch('/api/projects/batch-prescan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tempIds: ids, primaryTempId: queue[i].tempId }),
          });
          const d = await r.json();
          const ex = d.extracted || {};
          setQueue(prev => prev.map((q, idx) => {
            if (idx !== i) return q;
            const u = {};
            if (ex.name && !q.form.name) u.name = ex.name;
            if (ex.client) u.client = ex.client;
            if (ex.sector) { u.sector = ex.sector; addSector(ex.sector); }
            if (ex.contract_value) u.contract_value = ex.contract_value;
            if (ex.currency) { u.currency = ex.currency; addCurrency(ex.currency); }
            if (ex.project_type) { u.project_type = ex.project_type; addType(ex.project_type); }
            if (ex.description) u.description = ex.description;
            return { ...q, status: 'ready', form: { ...q.form, ...u } };
          }));
          continue;
        }
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
    // When the queue carries tempIds (from the AI-clustering flow), commit
    // server-side via /api/projects/batch-commit which moves the temp
    // files into per-project dirs and creates project rows. Then
    // reindex per project. This single round-trip is much faster than
    // re-uploading the bytes per row.
    const usingTempIds = queue.length > 0 && queue.every(q => q.tempId);
    if (usingTempIds) {
      try {
        const rows = queue.filter(q => q.status !== 'done').map(q => ({
          primary_temp_id: q.tempId,
          primary_original_name: q.primaryName,
          attachment_temp_ids: (q.attachments || []).map(a => a.tempId),
          attachment_original_names: Object.fromEntries((q.attachments || []).map(a => [a.tempId, a.name])),
          form: {
            ...q.form,
            name: q.form.name || q.primaryName.replace(/\.[^.]+$/, ''),
            client: q.form.client || 'Unknown',
            user_rating: q.form.user_rating || 3,
          },
        }));
        if (!rows.length) { setUploading(false); return; }
        setQueue(prev => prev.map(q => q.status === 'done' ? q : { ...q, status: 'uploading' }));
        const r = await fetch('/api/projects/batch-commit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Commit failed (${r.status})`);
        }
        const d = await r.json();
        // Mark rows as done in queue order — batch-commit returns projects[]
        // in the same order it received rows[]. Trigger background reindex
        // per project so the multi-doc analysis pipeline runs.
        const projectIds = (d.projects || []).map(p => p.projectId);
        let p = 0;
        setQueue(prev => prev.map(q => {
          if (q.status === 'done') return q;
          const projectId = projectIds[p++] || null;
          return { ...q, status: 'done', error: null, projectId };
        }));
        for (const pid of projectIds) {
          fetch(`/api/projects/${pid}/reindex`, { method: 'POST' }).catch(e => {
            console.error('[repository] reindex kick-off:', e.message);
            onToast(`Failed to start re-analysis for one project: ${e.message}`);
          });
          await sleep(STAGGER_MS);
        }
        setUploading(false);
        return;
      } catch (e) {
        console.error('[batch] commit failed, falling back to per-file upload:', e.message);
        setQueue(prev => prev.map(q => q.status === 'uploading' ? { ...q, status: 'queued' } : q));
        // Fall through to legacy per-file path below
      }
    }

    // Legacy path: one upload per file (used when files came from the
    // fallback handleFileSelect path, ie no temp IDs).
    let fired = 0;
    for(let i=0;i<queue.length;i++){
      const item=queue[i]; if(item.status==='done') continue;
      if (!item.file) continue; // tempId-only items can't go through legacy path
      if (fired > 0) await sleep(STAGGER_MS);
      fired++;
      setQueue(prev=>prev.map((q,idx)=>idx===i?{...q,status:'uploading'}:q));
      try{
        const fd=new FormData();
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
  const statusColor={queued:'#d0c5b0',scanning:'#e4c366',ready:'#7fb4bc',uploading:'#e4c366',done:'#7bd07a',error:'#ffb4ab'};
  const statusIcon={queued:'○',scanning:'⟳',ready:'●',uploading:'⟳',done:'✓',error:'✗'};
  const allReady=queue.length>0&&queue.every(q=>['ready','done'].includes(q.status));
  const allDone=queue.length>0&&queue.every(q=>q.status==='done');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(15,14,12,.65)',backdropFilter:'blur(4px)'}}>
      <div className="bg-surface-container rounded-xl overflow-hidden shadow-2xl flex" style={{width:'860px',maxWidth:'95vw',maxHeight:'88vh'}}>
        <div className="w-64 flex-shrink-0 flex flex-col border-r" style={{borderColor:'#4d4636',background:'#2b2a27'}}>
          <div className="px-4 py-3 border-b bg-surface-container flex items-center justify-between" style={{borderColor:'#4d4636'}}>
            <div><div className="text-sm font-semibold">Batch Import</div><div className="text-xs" style={{color:'#d0c5b0'}}>{queue.length} files</div></div>
            <button onClick={onClose} className="text-sm opacity-40 hover:opacity-80">✕</button>
          </div>
          {phase==='pick'?(
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <input type="file" ref={fileRef} className="hidden" multiple accept=".pdf,.docx,.doc,.xlsx,.csv,.txt,.md" onChange={handleFileSelect}/>
              <div className="text-3xl mb-3 opacity-30">📄</div>
              <p className="text-sm mb-3" style={{color:'#d0c5b0'}}>Drop multiple files — including supporting docs, CVs, pricing schedules. AI will group files that look like they belong to the same project.</p>
              <Btn variant="teal" onClick={()=>fileRef.current?.click()}>Select Files</Btn>
            </div>
          ):phase==='clustering'?(
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Spinner size={20}/>
              <p className="text-sm mt-3" style={{color:'#d0c5b0'}}>AI is classifying files and detecting project codes…</p>
            </div>
          ):phase==='review_clusters'?(
            <div className="flex-1 overflow-y-auto p-3 text-xs" style={{color:'#d0c5b0'}}>
              <p className="text-[11px] uppercase tracking-widest mb-2" style={{color:'#7fb4bc'}}>{clusters.length} grouping{clusters.length===1?'':'s'} detected</p>
              <p>Review on the right →</p>
            </div>
          ):(
            <>
              <div className="flex-1 overflow-y-auto p-2">
                {queue.map((item,i)=>(
                  <button key={i} onClick={()=>setCurrentIdx(i)}
                    className={`w-full text-left px-3 py-2.5 rounded-md mb-1 text-xs transition-all ${currentIdx===i?'bg-surface-container shadow-sm':'hover:bg-surface-container/60'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span style={{color:statusColor[item.status]}}>{statusIcon[item.status]}</span>
                      <span className="font-medium truncate flex-1">{item.form.name || item.primaryName || item.file?.name}</span>
                    </div>
                    <div className="truncate pl-4" style={{color:'#d0c5b0'}}>{item.form.client||'No client'}</div>
                  </button>
                ))}
              </div>
              <div className="p-3 border-t space-y-2" style={{borderColor:'#4d4636'}}>
                {/* Progress summary */}
                {queue.length>0&&(()=>{
                  const done=queue.filter(q=>q.status==='done').length;
                  const errs=queue.filter(q=>q.status==='error').length;
                  const total=queue.length;
                  if(done>0||errs>0) return(
                    <div className="text-xs rounded px-2 py-1.5 mb-1" style={{background:'#2b2a27',color:'#d0c5b0'}}>
                      {done>0&&<span style={{color:'#7bd07a'}}>✓ {done} uploaded</span>}
                      {done>0&&errs>0&&<span> · </span>}
                      {errs>0&&<span style={{color:'#ffb4ab'}}>✗ {errs} failed</span>}
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
                    <div className="text-sm font-semibold py-2" style={{color:'#7bd07a'}}>✅ All uploaded</div>
                    <Btn variant="teal" onClick={onClose} className="w-full justify-center">Close & View Repository</Btn>
                  </div>
                )}
                {!allDone&&queue.some(q=>q.status==='error')&&allReady&&(
                  <button onClick={uploadAll} disabled={uploading} className="w-full text-xs underline text-center" style={{color:'#ffb4ab'}}>Retry failed uploads</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {phase==='review_clusters'?(
            <div className="space-y-4">
              <div>
                <h3 className="font-headline text-xl mb-1">Review groupings</h3>
                <p className="text-sm" style={{color:'#d0c5b0'}}>
                  AI detected files that look like they belong to the same project. Confirm each group, or keep separate. Files dropped from a group become their own row.
                </p>
              </div>
              {clusters.map(c => {
                const memberItems = (c.members || []).map(id => clusterItems.find(it => it.tempId === id)).filter(Boolean);
                const excluded = c.excluded || [];
                return (
                  <div key={c.id} className="rounded-lg p-4" style={{ background: '#1d1b19', border: `1px solid ${c.confidence === 'high' ? '#7fb4bc' : '#4d4636'}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: c.confidence === 'high' ? '#7fb4bc' : '#e4c366' }}>
                          {c.confidence} confidence · {c.signal === 'shared_project_code' ? `project code ${c.project_code}` : c.signal === 'shared_filename_prefix' ? 'shared filename prefix' : c.signal}
                        </div>
                        <div className="text-sm mt-1" style={{ color: '#d0c5b0' }}>
                          {memberItems.length - excluded.length} of {memberItems.length} files will combine into one project
                        </div>
                      </div>
                    </div>
                    <ul className="space-y-1.5 mb-3">
                      {memberItems.map(it => {
                        const isPrimary = c.suggested_primary === it.tempId;
                        const isExcluded = excluded.includes(it.tempId);
                        const label = BATCH_SUBTYPE_LABEL[it.subtype] || it.subtype;
                        return (
                          <li key={it.tempId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs" style={{ background: isExcluded ? '#2b2a27' : '#211f1d', opacity: isExcluded ? 0.5 : 1 }}>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {isPrimary && !isExcluded && <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: '#1f3a1c', color: '#7bd07a' }}>Primary</span>}
                              <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(127,180,188,0.12)', color: '#7fb4bc' }}>{label}</span>
                              <span className="truncate" style={{ color: isExcluded ? '#7a716a' : '#d0c5b0', textDecoration: isExcluded ? 'line-through' : 'none' }}>{it.name}</span>
                            </div>
                            <button onClick={() => toggleClusterExclude(c.id, it.tempId)} className="text-[10px] font-mono uppercase tracking-widest opacity-60 hover:opacity-100">
                              {isExcluded ? 'Restore' : 'Move out'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setClusterDecision(c.id, 'combine')}
                        className={`text-xs px-3 py-1.5 rounded border ${c.decision === 'combine' ? 'bg-[#1f3a1c] border-[#7bd07a] text-[#7bd07a]' : 'border-outline-variant hover:bg-surface-container-high'}`}>
                        ✓ Combine into one project
                      </button>
                      <button
                        onClick={() => setClusterDecision(c.id, 'keep_separate')}
                        className={`text-xs px-3 py-1.5 rounded border ${c.decision === 'keep_separate' ? 'bg-surface-container-high border-outline' : 'border-outline-variant hover:bg-surface-container-high'}`}>
                        ✗ Keep separate
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2">
                <Btn variant="teal" onClick={applyClusterDecisions} className="w-full justify-center">
                  Apply groupings → review {queueCountAfterDecisions(clusterItems, clusters)} project{queueCountAfterDecisions(clusterItems, clusters)===1?'':'s'}
                </Btn>
                <p className="text-[10px] font-mono uppercase tracking-widest mt-2 text-center" style={{ color: '#d0c5b0' }}>
                  Untouched groupings default to "keep separate"
                </p>
              </div>
            </div>
          ):currentIdx===null?(
            <div className="flex items-center justify-center h-full text-center">
              <div><div className="text-4xl mb-3 opacity-20">📝</div><p className="text-sm" style={{color:'#d0c5b0'}}>Click "Scan All with AI" to extract details, then click each file on the left to review before uploading.</p></div>
            </div>
          ):(()=>{
            const item=queue[currentIdx];
            return(
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-base truncate">{item.primaryName || item.file?.name}</h3>
                    <div className="text-xs font-mono" style={{color:statusColor[item.status]}}>
                      {item.status}{item.project_code?` · ${item.project_code}`:''}
                      {item.attachments?.length ? ` · ${item.attachments.length} supporting doc${item.attachments.length===1?'':'s'}` : ''}
                    </div>
                    {item.attachments?.length>0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.attachments.map(a => (
                          <span key={a.tempId} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{background:'rgba(127,180,188,0.12)',color:'#7fb4bc'}}>
                            {BATCH_SUBTYPE_LABEL[a.subtype] || a.subtype}: {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {currentIdx>0&&<Btn variant="ghost" size="sm" onClick={()=>setCurrentIdx(i=>i-1)}>← Prev</Btn>}
                    {currentIdx<queue.length-1&&<Btn variant="ghost" size="sm" onClick={()=>setCurrentIdx(i=>i+1)}>Next →</Btn>}
                  </div>
                </div>
                {item.error&&<div className="text-xs rounded p-2" style={{background:'rgba(176,64,48,.12)',color:'#ffb4ab'}}>⚠ {item.error}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Project Name</label><input value={item.form.name} onChange={e=>upd(currentIdx,'name',e.target.value)} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none focus:border-[#1e4a52]"/></div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Client</label><input value={item.form.client} onChange={e=>upd(currentIdx,'client',e.target.value)} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none focus:border-[#1e4a52]"/></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Value</label><input value={item.form.contract_value} onChange={e=>upd(currentIdx,'contract_value',e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none focus:border-[#1e4a52]"/></div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Currency</label>
                    <select value={item.form.currency} onChange={e=>upd(currentIdx,'currency',e.target.value)} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none">{currencies.map(c=><option key={c}>{c}</option>)}</select>
                    <AddNewInline field="currency" label="currency" placeholder="e.g. NOK"
                      active={addingField==='currency'} onActivate={()=>activateAdd('currency')}
                      value={newValue} onValueChange={setNewValue}
                      onSave={saveAdd} onCancel={cancelAdd} />
                  </div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Outcome</label><select value={item.form.outcome} onChange={e=>upd(currentIdx,'outcome',e.target.value)} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none">{OUTCOMES.map(o=><option key={o}>{o}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Sector</label>
                    <select value={item.form.sector} onChange={e=>upd(currentIdx,'sector',e.target.value)} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none"><option value="">Select…</option>{sectors.map(s=><option key={s}>{s}</option>)}</select>
                    <AddNewInline field="sector" placeholder="e.g. Energy & Utilities"
                      active={addingField==='sector'} onActivate={()=>activateAdd('sector')}
                      value={newValue} onValueChange={setNewValue}
                      onSave={saveAdd} onCancel={cancelAdd} />
                  </div>
                  <div><label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Folder</label><select value={item.form.folder_id} onChange={e=>upd(currentIdx,'folder_id',e.target.value)} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none"><option value="">Choose…</option>{leafFolders.map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}</select></div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1" style={{color:'#d0c5b0'}}>Rating</label>
                  <div className="flex gap-2">{[1,2,3,4,5].map(n=><button key={n} type="button" onClick={()=>upd(currentIdx,'user_rating',n)} className="text-2xl transition-all hover:scale-110" style={{color:n<=item.form.user_rating?'#b8962e':'#4d4636'}}>★</button>)}</div>
                </div>
                {item.status==='done'&&(
                  <div className="rounded-lg p-4 text-center" style={{background:'rgba(61,92,58,.15)',border:'1px solid rgba(61,92,58,.3)'}}>
                    <div className="text-2xl mb-1">✅</div>
                    <div className="font-semibold text-sm" style={{color:'#7bd07a'}}>Uploaded successfully</div>
                    <div className="text-xs mt-1" style={{color:'#d0c5b0'}}>AI is indexing in the background — appears in repository within 60s</div>
                    {currentIdx<queue.length-1&&<button onClick={()=>setCurrentIdx(i=>i+1)} className="mt-3 text-xs underline" style={{color:'#7fb4bc'}}>Review next file →</button>}
                  </div>
                )}
                {item.status==='error'&&(
                  <div className="rounded-lg p-4" style={{background:'rgba(176,64,48,.12)',border:'1px solid rgba(176,64,48,.2)'}}>
                    <div className="font-semibold text-sm mb-1" style={{color:'#ffb4ab'}}>⚠ Upload failed</div>
                    <div className="text-xs" style={{color:'#ffb4ab'}}>{item.error||'Unknown error'}</div>
                    <div className="text-xs mt-2" style={{color:'#d0c5b0'}}>Check that Name and Client fields are filled in, then try uploading again.</div>
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

export default BatchModal;
