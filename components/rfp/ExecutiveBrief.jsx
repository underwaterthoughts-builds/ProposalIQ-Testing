import { useState, useMemo, memo } from 'react';

// ── Executive Bid Brief — synthesis layer landing page ────────────────────
// The default tab. Renders the verdict at the top, then top priorities,
// risks, recommended assets, and immediate next actions. Designed so the
// bid director can read it in 90 seconds and walk away with a decision.
const ExecutiveBrief = memo(function ExecutiveBrief({ brief, bidScore, matches, onJumpTab, scanName, scanId, coveredRisks = [], onCoverChange, onExport, onGenerateTemplate, exporting, generatingTemplate }) {
  const [coverPrompt, setCoverPrompt] = useState(null); // { risk, mitigation }
  const [coverInFlight, setCoverInFlight] = useState(false);
  const [showWhy, setShowWhy] = useState(false); // "Why this score" disclosure
  const coveredRiskTexts = useMemo(
    () => new Set((coveredRisks || []).map(r => (r.risk || '').trim())),
    [coveredRisks]
  );
  async function applyCover(scope) {
    if (!coverPrompt || !scanId) return;
    setCoverInFlight(true);
    try {
      await fetch(`/api/rfp/${scanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cover_risk',
          risk: coverPrompt.risk,
          mitigation: coverPrompt.mitigation || null,
          scope,
        }),
      });
      onCoverChange?.();
    } finally {
      setCoverInFlight(false);
      setCoverPrompt(null);
    }
  }
  async function applyUncover(riskText) {
    if (!scanId) return;
    await fetch(`/api/rfp/${scanId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'uncover_risk', risk: riskText }),
    });
    onCoverChange?.();
  }
  if (!brief) {
    return (
      <div className="py-16 text-center">
        <div className="text-3xl mb-3 opacity-25 text-primary">★</div>
        <p className="text-sm text-on-surface-variant">Executive brief not available for this scan.</p>
        <p className="text-xs mt-2 text-on-surface-variant/60">Re-run the scan to generate one.</p>
      </div>
    );
  }

  const verdict = brief.verdict || {};
  const decision = String(verdict.decision || '').toUpperCase();

  // Verdict panel colour map — dark theme (Stitch palette)
  const isNoBid = decision.includes('NO BID');
  const isConditional = decision.includes('CONDITIONAL');
  const verdictPanel = isNoBid
    ? { bg: '#3a1f1a', label: 'text-[#e6a29b]', title: 'text-[#f5c8c1]' }
    : isConditional
    ? { bg: '#3d2f00', label: 'text-[#d4b458]', title: 'text-primary-fixed' }
    : { bg: '#1e2d24', label: 'text-[#8fb49a]', title: 'text-[#c5e1cd]' };

  const priorities = Array.isArray(brief.top_3_priorities) ? brief.top_3_priorities : [];
  const risks = Array.isArray(brief.top_3_risks) ? brief.top_3_risks : [];
  const assets = Array.isArray(brief.recommended_assets_to_use) ? brief.recommended_assets_to_use : [];
  const nextActions = Array.isArray(brief.immediate_next_actions) ? brief.immediate_next_actions : [];

  // Score ring — SVG arc maths
  const score = bidScore?.score != null ? Math.max(0, Math.min(100, bidScore.score)) : null;
  const confidenceText = verdict.confidence ? String(verdict.confidence).toUpperCase() : null;

  // Project code — derived from scanId for the editorial label
  const projectCode = scanId ? `CODE: ${String(scanId).slice(0, 8).toUpperCase()}` : null;

  // "Why this score" breakdown — scoreBid's deterministic components +
  // rationale. Render only the parts the payload actually carries so old
  // scans (pre-components) degrade gracefully.
  const scoreComponents = bidScore?.components || {};
  const componentRows = [
    { label: 'Top match strength', value: scoreComponents.matchScore },
    { label: 'Experience depth', value: scoreComponents.experienceScore },
    { label: 'Gap exposure', value: scoreComponents.gapScore },
    { label: 'Win rate', value: scoreComponents.winRateScore },
    { label: 'Won similar work', value: scoreComponents.wonMatchScore },
  ].filter(r => typeof r.value === 'number' && !Number.isNaN(r.value));
  const scoreRationale = Array.isArray(bidScore?.rationale) ? bidScore.rationale : [];
  const scoreConditions = Array.isArray(bidScore?.conditions) ? bidScore.conditions : [];
  const hasScoreDetail = componentRows.length > 0 || scoreRationale.length > 0;

  return (
    <div className="max-w-4xl mx-auto py-8 md:py-12">

      {/* ── EDITORIAL HEADER ────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {projectCode && (
            <span className="font-label text-xs uppercase tracking-[0.2em] text-outline">{projectCode}</span>
          )}
          <span className="h-px w-8 bg-outline-variant" />
          <span className="font-label text-xs uppercase tracking-[0.2em] text-outline">Intelligence Brief</span>
        </div>
        <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-on-surface leading-[1.1] mb-2">
          {scanName || 'RFP Intelligence'}
        </h1>
        <p className="font-headline text-lg md:text-xl text-on-surface-variant italic">
          Executive briefing prepared for the decision committee
        </p>
      </section>

      {/* ── VERDICT BANNER ──────────────────────────────────────── */}
      <section className="bg-surface-container-low rounded-xl p-1 mb-16 overflow-hidden shadow-lg">
        <div className="flex flex-col md:flex-row items-stretch border border-outline-variant/10 rounded-lg overflow-hidden">

          {/* Recommendation panel */}
          <div className="flex-1 flex flex-col items-center justify-center py-10 px-8 text-center" style={{ backgroundColor: verdictPanel.bg }}>
            <span className={`font-label text-[10px] uppercase tracking-[0.3em] ${verdictPanel.label} mb-2`}>
              Recommendation
            </span>
            <h2 className={`text-5xl md:text-6xl font-black tracking-tighter ${verdictPanel.title} font-headline`}>
              {decision || 'PENDING'}
            </h2>
            {verdict.headline && (
              <p className={`mt-4 ${verdictPanel.label} font-body text-sm max-w-[280px] leading-relaxed`}>
                {verdict.headline}
              </p>
            )}
          </div>

          {/* Metrics panel */}
          <div className="flex-[1.5] bg-surface-container-high flex flex-wrap md:flex-nowrap items-center justify-between p-8 md:p-10 gap-6">
            <div className="flex-1 min-w-[120px]">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-4xl font-bold text-primary font-label">{score != null ? score : '—'}</span>
                {score != null && <span className="text-lg text-outline font-label">%</span>}
              </div>
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Intelligence Score</p>
            </div>
            <div className="hidden md:block h-16 w-px bg-outline-variant/30" />
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-on-surface font-label whitespace-nowrap">{confidenceText || '—'}</span>
              </div>
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Confidence</p>
            </div>

            {/* Score ring */}
            {score != null && (
              <div className="hidden sm:block relative w-20 h-20 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                  <circle className="text-surface-variant" cx="40" cy="40" r="34" fill="transparent" stroke="currentColor" strokeWidth="4" />
                  <circle
                    className="text-primary"
                    cx="40" cy="40" r="34"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={(2 * Math.PI * 34) * (1 - score / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* "Why this score" — collapsed breakdown of the deterministic bid score */}
        {hasScoreDetail && (
          <div className="mt-1 rounded-lg bg-surface-container-high/40 border border-outline-variant/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowWhy(v => !v)}
              aria-expanded={showWhy}
              className="w-full flex items-center justify-between px-8 py-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span>Why this score</span>
              <span aria-hidden="true">{showWhy ? '▴' : '▾'}</span>
            </button>
            {showWhy && (
              <div className="px-8 pb-6 space-y-5">
                {componentRows.length > 0 && (
                  <div className="space-y-2.5">
                    {componentRows.map(row => (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="w-36 shrink-0 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                          {row.label}
                        </span>
                        <div className="flex-1 h-1 rounded-full bg-surface-variant/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-label text-xs font-bold text-on-surface">
                          {Math.round(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {scoreRationale.length > 0 && (
                  <ul className="space-y-1.5">
                    {scoreRationale.map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed text-on-surface-variant">
                        <span className="text-primary shrink-0">·</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {scoreConditions.length > 0 && (
                  <div>
                    <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mb-1.5">
                      Conditions
                    </div>
                    <ul className="space-y-1.5">
                      {scoreConditions.map((c, i) => (
                        <li key={i} className="flex gap-2 text-xs leading-relaxed text-on-surface-variant">
                          <span className="text-secondary shrink-0">·</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {bidScore?.basis && (
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">
                    Win-rate basis: {String(bidScore.basis).replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── WINNING THESIS + FIT ASSESSMENT ─────────────────────── */}
      {(brief.winning_thesis_one_liner || brief.are_we_a_strong_fit || brief.what_this_brief_is_really_asking_for) && (
        <section className="mb-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <h3 className="font-headline text-2xl md:text-3xl font-bold leading-tight text-on-surface border-l-2 border-primary pl-6">
                Winning Thesis
              </h3>
            </div>
            <div className="md:col-span-8">
              {brief.winning_thesis_one_liner && (
                <p className="font-body text-lg leading-relaxed text-on-surface-variant mb-8">
                  {brief.winning_thesis_one_liner}
                </p>
              )}
              {brief.are_we_a_strong_fit && (
                <div className="bg-surface-container-lowest p-8 border-l-2 border-primary-container">
                  <h4 className="font-label text-xs uppercase tracking-widest text-primary-container mb-4">Fit Assessment</h4>
                  <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                    {brief.are_we_a_strong_fit}
                  </p>
                </div>
              )}
              {!brief.are_we_a_strong_fit && brief.what_this_brief_is_really_asking_for && (
                <div className="bg-surface-container-lowest p-8 border-l-2 border-primary-container">
                  <h4 className="font-label text-xs uppercase tracking-widest text-primary-container mb-4">What this RFP is really asking for</h4>
                  <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                    {brief.what_this_brief_is_really_asking_for}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── PRIORITIES + RISKS ──────────────────────────────────── */}
      {(priorities.length > 0 || risks.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 mb-24">

          {priorities.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary-container">priority_high</span>
                <h3 className="font-headline text-2xl font-bold">Strategic Priorities</h3>
              </div>
              <ul className="space-y-6">
                {priorities.slice(0, 3).map((p, i) => (
                  <li key={i} className="group">
                    <span className="font-label text-[10px] text-primary-container block mb-1">
                      PRIORITY {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-on-surface-variant group-hover:text-on-surface transition-colors">
                      {p.priority || p}
                    </p>
                    {p.why_it_matters && (
                      <p className="text-xs mt-1 italic text-on-surface-variant/70">{p.why_it_matters}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {risks.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-error">warning</span>
                <h3 className="font-headline text-2xl font-bold">Identified Risks</h3>
              </div>
              <ul className="space-y-6">
                {risks.slice(0, 3).map((r, i) => {
                  const riskText = (r.risk || r || '').toString().trim();
                  const isCovered = coveredRiskTexts.has(riskText);
                  return (
                    <li key={i} className="flex gap-4 group">
                      <div className={`w-1.5 h-1.5 rounded-full mt-2.5 shrink-0 ${isCovered ? 'bg-on-surface-variant/40' : 'bg-error'}`} />
                      <div className="flex-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className={`font-semibold text-sm ${isCovered ? 'text-on-surface-variant/60 line-through' : 'text-on-surface'}`}>
                            {riskText}
                          </p>
                          {isCovered && (
                            <span className="text-[10px] uppercase tracking-widest font-mono text-primary px-1.5 py-0.5 rounded bg-primary/10 shrink-0">
                              ✓ Covered
                            </span>
                          )}
                        </div>
                        {r.mitigation && (
                          <p className={`text-xs leading-relaxed mt-1 ${isCovered ? 'text-on-surface-variant/40 line-through' : 'text-on-surface-variant'}`}>
                            {r.mitigation}
                          </p>
                        )}
                        <div className="mt-2">
                          {isCovered ? (
                            <button
                              type="button"
                              onClick={() => applyUncover(riskText)}
                              className="text-[11px] underline text-on-surface-variant/60 hover:text-on-surface-variant"
                            >
                              undo cover
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCoverPrompt({ risk: riskText, mitigation: r.mitigation || null })}
                              className="text-[11px] font-medium px-2 py-1 rounded border border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:border-primary/60 transition-colors"
                            >
                              ✓ We have this
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── RECOMMENDED ASSETS ──────────────────────────────────── */}
      {assets.length > 0 && (
        <section className="border-t border-outline-variant pt-16">
          <div className="flex justify-between items-end mb-10 flex-wrap gap-4">
            <div>
              <h3 className="font-headline text-2xl md:text-3xl font-bold">Recommended Assets</h3>
              <p className="text-on-surface-variant font-body mt-2">AI-matched historical documents for rapid assembly.</p>
            </div>
            {onJumpTab && (
              <button
                onClick={() => onJumpTab('matches')}
                className="text-primary font-label text-xs uppercase tracking-widest hover:underline"
              >
                View All
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {assets.slice(0, 4).map((a, i) => (
              <div
                key={i}
                className="flex items-center p-6 bg-surface-container-low hover:bg-surface-container-high transition-all group"
              >
                <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center text-primary-container group-hover:text-primary transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div className="ml-4 flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-on-surface truncate">{a.name}</h4>
                  {(a.why || a.use_for) && (
                    <p className="text-xs text-on-surface-variant mt-1 truncate">{a.why || a.use_for}</p>
                  )}
                </div>
                <span className="material-symbols-outlined text-outline group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">
                  arrow_outward
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── IMMEDIATE NEXT ACTIONS (preserved) ──────────────────── */}
      {nextActions.length > 0 && (
        <section className="mt-16 rounded-lg p-8 bg-primary-container/10 border border-primary/20">
          <div className="font-label text-[10px] uppercase tracking-widest mb-4 text-primary">Do these today</div>
          <ol className="space-y-3">
            {nextActions.slice(0, 5).map((a, i) => (
              <li key={i} className="flex gap-3 text-sm text-on-surface">
                <span className="font-mono font-bold opacity-60 flex-shrink-0 text-primary">{i + 1}.</span>
                <div className="flex-1">
                  <div>{a.action || a}</div>
                  <div className="flex gap-3 mt-0.5 text-[10px] font-mono uppercase tracking-wide text-on-surface-variant">
                    {a.owner && <span>{a.owner}</span>}
                    {a.deadline && <span>{a.deadline}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── FOOTER ACTIONS ──────────────────────────────────────── */}
      {(onExport || onGenerateTemplate) && (
        <footer className="mt-20 pt-12 border-t border-outline-variant/20 flex flex-wrap justify-between items-center gap-4">
          <p className="font-label text-xs text-outline uppercase tracking-widest">
            Intelligence Brief · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <div className="flex gap-4">
            {onExport && (
              <button
                onClick={onExport}
                disabled={exporting}
                className="bg-surface-container-high px-6 py-2 text-xs font-bold font-label uppercase tracking-widest hover:bg-surface-container-highest transition-colors disabled:opacity-50"
              >
                {exporting ? 'Exporting…' : 'Download'}
              </button>
            )}
            {onGenerateTemplate && (
              <button
                onClick={onGenerateTemplate}
                disabled={generatingTemplate}
                className="bg-primary text-on-primary px-6 py-2 text-xs font-bold font-label uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                {generatingTemplate ? 'Building…' : 'Begin Drafting'}
              </button>
            )}
          </div>
        </footer>
      )}

      {/* "We have this" scope-choice modal — appears after the user clicks
          the cover button on a risk. They choose whether the cover applies
          to this scan only or persists across all future RFPs. */}
      {coverPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.6)' }}
          onClick={() => !coverInFlight && setCoverPrompt(null)}
        >
          <div
            className="bg-surface-container rounded-xl p-6 max-w-md w-full border border-outline-variant/40"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-label text-[10px] uppercase tracking-widest text-primary mb-2">Mark as covered</p>
            <h3 className="font-headline text-xl font-bold mb-3">"{coverPrompt.risk}"</h3>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Apply this cover to <strong>this scan only</strong> — useful for one-off contexts —
              or to <strong>all future RFPs</strong>, so the same risk is pre-marked covered the
              next time it's identified.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={coverInFlight}
                onClick={() => applyCover('scan')}
                className="px-4 py-3 rounded-md border border-outline-variant/40 text-sm font-bold hover:border-primary/60 hover:bg-surface-container-high transition-colors disabled:opacity-40"
              >
                This scan only
              </button>
              <button
                type="button"
                disabled={coverInFlight}
                onClick={() => applyCover('org')}
                className="px-4 py-3 rounded-md bg-primary text-on-primary text-sm font-bold hover:brightness-110 transition-all disabled:opacity-40"
              >
                All future RFPs
              </button>
            </div>
            <button
              type="button"
              disabled={coverInFlight}
              onClick={() => setCoverPrompt(null)}
              className="mt-4 w-full text-xs text-on-surface-variant/60 hover:text-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default ExecutiveBrief;
