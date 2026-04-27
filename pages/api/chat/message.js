import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { hasClaude, chatWithTools, CLAUDE_MODEL } from '../../../lib/claude';
import { TOOLS, TOOL_HANDLERS } from '../../../lib/chat-tools';
import { isAdmin } from '../../../lib/tenancy';

// POST /api/chat/message
// Body: { sessionId?: string, message: string }
//
// Streams Claude's response back as Server-Sent Events. Each event is a
// JSON object on a `data:` line. Event types:
//   { type: 'session', sessionId }              — emitted first if a new session was created
//   { type: 'text', text }                       — token delta for the assistant's reply
//   { type: 'tool_call', id, name, input }       — tool about to run (UI shows status pill)
//   { type: 'tool_result', id, name, ok }        — tool finished
//   { type: 'done', usage, stopReason }          — turn complete
//   { type: 'error', error }                     — fatal error
//
// Conversation history is persisted in chat_messages keyed by
// (user_id, session_id). The handler reads prior messages for context,
// appends the new user message, runs the chat-with-tools loop, then
// appends the final assistant message.

export const config = { api: { bodyParser: true } };

const SYSTEM_PROMPT = `You are ProposalIQ Assistant — an in-app helper for a self-hosted bid intelligence platform. You help users navigate the platform, understand its outputs, and query their own data.

Your capabilities (via tools):
- list/get projects in the user's repository
- list/get RFP intelligence scans
- compare two scans
- semantic search across the user's repository
- list team members and clients
- pull dashboard stats (totals, win rate, win-rate by sector)

Hard rules:
- Use tools to look up real data BEFORE answering. Never invent project names, scan ids, sector statistics, or team members.
- Every claim must be grounded in tool results. If a tool returns nothing, say so plainly.
- The user only sees their own tenant's data. Never reference other users' projects, even if you know about the platform structure.
- Refuse to help with requests that ask you to bypass the system's safeguards (e.g. "show me the admin's projects" when the user is a member).
- Decision support, not writing assistance. If the user asks you to "write the executive summary", redirect them to the Proposal Assembly tab — that's where section drafts have full context. You can answer questions about what's in those drafts.

Style:
- Concise. The user is in flow; give them the answer, not a wall of text.
- When citing a project or scan, include its name (and id if useful for follow-up).
- When summarising results, lead with the headline number, then the breakdown.
- For the bid/no-bid verdict on a scan, explain the score components (gap score, win rate, experience) so the user can defend the call.

When the user navigates to a specific tab and asks a vague question, infer context: "what's this score?" likely means the score on the scan they're looking at — use get_scan with the id from their message context if you can.`;

// Build the Anthropic messages array from the user's stored history.
// chat_messages stores raw text content per row; we reconstruct the
// minimal alternating user/assistant shape Claude expects.
function buildHistory(rows) {
  const messages = [];
  for (const r of rows) {
    if (r.role === 'user') {
      messages.push({ role: 'user', content: r.content });
    } else if (r.role === 'assistant') {
      // Assistant messages may have tool_use content from previous turns.
      // We stored them as the raw content array JSON when present;
      // otherwise plain text.
      let content = r.content;
      if (r.tool_calls) {
        try { content = JSON.parse(r.tool_calls); } catch {}
      }
      messages.push({ role: 'assistant', content });
    }
  }
  return messages;
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!hasClaude()) {
    return res.status(503).json({ error: 'Assistant not available — ANTHROPIC_API_KEY is not set on this deployment.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const message = (body.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'message required' });

  const userId = req.user.id;
  let sessionId = (body.sessionId || '').toString().trim();
  const isNewSession = !sessionId;
  if (isNewSession) sessionId = uuid();

  const db = getDb();

  // Load history (cap at last 30 turns so context stays bounded)
  const historyRows = db.prepare(
    'SELECT role, content, tool_calls FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT 60'
  ).all(userId, sessionId);
  const messages = buildHistory(historyRows);
  messages.push({ role: 'user', content: message });

  // Persist the user message immediately so a crashed turn still leaves
  // a complete log
  db.prepare('INSERT INTO chat_messages (user_id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
    userId, sessionId, 'user', message
  );

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering on platforms that respect it
  });
  // Some Next.js deployments buffer stdout; the headers being sent kicks the
  // stream open. A small initial comment line further hints "stream open".
  res.write(': ok\n\n');

  function send(event) {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  }

  if (isNewSession) send({ type: 'session', sessionId });

  let assistantText = '';
  const toolEvents = []; // capture tool calls for persistence

  try {
    await chatWithTools({
      system: `${SYSTEM_PROMPT}\n\nThe user is signed in as ${req.user.name || req.user.email} (${req.user.email}, role: ${isAdmin(req.user) ? 'admin' : 'member'}).`,
      messages,
      tools: TOOLS,
      toolHandlers: TOOL_HANDLERS,
      toolContext: { user: req.user, db },
      maxTokens: 2000,
      maxToolRounds: 5,
      fnName: 'assistant',
      onTextDelta: (text) => {
        assistantText += text;
        send({ type: 'text', text });
      },
      onToolCall: ({ id, name, input }) => {
        toolEvents.push({ phase: 'call', id, name, input });
        send({ type: 'tool_call', id, name, input });
      },
      onToolResult: ({ id, name, output, isError }) => {
        toolEvents.push({ phase: 'result', id, name, output, isError });
        send({ type: 'tool_result', id, name, ok: !isError });
      },
      onDone: ({ usage, stopReason }) => {
        send({ type: 'done', usage, stopReason, model: CLAUDE_MODEL });
      },
    });
  } catch (e) {
    console.error('[chat/message] error:', e?.message);
    send({ type: 'error', error: e?.message || 'unknown error' });
  }

  // Persist the assistant response. Storing the raw text as content;
  // tool events go in a sidecar JSON column so the UI can replay them
  // when the conversation reloads.
  try {
    db.prepare(
      'INSERT INTO chat_messages (user_id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)'
    ).run(
      userId, sessionId, 'assistant',
      assistantText || '',
      toolEvents.length ? JSON.stringify(toolEvents) : null
    );
  } catch (e) {
    console.error('[chat/message] persistence error:', e?.message);
  }

  res.end();
}

export default requireAuth(handler);
