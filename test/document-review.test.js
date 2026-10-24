const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),JSZip=require('jszip');
const D=require('../public/js/document-review'),R=require('../engine/document-review'),S=require('../engine/project-export'),C=require('../public/js/cw-core'),T=require('../public/js/project-transfer'),V=require('../engine/assessment-validity'),{workspace}=require('./helpers/export-projects'),app=require('../server');
const clone=x=>JSON.parse(JSON.stringify(x));
const seed=()=>S.select(workspace('A').state);
function attest(s){for(const k of ['plan','proposal'])for(const p of R.evaluate(s).documents[k].sections)D.confirm(s,k,p.id,p.association,{note:'Synthetic human review: checked sources and claims; provisional scientific caveats retained, no approval claimed.'});return s;}
function browserReport(s){const r=V.calculate(s.assessments[0],s.gwpIndex,{meta:s.assessmentMeta[0],inputStatus:s.inputStatus[s.assessmentMeta[0].id]});return D.evaluate(s,{results:[{...r,assessmentId:s.assessmentMeta[0].id}]});}
async function run(){
 const server=app.listen(0),base='http://localhost:'+server.address().port,post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,projectTransfer:T.pack(body)})});
 try{
  const s=seed();let r=R.evaluate(s);assert.equal(r.status,'working_draft');assert.deepEqual(browserReport(s),r,'same browser/server evaluator');
  s.plan.reviewed=true;s.proposal.sections[0].reviewed=true;assert.equal(R.evaluate(s).status,'working_draft','legacy ticks do not count');
  s.proposal.sections[0].text+=' [To be completed: cost evidence]';
  let res=await post('/api/export',{...s,exportMode:'reviewed'});assert.equal(res.status,409);
  res=await post('/api/export',{...s,exportMode:'working_draft'});assert.equal(res.status,200);let zip=await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));let report=JSON.parse(await zip.file('document-review.json').async('string'));assert(report.issues.some(i=>i.code==='missing'));assert.equal(report.export_status,'working_draft');
  const doc=await JSZip.loadAsync(await zip.file('proposal.docx').async('nodebuffer'));assert((await doc.file('word/document.xml').async('string')).includes('WORKING DRAFT'));assert((await doc.file('word/footer1.xml').async('string')).includes('Working draft'));
  const p=R.evaluate(s).documents.proposal.sections[0];assert.throws(()=>D.confirm(s,'proposal',p.id,p.association,{note:'checked'}),/stale_request/);
  s.proposal.sections[0].text=s.proposal.sections[0].text.replace(' [To be completed: cost evidence]','');
  const b=R.evaluate(s).documents.proposal.sections[0];assert.throws(()=>D.confirm(s,'proposal',b.id,b.association),/required_note/);
  attest(s);r=R.evaluate(s);assert.equal(r.status,'reviewed');assert.deepEqual(browserReport(s),r);
  const ctx=vm.createContext({self:{},CW:C,FU:require('../public/js/feedback-ui')});ctx.self=ctx;vm.runInContext(fs.readFileSync('public/js/document-review.js','utf8'),ctx);assert.equal(JSON.stringify(ctx.DR.evaluate(s)),JSON.stringify(D.evaluate(s)),'UMD browser build agrees');
  s.exportMode='reviewed';res=await post('/api/export',s);assert.equal(res.status,200,await res.clone().text());zip=await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const manifest=JSON.parse(await zip.file('manifest.json').async('string'));assert.equal(manifest.review_status.package,'reviewed');assert.equal(manifest.review_status.evaluation.status,'reviewed');assert.equal(manifest.review_status.evaluation.documents.proposal.association,r.documents.proposal.association);
  report=JSON.parse(await zip.file('document-review.json').async('string'));assert.deepEqual(report.issues,[]);const restored=T.parse(await zip.file('project/project-backup.json').async('string'));assert.equal(R.evaluate(restored.state).status,'reviewed','valid review associations survive selected restore');
  for(const f of Object.values(zip.files).filter(f=>!f.dir&&!f.name.endsWith('.docx')))assert(!(await f.async('string')).includes('CW11_B_ONLY'));
  res=await post('/api/export/docx',s);assert.equal(res.status,200);const reviewedWord=await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));assert((await reviewedWord.file('word/document.xml').async('string')).includes('REVIEWED'));
  fs.mkdirSync('.cache/cw10',{recursive:true});fs.writeFileSync('.cache/cw10/reviewed.docx',await reviewedWord.generateAsync({type:'nodebuffer'}));
  for(const mutate of [x=>{x.proposal.sections[0].text+=' Changed.'},x=>{x.proposal.sections[0].sources[0].title+=' changed'},x=>{x.proposal.lang='id'},x=>{x.proposal.humanReview.sections['section-0'].association='forged'},x=>{x.proposal.humanReview.sections['section-0'].sourceClaims=false},x=>{x.proposal.sections[0].text='Funding is approved.';x.proposal.sections[0].reviewed=true}]){const x=clone(s);mutate(x);assert.equal(R.evaluate(x).documents.proposal.status,'working_draft');assert.equal((await post('/api/export',{...x,exportMode:'reviewed'})).status,409);}
  const edit=clone(s),old=R.evaluate(edit).documents.proposal.sections[0];edit.proposal.sections[0].text+=' newer';assert.throws(()=>D.confirm(edit,'proposal',old.id,old.association,{note:'checked'}),/stale_request/);
  assert.throws(()=>D.confirm(s,'proposal',b.id,b.association,{note:'checked'},{pending:true}),/stale_request/);
  const ui=clone(s);ui.lang='id';assert.equal(R.evaluate(ui).status,'reviewed','interface language is not output language');
  const stale=clone(s);stale.assessments[0].Water.Distribution[0].wsd_nrg_cons+=5;assert.equal(R.evaluate(stale).status,'outdated');for(const exportMode of ['working_draft','reviewed'])assert.equal((await post('/api/export',{...stale,exportMode})).status,409,'no draft bypass');
  const mixed=clone(s);mixed.proposal.deps.assessmentId='cw11-b';assert.equal((await post('/api/export',{...mixed,exportMode:'working_draft'})).status,409);
  const tags=seed();tags.proposal.sections[0].text+=' [S999]';assert(R.evaluate(tags).documents.proposal.issues.some(i=>i.code==='tags'));
  const smuggled=clone(s);smuggled.proposal.humanReview.sections['section-999']={note:'CW11_B_ONLY hidden review'};smuggled.proposal.reviewNotes={'section-999':'CW11_B_ONLY hidden note'};const scoped=S.select(smuggled);assert(!JSON.stringify(scoped).includes('CW11_B_ONLY'));assert.equal(scoped.documentReview.status,'reviewed');
  const warning=seed();warning.selectedActions[0].provisional_warning={en:'Synthetic provisional scientific boundary; no approval.',id:'Batas ilmiah sementara; belum disetujui.'};assert.equal(R.evaluate(warning).scientificWarnings[0].text.en,'Synthetic provisional scientific boundary; no approval.');
  const failed=seed();failed.proposal.ai_failed=[{key:'summary',title:'Summary'}];assert(R.evaluate(failed).documents.proposal.issues.some(i=>i.code==='failed'));attest(failed);assert.equal(R.evaluate(failed).status,'reviewed','manual acceptance of completed fallback is explicit, noted, and keeps failure origin');
  const incomplete=seed();incomplete.proposal.sections[0].ai=true;incomplete.proposal.sections[0].text='The project would improve the';assert(R.evaluate(incomplete).documents.proposal.issues.some(i=>i.code==='incomplete'));
  const saved=clone(s);C.commitVersion(saved,'proposal',clone(seed().proposal));assert.equal(R.evaluate(saved).documents.proposal.status,'working_draft');C.restoreVersion(saved,'proposal');assert.equal(R.evaluate(saved).status,'reviewed');saved.assessments[0].Water.Distribution[0].wsd_nrg_cons+=2;assert.equal(R.evaluate(saved).status,'outdated');
  const regen=clone(s);await C.regenerate(regen,'proposal',async()=>clone(s.proposal));assert.equal(R.evaluate(regen).documents.proposal.status,'working_draft','replacement clears review even for identical text');
  const language=clone(s);await C.regenerate(language,'proposal',async()=>({...clone(s.proposal),lang:'id'}));assert.equal(R.evaluate(language).documents.proposal.status,'working_draft');
  const race=clone(s);let complete;const pending=C.regenerate(race,'proposal',()=>new Promise(resolve=>complete=resolve));race.proposal.sections[0].text='Newer human text.';complete(clone(s.proposal));await assert.rejects(pending,/changed while generation/);assert.equal(race.proposal.sections[0].text,'Newer human text.');
  const noPending=clone(s),section=R.evaluate(noPending).documents.proposal.sections[0];D.clear(noPending.proposal,section.id);assert.equal(noPending.proposal.reviewNotes[section.id],section.review.note,'previous review note stays recoverable as a draft');assert.equal(R.evaluate(noPending).documents.plan.status,'reviewed');assert.equal(R.evaluate(noPending).documents.proposal.status,'working_draft');
  const draft=seed();draft.proposal.sections[0].text+=' [To be completed: evidence]';res=await post('/api/export/docx',draft);fs.writeFileSync('.cache/cw10/working-draft.docx',Buffer.from(await res.arrayBuffer()));
  assert.equal(globalThis.__blockedRequests.length,0);
  console.log('CW-10: shared states; bound human review; legacy/forged/stale metadata rejection; draft/reviewed Word+ZIP; edits, regeneration, language, upstream and version restore; races; selected scope passed.');
 }finally{server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1});
