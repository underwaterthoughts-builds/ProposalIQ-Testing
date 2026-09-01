import { useState, memo } from 'react';
import { DebouncedTextarea } from '../../lib/useDebounce';

// ── Outcome Capture Modal — Wave 3 closed feedback loop ───────────────────
// Active capture form for the bid outcome. Records what happened with the
// bid, whether ProposalIQ contributed materially, and free-text on what was
// useful / what was missing. Feeds into lib/feedback.js to bias future
// ranking toward proposals that have actually been used in winning bids.
const OutcomeCaptureModal = memo(function OutcomeCaptureModal({ existing, usageSummary, scanName, onSave, onClose }) {
  const [outcome, setOutcomeVal] = useState(existing?.outcome || 'pending');
  const [submitted, setSubmitted] = useState(existing?.submitted ? true : false);
  const [piqUsed, setPiqUsed] = useState(existing?.piq_used_materially ? true : false);
  const [mostUseful, setMostUseful] = useState(existing?.most_useful || '');
  const [whatMissing, setWhatMissing] = useState(existing?.what_was_missing || '');
  const [clientFeedback, setClientFeedback] = useState(existing?.client_feedback || '');
  const [saving, setSaving] = useState(false);

  // Build a usage hint string from the summary so the user remembers what
  // they actually did with the scan.
  const usageHint = (() => {
    const bits = [];
    if (usageSummary.briefing_exported) bits.push(`exported briefing × ${usageSummary.briefing_exported}`);
    if (usageSummary.template_generated) bits.push(`generated template × ${usageSummary.template_generated}`);
    if (usageSummary.template_drafted) bits.push(`AI drafted template × ${usageSummary.template_drafted}`);
    if (usageSummary.reference_copied) bits.push(`copied reference × ${usageSummary.reference_copied}`);
    if (usageSummary.match_opened) bits.push(`opened ${usageSummary.match_opened} match${usageSummary.match_opened > 1 ? 'es' : ''}`);
    if (usageSummary.match_downloaded) bits.push(`downloaded ${usageSummary.match_downloaded} match${usageSummary.match_downloaded > 1 ? 'es' : ''}`);
    if (usageSummary.snippet_copied) bits.push(`copied ${usageSummary.snippet_copied} snippet${usageSummary.snippet_copied > 1 ? 's' : ''}`);
    return bits.join(' · ');
  })();

  async function handleSave() {
    setSaving(true);
    await onSave({
      outcome, submitted, piq_used_materially: piqUsed,
      most_useful: mostUseful, what_was_missing: whatMissing,
      client_feedback: clientFeedback,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,14,12,.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl bg-surface-container w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b flex items-baseline justify-between" style={{ borderColor: '#4d4636' }}>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#d0c5b0' }}>Bid outcome</div>
            <h2 className="font-serif text-xl mt-0.5">{scanName}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: '#99907d' }}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {usageHint && (
            <div className="rounded-lg p-3 text-xs" style={{ background: '#1d1b19', color: '#d0c5b0' }}>
              <span className="font-semibold" style={{ color: '#e6e2de' }}>You used this scan to: </span>{usageHint}
            </div>
          )}

          {/* Outcome */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: '#d0c5b0' }}>Outcome</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { val: 'won',     label: '★ Won',         color: '#7bd07a' },
                { val: 'lost',    label: '✕ Lost',        color: '#ffb4ab' },
                { val: 'pending', label: '◷ Pending',     color: '#b8962e' },
                { val: 'no_bid',  label: '✕ Did not bid', color: '#d0c5b0' },
              ].map(opt => (
                <button key={opt.val} onClick={() => setOutcomeVal(opt.val)}
                  className="text-xs py-2 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: outcome === opt.val ? opt.color : '#4d4636',
                    background: outcome === opt.val ? opt.color + '14' : 'white',
                    color: outcome === opt.val ? opt.color : '#9b8e80',
                    fontWeight: outcome === opt.val ? 600 : 400,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submitted + PIQ used checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-lg border" style={{ borderColor: '#4d4636' }}>
              <input type="checkbox" checked={submitted} onChange={e => setSubmitted(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium" style={{ color: '#e6e2de' }}>Submitted to client</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#d0c5b0' }}>Tick if the bid was actually submitted (not just drafted).</div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-lg border" style={{ borderColor: '#4d4636' }}>
              <input type="checkbox" checked={piqUsed} onChange={e => setPiqUsed(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium" style={{ color: '#e6e2de' }}>ProposalIQ contributed materially</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#d0c5b0' }}>Used the verdict, copied snippets, applied recommendations, etc.</div>
              </div>
            </label>
          </div>

          {/* Free text */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#d0c5b0' }}>What was most useful?</label>
            <DebouncedTextarea value={mostUseful} onCommit={setMostUseful} delay={300}
              rows={2} placeholder="e.g. The matched proposals from the HMRC contract, the gap analysis flagging DSPT compliance, the win strategy opening narrative…"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#4d4636' }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#d0c5b0' }}>What was missing or wrong?</label>
            <DebouncedTextarea value={whatMissing} onCommit={setWhatMissing} delay={300}
              rows={2} placeholder="e.g. Should have flagged the social value requirement, off-sector matches in cross-sector list, win strategy too generic…"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#4d4636' }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: '#d0c5b0' }}>Client feedback (optional)</label>
            <DebouncedTextarea value={clientFeedback} onCommit={setClientFeedback} delay={300}
              rows={2} placeholder="e.g. Strong on technical, weak on commercials. They noted the 47-trust scale claim specifically."
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y"
              style={{ borderColor: '#4d4636' }} />
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#4d4636', background: '#1d1b19' }}>
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg" style={{ color: '#d0c5b0' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            style={{ background: '#1e4a52', color: 'white' }}>
            {saving ? 'Saving…' : 'Save outcome'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default OutcomeCaptureModal;
