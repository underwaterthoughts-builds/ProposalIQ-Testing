import { memo } from 'react';
import { Spinner } from '../ui';

const CheckpointBanner = memo(function CheckpointBanner({ label, approved, onApprove, saving, children }) {
  if (approved) return (
    <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl text-sm" style={{ background:'rgba(61,92,58,.15)', border:'1px solid rgba(61,92,58,.2)' }}>
      <span style={{ color:'#7bd07a' }}>✓</span>
      <span className="font-medium" style={{ color:'#7bd07a' }}>{label} reviewed and approved</span>
    </div>
  );
  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{ border:'1.5px solid rgba(184,150,46,.4)', background:'rgba(232,195,87,.08)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold" style={{ color:'#e8c357' }}>⚑ Review checkpoint: {label}</div>
          <div className="text-xs mt-0.5" style={{ color:'#9a7820' }}>Review this output before proceeding. Approve to continue, or edit first.</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onApprove} disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60 no-min-h"
            style={{ background:'#3d5c3a' }}>
            {saving ? <><Spinner size={12}/> Saving…</> : '✓ Approve & Continue'}
          </button>
        </div>
      </div>
      {children && <div className="border-t px-4 py-3" style={{ borderColor:'rgba(184,150,46,.2)' }}>{children}</div>}
    </div>
  );
});

export default CheckpointBanner;
