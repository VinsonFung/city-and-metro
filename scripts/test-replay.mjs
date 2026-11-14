// Isolated construction/save regressions; fixtures never access player storage.
import {readFile} from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),memory=new Map();
const c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,navigator:{hardwareConcurrency:4},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};c.window=c;vm.createContext(c);
const load=async f=>vm.runInContext(await readFile(new URL(f,root),'utf8'),c,{filename:f});
for(const[,src]of(await readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)){await load(src);if(src==='js/save.js')break;}
const C=c.CM,M=C.Metro,copy=x=>JSON.parse(JSON.stringify(x));C.UI=function(){};await load('js/settings.js');
// Observe the pure timeline/estimator functions inside this VM without adding test APIs to the game.
vm.runInContext((await readFile(new URL('js/corp.js',root),'utf8')).replace('  const makeTender =','  Corp.testUpgradeCandidate = upgradeCand;\n  const makeTender ='),c);
vm.runInContext((await readFile(new URL('js/netreplay.js',root),'utf8')).replace('  CM.NetReplay = {','  CM.testReplay = {collect, subnet, timeWarp, newsList, schedule, prepare, useAPI: api => A = api};\n  CM.NetReplay = {'),c);
await load('js/netlayout.js');
vm.runInContext((await readFile(new URL('js/netmap.js',root),'utf8')).replace('  CM.NetMap = NetMap;','  CM.testMapAPI = API; CM.testMapMode = v => geographic = v; CM.NetMap = NetMap;'),c);
C.useMap('tutorial');const g=C.Game.create({mode:'free',tutorial:true,seed:20000101});let sample;
for(let y=5;y<g.city.H-5&&!sample;y++)for(let x=5;x<g.city.W-22&&!sample;x++){
 const n=M.empty(),lid=M.newLine(n),ids=[];
 if([0,4,8,12,16].some(dx=>!M.checkSite(g.city,x+dx,y,'underground').ok))continue;
 for(let i=0;i<5;i++)ids.push(M.addStation(n,x+4*i,y,{size:'M',type:'underground'},g.city));
 for(let i=1;i<ids.length;i++)M.addSegment(n,lid,ids[i-1],ids[i],[],'underground');
 if(!M.evaluate(n,g.net,g.city,g.clock.y).conflicts.length)sample={n,lid,ids};
}
assert.ok(sample);const{lid,ids}=sample;g.edit(n=>Object.assign(n,sample.n));assert.equal(g.confirmDraft().ok,true);
const first=copy(g.net);assert.equal(g.netGone,undefined);g.clock.m=2;
// Failed edits may already have mutated objects held by a cached compiled network.
g.ensureDraft();const originalX=g.draft.net.stations[ids[0]].x,unchangedNet=JSON.stringify(g.net);g.draftCompiled();
assert.ok(g.edit(n=>{n.stations[ids[0]].x+=3;return{error:'Fixture failure'}}).error);
assert.equal(g.draft.net.stations[ids[0]].x,originalX);assert.equal(g.draftCompiled().net.stations[ids[0]].x,originalX,'A failed edit must invalidate compiled geometry that references the mutated objects');
g.draftCompiled();assert.ok(g.edit(n=>{delete n.stations[ids[0]]}).error);assert.ok(g.draftCompiled().net.stations[ids[0]],'Validation rollback must also invalidate compiled references');
assert.equal(JSON.stringify(g.net),unchangedNet);assert.equal(g.draft.undo.length,0);g.cancelDraft();
g.edit(n=>M.removeMany(n,[ids[4]],[]));assert.equal(g.netGone,undefined);g.cancelDraft();assert.equal(g.netGone,undefined);
g.edit(n=>M.splitLineAt(n,lid,ids[2]));g.pending={};assert.equal(g.confirmDraft().ok,false);assert.equal(g.netGone,undefined);g.pending=null;
g.undo();g.redo();assert.equal(g.netGone,undefined);assert.equal(g.confirmDraft().ok,true);
const other=Object.keys(g.net.lines).find(id=>id!==lid),relabeled=Object.values(g.net.segments).filter(s=>s.line===other);assert.ok(relabeled.length);
for(const s of relabeled)assert.equal(JSON.stringify(s.lh),JSON.stringify([[g.clock.y,2,lid]]));
assert.equal(g.netGone.lines[lid].name,first.lines[lid].name);
g.clock.m=3;g.edit(n=>M.mergeLines(n,lid,other));assert.equal(g.confirmDraft().ok,true);assert.ok(g.netGone.lines[other]);
for(const old of relabeled)assert.equal(JSON.stringify(g.net.segments[old.id].lh),JSON.stringify([[g.clock.y,2,lid],[g.clock.y,3,other]]));
g.clock.m=4;g.net.stations[ids[4]].pd={[lid]:Math.PI/3};const endSeg=Object.values(g.net.segments).find(s=>s.a===ids[4]||s.b===ids[4]);g.edit(n=>M.removeMany(n,[ids[4]],[]));assert.equal(g.confirmDraft().ok,true);
assert.equal(g.netGone.stations[ids[4]].name,first.stations[ids[4]].name);assert.equal(JSON.stringify(g.netGone.segments[endSeg.id].gone),JSON.stringify([g.clock.y,4]));
assert.equal(g.netGone.stations[ids[4]].pd[lid],Math.PI/3,'Demolition history must retain platform orientation for track geometry');
const history=JSON.stringify(g.netGone),active=JSON.stringify(g.net);g.clock.m=5;
const R=C.testReplay,H=R.collect(g),at=m=>g.clock.y+(m-1)/12;
assert.equal(Object.keys(R.subnet(H,at(1)).segments).length,4);assert.equal(Object.keys(R.subnet(H,at(2)).lines).length,2);
assert.equal(Object.keys(R.subnet(H,at(3)).lines).length,1);assert.equal(Object.keys(R.subnet(H,at(4)).segments).length,3);
const news=R.newsList(H,R.timeWarp(H)).map(x=>x.text).join('\n');assert.match(news,/拆出/);assert.match(news,/贯通/);
assert.equal(JSON.stringify(g.netGone),history);assert.equal(JSON.stringify(g.net),active);
const save=await C.Save.save(g,'manual');assert.equal(save.ok,true);const payload=await C.Save.load(save.slotId),restored=C.Game.restore(payload);
assert.equal(JSON.stringify(restored.netGone),history);assert.equal(JSON.stringify(restored.net),active);
const old=copy(g.serialize());delete old.netGone;for(const s of Object.values(old.net.segments))delete s.lh;
const legacy=C.Game.restore(old);assert.equal(legacy.netGone,null);assert.equal(R.collect(legacy).segs.length,3);
console.log('PASS confirmed history, cancelled/failed drafts, undo/redo, splits/merges, demolition, replay timeline, browser save and legacy restoration');
// The final month needs room for its construction animation; historical lengths cannot depend on today's compiled tracks.
const recent={...g,net:copy(first),netGone:null,clock:{...g.clock,m:5}};Object.values(recent.net.segments).at(-1).built=[g.clock.y,5];
const recentH=R.collect(recent),warp=R.timeWarp(recentH);R.schedule(recentH,warp);
assert.ok(recentH.segs.every(s=>s.p0+s.gd<=1),'A line built this month must finish growing before the end of replay');
R.useAPI(C.testMapAPI);
for(const geographic of[true,false]){C.testMapMode(geographic);const prepared=R.prepare(g);assert.ok(prepared.km.get(endSeg.id)>0,'Retired track length must be included in historical mileage');}
const fixed=R.prepare(g);assert.equal(fixed.layout.route.size,R.collect(g).segs.length);assert.ok(fixed.W.dur>=30&&fixed.W.dur<=150);
console.log('PASS current-month construction finishes in replay and demolished track lengths survive in both layouts');
// An XL station must never reduce the contract estimate for the smaller stations on the same route.
const sizes=['M','L','XL'],candidate={mapId:'bj',clock:{y:2020,m:1},ym:()=>24240,econ:{costIndex:()=>1},net:{lines:{l:{name:'Fixture'}}},tasks:{active:[],offers:[]},compiled:{stations:sizes.map(size=>({size,type:'underground'})),routes:[{lineId:'l',stIdx:[0,1,2]},{lineId:'l',stIdx:[0,1,2]}]}};
const crowd=C.Tasks.crowdOf;C.Tasks.crowdOf=()=>[{lid:'l',lf:1.1,cars:4}];const P={cool:{},tenders:[],contracts:[]};
const estimate=C.Corp.testUpgradeCandidate(candidate,P);assert.equal(estimate.n,1);assert.equal(estimate.est,Math.round((C.CFG.cost.station.underground.L-C.CFG.cost.station.underground.M)*1.1/1000)*1000);
candidate.compiled.stations[0].size='XL';assert.equal(C.Corp.testUpgradeCandidate(candidate,P),null);C.Tasks.crowdOf=crowd;
for(const[id,year]of[['ld',1992],['sz',2002]]){const state={mapId:id,clock:{y:year-1},ym:()=>year*12,econ:{mode:'challenge'},compiled:{stations:[],routes:[]},net:{lines:{},stations:{},segments:{}},model:{trafficReady:()=>true}};C.useMap(id);const before=C.Corp.unlockState(state);assert.equal(before.ok,false);state.clock.y=year;assert.equal(C.Corp.flavor(state).from,year);assert.equal(C.Corp.enabled(state),true);}
console.log('PASS XL contract valuation, repeated route de-duplication, London PFI and Shenzhen PPP');
