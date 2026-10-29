/* Gemini backend: request shape, response parsing and provider choice, without network. Run: npm test */
const assert = require('assert');

(async () => {
  console.log('Gemini backend');
  const saved = { ...process.env };
  const ai = require('../engine/ai');
  try {
    // provider choice
    delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.LLM_PROVIDER;
    assert.strictEqual(ai.aiEnabled(), false);
    process.env.GEMINI_API_KEY = 'test-key';
    assert.deepStrictEqual(ai.info(), { provider: 'gemini', model: 'gemini-3.8-flash' });
    process.env.ANTHROPIC_API_KEY = 'other';
    assert.strictEqual(ai.info().provider, 'gemini', 'Gemini wins when both keys are set');
    process.env.LLM_PROVIDER = 'anthropic';
    assert.strictEqual(ai.info().provider, 'anthropic');
    delete process.env.LLM_PROVIDER; delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    assert.strictEqual(ai.info().model, 'gemini-3.5-flash-lite');
    console.log('  ok - provider and model come from environment variables');

    // message conversion
    const c = ai._geminiContents([{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }]);
    assert.deepStrictEqual(c.map(x => x.role), ['user', 'model', 'user', 'model']);
    assert.strictEqual(c[2].parts[0].text, 'a\n\nb');
    const req = ai._geminiRequest({ system: 'SYS', messages: [{ role: 'user', content: 'Q' }], max_tokens: 900, json: true });
    assert.strictEqual(req.systemInstruction.parts[0].text, 'SYS');
    assert.strictEqual(req.generationConfig.responseMimeType, 'application/json');
    assert.strictEqual(req.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.ok(req.generationConfig.maxOutputTokens > 900, 'room for thinking tokens');
    console.log('  ok - messages, system instruction and JSON mode map to the Gemini request');

    // full call through a stubbed fetch
    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: 'Answer [S1].' }] } }] }) };
    };
    const text = await ai.callLLM({ system: 'S', messages: [{ role: 'user', content: 'Q' }], max_tokens: 100 });
    assert.strictEqual(text, 'Answer [S1].', 'thought parts are dropped');
    assert.ok(seen.url.endsWith('/v1beta/models/gemini-3.5-flash-lite:generateContent'));
    assert.strictEqual(seen.init.headers['x-goog-api-key'], 'test-key');
    assert.ok(!seen.url.includes('test-key'), 'key is sent in a header, not the URL');
    console.log('  ok - generateContent call: endpoint, key header, answer text');

    // failures become provider errors (HTTP 502 to the browser), never empty text
    const failWith = body => { globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => body }); };
    failWith({ promptFeedback: { blockReason: 'SAFETY' } });
    await assert.rejects(ai.callLLM({ messages: [{ role: 'user', content: 'Q' }] }), e => e.code === 'PROVIDER' && /declined/.test(e.message));
    failWith({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '', thought: true }] } }] });
    await assert.rejects(ai.callLLM({ messages: [{ role: 'user', content: 'Q' }] }), e => e.code === 'PROVIDER' && /output space/.test(e.message));
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid' } }) });
    await assert.rejects(ai.callLLM({ messages: [{ role: 'user', content: 'Q' }] }), e => e.status === 502 && /API key not valid/.test(e.message));
    console.log('  ok - blocked, truncated and rejected requests become clear provider errors');

    // Claude: requested max_tokens gets headroom so cited answers are not cut off; a real cut-off still fails
    process.env.LLM_PROVIDER = 'anthropic'; process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    let sent = null;
    globalThis.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Answer [S1].' }] }) }; };
    assert.strictEqual(await ai.callLLM({ system: 'S', messages: [{ role: 'user', content: 'Q' }], max_tokens: 1200 }), 'Answer [S1].');
    assert.ok(sent.url.endsWith('/v1/messages'));
    assert.ok(sent.body.max_tokens >= 1200 + 2048, 'headroom above the requested answer size');
    process.env.LLM_MAX_OUTPUT_TOKENS = '5000';
    await ai.callLLM({ messages: [{ role: 'user', content: 'Q' }], max_tokens: 700 });
    assert.strictEqual(sent.body.max_tokens, 5000, 'LLM_MAX_OUTPUT_TOKENS overrides');
    delete process.env.LLM_MAX_OUTPUT_TOKENS;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }) });
    await assert.rejects(ai.callLLM({ messages: [{ role: 'user', content: 'Q' }] }), e => /cut off/.test(e.message));
    console.log('  ok - Claude output limit has headroom; truncated answers are still rejected');

    assert.deepStrictEqual(ai.parseJson('```json\n{"a":1}\n```'), { a: 1 });
    console.log('  ok - JSON answers are read even inside code fences');
    console.log('\nGemini tests passed');
  } finally { process.env = saved; }
})().catch(e => { console.error(e); process.exitCode = 1; });
