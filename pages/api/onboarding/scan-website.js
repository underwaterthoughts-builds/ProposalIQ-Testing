import { requireAuth } from '../../../lib/auth';
import { scrapeOrganisationSite } from '../../../lib/website-scraper';
import { extractOrganisationProfile } from '../../../lib/gemini';

// POST /api/onboarding/scan-website
// Body: { url: 'https://...' } OR { pasted_text: '...' }
//
// Returns the AI's structured extraction (offerings, client_types,
// positioning_phrases, differentiators) for the user to confirm on
// the onboarding page. Does NOT persist anything — the user reviews,
// edits, then POSTs to /api/onboarding/profile to save.
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  let corpus = '';
  let sourceMeta = {};

  // Branch 1: pasted text (escape hatch for hostile sites or SPAs)
  if (body?.pasted_text && body.pasted_text.trim().length > 20) {
    corpus = String(body.pasted_text).slice(0, 32000);
    sourceMeta = { source: 'pasted', pages_scraped: 0 };
  }
  // Branch 2: scrape a URL
  else if (body?.url) {
    const result = await scrapeOrganisationSite(body.url);
    if (result.error) {
      return res.status(200).json({
        error: result.error,
        suggest_paste: !!result.suggestPaste,
      });
    }
    corpus = result.corpus;
    sourceMeta = {
      source: 'website',
      url: body.url,
      hostname: result.hostname,
      pages_scraped: result.pages_scraped,
      scrape_errors: result.errors,
    };
  }
  else {
    return res.status(400).json({ error: 'Provide either url or pasted_text' });
  }

  if (!corpus || corpus.trim().length < 100) {
    return res.status(200).json({
      error: 'Not enough content to extract from',
      suggest_paste: true,
    });
  }

  // Run AI extraction
  let profile;
  try {
    profile = await extractOrganisationProfile(corpus);
  } catch (e) {
    console.error('scan-website extraction error:', e.message);
    return res.status(500).json({ error: 'AI extraction failed: ' + e.message });
  }

  if (!profile) {
    return res.status(200).json({
      error: 'Extraction returned no content — try pasting your services list directly',
      suggest_paste: true,
    });
  }

  return res.status(200).json({
    profile,
    source: sourceMeta,
  });
}

export default requireAuth(handler);
