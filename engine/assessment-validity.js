const AV = require('../public/js/assessment-validity');
const engine = require('./ecam-engine');
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
  if (!validity.valid) return {availability:'not_assessed', validity, totals:{total:null,co2:null,ch4:null,n2o:null},energy_kwh:null,substages:[],byStage:{}};
  const result = engine.calculateOne(assessment,gwpIndex);
  result.validity = validity; result.availability = 'available';
  result.water_balance = [];
  let counts = {};
  for (const s of result.substages) {
    const i = counts[s.prefix] || 0; counts[s.prefix] = i + 1;
    const ss = assessment[s.level][s.sublevel][i];
    const sid = options.meta?.substages?.[s.prefix]?.[i] || `${s.prefix}#${i}`;
    s.input_availability = Object.fromEntries(Object.keys(ss).filter(c => typeof ss[c] !== 'object' && engine._ecam.Info[c] && engine._ecam.Info[c].magnitude !== 'text').map(c => [c,AV.state(options.inputStatus,sid,c,ss[c])]));
    s.availability = {};
    for (const code of Object.keys(AV.DEPENDENCIES)) if (code.startsWith(s.prefix)) {
      const availability = AV.availability(ss,code,{...options,sid,Questions:engine._ecam.Questions});
      s.availability[code] = availability;
      if (availability.status !== 'available') s.outputs[code] = null;
    }
    if (s.prefix === 'wsd') {
      const nrw = s.availability.wsd_SL_nr_water, loss = s.availability.wsd_SL_water_loss;
      const perKm = s.availability.wsd_KPI_water_losses;
      result.water_balance.push({sid, name:s.name, period:result.period, units:'m³ per assessment period; percentages; m³/km per assessment period',
        distributed_m3:ss.wsd_vol_dist, authorized_m3:ss.wsd_auth_con, billed_m3:ss.wsd_bill_con,
        nrw_pct:{...nrw,value:nrw.status === 'available' ? s.outputs.wsd_SL_nr_water : null},
        water_loss_pct:{...loss,value:loss.status === 'available' ? s.outputs.wsd_SL_water_loss : null},
        water_loss_m3_per_km:{...perKm,value:perKm.status === 'available' ? s.outputs.wsd_KPI_water_losses : null},
        nrw_m3_per_km:{status:nrw.status === 'available' && ss.wsd_main_len > 0 ? 'available' : 'unknown',dependencies:['wsd_vol_dist','wsd_bill_con','wsd_main_len'],value:nrw.status === 'available' && ss.wsd_main_len > 0 ? 1000*(ss.wsd_vol_dist-ss.wsd_bill_con)/ss.wsd_main_len : null},
      });
    }
  }
  return result;
}
module.exports = {validate,requireValid,calculate};
