// Re-embed every project and team member with the current embedding model.
//
//   node scripts/reembed.js            → re-embed everything
//   node scripts/reembed.js --dry-run  → count what would be done
//
// REQUIRED whenever lib/gemini.js's EMB_MODELS / EMB_DIMENSIONS change:
// vectors from different models (or dimensionalities) are incompatible —
// lib/embeddings.js#cosine returns 0 for mixed-length vectors and garbage
// for same-length vectors from different model families. Matching only
// works when every stored vector and every query vector come from the
// same model.
//
// Composition mirrors the canonical sources exactly:
//   projects     → pages/api/projects/[id]/reindex.js embParts
//   team_members → scripts/seed-admin.js / pages/api/team/[id].js embText
//
// Run on Railway:  railway ssh --service proposaliq "node scripts/reembed.js"

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { getDb } = require('../lib/db');
const { embed } = require('../lib/gemini');
const { parseJsonField } = require('../lib/embeddings');

const DRY = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const db = getDb();
  let ok = 0, failed = 0;

  const projects = db.prepare('SELECT id, name, client, sector, description, ai_metadata FROM projects').all();
  console.log(`[reembed] ${projects.length} projects, dry-run=${DRY}`);

  for (const p of projects) {
    const metadata = parseJsonField(p.ai_metadata, {});
    // Must match reindex.js embParts exactly so re-embedded vectors are
    // equivalent to what a fresh reindex would produce.
    const embParts = [
      p.name, p.client, p.sector, p.description,
      metadata.executive_summary || '',
      (metadata.key_themes || []).join(' '),
      (metadata.deliverables || []).join(' '),
      (metadata.methodologies || []).join(' '),
      (metadata.tools_technologies || []).join(' '),
      (metadata.value_propositions || []).join(' '),
    ].filter(Boolean);

    if (DRY) { ok++; continue; }
    try {
      const vec = await embed(embParts.join(' '));
      db.prepare('UPDATE projects SET embedding = ? WHERE id = ?').run(JSON.stringify(vec), p.id);
      ok++;
      console.log(`[reembed] project ok: ${p.name}`);
    } catch (e) {
      failed++;
      console.error(`[reembed] project FAILED: ${p.name}: ${e.message}`);
    }
    await sleep(300); // stay well under embed rate limits
  }

  const members = db.prepare('SELECT id, name, title, stated_specialisms, stated_sectors, bio FROM team_members').all();
  console.log(`[reembed] ${members.length} team members`);

  for (const m of members) {
    const specs = parseJsonField(m.stated_specialisms, []);
    const embText = [m.name, m.title, ...specs, m.stated_sectors, m.bio].filter(Boolean).join(' ');
    if (DRY) { ok++; continue; }
    try {
      const vec = await embed(embText);
      db.prepare('UPDATE team_members SET embedding = ? WHERE id = ?').run(JSON.stringify(vec), m.id);
      ok++;
      console.log(`[reembed] member ok: ${m.name}`);
    } catch (e) {
      failed++;
      console.error(`[reembed] member FAILED: ${m.name}: ${e.message}`);
    }
    await sleep(300);
  }

  console.log(`[reembed] done — ${ok} ok, ${failed} failed${DRY ? ' (dry run)' : ''}`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('[reembed] FATAL:', e.message); process.exit(1); });
