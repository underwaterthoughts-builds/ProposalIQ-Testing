import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { v4 as uuid } from 'uuid';
import { SERVICE_TAXONOMY, CLIENT_TAXONOMY } from '../../lib/taxonomy';

// Idempotent seed for the two-axis taxonomy.
// Safe to run multiple times — checks existence before inserting.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();

  const findIndustry = db.prepare(
    "SELECT id FROM taxonomy_items WHERE name = ? AND category = 'Industry' AND taxonomy_type = ?"
  );
  const findSector = db.prepare(
    "SELECT id FROM taxonomy_items WHERE name = ? AND category = 'Sector' AND parent_id = ?"
  );
  const insert = db.prepare(
    "INSERT INTO taxonomy_items (id, name, category, parent_id, sort_order, is_default, taxonomy_type) VALUES (?, ?, ?, ?, ?, 1, ?)"
  );

  let added = 0, skipped = 0;
  let serviceIndustryCount = 0, serviceSectorCount = 0;
  let clientIndustryCount = 0, clientSectorCount = 0;

  function seedAxis(taxonomy, type) {
    let industryOrder = 0;
    for (const [industry, sectors] of Object.entries(taxonomy)) {
      industryOrder++;
      let industryRow = findIndustry.get(industry, type);
      let industryId;
      if (!industryRow) {
        industryId = uuid();
        insert.run(industryId, industry, 'Industry', null, industryOrder, type);
        added++;
        if (type === 'service') serviceIndustryCount++; else clientIndustryCount++;
      } else {
        industryId = industryRow.id;
        skipped++;
      }
      let sectorOrder = 0;
      for (const sector of sectors) {
        sectorOrder++;
        const existing = findSector.get(sector, industryId);
        if (!existing) {
          insert.run(uuid(), sector, 'Sector', industryId, sectorOrder, type);
          added++;
          if (type === 'service') serviceSectorCount++; else clientSectorCount++;
        } else {
          skipped++;
        }
      }
    }
  }

  try {
    seedAxis(SERVICE_TAXONOMY, 'service');
    seedAxis(CLIENT_TAXONOMY, 'client');
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({
    success: true,
    added,
    skipped,
    breakdown: {
      service_industries: serviceIndustryCount,
      service_sectors: serviceSectorCount,
      client_industries: clientIndustryCount,
      client_sectors: clientSectorCount,
    },
    message: `Seeded ${serviceIndustryCount} new service industries + ${serviceSectorCount} sectors, ${clientIndustryCount} client industries + ${clientSectorCount} sectors (${skipped} already existed)`,
  });
}

export default requireAuth(handler);
