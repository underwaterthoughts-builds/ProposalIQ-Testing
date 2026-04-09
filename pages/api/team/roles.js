import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureDir } from '../../../lib/storage';
import { v4 as uuid } from 'uuid';
import XLSX from 'xlsx';

export const config = { api: { bodyParser: false } };

function parseRate(v) {
  if (!v && v !== 0) return 0;
  const s = String(v).replace(/[£$€,\s]/g, '').replace(/\/day|\/d|pd|per day/gi, '').trim();
  return parseFloat(s) || 0;
}

function cleanStr(v) { return String(v ?? '').trim(); }

function findCol(keys, ...candidates) {
  const norm = s => s.toLowerCase().replace(/[\s_\-\/().]/g, '');
  for (const c of candidates) {
    const cn = norm(c);
    const exact = keys.find(k => norm(k) === cn);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const cn = norm(c);
    const partial = keys.find(k => norm(k).includes(cn) || cn.includes(norm(k)));
    if (partial) return partial;
  }
  return null;
}

async function handler(req, res) {
  const db = getDb();

  // GET — list all roles
  if (req.method === 'GET') {
    const roles = db.prepare('SELECT * FROM rate_card_roles ORDER BY category, sort_order, role_name').all();
    return res.status(200).json({ roles });
  }

  // DELETE — remove a role
  if (req.method === 'DELETE') {
    const body = await new Promise(resolve => {
      let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    if (body.ids?.length) {
      const stmt = db.prepare('DELETE FROM rate_card_roles WHERE id = ?');
      body.ids.forEach(id => stmt.run(id));
      return res.status(200).json({ deleted: body.ids.length });
    }
    return res.status(400).json({ error: 'ids required' });
  }

  // PATCH — update a single role
  if (req.method === 'PATCH') {
    const body = await new Promise(resolve => {
      let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const allowed = ['role_name','grade','category','day_rate_client','day_rate_cost','currency','notes'];
    const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
    const sql = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE rate_card_roles SET ${sql} WHERE id = ?`).run(...updates.map(([,v]) => v), id);
    return res.status(200).json({ ok: true });
  }

  // POST — either JSON (single/bulk add) or multipart (file upload preview)
  if (req.method !== 'POST') return res.status(405).end();

  const contentType = req.headers['content-type'] || '';

  // JSON mode — add rows directly
  if (contentType.includes('application/json')) {
    const body = await new Promise(resolve => {
      let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    const rows = body.rows || [];
    if (!rows.length) return res.status(400).json({ error: 'No rows' });

    const insert = db.prepare(`INSERT OR REPLACE INTO rate_card_roles
      (id, role_name, grade, category, day_rate_client, day_rate_cost, currency, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    let imported = 0;
    for (const row of rows) {
      if (!row.role_name?.trim()) continue;
      insert.run(uuid(), row.role_name.trim(), row.grade || '', row.category || '',
        parseRate(row.day_rate_client), parseRate(row.day_rate_cost),
        row.currency || 'GBP', row.notes || '', imported);
      imported++;
    }
    return res.status(200).json({ imported });
  }

  // Multipart — parse file, return preview rows
  const tmpDir = path.join(process.cwd(), 'data', 'uploads', '_tmp');
  ensureDir(tmpDir);
  const form = formidable({ uploadDir: tmpDir, keepExtensions: true, maxFileSize: 10 * 1024 * 1024 });
  let files;
  try {
    [, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => { if (err) reject(err); else resolve([f, fi]); });
    });
  } catch (e) { return res.status(400).json({ error: 'Upload failed' }); }

  const fileArr = files['file'];
  const uploaded = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  if (!uploaded?.filepath) return res.status(400).json({ error: 'No file received' });

  let rawRows = [];
  try {
    const wb = XLSX.readFile(uploaded.filepath, { raw: false });
    // Try each sheet, pick largest
    let best = null, bestCount = 0;
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
      if (rows.length > bestCount) { best = rows; bestCount = rows.length; }
    }
    rawRows = best || [];
  } catch (e) { console.error('Roles import parse:', e.message); }
  try { fs.unlinkSync(uploaded.filepath); } catch {}

  if (!rawRows.length) return res.status(400).json({ error: 'Could not read file. Use Excel (.xlsx) or CSV.' });

  const keys = Object.keys(rawRows[0] || {});

  const colRole     = findCol(keys, 'role', 'role name', 'job title', 'title', 'position', 'name', 'job role', 'resource type', 'resource');
  const colGrade    = findCol(keys, 'grade', 'band', 'level', 'seniority', 'tier');
  const colCategory = findCol(keys, 'category', 'department', 'practice', 'team', 'stream', 'group', 'type');
  const colClient   = findCol(keys, 'client rate', 'charge rate', 'sell rate', 'client day rate', 'day rate client', 'charge out', 'rate', 'fee', 'client');
  const colCost     = findCol(keys, 'cost rate', 'internal rate', 'cost day rate', 'day rate cost', 'cost', 'internal', 'salary');
  const colCurrency = findCol(keys, 'currency', 'ccy');
  const colNotes    = findCol(keys, 'notes', 'comments', 'description', 'info');

  if (!colRole) return res.status(400).json({
    error: 'Could not find a Role/Title column.',
    columns_found: keys,
    hint: 'Make sure your file has a column called "Role", "Job Title", "Position", or "Resource Type".',
  });

  const previewRows = rawRows.map(row => ({
    role_name:       cleanStr(row[colRole]),
    grade:           colGrade    ? cleanStr(row[colGrade])    : '',
    category:        colCategory ? cleanStr(row[colCategory]) : '',
    day_rate_client: colClient   ? parseRate(row[colClient])  : '',
    day_rate_cost:   colCost     ? parseRate(row[colCost])    : '',
    currency:        colCurrency ? cleanStr(row[colCurrency]) : 'GBP',
    notes:           colNotes    ? cleanStr(row[colNotes])    : '',
  })).filter(r => r.role_name);

  // Deduplicate by role_name + grade
  const seen = new Set();
  const deduped = previewRows.filter(r => {
    const key = `${r.role_name}|${r.grade}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  return res.status(200).json({
    rows: deduped,
    columns_detected: { role: colRole, grade: colGrade, category: colCategory, client_rate: colClient, cost_rate: colCost },
    total_rows: rawRows.length,
    duplicates_removed: previewRows.length - deduped.length,
  });
}

export default requireAuth(handler);
