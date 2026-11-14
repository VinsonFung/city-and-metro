// Cases shared by the isolated Chromium launcher; never opens a player profile.
export async function runV27Checks({evaluate:E,send,until,screenshot,delay,task,fs,path}) {
 const report={states:0,hits:0,downloads:[],cities:[]};
 const settle=async()=>{await E('CM.ui.toasts.replaceChildren();CM.ui.queueLayout();true');await delay(220);};
 const tap=async sel=>{const p=await E(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error('Missing ${sel}');const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,n=document.elementFromPoint(x,y);if(!r.width||!e.contains(n))throw Error('Covered ${sel}: '+n?.outerHTML.slice(0,180));return {x,y};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(80);};
 const audit=async(label,selector)=>{const r=await E(`(()=>{const out={bad:[],hits:0};for(const e of document.querySelectorAll(${JSON.stringify(selector)})){const s=getComputedStyle(e),r=e.getBoundingClientRect();if(!r.width||!r.height||s.visibility==='hidden'||e.disabled)continue;let a={l:Math.max(0,r.left),t:Math.max(0,r.top),r:Math.min(innerWidth,r.right),b:Math.min(innerHeight,r.bottom)};for(let p=e.parentElement;p;p=p.parentElement){const t=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(t.overflowX)){a.l=Math.max(a.l,b.left);a.r=Math.min(a.r,b.right);}if(/auto|scroll|hidden|clip/.test(t.overflowY)){a.t=Math.max(a.t,b.top);a.b=Math.min(a.b,b.bottom);}}if(a.r-a.l<5||a.b-a.t<5)continue;const n=document.elementFromPoint((a.l+a.r)/2,(a.t+a.b)/2);out.hits++;if(!e.contains(n))out.bad.push({text:e.innerText,by:n?.outerHTML.slice(0,120)});}return out})()`);report.states++;report.hits+=r.hits;if(r.bad.length)throw Error(label+' '+JSON.stringify(r.bad));};
 const close=async()=>{await E('CM.ui.opsApp?.close(null,true);CM.Stats.close();CM.NetMap.close();CM.ui.closeScreen();CM.ui.closePanel(true);true');};
 if(process.env.CM_README_CAPTURE){const{captureReadme}=await import('./readme-capture-cases.mjs');await captureReadme({E,send,until,screenshot,delay,settle,close,task,fs,path});return;}
 if(process.env.CM_WATER_MASK_ONLY){const{runWaterMaskChecks}=await import('./water-mask-browser-cases.mjs');await runWaterMaskChecks({E,send,until,delay,task,fs,path});return;}
 if(process.env.CM_V27_FIXES_ONLY){const{runFixChecks}=await import('./v27-fix-browser-cases.mjs');await runFixChecks({E,send,until,screenshot,delay,settle,tap,audit,close,report});await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report,null,2));return;}
 if(process.env.CM_V27_REPLAY_ONLY){const{runReplayChecks}=await import('./replay-browser-cases.mjs');await runReplayChecks({E,send,until,screenshot,delay,settle,tap,audit,close,report});await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;}
 if(!process.env.CM_V27_GATES_ONLY) {
 await E('if(CM.geoReady("tk")||CM.geoReady("sz"))throw Error("Inactive geography was loaded at startup");if(!CM.geoReady("bj"))throw Error("Active geography unavailable");CM.ui.setLayer("tod");true');await settle();
 if(!await E('!!document.querySelector(".lg-rank-i")&&CM.R.stationRevenue().list.length>0'))throw Error('Station revenue layer did not render');
 await audit('station revenue phone','#legendCard button');
 await E('const body=document.querySelector("#legendCard .lc-body");body.scrollTop=body.scrollHeight;true');await audit('station revenue ranking phone','#legendCard button');
 await E('CM.ui.setLayer("commute");true');await until('CM.R.layer==="flow"&&!!CM.R.rateScales?.flow');
 await audit('trips and commute phone','#legendCard button');
 await E('CM.ui.setLayer("none");true');
 console.log('PASS deferred geography, station revenue and trips & commute layers');
 // Batch changes are drafts, filtering is keyboard accessible, and cancelled changes cost nothing.
 await E('CM.ui.openOpsApp("stations");window.batchOriginal=JSON.stringify(CM.game.net);window.batchFunds=CM.game.econ.funds;true');await settle();
 await tap('.mc-sel');await audit('station dropdown','.dd-pop button');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});
 if(await E('document.querySelector(".mc-sel").value==="all"'))throw Error('Dropdown did not select a line');
 await tap('[data-batch=toggle]');
 await E('document.querySelector(".mc-chk input").click();document.querySelector(".mc-batch [data-sz=S]").click();if(!CM.game.draft)throw Error("Missing batch draft");if(JSON.stringify(CM.game.net)!==batchOriginal||CM.game.econ.funds!==batchFunds)throw Error("Batch changed official network or cash");CM.game.cancelDraft();true');
 await close();
 if(!process.env.CM_V27_EXPORT_ONLY) for(const lang of ['zh-CN','zh-TW','en'])for(const [width,height] of [[320,568],[568,320],[390,844]])for(const scale of [1,1.15]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await E(`CM.Settings.set('language',${JSON.stringify(lang)});CM.Settings.set('uiScale',${scale});CM.ui.openOpsApp('fare');true`);await settle();
  await audit('fare '+[lang,width,height,scale],'.mc-app button,.mc-app input');
  await E('window.fareSlider=document.querySelector(".fe-groups:not([hidden]) input[type=range]");fareSlider.value=+fareSlider.value + +fareSlider.step;fareSlider.dispatchEvent(new Event("input",{bubbles:true}));window.farePending=fareSlider.value;CM.ui.opsApp.refresh();if(!fareSlider.isConnected||fareSlider.value!==farePending)throw Error("Data refresh discarded pending fare");document.querySelector(".fe-actions").scrollIntoView({block:"center"});true');await settle();
  await audit('fare actions','.fe-actions button,.fe-auto button');
  await close();await E('CM.Stats.open(CM.ui,"traits");true');await settle();
  if(!await E('!!document.querySelector(".tr-star")'))throw Error('Missing city mechanism cards');
  await audit('traits','#stats button');await close();
  await E('CM.ui.openNetMap();true');await settle();
  await audit('network diagram','#netmap button');
  if(await E('!!document.querySelector("[data-style=sky],[data-style=ink]")'))throw Error('Standalone-only control in web');
  if(lang==='en'&&width===390&&scale===1)await screenshot('v27-netmap-mobile');
  await close();
 }
 console.log('PASS three-language mobile fare, city traits and network diagram',report.states);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await E('CM.Settings.set("uiScale",1);CM.Settings.set("language","en");CM.ui.openNetMap();true');await settle();
 await delay(500);const downloadDir=path.join(task,'downloads');await fs.mkdir(downloadDir);await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
 await E('window.exportMessages=[];const oldToast=CM.ui.toast;CM.ui.toast=function(...args){exportMessages.push(args);return oldToast.apply(this,args)};true');await tap('.nm-export');await until('!document.querySelector(".nm-export").disabled');
 const checkDownload=async count=>{let files=[];for(let i=0;i<100;i++){files=(await fs.readdir(downloadDir)).filter(x=>x.endsWith('.png'));if(files.length>=count)break;await delay(100);}if(files.length<count)throw Error('PNG download did not complete '+JSON.stringify(await E('exportMessages'))) ;for(const f of files){const b=await fs.readFile(path.join(downloadDir,f));if(b.subarray(1,4).toString()!=='PNG'||b.length<10000)throw Error('Invalid PNG: '+f);}report.downloads=files;};
 await checkDownload(1);
 await E('CM.NetMap.close();CM.game.clock.y=CM.CFG.growth.histEnd+1;true');
 await until('!!CM.game.cityReview&&!!document.querySelector(".rv-card")',30000);
 await settle();await screenshot('v27-city-review');
 for(const lang of ['zh-CN','zh-TW','en'])for(const [width,height] of [[320,568],[568,320]]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await E(`CM.Settings.set('language',${JSON.stringify(lang)});CM.Settings.set('uiScale',1.15);CM.Review.show(CM.game.cityReview);true`);await settle();
  await audit('review '+lang+'/'+width,'.rv-card button');
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await E('CM.Settings.set("uiScale",1);CM.Settings.set("language","en");CM.Review.show(CM.game.cityReview);true');await settle();
 await tap('.rv-card .rv-export-t');await checkDownload(2);await close();
 console.log('PASS browser PNG downloads for diagram and review');if(process.env.CM_V27_EXPORT_ONLY){await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;}
 }
 if(!process.env.CM_V27_GATES_ONLY) {
 // London uses the historical currency and all 11 local models, without native APIs.
 await E('CM.newGame({map:"ld",mode:"challenge",seed:18600101});true');await until('!CM.isLoading()&&CM.game?.mapId==="ld"&&!CM.game.pending',180000);await close();
 await E('CM.game.setSpeed(0);CM.ui.openOpsApp("fare");true');await settle();
 if(!await E('CM.CFG.money.pence&&/d|s/.test(document.querySelector(".fare-v").textContent)'))throw Error('Missing pre-decimal London fare');
 await audit('London fare','.mc-app button');await screenshot('v26-london-fare');report.cities.push('ld');if(await E('CM.geoReady("bj")'))throw Error('Inactive Beijing geography retained after switching');await close();
 }
 // Save a Hong Kong network, then load Shenzhen and check the same-mode read-only overlay.
 for(const map of (process.env.CM_V27_GATES_ONLY?['sz']:['hk','sz'])) {
  await E(`CM.newGame({map:${JSON.stringify(map)},mode:'free',startYear:2020,seed:20200101});true`);await until(`!CM.isLoading()&&CM.game?.mapId===${JSON.stringify(map)}&&!CM.game.pending`,180000);await close();
  await E(`(()=>{const C=CM,g=C.game,M=C.Metro;g.setSpeed(0);const f=C.Fac.list(g.city).find(f=>f.ext?.gate&&f.open<=g.year()),p=C.Fac.portal(f),l=M.newLine(g.net),a=M.addStation(g.net,p.x,p.y,{size:'M',type:'underground',portal:f.id},g.city),b=M.addStation(g.net,p.x+4,p.y+4,{size:'M',type:'underground'},g.city);M.addSegment(g.net,l,a,b,[],'underground');g.compiled=M.compile(g.net,g.city);g.model.setNetwork(g.compiled);g.netVersion++;g.setCrossFee(f.id,2);window.borderGate=f.id;return true})()`);
  await E('(async()=>{const r=await CM.Save.save(CM.game,"manual");if(!r.ok)throw Error(r.error);if(CM.Save.slotInfo(r.slotId).store!=="idb")throw Error("Expected actual browser IndexedDB");return true})()');
  await E('CM.ui.openOpsApp("gates");true');await settle();
  if(!await E('CM.CityLink.connected(CM.game)&&!!document.querySelector(".mc-gate-fee input")'))throw Error('Connected gate missing management fee');
  await audit('gate management','.mc-app button,.mc-app input');
  // A cancelled touch must release the refresh lock, even when no change/pointerup follows.
  await E('window.cancelledFee=document.querySelector(".mc-gate-fee input");cancelledFee.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,pointerId:7}));window.dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerId:7}));true');await delay(80);
  await E('CM.ui.opsApp.refresh();if(cancelledFee.isConnected)throw Error("Cancelled gate slider left the page refresh locked");true');
  if(map==='sz'&&!process.env.CM_V27_GATES_ONLY){await until('!!CM.CityLink.overlay()',30000);await screenshot('v27-cross-border');}
  for(const lang of ['zh-CN','zh-TW','en'])for(const [width,height] of [[320,568],[568,320]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await E("CM.Settings.set('language',"+JSON.stringify(lang)+");CM.Settings.set('uiScale',1.15);CM.ui.opsApp.refresh();true");await settle();
    await audit('mobile gates '+lang+'/'+width,'.mc-app button,.mc-app input');
    await E("for(const e of document.querySelectorAll('.mc-gate-kpis small'))if(e.scrollWidth>e.clientWidth+1)throw Error('Gate metric label overflows');true");
  }
  await screenshot('v27-gates-mobile');
  report.cities.push(map);await close();
 }
 // The review is stored in its own progress and does not appear in a different city.
 if(await E('!!CM.game.cityReview'))throw Error('Previous city review leaked into another city');
 // A failed geography request must allow retry, and concurrent consumers share the same request.
 await E(`(async()=>{
  const id='tk',stub=CM.MAPS[id].geo,head=document.head,append=head.appendChild;
  if(CM.geoReady(id))throw Error('Tokyo unexpectedly resident');
  head.appendChild=function(node){if(node.tagName==='SCRIPT'&&node.src.endsWith('/geo_tk.js')){queueMicrotask(()=>node.onerror());return node;}return append.call(this,node);};
  try{const first=CM.loadGeo(id);if(first!==CM.loadGeo(id))throw Error('Duplicate geography request');
   const outcomes=await Promise.allSettled([first]);if(outcomes[0].status!=='rejected')throw Error('Geography failure was ignored');
  }finally{head.appendChild=append;}
  await CM.loadGeo(id);if(!CM.geoReady(id)||CM.MAPS[id].geo!==stub||CM.GEOS[id]!==stub)throw Error('Geography retry lost the map reference');
  CM.releaseGeo(id);if(CM.geoReady(id))throw Error('Retry data remained resident');
  CM.endGame();return true;
 })()`);
 await until('!CM.game&&[CM.CarPool,CM.OdPool,CM.SkimPool].every(p=>!p.list)',15000);
 console.log('PASS geography retry, request coalescing and idle worker release');
 await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report,null,2));console.log('PASS new browser gameplay',JSON.stringify(report));
}
