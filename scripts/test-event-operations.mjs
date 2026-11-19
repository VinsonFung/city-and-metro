// Regression checks for the shared operating and construction rules.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const scope={console,performance,atob,btoa,TextEncoder,TextDecoder,setTimeout,clearTimeout,
  navigator:{hardwareConcurrency:4},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>null}};
scope.window=scope;
vm.createContext(scope);
const load=async name=>vm.runInContext(await readFile(new URL(name,root),'utf8'),scope,{filename:name});
for(const [,name] of (await readFile(new URL('index.html',root),'utf8')).matchAll(/<script src="([^"]+)"/g)){
  await load(name);
  if(name==='js/save.js')break;
}
scope.CM.UI=function () {};
await load('js/corp.js');
const C=scope.CM, M=C.Metro, T=C.Tasks;
const existing=['bj','gz','hk','hz','ld','ny','pa','sg','sh','sy','sz','tk','tp','wh'];
const eventIds=new Set();
for(const id of existing){
  C.useMap(id);
  const events=C.DATA.events.filter(e=>e.task);
  assert.ok(events.length>0,id);
  for(const {task} of events){
    assert.ok(!eventIds.has(task.id),task.id);
    eventIds.add(task.id);
    for(const anchor of task.anchors||[])if(Array.isArray(anchor))
      assert.ok(T.placeOf(anchor[0]),id+' anchor '+anchor[0]);
    if(task.fac)assert.ok(C.DATA.facilities.some(f=>f.id===task.fac),id+' facility '+task.fac);
  }
}
assert.equal(eventIds.size,28);

C.useMap('tutorial');
const E=new C.Economy('challenge',2000);
E.ledger.push({ops:400,fare:160,commerce:999});
const base=E.grantFor(2000,2), funds=E.funds, supplement=120*E.fiscalFactor();
E.startMonth(2000,2);
assert.equal(E.cur.opsSub,supplement);
assert.equal(E.cur.grant,base+supplement);
assert.ok(Math.abs(E.funds-funds-base-supplement)<1e-8);
const resumed=C.Economy.restore(E.serialize());
assert.equal(resumed.cur.opsSub,supplement);
assert.equal(resumed.funds,E.funds);
E.ledger.push({ops:100,fare:120});
E.startMonth(2000,3);
assert.ok(!E.cur.opsSub);
const free=new C.Economy('free',2000);
free.ledger.push({ops:400,fare:160});
free.startMonth(2000,2);
assert.ok(!free.cur.opsSub);
console.log('PASS all 28 event definitions and subsidy payment/restore');

const P={contracts:[{id:'signed',type:'upgrade'}],tenders:[
  {id:'idle',type:'upgrade'},{id:'bid',type:'upgrade',bid:{key:'standard'}},{id:'keep',type:'line'},
],closed:[]};
const old=JSON.stringify(P), restored=C.Corp.restore(P,24000);
assert.deepEqual(Array.from(restored.tenders,t=>t.id),['keep']);
assert.equal(restored.closed[0].status,'cancelled');
assert.equal(restored.closed[0].closed,24000);
assert.equal(restored.contracts[0].id,'signed');
assert.equal(JSON.stringify(P),old);
const active={id:'active',type:'lineCars'}, removed=T.restore({active:[active],offers:[{type:'lineCars'},{type:'lineEff'}]});
assert.equal(removed.active[0],active);
assert.deepEqual(Array.from(removed.offers,o=>o.type),['lineEff']);

const g=C.Game.create({mode:'free',tutorial:true,seed:20000101});
g.tutorial=false;
g.econ.mode='challenge';
C.DATA.histTasks=[];
C.DATA.noDynTasks=true;
C.DATA.events=[
  {y:1999,m:8,title:'Earlier',task:{id:'earlier',type:'connect',anchors:[]}},
  {y:2000,m:1,title:'Opening',task:{id:'now',type:'connect',months:3,anchors:[
    {name:'A',x:2,y:2,r:.8},{name:'B',x:30,y:24,r:.8}],rewardMonths:1,title:'Connection'}},
];
g.tasks=new T();
const issued=g.tasks.monthly(g).filter(o=>o.type==='issued');
assert.equal(issued.length,1);
const t=issued[0].task;
assert.equal(t.cause,'Opening');
assert.equal(t.reward,g.econ.grantQuota(2000,1));
assert.equal(g.tasks.monthly(g).filter(o=>o.type==='issued').length,0);
assert.equal(g.tasks.issued['ev:earlier'],1);
t.optional='scenic';
t.deadline=[2000,2];
g.clock.m=2;
const mods=JSON.stringify(g.econ.mods);
assert.ok(g.tasks.monthly(g).some(o=>o.type==='lapsed'&&o.task.id===t.id));
assert.equal(JSON.stringify(g.econ.mods),mods);
assert.equal(g.tasks.failed.length,0);
console.log('PASS event issuance, optional expiry and legacy contract/offer retirement');

const city=g.city, n=M.empty();
const station=(x,y,size,type)=>M.addStation(n,x,y,{size,type},city);
const a=station(3,3,'M','underground'), b=station(7,3,'M','underground'), c=station(11,3,'M','underground');
const target=station(3,4,'L','elevated'), end=station(3,12,'M','elevated');
const line=M.newLine(n), second=M.newLine(n);
M.addSegment(n,line,a,b,[],'underground');
M.addSegment(n,line,b,c,[],'underground');
M.addSegment(n,second,target,end,[],'elevated');
n.lines[line].root=a;
n.lines[line].svcs=[{id:'fast',name:'Fast',from:a,to:c,skip:[b]}];
assert.equal(M.mergeStations(n,a,target).ok,true);
assert.ok(!n.stations[a]);
assert.equal(n.stations[target].size,'L');
assert.equal(M.platType(n.stations[target],line),'underground');
assert.equal(n.lines[line].svcs[0].id,'fast');
assert.equal(n.lines[line].svcs[0].from,target);
assert.ok(!M.canMerge(n,target,target));
n.stations[end].tk=['fixture'];
assert.ok(!M.canMerge(n,target,end));

const footCity={cellAt:()=>0,lu:[C.LU.COM],street:[1],taken:[0],pop:[180000],jobs:[220000]};
assert.ok(M.stationDemolition(footCity,n,target,2000).cost>0);
assert.equal(M.stationDemolition(footCity,n,b,2000),null);
console.log('PASS merged route IDs, station layers and aboveground land acquisition');
