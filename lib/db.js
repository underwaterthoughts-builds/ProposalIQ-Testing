const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'proposaliq.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  runMigrations(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      org_name TEXT DEFAULT 'My Organisation',
      role TEXT DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      sector TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      sector TEXT DEFAULT '',
      contract_value REAL DEFAULT 0,
      currency TEXT DEFAULT 'GBP',
      outcome TEXT DEFAULT 'pending',
      user_rating INTEGER DEFAULT 0,
      ai_weight REAL DEFAULT 0.40,
      project_type TEXT DEFAULT '',
      date_submitted TEXT DEFAULT '',
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      description TEXT DEFAULT '',
      went_well TEXT DEFAULT '',
      improvements TEXT DEFAULT '',
      lessons TEXT DEFAULT '',
      lh_status TEXT DEFAULT 'none',
      lh_what_committed TEXT DEFAULT '',
      lh_what_delivered TEXT DEFAULT '',
      lh_went_well TEXT DEFAULT '',
      lh_went_poorly TEXT DEFAULT '',
      lh_client_feedback TEXT DEFAULT '',
      lh_methodology_refinements TEXT DEFAULT '',
      lh_pricing_accuracy TEXT DEFAULT '{}',
      ai_metadata TEXT DEFAULT '{}',
      taxonomy TEXT DEFAULT '{}',
      embedding TEXT DEFAULT NULL,
      kqs_recency REAL DEFAULT 0.5,
      kqs_outcome_quality REAL DEFAULT 0.5,
      kqs_specificity REAL DEFAULT 0.5,
      kqs_composite REAL DEFAULT 0.5,
      indexing_status TEXT DEFAULT 'pending',
      indexed_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS section_embeddings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL,
      content TEXT DEFAULT '',
      embedding TEXT DEFAULT NULL,
      decay_rate TEXT DEFAULT 'medium',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      years_experience INTEGER DEFAULT 0,
      day_rate_client REAL DEFAULT 0,
      day_rate_cost REAL DEFAULT 0,
      availability TEXT DEFAULT 'available',
      stated_specialisms TEXT DEFAULT '[]',
      stated_sectors TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      color TEXT DEFAULT '#2d6b78',
      cv_filename TEXT DEFAULT NULL,
      cv_extracted TEXT DEFAULT '{}',
      certifications TEXT DEFAULT '',
      email TEXT DEFAULT '',
      location TEXT DEFAULT '',
      languages TEXT DEFAULT '',
      embedding TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_team (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      role TEXT DEFAULT '',
      days_contributed INTEGER DEFAULT 0,
      PRIMARY KEY (project_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS rfp_scans (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT 'Untitled Scan',
      rfp_filename TEXT DEFAULT '',
      rfp_original_name TEXT DEFAULT '',
      rfp_text TEXT DEFAULT '',
      rfp_data TEXT DEFAULT '{}',
      matched_proposals TEXT DEFAULT '[]',
      gaps TEXT DEFAULT '[]',
      news TEXT DEFAULT '[]',
      team_suggestions TEXT DEFAULT '[]',
      financial_model TEXT DEFAULT '{}',
      coverage TEXT DEFAULT '{}',
      narrative_advice TEXT DEFAULT '',
      suggested_approach TEXT DEFAULT NULL,
      win_strategy TEXT DEFAULT NULL,
      winning_language TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT NOT NULL,
      consented_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_values (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, value)
    );

    CREATE TABLE IF NOT EXISTS rfp_scan_suppressions (
      scan_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (scan_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS rfp_scan_annotations (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      section TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Custom overview fields per project
    CREATE TABLE IF NOT EXISTS project_overview_fields (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_value TEXT DEFAULT '',
      field_type TEXT DEFAULT 'text',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Multi-user learning history entries
    CREATE TABLE IF NOT EXISTS project_narrative_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT,
      user_name TEXT DEFAULT 'Unknown',
      entry_type TEXT DEFAULT 'note',
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Service offering taxonomy (centrally managed, extensible)
    CREATE TABLE IF NOT EXISTS taxonomy_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Service Offering',
      parent_id TEXT DEFAULT NULL,
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexing event log (for stuck detection and user visibility)
    CREATE TABLE IF NOT EXISTS indexing_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT DEFAULT '',
      stage TEXT NOT NULL,
      status TEXT DEFAULT 'info',
      message TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Rate card / job roles
    CREATE TABLE IF NOT EXISTS rate_card_roles (
      id TEXT PRIMARY KEY,
      role_name TEXT NOT NULL,
      grade TEXT DEFAULT '',
      category TEXT DEFAULT '',
      day_rate_client REAL DEFAULT 0,
      day_rate_cost REAL DEFAULT 0,
      currency TEXT DEFAULT 'GBP',
      notes TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Custom prompts (user-editable AI prompts with reset-to-default)
    CREATE TABLE IF NOT EXISTS custom_prompts (
      id TEXT PRIMARY KEY,
      prompt_key TEXT NOT NULL UNIQUE,
      prompt_label TEXT NOT NULL,
      prompt_description TEXT DEFAULT '',
      content TEXT NOT NULL,
      default_content TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Client profiles
    CREATE TABLE IF NOT EXISTS client_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      key_contacts TEXT DEFAULT '[]',
      relationship_status TEXT DEFAULT 'prospect',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_overview_project ON project_overview_fields(project_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_project ON project_narrative_entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_projects_folder ON projects(folder_id);
    CREATE INDEX IF NOT EXISTS idx_projects_outcome ON projects(outcome);
    CREATE INDEX IF NOT EXISTS idx_projects_rating ON projects(user_rating);
    CREATE INDEX IF NOT EXISTS idx_pfiles_project ON project_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_semb_project ON section_embeddings(project_id);
  `);
}

function hasUsers() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row.count > 0;
}

// Safe migrations for existing databases
function runMigrations(db) {
  const migrations = [
    "ALTER TABLE rfp_scans ADD COLUMN win_strategy TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN winning_language TEXT DEFAULT '[]'",
    "ALTER TABLE rfp_scans ADD COLUMN bid_score TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN checkpoint_rfp_approved INTEGER DEFAULT 0",
    "ALTER TABLE rfp_scans ADD COLUMN checkpoint_gaps_approved INTEGER DEFAULT 0",
    "ALTER TABLE rfp_scans ADD COLUMN checkpoint_strategy_approved INTEGER DEFAULT 0",
    "ALTER TABLE rfp_scans ADD COLUMN rfp_data_edited TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN gaps_edited TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN strategy_edited TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN status_detail TEXT DEFAULT NULL",
    "ALTER TABLE team_members ADD COLUMN certifications TEXT DEFAULT ''",
    "ALTER TABLE team_members ADD COLUMN email TEXT DEFAULT ''",
    "ALTER TABLE team_members ADD COLUMN location TEXT DEFAULT ''",
    "ALTER TABLE team_members ADD COLUMN languages TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN client_profile_id TEXT DEFAULT NULL",
    "CREATE TABLE IF NOT EXISTS client_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, sector TEXT DEFAULT '', notes TEXT DEFAULT '', key_contacts TEXT DEFAULT '[]', relationship_status TEXT DEFAULT 'prospect', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS custom_prompts (id TEXT PRIMARY KEY, prompt_key TEXT NOT NULL UNIQUE, prompt_label TEXT NOT NULL, prompt_description TEXT DEFAULT '', content TEXT NOT NULL, default_content TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS taxonomy_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT \'Service Offering\', parent_id TEXT DEFAULT NULL, sort_order INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS indexing_log (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_name TEXT DEFAULT \'\', stage TEXT NOT NULL, status TEXT DEFAULT \'info\', message TEXT DEFAULT \'\', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS rate_card_roles (id TEXT PRIMARY KEY, role_name TEXT NOT NULL, grade TEXT DEFAULT '', category TEXT DEFAULT '', day_rate_client REAL DEFAULT 0, day_rate_cost REAL DEFAULT 0, currency TEXT DEFAULT 'GBP', notes TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "ALTER TABLE projects ADD COLUMN ai_weight REAL DEFAULT 0.4",
    // Two-axis taxonomy (service = what work, client = client sector)
    "ALTER TABLE projects ADD COLUMN service_industry TEXT DEFAULT NULL",
    "ALTER TABLE projects ADD COLUMN service_sectors TEXT DEFAULT '[]'",
    "ALTER TABLE projects ADD COLUMN client_industry TEXT DEFAULT NULL",
    "ALTER TABLE projects ADD COLUMN client_sectors TEXT DEFAULT '[]'",
    "ALTER TABLE projects ADD COLUMN taxonomy_source TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN service_industry TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN service_sectors TEXT DEFAULT '[]'",
    "ALTER TABLE rfp_scans ADD COLUMN client_industry TEXT DEFAULT NULL",
    "ALTER TABLE rfp_scans ADD COLUMN client_sectors TEXT DEFAULT '[]'",
    "ALTER TABLE taxonomy_items ADD COLUMN taxonomy_type TEXT DEFAULT 'service'",
    "ALTER TABLE rfp_scans ADD COLUMN executive_brief TEXT DEFAULT NULL",
    "CREATE INDEX IF NOT EXISTS idx_projects_service_industry ON projects(service_industry)",
    "CREATE INDEX IF NOT EXISTS idx_projects_client_industry ON projects(client_industry)",
    "CREATE INDEX IF NOT EXISTS idx_taxonomy_type ON taxonomy_items(taxonomy_type, category)",
    // ── Closed feedback loop (Wave 3) ─────────────────────────────────────
    // Tracks how users interact with scan output (passive) and what
    // happened with the bid (active capture). Used to bias future ranking
    // toward proposals/snippets that have actually been used in winning bids.
    `CREATE TABLE IF NOT EXISTS scan_usage_events (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      payload TEXT DEFAULT '{}',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_usage_scan ON scan_usage_events(scan_id)",
    "CREATE INDEX IF NOT EXISTS idx_usage_target ON scan_usage_events(target_type, target_id)",
    "CREATE INDEX IF NOT EXISTS idx_usage_event ON scan_usage_events(event_type)",
    `CREATE TABLE IF NOT EXISTS scan_outcomes (
      scan_id TEXT PRIMARY KEY,
      submitted INTEGER DEFAULT 0,
      outcome TEXT DEFAULT 'pending',
      piq_used_materially INTEGER DEFAULT 0,
      most_useful TEXT DEFAULT '',
      what_was_missing TEXT DEFAULT '',
      client_feedback TEXT DEFAULT '',
      captured_by TEXT,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_outcomes_outcome ON scan_outcomes(outcome)",
    // ── Section drafts (Wave 4) ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS section_drafts (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_name TEXT NOT NULL,
      draft_text TEXT DEFAULT '',
      cited_match_ids TEXT DEFAULT '[]',
      cited_language_ids TEXT DEFAULT '[]',
      evidence_needed TEXT DEFAULT '[]',
      confidence TEXT DEFAULT 'medium',
      confidence_reason TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      accepted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_drafts_scan ON section_drafts(scan_id)",
    "CREATE INDEX IF NOT EXISTS idx_drafts_section ON section_drafts(scan_id, section_id)",
    // ── Organisation profile (Wave 5) ─────────────────────────────────────
    // Singleton (id='default') capturing the user-confirmed set of services
    // the organisation actually offers. AI suggests from a website scan or
    // pasted services list; user confirms. Cascades into gap analysis, win
    // strategy, executive brief, and section drafts so recommendations are
    // grounded in what the org can actually deliver.
    `CREATE TABLE IF NOT EXISTS organisation_profile (
      id TEXT PRIMARY KEY,
      org_name TEXT DEFAULT '',
      website_url TEXT DEFAULT '',
      extracted_snapshot TEXT DEFAULT '{}',
      confirmed_profile TEXT DEFAULT '{}',
      last_scanned_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of migrations) {
    try { db.prepare(sql).run(); } catch {}
  }
}

module.exports = { getDb, hasUsers };
