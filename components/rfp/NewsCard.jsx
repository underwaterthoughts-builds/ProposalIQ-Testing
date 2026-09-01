import { memo } from 'react';
import { Card } from '../ui';

const NewsCard = memo(function NewsCard({ item: n }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'rgba(30,107,120,.15)', color:'#7fb4bc' }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color:'#d0c5b0' }}>{n.date}</span>
          <span className="ml-auto text-[10px] font-mono" style={{ color:'#b8962e' }}>⟡ {n.relevance_score}% relevant</span>
        </div>
        <h3 className="text-sm font-semibold mb-1.5 leading-snug">{n.title}</h3>
        <p className="text-xs leading-relaxed mb-3" style={{ color:'#d0c5b0' }}>{n.snippet}</p>
        <div className="rounded-md p-3 text-xs leading-relaxed" style={{ background:'rgba(232,195,87,.08)' }}>
          <span className="font-semibold" style={{ color:'#b8962e' }}>⟡ Why this matters: </span>{n.why_it_matters}
        </div>
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 border-t text-xs transition-colors hover:bg-[#f0f8ff]"
          style={{ borderColor:'#2b2a27', color:'#7fb4bc' }}>
          <span className="flex-1 truncate">{n.url.replace(/^https?:\/\/(www\.)?/,'')}</span>
          <span className="flex-shrink-0">↗</span>
        </a>
      )}
    </Card>
  );
});

export default NewsCard;
