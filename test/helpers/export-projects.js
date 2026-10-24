/* Distinct synthetic projects for sharing/backup tests. Never real utility data. */
const C=require('../../public/js/cw-core'),CA=require('../../public/js/custom-actions'),T=require('../../public/js/project-transfer');
const I=require('../../engine/integrity'),V=require('../../engine/assessment-validity'),{buildPlan}=require('../../engine/plan');
const clone=x=>JSON.parse(JSON.stringify(x));
function project(letter){
 const fixture=letter.toLowerCase(),assessment=clone(require(`../fixtures/review/case-${fixture}.json`)[0]),ctx=clone(require(`../fixtures/review/case-${fixture}.context.json`));
 const marker=`CW11_${letter}_ONLY`,meta=clone(ctx.meta),id=`cw11-${letter.toLowerCase()}`;meta.id=id;
 for(const p of Object.keys(meta.substages))meta.substages[p]=meta.substages[p].map(s=>id+'-'+s);
 const status=C.duplicateInputStatus(ctx.inputStatus,ctx.meta,meta),gwpIndex=letter==='A'?2:0;
 assessment.General.Name=marker+' synthetic utility';assessment.General.Comments=marker+' assessment notes';
 status.s.General=status.s.General || {};status.s.General.conv_kwh_co2={o:'default',c:true,v:assessment.General.conv_kwh_co2,note:marker+' source note'};
 const options=I.optionsFor(assessment,meta,gwpIndex,status),custom=CA.create({assessmentId:id,cid:'c_'+letter.toLowerCase().repeat(8),label:'U01',input:{title:marker+' custom action',description:marker+' custom detail',problem:marker+' problem'},now:'2026-10-24T00:00:00Z'});
 const selected=[...options.filter(o=>o.rule==='pump_upgrade').slice(0,1),{...custom,notes:marker+' selection note'}],profile={name:marker+' profile',country:'Indonesia',notes:marker+' profile notes'},financing={route:'general'};
 const supportRevision=V.calculate(assessment,gwpIndex,{meta,inputStatus:status}).supportRevision,basis={assessmentId:id,revision:C.revision(assessment),gwpIndex,supportRevision};
 const source={id:'S1',title:marker+' evidence source',cite:'Synthetic only',heading:'Fixture',qualification_details:[{id:'q1',title:'Scope qualification',text:marker+' limitation; not approved scientific evidence',locator:{page:1}}]};
 const evidence={library_build:'synthetic',searched:{query:marker+' query',status:'found'},retrieved:[{source_id:marker+'-source',passage_id:'p1'}],cited:[{tag:'S1',source_id:marker+'-source',passage_id:'p1'}],checks:{support:'not verified'}};
 const plan={...buildPlan(selected,'en'),summary:marker+' edited plan.',ai:false,lang:'en',sources:[source],evidence,deps:C.planDeps({assessmentId:id,assessment,gwpIndex,actions:selected,profile,supportRevision})};
 const proposal={title:marker+' edited proposal',route:'general',ai:false,lang:'en',sections:[{key:'summary',title:'Project summary',text:marker+' edited proposal text [S1].',sources:[source],evidence,ai:false,reviewed:false}],deps:C.proposalDeps({assessmentId:id,assessment,gwpIndex,actions:selected,plan,profile,financing,supportRevision})};
 const state={schema:C.SCHEMA,assessments:[assessment],assessmentMeta:[meta],inputStatus:{[id]:status},gwpIndex,current:0,selectedAssessmentId:id,selectedActions:selected,selectedKeys:selected.map(a=>a.key),actionSet:basis,actionResult:{assessmentId:id,basis,options},customActions:[custom],actionNotes:{[custom.key]:marker+' selection note'},plan,proposal,profile,financing,lang:'en',previous:{plan:{at:'synthetic',value:{...clone(plan),summary:marker+' previous plan.'}},proposal:{at:'synthetic',value:{...clone(proposal),title:marker+' previous proposal'}}},checkpoints:[],ui:{tab:'assess',view:'assess:entry',sel:{kind:'general'},chatOpen:false}};
 return {letter,marker,id,assessment,meta,status,state};
}
function workspace(letter){
 const a=project('A'),b=project('B'),own=letter==='A'?a:b,other=letter==='A'?b:a;
 const state=clone(own.state);state.assessments=[a.assessment,b.assessment];state.assessmentMeta=[a.meta,b.meta];state.inputStatus={...a.state.inputStatus,...b.state.inputStatus};state.customActions=[...a.state.customActions,...b.state.customActions];state.actionNotes={...a.state.actionNotes,...b.state.actionNotes};
 state.current=letter==='A'?1:0;state.selectedAssessmentId=other.id; // deliberate screen/output ownership difference
 state.previous.proposal=clone(other.state.previous.proposal);state.previous.unbound={value:{text:other.marker+' unbound previous'}};
 state.checkpoints=[{at:'synthetic',snap:{...clone(a.state),checkpointMarker:a.marker+' checkpoint'}},{at:'synthetic',snap:{...clone(b.state),checkpointMarker:b.marker+' checkpoint'}}];
 state.chat=[{content:other.marker+' legacy chat'}];state.chatThreads={[a.id]:[{content:a.marker+' chat'}],[b.id]:[{content:b.marker+' chat'}]};state.transferRecovery=[{payload:{assessments:[other.assessment],plan:other.state.plan,profile:other.state.profile,marker:other.marker+' transfer recovery'}}];state.profiles={[other.id]:other.state.profile};
 state.plan.unrecognizedRecovery={marker:other.marker+' hidden plan data',assessments:[other.assessment]};state.plan.evidence.unrecognizedAttachment={secret:other.marker+' nested evidence data'};state.plan.sources[0].qualification_details[0].otherProject=other.marker+' nested qualification data';
 state.customLastLabel={[own.id]:{hidden:other.marker+' invalid nested label'}};state.finished={[own.id]:{hidden:other.marker+' invalid nested completion'}};
 state.projectTransfer=T.pack(state);
 return {a,b,own,other,state};
}
module.exports={project,workspace};
