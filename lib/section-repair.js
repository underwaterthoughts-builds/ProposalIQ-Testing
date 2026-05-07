// Section-level repair pass for RFP scans.
//
// Runs after the main pipeline finishes (success OR watchdog bailout).
// Walks each scan section, checks a predicate, and re-fires the
// underlying AI call for any section that came back empty. Each section
// gets its own bounded retry (max 2 attempts × 90s timeout), runs in
// parallel with the others, and persists progress to rfp_scans.
// section_status so the UI can show "Retrying narrative advice…"
// instead of blanket "Processing".
//
// Idempotent: safe to call multiple times. The predicate determines
// what "empty" means per section — if the column already has content,
// repair skips that section.

const { getDb } = require('./db');
const { parseJsonField } = require('./embeddings');
const {
  analyseGaps, getIndustryNews, getNarrativeAdvice,
  generateWinStrategy, extractWinningLanguage,
  generateApproachAndBudget, generateExecutiveBidBrief,
} = require('./gemini');

const REPAIR_TIMEOUT_MS = 90_000;     // per-attempt cap
const MAX_ATTEMPTS = 2;               // attempts per section before giving up
const RETRY_BACKOFF_MS = 5_000;       // delay between attempts on the same section

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)
    ),
  ]);
}

// Predicates: return true when the column is considered populated.
// Stored values are JSON strings — empty means null, 'null', '[]', '""',
// or a truncated/short version of the schema. The narrative_advice column
// for example wraps text inside { text, writing_insights, proposal_structure }
// so we need to dig in.
const SECTION_CHECKS = {
  gaps: (row) => {
    const v = parseJsonField(row.gaps, []);
    return Array.isArray(v) && v.length > 0;
  },
  news: (row) => {
    const v = parseJsonField(row.news, []);
    return Array.isArray(v) && v.length > 0;
  },
  winning_language: (row) => {
    const v = parseJsonField(row.winning_language, []);
    return Array.isArray(v) && v.length > 0;
  },
  win_strategy: (row) => {
    const v = parseJsonField(row.win_strategy, null);
    return v && typeof v === 'object';
  },
  narrative_advice: (row) => {
    const v = parseJsonField(row.narrative_advice, null);
    return v && typeof v === 'object' && typeof v.text === 'string' && v.text.length > 50;
  },
  suggested_approach: (row) => {
    const v = parseJsonField(row.suggested_approach, null);
    return v && typeof v === 'object';
  },
  executive_brief: (row) => {
    const v = parseJsonField(row.executive_brief, null);
    return v && typeof v === 'object' && (v.verdict || v.priorities || v.risks);
  },
};

// Repair functions: take a context object loaded from the DB and return
// the new value to persist. Each is responsible for re-running the AI
// call with the right inputs. Returning null/undefined means "give up
// gracefully" — the column stays empty and section_status logs the failure.
const SECTION_REPAIRS = {
  gaps: async (ctx) => {
    const out = await analyseGaps(ctx.rfpData, ctx.matchedProposals, ctx.membersWithCV, ctx.orgProfile);
    if (!out) return null;
    return { col: 'gaps', value: JSON.stringify(out.gaps || []) };
  },
  news: async (ctx) => {
    const out = await getIndustryNews(ctx.rfpData, ctx.rfpText);
    return { col: 'news', value: JSON.stringify(out || []) };
  },
  winning_language: async (ctx) => {
    const won = (ctx.matchedProposals || []).filter(p => p.outcome === 'won');
    if (won.length === 0) return null;
    const out = await extractWinningLanguage(won);
    return { col: 'winning_language', value: JSON.stringify(out || []) };
  },
  win_strategy: async (ctx) => {
    const out = await generateWinStrategy(ctx.rfpData, ctx.matchedProposals, ctx.gaps, ctx.orgProfile);
    return { col: 'win_strategy', value: JSON.stringify(out) };
  },
  narrative_advice: async (ctx) => {
    const topMatch = (ctx.matchedProposals || []).find(p => p.outcome === 'won') || ctx.matchedProposals?.[0] || null;
    const text = await getNarrativeAdvice(ctx.rfpData, topMatch);
    if (!text) return null;
    // Preserve writing_insights / proposal_structure if they were already present
    const existing = parseJsonField(ctx.row.narrative_advice, null) || {};
    const wrapped = {
      text,
      writing_insights: existing.writing_insights || [],
      proposal_structure: existing.proposal_structure || null,
    };
    return { col: 'narrative_advice', value: JSON.stringify(wrapped) };
  },
  suggested_approach: async (ctx) => {
    const out = await generateApproachAndBudget(
      ctx.rfpData, ctx.matchedProposals, ctx.teamSuggestions, ctx.rateCardRoles
    );
    return { col: 'suggested_approach', value: JSON.stringify(out) };
  },
  executive_brief: async (ctx) => {
    const out = await generateExecutiveBidBrief({
      rfpData: ctx.rfpData,
      matches: ctx.matchedProposals,
      gaps: ctx.gaps,
      winStrategy: ctx.winStrategy,
      narrativeAdvice: parseJsonField(ctx.row.narrative_advice, {}).text || '',
      bidScore: ctx.bidScore,
      winningLanguage: ctx.winningLanguage,
      proposalStructure: parseJsonField(ctx.row.narrative_advice, {}).proposal_structure || null,
      marketContext: ctx.news,
      orgProfile: ctx.orgProfile,
    });
    return { col: 'executive_brief', value: JSON.stringify(out) };
  },
};

// Loads everything a repair function might need, from the scan row + adjacent
// tables. Done once up front so we don't hammer the DB during retries.
function loadRepairContext(scanId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(scanId);
  if (!row) return null;

  const ownerId = row.owner_user_id;
  const orgProfile = ownerId
    ? db.prepare('SELECT * FROM organisation_profile WHERE user_id = ?').get(ownerId)
    : null;
  if (orgProfile) {
    orgProfile.confirmed_profile = parseJsonField(orgProfile.confirmed_profile, {});
  }

  // Tenant-scoped rate card. Empty array is fine — generateApproachAndBudget
  // handles it gracefully (just produces a budget without rate-card detail).
  let rateCardRoles = [];
  try {
    rateCardRoles = ownerId
      ? db.prepare('SELECT * FROM rate_card_roles WHERE owner_user_id = ? ORDER BY sort_order').all(ownerId)
      : [];
  } catch { rateCardRoles = []; }

  // Team members with CV — used by analyseGaps. Tenant-scoped.
  let allMembers = [];
  try {
    const cvJoin = db.prepare(`
      SELECT m.*, m.cv_extracted FROM team_members m
      WHERE m.owner_user_id = ?
    `);
    allMembers = ownerId ? cvJoin.all(ownerId) : [];
    allMembers = allMembers.map(m => ({
      ...m,
      cv_extracted: parseJsonField(m.cv_extracted, null),
    }));
  } catch { allMembers = []; }

  const membersWithCV = allMembers.map(m => ({
    ...m,
    cv_summary: m.cv_extracted?.career_summary || '',
    certifications_str: m.certifications || (m.cv_extracted?.certifications || []).join(', '),
    sectors_str: m.stated_sectors || (m.cv_extracted?.sectors || []).join(', '),
    specialisms_str: (m.stated_specialisms || []).join(', '),
  }));

  return {
    row,
    rfpData: parseJsonField(row.rfp_data, {}),
    rfpText: row.rfp_text || '',
    matchedProposals: parseJsonField(row.matched_proposals, []),
    gaps: parseJsonField(row.gaps, []),
    news: parseJsonField(row.news, []),
    winningLanguage: parseJsonField(row.winning_language, []),
    winStrategy: parseJsonField(row.win_strategy, null),
    bidScore: parseJsonField(row.bid_score, null),
    teamSuggestions: parseJsonField(row.team_suggestions, []),
    rateCardRoles,
    membersWithCV,
    allMembers,
    orgProfile,
  };
}

// Persist a single section result + bump section_status.
function saveSection(scanId, col, value, statusUpdate) {
  const db = getDb();
  // Read current section_status, merge, write back.
  const row = db.prepare('SELECT section_status FROM rfp_scans WHERE id = ?').get(scanId);
  const current = parseJsonField(row?.section_status, {});
  const merged = { ...current, ...statusUpdate };
  db.prepare(`UPDATE rfp_scans SET ${col} = ?, section_status = ? WHERE id = ?`)
    .run(value, JSON.stringify(merged), scanId);
}

function bumpStatus(scanId, statusUpdate) {
  const db = getDb();
  const row = db.prepare('SELECT section_status FROM rfp_scans WHERE id = ?').get(scanId);
  const current = parseJsonField(row?.section_status, {});
  const merged = { ...current, ...statusUpdate };
  db.prepare('UPDATE rfp_scans SET section_status = ? WHERE id = ?')
    .run(JSON.stringify(merged), scanId);
}

// Repair one section. Bounded retries, exponential-ish backoff between attempts.
async function repairOneSection(scanId, section, ctx) {
  const repair = SECTION_REPAIRS[section];
  if (!repair) return false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    bumpStatus(scanId, { [section]: `retrying:${attempt}/${MAX_ATTEMPTS}` });
    try {
      const result = await withTimeout(repair(ctx), REPAIR_TIMEOUT_MS, `repair:${section}`);
      if (result && result.col && result.value !== undefined) {
        // Persist + reload row so subsequent dependent repairs (executive_brief)
        // see the freshly-written value.
        saveSection(scanId, result.col, result.value, { [section]: 'ok' });
        ctx.row[result.col] = result.value;
        // Refresh the parsed view too, since downstream repairs may read it
        if (section === 'gaps') ctx.gaps = parseJsonField(result.value, []);
        if (section === 'news') ctx.news = parseJsonField(result.value, []);
        if (section === 'winning_language') ctx.winningLanguage = parseJsonField(result.value, []);
        if (section === 'win_strategy') ctx.winStrategy = parseJsonField(result.value, null);
        return true;
      }
      bumpStatus(scanId, { [section]: 'skipped' });
      return false;
    } catch (e) {
      console.warn(`[repair ${scanId}] ${section} attempt ${attempt} failed:`, e.message);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
      } else {
        bumpStatus(scanId, { [section]: 'failed' });
      }
    }
  }
  return false;
}

// Public entry. Walks SECTION_CHECKS, identifies empty sections, retries
// in parallel. Returns a summary of what was repaired/skipped/failed.
//
// Note: executive_brief depends on other sections, so we repair it LAST
// (sequentially after the others) so it can incorporate any sections
// that were just regenerated.
async function repairScanSections(scanId) {
  const db = getDb();
  const ctx = loadRepairContext(scanId);
  if (!ctx) return { repaired: [], skipped: [], failed: [], reason: 'scan-not-found' };

  // Identify which sections are currently empty.
  const empty = [];
  for (const [section, check] of Object.entries(SECTION_CHECKS)) {
    if (!check(ctx.row)) empty.push(section);
  }

  if (empty.length === 0) {
    return { repaired: [], skipped: [], failed: [], reason: 'all-sections-ok' };
  }

  console.log(`[repair ${scanId}] starting — empty sections: ${empty.join(', ')}`);

  // Mark all empty sections as queued
  const initial = {};
  for (const s of empty) initial[s] = 'queued';
  bumpStatus(scanId, initial);

  // Run all non-brief sections in parallel; brief depends on the others
  // so we run it last, only if it was empty.
  const briefIsEmpty = empty.includes('executive_brief');
  const parallelSections = empty.filter(s => s !== 'executive_brief');

  const results = await Promise.allSettled(
    parallelSections.map(s => repairOneSection(scanId, s, ctx))
  );

  if (briefIsEmpty) {
    // Re-load context so brief sees freshly-repaired sections.
    const freshCtx = loadRepairContext(scanId);
    if (freshCtx) {
      await repairOneSection(scanId, 'executive_brief', freshCtx);
    }
  }

  // Final summary — re-read section_status now that everything is settled.
  const finalRow = db.prepare('SELECT section_status FROM rfp_scans WHERE id = ?').get(scanId);
  const status = parseJsonField(finalRow?.section_status, {});
  const summary = { repaired: [], skipped: [], failed: [] };
  for (const s of empty) {
    const v = status[s];
    if (v === 'ok') summary.repaired.push(s);
    else if (v === 'failed') summary.failed.push(s);
    else summary.skipped.push(s);
  }
  console.log(`[repair ${scanId}] done — repaired: [${summary.repaired.join(', ')}] failed: [${summary.failed.join(', ')}] skipped: [${summary.skipped.join(', ')}]`);
  return summary;
}

module.exports = {
  repairScanSections,
  SECTION_CHECKS,
  loadRepairContext,
};
