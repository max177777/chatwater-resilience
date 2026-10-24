/* Generate the bounded application dependency record from the trusted, bundled ECAM methods.
 * Run after a vendor update and review both this file and the resulting diff. No network/AI.
 */
const fs=require('fs'),crypto=require('crypto');
const E=require('../engine/ecam-engine')._ecam,D=require('../public/js/result-status');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const graph=D.inventory(E.Structure,E.Questions);
const record={
  format:'chatwater-dependency-coverage',version:1,ecamVersion:'3.0.1',
  scope:'Application substage outputs, source components, inventory/stage totals, energy, population, water balance and built-in rule support. Not scientific sufficiency or every ECAM global indicator.',
  vendorHashes:Object.fromEntries(['global','structure','questions','constants','tables','gwp_reports','info'].map(f=>[f,hash(`vendor/ecam/backend/${f}.js`)])),
  totals:{published:Object.values(graph).reduce((n,p)=>n+p.published.length,0),methods:Object.values(graph).reduce((n,p)=>n+Object.keys(p.nodes).length,0),inputs:Object.values(graph).reduce((n,p)=>n+p.inputs.length,0)},
  aggregation:{inventory:'All substage <prefix>_KPI_GHG outputs; an unavailable substage makes the total incomplete. known_subtotal sums only complete substages.',energy:'All substage <prefix>_nrg_cons inputs; stage totals use the same rollup.',population:{ws_serv_pop:['wsd_serv_pop in every distribution substage'],ww_serv_pop:['wwt_serv_pop in every treatment substage','wwo_onsi_pop in every onsite substage'],ws_resi_pop:['Water.ws_resi_pop'],ww_resi_pop:['Waste.ww_resi_pop']},per_capita:['complete inventory','supported positive served population (water, otherwise wastewater only if water population is supported zero)','valid positive assessment duration']},
  applicationMetrics:{nrw_m3_per_km:['wsd_vol_dist','wsd_bill_con','wsd_main_len (positive)'],water_balance:['wsd_SL_nr_water','wsd_SL_water_loss','wsd_KPI_water_losses'],period:['General.AssessmentPeriodStart','General.AssessmentPeriodEnd (valid and later)']},
  actions:D.ACTIONS,
  limitations:['Graph traces static this.field and this.method references conservatively, including both conditional branches. It does not certify equations or process sufficiency.','ECAM methods that internally coerce zero-denominator arithmetic to finite zero retain their vendor behavior; this is dependency/status tracing, not expression-level mathematical validation.',
  'Dynamic this access and known external/global references fail closed. Changes to vendor source require review of this inventory and tests.','ECAM constants, option tables and GWP report are bundled settings, not confirmed measured inputs. Source hashes and project settings preserve their versions.','Only application-exposed rollups are listed. Other ECAM global indicators, arbitrary external custom-benefit models and narrative evidence are not dependency-certified.','All output-support status changes conservatively stale the assessment action set, plan and proposal; per-document narrower semantic dependencies are not yet tracked. Notes are not used in current output facts and do not invalidate these outputs.','Known subtotal is a sum of supported whole substages, not all individually supported components of an incomplete substage.'],
  substages:graph
};
fs.writeFileSync('docs/cw03-dependency-coverage.json',JSON.stringify(record,null,2)+'\n');
console.log(record.totals);
