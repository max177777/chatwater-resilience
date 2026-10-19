/* API smoke test: stage 1 → 4 without AI. Run: npm test */
const assert = require('assert');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta } = require('./helpers/fixtures');
const { ensureLibrary } = require('./helpers/synthetic-library');

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const assessment = sample[0], m = meta(assessment, 'a_sample');
  const lib = ensureLibrary();
  try {
    console.log(`API${lib.synthetic ? ' (document library not built: synthetic test library used)' : ''}`);
    const calc = await (await post('/api/calculate', { assessments: sample })).json();
    assert.ok(calc.results[0].totals.total > 0); console.log('  ok - calculate');

    const acts = await (await post('/api/actions', { assessment, meta: m })).json();
    assert.strictEqual(acts.options[0].id, 'A00');
    assert.strictEqual(acts.basis.assessmentId, 'a_sample');
    const desludge = acts.options.find(o => o.rule === 'septic_desludging');
    assert.strictEqual(desludge.key, 'a_sample|septic_desludging|wwo_0');
    // hand calc: 0.3 kg/p/d x 500,000 x 365 / 1400 kg/m3 x 33% = m3 emptied; x 67.8 kgBOD/m3 x 0.3 kgCH4/kgBOD x 34
    const m3 = 0.3 * 500000 * 365 / 1400 * 0.33;
    assert.ok(Math.abs(desludge.expected_kgco2 - m3 * 67.8 * 0.3 * 34) < 1); console.log('  ok - actions (desludging re-run matches hand calc)');

    const chosen = acts.options.filter(o => ['septic_desludging', 'pump_upgrade'].includes(o.rule));
    const actionSet = acts.basis;
    const plan = await (await post('/api/plan', { assessment, meta: m, actions: chosen, actionSet })).json();
    assert.strictEqual(plan.tasks.length, 12); assert.ok(plan.summary.length > 50); assert.ok(plan.deps.actionsFingerprint);
    console.log('  ok - plan');

    let proposal;
    for (const route of ['general', 'gcf']) {
      proposal = await (await post('/api/proposal', { assessment, meta: m, actions: chosen, actionSet, plan, route, lang: 'id' })).json();
      assert.ok(proposal.sections.length >= 8);
    }
    console.log('  ok - proposal (general, gcf)');

    const chat = await (await post('/api/chat', { messages: [{ role: 'user', content: 'grid emission factor' }], assessment, meta: m })).json();
    assert.strictEqual(chat.ai, false);
    assert.strictEqual(chat.reply, undefined, 'with AI off there is no simulated answer');
    assert.strictEqual(chat.retrieval.status, 'found');
    assert.ok(chat.retrieval.passages.every(p => p.sourceId && p.locatorLabel && p.text));
    assert.strictEqual(chat.context.assessment.id, m.id); console.log('  ok - chat retrieval (AI off: excerpts and context, no answer)');

    const zip = await post('/api/export', { assessments: sample, assessmentMeta: [m], selectedActions: chosen, actionSet, plan, proposal, financing: { route: 'gcf' } });
    assert.strictEqual(zip.status, 200, await zip.clone().text());
    assert.strictEqual(zip.headers.get('content-type'), 'application/zip');
    assert.ok((await zip.arrayBuffer()).byteLength > 5000); console.log('  ok - export zip');
    console.log('\nAPI tests passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { lib.restore(); server.close(); }
})();
