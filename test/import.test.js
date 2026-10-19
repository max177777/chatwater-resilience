/*
 * File imports: ECAM files and utility-profile files. HYPOTHETICAL sample and synthetic
 * files only; no external calls. Run: npm test
 */
const assert = require('assert');
const CW = require('../public/js/cw-core');
const engine = require('../engine/ecam-engine');
const sample = require('../public/samples/utility-a-indonesia.json');
const { clone } = require('./helpers/fixtures');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const text = JSON.stringify(sample);

test('the Utility A sample is a valid ECAM file: one complete assessment that ECAM can rebuild', () => {
  const r = CW.parseEcamFile(text);
  assert.ok(r.ok);
  assert.strictEqual(r.assessments.length, 1);
  assert.strictEqual(r.assessments[0].General.Name, 'Utility A (hypothetical)');
  const sc = engine._ecam.Ecam.from(r.assessments[0]);
  assert.strictEqual(sc.Water.Abstraction[0].wsa_pmp_flow, 1.27);
  // a single assessment object (not wrapped in an array) is accepted too
  assert.ok(CW.parseEcamFile(JSON.stringify(sample[0])).ok);
});

test('choosing the ECAM sample in the profile upload is reported, not silently ignored', () => {
  // the reported problem: the profile handler read top-level name/location/… from an ECAM array and filled nothing
  assert.deepStrictEqual(CW.parseProfileJson(text), { ok: false, reason: 'ecam_file' });
  assert.deepStrictEqual(CW.parseProfileJson(JSON.stringify(sample[0])), { ok: false, reason: 'ecam_file' });
  assert.deepStrictEqual(CW.parseProfileJson('{oops'), { ok: false, reason: 'not_json' });
  assert.deepStrictEqual(CW.parseProfileJson('{"unrelated":1}'), { ok: false, reason: 'no_profile_fields' });
  const ok = CW.parseProfileJson(JSON.stringify({ name: 'Synthetic utility', country: 'Indonesia', population: 1000, extra: 'ignored' }));
  assert.deepStrictEqual(ok, { ok: true, profile: { name: 'Synthetic utility', country: 'Indonesia', population: 1000 } });
});

test('invalid or incompatible ECAM files are rejected as a whole, with a reason; nothing partial is imported', () => {
  const good = clone(sample[0]);
  const noWaste = clone(sample[0]); delete noWaste.Waste;
  const noOnsite = clone(sample[0]); delete noOnsite.Waste.Onsite;
  const cases = [
    ['{not json', 'not_json'],
    ['[]', 'empty'],
    [JSON.stringify({ name: 'Synthetic utility', country: 'Indonesia' }), 'profile_file'],
    [JSON.stringify([good, { General: { Name: 'x' } }]), 'not_ecam'], // one good, one broken: neither is imported
    [JSON.stringify([noWaste]), 'not_ecam'],
    [JSON.stringify([noOnsite]), 'not_ecam'],
    [JSON.stringify(['text']), 'not_ecam'],
    ['42', 'not_ecam'],
  ];
  for (const [input, reason] of cases) assert.deepStrictEqual(CW.parseEcamFile(input), { ok: false, reason }, input.slice(0, 40));
  // everything that passes the check can be rebuilt by ECAM without throwing
  for (const o of CW.parseEcamFile(JSON.stringify([good, clone(sample[0])])).assessments) engine._ecam.Ecam.from(o);
});

test('loading the same file again gives a distinguishable name instead of two identical assessments', () => {
  const taken = ['Penilaian', 'Utility A (hypothetical)'];
  assert.strictEqual(CW.uniqueName('Utility A (hypothetical)', taken), 'Utility A (hypothetical) (2)');
  assert.strictEqual(CW.uniqueName('Utility A (hypothetical)', [...taken, 'Utility A (hypothetical) (2)']), 'Utility A (hypothetical) (3)');
  assert.strictEqual(CW.uniqueName('Utility B', taken), 'Utility B');
});

(async () => {
  console.log('File imports');
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok -', name); }
  console.log(`\n${passed} import tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
