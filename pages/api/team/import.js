import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ownerId } from '../../../lib/tenancy';
import { embed } from '../../../lib/gemini';
import { ensureDir } from '../../../lib/storage';
import { v4 as uuid } from 'uuid';
import XLSX from 'xlsx';

export const config = { api: { bodyParser: false } };

const COLORS = ['#2d6b78','#3d5c3a','#8b3a5c','#5c4a2a','#4a2a5c','#2a4a3c','#7a3a1c','#1c3a7a'];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function cleanStr(v) {
  return String(v ?? '').replace(/\r/g, '').trim();
}

function parseRate(v) {
  if (!v && v !== 0) return '';
  const s = String(v).replace(/[£$€,\s]/g, '').replace(/\/day|\/d|pd|per day/gi, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? '' : n;
}

function parseYears(v) {
  if (!v) return '';
  const s = String(v).replace(/[^0-9]/g, '');
  return parseInt(s) || '';
}

// Find a column key matching any candidate label — fuzzy, normalised
function findCol(keys, ...candidates) {
  const norm = s => s.toLowerCase().replace(/[\s_\-\/().]/g, '');
  for (const c of candidates) {
    const cn = norm(c);
    // exact normalised match first
    const exact = keys.find(k => norm(k) === cn);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const cn = norm(c);
    // partial match
    const partial = keys.find(k => norm(k).includes(cn) || cn.includes(norm(k)));
    if (partial) return partial;
  }
  return null;
}

// Assemble full name from whatever columns exist
function assembleName(row, colName, colFirst, colLast, colSurname) {
  if (colName) {
    const full = cleanStr(row[colName]);
    if (full && full.split(' ').length >= 2) return full; // already a full name
    // might be just first — try to append last name
    if (full && colLast) return `${full} ${cleanStr(row[colLast])}`.trim();
    if (full && colSurname) return `${full} ${cleanStr(row[colSurname])}`.trim();
    if (full) return full;
  }
  if (colFirst && colLast) return `${cleanStr(row[colFirst])} ${cleanStr(row[colLast])}`.trim();
  if (colFirst && colSurname) return `${cleanStr(row[colFirst])} ${cleanStr(row[colSurname])}`.trim();
  if (colFirst) return cleanStr(row[colFirst]);
  if (colLast) return cleanStr(row[colLast]);
  return '';
}

// Deduplicate by normalised name
function deduplicateRows(rows) {
  const seen = new Set();
  return rows.filter(r => {
    const key = r.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── AI-ASSISTED COLUMN MAPPING (Gemini — fast, used as fallback) ──────────────
async function aiMapColumns(headers, sampleRows) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const client = new GoogleGenerativeAI(key);

    const sampleText = sampleRows.slice(0, 3).map(r =>
      headers.map(h => `${h}: ${r[h] ?? ''}`).join(' | ')
    ).join('\n');

    const prompt = `You are parsing a team/staff spreadsheet. Map column headers to standard fields.

Headers: ${JSON.stringify(headers)}
Sample rows:
${sampleText}

Return ONLY valid JSON — use null if no column matches:
{
  "full_name": "column header for full name, or null",
  "first_name": "column header for first name only, or null",
  "last_name": "column header for last/surname only, or null",
  "job_title": "column header for job title/role, or null",
  "client_rate": "column header for day rate charged to client, or null",
  "cost_rate": "column header for internal/cost rate, or null",
  "availability": "column header for availability/status, or null",
  "years_experience": "column header for years of experience, or null",
  "sectors": "column header for sectors/industries, or null",
  "specialisms": "column header for skills/specialisms, or null",
  "certifications": "column header for certifications/qualifications, or null",
  "email": "column header for email, or null",
  "location": "column header for location/office/city, or null",
  "languages": "column header for languages spoken, or null",
  "notes": "any useful notes about the structure of this spreadsheet"
}`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const m of models) {
      try {
        const model = client.getGenerativeModel({ model: m, generationConfig: { responseMimeType: 'application/json' } });
        const r = await model.generateContent(prompt);
        const text = r.response.text();
        const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
        return parsed;
      } catch { continue; }
    }
  } catch (e) {
    console.error('AI column mapping failed:', e.message);
  }
  return null;
}

// ── PARSE SPREADSHEET INTO RAW ROWS ──────────────────────────────────────────
function parseSpreadsheet(filepath) {
  const wb = XLSX.readFile(filepath, { cellDates: true });

  // Try all sheets, use the one with the most data rows
  let bestSheet = null, bestCount = 0;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (rows.length > bestCount) { bestCount = rows.length; bestSheet = ws; }
  }
  if (!bestSheet) return [];

  // Parse with header row auto-detection
  // First try normal header detection
  let rows = XLSX.utils.sheet_to_json(bestSheet, { defval: '', raw: false });

  // If first row looks like data not headers (all numeric), skip it
  if (rows.length > 0) {
    const firstKeys = Object.keys(rows[0]);
    const looksLikeHeaders = firstKeys.some(k => /[a-zA-Z]/.test(k) && k.length > 1);
    if (!looksLikeHeaders) {
      // Fall back to using row 0 as headers manually
      rows = XLSX.utils.sheet_to_json(bestSheet, { defval: '', raw: false, header: 1 });
      if (rows.length > 1) {
        const headers = rows[0].map(h => String(h));
        rows = rows.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
      }
    }
  }

  // Filter out completely empty rows and rows that are clearly just formatting
  return rows.filter(row => {
    const vals = Object.values(row).map(v => String(v).trim()).filter(Boolean);
    return vals.length >= 2; // at least 2 non-empty cells
  });
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const contentType = req.headers['content-type'] || '';

  // ── JSON MODE: commit validated rows ─────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await new Promise((resolve) => {
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });

    const rows = body.rows || [];
    if (!rows.length) return res.status(400).json({ error: 'No rows provided' });

    const db = getDb();
    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO team_members
        (id, name, title, years_experience, day_rate_client, day_rate_cost,
         availability, stated_specialisms, stated_sectors, bio, color, embedding,
         certifications, email, location, languages, owner_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const owner = ownerId(req.user);

    let imported = 0;
    const errors = [];

    for (const row of rows) {
      if (!row.name?.trim()) continue;
      let emb = null;
      try {
        const embText = [row.name, row.title, row.stated_sectors || '', (row.stated_specialisms || []).join(' '), row.certifications || '', row.location || ''].filter(Boolean).join(' ');
        emb = JSON.stringify(await embed(embText));
      } catch {}
      try {
        insertMember.run(
          uuid(), row.name.trim(), row.title?.trim() || 'Team Member',
          parseInt(row.years_experience) || 0,
          parseFloat(row.day_rate_client) || 0,
          parseFloat(row.day_rate_cost) || 0,
          row.availability || 'Available — Full time',
          JSON.stringify(row.stated_specialisms || []),
          row.stated_sectors || '',
          row.bio || '',
          COLORS[imported % COLORS.length],
          emb,
          row.certifications || '',
          row.email || '',
          row.location || '',
          row.languages || '',
          owner
        );
        imported++;
      } catch (e) { errors.push(`${row.name}: ${e.message}`); }
    }
    return res.status(200).json({ imported, errors });
  }

  // ── MULTIPART MODE: parse file → return preview rows ─────────────────────
  const tmpDir = path.join(process.cwd(), 'data', 'uploads', '_tmp');
  ensureDir(tmpDir);
  const form = formidable({ uploadDir: tmpDir, keepExtensions: true, maxFileSize: 20 * 1024 * 1024 });

  let files;
  try {
    [, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
    });
  } catch (e) { return res.status(400).json({ error: 'Upload failed: ' + e.message }); }

  const fileArr = files['file'];
  const uploaded = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  if (!uploaded?.filepath) return res.status(400).json({ error: 'No file received' });

  const ext = path.extname(uploaded.originalFilename || uploaded.filepath).toLowerCase();
  let rawRows = [];

  try {
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      rawRows = parseSpreadsheet(uploaded.filepath);
    } else {
      // Word/text — use parser then try to split into structured rows
      const { parseDocument } = require('../../../lib/parser');
      const text = await parseDocument(uploaded.filepath);
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      // Detect separator
      const testLine = lines.find(l => l.includes('\t') || l.includes(',') || l.includes('|')) || lines[0] || '';
      const sep = testLine.includes('\t') ? '\t' : testLine.includes('|') ? '|' : ',';
      const headers = lines[0]?.split(sep).map(h => h.trim()) || [];
      if (headers.length >= 2) {
        rawRows = lines.slice(1).map(line => {
          const vals = line.split(sep).map(v => v.trim());
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
        });
      }
    }
  } catch (e) {
    console.error('Import parse error:', e.message);
  }

  try { fs.unlinkSync(uploaded.filepath); } catch {}

  if (!rawRows.length) {
    return res.status(400).json({
      error: 'Could not extract rows from this file.',
      hint: 'Make sure the file has a header row and at least one data row. Supported: Excel, CSV, Word tables, or tab-separated text.',
    });
  }

  const keys = Object.keys(rawRows[0] || {});

  // ── COLUMN MAPPING ────────────────────────────────────────────────────────
  // 1. Try manual fuzzy matching first
  const colName     = findCol(keys, 'name', 'full name', 'fullname', 'person', 'staff', 'employee', 'consultant', 'resource');
  const colFirst    = findCol(keys, 'first name', 'firstname', 'forename', 'given name', 'first');
  const colLast     = findCol(keys, 'last name', 'lastname', 'surname', 'family name', 'last');
  const colSurname  = findCol(keys, 'surname');
  const colTitle    = findCol(keys, 'title', 'job title', 'role', 'job role', 'position', 'grade', 'level', 'designation');
  const colClient   = findCol(keys, 'client rate', 'charge rate', 'sell rate', 'day rate client', 'charge out', 'chargeable', 'fee', 'client day rate', 'rate');
  const colCost     = findCol(keys, 'cost rate', 'internal rate', 'cost day rate', 'day rate cost', 'internal', 'cost', 'salary');
  const colAvail    = findCol(keys, 'availability', 'available', 'status', 'resource status');
  const colYears    = findCol(keys, 'years experience', 'years exp', 'experience', 'exp', 'yrs', 'years');
  const colSectors  = findCol(keys, 'sectors', 'industry', 'industries', 'sector');
  const colSpecs    = findCol(keys, 'specialisms', 'skills', 'expertise', 'capabilities', 'competencies');
  const colBio      = findCol(keys, 'bio', 'biography', 'summary', 'profile', 'about');
  const colCert     = findCol(keys, 'certifications', 'certificates', 'qualifications', 'quals', 'accreditations', 'certified');
  const colEmail    = findCol(keys, 'email', 'email address', 'e-mail');
  const colLocation = findCol(keys, 'location', 'office', 'base', 'city', 'country', 'region');
  const colLanguage = findCol(keys, 'languages', 'language', 'spoken languages');

  // 2. If name column still unclear, try AI mapping
  let aiMapping = null;
  const hasName = colName || (colFirst && colLast) || (colFirst && colSurname);
  if (!hasName) {
    console.log('Team import: name column not found, trying AI mapping...');
    aiMapping = await aiMapColumns(keys, rawRows.slice(0, 3));
  }

  // 3. Resolve final column mapping from AI if manual failed
  const finalColName    = colName    || aiMapping?.full_name    || null;
  const finalColFirst   = colFirst   || aiMapping?.first_name   || null;
  const finalColLast    = colLast    || colSurname || aiMapping?.last_name    || null;
  const finalColTitle   = colTitle   || aiMapping?.job_title    || null;
  const finalColClient  = colClient  || aiMapping?.client_rate  || null;
  const finalColCost    = colCost    || aiMapping?.cost_rate    || null;
  const finalColAvail   = colAvail   || aiMapping?.availability || null;
  const finalColYears   = colYears   || aiMapping?.years_experience || null;
  const finalColSectors = colSectors || aiMapping?.sectors      || null;
  const finalColSpecs   = colSpecs   || aiMapping?.specialisms  || null;
  const finalColBio     = colBio     || aiMapping?.notes        || null;
  const finalColCert    = colCert    || aiMapping?.certifications || null;
  const finalColEmail   = colEmail   || aiMapping?.email         || null;
  const finalColLoc     = colLocation|| aiMapping?.location      || null;
  const finalColLang    = colLanguage|| aiMapping?.languages     || null;

  // Verify we can extract names
  if (!finalColName && !finalColFirst) {
    return res.status(400).json({
      error: 'Could not identify a Name column in this file.',
      columns_found: keys,
      hint: 'Add a column header called "Name", "Full Name", "First Name", or "Consultant". Column headers must be in the first row.',
    });
  }

  // ── BUILD PREVIEW ROWS ────────────────────────────────────────────────────
  const previewRows = rawRows.map(row => {
    const name = assembleName(row, finalColName, finalColFirst, finalColLast, null);
    if (!name || name.length < 2) return null;

    // Parse specialisms — might be comma-separated
    let specs = [];
    if (finalColSpecs) {
      const raw = cleanStr(row[finalColSpecs]);
      specs = raw ? raw.split(/[,;\/]/).map(s => s.trim()).filter(Boolean) : [];
    }

    return {
      name,
      title:            finalColTitle   ? cleanStr(row[finalColTitle])   : '',
      day_rate_client:  finalColClient  ? parseRate(row[finalColClient]) : '',
      day_rate_cost:    finalColCost    ? parseRate(row[finalColCost])   : '',
      availability:     finalColAvail   ? cleanStr(row[finalColAvail])   : 'Available — Full time',
      years_experience: finalColYears   ? parseYears(row[finalColYears]) : '',
      stated_sectors:   finalColSectors ? cleanStr(row[finalColSectors]) : '',
      stated_specialisms: specs,
      bio:              finalColBio     ? cleanStr(row[finalColBio])     : '',
      certifications:   finalColCert    ? cleanStr(row[finalColCert])    : '',
      email:            finalColEmail   ? cleanStr(row[finalColEmail])   : '',
      location:         finalColLoc     ? cleanStr(row[finalColLoc])     : '',
      languages:        finalColLang    ? cleanStr(row[finalColLang])    : '',
    };
  }).filter(Boolean);

  // Deduplicate
  const deduped = deduplicateRows(previewRows);
  const duplicatesRemoved = previewRows.length - deduped.length;

  return res.status(200).json({
    rows: deduped,
    columns_detected: {
      name: finalColName,
      first_name: finalColFirst,
      last_name: finalColLast,
      title: finalColTitle,
      client_rate: finalColClient,
      cost_rate: finalColCost,
      availability: finalColAvail,
      years: finalColYears,
      sectors: finalColSectors,
      specialisms: finalColSpecs,
      certifications: finalColCert,
      email: finalColEmail,
      location: finalColLoc,
      languages: finalColLang,
    },
    total_rows_in_file: rawRows.length,
    duplicates_removed: duplicatesRemoved,
    ai_mapping_used: !!aiMapping,
  });
}

export default requireAuth(handler);
