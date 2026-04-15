import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { scope, canAccess } from '../../../lib/tenancy';
import { safe } from '../../../lib/embeddings';

// ── Analysis-health endpoint ──────────────────────────────────────────────
// Classifies every project in the repository into a health bucket so the
// repository page can show a banner with the count of each category and
// offer a one-click bulk retry.
//
// Buckets:
//   ok              — indexing_status=complete AND ai_metadata has meaningful
//                     scores (at least one writing/approach/credibility
//                     overall_score > 0) OR a key_themes array
//   silently_empty  — indexing_status=complete but ai_metadata is empty /
//                     has no scores (a "soft failure" that the server
//                     records as success but the user sees as blank)
//   errored         — indexing_status=error
//   stuck_indexing  — indexing_status=indexing AND indexed_at > 10 min ago
//   unindexed       — indexing_status=pending or NULL
//
// GET  → returns counts + lists
// POST { ids: [...] } → kicks off /reindex on each with 3s stagger

const STUCK_MINUTES = 10;

function classify(project) {
  const status = project.indexing_status;
  if (status === 'error') return 'errored';
  if (status === 'indexing') {
    const ts = project.indexed_at ? new Date(project.indexed_at).getTime() : 0;
    const minutesAgo = ts ? (Date.now() - ts) / 60000 : Infinity;
    return minutesAgo > STUCK_MINUTES ? 'stuck_indexing' : 'ok';
  }
  if (status !== 'complete') return 'unindexed';

  const meta = safe(project.ai_metadata, {}) || {};
  const writing = meta.writing_quality?.overall_score || 0;
  const approach = meta.approach_quality?.overall_score || 0;
  const credibility = meta.credibility_signals?.overall_score || 0;
  const hasThemes = Array.isArray(meta.key_themes) && meta.key_themes.length > 0;
  const hasAnyScore = writing > 0 || approach > 0 || credibility > 0;
  if (!hasAnyScore && !hasThemes) return 'silently_empty';
  return 'ok';
}

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    let rows = [];
    try {
      // Scope by owner so members only see their own projects in the health report.
      const sc = scope(req.user);
      rows = db.prepare(
        `SELECT id, name, indexing_status, indexed_at, ai_metadata, owner_user_id FROM projects WHERE 1=1${sc.clause}`
      ).all(...sc.params);
    } catch (e) {
      return res.status(200).json({ total: 0, ok: 0, silently_empty: 0, errored: 0, stuck_indexing: 0, unindexed: 0, ids: {}, unanalysed: 0, unanalysedIds: [] });
    }

    const buckets = { ok: [], silently_empty: [], errored: [], stuck_indexing: [], unindexed: [] };
    for (const p of rows) {
      const b = classify(p);
      buckets[b].push({ id: p.id, name: p.name });
    }

    // `unanalysed` is everything that could benefit from (re)analysis —
    // errored + stuck + silently_empty + unindexed. This keeps the
    // top-level banner number a single meaningful count.
    const unanalysedIds = [
      ...buckets.errored,
      ...buckets.stuck_indexing,
      ...buckets.silently_empty,
      ...buckets.unindexed,
    ];

    return res.status(200).json({
      total: rows.length,
      ok: buckets.ok.length,
      silently_empty: buckets.silently_empty.length,
      errored: buckets.errored.length,
      stuck_indexing: buckets.stuck_indexing.length,
      unindexed: buckets.unindexed.length,
      ids: {
        silently_empty: buckets.silently_empty,
        errored: buckets.errored,
        stuck_indexing: buckets.stuck_indexing,
        unindexed: buckets.unindexed,
      },
      unanalysed: unanalysedIds.length,
      unanalysedIds,
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rawIds = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (rawIds.length === 0) return res.status(400).json({ error: 'No ids provided' });

    // Tenant gate — drop any ids the caller doesn't own. Silent filter (not 403)
    // so we don't leak which ids exist for other users.
    const ids = rawIds.filter(pid => {
      const row = db.prepare('SELECT owner_user_id FROM projects WHERE id = ?').get(pid);
      return row && canAccess(req.user, row);
    });
    if (ids.length === 0) return res.status(400).json({ error: 'No ids provided' });

    // Get the host from the request headers so internal fetches work in
    // both local dev and Railway. Reindex endpoint is fire-and-forget
    // (202) so the loop returns quickly even for big batches.
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const base = `${proto}://${host}`;
    const cookie = req.headers.cookie || '';

    // Respond immediately so the UI isn't blocked by the stagger loop.
    res.status(202).json({
      message: `Queued ${ids.length} project${ids.length === 1 ? '' : 's'} for re-analysis`,
      ids,
    });

    ;(async () => {
      for (const id of ids) {
        try {
          await fetch(`${base}/api/projects/${id}/reindex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', cookie },
          });
        } catch (e) {
          console.error(`[check-analysis] reindex failed for ${id}:`, e.message);
        }
        // 3s stagger matches batch import + rescan-all — keeps the
        // server-side OpenAI queue from piling up too many jobs.
        await new Promise(r => setTimeout(r, 3000));
      }
    })().catch(e => console.error('[check-analysis] outer catch:', e.message));
  }
}

export default requireAuth(handler);
