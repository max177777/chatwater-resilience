/* Versioned association envelope around the app's existing saved-session data.
 * The ECAM array remains native. Checksums detect association mistakes, not malicious tampering.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./cw-core'));else root.CWProject=factory(root.CW);})(typeof self!=='undefined'?self:this,function(CW){
  const VERSION=1, ECAM='3.0.1', clone=x=>JSON.parse(JSON.stringify(x));
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const safeTree=x=>typeof x==='number'?Number.isFinite(x):x&&typeof x==='object'?Object.entries(x).every(([k,v])=>!['__proto__','prototype','constructor'].includes(k)&&safeTree(v)):true;
  function bindings(assessments,metas) {
    return assessments.map((a,i)=>({assessmentId:metas[i]?.id,revision:CW.revision(a),dataDigest:CW.fp(a),metaDigest:CW.fp(metas[i]),ecamVersion:a.General.version || ECAM}));
  }
  function metadataValid(assessments,metas) {
    const ids=[];
    if(!Array.isArray(metas)||metas.length!==assessments.length)return false;
    const id=x=>typeof x==='string'&&/^[\w-]{1,100}$/.test(x);
    for(let i=0;i<metas.length;i++) {
      const m=metas[i];if(!object(m)||!id(m.id)||!object(m.substages))return false;ids.push(m.id);
      const subIds=[];for(const [p,lv,sl] of CW.STAGE_KEYS) {const list=m.substages[p];if(!Array.isArray(list)||list.length!==assessments[i][lv][sl].length||!list.every(id))return false;subIds.push(...list);}if(new Set(subIds).size!==subIds.length)return false;
    }
    return new Set(ids).size===ids.length;
  }
  function companion(state) {
    const s=clone(state), assessments=s.assessments;
    if(!CW.parseEcamFile(JSON.stringify(assessments)).ok||!metadataValid(assessments,s.assessmentMeta))throw new Error('Project assessment identities are malformed.');
    delete s.assessments;delete s.results;delete s.projectTransfer;s.schema=s.schema || CW.SCHEMA;s.gwpIndex=s.gwpIndex ?? 0;
    return {format:'chatwater-companion',version:VERSION,ecamVersion:ECAM,bindings:bindings(assessments,s.assessmentMeta),stateDigest:CW.fp(s),state:s};
  }
  function pack(state){return {format:'chatwater-project',version:VERSION,ecam:clone(state.assessments),companion:companion(state)};}
  function unconfirmed(assessments,warning,recovery) {
    return {ok:true,kind:'unconfirmed',assessments,warning,recovery:recovery || null};
  }
  function parse(text,companionText) {
    let data, side;
    try {data=JSON.parse(text);side=companionText?JSON.parse(companionText):null;}catch{return {ok:false,error:'Invalid JSON; nothing imported.'};}
    if(!safeTree(data)||!safeTree(side))return {ok:false,error:'Malformed project values; nothing imported.'};
    if(data?.format==='chatwater-project') {
      if(data.version!==VERSION)return {ok:false,error:'Unsupported project transfer version.'};
      side=data.companion;data=data.ecam;
    } else if(object(data)&&Array.isArray(data.assessments)) {
      const legacy=data;data=legacy.assessments;side=null;
      const native=CW.parseEcamFile(JSON.stringify(data));
      return native.ok?unconfirmed(native.assessments,'Legacy session has no validated data binding. Imported values are unconfirmed; original edited documents remain in recovery.',legacy):{ok:false,error:'Malformed legacy project.'};
    }
    const native=CW.parseEcamFile(JSON.stringify(data));
    if(!native.ok)return {ok:false,error:'Expected native ECAM data or a complete project backup. A companion alone is not an assessment.'};
    const a=native.assessments;
    if(!side)return unconfirmed(a,'Native ECAM data has no application metadata: source, zero-entry intent and GWP setting are unconfirmed.');
    const s=side.state;
    if(side.format!=='chatwater-companion'||side.version!==VERSION||side.ecamVersion!==ECAM||!object(s)||s.schema!==CW.SCHEMA||!Number.isInteger(s.gwpIndex)||s.gwpIndex<0||s.gwpIndex>5||!metadataValid(a,s.assessmentMeta)||CW.canonical(side.bindings)!==CW.canonical(bindings(a,s.assessmentMeta))||side.stateDigest!==CW.fp(s)) return unconfirmed(a,'Companion metadata is missing, unsupported or mismatched. Its settings/statuses were not applied; edited text remains in recovery.',side);
    for(const k of ['selectedActions','customActions','checkpoints']) if(s[k]!=null&&!Array.isArray(s[k]))return unconfirmed(a,'Malformed project collections; metadata was not applied.',side);
    const state={...clone(s),assessments:clone(a)};
    return {ok:true,kind:'project',state,assessments:state.assessments,warning:null};
  }
  return {VERSION,ECAM,pack,companion,parse,bindings,metadataValid};
});
