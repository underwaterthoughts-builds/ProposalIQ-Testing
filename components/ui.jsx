// Shared UI primitives

export function Btn({ children, onClick, variant = 'ghost', size = 'md', disabled, className = '', type = 'button' }) {
  const base = 'inline-flex items-center gap-1.5 rounded-md font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-1.5 text-[12.5px]', lg: 'px-5 py-2 text-sm' };
  const variants = {
    ghost: 'border text-muted hover:bg-cream hover:text-ink',
    dark: 'bg-ink text-paper hover:bg-[#1f1e1a]',
    gold: 'text-white hover:opacity-90',
    teal: 'text-white hover:opacity-90',
    danger: 'text-rust hover:bg-rust/10 border border-rust/20',
  };
  const colors = {
    ghost: 'border-[#ddd5c4]',
    dark: '',
    gold: 'bg-[#b8962e]',
    teal: 'bg-[#1e4a52]',
    danger: '',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${colors[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Badge({ children, color = 'cream' }) {
  const colors = {
    cream: 'bg-cream text-muted',
    teal: 'bg-teal/10 text-teal',
    gold: 'bg-amber-100 text-amber-700',
    sage: 'bg-green-100 text-green-700',
    rust: 'bg-red-100 text-red-700',
    won: 'bg-green-100 text-green-700',
    lost: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    active: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono ${colors[color] || colors.cream}`}>{children}</span>;
}

export function Stars({ rating, size = 'sm' }) {
  const sz = size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <span className={`inline-flex gap-0.5 ${sz}`}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? '#b8962e' : '#ddd5c4' }}>★</span>
      ))}
    </span>
  );
}

export function ScoreRing({ score, size = 44 }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#2d6b78' : score >= 60 ? '#b8962e' : '#b04030';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 46 46" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="23" cy="23" r={r} fill="none" stroke="#f0ebe0" strokeWidth="4" />
        <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-content-center font-mono text-[11px] font-medium"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
        {score}%
      </div>
    </div>
  );
}

export function FileChip({ type }) {
  const styles = {
    proposal: 'bg-teal/10 text-teal border-teal/20',
    rfp: 'bg-red-50 text-red-600 border-red-200',
    budget: 'bg-amber-50 text-amber-700 border-amber-200',
    additional: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  const labels = { proposal: 'Proposal', rfp: 'RFP', budget: 'Budget', additional: 'Extra' };
  return (
    <span className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border ${styles[type] || styles.additional}`}>
      {labels[type] || type}
    </span>
  );
}

export function Input({ label, required, error, hint, ...props }) {
  return (
    <div>
      {label && <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: '#6b6456' }}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>}
      <input {...props} className={`w-full px-3 py-2 border rounded-md text-sm outline-none transition-colors bg-paper focus:bg-white ${error ? 'border-red-400' : 'border-[#ddd5c4] focus:border-[#1e4a52]'} ${props.className || ''}`} />
      {hint && !error && <p className="text-[11px] mt-1" style={{ color: '#6b6456' }}>{hint}</p>}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, required, children, ...props }) {
  return (
    <div>
      {label && <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: '#6b6456' }}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>}
      <select {...props} className={`w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-[#1e4a52] transition-colors ${props.className || ''}`}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, required, ...props }) {
  return (
    <div>
      {label && <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: '#6b6456' }}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>}
      <textarea {...props} className={`w-full px-3 py-2 border border-[#ddd5c4] rounded-md text-sm outline-none bg-paper focus:bg-white focus:border-[#1e4a52] transition-colors resize-y ${props.className || ''}`} />
    </div>
  );
}

export function Card({ children, className = '', onClick }) {
  return (
    <div onClick={onClick} className={`bg-white border rounded-lg overflow-hidden transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''} ${className}`}
      style={{ borderColor: '#ddd5c4' }}>
      {children}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="spin inline-block rounded-full border-2 border-current border-t-transparent"
    style={{ width: size, height: size, flexShrink: 0 }} />;
}

export function OutcomeLabel({ outcome }) {
  const map = { won: ['Won', 'won'], lost: ['Lost', 'lost'], pending: ['Pending', 'pending'], active: ['Active', 'active'], withdrawn: ['Withdrawn', 'cream'] };
  const [label, color] = map[outcome] || [outcome, 'cream'];
  return <Badge color={color}>{label}</Badge>;
}

export function SectionLabel({ children }) {
  return <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: '#6b6456' }}>{children}</div>;
}

export function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-8">
      <div className="flex-1 h-px" style={{ background: '#ddd5c4' }} />
      {label && <span className="text-[10px] font-mono uppercase tracking-widest px-3 py-0.5 rounded-full border" style={{ color: '#6b6456', borderColor: '#ddd5c4' }}>{label}</span>}
      <div className="flex-1 h-px" style={{ background: '#ddd5c4' }} />
    </div>
  );
}

export function ProgressBar({ value, color = '#1e4a52', height = 5 }) {
  return (
    <div className="rounded-full overflow-hidden" style={{ height, background: '#f0ebe0' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </div>
  );
}

export function Toast({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl animate-fadeIn text-sm"
      style={{ background: '#0f0e0c', color: '#faf7f2', maxWidth: 320 }}>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none">✕</button>
    </div>
  );
}
