/* Versioned preliminary concept contract. No scientific calculations or eligibility rules. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PC=factory();})(typeof self!=='undefined'?self:this,function(){
 const ROUTE='gcf-preliminary-v1',VERSION=1,SECTIONS=['summary','rationale','objectives','benefits','implementation','budget','risks','next_steps'];
 const FIELDS=[
  ['projectTitle','summary','required','Project title','Judul proyek'],
  ['location','summary','required','Country and project location','Negara dan lokasi proyek'],
  ['organization','implementation','required','Utility or implementing organization','Utilitas atau organisasi pelaksana'],
  ['objective','objectives','required','Project objective and intended service improvement','Tujuan proyek dan perbaikan layanan yang dituju'],
  ['climateProblem','rationale','required','Climate problem and supporting evidence','Masalah iklim dan bukti pendukung'],
  ['investmentNeed','rationale','required','Reason investment is needed','Alasan kebutuhan investasi'],
  ['beneficiaries','benefits','required','Intended beneficiary group or service area (not an assumed count)','Kelompok penerima manfaat atau area layanan (bukan jumlah asumsi)'],
  ['purpose','rationale','required','Climate purpose: mitigation, adaptation, or both','Tujuan iklim: mitigasi, adaptasi, atau keduanya'],
  ['adaptationEvidence','rationale','conditional','Climate hazards and vulnerability evidence (for adaptation)','Bukti bahaya iklim dan kerentanan (untuk adaptasi)'],
  ['duration','implementation','next_stage','Proposed duration, if known','Usulan durasi, jika diketahui'],
  ['totalCost','budget','next_stage','Estimated investment and currency, if known','Perkiraan investasi dan mata uang, jika diketahui'],
  ['financingSource','budget','optional','Potential financing source (unconfirmed)','Calon sumber pendanaan (belum dikonfirmasi)'],
  ['partners','implementation','optional','Proposed partners and responsibility confirmations','Calon mitra dan konfirmasi tanggung jawab'],
  ['assumptions','next_steps','optional','Explicit user assumptions and their basis','Asumsi pengguna secara eksplisit dan dasarnya'],
 ].map(([key,section,requirement,en,id])=>({key,section,requirement,label:{en,id}}));
 const active=(f,i)=>f.requirement!=='conditional'||['adaptation','both'].includes(i?.purpose);
 function clean(value={},actions=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid concept inputs');
  const keys=new Set(FIELDS.map(f=>f.key));const out={};
  for(const [k,v]of Object.entries(value)){if(k==='actionSectors')continue;if(!keys.has(k)||typeof v!=='string'||v.length>4000)throw new Error('Invalid concept input: '+k);out[k]=v;}
  if(out.purpose&&!['mitigation','adaptation','both','unknown'].includes(out.purpose))throw new Error('Invalid climate purpose');
  if(value.actionSectors){if(typeof value.actionSectors!=='object'||Array.isArray(value.actionSectors))throw new Error('Invalid action classifications');out.actionSectors={};for(const [k,v]of Object.entries(value.actionSectors)){if(!actions.some(a=>a.key===k)||!['water','sanitation','mixed','unknown'].includes(v))throw new Error('Invalid action classification');out.actionSectors[k]=v;}}
  return out;
 }
 const known=v=>typeof v==='string'&&v.trim()&&!/^(unknown|not known|tidak diketahui)$/i.test(v.trim());
 function scope(actions,meta,inputs={}){
  const sectors=new Set(),uncertain=[],classifications=[];
  for(const a of actions||[]){if(a.rule==='baseline')continue;let prefixes=[];
   if(a.location?.at==='substage'&&meta?.substages?.[a.location.prefix]?.includes(a.location.sid))prefixes=[a.location.prefix];
   else if(a.substage?.prefix&&meta?.substages?.[a.substage.prefix]?.includes(String(a.key).split('|')[2]))prefixes=[a.substage.prefix];
   else if(a.rule==='nrw_reduction')prefixes=['wsd'];
   else if(a.rule==='solar_pv')prefixes=Object.entries(meta?.substages||{}).filter(([,ids])=>ids.length).map(([p])=>p);
   let found=[...new Set(prefixes.map(p=>p.startsWith('ws')?'water':p.startsWith('ww')?'sanitation':null).filter(Boolean))];
   const explicit=inputs.actionSectors?.[a.key];let origin='action_location';
   if(!found.length&&explicit&&explicit!=='unknown'){found=explicit==='mixed'?['water','sanitation']:[explicit];origin='user_classification';}
   if(!found.length||explicit&&explicit!=='unknown'&&found.length===1&&explicit!==found[0])uncertain.push({key:a.key,title:a.title||a.id,reason:'classification_required'});
   found.forEach(x=>sectors.add(x));classifications.push({key:a.key,sectors:found,origin});
  }
  return {sectors:[...sectors].sort(),uncertain,classifications};
 }
 // Generation policy only: never migrate or relabel saved documents on load.
 function demoSupported(f){return f?.route===ROUTE&&(!f.pathways||Array.isArray(f.pathways)&&f.pathways.every(id=>id==='gcf'));}
 function demoFinancing(f={},actions=[]){return {route:ROUTE,pathways:['gcf'],conceptInputs:f.route===ROUTE?clean(f.conceptInputs||{},actions):{}};}
 return {ROUTE,VERSION,SECTIONS,FIELDS,active,clean,known,scope,demoSupported,demoFinancing};
});
