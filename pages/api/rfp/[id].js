import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { safe } from '../../../lib/embeddings';
import { inferTaxonomyFromProposal } from '../../../lib/taxonomy';
import { getProjectUsageStats } from '../../../lib/feedback';

// Compute tier label for a single match against the RFP's taxonomy.
// Mirrors lib/embeddings.js taxonomyTier so existing scans benefit from
// the inference fallback without needing a re-scan.
function computeTier(match, rfpClient, rfpService) {
  let propClient = match.client_industry || null;
  let propService = match.service_industry || null;
  let inferred = !!match.taxonomy_inferred;

  if (!propClient || !propService) {
    const inf = inferTaxonomyFromProposal(match);
    if (!propClient && inf.client_industry) { propClient = inf.client_industry; inferred = true; }
    if (!propService && inf.service_industry) { propService = inf.service_industry; inferred = true; }
  }

  if (!rfpClient && !rfpService) return { tier: 4, label: 'untagged', inferred, propClient, propService };
  if (!propClient && !propService) return { tier: 4, label: 'untagged', inferred, propClient, propService };

  const clientMatch = propClient && rfpClient && propClient === rfpClient;
  const serviceMatch = propService && rfpService && propService === rfpService;

  if (clientMatch && serviceMatch) return { tier: 1, label: 'full', inferred, propClient, propService };
  if (clientMatch) return { tier: 2, label: 'client', inferred, propClient, propService };
  if (serviceMatch) return { tier: 3, label: 'service', inferred, propClient, propService };
  return { tier: 5, label: 'cross', inferred, propClient, propService };
}

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

    // Recompute tier on read so existing scans benefit from improved
    // inference logic without a re-scan. The RFP's taxonomy comes from
    // the scan row itself; proposal taxonomy either comes from the saved
    // match data or is inferred from text on the fly.
    const rfpClient = scan.client_industry || null;
    const rfpService = scan.service_industry || null;
    const rawMatches = safe(scan.matched_proposals, []).filter(p => !suppressed.has(p.id));
    // Wave 3 — load feedback stats once and stamp them on each match so
    // existing scans show "used in N winning bids" badges immediately.
    const usageStats = getProjectUsageStats(db);
    const matchedProposals = rawMatches.map(p => {
      const tier = computeTier(p, rfpClient, rfpService);
      const stats = usageStats.get(p.id);
      return {
        ...p,
        taxonomy_tier: tier.tier,
        taxonomy_match: tier.label,
        taxonomy_inferred: tier.inferred,
        client_industry: tier.propClient || p.client_industry || null,
        service_industry: tier.propService || p.service_industry || null,
        used_count: stats?.used_count || p.used_count || 0,
        won_count: stats?.won_count || p.won_count || 0,
      };
    }).sort((a, b) => {
      // Tier asc first, then by match_score desc within tier.
      if (a.taxonomy_tier !== b.taxonomy_tier) return a.taxonomy_tier - b.taxonomy_tier;
      return (b.match_score || 0) - (a.match_score || 0);
    });

    return res.status(200).json({
      scan: {
        ...scan,
        rfp_data: safe(scan.rfp_data, {}),
        matched_proposals: matchedProposals,
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
        executive_brief: safe(scan.executive_brief, null),
      },
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (body.action === 'update_taxonomy') {
      // Update the scan's taxonomy classification (user correction)
      const updates = [];
      const params = [];
      if ('client_industry' in body) { updates.push('client_industry = ?'); params.push(body.client_industry || null); }
      if ('service_industry' in body) { updates.push('service_industry = ?'); params.push(body.service_industry || null); }
      if ('client_sectors' in body) { updates.push('client_sectors = ?'); params.push(JSON.stringify(body.client_sectors || [])); }
      if ('service_sectors' in body) { updates.push('service_sectors = ?'); params.push(JSON.stringify(body.service_sectors || [])); }
      if (updates.length > 0) {
        db.prepare(`UPDATE rfp_scans SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
      }
      return res.status(200).json({ ok: true });
    }

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
