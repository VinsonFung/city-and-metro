// Gameplay regressions use an isolated VM and memory storage, never player saves.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),memory=new Map();
const context={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
context.window=context;vm.createContext(context);
for(const [,src]of(await readFile(path.join(root,'index.html'),'utf8')).matchAll(/<script src="([^"]+)"/g)){
 vm.runInContext(await readFile(path.join(root,src),'utf8'),context,{filename:src});if(src==='js/save.js')break;
}
const C=context.CM,M=C.Metro;
assert.match(C.CFG.GAME_VERSION,/^2\./);assert.ok(C.CFG.RULES_REVISION>=4);
for(const id of C.MAP_ORDER.filter(id=>id!=='tutorial')){
 const m=C.MAPS[id];assert.equal(m.data.scenarios.length,2,id+' must have two city challenges');
 for(const t of m.data.scenarios)for(const a of t.anchors||[]){if(Array.isArray(a))assert.ok(m.data.places.some(p=>(Array.isArray(p)?p[0]:p.name)===a[0]),id+' challenge anchor '+a[0]);else assert.ok(a.x>=0&&a.y>=0&&a.x<m.cfg.W&&a.y<m.cfg.H);}
}
console.log('PASS city challenges and valid place anchors for all real maps');
C.useMap('tutorial');const g=C.Game.create({mode:'challenge',seed:20000101});
let sample;
for(let y=5;y<g.city.H-5&&!sample;y+=2)for(let x=6;x<g.city.W-9&&!sample;x+=2){
 const n=M.empty(),l1=M.newLine(n),l2=M.newLine(n),ids=[];
 if([x-3,x,x+3,x+6].some(q=>!M.checkSite(g.city,q,y,'underground').ok))continue;
 for(const q of [x-3,x,x+3,x+6])ids.push(M.addStation(n,q,y,{size:'M',type:'underground'},g.city));
 M.addSegment(n,l1,ids[1],ids[2],[],'underground');M.addSegment(n,l1,ids[2],ids[3],[],'underground');M.addSegment(n,l2,ids[0],ids[1],[],'underground');
 if(!M.evaluate(n,g.net,g.city,g.clock.y).conflicts.length)sample={n,l1,l2,ids};
}
assert.ok(sample,'Need a legal shared-track sample');
g.edit(n=>Object.assign(n,sample.n));assert.equal(g.confirmDraft().ok,true);g.model.solveNow(4);
const before=M.clone(g.net),n=M.clone(g.net),r=M.runAlong(n,sample.l2,sample.ids[1],sample.l1,sample.ids[3]);
assert.equal(r.added,2);assert.equal(M.lineTopo(n,sample.l2).stations.length,4);
const ev=M.evaluate(n,before,g.city,g.clock.y);assert.equal(ev.conflicts.length,0);assert.equal(ev.total,0,'Shared operating extensions must not charge for existing track');
assert.equal(M.runAlong(n,sample.l2,sample.ids[1],sample.l1,sample.ids[3]).error,'这一段已经是本线的轨道');
console.log('PASS operating extension shares physical track without construction charge');
const collision=M.empty(),cl=M.newLine(collision),point=g.net.stations[sample.ids[1]],ca=M.addStation(collision,point.x,point.y,{size:'S',type:'underground'},g.city),cb=M.addStation(collision,point.x,point.y,{size:'S',type:'underground'},g.city);
M.addSegment(collision,cl,ca,cb,[],'underground');const guide=M.conflictGuide(collision,{kind:'station',type:'spacing',ref:ca,ref2:cb},g.city);
assert.ok(guide.fix&&guide.arrow.m>0);M.applyFix(collision,guide.fix);assert.ok(C.U.dist(collision.stations[ca].x,collision.stations[ca].y,point.x,point.y)*C.CFG.CELL_M>=C.CFG.metro.minSpacingM);
assert.ok(!M.evaluate(collision,M.empty(),g.city,g.clock.y).conflicts.some(c=>c.type==='spacing'));
console.log('PASS spacing guidance and one-click repair for overlapping stations');

const m=g.model;
m.setHabit(()=>0);assert.ok(Array.from(m.habit).every(x=>x===0));
m.setHabit(()=>2);const mid=Array.from(m.habit);m.setHabit(()=>4);const mature=Array.from(m.habit);
assert.ok(mature.some(x=>x>0));assert.ok(mature.every((x,i)=>x>=mid[i]&&x<=1));
const version=m.habitVer;m.setHabit(()=>4);assert.equal(m.habitVer,version,'Unchanged maturity must not restart traffic solving');
m.setHabit(C.Game.habitAge(g));
g.clock.y+=4;m.setYear(g.year());m.setHabit(C.Game.habitAge(g));const pull=g.metroPull();
assert.ok(pull&&pull.top.length);assert.ok(Array.from(pull.field).some(x=>x>0));
const total=a=>a.reduce((s,x)=>s+x,0),pop=total(g.city.pop),jobs=total(g.city.jobs);g.metroPull();
assert.equal(total(g.city.pop),pop);assert.equal(total(g.city.jobs),jobs,'Computing station attraction must not create population or jobs');
console.log('PASS station maturity, stable solver inputs and non-mutating development field');

const sid=sample.ids[1];g.net.stations[sid].tod=1;g.net.stations[sid].decor={style:'garden',color:'#1a9868',art:'mural',sign:'enamel'};g.net.stations[sid].renov=g.clock.y;
g.model.solveNow(4);g.clock.d=10;const income=C.TOD.daily(g,g.dayType());assert.ok(income.rev>0,'Operating station should earn commercial income');
const funds=g.econ.funds,cur=g.econ.cur.commerce;g.endDay();
assert.ok(g.econ.cur.commerce>cur);assert.ok(Math.abs((g.econ.funds-funds)-(g.econ.lastDay.fare-g.econ.lastDay.ops+income.rev-income.cost))<1e-6,'Commercial income must be booked once beside fares and operations');
const e=C.Economy.restore(JSON.parse(JSON.stringify(g.econ.serialize())));assert.equal(JSON.stringify(e.serialize()),JSON.stringify(g.econ.serialize()));
const legacy=JSON.parse(JSON.stringify(g.econ.serialize()));delete legacy.cur.commerce;for(const r of legacy.ledger)delete r.commerce;
assert.equal(C.Economy.restore(legacy).cur.commerce,0);
const built=g.econ.built,levelCost=C.TOD.cost(2,g.clock.y,'M',false);g.econ.spendBuild({construction:levelCost},'test commercial investment',g.clock,true);assert.equal(g.econ.built,built,'Commercial investment must not consume a construction challenge budget');
console.log('PASS commercial daily cash, stable ledger round trip and legacy defaults');

const snap=g.congSnapshot();assert.ok(snap&&snap.q.length===g.model.road.nA);snap.label='Test line';g.congRef={build:snap,year:snap};
const packed=C.Game.packCong(g.congRef),unpacked=C.Game.unpackCong(JSON.parse(JSON.stringify(packed)));
assert.deepEqual(Array.from(unpacked.build.q),Array.from(snap.q));assert.equal(unpacked.build.label,'Test line');
assert.equal(C.Game.unpackCong({build:{q:'%invalid'}}).build,undefined);
console.log('PASS congestion comparison compact serialization and corrupt optional data');

C.UI=function(){};C.icon=()=>null;vm.runInContext(await readFile(path.join(root,'js/voices.js'),'utf8'),context,{filename:'js/voices.js'});
const posts=C.Voices.generate(g);assert.ok(posts.length);assert.equal(JSON.stringify(C.Voices.generate(g)),JSON.stringify(posts));
assert.ok(posts.every(p=>!/undefined|\bnull\b/.test(p.text)));
assert.ok(C.Voices.replies(g,posts[0]).length>=2);
const first=posts[0];C.Voices.setFollow(g,first,true);assert.equal(C.Voices.isFollowed(g,first.who.handle),true);
for(let i=0;i<16;i++){g.clock.m++;if(g.clock.m>12){g.clock.m=1;g.clock.y++;}C.Voices.generate(g);}
for(const f of Object.values(C.Voices.follows(g)))assert.ok(f.posts.length>1&&f.posts.length<=12);
const state=JSON.parse(JSON.stringify(g.serialize())),restored=C.Game.restore(state);
assert.equal(restored.net.stations[sid].tod,1);assert.equal(restored.net.stations[sid].decor.art,'mural');assert.deepEqual(JSON.parse(JSON.stringify(restored.voices)),state.voices);assert.equal(restored.congRef.build.label,'Test line');
C.Voices.setFollow(g,first,false);assert.equal(C.Voices.isFollowed(g,first.who.handle),false);
const old=JSON.parse(JSON.stringify(state));delete old.voices;delete old.congRef;for(const s of Object.values(old.net.stations)){delete s.tod;delete s.decor;delete s.renov;}
const oldRestored=C.Game.restore(old);assert.equal(oldRestored.congRef,null);assert.equal(oldRestored.voices,undefined);assert.ok(Object.values(oldRestored.net.stations).every(s=>!s.tod));
console.log('PASS deterministic passenger feedback, bounded following and v2.2 optional-field compatibility');
console.log('PASS web v2.3 gameplay regressions');
