require('./helpers/offline');
const assert=require('assert'),U=require('../public/js/utility-identity'),C=require('../public/js/cw-core');
let n=0;const id=()=>`u_${++n}`;
const s={profile:{name:'Preserved legacy details',resp_water_supply:'operates'},assessmentMeta:[{id:'a'},{id:'b'}]};
U.migrate(s,id);assert.equal(U.resolve(s,'a'),null);assert.equal(U.resolve(s,'b'),null);
U.create(s,'a',s.unassignedUtilityId,id);U.create(s,'b',null,id);
s.utilities[s.assessmentUtilities.b]={name:'Different fictional utility',resp_sewer:'operates'};
const restored=JSON.parse(JSON.stringify(s));
assert.equal(U.resolve(restored,'a').name,'Preserved legacy details');assert.equal(U.resolve(restored,'b').name,'Different fictional utility');
const before=C.fp(U.resolve(restored,'a'));U.resolve(restored,'b').name='Edited B';assert.equal(C.fp(U.resolve(restored,'a')),before);
U.resolve(restored,'a').location='Changed location';assert.notEqual(C.fp(U.resolve(restored,'a')),before);
const single={profile:{name:'Only legacy utility'},assessmentMeta:[{id:'only'}]};U.migrate(single,id);assert.equal(U.resolve(single,'only').name,'Only legacy utility');
console.log('Utility association: conservative migration, distinct identities, restoration and profile dependency fingerprints passed');
// Execute the actual workspace-backup adapter with isolated stubs: every utility survives.
const fs=require('fs'),vm=require('vm');const source=fs.readFileSync('public/js/app.js','utf8');
const fn=source.match(/  function saveProjectBackup\(\) \{[^\n]+/)[0];let packed;
vm.runInNewContext(fn+';saveProjectBackup();',{persist:()=>true,downloadJson:()=>{},CWProject:{pack:x=>(packed=x)},plain:x=>JSON.parse(JSON.stringify(x)),state:restored,Scenarios:[],metaOf:()=>null});
assert.deepEqual(packed.utilities,restored.utilities);assert.deepEqual(packed.assessmentUtilities,restored.assessmentUtilities);
