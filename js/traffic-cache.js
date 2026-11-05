'use strict';
// Optional, bounded browser cache. Game saves remain complete and independent.
(function(CM){
  const compact=(navigator.deviceMemory&&navigator.deviceMemory<=4)||matchMedia('(pointer:coarse)').matches;
  const MAX_ENTRY=(compact?24:64)*1024*1024,MAX_TOTAL=(compact?48:128)*1024*1024,MAX_COUNT=2;
  const scalars=['dt','stats','iters','solveSteps','quiet','stable','demandTotal','error','facKey','reviewLimit'];
  let dbPromise,currentDb,chain=Promise.resolve(),leasedBytes=0;const pending=new Map(),verified=new WeakSet(),leases=new WeakMap();
  const clone=x=>JSON.parse(JSON.stringify(x));
  const key=checksum=>CM.SIM_STAMP+':'+checksum;
  function closeDb(db){
    try{db.close();}catch(e){/* Already closed. */}
    if(currentDb===db){currentDb=null;dbPromise=null;}
  }
  function open(){
    if(!dbPromise){
      const promise=new Promise(resolve=>{
        let done=false;
        const finish=db=>{if(done){if(db)db.close();return;}done=true;clearTimeout(timer);if(db)currentDb=db;resolve(db);};
        const timer=setTimeout(()=>finish(null),1500);let request;
        try{request=indexedDB.open('city-metro-web-traffic',1);}catch(e){finish(null);return;}
        request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('entries'))db.createObjectStore('entries');if(!db.objectStoreNames.contains('lru')){const store=db.createObjectStore('lru',{keyPath:'key'});store.createIndex('used','used');}};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=db.onclose=()=>closeDb(db);finish(db);};
        request.onerror=request.onblocked=()=>finish(null);
      });
      dbPromise=promise;
      promise.then(db=>{if(!db&&dbPromise===promise)dbPromise=null;});
    }
    return dbPromise;
  }
  // This database is optional. A stalled transaction must not stall loading,
  // cache leases or the next queued cache write indefinitely.
  function transaction(db,stores,mode,work,timeout=1500){
    return new Promise((resolve,reject)=>{
      let tx,value,done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(typeof value==='function'?value():value);};
      const timer=setTimeout(()=>{const error=new Error('交通缓存事务超时');try{if(tx)tx.abort();}catch(e){/* May already have ended. */}finish(error);closeDb(db);},timeout);
      try{
        tx=db.transaction(stores,mode);
        tx.oncomplete=()=>finish();tx.onerror=tx.onabort=()=>finish(tx.error||new Error('交通缓存事务中止'));
        value=work(tx);
      }catch(e){try{if(tx)tx.abort();}catch(abortError){/* Already closed. */}if(e&&e.name==='InvalidStateError')closeDb(db);finish(e);}
    });
  }
  async function digest(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(v=>v.toString(16).padStart(2,'0')).join('');}
  // 大块交通数据的 SHA-256 放到工作线程计算（v2.3）：在主线程上算一次接近一秒，收敛完成、载入存档时画面会卡住。
  // 缓冲区转移过去、算完再转移回来，不复制；工作线程不可用时退回主线程
  let hw=null,hseq=0;const hwait=new Map();
  function failHash(){if(hw)try{hw.terminate();}catch(e){}hw=false;const waits=[...hwait.values()];hwait.clear();for(const finish of waits)finish(null);}
  function hashWorker(){
    if(hw!==null)return hw;
    try{
      const src='onmessage=async e=>{const d=e.data;let hex=null;try{const h=await crypto.subtle.digest("SHA-256",d.buf);hex=Array.from(new Uint8Array(h)).map(v=>v.toString(16).padStart(2,"0")).join("");}catch(err){}postMessage({id:d.id,hex:hex,buf:d.buf},[d.buf]);};';
      const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));hw=new Worker(url);URL.revokeObjectURL(url);
      hw.onmessage=e=>{const w=hwait.get(e.data.id);if(w){hwait.delete(e.data.id);w(e.data);}};
      hw.onerror=e=>{if(e&&e.preventDefault)e.preventDefault();failHash();};
      hw.onmessageerror=failHash;
    }catch(e){hw=false;}
    return hw;
  }
  // 返回 { hex, buf }：buf 为转移回来的同一份数据（失败时 hex 为 null）
  function digestBuf(buf){
    const w=hashWorker();
    if(!w)return digest(buf).then(hex=>({hex,buf}),()=>({hex:null,buf}));
    return new Promise(resolve=>{const id=++hseq,timer=setTimeout(failHash,1500);hwait.set(id,m=>{clearTimeout(timer);resolve(m?{hex:m.hex,buf:m.buf}:{hex:null,buf:buf});});try{w.postMessage({id,buf},[buf]);}catch(e){hwait.delete(id);clearTimeout(timer);digest(buf).then(hex=>resolve({hex,buf}),()=>resolve({hex:null,buf}));}});
  }
  async function keyFor(body){try{return await digest(new TextEncoder().encode(body));}catch(e){return null;}}
  const metaDigest=(meta,dataHash)=>digest(new TextEncoder().encode(JSON.stringify(meta)+':'+dataHash));
  const roadGuards=new WeakMap(),metroGuards=new WeakMap();
  const arrayGuards=arrays=>arrays.map(a=>CM.U.fnv(Array.from(a).join(',')));
  function guard(g){
    const m=g.model,r=m.road,n=m.net,rd=m.roadData;
    // These graph arrays are immutable for a road/network version. Cache only
    // their fingerprints; years, fares, facilities and station layout stay live.
    let road=roadGuards.get(rd);
    if(!road||road.graph!==r||road.version!==m.roadVer){road={graph:r,version:m.roadVer,hashes:arrayGuards([r.outStart,r.outArc,r.arcFrom,r.arcTo,r.arcT0,r.arcCap,rd.start,rd.nodes,rd.times,rd.km])};roadGuards.set(rd,road);}
    let metro=metroGuards.get(n);if(!metro){metro=arrayGuards([n.eFrom,n.eTo,n.eT0]);metroGuards.set(n,metro);}
    return JSON.stringify([g.mapId,m.year,CM.Model.fareKey(m.fare),m.Z,m.fn.ids,n.routeKey,n.C.stations.map(s=>[s.id,s.x,s.y,s.size]),road.hashes.concat(metro)]);
  }
  function capture(g){
    const m=g&&g.model;if(leasedBytes>=MAX_ENTRY/2||!CM.SIM_STAMP||!m||!m.settled||m.gen||m.solving||g.pending||g.jumping||m.predJob||m.hasReviewWork()||!m.trafficReady())return null;
    try{
      const periods=[];let bytes=0;
      for(const dt of ['wd','we'])for(let p=0;p<4;p++){
        const P=m.ctxs[dt].per[p],entry={dt,p,arrays:[],scalars:{}};
        for(const name of Object.keys(P))if(ArrayBuffer.isView(P[name])){const a=P[name];bytes=Math.ceil(bytes/8)*8;entry.arrays.push({name,type:a.constructor.name,length:a.length,offset:bytes});bytes+=a.byteLength;}
        for(const k of scalars)if(P[k]!==undefined)entry.scalars[k]=clone(P[k]);periods.push(entry);
      }
      if(bytes>MAX_ENTRY||bytes+leasedBytes>MAX_ENTRY)return null;const data=new ArrayBuffer(bytes),out=new Uint8Array(data);
      for(const row of periods)for(const a of row.arrays){const v=m.ctxs[row.dt].per[row.p][a.name];out.set(new Uint8Array(v.buffer,v.byteOffset,v.byteLength),a.offset);}
      const counters={cycles:m.cycles,settled:!!m.settled,solveLimit:m.solveLimit||2};
      const snapshot={meta:{schema:2,stamp:CM.SIM_STAMP,guard:guard(g),periods,counters},data};leases.set(snapshot,bytes);leasedBytes+=bytes;return snapshot;
    }catch(e){return null;}
  }
  function put(checksum,snapshot){
    if(!checksum||!snapshot){discard(snapshot);return Promise.resolve(false);}const k=key(checksum);
    const job=chain.then(async()=>{
      try{
        const db=await open();if(!db)return false;const hr=await digestBuf(snapshot.data);snapshot.data=hr.buf;if(!hr.hex||!snapshot.data.byteLength)return false;const dataHash=hr.hex,metaHash=await metaDigest(snapshot.meta,dataHash);
        await transaction(db,['entries','lru'],'readwrite',tx=>{
          tx.objectStore('entries').put({...snapshot,dataHash,metaHash},k);
          tx.objectStore('lru').put({key:k,bytes:snapshot.data.byteLength,used:Date.now()});
          const request=tx.objectStore('lru').index('used').getAll();
          request.onsuccess=()=>{const rows=request.result;let bytes=rows.reduce((n,row)=>n+row.bytes,0),count=rows.length;for(const row of rows)if(bytes>MAX_TOTAL||count>MAX_COUNT){tx.objectStore('entries').delete(row.key);tx.objectStore('lru').delete(row.key);bytes-=row.bytes;count--;}};
        },5000);return true;
      }catch(e){return false;}
    });chain=job.catch(()=>false);pending.set(k,job);job.finally(()=>{discard(snapshot);if(pending.get(k)===job)pending.delete(k);});return job;
  }
  function discard(snapshot){const n=snapshot&&leases.get(snapshot);if(n!==undefined){leasedBytes-=n;leases.delete(snapshot);}}
  async function get(checksum){
    if(!CM.SIM_STAMP||!checksum)return null;const k=key(checksum);
    try{
      if(pending.has(k)){
        let timer;try{if(!await Promise.race([pending.get(k),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1500);})]))return null;}finally{clearTimeout(timer);}
      }
      const db=await open();if(!db)return null;
      const record=await transaction(db,'entries','readonly',tx=>{let value;const request=tx.objectStore('entries').get(k);request.onsuccess=()=>{value=request.result;};return()=>value;});
      if(!record||record.meta.schema!==2||record.meta.stamp!==CM.SIM_STAMP||!(record.data instanceof ArrayBuffer)||record.data.byteLength>MAX_ENTRY)return null;
      const hr=await digestBuf(record.data);record.data=hr.buf;const hash=hr.hex;if(!hash||hash!==record.dataHash||await metaDigest(record.meta,hash)!==record.metaHash)return null;
      transaction(db,['entries','lru'],'readwrite',tx=>{const request=tx.objectStore('entries').getKey(k);request.onsuccess=()=>{if(request.result!==undefined)tx.objectStore('lru').put({key:k,bytes:record.data.byteLength,used:Date.now()});};}).catch(()=>{});verified.add(record);return record;
    }catch(e){return null;}
  }
  function restore(g,record){
    if(!record||!verified.has(record)||!(record.data instanceof ArrayBuffer))return false;
    try{
      const m=g.model,meta=record.meta,C=meta.counters;if(meta.stamp!==CM.SIM_STAMP||meta.guard!==guard(g)||meta.periods.length!==8||!C||C.settled!==true||!Number.isInteger(C.solveLimit)||C.solveLimit<1||C.solveLimit>12||['cycles'].some(k=>!Number.isSafeInteger(C[k])||C[k]<0))return false;
      const staged=[];const seen=new Set();
      for(const row of meta.periods){
        if(!['wd','we'].includes(row.dt)||!Number.isInteger(row.p)||row.p<0||row.p>3||seen.has(row.dt+row.p))return false;seen.add(row.dt+row.p);
        const P=m.ctxs[row.dt].per[row.p],S=row.scalars,E=S.error;m.allocStatArrays(P);
        if(!Number.isSafeInteger(S.solveSteps)||S.solveSteps<1||!Number.isSafeInteger(S.quiet)||S.quiet<0||typeof S.stable!=='boolean'||![0,6,12].includes(S.reviewLimit)||!E||Object.values(E).some(v=>!Number.isFinite(v))||!S.stats||Object.values(S.stats).some(v=>!Number.isFinite(v))||S.facKey!==m.fn.key)return false;
        const values={},keys=Object.keys(P).filter(k=>ArrayBuffer.isView(P[k]));if(row.arrays.length!==keys.length)return false;
        for(const a of row.arrays){const old=P[a.name];if(!keys.includes(a.name)||values[a.name]||!old||a.type!==old.constructor.name||a.length!==old.length||!Number.isInteger(a.offset)||a.offset<0||a.offset%old.BYTES_PER_ELEMENT)return false;const v=new old.constructor(record.data,a.offset,a.length);values[a.name]=v;}
        staged.push({P,S,values});
      }
      for(const {P,S,values}of staged){for(const k of scalars)if(S[k]!==undefined)P[k]=S[k];Object.assign(P,values);P.solveSignature={net:m.net,od:m.od,year:m.year,fare:CM.Model.fareKey(m.fare),road:m.roadVer,habit:m.habitVer||0};}
      verified.delete(record);
      m.computeDaily();m.gen=null;Object.assign(m,C);m.settledAt={year:m.year,fare:CM.Model.fareKey(m.fare),city:m.city.version,road:m.city.roadVersion,net:m.net,od:m.od};g.trafficCacheHit=true;return true;
    }catch(e){return false;}
  }
  function track(g,checksum){const m=g.model;g._trafficCacheTarget={checksum,net:m.net,od:m.od,year:m.year,fare:CM.Model.fareKey(m.fare),road:m.roadVer};tick(g);}
  function tick(g){
    const t=g._trafficCacheTarget;if(!t)return;const m=g.model;
    if(t.net!==m.net||t.od!==m.od||t.year!==m.year||t.fare!==CM.Model.fareKey(m.fare)||t.road!==m.roadVer){g._trafficCacheTarget=null;return;}
    if(!m.settled||m.gen||m.solving||m.hasReviewWork()||!m.trafficReady()||g.pending||g.jumping||m.predJob)return;
    g._trafficCacheTarget=null;put(t.checksum,capture(g));
  }
  async function flush(){let timer;try{return await Promise.race([chain,new Promise(r=>{timer=setTimeout(()=>r(false),1500);})]);}finally{clearTimeout(timer);}}
  CM.TrafficCache={capture,put,get,restore,track,tick,discard,keyFor,flush};
})(window.CM);
