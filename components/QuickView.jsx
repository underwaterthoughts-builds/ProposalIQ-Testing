import Link from 'next/link';
import { Spinner } from './ui';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function Section({ label, children, color = '#6b6456' }) {
  return (
    <div className="mb-8">
      <div className="text-[10px] font-mono uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color }}>
        <div className="w-4 h-px" style={{ background: color }} />
        {label}
      </div>
      {children}
    </div>
  );
}

function SignalBlock({ decision, score, confidence, rationale, conditions }) {
  const palette = {
    'Bid':             { bg: '#edf3ec', border: '#3d5c3a', text: '#1a3318', accent: '#3d5c3a', dot: '#6ab187' },
    'Conditional Bid': { bg: '#faf4e2', border: '#b8962e', text: '#4a3800', accent: '#b8962e', dot: '#b8962e' },
    'No Bid':          { bg: '#faeeeb', border: '#b04030', text: '#4a0f0a', accent: '#b04030', dot: '#b04030' },
  };
  const p = palette[decision] || palette['Conditional Bid'];
  return (
    <div className="rounded-2xl p-4 md:p-6 mb-6 md:mb-8 flex items-start gap-4 md:gap-6" style={{ background: p.bg, border: `1.5px solid ${p.border}30` }}>
      <div className="flex-shrink-0 text-center">
        <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: p.dot, boxShadow: `0 0 8px ${p.dot}60` }} />
        <div className="font-serif font-bold text-3xl leading-none" style={{ color: p.accent }}>{score}</div>
        <div className="text-[10px] font-mono uppercase tracking-widest mt-1" style={{ color: p.accent }}>Fit Score</div>
      </div>
      <div className="w-px self-stretch" style={{ background: p.border + '30' }} />
      <div className="flex-1">
        <div className="font-serif text-xl md:text-2xl font-bold mb-1" style={{ color: p.accent }}>{decision}</div>
        <div className="text-xs font-mono mb-3" style={{ color: p.accent + 'aa' }}>{confidence} confidence</div>
        {rationale?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rationale.map((r, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full" style={{ background: p.border + '18', color: p.text }}>
                {r}
              </span>
            ))}
          </div>
        )}
        {conditions?.length > 0 && (
          <div className="mt-3 text-xs" style={{ color: p.accent }}>
            <span className="font-semibold">Conditions: </span>{conditions.join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

function ThesisBlock({ text }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl p-6 mb-6" style={{ background: '#1e4a52', color: 'white' }}>
      <div className="text-[10px] font-mono uppercase tracking-widest mb-3 opacity-50">Winning Thesis</div>
      <p className="font-serif text-base md:text-xl leading-relaxed">{text}</p>
    </div>
  );
}

function PriorityCard({ item, index, type = 'priority' }) {
  const isPriority = type === 'priority';
  const accent = isPriority ? '#1e4a52' : '#b04030';
  const bg = isPriority ? '#e8f2f4' : '#faeeeb';
  const label = isPriority ? `Priority ${index + 1}` : `Risk ${index + 1}`;
  const prefix = isPriority ? '→' : '△';
  const text = typeof item === 'string' ? item : (item.priority || item.risk || item.title || '');
  const sub = typeof item === 'object' ? (item.rationale || item.mitigation || item.description || '') : '';

  return (
    <div className="rounded-xl p-4 flex gap-3" style={{ background: bg, border: `1px solid ${accent}18` }}>
      <div className="font-mono text-lg leading-none flex-shrink-0 mt-0.5" style={{ color: accent }}>{prefix}</div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: accent + '99' }}>{label}</div>
        <div className="text-sm font-medium leading-snug" style={{ color: accent === '#1e4a52' ? '#0f2e35' : '#4a0f0a' }}>{text}</div>
        {sub && <div className="text-xs mt-1.5 leading-relaxed" style={{ color: accent + '90' }}>{sub}</div>}
      </div>
    </div>
  );
}

function QuickMatchCard({ match: m }) {
  const meta = m.ai_metadata || {};
  const isWon = m.outcome === 'won';
  const explanation = m.match_explanation?.recommended_use || m.match_explanation?.problem_similarity || null;

  return (
    <Link href={`/repository/${m.id}`}>
      <div className="rounded-xl p-4 border flex gap-3 items-start cursor-pointer hover:shadow-md transition-all group" style={{ background: 'white', borderColor: '#ddd5c4' }}>
        <div className="flex-shrink-0 w-2 self-stretch rounded-full" style={{ background: isWon ? '#6ab187' : '#ddd5c4' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-sm font-semibold leading-snug">{m.name}</div>
            <span className="flex-shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: isWon ? '#edf3ec' : '#f0ebe0', color: isWon ? '#3d5c3a' : '#6b6456' }}>
              {isWon ? '✓ Won' : m.outcome}
            </span>
          </div>
          <div className="text-xs mb-2" style={{ color: '#9b8e80' }}>{m.client} · {m.date_submitted?.slice(0, 4)}</div>
          {explanation && <p className="text-xs leading-relaxed" style={{ color: '#6b6456' }}>{explanation}</p>}
          {!explanation && (meta.key_themes || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(meta.key_themes || []).slice(0, 3).map((t, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: '#e8f2f4', color: '#1e4a52' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-sm opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#1e4a52' }}>→</div>
      </div>
    </Link>
  );
}

function StyleBlock({ style }) {
  if (!style) return null;
  return (
    <div className="rounded-xl p-4 border" style={{ background: '#f8f6f2', borderColor: '#ddd5c4' }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-mono px-2.5 py-1 rounded-full" style={{ background: '#1e4a52', color: 'white' }}>
          {style.primary_style}
        </span>
        <span className="text-xs font-mono" style={{ color: '#6b6456' }}>{style.tone}</span>
      </div>
      {style.style_description && <p className="text-sm leading-relaxed" style={{ color: '#3a3530' }}>{style.style_description}</p>}
      {style.evidence_approach && <p className="text-xs mt-2" style={{ color: '#6b6456' }}>Evidence: {style.evidence_approach}</p>}
      {style.best_used_for?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {style.best_used_for.slice(0, 3).map((b, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#f0ebe0', color: '#6b6456' }}>{b}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickNewsCard({ item: n }) {
  return (
    <div className="rounded-xl border overflow-hidden flex flex-col" style={{ background: 'white', borderColor: '#ddd5c4' }}>
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: '#e8f2f4', color: '#1e4a52' }}>{n.source}</span>
          <span className="text-[10px] font-mono" style={{ color: '#9b8e80' }}>{n.date}</span>
        </div>
        <h3 className="text-sm font-semibold leading-snug mb-2">{n.title}</h3>
        <div className="text-xs leading-relaxed rounded-lg p-2.5" style={{ background: '#faf4e2', color: '#8a6200' }}>
          {n.why_it_matters || n.snippet}
        </div>
      </div>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 border-t text-xs flex items-center justify-between transition-colors hover:bg-gray-50"
          style={{ borderColor: '#f0ebe0', color: '#1e4a52' }}>
          <span className="truncate">{n.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
          <span className="flex-shrink-0 ml-2">↗</span>
        </a>
      )}
    </div>
  );
}

function WritingInsightRow({ w }) {
  const scoreColor = (s) => !s ? '#ddd5c4' : s >= 75 ? '#3d5c3a' : s >= 55 ? '#b8962e' : '#b04030';
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0" style={{ borderColor: '#f0ebe0' }}>
      <Link href={`/repository/${w.project_id}`} className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate hover:text-teal transition-colors">{w.project_name}</div>
        <div className="text-xs mt-0.5" style={{ color: w.outcome === 'won' ? '#3d5c3a' : '#b04030' }}>{w.outcome} · {w.match_label}</div>
        {w.style_classification && <div className="text-[10px] font-mono mt-0.5" style={{ color: '#9b8e80' }}>{w.style_classification.primary_style}</div>}
      </Link>
      <div className="flex gap-3 flex-shrink-0">
        {[['W', w.writing_score], ['A', w.approach_score], ['C', w.credibility_score]].map(([l, s]) => (
          <div key={l} className="text-center w-8">
            <div className="font-mono text-sm font-bold" style={{ color: scoreColor(s) }}>{s || '—'}</div>
            <div className="text-[9px] font-mono" style={{ color: '#9b8e80' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsefulLine({ snippet }) {
  if (!snippet) return null;
  const text = snippet.adapted || snippet.text;
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#ddd5c4' }}>
      <div className="p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: snippet.adapted ? '#b8962e' : '#6b6456' }}>
          {snippet.adapted ? '✎ Adapted for this bid' : '✎ A line that worked'}
        </div>
        <blockquote className="text-sm italic leading-relaxed" style={{ color: '#1a1a1a', borderLeft: '3px solid #b8962e', paddingLeft: '12px' }}>
          "{text}"
        </blockquote>
        {snippet.why_it_works && <p className="text-xs mt-2" style={{ color: '#6b6456' }}>{snippet.why_it_works}</p>}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#e8f2f4', color: '#1e4a52' }}>{snippet.use_case}</span>
          {snippet.source_proposal && <span className="text-[10px]" style={{ color: '#9b8e80' }}>from: {snippet.source_proposal}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function QuickView({ scan, scanId, onExport, onTemplate, onDelete, exporting, generatingTemplate, deleting, clientIntel }) {
  const rfpData = scan.rfp_data || {};
  const matches = scan.matched_proposals || [];
  const gaps = scan.gaps || [];
  const news = scan.news || [];
  const winStrategy = scan.win_strategy || null;
  const winningLanguage = scan.winning_language || [];
  const bidScore = scan.bid_score || null;
  const writingInsights = (scan.writing_insights || []).slice(0, 5);

  // Pull the best style from top matched won proposal
  const topWon = matches.find(m => m.outcome === 'won' && m.style_classification);
  const recommendedStyle = topWon?.style_classification || null;

  // Curate top 3 priorities and risks
  const topPriorities = (winStrategy?.priorities || []).slice(0, 3);
  const topRisks = [
    ...(winStrategy?.risks || []).slice(0, 2),
    ...(gaps.filter(g => g.priority === 'high').slice(0, 1)),
  ].slice(0, 3);

  // Best useful line — prefer adapted
  const bestLine = winningLanguage.find(s => s.adapted) || winningLanguage[0] || null;

  // Copy to clipboard summary
  function copyBriefing() {
    const lines = [
      `QUICK BRIEF — ${scan.name}`,
      `${rfpData.client || 'Client'} · ${rfpData.sector || 'Unknown sector'} · ${rfpData.deadline ? 'Deadline: ' + rfpData.deadline : ''}`,
      '',
      bidScore ? `RECOMMENDATION: ${bidScore.decision} (${bidScore.score}/100)` : '',
      bidScore?.rationale?.length ? bidScore.rationale.join(' · ') : '',
      '',
      winStrategy?.winning_thesis ? `ANGLE:\n${winStrategy.winning_thesis}` : '',
      '',
      topPriorities.length ? `TOP PRIORITIES:\n${topPriorities.map((p, i) => `${i+1}. ${typeof p === 'string' ? p : p.priority || p.text || ''}`).join('\n')}` : '',
      '',
      topRisks.length ? `WATCH OUT FOR:\n${topRisks.map((r, i) => `${i+1}. ${typeof r === 'string' ? r : r.risk || r.title || ''}`).join('\n')}` : '',
      '',
      matches.slice(0, 3).length ? `PAST WORK TO REFERENCE:\n${matches.slice(0, 3).map(m => `- ${m.name} (${m.outcome}, ${m.date_submitted?.slice(0, 4)})`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
  }

  if (scan.status === 'processing') {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: '#faf7f2' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#1e4a52' }}>
            <Spinner size={24} color="white" />
          </div>
          <div className="font-serif text-xl mb-2">Analysing your brief…</div>
          <p className="text-sm" style={{ color: '#6b6456' }}>ProposalIQ is cross-referencing your repository, identifying gaps, and building your intelligence brief. Usually 30–60 seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#faf7f2' }}>
      {/* Hero / Brief header */}
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6 border-b" style={{ borderColor: '#e8e0d0', background: 'white' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: '#9b8e80' }}>
                Intelligence Brief · Quick View
              </div>
              <h1 className="font-serif text-xl md:text-3xl leading-tight mb-1">{scan.name}</h1>
              <div className="text-sm" style={{ color: '#6b6456' }}>
                {rfpData.client && <span>{rfpData.client}</span>}
                {rfpData.sector && <span> · {rfpData.sector}</span>}
                {rfpData.deadline && <span> · Deadline: {rfpData.deadline}</span>}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button onClick={copyBriefing}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:bg-cream"
                style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
                ⊡ Copy Brief
              </button>
              <button onClick={onExport} disabled={exporting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:bg-cream"
                style={{ borderColor: '#ddd5c4', color: '#6b6456' }}>
                {exporting ? 'Exporting…' : '↓ Full Export'}
              </button>
              <button onClick={onTemplate} disabled={generatingTemplate}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all"
                style={{ background: '#1e4a52' }}>
                {generatingTemplate ? 'Building…' : '📄 Template'}
              </button>
            </div>
          </div>

          {/* Client intel banner */}
          {clientIntel && (clientIntel.client || clientIntel.projects?.length > 0) && (
            <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#e8f2f4', border: '1px solid rgba(30,74,82,.15)' }}>
              <div className="text-sm" style={{ color: '#1e4a52' }}>◎</div>
              <div className="text-sm" style={{ color: '#1e4a52' }}>
                <span className="font-semibold">You've worked with {rfpData.client} before</span> — {clientIntel.projects?.length || 0} project{clientIntel.projects?.length !== 1 ? 's' : ''},
                {clientIntel.projects?.filter(p => p.outcome === 'won').length > 0 && ` ${clientIntel.projects.filter(p => p.outcome === 'won').length} won`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl mx-auto">

        {/* Fit signal */}
        {bidScore && (
          <SignalBlock
            decision={bidScore.decision}
            score={bidScore.score}
            confidence={bidScore.confidence}
            rationale={bidScore.rationale}
            conditions={bidScore.conditions}
          />
        )}

        {/* Winning thesis */}
        {winStrategy?.winning_thesis && <ThesisBlock text={winStrategy.winning_thesis} />}
        {!winStrategy?.winning_thesis && winStrategy?.opening_narrative && <ThesisBlock text={winStrategy.opening_narrative} />}

        {/* Priorities */}
        {topPriorities.length > 0 && (
          <Section label="Top Priorities" color="#1e4a52">
            <div className="grid grid-cols-1 gap-3">
              {topPriorities.map((p, i) => <PriorityCard key={i} item={p} index={i} type="priority" />)}
            </div>
          </Section>
        )}

        {/* Risks / Gaps */}
        {topRisks.length > 0 && (
          <Section label="Watch Out For" color="#b04030">
            <div className="grid grid-cols-1 gap-3">
              {topRisks.map((r, i) => <PriorityCard key={i} item={r} index={i} type="risk" />)}
            </div>
          </Section>
        )}

        {/* Matched proposals */}
        {matches.length > 0 && (
          <Section label="Best Matched Past Work" color="#3d5c3a">
            <div className="space-y-2">
              {matches.slice(0, 5).map((m, i) => <QuickMatchCard key={m.id} match={m} />)}
            </div>
            {matches.length > 5 && (
              <div className="text-xs text-center mt-2" style={{ color: '#9b8e80' }}>+ {matches.length - 5} more in Pro view</div>
            )}
          </Section>
        )}

        {/* Writing style */}
        {recommendedStyle && (
          <Section label="Recommended Writing Style" color="#b8962e">
            <StyleBlock style={recommendedStyle} />
          </Section>
        )}

        {/* Writing insights */}
        {writingInsights.length > 0 && (
          <Section label="Writing Quality — Matched Proposals" color="#6b6456">
            <div className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: '#ddd5c4' }}>
              <div className="grid text-[10px] font-mono uppercase tracking-widest px-4 py-2 border-b" style={{ gridTemplateColumns: '1fr 90px', background: '#f8f6f2', borderColor: '#f0ebe0', color: '#9b8e80' }}>
                <span>Proposal</span><span className="text-right">W · A · C</span>
              </div>
              <div className="divide-y" style={{ '--tw-divide-color': '#f0ebe0' }}>
                {writingInsights.map(w => <WritingInsightRow key={w.project_id} w={w} />)}
              </div>
            </div>
          </Section>
        )}

        {/* A useful line */}
        {bestLine && (
          <Section label="A Line Worth Adapting" color="#b8962e">
            <UsefulLine snippet={bestLine} />
          </Section>
        )}

        {/* Industry news */}
        {news.length > 0 && (
          <Section label="Industry Context" color="#2d6b78">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {news.slice(0, 4).map((n, i) => <QuickNewsCard key={i} item={n} />)}
            </div>
          </Section>
        )}

        {/* Export tools */}
        <Section label="Export & Build" color="#6b6456">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: '#ddd5c4' }}>
              <div className="p-4">
                <div className="text-2xl mb-2">📄</div>
                <div className="text-sm font-semibold mb-1">Proposal Template</div>
                <div className="text-xs mb-3" style={{ color: '#6b6456' }}>Word doc with sections, guidance notes, and winning language pre-filled from your matches.</div>
              </div>
              <div className="flex border-t" style={{ borderColor: '#f0ebe0' }}>
                <button onClick={() => onTemplate(false)} disabled={generatingTemplate}
                  className="flex-1 py-2.5 text-xs font-medium border-r transition-all hover:bg-cream no-min-h" style={{ borderColor: '#f0ebe0', color: '#1e4a52' }}>
                  📄 Guidance
                </button>
                <button onClick={() => onTemplate(true)} disabled={generatingTemplate}
                  className="flex-1 py-2.5 text-xs font-medium transition-all hover:bg-cream no-min-h" style={{ color: '#1e4a52' }}>
                  ✍ AI Draft
                </button>
              </div>
            </div>
            <button onClick={onExport} disabled={exporting}
              className="rounded-xl p-5 text-left border transition-all hover:border-teal hover:shadow-sm"
              style={{ background: 'white', borderColor: '#ddd5c4' }}>
              <div className="text-2xl mb-2">↓</div>
              <div className="text-sm font-semibold mb-1">Full Briefing</div>
              <div className="text-xs" style={{ color: '#6b6456' }}>Complete HTML briefing doc with all intelligence — matches, gaps, strategy, winning language.</div>
            </button>
            <button onClick={copyBriefing}
              className="rounded-xl p-5 text-left border transition-all hover:border-teal hover:shadow-sm"
              style={{ background: 'white', borderColor: '#ddd5c4' }}>
              <div className="text-2xl mb-2">⊡</div>
              <div className="text-sm font-semibold mb-1">Copy Summary</div>
              <div className="text-xs" style={{ color: '#6b6456' }}>Plain-text brief for Slack, email, or Notion — bid signal, priorities, angle, past work.</div>
            </button>
            <button onClick={onDelete} disabled={deleting}
              className="rounded-xl p-5 text-left border transition-all hover:border-red-200"
              style={{ background: 'white', borderColor: '#ddd5c4' }}>
              <div className="text-2xl mb-2" style={{ color: '#b04030' }}>✕</div>
              <div className="text-sm font-semibold mb-1" style={{ color: '#b04030' }}>Delete Scan</div>
              <div className="text-xs" style={{ color: '#6b6456' }}>Remove this scan and the uploaded RFP file permanently.</div>
            </button>
          </div>
        </Section>

      </div>
    </div>
  );
}
