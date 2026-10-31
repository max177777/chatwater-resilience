/* Asking about one input (its substage has no component list) must not crash the chat route. */
const assert = require('assert');
const CC = require('../engine/chat-context');
const ctx = { focus: { kind: 'input', ok: true, code: 'wsa_sta_head' }, focus_detail: { code: 'wsa_sta_head', description: 'Static head', substage: { name: 'Abstraction 1' } }, stage: 1, actions: {} };
const q = CC.retrievalQuery(ctx, 'Tanya ChatWater: Head statis (wsa_sta_head)', true, {});
assert.ok(q && q.context.includes('Abstraction 1') && q.context.includes('Static head'), 'input focus builds a search context');
const PC = require('../engine/preliminary-concept');
assert.strictEqual(PC.dropFigureSentences('Improves pump efficiency [S1]. Saves about 181 tCO2eq per year. See the table below.'), 'Improves pump efficiency [S1]. See the table below.');
assert.strictEqual(PC.failureReason('The AI service did not respond in time.'), 'timeout');
console.log('  ok - input-focused chat questions; concept narrative keeps text and drops figure sentences');
console.log('\nChat focus tests passed');
