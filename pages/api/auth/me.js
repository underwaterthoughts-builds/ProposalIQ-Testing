import { getUserFromReq } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export default function handler(req, res) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  // Onboarding gate: source-of-truth is the actual profile content, not
  // users.onboarded_at, so any user (incl. seeded admins) who hasn't
  // filled in their organisation lands on /onboarding/profile every login.
  let needsOnboarding = true;
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT org_name, confirmed_profile FROM organisation_profile WHERE user_id = ?'
    ).get(user.id);
    if (row) {
      const orgName = (row.org_name || '').trim();
      let offerings = [];
      try {
        const cp = JSON.parse(row.confirmed_profile || '{}');
        offerings = Array.isArray(cp?.offerings) ? cp.offerings : [];
      } catch {}
      if (orgName && offerings.length > 0) needsOnboarding = false;
    }
  } catch {}

  return res.status(200).json({ user: { ...user, needs_onboarding: needsOnboarding } });
}
