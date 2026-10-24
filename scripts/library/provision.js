#!/usr/bin/env node
/* Provision only a hash-pinned approved artifact named by a protected plaintext descriptor.
 * Never print its URL, headers or credentials. No environment variable or Downloads fallback. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{build}=require('./release');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function provision({descriptor='/etc/secrets/chatwater-library-release.json',output=path.resolve('knowledge/library'),fetchClient=globalThis.fetch,buildClient=build}={}){
 const d=JSON.parse(fs.readFileSync(descriptor,'utf8'));
 if(d.release!=='gcf-guidance-v1'||!/^([a-f0-9]{64})$/.test(d.sha256||''))throw new Error('Invalid protected library release descriptor');
 const url=new URL(d.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Approved artifact requires HTTPS without URL credentials');
 if(d.headers&&(!Object.values(d.headers).every(v=>typeof v==='string')||Array.isArray(d.headers)))throw new Error('Invalid artifact request headers');
 if(fs.existsSync(path.join(output,'manifest.json')))throw new Error('Library output already exists; provision into a fresh build');
 const cache=path.resolve('.cache/library-provision');fs.mkdirSync(cache,{recursive:true});const file=path.join(cache,d.sha256+'.zip');
 if(!fs.existsSync(file)||hash(fs.readFileSync(file))!==d.sha256){
  let response;try{response=await fetchClient(url.href,{headers:d.headers||{},redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw new Error('Approved library artifact unavailable; check protected provisioning access');}
  if(!response.ok)throw new Error('Approved library artifact download failed (HTTP '+response.status+')');
  if(Number(response.headers.get('content-length'))>32*1024*1024)throw new Error('Approved library artifact exceeds size limit');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>32*1024*1024||hash(bytes)!==d.sha256)throw new Error('Approved library artifact size or digest mismatch');fs.writeFileSync(file,bytes,{mode:0o600});
 }
 return buildClient({bundle:file,output});
}
module.exports={provision};
if(require.main===module)provision().catch(()=>{console.error('Library provisioning failed. Verify the protected descriptor, approved artifact, source hashes, approvals and release lock. No deployment library was accepted.');process.exitCode=1;});
