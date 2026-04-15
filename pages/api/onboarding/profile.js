import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { safe } from '../../../lib/embeddings';
import crypto from 'crypto';

// GET  /api/onboarding/profile → current user's confirmed profile (or null)
// POST /api/onboarding/profile → upsert current user's profile; also stamps
//                                 users.onboarded_at so the onboarding gate
//                                 in useUser stops redirecting them here.
//
// Per-user since the multi-tenant migration. The table still carries an
// id column for legacy reasons, but user_id is the real key (UNIQUE index).
async function handler(req, res) {
  const db = getDb();
  const userId = req.user.id;

  if (req.method === 'GET') {
    const row = db.prepare("SELECT * FROM organisation_profile WHERE user_id = ?").get(userId);
    if (!row) {
      return res.status(200).json({ profile: null });
    }
    return res.status(200).json({
      profile: {
        ...row,
        extracted_snapshot: safe(row.extracted_snapshot, {}),
        confirmed_profile: safe(row.confirmed_profile, {}),
      },
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const confirmed = {
      offerings: Array.isArray(body?.confirmed_profile?.offerings)
        ? body.confirmed_profile.offerings.map(o => ({
            label: String(o.label || '').slice(0, 200),
            canonical_taxonomy_match: o.canonical_taxonomy_match || null,
            is_core: !!o.is_core,
            source: o.source || 'user_edited',
            confidence: o.confidence || null,
            evidence: String(o.evidence || '').slice(0, 500),
          })).filter(o => o.label)
        : [],
      client_types: Array.isArray(body?.confirmed_profile?.client_types)
        ? body.confirmed_profile.client_types.map(c => ({
            label: String(c.label || '').slice(0, 200),
            canonical_taxonomy_match: c.canonical_taxonomy_match || null,
          })).filter(c => c.label)
        : [],
      positioning_phrases: Array.isArray(body?.confirmed_profile?.positioning_phrases)
        ? body.confirmed_profile.positioning_phrases.map(p => String(p).slice(0, 500)).filter(Boolean)
        : [],
      differentiators: Array.isArray(body?.confirmed_profile?.differentiators)
        ? body.confirmed_profile.differentiators.map(d => String(d).slice(0, 500)).filter(Boolean)
        : [],
    };

    const extracted = body?.extracted_snapshot || null;
    const orgName = String(body?.org_name || '').slice(0, 200);
    const websiteUrl = String(body?.website_url || '').slice(0, 500);

    const existing = db.prepare("SELECT id FROM organisation_profile WHERE user_id = ?").get(userId);

    if (existing) {
      db.prepare(`
        UPDATE organisation_profile SET
          org_name = ?,
          website_url = ?,
          extracted_snapshot = CASE WHEN ? = '{}' THEN extracted_snapshot ELSE ? END,
          confirmed_profile = ?,
          last_scanned_at = CASE WHEN ? = '{}' THEN last_scanned_at ELSE CURRENT_TIMESTAMP END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        orgName, websiteUrl,
        JSON.stringify(extracted || {}), JSON.stringify(extracted || {}),
        JSON.stringify(confirmed),
        JSON.stringify(extracted || {}),
        existing.id
      );
    } else {
      const newId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO organisation_profile (
          id, user_id, org_name, website_url, extracted_snapshot, confirmed_profile,
          last_scanned_at, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        newId, userId, orgName, websiteUrl,
        JSON.stringify(extracted || {}),
        JSON.stringify(confirmed)
      );
    }

    // Saving the profile completes onboarding. Idempotent — once stamped,
    // subsequent saves keep the original timestamp.
    db.prepare("UPDATE users SET onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP) WHERE id = ?").run(userId);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
