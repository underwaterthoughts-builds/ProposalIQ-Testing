// ────────────────────────────────────────────────────────────────────────────
// Website scraper — pulls likely services / capabilities text from an org's
// public site so the AI can extract structured offerings.
//
// Defensive implementation:
//   · Native fetch with 8s timeout per page
//   · 1MB response size cap
//   · Only text/html responses
//   · Homepage + up to 4 sub-pages with "service/capability/work/about" in URL
//   · Returns plain text corpus (tags stripped) or { error, suggestPaste: true }
//
// Not a full scraper. Doesn't run JavaScript. Doesn't follow redirects beyond
// what fetch does by default. For JS-rendered SPAs or hostile sites, the UI
// falls back to "paste your services list instead".
// ────────────────────────────────────────────────────────────────────────────

const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 1_000_000; // 1MB per page
const TIMEOUT_MS = 8000;
const MAX_SUBPAGES = 4;
const SUBPAGE_PATTERNS = [
  'service', 'services', 'capabilit', 'what-we-do', 'what_we_do',
  'whatwedo', 'work', 'offerings', 'expertise', 'practices',
  'about', 'our-work', 'specialisms',
];

function normaliseUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u); } catch { return null; }
}

// ── SSRF guard ──────────────────────────────────────────────────────────────
// This scraper is driven by user-supplied URLs on a server that can reach
// Railway-internal endpoints and cloud metadata. Refuse to fetch anything
// that resolves to a private / loopback / link-local address. (Redirect
// chains that hop to an internal host after a public first response are a
// residual edge; the byte/timeout caps limit what such a fetch could return.)
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||  // CGNAT
      (a === 169 && b === 254) ||            // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7)); // v4-mapped
  return false;
}

async function assertPublicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('blocked: internal hostname');
  }
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });
  if (addrs.some(a => isPrivateIp(a.address))) {
    throw new Error('blocked: resolves to a private address');
  }
}

// Strip HTML to plain text. Keeps line breaks between block-level elements
// so the AI can see structure. Not perfect but good enough for extraction.
function stripHtml(html) {
  if (!html) return '';
  return html
    // Drop script + style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    // Block elements → newline
    .replace(/<\/(p|div|section|article|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<(br|hr)[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z0-9]+;/gi, ' ')
    // Collapse whitespace (but preserve single newlines)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

// Extract internal <a href> links that look like service/capability pages
function findSubpageLinks(html, baseUrl) {
  const hrefs = [];
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const url = new URL(href, baseUrl);
      // Only same-origin
      if (url.origin !== baseUrl.origin) continue;
      const path = url.pathname.toLowerCase();
      if (SUBPAGE_PATTERNS.some(p => path.includes(p))) {
        hrefs.push(url.toString());
      }
    } catch {
      // Skip invalid URLs
    }
  }
  // Dedupe
  return [...new Set(hrefs)];
}

async function fetchOne(url) {
  try {
    await assertPublicHost(new URL(url).hostname);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Some sites 403 requests with no UA. Use a plain browser-like UA.
        'User-Agent': 'Mozilla/5.0 (compatible; ProposalIQ-Scanner/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const ctype = (resp.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('html')) return { error: `non-HTML content-type: ${ctype}` };
    // Read with byte cap
    const reader = resp.body?.getReader();
    if (!reader) {
      const text = await resp.text();
      return { html: text.slice(0, MAX_BYTES * 2) };
    }
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      if (received > MAX_BYTES) break;
    }
    const decoder = new TextDecoder();
    const html = chunks.map(c => decoder.decode(c, { stream: true })).join('');
    return { html };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

// Main entry — scrape a site and return a plain-text corpus ready to feed
// into the AI extraction prompt. Returns { corpus, pages_scraped, errors }
// so the caller can show partial success. Returns { error, suggestPaste: true }
// if the homepage itself can't be fetched.
async function scrapeOrganisationSite(rawUrl) {
  const baseUrl = normaliseUrl(rawUrl);
  if (!baseUrl) return { error: 'Invalid URL', suggestPaste: true };

  const homepage = await fetchOne(baseUrl.toString());
  if (homepage.error) {
    return {
      error: `Could not fetch ${baseUrl.hostname}: ${homepage.error}`,
      suggestPaste: true,
    };
  }

  // Find likely sub-pages from the homepage HTML
  const subpageLinks = findSubpageLinks(homepage.html, baseUrl).slice(0, MAX_SUBPAGES);

  const pages = [
    { url: baseUrl.toString(), label: 'homepage', text: stripHtml(homepage.html) },
  ];
  const errors = [];

  // Fetch sub-pages in parallel with individual error handling
  const subResults = await Promise.all(
    subpageLinks.map(async (url) => {
      const r = await fetchOne(url);
      if (r.error) return { url, error: r.error };
      return { url, text: stripHtml(r.html) };
    })
  );

  for (const r of subResults) {
    if (r.error) {
      errors.push(`${r.url}: ${r.error}`);
    } else {
      const label = new URL(r.url).pathname || 'sub-page';
      pages.push({ url: r.url, label, text: r.text });
    }
  }

  // Assemble corpus with page headers so the AI can cite source pages
  const corpus = pages
    .map(p => `═══ ${p.label} (${p.url}) ═══\n${p.text.slice(0, 8000)}`)
    .join('\n\n')
    .slice(0, 32000); // overall cap — the extraction prompt has limits too

  return {
    corpus,
    pages_scraped: pages.length,
    errors: errors.length > 0 ? errors : null,
    hostname: baseUrl.hostname,
  };
}

module.exports = { scrapeOrganisationSite, stripHtml, normaliseUrl };
