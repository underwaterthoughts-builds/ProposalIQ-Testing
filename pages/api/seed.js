import { getDb } from '../../lib/db';
import { embed } from '../../lib/gemini';
import { FOLDERS, TEAM, PROJECTS } from '../../data/seed-data';
import { getUserFromReq } from '../../lib/auth';

export default async function handler(req, res) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Sign in first, then visit this URL.' });

  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as n FROM projects').get();
  if (count.n > 0) {
    return res.status(200).json({ message: `Already seeded — ${count.n} projects in repository.` });
  }

  try {
    // Folders
    const insertFolder = db.prepare(
      'INSERT OR IGNORE INTO folders (id, name, parent_id, sector, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    FOLDERS.forEach((f, i) => insertFolder.run(f.id, f.name, f.parent_id || null, f.sector, i));

    // Team members
    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO team_members
        (id, name, title, years_experience, day_rate_client, day_rate_cost,
         availability, stated_specialisms, stated_sectors, bio, color, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of TEAM) {
      const specs = JSON.parse(m.stated_specialisms);
      const embText = [m.name, m.title, ...specs, m.stated_sectors, m.bio].join(' ');
      let emb = null;
      try { emb = JSON.stringify(await embed(embText)); } catch (e) { console.error('Team embed:', m.name, e.message); }
      insertMember.run(
        m.id, m.name, m.title, m.years_experience, m.day_rate_client,
        m.day_rate_cost, m.availability, m.stated_specialisms,
        m.stated_sectors, m.bio, m.color, emb
      );
    }

    // Projects
    const insertProject = db.prepare(`
      INSERT OR IGNORE INTO projects
        (id, name, client, sector, contract_value, currency, outcome, user_rating, ai_weight,
         project_type, date_submitted, folder_id, description, went_well, improvements, lessons,
         lh_status, lh_what_committed, lh_what_delivered, lh_went_well, lh_went_poorly,
         lh_client_feedback, lh_methodology_refinements, ai_metadata, taxonomy, embedding,
         kqs_recency, kqs_outcome_quality, kqs_specificity, kqs_composite,
         indexing_status, indexed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `);

    for (const p of PROJECTS) {
      const meta = JSON.parse(p.ai_metadata);
      const embParts = [
        p.name, p.client, p.sector, p.description,
        meta.executive_summary || '',
        (meta.key_themes || []).join(' '),
        (meta.deliverables || []).join(' '),
        (meta.methodologies || []).join(' '),
        (meta.tools_technologies || []).join(' '),
        (meta.value_propositions || []).join(' '),
      ].filter(Boolean);

      let emb = null;
      try { emb = JSON.stringify(await embed(embParts.join(' '))); }
      catch (e) { console.error('Project embed:', p.name, e.message); }

      insertProject.run(
        p.id, p.name, p.client, p.sector, p.contract_value, p.currency,
        p.outcome, p.user_rating, p.ai_weight, p.project_type, p.date_submitted,
        p.folder_id, p.description, p.went_well || '', p.improvements || '',
        p.lessons || '', p.lh_status || 'none', p.lh_what_committed || '',
        p.lh_what_delivered || '', p.lh_went_well || '', p.lh_went_poorly || '',
        p.lh_client_feedback || '', p.lh_methodology_refinements || '',
        p.ai_metadata, p.taxonomy, emb,
        p.kqs_recency, p.kqs_outcome_quality, p.kqs_specificity, p.kqs_composite,
        p.indexing_status
      );
    }

    // Project–team links
    const insertLink = db.prepare(
      'INSERT OR IGNORE INTO project_team (project_id, member_id, role, days_contributed) VALUES (?, ?, ?, ?)'
    );
    [
      ['proj-1','tm-1','Delivery Manager',180], ['proj-1','tm-2','Solutions Architect',120],
      ['proj-1','tm-5','Bid Manager',25],       ['proj-2','tm-1','Delivery Lead',110],
      ['proj-2','tm-4','Business Analyst',80],  ['proj-3','tm-3','Data Lead',150],
      ['proj-4','tm-4','BA Lead',90],            ['proj-4','tm-6','Technical PM',120],
      ['proj-5','tm-1','Senior PM',200],         ['proj-5','tm-2','Architect',180],
      ['proj-5','tm-5','Bid Manager',30],        ['proj-7','tm-2','Lead Architect',160],
      ['proj-7','tm-3','Data Lead',140],         ['proj-9','tm-3','Data Governance Lead',90],
      ['proj-9','tm-4','BA',60],
    ].forEach(([pid, mid, role, days]) => insertLink.run(pid, mid, role, days));

    return res.status(200).json({
      message: 'Seed complete',
      folders: FOLDERS.length,
      team: TEAM.length,
      projects: PROJECTS.length,
    });
  } catch (e) {
    console.error('Seed error:', e);
    return res.status(500).json({ error: e.message });
  }
}
