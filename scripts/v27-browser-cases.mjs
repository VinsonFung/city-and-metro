// Cases shared by the isolated Chromium launcher; never opens a player profile.
export async function runV27Checks({evaluate:E,send,until,screenshot,delay,task,fs,path}) {
 const report={states:0,hits:0,downloads:[],cities:[]};
 const settle=async()=>{await E('CM.ui.toasts.replaceChildren();CM.ui.queueLayout();true');await delay(220);};
 const tap=async sel=>{const p=await E(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error('Missing ${sel}');const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,n=document.elementFromPoint(x,y);if(!r.width||!e.contains(n))throw Error('Covered ${sel}: '+n?.outerHTML.slice(0,180));return {x,y};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(80);};
 const audit=async(label,selector)=>{const r=await E(`(()=>{const out={bad:[],hits:0};for(const e of document.querySelectorAll(${JSON.stringify(selector)})){const s=getComputedStyle(e),r=e.getBoundingClientRect();if(!r.width||!r.height||s.visibility==='hidden'||e.disabled)continue;let a={l:Math.max(0,r.left),t:Math.max(0,r.top),r:Math.min(innerWidth,r.right),b:Math.min(innerHeight,r.bottom)};for(let p=e.parentElement;p;p=p.parentElement){const t=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(t.overflowX)){a.l=Math.max(a.l,b.left);a.r=Math.min(a.r,b.right);}if(/auto|scroll|hidden|clip/.test(t.overflowY)){a.t=Math.max(a.t,b.top);a.b=Math.min(a.b,b.bottom);}}if(a.r-a.l<5||a.b-a.t<5)continue;const n=document.elementFromPoint((a.l+a.r)/2,(a.t+a.b)/2);out.hits++;if(!e.contains(n))out.bad.push({text:e.innerText,by:n?.outerHTML.slice(0,120)});}return out})()`);report.states++;report.hits+=r.hits;if(r.bad.length)throw Error(label+' '+JSON.stringify(r.bad));};
 const close=async()=>{await E('CM.ui.opsApp?.close(null,true);CM.Stats.close();CM.NetMap.close();CM.ui.closeScreen();CM.ui.closePanel(true);true');};
 if (process.env.CM_V30_SYNC_ONLY) {
  const { runV30SyncChecks } = await import('./v30-browser-cases.mjs');
  await runV30SyncChecks({E,until,tap,send,audit});
  await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;
 }
 if (process.env.CM_V30_ONLY) {
  const { runV30Checks } = await import('./v30-browser-cases.mjs');
  await runV30Checks({E,until,close,tap,settle,send,audit});
  await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;
 }
 if (process.env.CM_WALK_LANGUAGE_ONLY) {
  const {runWalkAndLanguageChecks}=await import('./v27-fix-browser-cases.mjs');
  await runWalkAndLanguageChecks({E,send,until,close,tap,settle});
  await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;
 }
 if (process.env.CM_NETWORK_DRAWING_ONLY) {
  const {runNetworkDrawingChecks}=await import("./network-drawing-browser-cases.mjs");
  await runNetworkDrawingChecks({E,send,until,close,tap,settle});return;
 }
 if (process.env.CM_SETTLEMENT_ONLY) {
  const {runSettlementChecks}=await import('./settlement-browser-cases.mjs');
  await runSettlementChecks({E,until,fs,path,task,close,tap});return;
 }
 if (process.env.CM_MAP_OPENING_ONLY) {
  await E('CM.Settings.set("language","zh-CN");CM.newGame({map:"sg",mode:"free",seed:19800101});true');
  await until('!CM.isLoading()&&CM.game?.mapId==="sg"&&!CM.game.pending',180000);
  await close();
  const opening = await E(`(()=>{
    const g=CM.game,c=g.city;
    g.setSpeed(0);
    const k=c.regions.findIndex(r=>r.id==="tekong"),state=c.lockState();
    const p=c.region.findIndex((r,i)=>r===k&&c.landFrac[i]>=0.75&&state.mask[i]&&state.year[i]===2045);
    if(p<0)throw Error("Could not find land closed until 2045");
    const x=p%c.W+0.5,y=Math.floor(p/c.W)+0.5;
    CM.R.flyTo(x,y,24);
    return {p,x,y};
  })()`);
  const search = `(()=>{CM.ui.openSearch();const input=document.querySelector(".search-pop input");input.value="德光岛";input.dispatchEvent(new Event("input",{bubbles:true}));const row=[...document.querySelectorAll(".srch-item")].find(e=>e.textContent.includes("区域"));const text=row?.textContent||"";CM.ui.closeSearch();return text})()`;
  if (!(await E(search)).includes("2045")) throw Error("Search did not show the scheduled opening");
  await until('CM.R.sharpReady()&&!CM.R.cam.fly',60000);
  // Seed both the date and open ledger when skipping to the month before the scheduled opening.
  await E('Object.assign(CM.game.clock,{y:2044,m:12,d:1});CM.game.econ.openMonth(2044,12);CM.ui.jump(1);true');
  await until('!!CM.game.settlementError||(!CM.game.jumping&&!CM.game.pending&&CM.game.clock.y===2045&&CM.game.clock.m===1)',180000);
  const error = await E('CM.game.settlementError?.message || null');
  if (error) throw Error(error);
  await close();
  if (!await E(`CM.Metro.checkSite(CM.game.city,${opening.x},${opening.y},"underground").ok`)) throw Error("The scheduled area still rejects construction");
  if (!(await E(search)).includes("已开放")) throw Error("Search did not refresh the open area");
  await until(`CM.R.sharpReady()&&(!CM.R.tiles?.list||CM.R.tiles.sent.lk?.mask[${opening.p}]===0)`,60000);
  report.cities.push("sg");
  await fs.writeFile(path.join(task,"report.json"),JSON.stringify(report));
  console.log("PASS Singapore monthly settlement, buildability, search and rendered lock refresh");
  return;
 }
 if (process.env.CM_RAIL_SYNC_ONLY) {
  await E('CM.endGame();CM.ui.showStart();true');
  await until('document.querySelector("#menubg canvas") && !document.getElementById("menubg").classList.contains("off")');
  await tap('.start-menu button');
  await E('CM.newGame({map:"hk",mode:"challenge",seed:198307});true');
  await until('!CM.isLoading() && CM.game?.mapId === "hk" && !CM.game.pending');
  await close();
  await E('CM.game.clock.y=1983; CM.game.clock.m=7; CM.game.econ.funds=1e8; CM.ui.openOpsApp("takeover");true');
  await until('document.querySelector(".tk-svg [data-stop=hh]") && document.querySelector(".tk-bgc")?.getContext("2d").getImageData(1,1,1,1).data[3] > 0',15000);
  await tap('.tk-svg [data-stop=hh] .tk-p');
  await tap('.tk-svg [data-stop=st] .tk-p');
  await until('document.querySelector(".tk-plan .tk-go button:not(:disabled)")');
  await audit('rail takeover', '.tk-zctl button,.tk-plan .tk-go button');
  await tap('.tk-zctl button');
  await until('document.querySelector(".tk-map").classList.contains("zoomed")');
  await close();
  await E('CM.ui.setLayer("bgt");CM.tools.setTool("line");true');
  await until('document.querySelector(".vnode-toggle")');
  await tap('.vnode-toggle');
  if (!await E('CM.tools.pointMode==="virtual" && document.querySelector(".vnode-toggle").getAttribute("aria-pressed")==="true"')) throw Error('Virtual node mode did not activate on touch');
  await E('CM.tools.setTool("select");CM.ui.openOpsApp("finance");true');
  await until('Array.from(document.querySelectorAll(".mc-tools button")).some(e=>e.textContent.includes("车站收支"))');
  const airport = await E(`(()=>{
   const R=CM.R, list=CM.TERMINALS.hk.hk_cklair;
   if(!list?.length || !CM.TerminalActive(list[0],2030))return false;
   const before=new CM.City(), after=new CM.City();
   before.generate(198307,1995); after.generate(198307,2010);
   const early=R.hubModels(before,1995).map(x=>x.id), late=R.hubModels(after,2010).map(x=>x.id);
   return early.includes("hhk_kaitak_kt") && !early.includes("hhk_cklair_t1") && late.includes("hhk_cklair_t1") && !late.includes("hhk_kaitak_kt");
  })()`);
  if (!airport) throw Error('Airport terminal phase is not rendered from historical data');
  console.log('PASS mobile menu, rail selection and zoom, virtual-node control, finance and terminal phases');
  return;
 }
 if(process.env.CM_V272_ONLY){
  await send('Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:12});
  await E('CM.Settings.set("language","zh-CN");CM.newGame({map:"tutorial",mode:"free",seed:20000101});true');
  await until('!CM.isLoading()&&CM.game?.mapId==="tutorial"');
  await close();
  await E(`(async()=>{
    const {game:g,Metro:M}=CM;
    g.setSpeed(0);
    const net=M.empty(),a=M.newLine(net),b=M.newLine(net),stops=[];
    const add=(x,y)=>M.addStation(net,x,y,{size:'M',type:'underground'},g.city);
    for(let row=0;row<6;row++)for(let col=0;col<9;col++){
      stops.push(add(6.5+4*(row%2?8-col:col),3.75+4*row));
    }
    for(let i=1;i<stops.length;i++)M.addSegment(net,a,stops[i-1],stops[i],[],'underground');
    const interchange=stops[3];
    M.addSegment(net,b,interchange,add(18.5,6),[],'underground');
    const compiled=M.compile(net,g.city),model=new CM.Model(g.city);
    model.setYear(g.year());model.setNetwork(compiled);
    const period=()=>{const p=model.makePer(model.net);p.freq.fill(12);p.freqDir.fill(12);return p;};
    const local=period(),worker=period(),localBuf={},workerBuf={};
    model.syncSolve=true;
    for(const _ of model.iterate(model.net,local,0,{noSmooth:true,buf:localBuf})) {}
    model.syncSolve=false;
    for(const _ of model.iterate(model.net,worker,0,{noSmooth:true,buf:workerBuf})){
      if(_===CM.SIM_WAIT)await new Promise(resolve=>setTimeout(resolve,5));
    }
    if(!workerBuf.skim.parts?.length||!CM.OdPool.list?.length||CM.OdPool.off)
      throw Error('Traffic did not run in both browser workers');
    for(const [left,right] of [[localBuf.skim.gt,workerBuf.skim.gt],[local.stIn,worker.stIn],[local.stOut,worker.stOut],[local.fInM,worker.fInM],[local.fOutM,worker.fOutM],[local.load,worker.load]]){
      if(left.length!==right.length||left.some((v,i)=>v!==right[i]))throw Error('Worker traffic differs from the main thread');
    }
    CM.Fleet.ensure(g); // Start with an empty fleet so the synthetic lines are physically connected but unserved.
    g.net=net;g.compiled=compiled;g.netVersion++;
    g.model.setNetwork(compiled);g.model.applyFleet();g.model.solveNow(1);
    CM.ui.openPage('station',interchange,{root:true});
    CM.ui.live.forEach(update=>update());
    return true;
  })()`);
  const detail=await E('CM.ui.rBody.textContent');
  if(!detail.includes('十字节点换乘')||!detail.includes('本站所有交路均停运'))throw Error('Station detail did not render expected diagnostics: '+detail);
  console.log('PASS browser worker parity, interchange types and no-train diagnostic');
  await close();
  await E('CM.ui.openOpsApp("stations");true');
  await settle();
  if(!await E('(()=>{const b=document.querySelector(\'.mc-nav[data-v=fare]\');b.focus();return document.activeElement===b})()'))
    throw Error('The fare tab could not receive keyboard focus');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  const state=await E('({view:CM.ui.opsApp?.state().root,speed:CM.game.speed})');
  if(state.view!=='fare'||state.speed!==0)throw Error('Enter did not select fare management: '+JSON.stringify(state));
  await close();
  console.log('PASS mobile Metro Core keyboard');
  await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;
 }
 if(process.env.CM_BORDER_BUILD_ONLY){
  for(const map of ['hk','sz']){
   await E(`CM.newGame({map:${JSON.stringify(map)},mode:'free',startYear:2020,seed:20200101});true`);
   await until(`!CM.isLoading()&&CM.game?.mapId===${JSON.stringify(map)}`);
   await close();
   await E(`(()=>{
     const {game:g,R,ui,Fac}=CM;
     const gate=Fac.byId(g.mapId+'_gate_lw'),p=Fac.portal(gate);
     const inland=g.mapId==='hk'?[p.x+3,p.y]:[p.x-Math.sqrt(6.75),p.y-1.5];
     window.borderTest={id:gate.id,inland};
     g.setSpeed(0);
     ui.setView(false);
     R.setUnder(true);
     ui.setLayer('dev');
     ui.flyTo(p.x,p.y,36);
     ui.tools.setTool('line');
   })()`);
   await until('CM.R.cam.under===1&&CM.R.layerFade>.98&&!CM.R.cam.fly');
   const points=await E(`(()=>{
     const {id,inland}=borderTest,R=CM.R,portal=R._portals.find(p=>p.f.id===id);
     const card=portal?.card;
     if(!card)throw Error('Open gate is not rendered while building underground');
     return [{x:card.x+card.w/2,y:card.y+card.h/2},R.P(...inland,R.trackH('underground'))];
   })()`);
   for(const p of points){
    if(!await E(`document.elementFromPoint(${p.x},${p.y})===CM.R.cv`))throw Error('Gate construction target covered in '+map);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await delay(200);
   }
   await E(`(()=>{
     const g=CM.game,draft=g.draft?.net;
     if(!draft||!Object.values(draft.stations).some(s=>s.portal===borderTest.id))
       throw Error('Touch did not build at the gate');
     if(!Object.keys(draft.segments).length)throw Error('Touch did not create a segment: '+CM.ui.toasts.textContent);
     if(CM.CityLink.connected(g))throw Error('The draft opened the gate early');
     if(!g.canConfirm().ok)throw Error(g.canConfirm().reason+JSON.stringify(g.draftEval().conflicts));
   })()`);
   await tap('[data-act="build.confirm"]');
   if(!await E('CM.CityLink.connected(CM.game)'))throw Error('Confirmed underground line did not connect gate in '+map);
   await until(`(()=>{
     const m=CM.game.model,f=m.facStats(borderTest.id,'avg');
     return m.trafficReady()&&f&&f.innM+f.outM>0;
   })()`);
   await E(`(async()=>{
     const g=CM.game;
     g.setCrossFee(borderTest.id,2);
     const save=await CM.Save.save(g,'manual');
     if(!save.ok||CM.Save.slotInfo(save.slotId).store!=='idb')throw Error('Gate fixture was not saved to IndexedDB');
     CM.loadGame(await CM.Save.load(save.slotId));
     return true;
   })()`);
   await until('!CM.isLoading()&&CM.CityLink.gates(CM.game).some(q=>q.f.id===borderTest.id&&q.link&&q.riders>0&&q.fee===2)');
   await close();await E('CM.ui.openOpsApp("gates");true');await settle();
   await audit('gate control '+map,'.mc-app button,.mc-app input');await close();
   console.log('PASS',map,'touch-built underground portal, active border riders and IndexedDB reload');
  }
  await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report));return;
 }
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
 await tap('.nm-mode [data-mode=schematic]');
 await until('document.querySelector(".nm-mode [data-mode=schematic]").getAttribute("aria-pressed")==="true"&&!!document.querySelector(".nm-svg [data-segment]")');
 if(await E('document.querySelector(".nm-svg").outerHTML.includes("NaN")'))throw Error('Schematic contains invalid coordinates');
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
  head.appendChild=function(node){if(node.tagName==='SCRIPT'&&new URL(node.src).pathname.endsWith('/geo_tk.js')){queueMicrotask(()=>node.onerror());return node;}return append.call(this,node);};
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
