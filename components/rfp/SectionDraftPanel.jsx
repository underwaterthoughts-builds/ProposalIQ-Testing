import { useEffect, useState, memo } from 'react';
import Link from 'next/link';
import { DebouncedTextarea } from '../../lib/useDebounce';
import QaAdjustmentsFooter from './QaAdjustmentsFooter';

// ── Section Draft Panel — Wave 4 source-linked drafting ──────────────────
// Inline panel that appears below a section in the Assembly tab when the
// user has generated a draft. Shows:
//   · Confidence badge (high/medium/low) with the model's reason
//   · Editable draft text with [#1] and [EVIDENCE NEEDED:...] highlighting
//   · "Sources used" panel listing the matched proposals + winning language
//     snippets the model cited (clickable in the matches case)
//   · Edit / Regenerate / Accept / Discard controls
//
// Source links: the draft text uses [#1] [#2] markers — the panel resolves
// these to the actual proposals from the matches array via index. We
// preserve the markers in the editable text rather than rewriting them
// inline so the writer always sees what was cited.
const SectionDraftPanel = memo(function SectionDraftPanel({ draft, matches, winningLanguage, onUpdateText, onAccept, onRegenerate, onAmend, onDiscard, onClose, regenerating }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.draft_text || '');
  const [saving, setSaving] = useState(false);
  // Natural-language revise: when active, an inline textarea shows under
  // the action bar so the user can describe the change they want.
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [lastChangeSummary, setLastChangeSummary] = useState('');

  async function handleRevise() {
    const ins = reviseInstruction.trim();
    if (!ins) return;
    setRevising(true);
    setLastChangeSummary('');
    try {
      const summary = await onAmend?.(ins);
      setLastChangeSummary(summary || '');
      setReviseInstruction('');
      setReviseOpen(false);
    } finally {
      setRevising(false);
    }
  }

  // Sync text when draft changes (e.g. after regenerate)
  useEffect(() => { setText(draft.draft_text || ''); }, [draft.id, draft.draft_text]);

  // Resolve cited matches: the AI returns the IDs it actually cited.
  // Match those against the matches array to get the names/details.
  const citedMatches = (draft.cited_match_ids || [])
    .map(id => matches.find(m => m.id === id))
    .filter(Boolean);

  // Resolve cited language by L-index — winningLanguage is an array
  const citedLanguage = (draft.cited_language_ids || [])
    .map(id => {
      const idx = parseInt(String(id).replace(/^L/i, ''), 10) - 1;
      return idx >= 0 && idx < (winningLanguage || []).length ? winningLanguage[idx] : null;
    })
    .filter(Boolean);

  const confColor = draft.confidence === 'high' ? '#3d5c3a' :
                    draft.confidence === 'low'  ? '#b04030' : '#b8962e';
  const isAccepted = draft.status === 'accepted';

  async function handleSaveEdits() {
    setSaving(true);
    await onUpdateText(text);
    setSaving(false);
    setEditing(false);
  }

  // Build a list of past project + client name tokens we want to
  // highlight in the draft prose so the user can spot every reference
  // at a glance and verify it's the right one. Sorted longest-first so
  // multi-word names match before any subset of those words.
  const refTokens = (() => {
    const seen = new Set();
    const tokens = [];
    (matches || []).forEach(m => {
      [m.name, m.client].forEach(v => {
        const s = (v || '').trim();
        if (!s || s.length < 4) return;
        const lower = s.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        tokens.push(s);
      });
    });
    return tokens.sort((a, b) => b.length - a.length);
  })();
  const refRegex = refTokens.length > 0
    ? new RegExp('(' + refTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi')
    : null;

  // Highlighting helper — wraps [#N] match citations, [EVIDENCE NEEDED],
  // [TBC: ...] markers AND any reference to a past client / project name
  // in coloured spans so the writer can see at a glance what's a
  // placeholder vs a real reference, and verify each citation.
  function renderHighlighted(t) {
    if (!t) return null;
    const parts = t.split(/(\[#\d+\]|\[EVIDENCE NEEDED[^\]]*\]|\[TBC[^\]]*\])/g);
    return parts.map((part, i) => {
      if (/^\[#\d+\]$/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(30,74,82,.12)', color: '#7fb4bc' }}>{part}</span>;
      }
      if (/^\[EVIDENCE NEEDED/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(184,150,46,.18)', color: '#e8c357' }}>{part}</span>;
      }
      if (/^\[TBC/.test(part)) {
        return <span key={i} className="font-mono text-[11px] px-1 rounded" style={{ background: 'rgba(255,180,171,.18)', color: '#ffb4ab' }} title="Team role to assign — open the team page or edit inline">{part}</span>;
      }
      // Reference name highlighting — break the prose down further by ref
      // tokens. Tinted purple to distinguish from the marker colours.
      if (refRegex) {
        const subParts = part.split(refRegex);
        return (
          <span key={i}>
            {subParts.map((sp, j) => {
              if (refTokens.some(r => r.toLowerCase() === sp.toLowerCase())) {
                return <span key={j} className="px-1 rounded" style={{ background: 'rgba(183,196,255,.18)', color: '#b7c4ff' }} title="Past client or project — verify this reference is correct">{sp}</span>;
              }
              return sp;
            })}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="border-t" style={{ borderColor: '#2b2a27', background: '#1d1b19' }}>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#d0c5b0' }}>AI Draft</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: confColor + '14', color: confColor, border: `1px solid ${confColor}40` }}>
              {draft.confidence} confidence
            </span>
            {isAccepted && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: '#3d5c3a', color: 'white' }}>
                ✓ accepted
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[11px]" style={{ color: '#99907d' }}>hide</button>
        </div>

        {draft.confidence_reason && (
          <p className="text-[11px] italic mb-3" style={{ color: '#d0c5b0' }}>{draft.confidence_reason}</p>
        )}

        <QaAdjustmentsFooter adjustments={draft.qa_adjustments} count={draft.qa_adjustments_count} />

        {/* Draft body */}
        <div className="rounded-lg p-4 mb-3" style={{ background: '#211f1d', border: '1px solid #4d4636' }}>
          {editing ? (
            <DebouncedTextarea value={text} onCommit={setText} delay={400}
              rows={Math.max(8, text.split('\n').length + 2)}
              className="w-full text-sm leading-relaxed outline-none resize-y font-serif"
              style={{ color: '#e6e2de' }} />
          ) : (
            <p className="text-sm leading-relaxed font-serif whitespace-pre-wrap" style={{ color: '#e6e2de' }}>
              {renderHighlighted(text)}
            </p>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {!editing && !isAccepted && (
            <button onClick={() => setEditing(true)}
              className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
              ✎ Edit
            </button>
          )}
          {editing && (
            <>
              <button onClick={handleSaveEdits} disabled={saving}
                className="text-[11px] px-2.5 py-1.5 rounded font-medium" style={{ background: '#1e4a52', color: 'white' }}>
                {saving ? 'Saving…' : 'Save edits'}
              </button>
              <button onClick={() => { setText(draft.draft_text || ''); setEditing(false); }}
                className="text-[11px] px-2.5 py-1.5 rounded" style={{ color: '#d0c5b0' }}>
                Cancel
              </button>
            </>
          )}
          {!editing && (
            <>
              <button onClick={() => navigator.clipboard.writeText(text)}
                className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#d0c5b0' }}>
                ⎘ Copy
              </button>
              <button onClick={onRegenerate} disabled={regenerating}
                className="text-[11px] px-2.5 py-1.5 rounded border" style={{ borderColor: '#4d4636', color: '#7fb4bc' }}>
                {regenerating ? 'Regenerating…' : '⟳ Regenerate'}
              </button>
              {onAmend && (
                <button onClick={() => setReviseOpen(v => !v)} disabled={revising || regenerating}
                  className="text-[11px] px-2.5 py-1.5 rounded border"
                  style={{
                    borderColor: reviseOpen ? '#7fb4bc' : '#4d4636',
                    color: reviseOpen ? '#1e4a52' : '#d0c5b0',
                    background: reviseOpen ? 'rgba(127,180,188,.12)' : 'transparent',
                  }}>
                  💬 Revise with instruction
                </button>
              )}
              {!isAccepted && (
                <button onClick={onAccept}
                  className="text-[11px] px-2.5 py-1.5 rounded font-medium" style={{ background: '#3d5c3a', color: 'white' }}>
                  ✓ Accept draft
                </button>
              )}
              <button onClick={onDiscard}
                className="text-[11px] px-2.5 py-1.5 rounded border ml-auto" style={{ borderColor: '#f5c6c0', color: '#ffb4ab' }}>
                ✕ Discard
              </button>
            </>
          )}
        </div>

        {/* Natural-language revise panel — opens when "Revise with instruction"
            is clicked. The AI applies ONLY the requested change and preserves
            citations. */}
        {reviseOpen && !editing && (
          <div className="mb-4 rounded-md p-3" style={{ background: 'rgba(127,180,188,.08)', border: '1px solid rgba(127,180,188,.25)' }}>
            <div className="font-mono uppercase tracking-widest text-[10px] mb-2" style={{ color: '#7fb4bc' }}>
              Describe the change
            </div>
            <textarea
              value={reviseInstruction}
              onChange={e => setReviseInstruction(e.target.value)}
              placeholder="e.g. Add a paragraph about our Arabic-speaking team · Make the opening more confident · Remove the second case study · Cite [#2] earlier"
              rows={3}
              disabled={revising}
              className="w-full text-sm font-serif rounded p-2 bg-transparent border focus:outline-none focus:border-primary"
              style={{ borderColor: '#4d4636', color: '#e6e2de' }}
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button
                onClick={handleRevise}
                disabled={revising || !reviseInstruction.trim()}
                className="text-[11px] px-3 py-1.5 rounded font-medium disabled:opacity-40"
                style={{ background: '#1e4a52', color: 'white' }}
              >
                {revising ? 'Applying…' : 'Apply revision'}
              </button>
              <button
                onClick={() => { setReviseOpen(false); setReviseInstruction(''); }}
                disabled={revising}
                className="text-[11px] px-3 py-1.5 rounded"
                style={{ color: '#d0c5b0' }}
              >
                Cancel
              </button>
              <span className="text-[10px] ml-auto" style={{ color: '#99907d' }}>
                Citations and untouched text are preserved.
              </span>
            </div>
          </div>
        )}
        {lastChangeSummary && !reviseOpen && (
          <div className="mb-4 text-[11px] flex items-center gap-2 px-3 py-2 rounded" style={{ background: 'rgba(127,180,188,.06)', color: '#7fb4bc' }}>
            <span>✓</span>
            <span>{lastChangeSummary}</span>
            <button onClick={() => setLastChangeSummary('')} className="ml-auto opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Sources panel */}
        {(citedMatches.length > 0 || citedLanguage.length > 0 || (draft.evidence_needed || []).length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
            {citedMatches.length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(30,74,82,.06)', border: '1px solid rgba(30,74,82,.15)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#7fb4bc' }}>Matches cited</div>
                <ul className="space-y-1">
                  {citedMatches.map((m, i) => (
                    <li key={m.id}>
                      <Link href={`/repository/${m.id}`} className="hover:underline" style={{ color: '#7fb4bc' }}>
                        [#{i + 1}] {m.name}
                      </Link>
                      <span className="ml-1 opacity-60">({m.outcome})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {citedLanguage.length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(184,150,46,.08)', border: '1px solid rgba(184,150,46,.2)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#e8c357' }}>Language patterns</div>
                <ul className="space-y-1">
                  {citedLanguage.map((s, i) => (
                    <li key={i} className="italic" style={{ color: '#e4c366' }}>
                      "{(s.adapted || s.text || '').slice(0, 100)}{(s.adapted || s.text || '').length > 100 ? '…' : ''}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(draft.evidence_needed || []).length > 0 && (
              <div className="rounded p-3" style={{ background: 'rgba(176,64,48,.05)', border: '1px solid rgba(176,64,48,.15)' }}>
                <div className="font-mono uppercase tracking-widest mb-1.5" style={{ color: '#ffb4ab' }}>Writer must fill in</div>
                <ul className="space-y-1" style={{ color: '#7a3023' }}>
                  {(draft.evidence_needed || []).slice(0, 6).map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default SectionDraftPanel;
