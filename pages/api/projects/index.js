import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { safe, cosine } from '../../../lib/embeddings';
import { embed } from '../../../lib/gemini';

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const { folder, search, outcome, rating, indexing_status } = req.query;
    let sql = 'SELECT p.*, GROUP_CONCAT(pf.file_type) as file_types FROM projects p LEFT JOIN project_files pf ON pf.project_id = p.id WHERE 1=1';
    const params = [];

    // indexing_status filter (for failed uploads view)
    if (indexing_status) {
      sql += ' AND p.indexing_status = ?'; params.push(indexing_status);
    }

    if (folder && folder !== 'all') {
      if (folder === 'won') { sql += ' AND p.outcome = ?'; params.push('won'); }
      else if (folder === 'lost') { sql += ' AND p.outcome = ?'; params.push('lost'); }
      else if (folder === 'pending') { sql += ' AND p.outcome IN (?,?)'; params.push('pending', 'active'); }
      else if (folder === 'starred') { sql += ' AND p.user_rating >= 4'; }
      else { sql += ' AND p.folder_id = ?'; params.push(folder); }
    }
    const semanticSearch = req.query.semantic === 'true' && search;
    if (search && !semanticSearch) {
      sql += ' AND (p.name LIKE ? OR p.client LIKE ? OR p.sector LIKE ? OR p.description LIKE ? OR p.ai_metadata LIKE ?)'
      const s = `%${search}%`; params.push(s,s,s,s,s);
    }
    if (outcome) { sql += ' AND p.outcome = ?'; params.push(outcome); }
    const offering = req.query.offering;
    if (offering) {
      // Filter by service offering in taxonomy field or AI metadata
      sql += ' AND (p.ai_metadata LIKE ? OR p.taxonomy LIKE ?)';
      const oLike = `%${offering}%`;
      params.push(oLike, oLike);
    }
    if (rating) { sql += ' AND p.user_rating >= ?'; params.push(parseInt(rating)); }

    sql += ' GROUP BY p.id ORDER BY p.created_at DESC';

    let projects = db.prepare(sql).all(...params).map(p => ({
      ...p,
      ai_metadata: safe(p.ai_metadata, {}),
      taxonomy: safe(p.taxonomy, {}),
      file_types: p.file_types ? p.file_types.split(',') : [],
    }));

    // Semantic search — re-rank by embedding similarity
    if (semanticSearch) {
      try {
        const queryVec = await embed(search);
        const withEmb = db.prepare("SELECT id, embedding FROM projects WHERE indexing_status='complete' AND embedding IS NOT NULL").all();
        const embMap = {};
        withEmb.forEach(r => { try { embMap[r.id] = JSON.parse(r.embedding); } catch {} });

        // Score all projects
        const scored = projects.map(p => {
          const vec = embMap[p.id];
          const score = vec ? cosine(queryVec, vec) : 0;
          return { ...p, semantic_score: score };
        });

        // Sort by semantic score, keep all but put scored ones first
        scored.sort((a, b) => (b.semantic_score || 0) - (a.semantic_score || 0));
        projects = scored;
      } catch (e) {
        console.error('Semantic search failed, falling back to text:', e.message);
      }
    }

    return res.status(200).json({ projects, semantic: !!semanticSearch });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
