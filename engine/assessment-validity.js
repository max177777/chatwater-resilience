const AV = require('../public/js/assessment-validity');
const engine = require('./ecam-engine');
const Data = require('../public/js/result-status');
const InputCodes = Object.fromEntries(require('../public/js/cw-core').STAGE_KEYS.map(([p]) => {const defaults = engine.newSubstage(p);return [p,Object.keys(defaults).filter(c => typeof defaults[c] === 'number')];}));
function validate(assessment, options = {}) {
  const settings = {...options, Info:engine._ecam.Info, Questions:engine._ecam.Questions, Tables:engine._ecam.Tables, InputCodes};
  const first = AV.validate(assessment,settings);
  if (!first.valid) return first;
  return AV.validate(engine._ecam.Ecam.from(JSON.parse(JSON.stringify(assessment))),settings);
}
function requireValid(assessment, options) {
  const validity = validate(assessment, options);
  if (!validity.valid) {
    const e = new Error('Assessment is a draft. Correct the assessment inputs before using it downstream.');
    e.status = 422; e.issues = validity.issues; throw e;
  }
  return validity;
}
function calculate(assessment, gwpIndex = 0, options = {}) {
  const validity = validate(assessment, options);
  if (!assessment?.General || !validity.substages?.length) return {availability:'not_assessed', validity, totals:{total:null,co2:null,ch4:null,n2o:null},energy_kwh:null,substages:[],byStage:{}};
  const prepared=Data.prepare(assessment,engine._ecam.Structure,engine.newAssessment().General);
  const result = engine.calculateOne(prepared,gwpIndex);
  const hydrated=engine._ecam.Ecam.from(prepared);
  const graph=Data.evaluate(hydrated,{...options,Structure:engine._ecam.Structure,Questions:engine._ecam.Questions,Info:engine._ecam.Info,Tables:engine._ecam.Tables,issues:validity.issues});
  Data.apply(result,graph);
  result.validity = validity;
  result.water_balance = [];
  let counts = {};
  for (const s of result.substages) {
    const i = counts[s.prefix] || 0; counts[s.prefix] = i + 1;
    const ss = assessment[s.level][s.sublevel][i];
    const sid = options.meta?.substages?.[s.prefix]?.[i] || `${s.prefix}#${i}`;
    if (s.prefix === 'wsd') {
      const nrw = s.availability.wsd_SL_nr_water, loss = s.availability.wsd_SL_water_loss;
      const perKm = s.availability.wsd_KPI_water_losses;
      result.water_balance.push({sid, name:s.name, period:result.period, units:'m³ per assessment period; percentages; m³/km per assessment period',
        distributed_m3:s.input_availability.wsd_vol_dist.value, authorized_m3:s.input_availability.wsd_auth_con.value, billed_m3:s.input_availability.wsd_bill_con.value,
        nrw_pct:{...nrw,value:nrw.status === 'available' ? s.outputs.wsd_SL_nr_water : null},
        water_loss_pct:{...loss,value:loss.status === 'available' ? s.outputs.wsd_SL_water_loss : null},
        water_loss_m3_per_km:{...perKm,value:perKm.status === 'available' ? s.outputs.wsd_KPI_water_losses : null},
        nrw_m3_per_km:Data.metric([nrw,s.input_availability.wsd_main_len],['wsd_vol_dist','wsd_bill_con','wsd_main_len'],()=>ss.wsd_main_len>0?1000*(ss.wsd_vol_dist-ss.wsd_bill_con)/ss.wsd_main_len:null),
      });
    }
  }
  return result;
}
function requireSupported(assessment,options={}) {
  const validity=requireValid(assessment,options), r=calculate(assessment,options.gwpIndex || 0,options);
  if (!r.completeness?.complete) {const e=new Error('Assessment total is incomplete: confirm ambiguous zero values or correct unknown/invalid component inputs before drafting or exporting.');e.status=422;e.issues=r.substages.flatMap(s=>Object.entries(s.availability || {}).filter(([c,v])=>c===s.prefix+'_KPI_GHG' && !Data.ok(v.status)).map(([code,v])=>({code,...v})));throw e;}
  return validity;
}
module.exports = {validate,requireValid,requireSupported,calculate};
