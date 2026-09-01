import { memo } from 'react';
import { StarsPct } from '../ui';
import { computeSystemRating } from '../../lib/rating';

// Two labelled rows — User / System — each shown as 5 stars with
// fractional fill (derived from the underlying percentage) plus the raw
// percentage on the right. The AI row was removed (Wave 6 Phase 3 UX
// cleanup) because it confused the mental model; the AI input is
// already baked into System.
const RatingBreakdown = memo(function RatingBreakdown({ project }) {
  const sr = computeSystemRating(project);
  if (sr.system_pct === null) return null;
  const rows = [
    { label: 'User',   pct: sr.user_pct },
    { label: 'System', pct: sr.system_pct },
  ];
  return (
    <div className="mt-1.5 space-y-0.5 text-[10px] font-label">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-end gap-2">
          <span className="text-outline uppercase tracking-wider w-12 text-left">{r.label}</span>
          <span className="flex items-center gap-2">
            <StarsPct pct={r.pct ?? 0} />
            <span className={`text-[10px] tabular-nums w-8 text-right ${r.pct === null ? 'text-outline/40' : r.label === 'System' ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
              {r.pct === null ? '—' : `${r.pct}%`}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
});

export default RatingBreakdown;
