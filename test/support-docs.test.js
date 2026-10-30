/* Stage 2 supporting documents point at real open-source PDFs and real pages in the library. */
const assert = require('assert');
const fs = require('fs'), path = require('path');
const SD = require('../public/js/support-docs');
const RS = require('../public/js/responsibility');

for (const rule of Object.keys(RS.RULE_AREA)) assert.ok(SD.forRule(rule).length >= 1, rule + ' has supporting reading');
assert.deepStrictEqual(SD.forRule('baseline'), []);
assert.deepStrictEqual(SD.forRule('custom'), []);
for (const rule of Object.keys(SD.BY_RULE)) for (const d of SD.forRule(rule)) {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'sources', d.id + '.pdf')), d.id + ' PDF is published');
  const lib = path.join(__dirname, '..', 'knowledge', 'library', 'passages', d.id + '.json');
  if (fs.existsSync(lib)) assert.ok(JSON.parse(fs.readFileSync(lib, 'utf8')).some(p => p.locator.page === d.page), `${d.id} has page ${d.page}`);
}
console.log('  ok - every action rule links open-source reading; PDFs published; pages exist in the library');
console.log('\nSupport docs tests passed');
