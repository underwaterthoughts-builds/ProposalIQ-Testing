import { memo } from 'react';

// ── RFP PLAIN TEXT TAB ──────────────────────────────────────────────────
// Full RFP text is now stored and returned uncapped — no truncation.
const RfpPlainTextTab = memo(function RfpPlainTextTab({ scan }) {
  const text = scan.rfp_text || '';
  if (!text) {
    return <div className="text-center py-16 text-on-surface-variant">No extracted text available for this scan.</div>;
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="bg-surface-container-low">
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant/10">
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
          Extracted Text
        </div>
        <div className="font-label text-[10px] text-on-surface-variant/60">
          {words.toLocaleString()} words · {text.length.toLocaleString()} chars
        </div>
      </div>
      <pre className="font-body text-sm leading-relaxed whitespace-pre-wrap text-on-surface p-6 overflow-auto max-h-[75vh]">
        {text}
      </pre>
    </div>
  );
});

export default RfpPlainTextTab;
