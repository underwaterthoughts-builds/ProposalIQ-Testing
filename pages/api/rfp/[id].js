import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { safe } from '../../../lib/embeddings';

function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  if (req.method === 'GET') {
    const scan = db.prepare('SELECT * FROM rfp_scans WHERE id = ?').get(id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const suppressedRows = db.prepare('SELECT project_id FROM rfp_scan_suppressions WHERE scan_id = ?').all(id);
    const suppressed = new Set(suppressedRows.map(r => r.project_id));
    const annotations = db.prepare('SELECT * FROM rfp_scan_annotations WHERE scan_id = ? ORDER BY created_at').all(id);

    // narrative_advice may be plain string or JSON object { text, writing_insights }
    let narrativeText = '';
    let writingInsights = [];
    try {
      const parsed = JSON.parse(scan.narrative_advice);
      if (parsed && typeof parsed === 'object') {
        narrativeText = parsed.text || '';
        writingInsights = parsed.writing_insights || [];
      } else {
        narrativeText = scan.narrative_advice || '';
      }
    } catch {
      narrativeText = scan.narrative_advice || '';
    }

    return res.status(200).json({
      scan: {
        ...scan,
        rfp_data: safe(scan.rfp_data, {}),
        matched_proposals: safe(scan.matched_proposals, []).filter(p => !suppressed.has(p.id)),
        gaps: safe(scan.gaps, []),
        news: safe(scan.news, []),
        team_suggestions: safe(scan.team_suggestions, []),
        financial_model: safe(scan.financial_model, {}),
        coverage: safe(scan.coverage, {}),
        narrative_advice: narrativeText,
        writing_insights: writingInsights,
        suppressed_ids: [...suppressed],
        annotations,
        suggested_approach: safe(scan.suggested_approach, null),
        win_strategy: safe(scan.win_strategy, null),
        winning_language: safe(scan.winning_language, []),
        bid_score: safe(scan.bid_score, null),
      },
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (body.action === 'suppress') {
      db.prepare('INSERT OR IGNORE INTO rfp_scan_suppressions (scan_id, project_id) VALUES (?, ?)').run(id, body.project_id);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'unsuppress') {
      db.prepare('DELETE FROM rfp_scan_suppressions WHERE scan_id = ? AND project_id = ?').run(id, body.project_id);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'annotate') {
      db.prepare(
        'INSERT INTO rfp_scan_annotations (id, scan_id, section, content, created_by) VALUES (?, ?, ?, ?, ?)'
      ).run(uuid(), id, body.section || 'general', body.content, req.user?.id || 'guest');
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method === 'DELETE') {
    const scan = db.prepare('SELECT rfp_filename FROM rfp_scans WHERE id = ?').get(id);
    if (!scan) return res.status(404).json({ error: 'Not found' });
    // Delete the uploaded file
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans', scan.rfp_filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
    // Delete from DB (suppressions cascade)
    db.prepare('DELETE FROM rfp_scan_suppressions WHERE scan_id = ?').run(id);
    db.prepare('DELETE FROM rfp_scan_annotations WHERE scan_id = ?').run(id);
    db.prepare('DELETE FROM rfp_scans WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
