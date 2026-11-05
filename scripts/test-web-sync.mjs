// Integration regressions use generated cities and memory storage, never player data.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),memory=new Map();
const c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
c.window=c;vm.createContext(c);
for(const [,src]of(await readFile(path.join(root,'index.html'),'utf8')).matchAll(/<script src="([^"]+)"/g)){
  vm.runInContext(await readFile(path.join(root,src),'utf8'),c,{filename:src});if(src==='js/save.js')break;
}
const C=c.CM;
assert.ok(C.CFG.RULES_REVISION>=4);
const airports={hz:['hz_xsair'],wh:['wh_tianhe'],hk:['hk_cklair'],pa:['pa_cdg','pa_orly'],tk:['tk_haneda']};
for(const [map,ids]of Object.entries(airports)){
  C.useMap(map);const city=new C.City();city.generate(12345,2024);
  for(const id of ids){
  const f=C.Fac.list(city).find(f=>f.id===id);
  assert.ok(f&&!f.ext&&f.rw,id+' must be an in-map airport');
  assert.ok(f.x>=0&&f.y>=0&&f.x<city.W&&f.y<city.H);
  assert.ok(C.Fac.active(f,2024,city));
  for(const p of f.rw)assert.ok(p[0]>=0&&p[1]>=0&&p[0]<city.W&&p[1]<city.H,id+' runway outside map');
  assert.equal(city.lockState().mask.length,city.N);
  console.log('PASS airport and construction mask',map,id);
  }
}
C.useMap('sh');{
  const city=new C.City();city.generate(12345,2017);const f=C.Fac.list(city).find(f=>f.id==='sh_disney');
  assert.ok(f&&f.we>1);assert.equal(C.Fac.active(f,2016+4/12,city),false);assert.equal(C.Fac.active(f,2016+5/12,city),true);
  assert.ok(C.DATA.histTasks.some(t=>t.title==='迪士尼接驳'));
  const region=city.regions.findIndex(r=>r.id==='disney');assert.ok(region>=0);
  assert.equal(city.regions[region].park,true);
  console.log('PASS Shanghai Disney opening date, task and park land');
}
C.useMap('gz');{
  const city=new C.City();city.generate(19900101,1990);
  const pick=()=>{
    const mask=city.lockState().mask;
    return Array.from(mask.keys()).find(k=>mask[k]&&city.landFrac[k]>.7&&city.regions[city.lockRegion(k)].open!=null&&!city.regions[city.lockRegion(k)].scenic&&!city.regions[city.lockRegion(k)].lockNote);
  };
  const cell=pick();assert.ok(cell!==undefined,'Need a locked expansion district');
  const station={x:cell%city.W+.5,y:Math.floor(cell/city.W)+.5},net={stations:{s1:station}};
  city.keepLegacyOpen(net,{active:[]},1990,1);assert.equal(city.cellLocked(cell),false,'Existing station must keep its connected land buildable');
  const saved=JSON.parse(JSON.stringify(city.serialize()));assert.equal(saved.lockRule,2);
  const control=new C.City();control.generate(19900101,1990);control.restore(saved,1990);control.keepLegacyOpen(net,{active:[]},1990,1);
  const untouched=Array.from(control.lockState().mask.keys()).find(k=>control.cellLocked(k)&&control.regions[control.lockRegion(k)].open!=null&&!control.regions[control.lockRegion(k)].scenic);
  assert.ok(untouched!=null,'Need an untouched locked district for the reload regression');
  const restored=new C.City();restored.generate(19900101,1990);restored.restore(saved,1990);
  const tasks={active:untouched==null?[]:[{anchors:[{x:untouched%restored.W+.5,y:Math.floor(untouched/restored.W)+.5}]}]};
  restored.keepLegacyOpen(net,tasks,1990,1);assert.equal(restored.cellLocked(cell),false);
  if(untouched!=null)assert.equal(restored.cellLocked(untouched),true,'New task anchors must not unlock land on each load');
  const again=new C.City();again.generate(19900101,1990);again.restore(JSON.parse(JSON.stringify(restored.serialize())),1990);again.keepLegacyOpen(net,tasks,1990,1);
  assert.equal(JSON.stringify(Array.from(again.lockState().mask)),JSON.stringify(Array.from(restored.lockState().mask)),'Save/load must not change construction access');
  console.log('PASS existing-station access and stable repeated load');
}
C.useMap('hz');{
  const city=new C.City();city.generate(20000101,2010);city.unlockAll=true;
  const model=new C.Model(city,{deferDemand:true});model.setYear(2010);model.buildZones();
  const f=model.fn.list.find(f=>f.name.includes('灵隐'));
  assert.ok(f,'Need Lingyin facility');assert.ok(C.Tasks.facServable(city,f));
  let result=null;
  for(let dy=-2.4;dy<=2.4&&!result;dy+=.4)for(let dx=-2.4;dx<=2.4&&!result;dx+=.4){
    const x=f.x+dx,y=f.y+dy;if(!C.Metro.checkSite(city,x,y,'underground').ok)continue;
    const net=C.Metro.empty(),line=C.Metro.newLine(net),a=C.Metro.addStation(net,x,y,{size:'M',type:'underground'},city),b=C.Metro.addStation(net,x+5,y,{size:'M',type:'underground'},city);
    C.Metro.addSegment(net,line,a,b,[],'underground');const compiled=C.Metro.compile(net,city),acc=model.computeAccess(compiled),i=model.fn.ids.indexOf(f.id);
    if(acc.zCov[model.Z+i]===1&&acc.zl[model.Z+i].length)result={net,acc};
  }
  assert.ok(result,'A legal nearby station must serve the facility through its site entrance');
  assert.ok(C.Metro.envStationFee('underground','M',2010)>0);
  const fees=C.Metro.evaluate(result.net,C.Metro.empty(),city,2010);
  assert.ok(fees.items.some(x=>x.label?.includes('风景区环境保护费')||x.name?.includes('风景区环境保护费'))||JSON.stringify(fees).includes('风景区环境保护费'));
  console.log('PASS Lingyin site entrance, feasible task and scenic construction fee');
}
console.log('PASS browser synchronization integration checks');
// Outside-map airports retain demand at their city-side host node. A lone gate
// station is insufficient: it must be served by an operating metro route.
for(const map of ['gz','tp','sh']){
  C.useMap(map);const city=new C.City();city.generate(12345,2024);
  const model=new C.Model(city,{deferDemand:true});model.setYear(2024);model.buildZones();model.buildDemand();
  const f=model.fn.list.find(f=>f.ext);assert.ok(f,map+' outside airport');
  const p=C.Fac.portal(f);assert.ok(p.x>=0&&p.x<city.W&&p.y>=0&&p.y<city.H);
  const alone=C.Metro.empty(),sid=C.Metro.addStation(alone,p.x,p.y,{type:'underground',size:'M',portal:f.id},city);
  assert.equal(C.Fac.extLink(f,{compiled:C.Metro.compile(alone,city)}),null,'Gate station must be served by a line');
  const net=JSON.parse(JSON.stringify(alone)),line=C.Metro.newLine(net);
  let target=-1,distance=Infinity;
  for(let cell=0;cell<city.N;cell++){const x=cell%city.W+.5,y=Math.floor(cell/city.W)+.5,d=Math.hypot(x-p.x,y-p.y);if(d<2||d>=distance||!C.Metro.checkSite(city,x,y,'underground').ok)continue;target=cell;distance=d;}
  assert.ok(target>=0,'Need a legal station in the city');
  const other=C.Metro.addStation(net,target%city.W+.5,Math.floor(target/city.W)+.5,{type:'underground',size:'M'},city);
  C.Metro.addSegment(net,line,sid,other,[],'underground');
  const compiled=C.Metro.compile(net,city),link=C.Fac.extLink(f,{compiled}),acc=model.computeAccess(compiled),k=model.facIndex(f.id),node=model.Z+k;
  assert.ok(link?.portal);assert.equal(link.st.id,sid);assert.equal(acc.zCov[node],1);assert.equal(acc.zWalk[node],1);assert.equal(acc.zl[node][0].s,link.i);
  let demand=0;for(let i=0;i<model.od.dest.length;i++)if(model.od.dest[i]===node)demand+=model.od.t[5][i];
  assert.ok(demand>0,'Outside airport must generate city access demand');
  const loaded=JSON.parse(JSON.stringify(net));assert.ok(C.Fac.extLink(f,{compiled:C.Metro.compile(loaded,city)})?.portal,'Portal identity must survive serialization');
  loaded.stations[sid].x+=3;assert.equal(C.Fac.isPortalStation(loaded.stations[sid],f),false,'Dragging away must stop direct access');
  console.log('PASS outside-map airport demand, operational access and serialized portal',map,f.id);
}
