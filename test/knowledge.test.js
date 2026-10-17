/* Knowledge base (RAG) tests with fixture documents. Run: npm test */
const assert = require('assert');
const path = require('path');
const knowledge = require('../engine/knowledge');
const P = require('../engine/proposal');

(async () => {
  console.log('Knowledge base');
  const k = await knowledge.load(path.join(__dirname, 'fixtures', 'knowledge'));
  assert.strictEqual(k.documents, 2); assert.deepStrictEqual(k.byTopic, { financing: 1, plan: 1 });
  console.log('  ok - loads files by topic folder');

  const hits = knowledge.search('co-financing requirement', { k: 3, topics: ['financing'], excludeEcam: true });
  assert.strictEqual(hits[0].title, 'Test Fund Guide'); assert.strictEqual(hits[0].cite, 'Test Fund, 2025');
  console.log('  ok - retrieval finds the funder passage with its citation from sources.json');

  const src = knowledge.asSources(hits);
  assert.ok(src.block.startsWith('[S1] Test Fund Guide'));
  assert.deepStrictEqual(knowledge.citedSources('Needs 20% co-financing [S1].', src.list).map(s => s.id), ['S1']);
  assert.deepStrictEqual(knowledge.citedSources('No citation here [S9].', src.list), []);
  console.log('  ok - citations are numbered and unknown tags are dropped');

  const chunks = knowledge.chunkText('# A\n\n' + 'Sentence one is here. '.repeat(120));
  assert.ok(chunks.length > 1 && chunks.every(c => c.text.length <= 1300 && c.heading === 'A'));
  console.log('  ok - long text is split with its heading kept');

  // without AI, template text cites nothing; relevant documents are listed as related reading
  const fw = P.financingFrameworks().find(f => f.id === 'general');
  const draft = await P.draftProposal({ lang: 'en', actions: [] }, fw);
  const budget = draft.sections.find(s => s.key === 'budget');
  assert.ok(draft.sections.find(s => s.key === 'risks').related.every(s => s.title !== 'Test procurement'), 'plan docs must not leak into proposal');
  assert.ok(budget.related.some(s => s.title === 'Test Fund Guide'));
  assert.ok(draft.sections.every(s => s.sources.length === 0 && s.ai === false), 'template sections claim no citations');
  console.log('  ok - template sections list related documents, not sources');
  console.log('\nKnowledge tests passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
