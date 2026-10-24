/* CW-03 application layer. Calls trusted ECAM methods; never changes equations or inputs.
 * Conservative dependencies are read from this.<field/method> references in the bundled
 * substage prototypes, after comments are removed. Unknown references fail closed.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./cw-core'));
  else root.RSData=factory(root.CW);
})(typeof self!=='undefined'?self:this,function(CW){
  const ok = s => s === 'available' || s === 'not_applicable';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const cleanSource = fn => String(fn).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  const safe = fn => {try {return fn();} catch {return null;}};
  const finiteValue = v => finite(v) || (v && typeof v==='object' && Object.values(v).length && Object.values(v).every(finite));
  const zero = v => v == null || v===0 || (typeof v==='object' && Object.values(v).every(x=>x===0));
  const priority = ['invalid','untracked','unknown','unconfirmed','unavailable'];
  const combine = states => priority.find(s=>states.some(x=>x.status===s)) || 'available';
  const strip = s => ({status:s.status, dependencies:s.dependencies || [], missing:s.missing || [], reason:s.reason || null});
  const EXTRA_OWNERS = {
    wwt_KPI_GHG_slu_storage:'wwt_slu_storage', wwt_KPI_GHG_slu_composting:'wwt_composting',
    wwt_KPI_GHG_slu_incineration:'wwt_incineration', wwt_KPI_GHG_slu_land_application:'wwt_land_application',
    wwt_KPI_GHG_slu_landfilling:'wwt_landfilling', wwt_KPI_GHG_slu_stockpilling:'wwt_stockpiling', wwt_KPI_GHG_slu_transport:'wwt_trucks',
    wwt_KPI_GHG_dig_fuel:'wwt_producing_biogas', wwo_KPI_GHG_dig_fuel:'wwo_producing_biogas',
    wwo_KPI_GHG_landapp:'wwo_landapp',wwo_KPI_GHG_landfil:'wwo_landfil',wwo_KPI_GHG_dumping:'wwo_dumping',wwo_KPI_GHG_urine:'wwo_urine',
  };
  const cache = new WeakMap();
  // Constructor defaults must never fill holes in imported or saved data as confirmed values.
  function prepare(assessment,Structure,generalDefaults={}) {
    const a=JSON.parse(JSON.stringify(assessment));
    for(const c of ['AssessmentPeriodStart','AssessmentPeriodEnd'])if(!Object.hasOwn(a.General,c))a.General[c]=null;
    for(const [c,v] of Object.entries(generalDefaults))if(typeof v==='number'&&!Object.hasOwn(a.General,c))a.General[c]=null;
    for(const st of Structure) {
      const list=st.sublevel?a[st.level]?.[st.sublevel]:[a[st.level]];
      for(const o of list || [])if(o)for(const [c,v] of Object.entries(new st.class()))if(typeof v==='number'&&!Object.hasOwn(o,c))o[c]=null;
    }
    return a;
  }
  function inventory(Structure,Questions) {
    if(cache.has(Structure)) return cache.get(Structure);
    const registry={};
    for(const st of Structure.filter(x=>x.sublevel)) {
      const defaults=new st.class(), inputs=Object.keys(defaults).filter(c=>typeof defaults[c]==='number');
      const methods=Object.getOwnPropertyNames(st.class.prototype).filter(c=>c!=='constructor'&&typeof defaults[c]==='function');
      const nodes={};
      for(const code of methods) {
        const source=cleanSource(defaults[code]);
        const refs=[...new Set([...source.matchAll(/\bthis\.(\w+)/g)].map(m=>m[1]))];
        const unresolved=refs.filter(c=>!inputs.includes(c)&&!methods.includes(c));
        if(/\bthis\s*\[|\bGlobal\b|\beval\s*\(/.test(source)) unresolved.push('dynamic_or_external_reference');
        const owners=Object.entries(Questions).filter(([,q])=>q?.variables?.includes(code)).map(([q])=>q);
        if(EXTRA_OWNERS[code]) owners.push(EXTRA_OWNERS[code]);
        // Some emission components are not listed among the question's displayed outputs.
        if(!owners.length && refs.length && refs.every(c=>inputs.includes(c))) {
          const common=Object.entries(Questions).filter(([,q])=>q?.variables && refs.every(c=>q.variables.includes(c))).map(([q])=>q);
          owners.push(...common);
        }
        nodes[code]={refs,owners:[...new Set(owners)],unresolved,constants:[...new Set([...source.matchAll(/\bCts\.(\w+)/g)].map(m=>m[1]))],tables:[...new Set([...source.matchAll(/Tables\.get_row\(['"]([^'"]+)/g)].map(m=>m[1]))],sourceHash:CW.hash(source)};
      }
      function leaves(code,seen=new Set()) {
        if(inputs.includes(code)) return [code];
        if(seen.has(code)||!nodes[code]) return [];
        const next=new Set(seen);next.add(code);
        return [...new Set(nodes[code].refs.flatMap(c=>leaves(c,next)))].sort();
      }
      for(const code of methods) nodes[code].inputs=leaves(code);
      registry[st.prefix]={published:[...st.class.equations],inputs,nodes};
    }
    cache.set(Structure,registry);return registry;
  }
  function input(record,sid,code,value,Info={},Tables={}) {
    const source=CW.inputState(record,sid,code,value), r=record?.s?.[sid]?.[code];
    const matches=r && (r.v===value || (r.v==null&&value==null));
    const base={value:null,dependencies:[code],origin:source.origin,confirmed:source.confirmed,recordOrigin:record?.origin || 'legacy',sourceUnconfirmed:['unknown','imported'].includes(source.origin)&&!source.confirmed};
    if(matches&&r.availability==='unknown') return {...base,status:'unknown',reason:'Explicitly marked unknown; stored value retained'};
    if(matches&&r.availability==='not_applicable') return {...base,status:'not_applicable'};
    if(value==null||value==='') return {...base,status:'unknown',reason:'Not entered'};
    const i=Info[code] || {};
    if(!finite(value) || (['Energy','Volume','Mass','Population','Volume of biogas','People','Number','Currency','Flow','Distance','Power','Voltage','Concentration'].includes(i.magnitude)&&value<0) || ((/_conv_kwh$|_efac_|_EF$/.test(code)||code==='conv_kwh_co2')&&value<0) || (i.unit==='%'&&(value<0||value>100)) || (i.unit==='hours/day'&&(value<0||value>24)) || (i.magnitude==='Power factor'&&(value<=0||value>1)) || (i.magnitude==='Option'&&(!Number.isInteger(value)||value<0||(Tables[i.table]&&value>=Tables[i.table].length)))) return {...base,status:'invalid'};
    if(!source.confirmed && source.origin!=='manual' && value===0) {
      if(['unknown','imported'].includes(source.origin)) return {...base,status:'unconfirmed',reason:'Legacy/imported zero: entry intent and source are unconfirmed'};
      if(source.origin==='default') return {...base,status:'unknown',reason:'Untouched zero default'};
    }
    return {...base,status:'available',value};
  }
  function substage(ss,st,{Structure,Info,Tables,Questions,meta,inputStatus,issues=[]}={}) {
    const spec=inventory(Structure,Questions)[st.prefix], sid=CW.substageId(meta,st), memo={}, visiting=new Set();
    const scoped=issues.filter(x=>x.prefix===st.prefix&&x.index===st.index&&x.type==='invalid');
    const inputFor = code => {
      const r=input(inputStatus,sid,code,ss[code],Info,Tables);
      return scoped.some(x=>x.code===code)?{...r,status:'invalid'}:r;
    };
    function output(code) {
      if(memo[code]) return memo[code];
      const n=spec.nodes[code];
      if(!n||n.unresolved.length||visiting.has(code)) return {status:'untracked',value:null,dependencies:[],reason:'Untracked dependency'};
      if(n.owners.length&&n.owners.every(q=>ss.Configuration?.Questions?.[q]===false)) return memo[code]={status:'not_applicable',value:null,dependencies:n.inputs,reason:'Process option is off'};
      visiting.add(code);
      const refs=n.refs.map(c=>spec.inputs.includes(c)?inputFor(c):output(c));
      const raw=safe(()=>ss[code]());
      let status=combine(refs);
      // An inactive child may contribute structural zero to a sum. Nonzero inactive data is contradictory.
      if(refs.some((r,i)=>r.status==='not_applicable'&&!zero(safe(()=>typeof ss[n.refs[i]]==='function'?ss[n.refs[i]]():ss[n.refs[i]])))) status='invalid';
      if(status==='available'&&!finiteValue(raw)) status='unavailable';
      const missing=refs.flatMap((r,i)=>ok(r.status)?[]:(r.missing?.length?r.missing:[n.refs[i]]));
      visiting.delete(code);
      return memo[code]={status,value:status==='available'?raw:null,dependencies:n.inputs,missing:[...new Set(missing)],reason:status==='unavailable'?'Zero denominator or nonfinite ECAM output':null};
    }
    for(const code of Object.keys(spec.nodes)) output(code);
    return {sid,prefix:st.prefix,index:st.index,name:ss.name,outputs:memo,inputs:Object.fromEntries(spec.inputs.map(c=>[c,inputFor(c)]))};
  }
  function rollup(parts,read) {
    const active=parts.filter(x=>x.status!=='not_applicable');
    const status=combine(active), available=active.filter(x=>x.status==='available');
    const partial=available.length?available.reduce((v,p)=>v+read(p.value),0):null;
    return {status,complete:status==='available',value:status==='available'?(partial ?? 0):null,known_subtotal:partial,unavailable_components:active.filter(x=>!ok(x.status)).length};
  }
  function metric(states,dependencies,read) {
    let status=combine(states);
    if(status==='available'&&states.some(s=>s.status==='not_applicable'))status='not_applicable';
    const value=status==='available'?safe(read):null;
    if(status==='available'&&!finite(value))status='unavailable';
    return {status,value:status==='available'?value:null,dependencies,missing:[...new Set(states.filter(s=>!ok(s.status)).flatMap(s=>s.missing?.length?s.missing:s.dependencies || []))]};
  }
  function evaluate(sc,ctx) {
    const {Structure,meta,inputStatus,Info,Tables}=ctx, subs=[];
    for(const st of Structure.filter(x=>x.sublevel)) sc[st.level][st.sublevel].forEach((ss,index)=>subs.push({...substage(ss,{prefix:st.prefix,index},ctx),level:st.level,sublevel:st.sublevel}));
    const ghg=subs.map(s=>s.outputs[s.prefix+'_KPI_GHG']);
    const energy=subs.map(s=>s.inputs[s.prefix+'_nrg_cons']);
    const total=rollup(ghg,v=>v.total), electricity=rollup(energy,v=>v);
    const periodValid=ctx.issues?.some(x=>/^AssessmentPeriod/.test(x.code));
    if(periodValid) {total.status='invalid';total.complete=false;total.value=null;electricity.status='invalid';electricity.complete=false;electricity.value=null;}
    const byStage={};
    for(const [p] of CW.STAGE_KEYS) {
      const list=subs.filter(s=>s.prefix===p), r=rollup(list.map(s=>s.outputs[p+'_KPI_GHG']),v=>v.total), n=rollup(list.map(s=>s.inputs[p+'_nrg_cons']),v=>v);
      byStage[p]={count:list.length,total:r.value,energy_kwh:n.value,availability:r,energy_availability:n};
      for(const gas of ['co2','ch4','n2o']) byStage[p][gas]=rollup(list.map(s=>s.outputs[p+'_KPI_GHG']),v=>v[gas]).value;
    }
    const totals={total:total.value};for(const gas of ['co2','ch4','n2o']) totals[gas]=total.complete?rollup(ghg,v=>v[gas]).value:null;
    const population={};
    for(const [key,scope,prefixes] of [['ws_serv_pop','Water',['wsd']],['ww_serv_pop','Waste',['wwt','wwo']]]) {
      const list=subs.filter(s=>prefixes.includes(s.prefix));
      population[key]=rollup(list.map(s=>s.inputs[s.prefix+(s.prefix==='wwo'?'_onsi_pop':'_serv_pop')]),v=>v);
      const resident=scope==='Water'?'ws_resi_pop':'ww_resi_pop';
      population[resident]=input(inputStatus,scope,resident,sc[scope][resident],Info,Tables);
    }
    const semantic=subs.map(s=>[s.prefix,s.index,Object.fromEntries(Object.entries(s.outputs).map(([c,v])=>[c,v.status])),s.inputs[s.prefix+'_nrg_cons']?.status]);
    semantic.push(['population',Object.fromEntries(Object.entries(population).map(([c,v])=>[c,v.status]))],['period',!periodValid]);
    semantic.push(['General',Object.fromEntries(Object.entries(sc.General).filter(([,v])=>typeof v==='number').map(([c,v])=>[c,input(inputStatus,'General',c,v,Info,Tables).status]))]);
    const general=Object.fromEntries(Object.entries(sc.General).filter(([,v])=>typeof v==='number').map(([c,v])=>[c,input(inputStatus,'General',c,v,Info,Tables)]));
    return {general,population,substages:subs,total,energy:electricity,totals,byStage,supportRevision:CW.fp(semantic),coverage:{kind:'conservative trusted ECAM substage method graph',published:Object.values(inventory(Structure,ctx.Questions)).reduce((n,x)=>n+x.published.length,0),untracked:subs.flatMap(s=>Object.entries(s.outputs).filter(([,v])=>v.status==='untracked').map(([c])=>c))}};
  }
  function apply(raw,graph) {
    raw.availability=graph.total.complete?'available':'partial';raw.completeness=graph.total;raw.energy_availability=graph.energy;raw.supportRevision=graph.supportRevision;raw.coverage=graph.coverage;
    raw.factors={...raw.factors,...Object.fromEntries(Object.keys(raw.factors || {}).filter(c=>graph.general[c]).map(c=>[c,graph.general[c].value]))};
    raw.factor_availability=graph.general;
    raw.population=Object.fromEntries(Object.entries(graph.population).map(([c,v])=>[c,v.value]));raw.population_availability=graph.population;
    raw.totals=graph.totals;raw.energy_kwh=graph.energy.value;raw.byStage=graph.byStage;
    raw.substages.forEach((s,i)=>{
      const g=graph.substages[i];s.availability=Object.fromEntries(Object.entries(g.outputs).map(([c,v])=>[c,strip(v)]));s.input_availability=g.inputs;
      for(const [code,status] of Object.entries(g.outputs)) s.outputs[code]=status.value;
      s.ghg=g.outputs[s.prefix+'_KPI_GHG'].value;s.energy_kwh=g.inputs[s.prefix+'_nrg_cons']?.value ?? null;
      // raw wrappers already provide the numerical per-substage electricity; assigned by the caller below.
      s.sid=g.sid;
    });
    return raw;
  }
  function raw(sc,{Structure,gwp}={}) {
    const subs=[];
    for(const st of Structure.filter(s=>s.sublevel)) for(const ss of sc[st.level][st.sublevel]) subs.push({level:st.level,sublevel:st.sublevel,prefix:st.prefix,name:ss.name,inputs:ss,outputs:Object.fromEntries(st.class.equations.map(c=>[c,safe(()=>ss[c]())])),energy_kwh:ss[st.prefix+'_nrg_cons']});
    return {name:sc.General.Name,country:sc.General.Country,currency:sc.General.Currency,period:{start:sc.General.AssessmentPeriodStart,end:sc.General.AssessmentPeriodEnd,days:safe(()=>sc.Days())},gwp,factors:{conv_kwh_co2:sc.General.conv_kwh_co2,prot_con:sc.General.prot_con,bod_pday:sc.General.bod_pday},population:{ws_resi_pop:sc.Water.ws_resi_pop,ws_serv_pop:safe(()=>sc.Water.ws_serv_pop()),ww_resi_pop:sc.Waste.ww_resi_pop,ww_serv_pop:safe(()=>sc.Waste.ww_serv_pop())},totals:safe(()=>sc.TotalGHG()),energy_kwh:safe(()=>sc.TotalNRG()),substages:subs,byStage:{}};
  }
  // Action assumptions/thresholds stay in engine/actions.js; this lists only support dependencies.
  const ACTIONS = {
    pump_upgrade:['output:KPI_nrg_estm_sav','output:KPI_ghg_estm_red'], pump_audit:['input:nrg_cons'],
    nrw_reduction:['output:SL_water_loss','water_energy','general:conv_kwh_co2'],
    septic_desludging:['output:KPI_GHG_containment','input:cont_emp','input:onsi_pop','input:fdensity','input:bod_conc_fs','general:bod_pday','inventory_total'],
    cso_reduction:['output:KPI_GHG_cso'],biogas_capture:['output:KPI_GHG_tre'],fuel_switch:['output:KPI_GHG_fuel'],
    solar_pv:['utility_energy','general:conv_kwh_co2'],
  };
  function actionStatus(rule,s,r,{assessment,inputStatus,Info,Tables}={}) {
    if (!r.coverage) return {status:'available',dependencies:[],mode:'raw_engine_math_only'};
    const specs=ACTIONS[rule];if(!specs)return {status:'untracked',dependencies:[]};
    const states=specs.flatMap(dep=>{
      const [kind,code]=dep.split(':');
      if(kind==='output') return [{...(s?.availability?.[s.prefix+'_'+code] || {status:'untracked'}),dependency:dep}];
      if(kind==='input') return [{...(s?.input_availability?.[s.prefix+'_'+code] || {status:'untracked'}),dependency:dep}];
      if(kind==='general') return [{...(r.factor_availability?.[code] || input(inputStatus,'General',code,assessment?.General?.[code],Info,Tables)),dependency:dep}];
      if(dep==='water_energy')return ['wsa','wst','wsd'].map(p=>({...r.byStage[p].energy_availability,dependency:p+'_nrg_cons'}));
      if(dep==='utility_energy')return [{...r.energy_availability,dependency:dep}];
      return [{...r.completeness,dependency:dep}];
    });
    return {status:combine(states)==='available'&&states.some(s=>s.status==='not_applicable')?'not_applicable':combine(states),dependencies:specs,missing:states.filter(s=>!ok(s.status)).map(s=>s.dependency)};
  }
  return {ok,input,prepare,inventory,evaluate,apply,raw,rollup,metric,ACTIONS,actionStatus};
});
