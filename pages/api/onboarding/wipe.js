import fs from 'fs';
import path from 'path';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// POST /api/onboarding/wipe
//
// Nuclear wipe — removes all company-specific data and resets the workspace
// for a fresh start. Requires the user to type a confirmation phrase in the
// body to prevent accidents.
//
// DELETES:
//   · organisation_profile (the profile itself)
//   · projects + project_files + project_overview_fields + project_narrative_entries
//   · rfp_scans + rfp_scan_suppressions + rfp_scan_annotations
//   · section_drafts
//   · scan_usage_events + scan_outcomes
//   · team_members + project_team
//   · folders
//   · client_profiles
//   · custom_values + custom_prompts (back to defaults on next load)
//   · rate_card_roles
//   · indexing_log
//   · upload_consents
//   · all physical files under data/uploads/**
//
// PRESERVES:
//   · users (so the current user can still log in)
//   · taxonomy_items (the canonical taxonomy — global, not company-specific)
//   · settings (org_name is reset, but AI keys / prompt customisations stay)
//
// The confirmation phrase is a hard-coded "DELETE ALL DATA" — not the org
// name or anything guessable — so shell history / logs never contain
// anything that would auto-confirm.
const CONFIRMATION_PHRASE = 'DELETE ALL DATA';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (body?.confirm !== CONFIRMATION_PHRASE) {
    return res.status(400).json({
      error: `Confirmation phrase required. Pass { confirm: "${CONFIRMATION_PHRASE}" } to proceed.`,
    });
  }

  const db = getDb();

  // Tables in dependency order — children first so FKs don't block
  const tables = [
    'section_drafts',
    'scan_usage_events',
    'scan_outcomes',
    'rfp_scan_suppressions',
    'rfp_scan_annotations',
    'rfp_scans',
    'project_overview_fields',
    'project_narrative_entries',
    'project_team',
    'project_files',
    'projects',
    'team_members',
    'folders',
    'client_profiles',
    'custom_values',
    'custom_prompts',
    'rate_card_roles',
    'indexing_log',
    'upload_consents',
    'organisation_profile',
  ];

  const deleted = {};
  for (const t of tables) {
    try {
      const r = db.prepare(`DELETE FROM ${t}`).run();
      deleted[t] = r.changes || 0;
    } catch (e) {
      // Table may not exist on an old install — keep going
      deleted[t] = 'skipped (' + e.message + ')';
    }
  }

  // Reset only the org_name in settings, leave AI keys etc
  try {
    db.prepare("UPDATE settings SET value = '' WHERE key = 'org_name'").run();
  } catch {}

  // Physical file cleanup — walk data/uploads/ and remove everything.
  // Keep the directory itself so new uploads still work.
  let filesDeleted = 0;
  try {
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            try { fs.rmdirSync(full); } catch {}
          } else {
            try { fs.unlinkSync(full); filesDeleted++; } catch {}
          }
        }
      };
      walk(uploadsDir);
    }
  } catch (e) {
    console.error('wipe file cleanup error:', e.message);
  }

  return res.status(200).json({
    ok: true,
    deleted,
    files_deleted: filesDeleted,
    message: 'All company data wiped. Redirect the user to /onboarding/profile to start fresh.',
  });
}

export default requireAuth(handler);
