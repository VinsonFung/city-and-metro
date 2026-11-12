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
  assert.equal(p.tasks.active[0].anchors[0].x,8+dx);assert.equal(p.tasks.active[0].anchors[0].y,9+dy);
  assert.equal(JSON.stringify(p.econ),JSON.stringify(payload.econ));assert.equal(p.mapUpgrade.displayOnly||false,false);assert.equal(p.city.regionIds.length,e.oldRegionIds.length);
  assert.deepEqual(Array.from(p.macro.areaRebase.oldBox),[dx,dy,e.oldW,e.oldH]);
  const broken=JSON.parse(body);broken.city.pop.n--;broken.city.pop.b='';assert.throws(()=>m.migrate(broken,from));
  const future=JSON.parse(body);future.meta.mapVersion=m.mapVersion+1;const fb=JSON.stringify(future);assert.throws(()=>C.Save.parseEnvelope(JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,body:fb,checksum:C.U.fnv(fb)})));
  if(id==='gz'){const legacy=JSON.parse(body);delete legacy.meta.map;m.migrate(legacy,from);assert.equal(legacy.city.pop.n,m.cfg.W*m.cfg.H);}
  const pending=JSON.parse(body),mask=new Uint8Array(n);mask[0]=1;pending.city.fillNew=C.U.packTyped(mask,'u8');pending.city.fillYear=1998;m.migrate(pending,from);
  assert.equal(C.U.unpackTyped(pending.city.fillNew)[dy*m.cfg.W+dx],1,'Chained migration must retain pending generated cells');assert.equal(pending.city.fillYear,1998);
  console.log('PASS migration',id,'v'+from+' -> v'+m.mapVersion,e.oldW+'x'+e.oldH,'->',m.cfg.W+'x'+m.cfg.H);
 }
}
