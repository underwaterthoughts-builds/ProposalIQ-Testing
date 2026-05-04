import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from './ui';

const STATUS_BADGE = {
  addressed: { bg: '#1f4e2a', fg: '#a8e0b3', label: 'Addressed' },
  partial:   { bg: '#5b4419', fg: '#e4c366', label: 'Partial' },
  missing:   { bg: '#5a1e1a', fg: '#e8a59f', label: 'Missing' },
  unanalyzed:{ bg: '#3a3a3a', fg: '#c8c8c8', label: 'Unanalyzed' },
};

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
  const fileRef = useRef();

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

  async function uploadFile(file) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext)) {
      setError(`Unsupported file type ".${ext}"`); return;
    }
    if (file.size > 50 * 1024 * 1024) { setError('File too large — maximum 50MB'); return; }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('proposal', file);
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

  async function removeProposal() {
    if (!confirm('Remove this proposal and its analysis? This cannot be undone.')) return;
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
            evaluation criterion, and the methodology / evidence bar.
          </p>
          <input
            type="file"
            ref={fileRef}
            className="hidden"
            accept=".pdf,.docx,.doc,.txt,.md"
            onChange={e => { if (e.target.files[0]) uploadFile(e.target.files[0]); }}
          />
          <button
            type="button"
            onClick={() => fileRef.current.click()}
            disabled={uploading}
            className="bg-primary text-on-primary font-bold px-8 py-3 rounded-md hover:brightness-110 transition-all active:scale-95 disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : 'Upload proposal'}
          </button>
          <p className="mt-3 text-[11px] font-mono uppercase tracking-widest text-on-surface-variant/60">PDF · DOCX · DOC · TXT · MD · max 50MB</p>
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
          {data.proposal_original_name}
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

  const addressed = coverage.filter(r => r.status === 'addressed').length;
  const partial   = coverage.filter(r => r.status === 'partial').length;
  const missing   = coverage.filter(r => r.status === 'missing').length;
  const mandatoriesMissing = coverage.filter(r => r.status === 'missing' && r.requirement_mandatory).length;

  const gaps = coverage
    .filter(r => r.status === 'missing' || r.status === 'partial')
    .sort((a, b) => (b.requirement_mandatory ? 1 : 0) - (a.requirement_mandatory ? 1 : 0));

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
            <p className="text-sm text-on-surface-variant">
              {data.proposal_original_name}
              {data.last_analyzed_at ? ` · Analysed ${new Date(data.last_analyzed_at).toLocaleDateString()}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileRef}
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={e => { if (e.target.files[0]) uploadFile(e.target.files[0]); }}
            />
            <button onClick={() => fileRef.current.click()} disabled={uploading} className="border border-outline-variant px-4 py-2 rounded text-xs hover:bg-surface-container-high disabled:opacity-40">
              {uploading ? 'Uploading…' : 'Re-upload draft'}
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
      </Card>

      {/* ── At-a-glance counts ──────────────────────────────────────── */}
      {coverage.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Addressed</p>
            <p className="font-headline text-2xl font-bold" style={{ color: '#7bd07a' }}>{addressed}<span className="text-sm font-normal opacity-60">/{coverage.length}</span></p>
          </Card>
          <Card className="p-4">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Partial</p>
            <p className="font-headline text-2xl font-bold" style={{ color: '#e4c366' }}>{partial}<span className="text-sm font-normal opacity-60">/{coverage.length}</span></p>
          </Card>
          <Card className="p-4">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Missing</p>
            <p className="font-headline text-2xl font-bold" style={{ color: '#e8a59f' }}>{missing}<span className="text-sm font-normal opacity-60">/{coverage.length}</span></p>
          </Card>
          <Card className="p-4">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Mandatories missing</p>
            <p className="font-headline text-2xl font-bold" style={{ color: mandatoriesMissing > 0 ? '#e8a59f' : '#7bd07a' }}>{mandatoriesMissing}</p>
          </Card>
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
                  <StatusBadge status={r.status} />
                </div>
                {r.rationale && <p className="text-xs text-on-surface-variant italic">{r.rationale}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Coverage matrix ─────────────────────────────────────────── */}
      {coverage.length > 0 && (
        <Card className="p-6">
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Requirement coverage matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/30">
                  <th className="py-2 pr-3">Requirement</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Strength</th>
                  <th className="py-2">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map(r => (
                  <tr key={r.requirement_index} className="border-b border-outline-variant/10 align-top">
                    <td className="py-3 pr-3 text-sm max-w-[280px]">
                      {r.requirement_mandatory ? <span className="text-error font-bold mr-1" title="Mandatory">●</span> : null}
                      {r.requirement_text}
                      {r.requirement_section ? <span className="block text-[10px] uppercase tracking-widest text-on-surface-variant/60 mt-0.5">{r.requirement_section}</span> : null}
                    </td>
                    <td className="py-3 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-3 pr-3"><StrengthBar score={r.strength_score} /></td>
                    <td className="py-3 text-xs text-on-surface-variant max-w-[360px]">
                      {r.evidence_quote ? (
                        <span className="italic">"{r.evidence_quote.slice(0, 280)}{r.evidence_quote.length > 280 ? '…' : ''}"</span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
