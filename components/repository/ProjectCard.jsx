import { memo, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ClientField } from '../ui';
import { formatMoney } from '../../lib/format';
import RatingBreakdown from './RatingBreakdown';

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────

// Compact "last scanned" line rendered directly beneath the Full / Quick
// Scan pill. UK-style HH:mm DD/M/YY so it reads unambiguously but stays
// inside the visual width of the pill above it.
const ScanTimestamp = memo(function ScanTimestamp({ indexedAt }) {
  if (!indexedAt) return null;
  const d = new Date(indexedAt);
  if (isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const yy = String(d.getFullYear()).slice(-2);
  return (
    <span
      className="text-[10px] font-label text-on-surface-variant/70 tracking-wider leading-none tabular-nums"
      title={`Last scanned ${d.toLocaleString()}`}
    >
      {hh}:{mm} {day}/{month}/{yy}
    </span>
  );
});

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
    // Two things happen on each tick while indexing:
    //  · progress stage for the spinner copy (cheap log table read)
    //  · status check on the project itself — when it flips back to
    //    'complete' we pull the full row and push it up via onUpdated so
    //    the card's stars/AI/System ratings refresh without a full reload.
    async function tick() {
      try {
        const logR = await fetch(`/api/projects/indexing-log?project_id=${p.id}&limit=1`);
        const logD = await logR.json();
        const latest = logD.logs?.[0];
        if (latest && active) setLiveStage(latest);
      } catch {}
      try {
        const r = await fetch(`/api/projects/${p.id}`);
        if (r.ok) {
          const d = await r.json();
          const fresh = d.project;
          if (fresh && active && fresh.indexing_status !== 'indexing') {
            onUpdated?.(p.id, fresh);
            // onUpdated triggers a re-render with fresh.indexing_status
            // which will break this poll on the next pass.
          }
        }
      } catch {}
      if (active && isIndexing) setTimeout(tick, 3000);
    }
    tick();
    return () => { active = false; };
  }, [isIndexing, p.id, onUpdated]);

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
    if (r.ok) {
      // Flip local state into 'indexing' so the useEffect polls both the
      // indexing-log (progress) and /api/projects/[id] (status + fresh
      // ai_metadata). onUpdated will push the fresh row back into the list
      // when the background job completes, so User/AI/System refresh
      // automatically — no page reload required.
      onUpdated?.(p.id, { indexing_status: 'indexing' });
      onToast(`Re-analysing "${p.name}" — ratings will refresh when done`);
    } else {
      onToast('Re-analysis failed — check API keys in Settings');
    }
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
            {p.sector || 'Untagged'}
          </span>
          <h2
            title={p.name}
            className="font-headline text-base md:text-lg font-medium leading-snug group-hover:text-primary transition-colors line-clamp-3 break-words"
          >
            {p.name}
          </h2>
        </div>
        {!selectMode && (
          <div className="flex items-start gap-2 flex-shrink-0">
            {p.analysis_model === 'gpt' ? (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="px-2 py-0.5 text-[10px] font-label font-bold tracking-widest bg-[#1f3a1c] text-[#7bd07a] border border-[#7bd07a]/30"
                  title="Full scan — analysed with OpenAI (deep reasoning)"
                >
                  FULL SCAN
                </span>
                <ScanTimestamp indexedAt={p.indexed_at} />
              </div>
            ) : p.analysis_model === 'gemini' && p.indexing_status === 'complete' ? (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="px-2 py-0.5 text-[10px] font-label font-bold tracking-widest bg-secondary/10 text-secondary border border-secondary/20"
                  title="Quick scan — analysed with Gemini 2.5 Flash. Rescan with OpenAI configured for full thinking."
                >
                  QUICK SCAN
                </span>
                <ScanTimestamp indexedAt={p.indexed_at} />
              </div>
            ) : p.analysis_model === 'seed' ? (
              <span
                className="px-2 py-0.5 text-[10px] font-label font-bold tracking-widest bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                title="Sample project — hand-curated example data."
              >
                SAMPLE
              </span>
            ) : null}
            <span className={`px-2 py-0.5 text-[10px] font-label font-bold tracking-widest border ${outcomeStyle}`}>
              {outcomeLabel}
            </span>
          </div>
        )}
      </div>

      {/* Quick scan disclaimer — only for genuinely Gemini-only runs.
          Seeded sample projects (analysis_model='seed') and freshly-uploaded
          projects (null) are deliberately excluded. */}
      {!isIndexing && !isFailed && p.indexing_status === 'complete' && p.analysis_model === 'gemini' && (
        <div className="flex items-start gap-2 text-[10px] font-label uppercase tracking-widest text-secondary bg-secondary/5 px-2 py-1.5 -mt-2">
          <span className="material-symbols-outlined text-sm mt-[-2px]">info</span>
          <span>Quick scan only — rescan with OpenAI enabled for full thinking.</span>
        </div>
      )}

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
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="min-w-0">
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Client</span>
            <ClientField project={p} onSaved={(name) => onUpdated?.(p.id, { client: name })} className="truncate block font-medium max-w-full" />
          </div>
          <div className="text-right whitespace-nowrap">
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Year</span>
            <span className="text-sm">{p.date_submitted?.slice(0, 4) || '—'}</span>
          </div>
          <div>
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Value</span>
            <span className="text-sm text-primary font-bold">{formatMoney(p.contract_value, p.currency)}</span>
          </div>
          <div className="text-right">
            <span className="font-label text-[10px] text-outline block mb-1 uppercase">Rating</span>
            <RatingBreakdown project={p} />
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

export default ProjectCard;
