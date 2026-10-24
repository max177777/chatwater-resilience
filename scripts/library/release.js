#!/usr/bin/env node
/* Approved, offline, reproducible release builder. No Downloads default, network, OCR or model calls. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),JSZip=require('jszip'),pdf=require('pdf-parse/lib/pdf-parse');
const {chunk,redact}=require('./build'),library=require('../../engine/library');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const DEFAULT_MANIFEST=path.join(__dirname,'releases/gcf-guidance-v1.json'),DEFAULT_LOCK=path.join(__dirname,'releases/gcf-guidance-v1.lock.json');
async function build({manifest=DEFAULT_MANIFEST,lock=DEFAULT_LOCK,inputDir,bundle,output,audit=false,writeLock=false,parsePdf=pdf}={}){
 const cfg=JSON.parse(fs.readFileSync(manifest)),root=path.resolve(__dirname,'../..');
 if(!output)throw new Error('Explicit --output is required');output=path.resolve(output);
 if(audit&&!output.startsWith(path.join(root,'.cache')+path.sep))throw new Error('Unapproved audit builds must stay in the ignored repository .cache directory');
 if(!inputDir&&!bundle)throw new Error('Provide an explicit approved --input-dir or --bundle; there is no Downloads default');
 if(inputDir&&bundle)throw new Error('Choose one input location');
 const zip=bundle?await JSZip.loadAsync(fs.readFileSync(bundle)):null;
 const read=async name=>{if(path.basename(name)!==name)throw new Error('Only root bundle filenames are supported');if(zip){const f=zip.file(name);if(!f)throw new Error('Missing approved bundle entry: '+name);return f.async('nodebuffer');}return fs.readFileSync(path.join(inputDir,name));};
 let approvals;if(!audit){approvals=JSON.parse((await read('approvals.json')).toString());if(approvals.release!==cfg.release)throw new Error('Approval release mismatch');}
 const sources=[],passages={};
 for(const spec of cfg.sources){
  const bytes=await read(spec.file);if(sha(bytes)!==spec.sha256)throw new Error('Source hash mismatch: '+spec.id);
  if(!audit&&!approvals.approved?.some(a=>a.sha256===spec.sha256&&a.purpose==='server-indexing'&&a.distribution==='approved'&&a.approved_by&&a.record))throw new Error('Server-indexing distribution approval missing: '+spec.id);
  const pages=[];const parsed=await parsePdf(bytes,{pagerender:async page=>{const t=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});const text=t.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim();pages.push({page:page.pageNumber,text});return text;}});
  pages.sort((a,b)=>a.page-b.page);const front=pages.slice(0,3).map(x=>x.text).join(' ');
  if(parsed.numpages!==spec.pages||!spec.identity_terms.every(t=>front.includes(t)))throw new Error('Document identity mismatch: '+spec.id);
  const list=[];for(const p of pages)for(const [i,text]of chunk(p.text).entries()){const stats={redactions:0};const clean=redact(text,stats);if(clean.length>=60)list.push({id:spec.id+'#p'+p.page+'-'+(i+1),source:spec.id,locator:{page:p.page},heading:'',text:clean,language:spec.language});}
  if(!list.length)throw new Error('No extractable passages: '+spec.id);
  passages[spec.id]=list;const {file,identity_terms,pages:count,...meta}=spec;sources.push({...meta,status:'indexed',relationships:[],family:spec.id,urls:[{url:spec.url,status:'exact link inspected locally; source version pinned by SHA-256'}],extraction:{quality:spec.sector==='sanitation'?'fair':'good',method:'pdf-parse pinned by package-lock; text layer; no OCR',unit_type:'page',units:count,passages:list.length,notes:spec.sector==='sanitation'?['Source text layer contains malformed ligatures; consult original page for evidence review.']:[]}});
 }
 // Validate all inputs before writing, and never clean an existing output directory.
 if(fs.existsSync(path.join(output,'manifest.json')))throw new Error('Output already contains a manifest; use a fresh release directory');
 fs.mkdirSync(path.join(output,'passages'),{recursive:true});for(const s of sources)fs.writeFileSync(path.join(output,'passages',s.id+'.json'),JSON.stringify(passages[s.id],null,1)+'\n');
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({schema:1,release:cfg.release,generated_by:'scripts/library/release.js',source_manifest_sha256:sha(fs.readFileSync(manifest)),sources},null,1)+'\n');
 const summary=library.load(output,{verifyRelease:false});if(!summary.loaded||summary.sources.filter(s=>s.status==='indexed').length!==cfg.sources.length)throw new Error('Library load/count validation failed');
 for(const q of cfg.retrieval_checks){const r=library.retrieve(q.query,{sources:[q.source]});if(r.status!=='found'||!r.passages.some(p=>p.sourceId===q.source))throw new Error('Known retrieval check failed: '+q.query);}
 const result={schema:1,release:cfg.release,build_id:summary.build_id,sources:cfg.sources.length,passages:summary.passages,source_manifest_sha256:sha(fs.readFileSync(manifest)),retrieval_checks:cfg.retrieval_checks};
 if(writeLock){if(!audit)throw new Error('Lock creation requires an explicit local audit');fs.writeFileSync(lock,JSON.stringify(result,null,2)+'\n');}
 else{const expected=JSON.parse(fs.readFileSync(lock));if(JSON.stringify(result)!==JSON.stringify(expected))throw new Error('Release build ID/count/manifest lock mismatch');}
 console.log(JSON.stringify({...result,approval:audit?'AUDIT ONLY — not approved for deployment':'validated for server indexing'}));return result;
}
module.exports={build};
if(require.main===module){const a=process.argv.slice(2),arg=k=>a.includes(k)?a[a.indexOf(k)+1]:undefined;build({manifest:arg('--manifest'),lock:arg('--lock'),inputDir:arg('--input-dir'),bundle:arg('--bundle'),output:arg('--output'),audit:a.includes('--audit'),writeLock:a.includes('--write-lock')}).catch(e=>{console.error('Library release build failed: '+e.message);process.exitCode=1;});}
