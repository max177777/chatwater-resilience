/* Selected-project sharing boundary. Never serialize an arbitrary saved workspace.
 * Full recovery backups remain the browser's existing CWProject envelope.
 */
const C=require('../public/js/cw-core'),T=require('../public/js/project-transfer'),I=require('./integrity');
const E=require('./ecam-engine'),V=require('./assessment-validity'),CA=require('../public/js/custom-actions');
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const scalar=x=>x==null||['string','number','boolean'].includes(typeof x);
const fields=(o,keys)=>Object.fromEntries(keys.filter(k=>o&&Object.hasOwn(o,k)&&scalar(o[k])).map(k=>[k,o[k]]));
const list=x=>Array.isArray(x)?x:[];
const strings=x=>list(x).filter(x=>typeof x==='string');
function blocked(message){const e=new Error('Export blocked. '+message);e.status=409;throw e;}
const WORKSPACE_KEYS=new Set(['assessments','assessmentMeta','inputStatus','projectTransfer','checkpoints','previous','chat','chatThreads','transferRecovery','profiles','projects','workspace','customActions','legacy']);
const EVIDENCE_KEYS=new Set(('en id at prefix sid index kgco2 kwh status dependencies missing reason mode text values code label value unit review '
 +'id tag passage_id source_id sourceId title cite heading locator locatorLabel role review_status warnings qualifications qualification_details library_build publisher date url source from page printed_page section slide '
 +'library_build searched query queries source_filter context stage from status reason retrieved cited unknown_tags word_overlap checks tag_valid support overlap sentence '
 +'key error incomplete n questions unsupported_figures placeholders_dropped original kind version caveats').split(/\s+/));
// Evidence is attached only to the retained output or selected action. Unknown nested
// workspace containers and explicitly foreign-owned records are never carried along.
function evidenceValue(v,aid){
 if(scalar(v))return v;
 if(Array.isArray(v))return v.map(x=>evidenceValue(x,aid)).filter(x=>x!==undefined);
 if(v.assessmentId&&v.assessmentId!==aid)return undefined;
 return Object.fromEntries(Object.entries(v).filter(([k])=>!WORKSPACE_KEYS.has(k)&&EVIDENCE_KEYS.has(k)).map(([k,x])=>[k,evidenceValue(x,aid)]).filter(([,x])=>x!==undefined));
}
const DEP_KEYS=['assessmentId','revision','gwpIndex','supportRevision','actionsFingerprint','profile','planFingerprint','framework'];
function document(value,kind,aid,actions=[],meta){
 if(!value)return null;
 if(value.deps?.assessmentId!==aid)blocked('Document ownership does not match the project.');
 const out=fields(value,kind==='plan'?['summary','total_weeks','ai','lang','reviewed','created_at']:['title','route','framework_version','ai','lang','reviewed','created_at']);
 out.deps=fields(value.deps,DEP_KEYS);
 const reviewIds=new Set(kind==='proposal'?list(value.sections).map((s,i)=>'section-'+i):['summary','schedule',...list(value.concept?.areas).map((a,i)=>'concept-'+i)]);
 if(kind==='proposal'&&value.route==='gcf-preliminary-v1'){
  const PC=require('../public/js/preliminary-concept'),p=value.preliminary;
  if(!p||p.version!==PC.VERSION||p.framework!==PC.ROUTE||JSON.stringify(value.sections?.map(s=>s.key))!==JSON.stringify(PC.SECTIONS))blocked('Unsupported preliminary concept version or section metadata.');
  const inputs=PC.clean(p.inputs||{},actions),scope=PC.scope(actions,meta,inputs);
  if(C.fp(scope)!==C.fp(p.scope))blocked('Concept action classifications do not match the source project.');
  out.preliminary={...fields(p,['version','framework','presentation_target_pages','illustrations']),template:fields(p.template,['url','sha256','preparation_status_basis']),preparation_status:fields(p.preparation_status,['en','id']),status_notice:fields(p.status_notice,['en','id']),inputs,scope,references:list(p.references).map(r=>fields(r,['id','title','date','review_status','url','sha256']))};
 }
 if(value.humanReview){out.humanReview={version:typeof value.humanReview.version==='number'?value.humanReview.version:null,sections:Object.fromEntries(Object.entries(value.humanReview.sections||{}).filter(([id])=>reviewIds.has(id)).map(([id,r])=>[id,fields(r,['version','association','confirmed','sourceClaims','warnings','note','at'])]))};}
 if(value.reviewNotes)out.reviewNotes=Object.fromEntries(Object.entries(value.reviewNotes).filter(([id,n])=>reviewIds.has(id)&&typeof n==='string'));
 for(const k of ['sources','related','evidence','ai_failed'])if(value[k]!==undefined)out[k]=evidenceValue(value[k],aid);
 if(kind==='plan'){
  out.tasks=list(value.tasks).map(t=>{
   if(t.action_key&&!String(t.action_key).startsWith(aid+'|'))blocked('A plan task points to another assessment.');
   return {...fields(t,['id','action_id','action_key','action','phase','action_origin','name','owner','start_week','weeks']),depends_on:strings(t.depends_on)};
  });
  if(value.concept){out.concept={...fields(value.concept,['ai','ai_failed']),areas:list(value.concept.areas).map(a=>({...fields(a,['n','id','title','text','description','status','reviewed']),...Object.fromEntries(['questions','checks'].filter(k=>a[k]!==undefined).map(k=>[k,evidenceValue(a[k],aid)]))}))};for(const k of ['sources','related','evidence'])if(value.concept[k]!==undefined)out.concept[k]=evidenceValue(value.concept[k],aid);}
 }else out.sections=list(value.sections).map(s=>({...fields(s,['key','title','guidance','text','ai','reviewed','quotes_plan_summary']),...Object.fromEntries(['sources','related','evidence'].filter(k=>s[k]!==undefined).map(k=>[k,evidenceValue(s[k],aid)]))}));
 return out;
}
function nativeAssessment(a){
 const defaults=E.newAssessment(),out={General:fields(a.General,Object.keys(defaults.General)),Water:{},Waste:{}};
 for(const lv of ['Water','Waste'])out[lv]=fields(a[lv],Object.keys(defaults[lv]));
 const unitCodes=new Set(Object.keys(E._ecam.Info));
 out.Configuration={Units:Object.fromEntries(Object.entries(a.Configuration?.Units || {}).filter(([k,v])=>unitCodes.has(k)&&typeof v==='string'))};
 for(const [p,lv,sl]of C.STAGE_KEYS)out[lv][sl]=list(a[lv]?.[sl]).map(ss=>{
  const initial=E.newSubstage(p),o=fields(ss,Object.keys(initial));
  o.Configuration={Questions:Object.fromEntries(Object.entries(ss.Configuration?.Questions || {}).filter(([k,v])=>Object.hasOwn(E._ecam.Questions,k)&&typeof v==='boolean'))};return o;
 });
 // Never drop a result-affecting field and then rebind the documents to a new revision.
 if(C.revision(out)!==C.revision(a))blocked('Assessment contains unsupported fields that cannot be safely scoped. Use the full workspace recovery backup.');
 return out;
}
function inputRecord(record,meta){
 if(!record)return undefined;
 const scopes=['General','Water','Waste',...Object.values(meta.substages).flat()];
 const rec=r=>{const v=fields(r,['o','c','v','st','availability','note','source','source_note','source_year','year','period']);if(Array.isArray(r?.history))v.history=r.history.map(rec);return v;};
 return {...fields(record,['origin','provenance']),s:Object.fromEntries(scopes.filter(s=>record.s?.[s]).map(s=>[s,Object.fromEntries(Object.entries(record.s[s]).filter(([code])=>Object.hasOwn(E._ecam.Info,code)).map(([code,r])=>[code,rec(r)]))]))};
}
function select(body,{requireProposal=false}={}){
 const {assessment,meta}=I.exportContext(body,{requireProposal});
 if(!assessment||!meta?.id)blocked('A selected project package requires outputs with a source assessment ID. Use the full workspace backup for recovery without outputs.');
 const aid=meta.id;
 if(list(body.assessmentMeta).filter(m=>m?.id===aid).length!==1)blocked('The source assessment ID is ambiguous.');
 V.requireSupported(assessment,{meta,inputStatus:body.inputStatus?.[aid],gwpIndex:body.gwpIndex});
 let recovery=body;
 if(body.projectTransfer){const parsed=T.parse(JSON.stringify(body.projectTransfer));
  if(parsed.kind!=='project'||C.fp(parsed.assessments)!==C.fp(body.assessments)||C.fp(parsed.state.assessmentMeta)!==C.fp(body.assessmentMeta)||parsed.state.gwpIndex!==(body.gwpIndex || 0))blocked('Nested project backup does not match the exported workspace.');
  recovery={...parsed.state,...body};
 }
 const a=nativeAssessment(assessment),m={id:aid,substages:Object.fromEntries(C.STAGE_KEYS.map(([p])=>[p,strings(meta.substages[p])]))};
 const lang=body.proposal?.lang || body.plan?.lang || body.lang || 'en';
 const out={schema:C.SCHEMA,assessments:[a],assessmentMeta:[m],gwpIndex:body.gwpIndex || 0,lang,current:0,selectedAssessmentId:aid,ui:{tab:'assess',view:'assess:entry',sel:{kind:'general'},chatOpen:false}};
 out.plan=document(body.plan,'plan',aid,body.selectedActions,m);out.proposal=document(body.proposal,'proposal',aid,body.selectedActions,m);
 out.actionSet=body.actionSet?fields(body.actionSet,['assessmentId','revision','gwpIndex','supportRevision','savedAt','legacy']):null;
 // Kept as written; I.exportContext has already checked selected ownership/figures.
 const cleanAction=a=>{
  const o=fields(a,CA.isCustom(a)?CA.FIELDS:['id','key','rule','category','expected_kwh','expected_kgco2','basis','notes','origin']);
  for(const k of (CA.isCustom(a)?['benefit_status','location']:['title','expected_text','scenario','evidence','basis_text','condition','provisional_warning','benefit_status','availability','substage','trigger']))if(a[k]!==undefined)o[k]=evidenceValue(a[k],aid);return o;
 };
 out.selectedActions=list(body.selectedActions).map(cleanAction);
 out.customActions=list(body.customActions).filter(a=>a.assessmentId===aid&&a.key===CA.keyOf(aid,a.cid)).map(cleanAction);
 const keySet=new Set([...out.selectedActions,...out.customActions].map(a=>a.key));
 const perKey=(obj,keys=keySet)=>Object.fromEntries(Object.entries(obj || {}).filter(([k])=>keys.has(k)).map(([k,v])=>[k,evidenceValue(v,aid)]));
 out.actionResult=null;
 const cached=body.actionResult;
 if(cached?.basis?.assessmentId===aid&&cached.basis.revision===C.revision(assessment)&&(cached.basis.gwpIndex || 0)===out.gwpIndex&&cached.basis.supportRevision===out.actionSet?.supportRevision){
  const fresh=new Map(I.optionsFor(assessment,meta,out.gwpIndex,body.inputStatus?.[aid]).map(a=>[a.key,a]));
  const options=list(cached.options).filter(a=>String(a.key || '').startsWith(aid+'|'));
  const same=(a,b)=>a==null&&b==null||typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(b));
  if(options.every(a=>{const f=fresh.get(a.key);return f&&f.rule===a.rule&&same(a.expected_kwh,f.expected_kwh)&&same(a.expected_kgco2,f.expected_kgco2);}))out.actionResult={assessmentId:aid,basis:fields(cached.basis,['assessmentId','revision','gwpIndex','supportRevision']),options:options.map(cleanAction)};
 }
 out.selectedKeys=out.selectedActions.map(a=>a.key);
 out.actionNotes=perKey(body.actionNotes);out.explanations=perKey(body.explanations);out.explanationEvidence=perKey(body.explanationEvidence);
 out.actionLabels={[aid]:perKey(body.actionLabels?.[aid],new Set(Object.keys(body.actionLabels?.[aid] || {}).filter(k=>k.startsWith(aid+'|'))))};
 out.customLastLabel=Object.hasOwn(body.customLastLabel || {},aid)&&scalar(body.customLastLabel[aid])?{[aid]:body.customLastLabel[aid]}:{};
 out.rejectedActions=Object.fromEntries(Object.entries(body.rejectedActions || {}).filter(([k])=>k.startsWith(aid+'|')).map(([k,v])=>[k,fields(v,['reason','at'])]));
 const status=inputRecord(body.inputStatus?.[aid],m);out.inputStatus=status?{[aid]:status}:{};
 const profile=body.profile?C.parseProfileJson(JSON.stringify(body.profile)).profile:null;
 out.profile=profile || null;
 // Preserve only this assessment's utility association in selected-project recovery.
 const utilityId=body.assessmentUtilities?.[aid];
 if(utilityId){
   if(C.fp(body.utilities?.[utilityId])!==C.fp(out.profile))blocked('Utility identity does not match the selected assessment.');
   out.utilities={[utilityId]:out.profile};out.assessmentUtilities={[aid]:utilityId};
 }
 // Require the same scoped profile the outputs used.
 if((out.profile&&Object.values(out.profile).some(v=>!scalar(v)))||C.fp(out.profile)!==C.fp(body.profile))blocked('The profile contains unscoped fields. Remove them or use the full workspace recovery backup.');
 out.financingAssessmentId=aid;
 out.financing={...fields(body.financing,['route']),...(body.financing?.pathways?{pathways:strings(body.financing.pathways)}:{})};
 if(body.financing?.route==='gcf-preliminary-v1')out.financing.conceptInputs=require('../public/js/preliminary-concept').clean(body.financing.conceptInputs||{},body.selectedActions||[]);
 if(body.financing?.customFramework)out.financing.customFramework={...fields(body.financing.customFramework,['id','name','note']),sections:list(body.financing.customFramework.sections).map(s=>fields(s,['key','title','en','id','guidance']))};
 if(C.frameworkKey(out.financing)!==C.frameworkKey(body.financing))blocked('The financing framework cannot be safely scoped without changing its identity.');
 out.previous={};
 for(const kind of ['plan','proposal']){
  const prev=recovery.previous?.[kind];if(prev?.value?.deps?.assessmentId===aid){try{out.previous[kind]={...fields(prev,['at']),value:document(prev.value,kind,aid,body.selectedActions,m)};}catch{/* an ambiguous historical version is omitted, never rebound */}}
 }
 // Checkpoints are whole-workspace snapshots; their nested ownership cannot be trusted.
 out.checkpoints=[];
 if(body.finished?.[aid]&&scalar(body.finished[aid]))out.finished={[aid]:body.finished[aid]};
 // A projected backup must keep all original dependency checks, not appear current by rebinding.
 I.exportContext(out,{requireProposal});
 out.results=[V.calculate(a,out.gwpIndex,{meta:m,inputStatus:out.inputStatus[aid]})];
 out.exportScope={kind:'selected_project',assessmentId:aid,review:'working_draft',omissions:[
  'Other assessments, profiles and their actions/outputs',
  'Whole-workspace checkpoints (including mixed snapshots)',
  'Chat history, transferRecovery, legacy/unbound data and unknown workspace fields',
  'Foreign or unbound previous versions and unrelated cached explanations',
  'Current-screen selection and workspace-only UI/cache data',
 ],sourceRevision:C.revision(a)};
 out.documentReview=require('./document-review').evaluate(out);
 out.exportMode=body.exportMode||'working_draft';
 if(!['working_draft','reviewed'].includes(out.exportMode))blocked('Unknown document review export mode.');
 if(out.exportMode==='reviewed'&&out.documentReview.status!=='reviewed')blocked('Human review and required document checks are incomplete. Download a working draft or resolve the review issues.');
 out.exportScope.review=out.exportMode;
 // Build from the projection, never reuse the full incoming envelope or its digests.
 out.projectTransfer=T.pack(out);
 return out;
}
function manifest(state,contents){
 const a=state.assessments[0],m=state.assessmentMeta[0],r=state.results[0];
 return {format:'chatwater-selected-project-package',version:1,scope:'selected_project',project:{id:m.id,assessmentId:m.id,name:a.General.Name,identity_basis:'outputs.source_assessment_id',revision:C.revision(a)},
 versions:{framework:state.proposal?.framework_version||'legacy-unrecorded',application:require('../package.json').version,ecam:'3.0.1',native_ecam:a.General.version,session:C.SCHEMA,transfer:T.VERSION},period:r.period,language:state.lang,
 calculation_settings:{gwpIndex:state.gwpIndex,gwp:r.gwp,units:a.Configuration.Units,general_factors:r.factors,input_status_support:r.supportRevision},
 preliminary_concept:state.proposal?.preliminary||null,
 review_status:{package:state.exportMode||'working_draft',evaluation:state.documentReview,freshness:'current under existing validity/freshness checks',scientific_approval:'not established by export'},
 omissions:state.exportScope.omissions,contents};
}
module.exports={select,manifest};
