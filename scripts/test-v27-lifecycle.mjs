// Async lifecycle regressions using memory data, deterministic time and no player storage.
import {readFile} from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),source=async f=>readFile(new URL(f,root),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
let time=0,year=2020,connected=true,meta={slotId:'hk-1',savedAt:1,name:'Fixture',kind:'manual'},reads=[];
const memory=new Map(),proj={lon0:0,lat0:100,kx:1,ky:1},gate={id:'gate',open:2020.25,ext:{gate:true}};
const game={id:'sz-1',mode:'free',netVersion:1,city:{},compiled:{},year:()=>year,econ:{cross:{}},model:{}};
const C={CFG:{W:100,H:100},DATA:{cityLink:{map:'hk'}},GEO:{proj},MAPS:{hk:{geo:{proj}}},game,
 Fac:{list:()=>[gate],extLink:()=>connected?{}:null},
 Save:{list:()=>meta?[{mode:'free',slots:[meta]}]:[],linePreview:()=>{const req=deferred();reads.push(req);return req.promise}}};
const ctx={CM:C,console:{warn(){}},performance:{now:()=>time},localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(await source('js/citylink.js'),ctx);
const canvas=new Proxy({},{get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)}),renderer={game,z:5,lineWidthPx:()=>2,P:(x,y)=>({x,y})};
const draw=()=>C.CityLink.draw(renderer,canvas,1),preview={segs:[['#123456','underground',[-10,50,110,50]]],st:[50,50],lines:1,stations:1};
draw();assert.equal(reads.length,0);year=2020.3;draw();assert.equal(reads.length,1,'A newly opened gate must load the overlay without construction changes');
connected=false;game.netVersion++;draw();reads[0].resolve(preview);await flush();assert.equal(C.CityLink.overlay(),null,'A late preview must not restore the overlay after disconnection');
connected=true;game.netVersion++;draw();reads[1].resolve(preview);await flush();assert.equal(C.CityLink.overlay().shown,1,'A segment crossing the map must remain visible even if both endpoints are outside');
meta={...meta,slotId:'hk-2',savedAt:2};time+=2500;draw();assert.equal(reads.length,3,'A newer opposite-city save must refresh without changing the current network');
meta=null;time+=2500;draw();reads[2].resolve(preview);await flush();assert.equal(C.CityLink.overlay(),null,'Deleting the opposite-city save cancels a pending preview');
meta={slotId:'hk-3',savedAt:3,name:'Retry',kind:'manual'};time+=2500;draw();reads[3].reject(Error('temporary storage failure'));await flush();
time+=11000;draw();assert.equal(reads.length,5,'Temporary storage failure must be retried');reads[4].resolve(preview);await flush();assert.equal(C.CityLink.overlay().shown,1);
C.game=null;draw();assert.equal(reads.length,5,'A retired renderer must not start another save read after leaving the game');assert.equal(C.CityLink.overlay(),null);assert.equal(C.CityLink.loading(),false);
console.log('PASS border opening dates, stale previews after disconnect/delete, crossing segments, newer saves and storage retry');

// Snapshot completion cannot replace a save/settings window opened while the image was being prepared.
const intervals=[],thumb=deferred();let blocking=false,shown=0,dirty=0;
const G={id:'g-review',mapId:'bj',clock:{y:2021,m:1},model:{daily:{coverage:.5,metroShare:.2,congAM:1.1},trafficReady:()=>true,settled:true},econ:{mode:'free',isFree:()=>true,sat:75},compiled:{segs:[],stations:[]},net:{lines:{l:{id:'l'}},stations:{},segments:{}},history:[],logEvent(){}};
const U={clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),fmtPeople:String,fmtMoney:String,h:(...args)=>({args})};
const review={CM:{U,icon:()=>null,CFG:{growth:{histEnd:2020},metro:{stationCap:{M:1}},GAME_VERSION:'2.7.0'},DATA:{city:'Beijing'},MAPS:{bj:{kind:'real'}},Metro:{lineTopo:()=>({topo:'path'}),stationLines:()=>[]},NetMap:{snapshot:()=>thumb.promise},game:G,ui:{setSpeed(){},blocking:()=>blocking,markUnsaved:()=>dirty++,openScreen:()=>shown++}},setInterval:fn=>(intervals.push(fn),intervals.length),console};
review.window=review;vm.createContext(review);vm.runInContext(await source('js/review.js'),review);intervals[0]();blocking=true;thumb.resolve(null);await flush();assert.equal(shown,0,'A completed review must wait for the active modal');assert.equal(dirty,1);
blocking=false;intervals[0]();assert.equal(shown,1,'The review should appear once the modal closes');intervals[0]();assert.equal(shown,1);
console.log('PASS city review waits for active dialogs and appears only once');
