const fixtureStatus = require('./helpers/fixtures');
/*
 * Data-integrity regression tests: stable identities, freshness of downstream
 * outputs, server-side export validation, unit display and session migration.
 * Synthetic edits of the HYPOTHETICAL sample utility only. Run: npm test
 */
const assert = require('assert');
const JSZip = require('jszip');
const CW = require('../public/js/cw-core');
const engine = require('../engine/ecam-engine');
const I = require('../engine/integrity');
const P = require('../engine/proposal');
const { buildPlan } = require('../engine/plan');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta, clone } = require('./helpers/fixtures');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** Build a complete project the way the browser does: options → saved actions → plan → proposal. */
async function project({ assessment = clone(sample[0]), id = 'a_main', gwpIndex = 0, rules = ['pump_upgrade', 'septic_desludging'] } = {}) {
  const m = meta(assessment, id);
  const inputStatus=fixtureStatus.confirmedInputs(assessment,m), supportRevision=require('../engine/assessment-validity').calculate(assessment,gwpIndex,{meta:m,inputStatus}).supportRevision;
  const options = I.optionsFor(assessment, m, gwpIndex,inputStatus);
  CW.assignLabels(options, {});
  const basis = { assessmentId: id, revision: CW.revision(assessment), gwpIndex, supportRevision };
  const selectedActions = options.filter(o => rules.includes(o.rule)).map(o => ({ ...o, notes: '' }));
  const actionSet = { ...basis, savedAt: 'now' };
  const profile = { name: 'Utility A (hypothetical)' };
  const plan = { ...buildPlan(selectedActions, 'en'), summary: 'User-edited summary.', deps: CW.planDeps({ assessmentId: id, assessment, gwpIndex, actions: selectedActions, profile, supportRevision }) };
  const financing = { route: 'general' };
  const fw = P.financingFrameworks().find(f => f.id === 'general');
  const proposal = { ...(await P.draftProposal({ results: engine.calculateOne(assessment, gwpIndex), actions: selectedActions, plan, profile, lang: 'en' }, fw)),
    deps: CW.proposalDeps({ assessmentId: id, assessment, gwpIndex, actions: selectedActions, plan, profile, financing, supportRevision }) };
  return { inputStatus:{[id]:inputStatus}, assessments: [assessment], assessmentMeta: [m], gwpIndex, actionResult: { assessmentId: id, basis, options }, actionSet, selectedActions, plan, proposal, profile, financing, lang: 'en' };
}
const fresh = s => CW.freshness({
  assessments: s.assessmentMeta.map((m, i) => ({ id: m.id, revision: CW.revision(s.assessments[i]) })),
  gwpIndex: s.gwpIndex, actionResult: s.actionResult, actionSet: s.actionSet, selectedActions: s.selectedActions,
  plan: s.plan, proposal: s.proposal, profile: s.profile, financing: s.financing,
});
const exportIssues = (s, opts) => { try { I.exportContext(s, opts); return []; } catch (e) { assert.strictEqual(e.status, 409); return e.issues; } };
const docxText = async buf => (await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ------------------------------------------------------------------ "Not relevant" (rejected) actions
test('rejecting a saved action outdates actions, plan and proposal and blocks export; restoring clears it', async () => {
  const s = await project();
  const before = JSON.stringify({ plan: s.plan, proposal: s.proposal, actions: s.selectedActions });
  const key = s.selectedActions[0].key;
  s.rejectedActions = { [key]: { reason: 'synthetic: done last year', at: 'now' } };
  const f = CW.freshness({ assessments: [{ id: 'a_main', revision: CW.revision(s.assessments[0]) }], gwpIndex: 0, actionSet: s.actionSet,
    selectedActions: s.selectedActions, plan: s.plan, proposal: s.proposal, profile: s.profile, financing: s.financing, rejected: s.rejectedActions });
  assert.deepStrictEqual(f.actions, ['action_rejected']);
  assert.ok(f.plan.includes('actions_outdated') && f.proposal.includes('actions_outdated'));
  const issues = exportIssues(s, { requireProposal: true });
  assert.ok(issues.some(i => /not relevant/i.test(i) && i.includes(s.selectedActions[0].title.en)), issues.join(' | '));
  assert.strictEqual(JSON.stringify({ plan: s.plan, proposal: s.proposal, actions: s.selectedActions }), before, 'notes, plan and proposal text are kept');
  assert.throws(() => I.requireCurrentActions({ assessment: s.assessments[0], meta: s.assessmentMeta[0], gwpIndex: 0, actions: s.selectedActions, actionSet: s.actionSet, rejected: s.rejectedActions }), e => e.status === 409);
  delete s.rejectedActions[key];
  assert.deepStrictEqual(exportIssues(s, { requireProposal: true }), [], 'restoring the action makes the project exportable again');
});

test('rejecting an action that is not in the saved selection leaves every output current', async () => {
  const s = await project();
  const other = s.actionResult.options.find(o => o.rule !== 'baseline' && !s.selectedActions.some(a => a.key === o.key));
  assert.ok(other, 'the sample offers an unselected action');
  s.rejectedActions = { [other.key]: { reason: '', at: 'now' } };
  const f = CW.freshness({ assessments: [{ id: 'a_main', revision: CW.revision(s.assessments[0]) }], gwpIndex: 0, actionSet: s.actionSet,
    selectedActions: s.selectedActions, plan: s.plan, proposal: s.proposal, profile: s.profile, financing: s.financing, rejected: s.rejectedActions });
  assert.deepStrictEqual(f, { options: [], actions: [], plan: [], proposal: [] });
  assert.deepStrictEqual(exportIssues(s, { requireProposal: true }), []);
});

// ------------------------------------------------------------------ freshness after upstream edits
test('both languages: rejection blocks both exports through HTTP until effective selection, plan and proposal are current', async () => {
  const server = app.listen(0);
  const post = async (route, body) => fetch(`http://localhost:${server.address().port}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtureStatus.withConfirmedInputs(body)) });
  try {
    for (const lang of ['en', 'id']) {
      const s = await project(); s.lang = lang;
      const key = s.selectedActions[0].key;
      s.selectedActions[0].notes = 'Synthetic note retained';
      s.plan.deps = CW.planDeps({ assessmentId: 'a_main', assessment: s.assessments[0], supportRevision:s.actionSet?.supportRevision, actions: s.selectedActions, profile: s.profile });
      s.proposal.deps = CW.proposalDeps({ assessmentId: 'a_main', assessment: s.assessments[0], supportRevision:s.actionSet?.supportRevision, actions: s.selectedActions, plan: s.plan, profile: s.profile, financing: s.financing });
      const text = s.plan.summary;
      s.rejectedActions = { [key]: { reason: 'synthetic rejection' } };
      for (const route of ['/api/export', '/api/export/docx']) assert.strictEqual((await post(route, s)).status, 409);
      delete s.rejectedActions[key];
      assert.strictEqual((await post('/api/export/docx', s)).status, 200, `${lang}: undo restores consistency`);
      s.rejectedActions[key] = { reason: 'synthetic rejection' };
      s.selectedActions = s.selectedActions.filter(a => a.key !== key);
      assert.strictEqual(s.plan.summary, text, 'old narrative remains available');
      assert.strictEqual((await post('/api/export', s)).status, 409, 'saving effective selection alone does not make the old plan current');
      const body = { assessment: s.assessments[0], meta: s.assessmentMeta[0], actions: s.selectedActions, actionSet: s.actionSet, profile: s.profile, rejectedActions: s.rejectedActions, lang };
      s.plan = await (await post('/api/plan', body)).json();
      assert.strictEqual((await post('/api/export/docx', s)).status, 409, 'old proposal still blocked after plan regeneration');
      s.financing={route:'gcf-preliminary-v1',conceptInputs:{}};
      s.proposal = await (await post('/api/proposal', { ...body, route: 'gcf-preliminary-v1', plan: s.plan })).json();
      for (const route of ['/api/export', '/api/export/docx']) assert.strictEqual((await post(route, s)).status, 200, `${lang}: ${route} after regeneration`);
    }
  } finally { server.close(); }
});

// ------------------------------------------------------------------ freshness after upstream edits
test('a fresh project is current and exportable', async () => {
  const s = await project();
  assert.deepStrictEqual(fresh(s), { options: [], actions: [], plan: [], proposal: [] });
  assert.deepStrictEqual(exportIssues(s, { requireProposal: true }), []);
});

test('Stage 1 edit marks options, actions, plan and proposal outdated but keeps their content', async () => {
  const s = await project();
  const before = JSON.stringify({ plan: s.plan, proposal: s.proposal, actions: s.selectedActions });
  s.assessments[0].Waste.Onsite[0].wwo_onsi_pop = 1000000;
  const f = fresh(s);
  assert.deepStrictEqual(f.options, ['assessment_changed']);
  assert.deepStrictEqual(f.actions, ['assessment_changed']);
  assert.deepStrictEqual(f.plan, ['assessment_changed', 'actions_outdated']);
  assert.ok(f.proposal.includes('assessment_changed') && f.proposal.includes('plan_outdated'));
  assert.strictEqual(JSON.stringify({ plan: s.plan, proposal: s.proposal, actions: s.selectedActions }), before);
  const issues = exportIssues(s, { requireProposal: true });
  assert.ok(issues.some(x => /assessment data changed/.test(x)), issues.join(' | '));
});

test('GWP change marks downstream outputs outdated and blocks export', async () => {
  const s = await project();
  s.gwpIndex = 2;
  const f = fresh(s);
  assert.deepStrictEqual(f.actions, ['gwp_changed']);
  assert.ok(f.proposal.includes('gwp_changed'));
  assert.ok(exportIssues(s).some(x => /GWP report changed/.test(x)));
});

test('renaming an assessment or substage does not invalidate outputs or change action identity', async () => {
  const s = await project();
  const keys = s.selectedActions.map(a => a.key);
  s.assessments[0].General.Name = 'Renamed utility';
  s.assessments[0].Water.Abstraction[0].name = 'Renamed intake';
  assert.deepStrictEqual(fresh(s).proposal, []);
  const again = I.optionsFor(s.assessments[0], s.assessmentMeta[0]).filter(o => keys.includes(o.key));
  assert.strictEqual(again.length, keys.length);
});

// ------------------------------------------------------------------ assessments: switching, deletion, duplicate names
test('export uses the assessment the actions came from, not list position', async () => {
  const s = await project();
  const other = clone(sample[0]); other.General.Name = 'Other (synthetic)'; other.Water.Abstraction[0].wsa_nrg_cons = 10;
    other.Water.Abstraction[0].wsa_nrg_pump = 10; // keep this unrelated assessment valid under CW-02's energy boundary check
  s.assessments = [other, s.assessments[0]];
  s.assessmentMeta = [meta(other, 'a_other'), s.assessmentMeta[0]];
  s.selectedAssessment = 0; // legacy index field is ignored
  const { assessment } = I.exportContext(s, { requireProposal: true });
  assert.strictEqual(assessment.General.Name, 'Utility A (hypothetical)');
});

test('deleting the source assessment marks outputs outdated and blocks export', async () => {
  const s = await project();
  const other = clone(sample[0]); other.General.Name = 'Other (synthetic)';
  s.assessments = [other]; s.assessmentMeta = [meta(other, 'a_other')];
  const f = fresh(s);
  assert.deepStrictEqual(f.actions, ['assessment_missing']);
  assert.ok(f.proposal.includes('assessment_missing'));
  assert.ok(exportIssues(s).some(x => /no longer in the project/.test(x)));
});

test('duplicate assessment names are told apart by ID', async () => {
  const twin = clone(sample[0]); twin.Waste.Onsite[0].wwo_onsi_pop = 250000; // same name, different data
  const s = await project({ assessment: twin, id: 'a_twin' });
  s.assessments = [clone(sample[0]), twin];
  s.assessmentMeta = [meta(sample[0], 'a_first'), s.assessmentMeta[0]];
  assert.strictEqual(s.assessments[0].General.Name, s.assessments[1].General.Name);
  assert.deepStrictEqual(fresh(s).proposal, []);
  const { assessment } = I.exportContext(s);
  assert.strictEqual(assessment.Waste.Onsite[0].wwo_onsi_pop, 250000);
  assert.ok(s.selectedActions.every(a => a.key.startsWith('a_twin|')));
});

// ------------------------------------------------------------------ actions: identity and reordering
test('action keys follow substage IDs, not positions', () => {
  const a = clone(sample[0]);
  const m = meta(a, 'a1');
  const key = I.optionsFor(a, m).find(o => o.rule === 'pump_upgrade').key;
  assert.strictEqual(key, 'a1|pump_upgrade|wsa_0');
  // insert a new abstraction substage in front; IDs move with the objects
  a.Water.Abstraction.unshift(engine.newSubstage('wsa', 'New intake', 0.677));
  m.substages.wsa = ['wsa_new', 'wsa_0'];
  assert.strictEqual(I.optionsFor(a, m).find(o => o.rule === 'pump_upgrade').key, key);
});

test('reordered options keep the same selection and labels', () => {
  const a = clone(sample[0]), m = meta(a, 'a1');
  const run1 = I.optionsFor(a, m);
  const labels = CW.assignLabels(run1, {});
  const selected = run1.filter(o => ['solar_pv', 'nrw_reduction'].includes(o.rule)).map(o => o.key);
  const labelOf = (opts, rule) => opts.find(o => o.rule === rule).id;
  const before = { solar: labelOf(run1, 'solar_pv'), nrw: labelOf(run1, 'nrw_reduction') };
  // synthetic edit that reorders the list: far fewer septic users moves desludging down
  a.Waste.Onsite[0].wwo_onsi_pop = 20000; a.Waste.Onsite[0].wwo_bod_cont /= 25;
  const run2 = I.optionsFor(a, m);
  assert.notDeepStrictEqual(run2.map(o => o.rule), run1.map(o => o.rule));
  CW.assignLabels(run2, labels);
  assert.deepStrictEqual({ solar: labelOf(run2, 'solar_pv'), nrw: labelOf(run2, 'nrw_reduction') }, before);
  assert.deepStrictEqual(run2.filter(o => selected.includes(o.key)).map(o => o.rule).sort(), ['nrw_reduction', 'solar_pv']);
});

test('an action that disappears is not silently replaced by another', () => {
  const a = clone(sample[0]), m = meta(a, 'a1');
  const nrwKey = I.optionsFor(a, m).find(o => o.rule === 'nrw_reduction').key;
  a.Water.Distribution[0].wsd_auth_con = 34e6; // NRW below the rule threshold
  const run2 = I.optionsFor(a, m);
  assert.ok(!run2.some(o => o.key === nrwKey));
  assert.ok(new Set(run2.map(o => o.key)).size === run2.length);
});

test('changing the selected actions or their notes after the plan marks plan and proposal outdated', async () => {
  const s = await project();
  s.selectedActions = s.selectedActions.slice(0, 1);
  assert.ok(fresh(s).plan.includes('actions_changed'));
  const t = await project();
  t.selectedActions[0].notes = 'Pump replaced in 2024';
  assert.ok(fresh(t).plan.includes('actions_changed'));
  assert.ok(fresh(t).proposal.includes('actions_changed'));
});

// ------------------------------------------------------------------ plan → proposal
test('every editable plan field (summary, owner, duration and the schedule they drive) makes the proposal outdated', async () => {
  const edits = {
    summary: p => { p.summary = 'Rewritten summary text (synthetic)'; },
    summary_cleared: p => { p.summary = ''; },
    owner: p => { p.tasks[0].owner = 'Edited owner'; },
    weeks: p => { p.tasks[0].weeks += 2; },
    start_week: p => { p.tasks[1].start_week += 2; },
    total_weeks: p => { p.total_weeks += 2; },
  };
  for (const [field, edit] of Object.entries(edits)) {
    const s = await project();
    edit(s.plan);
    assert.deepStrictEqual(fresh(s).proposal, ['plan_changed'], field);
    assert.deepStrictEqual(fresh(s).plan, [], `${field}: editing the plan does not make the plan itself outdated`);
    assert.ok(exportIssues(s, { requireProposal: true }).some(x => /project plan changed/.test(x)), `${field}: export blocked`);
    assert.ok(exportIssues(s).some(x => /project plan changed/.test(x)), `${field}: ZIP export blocked`);
  }
  // display-only data does not count
  const s = await project();
  s.plan.sources = [{ id: 'S9', title: 'synthetic' }];
  assert.deepStrictEqual(fresh(s).proposal, []);
});

test('plan summary edit is rejected by the server export until the proposal is regenerated', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtureStatus.withConfirmedInputs(body)) });
  try {
    const s = await project();
    s.plan.summary = 'Summary edited after the proposal (synthetic)';
    let r = await post('/api/export/docx', s);
    assert.strictEqual(r.status, 409); assert.match((await r.json()).error, /project plan changed/);
    s.financing={route:'gcf-preliminary-v1',conceptInputs:{}};
    r = await post('/api/proposal', { route: 'gcf-preliminary-v1', actions: s.selectedActions, actionSet: s.actionSet, plan: s.plan, profile: s.profile, assessment: s.assessments[0], meta: s.assessmentMeta[0], gwpIndex: 0, lang: 'en' });
    assert.strictEqual(r.status, 200);
    s.proposal = await r.json();
    assert.deepStrictEqual(fresh(s).proposal, []);
    r = await post('/api/export/docx', s);
    assert.strictEqual(r.status, 200);
  } finally { server.close(); }
});

// ------------------------------------------------------------------ previous versions
test('regeneration keeps one previous version with its edits and deps, and only after success', async () => {
  const s = await project();
  s.plan.tasks[0].owner = 'Edited owner (synthetic)';
  const edited = clone(s.plan);
  // failure: current and previous untouched
  await assert.rejects(CW.regenerate(s, 'plan', async () => { throw new Error('simulated outage'); }), /simulated outage/);
  assert.deepStrictEqual(s.plan, edited);
  assert.strictEqual(s.previous, undefined);
  await assert.rejects(CW.regenerate(s, 'plan', async () => null), /returned nothing/);
  assert.deepStrictEqual(s.plan, edited);
  // success: edited version kept as previous, with deps
  const next = { ...buildPlan(s.selectedActions, 'en'), summary: 'new', deps: s.plan.deps, lang: 'en' };
  await CW.regenerate(s, 'plan', async () => next, 't1');
  assert.strictEqual(s.plan, next);
  assert.deepStrictEqual(s.previous.plan, { at: 't1', value: edited });
  // a second regeneration replaces the previous version (one level only)
  await CW.regenerate(s, 'plan', async () => ({ ...next, summary: 'newer' }), 't2');
  assert.strictEqual(s.previous.plan.value.summary, 'new');
});

test('restoring a previous version swaps it back and is rechecked against current upstream data', async () => {
  const s = await project();
  const oldProposal = clone(s.proposal);
  // regenerate the plan with an edited owner, then the proposal from it
  s.plan.tasks[0].owner = 'New owner (synthetic)';
  const newDeps = CW.proposalDeps({ assessmentId: 'a_main', assessment: s.assessments[0], gwpIndex: 0, actions: s.selectedActions, plan: s.plan, profile: s.profile, financing: s.financing });
  CW.commitVersion(s, 'proposal', { ...clone(oldProposal), title: 'Regenerated', deps: newDeps }, 't1');
  assert.deepStrictEqual(fresh(s).proposal, []);
  // restoring the old proposal: its deps describe the old plan, so it is outdated and export is blocked
  assert.ok(CW.restoreVersion(s, 'proposal', 't2'));
  assert.deepStrictEqual(s.proposal, oldProposal, 'restored as stored, deps untouched');
  assert.deepStrictEqual(fresh(s).proposal, ['plan_changed']);
  assert.ok(exportIssues(s, { requireProposal: true }).length);
  // swap back
  assert.ok(CW.restoreVersion(s, 'proposal'));
  assert.strictEqual(s.proposal.title, 'Regenerated');
  assert.deepStrictEqual(fresh(s).proposal, []);
  // restoring a plan made before a Stage 1 edit stays outdated
  const t = await project();
  CW.commitVersion(t, 'plan', clone(t.plan));
  t.assessments[0].Waste.Onsite[0].wwo_onsi_pop = 400000;
  CW.restoreVersion(t, 'plan');
  assert.ok(fresh(t).plan.includes('assessment_changed'));
  assert.strictEqual(CW.restoreVersion({}, 'plan'), false, 'nothing to restore');
});

// ------------------------------------------------------------------ output language
test('switching interface language does not invalidate calculations or outputs; documents use the output language', async () => {
  const s = await project();
  s.plan.lang = 'en'; s.proposal.lang = 'en';
  const before = fresh(s);
  const rev = CW.revision(s.assessments[0]);
  s.lang = 'id';
  assert.deepStrictEqual(fresh(s), before);
  assert.strictEqual(CW.revision(s.assessments[0]), rev);

  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtureStatus.withConfirmedInputs(body)) });
  try {
    // options requested in either interface language have the same keys, figures and basis
    const opts = async lang => (await post('/api/actions', { assessment: s.assessments[0], meta: s.assessmentMeta[0], gwpIndex: 0, lang })).json();
    const [oe, oi] = [await opts('en'), await opts('id')];
    assert.deepStrictEqual(oi.basis, oe.basis);
    assert.strictEqual(CW.actionsFingerprint(oi.options), CW.actionsFingerprint(oe.options));
    // generated outputs record their language
    const body = { actions: s.selectedActions, actionSet: s.actionSet, assessment: s.assessments[0], meta: s.assessmentMeta[0], gwpIndex: 0, profile: s.profile };
    const plan = await (await post('/api/plan', { ...body, lang: 'id' })).json();
    assert.strictEqual(plan.lang, 'id');
    // English proposal exported while the interface is in Bahasa: Word headings stay English
    const r = await post('/api/export/docx', { ...s, lang: 'id' });
    assert.strictEqual(r.status, 200);
    const text = await docxText(Buffer.from(await r.arrayBuffer()));
    assert.ok(text.includes('Expected result') && !text.includes('Hasil yang diharapkan'), 'Word file in the proposal language');
  } finally { server.close(); }
});

test('template proposal carries the edited plan summary and the Word file says it is a template', async () => {
  const s = await project();
  const summary = s.proposal.sections.find(x => x.key === 'summary');
  assert.ok(summary.text.startsWith('User-edited summary.'), 'edited plan summary used in the proposal');
  assert.ok(!s.proposal.sections.some(x => /\.\.(\s|$)/.test(x.text)), 'no doubled full stops');
  const text = await docxText(await require('../engine/export').buildProposalDocx({ lang: 'en', proposal: s.proposal, actions: s.selectedActions, plan: s.plan, profile: s.profile }));
  assert.ok(text.includes('AI drafting was off'), 'template status stated in the Word file');
  const partial = await docxText(await require('../engine/export').buildProposalDocx({ lang: 'en',
    proposal: { ...s.proposal, ai: false, ai_failed: [{ key: 'risks', title: 'Risks and mitigation', error: 'x' }] }, plan: s.plan, profile: s.profile }));
  assert.ok(partial.includes('AI drafting failed for some sections') && partial.includes('Risks and mitigation') && !partial.includes('AI drafting was off'));
});

// ------------------------------------------------------------------ browser storage
function fakeStorage(init = {}, failOn = () => false) {
  const data = { ...init };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { if (failOn(k, v)) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } data[k] = String(v); },
  };
}
const v1Session = () => JSON.stringify({ lang: 'en', assessments: [clone(sample[0])], selectedAssessment: 0, plan: { tasks: [], summary: 'SYNTHETIC EDITED SUMMARY' } });

test('migration: a failed backup write leaves the original session untouched and blocks overwriting', () => {
  const original = v1Session();
  const store = fakeStorage({ 'cwr.v1': original }, k => k.endsWith('.schema1-backup'));
  let n = 0;
  const r = CW.loadSession(store, 'cwr.v1', p => `${p}_${++n}`);
  assert.strictEqual(r.problem, 'backup_failed');
  assert.strictEqual(r.quota, true);
  assert.strictEqual(r.original, original, 'original text kept for download');
  assert.strictEqual(store.data['cwr.v1'], original, 'original not modified');
  assert.ok(!('cwr.v1.schema1-backup' in store.data));
  assert.strictEqual(r.state.schema, CW.SCHEMA, 'work continues in memory');
  assert.strictEqual(r.state.plan.summary, 'SYNTHETIC EDITED SUMMARY');
});

test('migration: a failed write of the migrated session reports failure and keeps the original', () => {
  const original = v1Session();
  const store = fakeStorage({ 'cwr.v1': original }, k => k === 'cwr.v1');
  let n = 0;
  const r = CW.loadSession(store, 'cwr.v1', p => `${p}_${++n}`);
  assert.ok(r.migrated && !r.problem);
  assert.strictEqual(store.data['cwr.v1.schema1-backup'], original);
  const w = CW.writeSession(store, 'cwr.v1', r.state);
  assert.deepStrictEqual([w.ok, w.quota], [false, true], 'no success is reported');
  assert.strictEqual(store.data['cwr.v1'], original, 'original still in place');
});

test('storage: unreadable, unavailable and successful sessions', () => {
  const broken = fakeStorage({ 'cwr.v1': '{not json' });
  const r = CW.loadSession(broken, 'cwr.v1', () => 'x');
  assert.deepStrictEqual([r.problem, r.state, r.original], ['unreadable', null, '{not json']);
  const unavailable = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.strictEqual(CW.loadSession(unavailable, 'cwr.v1', () => 'x').problem, 'read_failed');
  assert.strictEqual(CW.writeSession(unavailable, 'cwr.v1', {}).ok, false);
  const ok = fakeStorage({ 'cwr.v1': v1Session() });
  let n = 0;
  const m = CW.loadSession(ok, 'cwr.v1', p => `${p}_${++n}`);
  assert.ok(m.migrated && !m.problem);
  assert.strictEqual(CW.writeSession(ok, 'cwr.v1', m.state).ok, true);
  assert.strictEqual(JSON.parse(ok.data['cwr.v1']).schema, CW.SCHEMA);
  assert.strictEqual(CW.loadSession(ok, 'cwr.v1', () => 'x').migrated, undefined, 'schema-2 session is not migrated again');
  assert.deepStrictEqual(CW.loadSession(fakeStorage(), 'cwr.v1', () => 'x'), { state: null });
});

test('changing the financing route makes the proposal outdated', async () => {
  const s = await project();
  s.financing = { route: 'gcf' };
  assert.deepStrictEqual(fresh(s).proposal, ['framework_changed']);
});

// ------------------------------------------------------------------ server rejection
test('server rejects mixed-assessment and stale requests over HTTP', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtureStatus.withConfirmedInputs(body)) });
  try {
    const s = await project();
    const other = clone(sample[0]); other.General.Name = 'Other (synthetic)'; other.Water.Abstraction[0].wsa_nrg_cons = 10;
    other.Water.Abstraction[0].wsa_nrg_pump = 10; // keep this unrelated assessment valid under CW-02's energy boundary check
    const otherMeta = meta(other, 'a_other');

    // plan request: actions from one assessment, assessment data of another
    let r = await post('/api/plan', { assessment: other, meta: otherMeta, actions: s.selectedActions, actionSet: s.actionSet });
    assert.strictEqual(r.status, 409); assert.match((await r.json()).error, /different assessment/);

    // export where the plan comes from another assessment than the actions
    r = await post('/api/export', { ...s, plan: { ...s.plan, deps: { ...s.plan.deps, assessmentId: 'a_other' } }, assessments: [s.assessments[0], other], assessmentMeta: [s.assessmentMeta[0], otherMeta] });
    assert.strictEqual(r.status, 409); assert.match((await r.json()).error, /different assessments/);

    // stale export: data edited after the actions; client bookkeeping forged to look current
    const edited = clone(s.assessments[0]); edited.Waste.Onsite[0].wwo_onsi_pop = 1000000;
    const forged = { ...s, assessments: [edited], actionSet: { ...s.actionSet, revision: CW.revision(edited) } };
    r = await post('/api/export/docx', forged);
    assert.strictEqual(r.status, 409); assert.match((await r.json()).error, /do not match the assessment/);

    // Word without a proposal
    r = await post('/api/export/docx', { ...s, proposal: null });
    assert.strictEqual(r.status, 409); assert.match((await r.json()).error, /no draft proposal/);

    // valid export: Word baseline is the actions' assessment even when it is listed second
    r = await post('/api/export/docx', { ...s, inputStatus: {...s.inputStatus,[otherMeta.id]:fixtureStatus.confirmedInputs(other,otherMeta)}, assessments: [other, s.assessments[0]], assessmentMeta: [otherMeta, s.assessmentMeta[0]] });
    assert.strictEqual(r.status, 200);
    const text = await docxText(Buffer.from(await r.arrayBuffer()));
    const total = (engine.calculateOne(sample[0]).totals.total / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 });
    assert.ok(text.includes(`Total ${total}`), 'baseline total of the source assessment');
  } finally { server.close(); }
});

// ------------------------------------------------------------------ units
test('non-default unit preference: display, entry, save and reload keep the same quantity', () => {
  const E = engine._ecam;
  const a = clone(sample[0]);
  a.Configuration = { Units: { wsa_vol_conv: 'hm3' } };
  const view = sc => CW.unitView(E.Units, E.Info, sc, 'wsa_vol_conv');
  let sc = E.Ecam.from(clone(a));
  assert.deepStrictEqual(view(sc), { unit: 'hm3', mult: 1e6 });
  assert.strictEqual(sc.Water.Abstraction[0].wsa_vol_conv / view(sc).mult, 40); // shown as 40 hm³ (= 40,000,000 m³)
  // ECAM's own multiplier agrees
  engine.calculateOne(a); E.setGlobal(sc);
  assert.strictEqual(E.Units.multiplier('wsa_vol_conv'), view(sc).mult);
  // user types 41.5 in the hm³ field → stored in base unit
  sc.Water.Abstraction[0].wsa_vol_conv = 41.5 * view(sc).mult;
  const saved = JSON.parse(JSON.stringify(sc)); // localStorage / ECAM file
  const reloaded = E.Ecam.from(saved);
  assert.strictEqual(reloaded.Configuration.Units.wsa_vol_conv, 'hm3');
  assert.strictEqual(reloaded.Water.Abstraction[0].wsa_vol_conv, 41.5e6);
  assert.strictEqual(reloaded.Water.Abstraction[0].wsa_vol_conv / view(reloaded).mult, 41.5);
  // default unit unchanged, and a display preference alone does not change the revision
  assert.deepStrictEqual(view(E.Ecam.from(clone(sample[0]))), { unit: 'm3', mult: 1 });
  assert.strictEqual(CW.revision(a), CW.revision(sample[0]));
});

// ------------------------------------------------------------------ migration
test('schema-1 session migrates without losing drafts; unproven links are marked for review', async () => {
  const s = await project();
  const v1 = {
    lang: 'en', assessments: [clone(sample[0])], current: 0, gwpIndex: 0, selectedAssessment: 0,
    finished: { 'Utility A (hypothetical)': '2026-10-01T00:00:00Z' },
    actionResult: { options: s.actionResult.options.map(({ key, ...o }) => o), assumptions: {}, assessmentName: 'Utility A (hypothetical)' },
    selectedIds: ['A01', 'A02'], actionNotes: { A01: 'note on desludging' },
    selectedActions: s.selectedActions.map(({ key, substage, ...o }) => ({ ...o, notes: 'kept note' })),
    plan: (({ deps, ...p }) => ({ ...p, summary: 'EDITED SUMMARY' }))(s.plan),
    proposal: (({ deps, ...p }) => ({ ...p, sections: p.sections.map((x, i) => i === 0 ? { ...x, text: 'EDITED SECTION' } : x) }))(s.proposal),
    chat: [{ role: 'user', content: 'hello' }], explanations: { A01: 'old explanation' },
  };
  let n = 0;
  const v2 = CW.migrate(clone(v1), p => `${p}_${++n}`);
  assert.strictEqual(v2.schema, 2);
  assert.strictEqual(v2.plan.summary, 'EDITED SUMMARY');
  assert.strictEqual(v2.proposal.sections[0].text, 'EDITED SECTION');
  assert.deepStrictEqual(v2.selectedActions.map(a => a.notes), ['kept note', 'kept note']);
  assert.deepStrictEqual(v2.chat, v1.chat);
  assert.deepStrictEqual(v2.legacy.selectedIds, ['A01', 'A02']);
  assert.strictEqual(v2.legacy.actionNotes.A01, 'note on desludging');
  assert.strictEqual(v2.selectedAssessmentId, v2.assessmentMeta[0].id);
  assert.strictEqual(v2.finished[v2.assessmentMeta[0].id], '2026-10-01T00:00:00Z');
  assert.strictEqual(v2.actionSet.assessmentId, v2.assessmentMeta[0].id);
  assert.ok(v2.actionSet.legacy && v2.actionResult.legacy);
  assert.strictEqual(CW.migrate(v2, () => 'x'), v2, 'migration is idempotent');

  const f = fresh({ ...v2, profile: null, financing: { route: 'general' } });
  assert.deepStrictEqual([f.options, f.actions, f.plan, f.proposal], [['legacy'], ['legacy'], ['legacy'], ['legacy']]);
  const issues = exportIssues({ ...v2, assessmentMeta: v2.assessmentMeta }, { requireProposal: true });
  assert.ok(issues.length && issues.some(x => /before version tracking|needs review/.test(x)), issues.join(' | '));

  // re-running options maps legacy selections by rule + exact title
  const m = CW.mapLegacy(v2.selectedActions, I.optionsFor(v2.assessments[0], v2.assessmentMeta[0]));
  assert.strictEqual(m.mapped.length, 2); assert.strictEqual(m.review.length, 0);
});

test('migration does not guess between assessments with the same name or ambiguous substages', () => {
  let n = 0;
  const a = clone(sample[0]);
  const v2 = CW.migrate({ assessments: [a, clone(a)], actionResult: { assessmentName: a.General.Name, options: [] }, selectedActions: [{ rule: 'solar_pv', title: { en: 'Solar PV at utility sites' } }], finished: { [a.General.Name]: 't' } }, p => `${p}_${++n}`);
  assert.strictEqual(v2.actionSet.assessmentId, null);
  assert.deepStrictEqual(v2.finished, {});
  // two substages with the same name → the old pump selection cannot be mapped reliably
  const b = clone(sample[0]);
  b.Water.Abstraction.push(clone(b.Water.Abstraction[0]));
  const opts = I.optionsFor(b, meta(b, 'a_b'));
  const legacy = [{ rule: 'pump_upgrade', title: { en: 'Upgrade pump system – River intake pumping' } }];
  const r = CW.mapLegacy(legacy, opts);
  assert.strictEqual(r.mapped.length, 0); assert.strictEqual(r.review.length, 1);
});

test('legacy mapping restores a selection only when the match is unique in both directions', () => {
  const a = clone(sample[0]);
  const opts = I.optionsFor(a, meta(a, 'a_main'));
  const pump = opts.find(o => o.rule === 'pump_upgrade');
  const desl = opts.find(o => o.rule === 'septic_desludging');
  // two old selections that would both map to the same option: neither is restored
  let r = CW.mapLegacy([{ rule: pump.rule, title: pump.title }, { rule: pump.rule, title: { ...pump.title } }, { rule: desl.rule, title: desl.title }], opts);
  assert.deepStrictEqual(r.mapped.map(x => x.key), [desl.key]);
  assert.strictEqual(r.review.length, 2);
  // missing or non-English title, wrong rule: unresolved
  r = CW.mapLegacy([{ rule: pump.rule }, { rule: pump.rule, title: pump.title.id }, { rule: 'solar_pv', title: pump.title }], opts);
  assert.deepStrictEqual([r.mapped.length, r.review.length], [0, 3]);
  // two candidates with the same rule and title (duplicated substage): unresolved
  const b = clone(sample[0]);
  b.Waste.Onsite.push(clone(b.Waste.Onsite[0]));
  r = CW.mapLegacy([{ rule: desl.rule, title: desl.title }], I.optionsFor(b, meta(b, 'a_b')));
  assert.deepStrictEqual([r.mapped.length, r.review.length], [0, 1]);
});

(async () => {
  console.log('Data integrity');
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok -', name); }
  console.log(`\n${passed} integrity tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
