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
  'Advertising & Campaigns': [
    'B2B Campaigns', 'Brand Campaigns', 'Cause / Purpose Campaigns',
    'Employer Brand Campaigns', 'Integrated Campaigns', 'Launch Campaigns',
    'Product / Service Campaigns', 'Retail / Shopper Campaigns',
  ],
  'Content & Editorial': [
    'Case Studies', 'Content Series', 'Copywriting', 'Editorial Content',
    'Long-form Content', 'Scriptwriting', 'Speechwriting',
    'White Papers / Reports',
  ],
  'Corporate & Internal Communications': [
    'Change Communications', 'Culture & Values Communications',
    'Employee Engagement', 'Employer Communications', 'Internal Communications',
    'Investor / Stakeholder Communications', 'Leadership Communications',
    'Transformation Communications',
  ],
  'Creative Strategy & Brand': [
    'Audience / Proposition Development', 'Brand Identity', 'Brand Positioning',
    'Brand Strategy', 'Campaign Strategy', 'Communications Strategy',
    'Content Strategy', 'Naming & Verbal Identity',
  ],
  'Design & Experience': [
    'Campaign Visual Systems', 'Exhibition / Experience Design',
    'Graphic Design', 'Information Design / Infographics', 'Motion Design',
    'Presentation / Deck Design', 'UX / UI Design', 'Website / Microsite Design',
  ],
  'Engineering & Technical': [
    'Civil & Structural Engineering', 'Energy Systems',
    'Environmental Engineering', 'Health & Safety', 'Infrastructure Design',
    'Mechanical & Electrical Engineering', 'Technical Assessment & Assurance',
  ],
  'Events & Experiential': [
    'Awards / Internal Events', 'Conferences / Summits',
    'Experiential Campaigns', 'Hybrid / Virtual Events', 'Launch Events',
    'Live Events', 'Pop-Ups / Installations', 'Roadshows',
  ],
  'Film, Video & Audio': [
    'Animation / Motion Graphics', 'Brand Film', 'CEO / Leadership Video',
    'Corporate Film', 'Documentary / Case Story', 'Event Film / Highlights',
    'Podcast / Audio Content', 'Social Video', 'TVC / Commercial',
  ],
  'Finance & Commercial': [
    'Accounting & Audit', 'Bid Pricing & Commercial Strategy',
    'Business Valuation', 'Commercial Due Diligence', 'Financial Advisory',
    'Financial Modelling', 'Tax Advisory', 'Treasury & Risk Management',
  ],
  'Legal & Regulatory': [
    'Contract Management', 'Dispute Resolution', 'Employment Law',
    'Intellectual Property', 'Legal Advisory', 'Policy & Public Affairs',
    'Regulatory Compliance',
  ],
  'Management Consulting': [
    'Change Management', 'Cost Reduction', 'Governance & Compliance',
    'Operating Model Design', 'Organisational Design', 'Performance Improvement',
    'Post-Merger Integration', 'Turnaround & Restructuring',
  ],
  'PR & Media Relations': [
    'Consumer PR', 'Corporate PR', 'Crisis Communications',
    'Executive Profiling', 'Issues Management', 'Media Relations',
    'Press Office / Always-On PR', 'Reputation Management', 'Thought Leadership',
  ],
  'People & Organisational Development': [
    'Culture & Engagement', 'Diversity & Inclusion', 'HR Strategy',
    'Leadership Coaching', 'Learning & Development', 'Reward & Benefits',
    'Talent Management', 'Workforce Planning',
  ],
  'Programme & Project Management': [
    'Agile Delivery', 'Construction Management', 'Infrastructure Delivery',
    'PMO Setup & Support', 'Procurement & Contract Management',
    'Programme Management', 'Project Management',
  ],
  'Research, Insights & Planning': [
    'Audience Research', 'Brand Tracking', 'Communications Measurement',
    'Competitive Analysis', 'Media / Content Audit', 'Message Testing',
    'Stakeholder Mapping', 'Trend / Cultural Insight',
  ],
  'Social & Digital Content': [
    'Community Management', 'Digital Content Campaigns', 'Email / CRM Content',
    'Influencer / Creator Partnerships', 'Organic Social Content',
    'Paid Social Content', 'Social Media Strategy', 'Web / Landing Page Content',
  ],
  'Strategy & Advisory': [
    'Business Case Development', 'Business Strategy', 'Competitive Intelligence',
    'Corporate Strategy', 'Feasibility Studies', 'Growth Strategy',
    'Market Entry Strategy', 'Strategic Planning',
  ],
  'Sustainability & ESG': [
    'ESG Strategy', 'Environmental Assessment', 'Impact Measurement',
    'Net Zero Planning', 'Responsible Procurement', 'Social Value',
    'Sustainability Reporting',
  ],
  'Technology & Digital': [
    'AI & Automation', 'Cloud Migration', 'Cybersecurity', 'Data & Analytics',
    'Digital Transformation', 'IT Strategy & Architecture',
    'Product Development', 'Software Implementation', 'Systems Integration',
  ],
};

const CLIENT_TAXONOMY = {
  'Consumer & Retail': [
    'Consumer Packaged Goods (CPG / FMCG)', 'E-commerce', 'Fashion & Apparel',
    'Food & Beverage Manufacturing', 'Grocery Retail', 'Luxury Goods',
    'Specialty Retail',
  ],
  'Education': [
    'Corporate Learning & Development', 'EdTech',
    'Education Policy & Regulation', 'Higher Education', 'K-12 Education',
    'Vocational & Technical Training',
  ],
  'Energy, Utilities & Resources': [
    'Energy Trading & Retail', 'Mining & Metals',
    'Oil & Gas (Upstream / Midstream / Downstream)', 'Power Generation',
    'Renewables (Solar, Wind, Hydrogen)', 'Transmission & Distribution',
    'Water & Wastewater',
  ],
  'Financial Services': [
    'Asset & Wealth Management', 'Capital Markets Infrastructure',
    'Corporate & Investment Banking', 'FinTech', 'Insurance', 'Payments',
    'Retail Banking',
  ],
  'Government & Public Sector': [
    'Central Government', 'Defence & Security', 'International Development',
    'Justice & Public Safety', 'Local / Municipal Government',
    'Public Finance & Treasury', 'Smart Cities & Urban Development',
  ],
  'Healthcare & Life Sciences': [
    'Biotechnology', 'Digital Health', 'Health Insurance / Payers',
    'Hospitals & Health Systems', 'Medical Devices', 'Pharmaceuticals',
    'Public Health & Policy',
  ],
  'Hospitality, Travel & Tourism': [
    'Airlines (Commercial)', 'Cruise Lines', 'Events & Entertainment Venues',
    'Hotels & Resorts', 'Theme Parks & Attractions',
    'Travel & Tourism Operators',
  ],
  'Industrial & Manufacturing': [
    'Advanced Manufacturing / Industry 4.0', 'Aerospace & Defence Manufacturing',
    'Automotive', 'Chemicals', 'Construction Materials',
    'Electronics Manufacturing', 'Industrial Equipment & Machinery',
  ],
  'Professional & Business Services': [
    'Accounting & Audit', 'Consulting Services', 'HR & Recruitment Services',
    'Legal Services', 'Marketing & Advertising',
    'Outsourcing / BPO / Shared Services',
  ],
  'Real Estate & Infrastructure': [
    'Commercial Real Estate', 'Facilities Management',
    'Infrastructure Development', 'Property Investment & REITs',
    'Residential Real Estate', 'Smart Infrastructure', 'Urban Regeneration',
  ],
  'Technology, Media & Telecommunications (TMT)': [
    'Cloud & Infrastructure', 'Data & AI Platforms', 'Gaming', 'IT Services',
    'Media & Broadcasting', 'Software & SaaS', 'Telecommunications',
  ],
  'Transport, Logistics & Supply Chain': [
    'Aviation', 'Logistics & Freight', 'Maritime & Ports', 'Mobility Services',
    'Postal Services', 'Rail', 'Warehousing & Distribution',
  ],
  'Technology, Media & Telecommunications': [
    'Software & SaaS', 'IT Services', 'Telecommunications',
    'Media & Broadcasting', 'Gaming', 'Cloud & Infrastructure',
    'Data & AI Platforms',
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

// ── Text-based inference fallback ─────────────────────────────────────────
// When a proposal has no explicit taxonomy tags (because it hasn't been
// re-analysed since the taxonomy was added), we can still infer its likely
// industry from its existing text fields — name, sector, AI metadata themes,
// methodologies. This is a cheap (non-AI) heuristic so it can run for every
// proposal on every RFP scan without cost concerns.

const STRONG_HINTS = {
  client: {
    'Government & Public Sector': [
      'government', 'public sector', 'civil service', 'whitehall', 'crown',
      'ministry of', 'mod ', 'mod,', 'mod.', 'mod_', 'home office',
      'local authority', 'council', 'devolved administration', 'cabinet office',
      'national security', 'border force', 'national audit',
    ],
    'Healthcare & Life Sciences': [
      'nhs', 'hospital trust', 'healthcare', 'clinical', 'patient', 'pharma',
      'pharmaceutical', 'biotech', 'medical device', 'life sciences',
      'foundation trust', 'ccg', 'icb',
    ],
    'Financial Services': [
      'bank', 'banking', 'insurance', 'wealth management', 'asset management',
      'fintech', 'payments', 'capital markets', 'investment banking',
      'building society', 'fca', 'pra', 'lloyds', 'barclays', 'hsbc',
    ],
    'Energy, Utilities & Resources': [
      'oil and gas', 'oil & gas', 'mining', 'mineral', 'renewable energy',
      'wind farm', 'solar', 'utility', 'power station', 'national grid',
      'water company', 'wastewater', 'hydrogen', 'nuclear',
    ],
    'Consumer & Retail': [
      'retail', 'fashion', 'apparel', 'grocery', 'e-commerce', 'ecommerce',
      'fmcg', 'cpg', 'consumer goods', 'high street', 'supermarket',
    ],
    'Industrial & Manufacturing': [
      'aerospace', 'defence', 'defense', 'uav', 'unmanned aerial', 'unmanned',
      'drone', 'autonomous system', 'autonomous vehicle', 'avionics',
      'automotive', 'manufacturing', 'industrial', 'weapons', 'armoured',
      'tactical', 'military', 'air force', 'naval', 'army',
      'systems integration', 'platform validation',
      // Defence/industrial companies — NOT airlines or transport
      'bae systems', 'bae ',
      'lockheed', 'raytheon', 'thales', 'leonardo',
      'general dynamics', 'northrop', 'safran', 'smiths group',
      'general electric', ' ge ', 'siemens', 'honeywell',
      'caterpillar',
    ],
    'Technology, Media & Telecommunications': [
      'saas', 'software company', 'telecom', 'broadcasting', 'media company',
      'streaming', 'gaming', 'cloud provider', 'data platform',
    ],
    'Transport, Logistics & Supply Chain': [
      'logistics', 'haulage', 'shipping', 'freight', 'rail operator',
      'airline', 'port operator', 'supply chain', 'mobility',
      // Airlines + aerospace OEMs are transport/aviation
      'airbus', 'boeing', 'rolls-royce', 'rolls royce',
      'british airways', 'emirates', 'etihad', 'lufthansa', 'qatar airways',
      'virgin atlantic', 'easyjet', 'ryanair', 'delta airlines',
    ],
    'Real Estate & Infrastructure': [
      'real estate', 'commercial property', 'reit', 'facilities management',
      'construction project', 'infrastructure development',
    ],
    'Education': [
      'school', 'university', 'higher education', 'edtech', 'pupil', 'student',
      'further education', 'multi-academy trust',
    ],
    'Hospitality, Travel & Tourism': [
      'hotel', 'resort', 'travel agent', 'tourism', 'cruise', 'theme park',
    ],
    'Professional & Business Services': [
      'consulting firm', 'legal practice', 'accountancy', 'audit firm',
      'recruitment agency', 'bpo', 'shared services',
    ],
  },
  service: {
    'Creative Strategy & Brand': [
      'brand strategy', 'brand identity', 'brand positioning', 'naming',
      'verbal identity', 'communications strategy',
    ],
    'Advertising & Campaigns': [
      'integrated campaign', 'advertising', 'launch campaign', 'b2b campaign',
      'shopper marketing', 'employer brand campaign',
    ],
    'PR & Media Relations': [
      'public relations', 'media relations', ' pr ', 'crisis comms',
      'reputation management', 'press office', 'thought leadership',
    ],
    'Corporate & Internal Communications': [
      'internal communications', 'change communications', 'employee engagement',
      'leadership communications', 'transformation communications',
    ],
    'Content & Editorial': [
      'copywriting', 'editorial', 'content strategy', 'long-form',
      'white paper', 'speechwriting',
    ],
    'Social & Digital Content': [
      'social media', 'community management', 'paid social', 'influencer',
      'organic social',
    ],
    'Film, Video & Audio': [
      ' film ', 'film,', 'film.', 'film_', 'video production', 'corporate film',
      'documentary', 'animation', 'tvc', 'commercial', 'podcast',
      'storytelling', 'visual storytelling',
    ],
    'Design & Experience': [
      ' ux ', 'ux,', ' ui ', 'ui,', 'graphic design', 'visual design',
      'website design', 'microsite', 'experience design', 'infographic',
    ],
    'Events & Experiential': [
      'live event', 'experiential', 'conference', 'roadshow', 'pop-up',
      'launch event', 'summit',
    ],
    'Research, Insights & Planning': [
      'audience research', 'message testing', 'brand tracking',
      'stakeholder mapping', 'competitive analysis', 'cultural insight',
    ],
    'Strategy & Advisory': [
      'strategic plan', 'business strategy', 'growth strategy', 'feasibility',
      'market entry', 'business case',
    ],
    'Management Consulting': [
      'operating model', 'organisational design', 'cost reduction',
      'change management', 'performance improvement', 'turnaround',
      'post-merger',
    ],
    'Technology & Digital': [
      'digital transformation', 'cloud migration', 'cybersecurity', 'cyber ',
      'data analytics', 'software implementation', 'systems integration',
      'ai automation',
    ],
    'Programme & Project Management': [
      'programme management', 'project management', 'pmo', 'agile delivery',
      'infrastructure delivery', 'construction management',
    ],
    'Finance & Commercial': [
      'financial advisory', 'due diligence', 'financial model', 'valuation',
      'tax advisory', 'treasury',
    ],
    'Legal & Regulatory': [
      'legal advisory', 'regulatory compliance', 'contract management',
      'intellectual property', 'employment law',
    ],
    'People & Organisational Development': [
      'hr strategy', 'leadership coaching', 'talent management',
      'learning and development', ' l&d ', 'workforce planning',
    ],
    'Engineering & Technical': [
      'engineering', 'technical assurance', 'civil engineering',
      'mechanical engineering', 'systems engineering', 'integration assurance',
      'technical assessment', 'verification and validation',
      'independent technical', 'systems integration assurance',
      'autonomous systems validation', 'platform validation',
    ],
    'Sustainability & ESG': [
      ' esg ', 'esg,', 'sustainability', 'net zero', 'social value',
      'carbon footprint', 'environmental assessment', 'responsible procurement',
    ],
  },
};

// Score how strongly a text blob matches each industry. Returns the best
// industry or null if no match is confident enough.
function inferIndustryFromText(text, type) {
  if (!text) return null;
  const tax = type === 'client' ? CLIENT_TAXONOMY : SERVICE_TAXONOMY;
  const hints = STRONG_HINTS[type] || {};
  // Pad with spaces so word-boundary hints like ' mod ' work at edges
  const lower = (' ' + String(text).toLowerCase() + ' ').replace(/\s+/g, ' ');

  let best = null, bestScore = 1;
  for (const [industry, sectors] of Object.entries(tax)) {
    let score = 0;

    // Hint terms — strongest signal (curated to actually appear in real text)
    for (const hint of (hints[industry] || [])) {
      if (lower.includes(hint)) score += 3;
    }

    // Industry name itself (rare to appear, very high signal when it does)
    if (lower.includes(industry.toLowerCase())) score += 5;

    // Canonical sector names — moderate signal
    for (const sector of sectors) {
      const secLower = sector.toLowerCase();
      if (lower.includes(secLower)) { score += 3; continue; }
      // Try the most distinctive token in the sector name
      const tokens = secLower.split(/[^a-z0-9]+/).filter(t => t.length >= 6);
      for (const tok of tokens) {
        if (lower.includes(tok)) { score += 1; break; }
      }
    }

    if (score > bestScore) { bestScore = score; best = industry; }
  }
  return best;
}

// Run inference against a proposal row, building a corpus from its text fields.
// Returns { client_industry, service_industry } — either may be null if no
// confident match. Used as fallback when explicit taxonomy columns are NULL
// (proposals uploaded before the taxonomy was added).
function inferTaxonomyFromProposal(proposal) {
  const meta = proposal.ai_metadata || {};
  const corpus = [
    proposal.name,
    proposal.client,
    proposal.sector,
    proposal.project_type,
    proposal.description,
    meta.industry_context,
    ...(Array.isArray(meta.key_themes) ? meta.key_themes : []),
    ...(Array.isArray(meta.methodologies) ? meta.methodologies : []),
    ...(Array.isArray(meta.tools_technologies) ? meta.tools_technologies : []),
    ...(Array.isArray(meta.deliverables) ? meta.deliverables : []),
    ...(Array.isArray(meta.client_pain_points) ? meta.client_pain_points : []),
    ...(Array.isArray(meta.value_propositions) ? meta.value_propositions : []),
  ].filter(Boolean).join(' ');

  return {
    client_industry: inferIndustryFromText(corpus, 'client'),
    service_industry: inferIndustryFromText(corpus, 'service'),
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
  inferIndustryFromText,
  inferTaxonomyFromProposal,
};
