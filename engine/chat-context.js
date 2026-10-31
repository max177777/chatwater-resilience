/*
 * Bounded context for the ChatWater assistant: what the chat may treat as facts
 * about the current assessment.
 *
 * Everything is re-derived on the server from what the browser sends: results and
 * calculated options are recalculated with ECAM, linked actions, plan and proposal
 * are checked against the assessment ID, and freshness uses the same rules as
 * exports (cw-core freshness). Items from another assessment are dropped and
 * reported, never merged. The whole project is never sent: only the stage, the
 * focused item and short summaries, capped in size.
 */
const CW = require('../public/js/cw-core');
const CA = require('../public/js/custom-actions');
const AS = require('../public/js/action-sources');
const engine = require('./ecam-engine');
const AV = require('./assessment-validity');
const { suggestActions } = require('./actions');
const I = require('./integrity');
const knowledge = require('./knowledge');
const library = require('./library');
const R = require('./retrieval');
const GUIDE = require('../frameworks/stage-guidance.json');
const GUIDE_ID = require('../frameworks/stage-guidance.id.json');
const RS = require('../public/js/responsibility');
const SN = require('../public/js/source-notes');
const pathways = require('./pathways');
const { TITLES_ID, GUIDE_ID: STAGE3_ID } = require('./plan-concept');

// Includes the independent water-balance facts and one copy of provisional calculation warnings.
const TEXT_LIMIT = 14000;
const t1 = kg => (kg == null || !Number.isFinite(kg) ? null : +(kg / 1000).toFixed(1));
const pct = (a, b) => (b > 0 && Number.isFinite(a) ? +(100 * a / b).toFixed(1) : null);
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const L = (o, lang) => (o && typeof o === 'object') ? (o[lang] || o.en || '') : (o || '');
const STAGE_OF_VIEW = v => (/^assess/.test(v) ? 1 : /^actions/.test(v) ? 2 : /^plan/.test(v) ? 3 : /^finance/.test(v) ? 4 : null);
const PREFIXES = CW.STAGE_KEYS.map(([p]) => p);
const label = code => knowledge.describe(code).descr || code;
const CLASS_TEXT = c => c || 'pending review (not classified)';

function sidMap(meta) {
  const out = new Map();
  for (const [prefix, list] of Object.entries((meta && meta.substages) || {})) (list || []).forEach((sid, index) => sid && out.set(sid, { prefix, index }));
  return out;
}

/** Stage 2 framework rows for a rule, a source type or a stage prefix (team draft, awaiting review). */
function frameworkRows({ rule, prefix, source }, max = 3, lang = 'en') {
  const rows = GUIDE.stage2.filter(r => r.links && (
    (rule && r.links.rules.includes(rule) && (!prefix || r.links.stages.includes(prefix))) ||
    (!rule && prefix && r.links.stages.includes(prefix) && (!source || r.links.source === source))));
  return rows.slice(0, max).map(r => {
    const tr = lang === 'id' ? GUIDE_ID.stage2[r.id] : null;
    return { id: r.id, kind: r.kind, title: tr?.output || r.output, questions: tr?.questions || r.questions, actions: tr?.actions || r.actions,
      ...(lang !== 'en' && !tr ? { original_language: 'en' } : {}) };
  });
}

/** Stage 3 planning areas in the output language; areas without a translation keep the English text and say so. */
function stage3Rows(lang) {
  return GUIDE.stage3.map((x, i) => {
    const tr = lang === 'id' ? STAGE3_ID[i] : null;
    const questions = tr?.questions || x.questions;
    return { area: x.n, title: (lang === 'id' && TITLES_ID[i]) || x.title, description: tr?.description || x.description, questions,
      ...(lang === 'id' && !tr?.questions && (x.questions || []).length ? { questions_language: 'en' } : {}) };
  });
}

/**
 * build(body) → { context, text }
 * body: { lang, view, question, assessment, meta, gwpIndex, focus, inputStatus, actionLabels, actionSet,
 *         selectedActions, customActions, actionNotes, plan, proposal, profile, financing, otherAssessments }
 * focus: { kind: 'general'|'result'|'input'|'action'|'missing'|'plan'|'proposal_section', intent, prefix, sid, code, key, index }
 */
function build(body = {}) {
  const lang = body.lang === 'id' ? 'id' : 'en';
  const view = String(body.view || '');
  const focus = body.focus && typeof body.focus === 'object' ? body.focus : { kind: 'general' };
  const ctx = {
    schema: 1, view, stage: STAGE_OF_VIEW(view), output_language: lang,
    assessment: null, focus: { kind: focus.kind || 'general', intent: focus.intent || null, ok: true },
    results: null, focus_detail: null, missing: [], actions: null, plan: null, proposal: null,
    freshness: {}, problems: [], problem_codes: [], framework: null, mentions_other: [],
    responsibility: null, inputs: null, concept: null, pathways: null,
  };
  const { assessment, meta } = body;
  if (!assessment || !meta || !meta.id) {
    addProblem(ctx, 'no_assessment', 'No assessment was sent, so the chat has no project data. Answers can only use the document library.');
    return finish(ctx, focus, lang);
  }
  const validity = AV.validate(assessment, {meta,inputStatus:body.inputStatus});
  if (!assessment?.General || !validity.substages?.length || validity.issues.some(x=>/^AssessmentPeriod/.test(x.code))) {
    ctx.assessment = {id:meta.id,name:assessment.General?.Name || null};
    ctx.results = {availability:'not_assessed', validity};
    addProblem(ctx,'invalid_assessment','Assessment is a draft. Results and actions are unavailable until its inputs are corrected.');
    return finish(ctx,focus,lang);
  }
  const gwpIndex = body.gwpIndex || 0;
  let r;
  try { r = AV.calculate(assessment, gwpIndex, {meta,inputStatus:body.inputStatus}); } catch (e) {
    addProblem(ctx, 'calc_failed', 'The assessment could not be calculated, so no results are available.');
    ctx.assessment = { id: meta.id, name: assessment.General?.Name || null };
    return finish(ctx, focus, lang);
  }
  const revision = CW.revision(assessment);
  ctx.assessment = {
    id: meta.id, name: r.name, country: r.country, period: r.period, gwp_report: r.gwp.report, revision,
    grid_factor_kgco2_per_kwh: r.factors.conv_kwh_co2,
  };
  const sids = sidMap(meta);
  const sidAt = (prefix, index) => (meta.substages?.[prefix] || [])[index] || null;

  // ---------------------------------------------------------------- results (recalculated)
  const total = r.totals.total;
  const subs = [];
  const count = {};
  for (const s of r.substages) {
    const index = count[s.prefix] = (count[s.prefix] ?? -1) + 1;
    const comps = (AS.COMPONENTS[s.prefix] || []).map(c => {
      const v = s.outputs[`${s.prefix}_KPI_GHG_${c}`];
      const kg = v && typeof v === 'object' ? v.total : null;
      const src = AS.sourceOfOutput(s.prefix, c);
      return { component: c, tco2eq: t1(kg), source: src, classification: src ? CLASS_TEXT(AS.SOURCES[src].classification) : 'no source type' };
    }).filter(c => c.tco2eq);
    subs.push({ sid: sidAt(s.prefix, index), prefix: s.prefix, name: s.name, tco2eq: t1(s.ghg?.total), share_pct: pct(s.ghg?.total, total), energy_kwh: s.energy_kwh == null ? null : Math.round(s.energy_kwh), components: comps });
  }
  const { rows, subTotals } = AS.rowsFromResults(r, meta);
  const lc = AS.largestContributor(rows, subTotals, total);
  const profile = body.profile && typeof body.profile === 'object' ? body.profile : null;
  const respOf = x => {
    const area = RS.areaOfComponent(x.prefix, x.component), tier = RS.tierOfArea(profile, area);
    return { service_area: area, responsibility: tier, ...(tier === 'unspecified' ? { responsibility_note: 'not answered by the user (unknown)' } : {}) };
  };
  ctx.results = {
    source: 'recalculated on the server with ECAM v3 from the assessment inputs',
    availability:r.availability, completeness:r.completeness, components:r.substages.map(s=>({name:s.name,availability:s.availability})), water_balance:r.water_balance,
    total_tco2eq: t1(total), by_gas_tco2eq: { co2: t1(r.totals.co2), ch4: t1(r.totals.ch4), n2o: t1(r.totals.n2o) },
    energy_kwh: r.energy_kwh == null ? null : Math.round(r.energy_kwh),
    by_stage: Object.fromEntries(Object.entries(r.byStage).filter(([, v]) => v.count).map(([k, v]) => [k, { tco2eq: t1(v.total), share_pct: pct(v.total, total), energy_kwh: v.energy_kwh == null ? null : Math.round(v.energy_kwh) }])),
    largest_contributor: lc.status === 'ok' ? lc.top.map(x => ({
      substage: x.name, prefix: x.prefix, component: x.component, tco2eq: t1(x.kg), share_pct: +(100 * x.share).toFixed(1),
      source: x.source, classification: CLASS_TEXT(x.classification), ...respOf(x),
      ...(x.source === 'containment' ? { classification_note: 'ECAM labels this output only "Containment". The ChatWater ECAM notes call containment direct but define direct emissions as coming from sources the utility owns or controls, which household septic tanks may not be. Classification is pending team review.' } : {}),
    })) : { status: lc.status },
  };
  ctx.responsibility = responsibilityView(rows, profile);

  // ---------------------------------------------------------------- calculated options and checks (recalculated)
  let options = [], checks = [];
  try {
    const sa = suggestActions(AV.calculate(assessment,gwpIndex,{meta,inputStatus:body.inputStatus}), assessment, engine, gwpIndex,body.inputStatus);
    options = CW.withKeys(sa.options, meta);
    CW.assignLabels(options, body.actionLabels && typeof body.actionLabels === 'object' ? body.actionLabels : null);
    checks = CW.withCheckIds(sa.checks, meta);
  } catch (e) { addProblem(ctx, 'actions_failed', 'Calculated actions could not be recomputed.'); }
  const optByKey = new Map(options.map(o => [o.key, o]));
  const calcView = o => {
    const d = AS.describe(o);
    return {
      label: o.id, key: o.key, origin: 'calculated by ChatWater rules from ECAM results', title: L(o.title, lang),
      expected_tco2eq: AS.isQuantified(o, 'ghg') ? t1(o.expected_kgco2) : null,
      expected_kwh: AS.isQuantified(o, 'kwh') ? Math.round(o.expected_kwh) : null,
      ghg_benefit: AS.benefitStatus(o, 'ghg') === 'quantified' ? 'quantified (single-action estimate)' : 'not quantified',
      energy_benefit: AS.benefitStatus(o, 'kwh') === 'quantified' ? 'quantified (single-action estimate)' : 'not quantified',
      classification: d && d.sources.length ? d.sources.map(s => `${s.source}: ${CLASS_TEXT(s.classification)}`).join('; ') : 'not classified',
      provisional_warning: L(o.provisional_warning,lang) || null, condition: L(o.condition, lang) || null, scenario_assumption: L(o.scenario, lang) || null, basis: o.basis || null,
    };
  };

  // ---------------------------------------------------------------- user-proposed actions (this assessment only)
  const allCustom = Array.isArray(body.customActions) ? body.customActions.filter(c => c && typeof c === 'object') : [];
  const otherCustom = allCustom.filter(c => c.assessmentId !== meta.id).length;
  if (otherCustom) addProblem(ctx, 'custom_other', `${otherCustom} user-proposed action(s) from other assessments were left out.`, { n: otherCustom });
  const notes = body.actionNotes && typeof body.actionNotes === 'object' ? body.actionNotes : {};
  const custom = allCustom.filter(c => c.assessmentId === meta.id).filter(c => {
    const p = CA.validate(c, meta);
    if (p.length && !(p.length === 1 && p[0] === 'location_missing')) { addProblem(ctx, 'custom_malformed', `User-proposed action ${cut(c.id, 10)} is malformed and was left out.`, { id: cut(c.id, 10) }); return false; }
    return true;
  });
  const customView = c => {
    const loc = CA.resolveLocation(c, meta);
    const where = loc.at === 'substage' ? `${loc.prefix} › ${r.substages.filter(s => s.prefix === loc.prefix)[loc.index]?.name || loc.sid}` : loc.at === 'missing' ? 'substage no longer exists' : 'whole assessment';
    return {
      label: c.id, key: c.key, origin: 'user-proposed (written by the utility team; not generated by ECAM)', title: cut(c.title, 160),
      description: cut(c.description, 600), problem_addressed: cut(c.problem, 300) || null, location: where,
      ghg_benefit: 'not quantified', energy_benefit: 'not quantified', classification: 'not assigned', scientific_review: 'not reviewed',
      notes: cut(notes[c.key] || '', 400) || null,
    };
  };

  // ---------------------------------------------------------------- selection, plan, proposal: same assessment and freshness
  const sel = (Array.isArray(body.selectedActions) ? body.selectedActions : []).filter(a => a && typeof a === 'object' && a.rule !== 'baseline');
  const setAid = body.actionSet?.assessmentId || null;
  const selectionHere = sel.length && setAid === meta.id;
  if (sel.length && !selectionHere) addProblem(ctx, 'selection_other', 'The saved action selection belongs to a different assessment; it is not used here.');
  const foreignKeys = selectionHere ? sel.filter(a => !String(a.key || '').startsWith(meta.id + '|')).length : 0;
  if (foreignKeys) addProblem(ctx, 'foreign_keys', `${foreignKeys} selected action(s) do not belong to this assessment and were left out.`, { n: foreignKeys });
  const selected = selectionHere ? sel.filter(a => String(a.key || '').startsWith(meta.id + '|')) : [];
  const planHere = body.plan && body.plan.deps?.assessmentId === meta.id ? body.plan : null;
  const proposalHere = body.proposal && body.proposal.deps?.assessmentId === meta.id ? body.proposal : null;
  const rejected = body.rejectedActions && typeof body.rejectedActions === 'object' ? body.rejectedActions : null;
  if (body.plan && !planHere) addProblem(ctx, body.plan.deps ? 'plan_other' : 'plan_legacy', body.plan.deps ? 'The project plan was made for a different assessment; it is not used here.' : 'The project plan predates version tracking; its assessment cannot be confirmed, so it is not used here.');
  if (body.proposal && !proposalHere) addProblem(ctx, body.proposal.deps ? 'proposal_other' : 'proposal_legacy', body.proposal.deps ? 'The proposal was made for a different assessment; it is not used here.' : 'The proposal predates version tracking; its assessment cannot be confirmed, so it is not used here.');
  const f = CW.freshness({
    assessments: [{ id: meta.id, revision, supportRevision:r.supportRevision }], gwpIndex,
    actionSet: selectionHere ? body.actionSet : null, selectedActions: selected,
    plan: planHere, proposal: proposalHere, profile: body.profile, financing: body.financing,
    customActions: CW.customDefs(custom, notes), rejected,
  });
  const figureIssues = selected.length ? I.actionIssues({ assessment, meta, gwpIndex, actions: selected, actionSet: body.actionSet, inputStatus:body.inputStatus, rejected }) : [];
  ctx.freshness = {
    actions: selected.length ? (f.actions.length || figureIssues.length ? { status: 'outdated', codes: f.actions, reasons: [...f.actions.map(c => I.MESSAGES[c] || c), ...figureIssues], ...(figureIssues.length ? { figure_issues: figureIssues.length } : {}) } : { status: 'current' }) : { status: 'none saved' },
    plan: planHere ? (f.plan.length ? { status: 'outdated', codes: f.plan, reasons: f.plan.map(c => I.MESSAGES[c] || c) } : { status: 'current' }) : { status: 'none for this assessment' },
    proposal: proposalHere ? (f.proposal.length ? { status: 'outdated', codes: f.proposal, reasons: f.proposal.map(c => I.MESSAGES[c] || c) } : { status: 'current' }) : { status: 'none for this assessment' },
  };
  ctx.actions = {
    calculated: options.filter(o => o.rule !== 'baseline').slice(0, 12).map(calcView),
    user_proposed: custom.slice(0, 8).map(customView),
    selected: selected.filter(a => !rejected?.[a.key]).map(a => a.id).filter(Boolean),
    saved_selection: selected.map(a => a.id).filter(Boolean),
    rejected: rejectedView(rejected, meta, optByKey, custom, selected, lang),
    combined_savings: 'not assessed: each estimate is for one action on its own; actions may overlap, so do not add them up',
  };

  // ---------------------------------------------------------------- known missing information and input provenance
  const record = body.inputStatus && typeof body.inputStatus === 'object' ? body.inputStatus : null;
  ctx.missing.push(...collectMissing(checks, record, body.profile));
  ctx.inputs = inputProvenance(assessment, meta, body.estimateUse, record);

  // ---------------------------------------------------------------- financing pathways the user ticked (directions to investigate)
  const pathIds = Array.isArray(body.financing?.pathways) ? body.financing.pathways.filter(x => typeof x === 'string').slice(0, 10) : [];
  ctx.pathways = pathIds.length ? pathways.selected(pathIds, lang) : null;

  // ---------------------------------------------------------------- focus
  const fd = resolveFocus({ focus, ctx, subs, sids, optByKey, calcView, custom, customView, checks, record, assessment, planHere, proposalHere, lang });
  ctx.focus = { ...ctx.focus, ...fd.focus };
  ctx.focus_detail = fd.detail;
  if (planHere && (ctx.stage >= 3 || focus.kind === 'plan')) {
    ctx.plan = { kind: 'unverified narrative; not recalculated ECAM facts', status: ctx.freshness.plan.status, summary: cut(planHere.summary || '', 1200), total_weeks: planHere.total_weeks ?? null,
      tasks: (planHere.tasks || []).slice(0, 20).map(k => `${k.id} [${k.action_id || ''}] ${cut(k.name, 100)} — ${cut(k.owner, 40)}, week ${k.start_week}+${k.weeks}`) };
  }
  if (planHere) ctx.concept = conceptView(planHere.concept, ctx.stage === 3 || focus.kind === 'plan');
  if (proposalHere && (ctx.stage === 4 || focus.kind === 'proposal_section')) {
    ctx.proposal = { status: ctx.freshness.proposal.status, language: proposalHere.lang || null, sections: (proposalHere.sections || []).map(s => cut(s.title, 80)) };
  }

  // ---------------------------------------------------------------- framework guidance (team draft)
  ctx.framework = frameworkFor(ctx, focus, fd);

  // ---------------------------------------------------------------- questions naming another assessment
  const q = String(body.question || '').toLowerCase();
  for (const o of Array.isArray(body.otherAssessments) ? body.otherAssessments : []) {
    const name = String(o?.name || '').trim();
    if (o?.id !== meta.id && name.length >= 3 && name.toLowerCase() !== String(r.name || '').toLowerCase() && q.includes(name.toLowerCase())) ctx.mentions_other.push(name);
  }
  return finish(ctx, focus, lang);
}

/**
 * The utility's own answers about which service areas it runs, kept apart from ECAM figures.
 * Unanswered areas stay "unknown"; nothing is inferred and no source leaves the inventory.
 */
function responsibilityView(rows, profile) {
  const answered = RS.answered(profile);
  const bd = RS.breakdown(rows, profile);
  const row = x => x ? { substage: x.name, prefix: x.prefix, component: x.component, service_area: x.area, responsibility: x.tier, tco2eq: t1(x.kg) } : null;
  return {
    source: 'answers in the optional utility details, entered by the user; not ECAM data and never inferred',
    answered,
    areas: Object.fromEntries(Object.keys(RS.AREAS).map(a => [a, RS.roleOf(profile, a) || 'unknown (not answered)'])),
    capacity: Object.fromEntries(Object.keys(RS.CAPACITY).map(k => [k, RS.CAPACITY[k].includes(profile?.[k]) ? profile[k] : 'unknown (not answered)'])),
    inventory_complete:bd.complete, known_subtotal_tco2eq:t1(bd.known_subtotal), inventory_tco2eq_by_responsibility: bd.complete ? Object.fromEntries(Object.entries(bd.byTier).map(([k, v]) => [k, t1(v)])) : null,
    largest_source_in_inventory: bd.complete ? row(bd.top.overall) : null,
    largest_source_the_utility_operates: answered && bd.complete ? row(bd.top.actionable) : null,
    note: 'Responsibility does not change ECAM totals: sources outside the utility\'s responsibility stay in the assessed inventory. "unspecified" means the user has not answered, not "outside".',
  };
}

/** Actions the user marked "not relevant" for this assessment (reasons are user-written). */
function rejectedView(rejected, meta, optByKey, custom, selected, lang) {
  return Object.entries(rejected || {}).filter(([k, v]) => v && String(k).startsWith(meta.id + '|')).slice(0, 12).map(([key, v]) => {
    const o = optByKey.get(key) || custom.find(c => c.key === key);
    return {
      label: o?.id || null, key,
      title: o ? (CA.isCustom(o) ? cut(o.title, 160) : L(o.title, lang)) : 'no longer produced by the current inputs',
      reason: cut(v.reason || '', 300) || null, reason_source: 'user-written',
      in_saved_selection: selected.some(a => a.key === key),
    };
  });
}

/** Stage 1 values the user took over from ECAM's estimate and has not changed since (verified against current inputs). */
function inputProvenance(assessment, meta, estimateUse, record) {
  const sidAt = new Map();
  for (const [prefix, list] of Object.entries(meta.substages || {})) (list || []).forEach((sid, index) => sid && sidAt.set(sid, { prefix, index }));
  const estimates = [];
  for (const [sid, codes] of Object.entries(estimateUse && typeof estimateUse === 'object' ? estimateUse : {})) {
    const at = sidAt.get(sid);
    const entry = at && CW.STAGE_KEYS.find(([p]) => p === at.prefix);
    if (!entry || !codes || typeof codes !== 'object') continue;
    const sub = assessment[entry[1]]?.[entry[2]]?.[at.index];
    for (const [code, v] of Object.entries(codes)) {
      if (!sub || sub[code] !== v || !v) continue;
      estimates.push({ substage: sub.name || sid, prefix: at.prefix, code, input: cut(label(code), 80), value: v });
    }
  }
  // inputs read by the rule checks: origin as recorded, valid only while the value is unchanged
  const tracked = { manual: 0, estimate: 0, typical: 0, default: 0, unknown: 0, confirmed: 0 };
  for (const [sid, codes] of Object.entries(record?.s && typeof record.s === 'object' ? record.s : {})) {
    const at = sidAt.get(sid);
    const entry = at && CW.STAGE_KEYS.find(([p]) => p === at.prefix);
    const sub = entry && assessment[entry[1]]?.[entry[2]]?.[at.index];
    if (!sub) continue;
    for (const code of Object.keys(codes || {})) {
      const st = CW.inputState(record, sid, code, sub[code] ?? null);
      tracked[st.origin] = (tracked[st.origin] || 0) + 1;
      if (st.confirmed) tracked.confirmed++;
      if (st.origin === 'estimate' && !estimates.some(e => e.code === code && e.substage === (sub.name || sid))) estimates.push({ substage: sub.name || sid, prefix: at.prefix, code, input: cut(label(code), 80), value: sub[code] });
    }
  }
  return {
    source: 'how Stage 1 values were entered, as recorded in this browser',
    ecam_estimates: estimates.slice(0, 20),
    ecam_estimates_note: 'ECAM estimates are ECAM default calculations used in place of utility data; they are not measurements.',
    tracked_inputs: tracked,
  };
}

/** Project concept areas: status only, plus text when the plan is in focus. All of it is unverified narrative. */
function conceptView(concept, withText) {
  if (!concept || !Array.isArray(concept.areas)) return null;
  return {
    kind: 'unverified narrative (template text or AI draft, possibly edited by the user); not ECAM facts',
    ai_failed: !!concept.ai_failed,
    areas: concept.areas.slice(0, 8).map(a => ({
      area: a.n, title: cut(a.title, 80), status: a.status || 'template', reviewed: !!a.reviewed,
      ...(a.checks ? { review_checks: a.checks } : {}),
      may_be_incomplete: a.status === 'ai' ? CW.mayBeIncomplete?.(a.text) || false : false,
      ...(withText ? { text: cut(a.text || '', 160) } : {}),
    })),
  };
}

const PROFILE_FIELDS = ['name', 'location', 'service_type', 'served', 'connections'];
const NOT_COMPUTED = ['project costs (CAPEX, OPEX)', 'available funding and funding gap', 'current fund eligibility', 'combined savings of several actions'];
const NOT_COMPUTED_CODES = ['costs', 'funding_gap', 'eligibility', 'combined_savings'];

/** Missing or unconfirmed inputs from the rule checks, missing profile fields, and what ChatWater does not compute. */
function collectMissing(checks, record, profile) {
  const out = [], unconfirmed = new Map();
  for (const c of checks) {
    if (c.status === 'not_assessed') {
      out.push({ kind: 'rule_check', check: c.check, substage: c.name, sid: c.sid, reason: c.reason,
        missing_codes: c.missing || [],
        missing_inputs: (c.missing || []).map(code => `${code} (${cut(label(code), 60)})`) });
    }
    for (const i of c.inputs || []) {
      if (!c.sid || (c.missing || []).includes(i.code)) continue;
      const st = CW.inputState(record, c.sid, i.code, i.value);
      if (i.value != null && CW.needsConfirm(st)) {
        const u = unconfirmed.get(c.sid) || unconfirmed.set(c.sid, { kind: 'unconfirmed_inputs', substage: c.name, sid: c.sid, inputs: [], input_details: [] }).get(c.sid);
        if (!u.inputs.some(x => x.startsWith(i.code + ' '))) {
          u.inputs.push(`${i.code} = ${i.value} (${st.origin})`);
          u.input_details.push({ code: i.code, value: i.value, origin: st.origin });
        }
      }
    }
  }
  out.push(...unconfirmed.values());
  const missingProfile = PROFILE_FIELDS.filter(k => !profile || profile[k] == null || profile[k] === '');
  if (missingProfile.length) out.push({ kind: 'utility_profile', fields: missingProfile });
  out.push({ kind: 'not_computed', items: NOT_COMPUTED, codes: NOT_COMPUTED_CODES });
  return out;
}

/** Known missing information for drafting paths that do not build the full chat context. */
function knownMissing({ assessment, meta, gwpIndex = 0, inputStatus = null, profile = null } = {}) {
  let checks = [];
  if (assessment && meta?.id) {
    try { checks = CW.withCheckIds(suggestActions(AV.calculate(assessment,gwpIndex,{meta,inputStatus}),assessment,engine,gwpIndex,inputStatus).checks, meta); } catch (e) { checks = []; }
  }
  return collectMissing(checks, inputStatus && typeof inputStatus === 'object' ? inputStatus : null, profile);
}

/** Plain-text list for prompts. */
/** Problem text for the model, plus a code the panel translates. */
function addProblem(ctx, code, text, params = {}) {
  ctx.problems.push(text);
  ctx.problem_codes.push({ code, ...params });
}

function missingText(list) {
  return list.map(m => m.kind === 'rule_check' ? `- ${m.substage}: ${m.check} not assessed — missing ${m.missing_inputs.join(', ') || m.reason || 'inputs'}`
    : m.kind === 'unconfirmed_inputs' ? `- ${m.substage}: values not confirmed by the utility: ${m.inputs.join(', ')}`
    : m.kind === 'utility_profile' ? `- Utility profile fields missing: ${m.fields.join(', ')}`
    : m.kind === 'not_computed' ? `- Not computed by ChatWater: ${m.items.join('; ')}` : '').filter(Boolean).join('\n');
}

function resolveFocus({ focus, ctx, subs, sids, optByKey, calcView, custom, customView, checks, record, assessment, planHere, proposalHere }) {
  const kind = focus.kind || 'general';
  const bad = (problem, problem_code) => ({ focus: { ok: false, problem, problem_code }, detail: null });
  if (kind === 'result') {
    if (focus.sid) {
      const s = subs.find(x => x.sid === focus.sid);
      if (!s) return bad('This substage is not part of the current assessment.', 'substage_missing');
      return { focus: { label: `${s.prefix} › ${s.name}`, prefix: s.prefix, sid: s.sid, name: s.name }, detail: { substage: s } };
    }
    if (focus.prefix) {
      if (!PREFIXES.includes(focus.prefix)) return bad('Unknown stage.', 'unknown_stage');
      return { focus: { label: `stage ${focus.prefix}`, prefix: focus.prefix }, detail: { stage: focus.prefix, ...ctx.results.by_stage[focus.prefix], substages: subs.filter(x => x.prefix === focus.prefix) } };
    }
    return { focus: { label: 'assessment results', label_code: 'results' }, detail: { largest_contributor: ctx.results.largest_contributor } };
  }
  if (kind === 'input') {
    const code = String(focus.code || '');
    const prefix = code.split('_')[0];
    const entry = CW.STAGE_KEYS.find(([p]) => p === prefix);
    let value = null, where = 'general';
    if (entry && focus.sid && sids.get(focus.sid)) {
      const { index } = sids.get(focus.sid);
      value = assessment[entry[1]]?.[entry[2]]?.[index]?.[code] ?? null;
      where = subs.find(x => x.sid === focus.sid)?.name || focus.sid;
    } else if (assessment.General && code in assessment.General) value = assessment.General[code];
    const st = CW.inputState(record,focus.sid || 'General',code,value);
    const availability=require('../public/js/result-status').input(record,focus.sid || 'General',code,value,engine._ecam.Info,engine._ecam.Tables);
    const d = knowledge.describe(code);
    return { focus: { label: `${code} (${cut(d.descr, 80)})`, code }, detail: { code, substage: where, value:availability.status==='available'?value:null, stored_value:value, availability:availability.status, description: cut(d.descr, 200), explanation: cut(String(d.expla).replace(/<[^>]+>/g, ''), 600), input_origin: st ? st.origin : 'not tracked', confirmed: st ? st.confirmed : null } };
  }
  if (kind === 'action') {
    const key = String(focus.key || '');
    if (!key.startsWith(ctx.assessment.id + '|')) return bad('This action belongs to a different assessment.', 'action_other');
    const c = custom.find(x => x.key === key);
    if (c) return { focus: { label: `${c.id} ${cut(c.title, 80)}`, key, origin: 'user', location: customView(c).location }, detail: { action: customView(c) } };
    const o = optByKey.get(key);
    if (!o) return bad('This action is not produced by the current assessment data (it may be outdated).', 'action_outdated');
    const sid = key.split('|')[2];
    const related = checks.filter(k => k.rules.includes(o.rule) && (sid === 'utility' || k.sid === sid))
      .map(k => ({ check: k.check, status: k.status, reason: k.reason, missing_inputs: k.missing || [] }));
    return { focus: { label: `${o.id} ${cut(L(o.title, 'en'), 80)}`, action_id: o.id, title: o.title, key, origin: 'calculated', rule: o.rule, prefix: sids.get(sid)?.prefix || null }, detail: { action: calcView(o), checks: related } };
  }
  if (kind === 'missing') return { focus: { label: 'missing information', label_code: 'missing' }, detail: null };
  if (kind === 'plan') {
    if (!planHere) return bad('There is no project plan for this assessment.', 'no_plan');
    return { focus: { label: 'project plan', label_code: 'plan' }, detail: null };
  }
  if (kind === 'proposal_section') {
    const s = proposalHere?.sections?.[+focus.index];
    if (!s) return bad('This proposal section is not available for this assessment.', 'no_section');
    return { focus: { label: `proposal section “${cut(s.title, 80)}”`, label_code: 'section', section_title: cut(s.title, 80), index: +focus.index }, detail: { section: { key: s.key || null, title: s.title, guidance: cut(s.guidance || '', 400), text: cut(s.text || '', 2500), template: s.ai === false } } };
  }
  return { focus: { label: ctx.stage ? `stage ${ctx.stage} overview` : 'general', label_code: ctx.stage ? 'stage' : 'general', stage: ctx.stage || null }, detail: null };
}

function frameworkFor(ctx, focus, fd) {
  const lang = ctx.output_language;
  const out = { source: `${GUIDE.title} (${GUIDE.source})`, review_status: lang === 'id' ? GUIDE_ID.review_status : GUIDE.review_status };
  const a = fd.detail?.action;
  if (focus.kind === 'action' && fd.focus.ok !== false) {
    if (fd.focus.origin === 'calculated') {
      out.stage2 = frameworkRows({ rule: fd.focus.rule, prefix: fd.focus.prefix || null }, 3, lang);
    } else {
      // user-proposed actions have no rule: rank the rows at their location by shared words with the user's text
      const prefix = (a.location.match(/^(\w{3}) ›/) || [])[1];
      const words = new Set(library.tokenize(`${a.title} ${a.problem_addressed || ''} ${a.description}`));
      const rows = prefix ? frameworkRows({ prefix }, 99, lang) : [];
      const score = r => library.tokenize(`${r.title} ${r.questions.join(' ')} ${r.actions.join(' ')}`).filter(w => words.has(w)).length;
      out.stage2 = rows.map((r, i) => ({ r, i, s: score(r) })).sort((x, y) => y.s - x.s || x.i - y.i).slice(0, 3).map(x => x.r);
    }
  } else if (focus.kind === 'result' && fd.focus.prefix) {
    const top = fd.detail?.substage?.components?.slice().sort((x, y) => y.tco2eq - x.tco2eq)[0];
    out.stage2 = frameworkRows({ prefix: fd.focus.prefix, source: top?.source || null }, 3, lang);
    if (!out.stage2.length) out.stage2 = frameworkRows({ prefix: fd.focus.prefix }, 3, lang);
  } else if (ctx.stage === 2 || focus.kind === 'result') {
    const lc = Array.isArray(ctx.results?.largest_contributor) ? ctx.results.largest_contributor[0] : null;
    if (lc) out.stage2 = frameworkRows({ prefix: lc.prefix, source: lc.source }, 3, lang);
  }
  if (ctx.stage === 3 || focus.kind === 'plan' || focus.intent === 'develop' || focus.kind === 'missing') out.stage3 = stage3Rows(lang);
  if (ctx.stage === 4 || focus.kind === 'proposal_section') out.stage4 = lang === 'id' ? GUIDE_ID.stage4 : GUIDE.stage4;
  return out;
}

/**
 * Compact text block for the model. Sections are added in priority order; a section that would
 * exceed TEXT_LIMIT is left out whole and named at the end, so nothing is cut mid-sentence.
 */
function render(ctx) {
  const j = v => JSON.stringify(v);
  const a = ctx.assessment, r = ctx.results, fr = ctx.freshness, acts = ctx.actions, fw = ctx.framework;
  const fwText = fw && (fw.stage2 || fw.stage3 || fw.stage4) ? `TEAM FRAMEWORK GUIDANCE (${fw.review_status}):` +
    (fw.stage2 ? `\n stage2 rows: ${j(fw.stage2.map(x => ({ id: x.id, title: x.title, questions: x.questions, possible_actions: x.actions })))}` : '') +
    (fw.stage3 ? `\n stage3 planning areas: ${j(fw.stage3.map(x => ({ area: x.area, title: x.title, questions: x.questions })))}` : '') +
    (fw.stage4 ? `\n stage4: ${j(fw.stage4)}` : '') : '';
  const sections = [
    ['assessment', a ? `ASSESSMENT: "${a.name}" (id ${a.id}) · ${a.country || ''} · ${a.period?.start} – ${a.period?.end} (${a.period?.days} days) · GWP ${a.gwp_report} · grid ${a.grid_factor_kgco2_per_kwh} kgCO2/kWh` : 'ASSESSMENT: none'],
    ['stage', `STAGE: ${ctx.stage || '?'} (${ctx.view}) · OUTPUT LANGUAGE: ${ctx.output_language}`],
    ['focus', `FOCUS: ${ctx.focus.label || ctx.focus.kind}${ctx.focus.ok === false ? ` — NOT AVAILABLE: ${ctx.focus.problem}` : ''}${ctx.focus.intent ? ` · intent: ${ctx.focus.intent}` : ''}`],
    ['problems', ctx.problems.length ? `CONTEXT PROBLEMS: ${ctx.problems.join(' ')}` : ''],
    ['other', ctx.mentions_other.length ? `THE QUESTION NAMES ANOTHER ASSESSMENT: ${ctx.mentions_other.join(', ')}. No data from it is included; do not answer about it from this context.` : ''],
    ['results', r?.availability === 'not_assessed' ? `RESULTS: Not assessed. Correct draft inputs: ${j(r.validity.issues)}` : r ? `RESULTS (${r.source}): total ${r.total_tco2eq} tCO2eq (CO2 ${r.by_gas_tco2eq.co2}, CH4 ${r.by_gas_tco2eq.ch4}, N2O ${r.by_gas_tco2eq.n2o}); energy ${r.energy_kwh} kWh\nBY STAGE: ${Object.entries(r.by_stage).map(([k, v]) => `${k} ${v.tco2eq} t (${v.share_pct}%)`).join('; ')}\nLARGEST CONTRIBUTOR: ${j(r.largest_contributor)}` : ''],
    ['completeness', r?.completeness ? `INVENTORY COMPLETENESS: ${j(r.completeness)}. Unknown components are not zero. A known subtotal is not the assessment total.` : ''],
    ['water_balance', r?.water_balance?.length ? `WATER BALANCE (each measure uses its own stated dependencies; missing values are unknown): ${j(r.water_balance.map(w => ({name:w.name,distributed_m3:w.distributed_m3,authorized_m3:w.authorized_m3,billed_m3:w.billed_m3,nrw_pct:w.nrw_pct.value,water_loss_pct:w.water_loss_pct.value,nrw_status:w.nrw_pct.status,water_loss_status:w.water_loss_pct.status})))}` : ''],
    ['responsibility', ctx.responsibility ? `RESPONSIBILITY (${ctx.responsibility.source}): ${j((({ source, ...x }) => x)(ctx.responsibility))}` : ''],
    ['focus_detail', ctx.focus_detail ? `FOCUS DETAIL: ${j(ctx.focus_detail)}` : ''],
    ['rejected', acts?.rejected?.length ? `REJECTED ACTIONS (marked "not relevant" by the user; reasons are user-written): ${j(acts.rejected.map(({ key, ...x }) => x))}` : ''],
    ['inputs', ctx.inputs && (ctx.inputs.ecam_estimates.length || Object.values(ctx.inputs.tracked_inputs).some(Boolean)) ? `INPUT PROVENANCE (${ctx.inputs.source}): ECAM estimates still in use: ${j(ctx.inputs.ecam_estimates)}. ${ctx.inputs.ecam_estimates_note} Tracked inputs by origin: ${j(ctx.inputs.tracked_inputs)}` : ''],
    ['freshness', fr.actions ? `FRESHNESS: selected actions ${fr.actions.status}${fr.actions.reasons ? ` (${fr.actions.reasons.join('; ')})` : ''}; plan ${fr.plan.status}${fr.plan.reasons ? ` (${fr.plan.reasons.join('; ')})` : ''}; proposal ${fr.proposal.status}${fr.proposal.reasons ? ` (${fr.proposal.reasons.join('; ')})` : ''}` : ''],
    ['framework', fwText],
    ['proposal', ctx.proposal ? `PROPOSAL (${ctx.proposal.status}): sections ${ctx.proposal.sections.join(' | ')}` : ''],
    ['plan', ctx.plan ? `PLAN (${ctx.plan.status}): ${j(ctx.plan)}` : ''],
    ['concept', ctx.concept ? `PROJECT CONCEPT — ${ctx.concept.kind}${ctx.concept.ai_failed ? '; the AI draft failed, template text shown' : ''}: ${j(ctx.concept.areas)}` : ''],
    ['pathways', ctx.pathways?.length ? `SELECTED FINANCING PATHWAYS (directions to investigate; eligibility not confirmed; keep every document caveat): ${j(ctx.pathways.map(p => ({ name: p.name, questions_to_confirm: p.questions_to_confirm, documents: p.documents.map(d => ({ title: d.title, review_status: d.review_status, caveats: d.caveats })) })))}` : ''],
    ['missing', ctx.missing.length ? `KNOWN MISSING INFORMATION: ${j(ctx.missing.map(({ sid, missing_codes, input_details, ...m }) => m))}` : ''],
    ['provisional_warnings', acts ? [...new Set(acts.calculated.map(x => x.provisional_warning).filter(Boolean))].join('\n') : ''],
    ['actions', acts ? `CALCULATED ACTIONS: ${acts.calculated.map(x => `${x.label} ${x.title}: ${x.expected_tco2eq != null ? x.expected_tco2eq + ' tCO2eq' : 'GHG not quantified'}${x.expected_kwh != null ? `, ${x.expected_kwh} kWh` : ''}; ${x.classification}`).join(' | ')}` +
      (acts.user_proposed.length ? `\nUSER-PROPOSED ACTIONS (no calculated benefit; not reviewed): ${acts.user_proposed.map(x => `${x.label} ${x.title} @ ${x.location}${x.problem_addressed ? ` — addresses: ${x.problem_addressed}` : ''}`).join(' | ')}` : '') +
      `\nSELECTED: ${acts.selected.join(', ') || 'none'} · COMBINED SAVINGS: ${acts.combined_savings}` : ''],
  ];
  const out = [], omitted = [];
  let size = 0;
  for (const [name, text] of sections) {
    if (!text) continue;
    if (size + text.length + 1 > TEXT_LIMIT - 80) { omitted.push(name); continue; }
    out.push(text); size += text.length + 1;
  }
  if (omitted.length) out.push(`[left out at the size limit: ${omitted.join(', ')}]`);
  return out.join('\n');
}

function finish(ctx, focus, lang) {
  return { context: ctx, text: render(ctx), lang };
}

/** Terms from the focused item that help retrieval (weighted below the question itself). */
function retrievalContext(ctx) {
  const parts = [];
  const d = ctx.focus_detail;
  if (d?.action) parts.push(d.action.title, d.action.problem_addressed || '', d.action.description || '');
  if (d?.substage) parts.push(d.substage.name, ...(d.substage.components || []).map(c => c.source || c.component)); // input focus carries a substage without components
  if (d?.section) parts.push(d.section.title);
  if (d?.code) parts.push(d.description);
  if (ctx.focus.kind === 'missing') parts.push('baseline data measurement');
  return parts.filter(Boolean).join(' ').slice(0, 600);
}

const INTENT_TERMS = { develop: 'implementation monitoring', missing: 'baseline data' };
/**
 * Search query for the library. Entry-point buttons send fixed template wording ("Help develop this action…"),
 * which would dilute term coverage, so those requests search on the focused item itself.
 * Typed questions are searched as written.
 */
function retrievalQuery(ctx, question, entry, body = {}) {
  const d = ctx.focus_detail || {};
  const context = retrievalContext(ctx);
  const stage = ctx.stage;
  const one = (q, from) => ({ queries: [q], context, stage, from });
  const ok = ctx.focus.ok !== false;
  const all = [...(ctx.actions?.calculated || []), ...(ctx.actions?.user_proposed || [])];
  if (ok && d.section) {
    // proposal section: the same builder as drafting, plus the typed question if there is one
    const f = {
      utility_profile: body.profile || null, ecam_results: ctx.results ? { country: ctx.assessment?.country, by_stage: ctx.results.by_stage } : null,
      selected_actions: (ctx.actions?.selected || []).map(id => all.find(a => a.label === id)).filter(Boolean).map(a => ({ id: a.label, title: a.title, description: a.description })),
    };
    const rq = R.forSection({ key: d.section.key, en: d.section.title, title: d.section.title, guidance: d.section.guidance }, f, { question: entry ? '' : question });
    return { ...rq, from: entry ? 'focus' : 'section+question' };
  }
  if (entry && ok && d.action) {
    const [first, ...rest] = R.actionQueries(d.action);
    return { queries: [`${first} ${INTENT_TERMS[ctx.focus.intent] || ''}`.trim(), ...rest], context, stage, from: 'focus' };
  }
  const item = d.substage?.name || (d.code ? d.description : '') || '';
  if (entry && ok && item) return one(`${item} ${INTENT_TERMS[ctx.focus.intent] || ''}`.trim(), 'focus');
  if (entry && ctx.focus.kind === 'missing') return one('missing baseline data measurement', 'focus');
  if (entry && ctx.focus.kind === 'plan' && ctx.plan) {
    // one search per planned action: a combined query would rarely cover enough of any single passage
    const titles = (ctx.actions?.selected || []).map(id => all.find(a => a.label === id)?.title).filter(Boolean).slice(0, 3);
    if (titles.length) return { queries: titles.map(x => `${x} implementation`), context, stage, from: 'focus' };
  }
  return one(question, 'question');
}

module.exports = { build, render, retrievalContext, retrievalQuery, frameworkRows, knownMissing, collectMissing, missingText, TEXT_LIMIT };
