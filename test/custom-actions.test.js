const fixtureStatus = require('./helpers/fixtures');
/*
 * User-proposed (custom) actions: identity, display, freshness, server validation and the
 * plan → proposal → Word/ZIP journey. HYPOTHETICAL sample utility plus SYNTHETIC user text only;
 * no external calls (AI off). Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JSZip = require('jszip');
const CW = require('../public/js/cw-core');
const CA = require('../public/js/custom-actions');
const AS = require('../public/js/action-sources');
const DC = require('../public/js/decision-cards');
const I = require('../engine/integrity');
const engine = require('../engine/ecam-engine');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta, clone } = require('./helpers/fixtures');

const UI = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8') + ';UI');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const fmt = (n, d) => (n == null || !Number.isFinite(n)) ? '–' : new Intl.NumberFormat('en-US', { maximumFractionDigits: d === undefined ? 1 : d }).format(n);
const ctx = (lang = 'en') => ({
  t: k => UI[lang][k] ?? UI.en[k] ?? k,
  L: o => (o && typeof o === 'object') ? (o[lang] || o.en) : (o ?? ''),
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmt, labelOf: c => c, unitView: () => ({ unit: '', mult: 1 }), status: () => ({ origin: 'unknown', confirmed: false }),
  stageLabel: p => p, substageName: sid => ({ wwo_0: 'Household septic tanks', wsa_0: 'River intake pumping' }[sid] || null),
});
const docText = async buf => (await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string'))
  .replace(/<[^>]+>/g, ' ').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const AID = 'a_main';
let seq = 0;
/** SYNTHETIC user action. */
function custom(input = {}, aid = AID) {
  seq++;
  return CA.create({
    assessmentId: aid, cid: 'c_synthetic' + String(seq).padStart(4, '0'), label: 'U' + String(seq).padStart(2, '0'), now: '2026-10-18T00:00:00Z',
    input: { title: `Synthetic action ${seq}`, description: 'Synthetic description: inspect and repair valves.', problem: '', location: { at: 'assessment' }, ...input },
  });
}
function options(assessment = clone(sample[0])) {
  const o = I.optionsFor(assessment, meta(assessment, AID), 0);
  CW.assignLabels(o, {});
  return o;
}

// ------------------------------------------------------------------ model
test('custom actions are an explicit type with a persistent ID bound to their assessment; labels are separate and not reused', () => {
  const a = custom({ title: '  Leak survey  ', location: { at: 'substage', prefix: 'wsd', sid: 'wsd_0' } });
  assert.deepStrictEqual([a.origin, a.rule, a.assessmentId, a.key], ['user', 'custom', AID, `${AID}|custom|${a.cid}`]);
  assert.strictEqual(a.title, 'Leak survey', 'trimmed, otherwise as written');
  assert.deepStrictEqual([a.expected_kgco2, a.expected_kwh, a.benefit_status], [null, null, { kgco2: 'not_quantified', kwh: 'not_quantified' }]);
  assert.deepStrictEqual(a.location, { at: 'substage', prefix: 'wsd', sid: 'wsd_0' }, 'location is a substage ID, not a name or position');
  // editing changes content, never identity, origin, label or assessment
  const b = CA.update(a, { title: 'Leak survey (edited)', description: 'x', problem: '', location: { at: 'assessment' } }, 'later');
  assert.deepStrictEqual([b.key, b.cid, b.id, b.origin, b.assessmentId], [a.key, a.cid, a.id, a.origin, a.assessmentId]);
  assert.strictEqual(CA.nextLabel(['U01', 'U03']), 'U04');
  assert.strictEqual(CA.nextLabel(['U02', 'U05'].filter(l => l !== 'U05').concat('U05')), 'U06', 'the last label handed out is counted even after deletion');
  assert.strictEqual(CA.create({ assessmentId: AID, cid: 'c_abcdefgh12', label: 'U01', input: { title: '', description: 'd' } }), null, 'title required');
  assert.strictEqual(CA.create({ assessmentId: AID, cid: 'c_abcdefgh12', label: 'U01', input: { title: 't', description: '   ' } }), null, 'description required');
  assert.deepStrictEqual(CA.fieldErrors({ title: 'x'.repeat(121), description: 'd', notes: 'n'.repeat(2001) }), { title: 'too_long', notes: 'too_long' });
  // a location never resolves to another substage: a deleted one is reported as missing
  const m = meta(sample[0], AID);
  assert.deepStrictEqual(CA.resolveLocation(a, m), { at: 'substage', prefix: 'wsd', sid: 'wsd_0', index: 0 });
  assert.deepStrictEqual(CA.resolveLocation({ ...a, location: { at: 'substage', prefix: 'wsd', sid: 'wsd_9' } }, m).at, 'missing');
  assert.deepStrictEqual(CA.resolveLocation({ ...a, location: { at: 'substage', prefix: 'wsa', sid: 'wsd_0' } }, m).at, 'missing', 'prefix must match too');
});

// ------------------------------------------------------------------ display
test('cards show user-proposed, both benefits not quantified and not reviewed, with no classification; user text stays text', () => {
  const a = custom({ title: '<img src=x onerror=alert(1)> Valve programme', description: 'Line one\n<b>not bold</b>', problem: 'Leaks & bursts',
    location: { at: 'substage', prefix: 'wwo', sid: 'wwo_0' } });
  const html = DC.customCard(a, ctx(), { selected: true, note: 'Synthetic note', location: CA.resolveLocation(a, meta(sample[0], AID)) });
  for (const s of ['User-proposed', 'GHG benefit not quantified', 'Energy benefit not quantified', 'Not scientifically reviewed', 'wwo › Household septic tanks', 'Synthetic note'])
    assert.ok(html.includes(s), s);
  assert.ok(!html.includes('<img') && html.includes('&lt;img src=x onerror=alert(1)&gt;') && html.includes('&lt;b&gt;not bold&lt;/b&gt;') && html.includes('Leaks &amp; bursts'));
  assert.ok(!/data-classification="(direct|indirect|pending)"/.test(html) && !/Direct emissions|Indirect emissions/.test(html), 'no automatic classification');
  assert.ok(html.includes('data-classification="none"') && html.includes('A location alone does not establish the emission type'));
  assert.ok(!html.includes('data-explain') && !html.includes('Why it appeared'), 'no rule explanation or AI explain');
  assert.ok(html.includes('data-edit-custom') && html.includes('data-delete-custom') && html.includes('checked'));
  assert.strictEqual(AS.describe(a), null, 'never passes through the source/classification mapping');
  const missing = DC.customCard(a, ctx(), { location: { at: 'missing', prefix: 'wwo', sid: 'wwo_9' } });
  assert.ok(missing.includes('data-location-missing') && missing.includes('it is not moved automatically'));
  const id = DC.customCard(a, ctx('id'), { location: { at: 'assessment' } });
  assert.ok(id.includes('Usulan pengguna') && id.includes('Belum ditinjau secara ilmiah') && id.includes('Seluruh penilaian'));
  assert.ok(id.includes('&lt;img src=x onerror=alert(1)&gt; Valve programme'), 'user text is not translated');
  for (const k of Object.keys(UI.en).filter(k => /^(ca_|add_custom|user_proposed|not_reviewed|loc_assessment|stale_custom_)/.test(k))) assert.ok(UI.id[k], `id: ${k}`);
});

test('sorting keeps custom actions with the unquantified options, preserving identity, order, notes and selection', () => {
  const opts = options();
  const u1 = custom(), u2 = custom();
  const all = [...opts, u1, u2];
  const snapshot = JSON.stringify(all);
  for (const m of ['ghg', 'kwh']) {
    const sorted = AS.sortOptions(all, m);
    assert.ok(sorted.every(o => all.includes(o)) && sorted.length === all.length, 'same objects');
    const firstUnq = sorted.findIndex((o, i) => i > 0 && !AS.isQuantified(o, m));
    assert.ok(sorted.slice(firstUnq).every(o => !AS.isQuantified(o, m)), 'unquantified block is last');
    assert.ok(sorted.indexOf(u1) > firstUnq - 1 && sorted.indexOf(u1) < sorted.indexOf(u2), 'custom actions keep stored order among unquantified');
  }
  assert.strictEqual(JSON.stringify(all), snapshot);
  const line = DC.customCard(u1, ctx(), { measure: 'kwh', note: 'kept', selected: true, location: { at: 'assessment' } });
  assert.ok(line.includes('data-quantified="false"') && line.includes('<b>Energy benefit not quantified</b>') && line.includes('kept') && line.includes('checked'));
});

// ------------------------------------------------------------------ freshness
function project(selected) {
  const assessment = clone(sample[0]), m = meta(assessment, AID);
  const inputStatus=fixtureStatus.confirmedInputs(assessment,m), supportRevision=require('../engine/assessment-validity').calculate(assessment,0,{meta:m,inputStatus}).supportRevision;
  const basis = {supportRevision, assessmentId: AID, revision: CW.revision(assessment), gwpIndex: 0 };
  const profile = { name: 'Utility A (hypothetical)' };
  const selectedActions = selected.map(o => ({ ...o, notes: '' }));
  const plan = { tasks: [], summary: 'Synthetic plan.', deps: CW.planDeps({ assessmentId: AID, assessment, supportRevision, gwpIndex: 0, actions: selectedActions, profile }) };
  const proposal = { sections: [], deps: CW.proposalDeps({ assessmentId: AID, assessment, supportRevision, gwpIndex: 0, actions: selectedActions, plan, profile, financing: { route: 'general' } }) };
  return { assessment, m, basis, profile, selectedActions, plan, proposal };
}
const freshOf = (p, customActions, actionNotes = {}) => CW.freshness({
  assessments: [{ id: AID, revision: CW.revision(p.assessment) }], gwpIndex: 0, actionSet: p.basis, selectedActions: p.selectedActions,
  plan: p.plan, proposal: p.proposal, profile: p.profile, financing: { route: 'general' },
  customActions: customActions && CW.customDefs(customActions, actionNotes),
});

test('editing or deleting a selected custom action marks downstream outdated; unselected edits do not; text is kept', () => {
  const sel = custom({ title: 'Selected synthetic' }), other = custom({ title: 'Unselected synthetic' });
  const p = project([byRule(options(), 'pump_upgrade'), sel]);
  const clean = { options: [], actions: [], plan: [], proposal: [] };
  assert.deepStrictEqual(freshOf(p, [sel, other]), clean);
  // unselected edit or delete: nothing outdated
  assert.deepStrictEqual(freshOf(p, [sel, CA.update(other, { ...other, title: 'Edited' }, 'x')]), clean);
  assert.deepStrictEqual(freshOf(p, [sel]), clean);
  // selected edit (each downstream field), notes edit and delete
  for (const change of [{ title: 'Changed' }, { description: 'Changed description' }, { problem: 'New problem' }, { location: { at: 'substage', prefix: 'wsa', sid: 'wsa_0' } }]) {
    const f = freshOf(p, [CA.update(sel, { ...sel, ...change }, 'x'), other]);
    assert.deepStrictEqual(f.actions, ['custom_changed'], JSON.stringify(change));
    assert.ok(f.plan.includes('actions_outdated') && f.proposal.includes('actions_outdated'));
  }
  assert.deepStrictEqual(freshOf(p, [sel, other], { [sel.key]: 'new note' }).actions, ['custom_changed']);
  assert.deepStrictEqual(freshOf(p, [other]).actions, ['custom_deleted']);
  assert.strictEqual(p.plan.summary, 'Synthetic plan.', 'text untouched');
  // re-saving the edited action updates the selection; the plan then reports the change through its fingerprint
  const edited = CA.update(sel, { ...sel, title: 'Changed' }, 'x');
  p.selectedActions = p.selectedActions.map(a => a.key === sel.key ? { ...edited, notes: '' } : a);
  const f = freshOf(p, [edited, other]);
  assert.deepStrictEqual([f.actions, f.plan.includes('actions_changed'), f.proposal.includes('actions_changed')], [[], true, true]);
});

test('older sessions without custom actions keep their fingerprints and freshness', () => {
  const opts = options();
  const sel = [byRule(opts, 'pump_upgrade'), byRule(opts, 'septic_desludging')].map(o => ({ ...o, notes: 'n' }));
  // the fingerprint of calculated actions is the same as before custom actions existed
  const before = CW.fp(sel.map(a => ({ key: a.key, rule: a.rule, title: a.title.en, kg: +a.expected_kgco2.toPrecision(12), kwh: +a.expected_kwh.toPrecision(12), notes: 'n' }))
    .sort((x, y) => x.key.localeCompare(y.key)));
  assert.strictEqual(CW.actionsFingerprint(sel), before);
  const p = project(sel);
  assert.deepStrictEqual(freshOf(p, undefined), freshOf(p, []));
  assert.deepStrictEqual(freshOf(p, undefined).actions, []);
});

// ------------------------------------------------------------------ server validation
const byRule = (opts, rule) => opts.find(o => o.rule === rule);
const issues = (p, actions, m = p.m) => I.actionIssues({ inputStatus:fixtureStatus.confirmedInputs(p.assessment,m),assessment: p.assessment, meta: m, gwpIndex: 0, actions, actionSet: p.basis });

test('server: custom actions take an explicit path; malformed or mixed-assessment ones are rejected; calculated ones are still recalculated', () => {
  const opts = options();
  const ok = { ...custom({ location: { at: 'substage', prefix: 'wwo', sid: 'wwo_0' } }), notes: 'n' };
  const p = project([ok]);
  assert.deepStrictEqual(issues(p, [ok]), [], 'custom only');
  assert.deepStrictEqual(issues(p, [byRule(opts, 'pump_upgrade'), ok]), [], 'mixed');
  const bad = {
    'benefit figures': { ...ok, expected_kgco2: 5000 },
    'quantified status': { ...ok, benefit_status: { kgco2: 'quantified', kwh: 'not_quantified' } },
    'injected evidence': { ...ok, evidence: 'ECAM shows a large saving' },
    'injected basis': { ...ok, basis: 'ECAM' },
    'other assessment': { ...custom({}, 'a_other') },
    'key mismatch': { ...ok, key: `a_other|custom|${ok.cid}` },
    'missing title': { ...ok, title: ' ' },
    'missing description': { ...ok, description: undefined },
    'too long': { ...ok, description: 'x'.repeat(2001) },
    'non-text title': { ...ok, title: { en: 'x' } },
    'bad cid': { ...ok, cid: '../x', key: `${AID}|custom|../x` },
    'deleted substage': { ...ok, location: { at: 'substage', prefix: 'wwo', sid: 'wwo_7' } },
    'malformed location': { ...ok, location: { at: 'somewhere' } },
    'origin only': { ...ok, origin: 'ecam' },
    'rule only': { ...ok, rule: 'pump_upgrade', origin: 'user' },
  };
  for (const [name, a] of Object.entries(bad)) assert.ok(issues(p, [a]).length, name);
  assert.ok(/substage no longer exists/.test(issues(p, [bad['deleted substage']])[0]));
  assert.ok(/cannot carry benefit figures/.test(issues(p, [bad['benefit figures']])[0]));
  assert.ok(issues(p, [ok, ok]).some(x => /more than once/.test(x)));
  assert.ok(issues(p, [null]).length && issues(p, 'x').length && issues(p, [[]]).length, 'non-objects');
  // a tampered calculated figure is still caught next to a valid custom action
  const pump = byRule(opts, 'pump_upgrade');
  assert.ok(issues(p, [{ ...pump, expected_kgco2: pump.expected_kgco2 * 2 }, ok]).some(x => /do not match the assessment/.test(x)));
  // calculated estimates are unchanged by the existence of custom actions
  assert.deepStrictEqual(options().map(o => [o.key, o.expected_kgco2, o.expected_kwh]), opts.map(o => [o.key, o.expected_kgco2, o.expected_kwh]));
});

// ------------------------------------------------------------------ journeys over HTTP
async function journey(post, selection, lang = 'en') {
  const assessment = clone(sample[0]), m = meta(assessment, AID);
  const acts = await (await post('/api/actions', { assessment, meta: m })).json();
  const chosen = selection(acts.options).map(o => ({ ...o, notes: o.origin === 'user' ? 'Synthetic note for the user action.' : '' }));
  const actionSet = { ...acts.basis, savedAt: 'now' };
  const profile = { name: 'Utility A (hypothetical)' };
  const planRes = await post('/api/plan', { assessment, meta: m, actions: chosen, actionSet, profile, lang });
  assert.strictEqual(planRes.status, 200, await planRes.clone().text());
  const plan = await planRes.json();
  // Frozen legacy framework is tested directly for historical draft/export compatibility.
  // New GCF HTTP generation, including custom actions, is covered by preliminary-concept.test.js.
  const P=require('../engine/proposal');
  const proposal={...await P.draftProposal({actions:chosen,plan,profile,meta:m,lang,results:engine.calculateOne(assessment,0)},P.financingFrameworks().find(f=>f.id==='general')),lang,
    deps:CW.proposalDeps({assessmentId:m.id,assessment,gwpIndex:0,actions:chosen,plan,profile,supportRevision:actionSet.supportRevision,financing:{route:'general'}})};
  const customActions = chosen.filter(CW.isCustom).map(({ notes, ...c }) => c);
  const actionNotes = Object.fromEntries(chosen.filter(CW.isCustom).map(c => [c.key, c.notes]));
  const state = { assessments: [assessment], assessmentMeta: [m], gwpIndex: 0, actionSet, selectedActions: chosen, customActions, actionNotes, plan, proposal, profile, financing: { route: 'general' }, lang };
  return { assessment, m, acts, chosen, plan, proposal, state };
}

test('custom-only and mixed journeys reach plan, proposal, Word and ZIP with origin and unquantified benefits visible', async () => {
  const server = app.listen(0);
  const post = (p, body) => fetch(`http://localhost:${server.address().port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtureStatus.withConfirmedInputs(body)) });
  try {
    const u = custom({ title: 'Synthetic valve programme', description: 'Replace faulty valves in zone 3.', problem: 'Pressure losses', location: { at: 'substage', prefix: 'wwo', sid: 'wwo_0' } });
    const u2 = custom({ title: 'Synthetic staff training', description: 'Train operators on energy logging.' });
    for (const [name, selection] of [['custom only', () => [u, u2]], ['mixed', opts => [byRule(opts, 'pump_upgrade'), byRule(opts, 'solar_pv'), u]]]) {
      const j = await journey(post, selection);
      const calc = j.chosen.filter(a => !CW.isCustom(a));
      // calculated estimates come back unchanged from the server's own run
      for (const a of calc) { const o = j.acts.options.find(x => x.key === a.key); assert.deepStrictEqual([a.expected_kgco2, a.expected_kwh], [o.expected_kgco2, o.expected_kwh]); }
      const uTasks = j.plan.tasks.filter(k => k.action_key === u.key);
      assert.ok(uTasks.length === 6 && uTasks.every(k => k.action === 'Synthetic valve programme' && k.action_origin === 'user'), `${name}: plan tasks`);
      assert.ok(j.plan.summary.includes('Synthetic valve programme (User-proposed)') && j.plan.summary.includes('not generated by ECAM'), `${name}: ${j.plan.summary}`);
      const actionsSec = j.proposal.sections.find(s => s.key === 'actions').text;
      assert.ok(actionsSec.includes(`${j.chosen.find(a => a.key === u.key).id} Synthetic valve programme`) && actionsSec.includes('Synthetic valve programme (User-proposed; not scientifically reviewed): Replace faulty valves in zone 3.'), actionsSec);
      assert.ok(actionsSec.includes('Location: wwo › Household septic tanks') || actionsSec.includes('Location: Onsite sanitation › Household septic tanks'), actionsSec);
      assert.ok(actionsSec.includes('GHG benefit not quantified · Energy benefit not quantified'));
      assert.ok(!/ECAM (recommends|suggests|identified)/i.test(JSON.stringify(j.proposal)) && !/(cost|saving)s? of [\d]/i.test(actionsSec));
      if (j.chosen.length > 1) assert.ok(actionsSec.includes('Combined savings have not been assessed because actions may overlap.'), `${name}: overlap warning`);
      // Word
      const docRes = await post('/api/export/docx', j.state);
      assert.strictEqual(docRes.status, 200, await docRes.clone().text());
      const doc = await docText(Buffer.from(await docRes.arrayBuffer()));
      for (const s of ['Synthetic valve programme', 'User-proposed · Not scientifically reviewed', 'What will be done: Replace faulty valves in zone 3.', 'Problem addressed: Pressure losses',
        'Location: Onsite sanitation › Household septic tanks', 'GHG benefit not quantified · Energy benefit not quantified', UI.en.ca_doc_note]) assert.ok(doc.includes(s), `${name} Word: ${s}`);
      // ZIP
      const zipRes = await post('/api/export', j.state);
      assert.strictEqual(zipRes.status, 200, await zipRes.clone().text());
      const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));
      const sel = JSON.parse(await zip.file('actions/selected-actions.json').async('string'));
      const entry = sel.find(a => a.key === u.key);
      assert.deepStrictEqual([entry.origin, entry.benefit_status, entry.scientific_review, entry.emission_classification, entry.location_text, entry.location_status, entry.expected_kgco2],
        ['user', { kgco2: 'not_quantified', kwh: 'not_quantified' }, 'not_reviewed', null, 'Onsite sanitation › Household septic tanks', 'substage', null]);
      const csvText = await zip.file('plan/project-plan.csv').async('string');
      assert.ok(csvText.split('\n')[0].endsWith(',action_origin') && csvText.includes('Synthetic valve programme') && csvText.includes(',user-proposed'));
      assert.ok((await zip.file('README.txt').async('string')).includes('proposed by the utility team'));
    }
    // Indonesian output: labels translated, the user's text as written
    const id = await journey(post, () => [u], 'id');
    const sec = id.proposal.sections.find(s => s.key === 'actions').text;
    assert.ok(sec.includes('Synthetic valve programme (Usulan pengguna; belum ditinjau secara ilmiah): Replace faulty valves in zone 3.'), sec);
    assert.ok(sec.includes('Manfaat GRK belum dihitung · Manfaat energi belum dihitung'));
  } finally { server.close(); }
});

test('exports are blocked for edited, deleted, mixed-assessment or relocated custom actions; text is never rewritten', async () => {
  const server = app.listen(0);
  const post = (p, body) => fetch(`http://localhost:${server.address().port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixtureStatus.withConfirmedInputs(body)) });
  try {
    const u = custom({ title: 'Synthetic export check' });
    const j = await journey(post, opts => [byRule(opts, 'pump_upgrade'), u]);
    const exp = s => post('/api/export', s);
    assert.strictEqual((await exp(j.state)).status, 200);
    const proposalText = JSON.stringify(j.state.proposal);
    // edited after the selection was saved
    let r = await exp({ ...j.state, customActions: [{ ...j.state.customActions[0], title: 'Edited later' }] });
    assert.strictEqual(r.status, 409);
    assert.ok((await r.json()).issues.some(x => /edited after the selection was saved/.test(x)));
    // deleted
    r = await exp({ ...j.state, customActions: [] });
    assert.ok((await r.json()).issues.some(x => /was deleted/.test(x)));
    // a custom action from another assessment smuggled into the selection
    const foreign = { ...custom({}, 'a_other'), notes: '' };
    r = await exp({ ...j.state, selectedActions: [...j.state.selectedActions, foreign] });
    assert.strictEqual(r.status, 409);
    assert.ok((await r.json()).issues.some(x => /different assessment/.test(x)));
    // drafting endpoints reject it too
    r = await post('/api/plan', { assessment: j.assessment, meta: j.m, actions: [foreign], actionSet: j.state.actionSet });
    assert.strictEqual(r.status, 409);
    // the source assessment was removed from the project
    r = await exp({ ...j.state, assessments: [], assessmentMeta: [] });
    assert.strictEqual(r.status, 409);
    // malformed payloads are 409, not server errors
    for (const body of [{ ...j.state, selectedActions: [null] }, { ...j.state, selectedActions: 'x' }, { ...j.state, customActions: [1] }]) assert.strictEqual((await exp(body)).status, 409);
    assert.strictEqual(JSON.stringify(j.state.proposal), proposalText, 'outputs are not rewritten');
  } finally { server.close(); }
});

test('renaming the assessment or substage keeps links; a deleted substage is flagged, not reassigned', () => {
  const assessment = clone(sample[0]), m = meta(assessment, AID);
  const u = custom({ location: { at: 'substage', prefix: 'wwo', sid: 'wwo_0' } });
  const rev = CW.revision(assessment);
  assessment.General.Name = 'Renamed (synthetic)';
  assessment.Waste.Onsite[0].name = 'Renamed septic tanks (synthetic)';
  assert.strictEqual(CW.revision(assessment), rev, 'names are not part of the revision');
  const r = engine.calculateOne(assessment, 0);
  const X = require('../engine/export');
  assert.strictEqual(X.customLocationText(u, 'en', { results: r, meta: m }), 'Onsite sanitation › Renamed septic tanks (synthetic)');
  // delete the substage: its ID leaves the metadata and nothing takes its place
  const m2 = { ...m, substages: { ...m.substages, wwo: [] } };
  assert.strictEqual(CA.resolveLocation(u, m2).at, 'missing');
  assert.ok(X.customLocationText(u, 'en', { results: r, meta: m2 }).includes('location needs review'));
  assert.ok(CA.validate({ ...u }, m2).includes('location_missing'));
  // a new substage at the same position gets a new ID and is not linked
  const m3 = { ...m, substages: { ...m.substages, wwo: ['s_new_substage'] } };
  assert.strictEqual(CA.resolveLocation(u, m3).at, 'missing');
});

(async () => {
  console.log('Custom actions');
  let passed = 0;
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok -', name); }
  console.log(`\n${passed} custom-action tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
