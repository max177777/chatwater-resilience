/* Asking about one input (its substage has no component list) must not crash the chat route. */
const assert = require('assert');
const CC = require('../engine/chat-context');
const ctx = { focus: { kind: 'input', ok: true, code: 'wsa_sta_head' }, focus_detail: { code: 'wsa_sta_head', description: 'Static head', substage: { name: 'Abstraction 1' } }, stage: 1, actions: {} };
const q = CC.retrievalQuery(ctx, 'Tanya ChatWater: Head statis (wsa_sta_head)', true, {});
assert.ok(q && q.context.includes('Abstraction 1') && q.context.includes('Static head'), 'input focus builds a search context');
const PC = require('../engine/preliminary-concept');
assert.strictEqual(PC.dropFigureSentences('Improves pump efficiency [S1]. Saves about 181 tCO2eq per year. See the table below.'), 'Improves pump efficiency [S1]. See the table below.');
// Bold labels and decimals stay whole; no unpaired ** is ever left behind
assert.strictEqual(PC.dropFigureSentences('**Summary.** This is a pilot-scale concept. It saves about 101.5 tCO2eq per year.'), '**Summary.** This is a pilot-scale concept.');
assert.strictEqual(PC.dropFigureSentences('**Project summary.** Saves 150,000 kWh. **Problem.** Flooding near Bojongsoang.'), '**Problem.** Flooding near Bojongsoang.');
for (const t of ['**Problem (about 38% water loss).** A notice points to risk. Flooding was reported.', '**A.** 1.5 m3. **B.** Text.\n- **C.** About 12 kWh. Fine.'])
  assert.strictEqual((PC.dropFigureSentences(t).match(/\*\*/g) || []).length % 2, 0, t);
// Stage 2 explanations are formatted, not shown as raw markdown
const CVf = require('../public/js/chat-view');
const html = CVf.formatReply('**Why it matters.** Lower energy use.', s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
assert.ok(html.includes('<b>Why it matters.</b>') || html.includes('<strong>Why it matters.</strong>'), html);
assert.ok(!html.includes('**'), html);
assert.strictEqual(PC.failureReason('The AI service did not respond in time.'), 'timeout');
console.log('  ok - input-focused chat questions; concept narrative keeps text and drops figure sentences');
console.log('\nChat focus tests passed');
