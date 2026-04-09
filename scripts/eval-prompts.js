#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────
// Prompt evaluation harness
//
// Runs each fixture in evaluations/fixtures/ through the relevant prompt
// (analyseProposal or extractRFPData) and scores the output against
// deterministic checks for specificity, grounding, schema completeness,
// and known-bad filler patterns.
//
// Usage:
//   node scripts/eval-prompts.js
//   node scripts/eval-prompts.js --kind=proposal
//   node scripts/eval-prompts.js --fixture=fixture-001
//
// Requires GEMINI_API_KEY and/or OPENAI_API_KEY in env.
// ────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

// Load env from .env.local if present (no dotenv dependency — manual parse)
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
} catch {}

const { analyseProposal, extractRFPData } = require('../lib/gemini');

// ── Args ───────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const FIXTURES_DIR = path.join(__dirname, '..', 'evaluations', 'fixtures');
const RUNS_DIR = path.join(__dirname, '..', 'evaluations', 'runs');
if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });

// ── Filler / generic phrase blacklist ──────────────────────────────────────
// If any of these appear in the output, the prompt has drifted toward generic.
const FILLER_PATTERNS = [
  /proven track record/i,
  /dedicated team/i,
  /delivering value/i,
  /trusted partner/i,
  /best.in.class/i,
  /industry.leading/i,
  /cutting.edge/i,
  /world.class/i,
  /innovative solution/i,
  /transforming the future/i,
  /unlock.+potential/i,
  /seamless(ly)? integrate/i,
  /robust and scalable/i,
  /tailored to your needs/i,
];

// Generic theme blacklist — these should never appear as a "key_theme"
const GENERIC_THEMES = new Set([
  'innovation', 'transformation', 'data', 'strategy', 'value',
  'expertise', 'experience', 'quality', 'partnership',
  'digital transformation', 'change management',
]);

// ── Specificity heuristics ─────────────────────────────────────────────────
// A field is "specific" if it contains at least one of:
//   - a number (£, %, count)
//   - a capitalised proper noun (named entity)
//   - a quoted phrase
//   - a hyphenated technical term
function isSpecific(text) {
  if (!text || typeof text !== 'string') return false;
  if (/[0-9]/.test(text)) return true;
  if (/£|\$|€/.test(text)) return true;
  if (/"[^"]{8,}"/.test(text)) return true;
  // Two consecutive capitalised words (rough proper-noun detection)
  if (/\b[A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+/.test(text)) return true;
  // Hyphenated technical term
  if (/\b\w+-\w+(-\w+)?\b/.test(text)) return true;
  return false;
}

// ── Score one analyseProposal output ───────────────────────────────────────
function scoreProposalOutput(out, fixture) {
  const result = {
    schema_complete: 0,
    specificity_score: 0,
    grounding_pass: true,
    filler_pass: true,
    calibration_drift: null,
    issues: [],
  };

  if (!out) {
    result.issues.push('NULL output — call failed entirely');
    return result;
  }

  // Schema completeness
  const required = ['executive_summary', 'key_themes', 'deliverables',
    'value_propositions', 'standout_sentences', 'writing_quality'];
  const present = required.filter(k => {
    const v = out[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  result.schema_complete = Math.round((present.length / required.length) * 100);

  // Specificity — sample fields where it matters most
  const specCheckFields = [
    out.executive_summary,
    ...(out.key_themes || []),
    ...(out.value_propositions || []),
    ...(out.deliverables || []),
  ].filter(Boolean);
  const specHits = specCheckFields.filter(isSpecific).length;
  result.specificity_score = specCheckFields.length > 0
    ? Math.round((specHits / specCheckFields.length) * 100)
    : 0;

  // Generic theme detection
  (out.key_themes || []).forEach(t => {
    if (typeof t === 'string' && GENERIC_THEMES.has(t.trim().toLowerCase())) {
      result.issues.push(`Generic key_theme: "${t}"`);
      result.specificity_score = Math.max(0, result.specificity_score - 10);
    }
  });

  // Filler detection — full output as text blob
  const blob = JSON.stringify(out);
  for (const pat of FILLER_PATTERNS) {
    if (pat.test(blob)) {
      result.filler_pass = false;
      result.issues.push(`Filler phrase detected: ${pat}`);
    }
  }

  // Grounding — must_contain
  if (fixture.expected?.must_contain) {
    for (const phrase of fixture.expected.must_contain) {
      if (!blob.toLowerCase().includes(phrase.toLowerCase())) {
        result.grounding_pass = false;
        result.issues.push(`Missing expected phrase: "${phrase}"`);
      }
    }
  }

  // Calibration drift
  if (fixture.expected?.min_score && out.writing_quality?.overall_score) {
    const drift = out.writing_quality.overall_score - fixture.expected.min_score;
    result.calibration_drift = drift;
    if (Math.abs(drift) > 15) {
      result.issues.push(`Calibration drift: scored ${out.writing_quality.overall_score}, expected ~${fixture.expected.min_score}`);
    }
  }

  // Standout sentences must be quoted from input (grounding)
  if (out.standout_sentences && fixture.input_text) {
    const inputLower = fixture.input_text.toLowerCase();
    out.standout_sentences.forEach(s => {
      // Strip quotes and trim
      const cleaned = String(s).replace(/^["']|["']$/g, '').trim().toLowerCase();
      if (cleaned.length > 20 && !inputLower.includes(cleaned.slice(0, 50))) {
        result.issues.push(`Standout sentence not found in source: "${cleaned.slice(0, 60)}..."`);
      }
    });
  }

  return result;
}

// ── Score one extractRFPData output ────────────────────────────────────────
function scoreRFPOutput(out, fixture) {
  const result = {
    schema_complete: 0,
    specificity_score: 0,
    grounding_pass: true,
    filler_pass: true,
    must_count: 0,
    implicit_count: 0,
    issues: [],
  };

  if (!out) {
    result.issues.push('NULL output');
    return result;
  }

  const required = ['title', 'client', 'sector', 'requirements', 'evaluation_criteria'];
  const present = required.filter(k => {
    const v = out[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  result.schema_complete = Math.round((present.length / required.length) * 100);

  result.must_count = (out.requirements || []).filter(r =>
    String(r.priority || '').toLowerCase() === 'must').length;
  result.implicit_count = (out.implicit_requirements || []).length;

  // Specificity over requirement texts
  const reqTexts = (out.requirements || []).map(r => r.text || '').filter(Boolean);
  const specHits = reqTexts.filter(isSpecific).length;
  result.specificity_score = reqTexts.length > 0
    ? Math.round((specHits / reqTexts.length) * 100)
    : 0;

  const blob = JSON.stringify(out);
  for (const pat of FILLER_PATTERNS) {
    if (pat.test(blob)) {
      result.filler_pass = false;
      result.issues.push(`Filler phrase detected: ${pat}`);
    }
  }

  if (fixture.expected?.must_contain) {
    for (const phrase of fixture.expected.must_contain) {
      if (!blob.toLowerCase().includes(phrase.toLowerCase())) {
        result.grounding_pass = false;
        result.issues.push(`Missing expected phrase: "${phrase}"`);
      }
    }
  }

  if (fixture.expected?.min_must_count != null && result.must_count < fixture.expected.min_must_count) {
    result.issues.push(`Only ${result.must_count} MUST requirements found, expected at least ${fixture.expected.min_must_count}`);
  }

  return result;
}

// ── Run one fixture ────────────────────────────────────────────────────────
async function runFixture(fixture) {
  const start = Date.now();
  let out, scoreFn;

  if (fixture.kind === 'proposal') {
    out = await analyseProposal(fixture.input_text, fixture.rating || 4, fixture.notes || '');
    scoreFn = scoreProposalOutput;
  } else if (fixture.kind === 'rfp') {
    out = await extractRFPData(fixture.input_text);
    scoreFn = scoreRFPOutput;
  } else {
    return { id: fixture.id, error: `Unknown kind: ${fixture.kind}` };
  }

  const elapsed = Date.now() - start;
  const score = scoreFn(out, fixture);
  return { id: fixture.id, name: fixture.name, kind: fixture.kind, latency_ms: elapsed, ...score };
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`No fixtures directory at ${FIXTURES_DIR}`);
    console.error('Create evaluations/fixtures/*.json — see evaluations/README.md');
    process.exit(1);
  }

  let files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
  if (args.kind) files = files.filter(f => {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8'));
    return fx.kind === args.kind;
  });
  if (args.fixture) files = files.filter(f => {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8'));
    return fx.id === args.fixture;
  });

  if (!files.length) {
    console.error('No matching fixtures.');
    process.exit(1);
  }

  console.log(`Running ${files.length} fixture(s)…\n`);

  const results = [];
  for (const file of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
    process.stdout.write(`  ${fx.id} (${fx.kind}): `);
    try {
      const r = await runFixture(fx);
      results.push(r);
      const ok = r.schema_complete >= 80 && r.specificity_score >= 60 && r.grounding_pass && r.filler_pass && r.issues.length === 0;
      console.log(ok ? `✓ schema=${r.schema_complete}% spec=${r.specificity_score}% (${r.latency_ms}ms)` :
        `✗ schema=${r.schema_complete}% spec=${r.specificity_score}% — ${r.issues.length} issues`);
      if (r.issues.length) r.issues.forEach(i => console.log(`     · ${i}`));
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      results.push({ id: fx.id, error: e.message });
    }
  }

  // Aggregate
  const valid = results.filter(r => !r.error && r.schema_complete != null);
  const avg = (k) => valid.length ? Math.round(valid.reduce((s, r) => s + (r[k] || 0), 0) / valid.length) : 0;

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Fixtures run:       ${results.length}`);
  console.log(`  Errors:             ${results.filter(r => r.error).length}`);
  console.log(`  Avg schema_complete: ${avg('schema_complete')}%`);
  console.log(`  Avg specificity:     ${avg('specificity_score')}%`);
  console.log(`  Grounding pass rate: ${valid.filter(r => r.grounding_pass).length}/${valid.length}`);
  console.log(`  Filler pass rate:    ${valid.filter(r => r.filler_pass).length}/${valid.length}`);
  console.log(`  Avg latency:         ${avg('latency_ms')}ms`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Persist run
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(RUNS_DIR, `run-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ stamp, results, summary: {
    fixtures: results.length, errors: results.filter(r => r.error).length,
    avg_schema_complete: avg('schema_complete'),
    avg_specificity: avg('specificity_score'),
    avg_latency_ms: avg('latency_ms'),
  } }, null, 2));
  console.log(`Report written: ${reportPath}\n`);

  // Exit non-zero if anything failed (for CI use)
  const failed = valid.filter(r => r.issues.length > 0).length;
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('Fatal:', e);
  process.exit(2);
});
