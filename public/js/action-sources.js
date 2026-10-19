/*
 * Action ↔ emission-source mapping, shared by the browser (global AS), the export and the tests.
 *
 *   COMPONENTS   ECAM's first-level emission outputs per substage type, exactly the lists each
 *                <prefix>_KPI_GHG() adds up (vendor/ecam/backend/global.js). Several are parents of
 *                finer outputs (biog, slu, sludge), which are therefore never listed separately.
 *   SOURCES      explicit source types with their emission classification, its basis and review status
 *   ACTIONS      each Stage 2 rule → the problem it addresses and the sources/locations it acts on
 *
 * Classification is kept apart from input confirmation, evidence documents and scientific validation.
 * A source is classified only where an ECAM label and the ChatWater ECAM notes
 * (knowledge/ecam/ecam-overview.md) agree; everything else is null ("Classification pending review").
 * Open questions are listed in docs/action-clarity-review.md. Nothing here changes an estimate.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COMPONENTS = {
    wsa: ['elec', 'fuel'],
    wst: ['elec', 'fuel'],
    wsd: ['elec', 'fuel', 'trck'],
    wwc: ['elec', 'fuel', 'cso', 'col'],
    wwt: ['elec', 'fuel', 'tre', 'biog', 'dig_fuel', 'slu', 'reus_trck', 'disc'],
    wwo: ['elec', 'fuel', 'unt_opd', 'containment', 'tre', 'dis', 'biog', 'dig_fuel', 'sludge'],
  };

  // review: 'pending' until the team's scientific reviewer has checked the classification.
  const SOURCES = {
    grid_electricity: { classification: 'indirect', basis: 'ecam_output_label', review: 'pending' },
    fuel_engines: { classification: 'direct', basis: 'ecam_label_and_notes', review: 'pending' },
    treatment_process: { classification: 'direct', basis: 'ecam_label_and_notes', review: 'pending' },
    untreated_discharge: { classification: 'direct', basis: 'ecam_label_and_notes', review: 'pending' },
    effluent_discharge: { classification: 'direct', basis: 'ecam_label_and_notes', review: 'pending' },
    containment: { classification: null, basis: 'containment_control', review: 'pending' },
  };
  // ECAM output (prefix_component) → source type. Outputs not listed have no source type and no classification.
  const OUTPUT_SOURCE = {
    elec: 'grid_electricity', fuel: 'fuel_engines',
    wwc_cso: 'untreated_discharge', wwt_tre: 'treatment_process', wwt_disc: 'effluent_discharge', wwo_containment: 'containment',
  };
  function sourceOfOutput(prefix, component) {
    return OUTPUT_SOURCE[`${prefix}_${component}`] || OUTPUT_SOURCE[component] || null;
  }

  // at: 'substage' (the option's own substage), 'stages' (whole stages), 'utility' (the whole assessment).
  const ACTIONS = {
    pump_upgrade: { problem: 'pump_efficiency', sources: [{ source: 'grid_electricity', at: 'substage', component: 'elec' }] },
    pump_audit: { problem: 'pump_unknown', sources: [{ source: 'grid_electricity', at: 'substage', component: 'elec' }] },
    nrw_reduction: { problem: 'water_losses', sources: [{ source: 'grid_electricity', at: 'stages', stages: ['wsa', 'wst', 'wsd'], component: 'elec' }] },
    septic_desludging: { problem: 'containment', sources: [{ source: 'containment', at: 'substage', component: 'containment' }] },
    cso_reduction: { problem: 'untreated_discharge', sources: [{ source: 'untreated_discharge', at: 'substage', component: 'cso' }] },
    biogas_capture: { problem: 'treatment_ch4', sources: [{ source: 'treatment_process', at: 'substage', component: 'tre' }] },
    fuel_switch: { problem: 'fuel_use', sources: [{ source: 'fuel_engines', at: 'substage', component: 'fuel' }] },
    solar_pv: { problem: 'grid_use', sources: [{ source: 'grid_electricity', at: 'utility', component: 'elec' }] },
  };

  const keyParts = o => (o && o.key ? String(o.key).split('|') : []);
  /**
   * What an option addresses. Derived only from its rule, substage and key, so older saved options
   * (without new fields) resolve the same way. Unknown rules return { mapped: false }.
   */
  function describe(o) {
    // user-proposed actions are described by custom-actions.js and are never mapped or classified here
    if (!o || o.rule === 'baseline' || o.rule === 'custom' || o.origin === 'user') return null;
    const m = ACTIONS[o.rule];
    const [aid, , sid] = keyParts(o);
    const sub = o.substage || null;
    const where = s => s.at === 'substage'
      ? { at: 'substage', prefix: sub ? sub.prefix : null, sid: sid && sid !== 'utility' ? sid : null }
      : s.at === 'stages' ? { at: 'stages', stages: s.stages.slice() } : { at: 'utility' };
    if (!m) return { mapped: false, rule: o.rule, assessmentId: aid || null, problem: null, location: sub ? { at: 'substage', prefix: sub.prefix, sid: sid || null } : null, sources: [] };
    return {
      mapped: true, rule: o.rule, assessmentId: aid || null, problem: m.problem,
      location: sub ? { at: 'substage', prefix: sub.prefix, sid: sid && sid !== 'utility' ? sid : null } : where(m.sources[0]),
      sources: m.sources.map(s => ({ source: s.source, component: s.component, ...SOURCES[s.source], location: where(s) })),
    };
  }
  /** Distinct classifications of an option's sources; null stands for "pending review". */
  const classificationsOf = d => d && d.sources.length ? [...new Set(d.sources.map(s => s.classification || null))] : [null];

  // ------------------------------------------------------------ largest contributor
  const TIE = 1e-9;
  /**
   * rows: [{ prefix, sid, name, component, kg }] — one per substage and first-level component, kg null when
   * ECAM could not evaluate it. subTotals: [{ sid, kg }] — each substage's own <prefix>_KPI_GHG total.
   * total: the assessment's TotalGHG total. Parent totals are never added to their components.
   */
  function largestContributor(rows, subTotals, total) {
    const unavailable = rows.filter(r => r.kg == null || !Number.isFinite(r.kg));
    const ok = rows.filter(r => !unavailable.includes(r));
    // the breakdown is only used if every substage's components add up to its own total
    const mismatch = (subTotals || []).filter(st => {
      const parts = rows.filter(r => r.sid === st.sid);
      if (parts.some(r => unavailable.includes(r))) return false;
      const sum = parts.reduce((a, r) => a + r.kg, 0);
      return Math.abs(sum - (st.kg || 0)) > 1e-6 * Math.max(1, Math.abs(st.kg || 0));
    });
    if (mismatch.length) return { status: 'inconsistent', top: [], unavailable: unavailable.length };
    if (!(total > 0)) return { status: 'zero_total', top: [], unavailable: unavailable.length };
    const max = ok.reduce((m, r) => Math.max(m, r.kg), -Infinity);
    if (!(max > 0)) return { status: 'no_positive', top: [], unavailable: unavailable.length };
    const top = ok.filter(r => Math.abs(r.kg - max) <= TIE * max).map(r => {
      const src = sourceOfOutput(r.prefix, r.component);
      return { ...r, share: r.kg / total, source: src, classification: src ? SOURCES[src].classification : null };
    });
    return { status: 'ok', top, total, unavailable: unavailable.length };
  }
  /** Rows from engine.calculateOne() results; meta aligns substage IDs with the ECAM arrays. */
  function rowsFromResults(results, meta) {
    const count = {}, rows = [], subTotals = [];
    for (const s of results.substages) {
      const i = count[s.prefix] = (count[s.prefix] ?? -1) + 1;
      const sid = (meta && meta.substages && meta.substages[s.prefix] && meta.substages[s.prefix][i]) || `${s.prefix}#${i}`;
      subTotals.push({ sid, kg: s.ghg ? s.ghg.total : null });
      for (const c of COMPONENTS[s.prefix] || []) {
        const v = s.outputs[`${s.prefix}_KPI_GHG_${c}`];
        rows.push({ prefix: s.prefix, sid, name: s.name, component: c, kg: v && typeof v === 'object' ? v.total : null });
      }
    }
    return { rows, subTotals };
  }

  // ------------------------------------------------------------ sorting
  const MEASURES = { ghg: 'expected_kgco2', kwh: 'expected_kwh' };
  const quantified = v => typeof v === 'number' && Number.isFinite(v);
  // Placeholder figures stored by older versions without benefit_status (rule -> fields).
  const LEGACY_PLACEHOLDERS = { septic_desludging: ['kwh'] };
  /**
   * 'quantified' or 'not_quantified' for one benefit of an option (measure 'ghg'/'kgco2' or 'kwh').
   * Uses the option's benefit_status when present; otherwise a known placeholder or a missing number
   * counts as not quantified. A calculated zero stays quantified.
   */
  function benefitStatus(o, measure) {
    const key = measure === 'ghg' ? 'kgco2' : measure;
    const field = MEASURES[key === 'kgco2' ? 'ghg' : key];
    if (!o || !field) return 'not_quantified';
    const s = o.benefit_status && o.benefit_status[key];
    if (s === 'quantified' || s === 'not_quantified') return s;
    if ((LEGACY_PLACEHOLDERS[o.rule] || []).includes(key)) return 'not_quantified';
    return quantified(o[field]) ? 'quantified' : 'not_quantified';
  }
  const isQuantified = (o, measure) => benefitStatus(o, measure) === 'quantified';
  /**
   * Display order only: returns a new array of the same option objects. 'original' keeps the stored order.
   * The baseline stays first; quantified estimates (including calculated zeros) come before unquantified
   * ones; equal values keep their stored order.
   */
  function sortOptions(options, measure) {
    const list = (options || []).slice();
    const field = MEASURES[measure];
    if (!field) return list;
    const pos = new Map(list.map((o, i) => [o, i]));
    const rank = o => o.rule === 'baseline' ? 0 : isQuantified(o, measure) ? 1 : 2;
    return list.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b[field] - a[field] : 0) || pos.get(a) - pos.get(b));
  }

  return { COMPONENTS, SOURCES, ACTIONS, OUTPUT_SOURCE, sourceOfOutput, describe, classificationsOf, largestContributor, rowsFromResults, sortOptions, MEASURES, quantified, benefitStatus, isQuantified };
});
