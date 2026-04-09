import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { v4 as uuid } from 'uuid';

async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const { name } = req.query;
    if (name) {
      // Look up a specific client by name (fuzzy)
      const client = db.prepare("SELECT * FROM client_profiles WHERE LOWER(name) LIKE LOWER(?) ORDER BY updated_at DESC LIMIT 1").get(`%${name}%`);
      if (!client) return res.status(404).json({ client: null });
      const projects = db.prepare("SELECT id, name, outcome, user_rating, date_submitted, sector, contract_value, currency FROM projects WHERE LOWER(client) LIKE LOWER(?) ORDER BY date_submitted DESC").all(`%${name}%`);
      return res.status(200).json({ client, projects });
    }

    // List all clients with project counts
    const clients = db.prepare('SELECT * FROM client_profiles ORDER BY name').all();
    const enriched = clients.map(c => {
      const projects = db.prepare("SELECT id, name, outcome, user_rating, date_submitted, contract_value, currency FROM projects WHERE LOWER(client) LIKE LOWER(?) ORDER BY date_submitted DESC").all(`%${c.name}%`);
      const won = projects.filter(p => p.outcome === 'won').length;
      const lost = projects.filter(p => p.outcome === 'lost').length;
      return { ...c, project_count: projects.length, won, lost, recent_projects: projects.slice(0, 3) };
    });

    // Also get clients from projects that don't have a profile yet
    const allClients = db.prepare("SELECT DISTINCT client FROM projects WHERE client IS NOT NULL AND client != '' ORDER BY client").all();
    const profiledNames = new Set(clients.map(c => c.name.toLowerCase()));
    const unprofiledClients = allClients
      .filter(r => !profiledNames.has(r.client.toLowerCase()))
      .map(r => {
        const projects = db.prepare("SELECT id, name, outcome FROM projects WHERE LOWER(client) LIKE LOWER(?)").all(`%${r.client}%`);
        return { name: r.client, project_count: projects.length, won: projects.filter(p=>p.outcome==='won').length, lost: projects.filter(p=>p.outcome==='lost').length, auto: true };
      });

    return res.status(200).json({ clients: enriched, unprofiled: unprofiledClients });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, sector, notes, relationship_status } = body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const id = uuid();
    db.prepare('INSERT INTO client_profiles (id, name, sector, notes, relationship_status) VALUES (?, ?, ?, ?, ?)').run(id, name.trim(), sector || '', notes || '', relationship_status || 'active');
    return res.status(201).json({ id });
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const allowed = ['name', 'sector', 'notes', 'relationship_status', 'key_contacts'];
    const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
    const sql = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE client_profiles SET ${sql}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...updates.map(([,v]) => typeof v === 'object' ? JSON.stringify(v) : v), id);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    db.prepare('DELETE FROM client_profiles WHERE id = ?').run(body.id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
