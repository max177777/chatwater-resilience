/*
 * The default test run never reaches a paid model, even with a key in the
 * environment, and AI paths can be exercised with an injected client. Run: npm test
 */
const assert = require('assert');
const ai = require('../engine/ai');
const app = require('../server');
const sample = require('../public/samples/utility-a-indonesia.json');

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
    assert.strictEqual(r.status, 400);
    assert.match((await r.json()).error, /Blocked external request/);
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
    assert.strictEqual(fail.status, 400);
    assert.match((await fail.json()).error, /simulated provider outage/);
    console.log('  ok - injected client: failure path');

    ai.setClient(null);
    assert.strictEqual(globalThis.__blockedRequests.length, 1, 'no other external request was attempted');
    console.log('\nAI offline tests passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { ai.setClient(null); server.close(); }
})();
