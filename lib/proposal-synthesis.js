// Synthesise project-level metadata from N per-document analyses.
// Each project_files row carries its own subtype-specific ai_metadata;
// this function rolls them up into the unified project.ai_metadata
// shape that the repository UI already reads.
//
// Conventions:
//   - The main_proposal analysis is the spine — its scoring and
//     narrative fields drive the project-level scores.
//   - Other subtypes contribute *additive* facts: more methodologies,
//     more named clients, more technologies, more team members.
//   - Conflicts (commercial says X, technical says not-X) are surfaced
//     as a synthesis_conflicts array, not silently arbitrated.
//   - Assumptions are rolled up into a single project-level list with
//     each item tagged by source_file and source_subtype.

function uniqMerge(existing, additions) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(x => String(x).toLowerCase().trim()));
  for (const a of (additions || [])) {
    const k = String(a).toLowerCase().trim();
    if (k && !seen.has(k)) { out.push(a); seen.add(k); }
  }
  return out;
}

function synthesiseProject(perDocAnalyses) {
  // perDocAnalyses: array of { filename, subtype, analysis }
  const main = perDocAnalyses.find(d => d.subtype === 'main_proposal' && d.analysis && !d.analysis._error)?.analysis || {};
  const result = { ...main };

  // ── Roll up per-doc fields into the project-level shape ────────────
  for (const d of perDocAnalyses) {
    const a = d.analysis;
    if (!a || a._error) continue;
    if (d.subtype === 'main_proposal') continue;

    if (Array.isArray(a.methodologies)) {
      result.methodologies = uniqMerge(result.methodologies, a.methodologies);
    }
    if (Array.isArray(a.named_frameworks)) {
      result.methodologies = uniqMerge(result.methodologies, a.named_frameworks);
    }
    if (Array.isArray(a.tools_technologies)) {
      result.tools_technologies = uniqMerge(result.tools_technologies, a.tools_technologies);
    }
    if (Array.isArray(a.named_outcomes)) {
      result.value_propositions = uniqMerge(result.value_propositions, a.named_outcomes);
    }

    // CV / case-study contributors → named past clients
    if (Array.isArray(a.named_past_clients)) {
      result.named_past_clients = uniqMerge(result.named_past_clients, a.named_past_clients);
    }
    if (a.client_name) {
      result.named_past_clients = uniqMerge(result.named_past_clients, [a.client_name]);
    }

    // Cover-letter → win themes feed key_themes
    if (Array.isArray(a.win_themes)) {
      result.key_themes = uniqMerge(result.key_themes, a.win_themes);
    }
  }

  // ── Roll up assumptions, tagging by source ─────────────────────────
  const assumptions = [];
  for (const d of perDocAnalyses) {
    const a = d.analysis;
    if (!a || a._error) continue;
    if (Array.isArray(a.assumptions)) {
      for (const item of a.assumptions) {
        if (!item?.text) continue;
        assumptions.push({
          text: item.text,
          category: item.category || 'other',
          risk_level: item.risk_level || 'lo',
          source_file: d.filename || null,
          source_subtype: d.subtype,
        });
      }
    }
  }
  if (assumptions.length) result.assumptions = assumptions;

  // ── Pricing — prefer the dedicated schedule, fall back to commercial ─
  const pricingDoc = perDocAnalyses.find(d => d.subtype === 'pricing_schedule' && d.analysis && !d.analysis._error)?.analysis;
  const commercialDoc = perDocAnalyses.find(d => d.subtype === 'commercial_proposal' && d.analysis && !d.analysis._error)?.analysis;
  const cv = pricingDoc?.contract_value ?? commercialDoc?.contract_value ?? null;
  const ccy = pricingDoc?.currency ?? commercialDoc?.currency ?? null;
  if (cv != null) result.contract_value = cv;
  if (ccy)        result.currency = ccy;
  if (pricingDoc?.pricing_structure || commercialDoc?.pricing_structure) {
    result.pricing_structure = pricingDoc?.pricing_structure || commercialDoc?.pricing_structure;
  }

  // ── Surface conflicts. Cheap heuristic for v1: pricing structure
  //    declared differently in commercial vs schedule, or contract_value
  //    declared differently. The synthesis prompt could go further later,
  //    but these are the most common real conflicts.
  const conflicts = [];
  if (pricingDoc?.contract_value != null && commercialDoc?.contract_value != null) {
    const a = Number(pricingDoc.contract_value);
    const b = Number(commercialDoc.contract_value);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) / Math.max(a, b) > 0.02) {
      conflicts.push({
        kind: 'contract_value_mismatch',
        detail: `Pricing schedule: ${a} ${pricingDoc.currency || ''} vs commercial: ${b} ${commercialDoc.currency || ''}`,
        sources: ['pricing_schedule', 'commercial_proposal'],
      });
    }
  }
  if (pricingDoc?.pricing_structure && commercialDoc?.pricing_structure
      && pricingDoc.pricing_structure !== commercialDoc.pricing_structure
      && pricingDoc.pricing_structure !== 'unknown' && commercialDoc.pricing_structure !== 'unknown') {
    conflicts.push({
      kind: 'pricing_structure_mismatch',
      detail: `Pricing schedule: ${pricingDoc.pricing_structure} vs commercial: ${commercialDoc.pricing_structure}`,
      sources: ['pricing_schedule', 'commercial_proposal'],
    });
  }
  if (conflicts.length) result.synthesis_conflicts = conflicts;

  // ── Document inventory for the UI to render groupings ──────────────
  result._documents = perDocAnalyses.map(d => ({
    filename: d.filename,
    subtype: d.subtype,
    summary: d.analysis?.summary || null,
    error: d.analysis?._error || null,
  }));

  return result;
}

module.exports = { synthesiseProject };
