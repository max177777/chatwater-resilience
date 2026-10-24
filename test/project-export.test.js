const assert=require('assert'),fs=require('fs'),crypto=require('crypto'),JSZip=require('jszip');
const app=require('../server'),C=require('../public/js/cw-core'),T=require('../public/js/project-transfer'),I=require('../engine/integrity'),V=require('../engine/assessment-validity');
const {workspace}=require('./helpers/export-projects');
const clone=x=>JSON.parse(JSON.stringify(x));
async function inspect(buffer,own,other){
 const zip=await JSZip.loadAsync(buffer),text=[];
 for(const [name,f]of Object.entries(zip.files))if(!f.dir){
  if(name.endsWith('.docx')){const doc=await JSZip.loadAsync(await f.async('nodebuffer'));for(const [n,x]of Object.entries(doc.files))if(!x.dir&&n.endsWith('.xml'))text.push(await x.async('string'));}
  else text.push(await f.async('string'));
 }
 for(const s of text){assert.ok(!s.includes(other.marker),'No foreign marker anywhere, including nested metadata/backups/Word');assert.ok(!s.includes(other.id),'No foreign assessment identity');}
 const native=JSON.parse(await zip.file('ecam/assessments-ecam-format.json').async('string'));assert.equal(native.length,1);assert.equal(native[0].General.Name,own.assessment.General.Name);
 const manifest=JSON.parse(await zip.file('manifest.json').async('string'));assert.equal(manifest.project.assessmentId,own.id);assert.equal(manifest.scope,'selected_project');assert.equal(manifest.review_status.package,'working_draft');assert.ok(manifest.omissions.some(x=>x.includes('checkpoints')));
 for(const item of manifest.contents)if(item.sha256)assert.equal(crypto.createHash('sha256').update(await zip.file(item.path).async('nodebuffer')).digest('hex'),item.sha256,item.path);
 assert.deepEqual(manifest.contents.map(x=>x.path).sort(),Object.keys(zip.files).filter(k=>!zip.files[k].dir).sort());
 const back=await zip.file('project/project-backup.json').async('string'),parsed=T.parse(back);assert.equal(parsed.kind,'project');assert.equal(parsed.state.assessments.length,1);assert.equal(parsed.state.assessmentMeta[0].id,own.id);
 assert.equal(parsed.state.gwpIndex,own.state.gwpIndex);assert.equal(parsed.state.plan.summary,own.state.plan.summary);assert.deepEqual(parsed.state.plan.deps,own.state.plan.deps,'dependencies never rebound');assert.equal(parsed.state.previous.plan.value.summary,own.state.previous.plan.value.summary);assert.equal(parsed.state.previous.proposal,undefined,'foreign prior document omitted');assert.deepEqual(parsed.state.checkpoints,[]);assert.equal(parsed.state.transferRecovery,undefined);assert.equal(parsed.state.chat,undefined);assert.equal(parsed.state.profiles,undefined);
 assert.equal(parsed.state.customActions.length,1);assert.ok(parsed.state.customActions.every(a=>a.assessmentId===own.id));assert.equal(I.exportContext(parsed.state,{requireProposal:true}).meta.id,own.id,'restored links and freshness remain valid');
 const side=await zip.file('ecam/application-metadata.json').async('string');assert.equal(T.parse(JSON.stringify(native),side).kind,'project');
 const result=JSON.parse(await zip.file('ecam/results.json').async('string'))[0],expected=V.calculate(own.assessment,own.state.gwpIndex,{meta:own.meta,inputStatus:own.status});assert.equal(result.totals.total,expected.totals.total,'equations unchanged');assert.equal(result.supportRevision,expected.supportRevision);
 const store=new Map([['original','unrelated existing workspace']]);const storage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)};assert.ok(C.writeSession(storage,'isolated',parsed.state).ok);assert.equal(C.loadSession(storage,'isolated').state.plan.summary,own.state.plan.summary);assert.equal(store.get('original'),'unrelated existing workspace');
 assert.ok(text.join('\n').includes(own.marker));assert.ok(text.join('\n').includes(own.marker+' limitation'),'source qualifications retained');return {zip,parsed,manifest};
}
async function run(){
 const server=app.listen(0),base=`http://localhost:${server.address().port}`,post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  for(const letter of ['A','B']){
   const {state,own,other}=workspace(letter),before=JSON.stringify(state),r=await post('/api/export',state);assert.equal(r.status,200,await r.clone().text());await inspect(Buffer.from(await r.arrayBuffer()),own,other);assert.equal(JSON.stringify(state),before,'no in-place mutation');
   const full=T.parse(JSON.stringify(T.pack(state)));assert.equal(full.kind,'project');assert.equal(full.state.assessments.length,2);assert.ok(JSON.stringify(full).includes(other.marker+' checkpoint'));assert.ok(JSON.stringify(full).includes(own.marker));
  }
  const {state}=workspace('A');
  for(const path of ['/api/export/','/api/EXPORT']){const r=await post(path,state);assert.equal(r.status,200,await r.clone().text());const {own,other}=workspace('A');await inspect(Buffer.from(await r.arrayBuffer()),own,other);}
  for(const mutate of [s=>{s.proposal.deps.assessmentId='cw11-b'},s=>{s.plan.summary+=' Changed.'},s=>{s.assessments[0].Water.Distribution[0].wsd_nrg_cons+=5},s=>{s.plan.tasks[0].action_key='cw11-b|custom|bad'},s=>{s.projectTransfer.ecam[0].General.Name+=' altered'}]){
   const bad=clone(state);mutate(bad);const r=await post('/api/export',bad);assert.equal(r.status,409,await r.text());
  }
  const unrelatedInvalid=clone(state);unrelatedInvalid.assessments[1].General.AssessmentPeriodEnd='bad';delete unrelatedInvalid.projectTransfer;assert.equal((await post('/api/export',unrelatedInvalid)).status,200,'unrelated invalid assessment neither leaks nor blocks selected valid project');
  assert.equal((await post('/api/export',{assessments:state.assessments,assessmentMeta:state.assessmentMeta})).status,409,'output ownership required; full backup remains the recovery route');
  const word=await post('/api/export/docx',state);assert.equal(word.status,200);const doc=await JSZip.loadAsync(Buffer.from(await word.arrayBuffer()));assert.ok(!(await doc.file('word/document.xml').async('string')).includes('CW11_B_ONLY'));
  for(const path of ['/api/export/docx/','/api/EXPORT/DOCX']){const r=await post(path,{...state,proposal:null});assert.equal(r.status,409,'route variants preserve proposal and scope validation');}
  const source=fs.readFileSync('public/js/i18n.js','utf8');for(const label of ['Save full workspace backup','Download selected project package','Simpan cadangan ruang kerja lengkap','Unduh paket proyek terpilih'])assert.ok(source.includes(label),label);
  assert.equal(globalThis.__blockedRequests?.length || 0,0);
  console.log('CW-11 selected project export: A/B deep archive and Word isolation, valid bound restore, full workspace preservation, current-screen mismatch, stale/mixed rejection, source qualifications, manifest digests and unchanged calculations passed.');
 }finally{server.close();}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1});
module.exports={inspect};
