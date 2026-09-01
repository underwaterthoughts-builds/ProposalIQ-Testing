import { useState, memo } from 'react';
import MatchCard from './MatchCard';

// ── Tiered match grouping ────────────────────────────────────────────────
// Groups matches by their taxonomy_tier and renders each group as a section.
// Direct-fit tiers (1, 2, 3) are always expanded. The "different sector"
// group (tier 5) is collapsed by default behind a click-to-reveal button so
// off-sector noise doesn't drown out direct matches. Untagged (tier 4) is
// shown when present but framed as a neutral fallback.
const TieredMatches = memo(function TieredMatches({ matches, expandedMatches, setExpandedMatches, suppress, setToast, onLog }) {
  const [showCrossSector, setShowCrossSector] = useState(false);
  // Filter mode: 'all' shows the full tier hierarchy, 'sector' shows only
  // matches that share the RFP's client industry, 'service' shows only
  // matches that share the RFP's service industry.
  const [filterMode, setFilterMode] = useState('all');

  // Pre-filter the matches array based on the active filter button
  const filteredMatches = (() => {
    if (filterMode === 'sector') {
      // Same client industry = tiers 1 and 2
      return matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 2);
    }
    if (filterMode === 'service') {
      // Same service industry = tiers 1 and 3
      return matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 3);
    }
    return matches;
  })();

  // Counts for the filter button labels — based on full matches, not filtered
  const sectorCount = matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 2).length;
  const serviceCount = matches.filter(m => m.taxonomy_tier === 1 || m.taxonomy_tier === 3).length;

  // Bucket by tier — keep within-tier ordering as the API delivered it.
  const tier1 = filteredMatches.filter(m => m.taxonomy_tier === 1);
  const tier2 = filteredMatches.filter(m => m.taxonomy_tier === 2);
  const tier3 = filteredMatches.filter(m => m.taxonomy_tier === 3);
  const tier4 = filteredMatches.filter(m => m.taxonomy_tier === 4);
  const tier5 = filteredMatches.filter(m => m.taxonomy_tier === 5);

  // Top-fit = tiers 1+2+3 — anything that has at least one taxonomy axis
  // matching the RFP. Renders together at the top.
  const topFit = [...tier1, ...tier2, ...tier3];

  function renderGroup(label, sublabel, items) {
    if (!items.length) return null;
    return (
      <div className="mb-10">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <div className="text-[10px] font-label uppercase tracking-widest text-primary">
              {label}
            </div>
            <div className="text-xs mt-1 text-on-surface-variant">{sublabel}</div>
          </div>
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">
            {items.length} {items.length === 1 ? 'match' : 'matches'}
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {items.map((m) => {
            const i = matches.indexOf(m);
            return (
              <MatchCard key={m.id} match={m}
                expanded={expandedMatches[i]}
                onToggle={() => setExpandedMatches(e => ({ ...e, [i]: !e[i] }))}
                onSuppress={() => suppress(m.id)}
                onToast={setToast}
                onLog={onLog} />
            );
          })}
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-on-surface-variant">No matches found. Add more proposals to your repository.</p>
      </div>
    );
  }

  return (
    <>
      {/* Editorial intro */}
      <header className="mb-10 max-w-3xl">
        <h2 className="font-headline text-2xl font-headline italic text-primary mb-2">High-Fidelity Asset Matching</h2>
        <p className="text-on-surface-variant text-base leading-relaxed">
          ProposalIQ has identified {matches.length} historical asset{matches.length === 1 ? '' : 's'} that align with this RFP. Assets are tiered by relevance and compliance.
        </p>
      </header>

      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-[10px] font-label uppercase tracking-widest mr-2 text-on-surface-variant/60">Filter:</span>
        {[
          { val: 'all',     label: 'All matches',        count: matches.length },
          { val: 'sector',  label: 'Same client sector', count: sectorCount },
          { val: 'service', label: 'Same type of work',  count: serviceCount },
        ].map(opt => {
          const active = filterMode === opt.val;
          return (
            <button
              key={opt.val}
              onClick={() => setFilterMode(opt.val)}
              className={`text-[10px] font-label uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors flex items-center gap-2 ${
                active
                  ? 'border-primary bg-primary/10 text-primary font-bold'
                  : 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline'
              }`}
            >
              {opt.label}
              <span className="opacity-60">{opt.count}</span>
            </button>
          );
        })}
      </div>

      {filteredMatches.length === 0 && (
        <div className="text-center py-10 rounded-lg border border-dashed border-outline-variant/30">
          <p className="text-sm text-on-surface-variant">
            No matches in this filter. Try "All matches" to see everything.
          </p>
        </div>
      )}

      {renderGroup(
        'Direct fit · same sector and same type of work',
        'Strongest matches — same client industry and same service line.',
        tier1
      )}
      {renderGroup(
        'Same type of work · different sector',
        'Same service line, but the client was in a different industry.',
        tier3
      )}
      {renderGroup(
        'Same sector · different type of work',
        'Same client industry but a different service line.',
        tier2
      )}
      {renderGroup(
        'Untagged proposals',
        'Industry could not be inferred from the proposal text — re-analyse to classify.',
        tier4
      )}

      {/* Cross-sector — hidden by default */}
      {tier5.length > 0 && (
        <div className="mt-6 border-t border-outline-variant/10 pt-8">
          {!showCrossSector ? (
            <button
              onClick={() => setShowCrossSector(true)}
              className="w-full py-6 rounded-lg border border-dashed border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-all"
            >
              <div className="text-sm font-medium mb-1 text-on-surface">
                Show {tier5.length} cross-sector {tier5.length === 1 ? 'proposal' : 'proposals'}
              </div>
              <div className="text-[11px] text-on-surface-variant/60 max-w-lg mx-auto">
                Different industry and different service line. May still be useful for tone, structure, or approach — but not for direct content reuse.
              </div>
            </button>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">
                    Cross-sector references
                  </div>
                  <div className="text-xs mt-1 text-on-surface-variant">
                    Different industry — useful for tone, structure or approach only.
                  </div>
                </div>
                <button
                  onClick={() => setShowCrossSector(false)}
                  className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
                >
                  hide
                </button>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {tier5.map((m) => {
                  const i = matches.indexOf(m);
                  return (
                    <MatchCard key={m.id} match={m}
                      expanded={expandedMatches[i]}
                      onToggle={() => setExpandedMatches(e => ({ ...e, [i]: !e[i] }))}
                      onSuppress={() => suppress(m.id)}
                      onToast={setToast}
                      onLog={onLog} />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {topFit.length === 0 && (tier4.length > 0 || tier5.length > 0) && (
        <div className="mt-6 rounded-lg p-4 text-xs bg-primary/10 border border-primary/20 text-primary">
          <strong>No direct sector matches yet.</strong> Re-analyse your repository so proposals get tagged — until then matching falls back to text inference and may be less precise.
        </div>
      )}
    </>
  );
});

export default TieredMatches;
