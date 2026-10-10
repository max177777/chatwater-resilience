// Generates public/samples/utility-a-indonesia.json — a HYPOTHETICAL mid-size
// Indonesian utility used for demos and tests. All values are illustrative.
const fs = require('fs'), path = require('path');
const e = require('../engine/ecam-engine');
const EF = 0.677;
const a = e.newAssessment('Indonesia');
Object.assign(a.General, {
  Name: 'Utility A (hypothetical)', AssessmentPeriodStart: '2025-01-01',
  AssessmentPeriodEnd: '2026-01-01', Comments: 'Design example - all values hypothetical',
});
a.Water.ws_resi_pop = 600000;
a.Waste.ww_resi_pop = 600000;

const wsa = e.newSubstage('wsa', 'River intake pumping', EF);
Object.assign(wsa, {
  wsa_vol_conv: 40e6, wsa_nrg_cons: 2.4e6,
  wsa_fuel_typ: 0, wsa_vol_fuel: 12,                 // 12 m3 diesel for back-up gensets
  wsa_nrg_pump: 2.4e6, wsa_vol_pump: 40e6, wsa_pmp_head: 45, wsa_sta_head: 30, wsa_main_len: 8000,
  wsa_pmp_flow: 1.27, wsa_pmp_volt: 6000, wsa_pmp_amps: 115, wsa_pmp_pf: 0.9, wsa_pmp_exff: 80,
});
Object.assign(wsa.Configuration.Questions, { wsa_engines: true, wsa_pumping: true, wsa_pumping_eff: true });

const wst = e.newSubstage('wst', 'Water treatment plant', EF);
Object.assign(wst, { wst_vol_trea: 38e6, wst_nrg_cons: 1.1e6 });

const wsd = e.newSubstage('wsd', 'Distribution network', EF);
Object.assign(wsd, {
  wsd_serv_pop: 450000, wsd_vol_dist: 37e6, wsd_nrg_cons: 3.2e6,
  wsd_auth_con: 26e6, wsd_bill_con: 24e6,
});

const wwc = e.newSubstage('wwc', 'Sewer network', EF);
Object.assign(wwc, {
  wwc_conn_pop: 60000, wwc_vol_coll: 3.0e6, wwc_vol_coll_tre: 2.4e6, wwc_vol_coll_unt: 0.6e6,
  wwc_bod: 876000, wwc_tn: 120000,
  wwc_ch4_efac_col: 0, wwc_ch4_efac_cso: 0.068, wwc_n2o_efac_col: 0, wwc_n2o_efac_cso: 0.005,
  wwc_nrg_cons: 350000,
});

const wwt = e.newSubstage('wwt', 'Central WWTP', EF);
Object.assign(wwt, {
  wwt_serv_pop: 60000, wwt_vol_trea: 2.4e6, wwt_nrg_cons: 900000,
  wwt_bod_infl: 700000, wwt_bod_slud: 140000, wwt_ch4_efac_tre: 0.018,
  wwt_tn_infl: 96000, wwt_n2o_efac_tre: 0.016,
  wwt_vol_disc: 2.4e6, wwt_bod_effl: 70000, wwt_tn_effl: 40000, wwt_ch4_efac_dis: 0.068, wwt_n2o_efac_dis: 0.005,
});

const wwo = e.newSubstage('wwo', 'Household septic tanks', EF);
Object.assign(wwo, {
  wwo_onsi_pop: 500000, wwo_bod_cont: 500000 * 40 * 365 / 1000, wwo_ch4_efac_con: 0.3,
});

a.Water.Abstraction.push(wsa); a.Water.Treatment.push(wst); a.Water.Distribution.push(wsd);
a.Waste.Collection.push(wwc); a.Waste.Treatment.push(wwt); a.Waste.Onsite.push(wwo);

const out = path.join(__dirname, '..', 'public', 'samples', 'utility-a-indonesia.json');
fs.writeFileSync(out, JSON.stringify([a], null, 2));
const [r] = e.calculate([a]);
console.log('written', out);
console.log('total tCO2eq', (r.totals.total / 1000).toFixed(0), 'energy MWh', r.energy_kwh / 1000);
for (const [k, v] of Object.entries(r.byStage)) console.log(k, (v.total / 1000).toFixed(1), 't');
const s = r.substages[0].outputs;
console.log('pump eff %', s.wsa_KPI_nrg_elec_eff, 'saving kWh', s.wsa_KPI_nrg_estm_sav, 'ghg red', s.wsa_KPI_ghg_estm_red);
