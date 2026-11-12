// Pixel checks of the common ground renderer in a separate browser realm, without running a second game or touching player saves.
import {fileURLToPath} from 'node:url';
export async function runWaterMaskChecks({E,task,fs,path}){
 const root=fileURLToPath(new URL('..',import.meta.url)),html=await fs.readFile(path.join(root,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1]).filter(s=>/^js\/(?:util|config|accessibility|geo(?:_\w+)?|data_\w+|traits|maps|facility|eras|city|render|sites|scenery)\.js$/.test(s));
 await E(`(async()=>{window.waterFrame=document.createElement('iframe');waterFrame.style.cssText='position:fixed;left:-10000px;width:1px;height:1px';document.body.appendChild(waterFrame);for(const file of ${JSON.stringify(scripts)})await new Promise((resolve,reject)=>{const s=waterFrame.contentDocument.createElement('script');s.src=location.origin+'/'+file;s.onload=resolve;s.onerror=()=>reject(Error(file));waterFrame.contentDocument.head.appendChild(s)});waterFrame.contentWindow.CM.Settings={get:k=>k==='lighting'?true:k==='gfx'?'auto':false};return true})()`);
 const setup=function(){
  const C=waterFrame.contentWindow.CM,w=waterFrame.contentWindow;
  w.audit={};
  w.prepareWaterMap=async function(id){
   if(w.audit.R?.tiles)w.audit.R.tiles.stop();
   C.useMap(id);const city=new C.City(),gen=city.generateGen(19500101,C.CFG.START.y,{deferGraphs:true});while(!gen.next().done)await new Promise(r=>w.setTimeout(r,0));
   const canvas=w.document.createElement('canvas'),R=new C.Renderer(canvas),g={city,mapId:id,clock:{y:C.CFG.START.y,m:1,d:1}};
   R.setGame(g);R._facm={city,list:[],hubs:[],airs:[],cells:new Set(),noTree:new Set(),ver:1};
   w.audit={city,R,g};
   const reclaim=(C.DATA.reclaim||[]).find(r=>r.id===(id==='tk'?'odaiba':'qianhaie'));let near=null;
   if(reclaim){const p=reclaim.poly,cx=p.reduce((a,v)=>a+v[0],0)/p.length,cy=p.reduce((a,v)=>a+v[1],0)/p.length;near=[cx-8,cy-8,cx+8,cy+8]}
   return {start:C.CFG.START.y,near,years:[...new Set((C.DATA.reclaim||[]).map(r=>r.year))].sort((a,b)=>a-b)};
  };
  w.checkWater=async function(year,theme,scale=4,box=null){
   const{city,R,g}=w.audit;city.applyReclaim(year);g.clock.y=year;R.styleYear=year;R.styleEpoch=Math.floor(year/5);R.applyTheme(theme);
   const [x0,y0,x1,y1]=box||[0,0,city.W,city.H],W=Math.round((x1-x0)*scale),H=Math.round((y1-y0)*scale),make=()=>{const cv=w.document.createElement('canvas');cv.width=W;cv.height=H;return cv};
   const draw=()=>{const cv=make(),x=cv.getContext('2d',{willReadFrequently:true});x.setTransform(scale,0,0,scale,-x0*scale,-y0*scale);R.drawGround(x,x0,y0,x1,y1,scale);return cv};
   const normal=draw(),fill=R.th.lockFill,hatch=R.th.lockHatch;let clear;
   try{R.th.lockFill='transparent';R.th.lockHatch='transparent';clear=draw()}finally{R.th.lockFill=fill;R.th.lockHatch=hatch}
   const mask=make(),mx=mask.getContext('2d',{willReadFrequently:true});mx.setTransform(scale,0,0,scale,-x0*scale,-y0*scale);mx.fillStyle='#fff';mx.strokeStyle='#fff';mx.lineCap='round';mx.lineJoin='round';
   const p=new w.Path2D();for(const f of C.Geo.water)p.addPath(R.featurePath(f,true));mx.fill(p,'nonzero');
   const pending=new w.Path2D();for(const f of city.reclaimWater())pending.addPath(R.featurePath(f,true));mx.fill(pending,'nonzero');
   for(const l of C.Geo.waterLines){mx.lineWidth=Math.max(l.w,1/scale*1.5);mx.stroke(R.featurePath(l,false))}
   const a=normal.getContext('2d').getImageData(0,0,W,H).data,b=clear.getContext('2d').getImageData(0,0,W,H).data,m=mx.getImageData(0,0,W,H).data;
   let water=0,leaked=0,landChanged=0,maxDelta=0;const samples=[];
   for(let i=0;i<a.length;i+=4){const delta=Math.max(...[0,1,2,3].map(k=>Math.abs(a[i+k]-b[i+k])));if(m[i+3]===255){water++;if(delta>1){leaked++;maxDelta=Math.max(maxDelta,delta);if(samples.length<4)samples.push([(i/4)%W,Math.floor(i/4/W),delta])}}else if(m[i+3]===0&&delta>1)landChanged++}
   w.audit.normal=normal;w.audit.clear=clear;
   return {year,theme,scale,water,leaked,landChanged,maxDelta,samples};
  };
  w.checkWorkerTile=async function(){
   const{R,city}=w.audit,lvl=8,counts=new Map(),W=city.W,H=city.H;
   for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=Math.floor(i/64)+','+Math.floor(j/64);let q=counts.get(k);if(!q)counts.set(k,q={wet:0,dry:0,ci:Math.floor(i/64),cj:Math.floor(j/64)});if(city.waterAt(i+.5,j+.5))q.wet++;else q.dry++}
   const tile=[...counts.values()].sort((a,b)=>Math.min(b.wet,b.dry)-Math.min(a.wet,a.dry))[0],key='water-audit';
   const it=R.groundChunkGen(lvl,tile.ci,tile.cj);let r=it.next();while(!r.done)r=it.next();const cv=r.value;
   if(!R.tiles.ready())throw Error('Worker unavailable');R.tiles.request({key,lvl,ci:tile.ci,cj:tile.cj});
   const start=performance.now();while(!R.ground.has(key)){if(R.tiles.off||performance.now()-start>30000)throw Error('Worker tile failed');await new Promise(r=>w.setTimeout(r,20))}
   const bmp=R.ground.get(key).cv,copy=new w.OffscreenCanvas(bmp.width,bmp.height),x=copy.getContext('2d');x.drawImage(bmp,0,0);
   const a=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data,b=x.getImageData(0,0,bmp.width,bmp.height).data;let mismatch=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])mismatch++;
   R.tiles.stop();return {channels:a.length,mismatch,ci:tile.ci,cj:tile.cj};
  };
 };
 await E('('+setup.toString()+')();true');
 const maps=await E('["tk","sz",...waterFrame.contentWindow.CM.MAP_ORDER.filter(id=>id!=="tk"&&id!=="sz")]'),report={cases:[],workers:[],maps};
 const output=process.env.CM_MOBILE_OUTPUT&&path.resolve(process.env.CM_MOBILE_OUTPUT);
 const saveImage=async name=>{if(!output)return;const url=await E('waterFrame.contentWindow.audit.normal.toDataURL("image/png")');await fs.writeFile(path.join(output,name+'.png'),Buffer.from(url.split(',')[1],'base64'))};
 for(const id of maps){
  const meta=await E(`waterFrame.contentWindow.prepareWaterMap(${JSON.stringify(id)})`),years=[meta.start,...meta.years.filter(y=>y>meta.start)];
  for(const year of years)for(const theme of['light','dark']){
   const check=await E(`waterFrame.contentWindow.checkWater(${year},${JSON.stringify(theme)})`);report.cases.push({map:id,...check});
   if(year===meta.start&&theme==='light'&&(id==='tk'||id==='sz'))await saveImage(id+'-coast');
   if(check.leaked){await saveImage(id+'-water-failure');await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report,null,2));throw Error(id+' water overlay leak '+JSON.stringify(check))}
   if(!check.landChanged)throw Error(id+' lost its closed-land shading');
   if(year===meta.start&&meta.near)for(const scale of[8,16,32,64]){
    const near=await E(`waterFrame.contentWindow.checkWater(${year},${JSON.stringify(theme)},${scale},${JSON.stringify(meta.near)})`);report.cases.push({map:id,...near});
    if(near.leaked)throw Error(id+' zoomed water overlay leak '+JSON.stringify(near));
   }
  }
  const worker=await E('waterFrame.contentWindow.checkWorkerTile()');report.workers.push({map:id,...worker});if(worker.mismatch)throw Error(id+' main/worker ground mismatch '+JSON.stringify(worker));
  console.log('PASS water masking',id,report.cases.filter(c=>c.map===id).length,'cases; worker',worker.channels,'channels');
 }
 await E('waterFrame.remove();true');await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report,null,2));
 console.log('PASS all-map water masking',report.cases.length,'cases',report.cases.reduce((n,c)=>n+c.water,0),'water pixels',report.workers.reduce((n,c)=>n+c.channels,0),'worker channel values');
}
