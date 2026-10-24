const R=require('../public/js/readiness'),C=require('../public/js/cw-core'),V=require('./assessment-validity'),E=require('./ecam-engine');
const InputCodes=Object.fromEntries(C.STAGE_KEYS.map(([p])=>[p,Object.keys(E.newSubstage(p)).filter(c=>typeof E.newSubstage(p)[c]==='number')]));
function evaluate(state){return R.evaluate(state,{Info:E._ecam.Info,Tables:E._ecam.Tables,Questions:E._ecam.Questions,InputCodes,assessments:(state.assessments||[]).map((assessment,i)=>{const meta=state.assessmentMeta?.[i]||{id:'untracked',substages:{}};return {assessment,meta,validity:V.validate(assessment,{meta,inputStatus:state.inputStatus?.[meta.id]}),result:V.calculate(assessment,state.gwpIndex||0,{meta,inputStatus:state.inputStatus?.[meta.id]})};})});}
module.exports={evaluate};
