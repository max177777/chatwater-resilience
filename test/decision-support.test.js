/*
 * Decision cards and missing-data checks (proposed feature). Synthetic edits of the
 * HYPOTHETICAL sample utility only; no external calls. Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CW = require('../public/js/cw-core');
const DC = require('../public/js/decision-cards');
const engine = require('../engine/ecam-engine');
const { suggestActions, NRW_TRIGGER } = require('../engine/actions');
const I = require('../engine/integrity');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta, clone } = require('./helpers/fixtures');

const UI = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8') + ';UI');
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function run(assessment, id = 'a_main') {
  const m = meta(assessment, id);
  const r = suggestActions(engine.calculateOne(assessment, 0), assessment, engine, 0);
  return { options: CW.withKeys(r.options, m), checks: CW.withCheckIds(r.checks, m), meta: m };
}
const checkOf = (checks, id, sid) => checks.find(c => c.check === id && c.sid === sid);
const fmt = (n, d) => (n == null || !Number.isFinite(n)) ? '–' : new Intl.NumberFormat('en-US', { maximumFractionDigits: d === undefined ? (Math.abs(n) >= 1000 ? 0 : 1) : d }).format(n);
const ctxFor = (statusMap, aid = 'a_main', lang = 'en') => ({
  t: k => UI[lang][k] ?? UI.en[k] ?? k,
  L: o => (o && typeof o === 'object') ? (o[lang] || o.en) : (o ?? ''),
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmt, labelOf: code => code, unitView: () => ({ unit: '', mult: 1 }),
  status: (sid, code, value) => CW.inputState(statusMap[aid], sid, code, value),
});
const cardOf = (o, checks, statusMap, opts = {}) => DC.card(o, ctxFor(statusMap), { checks, ...opts });
const st = (origin, confirmed = false) => ({ origin, confirmed });

// ------------------------------------------------------------------ input status
test('a manual zero is "entered manually", an untouched default is "default", and neither is inferred from the number', () => {
  const map = { a_new: { origin: 'new', s: {} } };
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wwo_0', 'wwo_cont_emp', 0), st('default'));
  CW.setInputOrigin(map, 'a_new', 'wwo_0', 'wwo_cont_emp', 'manual', 0);
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wwo_0', 'wwo_cont_emp', 0), st('manual'), 'explicit zero is not missing');
  assert.strictEqual(CW.needsConfirm(st('manual')), false);
  // an untouched non-zero default is still a default, not measured data
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wsa_0', 'wsa_pmp_pf', 0.9), st('default'));
  // value changed outside an entry (e.g. ECAM reset a question): the record no longer applies
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wwo_0', 'wwo_cont_emp', 10), st('unknown'));
  assert.ok(CW.isTracked('wsd', 'wsd_auth_con') && CW.isTracked('wwo', 'wwo_cont_emp') && !CW.isTracked('wsd', 'wsd_nrg_cons'));
});

test('ECAM estimates and typical values keep their origin when confirmed; a new value resets both', () => {
  const map = { a_new: { origin: 'new', s: {} } };
  CW.setInputOrigin(map, 'a_new', 'wsd_0', 'wsd_vol_dist', 'estimate', 5000);
  CW.setInputOrigin(map, 'a_new', 'wwo_0', 'wwo_cont_emp', 'typical', 10);
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wsd_0', 'wsd_vol_dist', 5000), st('estimate'));
  assert.ok(CW.needsConfirm(st('estimate')) && CW.needsConfirm(st('typical')));
  CW.confirmInputValue(map, 'a_new', 'wsd_0', 'wsd_vol_dist', 5000);
  CW.confirmInputValue(map, 'a_new', 'wwo_0', 'wwo_cont_emp', 10);
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wsd_0', 'wsd_vol_dist', 5000), st('estimate', true));
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wwo_0', 'wwo_cont_emp', 10), st('typical', true));
  const check = { sid: 'wsd_0', inputs: [{ code: 'wsd_vol_dist', value: 5000 }], missing: [], untracked: [] };
  const html = DC.panel([{ ...check, check: 'nrw', status: 'triggered', name: 'D', rules: ['nrw_reduction'] }], [], ctxFor(map, 'a_new'));
  assert.ok(html.includes('data-input-origin="estimate" data-input-confirmed="true"') && html.includes('ECAM estimate · Confirmed'));
  assert.ok(!html.includes('Entered manually'), 'an estimate is never shown as a manual entry');
  // a manual edit after confirming is a new, manual value
  CW.setInputOrigin(map, 'a_new', 'wsd_0', 'wsd_vol_dist', 'manual', 6000);
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wsd_0', 'wsd_vol_dist', 6000), st('manual'));
  // confirming a value whose record is stale does not invent an origin
  CW.confirmInputValue(map, 'a_new', 'wsd_0', 'wsd_vol_dist', 7000);
  assert.deepStrictEqual(CW.inputState(map.a_new, 'wsd_0', 'wsd_vol_dist', 7000), st('default', true));
  // records saved before origins were split
  const old = { a: { origin: 'unknown', s: { x: { e: { st: 'entered', v: 1 }, c: { st: 'confirmed', v: 2 } } } } };
  assert.deepStrictEqual(CW.inputState(old.a, 'x', 'e', 1), st('manual'));
  assert.deepStrictEqual(CW.inputState(old.a, 'x', 'c', 2), st('unknown', true));
});

test('imported and older-session inputs show "Source not recorded · Not confirmed" until the user confirms them', () => {
  const a = clone(sample[0]);
  const { options, checks } = run(a);
  const map = {}; // sample, ECAM file or session saved before this feature: no record
  for (const v of [0, 26000000]) assert.deepStrictEqual(CW.inputState(map.a_main, 'wsd_0', 'wsd_auth_con', v), st('unknown'));
  const nrw = options.find(o => o.rule === 'nrw_reduction');
  let html = cardOf(nrw, checks, map);
  assert.ok(html.includes('Source not recorded · Not confirmed') && html.includes('data-confirm="wsd_0|wsd_auth_con"'));
  assert.ok(html.includes('data-pending="2"'));
  CW.confirmInputValue(map, 'a_main', 'wsd_0', 'wsd_auth_con', 26000000);
  CW.confirmInputValue(map, 'a_main', 'wsd_0', 'wsd_vol_dist', 37000000);
  html = cardOf(nrw, checks, map);
  assert.ok(!html.includes('Not confirmed') && !html.includes('data-pending') && html.includes('Source not recorded · Confirmed'));
  // the panel counts every unconfirmed input across the covered checks
  const panel = DC.panel(checks, options, ctxFor({}));
  const total = checks.reduce((n, c) => n + c.inputs.length, 0);
  assert.ok(panel.includes(`data-pending-total="${total}"`), 'all imported inputs unconfirmed');
});

// ------------------------------------------------------------------ not assessed vs not triggered
test('sample: covered checks report triggered or not assessed, consistent with the options produced', () => {
  const { options, checks } = run(clone(sample[0]));
  assert.strictEqual(checkOf(checks, 'pump_efficiency', 'wsa_0').status, 'triggered');
  const wsd = checkOf(checks, 'pump_efficiency', 'wsd_0');
  assert.deepStrictEqual([wsd.status, wsd.reason], ['not_assessed', 'no_efficiency']);
  assert.deepStrictEqual(wsd.missing, ['wsd_pmp_flow', 'wsd_pmp_head', 'wsd_pmp_volt', 'wsd_pmp_amps']);
  assert.strictEqual(checkOf(checks, 'nrw', 'wsd_0').status, 'triggered');
  assert.strictEqual(checkOf(checks, 'desludging', 'wwo_0').status, 'triggered');
  // the "verify pump" option is offered exactly where efficiency could not be assessed and electricity is used
  assert.ok(options.some(o => o.rule === 'pump_audit' && DC.optionSid(o) === 'wsd_0'));
});

test('"not assessed" (input missing) is distinguished from "not triggered" (condition not met)', () => {
  const cases = [
    [a => { a.Water.Distribution[0].wsd_auth_con = 0; }, 'nrw', 'wsd_0', 'not_assessed', 'missing_volumes'],
    [a => { a.Water.Distribution[0].wsd_auth_con = 36000000; }, 'nrw', 'wsd_0', 'not_triggered', 'nrw_at_or_below_trigger'],
    [a => { a.Waste.Onsite[0].wwo_cont_emp = 50; }, 'desludging', 'wwo_0', 'not_triggered', 'emptying_at_or_above_scenario'],
    [a => { a.Water.Abstraction[0].wsa_pmp_exff = 0; }, 'pump_efficiency', 'wsa_0', 'not_assessed', 'no_expected_efficiency'],
    [a => { a.Water.Abstraction[0].wsa_pmp_exff = 40; }, 'pump_efficiency', 'wsa_0', 'not_triggered', 'saving_not_positive'],
  ];
  for (const [edit, id, sid, status, reason] of cases) {
    const a = clone(sample[0]); edit(a);
    const { options, checks } = run(a);
    const c = checkOf(checks, id, sid);
    assert.deepStrictEqual([c.status, c.reason], [status, reason], `${id} ${status}`);
    const offered = options.some(o => c.rules[0] === o.rule && DC.optionSid(o) === sid);
    assert.strictEqual(offered, false, `${id}: no option when ${status}`);
  }
  const a = clone(sample[0]); a.Water.Distribution[0].wsd_auth_con = 0;
  const c = checkOf(run(a).checks, 'nrw', 'wsd_0');
  assert.deepStrictEqual(c.missing, ['wsd_auth_con']);
  const html = DC.panel([c], [], ctxFor({}));
  assert.ok(html.includes('Not assessed — information missing') && html.includes('Inputs at zero, source unknown or not confirmed: wsd_auth_con'));
  const b = clone(sample[0]); b.Water.Distribution[0].wsd_auth_con = 36000000;
  const nt = DC.panel([checkOf(run(b).checks, 'nrw', 'wsd_0')], [], ctxFor({}));
  assert.ok(nt.includes('Checked — condition not met') && nt.includes(`${NRW_TRIGGER * 100}% trigger`));
});

test('a confirmed zero is described neutrally, never as missing, and the rule outcome is unchanged', () => {
  const a = clone(sample[0]); a.Water.Distribution[0].wsd_auth_con = 0;
  const { options, checks } = run(a);
  const nrw = checks.filter(c => c.check === 'nrw');
  const NEUTRAL = 'Confirmed value: 0. The current rule does not evaluate this case.';
  // untouched default zero: still unknown, still "information missing"
  const map = { a_main: { origin: 'new', s: {} } };
  let html = DC.panel(nrw, [], ctxFor(map));
  assert.ok(html.includes('data-input="wsd_auth_con" data-input-origin="default"') && html.includes('Not assessed — information missing'));
  assert.ok(!html.includes(NEUTRAL));
  // confirmed zero
  CW.confirmInputValue(map, 'a_main', 'wsd_0', 'wsd_auth_con', 0);
  html = DC.panel(nrw, [], ctxFor(map));
  assert.ok(html.includes(`wsd_auth_con: ${NEUTRAL}`));
  assert.ok(html.includes('data-rule-result="not_evaluated"') && html.includes('Not evaluated by the current rule'));
  assert.ok(!html.includes('information missing') && !html.includes('Inputs at zero'));
  const row = html.match(/<tr data-check="nrw"[^]*?<\/tr>/)[0];
  assert.ok(!/not applicable|condition not met/i.test(row), 'no scientific interpretation of the zero');
  // a manually entered zero is reported as entered, not confirmed
  const m2 = { a_main: { origin: 'new', s: {} } };
  CW.setInputOrigin(m2, 'a_main', 'wsd_0', 'wsd_auth_con', 'manual', 0);
  assert.ok(DC.panel(nrw, [], ctxFor(m2)).includes('Entered value: 0. The current rule does not evaluate this case.'));
  // an unconfirmed ECAM estimate of zero is not a user-set value
  const m3 = { a_main: { origin: 'new', s: {} } };
  CW.setInputOrigin(m3, 'a_main', 'wsd_0', 'wsd_auth_con', 'estimate', 0);
  assert.ok(DC.panel(nrw, [], ctxFor(m3)).includes('Inputs at zero, source unknown or not confirmed: wsd_auth_con'));
  // status is shown, never enforced
  assert.strictEqual(checkOf(checks, 'nrw', 'wsd_0').status, 'not_assessed');
  assert.ok(!options.some(o => o.rule === 'nrw_reduction'));
});

// ------------------------------------------------------------------ units
test('card values use the Stage 1 conversion: stored 1.27 m³/s shows as 1,270 L/s, or in the user-selected unit', () => {
  const E = engine._ecam;
  const a = clone(sample[0]);
  const { options, checks } = run(a);
  const pump = options.find(o => o.rule === 'pump_upgrade' && DC.optionSid(o) === 'wsa_0');
  assert.strictEqual(a.Water.Abstraction[0].wsa_pmp_flow, 1.27, 'stored in ECAM base unit (m³/s)');
  const ctxUnits = sc => ({ ...ctxFor({}), unitView: code => CW.unitView(E.Units, E.Info, sc, code) });
  let html = DC.card(pump, ctxUnits(E.Ecam.from(clone(a))), { checks, open: true });
  assert.ok(html.includes('wsa_pmp_flow: <b>1,270</b> L/s'), 'default display unit');
  assert.ok(!html.includes('<b>1.3</b> L/s') && !html.includes('<b>1.27</b> L/s'));
  assert.ok(html.includes('wsa_pmp_head: <b>45</b> m'));
  // user-selected unit (ECAM Configuration.Units), same rule as ECAM's own Units.multiplier
  a.Configuration = { ...(a.Configuration || {}), Units: { wsa_pmp_flow: 'm3/day' } };
  const sc = E.Ecam.from(clone(a));
  engine.calculateOne(a); E.setGlobal(sc);
  assert.strictEqual(E.Units.multiplier('wsa_pmp_flow'), CW.unitView(E.Units, E.Info, sc, 'wsa_pmp_flow').mult);
  html = DC.card(pump, ctxUnits(sc), { checks, open: true });
  assert.ok(html.includes('wsa_pmp_flow: <b>109,728</b> m³/day'), '1.27 m³/s × 86,400 s/day');
  // the conversion is display only: figures and keys are unchanged by the preference
  const again = run(a).options.find(o => o.key === pump.key);
  assert.deepStrictEqual([again.expected_kwh, again.expected_kgco2], [pump.expected_kwh, pump.expected_kgco2]);
});

// ------------------------------------------------------------------ coverage and review flags
test('"option offered by current rule" is separate from input completeness; known untracked inputs are listed', () => {
  const { options, checks } = run(clone(sample[0]));
  const pumpCheck = checkOf(checks, 'pump_efficiency', 'wsa_0');
  assert.deepStrictEqual(pumpCheck.untracked, ['wsa_nrg_pump', 'wsa_nrg_cons', 'wsa_conv_kwh']);
  const panel = DC.panel(checks, options, ctxFor({}), { open: true });
  assert.ok(panel.includes('Option offered by current rule') && panel.includes('it does not mean the inputs are complete'));
  assert.ok(panel.includes('data-completeness="0/6"') && panel.includes('Tracked inputs: 0 of 6 entered manually or confirmed.'));
  assert.ok(panel.includes('Known untracked dependencies (list may be incomplete): wsa_nrg_pump; wsa_nrg_cons; wsa_conv_kwh'));
  assert.ok(panel.includes('wwo_bod_cont; wwo_bod_rmvd; wwo_ch4_efac_con') && panel.includes('wsa_nrg_cons; wst_nrg_cons; wsd_nrg_cons; conv_kwh_co2'));
  // completeness counts manual entries and confirmations only
  const map = { a_main: { origin: 'unknown', s: {} } };
  CW.confirmInputValue(map, 'a_main', 'wwo_0', 'wwo_cont_emp', 0);
  assert.ok(DC.panel([checkOf(checks, 'desludging', 'wwo_0')], options, ctxFor(map)).includes('data-completeness="1/1"'));
  const desl = cardOf(options.find(o => o.rule === 'septic_desludging'), checks, map, { open: true });
  assert.ok(desl.includes('Tracked inputs: 1 of 1') && desl.includes('Known untracked dependencies'), 'complete tracked inputs still list untracked ones');
});

test('pump options carry a review notice when pumping energy is zero or differs from total energy; nothing else changes', () => {
  const NOTICE = 'The savings calculation uses total substage energy and pumping energy. Confirm that this calculation is appropriate before using the estimate.';
  const base = run(clone(sample[0]));
  const pumpOf = r => r.options.find(o => o.rule === 'pump_upgrade' && DC.optionSid(o) === 'wsa_0');
  // sample: pumping energy equals total energy, no notice
  assert.deepStrictEqual(pumpOf(base).trigger.review, []);
  assert.ok(!cardOf(pumpOf(base), base.checks, {}).includes(NOTICE));
  for (const [label, pump] of [['zero pumping energy', 0], ['pumping energy below total', 1200000]]) {
    const a = clone(sample[0]); a.Water.Abstraction[0].wsa_nrg_pump = pump; // synthetic edit
    const r = run(a);
    const o = pumpOf(r);
    assert.ok(o, `${label}: still offered (review flag, not an eligibility rule)`);
    assert.deepStrictEqual(r.options.map(x => x.key), base.options.map(x => x.key), `${label}: same options`);
    const ecam = engine.calculateOne(a, 0).substages.find(s => s.prefix === 'wsa').outputs;
    assert.strictEqual(o.expected_kwh, ecam.wsa_KPI_nrg_estm_sav, `${label}: estimate is ECAM's, unchanged`);
    assert.ok(cardOf(o, r.checks, {}).includes(`data-review="pump_energy_basis">${NOTICE}`), `${label}: card`);
    assert.ok(DC.panel(r.checks, r.options, ctxFor({})).includes(NOTICE), `${label}: panel`);
    assert.ok(cardOf(o, r.checks, {}, { open: true }).includes(`wsa_nrg_pump: <b>${fmt(pump)}</b> kWh`), `${label}: value shown`);
  }
});

// ------------------------------------------------------------------ cards
test('cards show the actual rule trigger, its assessment values and the unchanged benefit', () => {
  const { options, checks } = run(clone(sample[0]));
  const pump = options.find(o => o.rule === 'pump_upgrade');
  assert.strictEqual(Math.round(pump.expected_kgco2 / 1000), 566);
  assert.strictEqual(Math.round(pump.expected_kwh), 836297);
  const html = cardOf(pump, checks, {}, { open: true });
  assert.ok(html.includes('ECAM estimates an energy saving above zero'));
  assert.ok(html.includes('wsa_KPI_nrg_elec_eff: <b>52.1</b> %') && html.includes('wsa_pmp_exff: <b>80</b> %'));
  assert.ok(html.includes('566 tCO₂eq · 836,297 kWh'));
  const desl = options.find(o => o.rule === 'septic_desludging');
  const d = cardOf(desl, checks, {});
  assert.ok(d.includes('8,925 tCO₂eq') && d.includes('(scenario)'));
  assert.ok(d.includes('Emissions from treating the emptied sludge are not yet included'), 'exclusion shown');
  assert.ok(d.includes('Containment emissions: <b>74,460</b> tCO₂eq') && d.includes('wwo_cont_emp: <b>0</b> %'));
  assert.ok(d.includes('Containment survey and IPLT'), 'decision condition shown');
  // every rule that produced an option carries a trigger built from its own condition
  for (const o of options.slice(1)) assert.ok(o.trigger && o.trigger.text.en && o.trigger.text.id && o.trigger.values.length, o.rule);
});

test('missing supporting documents are labelled honestly; nothing is presented as evidence', () => {
  const { options, checks } = run(clone(sample[0]));
  for (const o of options) {
    const html = cardOf(o, checks, {}, { open: true });
    if (o.rule === 'baseline') { assert.ok(!html.includes('data-support')); continue; }
    assert.ok(html.includes('<dd data-support>Supporting document not yet added.</dd>'), o.rule);
    assert.ok(!/Related reading|class="sources"/.test(html), 'no sources or related reading in a card');
  }
  const id = DC.card(options[1], ctxFor({}, 'a_main', 'id'), { checks });
  assert.ok(id.includes('Dokumen pendukung belum ditambahkan.'));
  // rules without input-status coverage say so
  const solar = options.find(o => o.rule === 'solar_pv');
  assert.ok(cardOf(solar, checks, {}).includes('Input status is not tracked for this rule yet.'));
});

test('every new interface string exists in English and Indonesian', () => {
  const keys = ['why_appeared', 'est_benefit', 'supporting_doc', 'no_supporting_doc', 'data_checks', 'checks_coverage',
    ...['manual', 'estimate', 'typical', 'default', 'unknown', 'confirmed', 'not_confirmed'].map(s => 'in_' + s),
    'inputs_complete', 'untracked_known', 'zero_confirmed', 'zero_entered', 'rv_pump_energy_basis', 'rule_result', 'input_completeness',
    ...['triggered', 'not_triggered', 'not_assessed', 'not_evaluated'].map(s => 'st_' + s), ...['pump_efficiency', 'nrw', 'desludging'].map(c => 'check_' + c),
    ...DC.OTHER_RULES.map(r => 'rule_' + r), 'rs_no_efficiency', 'rs_no_expected_efficiency', 'rs_saving_not_positive', 'rs_missing_volumes',
    'rs_nrw_at_or_below_trigger', 'rs_no_containment_emissions', 'rs_emptying_at_or_above_scenario',
    ...['grid_kwh', 'nrw_share', 'containment_ghg', 'cso_ghg', 'treatment_ch4', 'fuel_ghg'].map(v => 'tv_' + v)];
  for (const k of keys) assert.ok(UI.en[k] && UI.id[k], k);
});

// ------------------------------------------------------------------ identity, notes, persistence, freshness
test('selections and notes stay with their cards; confirming input status changes no key, figure or revision', () => {
  const a = clone(sample[0]);
  const first = run(a);
  const desl = first.options.find(o => o.rule === 'septic_desludging');
  const rev = CW.revision(a);
  const map = {};
  CW.confirmInputValue(map, 'a_main', 'wwo_0', 'wwo_cont_emp', 0);
  const second = run(a);
  assert.deepStrictEqual(second.options.map(o => [o.key, o.expected_kgco2, o.expected_kwh]), first.options.map(o => [o.key, o.expected_kgco2, o.expected_kwh]));
  assert.strictEqual(CW.revision(a), rev, 'input status lives outside the ECAM JSON');
  const html = DC.card(second.options.find(o => o.key === desl.key), ctxFor(map), { checks: second.checks, selected: true, note: 'Check IPLT <capacity> (synthetic)' });
  assert.ok(html.includes(`data-pick="${desl.key}" checked`));
  assert.ok(html.includes('Check IPLT &lt;capacity&gt; (synthetic)</textarea>'));
  // saved actions carry the trigger, but the fingerprint the plan depends on is unchanged by it
  const sel = [{ ...desl, notes: 'n' }];
  assert.strictEqual(CW.actionsFingerprint(sel), CW.actionsFingerprint([{ ...desl, trigger: undefined, notes: 'n' }]));
  assert.deepStrictEqual(I.actionIssues({ assessment: a, meta: first.meta, actions: sel, actionSet: { assessmentId: 'a_main', revision: rev, gwpIndex: 0 } }), []);
});

test('input status survives save and reload, stays out of ECAM files, and value edits still mark options outdated', () => {
  const a = clone(sample[0]);
  const m = meta(a, 'a_main');
  const map = { a_main: { origin: 'new', s: {} } };
  CW.setInputOrigin(map, 'a_main', 'wsd_0', 'wsd_auth_con', 'manual', a.Water.Distribution[0].wsd_auth_con);
  CW.setInputOrigin(map, 'a_main', 'wsd_0', 'wsd_vol_dist', 'estimate', a.Water.Distribution[0].wsd_vol_dist);
  CW.confirmInputValue(map, 'a_main', 'wsd_0', 'wsd_vol_dist', a.Water.Distribution[0].wsd_vol_dist);
  CW.setInputOrigin(map, 'a_main', 'wwo_0', 'wwo_cont_emp', 'typical', a.Waste.Onsite[0].wwo_cont_emp);
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
  const state = { schema: CW.SCHEMA, assessments: [a], assessmentMeta: [m], inputStatus: map };
  assert.ok(CW.writeSession(storage, 'cwr.v1', state).ok);
  const back = CW.loadSession(storage, 'cwr.v1', () => 'x').state;
  assert.deepStrictEqual(back.inputStatus, map);
  assert.deepStrictEqual(CW.inputState(back.inputStatus.a_main, 'wsd_0', 'wsd_auth_con', 26000000), st('manual'));
  assert.deepStrictEqual(CW.inputState(back.inputStatus.a_main, 'wsd_0', 'wsd_vol_dist', a.Water.Distribution[0].wsd_vol_dist), st('estimate', true));
  assert.deepStrictEqual(CW.inputState(back.inputStatus.a_main, 'wwo_0', 'wwo_cont_emp', a.Waste.Onsite[0].wwo_cont_emp), st('typical'));
  assert.ok(!JSON.stringify(back.assessments).includes('inputStatus') && !JSON.stringify(back.assessments).includes('"origin"'));
  // editing a tracked value: options become outdated through the existing revision check
  const basis = { assessmentId: 'a_main', revision: CW.revision(a), gwpIndex: 0 };
  a.Water.Distribution[0].wsd_auth_con = 30000000;
  CW.setInputOrigin(map, 'a_main', 'wsd_0', 'wsd_auth_con', 'manual', 30000000);
  const f = CW.freshness({ assessments: [{ id: 'a_main', revision: CW.revision(a) }], actionResult: { basis }, gwpIndex: 0 });
  assert.deepStrictEqual(f.options, ['assessment_changed']);
  // older session without inputStatus: everything unconfirmed, nothing crashes
  assert.deepStrictEqual(CW.inputState(undefined, 'wsd_0', 'wsd_auth_con', 1), st('unknown'));
});

test('/api/actions returns the checks with stable substage IDs from the sent metadata', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const a = clone(sample[0]);
    const m = meta(a, 'a_api');
    const r = await (await fetch(base + '/api/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assessment: a, meta: m, gwpIndex: 0 }) })).json();
    assert.strictEqual(r.checks.length, 5);
    assert.ok(r.checks.every(c => c.sid && !c.sid.includes('#')));
    const pump = r.options.find(o => o.rule === 'pump_upgrade');
    assert.strictEqual(DC.checkFor(pump, r.checks).check, 'pump_efficiency');
    assert.strictEqual(DC.checkFor(r.options.find(o => o.rule === 'solar_pv'), r.checks), null);
  } finally { server.close(); }
});

(async () => {
  console.log('Decision support');
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok -', name); }
  console.log(`\n${passed} decision-support tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
