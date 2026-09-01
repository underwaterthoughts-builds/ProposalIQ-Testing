// Automated SQLite backup.
//
//   node scripts/backup-db.js            → snapshot + prune (keeps last 14)
//   BACKUP_KEEP=30 node scripts/backup-db.js
//
// What it does:
//   1. PRAGMA wal_checkpoint(TRUNCATE) — flushes pending WAL pages into the
//      main DB file first. Skipping this is the "backup looks empty" trap
//      documented in CLAUDE.md that bit us during the consolidation migration.
//   2. Online backup via better-sqlite3's .backup() (safe while the app is
//      running and writing).
//   3. Prunes old snapshots beyond BACKUP_KEEP (default 14).
//
// Scheduling on Railway: add a cron service (or a Railway cron schedule on
// this service) running `node scripts/backup-db.js` daily.
//
// NOTE: backups land in data/backups/ on the SAME volume as the live DB.
// That protects against corruption, bad migrations, and accidental deletes —
// not against loss of the volume itself. Periodically download a snapshot
// (railway ssh / scp) or sync the folder off-platform.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'proposaliq.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || '14', 10) || 14);

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backup] no database at ${DB_PATH} — nothing to back up`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); // YYYY-MM-DD-HH-mm
  const dest = path.join(BACKUP_DIR, `proposaliq-${stamp}.db`);

  const db = new Database(DB_PATH);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    await db.backup(dest);
    const size = fs.statSync(dest).size;
    console.log(`[backup] wrote ${dest} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    db.close();
  }

  // Prune oldest snapshots beyond KEEP
  const snaps = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^proposaliq-.*\.db$/.test(f))
    .sort(); // timestamp-named → lexicographic == chronological
  const excess = snaps.slice(0, Math.max(0, snaps.length - KEEP));
  for (const f of excess) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`[backup] pruned ${f}`);
  }
  console.log(`[backup] done — ${snaps.length - excess.length} snapshot(s) retained (keep=${KEEP})`);
}

main().catch(e => {
  console.error('[backup] FAILED:', e.message);
  process.exit(1);
});
