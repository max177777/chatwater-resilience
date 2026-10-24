/* CW-01..05: independent PDF expectations, draft preservation, and downstream route gates. */
const assert = require('assert');
const JSZip = require('jszip');
const app = require('../server');
const engine = require('../engine/ecam-engine');
const V = require('../engine/assessment-validity');
const AV = require('../public/js/assessment-validity');
const CW = require('../public/js/cw-core');
const {suggestActions} = require('../engine/actions');
const {clone} = require('./helpers/fixtures');
const a = require('./fixtures/review/case-a.json')[0];
const b = require('./fixtures/review/case-b.json')[0];
const ac = require('./fixtures/review/case-a.context.json');
const bc = require('./fixtures/review/case-b.context.json');
const near = (v, expected, tolerance=1e-6) => assert.ok(Math.abs(v-expected)<tolerance, `${v} != ${expected}`);
const cases = [
 ['reversed dates', x=>x.General.AssessmentPeriodEnd='2024-01-01'],
 ['equal dates', x=>x.General.AssessmentPeriodEnd=x.General.AssessmentPeriodStart],
 ['impossible calendar date', x=>x.General.AssessmentPeriodStart='2025-02-30'],
 ['negative electricity', x=>x.Water.Distribution[0].wsd_nrg_cons=-100],
 ['30 service hours', x=>x.Water.Distribution[0].wsd_time_pre=30],
 ['120 percent target', x=>x.Water.Distribution[0].wsd_pmp_exff=120],
 ['impossible measured efficiency', x=>x.Water.Distribution[0].wsd_pmp_amps=1],
 ['missing enabled pump input', x=>delete x.Water.Distribution[0].wsd_pmp_amps],
 ['zero power factor', x=>x.Water.Distribution[0].wsd_pmp_pf=0],
 ['high power factor', x=>x.Water.Distribution[0].wsd_pmp_pf=1.1],
 ['billed above authorized', x=>x.Water.Distribution[0].wsd_bill_con=2200000],
 ['authorized above distributed', x=>x.Water.Distribution[0].wsd_auth_con=3000000],
 ['pumping above total electricity', x=>x.Water.Distribution[0].wsd_nrg_pump=950000],
 ['blank authorized', x=>x.Water.Distribution[0].wsd_auth_con=null],
 ['blank billed', x=>x.Water.Distribution[0].wsd_bill_con=null],
 ['malformed numeric input', x=>x.Water.Distribution[0].wsd_nrg_cons='1,200'],
 ['out of range option', x=>x.Water.Treatment[0].wst_treatment=500],
 ['missing primary input', x=>delete x.Water.Distribution[0].wsd_vol_dist],
];
(async()=>{
 console.log('Assessment validity and PDF cases');
 for(const [name,mutate] of cases) {
  const x=clone(a);mutate(x);const before=CW.canonical(x);const v=V.validate(x);
  assert.equal(v.valid,false,name);assert.equal(CW.canonical(x),before,`${name}: keep invalid draft unchanged`);
  assert.equal(V.calculate(x).validity.valid,false,name); // independent supported components may remain available
 }
 assert.equal(V.validate(engine.newAssessment('Indonesia')).valid,false,'empty assessment');
 const empty=engine.newAssessment('Indonesia');empty.Water.Abstraction.push(engine.newSubstage('wsa','Empty',0.677));
 assert.equal(V.validate(empty).valid,false,'constructor zeros with a grid default do not establish data');
 assert.equal(AV.state({origin:'new',s:{}},'s','v',0),'missing');
 assert.equal(AV.state(null,'s','v',0),'unconfirmed');
 assert.equal(AV.state({s:{s:{v:{o:'manual',v:0}}}},'s','v',0),'entered');
 assert.equal(AV.state({s:{s:{v:{v:0,availability:'not_applicable'}}}},'s','v',0),'not_applicable');
 const zero=clone(a);zero.Water.Distribution[0].wsd_bill_con=0;
 const zr=clone(ac.inputStatus);CW.setInputOrigin({[ac.meta.id]:zr},ac.meta.id,'wsd_0','wsd_bill_con','manual',0);
 assert.equal(V.validate(zero,{meta:ac.meta,inputStatus:zr}).valid,true,'legitimate entered zero remains valid');
 near(V.calculate(zero,0,{meta:ac.meta,inputStatus:zr}).water_balance[0].nrw_pct.value,100);
 assert.equal(CW.parseEcamFile('[{"General":{}}]').ok,false);
 const badOptions=clone(a);badOptions.Water.Abstraction[0].Configuration={Questions:'bad'};assert.equal(CW.parseEcamFile(JSON.stringify([badOptions])).ok,false);assert.equal(V.validate(badOptions).valid,false);
 const malformed=clone(a);malformed.Water.Abstraction=[null];assert.equal(CW.parseEcamFile(JSON.stringify([malformed])).ok,false);
 assert.equal(CW.parseEcamFile(JSON.stringify([a]).replace('900000','1e999')).ok,false,'nonfinite import rejected transactionally');
 const ar=V.calculate(a,0,ac),br=V.calculate(b,0,bc);
 assert.equal(ar.validity.valid,true);assert.equal(br.validity.valid,true);
 near(ar.totals.total,1218600);near(ar.energy_kwh,1800000);near(ar.period.days,365);
 near(ar.water_balance[0].nrw_pct.value,28.571428571428573);near(ar.water_balance[0].water_loss_pct.value,25);
 near(ar.water_balance[0].water_loss_m3_per_km.value,140000);near(ar.water_balance[0].nrw_m3_per_km.value,160000);
 assert.equal(br.substages.find(s=>s.prefix==='wwt').availability.wwt_biogas_usage.status,'not_applicable');
 const fuelView=CW.unitView(engine._ecam.Units,engine._ecam.Info,b,'wwt_vol_tslu');near(1200*fuelView.mult,1.2);
 near(br.totals.total,951308.5522112,0.001);near(br.energy_kwh,498000);
 const scenario=clone(b);scenario.Waste.Treatment[0].wwt_nrg_cons=393000;
 const sr=engine.calculateOne(scenario);near(br.totals.total-sr.totals.total,30465);near(sr.energy_kwh,453000);
 const ar4=engine.calculateOne(b,2);near(ar4.totals.total/1000,899.5,0.1);
 const altered=clone(a);altered.Water.Distribution[0].wsd_bill_con=1900000;
 near(V.calculate(altered).water_balance[0].water_loss_pct.value,25);
 const opts=suggestActions(engine.calculateOne(a),a,engine).options;
 const water=opts.find(o=>o.rule==='nrw_reduction');assert.match(water.title.en,/water loss/i);near(water.trigger.values[2].value,25);
 const otherOpts=suggestActions(engine.calculateOne(altered),altered,engine).options;
 near(otherOpts.find(o=>o.rule==='nrw_reduction').expected_kwh,water.expected_kwh);
 const split=clone(a);split.Water.Distribution[0].wsd_nrg_pump=850000;
 const pump=suggestActions(engine.calculateOne(split),split,engine).options.find(o=>o.rule==='pump_upgrade');
 near(pump.expected_kwh,302996.624548897,0.01);assert.match(pump.condition.en,/pump-only boundary has not been established/);
 assert.match(pump.provisional_warning.en,/Chimdi/);
 const sourceOptions=suggestActions(engine.calculateOne(a),a,engine).options;
 near(sourceOptions.find(o=>o.rule==='pump_upgrade').expected_kwh,267878.778934126,0.001);
 const server=app.listen(0);const base=`http://localhost:${server.address().port}`;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try {
  for(const [name,mutate] of cases) {
   const x=clone(a);mutate(x);
   for(const route of ['/api/actions','/api/actions/explain','/api/actions/alternatives','/api/plan','/api/proposal']) {
    const response=await post(route,{assessment:x,meta:ac.meta});assert.equal(response.status,422,`${name} ${route}`);
   }
   const response=await post('/api/export',{assessments:[x],assessmentMeta:[ac.meta],actionSet:{assessmentId:ac.meta.id,revision:CW.revision(x),gwpIndex:0}});assert.equal(response.status,422,`${name} ZIP`);
  }
  const chat=await (await post('/api/chat',{assessment:{...clone(a),General:{...a.General,AssessmentPeriodEnd:a.General.AssessmentPeriodStart}},meta:ac.meta,messages:[{role:'user',content:'Explain my results'}]})).json();
  assert.equal(chat.context.results.availability,'not_assessed');assert.equal(chat.context.actions,null);
  const validChat=await (await post('/api/chat',{assessment:a,...ac,messages:[{role:'user',content:'What are NRW and water loss?'}]})).json();
  near(validChat.context.results.water_balance[0].nrw_pct.value,28.571428571428573);near(validChat.context.results.water_balance[0].water_loss_pct.value,25);
  const acts=await (await post('/api/actions',{assessment:a,...ac})).json();assert.ok(acts.options.length);
  const selected=acts.options.filter(o=>o.rule==='pump_upgrade'),actionSet=acts.basis;
  const planResponse=await post('/api/plan',{assessment:a,...ac,actions:selected,actionSet,lang:'en'});assert.equal(planResponse.status,200,await planResponse.clone().text());
  const plan=await planResponse.json();assert.match(plan.summary,/28.57%/);assert.match(plan.summary,/water loss 25.00%/);
  const proposal=await (await post('/api/proposal',{assessment:a,...ac,actions:selected,actionSet,plan,route:'gcf-preliminary-v1',lang:'en'})).json();
  assert.ok(proposal.sections?.length);
  const state={assessments:[a],assessmentMeta:[ac.meta],inputStatus:{[ac.meta.id]:ac.inputStatus},selectedActions:selected,actionSet,plan,proposal,financing:{route:'gcf-preliminary-v1',conceptInputs:{}},lang:'en'};
  const exportResponse=await post('/api/export',state);assert.equal(exportResponse.status,200,await exportResponse.clone().text());
  const zip=await JSZip.loadAsync(Buffer.from(await exportResponse.arrayBuffer()));
  const result=JSON.parse(await zip.file('ecam/results.json').async('string'))[0];near(result.water_balance[0].nrw_pct.value,28.571428571428573);
  assert.ok(zip.file('ecam/availability-and-water-balance.json'));
  const companion=JSON.parse(await zip.file('ecam/application-metadata.json').async('string'));assert.deepStrictEqual(companion.state.inputStatus,state.inputStatus);
  const invalidDocAssessment=clone(a);invalidDocAssessment.General.AssessmentPeriodEnd=a.General.AssessmentPeriodStart;
  const invalidDoc={assessments:[invalidDocAssessment],assessmentMeta:[ac.meta],selectedActions:[],financing:{route:'general'},proposal:{sections:[],deps:CW.proposalDeps({assessmentId:ac.meta.id,assessment:invalidDocAssessment,gwpIndex:0,actions:[],plan:null,profile:null,supportRevision:V.calculate(invalidDocAssessment).supportRevision,financing:{route:'general'}})}};
  const blockedDoc=await post('/api/export/docx',invalidDoc);assert.equal(blockedDoc.status,422,await blockedDoc.clone().text());
  const doc=await post('/api/export/docx',state);assert.equal(doc.status,200);
  const text=await require('mammoth').extractRawText({buffer:Buffer.from(await doc.arrayBuffer())});assert.match(text.value,/28.57%/);
  const splitActs=await (await post('/api/actions',{assessment:split,meta:ac.meta})).json();
  const splitChosen=splitActs.options.filter(o=>o.rule==='pump_upgrade');
  const splitPlan=await (await post('/api/plan',{assessment:split,meta:ac.meta,actions:splitChosen,actionSet:splitActs.basis,lang:'en'})).json();
  assert.match(splitPlan.summary,/pump-only boundary has not been established/);
  console.log('  ok - invalid drafts and routes, explicit zeros, provenance, Cases A/B, independent water measures, split pump warning, AI-off Case A through Word/ZIP');
 } finally {server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
