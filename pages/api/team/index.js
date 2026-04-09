import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { embed } from '../../../lib/gemini';
import { safe } from '../../../lib/embeddings';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  const db = getDb();
  if (req.method === 'GET') {
    const members = db.prepare('SELECT * FROM team_members ORDER BY name').all();
    const history = db.prepare(`SELECT pt.member_id, pt.role, pt.days_contributed, p.name as project_name, p.outcome, p.user_rating, p.sector, p.date_submitted FROM project_team pt JOIN projects p ON p.id=pt.project_id`).all();
    return res.status(200).json({
      members: members.map(m => ({
        ...m,
        stated_specialisms: safe(m.stated_specialisms, []),
        cv_extracted: safe(m.cv_extracted, {}),
      })),
      history,
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body==='string'?JSON.parse(req.body):req.body;
    const { name,title,years_experience,day_rate_client,day_rate_cost,availability,stated_specialisms,stated_sectors,bio,color } = body;
    if (!name||!title) return res.status(400).json({ error:'Name and title required' });
    const id = uuid();
    const specs = Array.isArray(stated_specialisms)?stated_specialisms:[];
    const embText = [name,title,...specs,stated_sectors||'',bio||''].join(' ');
    let emb = null;
    try { emb = JSON.stringify(await embed(embText)); } catch(e) { console.error('embed:',e.message); }
    db.prepare(`INSERT INTO team_members (id,name,title,years_experience,day_rate_client,day_rate_cost,availability,stated_specialisms,stated_sectors,bio,color,embedding)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,name,title,years_experience||0,day_rate_client||0,day_rate_cost||0,availability||'Available — Full time',JSON.stringify(specs),stated_sectors||'',bio||'',color||'#2d6b78',emb);
    return res.status(201).json({ id });
  }
  return res.status(405).end();
}
export default requireAuth(handler);
