// Isolated v2.5 regressions. Never reads or writes player saves.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),memory=new Map();
const c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
c.window=c;vm.createContext(c);
const load=async src=>vm.runInContext(await readFile(new URL(src,root),'utf8'),c,{filename:src});
for(const [,src]of(await readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)){await load(src);if(src==='js/save.js')break;}
const C=c.CM,M=C.Metro,copy=x=>JSON.parse(JSON.stringify(x));
C.UI=function(){};for(const name of ['settings','corp','fleet','opsapp'])await load('js/'+name+'.js');
const F=C.Fleet;
assert.equal(C.CFG.GAME_VERSION,'2.5.1');assert.equal(C.CFG.RULES_REVISION,7);
assert.equal(C.MAP_ORDER.length,10);assert.equal(F.MODELS.length,43);assert.ok(!C.TaskPlans.ld);
for(const map of C.MAP_ORDER)for(const y of [1900,1950,1990,2025])for(const m of F.available(map,y))assert.ok(m.from<=y&&m.to>=y&&(!m.maps||m.maps.includes(map)));
C.useMap('tutorial');const g=C.Game.create({mode:'free',tutorial:true,seed:20000101});
F.ensure(g);let sample;
for(let y=5;y<g.city.H-5&&!sample;y++)for(let x=5;x<g.city.W-22&&!sample;x++){
 const n=M.empty(),lid=M.newLine(n),ids=[];
 if([0,4,8,12,16].some(dx=>!M.checkSite(g.city,x+dx,y,'underground').ok))continue;
 for(let i=0;i<5;i++)ids.push(M.addStation(n,x+4*i,y,{size:'M',type:'underground'},g.city));
 for(let i=1;i<ids.length;i++)M.addSegment(n,lid,ids[i-1],ids[i],[],'underground');
 if(!M.evaluate(n,g.net,g.city,g.clock.y).conflicts.length)sample={n,lid,ids};
}
assert.ok(sample);const {lid,ids}=sample;
g.edit(n=>Object.assign(n,sample.n));const ev=g.draftEval();assert.ok(ev.fleetAdd.some(x=>x.buy>0));assert.equal(g.confirmDraft().ok,true);g.model.solveNow(4);F.ensure(g);
assert.ok(g.fleet.trains.length>0);assert.ok(F.plan(g,g.model.net)[0].cap>0);
console.log('PASS v2.5 scope, 43 city/era models and construction includes minimum fleet');
// Legacy fleet bootstrap is an asset migration, never a retroactive charge.
const old=copy(g.serialize());delete old.fleet;old.rulesRevision=5;
const oldFunds=old.econ.funds,oldLedger=JSON.stringify(old.econ.ledger);
const legacy=C.Game.restore(copy(old));F.ensure(legacy);
assert.equal(legacy.econ.funds,oldFunds);assert.equal(JSON.stringify(legacy.econ.ledger),oldLedger);assert.ok(legacy.fleet.trains.length>0);
C.ui={setLineLook:(id,look)=>Object.assign(g.net.lines[id],look)};
// Purchase, depot, transfer, manual schedules, actual capacity and residual accounting.
g.econ.mode='challenge';g.econ.funds=1e9;
const f0=g.econ.funds,mdl=F.available(g.mapId,g.clock.y).find(m=>m.kmh>=80),count=g.fleet.trains.length;
const bought=F.buy(g,null,null,mdl.id,4,2);assert.equal(bought.ok,true);assert.equal(g.fleet.trains.length,count+2);assert.ok(g.econ.funds<f0);
const added=g.fleet.trains.slice(-2),svc=F.svcId(g.compiled.routes[0],0);
assert.equal(F.move(g,added.map(t=>t.id),lid,svc),2);
F.setMode(g,lid,'manual');F.setManual(g,lid,svc,0,1);assert.equal(F.plan(g,g.model.net)[0].manual[0][0],1);
g.model.solveNow(4);const inf=F.lineInfo(g,lid)[0];assert.ok(inf.per[0].run<=1);assert.ok(Number.isFinite(inf.per[0].capH));
F.setManual(g,lid,svc,0,999);assert.equal(F.plan(g,g.model.net)[0].manual[0][0],F.plan(g,g.model.net)[0].avail[0]);
const blocked=F.buy(g,lid,svc,mdl.id,8,1);assert.equal(blocked.ok,true);assert.ok(F.plan(g,g.model.net)[0].blocked>=1);
const value=F.residual(g,added[0]),sale=F.sell(g,[added[0].id]);assert.equal(sale.value,value);assert.ok(g.econ.cur.fleetSale>=value);
console.log('PASS legacy assets, purchase/depot/transfer/sale, manual frequency and platform length');
// Added services reuse geometry, skip stops, start without trains and return stock when removed.
F.setMode(g,lid,'auto');
const save=F.saveService(g,lid,{name:'Express',skip:[ids[1],ids[2],ids[3]]});assert.equal(save.ok,true);
let rt=g.compiled.routes.find(r=>r.svc===save.id);assert.equal(rt.stIds.length,2);assert.equal(rt.skipped,3);assert.equal(F.plan(g,g.model.net)[g.compiled.routes.indexOf(rt)].avail[0],0);
F.move(g,[added[1].id],lid,save.id);assert.equal(F.trainsOf(g,lid,save.id).length,1);
assert.equal(F.removeService(g,lid,save.id).ok,true);assert.equal(added[1].line,lid);assert.notEqual(added[1].svc,save.id);
for(let i=0;i<6;i++)assert.equal(F.saveService(g,lid,{name:'Short '+i,from:ids[1],to:ids[3]}).ok,true);
assert.ok(F.saveService(g,lid,{name:'Too many'}).error);assert.equal(g.compiled.routes.filter(r=>r.svc).length,6);
for(const s of [...g.net.lines[lid].svcs])F.removeService(g,lid,s.id);
assert.deepEqual(Array.from(C.CFG.metro.speedGrades,x=>x.kmh),[40,60,80,100,120]);
const cheap=M.speedGrade({speed:40}),fast=M.speedGrade({speed:120});assert.ok(fast.minR>cheap.minR);
console.log('PASS express/short services, six-service cap, removed-service redistribution and speed grades');
// TOD can make a loss; recovery deducts maintenance rather than adding gross income.
const T=C.TOD,cost=T.stationCost(3,g.clock.y,'M',false);assert.ok(cost>0);assert.ok(T.stationDaily(3,0,false,g.clock.y,g)-cost<0);
assert.equal(C.Tasks.recoveryOf({fare:100,commerce:30,todCost:20,ops:100}),1.1);
const s=g.net.stations[ids[0]];s.tod=3;g.model.solveNow(4);const d=T.daily(g,'wd');assert.ok(d.cost>0);assert.ok(Number.isFinite(d.rev));
// Compound conditions distinguish core completion and retain partial rewards at expiry.
const tasks=new C.Tasks(),task={id:'compound',kind:'hist',type:'combo',title:'Compound',desc:'Fixture',issuedAt:[2000,1],deadline:[g.clock.y,g.clock.m],reward:1000,parts:[{core:true,kind:'reach',type:'coverage',target:0},{kind:'reach',type:'coverage',target:2}]};
const eval0=tasks.evaluate(task,g);assert.equal(eval0.ok,false);assert.equal(eval0.coreOk,true);assert.equal(eval0.parts.length,2);
const oldTasks=g.tasks;g.tasks=tasks;tasks.active=[task];tasks.nextDyn=g.ym()+100;tasks.offerMonthly=()=>[];tasks.monthly(g);assert.equal(tasks.done[0].partial,true);assert.equal(task.reward,600);assert.ok(!g.econ.mods.some(m=>m.reason==='任务未完成：Compound'));g.tasks=oldTasks;
const orig={id:'fixture',type:'coverage',target:.2,reward:100};C.TaskPlans.tutorial={fixture:{parts:[{kind:'reach',type:'coverage',target:.3}]}};
const planned=C.Tasks.withPlan(g,orig);assert.equal(planned.type,'combo');assert.equal(planned.reward,150);assert.equal(orig.type,'coverage');delete C.TaskPlans.tutorial;
console.log('PASS commercial losses/net recovery, compound core evaluation, partial rewards and immutable published plans');
// Deterministic tender result, monthly idempotence, completion pay and default consequences.
const P=C.Corp;C.DATA.noDynTasks=false;g.tutorial=false;g.mapId='bj';g.clock.y=2005;g.clock.m=1;g.startYear=1990;
assert.equal(P.enabled(g),true);assert.equal(P.flavor(g).from,2002);
g.corp={v:1,seq:1,rating:60,ym:g.ym()-1,next:g.ym()+100,tenders:[],contracts:[],closed:[],cool:{}};
const tender=P.terms({id:'P-test',type:'line',title:'Test PPP',est:100000,buildM:12,forecast:1000,anchors:ids.slice(0,2).map(id=>({...g.net.stations[id],r:1})),area:{x:s.x,y:s.y,r:4},expires:g.ym()+5});g.corp.tenders.push(tender);
assert.equal(P.bid(g,tender.id,'std').ok,true);assert.ok(P.bid(g,tender.id,'low').error);
const serialized=copy(g.serialize());serialized.meta.map='tutorial';const a=C.Game.restore(copy(serialized)),b=C.Game.restore(copy(serialized));a.mapId=b.mapId='bj';
a.clock.m=b.clock.m=2;P.monthly(a);P.monthly(b);assert.equal(JSON.stringify(a.corp),JSON.stringify(b.corp));assert.equal(a.econ.funds,b.econ.funds);
const funds=a.econ.funds;P.monthly(a);assert.equal(a.econ.funds,funds);
// Use a guaranteed eligible contract to exercise pay and failure regardless of the deterministic bid draw.
const con={...copy(tender),id:'C-pay',opt:tender.opts[1],signed:g.ym(),deadline:g.ym()+12,phase:'build',paid:{},status:'active',opsM:120};delete con.opts;
g.corp.contracts=[con];g.corp.tenders=[];g.corp.ym=g.ym()-1;P.monthly(g);assert.equal(con.phase,'ops');assert.ok(con.paid.sub>0&&con.paid.refund>0);
g.clock.m++;P.monthly(g);assert.ok(con.paid.ap>0);const paid=con.paid.ap;P.monthly(g);assert.equal(con.paid.ap,paid);
P.quit(g,con.id);assert.equal(g.corp.contracts.length,0);assert.equal(g.corp.closed.at(-1).status,'failed');assert.ok(g.econ.mods.some(m=>m.kind==='grant'&&m.factor===.9));
g.opsNote={streak:{a:2},snooze:{a:g.ym()+12},lastPop:g.ym()};
g.mapId='tutorial';const saved=copy(g.serialize()),restored=C.Game.restore(copy(saved));F.ensure(restored);
assert.equal(JSON.stringify(restored.fleet),JSON.stringify(g.fleet));assert.equal(JSON.stringify(restored.corp),JSON.stringify(g.corp));assert.equal(JSON.stringify(restored.opsNote),JSON.stringify(g.opsNote));assert.equal(restored.econ.funds,g.econ.funds);
console.log('PASS deterministic bids, monthly payment idempotence, build/operations/default and v2.5 save restoration');
const netCopy=M.clone(g.net);M.removeMany(netCopy,[ids[2]],[]);assert.ok(!netCopy.stations[ids[2]]);assert.ok(g.net.stations[ids[2]]);
console.log('PASS batch demolition preview preserves official network');
// Directional loop schedules and old-rule backup exercise real fleet/save code.
const loopNet=M.empty(),loopLine=M.newLine(loopNet),loopIds=[[10,10],[18,10],[18,18],[10,18]].map(([x,y])=>M.addStation(loopNet,x,y,{size:'M',type:'underground'},g.city));
for(let i=0;i<4;i++)M.addSegment(loopNet,loopLine,loopIds[i],loopIds[(i+1)%4],[],'underground');
const loop=Object.create(g);loop.net=loopNet;loop.compiled=M.compile(loopNet,g.city);loop.fleet=null;loop.model=new C.Model(g.city);loop.model.setNetwork(loop.compiled);loop.model.solveNow(1);F.ensure(loop);
assert.equal(loop.compiled.routes[0].loop,true);F.setMode(loop,loopLine,'manual');F.setManual(loop,loopLine,'cw',0,1);F.setManual(loop,loopLine,'ccw',0,0);
const lp=F.plan(loop,loop.model.net)[0];assert.equal(lp.manual[0][0],1);assert.equal(lp.manual[1][0],0);assert.ok(lp.avail[0]>0&&lp.avail[1]>0);
assert.ok(lp.units[0].every(a=>!lp.units[1].some(b=>b.id===a.id)),'Loop directions must not reuse the same train');
const upgradeBody=JSON.stringify({...g.serialize(),rulesRevision:5}),upgradeRaw=JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,gameVersion:'2.4.0',savedAt:Date.now(),body:upgradeBody,checksum:C.U.fnv(upgradeBody)});
const imported=await C.Save.importText(upgradeRaw),loaded=await C.Save.load(imported.slotId);assert.ok(loaded.__backupSlot);
assert.equal(JSON.parse(memory.get(C.Save.slotInfo(loaded.__backupSlot).key)).body,upgradeBody);
console.log('PASS separate loop directions and exact original v2.4 rules backup');
// 2.5D station culling must work without any standalone 3D projection matrix.
await load('js/render.js');
const draw=new Proxy({},{get:(o,k)=>o[k]||(()=>{})}),R=new C.Renderer({getContext:()=>draw});
R.game=g;R.z=24;R.tEase=1;R.w=800;R.h=600;R.stPx=g.compiled.stations.map(()=>({x:400,y:300}));
let builtModels=0;R.stationModelsOf=()=>{builtModels++;return[];};R.drawStationModels(draw,g.compiled,0);assert.ok(builtModels>0);
const first=builtModels;R.drawStationModels(draw,g.compiled,0);assert.equal(builtModels,first,'Station model metadata should be cached');
console.log('PASS Canvas 2.5D station model culling and cache without WebGL matrix');
// Standard track decorations remain available to the large-network raster cache.
for (const cs of g.compiled.segs.values()) {
 const d=R.segDeco(cs);
 assert.ok(Array.isArray(d.buried)&&Array.isArray(d.water)&&Array.isArray(d.high));
 assert.equal(R.segDeco(cs),d);
}
console.log('PASS standard track decoration generation and terrain cache');
// Final v2.5 fixes: stopped facilities inside compound tasks must not cause penalties.
{
 const T=new C.Tasks(),oldById=C.Fac.byId,originalTasks=g.tasks;
 T.nextDyn=g.ym()+100;T.offerMonthly=()=>[];g.tasks=T;
 const item=(id,fac)=>({id,kind:'hist',type:'combo',title:id,deadline:[g.clock.y+1,1],reward:100,parts:[{core:true,type:'coverage',target:0},{type:'facShare',fac,target:.1}]});
 T.active=[item('closed-facility','closed'),item('future-facility','future')];
 const money=g.econ.funds,mods=JSON.stringify(g.econ.mods);
 try{C.Fac.byId=id=>({id,T:{hub:true},open:id==='future'?g.year()+2:1900,close:id==='closed'?g.year()-1:null});T.monthly(g);}finally{C.Fac.byId=oldById;g.tasks=originalTasks;}
 assert.equal(T.adjusted.length,1);assert.equal(T.adjusted[0].status,'withdrawn');assert.equal(T.active.length,1);assert.equal(T.active[0].id,'future-facility');assert.equal(T.failed.length,0);assert.equal(g.econ.funds,money);assert.equal(JSON.stringify(g.econ.mods),mods);
}
for(const m of F.MODELS){assert.ok(C.I18N_EN[m.name]);assert.ok(C.I18N_EN[m.desc]);assert.equal(F.nameOf(m),m.name);}
console.log('PASS retired compound facilities withdraw without penalty; future facilities remain active; canonical train translations');
