import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import seedItems from '../../lib/taxonomy-seed-data.json';

// Destructive taxonomy sync — replaces the entire taxonomy_items table with
// the snapshot in lib/taxonomy-seed-data.json (a verbatim dump from the
// production cook-me.food repository). IDs, parent_ids, sort_orders, and
// is_default flags are preserved so the design and production sites stay
// byte-identical on this axis.
//
// Earlier versions of this endpoint were additive (insert-if-missing),
// which allowed drift: rows on design that didn't exist on production
// accumulated, and the two sites diverged. "Exact match" requires a hard
// reset, so we delete first and insert every row from the snapshot.
//
// Triggered via POST. Auth required. Any user-added taxonomy items on the
// design site are DESTROYED by this call — that's the point, and the user
// confirmed it before this was deployed.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();

  if (!Array.isArray(seedItems) || seedItems.length === 0) {
    return res.status(500).json({ error: 'Seed data missing or empty' });
  }

  // Order: Industries first, then Sectors (so parent_id references resolve).
  // Service Offering rows have no parent and can go with Industries.
  const parents = seedItems.filter(i => !i.parent_id);
  const children = seedItems.filter(i => i.parent_id);

  const insert = db.prepare(
    "INSERT INTO taxonomy_items (id, name, category, parent_id, sort_order, is_default, taxonomy_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))"
  );

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM taxonomy_items').run();
    for (const it of [...parents, ...children]) {
      insert.run(
        it.id,
        it.name,
        it.category || 'Service Offering',
        it.parent_id || null,
        it.sort_order || 0,
        it.is_default ? 1 : 0,
        it.taxonomy_type || 'service',
        it.created_at || null,
      );
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  // Summary counts by type + category for confirmation in the response.
  const breakdown = { service_industries: 0, service_sectors: 0, client_industries: 0, client_sectors: 0, legacy_offerings: 0 };
  for (const it of seedItems) {
    if (it.category === 'Service Offering') breakdown.legacy_offerings++;
    else if (it.category === 'Industry' && it.taxonomy_type === 'service') breakdown.service_industries++;
    else if (it.category === 'Sector' && it.taxonomy_type === 'service') breakdown.service_sectors++;
    else if (it.category === 'Industry' && it.taxonomy_type === 'client') breakdown.client_industries++;
    else if (it.category === 'Sector' && it.taxonomy_type === 'client') breakdown.client_sectors++;
  }

  return res.status(200).json({
    success: true,
    mode: 'wipe_and_replace',
    total_installed: seedItems.length,
    breakdown,
    message: `Taxonomy table replaced with ${seedItems.length} items from snapshot.`,
  });
}

export default requireAuth(handler);
