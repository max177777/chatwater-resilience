/* Four-stage fictional demonstration with real local HTTP routes; provider keys removed by runner. */
const assert=require('assert/strict'),JSZip=require('jszip');
const app=require('../server'),Demo=require('../public/js/demo-example'),U=require('../public/js/utility-identity'),C=require('../public/js/cw-core'),V=require('../engine/assessment-validity');
const {meta,clone}=require('./helpers/fixtures');
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=(route,body)=>fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const json=async(route,b)=>{const r=await post(route,b);assert.equal(r.status,200,await r.clone().text());return r.json();};
 try{
 for(const lang of ['en','id']){
  const a=clone(require('../public/samples/complete-example.json')[0]),m=meta(a,'demo_'+lang),d=Demo.build(a,m,lang);
  assert.match(d.record.provenance,lang==='id'?/fiktif/:/Fictional/);assert.equal(d.profile.service_type,'water');
  const result=V.calculate(a,0,{meta:m,inputStatus:d.record});assert.equal(result.completeness.complete,true);
  const acts=await json('/api/actions',{assessment:a,meta:m,inputStatus:d.record,lang});
  const actions=acts.options.filter(o=>o.rule==='pump_upgrade');assert(actions.length>0,'demonstrated pump action is offered');
  const body={assessment:a,meta:m,inputStatus:d.record,actions,actionSet:acts.basis,profile:d.profile,lang};
  const plan=await json('/api/plan',body);assert.equal(plan.ai,false);assert(plan.tasks.length);assert(!plan.humanReview);
  const proposal=await json('/api/proposal',{...body,...d.financing,plan});assert.equal(proposal.ai,false);assert.equal(proposal.sections.length,8);assert(!proposal.humanReview);
  const uid='utility_'+lang,other='utility_other';
  const state={schema:C.SCHEMA,assessments:[a],assessmentMeta:[m],gwpIndex:0,lang,selectedActions:actions,actionSet:acts.basis,plan,proposal,profile:d.profile,financing:d.financing,inputStatus:{[m.id]:d.record},utilities:{[uid]:d.profile,[other]:{name:'UNRELATED UTILITY'}},assessmentUtilities:{[m.id]:uid}};
  const response=await post('/api/export',state);assert.equal(response.status,200,await response.clone().text());const zip=await JSZip.loadAsync(await response.arrayBuffer());
  for(const f of Object.values(zip.files).filter(f=>!f.dir&&f.name.endsWith('.json')))assert(!(await f.async('string')).includes('UNRELATED UTILITY'),f.name);
  const denied=await post('/api/export',{...state,exportMode:'reviewed'});assert.equal(denied.status,409,'reviewed export still requires humans');
  const restored=JSON.parse(JSON.stringify(state));assert.equal(U.resolve(restored,m.id).name,d.profile.name);
  assert.equal((await post('/api/export',{...state,profile:{name:'Wrong utility'}})).status,409);
 }
 assert.equal(globalThis.__blockedRequests.length,0);
 console.log('Participant review: bilingual complete example actions → plan → eight-section GCF concept → working-draft export; human review required; source utility isolation and restoration passed');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
