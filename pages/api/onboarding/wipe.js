import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// POST /api/onboarding/wipe
//
// Deletes ONLY the organisation profile — the org name, website URL,
// extracted website scan, and user-confirmed offerings. Used when the
// user wants to clear their company info and set up a different
// organisation's profile without losing any projects, RFP scans, team
// members, drafts, or other accumulated data.
//
// DELETES:
//   · organisation_profile row (name, website, extracted snapshot, confirmed profile)
//   · settings.org_name (reset to empty)
//
// PRESERVES EVERYTHING ELSE:
//   · projects, project_files, folders
//   · rfp_scans, section_drafts, scan_outcomes, scan_usage_events
//   · team_members, client_profiles
//   · all other settings (AI keys, currency, margin, custom prompts)
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  let profileDeleted = 0;
  try {
    const r = db.prepare("DELETE FROM organisation_profile WHERE id = 'default'").run();
    profileDeleted = r.changes || 0;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete profile: ' + e.message });
  }

  // Reset only the org_name in settings, leave everything else untouched
  try {
    db.prepare("UPDATE settings SET value = '' WHERE key = 'org_name'").run();
  } catch {}

  return res.status(200).json({
    ok: true,
    profile_deleted: profileDeleted,
    message: 'Organisation profile cleared. You can now set up a different organisation.',
  });
}

export default requireAuth(handler);
