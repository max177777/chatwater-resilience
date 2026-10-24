/* Shared editorial review contract. Screening is not claim verification or certification. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./cw-core'),require('./feedback-ui'));
 else root.DR=factory(root.CW,root.FU);
})(typeof self!=='undefined'?self:this,function(C,FU){
 const VERSION=1, list=x=>Array.isArray(x)?x:[], copy=x=>JSON.parse(JSON.stringify(x));
 const TEXT={en:{working_draft:'Working draft',reviewed:'Reviewed',outdated:'Outdated',
  meaning:'Reviewed means a person checked this content and its sources and claims. It is not scientific certification, funding eligibility or funder approval. Automated checks only screen for possible issues.',
  missing:'Complete the missing project information or placeholder.',empty:'Complete this section.',unreviewed:'Human review is required for this exact content and its dependencies.',
  incomplete:'Text may stop mid-sentence. Complete it before review.',failed:'Generation failed or used a fallback. Check and explain the completed replacement.',
  claims:'Funding or regulatory claim screening found an uncited sentence. Verify support or qualify/remove the claim.',figures:'Existing screening flagged quantitative claims or dropped information. Verify or correct them.',
  tags:'A citation tag has no matching source. Correct or remove it.',evidence:'Check source qualifications and claim support; citation tags and word overlap do not establish support.',
  calculation:'A selected action has a provisional calculation warning or unquantified benefit. Retain the caveat and explain its treatment.',
  invalid:'Calculation support is incomplete or invalid. Return to the assessment.',outdated_issue:'Source dependencies changed. Use the existing update workflow before export.',
  no_document:'No document has been created.',note:'Review note: explain how flagged claims, source qualifications and provisional warnings were treated.',
  confirm:'I reviewed {section}: content, completeness, sources and claim support, and the treatment of calculation/evidence warnings. This is not scientific or funder approval.',
  unresolved:'Unresolved issues',none:'No unresolved screening or human-review requirements.',stale_request:'The content changed. Review the current version again.',
  draft_download:'Download working draft',reviewed_download:'Download reviewed document',package:'Selected project package',word:'Word',association:'Content and dependency association',
  required_note:'A review note is required for flagged claims or warnings.',status:'Document status',review:'Human review',section:'Section',screening:'Screening warning'},
 id:{working_draft:'Draf kerja',reviewed:'Sudah ditinjau',outdated:'Kedaluwarsa',
  meaning:'Sudah ditinjau berarti seseorang memeriksa isi, sumber, dan klaim ini. Ini bukan sertifikasi ilmiah, kelayakan pendanaan, atau persetujuan pemberi dana. Pemeriksaan otomatis hanya menyaring potensi masalah.',
  missing:'Lengkapi informasi proyek atau isian yang belum lengkap.',empty:'Lengkapi bagian ini.',unreviewed:'Tinjauan manusia diperlukan untuk isi dan dependensi versi ini.',
  incomplete:'Teks mungkin terputus di tengah kalimat. Lengkapi sebelum ditinjau.',failed:'Pembuatan gagal atau memakai teks pengganti. Periksa dan jelaskan teks pengganti yang telah dilengkapi.',
  claims:'Penyaringan klaim pendanaan atau peraturan menemukan kalimat tanpa kutipan. Verifikasi dukungannya atau batasi/hapus klaim.',figures:'Penyaringan menandai klaim angka atau informasi yang hilang. Verifikasi atau perbaiki.',
  tags:'Tanda kutipan tidak memiliki sumber yang cocok. Perbaiki atau hapus.',evidence:'Periksa batasan sumber dan dukungan klaim; tanda kutipan dan kemiripan kata tidak membuktikan dukungan.',
  calculation:'Aksi terpilih memiliki peringatan perhitungan sementara atau manfaat yang belum dihitung. Pertahankan catatan batasannya dan jelaskan penanganannya.',
  invalid:'Dukungan perhitungan belum lengkap atau tidak valid. Kembali ke penilaian.',outdated_issue:'Dependensi sumber berubah. Perbarui melalui alur yang tersedia sebelum ekspor.',
  no_document:'Dokumen belum dibuat.',note:'Catatan tinjauan: jelaskan penanganan klaim, batasan sumber, dan peringatan sementara.',
  confirm:'Saya meninjau {section}: isi, kelengkapan, sumber dan dukungan klaim, serta penanganan peringatan perhitungan/bukti. Ini bukan persetujuan ilmiah atau pemberi dana.',
  unresolved:'Masalah belum terselesaikan',none:'Tidak ada persyaratan penyaringan atau tinjauan manusia yang belum dipenuhi.',stale_request:'Isi berubah. Tinjau kembali versi saat ini.',
  draft_download:'Unduh draf kerja',reviewed_download:'Unduh dokumen yang sudah ditinjau',package:'Paket proyek terpilih',word:'Word',association:'Kaitan isi dan dependensi',
  required_note:'Catatan tinjauan diperlukan untuk klaim atau peringatan yang ditandai.',status:'Status dokumen',review:'Tinjauan manusia',section:'Bagian',screening:'Peringatan penyaringan'}};
 const t=(key,lang='en')=>(TEXT[lang]||TEXT.en)[key]||key;
 function parts(doc,kind){
  if(!doc)return [];
  if(kind==='proposal')return list(doc.sections).map((s,i)=>({id:'section-'+i,title:s.title||s.key||String(i+1),text:String(s.text||''),value:s,ai:s.ai===true||doc.ai===true||s.quotes_plan_summary==='ai',failed:list(doc.ai_failed).some(f=>f.key===s.key),target:'review-proposal-section-'+i}));
  return [{id:'summary',title:doc.lang==='id'?'Ringkasan proyek':'Project summary',text:String(doc.summary||''),value:doc,ai:doc.ai===true,target:'plan-summary'},
   ...list(doc.concept?.areas).map((a,i)=>({id:'concept-'+i,title:a.title||String(i+1),text:String(a.text||''),value:a,ai:doc.concept.ai===true||a.status==='ai',failed:!!doc.concept.ai_failed,target:'review-plan-concept-'+i})),
   {id:'schedule',title:doc.lang==='id'?'Jadwal pelaksanaan':'Implementation schedule',text:list(doc.tasks).map(t=>[t.name,t.owner].join(' ')).join('\n'),value:{tasks:doc.tasks,total_weeks:doc.total_weeks},target:'review-plan-schedule'}];
 }
 const sources=(p,doc)=>p.value.sources||doc.concept?.sources||doc.sources||[];
 function payload(p,doc,kind,state){
  const value=copy(p.value);delete value.humanReview;delete value.reviewed;
  // Summary owns the document object; exclude sibling content and all legacy ticks.
  const content=p.id==='summary'?{summary:doc.summary,ai:doc.ai,sources:doc.sources,related:doc.related,evidence:doc.evidence}:value;
  return {version:VERSION,kind,id:p.id,content,title:doc.title||null,lang:doc.lang||null,deps:doc.deps||null,
   evidence:doc.concept?.evidence||doc.evidence||null,source:sources(p,doc),failure:p.failed||false,
   warnings:list(state.selectedActions).map(a=>({key:a.key,provisional_warning:a.provisional_warning,condition:a.condition,benefit_status:a.benefit_status,origin:a.origin}))};
 }
 function evaluate(state,ctx={}){
  const f=ctx.freshness||C.freshness({...state,assessments:list(state.assessments).map((a,i)=>({id:state.assessmentMeta?.[i]?.id,revision:C.revision(a),supportRevision:ctx.results?.find(r=>r.assessmentId===state.assessmentMeta?.[i]?.id)?.supportRevision})),customActions:C.customDefs(state.customActions,state.actionNotes)});
  const out={version:VERSION,documents:{},status:'working_draft',issues:[],scientificWarnings:list(state.selectedActions).filter(a=>a.provisional_warning).map(a=>({key:a.key,text:a.provisional_warning}))};
  for(const kind of ['plan','proposal']){
   const doc=state[kind];if(!doc)continue;
   const stale=[...list(f.actions),...list(f[kind]),...(kind==='proposal'?list(f.plan):[])];
   const d={status:'working_draft',association:null,sections:[],issues:[]};
   const add=(code,p,hard=true,detail='')=>{const issue={code,section:p?.id||null,title:p?.title||kind,target:p?.target||'review-'+kind,hard,detail};d.issues.push(issue);return issue;};
   if(stale.length)add('outdated_issue',null,true,[...new Set(stale)].join(', '));
   const result=list(ctx.results).find(r=>r.assessmentId===doc.deps?.assessmentId);
   if(result&&(result.validity?.valid===false||result.completeness?.complete===false))add('invalid',null);
   const ps=parts(doc,kind);if(!ps.length)add('empty',null);
   if(kind==='proposal'&&!String(doc.title||'').trim())add('missing',ps[0]);
   for(const p of ps){
    const before=d.issues.length,hash=C.fp(payload(p,doc,kind,state)),record=doc.humanReview?.version===VERSION?doc.humanReview.sections?.[p.id]:null;
    const reviewValid=!!(record&&record.version===VERSION&&record.association===hash&&record.confirmed===true&&record.sourceClaims===true&&record.warnings===true&&typeof record.at==='string'&&Number.isFinite(Date.parse(record.at)));
    if(!p.text.trim())add('empty',p);
    if(FU.review([{text:p.text,ai:p.ai,reviewed:true}]).placeholders)add('missing',p,true,FU.screeningDetails(p.text).placeholders);
    if(p.id==='schedule'&&list(doc.tasks).some(k=>!String(k.owner||'').trim()||!String(k.name||'').trim()||!Number.isFinite(k.weeks)||k.weeks<=0))add('missing',p);
    if(p.ai&&C.mayBeIncomplete(p.text))add('incomplete',p);
    const tags=[...p.text.matchAll(/\[S(\d+)\]/g)].map(m=>'S'+m[1]);
    if(tags.some(tag=>!sources(p,doc).some(s=>s.id===tag||s.tag===tag)))add('tags',p);
    const warnings=[];
    if(p.failed)warnings.push('failed');
    if(FU.review([{text:p.text,ai:true,reviewed:true}]).uncited)warnings.push('claims');
    if(p.value.checks?.unsupported_figures?.length||p.value.checks?.placeholders_dropped)warnings.push('figures');
    const ev=p.value.evidence||doc.concept?.evidence||doc.evidence;
    if(sources(p,doc).length||tags.length||ev?.unknown_tags?.length||ev?.word_overlap?.some(w=>w.status==='low_overlap'))warnings.push('evidence');
    if(list(state.selectedActions).some(a=>a.provisional_warning||C.isCustom(a)))warnings.push('calculation');
    const note=typeof record?.note==='string'?record.note.trim():'';
    for(const w of warnings)if(!reviewValid||!note)add(w,p,false,w==='claims'?FU.screeningDetails(p.text).claims:'');
    if(!reviewValid)add('unreviewed',p,false);
    const issues=d.issues.slice(before),hard=issues.some(x=>x.hard);
    d.sections.push({id:p.id,title:p.title,target:p.target,association:hash,status:hard||!reviewValid||(warnings.length&&!note)?'working_draft':'reviewed',warnings,issues,canReview:!hard&&!stale.length,note:reviewValid?note:'',review:reviewValid?copy(record):null});
   }
   d.association=C.fp({version:VERSION,kind,deps:doc.deps,sections:d.sections.map(s=>[s.id,s.association])});
   d.status=stale.length?'outdated':!d.issues.length&&d.sections.every(s=>s.status==='reviewed')?'reviewed':'working_draft';
   out.documents[kind]=d;out.issues.push(...d.issues.map(i=>({...i,document:kind})));
  }
  const ds=Object.values(out.documents);out.status=ds.some(d=>d.status==='outdated')?'outdated':ds.length&&ds.every(d=>d.status==='reviewed')?'reviewed':'working_draft';
  return out;
 }
 function confirm(state,kind,id,association,{note='',checked=true}={},ctx={}){
  const d=evaluate(state,ctx).documents[kind],part=d?.sections.find(s=>s.id===id);
  if(!part||part.association!==association||!part.canReview||ctx.pending)throw new Error('stale_request');
  const doc=state[kind];doc.humanReview=doc.humanReview||{version:VERSION,sections:{}};
  if(!checked){delete doc.humanReview.sections[id];return;}
  if(part.warnings.length&&!note.trim())throw new Error('required_note');
  doc.humanReview={version:VERSION,sections:{...doc.humanReview.sections,[id]:{version:VERSION,association,confirmed:true,sourceClaims:true,warnings:true,note:note.trim(),at:new Date().toISOString()}}};
 }
 function clear(doc,id){
  if(!doc)return;delete doc.reviewed;
  if(id){
   const note=doc.humanReview?.sections?.[id]?.note;
   if(note&&doc.reviewNotes?.[id]===undefined)doc.reviewNotes={...doc.reviewNotes,[id]:note};
   if(doc.humanReview?.sections)delete doc.humanReview.sections[id];
  }else delete doc.humanReview;
 }
 return {VERSION,TEXT,t,parts,evaluate,confirm,clear};
});
