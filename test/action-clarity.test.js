/*
 * What each action addresses, emission classification, sorting and the largest contributor.
 * Synthetic edits of the HYPOTHETICAL sample utility only; no external calls. Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JSZip = require('jszip');
const CW = require('../public/js/cw-core');
const AS = require('../public/js/action-sources');
const DC = require('../public/js/decision-cards');
const engine = require('../engine/ecam-engine');
const I = require('../engine/integrity');
const P = require('../engine/proposal');
const X = require('../engine/export');
const { buildPlan } = require('../engine/plan');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta, clone, confirmedInputs } = require('./helpers/fixtures');

const UI = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8') + ';UI');
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function options(assessment = clone(sample[0]), id = 'a_main') {
  const opts = I.optionsFor(assessment, meta(assessment, id), 0);
  CW.assignLabels(opts, {});
  return opts;
}
const byRule = (opts, rule) => opts.find(o => o.rule === rule);
const fmt = (n, d) => (n == null || !Number.isFinite(n)) ? '–' : new Intl.NumberFormat('en-US', { maximumFractionDigits: d === undefined ? 1 : d }).format(n);
const ctx = (lang = 'en') => ({
  t: k => UI[lang][k] ?? UI.en[k] ?? k,
  L: o => (o && typeof o === 'object') ? (o[lang] || o.en) : (o ?? ''),
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmt, labelOf: code => code, unitView: () => ({ unit: '', mult: 1 }),
  status: () => ({ origin: 'unknown', confirmed: false }),
  stageLabel: p => p, substageName: sid => ({ wsa_0: 'River intake pumping', wwo_0: 'Household septic tanks' }[sid] || null),
});
const attr = (html, name) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(m => m[1]);

// ------------------------------------------------------------------ mapping and classification
test('every rule the engine can produce has an explicit mapping; sources come only from that table', () => {
  for (const rule of [...DC.COVERED_RULES, ...DC.OTHER_RULES]) assert.ok(AS.ACTIONS[rule], `mapping for ${rule}`);
  for (const m of Object.values(AS.ACTIONS)) for (const s of m.sources) assert.ok(AS.SOURCES[s.source], s.source);
  // every mapped source points at a first-level ECAM component of the stages it can occur in
  for (const m of Object.values(AS.ACTIONS)) for (const s of m.sources) {
    assert.ok(Object.values(AS.COMPONENTS).some(list => list.includes(s.component)), s.component);
  }
});

test('supported classifications are shown; containment and unmapped rules show "Classification pending review"', () => {
  const opts = options();
  const pump = AS.describe(byRule(opts, 'pump_upgrade'));
  assert.deepStrictEqual([pump.problem, pump.location.prefix, pump.location.sid], ['pump_efficiency', 'wsa', 'wsa_0']);
  assert.deepStrictEqual(pump.sources.map(s => [s.source, s.classification, s.review]), [['grid_electricity', 'indirect', 'pending']]);
  const desl = AS.describe(byRule(opts, 'septic_desludging'));
  assert.deepStrictEqual(desl.sources.map(s => [s.source, s.classification]), [['containment', null]]);
  assert.deepStrictEqual(AS.describe(byRule(opts, 'fuel_switch')).sources.map(s => s.classification), ['direct']);
  assert.deepStrictEqual(AS.describe(byRule(opts, 'cso_reduction')).sources.map(s => s.classification), ['direct']);
  const nrw = AS.describe(byRule(opts, 'nrw_reduction'));
  assert.deepStrictEqual([nrw.location.prefix, nrw.sources[0].location], ['wsd', { at: 'stages', stages: ['wsa', 'wst', 'wsd'] }]);
  assert.deepStrictEqual(AS.describe(byRule(opts, 'solar_pv')).location, { at: 'utility' });
  assert.strictEqual(AS.describe(byRule(opts, 'baseline')), null);

  const c = ctx();
  const pumpHtml = DC.card(byRule(opts, 'pump_upgrade'), c, {});
  assert.ok(pumpHtml.includes('Addresses:</span> Pump efficiency below the expected value'), 'addresses label');
  assert.ok(pumpHtml.includes('wsa › River intake pumping'), 'location with substage name');
  assert.deepStrictEqual([...new Set(attr(pumpHtml, 'data-classification'))], ['indirect']);
  assert.ok(pumpHtml.includes('Electricity (indirect)') && pumpHtml.includes('not yet reviewed'), 'basis and review status in details');
  const deslHtml = DC.card(byRule(opts, 'septic_desludging'), c, {});
  assert.deepStrictEqual([...new Set(attr(deslHtml, 'data-classification'))], ['pending']);
  assert.ok(deslHtml.includes('Classification pending review') && !deslHtml.includes('Direct emissions') && !deslHtml.includes('Indirect emissions'));
  // classification sits next to, not instead of, the existing notices
  assert.ok(deslHtml.includes('not proof that it fits your utility') && deslHtml.includes('Emissions from treating the emptied sludge are not yet included.'));
  assert.ok(!DC.card(byRule(opts, 'baseline'), c, {}).includes('data-addresses'), 'baseline addresses nothing');
  // a rule without a mapping is never classified
  const unknown = { ...byRule(opts, 'pump_upgrade'), rule: 'future_rule', key: 'a_main|future_rule|wsa_0' };
  assert.strictEqual(AS.describe(unknown).mapped, false);
  const uHtml = DC.card(unknown, c, {});
  assert.deepStrictEqual([...new Set(attr(uHtml, 'data-classification'))], ['pending']);
  assert.ok(uHtml.includes('Source not yet mapped'));
});

test('classification is independent of input confirmation and evidence', () => {
  const o = byRule(options(), 'septic_desludging');
  const confirmed = { ...ctx(), status: () => ({ origin: 'manual', confirmed: true }) };
  const a = DC.card(o, ctx(), {}), b = DC.card(o, confirmed, {});
  assert.deepStrictEqual(attr(a, 'data-classification'), attr(b, 'data-classification'));
  assert.ok(b.includes('Classification pending review'), 'confirming inputs does not resolve the classification');
  assert.ok(b.includes('not proof that it fits your utility'), 'reading is labelled as not evidence for this utility');
});

test('Indonesian card text uses the translation table', () => {
  const html = DC.card(byRule(options(), 'pump_upgrade'), ctx('id'), {});
  assert.ok(html.includes('Menangani') && html.includes('Emisi tidak langsung') && html.includes('Listrik PLN'));
  for (const k of Object.keys(UI.en).filter(k => /^(pb_|src_|cls_|clsb_|sort_|measure_|contrib_)/.test(k))) assert.ok(UI.id[k], `id: ${k}`);
});

// ------------------------------------------------------------------ sorting
test('sorting by GHG or energy reorders the same objects: baseline first, unquantified last, ties stable', () => {
  const opts = options();
  const snapshot = JSON.stringify(opts);
  const ids = list => list.map(o => o.id);
  assert.deepStrictEqual(ids(AS.sortOptions(opts, 'original')), ids(opts));
  assert.deepStrictEqual(ids(AS.sortOptions(opts, undefined)), ids(opts), 'older sessions without a sort setting');
  const ghg = AS.sortOptions(opts, 'ghg');
  assert.deepStrictEqual(ids(ghg), ['A00', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08']);
  const kwh = AS.sortOptions(opts, 'kwh');
  const rule = list => list.map(o => o.rule);
  assert.deepStrictEqual(rule(kwh), ['baseline', 'pump_upgrade', 'solar_pv', 'nrw_reduction', 'septic_desludging', 'cso_reduction', 'pump_audit', 'pump_audit', 'fuel_switch']);
  assert.deepStrictEqual([kwh[4].expected_kwh, AS.benefitStatus(kwh[4], 'kwh')], [0, 'not_quantified'], 'the desludging placeholder 0 sorts with the unquantified options');
  assert.ok(kwh.slice(4).every(o => !AS.isQuantified(o, 'kwh')) && kwh.slice(1, 4).every(o => AS.isQuantified(o, 'kwh')));
  // same objects, nothing rewritten
  assert.ok(kwh.every(o => opts.includes(o)));
  assert.strictEqual(JSON.stringify(opts), snapshot, 'input array and options unchanged');
  // equal values keep their stored order
  const tie = [{ rule: 'x', id: 'B1', expected_kgco2: 5 }, { rule: 'x', id: 'B2', expected_kgco2: 5 }, { rule: 'x', id: 'B3', expected_kgco2: null }];
  assert.deepStrictEqual(ids(AS.sortOptions(tie, 'ghg')), ['B1', 'B2', 'B3']);
});

test('sorted cards keep selection, notes, open state and estimates; each shows its measure and qualifiers', () => {
  const opts = options();
  const sel = new Set([byRule(opts, 'septic_desludging').key, byRule(opts, 'pump_upgrade').key]);
  const notes = { [byRule(opts, 'septic_desludging').key]: 'Synthetic note' };
  const open = new Set([byRule(opts, 'cso_reduction').key]);
  const render = (list, measure) => Object.fromEntries(list.map(o => [o.key, DC.card(o, ctx(), {
    selected: sel.has(o.key), note: notes[o.key] || '', open: open.has(o.key), measure })]));
  const before = render(opts, null), after = render(AS.sortOptions(opts, 'kwh'), 'kwh');
  const strip = h => h.replace(/<p class="small dc-line" data-sort-measure[\s\S]*?<\/p>/, '');
  for (const k of Object.keys(before)) assert.strictEqual(strip(after[k]), before[k], `card ${k} unchanged apart from the measure line`);
  const desl = after[byRule(opts, 'septic_desludging').key];
  assert.ok(desl.includes('checked') && desl.includes('Synthetic note') && desl.includes('data-quantified="false"') && desl.includes('<b>Energy benefit not quantified</b>'));
  assert.ok(!desl.includes('0 kWh'), 'the placeholder is never shown as zero');
  assert.ok(after[byRule(opts, 'cso_reduction').key].includes('data-quantified="false"') && after[byRule(opts, 'cso_reduction').key].includes('<details data-details="' + byRule(opts, 'cso_reduction').key + '" open'));
  const ghgCso = DC.card(byRule(opts, 'cso_reduction'), ctx(), { measure: 'ghg' });
  assert.ok(ghgCso.includes('Up to the full untreated-discharge emission'), 'upper-bound wording stays with the number');
  assert.ok(!after[byRule(opts, 'cso_reduction').key].includes('Up to the full'), 'and is not attached to an energy measure it does not describe');
  assert.ok(DC.card(byRule(opts, 'septic_desludging'), ctx(), { measure: 'ghg' }).includes('(scenario)'));
  const noPumpEnergy = clone(sample[0]);
  noPumpEnergy.Water.Abstraction[0].wsa_nrg_pump = 0;
  assert.ok(DC.card(byRule(options(noPumpEnergy), 'pump_upgrade'), ctx(), { measure: 'ghg' }).includes('data-review="pump_energy_basis"'), 'pump review notice stays on its card');
  assert.ok(!Object.values(after).some(h => /best action/i.test(h)));
});

// ------------------------------------------------------------------ largest contributor
test('largest contributor uses ECAM first-level components without double counting', () => {
  const a = clone(sample[0]);
  const r = engine.calculateOne(a, 0);
  const { rows, subTotals } = AS.rowsFromResults(r, meta(a, 'a_main'));
  const sum = rows.reduce((t, x) => t + (x.kg || 0), 0);
  assert.ok(Math.abs(sum - r.totals.total) < 1e-6 * r.totals.total, 'components add up to TotalGHG exactly once');
  assert.ok(!rows.some(x => /^(biog_|slu_)/.test(x.component)), 'children of biog/slu are not listed next to their parents');
  const c = AS.largestContributor(rows, subTotals, r.totals.total);
  assert.strictEqual(c.status, 'ok');
  assert.deepStrictEqual(c.top.map(x => [x.prefix, x.sid, x.component, x.source, x.classification]), [['wwo', 'wwo_0', 'containment', 'containment', null]]);
  assert.strictEqual(c.top[0].kg, r.substages.find(s => s.prefix === 'wwo').outputs.wwo_KPI_GHG_containment.total);
  assert.ok(Math.abs(c.top[0].share - c.top[0].kg / r.totals.total) < 1e-12 && c.top[0].share < 1);
  const html = DC.contributor(c, ctx());
  assert.ok(html.includes('Largest assessed contributor') && html.includes('Classification pending review') && html.includes('% of the assessed total'));
});

test('contributor: ties, zero totals, unavailable values and inconsistent breakdowns', () => {
  const row = (sid, component, kg, prefix = 'wsa') => ({ prefix, sid, name: sid, component, kg });
  let r = AS.largestContributor([row('s1', 'elec', 10), row('s1', 'fuel', 0), row('s2', 'elec', 10), row('s2', 'fuel', 0)], [{ sid: 's1', kg: 10 }, { sid: 's2', kg: 10 }], 20);
  assert.deepStrictEqual([r.status, r.top.length, r.top[0].share], ['ok', 2, 0.5]);
  assert.ok(DC.contributor(r, ctx()).includes('data-tied="true"'));
  r = AS.largestContributor([row('s1', 'elec', 0), row('s1', 'fuel', 0)], [{ sid: 's1', kg: 0 }], 0);
  assert.strictEqual(r.status, 'zero_total');
  assert.ok(DC.contributor(r, ctx()).includes('No emissions have been calculated'));
  r = AS.largestContributor([row('s1', 'elec', 7), row('s1', 'fuel', null)], [{ sid: 's1', kg: 7 }], 7);
  assert.strictEqual(r.status,'incomplete');assert.ok(!r.top?.length,'an unavailable component prevents a complete contributor ranking');
  r = AS.largestContributor([row('s1', 'elec', 7), row('s1', 'fuel', 1)], [{ sid: 's1', kg: 20 }], 20);
  assert.strictEqual(r.status, 'inconsistent', 'a breakdown that does not add up is not used');
  assert.strictEqual(AS.largestContributor([], [], 0).status, 'zero_total');
});

// ------------------------------------------------------------------ compatibility, freshness and exports
test('saved and older options resolve the same way after a save/reload round trip', () => {
  const opts = options();
  const reloaded = JSON.parse(JSON.stringify(opts));
  assert.deepStrictEqual(reloaded.map(AS.describe), opts.map(AS.describe));
  // schema-1 selections had no key and sometimes no substage: still described, never classified beyond the mapping
  const old = { rule: 'septic_desludging', title: { en: 'Scheduled desludging – Household septic tanks' } };
  const d = AS.describe(old);
  assert.deepStrictEqual([d.mapped, d.location, d.assessmentId, d.sources[0].classification], [true, { at: 'substage', prefix: null, sid: null }, null, null]);
  assert.ok(!DC.card({ ...old, key: undefined, id: 'A01' }, ctx(), {}).includes('data-goto-source'), 'no link without a known source');
});

async function project(rules = ['pump_upgrade', 'septic_desludging']) {
  const assessment = clone(sample[0]), id = 'a_main', m = meta(assessment, id);
  const inputStatus=confirmedInputs(assessment,m),supportRevision=require('../engine/assessment-validity').calculate(assessment,0,{meta:m,inputStatus}).supportRevision;
  const opts = options(assessment, id);
  const selectedActions = opts.filter(o => rules.includes(o.rule)).map(o => ({ ...o, notes: '' }));
  const basis = { assessmentId: id, revision: CW.revision(assessment), gwpIndex: 0, supportRevision };
  const profile = { name: 'Utility A (hypothetical)' }, financing = { route: 'general' };
  const plan = { ...buildPlan(selectedActions, 'en'), summary: 'Synthetic summary.', deps: CW.planDeps({ assessmentId: id, assessment, gwpIndex: 0, actions: selectedActions, profile, supportRevision }) };
  const fw = P.financingFrameworks().find(f => f.id === 'general');
  const proposal = { ...(await P.draftProposal({ results: engine.calculateOne(assessment, 0), actions: selectedActions, plan, profile, lang: 'en' }, fw)),
    deps: CW.proposalDeps({ assessmentId: id, assessment, gwpIndex: 0, actions: selectedActions, plan, profile, financing, supportRevision }) };
  return { inputStatus:{[id]:inputStatus},assessments: [assessment], assessmentMeta: [m], gwpIndex: 0, actionResult: { assessmentId: id, basis, options: opts }, actionSet: { ...basis, savedAt: 'now' }, selectedActions, plan, proposal, profile, financing, lang: 'en', ui: { actionSort: 'ghg' } };
}
const fresh = s => CW.freshness({
  assessments: s.assessmentMeta.map((m, i) => ({ id: m.id, revision: CW.revision(s.assessments[i]) })),
  gwpIndex: s.gwpIndex, actionResult: s.actionResult, actionSet: s.actionSet, selectedActions: s.selectedActions,
  plan: s.plan, proposal: s.proposal, profile: s.profile, financing: s.financing,
});
const exportIssues = (s, opts) => { try { I.exportContext(s, opts); return []; } catch (e) { assert.strictEqual(e.status, 409); return e.issues; } };

test('sorting and display labels do not mark plans or proposals outdated; real edits still do and still block export', async () => {
  const s = await project();
  assert.deepStrictEqual(fresh(s), { options: [], actions: [], plan: [], proposal: [] });
  // re-sorted cards and stored options in another order
  s.actionResult.options = AS.sortOptions(s.actionResult.options, 'kwh');
  s.selectedActions = AS.sortOptions(s.selectedActions, 'kwh').reverse();
  s.ui.actionSort = 'kwh';
  assert.deepStrictEqual(fresh(s), { options: [], actions: [], plan: [], proposal: [] });
  assert.deepStrictEqual(exportIssues(s, { requireProposal: true }), []);
  // existing protections unchanged
  s.plan.summary += ' Edited (synthetic).';
  assert.ok(fresh(s).proposal.includes('plan_changed'));
  assert.ok(exportIssues(s, { requireProposal: true }).some(x => /project plan changed/.test(x)));
  s.selectedActions[0] = { ...s.selectedActions[0], notes: 'changed note' };
  assert.ok(fresh(s).plan.includes('actions_changed'));
});

test('Word and ZIP exports carry the same source labels as the cards, in the output language', async () => {
  const s = await project();
  const docText = async lang => (await (await JSZip.loadAsync(await X.buildProposalDocx({ lang, proposal: s.proposal, results: engine.calculateOne(s.assessments[0], 0), actions: s.selectedActions, plan: s.plan, profile: s.profile })))
    .file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const en = await docText('en');
  assert.ok(en.includes('Addresses: Methane from faecal sludge containment — Onsite sanitation. Containment: Classification pending review'), en.slice(0, 400));
  assert.ok(en.includes('Addresses: Pump efficiency below the expected value — Water abstraction. Grid electricity: Indirect emissions'));
  const id = await docText('id');
  assert.ok(id.includes('Menangani: Metana dari penampungan lumpur tinja') && id.includes('Klasifikasi menunggu tinjauan'));
  const zip = await JSZip.loadAsync(await X.buildZip({ ...s, results: [engine.calculateOne(s.assessments[0], 0)] }, null));
  const sel = JSON.parse(await zip.file('actions/selected-actions.json').async('string'));
  assert.deepStrictEqual(sel.map(a => [a.rule, a.addresses.sources.map(x => x.classification)]), [['septic_desludging', [null]], ['pump_upgrade', ['indirect']]]);
  assert.deepStrictEqual(sel.map(a => a.expected_kgco2), s.selectedActions.map(a => a.expected_kgco2), 'estimates unchanged');
});

// ------------------------------------------------------------------ benefit status
test('unquantified energy is distinct from a calculated zero in status, sorting, cards and exports', () => {
  const opts = options();
  const desl = byRule(opts, 'septic_desludging');
  assert.deepStrictEqual([desl.expected_kwh, desl.benefit_status], [0, { kgco2: 'quantified', kwh: 'not_quantified' }], 'stored number unchanged, status explicit');
  assert.deepStrictEqual(byRule(opts, 'pump_upgrade').benefit_status, { kgco2: 'quantified', kwh: 'quantified' });
  assert.strictEqual(byRule(opts, 'cso_reduction').benefit_status.kwh, 'not_quantified');
  // older saved desludging actions have no benefit_status: the known placeholder still reads as not quantified
  const { benefit_status, ...oldDesl } = desl;
  assert.strictEqual(AS.benefitStatus(oldDesl, 'kwh'), 'not_quantified');
  assert.strictEqual(AS.benefitStatus(oldDesl, 'ghg'), 'quantified');
  // SYNTHETIC options: a calculated zero stays a quantified zero, with or without explicit status
  const zero = { rule: 'nrw_reduction', id: 'Z1', key: 'z1', expected_kgco2: 0, expected_kwh: 0, benefit_status: { kgco2: 'quantified', kwh: 'quantified' } };
  const oldZero = { rule: 'nrw_reduction', id: 'Z2', key: 'z2', expected_kgco2: 0, expected_kwh: 0 };
  const none = { rule: 'fuel_switch', id: 'Z3', key: 'z3', expected_kgco2: null, expected_kwh: null };
  assert.deepStrictEqual([zero, oldZero].map(o => AS.benefitStatus(o, 'kwh')), ['quantified', 'quantified']);
  const order = AS.sortOptions([none, oldDesl, desl, oldZero, zero, { rule: 'solar_pv', id: 'Z4', expected_kwh: 10 }], 'kwh').map(o => o.id || 'desl');
  assert.deepStrictEqual(order, ['Z4', 'Z2', 'Z1', 'Z3', desl.id, desl.id], 'calculated values (incl. zero) first, then unquantified in stored order');
  const zeroLine = DC.card({ ...zero, title: 'Synthetic zero' }, ctx(), { measure: 'kwh' });
  assert.ok(zeroLine.includes('<b>0 kWh</b>') && zeroLine.includes('data-quantified="true"'));
  // cards and exports use the same wording
  assert.ok(DC.card(desl, ctx(), {}).includes('data-kwh-status="not_quantified"') && DC.card(desl, ctx(), {}).includes('Energy benefit not quantified'));
  assert.ok(DC.card(desl, ctx('id'), {}).includes('Manfaat energi belum dihitung'));
  assert.ok(!DC.card(byRule(opts, 'pump_upgrade'), ctx(), {}).includes('data-kwh-status'));
  assert.match(X.expectedText(desl, 'en'), /tCO2eq \(scenario\) · Energy benefit not quantified$/);
  assert.match(X.expectedText(oldDesl, 'id'), /Manfaat energi belum dihitung$/);
  assert.ok(!/kWh/.test(X.expectedText(desl, 'en')));
  const f = P.facts({ results: engine.calculateOne(clone(sample[0]), 0), actions: [desl, byRule(opts, 'pump_upgrade')], lang: 'en' });
  assert.deepStrictEqual(f.selected_actions.map(a => [a.expected_kwh, a.energy_benefit]), [[null, 'not quantified'], [Math.round(byRule(opts, 'pump_upgrade').expected_kwh), 'quantified']]);
});

// ------------------------------------------------------------------ combined savings
test('pump upgrade + solar: individual estimates unchanged and no unadjusted sum is claimed anywhere', async () => {
  const s = await project(['pump_upgrade', 'solar_pv']);
  const opts = options();
  const pump = byRule(opts, 'pump_upgrade'), solar = byRule(opts, 'solar_pv');
  // estimates are the rule outputs, untouched by selection, plan or proposal
  for (const a of s.selectedActions) {
    const o = byRule(opts, a.rule);
    assert.deepStrictEqual([a.expected_kgco2, a.expected_kwh], [o.expected_kgco2, o.expected_kwh], `${a.rule} estimate unchanged`);
  }
  // HYPOTHETICAL sample figures as calculated before this change
  assert.deepStrictEqual([fmt(pump.expected_kgco2 / 1000, 0), fmt(pump.expected_kwh, 0), fmt(solar.expected_kgco2 / 1000, 0), fmt(solar.expected_kwh, 0)], ['566', '836,297', '538', '795,000']);
  const t1 = n => (n / 1000);
  const sums = [
    fmt(t1(pump.expected_kgco2) + t1(solar.expected_kgco2), 0), fmt(+(t1(pump.expected_kgco2)).toFixed(1) + +(t1(solar.expected_kgco2)).toFixed(1), 0),
    fmt(pump.expected_kwh + solar.expected_kwh, 0),
  ];
  const noSum = (text, where) => {
    for (const n of sums) assert.ok(!text.includes(n), `${where} must not contain the summed figure ${n}`);
    assert.ok(!/add up|in total|combined (reduction|saving)s? of|Pengurangan yang telah dihitung sekitar/i.test(text), `${where} must not describe a total`);
  };
  const results = engine.calculateOne(s.assessments[0], 0);
  for (const lang of ['en', 'id']) {
    const summary = (await P.planSummary({ results, actions: s.selectedActions, plan: s.plan, profile: s.profile, lang })).text;
    noSum(summary, `${lang} plan summary`);
    assert.ok(summary.includes(lang === 'en' ? 'Combined savings have not been assessed because actions may overlap.' : 'Penghematan gabungan belum dinilai karena kegiatan dapat saling tumpang tindih.'), summary);
    for (const a of [pump, solar]) assert.ok(summary.includes(X.expectedText(a, lang)), `${lang}: each estimate listed separately (${a.rule})`);
    // the proposal built from that summary, and the Word file built from that proposal
    const plan = { ...s.plan, summary, lang };
    const fw = P.financingFrameworks().find(x => x.id === 'general');
    const proposal = await P.draftProposal({ results, actions: s.selectedActions, plan, profile: s.profile, lang }, fw);
    for (const sec of proposal.sections) noSum(sec.text, `${lang} proposal section ${sec.key}`);
    assert.ok(proposal.sections.find(x => x.key === 'actions').text.includes(lang === 'en' ? 'Combined savings have not been assessed' : 'Penghematan gabungan belum dinilai'));
    assert.ok(!/total expected reduction/i.test(proposal.sections.find(x => x.key === 'summary').guidance), 'guidance no longer asks for a total');
    const doc = (await (await JSZip.loadAsync(await X.buildProposalDocx({ lang, proposal, results, actions: s.selectedActions, plan, profile: s.profile })))
      .file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    noSum(doc, `${lang} Word export`);
    assert.ok(doc.includes(UI[lang].combined_not_assessed), `${lang} Word export states that combined savings were not assessed`);
  }
  const f = P.facts({ results, actions: s.selectedActions, lang: 'en' });
  assert.match(f.combined_savings, /^not assessed/);
  assert.ok(!('total_expected_tco2eq' in f) && !JSON.stringify(f).includes(sums[0]), 'facts carry no package total');
  const zip = await JSZip.loadAsync(await X.buildZip({ ...s, results: [results] }, null));
  assert.ok((await zip.file('README.txt').async('string')).includes('combined savings have not been assessed because actions may overlap'));
  const sys = P.prompt('system-base') + P.prompt('project-plan');
  assert.ok(/Never add estimates of several actions together/.test(sys) && /not quantified" is unknown, not zero/.test(sys));
});

test('older generated text with a summed-reduction sentence is flagged and blocks export, but is never rewritten', async () => {
  const s = await project(['pump_upgrade', 'solar_pv']);
  assert.deepStrictEqual(exportIssues(s, { requireProposal: true }), []);
  const oldSentence = 'Calculated reductions add up to about 1,104 tCO2eq per assessment period (some are scenarios — see assumptions).';
  // SYNTHETIC older plan: the earlier template sentence plus a user edit, made current via the existing deps
  s.plan.summary = `Synthetic plan. ${oldSentence} User-written closing line.`;
  s.plan.deps = CW.planDeps({ assessmentId: 'a_main', assessment: s.assessments[0], gwpIndex: 0, actions: s.selectedActions, profile: s.profile });
  s.proposal.deps = CW.proposalDeps({ assessmentId: 'a_main', assessment: s.assessments[0], gwpIndex: 0, actions: s.selectedActions, plan: s.plan, profile: s.profile, financing: s.financing });
  const before = JSON.stringify(s.plan);
  assert.deepStrictEqual(fresh(s), { options: [], actions: [], plan: [], proposal: [] }, 'not an outdated-input problem');
  assert.deepStrictEqual(CW.summedClaims(s), { plan: true, proposal: [] });
  assert.ok(exportIssues(s, { requireProposal: true }).some(x => /Project plan: the summary adds the actions' reductions together/.test(x)));
  assert.throws(() => I.requireCurrentPlan({ ...s, assessment: s.assessments[0], meta: s.assessmentMeta[0], actions: s.selectedActions }), e => e.status === 409);
  assert.strictEqual(JSON.stringify(s.plan), before, 'checking never rewrites the text');
  // an Indonesian sentence inside a proposal section is found too
  const sec = s.proposal.sections.find(x => x.key === 'summary');
  sec.text = 'Pengurangan yang telah dihitung sekitar 1.104 tCO2eq per periode. Teks pengguna.';
  assert.deepStrictEqual(CW.summedClaims(s).proposal, [sec.title]);
  // the user deletes the sentence: the existing edit protection then marks the proposal outdated until it is regenerated
  s.plan.summary = 'Synthetic plan. User-written closing line.';
  assert.strictEqual(CW.summedClaims(s).plan, false);
  assert.ok(fresh(s).proposal.includes('plan_changed'));
  // regenerating keeps the old proposal as the previous version
  const state = { proposal: s.proposal };
  const fw = P.financingFrameworks().find(x => x.id === 'general');
  await CW.regenerate(state, 'proposal', () => P.draftProposal({ results: engine.calculateOne(s.assessments[0], 0), actions: s.selectedActions, plan: s.plan, profile: s.profile, lang: 'en' }, fw));
  assert.deepStrictEqual(CW.summedClaims({ plan: s.plan, proposal: state.proposal }), { plan: false, proposal: [] });
  assert.ok(state.previous.proposal.value.sections.some(x => x.text.includes('Teks pengguna.')), 'previous version restorable');
});

test('benefit status adds no freshness change: older saved actions without it stay current and match the server', async () => {
  const s = await project();
  const old = s.selectedActions.map(({ benefit_status, ...a }) => a);
  assert.strictEqual(CW.actionsFingerprint(old), CW.actionsFingerprint(s.selectedActions));
  assert.deepStrictEqual(I.actionIssues({ inputStatus:s.inputStatus[s.assessmentMeta[0].id],assessment: s.assessments[0], meta: s.assessmentMeta[0], gwpIndex: 0, actions: old, actionSet: s.actionSet }), []);
  assert.deepStrictEqual(exportIssues({ ...s, selectedActions: old }, { requireProposal: true }), []);
});

(async () => {
  console.log('Action clarity');
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok -', name); }
  console.log(`\n${passed} action-clarity tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
