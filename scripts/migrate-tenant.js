#!/usr/bin/env node
// One-time migration of a per-tenant ProposalIQ SQLite DB into the
// consolidated home instance's DB. Idempotent — re-runs are safe.
//
// Usage (run inside the home Railway container, after uploading the
// source tenant's data dir to /tmp/<tenant>-data/):
//
//   node scripts/migrate-tenant.js /tmp/rupert-data
//   node scripts/migrate-tenant.js /tmp/joseph-data
//
// The argument is the path to a directory containing:
//   proposaliq.db              the source tenant's SQLite DB
//   uploads/<projectId>/...    the source tenant's upload artifacts
//
// What this does:
//   1. Reads the source DB
//   2. For each user in source.users, either matches an existing user in
//      target by email (and reuses that id) or inserts a new user (preserving
//      source id since it's a uuid). Builds a userId remap table.
//   3. Copies every owner_user_id-bearing row into target with the user id
//      remapped. Other PKs (uuid) are preserved verbatim — no collision risk.
//   4. Copies dependent rows (project_files, project_team, proposal_coverage,
//      indexing_log, audit_log, chat_messages, organisation_profile).
//   5. Copies upload artifacts (data/uploads/<projectId>/) into the target's
//      volume.
//   6. Verifies row counts and prints a per-table delta report.
//
// Safety:
//   - INSERT OR IGNORE is used so re-running this script is a no-op for
//     rows already present.
//   - The source DB is opened readonly. Source files are read-only too.
//   - No DELETEs are issued.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
let sourceDirArg = null;
const skipTables = new Set();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skip' && args[i + 1]) {
    args[i + 1].split(',').forEach(t => skipTables.add(t.trim()));
    i++;
  } else if (!sourceDirArg) {
    sourceDirArg = args[i];
  }
}
if (!sourceDirArg) {
  console.error('Usage: node scripts/migrate-tenant.js <source-data-dir> [--skip table1,table2]');
  console.error('  e.g. node scripts/migrate-tenant.js /tmp/joseph-data');
  console.error('       node scripts/migrate-tenant.js /tmp/james-data --skip rfp_scans,proposal_coverage');
  process.exit(1);
}

const sourceDir = path.resolve(sourceDirArg);
if (!fs.existsSync(sourceDir)) {
  console.error(`source dir does not exist: ${sourceDir}`);
  process.exit(1);
}

const sourceDbPath = path.join(sourceDir, 'proposaliq.db');
if (!fs.existsSync(sourceDbPath)) {
  console.error(`source DB not found at ${sourceDbPath}`);
  process.exit(1);
}

// Target DB location: production Railway sets DATA_DIR=/app/data; falls back
// to ./data for local development.
const targetDataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const targetDbPath = path.join(targetDataDir, 'proposaliq.db');
if (!fs.existsSync(targetDbPath)) {
  console.error(`target DB not found at ${targetDbPath} (is this running on the home instance?)`);
  process.exit(1);
}

console.log('Migration start:');
console.log(`  source DB:       ${sourceDbPath}`);
console.log(`  source uploads:  ${path.join(sourceDir, 'uploads')}`);
console.log(`  target DB:       ${targetDbPath}`);
console.log(`  target uploads:  ${path.join(targetDataDir, 'uploads')}`);
console.log('');

const src = new Database(sourceDbPath, { readonly: true });
const dst = new Database(targetDbPath);

// Quick sanity check: same schema? Fail loudly if a key column is missing.
function assertColumn(db, table, col) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) {
    throw new Error(`schema mismatch: ${table}.${col} not found`);
  }
}
for (const t of ['projects', 'rfp_scans', 'team_members', 'client_profiles', 'folders']) {
  assertColumn(src, t, 'owner_user_id');
  assertColumn(dst, t, 'owner_user_id');
}

const stats = {};
function bump(table, count) { stats[table] = (stats[table] || 0) + count; }

// ── 1. Users — find or create by email, build remap ───────────────────────
console.log('1. Users');
const srcUsers = src.prepare('SELECT * FROM users').all();
const userIdRemap = new Map();           // sourceId → targetId
const targetUserCols = dst.prepare('PRAGMA table_info(users)').all().map(c => c.name);
let usersCreated = 0;
let usersMatched = 0;

const findUserByEmail = dst.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)');

for (const u of srcUsers) {
  const existing = findUserByEmail.get(u.email);
  if (existing) {
    userIdRemap.set(u.id, existing.id);
    usersMatched++;
    continue;
  }
  // Insert preserving source id (it's a uuid, no collision risk)
  // Filter to columns that exist in target schema
  const fields = Object.keys(u).filter(k => targetUserCols.includes(k));
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => u[f]);
  try {
    dst.prepare(`INSERT OR IGNORE INTO users (${fields.join(',')}) VALUES (${placeholders})`).run(...values);
    userIdRemap.set(u.id, u.id);
    usersCreated++;
  } catch (e) {
    console.error(`  ! failed to insert user ${u.email}: ${e.message}`);
  }
}
console.log(`   ${usersMatched} matched by email, ${usersCreated} created.`);

// ── 2. Owner-scoped tables — copy with owner_user_id remapped ─────────────
const ownerScopedTables = [
  'projects', 'rfp_scans', 'team_members', 'client_profiles',
  'folders', 'rate_card_roles', 'custom_prompts', 'custom_values',
];

console.log('2. Owner-scoped tables');
for (const tbl of ownerScopedTables) {
  if (skipTables.has(tbl)) { console.log(`   ${tbl}: SKIPPED (--skip)`); continue; }
  const cols = dst.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
  const rows = src.prepare(`SELECT * FROM ${tbl}`).all();
  let inserted = 0;
  for (const r of rows) {
    if (r.owner_user_id && userIdRemap.has(r.owner_user_id)) {
      r.owner_user_id = userIdRemap.get(r.owner_user_id);
    }
    const fields = Object.keys(r).filter(k => cols.includes(k));
    const placeholders = fields.map(() => '?').join(',');
    const values = fields.map(f => r[f]);
    try {
      const result = dst.prepare(`INSERT OR IGNORE INTO ${tbl} (${fields.join(',')}) VALUES (${placeholders})`).run(...values);
      if (result.changes > 0) inserted++;
    } catch (e) {
      console.error(`  ! ${tbl} row ${r.id}: ${e.message}`);
    }
  }
  console.log(`   ${tbl}: ${inserted}/${rows.length} new`);
  bump(tbl, inserted);
}

// ── 3. organisation_profile — keyed on user_id, not owner_user_id ─────────
console.log('3. organisation_profile');
{
  const cols = dst.prepare('PRAGMA table_info(organisation_profile)').all().map(c => c.name);
  const rows = src.prepare('SELECT * FROM organisation_profile').all();
  let inserted = 0;
  for (const r of rows) {
    if (r.user_id && userIdRemap.has(r.user_id)) {
      r.user_id = userIdRemap.get(r.user_id);
    }
    const fields = Object.keys(r).filter(k => cols.includes(k));
    const placeholders = fields.map(() => '?').join(',');
    const values = fields.map(f => r[f]);
    try {
      const result = dst.prepare(`INSERT OR IGNORE INTO organisation_profile (${fields.join(',')}) VALUES (${placeholders})`).run(...values);
      if (result.changes > 0) inserted++;
    } catch (e) {
      console.error(`  ! organisation_profile row ${r.id}: ${e.message}`);
    }
  }
  console.log(`   organisation_profile: ${inserted}/${rows.length} new`);
  bump('organisation_profile', inserted);
}

// ── 4. Dependent tables — child rows of the above. PKs are uuids so no
//      collision; just copy with INSERT OR IGNORE.
const dependentTables = [
  'project_files', 'project_team', 'proposal_coverage',
  'indexing_log', 'audit_log', 'chat_messages',
];
console.log('4. Dependent tables');
for (const tbl of dependentTables) {
  if (skipTables.has(tbl)) { console.log(`   ${tbl}: SKIPPED (--skip)`); continue; }
  // Some of these tables may not exist in older schemas; tolerate that.
  let cols;
  try {
    cols = dst.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
    if (cols.length === 0) { console.log(`   ${tbl}: SKIP (table not in target)`); continue; }
  } catch { console.log(`   ${tbl}: SKIP (table not in target)`); continue; }

  let rows;
  try { rows = src.prepare(`SELECT * FROM ${tbl}`).all(); }
  catch { console.log(`   ${tbl}: SKIP (table not in source)`); continue; }

  let inserted = 0;
  for (const r of rows) {
    // Some dependent tables also reference user_id — remap it.
    if (r.user_id && userIdRemap.has(r.user_id)) r.user_id = userIdRemap.get(r.user_id);
    if (r.impersonator_id && userIdRemap.has(r.impersonator_id)) r.impersonator_id = userIdRemap.get(r.impersonator_id);

    const fields = Object.keys(r).filter(k => cols.includes(k));
    const placeholders = fields.map(() => '?').join(',');
    const values = fields.map(f => r[f]);
    try {
      const result = dst.prepare(`INSERT OR IGNORE INTO ${tbl} (${fields.join(',')}) VALUES (${placeholders})`).run(...values);
      if (result.changes > 0) inserted++;
    } catch (e) {
      console.error(`  ! ${tbl} row: ${e.message}`);
    }
  }
  console.log(`   ${tbl}: ${inserted}/${rows.length} new`);
  bump(tbl, inserted);
}

// ── 5. File artifacts — copy data/uploads/<projectId>/ trees
console.log('5. Upload artifacts');
{
  const srcUploads = path.join(sourceDir, 'uploads');
  const dstUploads = path.join(targetDataDir, 'uploads');
  if (!fs.existsSync(srcUploads)) {
    console.log(`   no uploads dir at ${srcUploads}, skipping`);
  } else {
    fs.mkdirSync(dstUploads, { recursive: true });
    let copied = 0;
    let skipped = 0;
    function copyDirRecursive(src, dst) {
      fs.mkdirSync(dst, { recursive: true });
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const sp = path.join(src, e.name);
        const dp = path.join(dst, e.name);
        if (e.isDirectory()) {
          copyDirRecursive(sp, dp);
        } else if (fs.existsSync(dp)) {
          skipped++;
        } else {
          fs.copyFileSync(sp, dp);
          copied++;
        }
      }
    }
    for (const entry of fs.readdirSync(srcUploads, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sp = path.join(srcUploads, entry.name);
      const dp = path.join(dstUploads, entry.name);
      copyDirRecursive(sp, dp);
    }
    console.log(`   ${copied} files copied, ${skipped} already present (skipped)`);
  }
}

// ── 6. Verification report
console.log('');
console.log('Migration complete. Inserted (target) by table:');
for (const [tbl, n] of Object.entries(stats)) {
  console.log(`  ${tbl.padEnd(28)}  +${n}`);
}
console.log('');
console.log('Source row counts (for verification):');
const sourceTables = ['users', ...ownerScopedTables, 'organisation_profile', ...dependentTables];
for (const tbl of sourceTables) {
  try {
    const n = src.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get().n;
    const dn = dst.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get().n;
    console.log(`  ${tbl.padEnd(28)}  source=${String(n).padEnd(6)} target=${dn}`);
  } catch {}
}

src.close();
dst.close();
