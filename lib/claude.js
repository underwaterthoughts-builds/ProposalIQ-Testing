// ────────────────────────────────────────────────────────────────────────────
// Claude (Anthropic) — slim module for the in-app chat assistant.
//
// Just streaming + tool-calling. No critique loops, no JSON-mode helpers.
// The chat agent at /api/chat/message uses this to:
//   - stream tokens to the user via SSE
//   - call tools registered in lib/chat-tools.js (read-only, tenant-scoped)
//
// Cost tracking flows into the same ai_cost_log table used by gemini.js
// so admin sees Claude alongside OpenAI/Gemini in one dashboard.
// ────────────────────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

const CLAUDE_PRICING = {
  'claude-sonnet-4-5':  { input: 3.00, output: 15.00 },
  'claude-sonnet-4-6':  { input: 3.00, output: 15.00 },
  'claude-opus-4-7':    { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':   { input: 0.80, output: 4.00 },
};

let _client = null;
function client() {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

function hasClaude() { return !!process.env.ANTHROPIC_API_KEY; }

function logCost(model, usage, fnName) {
  if (!usage) return;
  try {
    const { logAiCost } = require('./gemini');
    if (typeof logAiCost === 'function') {
      logAiCost(model, usage.input_tokens || 0, usage.output_tokens || 0, fnName);
    }
  } catch {}
}

// Streamed messages with tool-calling. Yields events as the model
// generates: { type: 'text_delta', text } for prose tokens,
// { type: 'tool_use', id, name, input } when a tool is requested,
// { type: 'tool_result', id, output } after the caller invokes the tool,
// { type: 'done', usage } when finished.
//
// The caller is expected to be an async iterator consumer that:
//   - forwards text_delta to the user (SSE)
//   - on tool_use: invokes the tool, then continues the conversation
//     by passing the result back as a tool_result message and calling
//     this function again with the extended messages array.
//
// We implement the loop here as a helper (chatWithTools) that handles
// tool-call resolution server-side so the consumer just sees text
// deltas + final response.
async function* claudeStream({ system, messages, tools = [], maxTokens = 2000, fnName = 'claudeStream' }) {
  if (!hasClaude()) throw new Error('ANTHROPIC_API_KEY not set');
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : undefined,
    messages,
    tools: tools.length ? tools : undefined,
  };

  const stream = await client().messages.stream(params);

  // Forward incremental events.
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield { type: 'text_delta', text: event.delta.text || '' };
    }
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      // Tool use is resolved at the message level once the block completes
      // — we collect via finalMessage below.
    }
  }

  const finalMessage = await stream.finalMessage();
  logCost(CLAUDE_MODEL, finalMessage.usage, fnName);

  const toolUses = (finalMessage.content || []).filter(b => b.type === 'tool_use');
  if (toolUses.length) {
    yield { type: 'tool_uses', toolUses, assistantMessage: finalMessage };
  }

  yield { type: 'done', usage: finalMessage.usage, stopReason: finalMessage.stop_reason };
}

// Multi-turn chat loop with automatic tool-call resolution.
//
// onTextDelta(string)      — called as Claude writes prose
// onToolCall({id,name,input}) — called when a tool is about to run (status pill)
// onToolResult({id,output})  — called after a tool returns (UI can show results)
// onDone({usage, stopReason}) — called when the conversation turn ends
//
// toolHandlers is a Map<name, async (input, ctx) => any> registered server-side.
// ctx is whatever you want exposed to tools (typically the user + db handle).
async function chatWithTools({
  system,
  messages,
  tools,
  toolHandlers,
  toolContext,
  maxTokens = 2000,
  maxToolRounds = 5,
  fnName = 'chatWithTools',
  onTextDelta = () => {},
  onToolCall = () => {},
  onToolResult = () => {},
  onDone = () => {},
}) {
  // Defensive copy so we can append turn-by-turn without mutating caller's array.
  const conversation = [...messages];
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  for (let round = 0; round < maxToolRounds; round++) {
    let pendingToolUses = [];
    let assistantMessage = null;
    let lastUsage = null;
    let stopReason = null;

    for await (const event of claudeStream({
      system,
      messages: conversation,
      tools,
      maxTokens,
      fnName: `${fnName}.round${round}`,
    })) {
      if (event.type === 'text_delta') onTextDelta(event.text);
      if (event.type === 'tool_uses') {
        pendingToolUses = event.toolUses;
        assistantMessage = event.assistantMessage;
      }
      if (event.type === 'done') {
        lastUsage = event.usage || {};
        stopReason = event.stopReason;
        totalUsage.input_tokens += lastUsage.input_tokens || 0;
        totalUsage.output_tokens += lastUsage.output_tokens || 0;
      }
    }

    // No tool calls — turn is complete.
    if (!pendingToolUses.length) {
      onDone({ usage: totalUsage, stopReason });
      return;
    }

    // Append the assistant's tool-use message verbatim so the next turn
    // sees the same tool_use ids it referenced.
    if (assistantMessage) {
      conversation.push({ role: 'assistant', content: assistantMessage.content });
    }

    // Run each tool call serially (parallel risk: tool A's side effects
    // race tool B's read; serial is simpler and fine for read-only tools).
    const toolResultsBlock = [];
    for (const tu of pendingToolUses) {
      onToolCall({ id: tu.id, name: tu.name, input: tu.input });
      const handler = toolHandlers.get(tu.name);
      let output;
      let isError = false;
      if (!handler) {
        output = { error: `Unknown tool: ${tu.name}` };
        isError = true;
      } else {
        try {
          output = await handler(tu.input || {}, toolContext);
        } catch (e) {
          output = { error: e?.message || 'tool failed' };
          isError = true;
        }
      }
      onToolResult({ id: tu.id, name: tu.name, output, isError });
      toolResultsBlock.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: typeof output === 'string' ? output : JSON.stringify(output),
        is_error: isError,
      });
    }

    conversation.push({ role: 'user', content: toolResultsBlock });
    // Loop continues — Claude will see the tool results and either
    // call more tools or write a final response.
  }

  // Hit the round cap — emit done so the UI doesn't hang.
  onDone({ usage: totalUsage, stopReason: 'max_tool_rounds' });
}

module.exports = {
  hasClaude,
  CLAUDE_MODEL,
  CLAUDE_PRICING,
  claudeStream,
  chatWithTools,
};
