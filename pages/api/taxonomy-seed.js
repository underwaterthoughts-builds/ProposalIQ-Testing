import { getDb } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { v4 as uuid } from 'uuid';

const DEFAULTS = [
  ['Service Offering','Digital Transformation'],
  ['Service Offering','Data & Analytics'],
  ['Service Offering','Cloud Migration'],
  ['Service Offering','Software Development'],
  ['Service Offering','Managed Services'],
  ['Service Offering','Consultancy & Advisory'],
  ['Service Offering','Change Management'],
  ['Service Offering','Cybersecurity'],
  ['Service Offering','ERP & Systems Integration'],
  ['Service Offering','Infrastructure & Networks'],
  ['Service Offering','Film & Media Production'],
  ['Service Offering','Creative & Brand Production'],
  ['Service Offering','PR & Communications'],
  ['Service Offering','Research & Insight'],
  ['Service Offering','Recruitment & Staffing'],
  ['Sector','Government & Public Sector'],
  ['Sector','Healthcare & NHS'],
  ['Sector','Financial Services'],
  ['Sector','Aerospace & Defence'],
  ['Sector','Technology & Software'],
  ['Sector','Retail & Consumer'],
  ['Sector','Energy & Utilities'],
  ['Sector','Transport & Logistics'],
  ['Sector','Education & Skills'],
  ['Sector','Film & Creative Industries'],
  ['Sector','Charity & Third Sector'],
  ['Sector','Legal & Professional Services'],
];

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO taxonomy_items (id, name, category, is_default, sort_order) VALUES (?, ?, ?, 1, ?)');
  let added = 0;
  DEFAULTS.forEach(([cat, name], i) => {
    const result = insert.run(uuid(), name, cat, i + 1);
    if (result.changes) added++;
  });
  const all = db.prepare('SELECT * FROM taxonomy_items ORDER BY category, sort_order').all();
  return res.status(200).json({ added, total: all.length, items: all });
}

export default requireAuth(handler);
