const D=require('../public/js/document-review'),C=require('../public/js/cw-core'),V=require('./assessment-validity');
function evaluate(state){
 const ids=new Set([state.plan?.deps?.assessmentId,state.proposal?.deps?.assessmentId,state.actionSet?.assessmentId].filter(Boolean));
 const results=(state.assessments||[]).flatMap((a,i)=>ids.has(state.assessmentMeta?.[i]?.id)?[{...V.calculate(a,state.gwpIndex||0,{meta:state.assessmentMeta[i],inputStatus:state.inputStatus?.[state.assessmentMeta[i].id]}),assessmentId:state.assessmentMeta[i].id}]:[]);
 const freshness=C.freshness({...state,assessments:results.map(r=>({id:r.assessmentId,revision:C.revision(state.assessments[state.assessmentMeta.findIndex(m=>m.id===r.assessmentId)]),supportRevision:r.supportRevision})),customActions:C.customDefs(state.customActions,state.actionNotes)});
 return D.evaluate(state,{results,freshness});
}
module.exports={evaluate};
