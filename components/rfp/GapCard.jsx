import { useState, memo } from 'react';
import { Card } from '../ui';
import { PRIORITY_COLOR } from './shared';

const GapCard = memo(function GapCard({ gap: g }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background:PRIORITY_COLOR[g.priority]||'#4d4636' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-sm font-semibold">{g.title}</div>
            <div className="flex gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:(PRIORITY_COLOR[g.priority]||'#4d4636')+'18', color:PRIORITY_COLOR[g.priority]||'#9b8e80' }}>{g.type}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:(PRIORITY_COLOR[g.priority]||'#4d4636')+'18', color:PRIORITY_COLOR[g.priority]||'#9b8e80' }}>{g.priority}</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed mb-1" style={{ color:'#d0c5b0' }}>{g.description}</p>
          {g.source_hint && <p className="text-xs italic" style={{ color:'#7fb4bc' }}>Partial coverage in: {g.source_hint}</p>}
          {g.suggested_person && (
            <div className="mt-2 rounded-lg px-3 py-2.5 text-xs" style={{ background:'rgba(232,195,87,.08)', border:'1px solid rgba(184,150,46,.2)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color:'#b8962e' }}>Suggested team lead</div>
              <div className="font-semibold mb-0.5" style={{ color:'#e8c357' }}>{g.suggested_person}</div>
              {g.suggested_person_reason && <div style={{ color:'#9a7820' }}>{g.suggested_person_reason}</div>}
              {g.suggested_person_cv && <div className="mt-1 pt-1 border-t" style={{ borderColor:'rgba(184,150,46,.2)', color:'#9a7820' }}>CV: {g.suggested_person_cv}</div>}
            </div>
          )}
          {g.source_proposals?.length > 0 && (
            <div className="mt-2 text-[10px] font-mono" style={{ color:'#99907d' }}>
              Partial coverage in: {g.source_proposals.join(' · ')}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-t" style={{ borderColor:'#2b2a27', background:'#1d1b19' }}>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#2b2a27', color:'#d0c5b0' }}>Impact: {g.impact}</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background:'#2b2a27', color:'#d0c5b0' }}>{g.suggested_action}</span>
      </div>
    </Card>
  );
});

export default GapCard;
