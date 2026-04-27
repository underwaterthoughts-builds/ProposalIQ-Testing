import { useState, useEffect, useRef, useCallback } from 'react';
import { Spinner } from './ui';

// Shared chat surface used by both /assistant (full page) and the
// floating widget in Layout.jsx. Streams from /api/chat/message via
// fetch + ReadableStream parsing of Server-Sent Events. Persists
// sessionId in localStorage so the conversation survives page reloads
// and stays in sync between the widget and the full page.
//
// Props:
//   variant: 'full' | 'widget'   — affects sizing/density only
//   onClose?: () => void         — only used by widget
//   onOpenFull?: () => void      — only used by widget; navigates to /assistant

const STORAGE_KEY = 'piq.assistant.sessionId';

export default function AssistantChat({ variant = 'full', onClose, onOpenFull }) {
  const [messages, setMessages] = useState([]); // {role, content, toolCalls?}
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [activeToolCalls, setActiveToolCalls] = useState([]); // currently running
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // Restore session on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      setSessionId(saved);
      // Hydrate prior messages from the server
      fetch(`/api/chat/session?id=${encodeURIComponent(saved)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.messages) {
            setMessages(d.messages.map(m => ({
              role: m.role,
              content: m.content,
              toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls : null,
            })));
          }
        })
        .catch(() => {});
    }
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming, activeToolCalls.length]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setError('');

    // Optimistic user message
    setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', streaming: true }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const r = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by double newlines
        let split;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, split).trim();
          buffer = buffer.slice(split + 2);
          if (!frame || frame.startsWith(':')) continue;
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt;
            try { evt = JSON.parse(payload); } catch { continue; }
            handleEvent(evt);
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        setError(e?.message || 'stream failed');
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 && m.streaming ? { ...m, streaming: false, content: m.content || '(no response)' } : m));
      }
    }
    setStreaming(false);
    setActiveToolCalls([]);
    abortRef.current = null;
  }, [input, sessionId, streaming]);

  function handleEvent(evt) {
    switch (evt.type) {
      case 'session': {
        setSessionId(evt.sessionId);
        try { localStorage.setItem(STORAGE_KEY, evt.sessionId); } catch {}
        break;
      }
      case 'text': {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: (last.content || '') + (evt.text || '') };
          }
          return next;
        });
        break;
      }
      case 'tool_call': {
        setActiveToolCalls(prev => [...prev, { id: evt.id, name: evt.name, input: evt.input }]);
        break;
      }
      case 'tool_result': {
        setActiveToolCalls(prev => prev.filter(t => t.id !== evt.id));
        // Stamp tool calls onto the assistant message so they persist after
        // streaming ends (next history fetch will include them too).
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            const toolCalls = Array.isArray(last.toolCalls) ? [...last.toolCalls] : [];
            toolCalls.push({ id: evt.id, name: evt.name, ok: evt.ok });
            next[next.length - 1] = { ...last, toolCalls };
          }
          return next;
        });
        break;
      }
      case 'done': {
        setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
        break;
      }
      case 'error': {
        setError(evt.error || 'error');
        break;
      }
    }
  }

  function cancel() {
    if (abortRef.current) abortRef.current.abort();
  }

  async function newConversation() {
    if (streaming) cancel();
    setMessages([]);
    setSessionId(null);
    setError('');
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  const isWidget = variant === 'widget';

  return (
    <div className={`flex flex-col h-full bg-surface text-on-surface ${isWidget ? '' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-primary text-base">smart_toy</span>
          <span className="font-headline text-sm font-bold text-on-surface truncate">ProposalIQ Assistant</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={newConversation}
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors"
            title="Start a new conversation"
          >
            <span className="material-symbols-outlined text-base">add_comment</span>
          </button>
          {isWidget && onOpenFull && (
            <button onClick={onOpenFull} className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors" title="Open full view">
              <span className="material-symbols-outlined text-base">open_in_full</span>
            </button>
          )}
          {isWidget && onClose && (
            <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors" title="Close">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-primary/40 mb-3">chat_bubble</span>
            <p className="text-sm font-body max-w-xs mx-auto">
              Ask me about your repository, scans, team, or how to navigate the platform. I can search, compare scans, and explain bid verdicts.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {[
                'Show my recent scans',
                'What\'s my win rate by sector?',
                'Find proposals about brand campaigns',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-1.5 bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20 rounded-full transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message key={i} message={m} />
        ))}

        {streaming && activeToolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2">
            {activeToolCalls.map(t => (
              <span key={t.id} className="inline-flex items-center gap-1.5 text-[10px] font-label uppercase tracking-widest text-secondary bg-secondary/10 px-2 py-1 rounded-full">
                <Spinner size={10} /> {prettyToolName(t.name)}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-error-container/20 border border-error/30 text-error text-xs rounded">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-outline-variant/20 px-3 py-3 flex items-end gap-2 flex-shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask anything…"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none bg-surface-container-low border border-outline-variant/30 text-on-surface text-sm px-3 py-2 rounded-md focus:outline-none focus:border-primary placeholder:text-outline disabled:opacity-50"
          style={{ maxHeight: '120px' }}
        />
        {streaming ? (
          <button onClick={cancel} className="px-3 py-2 bg-error-container text-on-error-container text-xs font-label font-bold uppercase tracking-widest rounded">
            Stop
          </button>
        ) : (
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="px-3 py-2 bg-primary text-on-primary text-xs font-label font-bold uppercase tracking-widest rounded disabled:opacity-30"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

function Message({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'bg-primary/10 text-on-surface' : 'bg-surface-container-low text-on-surface'} px-3.5 py-2.5 rounded-lg text-sm font-body leading-relaxed`}>
        {message.content ? (
          <pre className="whitespace-pre-wrap font-body break-words">{message.content}</pre>
        ) : message.streaming ? (
          <span className="text-on-surface-variant text-xs italic">Thinking…</span>
        ) : (
          <span className="text-on-surface-variant text-xs italic">No response</span>
        )}
        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.toolCalls.map((t, i) => (
              <span key={i} className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                {t.ok === false ? '✕' : '✓'} {prettyToolName(t.name)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function prettyToolName(name) {
  const map = {
    list_projects: 'Listing projects',
    get_project: 'Loading project',
    search_projects: 'Searching repository',
    list_scans: 'Listing scans',
    get_scan: 'Loading scan',
    compare_scans: 'Comparing scans',
    list_team: 'Loading team',
    list_clients: 'Loading clients',
    get_dashboard_stats: 'Pulling stats',
  };
  return map[name] || name;
}
