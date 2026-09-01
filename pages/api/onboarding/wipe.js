import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { isAdmin } from '../../../lib/tenancy';

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
    const r = db.prepare("DELETE FROM organisation_profile WHERE user_id = ?").run(req.user.id);
    profileDeleted = r.changes || 0;
    // Also un-stamp onboarded_at so the user goes back through the flow
    db.prepare("UPDATE users SET onboarded_at = NULL WHERE id = ?").run(req.user.id);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete profile: ' + e.message });
  }

  // settings.org_name is WORKSPACE-GLOBAL (key/value table, no owner
  // column) — only an admin's wipe may reset it. A member clearing their
  // own profile must not blank the shared org name for everyone.
  if (isAdmin(req.user)) {
    try {
      db.prepare("UPDATE settings SET value = '' WHERE key = 'org_name'").run();
    } catch (e) {
      console.error('[onboarding/wipe] org_name reset failed:', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    profile_deleted: profileDeleted,
    message: 'Organisation profile cleared. You can now set up a different organisation.',
  });
}

export default requireAuth(handler);
