/* Shared helpers for tests. All data derives from the HYPOTHETICAL sample utility. */
const CW = require('../../public/js/cw-core');

/** Deterministic ChatWater metadata for an assessment: substage IDs like wsa_0, wwo_0. */
function meta(assessment, id = 'a_test') {
  return {
    id,
    substages: Object.fromEntries(CW.STAGE_KEYS.map(([p, lv, sl]) => [p, (assessment[lv][sl] || []).map((_, i) => `${p}_${i}`)])),
  };
}
const clone = o => JSON.parse(JSON.stringify(o));

/** Explicit test-only assumptions. These are synthetic values, never measured utility data. */
function confirmedInputs(assessment,m) {
 const record={origin:'synthetic fixture',s:{}};
 const add=(sid,obj)=>{record.s[sid]=Object.fromEntries(Object.entries(obj).filter(([,v])=>typeof v==='number').map(([code,v])=>[code,{o:'typical',c:true,v,note:'Synthetic fixture assumption explicitly confirmed for this test'}]));};
 add('General',assessment.General);add('Water',assessment.Water);add('Waste',assessment.Waste);
 for(const [p,lv,sl] of CW.STAGE_KEYS) assessment[lv][sl].forEach((ss,i)=>add(m.substages[p][i],ss));
 return record;
}
function withConfirmedInputs(body) {
 body={...body};
 if(body.assessment && body.meta && body.inputStatus===undefined) body.inputStatus=confirmedInputs(body.assessment,body.meta);
 if(body.assessments && body.assessmentMeta && body.inputStatus===undefined) body.inputStatus=Object.fromEntries(body.assessments.map((a,i)=>[body.assessmentMeta[i]?.id,confirmedInputs(a,body.assessmentMeta[i] || meta(a))]));
 return body;
}
module.exports = { meta, clone, confirmedInputs, withConfirmedInputs };
