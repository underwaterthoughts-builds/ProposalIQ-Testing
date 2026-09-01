import { memo } from 'react';
import { Card } from '../ui';

// Market Context — categorised, scored, strategically framed news.
// Replaces the old "Industry News" tab. News items are grouped by category
// (programme/buyer/tech_reg/competitive) so the user can scan by relevance
// type, not just by date. Anything below 50% relevance has been filtered out
// upstream — the UI never shows junk results.
const CATEGORY_META = {
  programme: { label: 'Programme & Procurement', icon: '◆', color: '#7bd07a', desc: 'News directly about the named programme, framework, or contract vehicle' },
  buyer:     { label: 'Buyer & Issuing Body',    icon: '◈', color: '#7fb4bc', desc: 'News about the issuing organisation — leadership, budget, restructure' },
  tech_reg:  { label: 'Technology & Regulation', icon: '◇', color: '#e8c357', desc: 'New standards, regulations, or capability announcements' },
  competitive: { label: 'Competitive Landscape', icon: '◉', color: '#ffb4ab', desc: 'Competitor wins, M&A, market shifts in the supplier base' },
};

const MarketContext = memo(function MarketContext({ news }) {
  if (!news || news.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-3 opacity-25">◆</div>
        <p className="text-sm" style={{ color: '#d0c5b0' }}>No relevant market context found.</p>
        <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: '#99907d' }}>
          We searched trade press for news tied to this client, their industry, and the brief's themes — none scored above the relevance threshold. Better empty than misleading.
        </p>
      </div>
    );
  }

  // Group by category
  const groups = {};
  news.forEach(n => {
    const cat = n.category || 'tech_reg';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(n);
  });

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: '#d0c5b0' }}>
        News scored against this RFP's specific entities. Each item is tagged with where to use it in the bid and what argument it strengthens.
      </p>

      {['programme', 'buyer', 'tech_reg', 'competitive'].map(cat => {
        const items = groups[cat];
        if (!items || items.length === 0) return null;
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat}>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: meta.color }}>
                  {meta.icon} {meta.label}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#d0c5b0' }}>{meta.desc}</div>
              </div>
              <div className="text-[11px] font-mono" style={{ color: '#99907d' }}>
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((n, i) => <MarketContextCard key={i} item={n} accent={meta.color} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
});

const MarketContextCard = memo(function MarketContextCard({ item: n, accent }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: accent + '14', color: accent }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color: '#d0c5b0' }}>{n.date}</span>
          <span className="ml-auto text-[10px] font-mono font-semibold" style={{ color: accent }}>{n.relevance_score}/100</span>
        </div>
        <h3 className="text-sm font-semibold mb-1.5 leading-snug">{n.title}</h3>
        <p className="text-xs leading-relaxed mb-3" style={{ color: '#d0c5b0' }}>{n.snippet}</p>

        {n.why_it_matters && (
          <div className="rounded-md p-3 text-xs leading-relaxed mb-2" style={{ background: 'rgba(232,195,87,.08)' }}>
            <span className="font-semibold" style={{ color: '#e8c357' }}>Why this matters: </span>
            <span style={{ color: '#e4c366' }}>{n.why_it_matters}</span>
          </div>
        )}

        {(n.where_to_use_in_bid || n.tone_supported) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {n.where_to_use_in_bid && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(30,74,82,.3)', color: '#7fb4bc' }}>
                Use in: {n.where_to_use_in_bid}
              </span>
            )}
            {n.tone_supported && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(184,150,46,.3)', color: '#e8c357' }}>
                Supports: {n.tone_supported}
              </span>
            )}
          </div>
        )}
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 border-t text-xs transition-colors hover:bg-[#f0f8ff]"
          style={{ borderColor: '#2b2a27', color: '#7fb4bc' }}>
          <span className="flex-1 truncate">{n.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
          <span className="flex-shrink-0">↗</span>
        </a>
      )}
    </Card>
  );
});

export default MarketContext;
