# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # next dev — runs scripts/ensure-dirs.js first to create data dirs
npm run build    # next build — production verify; no test suite, this is the gate
npm start        # next start -p ${PORT:-3000}

node scripts/seed-admin.js <adminEmail> <adminPass> [memberEmail] [memberPass]
                 # Idempotent. Run inside a Railway container (or locally) to seed users.
                 # Uses lib/auth.js#hashPassword — single source for bcrypt rounds.

bash scripts/provision-instance.sh
                 # Bash automation for spinning up a new per-tenant Railway service
                 # (generates JWT_SECRET + passwords, sets env vars, redeploys, retries seed).

node scripts/backup-db.js
                 # WAL-checkpoints then snapshots the DB into data/backups/ (online backup,
                 # safe while the app runs). Keeps last 14 (BACKUP_KEEP overrides). Intended
                 # for a daily Railway cron. Backups live on the same volume — download
                 # periodically for off-platform copies.
```

There is no lint config (`npx next lint` will prompt to set one up — skip) and no test suite. **`npm run build` is the gate** — every change must compile cleanly before commit.

To toggle verbose pipeline / cache-hit / work-type logs at runtime: set `DEBUG=1` in the env. Errors and warnings always log; per-request `dlog()` calls are gated.

## Deployment topology

**Single shared Railway service** at `www.proposal-insights.com`. Consolidated 2026-05-05 from a per-tenant model (6 separate Railway services, one per user, each on a subdomain) once the cross-user audit was clean and `owner_user_id` scoping was verified across every API route.

- Service: `proposaliq` on Railway project `exciting-alignment` (id `18ab9c03-da32-4dde-bbd2-758d516a4388`).
- One SQLite DB on volume `happy-volume` at `/app/data/proposaliq.db`. **WAL mode is on** — `proposaliq.db-wal` carries pending changes; checkpoint with `PRAGMA wal_checkpoint(TRUNCATE)` before any backup or the backup looks empty (this bit us during the consolidation migration).
- Tenant isolation is now **purely row-level via `owner_user_id` scoping** in every API route. There is no separate process per user.

**Implication for any new API route that reads/writes user-owned data:** scope by `owner_user_id` via `lib/tenancy.js#scope` / `ownerId` / `canAccess`. The previous audit + consolidation pass closed several missed scopes (`ai-costs`, `custom-values`, `taxonomy`, `settings`, `indexing-log`); don't reintroduce them. With the per-process safety net gone, any missed scope is now a real cross-user data leak.

**Railway autodeploys from the `design` remote (`underwaterthoughts-builds/ProposalIQ-Testing`), NOT from `origin` (`ProposalIQ-020426-01`).** Pushing only to `origin` deploys nothing — this silently stranded a release in Sep 2026. To deploy: `git push design main` (deploys within ~3–5 min). Keep `origin` in sync as the archive: `git push origin main`.

**Migration tooling**: `scripts/migrate-tenant.js` exists to absorb a per-tenant SQLite DB into the consolidated DB. It exists for historical reasons; it forces inserted users to `role='member'` because every per-tenant instance had its target user as `admin` (admins bypass `scope()`). Don't delete the script — there may be archived per-tenant backups that need reading later.

## Architecture — what to read multiple files to understand

### The two pipelines

1. **RFP scan pipeline** — [lib/rfp-pipeline.js](lib/rfp-pipeline.js) `runRfpScanPipeline(scanId, rfpFilePath, userId)`. 14 steps: parse → extract → embed → match → enrich → winning language → gaps → bid score → win strategy → narrative → adapted language → news → team → coverage. Triggered by [pages/api/rfp/scan.js](pages/api/rfp/scan.js) as fire-and-forget after a 202; the UI polls `status_detail` for live progress. Each step is wrapped in `withTimeout` using constants from [lib/timeouts.js](lib/timeouts.js).
2. **Proposal-fit pipeline** — [lib/proposal-fit.js](lib/proposal-fit.js) `analyseProposalAgainstRfp(scanId)`. Independent of the RFP scan; runs when the user attaches their draft response to score it. Reuses `analyseProposal` for the proposal side, then fans out **one LLM call per requirement** via [lib/concurrency.js](lib/concurrency.js) `pMap` (concurrency 5, soft cap 50 reqs). Coverage matrix persists per-row in `proposal_coverage` so the UI can poll progress like "8/24". Composite score drops null dimensions and renormalises — never weight against missing data.

The proposal-fit pipeline runs after the RFP scan completes when both are uploaded together (so it has `rfp_data.requirements` to score against), but is also triggered on its own by `POST /api/rfp/[id]/proposal`.

### AI plumbing — [lib/gemini.js](lib/gemini.js)

Single file, ~5650 lines. **OpenAI is primary; Gemini is the fallback.** `gpt-4o` for deep analysis, `gpt-4o-mini` for vision/parsing, `text-embedding-004` (Gemini) or `text-embedding-3-small` (OpenAI fallback) for embeddings. Anthropic Claude powers the in-app assistant only (`/assistant`).

Important conventions inside `gemini.js`:

- **Master system prompt** (~1500 tokens) prefixed onto every call so OpenAI prompt caching kicks in. Don't reorder it; cache hits depend on byte-identical prefix.
- **`setCostContext({ category, scanId, projectId })`** is called at the entry of each pipeline so every downstream LLM call gets logged to `ai_cost_log` with the right tag. Categories: `rfp_scan`, `proposal_analysis`, `proposal_fit`, `proposal_generation`. Visible at `/api/ai-costs` (admin-only).
- **`detectWorkType()` + `methodologyEvidenceBlock()`** — work-type-aware methodology rubric. Creative/comms/brand work is graded on demonstrated structure (named reference formula, modular architecture, phased production with costed roles), not on textbook framework names. Reuse this when grading anything proposal-shaped — including the proposal-fit per-requirement coverage prompt.
- **Hard caps in `analyseProposal`** apply BEFORE scoring (no named clients → credibility ≤ 35; <3 specific facts → no score > 50). When tweaking the prompt, preserve these — they're what stop the model rationalising high scores on generic proposals.

### Document parsing — [lib/parser.js](lib/parser.js)

**Inline only — never reintroduce `worker_threads`.** Next.js webpack bundles `require.resolve('./parser-worker.js')` to a numeric module ID instead of a path, and PDF parsing silently fails in production with garbage like `Received type number (4854)`. The header comment in `parser.js` documents this; honour it.

Vision fallback for PDFs goes through `pdftoppm` (poppler-utils, installed in both `Dockerfile` and `nixpacks.toml`) → `gpt-4o-mini`. Used by `extractFieldsFromImages` and the prescan vision path when text confidence is low.

### Tenancy — [lib/tenancy.js](lib/tenancy.js) + [lib/auth.js](lib/auth.js)

- `requireAuth(handler)` — wrap every API route that touches user data.
- `requireAdmin(handler)` — admin-only routes. Uses the **impersonator's** role when view-as is active, so impersonating a member never grants admin access.
- `scope(req.user)` returns `{ clause, params }` to splice into a SQL WHERE — admin gets `''`, member gets `' AND owner_user_id = ?'`.
- `canAccess(user, row)` for individual record access. Use it after fetching by primary key.
- Auth is JWT in an `httpOnly` cookie via `jsonwebtoken`. **bcryptjs salt rounds = 12, defined once in `lib/auth.js#hashPassword`.** Don't re-implement.

### DB schema — [lib/db.js](lib/db.js)

`better-sqlite3`, single file at `data/proposaliq.db` (or `/app/data/proposaliq.db` on Railway volumes). Migrations are an array of SQL strings run idempotently — append, don't rewrite. `backfillOwnership()` stamps NULL `owner_user_id` rows with the first admin's id at startup (idempotent — no-op once everything's owned).

## Conventions

- **Pages Router** (`pages/`), not App Router. JavaScript, not TypeScript. Tailwind for styling; brand accent is `#7fb4bc` muted teal.
- **Magic numbers live in [lib/timeouts.js](lib/timeouts.js).** Don't sprinkle `90000` across new code.
- **JSON DB columns** are read via `lib/embeddings.js#parseJsonField(str, fallback)`. (Renamed from `safe()` in the audit pass; if you see references to `safe`, they're stale.)
- **Silent `.catch(() => {})`** is a known smell flagged in the audit. New fetch sites: log via `console.error('[scope] context:', e.message)` at minimum, or use [lib/useFetch.js](lib/useFetch.js).
- **File-upload validation** belongs both client-side (`pages/rfp/index.jsx`, etc.) and server-side (formidable maxFileSize); skipping the client check costs a wasted upload round-trip.
- **Content-Disposition headers** for downloads must use [lib/headers.js](lib/headers.js) `contentDisposition()` — string-interpolating user-supplied filenames is a CRLF-injection vector.

## Risky operations

- **`git push`** triggers autodeploy across 6 paying tenant services. Build-verify locally before push; never `--force` push to `main`.
- **Schema migrations** are append-only and idempotent. Never edit a past migration string — write a new one.
- **Anything touching `setCostContext`** affects per-tenant cost attribution. Tag accurately or the AI-costs page misleads.

## What this app is NOT

- Not Next.js App Router. Don't migrate.
- Not multi-tenant via row-level security in a shared DB. Tenant isolation is by separate Railway services.
- Not test-driven. There's no test suite; `next build` is the verification gate.
- Not lint-configured. Don't run `npx next lint` (it'll prompt to set up ESLint and waste your turn).

## Memory

User-level persistent memory lives at `/Users/jameshorsman/.claude/projects/-Users-jameshorsman/memory/`. Read `MEMORY.md` first; the linked `project_proposaliq.md` (Wave 1–5 + 31 changes briefing) is the deepest project context outside this file. The memory file [reference_cookmefood_handoff.md](/Users/jameshorsman/.claude/projects/-Users-jameshorsman/memory/reference_cookmefood_handoff.md) points to a separate buyer-side RFP-platform pivot — that's a sibling product, not part of this repo.
