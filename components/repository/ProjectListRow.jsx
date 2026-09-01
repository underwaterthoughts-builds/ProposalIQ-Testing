import { memo } from 'react';
import { useRouter } from 'next/router';
import { formatMoney } from '../../lib/format';
import { computeSystemRating } from '../../lib/rating';

// ─── PROJECT LIST ROW ─────────────────────────────────────────────────────────
// Compact single-line row for list view. Intentionally minimal — no
// RatingBreakdown, no taxonomy chips, no file chips, no live-index poll.
// Renders orders of magnitude faster than the full card when the user has
// hundreds of projects and just wants to scan and click through.
const ProjectListRow = memo(function ProjectListRow({ project: p }) {
  const router = useRouter();
  const sys = computeSystemRating(p).system_pct;
  const outcome = (p.outcome || 'pending').toLowerCase();
  const outcomeDot =
    outcome === 'won' ? 'bg-[#7bd07a]' :
    outcome === 'lost' ? 'bg-error' :
    outcome === 'withdrawn' ? 'bg-outline/40' :
    'bg-primary';
  const date = p.date_submitted?.slice(0, 4) || '';

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
  }

  return (
    <button
      type="button"
      onClick={() => router.push(`/repository/${p.id}`)}
      className="w-full grid items-center gap-3 px-4 py-2.5 bg-surface-container-low hover:bg-surface-container-high border-b border-outline-variant/10 text-left transition-colors"
      style={{ gridTemplateColumns: '10px minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1fr) 70px 70px 60px 70px' }}
    >
      <span className={`w-2 h-2 rounded-full ${outcomeDot}`} aria-label={outcome} />
      <span className="font-medium text-sm text-on-surface truncate">{p.name}</span>
      <span className="text-xs text-on-surface-variant truncate">{p.client || '—'}</span>
      <span className="text-[11px] text-on-surface-variant truncate font-label uppercase tracking-wider">{p.sector || '—'}</span>
      <span className="text-xs text-primary font-medium tabular-nums text-right truncate">{formatMoney(p.contract_value, p.currency)}</span>
      <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-wider text-center">{outcome}</span>
      <span className={`text-xs tabular-nums text-right ${sys !== null ? (sys >= 70 ? 'text-primary font-bold' : 'text-on-surface-variant') : 'text-outline/40'}`}>
        {sys !== null ? `${sys}%` : '—'}
      </span>
      <span className="text-[10px] font-label text-outline tabular-nums text-right">{fmtDate(p.indexed_at) || date}</span>
    </button>
  );
});

export default ProjectListRow;
