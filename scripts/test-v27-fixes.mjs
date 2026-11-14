// v2.7 follow-up: real simulation, in-memory saves and isolated synthetic map rules.
import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),memory=new Map(),c={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval:()=>0,navigator:{hardwareConcurrency:4,deviceMemory:4},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};c.window=c;vm.createContext(c);
const load=async f=>vm.runInContext(await fs.readFile(new URL(f,root),'utf8'),c,{filename:f});
for(const[,f]of(await fs.readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)){await load(f);if(f==='js/save.js')break;}
const C=c.CM,M=C.Metro,copy=x=>JSON.parse(JSON.stringify(x)),sum=a=>a.reduce((s,n)=>s+n,0);C.UI=function(){};
for(const f of ['settings','icons','pages','corp','fleet','opsapp','render','sites','scenery'])await load('js/'+f+'.js');
assert.equal(C.CFG.GAME_VERSION,'2.7.1');assert.equal(C.CFG.RULES_REVISION,11);assert.equal(C.MAP_ORDER.length,12);assert.equal(C.Fleet.MODELS.length,56);assert.ok(!C.MAPS.sg&&!C.MAPS.ny&&!C.Achievements&&!C.Desktop);
C.useMap('tutorial');const g=C.Game.create({mode:'free',tutorial:true,seed:20000101}),F=C.Fleet;F.ensure(g);let fixture;
for(let y=5;y<g.city.H-5&&!fixture;y++)for(let x=5;x<g.city.W-22&&!fixture;x++){
 if([0,4,8,12,16].some(d=>!M.checkSite(g.city,x+d,y,'underground').ok))continue;
 const n=M.empty(),lid=M.newLine(n),ids=[];for(let i=0;i<5;i++)ids.push(M.addStation(n,x+4*i,y,{size:'M',type:'underground'},g.city));for(let i=1;i<5;i++)M.addSegment(n,lid,ids[i-1],ids[i],[],'underground');
 if(!M.evaluate(n,g.net,g.city,g.clock.y).conflicts.length)fixture={n,lid,ids};
}
assert.ok(fixture);g.edit(n=>Object.assign(n,fixture.n));assert.equal(g.confirmDraft().ok,true);g.model.solveNow(4);F.ensure(g);const{lid,ids}=fixture;
assert.ok(g.model.daily.metro>0);const svc=F.svcId(g.compiled.routes[0],0);F.setMode(g,lid,'manual');for(let p=0;p<4;p++)F.setManual(g,lid,svc,p,0);g.model.solveNow(4);
assert.equal(g.model.daily.metro,0);
assert.equal(g.tasks.evaluate({type:'stationCrowd',station:ids[0],start:1.1,target:.9},g).ok,false);
const liveRoute=g.compiled.routes[0],oldEnd=liveRoute.stIds.at(-1),terminal=g.net.stations[oldEnd];
assert.ok(!g.edit(n=>{const end=M.addStation(n,terminal.x+4,terminal.y,{size:'M',type:'underground'},g.city);M.addSegment(n,lid,oldEnd,end,[],'underground');})?.error);
assert.ok(g.draftCompiled().routes[0].stIds.length>liveRoute.stIds.length);
const draftPlan=F.plan(g,{C:g.draftCompiled()})[0];assert.equal(JSON.stringify(draftPlan.manual[0]),'[0,0,0,0]');
assert.equal((g.draftEval().fleetAdd||[]).length,0,'Extending a manual off route must not buy trains');g.cancelDraft();
for(const dt of ['wd','we'])for(const P of g.model.resultsFor(dt).per){assert.equal(sum(P.load),0);assert.equal(sum(P.stIn),0);assert.equal(sum(P.stOut),0);}
assert.ok(C.Tasks.crowdOf(g).every(s=>s.noTrain&&s.lf===0));assert.equal(C.OpsAlerts.scan(g).length,0);
for(let p=0;p<4;p++)F.setManual(g,lid,svc,p,1);g.model.solveNow(4);assert.ok(g.model.daily.metro>0);
F.setManual(g,lid,svc,0,0);g.model.solveNow(3);assert.equal(sum(g.model.resultsFor('wd').per[0].load),0);assert.ok(sum(g.model.resultsFor('wd').per[1].load)>0);F.setManual(g,lid,svc,0,1);
assert.equal(C.Model.boardFreq({freq:[3],freqDir:[0,6]},{R:1,C:{routes:[{loop:true}]}},0),6);assert.equal(C.Model.sectionLF(10000,0,1000),0);
C.ui={setLineLook:(id,patch)=>Object.assign(g.net.lines[id],patch)};
const express=F.saveService(g,lid,{name:'Express',skip:ids.slice(1,-1)});assert.equal(express.ok,true);F.setMode(g,lid,'auto');F.move(g,g.fleet.trains.filter(t=>t.line===lid).map(t=>t.id),lid,express.id);
const pred=F.plan(g,{C:M.compile(M.clone(g.net),g.city)});assert.equal(pred[0].avail[0],0);assert.ok(pred[1].avail[0]>0);g.model.solveNow(3);assert.ok(g.model.daily.metro>0);
console.log('PASS no-train and per-period shutdown, restored service, zero residual demand, express-only prediction and load diagnostics');

// Old-rule progress is backed up byte-for-byte, without changing assets or past accounts.
const payload=copy(g.serialize());payload.rulesRevision=10;const body=JSON.stringify(payload),raw=JSON.stringify({format:C.CFG.SAVE_FORMAT,version:2,gameVersion:'2.7.0',savedAt:Date.now(),body,checksum:C.U.fnv(body)}),imp=await C.Save.importText(raw),old=await C.Save.load(imp.slotId);
assert.ok(old.__backupSlot);assert.equal(JSON.parse(memory.get(C.Save.slotInfo(old.__backupSlot).key)).body,body);
const restored=C.Game.restore(copy(old));assert.equal(restored.econ.funds,payload.econ.funds);assert.equal(JSON.stringify(restored.net),JSON.stringify(payload.net));assert.equal(JSON.stringify(restored.econ.ledger),JSON.stringify(payload.econ.ledger));
console.log('PASS exact v2.7 rules-10 backup and preserved network, funds and historical ledger');

const byId=C.Fac.byId,facIndex=g.model.facIndex,facStats=g.model.facStats,ready=g.model.trafficReady,verified=g.model.trafficVerified,clock={...g.clock},fare=g.econ.fare;
try{
 C.Fac.byId=id=>({id,name:'Fixture',T:{hub:true},open:id==='later'?2001.5:1990,close:id==='closed'?1999:null});g.model.facIndex=()=>0;g.model.facStats=()=>({inn:100,out:0,innM:80,outM:0});g.model.trafficReady=()=>true;g.model.trafficVerified=()=>true;
 const t={type:'facShare',fac:'later',deadline:[2000,1]};C.Tasks.alignFacDeadline(t);assert.equal(JSON.stringify(t.deadline),'[2001,10]');assert.ok(t.facDelay.includes('2001 年 7 月'));assert.equal(new C.Tasks().evaluate({...t,target:.5},g).wait,true);
 const T=new C.Tasks();T.nextDyn=g.ym()+1000;T.offerMonthly=()=>[];g.tasks=T;g.econ.fare={mode:'flat',flat:1};const q={id:'fare',kind:'hist',type:'facShare',fac:'open',target:.5,fare0:10,reward:100,title:'Fare',issuedAt:[2000,1],deadline:[2000,1],status:'active'};T.active=[q];
 for(let m=1;m<=3;m++){g.clock.m=m;T.monthly(g);assert.equal(q.fareWait,m);assert.equal(T.failed.length,0);assert.ok(q.graced.includes('票价'));}
 g.clock.m=4;T.monthly(g);assert.equal(T.failed.length,1);assert.ok(q.fareWhy);const saved=copy(T.serialize());assert.ok(C.Tasks.restore(saved).failed[0].fareWhy);
 g.clock.m=5;const q2={...q,id:'recover',status:'active',fareWait:0,deadline:[2000,5]};delete q2.evaluatedYM;T.active=[q2];T.monthly(g);assert.equal(q2.fareWait,1);g.econ.fare={mode:'flat',flat:10};g.clock.m=6;T.monthly(g);assert.equal(q2.status,'done');const n=T.done.length;T.monthly(g);assert.equal(T.done.length,n);
 const mock={city:{W:1,H:1,landMax:[1],lockState:()=>({mask:[1],year:[2006]})}};assert.equal(C.Tasks.anchorsOpenBy(mock,[{x:.5,y:.5,r:.2}],2004*12),false);mock.city.lockState=()=>({mask:[1],year:[2003]});assert.equal(C.Tasks.anchorsOpenBy(mock,[{x:.5,y:.5,r:.2}],2004*12),true);
}finally{C.Fac.byId=byId;g.model.facIndex=facIndex;g.model.facStats=facStats;g.model.trafficReady=ready;g.model.trafficVerified=verified;g.clock=clock;g.econ.fare=fare;}
console.log('PASS facility deadlines and waiting, three fare deferrals, recovery, persisted failure reasons and buildable task anchors');

// Waiving a retired core facility must not award partial completion for unmet remaining goals.
{
 const prevById=C.Fac.byId,prevTasks=g.tasks,prevMode=g.econ.mode,prevReady=g.model.trafficReady,prevVerified=g.model.trafficVerified;
 try{
  C.Fac.byId=id=>({id,name:'Retired core',T:{hub:true},open:1900,close:1999});g.model.trafficReady=()=>true;g.model.trafficVerified=()=>true;g.econ.mode='challenge';
  const T=new C.Tasks();T.nextDyn=g.ym()+1000;T.offerMonthly=()=>[];g.tasks=T;
  const task=(id,target,extra=[])=>({id,kind:'hist',type:'combo',title:id,status:'active',issuedAt:[g.clock.y,g.clock.m],deadline:[g.clock.y,g.clock.m],reward:100,parts:[{core:true,type:'facShare',fac:'retired-core',target:.5},{type:'coverage',target},...extra]});
  const unmet=task('retired-core-unmet',2),met=task('retired-core-met',0),partial=task('live-core-met',2,[{core:true,type:'coverage',target:0}]);T.active=[unmet,met,partial];
  assert.equal(T.evaluate(unmet,g).coreOk,false);const funds=g.econ.funds;T.monthly(g);
  assert.equal(unmet.status,'failed');assert.equal(met.status,'done');assert.ok(!met.partial);assert.equal(partial.status,'done');assert.equal(partial.partial,true);assert.equal(g.econ.funds,funds+160);
  T.monthly(g);assert.equal(g.econ.funds,funds+160);
 }finally{C.Fac.byId=prevById;g.tasks=prevTasks;g.econ.mode=prevMode;g.model.trafficReady=prevReady;g.model.trafficVerified=prevVerified;}
}
console.log('PASS retired-core tasks require remaining goals; live core still permits partial rewards; settlement is idempotent');

// Direct access without footpaths shares the exact rule used by the facility UI.
const city=Object.create(g.city);city.walk={deg:new Uint8Array(city.V),start:new Int32Array(city.V+1),to:[],len:[]};city.waterDistAt=()=>1;
const st=g.compiled.stations[0],f={id:'external',x:st.x+1,y:st.y,ext:{dir:'W',v:[-1,0],km:10}},model=Object.create(g.model);Object.assign(model,{city,_wdist:null,_wpred:null,_treeWalk:null,_walkTrees:null});
model.fn={F:1,list:[f],key:'fixture',cells:[[city.cellAt(f.x,f.y)]],inner:[0],reach:[0],cellFac:new Map(),ringFac:new Map()};
assert.ok(C.Fac.extNear(f,st)>=0);let acc=model.computeAccess(g.compiled);assert.ok(acc.zl[model.Z]?.length);assert.ok(C.Fac.extLink(f,{compiled:g.compiled}));f.ext.gate=true;assert.equal(C.Fac.extNear(f,st),-1);assert.equal(model.computeAccess(g.compiled).zl[model.Z],null);
delete f.ext;f.x=st.x+3;model.fn.cells=[[city.cellAt(st.x+1,st.y)]];city.waterDistAt=x=>x>st.x+2?-1:1;assert.ok(model.computeAccess(g.compiled).zl[model.Z]?.some(a=>a.s===0));model.fn.cells=[[city.cellAt(f.x,f.y)]];assert.ok(!model.computeAccess(g.compiled).zl[model.Z]?.some(a=>a.s===0));
console.log('PASS roadless external-airport access, strict border portals and nearest dry facility entrance');

const ui=new C.UI();ui.g=()=>g;ui.R={};ui.markUnsaved=()=>{};ui.scheduleAutosave=()=>{};g.econ.mode='challenge';g.econ.funds=1e8;g.model.solveNow(3);
const quote=ui.batchTodQuote([ids[0],ids[1],ids[0]],2);assert.equal(quote.items.length,2);const cash=g.econ.funds;assert.equal(ui.applyBatchTod(quote).n,2);assert.equal(g.econ.funds,cash-quote.cost);assert.equal(g.net.stations[ids[0]].tod,2);
const after=g.econ.funds;assert.ok(ui.applyBatchTod(quote).error);assert.equal(g.econ.funds,after);const q3=ui.batchTodQuote([ids[2]],3);g.econ.funds=0;assert.ok(ui.applyBatchTod(q3).error);assert.equal(g.net.stations[ids[2]].tod||0,0);g.econ.funds=after;
g.edit(n=>{n.stations[ids[0]].name='Draft station';});const beforeDecor=g.econ.funds;ui.applyBatchDecor([ids[0]],{art:'mural'});assert.equal(g.net.stations[ids[0]].decor.art,'mural');g.cancelDraft();assert.equal(g.net.stations[ids[0]].decor.art,'mural');assert.equal(g.econ.funds,beforeDecor);
console.log('PASS batch development quote, one-time atomic spending, insufficient funds, duplicate selection and decoration through draft cancellation');

const original=M.clone(g.net),l2=M.newLine(original);for(const s of Object.values(original.segments).slice(2))s.line=l2;const merged=M.clone(original);for(const s of Object.values(merged.segments))s.line=lid;delete merged.lines[l2];g.net=merged;g.compiled=M.compile(merged,g.city);
const ym=g.ym();g.opsNote={trend:{l:{[lid]:[[ym-1,100,50,1,1,1]],[l2]:[[ym-1,200,70,2,2,2]]},s:{}},sig:{l:{[lid]:{},[l2]:{}},s:{}},log:[]};C.OpsAlerts.restructure(g,original);assert.equal(g.opsNote.trend.l[lid][0][1],300);assert.equal(g.opsNote.trend.l[lid][0][2],70);assert.ok(!g.opsNote.trend.l[l2]);assert.equal(g.opsNote.log[0].rs,1);
const off=M.clone(g.net),split=M.clone(off),l3=M.newLine(split);Object.values(split.segments).slice(2).forEach(s=>s.line=l3);g.net=split;g.compiled=M.compile(split,g.city);C.OpsAlerts.restructure(g,off);assert.ok(!g.opsNote.trend.l[lid]);assert.equal(g.opsNote.log.length,0);
console.log('PASS merged line trends, reset split-line trends and invalidated comparisons');

const D=C.DATA,reclaim=D.reclaim,lockEnclaves=D.lockEnclaves,landmarks=D.landmarks,list=C.Fac.list,active=C.Fac.active;
try{
 D.reclaim=[{year:2010,poly:[[0,0],[4,0],[4,4],[0,4]],holes:[[[1,1],[2,1],[2,2],[1,2]]]}];assert.equal(g.city.reclaimFeats(false)[0].rings[1].outer,false);
 const small=Object.create(C.City.prototype);Object.assign(small,{W:30,H:30,N:900,regions:[{id:'start',open:2000},{id:'later',open:2010},{id:'empty',open:2000,empty:true}],region:new Uint16Array(900),landFrac:new Float32Array(900)});small.landFrac[62]=small.landFrac[465]=1;small.region[465]=1;D.lockEnclaves=false;assert.equal(small.lockMaskFor([1,0,0])[465],0);D.lockEnclaves=true;assert.equal(small.lockMaskFor([1,0,0])[465],1);small.region[62]=2;assert.equal(small.lockMaskFor([1,0,1])[62],1);
 D.landmarks=[];const fc=Object.create(g.city);fc.regions=[{scenic:true}];fc.region=new Uint16Array(fc.N);fc.landmarkOn=[];
 const R=Object.create(C.Renderer.prototype);R.game={mapId:'tutorial'};const museum={id:'museum',lmK:-1,t:'scenic',name:'自然博物馆',x:5,y:5,r:1};C.Fac.list=()=>[museum,{...museum,id:'park',t:'park'},{...museum,id:'hidden',noModel:true}];C.Fac.active=()=>true;
 let models=R.facModels(fc,2000);assert.equal(models.length,1);assert.equal(models[0].x,5);assert.equal(models[0].y,5);
 D.landmarks=[{name:'自然博物馆',x:8,y:5}];fc.landmarkOn=[1];assert.equal(R.facModels(fc,2000).length,0);
}finally{D.reclaim=reclaim;D.lockEnclaves=lockEnclaves;D.landmarks=landmarks;C.Fac.list=list;C.Fac.active=active;}
console.log('PASS reclaim islands, island opening and permanent empty areas, scenic facility positions, label-only facilities and deduplication');
