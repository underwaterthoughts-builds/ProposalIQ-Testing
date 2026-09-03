import { v4 as uuid } from 'uuid';
import { getDb } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { canAccess } from '../../../lib/tenancy';
import { parseJsonField } from '../../../lib/embeddings';
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

// Deterministic bid-score recompute when the user marks risks as covered.
// Each covered risk awards +5 to the composite (capped at 95) and +8 to
// the gapScore component so the breakdown UI reflects the improved gap
// position. Decision/confidence/colour re-derive from the new composite
// using the same thresholds as scoreBid (lib/gemini.js).
function recomputeBidScoreWithCovers(currentScore, coveredCount) {
  if (!currentScore || typeof currentScore !== 'object') return null;
  const bonus = (coveredCount || 0) * 5;
  const baseScore = currentScore.base_score ?? currentScore.score ?? 0;
  const newComposite = Math.min(95, Math.round(baseScore + bonus));
  const components = currentScore.components || {};
  const newGapScore = Math.min(100, Math.round((components.gapScore || 0) + (coveredCount * 8)));

  let decision, confidence, colour;
  if (newComposite >= 65) {
    decision = 'Bid';
    confidence = newComposite >= 80 ? 'high' : 'medium';
    colour = '#3d5c3a';
  } else if (newComposite >= 45) {
    decision = 'Conditional Bid';
    confidence = 'medium';
    colour = '#b8962e';
  } else {
    decision = 'No Bid';
    confidence = newComposite < 30 ? 'high' : 'medium';
    colour = '#b04030';
  }

  return {
    ...currentScore,
    base_score: baseScore,
    score: newComposite,
    decision,
    confidence,
    colour,
    components: { ...components, gapScore: newGapScore },
    covered_bonus: bonus,
  };
}

function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  // Tenant gate — every method on this endpoint targets a specific scan,
  // so enforce ownership once up front.
  const ownerRow = db.prepare('SELECT owner_user_id FROM rfp_scans WHERE id = ?').get(id);
  if (!ownerRow || !canAccess(req.user, ownerRow)) {
    return res.status(404).json({ error: 'Not found' });
  }

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
    const rawMatches = parseJsonField(scan.matched_proposals, []).filter(p => !suppressed.has(p.id));
    // Wave 3 — load feedback stats once and stamp them on each match so
    // existing scans show "used in N winning bids" badges immediately.
    // Tenant-scoped: a member's "used in winning bids" badge counts only
    // their own past scans, never another tenant's.
    const { isAdmin } = require('../../../lib/tenancy');
    const feedbackOwner = isAdmin(req.user) ? null : req.user.id;
    const usageStats = getProjectUsageStats(db, feedbackOwner);
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

    // Partnership-bid attachments (empty arrays when not a partnership bid)
    let bidPartners = [], bidCvs = [];
    try {
      bidPartners = db.prepare('SELECT id, name, capabilities, website FROM rfp_scan_partners WHERE scan_id = ?').all(id);
      bidCvs = db.prepare('SELECT id, person_name, original_name FROM rfp_scan_cvs WHERE scan_id = ?').all(id);
    } catch (e) { console.error('[rfp] bid team load failed:', e.message); }

    return res.status(200).json({
      scan: {
        ...scan,
        bid_partners: bidPartners,
        bid_cvs: bidCvs,
        rfp_data: parseJsonField(scan.rfp_data, {}),
        matched_proposals: matchedProposals,
        gaps: parseJsonField(scan.gaps, []),
        news: parseJsonField(scan.news, []),
        team_suggestions: parseJsonField(scan.team_suggestions, []),
        financial_model: parseJsonField(scan.financial_model, {}),
        coverage: parseJsonField(scan.coverage, {}),
        narrative_advice: narrativeText,
        writing_insights: writingInsights,
        suppressed_ids: [...suppressed],
        annotations,
        suggested_approach: parseJsonField(scan.suggested_approach, null),
        win_strategy: parseJsonField(scan.win_strategy, null),
        winning_language: parseJsonField(scan.winning_language, []),
        bid_score: parseJsonField(scan.bid_score, null),
        executive_brief: parseJsonField(scan.executive_brief, null),
        coverage_map: parseJsonField(scan.coverage_map, null),
        covered_risks: parseJsonField(scan.covered_risks, []),
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

    // "We have this" — user marks a brief-listed risk as already covered.
    // Scope 'scan' adds it to this scan only; 'org' also persists to the
    // user's organisation_profile.covered_capabilities so future scans
    // pre-mark matching risks. Either scope triggers a deterministic
    // bid_score recompute (see recomputeBidScoreWithCovers below).
    if (body.action === 'cover_risk') {
      const riskText = (body.risk || '').trim();
      if (!riskText) return res.status(400).json({ error: 'risk text required' });
      const scope = body.scope === 'org' ? 'org' : 'scan';
      const mitigation = body.mitigation || null;

      // Append to scan.covered_risks (de-duplicating by risk text)
      const scan = db.prepare('SELECT covered_risks, bid_score FROM rfp_scans WHERE id = ?').get(id);
      const existing = parseJsonField(scan?.covered_risks, []);
      if (!existing.find(r => r.risk === riskText)) {
        existing.push({ risk: riskText, mitigation, scope, covered_at: new Date().toISOString() });
        db.prepare('UPDATE rfp_scans SET covered_risks = ? WHERE id = ?').run(JSON.stringify(existing), id);
      }

      // If org-scope, also save to organisation_profile.
      if (scope === 'org' && req.user?.id) {
        try {
          const op = db.prepare('SELECT covered_capabilities FROM organisation_profile WHERE user_id = ?').get(req.user.id);
          if (op) {
            const orgCovered = parseJsonField(op.covered_capabilities, []);
            if (!orgCovered.find(c => c.capability === riskText)) {
              orgCovered.push({
                capability: riskText, source_risk: riskText,
                source_scan_id: id, covered_at: new Date().toISOString(),
              });
              db.prepare('UPDATE organisation_profile SET covered_capabilities = ? WHERE user_id = ?')
                .run(JSON.stringify(orgCovered), req.user.id);
            }
          }
        } catch (e) {
          console.error('cover_risk org persist failed:', e.message);
        }
      }

      // Recompute bid score: +5 composite per covered risk, capped at 95.
      const newScore = recomputeBidScoreWithCovers(parseJsonField(scan?.bid_score, null), existing.length);
      if (newScore) {
        db.prepare('UPDATE rfp_scans SET bid_score = ? WHERE id = ?').run(JSON.stringify(newScore), id);
      }
      return res.status(200).json({ ok: true, covered_count: existing.length, bid_score: newScore });
    }

    if (body.action === 'uncover_risk') {
      const riskText = (body.risk || '').trim();
      if (!riskText) return res.status(400).json({ error: 'risk text required' });
      const scan = db.prepare('SELECT covered_risks, bid_score FROM rfp_scans WHERE id = ?').get(id);
      const remaining = parseJsonField(scan?.covered_risks, []).filter(r => r.risk !== riskText);
      db.prepare('UPDATE rfp_scans SET covered_risks = ? WHERE id = ?').run(JSON.stringify(remaining), id);
      // If org-scope was used, remove from organisation_profile too — undo
      // is symmetrical, so the org-level memory disappears as well.
      if (req.user?.id) {
        try {
          const op = db.prepare('SELECT covered_capabilities FROM organisation_profile WHERE user_id = ?').get(req.user.id);
          if (op) {
            const orgCovered = parseJsonField(op.covered_capabilities, []).filter(c => c.capability !== riskText);
            db.prepare('UPDATE organisation_profile SET covered_capabilities = ? WHERE user_id = ?')
              .run(JSON.stringify(orgCovered), req.user.id);
          }
        } catch {}
      }
      const newScore = recomputeBidScoreWithCovers(parseJsonField(scan?.bid_score, null), remaining.length);
      if (newScore) {
        db.prepare('UPDATE rfp_scans SET bid_score = ? WHERE id = ?').run(JSON.stringify(newScore), id);
      }
      return res.status(200).json({ ok: true, covered_count: remaining.length, bid_score: newScore });
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
    // Delete partnership-bid CV files from disk before dropping their rows
    try {
      const fs = require('fs');
      const path = require('path');
      const cvRows = db.prepare('SELECT filename FROM rfp_scan_cvs WHERE scan_id = ?').all(id);
      for (const r of cvRows) {
        const p = path.join(process.cwd(), 'data', 'uploads', 'rfp_scans', r.filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    } catch (e) { console.error('[rfp] CV cleanup failed:', e.message); }
    // Delete from DB (suppressions cascade)
    db.prepare('DELETE FROM rfp_scan_suppressions WHERE scan_id = ?').run(id);
    db.prepare('DELETE FROM rfp_scan_annotations WHERE scan_id = ?').run(id);
    try {
      db.prepare('DELETE FROM rfp_scan_partners WHERE scan_id = ?').run(id);
      db.prepare('DELETE FROM rfp_scan_cvs WHERE scan_id = ?').run(id);
    } catch {}
    db.prepare('DELETE FROM rfp_scans WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

export default requireAuth(handler);
