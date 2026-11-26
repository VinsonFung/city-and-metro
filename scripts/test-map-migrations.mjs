// Pure migration checks: no browser storage, no player files, no desktop bridge.
import {readFile} from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},navigator:{hardwareConcurrency:4},matchMedia:()=>({matches:false})};c.window=c;vm.createContext(c);
for(const [,src]of(await readFile(path.join(root,'index.html'),'utf8')).matchAll(/<script src="([^"]+)"/g)){vm.runInContext(await readFile(path.join(root,src),'utf8'),c,{filename:src});if(src==='js/save.js')break;}
const C=c.CM,keys=['pop','jobs','bh','taken','lu','street','urbanYear'];

for(const [id,m]of Object.entries(C.MAPS)){
 if(!m.extent)continue;
 const steps=Array.isArray(m.extent)?m.extent:[m.extent];
 const starts=[...new Set(steps.map(s=>s.from).concat(['hz','wh'].includes(id)?[2]:[]))];
 for(const from of starts){
  const applicable=steps.filter(s=>s.from>=(['hz','wh'].includes(id)&&from===2?3:from)),e=applicable[0];
  const dx=applicable.reduce((v,s)=>v+s.dx,0),dy=applicable.reduce((v,s)=>v+s.dy,0),n=e.oldW*e.oldH;
  const old=new Float32Array(n);for(let k=0;k<n;k++)old[k]=k+.25;
  const payload={meta:{map:id,mapVersion:from},clock:{y:m.cfg.START.y,m:2,d:3},city:Object.fromEntries(keys.map(k=>[k,C.U.packTyped(old,'f32')])),net:{stations:{s1:{x:2.5,y:3.5,site:[2.5,3.5],name:'Custom name',angle:30}},segments:{g1:{pts:[[4.5,5.5],[6.5,7.5]],line:'l1',a:'s1',b:'s2'}}},econ:{funds:123456,debt:600},tasks:{active:[{anchors:[{name:'Anchor',x:8,y:9}],zone:1,coolKey:'cong:1'}],done:[],failed:[],cool:{'cov:1':20}},macro:{rec:[]}};
  payload.netGone={stations:{old:{x:1.5,y:2.5,built:[1980,1],gone:[1990,2]}},segments:{gone:{pts:[[3.5,4.5]],built:[1980,1],gone:[1990,2],lh:[[1985,3,'l0']]}},lines:{l0:{id:'l0',name:'Retired'}}};
  payload.tasks.offers=[{parts:[{zone:1,anchors:[{x:8,y:9}]}]}];
  payload.corp={tenders:[{zone:1,area:{x:4,y:5},anchors:[{x:8,y:9}]}],contracts:[{zone:1}],closed:[{zone:1}],cool:{'z:1':25}};
  payload.voices={follow:{reader:{posts:[{at:{zone:1}}]}}};
  payload.impactReport={hot:[{x:7,y:8}]};
  payload.digs={[2*e.oldW+1]:1};payload.finds=[{id:'finding',x:1.5,y:1990,yy:2.5}];
  payload.congRef={year:1990};
  payload.folks={list:[{home:{x:1,y:2,z:1},dest:{x:2,y:3,z:1},kid:{school:{x:3,y:4,z:1}}}]};
  const body=JSON.stringify(payload),raw=JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,body,checksum:C.U.fnv(body)}),p=C.Save.parseEnvelope(raw).payload;
  assert.equal(p.netGone.stations.old.x,1.5+dx);assert.equal(p.netGone.stations.old.y,2.5+dy);
  assert.deepEqual(Array.from(p.netGone.segments.gone.pts[0]),[3.5+dx,4.5+dy]);assert.equal(JSON.stringify(p.netGone.segments.gone.lh),'[[1985,3,"l0"]]');
  assert.equal(p.meta.mapVersion,m.mapVersion);assert.equal(p.city.pop.n,m.cfg.W*m.cfg.H);assert.equal(JSON.stringify(payload),body,'Parsing must not alter original input');
  const actual=C.U.unpackTyped(p.city.pop),fill=C.U.unpackTyped(p.city.fillNew);let newCells=0;
  for(let y=0;y<m.cfg.H;y++)for(let x=0;x<m.cfg.W;x++){
   const k=y*m.cfg.W+x,inside=x>=dx&&x<dx+e.oldW&&y>=dy&&y<dy+e.oldH;
   assert.equal(fill[k],inside?0:1);if(inside)assert.equal(actual[k],old[(y-dy)*e.oldW+x-dx]);else newCells++;
  }
  assert.equal(newCells,m.cfg.W*m.cfg.H-n);assert.equal(p.net.stations.s1.x,2.5+dx);assert.equal(p.net.stations.s1.y,3.5+dy);
  assert.deepEqual(Array.from(p.net.stations.s1.site),[2.5+dx,3.5+dy],'Paid site must move with its station');
  assert.equal(p.net.stations.s1.name,'Custom name');assert.equal(p.net.stations.s1.angle,30);
  assert.deepEqual(Array.from(p.net.segments.g1.pts[0]),[4.5+dx,5.5+dy]);
  const z=1+dx/4+dy/4*(m.cfg.W/4);assert.equal(p.tasks.active[0].zone,z);assert.equal(p.tasks.active[0].coolKey,'cong:'+z);assert.equal(p.tasks.cool['cov:'+z],20);
  assert.equal(p.city.fillT,m.cfg.START.y+1/12);
  assert.equal(p.tasks.offers[0].parts[0].zone,z);
  assert.equal(p.tasks.offers[0].parts[0].anchors[0].y,9+dy);
  assert.equal(p.corp.tenders[0].area.x,4+dx);assert.equal(p.corp.tenders[0].area.y,5+dy);
  assert.equal(p.corp.contracts[0].zone,z);assert.equal(p.corp.closed[0].zone,z);assert.equal(p.corp.cool['z:'+z],25);
  assert.equal(p.voices.follow.reader.posts[0].at.zone,z);
  assert.equal(p.folks.list[0].kid.school.z,z);
  assert.equal(p.folks.list[0].kid.school.y,4+dy);
  assert.equal(p.impactReport.hot[0].x,7+dx);assert.equal(p.impactReport.hot[0].y,8+dy);assert.equal(p.congRef,undefined);
  assert.equal(p.digs[(2+dy)*m.cfg.W+1+dx],1);
  assert.equal(p.finds[0].x,1.5+dx);assert.equal(p.finds[0].yy,2.5+dy);assert.equal(p.finds[0].y,1990);
  assert.equal(p.tasks.active[0].anchors[0].x,8+dx);assert.equal(p.tasks.active[0].anchors[0].y,9+dy);
  assert.equal(JSON.stringify(p.econ),JSON.stringify(payload.econ));assert.equal(p.mapUpgrade.displayOnly||false,false);assert.equal(p.city.regionIds.length,e.oldRegionIds.length);
  assert.deepEqual(Array.from(p.macro.areaRebase.oldBox),[dx,dy,e.oldW,e.oldH]);
  const broken=JSON.parse(body);broken.city.pop.n--;broken.city.pop.b='';assert.throws(()=>m.migrate(broken,from));
  const future=JSON.parse(body);future.meta.mapVersion=m.mapVersion+1;const fb=JSON.stringify(future);assert.throws(()=>C.Save.parseEnvelope(JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,body:fb,checksum:C.U.fnv(fb)})));
  if(id==='gz'){const legacy=JSON.parse(body);delete legacy.meta.map;m.migrate(legacy,from);assert.equal(legacy.city.pop.n,m.cfg.W*m.cfg.H);}
  const inserted=applicable.find(step=>step.eventInsert)?.eventInsert;
  if(inserted){
   const {index,count,beforeRules}=inserted,legacy=JSON.parse(body);
   legacy.firedEvents={[index-1]:1,[index]:1};
   legacy.milestones={done:{['ev-'+index]:true},list:[{id:'ev-'+index}]};
   m.migrate(legacy,from);
   assert.equal(legacy.firedEvents[index-1],1);assert.equal(legacy.firedEvents[index+count],1);
   assert.equal(legacy.milestones.list[0].id,'ev-'+(index+count));
   if(beforeRules){
    const alreadyKnown=JSON.parse(body);alreadyKnown.rulesRevision=beforeRules;alreadyKnown.firedEvents={[index]:1};
    m.migrate(alreadyKnown,from);assert.equal(alreadyKnown.firedEvents[index],1);assert.equal(alreadyKnown.firedEvents[index+count],undefined);
   }
  }
  const pending=JSON.parse(body),mask=new Uint8Array(n);mask[0]=1;pending.city.fillNew=C.U.packTyped(mask,'u8');pending.city.fillYear=1998;m.migrate(pending,from);
  assert.equal(C.U.unpackTyped(pending.city.fillNew)[dy*m.cfg.W+dx],1,'Chained migration must retain pending generated cells');assert.equal(pending.city.fillYear,1998);
  console.log('PASS migration',id,'v'+from+' -> v'+m.mapVersion,e.oldW+'x'+e.oldH,'->',m.cfg.W+'x'+m.cfg.H);
 }
}


const nj = C.MAPS.nj;
assert.equal(nj.mapVersion, 2);
assert.equal(nj.cfg.ZONE, 4);
assert.ok(Object.values(C.MAPS).every(map => map.cfg.ZONE === 4));
const oldZone = 1259, newZone = 2834;
const task = { zone: oldZone, coolKey: 'cov:' + oldZone, anchors: [{ x: 31, y: 54 }] };
const save = {
  meta: { map: 'nj', mapVersion: 1 },
  clock: { y: 2014, m: 8, d: 17 },
  city: Object.fromEntries(keys.map(key => [key, C.U.packTyped(new Float32Array(180 * 252).fill(17), 'f32')])),
  net: { stations: { s: { x: 21, y: 19, site: [21, 19] } }, segments: {} },
  econ: { funds: 123456, debt: 600, ledger: [{ y: 2014, m: 7 }] },
  tasks: { active: [task], adjusted: [task], offers: [{ parts: [task] }], cool: { ['cov:' + oldZone]: 55, 'at:31.0,54.0': 66 } },
  corp: { contracts: [task], cool: { ['z:' + oldZone]: 99 } },
  voices: { follow: { commuter: { posts: [{ at: { zone: oldZone } }] } } },
  folks: { list: [{ home: { x: 21, y: 19, z: 31 }, dest: { x: 31, y: 54, z: -1 }, kid: { school: { x: 179, y: 251, z: oldZone } } }] },
  congRef: { year: 2014 },
};
const body = JSON.stringify(save);
const raw = JSON.stringify({ format: C.CFG.SAVE_FORMAT, version: 2, body, checksum: C.U.fnv(body) });
const result = C.Save.parseEnvelope(raw).payload;
for (const field of ['city', 'net', 'clock', 'econ']) assert.equal(JSON.stringify(result[field]), JSON.stringify(save[field]));
assert.equal(result.meta.mapVersion, 2);
assert.equal(result.mapUpgrade.zoneOnly, true);
for (const entry of [result.tasks.active[0], result.tasks.adjusted[0], result.tasks.offers[0].parts[0], result.corp.contracts[0]]) {
  assert.equal(entry.zone, newZone);
  assert.equal(entry.coolKey, 'cov:' + newZone);
  assert.equal(JSON.stringify(entry.anchors), JSON.stringify(task.anchors));
}
assert.equal(result.tasks.cool['cov:' + newZone], 55);
assert.equal(result.tasks.cool['at:31.0,54.0'], 66);
assert.equal(result.corp.cool['z:' + newZone], 99);
assert.equal(result.voices.follow.commuter.posts[0].at.zone, newZone);
assert.equal(result.folks.list[0].home.z, 92);
assert.equal(result.folks.list[0].dest.z, -1);
assert.equal(result.folks.list[0].kid.school.z, newZone);
assert.equal(result.folks.list[0].kid.school.y, 251);
assert.equal(result.congRef, undefined);
const newBody = JSON.stringify(result);
const parsedAgain = C.Save.parseEnvelope(JSON.stringify({ format: C.CFG.SAVE_FORMAT, version: 2, body: newBody, checksum: C.U.fnv(newBody) })).payload;
assert.equal(parsedAgain.tasks.active[0].zone, newZone, 'A migrated save must not remap the zone twice');
console.log('PASS Nanjing 1.5 km to 1 km migration, including nested tasks, contracts, school and untouched coordinates');
