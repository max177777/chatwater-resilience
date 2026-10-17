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
  fmt, labelOf: code => code, unitOf: () => '',
  status: (sid, code, value) => CW.inputStatus(statusMap[aid], sid, code, value),
});
const cardOf = (o, checks, statusMap, opts = {}) => DC.card(o, ctxFor(statusMap), { checks, ...opts });

// ------------------------------------------------------------------ input status
test('an entered zero is "entered", an untouched default is "default", and neither is inferred from the number', () => {
  const map = { a_new: { origin: 'new', s: {} } };
  assert.strictEqual(CW.inputStatus(map.a_new, 'wwo_0', 'wwo_cont_emp', 0), 'default');
  CW.setInputStatus(map, 'a_new', 'wwo_0', 'wwo_cont_emp', 'entered', 0);
  assert.strictEqual(CW.inputStatus(map.a_new, 'wwo_0', 'wwo_cont_emp', 0), 'entered', 'explicit zero is not missing');
  // an untouched non-zero default is still a default, not measured data
  assert.strictEqual(CW.inputStatus(map.a_new, 'wsa_0', 'wsa_pmp_pf', 0.9), 'default');
  // value changed outside an entry (e.g. ECAM reset a question): the record no longer applies
  assert.strictEqual(CW.inputStatus(map.a_new, 'wwo_0', 'wwo_cont_emp', 10), 'unconfirmed');
  assert.ok(CW.isTracked('wsd', 'wsd_auth_con') && CW.isTracked('wwo', 'wwo_cont_emp') && !CW.isTracked('wsd', 'wsd_nrg_cons'));
});

test('imported and older-session inputs are "Input status unconfirmed" until the user confirms them', () => {
  const a = clone(sample[0]);
  const { options, checks } = run(a);
  const map = {}; // sample, ECAM file or session saved before this feature: no record
  for (const v of [0, 26000000]) assert.strictEqual(CW.inputStatus(map.a_main, 'wsd_0', 'wsd_auth_con', v), 'unconfirmed');
  const nrw = options.find(o => o.rule === 'nrw_reduction');
  let html = cardOf(nrw, checks, map);
  assert.ok(html.includes('Input status unconfirmed') && html.includes('data-confirm="wsd_0|wsd_auth_con"'));
  assert.ok(html.includes('data-pending="2"'));
  CW.setInputStatus(map, 'a_main', 'wsd_0', 'wsd_auth_con', 'confirmed', 26000000);
  CW.setInputStatus(map, 'a_main', 'wsd_0', 'wsd_vol_dist', 'confirmed', 37000000);
  html = cardOf(nrw, checks, map);
  assert.ok(!html.includes('Input status unconfirmed') && !html.includes('data-pending') && html.includes('>Confirmed<'));
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
  assert.ok(html.includes('Not assessed — information missing') && html.includes('Inputs at zero: wsd_auth_con'));
  const b = clone(sample[0]); b.Water.Distribution[0].wsd_auth_con = 36000000;
  const nt = DC.panel([checkOf(run(b).checks, 'nrw', 'wsd_0')], [], ctxFor({}));
  assert.ok(nt.includes('Checked — condition not met') && nt.includes(`${NRW_TRIGGER * 100}% trigger`));
});

test('an entered zero still fails the existing rule condition; status is shown, never enforced', () => {
  const a = clone(sample[0]); a.Water.Distribution[0].wsd_auth_con = 0;
  const { checks } = run(a);
  const map = { a_main: { origin: 'new', s: {} } };
  CW.setInputStatus(map, 'a_main', 'wsd_0', 'wsd_auth_con', 'entered', 0);
  const html = DC.panel(checks.filter(c => c.check === 'nrw'), [], ctxFor(map));
  assert.ok(html.includes('data-input="wsd_auth_con" data-input-status="entered"'));
  assert.ok(html.includes('data-input="wsd_vol_dist" data-input-status="default"'));
  assert.strictEqual(checkOf(checks, 'nrw', 'wsd_0').status, 'not_assessed');
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
  const keys = ['why_appeared', 'est_benefit', 'supporting_doc', 'no_supporting_doc', 'in_unconfirmed', 'data_checks', 'checks_coverage',
    ...['triggered', 'not_triggered', 'not_assessed'].map(s => 'st_' + s), ...['pump_efficiency', 'nrw', 'desludging'].map(c => 'check_' + c),
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
  CW.setInputStatus(map, 'a_main', 'wwo_0', 'wwo_cont_emp', 'confirmed', 0);
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
  CW.setInputStatus(map, 'a_main', 'wsd_0', 'wsd_auth_con', 'entered', a.Water.Distribution[0].wsd_auth_con);
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
  const state = { schema: CW.SCHEMA, assessments: [a], assessmentMeta: [m], inputStatus: map };
  assert.ok(CW.writeSession(storage, 'cwr.v1', state).ok);
  const back = CW.loadSession(storage, 'cwr.v1', () => 'x').state;
  assert.deepStrictEqual(back.inputStatus, map);
  assert.strictEqual(CW.inputStatus(back.inputStatus.a_main, 'wsd_0', 'wsd_auth_con', 26000000), 'entered');
  assert.ok(!JSON.stringify(back.assessments).includes('inputStatus') && !JSON.stringify(back.assessments).includes('"origin"'));
  // editing a tracked value: options become outdated through the existing revision check
  const basis = { assessmentId: 'a_main', revision: CW.revision(a), gwpIndex: 0 };
  a.Water.Distribution[0].wsd_auth_con = 30000000;
  CW.setInputStatus(map, 'a_main', 'wsd_0', 'wsd_auth_con', 'entered', 30000000);
  const f = CW.freshness({ assessments: [{ id: 'a_main', revision: CW.revision(a) }], actionResult: { basis }, gwpIndex: 0 });
  assert.deepStrictEqual(f.options, ['assessment_changed']);
  // older session without inputStatus: everything unconfirmed, nothing crashes
  assert.strictEqual(CW.inputStatus(undefined, 'wsd_0', 'wsd_auth_con', 1), 'unconfirmed');
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
