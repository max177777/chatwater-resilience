/* Utility ownership is explicit; names never establish ownership. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.UtilityIdentity=factory();})(typeof self!=='undefined'?self:this,()=>({
  migrate(state,makeId){
    if(state.utilities&&state.assessmentUtilities)return;
    state.utilities={};state.assessmentUtilities={};
    if(state.profile){const uid=makeId('u');state.utilities[uid]=state.profile;
      const metas=state.assessmentMeta||[];
      if(metas.length===1)state.assessmentUtilities[metas[0].id]=uid;
      else state.unassignedUtilityId=uid;
    }
  },
  resolve(state,aid){return state.utilities?.[state.assessmentUtilities?.[aid]]||null;},
  create(state,aid,uid,makeId){uid=uid&&state.utilities[uid]?uid:makeId('u');state.utilities[uid] ||= {};state.assessmentUtilities[aid]=uid;return uid;}
}));
