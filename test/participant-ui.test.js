/* Render actual form helpers in an isolated VM; this is not browser/layout verification. */
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const a=require('../public/samples/complete-example.json')[0],C=require('../public/js/cw-core'),{meta}=require('./helpers/fixtures');
const m=meta(a,'demo'),Demo=require('../public/js/demo-example'),V=require('../engine/assessment-validity');
const ctx=vm.createContext({console});ctx.self=ctx;
for(const name of ['questions','global','info','structure','countries','gwp_reports','constants','tables','units','estimations','exceptions','normalization','formulas','filters','benchmarks','references','ipcc_categories'])vm.runInContext(fs.readFileSync(`vendor/ecam/backend/${name}.js`,'utf8'),ctx);
vm.runInContext(fs.readFileSync('public/js/i18n.js','utf8')+';this.uiStrings=UI',ctx);
ctx.CW=C;ctx.AV=require('../public/js/assessment-validity');ctx.RSData=require('../public/js/result-status');ctx.sample=a;
vm.runInContext('Global=Ecam.from(sample);this.sc=Global',ctx);
ctx.window={App:null};
vm.runInContext(fs.readFileSync('public/js/ecam-form.js','utf8').replace('return { renderEntry,','return { summaryHtml, generalPanel, inputRow, waterBalanceHtml, kpis, outputsTable, renderEntry,')+';this.form=CWForm',ctx);
for(const lang of ['en','id']){
 const d=Demo.build(a,m,lang),result=V.calculate(a,0,{meta:m,inputStatus:d.record});
 const idOf=o=>o===ctx.sc?'demo':m.substages.wsd[0];
 ctx.window.App={state:{lang,profile:d.profile,gwpIndex:0,inputStatus:{demo:d.record}},t:k=>ctx.uiStrings[lang][k]||k,tE:k=>require('../public/i18n/ecam.id.json')['#'+k]||k,esc:s=>String(s??''),rich:s=>String(s??''),fmt:String,idOf,inputSid:()=>m.substages.wsd[0],isEstimate:()=>false,tEOriginal:()=>false,reviewedResults:()=>result,assessmentValidity:()=>({valid:true,issues:[]})};
 assert.match(ctx.form.generalPanel(),lang==='id'?/Konfirmasi faktor/:/Confirm factor/);
 assert(!ctx.form.generalPanel().includes(' · confirmed'));
 assert(ctx.form.summaryHtml().includes(ctx.uiStrings[lang].incomplete_total));
 assert(ctx.form.waterBalanceHtml().includes('NRW'));
 const sc=ctx.sc.Water.Distribution[0];const html=ctx.form.inputRow('wsd_nrg_cons',sc,false);
 assert.match(html,lang==='id'?/Nilai impor/:/Imported value/);
 assert(!html.includes('legacy/imported value'));
 assert.match(ctx.form.kpis(),lang==='id'?/Inventaris proses terpilih/:/Inventory for selected processes/);
}
console.log('Participant UI helper rendering: bilingual factor, provenance, KPI and water-balance paths passed; no browser layout claim');
