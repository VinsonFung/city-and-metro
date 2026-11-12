// Selected v2.4 gameplay regressions, using only isolated in-memory saves.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), memory = new Map();
const context = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }), localStorage: { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) } };
context.window = context; vm.createContext(context);
for (const [,src] of (await readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(src,root),'utf8'),context,{filename:src});
  if (src === 'js/save.js') break;
}
const C = context.CM, M = C.Metro;
assert.ok(parseFloat(C.CFG.GAME_VERSION)>=2.4); assert.ok(C.CFG.RULES_REVISION>=5);
assert.equal(C.MAP_ORDER.length,12); assert.equal(C.MAPS.bj.cfg.W,204); assert.equal(C.MAPS.bj.cfg.H,156);
assert.ok(C.MAPS.bj.data.initialNetwork);
if (!process.argv.includes('--tasks-only')) {
C.useMap('bj');
const beijing = C.Game.create({mode:'challenge',seed:19900101});
assert.equal(beijing.compiled.stations.length,29);
assert.equal(Object.keys(beijing.net.lines).length,2);
const interchange = beijing.compiled.stations.filter(s => s.name === '复兴门');
assert.equal(interchange.length,1);
const lines = Object.values(beijing.net.lines), ring = lines.find(l => /2/.test(l.name));
assert.equal(M.lineTopo(beijing.net,ring.id).topo,'loop');
assert.equal(M.lineTopo(beijing.net,ring.id).stations.length,18);
assert.ok(beijing.compiled.stations.every(s => s.inherited && s.built[0] <= 1990));
assert.equal(beijing.econ.cur.construction,0,'Inherited lines must not charge new construction');
const original = JSON.stringify(beijing.serialize()), restored = C.Game.restore(JSON.parse(original));
assert.equal(JSON.stringify(restored.net),JSON.stringify(beijing.net));
assert.equal(restored.econ.funds,beijing.econ.funds);
assert.equal(restored.mapInit.metro,beijing.mapInit.metro);
const daxing = C.Fac.list(beijing.city).find(f => f.id === 'bj_pkx');
assert.ok(daxing.ext); assert.equal(C.Fac.active(daxing,2019+7/12,beijing.city),false); assert.equal(C.Fac.active(daxing,2019+8/12,beijing.city),true);
console.log('PASS Beijing: 29 inherited stations, shared interchange, 18-station ring, no construction charge, restore and Daxing opening month');

// Paris later-era prices must survive both normalization and a full game save.
C.useMap('pa');
assert.equal(C.Economy.normFare({mode:'flat',flat:80}).flat,80);
const distance = C.Economy.normFare({mode:'dist',flat:80,km0:4,step:1,inc:12,cap:160});
assert.equal(distance.flat,80); assert.equal(distance.inc,12); assert.equal(distance.cap,160);
const paris = C.Game.create({mode:'free',seed:19000101});
paris.clock.y = 1960; C.applyMoneyEra(1960,1); paris.econ.fare = {mode:'flat',flat:80};
const parsed = C.Game.restore(JSON.parse(JSON.stringify(paris.serialize())));
assert.equal(parsed.econ.fare.flat,80);
assert.equal(JSON.stringify(parsed.net),JSON.stringify(paris.net));
console.log('PASS Paris later-era flat and distance fares survive save/restore');
}

C.useMap('tutorial');
const g = C.Game.create({mode:'free',tutorial:true,seed:20000101});
g.econ.fare = {mode:'flat',flat:10};
const tasks = new C.Tasks(), t = { id:'fare-gate-test',kind:'dyn',type:'zoneCong',metric:'carShare',zone:0,start:.8,target:.6,sustain:3,streak:0,samples:[],fare0:10,title:'Test',desc:'Goal',issuedAt:[2000,1],deadline:[2002,1],reward:0 };
tasks.active = [t]; tasks.nextDyn = g.ym()+100; tasks.offerMonthly = () => [];
g.tasks = tasks; g.model.zoneTraffic = () => ({carShare:.5}); g.model.trafficReady = () => true; g.model.trafficVerified = () => true;
const plain = tasks.evaluate(t,g); assert.equal(plain.ok,true);
g.econ.fare = {mode:'flat',flat:0};
assert.equal(tasks.evaluate(t,g).cheap,true); assert.equal(tasks.evaluate(t,g).ok,false);
tasks.monthly(g); assert.equal(t.samples.length,0); assert.equal(t.streak,0); assert.equal(tasks.done.length,0);
assert.ok(!/NaN|Infinity/.test(t.progress.text),'No invalid empty-sample average in the UI');
g.econ.fare = {mode:'flat',flat:10};
for (let m = 2; m <= 4; m++) { g.clock.m = m; tasks.monthly(g); }
assert.equal(tasks.done.some(x => x.id === t.id),true,'Three valid-price months may complete the congestion task');
assert.equal(C.Tasks.fareLevel({mode:'dist',flat:2,km0:4,step:2,inc:1,cap:4}),4);
assert.equal(C.Tasks.fareCheap({type:'facShare',fare0:10}, {econ:{fare:{mode:'flat',flat:0}}}),true);
assert.equal(C.Tasks.fareCheap({type:'ridership',fare0:10}, {econ:{fare:{mode:'flat',flat:0}}}),false);
const legacy = {...t,id:'legacy-fare-gate',status:'active',samples:[],streak:0}; delete legacy.fare0; delete legacy.evaluatedYM;
tasks.active = [legacy]; g.clock.m = 5; tasks.monthly(g); assert.equal(legacy.fare0,10);
assert.equal(C.Tasks.netDist({compiled:{stations:[{x:0,y:0},{x:20,y:20}],serviced:[false,true]}},20,16),4);
console.log('PASS task fare gating, finite empty averages, three valid months, old-task defaults and operating-station distance');

// Keep one eligible candidate at a time so the generated objective itself,
// rather than the implementation constants, is checked deterministically.
const oldServable=C.Tasks.facServable,oldShare=C.Tasks.facShareOf,oldGoals=C.Eras.goals;
try {
  C.Tasks.facServable=()=>true; C.Tasks.facShareOf=()=>({share:.02,vol:10000}); C.Eras.goals=()=>[];
  const facility={id:'fixture-fac',name:'测试设施',t:'rail',T:{hub:true},x:20,y:0,r:1,lmK:-1};
  const fixture={clock:{y:2000,m:1},econ:{mode:'free',costIndex:()=>1,fare:{mode:'flat',flat:10}},city:{landFrac:[1],region:[0],regions:[{scenic:false}],cellLocked:()=>false},compiled:{stations:[{id:'edge',name:'线网端点',x:0,y:0,size:'M'}],serviced:[true]},model:{Z:0,net:{acc:null},daily:{metro:0,metroShare:.1},trafficReady:()=>true,facDaily:{},fn:{list:[facility]}},zoneCong:()=>1.5,zoneName:()=> '测试片区'};
  let generated=new C.Tasks().generate(fixture);
  assert.equal(generated.type,'connect'); assert.equal(generated.anchors.length,2); assert.equal(generated.anchors[1].name,'线网端点');
  facility.x=10; generated=new C.Tasks().generate(fixture); assert.equal(generated.type,'facShare'); assert.equal(generated.target,.07); assert.equal(generated.fare0,10);
  facility.x=4; generated=new C.Tasks().generate(fixture); assert.equal(generated.target,.15);
  Object.assign(fixture.model,{Z:1,facDaily:null,fn:null,zPop:[5000],zJobs:[0],zCx:[4],zCy:[0],zoneCells:[[0]],zoneTraffic:()=>({carShare:.8,trips:1000}),zoneOpportunity:()=>100});
  generated=new C.Tasks().generate(fixture); assert.equal(generated.type,'zoneCong'); assert.ok(generated.start-generated.target>=.008 && generated.start-generated.target<=.03); assert.equal(generated.fare0,10);
  fixture.model.zCx=[20]; assert.equal(new C.Tasks().generate(fixture),null,'Distant congestion targets should not be issued');
} finally { C.Tasks.facServable=oldServable; C.Tasks.facShareOf=oldShare; C.Eras.goals=oldGoals; }
console.log('PASS generated remote connections, medium/near facility goals and nearby congestion targets');

// Changed task rules back up the original body without rewriting old history.
const old = g.serialize(); old.rulesRevision = 4;
const body = JSON.stringify(old), raw = JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,gameVersion:'2.3.0',savedAt:Date.now(),body,checksum:C.U.fnv(body)});
const imported = await C.Save.importText(raw), loaded = await C.Save.load(imported.slotId);
assert.ok(loaded.__backupSlot); assert.equal(loaded.rulesRevision,4);
const backup = C.Save.slotInfo(loaded.__backupSlot), backupText = memory.get(backup.key);
assert.equal(JSON.parse(backupText).body,body);
console.log('PASS v2.3 rules snapshot backed up without altering the original body');
