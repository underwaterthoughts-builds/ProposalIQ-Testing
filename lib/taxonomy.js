// ────────────────────────────────────────────────────────────────────────────
// Two-axis taxonomy: SERVICE (what was delivered) and CLIENT (sector of client)
// Used for tiered ranking in RFP matching, repository filters, and AI tagging.
// Single source of truth — referenced by:
//   - /api/taxonomy-seed (populates taxonomy_items table)
//   - lib/gemini.js (closed-list enums in AI prompts)
//   - lib/gemini.js snapToCanonical (post-AI validation)
//   - lib/embeddings.js (sector match scoring)
// ────────────────────────────────────────────────────────────────────────────

const SERVICE_TAXONOMY = {
  'Creative Strategy & Brand': [
    'Brand Strategy', 'Brand Positioning', 'Brand Identity', 'Naming & Verbal Identity',
    'Campaign Strategy', 'Communications Strategy', 'Content Strategy',
    'Audience / Proposition Development',
  ],
  'Advertising & Campaigns': [
    'Integrated Campaigns', 'Brand Campaigns', 'Product / Service Campaigns',
    'Launch Campaigns', 'B2B Campaigns', 'Retail / Shopper Campaigns',
    'Employer Brand Campaigns', 'Cause / Purpose Campaigns',
  ],
  'PR & Media Relations': [
    'Corporate PR', 'Consumer PR', 'Media Relations', 'Executive Profiling',
    'Thought Leadership', 'Crisis Communications', 'Issues Management',
    'Reputation Management', 'Press Office / Always-On PR',
  ],
  'Corporate & Internal Communications': [
    'Internal Communications', 'Change Communications', 'Leadership Communications',
    'Employee Engagement', 'Transformation Communications',
    'Investor / Stakeholder Communications', 'Culture & Values Communications',
    'Employer Communications',
  ],
  'Content & Editorial': [
    'Editorial Content', 'Copywriting', 'Long-form Content', 'Case Studies',
    'White Papers / Reports', 'Speechwriting', 'Scriptwriting', 'Content Series',
  ],
  'Social & Digital Content': [
    'Social Media Strategy', 'Organic Social Content', 'Paid Social Content',
    'Community Management', 'Digital Content Campaigns',
    'Influencer / Creator Partnerships', 'Web / Landing Page Content',
    'Email / CRM Content',
  ],
  'Film, Video & Audio': [
    'Brand Film', 'Corporate Film', 'Documentary / Case Story', 'TVC / Commercial',
    'Social Video', 'Animation / Motion Graphics', 'CEO / Leadership Video',
    'Podcast / Audio Content', 'Event Film / Highlights',
  ],
  'Design & Experience': [
    'Graphic Design', 'Presentation / Deck Design', 'Motion Design', 'UX / UI Design',
    'Website / Microsite Design', 'Information Design / Infographics',
    'Exhibition / Experience Design', 'Campaign Visual Systems',
  ],
  'Events & Experiential': [
    'Live Events', 'Experiential Campaigns', 'Launch Events', 'Conferences / Summits',
    'Awards / Internal Events', 'Roadshows', 'Hybrid / Virtual Events',
    'Pop-Ups / Installations',
  ],
  'Research, Insights & Planning': [
    'Audience Research', 'Message Testing', 'Brand Tracking', 'Stakeholder Mapping',
    'Media / Content Audit', 'Competitive Analysis', 'Trend / Cultural Insight',
    'Communications Measurement',
  ],
  'Strategy & Advisory': [
    'Strategic Planning', 'Business Strategy', 'Market Entry Strategy', 'Growth Strategy',
    'Corporate Strategy', 'Competitive Intelligence', 'Feasibility Studies',
    'Business Case Development',
  ],
  'Management Consulting': [
    'Organisational Design', 'Operating Model Design', 'Performance Improvement',
    'Cost Reduction', 'Turnaround & Restructuring', 'Post-Merger Integration',
    'Change Management', 'Governance & Compliance',
  ],
  'Technology & Digital': [
    'Digital Transformation', 'IT Strategy & Architecture', 'Software Implementation',
    'Systems Integration', 'Cloud Migration', 'Cybersecurity', 'Data & Analytics',
    'AI & Automation', 'Product Development',
  ],
  'Programme & Project Management': [
    'Programme Management', 'Project Management', 'PMO Setup & Support', 'Agile Delivery',
    'Infrastructure Delivery', 'Construction Management',
    'Procurement & Contract Management',
  ],
  'Finance & Commercial': [
    'Financial Advisory', 'Commercial Due Diligence', 'Financial Modelling',
    'Business Valuation', 'Treasury & Risk Management', 'Accounting & Audit',
    'Tax Advisory', 'Bid Pricing & Commercial Strategy',
  ],
  'Legal & Regulatory': [
    'Legal Advisory', 'Regulatory Compliance', 'Contract Management',
    'Intellectual Property', 'Employment Law', 'Dispute Resolution',
    'Policy & Public Affairs',
  ],
  'People & Organisational Development': [
    'HR Strategy', 'Talent Management', 'Learning & Development', 'Leadership Coaching',
    'Culture & Engagement', 'Diversity & Inclusion', 'Workforce Planning',
    'Reward & Benefits',
  ],
  'Engineering & Technical': [
    'Civil & Structural Engineering', 'Mechanical & Electrical Engineering',
    'Environmental Engineering', 'Infrastructure Design', 'Energy Systems',
    'Technical Assessment & Assurance', 'Health & Safety',
  ],
  'Sustainability & ESG': [
    'ESG Strategy', 'Sustainability Reporting', 'Net Zero Planning', 'Social Value',
    'Impact Measurement', 'Environmental Assessment', 'Responsible Procurement',
  ],
};

const CLIENT_TAXONOMY = {
  'Government & Public Sector': [
    'Central Government', 'Local / Municipal Government', 'Defence & Security',
    'Justice & Public Safety', 'International Development',
    'Public Finance & Treasury', 'Smart Cities & Urban Development',
  ],
  'Healthcare & Life Sciences': [
    'Hospitals & Health Systems', 'Pharmaceuticals', 'Biotechnology', 'Medical Devices',
    'Health Insurance / Payers', 'Public Health & Policy', 'Digital Health',
  ],
  'Financial Services': [
    'Retail Banking', 'Corporate & Investment Banking', 'Asset & Wealth Management',
    'Insurance', 'FinTech', 'Payments', 'Capital Markets Infrastructure',
  ],
  'Energy, Utilities & Resources': [
    'Oil & Gas (Upstream / Midstream / Downstream)', 'Power Generation',
    'Transmission & Distribution', 'Water & Wastewater',
    'Renewables (Solar, Wind, Hydrogen)', 'Mining & Metals',
    'Energy Trading & Retail',
  ],
  'Consumer & Retail': [
    'Grocery Retail', 'Fashion & Apparel', 'Luxury Goods', 'E-commerce',
    'Consumer Packaged Goods (CPG / FMCG)', 'Food & Beverage Manufacturing',
    'Specialty Retail',
  ],
  'Industrial & Manufacturing': [
    'Automotive', 'Aerospace & Defence Manufacturing',
    'Industrial Equipment & Machinery', 'Chemicals', 'Construction Materials',
    'Electronics Manufacturing', 'Advanced Manufacturing / Industry 4.0',
  ],
  'Technology, Media & Telecommunications': [
    'Software & SaaS', 'IT Services', 'Telecommunications', 'Media & Broadcasting',
    'Gaming', 'Cloud & Infrastructure', 'Data & AI Platforms',
  ],
  'Transport, Logistics & Supply Chain': [
    'Aviation', 'Rail', 'Maritime & Ports', 'Logistics & Freight', 'Postal Services',
    'Warehousing & Distribution', 'Mobility Services',
  ],
  'Real Estate & Infrastructure': [
    'Commercial Real Estate', 'Residential Real Estate', 'Infrastructure Development',
    'Facilities Management', 'Property Investment & REITs', 'Urban Regeneration',
    'Smart Infrastructure',
  ],
  'Education': [
    'K-12 Education', 'Higher Education', 'Vocational & Technical Training', 'EdTech',
    'Education Policy & Regulation', 'Corporate Learning & Development',
  ],
  'Hospitality, Travel & Tourism': [
    'Hotels & Resorts', 'Travel & Tourism Operators', 'Airlines (Commercial)',
    'Cruise Lines', 'Events & Entertainment Venues', 'Theme Parks & Attractions',
  ],
  'Professional & Business Services': [
    'Consulting Services', 'Legal Services', 'Accounting & Audit',
    'HR & Recruitment Services', 'Marketing & Advertising',
    'Outsourcing / BPO / Shared Services',
  ],
};

const SERVICE_INDUSTRIES = Object.keys(SERVICE_TAXONOMY);
const CLIENT_INDUSTRIES = Object.keys(CLIENT_TAXONOMY);

// ── Snap-to-canonical helpers ─────────────────────────────────────────────
// LLMs sometimes paraphrase. These helpers find the closest exact match in the
// canonical taxonomy and return null if nothing close is found. Match logic:
// 1. exact case-insensitive match
// 2. canonical contains query OR query contains canonical (substring)
// 3. token-overlap similarity >= 0.6

function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenSim(a, b) {
  const ta = new Set(normalise(a).split(' ').filter(Boolean));
  const tb = new Set(normalise(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  ta.forEach(t => { if (tb.has(t)) overlap++; });
  return overlap / Math.max(ta.size, tb.size);
}

function snapIndustry(value, type /* 'service' | 'client' */) {
  if (!value) return null;
  const list = type === 'client' ? CLIENT_INDUSTRIES : SERVICE_INDUSTRIES;
  const v = normalise(value);
  // 1. exact
  for (const c of list) if (normalise(c) === v) return c;
  // 2. substring either direction
  for (const c of list) {
    const cn = normalise(c);
    if (cn.includes(v) || v.includes(cn)) return c;
  }
  // 3. best token sim above threshold
  let best = null, bestScore = 0.49;
  for (const c of list) {
    const s = tokenSim(value, c);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return best;
}

function snapSectors(values, industryName, type /* 'service' | 'client' */) {
  if (!Array.isArray(values) || !industryName) return [];
  const tax = type === 'client' ? CLIENT_TAXONOMY : SERVICE_TAXONOMY;
  const allowed = tax[industryName] || [];
  if (!allowed.length) return [];
  const out = [];
  for (const raw of values) {
    if (out.length >= 3) break;
    const v = normalise(raw);
    let snapped = null;
    // 1. exact
    for (const c of allowed) if (normalise(c) === v) { snapped = c; break; }
    // 2. substring
    if (!snapped) {
      for (const c of allowed) {
        const cn = normalise(c);
        if (cn.includes(v) || v.includes(cn)) { snapped = c; break; }
      }
    }
    // 3. token sim
    if (!snapped) {
      let best = null, bestScore = 0.49;
      for (const c of allowed) {
        const s = tokenSim(raw, c);
        if (s > bestScore) { best = c; bestScore = s; }
      }
      snapped = best;
    }
    if (snapped && !out.includes(snapped)) out.push(snapped);
  }
  return out;
}

// Validate and normalise the four taxonomy fields returned by an AI call.
// Drops anything that doesn't snap to canonical. Returns null fields rather
// than guesses — the UI shows these as "untagged" so the user can correct.
function snapTaxonomyFields(raw) {
  const r = raw || {};
  const serviceIndustry = snapIndustry(r.service_industry, 'service');
  const serviceSectors = snapSectors(r.service_sectors, serviceIndustry, 'service');
  const clientIndustry = snapIndustry(r.client_industry, 'client');
  const clientSectors = snapSectors(r.client_sectors, clientIndustry, 'client');
  return {
    service_industry: serviceIndustry,
    service_sectors: serviceSectors,
    client_industry: clientIndustry,
    client_sectors: clientSectors,
  };
}

// Build the closed-list strings injected into AI prompts
const SERVICE_INDUSTRY_ENUM = SERVICE_INDUSTRIES.join(' | ');
const CLIENT_INDUSTRY_ENUM = CLIENT_INDUSTRIES.join(' | ');

module.exports = {
  SERVICE_TAXONOMY,
  CLIENT_TAXONOMY,
  SERVICE_INDUSTRIES,
  CLIENT_INDUSTRIES,
  SERVICE_INDUSTRY_ENUM,
  CLIENT_INDUSTRY_ENUM,
  snapIndustry,
  snapSectors,
  snapTaxonomyFields,
};
