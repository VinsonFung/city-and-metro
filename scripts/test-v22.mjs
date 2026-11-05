// Regression checks use only an in-memory browser-storage substitute.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const memory=new Map();
const localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const context={console,performance,atob,btoa,TextEncoder,TextDecoder,localStorage,navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),setTimeout,clearTimeout};
context.window=context;vm.createContext(context);
for(const [,src]of(await readFile(path.join(root,'index.html'),'utf8')).matchAll(/<script src="([^"]+)"/g)){
  vm.runInContext(await readFile(path.join(root,src),'utf8'),context,{filename:src});
  if(src==='js/save.js')break;
}
const C=context.CM;
const sizes={tutorial:[48,40],gz:[120,144],hz:[188,136],wh:[152,156],hk:[176,120],tp:[136,120],pa:[152,148],sh:[152,152],bj:[204,156],tk:[140,132]};
for(const [id,[width,height]]of Object.entries(sizes)){
  const m=C.MAPS[id];assert.equal(m.cfg.W,width);assert.equal(m.cfg.H,height);assert.equal(m.mapVersion,id==='tutorial'||id==='bj'?1:(id==='hz'||id==='wh')?4:['hk','tk','pa'].includes(id)?3:2);
  assert.ok(m.data.eras.length>=3);
  const regions=new Set([...m.data.regions.map(r=>r.id),m.data.defaultRegion?.id].filter(Boolean));
  for(const e of m.data.eras){
    for(const g of e.goals||[])for(const a of g.anchors)assert.ok(a.x>=0&&a.y>=0&&a.x<width&&a.y<height,id+': '+g.id+' must be inside the web map');
    for(const weights of Object.values(e.grow||{}))for(const region of Object.keys(weights))assert.ok(regions.has(region),id+': unknown region '+region);
  }
  for(const f of m.data.bgViz?.ferries||[])for(const [x,y]of f.pts)assert.ok(x>=0&&y>=0&&x<width&&y<height,id+': ferry outside map');
}
C.useMap('tutorial');
const game=C.Game.create({mode:'free',tutorial:true,seed:20000101});
assert.equal(game.model.trafficReady(),true);assert.ok(game.startBase);assert.ok(game.eraBase);
game.startJump(1);while(game.jumping)game.stepJump();assert.equal(game.clock.m,2);assert.equal(game.econ.ledger.length,1);
const restored=C.Game.restore(JSON.parse(JSON.stringify(game.serialize())));
assert.equal(JSON.stringify(restored.clock),JSON.stringify(game.clock));
assert.equal(JSON.stringify(restored.net),JSON.stringify(game.net));
assert.equal(JSON.stringify(restored.econ.serialize()),JSON.stringify(game.econ.serialize()));
assert.equal(JSON.stringify(restored.startBase),JSON.stringify(game.startBase));

// Old-format optional fields are absent: preserve the original accounts and
// network, back up the raw snapshot, and begin comparisons at load time.
const old=JSON.parse(JSON.stringify(game.serialize()));old.rulesRevision=1;
for(const key of ['startBase','eraBase','eraLog','startYear','unlockAll'])delete old[key];
const body=JSON.stringify(old),envelope={format:C.CFG.SAVE_FORMAT,version:2,gameVersion:'2.1.0',savedAt:Date.now(),body,checksum:C.U.fnv(body)};
await C.Save.init();const imported=await C.Save.importText(JSON.stringify(envelope));const payload=await C.Save.load(imported.slotId);
assert.equal(C.Save.slotInfo(imported.slotId).map,'tutorial');assert.equal(C.Save.slotInfo('missing-slot'),null);
assert.ok(payload.__backupSlot);assert.ok(JSON.parse(localStorage.getItem('cm1.index')).slots[payload.__backupSlot]);
const upgraded=C.Game.restore(payload);assert.ok(upgraded.startBase.joined);
assert.equal(JSON.stringify(upgraded.net),JSON.stringify(old.net));assert.equal(JSON.stringify(upgraded.econ.serialize()),JSON.stringify(old.econ));

const event={y:2000,m:12,title:'Boundary test',fx:{demand:{lz:2,months:1}}};C.DATA.events.push(event);
const during=C.Eras.demand(2000+11/12).rate[4],after=C.Eras.demand(2001).rate[4];assert.ok(during>after*1.9);assert.equal(C.Eras.demand(2001).rate[4],after);C.DATA.events.pop();
game.clock.y=2003;game.clock.m=1;const transition=C.Eras.month(game);assert.ok(transition.prev.text);assert.equal(game.eraBase.id,C.Eras.current(game.year()).id);assert.equal(C.Eras.month(game),null);

C.useMap('gz');const custom=C.Game.create({mode:'free',startYear:1992,unlockAll:true});
assert.equal(custom.clock.y,1992);assert.equal(custom.clock.m,1);assert.equal(custom.econ.ledger.length,0);assert.equal(custom.history[0].y,1992);
const again=C.Game.restore(JSON.parse(JSON.stringify(custom.serialize())));assert.equal(again.startYear,1992);assert.equal(again.city.unlockAll,true);
assert.ok(custom.city.lockState().mask.length===custom.city.N);
// The original Hong Kong map has short railway fragments. They must still
// produce representative trains, and animation must freeze while paused.
C.useMap('hk');const city=new C.City();city.generate(19700101,1970);
const disney=C.Fac.list(city).find(f=>f.id==='hk_disney');assert.equal(disney.we,1.9,'Theme-park weekend demand must survive facility compilation');
const extent=C.MAPS.hk.extent[0];let newPop=0,newJobs=0;
for(let y=0;y<city.H;y++)for(let x=0;x<city.W;x++)if(x<extent.dx||x>=extent.dx+extent.oldW||y<extent.dy||y>=extent.dy+extent.oldH){newPop+=city.pop[y*city.W+x];newJobs+=city.jobs[y*city.W+x];}
assert.ok(newPop>0&&newJobs>0,'Expanded regions must generate residents and jobs, not just extra canvas');
vm.runInContext(await readFile(path.join(root,'js/bgtransit.js'),'utf8'),context,{filename:'bgtransit.js'});
const display={clock:{y:1970},city,year:()=>1970,visualRate:()=>0};C.BgTransit.update(.1,display);
assert.ok(C.BgTransit.trains.length>0);assert.ok(C.BgTransit.boats.length>0);
const positions=JSON.stringify([C.BgTransit.trains,C.BgTransit.boats]);C.BgTransit.update(.5,display);assert.equal(JSON.stringify([C.BgTransit.trains,C.BgTransit.boats]),positions);

// A missing 2.5D actor entry point or missing projection variables used to
// abort the frame before the renderer could finish ground / building caches.
for(const name of ['render','agents'])vm.runInContext(await readFile(path.join(root,'js/'+name+'.js'),'utf8'),context,{filename:name+'.js'});
assert.equal(typeof C.Agents.prototype.drawList,'function','2.5D chunk rendering needs the shared actor entry point');
const actors=new C.Agents();actors.roadRef={links:[]};
actors.cars=['car','taxi','bus','truck','bike','moto','horse','tram'].map((kind,k)=>({kind,alpha:1,color:'#5893bc',brake:true,horse:kind==='horse',frozen:{x:2+k*.3,y:2,ang:.4}}));
actors.peds=[{pts:[[3,3],[4,3]],cum:[0,1],s:.5,alpha:1,color:'#644a82'}];
actors.walkers=[{alpha:1,color:'#725746',frozen:{x:4,y:4,ang:0}}];
let strokes=0;
const numeric=(...values)=>{for(const v of values)assert.ok(Number.isFinite(v),'Actor coordinates must stay finite');};
const canvas={beginPath(){},moveTo:numeric,lineTo:numeric,fillRect:numeric,arc:numeric,fill(){},stroke(){strokes++;}};
for(const iso of [false,true])for(const night of [false,true]){
  const view={z:32,tEase:iso?1:0,w:1600,h:900,th:{night},detail:{tier:0},P(x,y,h,out={}){return Object.assign(out,{x:400+(iso?x-y:x)*32,y:150+(iso?(x+y)*.5:y)*32-h});}};
  const before=strokes;
  if(iso)for(const list of actors.bucket(8).values())actors.drawList(canvas,view,list,1);
  else actors.drawAll(canvas,view,1);
  assert.ok(strokes>before,'Vehicles must actually draw in each view / theme');
  assert.equal(canvas.globalAlpha,1);
}
console.log('PASS actor rendering: shared 2D / 2.5D entry point, all vehicle types, pedestrians and day / night');
// Regional building facades must render at both detail levels without leaving
// an interrupted chunk generator in the live renderer.
for(const name of ['sites','scenery'])vm.runInContext(await readFile(path.join(root,'js/'+name+'.js'),'utf8'),context,{filename:name+'.js'});
let lighting=true,facadeFills=0;C.Settings={get:()=>lighting};
const facade={...canvas,closePath(){},fill(){facadeFills++;}};
const project=(x,y,h)=>[(x-y)*32,(x+y)*16-h*32];
for(const night of [false,true])for(const light of [false,true])for(const scale of [16,32])for(const kind of ['qilou','cross','setback','rotunda','deco','rows','jiangnan']){
  lighting=light;const before=facadeFills;
  C.Renderer.prototype.drawSignature.call({th:{night}},facade,project,2,2,[.1,.1,.9,.9,24],kind,scale);
  assert.ok(facadeFills>before,'Regional building must draw: '+kind);
}
console.log('PASS regional Canvas buildings: all styles, detail levels, day / night and lighting settings');
console.log('PASS v2.2: expanded nine maps, phase targets, event boundaries, settlement, backups, upgrade preservation, stage transitions and sandbox round trip');
