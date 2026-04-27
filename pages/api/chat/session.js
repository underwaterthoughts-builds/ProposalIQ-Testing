import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// GET /api/chat/session            → list recent sessions
// GET /api/chat/session?id=<sid>   → return full message history for a session
// DELETE /api/chat/session?id=<sid>→ wipe a session (user-scoped)
//
// Sessions are user-scoped — the WHERE user_id = ? guard means a user
// can only ever read or delete their own conversations.

async function handler(req, res) {
  const db = getDb();
  const userId = req.user.id;

  if (req.method === 'GET') {
    const sessionId = (req.query?.id || '').toString().trim();
    if (sessionId) {
      const rows = db.prepare(
        'SELECT id, role, content, tool_calls, created_at FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC'
      ).all(userId, sessionId);
      return res.status(200).json({
        sessionId,
        messages: rows.map(r => ({
          id: r.id,
          role: r.role,
          content: r.content,
          tool_calls: r.tool_calls ? safeParse(r.tool_calls) : null,
          created_at: r.created_at,
        })),
      });
    }

    // List sessions: latest message per session, oldest 30
    const rows = db.prepare(`
      SELECT session_id,
             MAX(created_at) as last_at,
             COUNT(*) as message_count,
             (SELECT content FROM chat_messages WHERE user_id = ? AND session_id = m.session_id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_user_message
      FROM chat_messages m
      WHERE m.user_id = ?
      GROUP BY session_id
      ORDER BY last_at DESC
      LIMIT 30
    `).all(userId, userId);
    return res.status(200).json({
      sessions: rows.map(r => ({
        sessionId: r.session_id,
        last_at: r.last_at,
        message_count: r.message_count,
        title: (r.first_user_message || '').slice(0, 80),
      })),
    });
  }

  if (req.method === 'DELETE') {
    const sessionId = (req.query?.id || '').toString().trim();
    if (!sessionId) return res.status(400).json({ error: 'id required' });
    const r = db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?').run(userId, sessionId);
    return res.status(200).json({ ok: true, deleted: r.changes });
  }

  return res.status(405).end();
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default requireAuth(handler);
