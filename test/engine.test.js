/*
 * Checks that the server engine reproduces ECAM's formulas.
 * Expected values are worked out by hand from the IPCC-based equations in
 * vendor/ecam/backend/global.js, independently of the engine.
 * Run: npm test
 */
const assert = require('assert');
const engine = require('../engine/ecam-engine');
const sample = require('../public/samples/utility-a-indonesia.json');

const close = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok -', name); }

console.log('ECAM engine');

test('Indonesia country factors come from ECAM table', () => {
  const c = engine.countries().Indonesia;
  close(c.conv_kwh_co2, 0.677);   // 677 g/kWh in the table, ECAM converts to kg
  assert.strictEqual(c.currency, 'IDR');
});

test('grid electricity: kWh x kgCO2/kWh', () => {
  const a = engine.newAssessment('Indonesia');
  const ss = engine.newSubstage('wsa', 'Intake', 0.677);
  ss.wsa_nrg_cons = 100000;
  a.Water.Abstraction.push(ss);
  const r = engine.calculateOne(a);
  close(r.totals.total, 67700);
  close(r.energy_kwh, 100000);
});

test('diesel engines: IPCC stationary combustion (values stored in m3)', () => {
  const a = engine.newAssessment('Indonesia');
  const ss = engine.newSubstage('wsa', 'Intake', 0.677);
  ss.wsa_fuel_typ = 0;     // Diesel
  ss.wsa_vol_fuel = 5;     // 5 m3 = 5,000 L
  a.Water.Abstraction.push(ss);
  const r = engine.calculateOne(a, 0); // AR5 with feedbacks: CH4=34, N2O=298
  // energy = 5 m3 * 0.84 t/m3 * 43 TJ/Gg / 1000 = 0.1806 TJ
  const TJ = 5 * 0.84 * 43.0 / 1000;
  close(r.totals.co2, TJ * 74100);           // 13,382 kgCO2
  close(r.totals.ch4, TJ * 3 * 34);          // EF 3 kgCH4/TJ
  close(r.totals.n2o, TJ * 0.6 * 298);       // EF 0.6 kgN2O/TJ
});

test('WWTP CH4 and N2O from biological treatment', () => {
  const a = engine.newAssessment('Indonesia');
  const ss = engine.newSubstage('wwt', 'WWTP', 0.677);
  ss.wwt_bod_infl = 100000;    // kg BOD
  ss.wwt_bod_slud = 20000;     // kg BOD removed as sludge
  ss.wwt_ch4_efac_tre = 0.018; // kgCH4/kgBOD (aerobic, poorly managed would be higher)
  ss.wwt_tn_infl = 15000;      // kg N
  ss.wwt_n2o_efac_tre = 0.016; // kgN2O-N/kgN
  a.Waste.Treatment.push(ss);
  const r = engine.calculateOne(a, 0);
  const t = r.substages[0].outputs.wwt_KPI_GHG_tre;
  close(t.ch4, (100000 - 20000) * 0.018 * 34);
  close(t.n2o, 15000 * 0.016 * 44 / 28 * 298);
});

test('changing GWP report changes CH4 weight', () => {
  const a = engine.newAssessment('Indonesia');
  const ss = engine.newSubstage('wwt', 'WWTP', 0.677);
  ss.wwt_bod_infl = 1000; ss.wwt_ch4_efac_tre = 0.1;
  a.Waste.Treatment.push(ss);
  close(engine.calculateOne(a, 0).totals.ch4, 100 * 34); // AR5 CCF
  close(engine.calculateOne(a, 2).totals.ch4, 100 * 25); // AR4
});

test('sample utility: stage sums equal the total', () => {
  const [r] = engine.calculate(sample);
  const sum = Object.values(r.byStage).reduce((p, s) => p + s.total, 0);
  close(sum, r.totals.total);
  close(r.water.total + r.waste.total, r.totals.total);
  assert.ok(r.totals.total > 0);
});

test('sample utility: grid emissions = total grid kWh x 0.677', () => {
  const [r] = engine.calculate(sample);
  const elec = r.substages
    .map(s => s.outputs[s.prefix + '_KPI_GHG_elec'])
    .filter(Boolean).reduce((p, e) => p + e.total, 0);
  close(elec, r.energy_kwh * 0.677);
});

console.log(`\n${passed} tests passed`);
