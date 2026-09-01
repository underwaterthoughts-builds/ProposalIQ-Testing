import { memo } from 'react';

// ─── STABLE FIELD COMPONENTS (module-level — never remount on re-render) ─────

const AiBadge = memo(function AiBadge({ show }) {
  if (!show) return null;
  return <span className="ml-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded align-middle" style={{ background:'rgba(30,74,82,.12)',color:'#7fb4bc' }}>AI ✦</span>;
});

const FieldInput = memo(function FieldInput({ label, required, isAi, error, value, onChange, type='text', placeholder, inputMode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#d0c5b0'}}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}<AiBadge show={isAi} />
      </label>
      <input type={type} inputMode={inputMode} value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-md text-sm outline-none transition-colors bg-surface-container-low focus:bg-surface-container ${error?'border-red-400':isAi?'border-teal/40 bg-teal-pale/20':'border-[#ddd5c4] focus:border-[#1e4a52]'}`} />
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
});

const FieldSelect = memo(function FieldSelect({ label, required, isAi, value, onChange, children }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#d0c5b0'}}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}<AiBadge show={isAi} />
      </label>
      <select value={value} onChange={onChange}
        className={`w-full px-3 py-2 border rounded-md text-sm outline-none bg-surface-container-low focus:bg-surface-container focus:border-[#1e4a52] transition-colors ${isAi?'border-teal/40 bg-teal-pale/20':'border-[#ddd5c4]'}`}>
        {children}
      </select>
    </div>
  );
});

const FieldTextarea = memo(function FieldTextarea({ label, value, onChange, rows=2, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{color:'#d0c5b0'}}>{label}</label>
      <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} style={{resize:'vertical'}}
        className="w-full px-3 py-2 border border-[#4d4636] bg-[#211f1d] text-on-surface rounded-md text-sm outline-none bg-surface-container-low focus:bg-surface-container focus:border-[#1e4a52] transition-colors" />
    </div>
  );
});

const AddNewInline = memo(function AddNewInline({ field, label, placeholder, showParent, active, onActivate, onSave, onCancel, value, onValueChange, parentValue, onParentChange, rootFolders, saving }) {
  if (!active) return (
    <button
      type="button"
      onClick={onActivate}
      className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border transition-colors hover:bg-[rgba(127,180,188,0.12)]"
      style={{ color: '#7fb4bc', borderColor: '#7fb4bc' }}
    >
      <span className="text-sm leading-none">+</span>
      <span>Add new {label || field}</span>
    </button>
  );
  return (
    <div className="mt-1.5 rounded-md border p-2.5 space-y-2" style={{borderColor:'#7fb4bc',background:'rgba(30,107,120,.15)'}}>
      <div className="text-[10px] font-mono uppercase tracking-wider" style={{color:'#7fb4bc'}}>New {label||field}</div>
      {showParent && (
        <select value={parentValue} onChange={e=>onParentChange(e.target.value)} className="w-full px-2 py-1.5 border rounded text-xs outline-none bg-surface-container" style={{borderColor:'#4d4636'}}>
          <option value="">Top level (no parent)</option>
          {rootFolders.map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <input autoFocus value={value} onChange={e=>onValueChange(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSave();}if(e.key==='Escape')onCancel();}}
          placeholder={placeholder} className="flex-1 px-2.5 py-1.5 border rounded text-xs outline-none bg-surface-container" style={{borderColor:'#4d4636'}} />
        <button type="button" onClick={onSave} disabled={saving||!value.trim()} className="px-3 py-1.5 rounded text-xs text-white disabled:opacity-50" style={{background:'#1e4a52'}}>{saving?'…':'Add'}</button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 rounded text-xs" style={{color:'#d0c5b0'}}>Cancel</button>
      </div>
    </div>
  );
});

export { FieldInput, FieldSelect, FieldTextarea, AddNewInline };
