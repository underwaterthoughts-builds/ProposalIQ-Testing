# Prompt evaluation harness

A small framework for measuring whether prompt changes actually improve output quality.

## Why this exists

Without measurement, "class-leading prompts" is a vibe. With it, every prompt change becomes an A/B test you can run before committing. The harness scores AI outputs against deterministic checks for: specificity, grounding, schema completeness, and known-bad patterns (generic phrases, vague claims, filler).

## How to use

### 1. Add fixtures

Each fixture is a JSON file in `fixtures/` containing:

```json
{
  "id": "fixture-001",
  "kind": "proposal" | "rfp",
  "name": "Short human label",
  "input_text": "Full proposal or RFP text — paste from a real document",
  "expected": {
    "must_contain": ["specific phrase that should be detected"],
    "must_not_contain": ["generic phrase that should be rejected"],
    "min_themes": 4,
    "min_score": 60
  }
}
```

You can include real proposals (anonymise client names if needed). 5 proposal fixtures + 5 RFP fixtures is enough to measure improvements.

### 2. Run the harness

```bash
node scripts/eval-prompts.js                 # run everything
node scripts/eval-prompts.js --kind=proposal # run only proposal fixtures
node scripts/eval-prompts.js --fixture=fixture-001
```

You need `OPENAI_API_KEY` and/or `GEMINI_API_KEY` in `.env.local` for the harness to actually call the AI.

### 3. Compare runs

Each run writes a timestamped report to `evaluations/runs/`. To compare two prompt versions:

```bash
node scripts/eval-prompts.js > runs/before.txt
# edit lib/gemini.js
node scripts/eval-prompts.js > runs/after.txt
diff runs/before.txt runs/after.txt
```

## What gets measured

Per fixture:

| Metric | Description | Target |
|---|---|---|
| **schema_complete** | All required fields present and non-empty | 100% |
| **specificity_score** | % of fields containing specific markers (numbers, named entities, quoted text) vs generic phrases | >70% |
| **grounding_pass** | "must_contain" terms appear in output where expected | 100% |
| **filler_pass** | "must_not_contain" filler terms do NOT appear in output | 100% |
| **calibration_drift** | Output writing_quality.overall_score vs `expected.min_score` | within ±15 |
| **token_cost** | Tokens used (input + output) — to track cost increase | trend only |
| **latency_ms** | Wall-clock time for the full call(s) | trend only |

## What it can't measure (yet)

- Strategic correctness (was this the right strategy?)
- Multi-call coherence across an RFP scan
- Comparative ranking (is proposal A better than B?)

These require a human review pass on the output, which the harness flags as `human_review_needed: true` for fields it can't auto-score.
