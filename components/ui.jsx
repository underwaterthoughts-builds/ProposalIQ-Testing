// Shared UI primitives — Sovereign Editorial dark theme

import React from 'react';

export function Btn({ children, onClick, variant = 'ghost', size = 'md', disabled, className = '', type = 'button' }) {
  const base = 'inline-flex items-center gap-1.5 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-label uppercase tracking-widest';
  const sizes = { sm: 'px-2.5 py-1 text-[10px]', md: 'px-3.5 py-1.5 text-[11px]', lg: 'px-5 py-2 text-xs' };
  const variants = {
    ghost: 'border border-outline/30 text-on-surface-variant hover:text-on-surface hover:border-primary/50',
    dark: 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
    gold: 'bg-primary text-on-primary hover:brightness-110 font-bold',
    teal: 'bg-primary text-on-primary hover:brightness-110 font-bold',
    danger: 'text-error hover:bg-error/10 border border-error/30',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Badge({ children, color = 'cream' }) {
  const colors = {
    cream: 'bg-surface-container-high text-on-surface-variant',
    teal: 'bg-primary/10 text-primary',
    gold: 'bg-primary/10 text-primary',
    sage: 'bg-primary/10 text-primary',
    rust: 'bg-error/10 text-error',
    won: 'bg-primary/10 text-primary',
    lost: 'bg-error/10 text-error',
    pending: 'bg-secondary/10 text-secondary',
    active: 'bg-tertiary-container/20 text-tertiary-container',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-label uppercase tracking-widest ${colors[color] || colors.cream}`}>{children}</span>;
}

export function Stars({ rating, size = 'sm' }) {
  const sz = size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <span className={`inline-flex gap-0.5 ${sz}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= rating ? 'text-primary' : 'text-outline-variant/40'}>★</span>
      ))}
    </span>
  );
}

// Inline-editable client field. Shows the client name, or an "Add client"
// affordance when the value is empty or the upload-time placeholder
// "Unknown". Click to edit; Enter/blur saves via PATCH; Escape cancels.
// Stops event propagation so parent onClick/Link handlers don't fire while
// editing — the card itself is often a navigable element.
export function ClientField({ project, onSaved, size = 'sm', labelClassName = '', className = '' }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(project.client || '');
  const [saving, setSaving] = React.useState(false);
  const isUnknown = !project.client || project.client === 'Unknown';
  const sz = size === 'sm' ? 'text-sm' : 'text-base';

  React.useEffect(() => { setValue(project.client || ''); }, [project.client, project.id]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === project.client) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: trimmed }),
      });
      if (res.ok && onSaved) onSaved(trimmed);
    } catch {}
    setSaving(false);
    setEditing(false);
  }

  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };

  if (editing) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`} onClick={stop}>
        <input
          autoFocus
          value={value}
          disabled={saving}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setEditing(false); setValue(project.client || ''); }
          }}
          onBlur={save}
          onClick={stop}
          className={`bg-surface-container border-b border-primary px-1 py-0.5 outline-none text-on-surface ${sz}`}
          placeholder="Client name…"
        />
      </span>
    );
  }

  if (isUnknown) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setEditing(true); }}
        className={`${sz} text-primary hover:text-on-surface inline-flex items-center gap-1 ${labelClassName}`}
        title="Click to add client name"
      >
        <span className="material-symbols-outlined text-[14px]">edit</span>
        Add client
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { stop(e); setEditing(true); }}
      className={`${sz} text-on-surface hover:text-primary transition-colors ${className}`}
      title="Click to edit client"
    >
      {project.client}
    </button>
  );
}

// Renders a 0–100 percentage as 5 stars with fractional fill. Overlays a
// width-clipped row of filled stars on top of an identical row of outline
// stars so the alignment is pixel-stable regardless of font metrics.
export function StarsPct({ pct, size = 'sm' }) {
  const sz = size === 'sm' ? 'text-sm' : 'text-base';
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <span className={`relative inline-block whitespace-nowrap ${sz}`} style={{ lineHeight: 1 }}>
      <span className="inline-flex gap-0.5 text-outline-variant/40">
        {[1, 2, 3, 4, 5].map(i => <span key={i}>★</span>)}
      </span>
      <span
        className="inline-flex gap-0.5 text-primary absolute top-0 left-0 overflow-hidden whitespace-nowrap"
        style={{ width: `${clamped}%` }}
        aria-hidden="true"
      >
        {[1, 2, 3, 4, 5].map(i => <span key={i}>★</span>)}
      </span>
    </span>
  );
}

export function ScoreRing({ score, size = 44 }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const colorClass = score >= 80 ? 'text-primary' : score >= 60 ? 'text-secondary' : 'text-error';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 46 46" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="23" cy="23" r={r} fill="none" className="text-outline-variant/20" stroke="currentColor" strokeWidth="4" />
        <circle cx="23" cy="23" r={r} fill="none" className={colorClass} stroke="currentColor" strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-label text-[11px] font-bold ${colorClass}`}>
        {score}%
      </div>
    </div>
  );
}

export function FileChip({ type }) {
  const styles = {
    proposal: 'bg-primary/10 text-primary',
    rfp: 'bg-tertiary-container/20 text-tertiary-container',
    budget: 'bg-secondary/10 text-secondary',
    additional: 'bg-surface-container-high text-on-surface-variant',
  };
  const labels = { proposal: 'Proposal', rfp: 'RFP', budget: 'Budget', additional: 'Extra' };
  return (
    <span className={`inline-flex items-center text-[9px] font-label uppercase tracking-widest px-1.5 py-0.5 ${styles[type] || styles.additional}`}>
      {labels[type] || type}
    </span>
  );
}

// Minimalist dark input — bottom border only, primary focus transform.
export function Input({ label, required, error, hint, ...props }) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] font-label uppercase tracking-widest mb-2 text-on-surface-variant">
          {label} {required && <span className="text-error">*</span>}
        </label>
      )}
      <input
        {...props}
        className={`w-full bg-transparent border-0 border-b py-2 px-0 text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none transition-colors ${
          error ? 'border-error' : 'border-outline-variant/30 focus:border-primary'
        } ${props.className || ''}`}
      />
      {hint && !error && <p className="text-[11px] mt-1 text-on-surface-variant/70">{hint}</p>}
      {error && <p className="text-[11px] text-error mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, required, children, ...props }) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] font-label uppercase tracking-widest mb-2 text-on-surface-variant">
          {label} {required && <span className="text-error">*</span>}
        </label>
      )}
      <select
        {...props}
        className={`w-full bg-transparent border-0 border-b border-outline-variant/30 py-2 px-0 text-on-surface focus:ring-0 focus:outline-none focus:border-primary transition-colors appearance-none ${props.className || ''}`}
      >
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, required, ...props }) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] font-label uppercase tracking-widest mb-2 text-on-surface-variant">
          {label} {required && <span className="text-error">*</span>}
        </label>
      )}
      <textarea
        {...props}
        className={`w-full bg-surface-container-lowest border border-outline-variant/20 p-3 text-sm text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none focus:border-primary transition-colors resize-y ${props.className || ''}`}
      />
    </div>
  );
}

export function Card({ children, className = '', onClick, style }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-container-low transition-all ${onClick ? 'cursor-pointer hover:bg-surface-container' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return (
    <span
      className="spin inline-block rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}

export function OutcomeLabel({ outcome }) {
  const map = { won: ['Won', 'won'], lost: ['Lost', 'lost'], pending: ['Pending', 'pending'], active: ['Active', 'active'], withdrawn: ['Withdrawn', 'cream'] };
  const [label, color] = map[outcome] || [outcome, 'cream'];
  return <Badge color={color}>{label}</Badge>;
}

export function SectionLabel({ children }) {
  return <div className="text-[9px] font-label uppercase tracking-widest mb-1.5 text-on-surface-variant">{children}</div>;
}

export function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-8">
      <div className="flex-1 h-px bg-outline-variant/20" />
      {label && (
        <span className="text-[10px] font-label uppercase tracking-widest px-3 py-0.5 border border-outline-variant/30 text-on-surface-variant">
          {label}
        </span>
      )}
      <div className="flex-1 h-px bg-outline-variant/20" />
    </div>
  );
}

export function ProgressBar({ value, color, height = 4 }) {
  return (
    <div className="overflow-hidden bg-surface-container-lowest" style={{ height }}>
      <div
        className="h-full transition-all duration-500"
        style={{
          width: `${Math.min(value, 100)}%`,
          background: color || 'var(--tw-color-primary, #e8c357)',
        }}
      />
    </div>
  );
}

export function Toast({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 shadow-2xl animate-fadeIn text-sm bg-surface-container-high text-on-surface border-l-2 border-primary" style={{ maxWidth: 320 }}>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none">✕</button>
    </div>
  );
}
