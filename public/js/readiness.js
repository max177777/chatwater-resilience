/* Informational adapter over CW-03 validity/availability, CW freshness and CW-10 review.
 * It never changes values, applicability, calculations, ownership or export gates.
 */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./cw-core'),require('./assessment-validity'),require('./result-status'),require('./document-review'),require('./custom-actions'),require('./preliminary-concept'));
 else root.Ready=factory(root.CW,root.AV,root.RSData,root.DR,root.CA,root.PC);
})(typeof self!=='undefined'?self:this,function(C,AV,Data,DR,CA,PC){
 const list=x=>Array.isArray(x)?x:[],enc=x=>encodeURIComponent(String(x??'')),OPS=['finish_assessment','calculate_actions','draft_plan','draft_proposal','export_draft','export_reviewed'];
 const targetId=t=>['ready',t.assessmentId,t.kind,t.scope||'',t.code||'',t.document||'',t.sectionKey||'',t.taskId||'',t.actionKey||'',t.operation||''].map(enc).join(':');
 const docKey=(doc,kind,id)=>id==='summary'||id==='schedule'?id:id.startsWith('section-')?doc.sections?.[+id.slice(8)]?.key:doc.concept?.areas?.[+id.slice(8)]?.id;
 function findScope(a,m,scope){
  if(['General','Water','Waste'].includes(scope))return {obj:a?.[scope],kind:scope==='General'?'general':'stage',scope,level:scope};
  for(const [prefix,level,sublevel]of C.STAGE_KEYS){const index=list(m?.substages?.[prefix]).indexOf(scope);if(index>=0&&a?.[level]?.[sublevel]?.[index])return {obj:a[level][sublevel][index],kind:'ss',scope,prefix,level,sublevel,index};}
  return null;
 }
 function requirement(a,m,scope,code,{Questions={},InputCodes={},result}={}){
  const s=findScope(a,m,scope);if(!s)return {kind:'optional',active:false};
  const active=s.kind!=='ss'||AV.active(s.obj,code,Questions);
  const required=scope==='General'?['AssessmentPeriodStart','AssessmentPeriodEnd'].includes(code):s.kind==='ss'&&AV.requiredCodes(s.prefix,s.obj,{Questions,InputCodes}).includes(code);
  const minimum=s.kind==='ss'&&AV.MINIMUM[s.prefix]?.includes(code);
  const sub=list(result?.substages).find(r=>r.sid===scope);
  const outputs=Object.entries(sub?.availability||{}).filter(([,v])=>v.status!=='not_applicable'&&list(v.dependencies).includes(code)).map(([k])=>k);
  if(scope==='General')for(const [rule,deps]of Object.entries(Data.ACTIONS))if(deps.includes('general:'+code)&&list(result?.substages).some(s=>!Data.ACTION_PREFIXES[rule]||Data.ACTION_PREFIXES[rule].includes(s.prefix)))outputs.push(rule);
  return {kind:required?(minimum||scope==='General'?'required':'calculation'):active&&outputs.length?'calculation':'optional',active,outputs};
 }
 function reason(v){const s=v.message||'';return /^AssessmentPeriod/.test(v.code)?/after/.test(s)?'date_order':'date':v.type==='missing'?'missing':/percentage/.test(s)?'percent':/service hours/.test(s)?'hours':/Power factor/.test(s)?'power_factor':/valid option/.test(s)?'option':/nonnegative/.test(s)?'nonnegative':/finite number/.test(s)?'number':/must not exceed|plus untreated|above 100/.test(s)?'relation':v.code==='process'?'process':'invalid';}
 function evaluate(state,ctx={}){
  const contexts=list(ctx.assessments),byId=new Map(contexts.map(c=>[c.meta?.id,c])),issues=new Map(),fields=[];
  const sourceIds=[state.actionSet?.assessmentId,state.plan?.deps?.assessmentId,state.proposal?.deps?.assessmentId].filter(Boolean),source=sourceIds[0]||null;
  const current=state.assessmentMeta?.[state.current||0]?.id||contexts[0]?.meta?.id;
  const owners={finish_assessment:current,calculate_actions:state.selectedAssessmentId||current,draft_plan:state.actionSet?.assessmentId||state.selectedAssessmentId||current,draft_proposal:source||state.selectedAssessmentId||current,export_draft:source,export_reviewed:source};
  function add({assessmentId,stage='assess',severity='blocker',messageKey,detail='',target,prevents=[],choices=[],status,affected=[],excerpts=[],key}){
   const id=[assessmentId,stage,key||messageKey,targetId(target)].map(enc).join('|');
   const old=issues.get(id);if(old){old.prevents=[...new Set([...old.prevents,...prevents])];old.affected=[...new Set([...old.affected,...affected])];return;}
   issues.set(id,{id,assessmentId,stage,severity,messageKey,detail,status:status||null,prevents:[...new Set(prevents)],target,choices,affected,excerpts});
  }
  const downstream=['finish_assessment','draft_plan','draft_proposal','export_draft','export_reviewed'];
  for(const c of contexts){
   const {assessment:a,meta:m,result:r,validity}=c,aid=m.id,record=state.inputStatus?.[aid];
   const scopes=['General','Water','Waste',...C.STAGE_KEYS.flatMap(([p])=>list(m.substages?.[p]))];
   for(const scope of scopes){const s=findScope(a,m,scope);for(const code of Object.keys(s?.obj||{}).filter(k=>ctx.Info?.[k]||/^AssessmentPeriod/.test(k))){
    const req=requirement(a,m,scope,code,{...ctx,result:r}),value=s.obj[code],raw=record?.s?.[scope]?.[code],explicitUnknown=raw?.availability==='unknown'&&(raw.v===value||raw.v==null&&value==null);
    const input=/^AssessmentPeriod/.test(code)?{status:'available'}:Data.input(record,scope,code,value,ctx.Info,ctx.Tables);
    fields.push({assessmentId:aid,scope,code,...req,status:req.active?(explicitUnknown?'unknown':input.status):'not_applicable',explicitUnknown,origin:input.origin||null,confirmed:!!input.confirmed,target:{kind:'field',assessmentId:aid,scope,code}});
   }}
   function fieldIssue(scope,code,{hard=false,invalid=false,validityGate=false,detail='',affected=[],key='input'}={}){
    const f=fields.find(f=>f.assessmentId===aid&&f.scope===scope&&f.code===code),s=findScope(a,m,scope),value=s?.obj?.[code];
    const unknown=f?.explicitUnknown,unconfirmed=f?.status==='unconfirmed',conditional=s?.kind==='ss'&&!AV.MINIMUM[s.prefix]?.includes(code)&&Object.values(ctx.Questions||{}).some(q=>q?.variables?.includes(code));
    add({assessmentId:aid,severity:hard?'blocker':'warning',messageKey:invalid?key:unknown?'unknown':unconfirmed?'unconfirmed':f?.status==='not_applicable'?'inactive_conflict':'missing',status:f?.status,detail,affected,
     target:{kind:'field',assessmentId:aid,scope,code},key:'input:'+code+':'+(hard?'required':key),prevents:hard?(invalid||validityGate?[...downstream,'calculate_actions']:downstream):affected.map(c=>'calculation:'+c),
     choices:[...(unknown?['leave_unknown']:[]),'enter_value',...(!unknown&&typeof value==='number'&&Number.isFinite(value)&&unconfirmed?['confirm_value']:[]),...(!invalid&&!unknown?['mark_unknown']:[]),...(conditional?['change_process']:[])]});
   }
   for(const v of validity?.issues||[]){
    if(v.code==='process'||v.code==='assessment'){add({assessmentId:aid,messageKey:v.code==='process'?'process':'invalid',target:{kind:'assessment',assessmentId:aid},prevents:[...downstream,'calculate_actions'],choices:['open_assessment']});continue;}
    fieldIssue(v.sid||v.level||'General',v.code,{hard:true,validityGate:true,invalid:v.type!=='missing',key:reason(v),detail:v.message});
   }
   for(const sub of r?.substages||[]){
    const total=sub.availability?.[sub.prefix+'_KPI_GHG'];
    for(const [output,v]of Object.entries(sub.availability||{})){
     if(['available','not_applicable'].includes(v.status))continue;
     for(const code of v.missing||[]){if(!Object.hasOwn(sub.input_availability||{},code))continue;const hard=total?.missing?.includes(code);fieldIssue(sub.sid,code,{hard,affected:[output]});}
    }
   }
   for(const rule of Object.keys(Data.ACTIONS))for(const sub of rule==='solar_pv'?[null]:list(r?.substages).filter(s=>!Data.ACTION_PREFIXES[rule]||Data.ACTION_PREFIXES[rule].includes(s.prefix))){
    const support=Data.actionStatus(rule,sub,r,{assessment:a,inputStatus:record,Info:ctx.Info,Tables:ctx.Tables});
    if(['available','not_applicable'].includes(support.status))continue;
    let target;
    for(const dep of support.missing||[]){const [kind,code]=dep.split(':');let field;
      if(kind==='output')field=sub?.availability?.[sub.prefix+'_'+code]?.missing?.find(c=>Object.hasOwn(sub.input_availability||{},c));
      else if(kind==='input')field=sub?.prefix+'_'+code;
      else if(kind==='general')target={kind:'field',assessmentId:aid,scope:'General',code};
      if(field)target={kind:'field',assessmentId:aid,scope:sub.sid,code:field};
      if(target)break;
    }
    if(!target||!fields.some(f=>f.assessmentId===target.assessmentId&&f.scope===target.scope&&f.code===target.code))continue; // No invented input when the existing graph has no resolvable dependency.
    add({assessmentId:aid,stage:'actions',severity:'warning',messageKey:'action_unavailable',target:{...target,actionKey:C.actionKey(aid,rule,sub?.sid)},prevents:['calculation:'+rule],choices:['enter_value','leave_unknown'],affected:[rule],key:rule+':'+(sub?.sid||'utility')});
   }
   if(r?.completeness?.complete===false&&![...issues.values()].some(i=>i.assessmentId===aid&&i.severity==='blocker'))add({assessmentId:aid,messageKey:'incomplete_total',target:{kind:'assessment',assessmentId:aid},prevents:downstream,choices:['open_assessment']});
  }
  const fresh=ctx.freshness||C.freshness({...state,assessments:contexts.map(c=>({id:c.meta.id,revision:C.revision(c.assessment),supportRevision:c.result?.supportRevision})),customActions:C.customDefs(state.customActions,state.actionNotes)});
  for(const [kind,stage,operations,operation]of [['actions','actions',['draft_plan','draft_proposal','export_draft','export_reviewed'],'calculate_actions'],['options','actions',['save_actions'],'calculate_actions'],['plan','plan',['draft_proposal','export_draft','export_reviewed'],'draft_plan'],['proposal','finance',['export_draft','export_reviewed'],'draft_proposal']]){
   if(fresh[kind]?.length)add({assessmentId:source||current,stage,messageKey:'outdated',detail:fresh[kind].join(', '),affected:[kind],target:{kind:'operation',assessmentId:source||current,operation},prevents:operations,choices:['update_output'],key:kind});
  }
  if(new Set(sourceIds).size>1)add({assessmentId:source,stage:'finance',messageKey:'mixed',target:{kind:'operation',assessmentId:source,operation:'draft_proposal'},prevents:['export_draft','export_reviewed'],choices:['review_ownership']});
  if(!source||!byId.has(source))add({assessmentId:source||current,stage:'finance',messageKey:'source_missing',target:{kind:'assessment',assessmentId:source||current},prevents:['export_draft','export_reviewed'],choices:['open_assessment']});
  if(!list(state.selectedActions).length)add({assessmentId:owners.draft_plan,stage:'actions',messageKey:'select_actions',target:{kind:'operation',assessmentId:owners.draft_plan,operation:'select_actions'},prevents:['draft_plan'],choices:['select_actions']});
  for(const kind of ['plan','proposal'])if(!state[kind])add({assessmentId:source||current,stage:kind==='plan'?'plan':'finance',severity:'optional',messageKey:'no_document',target:{kind:'operation',assessmentId:source||current,operation:kind==='plan'?'draft_plan':'draft_proposal'},choices:['create_document'],key:kind});
  for(const action of list(state.customActions).filter(a=>list(state.selectedKeys).includes(a.key))){
   if(CA.resolveLocation(action,state.assessmentMeta?.find(m=>m.id===action.assessmentId)).at==='missing')add({assessmentId:action.assessmentId,stage:'actions',messageKey:'custom_location',target:{kind:'action',assessmentId:action.assessmentId,actionKey:action.key,code:'location'},prevents:['save_actions'],choices:['review_section']});
  }
  if(state.actionResult&&!list(state.selectedKeys).some(k=>[...list(state.actionResult.options),...list(state.customActions)].some(a=>a.key===k&&a.rule!=='baseline')))add({assessmentId:state.actionResult.assessmentId,stage:'actions',messageKey:'select_actions',target:{kind:'operation',assessmentId:state.actionResult.assessmentId,operation:'select_actions'},prevents:['save_actions'],choices:['select_actions'],key:'empty-selection'});
  const review=ctx.review||DR.evaluate(state,{freshness:fresh,results:contexts.map(c=>({...c.result,assessmentId:c.meta.id}))});
  if(!Object.keys(review.documents).length)add({assessmentId:source||current,stage:'finance',messageKey:'review_no_document',target:{kind:'operation',assessmentId:source||current,operation:'draft_proposal'},prevents:['export_reviewed'],choices:['create_document']});
  for(const [kind,d]of Object.entries(review.documents))for(const issue of d.issues){
   if(issue.code==='outdated_issue')continue;
   const doc=state[kind],aid=doc.deps?.assessmentId,sectionKey=issue.section?docKey(doc,kind,issue.section):null;
   let target={kind:['unreviewed','evidence','figures','failed','calculation'].includes(issue.code)?'review':'document',assessmentId:aid,document:kind,sectionKey,reviewControl:issue.code==='unreviewed'?'confirm':'note'};
   if(kind==='proposal'&&doc.route===PC.ROUTE&&state.financing?.route===PC.ROUTE&&issue.code==='missing'&&Array.isArray(issue.detail)){
    const matched=issue.detail.map(excerpt=>({excerpt,field:PC.FIELDS.find(f=>excerpt==='[To be completed: '+f.label.en+']'||excerpt==='[Perlu dilengkapi: '+f.label.id+']')}));
    if(matched.length&&matched.every(x=>x.field)){for(const {excerpt,field}of matched)add({assessmentId:aid,stage:'finance',messageKey:'review_missing',detail:issue.title,excerpts:[excerpt],target:{kind:'concept_field',assessmentId:aid,document:'proposal',sectionKey,code:field.key},prevents:['export_reviewed'],choices:['enter_value'],key:'concept_missing:'+field.key});continue;}
   }
   if(sectionKey==='schedule'&&issue.code==='missing'){const task=list(doc.tasks).find(t=>!String(t.owner||'').trim()||!String(t.name||'').trim()||!Number.isFinite(t.weeks)||t.weeks<=0);if(task)target={kind:'task',assessmentId:aid,document:'plan',taskId:task.id,code:!String(task.owner||'').trim()?'owner':'weeks'};}
   add({assessmentId:aid,stage:kind==='plan'?'plan':'finance',messageKey:'review_'+issue.code,severity:'blocker',detail:issue.title,excerpts:Array.isArray(issue.detail)?issue.detail:[],target,prevents:['export_reviewed'],choices:d.status==='outdated'?['update_output','review_section']:['review_section'],key:issue.code});
  }
  const sums=C.summedClaims(state);if(sums.plan||sums.proposal.length)add({assessmentId:source,stage:sums.plan?'plan':'finance',messageKey:'summed',target:{kind:'document',assessmentId:source,document:sums.plan?'plan':'proposal',sectionKey:sums.plan?'summary':list(state.proposal?.sections).find(s=>sums.proposal.includes(s.title))?.key},prevents:['export_draft','export_reviewed',...(sums.plan?['draft_proposal']:[])],choices:['edit_claim']});
  const sharedWarnings=list(state.selectedActions).filter(a=>a.provisional_warning||C.isCustom(a)).map(a=>({key:a.key,title:a.title||a.id,warning:a.provisional_warning||null,unquantified:C.isCustom(a)}));
  const output={sharedWarnings,issues:[...issues.values()],fields,operations:{},version:1};
  for(const op of [...OPS,'save_actions']){const aid=owners[op]||state.actionResult?.assessmentId||current,blocking=output.issues.filter(i=>i.severity==='blocker'&&i.prevents.includes(op)&&(i.assessmentId===aid||i.messageKey==='mixed'||i.messageKey==='source_missing'));output.operations[op]={assessmentId:aid,blocked:!!blocking.length,issueIds:blocking.map(i=>i.id)};}
  output.operations.save_draft={blocked:false,issueIds:[]};output.operations.full_backup={blocked:false,issueIds:[]};
  return output;
 }
 function resolve(state,target){
  const ms=list(state.assessmentMeta),i=ms.findIndex(m=>m.id===target.assessmentId),a=state.assessments?.[i],m=ms[i];if(i<0||!a||ms.filter(m=>m.id===target.assessmentId).length!==1)return {ok:false,reason:'target_missing'};
  if(target.kind==='concept_field')return state.financing?.route===PC.ROUTE&&state.proposal?.deps?.assessmentId===target.assessmentId&&PC.FIELDS.some(f=>f.key===target.code)?{ok:true,view:'finance',assessmentIndex:i}:{ok:false,reason:'target_missing'};
  if(target.kind==='field'){const s=findScope(a,m,target.scope);return s&&Object.hasOwn(s.obj,target.code)?{ok:true,view:'assess:entry',assessmentIndex:i,selection:{kind:s.kind,...(s.prefix?{prefix:s.prefix,index:s.index}:{}),...(s.kind==='stage'?{level:s.level}:{})}}:{ok:false,reason:'target_missing'};}
  if(['document','review','task'].includes(target.kind)){
   const doc=state[target.document];if(!doc||doc.deps?.assessmentId!==target.assessmentId)return {ok:false,reason:'target_missing'};
   let partId=target.sectionKey;
   if(target.kind==='task'){if(list(doc.tasks).filter(t=>t.id===target.taskId).length!==1)return {ok:false,reason:'target_missing'};}
   else if(target.sectionKey&&!(target.document==='plan'&&['summary','schedule'].includes(target.sectionKey))){
    const parts=target.document==='proposal'?list(doc.sections):list(doc.concept?.areas),key=target.document==='proposal'?'key':'id',matches=parts.map((p,j)=>({p,j})).filter(x=>x.p[key]===target.sectionKey);if(matches.length!==1)return {ok:false,reason:'target_missing'};partId=(target.document==='proposal'?'section-':'concept-')+matches[0].j;
   }
   return {ok:true,view:target.document==='plan'?'plan':'finance:draft',assessmentIndex:i,partId};
  }
  if(target.kind==='action'){const actions=[...list(state.customActions),...list(state.actionResult?.options),...list(state.selectedActions)];return actions.some(a=>a.key===target.actionKey&&String(a.key).startsWith(target.assessmentId+'|'))?{ok:true,view:'actions:compare',assessmentIndex:i}:{ok:false,reason:'target_missing'};}
  if(target.kind==='operation')return {ok:true,view:({calculate_actions:'actions:select',select_actions:state.actionResult?'actions:compare':'actions:select',draft_plan:'plan',draft_proposal:'finance'})[target.operation]||'assess:entry',assessmentIndex:i};
  return {ok:true,view:'assess:entry',assessmentIndex:i,selection:{kind:'general'}};
 }
 return {evaluate,requirement,resolve,targetId,OPS};
});
