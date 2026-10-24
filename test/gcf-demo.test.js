/* Demo generation policy; all legacy documents remain separate and recoverable. */
const assert=require('assert/strict'),JSZip=require('jszip');
const app=require('../server'),PC=require('../public/js/preliminary-concept'),C=require('../public/js/cw-core'),PW=require('../engine/pathways'),T=require('../public/js/project-transfer');
const {workspace}=require('./helpers/export-projects');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=(route,body)=>fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  for(const route of ['general','custom','gcf',undefined])assert.equal((await post('/api/proposal',{route,guideText:'DO NOT CALL MODELS'})).status,422);
  for(const pathways of [['ppp'],['climate_fund'],['gcf','development_bank']])assert.equal((await post('/api/proposal',{route:PC.ROUTE,pathways})).status,422);
  assert.equal((await post('/api/guide/parse',{filename:'private.pdf',base64:'invalid'})).status,422);
  const meta=await (await fetch(`http://127.0.0.1:${server.address().port}/api/meta`)).json();assert.deepEqual(meta.financing.map(f=>f.id),[PC.ROUTE]);
  for(const lang of ['en','id']){
   const s=workspace('A').state;s.financing.pathways=['ppp','climate_fund'];
   s.proposal.deps=C.proposalDeps({assessmentId:s.assessmentMeta[0].id,assessment:s.assessments[0],gwpIndex:s.gwpIndex,actions:s.selectedActions,plan:s.plan,profile:s.profile,supportRevision:s.actionSet.supportRevision,financing:s.financing});
   s.checkpoints=[{reason:'synthetic-original',snap:clone(s)}];
   const legacy=clone(s),changed=PC.demoFinancing(s.financing,s.selectedActions);assert.deepEqual(changed.pathways,['gcf']);assert.equal(changed.route,PC.ROUTE);assert.notEqual(C.frameworkKey(changed),C.frameworkKey(s.financing));assert.equal(s.financing.route,'general');
   const match=await(await post('/api/pathways',{actions:s.selectedActions,profile:s.profile,lang})).json();assert.deepEqual([...match.matched,...match.other].map(p=>p.id),['gcf']);assert.match(PW.forFacts(['gcf'],lang)[0].name,/Green Climate Fund/);assert(!PW.forFacts(['gcf'],lang)[0].name.includes('e.g.'));
   const response=await post('/api/export',{...s,lang});assert.equal(response.status,200,await response.clone().text());const zip=await JSZip.loadAsync(await response.arrayBuffer());
   assert.equal(legacy.proposal.route,'general');assert.equal(JSON.stringify(s),JSON.stringify(legacy),'legacy export does not mutate saved work');
   const full=T.pack({...s,checkpoints:[{reason:'gcf-demo-transition',snap:legacy}]});const restored=T.parse(JSON.stringify(full));assert.equal(restored.ok,true);assert.deepEqual(restored.state.checkpoints[0].snap.financing,legacy.financing);
   assert(zip.file(/\.docx$/).length);
   for(const entry of Object.values(zip.files).filter(f=>!f.dir&&/\.(json|txt|md|csv)$/.test(f.name)))assert(!(await entry.async('string')).includes('CW11_B_ONLY'),entry.name+' must exclude unrelated nested recovery data');
   assert.equal(restored.state.assessments.length,2,'full recovery intentionally preserves both assessments');
  }
  assert.equal(globalThis.__blockedRequests.length,0);
  console.log('GCF demo: server route/guide/shortlist enforcement, distinct GCF selection, unchanged legacy working-draft export, recovery transfer and freshness identity passed.');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
