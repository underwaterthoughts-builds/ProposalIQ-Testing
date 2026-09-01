import { memo } from 'react';
import Link from 'next/link';

const MatchCard = memo(function MatchCard({ match: m, expanded, onToggle, onSuppress, onToast, onLog }) {
  const meta = m.ai_metadata || {};
  const wq = meta.writing_quality;

  // Score → SVG arc maths
  const score = Math.max(0, Math.min(100, m.match_score || 0));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - score / 100);

  // Label for match quality — maps to Stitch "Optimal/Partial"
  const labelText =
    m.match_label === 'Strong' ? 'OPTIMAL MATCH' :
    m.match_label === 'Good'   ? 'STRONG MATCH' :
    m.match_label === 'Partial'? 'PARTIAL MATCH' :
    'RELATED';
  const labelIsPrimary = m.match_label === 'Strong' || m.match_label === 'Good';
  const arcColorClass = labelIsPrimary ? 'text-primary' : 'text-secondary';
  const labelColorClass = labelIsPrimary ? 'text-primary' : 'text-secondary';

  // Match summary — prefer AI recommended_use, fall back to went_well or client blurb
  const summary = m.match_explanation?.recommended_use || m.went_well || meta.summary || '';

  // Time-ago label for "6 months ago" style
  const timeAgo = (() => {
    if (!m.date_submitted) return '';
    const d = new Date(m.date_submitted);
    if (Number.isNaN(d.getTime())) return '';
    const months = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months < 1) return 'this month';
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.round(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  })();

  return (
    <div className="bg-surface-container group p-6 rounded-lg transition-all hover:bg-surface-container-high relative overflow-hidden cursor-pointer"
      onClick={() => { onToggle(); if (!expanded && onLog) onLog('match_expanded', { target_type: 'project', target_id: m.id }); }}
    >
      {/* Score ring — top right */}
      <div className="absolute top-0 right-0 p-4">
        <div className="relative w-16 h-16 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
            <circle className="text-outline-variant/20" cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4" />
            <circle
              className={arcColorClass}
              cx="32" cy="32" r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-sm font-label font-bold text-on-surface">{score}</span>
        </div>
      </div>

      <div className="pr-20">
        <span className={`text-[10px] font-label font-bold tracking-[0.2em] ${labelColorClass} uppercase mb-2 block`}>
          {labelText}
        </span>
        <h3 className="text-lg md:text-xl font-headline font-bold text-on-surface leading-tight mb-3">
          {m.name}
        </h3>
        {summary && (
          <p className="text-on-surface-variant text-sm leading-relaxed mb-4 line-clamp-2">
            {summary}
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap text-[10px] font-label">
          {m.outcome && (
            <span
              className="px-2 py-0.5 uppercase border"
              style={{
                background: m.outcome === 'won' ? 'rgba(79,209,197,.1)' : m.outcome === 'lost' ? 'rgba(176,64,48,.1)' : 'rgba(232,195,87,.1)',
                color: m.outcome === 'won' ? '#4fd1c5' : m.outcome === 'lost' ? '#ffb4ab' : '#e8c357',
                borderColor: m.outcome === 'won' ? 'rgba(79,209,197,.2)' : m.outcome === 'lost' ? 'rgba(176,64,48,.2)' : 'rgba(232,195,87,.2)',
              }}
            >
              {m.outcome}
            </span>
          )}
          {(m.won_count || 0) > 0 && (
            <span
              className="px-2 py-0.5 uppercase border"
              style={{
                background: 'rgba(79,209,197,.1)',
                color: '#4fd1c5',
                borderColor: 'rgba(79,209,197,.2)',
              }}
              title="A bid that used this reference was marked won"
            >
              ✓ You won with this{m.won_count > 1 ? ` ×${m.won_count}` : ''}
            </span>
          )}
          {m.sanity_warning && (
            <span className="px-2 py-0.5 uppercase border bg-secondary/10 text-secondary border-secondary/20">
              Adjustment needed
            </span>
          )}
          {(m.used_count || 0) > 0 && (
            <span className="text-on-surface-variant/60" title="Times this reference was pulled into past bids">
              Used in {m.used_count} bid{m.used_count === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-on-surface-variant/60 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">history</span>
            {timeAgo || 'unknown'}
          </span>
          {m.client && <span className="text-on-surface-variant/60">{m.client}</span>}
        </div>

        {(m.match_reasons || []).slice(0, 3).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(m.match_reasons || []).slice(0, 3).map(t => (
              <span key={t} className="text-[10px] font-label px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Expanded content — progressive disclosure */}
        {expanded && (
          <div className="mt-6 space-y-3 animate-fadeIn border-t border-outline-variant/10 pt-4">
            {m.llm_reason && (
              <div className="rounded p-3 bg-primary-container/10 border border-primary/20">
                <div className="text-[10px] font-label uppercase tracking-widest mb-1 text-primary">Why AI selected this</div>
                <p className="text-xs leading-relaxed text-on-surface-variant">{m.llm_reason}</p>
              </div>
            )}
            {m.match_explanation && (
              <div className="rounded p-3 bg-surface-container-highest space-y-2">
                <div>
                  <div className="text-[10px] font-label uppercase tracking-widest mb-1 text-on-surface-variant">Why matched</div>
                  <p className="text-xs leading-relaxed text-on-surface">{m.match_explanation.recommended_use}</p>
                </div>
                {m.match_explanation.capability_context?.statement && (
                  <div className={`flex items-start gap-2 text-xs leading-relaxed pt-2 border-t border-outline-variant/10 ${
                    m.match_explanation.capability_context.status === 'within_core' ? 'text-[#7bd07a]' :
                    m.match_explanation.capability_context.status === 'within_offered' ? 'text-on-surface' :
                    m.match_explanation.capability_context.status === 'adjacent' ? 'text-primary' :
                    m.match_explanation.capability_context.status === 'outside_stated' ? 'text-on-surface-variant' :
                    'text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined text-[14px] mt-0.5">{
                      m.match_explanation.capability_context.status === 'within_core' ? 'verified' :
                      m.match_explanation.capability_context.status === 'within_offered' ? 'check_circle' :
                      m.match_explanation.capability_context.status === 'adjacent' ? 'north_east' :
                      m.match_explanation.capability_context.status === 'outside_stated' ? 'info' :
                      'info'
                    }</span>
                    <span>{m.match_explanation.capability_context.statement}</span>
                  </div>
                )}
              </div>
            )}
            {m.style_classification && (
              <div className="text-xs text-on-surface-variant">
                <span className="font-label uppercase tracking-widest text-[10px] mr-2">Style</span>
                <span className="text-on-surface">{m.style_classification.primary_style}</span>
                <span className="mx-2">·</span>
                <span>{m.style_classification.tone}</span>
              </div>
            )}
            {m.lh_status === 'complete' && m.lh_what_delivered && (
              <div className="rounded p-3 bg-primary/5 border border-primary/20">
                <div className="text-[10px] font-label uppercase tracking-widest mb-1 text-primary">What was delivered</div>
                <p className="text-xs leading-relaxed text-on-surface-variant">{m.lh_what_delivered}</p>
              </div>
            )}
            {/* Card actions */}
            <div className="flex items-center gap-3 flex-wrap pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(`Reference: "${m.name}" (${m.outcome || ''}, ${m.date_submitted?.slice(0, 4) || ''}) — ${m.went_well || m.client || ''}`);
                  onToast('Reference copied');
                  if (onLog) onLog('reference_copied', { target_type: 'project', target_id: m.id });
                }}
                className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                Copy Reference
              </button>
              <a
                href={`/api/projects/${m.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); if (onLog) onLog('match_downloaded', { target_type: 'project', target_id: m.id }); }}
                className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                Download
              </a>
              <Link
                href={`/repository/${m.id}`}
                onClick={(e) => { e.stopPropagation(); if (onLog) onLog('match_opened', { target_type: 'project', target_id: m.id }); }}
                className="ml-auto text-[10px] font-label uppercase tracking-widest text-primary hover:underline"
              >
                Open →
              </Link>
              <button
                onClick={(e) => { e.stopPropagation(); onSuppress(); }}
                className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50 hover:text-error transition-colors"
                title="Exclude from this scan"
              >
                Exclude
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default MatchCard;
