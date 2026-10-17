/*
 * The default test run never reaches a paid model, even with a key in the
 * environment, and AI paths can be exercised with an injected client. Run: npm test
 */
const assert = require('assert');
const ai = require('../engine/ai');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');
const { meta } = require('./helpers/fixtures');

(async () => {
  console.log('AI offline');
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const chat = { messages: [{ role: 'user', content: 'grid emission factor' }], assessment: sample[0] };
  try {
    assert.ok(typeof globalThis.__blockedRequests !== 'undefined', 'offline guard is loaded');
    assert.strictEqual(process.env.ANTHROPIC_API_KEY, undefined, 'guard removes the key');
    console.log('  ok - guard loaded, API key removed');

    // a key appearing anyway (e.g. set by a test or the CI environment) still cannot reach the network
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key';
    const r = await post('/api/chat', chat);
    assert.strictEqual(r.status, 502);
    assert.match((await r.json()).error, /could not be reached: Blocked external request/);
    assert.deepStrictEqual(globalThis.__blockedRequests, ['https://api.anthropic.com/v1/messages']);
    delete process.env.ANTHROPIC_API_KEY;
    console.log('  ok - with a key present, the model request is blocked before leaving the machine');

    // controlled success: injected client, citations filtered to retrieved sources
    const seen = [];
    ai.setClient(async req => { seen.push(req); return 'Use the official grid factor [S1]. Unknown [S9].'; });
    const ok = await (await post('/api/chat', chat)).json();
    assert.match(ok.reply, /\[S1\]/);
    assert.strictEqual(ok.sources.length, 1);
    assert.ok(seen[0].system.includes('UTILITY DATA (from ECAM)'));
    console.log('  ok - injected client: success path and citation filtering');

    // controlled failure: the route reports the error instead of inventing text
    ai.setClient(async () => { throw new Error('simulated provider outage'); });
    const fail = await post('/api/chat', chat);
    assert.strictEqual(fail.status, 502, 'provider failures are not reported as bad input');
    assert.match((await fail.json()).error, /AI service failed: simulated provider outage/);
    console.log('  ok - injected client: failure path');

    // plan: a provider failure fails the request (the browser keeps the current plan)
    const m = meta(sample[0], 'a_sample');
    const acts = await (await post('/api/actions', { assessment: sample[0], meta: m })).json();
    const chosen = acts.options.filter(o => ['septic_desludging', 'pump_upgrade'].includes(o.rule));
    const body = { assessment: sample[0], meta: m, actions: chosen, actionSet: acts.basis, lang: 'en' };
    const pf = await post('/api/plan', body);
    assert.strictEqual(pf.status, 502);
    console.log('  ok - plan: provider failure returns 502, no half-made plan');

    // proposal: failing sections fall back to template text, are marked, and carry no error text
    ai.setClient(async () => 'AI plan summary (synthetic).');
    const plan = await (await post('/api/plan', body)).json();
    assert.strictEqual(plan.ai, true);
    let n = 0;
    ai.setClient(async () => { if (++n % 2 === 0) throw new Error('simulated overload'); return 'AI section text (synthetic).'; });
    const prop = await (await post('/api/proposal', { ...body, plan, route: 'general' })).json();
    const bad = prop.sections.filter(s => s.ai === false), good = prop.sections.filter(s => s.ai === true);
    assert.ok(bad.length && good.length);
    assert.strictEqual(prop.ai, false, 'a partly templated draft is not labelled AI-generated');
    assert.deepStrictEqual(prop.ai_failed.map(x => x.key), bad.map(s => s.key));
    assert.ok(prop.sections.every(s => !/AI error|simulated overload/.test(s.text)), 'no error text in the document');
    assert.ok(good.every(s => s.text === 'AI section text (synthetic).'));
    console.log('  ok - proposal: failed sections are template text, marked, without error text');
    ai.setClient(null);

    // HTTP client: non-JSON error page, timeout, network failure and empty answer (fetch stubbed, fake key)
    const realFetch = globalThis.fetch;
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key';
    const cases = [
      [async () => new Response('<html>Bad gateway</html>', { status: 502 }), /returned an error \(502\)\./, 502],
      [async () => new Response(JSON.stringify({ error: { message: 'Overloaded' } }), { status: 529 }), /\(529\): Overloaded/, 529],
      [async () => { throw new DOMException('timed out', 'TimeoutError'); }, /did not respond in time/, null],
      [async () => { throw new TypeError('fetch failed'); }, /could not be reached: fetch failed/, null],
      [async () => new Response(JSON.stringify({ content: [] }), { status: 200 }), /empty answer/, null],
    ];
    try {
      for (const [stub, msg, providerStatus] of cases) {
        globalThis.fetch = async (url, opts) => { assert.ok(opts.signal, 'request has a timeout'); return stub(); };
        await assert.rejects(ai.callClaude({ system: 's', messages: [] }), e => msg.test(e.message) && e.status === 502 && e.providerStatus === providerStatus && !e.message.includes('sk-test'));
      }
    } finally { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }
    console.log('  ok - HTTP client: error page, overload, timeout, network failure, empty answer');

    assert.strictEqual(globalThis.__blockedRequests.length, 1, 'no other external request was attempted');
    console.log('\nAI offline tests passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { ai.setClient(null); server.close(); }
})();
