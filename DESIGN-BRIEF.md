# ProposalIQ — Complete Design Brief

> For use with Google Stitch (or any design tool). Describes every page, component, layout pattern, and colour token in the current production application. Naming conventions are consistent with the codebase and should be used in all design files.

---

## 1. DESIGN SYSTEM

### 1.1 Colour Tokens

| Token Name        | Hex       | Usage                                                        |
|-------------------|-----------|--------------------------------------------------------------|
| `ink`             | `#0f0e0c` | Primary text, dark backgrounds (topbar, login, landing page)  |
| `paper`           | `#faf7f2` | Main page backgrounds (authenticated workspace)               |
| `cream`           | `#f0ebe0` | Sidebar backgrounds, skeleton loaders, dividers               |
| `cream-light`     | `#f8f6f2` | Subtle card backgrounds, hover states                         |
| `border`          | `#ddd5c4` | All default borders — inputs, cards, dividers                 |
| `border-light`    | `#f0ebe0` | Inner card row dividers, lighter separators                   |
| `muted`           | `#6b6456` | Secondary text, labels, descriptions                          |
| `muted-light`     | `#9b8e80` | Tertiary text, hints, disabled placeholders                   |
| `gold`            | `#b8962e` | Primary brand accent — logo, CTAs, Quick mode, stars, badges  |
| `gold-light`      | `#d4b458` | Lighter gold for emphasis text on dark backgrounds             |
| `gold-bg`         | `#faf4e2` | Gold tinted backgrounds (warnings, learning history prompts)   |
| `gold-border`     | `rgba(184,150,46,.3)` | Gold border for warning/info callouts               |
| `teal`            | `#1e4a52` | Secondary accent — Pro mode, teal buttons, active nav states   |
| `teal-dark`       | `#2d6b78` | Score rings, won outcome, data viz                             |
| `teal-bg`         | `#e8f2f4` | Teal tinted backgrounds (workspace bar, tags)                  |
| `sage`            | `#3d5c3a` | Success/won — outcomes, positive indicators, high scores       |
| `sage-light`      | `#6ab187` | Won ribbon on project cards                                    |
| `sage-bg`         | `#edf3ec` | Positive result backgrounds                                    |
| `rust`            | `#b04030` | Error/lost — outcomes, negative indicators, danger buttons      |
| `rust-bg`         | `#faeeeb` | Error/lost backgrounds                                         |
| `gold-dark`       | `#8a6200` | Dark gold for text on gold backgrounds                         |

### 1.2 Typography

| Style         | Font                               | Usage                                      |
|---------------|------------------------------------|--------------------------------------------|
| `font-serif`  | Georgia, 'Times New Roman', serif  | Page titles, card headings, hero text       |
| `font-sans`   | 'Instrument Sans', 'Segoe UI', system-ui, sans-serif | Body text, UI labels, buttons |
| `font-mono`   | 'Courier New', Courier, monospace  | Labels, data values, badges, scores, micro-labels |

**Micro-labels pattern** (used extensively): `text-[10px] font-mono uppercase tracking-widest` in `muted` colour. This is the standard for all section headers, field labels, and metadata labels throughout the app.

### 1.3 Shared Components

| Component       | Description                                                     |
|-----------------|-----------------------------------------------------------------|
| `Btn`           | Button. Variants: `ghost` (bordered), `dark`, `gold`, `teal`, `danger`. Sizes: `sm`, `md`, `lg` |
| `Badge`         | Pill badge. Colours: `cream`, `teal`, `gold`, `sage`, `rust`, `won`, `lost`, `pending`, `active` |
| `Card`          | White border rounded-lg container. Clickable variant adds hover shadow + lift |
| `Stars`         | 1-5 star rating display (gold filled, border unfilled)           |
| `ScoreRing`     | SVG circular progress ring with centered % value. Colour: sage (80+), gold (60-79), rust (<60) |
| `FileChip`      | Tiny labelled chip for file types: `Proposal` (teal), `RFP` (red), `Budget` (amber) |
| `Input`         | Text input with micro-label header, hint, and error states       |
| `Select`        | Dropdown with same micro-label pattern                           |
| `Textarea`      | Multi-line input with same pattern                               |
| `Spinner`       | Small spinning circle (border-based animation)                   |
| `OutcomeLabel`  | Badge for won/lost/pending/active/withdrawn                      |
| `ProgressBar`   | Horizontal bar with rounded ends, background = cream             |
| `Toast`         | Bottom-right notification popup, dark background, white text     |
| `Divider`       | Horizontal line with optional centred label pill                 |

### 1.4 Layout Shell — `AppLayout`

Used by all authenticated pages. Structure:

```
┌─────────────────────────────────────────────────┐
│ TOPBAR — dark (ink) background, h-14            │
│  [Hamburger(mobile)] [P Logo] [Nav links] [Mode │
│   switcher(Quick/Pro)] [AI dot] [User initial]  │
├─────────────────────────────────────────────────┤
│ PAGE TITLE BAR — white bg, h-12, desktop only   │
│  [Serif title + italic subtitle]    [Actions]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  CONTENT AREA — paper (#faf7f2) bg, flex-1      │
│  (each page controls its own inner layout)      │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Mobile**: Hamburger opens a left-side drawer (280px width, dark bg) with user card, mode switcher, and nav links. Touch targets: minimum 44px height.

**Mode Switcher**: Appears on `/dashboard` and `/rfp/*` pages only. Two-button toggle: "Quick" (gold bg when active) and "Pro" (teal bg when active).

**Nav Items** (in order):
1. Dashboard (icon: ◈)
2. Repository (icon: ⊞)
3. RFP Intelligence (icon: ⊡)
4. Team (icon: ◉)
5. Clients (icon: ◎)
6. Settings (icon: ⚙)
7. Users (icon: ⊙)

---

## 2. PUBLIC PAGES (Unauthenticated)

### 2.1 `LandingPage` — Route: `/`

**Theme**: Dark (ink background), marketing site feel.

**Shared header** across all public pages:
- Sticky top, dark bg, 64px height, max-width 1200px centred
- Left: Gold "P" logo square (32px) + "ProposalIQ" in serif
- Centre: Nav links (Platform, Solutions, How It Works)
- Right: "Client Portal" (ghost border button) + "Get Access" (gold solid button)

**Sections in order:**

1. **HeroSection**
   - Pill badge top-left: pulsing gold dot + "AI-Powered Bid Intelligence" mono text
   - H1 serif 56px: "Your institutional knowledge," / line break / gold text: "working for every bid."
   - Subtitle: 18px, white/50% opacity
   - Two CTAs: "Request Access →" (gold solid) + "See How It Works" (ghost border)

2. **FourPromisesGrid**
   - 4-column grid, thin right borders between columns
   - Each: mono number (01-04) + serif title (20px) + description
   - Items: "Qualify faster", "Respond better", "Win more", "Work efficiently"

3. **HowItWorksPreview**
   - Two-column layout
   - Left: "One engine, two views" label, serif heading, description, QuickIQ/ProIQ feature boxes
   - Right: Numbered pipeline steps list (01-09), step 01 highlighted with gold bg

4. **WhoItsForGrid**
   - "Built for teams that bid" heading
   - 3x2 grid of industry cards: Management Consulting, Creative & PR Agencies, Technology & IT, Architecture & Design, Recruitment & Staffing, Charity & Third Sector
   - Each: icon, serif name, description, dark card with subtle border

5. **FinalCTA**
   - "Ready to start winning more?" serif heading
   - Two CTAs: "Request Access" (gold) + "Client Portal" (ghost)

6. **Footer**
   - Dark bg, logo, nav links, copyright

### 2.2 `PlatformPage` — Route: `/platform`
### 2.3 `SolutionsPage` — Route: `/solutions`
### 2.4 `HowItWorksPage` — Route: `/how-it-works`
### 2.5 `GetAccessPage` — Route: `/get-access`

All four are **placeholder pages** — same header/nav as landing, centred "Coming soon" message with "Back to home" gold link. These need design.

### 2.6 `LoginPage` — Route: `/login`

**Theme**: Dark (ink background), split layout.

**Layout**: Two panels side by side (responsive — left panel hidden on mobile):

**Left Panel** (w-96, desktop only):
- Logo + "ProposalIQ" at top
- Serif heading: "Your institutional knowledge," / gold: "working for every bid."
- Subtitle description
- Bottom: 4 feature bullet points (checkmarks)

**Right Panel** (centred form):
- Dark card (`#1a1917` bg, subtle border)
- Header: "Sign in to ProposalIQ" (or "Create your workspace" for first-time setup)
- Form fields: Organisation Name (setup only), Your Name (setup only), Email, Password
- Each field: micro-label (mono uppercase), dark input with subtle border
- Error banner: rust bg/border if shown
- Submit button: full-width gold background
- Dynamic: auto-detects first user vs returning user

---

## 3. AUTHENTICATED PAGES

### 3.1 `DashboardPage` — Route: `/dashboard`

**Layout**: `AppLayout` wrapper. Paper background. Supports Quick/Pro mode switcher.

**Content area:**

**IntentSelectorBar** — three large selectable cards across the top:
| Mode Key       | Icon | Label              | Accent Colour | Description                                    |
|----------------|------|--------------------|---------------|------------------------------------------------|
| `write`        | ✍    | Write Proposals    | teal          | Quick access to scan an RFP and find matching past work |
| `intelligence` | ◈    | Full Intelligence  | gold          | Deep analytics, win patterns, writing quality scores     |
| `repository`   | ⊞    | Manage Repository  | sage          | Upload, organise and review past proposals               |

Selected card: solid border + tinted bg. Unselected: dashed border, white bg.

Persisted to localStorage as `piq_dash_mode`.

**SeedBanner** (shown when repository is empty):
- Gold-tinted card with "Set up your knowledge base" heading
- Two buttons: "Load 10 Example Proposals" (gold) + "Upload my own →" (ghost)

**Write Mode Content** (2-col + sidebar):
- Left (2/3): "Start a New Scan" dashed border card linking to `/rfp`, "Recent Scans" list with status badges
- Right (1/3): Quick Stats card (Repository count, Win Rate %, Scans Run), Learning History prompt (gold bg), "View Repository" link

**Intelligence Mode Content**:
- Top recommendation banner: full-width teal bg card with AI recommendation + refresh button
- Learning history prompt: gold bar if projects need narrative
- 4-column metrics row: Total Projects, Win Rate, Avg Rating, RFP Scans
- Left (2/3): Win Patterns card (quality score bars for Won vs Lost on Writing/Approach/Credibility + sector breakdown table), Knowledge Base Health card (writing analysis + learning history progress bars)
- Right (1/3): Recent Projects list with outcome dots and writing scores

**Repository Mode Content** (2-col + sidebar):
- Left (2/3): 3-card grid (Repository, Team Setup, Settings) + Recent Activity list with outcome icons
- Right (1/3): Quick Actions list (Upload Proposal, Run RFP Scan, Add Team Member) + Breakdown progress bars (Won/Lost/Pending)

---

### 3.2 `RFPListPage` — Route: `/rfp`

**Layout**: `AppLayout` wrapper, centred content (max-w-2xl).

**UploadCard** — prominent card at top:
- Serif heading: "New Intelligence Scan"
- Description adapts to Quick/Pro mode
- Optional scan name input
- File drop zone: dashed border, 3 states (empty/selected/uploading)
  - Empty: "Drop RFP here or click to browse" + file type hint
  - Selected: filename + size + "click to change"
  - Uploading: spinner + "Processing — 30-60 seconds..."
- Full-width teal "Run Intelligence Scan" button
- Accepts: .pdf, .docx, .doc, .txt (up to 30MB)

**PreviousScansList** — below upload card:
- "Previous Scans" serif heading
- Vertical stack of cards, each with: ⊡ icon, name (truncated), date (en-GB format), status badge (`sage`=complete, `gold`=processing, `rust`=error), "View →" link, delete button (appears on hover, rust colour)

---

### 3.3 `RFPDetailPage` — Route: `/rfp/[id]`

The most complex page. Two distinct rendering modes:

#### QUICK MODE (mode = "quick")

Renders only the `ExecutiveBrief` component — no tabs, no sidebar. Clean, focused read.

**ExecutiveBrief** structure:
1. **VerdictBanner**: Full-width coloured bar at top. Colour: sage for "bid", rust for "no-bid", gold for "consider". Contains verdict text + fit score + confidence badge
2. **WinningThesis**: Bold serif text with the recommended winning angle
3. **FitAssessment**: Brief paragraph on strategic/capability fit
4. **PrioritiesAndRisks**: Two-column layout — Top 3 Priorities (numbered) + Top 3 Risks (numbered)
5. **RecommendedAssets**: List of matched past proposals to reference
6. **StyleGuidance**: Brief note on tone/structure guidance
7. **NextActions**: Immediate next steps list

Action bar below: "View RFP" (download link), "Export", "Generate Template"

#### PRO MODE (mode = "pro")

Full workspace layout with:
- **RfpTaxonomyBar**: Horizontal bar below topbar showing classification tags
  - "Classification:" label
  - Client industry pill (gold border/bg, ◆ icon) — clickable to change via dropdown
  - Service industry pill (teal border/bg, ◈ icon) — clickable to change via dropdown
  - Client name pill (grey)
  - Sector pill (grey)
  - Contract value pill (grey)

- **ProcessingState** (while scan is running):
  - Live step progress display with numbered pipeline steps
  - Spinner + current step label
  - Auto-polls for updates

- **TabBar**: Horizontal scrollable tabs
  | Tab ID       | Label              | Badge                          |
  |--------------|--------------------|--------------------------------|
  | `brief`      | Overview           | ★ if brief available           |
  | `matches`    | Matched Proposals  | count of matches               |
  | `gaps`       | Opportunity Gaps   | count of gaps                  |
  | `writing`    | Writing Insights   | count of analyses              |
  | `news`       | Market Context     | count of news items            |
  | `approach`   | Suggested Approach | count of phases                |
  | `strategy`   | Win Strategy       | ⚡ if available                |
  | `language`   | Winning Language   | count of snippets              |
  | `narrative`  | Narrative Advice   | ✎ if available                 |
  | `assembly`   | Proposal Assembly  | ⊞                              |

- **Main content area** + **Right sidebar** (on some tabs)

**Tab: `brief` (Overview)**
- Same `ExecutiveBrief` component as Quick mode, but within the tabbed layout

**Tab: `matches` (Matched Proposals)**
- `CheckpointBanner` for RFP extraction approval
- `TieredMatches` component:
  - Filter buttons row: "All matches" / "Same client sector" (gold) / "Same type of work" (teal)
  - Proposals grouped by tier with tier headers:
    - Tier 1: "Direct fit — same client sector and type of work" (teal bg label)
    - Tier 3: "Same type of work" (teal-light label)
    - Tier 2: "Same client sector" (gold label)
    - Tier 4: "Untagged proposals" (grey label)
    - Tier 5: "Cross-sector" — hidden by default, reveal button
  - Each `MatchCard`:
    - ScoreRing (left), project name + client + date + value
    - Match quality label, outcome badge
    - Tags: match reasons, sanity warnings
    - Star rating, writing score
    - Expandable: LLM ranking reason, match explanation, style classification
    - Actions: "More detail" toggle, Copy Reference, Download, Open

**Tab: `gaps` (Opportunity Gaps)**
- `CheckpointBanner` for gap analysis approval
- **CoverageMap**: Grid of requirement rows showing coverage status per requirement
- **GapCards**: Vertical list, each with:
  - Priority indicator (high=rust, med=gold, low=teal) left stripe
  - Gap title, type badge, priority badge
  - Description paragraph
  - Source hint, suggested team lead with reason
  - Impact note, suggested action

**Tab: `writing` (Writing Insights)**
- Summary table of writing quality scores across matched proposals
- Evidence highlights from winning vs losing proposals
- Win indicator patterns

**Tab: `news` (Market Context)**
- `MarketContext` component — news items grouped by category:
  - Programme (teal), Buyer (gold), Tech/Reg (sage), Competitive (rust)
- Each `MarketContextCard`:
  - Source badge, date, relevance score bar
  - Title (serif), snippet
  - "Why it matters" callout (tinted bg)
  - "Where to use in bid" + tone tags
  - Source URL link

**Tab: `approach` (Suggested Approach)**
- Narrative introduction paragraph
- Phase grid: each phase card with name, description, deliverables, duration
- Indicative budget breakdown
- Key risks table
- Differentiators list

**Tab: `strategy` (Win Strategy)**
- `CheckpointBanner` for strategy approval
- Win strategy narrative (multi-paragraph prose)
- Two-column: Priorities (what to focus on) + Risks (what to mitigate)
- Focus areas + things to avoid

**Tab: `language` (Winning Language)**
- Grid of language snippet cards, each with:
  - Source proposal reference
  - Original winning text (quoted)
  - Adaptation note for this RFP
  - Tone/style classification tags

**Tab: `narrative` (Narrative Advice)**
- Bid strategist advice (multi-paragraph prose)
- Proposal structure recommendation (ordered section list)
- Writing insights and per-section tips

**Tab: `assembly` (Proposal Assembly)**
- Two states:

  **Section-by-Section View** (default):
  - "Generate full proposal" CTA button (teal, prominent)
  - Quick actions: Template, Draft, Export buttons
  - Progress header: "X of Y sections complete" + progress bar
  - Status legend: Not started (grey), In progress (gold), Draft ready (teal), Complete (sage)
  - 9 section cards in order:
    1. Cover Letter
    2. Executive Summary
    3. Understanding of Requirements
    4. Technical Approach
    5. Relevant Experience
    6. Proposed Team
    7. Quality & Risk Management
    8. Commercial Proposal
    9. Appendices
  - Each section card:
    - Move up/down buttons
    - Section name (editable)
    - Status dropdown
    - Notes input
    - "Draft section" button → opens `SectionDraftPanel` inline
  - `SectionDraftPanel`:
    - Confidence badge + reason
    - Rich draft text with [#1] citation highlighting (teal) and [EVIDENCE NEEDED] highlighting (gold)
    - Sources panel: cited matches, language patterns, evidence gaps
    - Actions: Edit/Save, Copy, Regenerate, Accept, Discard

  **Full Proposal View** (after generating):
  - Header with client/RFP title + matched proposals badge
  - Action bar: Edit/Preview toggle, Copy, Download .txt, Regenerate
  - Full document rendered with title/section heading detection
  - Coverage report card:
    - Coverage percentage + summary
    - Per-requirement status rows (covered/partial/missing)
    - Critical gaps list
    - Improvement suggestions

**Right Sidebar** (visible on most Pro tabs):
- Scan summary card
- RFP details (client, sector, deadline, value)
- Coverage summary mini-card
- Narrative advice preview
- Team suggestions
- Financial model summary

**Modals/Overlays:**
- `OutcomeCaptureModal`: Full-screen overlay. Outcome choice buttons (Won/Lost/Pending/Did not bid), feedback questions, usage hint
- Toast notifications

---

### 3.4 `RepositoryPage` — Route: `/repository`

**Layout**: `AppLayout` wrapper. Three-panel: left sidebar + main content area + modals.

**Left Sidebar** (w-60, cream bg):
- "Project Library" header
- **Smart Filters** list:
  - All Projects (⊞) with count
  - Top Rated 4-5★ (★)
  - Won (✓) — sage colour
  - Lost (✗) — rust colour
  - Pending/Active (◷) — gold colour
  - Failed Uploads (⚠) — rust, conditional
- **Custom Folders** section ("By Sector" label):
  - "New folder" dashed button
  - Expandable folder tree with child folders
  - Each folder: icon, name, count, hover actions (rename, delete)
- **Type of Work Filter** (teal section, ◈ icon):
  - "All Types" option + list of service industries from taxonomy
  - Active item: teal bg tint
- **Client Sector Filter** (gold section, ◆ icon):
  - "All Sectors" option + list of client industries from taxonomy
  - Active item: gold bg tint
- **Legacy Tags Filter** (if old taxonomy items exist)

**Top Toolbar** (white bg):
- Search input with keyword/AI semantic toggle (⚡ button)
- Result count
- "Select" checkbox mode button
- Select mode: select all checkbox + "Delete X" (rust) + Cancel

**Workspace Bar** (shown when workspace has selections):
- Teal-bg bar: "Your workspace: N projects selected for RFP Intelligence"
- "Add all visible" + "Clear workspace" buttons
- When empty: dashed border hint explaining workspace

**Project Grid** (auto-fill, min 280px columns):
Each `ProjectCard`:
- **Ribbon** top-right triangle: sage (won), rust (lost), transparent (other)
- **Hover actions** (appear on hover): Delete (✕, rust, top-left), Re-analyse (⟳, teal, top-right)
- **Body**:
  - Micro-label: sector + project type
  - Name (serif, semibold)
  - Client + year
  - Status indicator: error state (red bg + retry button), indexing (spinner + live pipeline stage), or star rating
  - File chips row: proposal/rfp/budget (filled or outline)
  - **Taxonomy chips**: client industry (gold pill, ◆) + service industry (teal pill, ◈). Dashed outline if untagged ("+ client" / "+ service")
  - Key themes tags (mono, cream bg)
- **Footer bar**:
  - Contract value (formatted with currency)
  - Workspace toggle: "✓ In workspace" (teal filled) or "+ Workspace" (ghost)
  - Outcome dropdown: styled as coloured pill, options = Pending/Active/Won/Lost/Withdrawn

**Upload Modal** (`UploadModal`):
- Multi-step wizard:
  - Step 1: File selection (drag-drop zones for proposal + optional RFP + optional budget). AI pre-scan with confidence indicator
  - Step 2: Metadata form with AI pre-filled fields (marked with "AI ✦" badge). Fields: name, client, sector, contract value + currency, outcome, rating, project type, date, folder, description. Add-new-inline for sectors/types
  - Step 3: Learning history (went well, improvements, lessons)
  - Step 4: Upload + indexing progress (live stage display)

**Batch Import Modal** (`BatchModal`):
- Drag-drop zone for multiple files
- Staggered upload with progress per file
- Auto-retry for failed analyses

---

### 3.5 `ProjectDetailPage` — Route: `/repository/[id]`

**Layout**: `AppLayout` wrapper. Single column, max-width.

**ProjectDetailsEditor** (collapsible):
- Collapsed: one-line summary (client, value, date) + "Edit" toggle
- Expanded: grid of editable fields (name, client, sector, contract value + currency, project type, date, outcome dropdown, rating)
- Each field saves on blur

**AI Analysis Card**:
- Writing quality score circles: Overall, Writing, Approach, Credibility (ScoreCircle component)
- Score bars: individual dimension scores with colour coding
- Positive/negative/suggestion indicators with coloured left-strip badges
- Key themes, strengths, and improvement areas

**Tags Section** (TagList component):
- Editable tag chips with "Type and press Enter" input
- Remove buttons per tag, "Save changes" when dirty

**Tab system**: Overview, Writing Analysis, Files, Narrative/Learning History

---

### 3.6 `TeamPage` — Route: `/team`

**Layout**: `AppLayout` wrapper, with tab bar.

**Tab Bar**: "Team Members" | "Rate Card"

**Header Actions**:
- Import from spreadsheet button (accepts .xlsx, .xls, .csv, .docx, .doc, .txt)
- Select mode button (toggles checkbox multi-select for bulk delete)
- "Add Member" (teal) button

**Import Preview Table** (shown after file upload):
- Grid header row: checkbox, Name, Title/Role, Specialisms, Client £/d, Cost £/d, Yrs
- Editable rows with inline inputs
- "Import Selected (N)" teal button + Cancel

**Empty State**: ◉ icon, "No team members yet" + Add Manually / Import File buttons

**Team Members List** — vertical stack of cards, each:
- Left: Coloured initials avatar circle
- Name + CV badge (if uploaded) + title + years experience
- Specialism tags (teal chips)
- Certification tags (sage chips)
- Project history line (N projects, N won)
- Edit/Remove buttons (or checkbox in select mode)
- **Footer row** (4-col grid): Client/Day rate, Cost/Day rate, Margin %, Availability status

**Rate Card Tab**:
- Import spreadsheet for roles
- Grid/table of role definitions: Role Name, Grade, Category, Client Rate, Cost Rate, Currency
- Inline editing per row
- Select mode for bulk delete
- Summary stats: average client rate, average cost, average margin

**Add/Edit Member Form** (modal or inline):
- Fields: name, title, bio, day rate (client), day rate (cost), availability dropdown, years experience, specialisms (comma-separated), CV upload
- CV upload extracts certifications/skills via AI

---

### 3.7 `ClientsPage` — Route: `/clients`

**Layout**: `AppLayout` wrapper. Two-panel master-detail.

**Left Panel** (w-64, cream bg):
- Search input
- Client list: each with name, "auto" badge if auto-detected, project count, win rate
- Active client highlighted (white bg, shadow)
- Footer: total clients count + W/L tally

**Right Panel** (main area):

**Empty state**: ◎ icon + "Select a client to view their history"

**Add Client Form**: Name, Sector, Relationship Status dropdown (active/prospect/inactive/lost), Notes textarea

**Client Detail View**:
- Name (serif 2xl) + sector subtitle
- Relationship status pill (colour-coded: sage=active, gold=prospect, muted=inactive, rust=lost)
- 4-metric cards: Projects, Won, Lost, Win Rate
- Relationship Notes card with editable textarea + Save button
- Auto-detected prompt (gold bg): "This client was detected from your proposals but has no profile yet" + Create Profile button
- Project History list: each row with outcome colour dot, name, value, date

---

### 3.8 `UsersPage` — Route: `/users`

**Layout**: `AppLayout` wrapper. Centred content (max-w-2xl).

**Admin-only gate**: Non-admins see "Only admins can manage users" message.

**User List Card**:
- Each row: coloured initials avatar (gold=admin, teal=regular), name, admin badge, "you" badge, email
- Remove button for non-self users

**Add User Form** (shown on toggle):
- Fields: Full Name, Email, Password
- "Add User" teal button + Cancel
- Success toast with "share their email and password" message

---

### 3.9 `SettingsPage` — Route: `/settings`

**Layout**: `AppLayout` wrapper. Tab bar at top.

**Tab Bar**: General | AI Configuration | AI Costs | AI Prompts | Taxonomy | Data & Storage

**General Tab** (centred, max-w-2xl):
- Organisation card: name input, target margin %, default currency dropdown
- Organisation Profile card: description of what it does, "Set up or edit your profile" link, "Change company details" link
- Save Settings button
- "Switch to a different company" card: explanation, "Clear organisation profile" button
  - Triggers confirmation modal explaining what gets cleared vs kept

**AI Configuration Tab** (centred):
- Gemini section: API key status (green/red dot), model name
- OpenAI section: API key status (green/amber dot), model name
- Note about setting keys via Railway variables

**AI Costs Tab** (`AiCostsTab` component):
- Total Spend card: 4-metric grid (total cost, API calls, input tokens, output tokens)
- By Feature card: breakdown rows (RFP scans, Proposal analysis, Proposal generation, Other)
- By Model card: breakdown rows per AI model
- By Function card: top 10 most expensive AI functions
- Daily Spend card: last 7 days table with cost + call count per day

**AI Prompts Tab** (split layout):
- Left (w-56): prompt list with modified indicator (✎)
- Right: prompt editor card with label, description, textarea editor, Save/Reset buttons
- Modified warning banner

**Taxonomy Tab** (centred):
- Add new item: category dropdown (Service Offering / Sector) + name input + Add button
- Grouped list by category
- Each item: name, "default" badge, hover actions (rename, delete)

**Data & Storage Tab** (centred):
- Table of file paths: Database, Uploaded files, RFP files, Team CVs, Win patterns cache
- Note about Railway volume mount

---

### 3.10 `OnboardingProfilePage` — Route: `/onboarding/profile`

**Layout**: `AppLayout` wrapper.

**Flow**:

1. **Input Section**:
   - Company name input (DebouncedInput)
   - Website URL input OR "Paste services list instead" toggle
   - If paste mode: large textarea for pasting company services
   - "Scan Website" button (teal) — triggers AI extraction

2. **Scanning State**: Spinner + "Analysing your website..." message

3. **Review/Edit Section** (after scan):
   - Success toast: "Extracted N offerings — review and confirm below"
   - **Offerings List**: Each offering chip with:
     - Label (editable)
     - Canonical taxonomy match
     - Confidence indicator
     - Source/evidence note
     - "Core" toggle (pin as core offering)
     - Remove button
   - "Add new offering" inline input
   - **Client Types List**: Editable chips
   - **Positioning Phrases**: Editable list
   - **Differentiators**: Editable list

4. **Save**: "Save confirmed profile" button → saves to organisation_profile table

If profile already exists: loads it into edit mode for refinement.

---

## 4. STATES & INTERACTIONS

### 4.1 Loading States
- Skeleton loaders: animated pulse rectangles (cream-bg) used on dashboard
- Spinner + text: "Loading..." pattern used on lists
- Content shimmer: n/a (uses skeleton approach)

### 4.2 Empty States
- Centred layout: large faded icon + serif heading + description + CTA button(s)
- Examples: "No team members yet", "No projects found", "No scans yet"

### 4.3 Error States
- Analysis failed: rust bg card with "⚠ Analysis failed" + "Re-run Analysis" button
- API errors: Toast notification
- Form validation: red border + error text below field

### 4.4 Processing States
- RFP scanning: numbered pipeline steps with live progress
- File upload: progress bar per file
- AI generation: spinner + descriptive text ("Processing — 30-60 seconds...")
- Indexing: 4-stage indicator (① File received → ② Extracting text → ③ AI analysing → ④ Building index → ✓ Complete)

### 4.5 Mobile Responsiveness
- Single-column layouts on mobile
- Hamburger → drawer nav
- Touch target minimum: 44px
- Safe area padding for notched devices
- Horizontal scroll for tab bars
- Grid collapses: 4-col → 2-col → 1-col
- Sidebar panels become full-width or hidden

---

## 5. PAGE MAP / SITEMAP

```
/                              LandingPage (public, dark)
/platform                      PlatformPage (public, dark, placeholder)
/solutions                     SolutionsPage (public, dark, placeholder)
/how-it-works                  HowItWorksPage (public, dark, placeholder)
/get-access                    GetAccessPage (public, dark, placeholder)
/login                         LoginPage (public, dark, split-panel)
│
├── /dashboard                 DashboardPage (auth, 3 intent modes)
├── /repository                RepositoryPage (auth, 3-panel + modals)
│   └── /repository/[id]       ProjectDetailPage (auth, tabbed detail)
├── /rfp                       RFPListPage (auth, upload + scan list)
│   └── /rfp/[id]              RFPDetailPage (auth, Quick or 10-tab Pro)
├── /team                      TeamPage (auth, 2 tabs + modals)
├── /clients                   ClientsPage (auth, master-detail)
├── /users                     UsersPage (auth, admin-only)
├── /settings                  SettingsPage (auth, 6 tabs)
└── /onboarding/profile        OnboardingProfilePage (auth, wizard flow)
```

---

## 6. NAMING CONVENTIONS REFERENCE

These names are used in the codebase and should be used consistently in design files:

| Design Name          | Code Reference              | Notes                                    |
|----------------------|-----------------------------|------------------------------------------|
| AppLayout            | `components/Layout.jsx`     | Shared shell for all authenticated pages  |
| Btn                  | `components/ui.jsx`         | Button component, specify variant         |
| Card                 | `components/ui.jsx`         | White bordered container                  |
| Badge                | `components/ui.jsx`         | Pill label, specify colour                |
| ScoreRing            | `components/ui.jsx`         | Circular SVG progress indicator           |
| Stars                | `components/ui.jsx`         | 5-star rating display                     |
| FileChip             | `components/ui.jsx`         | Tiny file-type label                      |
| ProgressBar          | `components/ui.jsx`         | Horizontal bar                            |
| Toast                | `components/ui.jsx`         | Bottom-right notification                 |
| Spinner              | `components/ui.jsx`         | Loading circle                            |
| OutcomeLabel         | `components/ui.jsx`         | Won/Lost/Pending badge                    |
| IntentSelector       | `dashboard.jsx`             | 3-mode selector at top of dashboard       |
| Metric               | `dashboard.jsx`             | Stats card with accent stripe             |
| ProjectCard          | `repository.jsx`            | Grid card for a proposal project          |
| UploadModal          | `repository.jsx`            | Multi-step upload wizard                  |
| BatchModal           | `repository.jsx`            | Bulk file import overlay                  |
| RfpTaxonomyBar       | `rfp/[id].jsx`              | Classification tags bar                   |
| ExecutiveBrief       | `rfp/[id].jsx`              | Verdict + thesis + priorities brief       |
| TieredMatches        | `rfp/[id].jsx`              | Grouped proposal matches with filters     |
| MatchCard            | `rfp/[id].jsx`              | Individual matched proposal card          |
| GapCard              | `rfp/[id].jsx`              | Gap analysis result card                  |
| MarketContext        | `rfp/[id].jsx`              | News items grouped by category            |
| MarketContextCard    | `rfp/[id].jsx`              | Individual news/intelligence card         |
| SectionDraftPanel    | `rfp/[id].jsx`              | AI-drafted section with citations         |
| AssemblyTab          | `rfp/[id].jsx`              | Full proposal assembly workspace          |
| OutcomeCaptureModal  | `rfp/[id].jsx`              | Feedback/outcome capture overlay          |
| CheckpointBanner     | `rfp/[id].jsx`              | Approval step banner                      |
| ProjectDetailsEditor | `repository/[id].jsx`       | Collapsible project metadata editor       |
| ScoreCircle          | `repository/[id].jsx`       | Quality score circular indicator          |
| TagList              | `repository/[id].jsx`       | Editable tag chips with input             |

---

*End of brief. Every page, component, state, colour, and interaction pattern in the current ProposalIQ production application is documented above.*
