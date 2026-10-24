/* Fictional PDF fixtures. Run: node scripts/make-review-fixtures.js
 * Base units are ECAM units; no expected output is used to construct inputs. */
const fs=require('fs'), engine=require('../engine/ecam-engine');
const out='test/fixtures/review';
const supplied = new WeakMap();
function assessment(name) {
 const a=engine.newAssessment('Indonesia'); Object.assign(a.General,{Name:name,AssessmentPeriodStart:'2025-01-01',AssessmentPeriodEnd:'2026-01-01',Comments:'FICTIONAL TEST DATA — Indonesia Example.docx.pdf; not a real utility.'}); return a;
}
function add(a,p,lv,sl,values,questions=[]) {
 const ss=engine.newSubstage(p,sl+' 1',0.677); Object.assign(ss,values); supplied.set(ss,{...values,[p+'_conv_kwh']:0.677});
 for(const q of questions) ss.Configuration.Questions[p+'_'+q]=true;
 a[lv][sl].push(ss); return ss;
}
const a=assessment('TEST A Example Water Utility 2025');
Object.assign(a.Water,{ws_resi_pop:60000,ws_nrg_cost:2700000000,ws_run_cost:9000000000});
add(a,'wsa','Water','Abstraction',{wsa_vol_conv:3000000,wsa_nrg_cons:600000});
add(a,'wst','Water','Treatment',{wst_vol_trea:2850000,wst_nrg_cons:300000,wst_treatment:3});
add(a,'wsd','Water','Distribution',{wsd_serv_pop:40000,wsd_vol_dist:2800000,wsd_nrg_cons:900000,wsd_auth_con:2100000,wsd_bill_con:2000000,wsd_deli_pts:7500,wsd_ser_cons:8000,wsd_time_pre:20,wsd_nrg_pump:900000,wsd_vol_pump:2800000,wsd_pmp_head:50,wsd_pmp_size:3,wsd_sta_head:30,wsd_main_len:5000,wsd_pmp_flow:0.1,wsd_pmp_volt:400,wsd_pmp_amps:160,wsd_pmp_pf:0.9,wsd_pmp_exff:70},['water_eff','service_perf','pumping','pumping_eff']);
const b=assessment('TEST B Example Wastewater Service 2025');
Object.assign(b.Waste,{ww_resi_pop:20000,ww_vol_gene:876000,ww_nrg_cost:765000000,ww_run_cost:3000000000});
add(b,'wwc','Waste','Collection',{wwc_conn_pop:20000,wwc_vol_coll:876000,wwc_vol_coll_unt:0,wwc_vol_coll_tre:876000,wwc_bod:262800,wwc_tn:43800,wwc_nrg_cons:60000,wwc_ch4_efac_col:0,wwc_n2o_efac_col:0,wwc_ch4_efac_cso:0,wwc_n2o_efac_cso:0});
add(b,'wwt','Waste','Treatment',{wwt_serv_pop:20000,wwt_vol_trea:876000,wwt_vol_disc:876000,wwt_bod_infl:262800,wwt_bod_effl:17520,wwt_tn_infl:43800,wwt_tn_effl:26280,wwt_nrg_cons:438000,wwt_mass_slu:120000,wwt_bod_slud:96000,wwt_ch4_efac_tre:0.018,wwt_n2o_efac_tre:0.016,wwt_ch4_efac_dis:0.068,wwt_n2o_efac_dis:0.005,wwt_mass_slu_comp:120000,wwt_slu_comp_emis_treated_or_piles_covered:0,wwt_slu_comp_solids_content:40,wwt_slu_comp_TVS:70,wwt_slu_comp_N_cont:3,wwt_slu_comp_low_CN_EF:0.015,wwt_slu_comp_uncovered_pile_EF:0.025,wwt_slu_comp_seqst_rate:0,wwt_trck_typ:0,wwt_vol_tslu:1.2,wwt_trea_cap:1095000,wwt_tst_cmpl:44,wwt_tst_cond:48},['treatment_perf','sludge_mgmt','composting','trucks']);
for(const [name,data] of [['case-a',a],['case-b',b]]) {
 fs.writeFileSync(`${out}/${name}.json`,JSON.stringify([data],null,2)+'\n');
 const meta={id:name,substages:{}}, inputStatus={origin:'imported',s:{}}, defaults={};
 for(const [p,lv,sl] of require('../public/js/cw-core').STAGE_KEYS) {
  meta.substages[p]=data[lv][sl].map((ss,i)=>{
   const sid=p+'_'+i, entered=supplied.get(ss)||{};
   inputStatus.s[sid]=Object.fromEntries(Object.entries(entered).map(([code,v])=>[code,{o:'manual',c:false,v}]));
   defaults[sid]=Object.fromEntries(Object.entries(ss).filter(([c])=>!Object.hasOwn(entered,c)));
   return sid;
  });
 }
 fs.writeFileSync(`${out}/${name}.context.json`,JSON.stringify({fixture:'Fictional test inputs copied from Indonesia Example.docx.pdf; no real utility or verified factor',ecamVersion:'3.0.1',gwpIndex:0,gwpReport:engine.gwpReports()[0],meta,inputStatus,defaults,settings:data.General,assumptions:name==='case-a'?{currency:'IDR',budget:900000000,scheduleWeeks:16,electricityPrice:1500}:{currency:'IDR',budget:650000000,scheduleWeeks:16,aerationBaselineKwh:300000,aerationSavingFraction:0.15,userSuppliedSavingKwh:45000,userSuppliedSavingTco2:30.465,scientificReview:'not reviewed; narrative assumption, not a calculated action benefit'}},null,2)+'\n');
}
console.log(engine._ecam.Tables[engine._ecam.Info.wst_treatment.table]);
console.log(engine._ecam.Tables[engine._ecam.Info.wsd_pmp_size.table]);
console.log(engine._ecam.Tables[engine._ecam.Info.wwt_trck_typ.table]);
for(const x of [a,b]) {const r=engine.calculateOne(x,0);console.log(x.General.Name,r.totals,r.energy_kwh,r.substages.map(s=>[s.prefix,s.outputs.wsd_KPI_nrg_estm_sav,s.outputs.wsd_SL_nr_water,s.outputs.wsd_SL_water_loss]));}
