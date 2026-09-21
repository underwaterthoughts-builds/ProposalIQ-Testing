import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from './ui';

const STATUS_BADGE = {
  addressed: { bg: '#1f4e2a', fg: '#a8e0b3', label: 'Addressed' },
  partial:   { bg: '#5b4419', fg: '#e4c366', label: 'Partial' },
  missing:   { bg: '#5a1e1a', fg: '#e8a59f', label: 'Missing' },
  unanalyzed:{ bg: '#3a3a3a', fg: '#c8c8c8', label: 'Unanalyzed' },
  asserted:  { bg: '#173f46', fg: '#7fb4bc', label: 'Covered — you have this' },
};

// Effective status: a user assertion ("we have this") counts as covered in
// every count, filter, and score, while the AI's original grading is kept
// visible underneath.
function effStatus(r) {
  return r.user_override === 'covered' ? 'addressed' : r.status;
}

function StatusBadge({ status }) {
  const p = STATUS_BADGE[status] || STATUS_BADGE.unanalyzed;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest"
      style={{ background: p.bg, color: p.fg }}>
      {p.label}
    </span>
  );
}

function StrengthBar({ score = 0 }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const colour = pct >= 70 ? '#7bd07a' : pct >= 50 ? '#e4c366' : '#d0c5b0';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1 bg-surface-container-lowest overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-on-surface-variant w-8 text-right">{pct}</span>
    </div>
  );
}

function ScoreChip({ label, score }) {
  if (score == null) return null;
  const colour = score >= 70 ? '#7bd07a' : score >= 50 ? '#e4c366' : '#d0c5b0';
  return (
    <div className="flex flex-col gap-1 min-w-[100px]">
      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</span>
      <span className="font-bold text-2xl tabular-nums" style={{ color: colour }}>
        {score}<span className="text-sm font-normal opacity-60">/100</span>
      </span>
    </div>
  );
}

export default function ProposalFitTab({ scanId }) {
  const [data, setData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null); // 'addressed' | 'partial' | 'missing' | 'mandatory_missing'
  const [overriding, setOverriding] = useState(null);     // requirement_index in flight
  const fileRef = useRef();
  const matrixRef = useRef();

  // "We have this" / undo — asserts a capability the response text doesn't
  // evidence; the fit score regrades immediately server-side.
  async function setCovered(r, covered) {
    setOverriding(r.requirement_index);
    try {
      const resp = await fetch(`/api/rfp/${scanId}/coverage-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement_index: r.requirement_index, covered }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${resp.status})`);
      }
      await load();
    } catch (e) { setError(e.message); }
    setOverriding(null);
  }

  function filterAndScroll(f) {
    setStatusFilter(cur => (cur === f ? null : f));
    setTimeout(() => matrixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/rfp/${scanId}/proposal-fit`);
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const d = await r.json();
      setData(d);
    } catch (e) {
      console.error('[ProposalFit] load failed:', e.message);
      setError(e.message);
    }
  }, [scanId]);

  useEffect(() => { load(); }, [load]);

  // Poll while analysis is running
  useEffect(() => {
    if (!data) return;
    if (data.status === 'pending' || data.status === 'processing') {
      const t = setTimeout(load, 3000);
      return () => clearTimeout(t);
    }
  }, [data, load]);

  // Accepts one or many files — a response is often split into commercial +
  // technical (+ annexes). New uploads APPEND to any docs already attached.
  async function uploadFiles(fileList) {
    const chosen = Array.from(fileList || []).slice(0, 6);
    if (!chosen.length) return;
    for (const file of chosen) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext)) {
        setError(`"${file.name}": unsupported type — use PDF, DOCX, DOC, TXT, or MD`); return;
      }
      if (file.size > 50 * 1024 * 1024) { setError(`"${file.name}" too large — maximum 50MB`); return; }
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      chosen.forEach(f => fd.append('proposal', f));
      const r = await fetch(`/api/rfp/${scanId}/proposal`, { method: 'POST', body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${r.status})`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
    setUploading(false);
  }

  async function removeDoc(docId, name) {
    if (!docId) { return removeProposal(); }
    if (!confirm(`Remove "${name}" from this response? The fit analysis will re-run on the remaining documents.`)) return;
    try {
      await fetch(`/api/rfp/${scanId}/proposal?doc=${encodeURIComponent(docId)}`, { method: 'DELETE' });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function removeProposal() {
    if (!confirm('Remove ALL response documents and the analysis? This cannot be undone.')) return;
    try {
      await fetch(`/api/rfp/${scanId}/proposal`, { method: 'DELETE' });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function rerun() {
    try {
      await fetch(`/api/rfp/${scanId}/proposal-fit`, { method: 'POST' });
      await load();
    } catch (e) { setError(e.message); }
  }

  if (!data) {
    return <Card className="p-6 text-center"><p className="text-sm text-on-surface-variant">Loading…</p></Card>;
  }

  // ── Empty state — no proposal attached ─────────────────────────────────
  if (!data.proposal_attached) {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-6 text-primary mx-auto">
            <span className="material-symbols-outlined text-3xl">upload_file</span>
          </div>
          <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">Score your draft</h3>
          <p className="font-body text-on-surface-variant mb-6 text-sm leading-relaxed">
            Upload your proposal response to this RFP and we'll evaluate it against every requirement,
            evaluation criterion, and the methodology / evidence bar. Split across several files
            (commercial, technical, annexes)? Select them all — they're analysed as one response.
          </p>
          <input
            type="file"
            ref={fileRef}
            className="hidden"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md"
            onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current.click()}
            disabled={uploading}
            className="bg-primary text-on-primary font-bold px-8 py-3 rounded-md hover:brightness-110 transition-all active:scale-95 disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : 'Upload proposal document(s)'}
          </button>
          <p className="mt-3 text-[11px] font-mono uppercase tracking-widest text-on-surface-variant/60">PDF · DOCX · DOC · TXT · MD · max 50MB each · up to 6 documents</p>
          {error && <p className="mt-4 text-xs text-error">{error}</p>}
        </div>
      </Card>
    );
  }

  // ── Processing state ──────────────────────────────────────────────────
  if (data.status === 'pending' || data.status === 'processing') {
    return (
      <Card className="p-8 text-center">
        <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-6 text-primary mx-auto">
          <span className="material-symbols-outlined text-3xl animate-pulse">data_exploration</span>
        </div>
        <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">Analysing your proposal…</h3>
        <p className="text-sm text-on-surface-variant mb-2">
          {data.progress ? `Progress: ${data.progress}` : 'Reading the proposal and matching against the RFP.'}
        </p>
        <p className="text-[11px] font-mono uppercase tracking-widest text-on-surface-variant/60">
          {(data.docs || []).map(d => d.original_name).join(' · ') || data.proposal_original_name}
        </p>
      </Card>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (data.status === 'error') {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-error text-2xl">error</span>
          <div className="flex-1">
            <h3 className="font-headline text-xl font-bold text-on-surface mb-2">Analysis failed</h3>
            <p className="text-sm text-on-surface-variant mb-4">{data.progress || 'Unknown error during analysis.'}</p>
            <div className="flex gap-3">
              <button onClick={rerun} className="bg-primary text-on-primary px-4 py-2 rounded text-xs font-bold">Re-run analysis</button>
              <button onClick={removeProposal} className="border border-outline-variant px-4 py-2 rounded text-xs">Remove proposal</button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // ── Complete state — full report ──────────────────────────────────────
  const meta = data.metadata || {};
  const scores = meta._scores || {};
  const overall = data.overall || scores.overall || 0;
  const overallColour = overall >= 70 ? '#7bd07a' : overall >= 50 ? '#e4c366' : '#d0c5b0';
  const coverage = data.coverage || [];
  const partialAssessment = meta._partial_assessment;
  const dimsUsed = Array.isArray(meta._dimensions_used) ? meta._dimensions_used : [];
  const missingDims = meta._missing_dimensions || {};

  const addressed = coverage.filter(r => effStatus(r) === 'addressed').length;
  const partial   = coverage.filter(r => effStatus(r) === 'partial').length;
  const missing   = coverage.filter(r => effStatus(r) === 'missing').length;
  const mandatoriesMissing = coverage.filter(r => effStatus(r) === 'missing' && r.requirement_mandatory).length;

  const gaps = coverage
    .filter(r => effStatus(r) === 'missing' || effStatus(r) === 'partial')
    .sort((a, b) => (b.requirement_mandatory ? 1 : 0) - (a.requirement_mandatory ? 1 : 0));

  const visibleCoverage = coverage.filter(r => {
    if (!statusFilter) return true;
    if (statusFilter === 'mandatory_missing') return effStatus(r) === 'missing' && r.requirement_mandatory;
    return effStatus(r) === statusFilter;
  });

  const genericHits = Array.isArray(meta?.writing_quality?.generic_phrase_hits)
    ? meta.writing_quality.generic_phrase_hits
    : [];

  return (
    <div className="space-y-6">
      {/* ── Header strip ────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Your proposal vs this RFP</p>
            <h2 className="font-headline text-3xl font-bold text-on-surface mb-1">
              {overall}<span className="text-lg font-normal opacity-60">/100 fit</span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {(data.docs || []).map((doc, i) => (
                <span key={doc.id || i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-surface-container-high text-on-surface-variant border border-outline-variant/30"
                  title={doc.created_at ? `Added ${new Date(doc.created_at).toLocaleDateString()}` : undefined}
                >
                  📄 {doc.original_name}
                  {doc.id && (data.docs || []).length > 1 && (
                    <button onClick={() => removeDoc(doc.id, doc.original_name)}
                      className="hover:text-error opacity-60 hover:opacity-100" aria-label={`Remove ${doc.original_name}`}>✕</button>
                  )}
                </span>
              ))}
              {data.last_analyzed_at && (
                <span className="text-[11px] text-on-surface-variant/60">Analysed {new Date(data.last_analyzed_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileRef}
              className="hidden"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }}
            />
            <button onClick={() => fileRef.current.click()} disabled={uploading} className="border border-outline-variant px-4 py-2 rounded text-xs hover:bg-surface-container-high disabled:opacity-40"
              title="Add another document (commercial, technical, annex) — analysed together as one response">
              {uploading ? 'Uploading…' : '+ Add document'}
            </button>
            <button onClick={rerun} className="border border-outline-variant px-4 py-2 rounded text-xs hover:bg-surface-container-high">
              Re-run analysis
            </button>
            <button onClick={removeProposal} className="text-xs text-on-surface-variant hover:text-error" aria-label="Remove proposal">Remove</button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <ScoreChip label="Coverage" score={scores.coverage} />
          <ScoreChip label="Methodology" score={scores.methodology} />
          <ScoreChip label="Evidence" score={scores.evidence} />
          <ScoreChip label="Criteria" score={scores.criteria} />
          <ScoreChip label="Pricing" score={scores.pricing} />
        </div>
        {partialAssessment && dimsUsed.length > 0 && (
          <div className="mt-4 p-3 rounded border-l-2 border-amber-400/60 bg-amber-400/5">
            <p className="text-xs text-on-surface-variant">
              <span className="font-bold text-on-surface">Partial assessment.</span>{' '}
              {missingDims.requirements && 'The RFP did not yield extractable requirements, '}
              {missingDims.criteria && !missingDims.requirements && 'No evaluation criteria were found in the RFP, '}
              {missingDims.criteria && missingDims.requirements && 'and no evaluation criteria either, '}
              {missingDims.pricing && 'and pricing alignment is not assessable. '}
              The score above blends only: <span className="font-mono">{dimsUsed.join(' + ')}</span>.
              {missingDims.requirements && ' Re-extract the RFP if it parsed thinly.'}
            </p>
          </div>
        )}
      </Card>

      {/* ── At-a-glance counts — click a tile to filter the matrix ──── */}
      {coverage.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'addressed', label: 'Addressed', value: addressed, of: coverage.length, colour: '#7bd07a' },
            { key: 'partial', label: 'Partial', value: partial, of: coverage.length, colour: '#e4c366' },
            { key: 'missing', label: 'Missing', value: missing, of: coverage.length, colour: '#e8a59f' },
            { key: 'mandatory_missing', label: 'Mandatories missing', value: mandatoriesMissing, of: null, colour: mandatoriesMissing > 0 ? '#e8a59f' : '#7bd07a' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => filterAndScroll(t.key)}
              className={`text-left rounded-lg transition-all ${statusFilter === t.key ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-outline/50'}`}
              title={statusFilter === t.key ? 'Clear filter' : `Show these requirements in the matrix`}
            >
              <Card className="p-4 h-full">
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">{t.label}</p>
                <p className="font-headline text-2xl font-bold" style={{ color: t.colour }}>
                  {t.value}{t.of != null && <span className="text-sm font-normal opacity-60">/{t.of}</span>}
                </p>
                <p className="text-[10px] text-on-surface-variant/50 mt-1">{statusFilter === t.key ? 'Filtering — click to clear' : 'Click for details'}</p>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* ── Top gaps ────────────────────────────────────────────────── */}
      {gaps.length > 0 && (
        <Card className="p-6">
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Top gaps</h3>
          <p className="text-xs text-on-surface-variant mb-4">Mandatories first. Address these to lift the fit score most.</p>
          <ul className="space-y-3">
            {gaps.slice(0, 8).map((r) => (
              <li key={r.requirement_index} className="border-l-2 border-outline-variant/40 pl-3 py-1">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm text-on-surface flex-1">
                    {r.requirement_mandatory ? <span className="text-error font-bold mr-1">●</span> : null}
                    {r.requirement_text}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={r.status} />
                    <button
                      type="button"
                      onClick={() => setCovered(r, true)}
                      disabled={overriding !== null}
                      className="text-[10px] font-label font-bold uppercase tracking-widest px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40 whitespace-nowrap"
                      title="We have this capability even though it's not evidenced in the response — count it as covered and regrade the fit score"
                    >
                      {overriding === r.requirement_index ? 'Regrading…' : '✓ We have this'}
                    </button>
                  </div>
                </div>
                {r.rationale && <p className="text-xs text-on-surface-variant italic">{r.rationale}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Coverage matrix ─────────────────────────────────────────── */}
      {coverage.length > 0 && (
        <div ref={matrixRef}>
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h3 className="font-headline text-xl font-bold text-on-surface">Requirement coverage matrix</h3>
            {statusFilter && (
              <button
                type="button"
                onClick={() => setStatusFilter(null)}
                className="text-[10px] font-label font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
              >
                Showing: {statusFilter === 'mandatory_missing' ? 'Mandatories missing' : statusFilter} ({visibleCoverage.length}) ✕ clear
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/30">
                  <th className="py-2 pr-3">Requirement</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Strength</th>
                  <th className="py-2 pr-3">Evidence</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleCoverage.map(r => {
                  const asserted = r.user_override === 'covered';
                  return (
                  <tr key={r.requirement_index} className="border-b border-outline-variant/10 align-top">
                    <td className="py-3 pr-3 text-sm max-w-[280px]">
                      {r.requirement_mandatory ? <span className="text-error font-bold mr-1" title="Mandatory">●</span> : null}
                      {r.requirement_text}
                      {r.requirement_section ? <span className="block text-[10px] uppercase tracking-widest text-on-surface-variant/60 mt-0.5">{r.requirement_section}</span> : null}
                    </td>
                    <td className="py-3 pr-3">
                      {asserted ? (
                        <div className="space-y-1">
                          <StatusBadge status="asserted" />
                          <span className="block text-[10px] text-on-surface-variant/60" title="The AI's original grading of the response text">AI graded: {r.status}</span>
                        </div>
                      ) : (
                        <StatusBadge status={r.status} />
                      )}
                    </td>
                    <td className="py-3 pr-3"><StrengthBar score={asserted ? Math.max(85, r.strength_score || 0) : r.strength_score} /></td>
                    <td className="py-3 pr-3 text-xs text-on-surface-variant max-w-[360px]">
                      {r.evidence_quote ? (
                        <span className="italic">"{r.evidence_quote.slice(0, 280)}{r.evidence_quote.length > 280 ? '…' : ''}"</span>
                      ) : asserted ? (
                        <span className="opacity-70">Covered by your assertion — consider writing it into the response.</span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {asserted ? (
                        <button
                          type="button"
                          onClick={() => setCovered(r, false)}
                          disabled={overriding !== null}
                          className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-error disabled:opacity-40 whitespace-nowrap"
                        >
                          {overriding === r.requirement_index ? '…' : 'Undo'}
                        </button>
                      ) : (effStatus(r) === 'missing' || effStatus(r) === 'partial') ? (
                        <button
                          type="button"
                          onClick={() => setCovered(r, true)}
                          disabled={overriding !== null}
                          className="text-[10px] font-label font-bold uppercase tracking-widest px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40 whitespace-nowrap"
                          title="We have this capability — count it as covered and regrade the fit score"
                        >
                          {overriding === r.requirement_index ? '…' : '✓ We have this'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleCoverage.length === 0 && (
              <p className="text-sm text-on-surface-variant py-6 text-center">No requirements match this filter.</p>
            )}
          </div>
        </Card>
        </div>
      )}

      {/* ── Generic-phrase hits ─────────────────────────────────────── */}
      {genericHits.length > 0 && (
        <Card className="p-6">
          <h3 className="font-headline text-xl font-bold text-on-surface mb-2">Strengthen these sentences</h3>
          <p className="text-xs text-on-surface-variant mb-4">
            Generic language that an evaluator will recognise as boilerplate. Replace each with a specific named client, number, or technology.
          </p>
          <ul className="space-y-2">
            {genericHits.slice(0, 12).map((q, i) => (
              <li key={i} className="text-xs italic text-on-surface-variant border-l-2 border-error/30 pl-3 py-1">"{q}"</li>
            ))}
          </ul>
        </Card>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
