// v2.6/v2.7 browser gameplay regressions; generated cities and memory storage only.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),memory=new Map();
const c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval:()=>0,
 navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),
 localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
c.window=c;vm.createContext(c);
const load=async f=>vm.runInContext(await readFile(new URL(f,root),'utf8'),c,{filename:f});
for(const[,src]of(await readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)){await load(src);if(src==='js/save.js')break;}
const C=c.CM,M=C.Metro,copy=v=>JSON.parse(JSON.stringify(v));
C.UI=function(){};for(const f of ['settings','corp','fleet','netlayout','netreplay','review'])await load('js/'+f+'.js');
const F=C.Fleet;
assert.equal(C.CFG.GAME_VERSION,'2.7.0');assert.equal(C.CFG.RULES_REVISION,10);
assert.equal(C.MAP_ORDER.length,12);assert.equal(F.MODELS.length,56);
assert.equal(F.MODELS.filter(m=>m.maps?.includes('ld')).length,11);
assert.equal(F.MODELS.filter(m=>m.maps?.includes('sz')).length,2);
for(const mp of Object.values(C.MAPS))assert.equal(JSON.stringify(C.Traits.validate(mp)),'[]',mp.id);
assert.equal(C.NEWS[0].v,'2.7');assert.equal(C.NEWS[1].v,'2.6');
assert.ok(C.NetReplay&&!C.Desktop&&!C.Achievements);
console.log('PASS 12 maps, 56 models, all city mechanisms and two separate announcements');

C.useMap('ld');const london=C.Game.create({mode:'challenge',seed:18600101});F.ensure(london);
assert.equal(london.clock.y,1860);assert.equal(C.CFG.money.code,'GBP');assert.equal(C.CFG.money.pence,true);
assert.equal(C.Corp.flavor(london).from,1992);assert.equal(C.Corp.flavor(london),C.Traits.FLAVOR.uk);assert.equal(C.Corp.enabled(london),true);
assert.ok(C.DATA.heritage.guards.length);assert.ok(C.DATA.foresight.length>=2);assert.ok(Object.keys(C.TaskPlans.ld).length);
assert.ok(F.available('ld',1860).some(m=>m.id.startsWith('ld-')));
assert.ok(!F.available('ld',1860).some(m=>m.from>1860));
const f=C.DATA.foresight.find(x=>x.id==='ld-cw'),n=london.net,l=M.newLine(n),s=M.addStation(n,f.x,f.y,{size:'M',type:'underground'},london.city);
n.stations[s].built=[f.before-1,1];const t=M.addStation(n,f.x+4,f.y+4,{size:'M',type:'underground'},london.city);M.addSegment(n,l,s,t,[],'underground');london.clock={y:f.ym[0],m:f.ym[1],d:1,minute:360};
const cash=london.econ.funds,notices=C.Eras.foresightMonth(london,...f.ym);
assert.ok(notices.length);assert.equal(london.foresight[f.id].hit,true);assert.ok(london.econ.funds>cash);
const once=london.econ.funds;C.Eras.foresightMonth(london,...f.ym);assert.equal(london.econ.funds,once);
const late=C.DATA.foresight.find(x=>x.id!==f.id);C.Eras.foresightMonth(london,late.ym[0]+2,late.ym[1]);
assert.equal(london.foresight[late.id].late,true);assert.equal(london.econ.funds,once);
console.log('PASS London start, local models, heritage and idempotent foresight without retroactive rewards');

C.useMap('bj');const bj=C.Game.create({mode:'challenge',seed:19900101});F.ensure(bj);
assert.equal(M.xlYear(),2017);assert.equal(M.xlUnlocked(2016),false);assert.equal(M.xlUnlocked(2017),true);
assert.equal(M.sizeList(1990,'XL').at(-1),'XL');assert.equal(C.CFG.metro.stationCap.XL,140000);assert.equal(C.CFG.metro.carsBySize.XL,8);
assert.ok(M.stationCost('underground','XL',2020)>M.stationCost('underground','L',2020));
// Enclosed historic lakes inherit protection, a river leaving that district does not.
const heritage=Object.create(C.City.prototype);Object.assign(heritage,{W:4,H:3,N:12,regions:[{heritage:true},{heritage:false}],region:new Uint16Array(12),landMax:new Float32Array(12).fill(1)});
heritage.landMax[5]=0;heritage.buildHeritage();assert.equal(heritage.heritage[5],1);
heritage.landMax[6]=heritage.landMax[7]=0;heritage.region[7]=1;heritage.buildHeritage();assert.equal(heritage.heritage[5],0);
const water=Object.create(C.City.prototype);water.waterAt=()=>30001;assert.equal(water.narrowWaterAt(2,2),true);
water.waterAt=(x)=>x>2.1?1:30001;assert.equal(water.narrowWaterAt(2,2),false);
console.log('PASS XL unlock/capacity/cost and historic-lake / narrow-river boundaries');

C.useMap('sz');const sz=C.Game.create({mode:'challenge',seed:20000101});F.ensure(sz);sz.clock.y=2020;sz.model.setYear(2020);
assert.equal(C.Corp.flavor(sz),C.Traits.FLAVOR.cn);assert.equal(C.Corp.flavor(sz).from,2002);assert.equal(C.Corp.enabled(sz),true);
sz.econ.fare={mode:'flat',flat:9};sz.model.fare=sz.econ.fare;
assert.equal(sz.city.W,244);assert.equal(sz.city.H,144);
const gate=C.Fac.list(sz.city).find(f=>f.ext?.gate&&f.open<=2020),P=C.Fac.portal(gate);
assert.ok(gate);assert.equal(C.CityLink.connected(sz),false);
const lid=M.newLine(sz.net),a=M.addStation(sz.net,P.x,P.y,{size:'M',type:'underground'},sz.city),b=M.addStation(sz.net,P.x+4,P.y+4,{size:'M',type:'underground'},sz.city);
M.addSegment(sz.net,lid,a,b,[],'underground');sz.compiled=M.compile(sz.net,sz.city);
assert.equal(C.Fac.extLink(gate,sz),null,'nearby ordinary station must not open a border gate');
sz.net.stations[a].portal=gate.id;sz.compiled=M.compile(sz.net,sz.city);sz.model.setNetwork(sz.compiled);
assert.equal(C.CityLink.connected(sz),true);assert.ok(C.Fac.extLink(gate,sz).portal);
assert.equal(sz.setCrossFee(gate.id,Infinity),false);assert.equal(sz.setCrossFee('unknown',2),false);
assert.equal(sz.setCrossFee(gate.id,3),true);assert.ok(sz.model.crossMin(gate)>0);
assert.equal(sz.model.crossFee,sz.econ.cross);assert.equal(sz.setCrossFee(gate.id,3),false);
const mock={econ:{cross:{[gate.id]:3}},model:{facStats:()=>({innM:12,outM:8})}};assert.equal(C.CityLink.dayIncome(mock,'wd'),60);
const restored=C.Game.restore(copy(sz.serialize()));assert.equal(restored.econ.cross[gate.id],3);assert.equal(restored.model.crossFee,restored.econ.cross);
assert.equal(restored.model.crossMin(gate),sz.model.crossMin(gate));
const gateWalk=(g)=>g.model.net.acc.zl[g.model.Z+g.model.fn.ids.indexOf(gate.id)][0].w;
assert.ok(Math.abs(gateWalk(restored)-(1+restored.model.crossMin(gate)))<1e-6,'restored access cost must use the saved custom fare from its first calculation');
restored.econ.fare.flat=6;restored.model.wake(2);
assert.ok(Math.abs(gateWalk(restored)-(1+restored.model.crossMin(gate)))<1e-6,'fare changes must refresh cached border costs without rebuilding walking paths');
console.log('PASS Shenzhen, actual portal-only border access, fare cost, income and save restoration');

// Choose newest normal save across progress groups, preserving the mode boundary.
const list=C.Save.list;C.Save.list=()=>[{mode:'challenge',slots:[{slotId:'old',savedAt:5},{slotId:'backup',kind:'backup',savedAt:100}]},{mode:'free',slots:[{slotId:'free',savedAt:200}]},{mode:'challenge',slots:[{slotId:'new',savedAt:20}]}];
assert.equal(C.CityLink.latest('challenge').slotId,'new');assert.equal(C.CityLink.latest('free').slotId,'free');C.Save.list=list;
const saved=await C.Save.save(restored,'manual');assert.equal(saved.ok,true);
const raw=memory.get(C.Save.slotInfo(saved.slotId).key),pv=await C.Save.linePreview(saved.slotId);
assert.equal(pv.lines,1);assert.equal(pv.stations,2);assert.equal(memory.get(C.Save.slotInfo(saved.slotId).key),raw);
console.log('PASS newest same-mode city save and non-mutating browser line preview');

// Review has no desktop achievement dependency and is part of the ordinary save.
restored.tasks.done=[{},{}];restored.tasks.failed=[{}];restored.history=[];
restored.model.daily={coverage:.5,metroShare:.2,congAM:1.3,crowdShare:.02,commute:30};
restored.clock.y=C.CFG.growth.histEnd+1;
const rec=C.Review.compute(restored);assert.equal(rec.dims.find(d=>d.k==='goal').score,67);
assert.ok(rec.dims.every(d=>Number.isFinite(d.score)&&d.score>=0&&d.score<=100));assert.ok(C.Review.due(restored));
restored.cityReview=rec;assert.equal(C.Review.due(restored),false);
assert.equal(C.Game.restore(copy(restored.serialize())).cityReview.score,rec.score);
const legacy=copy(sz.serialize());legacy.meta.gameId+='-legacy';legacy.rulesRevision=7;delete legacy.econ.cross;delete legacy.cityReview;
const body=JSON.stringify(legacy),original=JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,gameVersion:'2.5.1',savedAt:1,body,checksum:C.U.fnv(body)});
const imported=await C.Save.importText(original),up=await C.Save.load(imported.slotId);
assert.ok(up.__backupSlot);assert.equal(JSON.parse(memory.get(C.Save.slotInfo(up.__backupSlot).key)).body,body);
const upgraded=C.Game.restore(up);assert.equal(upgraded.econ.funds,legacy.econ.funds);assert.equal(JSON.stringify(upgraded.net),JSON.stringify(legacy.net));assert.equal(JSON.stringify(upgraded.econ.cross),'{}');
console.log('PASS bounded city review, persisted report and exact v2.5.1 rules backup');
