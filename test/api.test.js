/* API smoke test: stage 1 → 4 without AI. Run: npm test */
const assert = require('assert');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const assessment = sample[0];
  try {
    console.log('API');
    const calc = await (await post('/api/calculate', { assessments: sample })).json();
    assert.ok(calc.results[0].totals.total > 0); console.log('  ok - calculate');

    const acts = await (await post('/api/actions', { assessment })).json();
    assert.strictEqual(acts.options[0].id, 'A00');
    const desludge = acts.options.find(o => o.rule === 'septic_desludging');
    // hand calc: 0.3 kg/p/d x 500,000 x 365 / 1400 kg/m3 x 33% = m3 emptied; x 67.8 kgBOD/m3 x 0.3 kgCH4/kgBOD x 34
    const m3 = 0.3 * 500000 * 365 / 1400 * 0.33;
    assert.ok(Math.abs(desludge.expected_kgco2 - m3 * 67.8 * 0.3 * 34) < 1); console.log('  ok - actions (desludging re-run matches hand calc)');

    const chosen = acts.options.filter(o => ['septic_desludging', 'pump_upgrade'].includes(o.rule));
    const plan = await (await post('/api/plan', { assessment, actions: chosen })).json();
    assert.strictEqual(plan.tasks.length, 12); assert.ok(plan.summary.length > 50); console.log('  ok - plan');

    for (const route of ['general', 'gcf']) {
      const prop = await (await post('/api/proposal', { assessment, actions: chosen, plan, route, lang: 'id' })).json();
      assert.ok(prop.sections.length >= 8);
    }
    console.log('  ok - proposal (general, gcf)');

    const chat = await (await post('/api/chat', { messages: [{ role: 'user', content: 'grid emission factor' }], assessment })).json();
    assert.ok(chat.sources.length > 0); console.log('  ok - chat retrieval');

    const zip = await post('/api/export', { assessments: sample, selectedActions: chosen, plan, proposal: { title: 'x', sections: [{ key: 'baseline', title: 'Baseline', text: 'x' }] } });
    assert.strictEqual(zip.headers.get('content-type'), 'application/zip');
    assert.ok((await zip.arrayBuffer()).byteLength > 5000); console.log('  ok - export zip');
    console.log('\nAPI tests passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { server.close(); }
})();
