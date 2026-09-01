import { useState, memo } from 'react';

// Compact footer showing how many silent QA corrections were applied to
// this draft before the user saw it. Expandable to show the change log.
// Quiet when the count is 0.
const QaAdjustmentsFooter = memo(function QaAdjustmentsFooter({ adjustments, count }) {
  const [open, setOpen] = useState(false);
  const n = typeof count === 'number' ? count : (Array.isArray(adjustments) ? adjustments.length : 0);
  if (!n || n === 0) return null;
  const list = Array.isArray(adjustments) ? adjustments : [];
  return (
    <div className="mb-3 text-[11px]">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        title="Pre-delivery QA applied these adjustments before you saw the draft"
      >
        <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
        <span>{n} QA adjustment{n === 1 ? '' : 's'} applied</span>
        <span className="material-symbols-outlined text-[14px] opacity-70">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && list.length > 0 && (
        <ul className="mt-2 pl-4 space-y-1 text-on-surface-variant">
          {list.map((a, i) => (
            <li key={i} className="leading-relaxed">
              <span className="font-label text-[9px] uppercase tracking-widest text-outline mr-2">{a.type || 'fix'}</span>
              {a.summary || ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default QaAdjustmentsFooter;
