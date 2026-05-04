#!/usr/bin/env node
// Run inside a Railway instance to seed the initial users.
//
// Usage:
//   node scripts/seed-admin.js <adminEmail> <adminPass> [memberEmail] [memberPass]
//
// Idempotent: if a user with the given email already exists, the script
// reports it and exits 0 without touching the row.

const path = require('path');
const { v4: uuid } = require('uuid');

process.chdir(path.resolve(__dirname, '..'));
const { getDb } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

async function seedUser(db, email, password, role) {
  const lower = email.toLowerCase();
  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(lower);
  if (existing) {
    console.log(`  - ${lower} already exists (role=${existing.role}) — skipped`);
    return existing.id;
  }
  const hash = await hashPassword(password);
  const id = uuid();
  const onboardedAt = role === 'admin'
    ? new Date().toISOString().slice(0, 19).replace('T', ' ')
    : null;
  db.prepare(
    'INSERT INTO users (id, name, email, password_hash, org_name, role, onboarded_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, lower.split('@')[0], lower, hash, 'My Organisation', role, onboardedAt);
  console.log(`  + ${lower} created (role=${role})`);
  return id;
}

async function main() {
  const [, , adminEmail, adminPass, memberEmail, memberPass] = process.argv;
  if (!adminEmail || !adminPass) {
    console.error('Usage: node scripts/seed-admin.js <adminEmail> <adminPass> [memberEmail] [memberPass]');
    process.exit(1);
  }
  const db = getDb();
  console.log('Seeding users:');
  await seedUser(db, adminEmail, adminPass, 'admin');
  if (memberEmail && memberPass) {
    await seedUser(db, memberEmail, memberPass, 'member');
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
