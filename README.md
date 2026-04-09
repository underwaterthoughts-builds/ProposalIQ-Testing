# ProposalIQ — Proof of Concept

A knowledge-driven proposal intelligence platform. Runs locally on your machine.

---

## Requirements

- **Node.js 18 or higher** — https://nodejs.org
- **A Gemini API key** — https://aistudio.google.com/app/apikey (free tier works)

---

## Installation

```bash
# 1. Move into the project folder
cd proposaliq

# 2. Install dependencies (~2 minutes)
npm install

# 3. Create your environment file
cp .env.example .env.local
```

Open `.env.local` and fill in:
```
GEMINI_API_KEY=paste-your-key-here
JWT_SECRET=any-long-random-string-you-choose
```

---

## Running the app

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## First run

1. You'll see a **"Create Workspace"** screen. Enter your organisation name and your personal credentials.
2. Once logged in, you'll see the Dashboard with a prompt to load example data.
3. Click **"Load 10 Example Proposals"** — this calls the Gemini API to generate embeddings for all seed data. Takes about **60 seconds**.
4. Once seeded, upload an RFP and run your first intelligence scan.

---

## Sharing with your team

Find your local IP address:
```bash
# Mac/Linux
ifconfig | grep "inet "

# Windows
ipconfig
```

Anyone on the same network can access the app at `http://YOUR_IP:3000` and create their own account.

---

## Where data lives

| Type | Location |
|------|----------|
| Database | `data/proposaliq.db` |
| Uploaded files | `uploads/` |

Back up both folders regularly. The database contains all your project metadata, AI embeddings, and scan results.

---

## Module overview

| Page | What it does |
|------|-------------|
| `/dashboard` | Overview, recent projects, scan history |
| `/repository` | Browse, search, and upload proposals |
| `/rfp` | Upload an RFP and run an intelligence scan |
| `/team` | Manage team members, specialisms, and day rates |

---

## The intelligence scan

Upload any RFP (PDF or DOCX) and the platform will:
1. Parse and extract all requirements
2. Cross-reference your entire repository using semantic similarity
3. Rank matched proposals by relevance × quality rating × outcome
4. Identify gaps between what the RFP asks for and what your repository covers
5. Surface relevant industry news from the last 6 months
6. Suggest the right team members based on their experience matching the RFP
7. Generate an indicative financial model

Results appear on a single intelligence briefing page, typically within 30–60 seconds.

---

## Gemini model

Default: `gemini-2.5-flash`

To change: set `GEMINI_MODEL=model-name` in `.env.local`.
Check current model names at https://ai.google.dev/models

---

## Notes

- The app requires an internet connection for AI features (Gemini API calls)
- All documents are stored locally — nothing is sent except the text content to Gemini
- Embeddings use Google's `text-embedding-004` model
