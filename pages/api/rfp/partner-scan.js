import { requireAuth } from '../../../lib/auth';
import { scrapeOrganisationSite } from '../../../lib/website-scraper';
import { extractOrganisationProfile } from '../../../lib/gemini';

// POST /api/rfp/partner-scan
// Body: { url: 'https://partner-agency.com' }
//
// Scrapes a PARTNER agency's public site and returns a compact,
// user-editable competencies string for the Partnership Bid box on the
// RFP upload page. Reuses the onboarding scraper (SSRF-guarded) and
// profile extractor; nothing is persisted — the user reviews/edits the
// string, and it's stored with the scan on submit.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body?.url || !String(body.url).trim()) {
    return res.status(400).json({ error: 'url required' });
  }

  const result = await scrapeOrganisationSite(String(body.url).trim());
  if (result.error) {
    return res.status(200).json({ error: result.error, suggest_manual: true });
  }
  if (!result.corpus || result.corpus.trim().length < 100) {
    return res.status(200).json({ error: 'Not enough readable content on that site', suggest_manual: true });
  }

  let profile;
  try {
    profile = await extractOrganisationProfile(result.corpus);
  } catch (e) {
    console.error('[partner-scan] extraction failed:', e.message);
    return res.status(500).json({ error: 'AI extraction failed: ' + e.message });
  }

  // Flatten the structured profile into one editable competencies line:
  // core offerings first, then other offerings, then a differentiator if
  // there's room. Capped so the prompt block stays lean.
  const offerings = Array.isArray(profile?.offerings) ? profile.offerings : [];
  const core = offerings.filter(o => o.is_core).map(o => o.label);
  const other = offerings.filter(o => !o.is_core).map(o => o.label);
  const diffs = Array.isArray(profile?.differentiators) ? profile.differentiators : [];

  let capabilities = [...core, ...other].filter(Boolean).join('; ');
  if (diffs[0] && capabilities.length + diffs[0].length < 550) {
    capabilities += (capabilities ? '. Notable: ' : '') + diffs[0];
  }
  capabilities = capabilities.slice(0, 600);

  if (!capabilities) {
    return res.status(200).json({ error: 'Could not identify competencies on that site', suggest_manual: true });
  }

  return res.status(200).json({
    capabilities,
    hostname: result.hostname,
    pages_scraped: result.pages_scraped,
    offerings_found: offerings.length,
  });
}

export default requireAuth(handler);
