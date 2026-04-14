# ProposalIQ — Stitch Design Briefs

This document contains self-contained briefs for each page of the ProposalIQ website. Feed them to Stitch **one at a time**, in the order listed.

ProposalIQ is a **website-based platform**. Everything — the public marketing pages and the authenticated workspace — is part of one website. The mobile experience is the same website, responsively designed. There is no separate app.

Suggested order for Stitch:
1. Shared design direction + homepage
2. Marketing pages (Platform, Solutions, How It Works, Get Access)
3. Login
4. Website shell (authenticated pages layout)
5. Dashboard
6. RFP scan list
7. RFP detail — Quick mode
8. RFP detail — Pro mode
9. Repository
10. Project detail
11. Onboarding profile
12. Team, Clients, Users, Settings

---

## SHARED DESIGN DIRECTION (include with every brief)

### What is ProposalIQ?

ProposalIQ is a bid intelligence platform for consultancies, agencies, and professional services firms that respond to RFPs, tenders, and competitive briefs. Users upload their library of past proposals, which the platform analyses with AI. When a new opportunity comes in, they upload the RFP and the platform cross-references it against their institutional knowledge — surfacing matched past work, identifying gaps, recommending strategy, and generating draft proposals.

It is a **decision-support tool, not a writing tool**. It helps overloaded bid leads make better decisions faster and gives bid writers the evidence and structure they need to produce winning responses.

### The website has two zones

1. **Public pages** (homepage, platform, solutions, how it works, get access): Dark background, editorial feel. These pages explain and sell the product.
2. **Authenticated workspace** (everything after login): Bright working surface, operational feel. These pages ARE the product.

Both zones are part of the same website. The transition from dark public pages to bright workspace happens at login. Same brand, same typography, same colour tokens — different surface treatment for different jobs.

### Two viewing modes (within the workspace)

The workspace has a Quick/Pro toggle on certain pages:

- **Quick mode**: An executive intelligence brief. Single-scroll, no tabs. Verdict, thesis, priorities, risks. For account directors with 5 minutes.
- **Pro mode**: A full strategic workbench. 10 analytical tabs, matched proposals, gap analysis, win strategy, proposal assembly. For bid writers spending 30-60 minutes.

### Design direction

Design this as a calm, premium, high-trust intelligence platform. Intelligent, clear, commercially serious — not playful, cluttered, or generic SaaS.

**Visual tone**: Strong hierarchy, elegant whitespace, restrained colour. Serif typography only for key headings and strategic statements; clean sans-serif for all functional UI.

**Personality**: Professional, strategic, premium, evidence-led, calm under pressure.

**Make it feel like**: A premium intelligence workspace. An executive briefing surface. A product you'd trust with a seven-figure bid decision. A strategy consultancy's internal tool that became a product.

### Colour palette

| Token           | Hex           | Role                                                    |
|-----------------|---------------|---------------------------------------------------------|
| `ink`           | `#0f0e0c`     | Primary text. Dark surfaces (public pages, header bar)  |
| `paper`         | `#faf7f2`     | Workspace background — warm, bright, not clinical       |
| `cream`         | `#f0ebe0`     | Sidebar backgrounds, dividers, skeleton loaders         |
| `border`        | `#ddd5c4`     | Default borders — warm, not grey                        |
| `muted`         | `#6b6456`     | Secondary text, labels, descriptions                    |
| `muted-light`   | `#9b8e80`     | Tertiary text, hints, disabled states                   |
| `gold`          | `#b8962e`     | Brand accent. Quick mode. Stars. CTAs. Client taxonomy  |
| `gold-light`    | `#d4b458`     | Gold for text on dark backgrounds                       |
| `teal`          | `#1e4a52`     | Pro mode. Primary buttons. Service taxonomy             |
| `teal-dark`     | `#2d6b78`     | Score rings, data emphasis                              |
| `sage`          | `#3d5c3a`     | Won/success. High scores. Positive indicators           |
| `rust`          | `#b04030`     | Lost/error. Low scores. Danger                          |

Colour signals meaning — never decorative. Most workspace surfaces are paper/white with muted text. Public pages are dark with gold accent.

### Typography

- **Serif** (Georgia): Page titles, card headings, strategic statements, hero text. Used sparingly for authority.
- **Sans-serif** (Segoe UI / system sans): All functional UI — body, labels, buttons, inputs.
- **Monospace** (Courier New): Micro-labels (10px, uppercase, wide tracking), data values, badges, scores. The `MICRO-LABEL` pattern is the standard section/field label throughout the workspace.

### Avoid (everywhere)

- Too many cards competing equally — clear primary/secondary/tertiary hierarchy
- Excessive badges, chip clouds, coloured surfaces
- Decorative charts — numbers and progress bars are sufficient
- Playful illustrations or decorative icons
- Overuse of serif — reserved for headings and strategic text
- Agency-portfolio aesthetics, fintech neon, startup-style UI
- Glassmorphism, gradients, parallax, scroll-triggered effects
- Generic dashboard patterns

### Mobile

The mobile experience is the same website, responsively designed. Key principles:
- 44px minimum touch targets
- Safe area padding for notched devices
- Grids collapse (4-col → 2-col → 1-col)
- Sidebars become full-width or collapse behind hamburger
- Tab bars become horizontally scrollable
- Navigation collapses to hamburger drawer

---

## BRIEF 1: HOMEPAGE

### Route: `/`

### Zone: Public (dark background)

### Who visits

A prospective buyer — practice director or senior bid manager at a consultancy — who heard about ProposalIQ through word of mouth. They'll spend 30-90 seconds scanning before deciding to look further.

### Primary job

In 30 seconds: what it is, who it's for, why it's different. In 90 seconds: enough credibility to click "Get Access."

### Navigation (shared across all public pages)

Sticky header, dark (ink) bg, 64px tall, content max-width 1200px:
- Left: Gold "P" square logo (32px) + "ProposalIQ" in serif
- Centre: Text links — Platform, Solutions, How It Works
- Right: "Client Portal" (ghost border → `/login`) + "Get Access" (gold solid → `/get-access`)
- Mobile: hamburger nav

### Page sections

**1. Hero**
- Pill badge: pulsing gold dot + "AI-Powered Bid Intelligence" (mono, subtle)
- Heading (serif, ~56px): "Your institutional knowledge, working for every bid." Second line in gold.
- Subtitle (~18px, muted): Value proposition paragraph
- Two CTAs: "Request Access →" (gold) + "See How It Works" (ghost)

**2. Four Promises** — 4-column grid, thin vertical dividers:
- 01: **Qualify faster** — Bid/no-bid signal in seconds
- 02: **Respond better** — Past winning language surfaced automatically
- 03: **Win more** — Apply what consistently worked
- 04: **Work efficiently** — Every past proposal compounds
- Each: mono number + serif title + description. **Editorial statements, not feature cards.**

**3. How It Works** — two columns:
- Left: "ONE ENGINE, TWO VIEWS" label, heading, QuickIQ vs ProIQ boxes, pipeline link
- Right: 9 numbered pipeline steps, step 01 gold-highlighted

**4. Who It's For** — "Built for teams that bid":
- 3x2 grid: Management Consulting, Creative & PR, Technology & IT, Architecture & Design, Recruitment & Staffing, Charity & Third Sector
- Dark cards with serif name + description

**5. Final CTA** — "Ready to start winning more?" + buttons

**6. Footer** — logo, nav, copyright

### Negative instructions

- No product screenshots or UI mockups — words and layout sell this
- No animations, parallax, or scroll effects
- Four Promises are editorial, not feature cards with icons
- No pricing, comparison tables, testimonials, or logo walls

---

## BRIEF 2: PLATFORM PAGE

### Route: `/platform` | Zone: Public (dark)

### Who visits: Buyer wanting more detail on capabilities.

### Primary job: Explain what the AI does in enough detail to be credible. Connect every capability to the user's workflow.

### Sections

1. **Hero**: "The intelligence engine behind better bids"
2. **Two Modes**: Quick (executive brief, 2 minutes) vs Pro (full workbench, 10 tabs). Who each is for.
3. **Intelligence Pipeline**: 9 steps expanded — grouped into Understanding, Matching, Analysis, Strategy phases. Each: heading + 2-3 sentence explanation.
4. **What Makes It Different**: "Your data, your advantage" / "Evidence, not invention" / "Decision support, not writing" / "Self-hosted, fully private"
5. **CTA**: Request Access

### Negative instructions: No feature tick-lists. No features in isolation. No screenshots. Editorial explanation, not a spec sheet.

---

## BRIEF 3: SOLUTIONS PAGE

### Route: `/solutions` | Zone: Public (dark)

### Who visits: Buyer wondering "Is this for my type of firm?"

### Primary job: Show ProposalIQ adapts to different professional services contexts.

### Sections

1. **Hero**: "Built for the way your team actually bids"
2. **By Firm Type**: 6 industries, each with its own editorial section — how they bid, what problems they face, how ProposalIQ helps specifically. Long-scroll, not tabbed.
3. **Two-Axis Taxonomy**: Client sector (who) x Service type (what) — why both dimensions matter for matching.
4. **CTA**

### Negative instructions: Not equal-weight tiles. No stock photos. One platform that adapts, not different products.

---

## BRIEF 4: HOW IT WORKS PAGE

### Route: `/how-it-works` | Zone: Public (dark)

### Who visits: Buyer who wants mechanics before committing. Needs to explain the tool to their team.

### Primary job: Walk through the full user journey step by step, credibly.

### Sections

1. **Hero**: "From RFP to recommendation in 60 seconds"
2. **The Journey**: 10-step vertical walkthrough (Upload → Extract → Match → Rank → Gaps → Strategy → Language → Context → Approach → Draft). Each: heading + explanation.
3. **Two Ways to Use It**: Quick vs Pro
4. **Getting Started**: Upload proposals, set API keys, optional team/CVs/website. "First scan within 10 minutes."
5. **CTA**

### Negative instructions: Not an infographic. Not docs/tutorial — still marketing. Steps read as narrative.

---

## BRIEF 5: GET ACCESS PAGE

### Route: `/get-access` | Zone: Public (dark)

### Who visits: Buyer ready to take the next step.

### Primary job: Capture details for follow-up.

### Sections

1. **Hero**: "Request access to ProposalIQ"
2. **Form** (centred, ~500px): Name, email, company, website (opt), team size dropdown, how heard (opt), message (opt). Gold "Request Access" button. Note: "Self-hosted. We'll walk you through deployment."
3. **What happens next**: Review → setup call → live within a day

### Negative instructions: No pricing. No chat widget. No invasive fields. Feels like writing to a person.

---

## BRIEF 6: LOGIN PAGE

### Route: `/login` | Zone: Boundary (dark, standalone)

This page bridges the public website and the authenticated workspace. It uses the dark aesthetic but has no marketing nav and no workspace nav — it stands alone.

### Who uses it: Returning user signing in, or first user creating the workspace.

### Layout: Split screen (desktop), single panel (mobile):

**Left panel** (desktop only, ~380px, dark):
- Logo + tagline (serif, gold accent)
- Feature bullets

**Right panel** (dark card, centred):
- "Sign in to ProposalIQ" / "Create your workspace"
- Fields: Org Name + Your Name (setup only), Email, Password
- Error: rust banner. Submit: gold button.

### States: Loading, login (2 fields), setup (4 fields), error, submitting

### Negative instructions: No social login, SSO, or forgot password. No nav from either zone. Standalone.

---

## BRIEF 7: WEBSITE SHELL (AUTHENTICATED PAGES)

### Zone: Authenticated workspace (bright background)

This is the shared layout for all pages after login. It replaces the public page dark header/nav with a workspace header.

### Who uses it: Every logged-in user, every page.

### Primary job: Orientation and navigation. The shell disappears into the background — the user's attention is on page content, not chrome.

### Structure

```
+------------------------------------------------------+
|  HEADER BAR -- dark (ink), compact, ~56px            |
|  [Logo]  [Nav links]              [Mode switch] [You]|
+------------------------------------------------------+
|  PAGE TITLE BAR -- white, ~48px, desktop only        |
|  [Serif page title + subtitle]          [Action btns]|
+------------------------------------------------------+
|                                                      |
|              PAGE CONTENT (paper bg)                  |
|                                                      |
+------------------------------------------------------+
```

### Header bar

- Dark (ink) background — the one dark element in the workspace, creating continuity with the public site
- Logo (gold P + "ProposalIQ"), text nav links, Quick/Pro mode toggle (on Dashboard + RFP pages only), user initials avatar, subtle AI status dot

### Mode switcher

Two-state toggle: "Quick" (gold active) / "Pro" (teal active). Only on Dashboard and RFP pages. Feels like switching a lens.

### Navigation (in order)

Dashboard, Repository, RFP Intelligence, Team, Clients, Settings, Users

### Mobile

- Hamburger + logo + mode toggle + avatar
- Drawer (280px, dark): user card, mode switcher, nav links, logout
- 44px touch targets, safe area padding

### Negative instructions

- Not visually heavy — infrastructure, not content
- No large icons in nav — text links sufficient
- No notification bells, search bars, or breadcrumbs in the shell
- Mode switcher is a view toggle, not a tab bar

---

## BRIEF 8: DASHBOARD

### Route: `/dashboard` | Zone: Workspace

### Who uses it: Bid lead or practice director who just logged in. 3-4 active bids, 50+ proposals in the repository.

### Primary job: "What should I do next?" / "Pipeline state?" / "Anything need attention?" — within 5 seconds.

### What they do first: Start a new RFP scan or review a recent result.

### Layout

Three **intent modes** at top — large selectable cards reshaping content below:

| Mode            | Label              | Accent  | Content                                          |
|-----------------|--------------------|---------|--------------------------------------------------|
| `write`         | Write Proposals    | teal    | Upload RFP card + recent scans                   |
| `intelligence`  | Full Intelligence  | gold    | Win patterns, quality scores, knowledge health   |
| `repository`    | Manage Repository  | sage    | Quick links + recent activity                    |

Selected: solid border + tinted bg. Unselected: dashed border. Persists across sessions.

### Write mode (default)

**Primary**: "Upload an RFP" dashed-border card. The #1 action on the platform.
**Secondary**: Recent scans (5) with status badges.
**Tertiary**: Stats sidebar, learning history prompt.

### Intelligence mode

**Primary**: AI recommendation banner (teal, full-width). Most important sentence on page.
**Secondary**: 4 metrics + Win Patterns card.
**Tertiary**: Knowledge health bars, recent projects.

### Repository mode

**Primary**: 3 quick-link cards (Repository, Team, Settings).
**Secondary**: Recent activity. **Tertiary**: Actions, breakdown bars.

### First-time: Seed banner if repository empty.

### States: Empty, loading (skeletons), populated, learning history needed

### Negative instructions: Not a dashboard wall of metrics. Only selected mode renders. No charts.

---

## BRIEF 9: RFP SCAN LIST

### Route: `/rfp` | Zone: Workspace

### Who: Bid lead ready to scan, or reviewing history.

### Primary job: Upload an RFP and start a scan.

### Layout: Centred single column, ~640px. Launchpad, not workspace.

**Primary**: Upload card — heading, description, file drop zone (dashed border), teal submit button.
**Secondary**: Previous scans list — name, date, status badge, view link, delete on hover.

### States: Empty, file selected, uploading, with history

### Negative instructions: No filters/sorting on scan list. Upload always primary.

---

## BRIEF 10: RFP DETAIL — QUICK MODE

### Route: `/rfp/[id]` (Quick mode) | Zone: Workspace

### Who: Account director, 5 minutes between meetings. Bid or no-bid?

### Primary job: Bid/no-bid decision with evidence in under 2 minutes of reading. Must feel like an intelligence brief, not software.

### Layout: Single column, generous whitespace, no tabs, no sidebar. One-page memo.

### Hierarchy

**Primary:**
1. **Verdict banner** — full-width colour: sage "Bid" / rust "No bid" / gold "Consider". Score ring + confidence. User knows recommendation in 1 second.
2. **Winning thesis** — bold serif, one sentence angle
3. **Fit assessment** — 2-3 sentences

**Secondary:**
4. **Priorities + risks** — two columns, top 3 each
5. **Recommended assets** — matched proposals

**Tertiary:** Style guidance, next actions

### States: Processing (pipeline steps), fast pass, complete, strong/weak/negative confidence

### Negative instructions: No tabs, sidebar, or cards-within-cards. No scores beyond verdict ring. Scannable 30s, readable 2m.

### Make it feel like: Intelligence brief from a trusted advisor. One-page memo a partner would read.

---

## BRIEF 11: RFP DETAIL — PRO MODE

### Route: `/rfp/[id]` (Pro mode) | Zone: Workspace

### Who: Bid manager or lead writer, spending 30-60 minutes building a response.

### Primary job: All evidence, analysis, strategy, and drafting tools — organised for systematic work without overwhelm.

### Layout

```
+------------------------------------------------------+
|  TAXONOMY BAR -- editable classification tags        |
+---------------------------------------+--------------+
|  TAB BAR -- 10 tabs                   |   SIDEBAR    |
+---------------------------------------+  (~280px,    |
|  MAIN CONTENT (per tab)              |   quiet      |
|                                       |   reference) |
+---------------------------------------+--------------+
```

### Taxonomy bar: Client industry (gold ◆) + service industry (teal ◈), clickable to correct. Plus static tags.

### Tabs

| Tab            | Label              | Content summary                           |
|----------------|--------------------|-------------------------------------------|
| `brief`        | Overview           | ExecutiveBrief (same as Quick mode)       |
| `matches`      | Matched Proposals  | Tiered cards with filter bar + progressive disclosure |
| `gaps`         | Opportunity Gaps   | Coverage map + gap cards (top 3 default)  |
| `writing`      | Writing Insights   | Quality patterns, evidence highlights     |
| `news`         | Market Context     | News by category (top 3 each), reveal more |
| `approach`     | Suggested Approach | Narrative + phase cards + collapsed budget/risks |
| `strategy`     | Win Strategy       | Prose narrative + focus/avoid lists       |
| `language`     | Winning Language   | Snippet cards (top 6), reveal more        |
| `narrative`    | Narrative Advice   | Strategist advice + structure + collapsed tips |
| `assembly`     | Proposal Assembly  | Section-by-section drafting OR full proposal view |

### Key design patterns per tab

**Matches**: Filter buttons (All / Same sector / Same work). Tier groups with headers. Cards: ScoreRing + name + outcome. Expand for detail. Cross-sector hidden by default.

**Gaps**: Coverage map (sage/gold/rust rows). Gap cards with priority stripe. Default collapsed.

**Assembly** has two states:
- **Section view**: 9 section cards with status + "Draft" button. Drafts expand inline with citations and evidence gaps.
- **Full proposal view**: Document rendering + coverage report.

### Checkpoint banners: Subtle bars on matches, gaps, strategy tabs asking user to approve before pipeline continues.

### States: Processing, fast pass, complete, drafting, generating, checkpoint needed

### Negative instructions: Only active tab renders. Tab bar is light. Matches are cards not tables. Defaults collapsed. Sidebar never competes. No breadcrumbs or tab icons.

---

## BRIEF 12: REPOSITORY

### Route: `/repository` | Zone: Workspace

### Who: Bid manager maintaining 20-200+ past proposals.

### Primary job: Find, organise, manage proposals. Upload. Mark outcomes. Curate workspace.

### Layout: Left sidebar (240px, filters/folders/taxonomy) + main area (toolbar + card grid).

### Sidebar: Smart filters (All, Top Rated, Won, Lost, Pending, Failed) + folders + taxonomy filters (Type of Work teal ◈, Client Sector gold ◆).

### Toolbar: Search with AI toggle, result count, select mode, upload buttons.

### Workspace bar: Teal tint when active — "N projects in workspace for RFP scanning."

### Project cards: Ribbon (outcome), name, client, year, rating/status, taxonomy chips (gold ◆ + teal ◈, dashed if untagged), footer (value + workspace toggle + outcome dropdown).

### Upload modal: 4-step wizard (files → AI-prefilled form → learning history → progress).

### States: Empty, loading, populated, indexing/failed per card, select mode, search

### Negative instructions: Cards not table. Scannable. Sidebar = library catalogue. Workspace bar informational.

---

## BRIEF 13: PROJECT DETAIL

### Route: `/repository/[id]` | Zone: Workspace

### Who: Bid writer reviewing a past proposal's quality and patterns.

### Primary job: Review AI analysis, edit metadata, manage tags, capture learning history.

### Layout: Single column, ~900px.

**Primary**: Name, client, outcome, rating. 4 quality score circles (Overall, Writing, Approach, Credibility).
**Secondary**: Score bars, positive/negative indicators, tags.
**Tertiary** (collapsed): Metadata editor, learning history, files.

### Negative instructions: Not a dashboard. Progressive disclosure. Scores prominent but not overwhelming.

---

## BRIEF 14: ONBOARDING PROFILE

### Route: `/onboarding/profile` | Zone: Workspace

### Who: New user setting up, or existing user updating company profile.

### Primary job: Tell ProposalIQ what the company does — offerings, clients, positioning. Cascades into all AI analysis.

### Layout: Single column, ~640px.

### Flow: Input (name + URL or paste) → Scan (10-30s) → Review/edit (offerings as editable chips with confidence + core toggle + remove, client types, positioning, differentiators) → Save → dashboard.

### States: Fresh, existing, scanning, failed (paste fallback), review ready, high/low confidence

### Negative instructions: Not a complex wizard. Present as editable list user confirms. Collaborative, not authoritative.

### Make it feel like: Setting up with a trusted advisor.

---

## BRIEF 15: TEAM PAGE

### Route: `/team` | Zone: Workspace

### Who: Bid manager maintaining team database.

### Layout: Tabs — "Team Members" | "Rate Card"

### Members: Import + Add. Cards with avatar, name, title, specialisms (teal), certs (sage), rates footer (4-col), project history. Import → preview table → confirm.

### Rate Card: Role table (name, grade, category, rates). Inline edit, import.

### Negative instructions: Cards not avatar grid. Rate card is a table. Import = review before commit.

---

## BRIEF 16: CLIENTS PAGE

### Route: `/clients` | Zone: Workspace

### Who: Bid lead reviewing relationship history before an opportunity.

### Layout: Master-detail — list (256px) + detail panel.

### List: Search, name + count + win rate, "auto" badge. Detail: name, status pill, 4 metrics, notes, project history. Auto-detected: gold "Create Profile" prompt.

### Negative instructions: Not a CRM. No pipelines or contact management. Lightweight reference.

---

## BRIEF 17: SETTINGS PAGE

### Route: `/settings` | Zone: Workspace

### Who: Admin configuring the platform.

### Layout: 6 tabs — General, AI Configuration, AI Costs, AI Prompts, Taxonomy, Data & Storage.

**General**: Org name, margin, currency, profile link, "switch company" option.
**AI Config**: API key status, model names.
**AI Costs**: Summary metrics + breakdown tables (feature, model, function, daily). No charts.
**AI Prompts**: Split panel — list + editor. Save/Reset.
**Taxonomy**: Add/edit/delete items by category.
**Data & Storage**: File paths reference.

### Negative instructions: Admin utility, not a showcase. Tables not charts. Textarea not IDE.

---

## BRIEF 18: USERS PAGE

### Route: `/users` | Zone: Workspace

### Who: Admin managing access.

### Layout: Centred, ~640px. User list (avatar, name, email, badges, remove). Add form (name, email, password). Non-admins see gate message.

### Negative instructions: Simple sub-page, not a dashboard.

---

*End of briefs. Feed them to Stitch one at a time, in order. Include the Shared Design Direction with each.*
