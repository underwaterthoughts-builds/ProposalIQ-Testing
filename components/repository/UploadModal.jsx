import { useState, useRef, useCallback } from 'react';
import { Btn, Stars, FileChip, Spinner } from '../ui';
import { OUTCOMES, AI_WEIGHT_DESC } from './shared';
import { useCustomValues } from './useCustomValues';
import { FieldInput, FieldSelect, FieldTextarea, AddNewInline } from './fields';

// ─── UPLOAD MODAL ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, folders: initialFolders, onToast }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({name:'',client:'',sector:'',contract_value:'',currency:'GBP',outcome:'pending',user_rating:0,project_type:'',date_submitted:'',folder_id:'',description:'',went_well:'',improvements:'',lessons:''});
  const [files, setFiles] = useState({proposal:null,rfp:null,budget:null});
  const [supportingFiles, setSupportingFiles] = useState([]);
  const supportingRef = useRef();
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
    supportingFiles.forEach(sf => fd.append('supporting', sf));
    const r=await fetch('/api/projects/upload',{method:'POST',body:fd});
    setUploading(false);
    if(r.ok){setDone(true);onToast('Project uploaded — analysis in progress');}
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
      <div className="w-full max-w-xl bg-surface-container rounded-xl overflow-hidden shadow-2xl flex flex-col" style={{maxHeight:'92vh'}}>
        <div className="px-6 py-4 border-b flex items-start justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#1e4a52,#2d6b78)'}}>
          <div><h2 className="font-serif text-lg text-white mb-0.5">Upload Project</h2><p className="text-xs font-mono text-white/40">Add to knowledge base</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-surface-container/15 text-sm">✕</button>
        </div>

        {!done&&(
          <div className="flex items-center gap-1 px-6 py-3 border-b flex-shrink-0" style={{background:'#2b2a27',borderColor:'#4d4636'}}>
            {stepLabels.map((lbl,i)=>{
              const n=i+1;
              return(
                <div key={n} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 text-xs ${n===step?'font-semibold':n<step?'':'opacity-40'}`} style={{color:n===step?'#e8c357':n<step?'#7bd07a':'#d0c5b0'}}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono flex-shrink-0 ${n<step?'text-white':n===step?'text-on-primary':'border border-outline-variant/30'}`} style={{background:n<step?'#7bd07a':n===step?'#e8c357':undefined}}>
                      {n<step?'✓':n}
                    </div>
                    <span className="hidden sm:inline whitespace-nowrap">{lbl}</span>
                  </div>
                  {i<stepLabels.length-1&&<div className="w-5 h-px mx-1 flex-shrink-0" style={{background:n<step?'#3d5c3a':'#4d4636'}}/>}
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
              <p className="text-sm mb-3" style={{color:'#d0c5b0'}}>AI is analysing your documents (~60 seconds). The results are saved, so future loads are instant.</p>
            </div>
          ):step===1?(
            <div className="space-y-4">
              <p className="text-sm" style={{color:'#d0c5b0'}}>Upload your documents first. The AI will scan them and pre-fill the details on the next screen.</p>
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
                        style={{borderColor:files[ft]?'#7fb4bc':errors.files?'#ffb4ab':'#4d4636',background:files[ft]?'rgba(30,107,120,.15)':'#1d1b19'}}>
                        <div className="text-2xl mb-1">{files[ft]?'✅':icons[ft]}</div>
                        <div className="text-xs font-semibold mb-0.5">{labels[ft]}</div>
                        <div className="text-[10px] font-mono" style={{color:ft==='proposal'?'#ffb4ab':'#d0c5b0'}}>{ft==='proposal'?'Required':'Recommended'}</div>
                        {files[ft]&&<div className="text-[10px] font-mono mt-1 truncate" style={{color:'#7fb4bc'}}>{files[ft].name}</div>}
                      </button>
                    </div>
                  );
                })}
              </div>
              {errors.files&&<p className="text-xs text-red-500">{errors.files}</p>}

              {/* Other documents — multi-file. AI auto-classifies subtype on
                  upload (technical proposal / commercial / CV / case study /
                  methodology / compliance / cover letter). Each gets its own
                  dedicated AI analysis pass so a CV reveals named individuals
                  even though the main proposal doesn't, etc. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold" style={{color:'#d0c5b0'}}>Other documents <span className="font-mono opacity-60">— optional, multi-file</span></div>
                  <span className="text-[10px] font-mono" style={{color:'#7fb4bc'}}>{supportingFiles.length} attached</span>
                </div>
                <input type="file" ref={supportingRef} className="hidden" multiple accept=".pdf,.docx,.doc,.xlsx,.csv,.txt,.md"
                  onChange={e=>{
                    const picked = Array.from(e.target.files || []);
                    if(picked.length) setSupportingFiles(prev=>[...prev,...picked]);
                    e.target.value='';
                  }}/>
                <button type="button" onClick={()=>supportingRef.current?.click()}
                  className="w-full rounded-lg p-3 text-center border-2 border-dashed transition-all hover:border-teal/50"
                  style={{borderColor:'#4d4636',background:'#1d1b19',color:'#d0c5b0'}}>
                  <div className="text-xs">+ Attach CVs, case studies, technical / commercial annexes, compliance, cover letter…</div>
                </button>
                {supportingFiles.length>0&&(
                  <div className="mt-2 space-y-1.5">
                    {supportingFiles.map((sf, i)=>(
                      <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded text-xs" style={{background:'#2b2a27'}}>
                        <span className="truncate" style={{color:'#d0c5b0'}}>{sf.name}</span>
                        <button type="button" aria-label={`Remove ${sf.name}`} onClick={()=>setSupportingFiles(prev=>prev.filter((_,j)=>j!==i))} className="opacity-60 hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg p-3 text-xs" style={{background:'#2b2a27',color:'#d0c5b0'}}>
                ⓘ By uploading documents you confirm you are authorised to do so and that this does not breach any confidentiality agreement or NDA.
              </div>
            </div>
          ):step===2?(
            <div className="space-y-4">
              {scanning?(
                <div className="flex items-center gap-3 rounded-lg p-3 text-sm" style={{background:'rgba(232,195,87,.08)',color:'#e8c357'}}><Spinner size={14}/><span>AI scanning document and extracting details…</span></div>
              ):aiFields.size>0?(
                <div className="rounded-lg p-3 text-xs" style={{background:'rgba(30,107,120,.15)',color:'#7fb4bc'}}>
                  ✦ <strong>AI pre-filled {aiFields.size} field{aiFields.size!==1?'s':''}</strong>{scanConfidence?` (confidence: ${scanConfidence})`:''}. Tinted fields were auto-filled — edit anything incorrect.
                </div>
              ):scanNote?(<div className="rounded-lg p-3 text-xs" style={{background:'rgba(176,64,48,.12)',color:'#7a2010'}}>⚠ {scanNote}</div>):null}

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
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#d0c5b0'}}>Outcome</label>
                  <select value={form.outcome} onChange={onChangeOutcome} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none bg-surface-container-low focus:bg-surface-container focus:border-[#1e4a52]">
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
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#d0c5b0'}}>Save to Folder</label>
                  <select value={form.folder_id} onChange={onChangeFolder} className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none bg-surface-container-low focus:bg-surface-container focus:border-[#1e4a52]">
                    <option value="">Choose folder…</option>{leafFolders.map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}
                  </select>
                  <AddNewInline field="folder" placeholder="e.g. Central Government" showParent={true} {...addCommon} active={addingField==='folder'} onActivate={()=>activateAdd('folder')}/>
                </div>
              </div>
              <FieldTextarea label="Description" value={form.description} onChange={onChangeDesc} rows={3} placeholder="What was this project about? Key technologies, deliverables, scope…"/>
            </div>
          ):step===3?(
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{background:'rgba(232,195,87,.08)',border:'1px solid rgba(184,150,46,.3)'}}>
                <h3 className="text-sm font-semibold mb-1">How successful was this project?</h3>
                <p className="text-xs mb-4" style={{color:'#d0c5b0'}}>Controls how much the AI learns from this. 5★ = gold standard. 1★ = loss analysis only.</p>
                <div className="flex gap-3 mb-2">
                  {[1,2,3,4,5].map(n=><button key={n} type="button" onClick={()=>setF('user_rating',n)} className="text-3xl transition-all hover:scale-110" style={{color:n<=form.user_rating?'#b8962e':'#4d4636'}}>★</button>)}
                </div>
                {form.user_rating>0&&<div className="text-xs font-mono mt-2" style={{color:'#d0c5b0'}}><span style={{color:'#b8962e',fontWeight:600}}>AI Weight: {WEIGHT[form.user_rating]}</span> — {AI_WEIGHT_DESC[form.user_rating]}</div>}
                {errors.rating&&<p className="text-xs text-red-500 mt-2">{errors.rating}</p>}
                {/* AI rating suggestion */}
                {aiSuggestions?.rating && (
                  <div className="mt-3 rounded-lg p-3" style={{background:'rgba(30,74,82,.07)',border:'1px solid rgba(30,74,82,.15)'}}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-mono uppercase tracking-widest" style={{color:'#7fb4bc'}}>AI Suggests: {aiSuggestions.rating}★</div>
                      <button type="button" onClick={()=>setF('user_rating', aiSuggestions.rating)}
                        className="text-[10px] px-2 py-0.5 rounded font-medium" style={{background:'#e8c357',color:'#3d2f00'}}>
                        Accept
                      </button>
                    </div>
                    <p className="text-xs" style={{color:'#7fb4bc'}}>{aiSuggestions.rationale}</p>
                    {aiSuggestions.strengths.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {aiSuggestions.strengths.slice(0,2).map((s,i)=><span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{background:'rgba(61,92,58,.15)',color:'#7bd07a'}}>+ {s}</span>)}
                        {aiSuggestions.weaknesses.slice(0,1).map((w,i)=><span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{background:'rgba(176,64,48,.12)',color:'#ffb4ab'}}>− {w}</span>)}
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
              <div className="rounded-lg p-4 bg-surface-container-high border" style={{borderColor:'#4d4636'}}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{color:'#d0c5b0'}}>Project Details</div>
                {[['Name',form.name],['Client',form.client],['Value',`${form.currency} ${parseInt(form.contract_value||0).toLocaleString()}`],['Sector',form.sector],['Outcome',form.outcome],['Folder',leafFolders.find(fl=>fl.id===form.folder_id)?.name||'None']].map(([k,v])=>(
                  <div key={k} className="flex justify-between py-1.5 border-b text-sm last:border-0" style={{borderColor:'#4d4636'}}>
                    <span style={{color:'#d0c5b0'}}>{k}</span><span className="font-medium">{v||'—'}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-4 bg-surface-container-high border" style={{borderColor:'#4d4636'}}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#d0c5b0'}}>Rating</div>
                <div className="flex items-center gap-3"><Stars rating={form.user_rating} size="base"/><span className="text-sm font-mono" style={{color:'#b8962e'}}>AI Weight: {WEIGHT[form.user_rating]||'—'}</span></div>
              </div>
              <div className="rounded-lg p-4 bg-surface-container-high border" style={{borderColor:'#4d4636'}}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#d0c5b0'}}>Files</div>
                <div className="flex gap-2">{Object.entries(files).filter(([,v])=>v).map(([k])=><FileChip key={k} type={k}/>)}</div>
              </div>
              {errors.submit&&<p className="text-sm text-red-500 bg-red-50 rounded p-3">{errors.submit}</p>}
            </div>
          )}
        </div>

        {!done?(
          <div className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0" style={{background:'#2b2a27',borderColor:'#4d4636'}}>
            <div>{step>1&&<Btn variant="ghost" onClick={()=>setStep(s=>s-1)} disabled={uploading||scanning}>← Back</Btn>}</div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono" style={{color:'#d0c5b0'}}>Step {step} of 4</span>
              <Btn variant={step===4?'gold':'teal'} onClick={next} disabled={uploading||scanning}>
                {uploading?<><Spinner size={12}/> Uploading…</>:scanning?<><Spinner size={12}/> Scanning…</>:step===1?'Scan & Continue →':step===4?'Upload ⊕':'Continue →'}
              </Btn>
            </div>
          </div>
        ):(
          <div className="px-6 py-4 border-t flex-shrink-0 flex justify-end" style={{background:'#2b2a27',borderColor:'#4d4636'}}>
            <Btn variant="teal" onClick={onClose}>Done ✓</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

export default UploadModal;
