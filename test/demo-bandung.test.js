/* Comprehensive worked example (Tirtawening Bandung): ECAM file reproduces the team guide's checks; demo data is valid. */
const assert = require('assert');
const E = require('../engine/ecam-engine');
const PC = require('../public/js/preliminary-concept');
const CA = require('../public/js/custom-actions');
const D = require('../public/js/demo-bandung');
const a = require('../public/samples/bandung-example.json')[0];

const r = E.calculateOne(a, 1); // IPCC AR5 without climate-carbon feedbacks, as in the guide
assert.strictEqual(r.energy_kwh, 4250000, 'all included electricity 4,250,000 kWh');
const elec = s => r.byStage[s].co2 / 1000;
assert.ok(Math.abs(elec('wsa') + elec('wst') + elec('wsd') - 2031) < 0.01, 'water electricity 2,031 tCO2e');
assert.ok(Math.abs(elec('wwc') + elec('wwt') - 846.25) < 0.01, 'wastewater electricity 846.25 tCO2e');
const d = a.Water.Distribution[0];
assert.strictEqual(((d.wsd_vol_dist - d.wsd_bill_con) / d.wsd_vol_dist * 100).toFixed(2), '39.42', 'NRW 39.42%');
assert.strictEqual(((d.wsd_vol_dist - d.wsd_auth_con) / d.wsd_vol_dist * 100).toFixed(2), '38.42', 'water loss 38.42%');
assert.strictEqual(d.Configuration.Questions.wsd_water_eff, true, 'water-efficiency inputs switched on');
assert.ok(a.Waste.Collection.length === 1 && a.Waste.Treatment.length === 1, 'covers sewer and treatment');
console.log('  ok - ECAM file reproduces the guide: 4.25 GWh, 2,031 + 846.25 tCO2e electricity, NRW 39.42%');

const meta = { substages: { wsa: ['s_a'], wst: ['s_t'], wsd: ['s_d'], wwc: ['s_c'], wwt: ['s_w'], wwo: [] } };
for (const lang of ['en', 'id']) {
  const demo = D.build(a, meta, lang);
  assert.doesNotThrow(() => PC.clean(demo.financing.conceptInputs, []), lang + ' concept inputs are valid');
  assert.strictEqual(demo.financing.conceptInputs.purpose, 'both');
  assert.ok(['resp_water_supply', 'resp_sewer', 'resp_wwtp'].every(k => demo.profile[k] === 'operates'));
  assert.strictEqual(demo.custom.length, 3);
  for (const input of demo.custom) assert.ok(CA.create({ assessmentId: 'a_x', cid: 'c_abcdef1234', label: 'U01', input, now: '2026-10-31' }), lang + ' ' + input.title);
  assert.ok(Object.values(demo.record.s.s_w).every(v => v.c && v.source_note), 'every input carries its source note');
}
console.log('  ok - profile, concept inputs, three custom actions and input provenance (EN/ID)');
console.log('\nBandung example tests passed');
