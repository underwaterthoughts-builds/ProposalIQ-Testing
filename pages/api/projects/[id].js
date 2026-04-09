import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { safe } from '../../../lib/embeddings';

function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  if (req.method === 'GET') {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const files = db.prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY file_type').all(id);
    const team = db.prepare(`
      SELECT tm.*, pt.role, pt.days_contributed
      FROM team_members tm JOIN project_team pt ON pt.member_id = tm.id
      WHERE pt.project_id = ?`).all(id);
    return res.status(200).json({
      project: { ...p, ai_metadata: safe(p.ai_metadata, {}), taxonomy: safe(p.taxonomy, {}), lh_pricing_accuracy: safe(p.lh_pricing_accuracy, {}) },
      files,
      team: team.map(m => ({ ...m, stated_specialisms: safe(m.stated_specialisms, []) })),
    });
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const allowed = ['name','client','sector','contract_value','currency','outcome','user_rating','project_type',
      'date_submitted','folder_id','description','went_well','improvements','lessons',
      'lh_status','lh_what_committed','lh_what_delivered','lh_went_well','lh_went_poorly',
      'lh_client_feedback','lh_methodology_refinements','ai_metadata'];
    const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    const AI_WEIGHT = { 1: 0.05, 2: 0.15, 3: 0.40, 4: 0.75, 5: 1.00 };
    if (body.user_rating) updates.push(['ai_weight', AI_WEIGHT[body.user_rating] || 0.40]);
    const set = updates.map(([k]) => `${k} = ?`).join(', ');
    const vals = updates.map(([, v]) => v);
    db.prepare(`UPDATE projects SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...vals, id);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
