/* Application-layer validation; never changes ECAM equations or entered values.
 * inputStatus is CW's existing provenance record, not a second value store.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cw-core'));
  else root.AV = factory(root.CW);
})(typeof self !== 'undefined' ? self : this, function(CW) {
  const MINIMUM = {
    wsa: ['wsa_vol_conv', 'wsa_nrg_cons', 'wsa_conv_kwh'],
    wst: ['wst_vol_trea', 'wst_nrg_cons', 'wst_conv_kwh'],
    wsd: ['wsd_vol_dist', 'wsd_nrg_cons', 'wsd_conv_kwh'],
    wwc: ['wwc_vol_coll', 'wwc_vol_coll_unt', 'wwc_vol_coll_tre', 'wwc_bod', 'wwc_tn', 'wwc_nrg_cons', 'wwc_conv_kwh', 'wwc_ch4_efac_col', 'wwc_n2o_efac_col', 'wwc_ch4_efac_cso', 'wwc_n2o_efac_cso'],
    wwt: ['wwt_vol_trea', 'wwt_vol_disc', 'wwt_bod_infl', 'wwt_bod_effl', 'wwt_tn_infl', 'wwt_tn_effl', 'wwt_nrg_cons', 'wwt_conv_kwh', 'wwt_ch4_efac_tre', 'wwt_n2o_efac_tre', 'wwt_ch4_efac_dis', 'wwt_n2o_efac_dis', 'wwt_bod_slud'],
    wwo: ['wwo_onsi_pop', 'wwo_bod_cont', 'wwo_ch4_efac_con', 'wwo_cont_emp', 'wwo_bod_rmvd', 'wwo_nrg_cons', 'wwo_conv_kwh'],
  };
  const DEPENDENCIES = {
    wsd_SL_nr_water: ['wsd_vol_dist','wsd_bill_con'],
    wsd_SL_water_loss: ['wsd_vol_dist','wsd_auth_con'],
    wsd_KPI_water_losses: ['wsd_vol_dist','wsd_auth_con','wsd_main_len'],
    wwt_biogas_usage: ['wwt_biog_pro','wwt_biog_fla','wwt_biog_val','wwt_biog_lkd','wwt_biog_sold'],
    wwo_biogas_usage: ['wwo_biog_pro','wwo_biog_fla','wwo_biog_val','wwo_biog_lkd','wwo_biog_sold'],
  };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function state(record, sid, code, value) {
    const r = record?.s?.[sid]?.[code];
    if (r && r.v === value && r.availability === 'unknown') return 'unknown';
    if (r && r.v === value && r.availability === 'not_applicable') return 'not_applicable';
    if (value == null || value === '') return 'missing';
    const origin = CW.inputState(record, sid, code, value);
    if (origin.origin === 'default' && value === 0 && !origin.confirmed) return 'missing';
    if (['unknown','imported'].includes(origin.origin) && !origin.confirmed) return 'unconfirmed';
    return 'entered';
  }
  function active(ss, code, Questions) {
    const owners = Object.entries(Questions).filter(([,q]) => q?.variables?.includes(code));
    return !owners.length || owners.some(([q]) => ss.Configuration?.Questions?.[q] === true);
  }
  function requiredCodes(prefix,ss,{Questions={},InputCodes={}}={}) {
    const required=[...(MINIMUM[prefix]||[])];
    for(const [q,spec]of Object.entries(Questions))if(ss.Configuration?.Questions?.[q]===true)
      for(const c of spec.variables||[])if(InputCodes[prefix]?InputCodes[prefix].includes(c):Object.hasOwn(ss,c)&&typeof ss[c]!=='function')required.push(c);
    return [...new Set(required)];
  }
  function validate(a, {Info = {}, Questions = {}, Tables = {}, InputCodes = {}, meta, inputStatus} = {}) {
    const issues = [], substages = [];
    const add = (code, message, location = {}, kind = 'invalid') => issues.push({code, message, type:kind, ...location});
    if (!obj(a) || !obj(a.General) || !CW.STAGE_KEYS.every(([,lv,sl]) => obj(a[lv]) && Array.isArray(a[lv][sl]) && a[lv][sl].every(obj))) {
      add('assessment', 'Malformed assessment: expected General, Water and Waste process arrays.');
      return {valid:false, issues, substages};
    }
    const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    for (const c of ['AssessmentPeriodStart','AssessmentPeriodEnd']) if (!date(a.General[c])) add(c, 'Enter a valid calendar date.', {kind:'general'});
    if (date(a.General.AssessmentPeriodStart) && date(a.General.AssessmentPeriodEnd) && a.General.AssessmentPeriodEnd <= a.General.AssessmentPeriodStart) add('AssessmentPeriodEnd', 'The end date must be after the start date.', {kind:'general'});
    function numeric(o, location, isSubstage) {
      for (const [code, value] of Object.entries(o)) {
        const info = Info[code];
        if (!info || info.magnitude === 'text' || typeof value === 'function') continue;
        if (value == null || value === '') continue;
        let message;
        if (!finite(value)) message = 'Enter a finite number using a decimal point and no thousands separators.';
        else if (info.unit === '%' && (value < 0 || value > 100)) message = 'Enter a percentage from 0 to 100.';
        else if (info.unit === 'hours/day' && (value < 0 || value > 24)) message = 'Enter service hours from 0 to 24.';
        else if (info.magnitude === 'Power factor' && (value <= 0 || value > 1)
          && !(isSubstage && value === 0 && !active(o,code,Questions))) message = 'Power factor must be above 0 and at most 1.';
        else if (info.magnitude === 'Option' && (!Number.isInteger(value) || value < 0 || (Tables[info.table] && value >= Tables[info.table].length))) message = 'Choose a valid option.';
        else if (['Energy','Volume','Mass','Population','People','Number','Currency','Volume of biogas','Flow','Distance','Power','Voltage','Concentration'].includes(info.magnitude) && value < 0) message = 'Enter a nonnegative value; zero is allowed.';
        else if ((/_conv_kwh$|_efac_|_EF$/.test(code) || code === 'conv_kwh_co2') && value < 0) message = 'The grid factor must be nonnegative.';
        if (message) add(code,message,location);
      }
    }
    numeric(a.General,{kind:'general'});
    for (const lv of ['Water','Waste']) numeric(a[lv],{kind:'stage',level:lv});
    for (const [prefix,lv,sl] of CW.STAGE_KEYS) a[lv][sl].forEach((ss,index) => {
      const sid = meta?.substages?.[prefix]?.[index] || `${prefix}#${index}`;
      const loc = {kind:'ss',prefix,index,sid};
      const start = issues.length;
      if (ss.Configuration != null && (!obj(ss.Configuration) || !obj(ss.Configuration.Questions) || !Object.values(ss.Configuration.Questions).every(v => typeof v === 'boolean'))) add('Configuration','Malformed process options; expected a Questions object.',loc);
      numeric(ss,loc,true);
      const required = [...MINIMUM[prefix]];
      const primary = required.filter(c => !/conv_kwh|efac/.test(c));
      if (primary.every(c => ss[c] === 0 || ss[c] == null) && !primary.some(c => state(inputStatus,sid,c,ss[c]) === 'entered')) add(required[0], 'Enter process data; default zeros do not establish an assessment.',loc,'missing');
      // Additional enabled numeric inputs are necessary for that optional calculation.
      for (const code of requiredCodes(prefix,ss,{Questions,InputCodes}).filter(c=>Info[c]||MINIMUM[prefix].includes(c))) {
        const st = state(inputStatus,sid,code,ss[code]);
        if (st === 'missing' || st === 'unknown' || st === 'not_applicable') add(code, 'Enter this input (including an explicit zero where appropriate) or turn off the optional process.',loc,'missing');
      }
      const le = (low,high,enabled=true) => {
        if (enabled && finite(ss[low]) && finite(ss[high]) && ss[low] > ss[high]) add(low, `${low} must not exceed ${high} for this process and assessment period (base units).`,loc);
      };
      le(prefix+'_nrg_pump',prefix+'_nrg_cons',ss.Configuration?.Questions?.[prefix+'_pumping'] === true || ss[prefix+'_nrg_pump'] > 0);
      if (prefix === 'wsd') { le('wsd_bill_con','wsd_auth_con'); le('wsd_auth_con','wsd_vol_dist'); le('wsd_deli_pts','wsd_ser_cons'); }
      if (prefix === 'wwt') { le('wwt_bod_effl','wwt_bod_infl'); le('wwt_tn_effl','wwt_tn_infl'); le('wwt_tst_cmpl','wwt_tst_cond'); }
      if (prefix === 'wwc') { le('wwc_vol_coll_unt','wwc_vol_coll'); le('wwc_vol_coll_tre','wwc_vol_coll'); if (finite(ss.wwc_vol_coll_unt) && finite(ss.wwc_vol_coll_tre) && finite(ss.wwc_vol_coll) && ss.wwc_vol_coll_unt + ss.wwc_vol_coll_tre > ss.wwc_vol_coll) add('wwc_vol_coll_tre','Treated plus untreated collected volume must not exceed collected volume.',loc); }
      if (ss.Configuration?.Questions?.[prefix+'_pumping_eff'] && typeof ss[prefix+'_KPI_nrg_elec_eff'] === 'function') {
        const efficiency = ss[prefix+'_KPI_nrg_elec_eff']();
        if (finite(efficiency) && efficiency > 100) add(prefix+'_pmp_flow','Measured pump inputs imply efficiency above 100%. Check flow, head, voltage, current and power factor in matching units.',loc);
      }
      substages.push({...loc, valid:issues.length === start});
    });
    if (!substages.length) add('process','Add at least one water or wastewater process and enter its minimum data.');
    return {valid:issues.length === 0, issues, substages};
  }
  function availability(ss, code, {inputStatus, sid, Questions = {}} = {}) {
    if (/^(wwt|wwo)_biogas_usage$/.test(code) && ss.Configuration?.Questions?.[code.slice(0,3)+'_producing_biogas'] === false) return {status:'not_applicable', dependencies:[], reason:'no biogas production'};
    if (!active(ss,code,Questions)) return {status:'not_applicable', dependencies:[]};
    const deps = DEPENDENCIES[code];
    if (!deps) return {status:'not_covered', dependencies:[]};
    const missing = deps.filter(c => ['missing','not_applicable'].includes(state(inputStatus,sid,c,ss[c])) || !finite(ss[c]));
    if (missing.length) return {status:'unknown', dependencies:deps, missing};
    if (ss[deps[0]] <= 0 || (deps.includes('wsd_main_len') && ss.wsd_main_len <= 0)) return {status:'unavailable',dependencies:deps,reason:'zero denominator'};
    return {status:'available',dependencies:deps, unconfirmed:deps.filter(c => state(inputStatus,sid,c,ss[c]) === 'unconfirmed')};
  }
  return {MINIMUM, DEPENDENCIES, state, active, requiredCodes, validate, availability};
});
