// v2.5.1 regressions: generated fixtures and memory storage only.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),memory=new Map();
const c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
c.window=c;vm.createContext(c);
const load=async src=>vm.runInContext(await readFile(new URL(src,root),'utf8'),c,{filename:src});
for(const[,src]of(await readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)){await load(src);if(src==='js/save.js')break;}
const C=c.CM,M=C.Metro,copy=x=>JSON.parse(JSON.stringify(x));
C.UI=function(){};for(const src of ['settings','corp','fleet','screens'])await load('js/'+src+'.js');
const F=C.Fleet;
assert.equal(C.CFG.GAME_VERSION,'2.7.0');assert.equal(C.CFG.RULES_REVISION,10);
assert.equal(C.MAP_ORDER.length,12);assert.equal(F.MODELS.length,56);assert.ok(C.MAPS.ld&&C.Traits);
memory.set('cm1.newsSeen','2.7.0');assert.equal(C.UI.prototype.newsUnread(),false);
memory.set('cm1.newsSeen','2.4.0');assert.equal(C.UI.prototype.newsUnread(),true);
assert.ok(!C.NEWS.some(n=>n.v==='2.5.1'),'Patch release has no new announcement');

C.useMap('tutorial');const g=C.Game.create({mode:'free',tutorial:true,seed:20000101});F.ensure(g);
// A legacy smooth segment must keep its shape and avoid a platform adjustment charge on extension.
const off=M.empty(),lid=M.newLine(off),a=M.addStation(off,10,10,{size:'M',type:'underground'},g.city),b=M.addStation(off,18,10,{size:'M',type:'underground'},g.city);
const ab=M.addSegment(off,lid,a,b,[],'underground').id;off.segments[ab].curve='smooth';
const oldControl=JSON.stringify(M.segControl(off,off.segments[ab])),oldGeometry=JSON.stringify(M.segGeom(off,off.segments[ab],g.city).pts);
const n=M.clone(off),end=M.addStation(n,15,16,{size:'M',type:'underground'},g.city),bc=M.addSegment(n,lid,b,end,[],'underground').id;n.segments[bc].curve='arc';M.lockPlatform(n,off,b,lid);
assert.equal(JSON.stringify(M.segControl(n,n.segments[ab])),oldControl);
assert.equal(JSON.stringify(M.segGeom(n,n.segments[ab],g.city).pts),oldGeometry);
assert.equal(M.platDirChanged(off,n,b,lid),false);
assert.ok(!M.evaluate(n,off,g.city,2000).changes.mod.some(x=>x.includes('调整站台方向')));
const t0=M.stationTangent(n,n.segments[ab],b),t1=M.stationTangent(n,n.segments[bc],b);assert.ok(t0[0]*t1[0]+t0[1]*t1[1]<-.999);
const savedGeometry=copy(n);assert.equal(JSON.stringify(M.segGeom(savedGeometry,savedGeometry.segments[ab],g.city).pts),oldGeometry);
// Arc geometry must survive station insertion, shared tracks and removing the inserted station.
const arc=M.empty(),al=M.newLine(arc),as=M.addStation(arc,10,10,{size:'M',type:'underground'},g.city),bs=M.addStation(arc,26,10,{size:'M',type:'underground'},g.city),ag=M.addSegment(arc,al,as,bs,[],'underground').id;arc.segments[ag].curve='arc';
const second=M.newLine(arc),cg=M.addSegment(arc,second,as,bs,[],'underground').id;arc.segments[cg].curve='arc';
const inserted=M.splitSegment(arc,ag,18,10,{size:'M',type:'underground'},g.city).station;
assert.equal(M.validate(arc),null);assert.ok(Object.values(arc.segments).every(s=>s.curve==='arc'));assert.equal(M.stationLines(arc,inserted).length,2);
M.removeStation(arc,inserted);assert.equal(M.validate(arc),null);assert.ok(Object.values(arc.segments).every(s=>s.curve==='arc'));
const fit=M.empty(),fl=M.newLine(fit),fa=M.addStation(fit,8,8,{size:'M',type:'underground'},g.city),fb=M.addStation(fit,24,15,{size:'M',type:'underground'},g.city),fg=M.addSegment(fit,fl,fa,fb,[[8.1,8.1]],'underground').id;
const fixed=M.autoFit(fit,fg,g.city,M.empty());assert.ok(!fixed.error,fixed.error);assert.ok(M.segGeom(fit,fit.segments[fg],g.city).minRadiusM>=M.minRadius(fit.lines[fl]));
const impossible=M.empty(),il=M.newLine(impossible);impossible.lines[il].speed=120;
const ia=M.addStation(impossible,10,10,{size:'M',type:'underground'},g.city),ib=M.addStation(impossible,10.2,10.2,{size:'M',type:'underground'},g.city),ig=M.addSegment(impossible,il,ia,ib,[],'underground').id;
M.setPlatformDir(impossible,ia,il,0);M.setPlatformDir(impossible,ib,il,Math.PI/2);const beforeFit=JSON.stringify(impossible);
assert.ok(M.autoFit(impossible,ig,g.city,M.clone(impossible)).error);assert.equal(JSON.stringify(impossible),beforeFit);
console.log('PASS legacy alignment, platform billing, opposite ends, arcs, shared insertion/removal and auto-fit rollback');

// Use a real operating network to allocate idle vehicles; incompatible vehicles and manual lines stay untouched.
let sample;
for(let y=5;y<g.city.H-5&&!sample;y++)for(let x=5;x<g.city.W-22&&!sample;x++){
 if([0,4,8,12,16].some(dx=>!M.checkSite(g.city,x+dx,y,'underground').ok))continue;
 const net=M.empty(),line=M.newLine(net),ids=[0,4,8,12,16].map(dx=>M.addStation(net,x+dx,y,{size:'M',type:'underground'},g.city));
 for(let k=1;k<ids.length;k++)M.addSegment(net,line,ids[k-1],ids[k],[],'underground');
 if(!M.evaluate(net,g.net,g.city,2000).conflicts.length)sample={net,line};
}
assert.ok(sample);g.edit(net=>Object.assign(net,sample.net));assert.equal(g.confirmDraft().ok,true);g.model.solveNow(2);F.ensure(g);
const line=sample.line;g.clock.y=2010;g.econ.cur.y=2010;g.model.setYear(2010);g.net.lines[line].speed=100;g.compiled=M.compile(g.net,g.city);g.model.setNetwork(g.compiled);g.model.solveNow(2);
g.fleet.trains=[];g.fleet.ver++;g.econ.mode='challenge';g.econ.funds=1e9;
const fast=F.available(g.mapId,g.clock.y).find(m=>m.kmh>=100),slow=F.available(g.mapId,g.clock.y).find(m=>m.kmh<100);assert.ok(fast&&slow);
assert.equal(F.buy(g,null,null,fast.id,4,2).ok,true);const compatible=g.fleet.trains.map(t=>t.id);
assert.equal(F.buy(g,null,null,fast.id,8,1).ok,true);assert.equal(F.buy(g,null,null,slow.id,4,1).ok,true);
const fleetBefore=JSON.stringify(g.fleet.trains),plan=F.allocPlan(g);assert.equal(JSON.stringify(g.fleet.trains),fleetBefore);assert.equal(plan.moved,2);assert.equal(plan.left,2);
assert.deepEqual(Array.from(plan.needs.flatMap(x=>x.ids)).sort(),compatible.sort());
const cash=g.econ.funds;assert.equal(F.applyAlloc(g,plan),2);assert.equal(g.econ.funds,cash);
const fill=F.fillCost(g,F.allocPlan(g));assert.ok(fill.cost>0);const preview=fill.cost;
for(const x of fill.rows)assert.equal(F.buy(g,x.x.lid,x.x.svc,x.m.id,x.cars,x.n).ok,true);
assert.ok(Math.abs(cash-g.econ.funds-preview)<1e-5);assert.equal(F.allocPlan(g).unmet,0);
F.setMode(g,line,'manual');assert.equal(F.allocPlan(g).needs.length,0);F.setMode(g,line,'auto');
g.fleet.autoAlloc=true;const fleetRoundTrip=C.Game.restore(copy(g.serialize()));assert.equal(fleetRoundTrip.fleet.autoAlloc,true);assert.equal(fleetRoundTrip.econ.funds,g.econ.funds);
console.log('PASS idle allocation, platform/speed/manual exclusions, previewed purchase cost and saved fleet preference');

// v2.5.0 originals get an exact backup; historical fare, accounts, assets and task data survive the upgrade.
const old=copy(g.serialize());old.rulesRevision=6;delete old.econ.fareMark;delete old.econ.fareAuto;delete old.econ.fareNote;delete old.fleet.autoAlloc;
const oldBody=JSON.stringify(old),oldRaw=JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,gameVersion:'2.5.0',savedAt:Date.now(),body:oldBody,checksum:C.U.fnv(oldBody)});
const imported=await C.Save.importText(oldRaw),payload=await C.Save.load(imported.slotId);assert.ok(payload.__backupSlot);
assert.equal(JSON.parse(memory.get(C.Save.slotInfo(payload.__backupSlot).key)).body,oldBody);
const upgraded=C.Game.restore(payload);assert.equal(upgraded.econ.funds,old.econ.funds);assert.equal(JSON.stringify(upgraded.net),JSON.stringify(old.net));assert.equal(JSON.stringify(upgraded.econ.ledger),JSON.stringify(old.econ.ledger));
assert.equal(upgraded.econ.fareAuto,null);assert.equal(upgraded.econ.fareMark,null);assert.equal(upgraded.fleet.autoAlloc,undefined);
assert.equal(JSON.stringify(upgraded.econ.fare),JSON.stringify(C.Economy.normFare(old.econ.fare)));
console.log('PASS exact v2.5.0 backup and opt-in defaults without historical charges or network changes');

C.useMap('bj');
const econ=new C.Economy('challenge',1990,1);econ.fare={mode:'flat',flat:2};const ym=C.U.ymIndex(1990,1);
assert.equal(C.Model.fareRef(1990),2);assert.ok(Math.abs(econ.fareHikeEffect({mode:'flat',flat:2.5},1990)+5.5)<1e-8);
assert.equal(econ.fareHikeEffect({mode:'flat',flat:2.5},2000),-.5);
econ.setFare({mode:'flat',flat:2.5},1990,1);assert.equal(econ.mods[0].until,ym+5);assert.equal(econ.mods[0].fareHike,true);
econ.setFare({mode:'flat',flat:4},1990,1);assert.equal(econ.mods[0].delta,-10);const md=JSON.stringify(econ.mods);econ.setFare({mode:'flat',flat:1.5},1990,2);assert.equal(JSON.stringify(econ.mods),md);
const legacyEcon=econ.serialize();delete legacyEcon.fareMark;delete legacyEcon.fareAuto;const legacyFare=C.Economy.restore(legacyEcon);assert.equal(legacyFare.fareMark,null);assert.equal(legacyFare.fareHikeEffect({mode:'flat',flat:1.8},2000),-.5);
const auto=new C.Economy('challenge',2000,1);auto.setFareAuto(true,2000);const base=auto.fare.flat;assert.equal(auto.fareYearly(2001,1).changed,true);assert.ok(auto.fare.flat>base);const fareOnce=JSON.stringify(auto.fare),modsOnce=JSON.stringify(auto.mods);assert.equal(auto.fareYearly(2001,1).changed,false);assert.equal(JSON.stringify(auto.fare),fareOnce);assert.equal(JSON.stringify(auto.mods),modsOnce);
const restoredAuto=C.Economy.restore(copy(auto.serialize()));assert.equal(restoredAuto.fareYearly(2001,1).changed,false);assert.equal(JSON.stringify(restoredAuto.fareAuto),JSON.stringify(auto.fareAuto));
for(const invalid of [{flat:2,inc:0,cap:0,idx:0},{flat:-2,inc:0,cap:0,idx:1},{flat:2,idx:1},{flat:2,inc:0,cap:0,idx:'1'}]){
 const payload=copy(auto.serialize());payload.fareAuto=invalid;payload.fareMark='invalid';payload.fareNote='invalid';
 const restored=C.Economy.restore(payload);assert.equal(restored.fareAuto,null);assert.equal(restored.fareMark,null);assert.equal(restored.fareNote,0);restored.fareYearly(2002,1);assert.ok(Number.isFinite(restored.fare.flat));
}
for(const y of [1990,2000,2020])for(const f of [{mode:'flat',flat:3},{mode:'dist',flat:2,km0:6,step:6,inc:1,cap:7}]){
 const vot=C.U.interp(C.CFG.choice.vot,y),tab=C.Model.fareTab(f,y,vot),fp=C.Model.fareParams(f);assert.ok(tab.every(Number.isFinite));
 for(let n=0;n<tab.length;n++){const km=n?fp.km0+(n-.5)*fp.step:Math.min(fp.km0,C.CFG.fareDist.km0);assert.ok(Math.abs(tab[n]-C.Model.fareMinAt(f,km,y,vot))<1e-8);}
}
const ref=C.Model.fareRef(1990),vot=C.U.interp(C.CFG.choice.vot,1990);assert.equal(C.Model.fareMinutes(ref,ref,vot),ref/vot*60);assert.ok(C.Model.fareMinutes(ref*1.25,ref,vot)<ref*1.25/vot*60);
C.useMap('hk');assert.ok(C.fareRangeNow({clock:{y:2020},econ:{costIndex:y=>C.U.priceIndex(y,C.CFG.cost.inflation,C.CFG.econBase)}}).max>5);
console.log('PASS fare elasticity, inflation allowance, six-month penalty, annual idempotence, lookup table and legacy restore');

// The same worker fault must release the request and wake the async browser loading/jump driver.
const pool=C.SkimPool;let wakes=0;C.CarPool.onReq=()=>wakes++;
const req={id:1,parts:[],left:1,done:false,failed:false};pool.done({job:{req,part:0}},{req:1});await Promise.resolve();assert.equal(req.done,true);assert.equal(wakes,1);
const bad={id:2,parts:[],left:1,done:false,failed:false};pool.done({job:{req:bad,part:0}},{req:3});await Promise.resolve();assert.equal(bad.failed,true);assert.equal(pool.off,true);assert.equal(wakes,2);C.CarPool.onReq=null;
console.log('PASS worker completion and mismatched-message fallback wake waiting requests');

// Real maps: facilities use land and viable districts; the missing Beijing terminal now gets a model.
for(const id of ['wh','bj','tk']){
 C.useMap(id);const city=new C.City();city.generate(12345,2024);city.unlockAll=true;
 const list=C.Fac.list(city);
 for(const f of list.filter(f=>f.gen)){assert.ok(!city.regions[f.gen.k].hub);assert.notEqual(city.regions[f.gen.k].open,null);assert.ok(city.landMax[city.cellAt(f.x,f.y)]>=.5);}
 if(id==='wh'){const model=new C.Model(city,{deferDemand:true});model.setYear(2024);model.buildZones();assert.equal(model.fn.reach.length,model.fn.F);assert.ok(model.fn.reach.every(d=>d>=0&&d<=1000));assert.ok(list.some(f=>f.name.includes('蔡甸')&&f.gen));}
 if(id==='bj'){await load('js/render.js');await load('js/scenery.js');const ctx=new Proxy({},{get:(o,k)=>o[k]||(()=>{})}),R=new C.Renderer({getContext:()=>ctx});assert.ok(R.hubModels(city,2024).some(x=>x.id==='hbj_pek'));}
 if(id==='tk'){const f=list.find(f=>f.id==='tk_narita');assert.ok(f?.ext);assert.equal(C.Fac.active(f,1978+3/12,city),false);assert.equal(C.Fac.active(f,1978+4/12,city),true);const p=C.Fac.portal(f);assert.ok(p.x>=0&&p.x<city.W&&p.y>=0&&p.y<city.H);}
}
console.log('PASS road-aware district facilities, airport exclusions, Beijing terminal and Narita opening month');
await load('js/locales/en.js');await load('js/i18n.js');C.I18n.apply('en');
assert.equal(C.I18n.text('中'),'Medium');
assert.equal(C.I18n.text('出售列车 · DK 系列 4 节'),'Sell Trains · DK series 4 cars');
assert.equal(C.I18n.text('已购买 DK 系列 4 节 × 7 列，停入车辆段'),'Bought DK series 4 cars × 7, kept in the depot');
assert.equal(C.I18n.text('已购买 DK 系列 4 节 × 7 列，配属1 号线'),'Bought DK series 4 cars × 7, assigned to Line 1');
assert.equal(C.I18n.text('随线配属列车 · 1 号线：2 列（DK 系列 4 节）'),'Trains for Line 1: 2 (DK series 4 cars)');
assert.equal(C.I18n.text('共 13 步 · 约 12 分钟'),'13 steps · about 12 min');
assert.equal(C.I18n.text('H 显示界面 · Esc 暂停并打开菜单'),'H shows the interface · Esc pauses and opens the menu');
assert.equal(C.I18n.text('恢复居民出行'),"Restoring residents' travel");
assert.equal(C.I18n.missing().length,0);
console.log('PASS complete English size, sale title, follow controls, load progress and tutorial duration');
console.log('PASS web v2.5.1 patch regressions');
