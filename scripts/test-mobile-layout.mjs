// Real Chromium hit-testing in an isolated profile; never opens player storage.
import os from 'node:os';import {fileURLToPath} from 'node:url';import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';
const candidates=[process.env.CM_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);let browser;for(const p of candidates){try{await fs.access(p);browser=p;break;}catch{}}if(!browser)throw Error('No Chromium browser found. Set CM_BROWSER to its executable path.');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),tempRoot=os.tmpdir(),task=await fs.mkdtemp(path.join(tempRoot,'city-metro-mobile-')),profile=path.join(task,'profile');await fs.mkdir(profile);const output=process.env.CM_MOBILE_OUTPUT&&path.resolve(process.env.CM_MOBILE_OUTPUT);if(output)await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(root+path.sep))throw Error('outside');const b=await fs.readFile(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}});await new Promise((r,j)=>server.once('error',j).listen(0,'127.0.0.1',r));
const edge=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile],{windowsHide:true,stdio:'ignore'}),delay=ms=>new Promise(r=>setTimeout(r,ms));let ws,send;
try{let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await delay(100);}if(!port)throw Error('No debug port');const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port+'/'),{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const waiting=new Map(),errors=[];
ws.onclose=()=>{for(const w of waiting.values()){clearTimeout(w.timer);w.bad(Error('Browser closed'));}waiting.clear();};
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const w=waiting.get(m.id);if(w){clearTimeout(w.timer);waiting.delete(m.id);m.error?w.bad(Error(JSON.stringify(m.error))):w.ok(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.description||a.value).join(' '));};
send=(method,params={})=>new Promise((ok,bad)=>{const id=++seq,timer=setTimeout(()=>{waiting.delete(id);bad(Error('CDP timeout '+method));},90000);waiting.set(id,{ok,bad,timer});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async exp=>{const r=await send('Runtime.evaluate',{expression:exp,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
const until=async(exp,ms=120000)=>{const start=Date.now();while(Date.now()-start<ms){if(await evaluate(exp))return;await delay(150);}throw Error('Wait '+exp+' '+errors.join('\n'));};
const screenshot=async(name)=>{if(output)await fs.writeFile(path.join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await until('!!window.CM?.ui&&!!document.querySelector(".start-menu")');await evaluate('CM.Settings.set("autosave",false);CM.Settings.set("sound",false);CM.newGame({map:"bj",mode:"challenge",seed:19900101});true');await until('!CM.isLoading()&&!!CM.game&&!CM.game.pending');await evaluate('CM.ui.closeScreen();CM.ui.closePanel(true);CM.game.setSpeed(0);CM.ui.toasts.replaceChildren();CM.ui.clearCelebrations();true');
await runMobileChecks({evaluate,send,until,screenshot,delay,task,fs,path});if(output)await fs.copyFile(path.join(task,'report.json'),path.join(output,'report.json'));
if(errors.length)throw Error('Browser errors:\n'+[...new Set(errors)].join('\n'));console.log('PASS isolated Edge browser checks');
}catch(error){if(output&&send){try{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}}throw error;}finally{if(send)await Promise.race([send('Browser.close').catch(()=>{}),delay(1500)]);if(ws)ws.close();edge.kill();server.closeAllConnections();await new Promise(r=>server.close(r));if(path.dirname(task)!==tempRoot||!path.basename(task).startsWith('city-metro-mobile-')||(await fs.lstat(task)).isSymbolicLink())throw Error('Refusing to clean an unexpected profile path');await fs.rm(task,{recursive:true,force:true,maxRetries:6,retryDelay:100});}

async function runMobileChecks({evaluate:E,send,screenshot,delay,task,fs,path,until}){
 const inputOnly=!!(process.env.CM_MOBILE_INPUT_ONLY||process.env.CM_MOBILE_PATCH_ONLY),report={scope:process.env.CM_MOBILE_PATCH_ONLY?'patch and input':inputOnly?'input':process.env.CM_MOBILE_FAST?'panels and input':'all',groups:[],states:0,hits:0};
 await E('(()=>{const s=document.createElement("style");s.id="mobile-test-motion";s.textContent="*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";document.head.appendChild(s);return true})()');
 await E(`window.mobileAudit=function(selector,required){const ui=CM.ui,v=ui.viewport(),out={hits:0,bad:[]},rname=e=>e.getAttribute('data-act')||e.getAttribute('aria-label')||e.getAttribute('data-tip')||e.textContent.trim().slice(0,30);for(const e of document.querySelectorAll(selector)){if(e.disabled)continue;let visible=true;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0){visible=false;break;}}const r=e.getBoundingClientRect(),must=e.matches(required||':not(*)');if(!visible||!r.width||!r.height){if(must)out.bad.push({name:rname(e),reason:'hidden'});continue;}let a={left:Math.max(r.left,v.left),top:Math.max(r.top,v.top),right:Math.min(r.right,v.right),bottom:Math.min(r.bottom,v.bottom)};for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){a.left=Math.max(a.left,b.left);a.right=Math.min(a.right,b.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){a.top=Math.max(a.top,b.top);a.bottom=Math.min(a.bottom,b.bottom);}}if(a.right-a.left<8||a.bottom-a.top<8){if(must)out.bad.push({name:rname(e),reason:'outside',r:[r.x,r.y,r.width,r.height]});continue;}if(must&&(a.right-a.left<r.width-1||a.bottom-a.top<r.height-1))out.bad.push({name:rname(e),reason:'clipped',r:[r.x,r.y,r.width,r.height],a});const n=document.elementFromPoint((a.left+a.right)/2,(a.top+a.bottom)/2);out.hits++;if(n!==e&&!e.contains(n))out.bad.push({name:rname(e),reason:'covered',point:[(a.left+a.right)/2,(a.top+a.bottom)/2],a,by:n?.closest('button,aside,nav,.ops-pop,#layerPanel')?.outerHTML.slice(0,150)||n?.tagName,r:[r.x,r.y,r.width,r.height]});}if(selector.includes('#coach')){const c=document.getElementById('coach'),t=document.getElementById('coachTip');if(c&&t&&getComputedStyle(t).visibility!=='hidden'&&getComputedStyle(t).display!=='none'){const a=c.getBoundingClientRect(),b=t.getBoundingClientRect();if(a.width&&b.width&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)out.bad.push({name:'tutorial hint',reason:'covers tutorial card'});}}if(selector.includes('#hudTop')){const x=ui.pills.money.v,r=x.getBoundingClientRect(),m=ui.top.querySelector('.metrics').getBoundingClientRect();if(r.width&&(x.scrollWidth>x.clientWidth+1||r.right>m.right+1||r.left<m.left-1))out.bad.push({name:'funds text',reason:'clipped',width:x.clientWidth,needed:x.scrollWidth});}if(selector.includes('#hudTop')){const sb=ui.scaleBar;if(sb&&sb.offsetWidth&&getComputedStyle(sb).opacity!=='0'&&getComputedStyle(sb).visibility!=='hidden'){const a=sb.getBoundingClientRect();for(const b of document.querySelectorAll('#toolbar,.br-dock,#hudTop,#rightPanel,#coach,#legendCard,#dock')){const st=getComputedStyle(b);if(st.display==='none'||st.visibility==='hidden'||st.opacity==='0')continue;const r=b.getBoundingClientRect();if(r.width&&r.height&&a.left<r.right-1&&a.right>r.left+1&&a.top<r.bottom-1&&a.bottom>r.top+1)out.bad.push({name:'scale bar',reason:'overlaps '+b.id});}}}return out};true`);
 const audit=async(label,sel='#hudTop button,#toolbar button,.br-dock button,#dock button',must='#toolbar button,.br-dock button')=>{let r=await E('mobileAudit('+JSON.stringify(sel)+','+JSON.stringify(must)+')');if(r.bad.length){await delay(350);r=await E('mobileAudit('+JSON.stringify(sel)+','+JSON.stringify(must)+')');}report.states++;report.hits+=r.hits;if(r.bad.length){await screenshot('failure');throw Error(label+' '+JSON.stringify(r.bad));}};
 const tap=async(exp)=>{const p=await E('(()=>{const r=('+exp+').getBoundingClientRect();const p={x:r.x+r.width/2,y:r.y+r.height/2},n=document.elementFromPoint(p.x,p.y);if(!r.width||!r.height||!(n===('+exp+')||('+exp+').contains(n)))throw Error("Touch target covered: "+('+JSON.stringify(exp)+')+" by "+n?.outerHTML.slice(0,160));return p})()');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(80);};
 const wait=async()=>{await E('CM.ui.layoutHud();CM.ui.measureLayout();true');await delay(180);await E('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))');};
 const sizes=[[320,568],[360,740],[375,667],[390,844],[430,932],[568,320],[667,375],[844,390]],langs=['zh-CN','zh-TW','en'];
 if(!process.env.CM_MOBILE_FAST&&!inputOnly)for(const lang of langs)for(const scale of [.9,1,1.15]){
  for(const[w,h]of sizes){await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",'+scale+');CM.ui.closePanel(true);CM.ui.tools.setTool("select");CM.ui.toasts.replaceChildren();true');await wait();await audit([lang,scale,w,h,'base'].join('/'));report.groups.push({lang,scale,w,h});if(lang==='zh-CN'&&scale===1&&w===390)await screenshot('after-390');}
  console.log('PASS base HUD',lang,scale);
 }
 // Real draft and construction options must leave navigation and confirmation reachable.
 await E('window.layoutStation=Object.keys(CM.game.net.stations)[0];CM.game.edit(n=>{const s=n.stations[layoutStation];s.size=s.size==="L"?"M":"L"});true');
 if(!inputOnly)for(const lang of langs)for(const scale of [1,1.15])for(const[w,h]of sizes){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",'+scale+');CM.ui.closePanel(true);CM.ui.toasts.replaceChildren();CM.ui.tools.setTool("line");true');await wait();await audit([lang,scale,w,h,'draft'].join('/'),'#hudTop button,#toolbar button,.br-dock button,#draftbar button,#toolopts button','#toolbar button,.br-dock button,#draftbar button');
  await E('CM.ui.openPage("station",layoutStation,{root:true});true');await wait();await audit([lang,scale,w,h,'station drawer'].join('/'),'#toolbar button,.br-dock button,#draftbar button,#rightPanel .p-head button','#toolbar button,.br-dock button,#draftbar button');
  await E('CM.ui.closePanel(true);CM.ui.toggleLayerPanel(true);true');await wait();await audit([lang,scale,w,h,'layers'].join('/'),'#toolbar button,.br-dock button,#draftbar button,#layerPanel button','#toolbar button,.br-dock button,#draftbar button');await E('CM.ui.layerPanel.scrollTop=CM.ui.layerPanel.scrollHeight;true');await audit('layer tools at bottom','#layerPanel button');await E('CM.ui.toggleLayerPanel(false);true');
 }
 if(!inputOnly)console.log('PASS draft, details and layers');
 await E('CM.game.cancelDraft();CM.ui.tools.setTool("select");CM.ui.closePanel(true);true');
 // Overload notice uses the remaining map area, including safe insets and zoom.
 if(!inputOnly)for(const lang of langs)for(const[w,h]of[[320,568],[390,844],[568,320],[844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",1.15);CM.ui.showOpsPop({kind:"station",id:layoutStation,level:"bad",title:"车站持续过载",sub:"高峰负荷超过设计容量，需要升级或分流"});true');await wait();await audit([lang,w,h,'overload notice'].join('/'),'#toolbar button,.br-dock button,.ops-pop button','#toolbar button,.br-dock button');await E('CM.ui._opsPop.scrollTop=CM.ui._opsPop.scrollHeight;true');await audit('overload actions at bottom','.ops-pop button');await E('CM.ui.hideOpsPop();true');
 }
 if(!inputOnly)console.log('PASS overload notice');
 await send('Emulation.setDeviceMetricsOverride',{width:375,height:667,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("language","en");CM.Settings.set("uiScale",1.15);for(const[k,v]of Object.entries({"--safe-top":"24px","--safe-bottom":"24px","--safe-left":"18px","--safe-right":"18px"}))document.documentElement.style.setProperty(k,v);true');await wait();await audit('safe area with enlarged UI');await screenshot('after-safe-area');
 await E('for(const k of ["--safe-top","--safe-bottom","--safe-left","--safe-right"])document.documentElement.style.removeProperty(k);CM.Settings.set("uiScale",1);true');
 // App switches and immersive restore are real pointer targets.
 await wait();for(const t of ['edit','demolish','select']){await tap('CM.ui.tbtns.'+t);if(!await E('CM.ui.tools.tool==='+JSON.stringify(t)))throw Error('Native touch did not select '+t);}for(const type of ['opsDock','satDock']){await tap('CM.ui.'+type);await delay(100);const app=type==='opsDock'?'opsApp':'voApp';if(!await E('!!CM.ui.'+app))throw Error('App did not open: '+app);await E('CM.ui.'+app+'.close(null,true);true');}
 await E('CM.ui.openPage("station",layoutStation,{root:true});CM.ui.rTitle.click();true');await send('Emulation.setDeviceMetricsOverride',{width:375,height:400,deviceScaleFactor:1,mobile:true});await wait();await audit('name editing with reduced viewport','#rightPanel .p-head button,#rightPanel input');if(await E('!!CM.ui.brDock.offsetHeight'))throw Error('App dock covers keyboard editing');await E('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));CM.ui.closePanel(true);true');await send('Emulation.setDeviceMetricsOverride',{width:375,height:667,deviceScaleFactor:1,mobile:true});await wait();
 await E('const tr=CM.agents.trains.find(t=>!t.dying&&t.g);if(!tr)throw Error("No train to follow");CM.Follow.start(tr);true');await wait();await audit('following controls','#followCard button');if(await E('!!CM.ui.brDock.offsetHeight'))throw Error('App dock covers train controls');await E('CM.Follow.stop(true);CM.ui.queueLayout();true');await wait();
 await E('CM.ui.toggleImmersive(true);true');await wait();await audit('immersive restore','#immExit','#immExit');if(await E('!!CM.ui.brDock.offsetHeight'))throw Error('Footer visible in immersive mode');await E('CM.ui.toggleImmersive(false);true');await wait();await audit('restored HUD');

 // Native input with the game's normal animation preference.
 await E('document.getElementById("mobile-test-motion").remove();CM.Settings.set("language","zh-CN");CM.ui.closePanel(true);true');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait();await delay(500);
 for(const t of ['edit','demolish','select']){await tap('CM.ui.tbtns.'+t);if(!await E('CM.ui.tools.tool==='+JSON.stringify(t)))throw Error('Animated touch failed: '+t);}await tap('CM.ui.opsDock');await until('!!CM.ui.opsApp&&!CM.ui.opsApp.el.getAnimations().some(a=>a.playState==="running")');await delay(150);await tap('document.querySelector(".mc-exit")');await delay(350);if(await E('!!CM.ui.opsApp'))throw Error('Native app exit failed');await audit('normal animation HUD');
 if(!process.env.CM_MOBILE_INPUT_ONLY)await runPatchChecks({E,send,tap,wait,audit,until,delay,screenshot,report});
 // Real tutorial: long English cards scroll within the space above the footer.
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await E('CM.newGame({map:"tutorial",mode:"free",tutorial:true,seed:20000101});true');await until('!CM.isLoading()&&CM.game?.tutorial');await until('!!document.querySelector("#screen:not(.hidden) .mission-card .primary")');await E('document.querySelector(".mission-card .primary").scrollIntoView({block:"center"});true');await delay(200);await tap('document.querySelector(".mission-card .primary")');await until('CM.ui.screen.classList.contains("hidden")');await E('CM.ui.toasts.replaceChildren();true');
 for(const lang of ['zh-CN','en'])for(const[w,h]of[[320,568],[375,667],[568,320]]){await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",1.15);true');await wait();await audit('tutorial '+lang+'/'+w+'/'+h,'#hudTop button,#toolbar button,.br-dock button,#coach button','#toolbar button,.br-dock button');await E('(()=>{const c=document.getElementById("coach");if(c)c.scrollTop=c.scrollHeight;return true})()');await audit('tutorial actions','#coach button','#coach .co-acts button');if(lang==='en')await screenshot('after-tutorial-'+w);}
 await E('CM.Tutorial.detach();CM.ui.closePanel(true);CM.Settings.set("uiScale",1);true');await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await wait();await audit('desktop HUD preserved');report.nativeTouch=true;report.animationSmoke=true;
 report.missing=await E('CM.I18n.missing()');if(report.missing.length)throw Error('Untranslated interface text: '+JSON.stringify(report.missing));
 await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report,null,2));console.log('PASS mobile layout',JSON.stringify({groups:report.groups.length,states:report.states,hits:report.hits}));
}

async function runPatchChecks({E,send,tap,wait,audit,until,delay,screenshot,report}) {
  for(const lang of ['zh-CN','zh-TW','en']) for(const [width,height] of [[320,568],[375,667],[568,320]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",1.15);CM.ui.closePanel(true);CM.ui.showTrainShop(null,null,"车辆段",8);true');
    await wait();
    await audit('patch shop '+lang+'/'+width,'#screen button',':not(*)');
    await E('document.querySelector(".fo-qty").scrollIntoView({block:"center"});true');
    await delay(150);
    await audit('patch quantity '+lang+'/'+width,'#screen .fo-buy button,#screen .fo-qty','#screen .fo-qty');
    if(lang==='en'&&width===320)await screenshot('patch-quantity-320');
    await E('document.querySelector("#screen .modal-actions .primary").scrollIntoView({block:"center"});true');
    await audit('patch purchase action','#screen .modal-actions button','#screen .modal-actions button');
    await tap('document.querySelector("#screen .modal-actions button")');
    await E('CM.ui.showFleetAlloc();true');await wait();
    await E('document.querySelector("#screen .modal-actions").scrollIntoView({block:"center"});true');
    await audit('patch allocation '+lang+'/'+width,'#screen button','#screen .modal-actions button');
    await E('CM.ui.closeScreen();CM.ui.openPage("finance","ov",{root:true});true');await wait();
    await until('!CM.ui.right.getAnimations({subtree:true}).some(a=>a.playState==="running"&&Number.isFinite(a.effect.getTiming().iterations))');
    await E('window.patchFareSwitch=Array.from(document.querySelectorAll("#rightPanel [role=switch]")).find(b=>b.getAttribute("aria-label")===CM.I18n.text("随物价自动调价"));if(!patchFareSwitch)throw Error("Missing fare switch");patchFareSwitch.scrollIntoView({block:"center"});true');
    await wait();
    // Traffic publication can redraw an open finance page; scroll the current control after its layout settles.
    await E('window.patchFareSwitch=document.querySelector("#rightPanel [role=switch]");patchFareSwitch.scrollIntoView({block:"center"});true');
    await delay(150);await audit('patch fare switch '+lang+'/'+width,'#rightPanel button[role=switch]','#rightPanel button[role=switch]');
    const previous=await E('!!CM.game.econ.fareAuto');
    await tap('patchFareSwitch');if(await E('!!CM.game.econ.fareAuto')===previous)throw Error('Fare indexing touch did not change preference');
    await tap('patchFareSwitch');
    await E('CM.ui.closePanel(true);CM.ui.toasts.replaceChildren();true');await wait();await audit('patch restored map '+lang+'/'+width);
    await E('CM.ui.tools.setTool("line");true');await wait();
    await audit('patch construction labels '+lang+'/'+width,'#hudTop button,#toolbar button,.br-dock button,#toolopts button');
    await E('CM.ui.tools.setTool("select");true');
  }
  console.log('PASS patch train/finance controls in three languages and portrait/landscape');

  // Purchase, allocate and partially sell through the real dialogs and native touch/typing.
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:667,deviceScaleFactor:1,mobile:true});
  await E('CM.Settings.set("language","en");CM.Settings.set("uiScale",1);window.patchBefore={funds:CM.game.econ.funds,ids:CM.game.fleet.trains.map(t=>t.id)};CM.ui.showTrainShop(null,null,"车辆段",8);true');await wait();
  await E('document.querySelector(".fo-buy .seg-ctl button").scrollIntoView({block:"center"});true');
  await tap('document.querySelector(".fo-buy .seg-ctl button")');
  await E('const q=document.querySelector(".fo-qty");q.scrollIntoView({block:"center"});q.focus();q.select();true');
  await send('Input.insertText',{text:'7'});
  await E('document.querySelector(".fo-qty").blur();document.querySelector("#screen .modal-actions .primary").scrollIntoView({block:"center"});true');
  await tap('document.querySelector("#screen .modal-actions .primary")');
  await E('CM.ui.closeScreen();window.patchBought=CM.game.fleet.trains.filter(t=>!patchBefore.ids.includes(t.id));if(patchBought.length!==7)throw Error("Typed purchase quantity was not used");const expected=CM.Fleet.price(CM.game,CM.Fleet.model(patchBought[0].model),patchBought[0].cars,CM.game.clock.y)*7;if(Math.abs(patchBefore.funds-CM.game.econ.funds-expected)>.00001)throw Error("Purchase charge does not match quantity");window.patchPlan=CM.Fleet.allocPlan(CM.game);CM.ui.showFleetAlloc();true');
  await wait();
  if(await E('patchPlan.moved>0')) {
    await E('document.querySelector("#screen .modal-actions .primary").scrollIntoView({block:"center"});true');
    await tap('document.querySelector("#screen .modal-actions .primary")');
    if(await E('patchBought.filter(t=>t.line).length')!==await E('patchPlan.moved'))throw Error('Allocation confirmation did not apply the preview');
  } else await E('CM.ui.closeScreen();true');
  await E('window.patchSellValue=patchBought.slice(0,2).reduce((v,t)=>v+CM.Fleet.residual(CM.game,t),0);window.patchSaleFunds=CM.game.econ.funds;CM.ui.showTrainSell({m:CM.Fleet.model(patchBought[0].model),cars:patchBought[0].cars,ids:patchBought.map(t=>t.id)},()=>{});true');await wait();
  await E('(()=>{const q=document.querySelector(".fo-qty");q.focus();q.select();return true})()');await send('Input.insertText',{text:'2'});
  await E('document.querySelector(".fo-qty").blur();document.querySelector("#screen .modal-actions .primary").scrollIntoView({block:"center"});true');await tap('document.querySelector("#screen .modal-actions .primary")');
  await E('if(patchBought.filter(t=>CM.game.fleet.trains.some(x=>x.id===t.id)).length!==5)throw Error("Partial sale sold the wrong quantity");if(Math.abs(CM.game.econ.funds-patchSaleFunds-patchSellValue)>.00001)throw Error("Residual sale cash is inconsistent");CM.game.fleet.autoAlloc=true;CM.game.econ.setFareAuto(true,CM.game.clock.y);window.patchSavedFunds=CM.game.econ.funds;true');
  await E('(async()=>{const r=await CM.Save.save(CM.game,"manual",{label:"v2.5.1 browser regression"});if(!r.ok)throw Error(r.error);if(CM.Save.slotInfo(r.slotId).store!=="idb")throw Error("Browser save did not use IndexedDB");const payload=await CM.Save.load(r.slotId);if(!payload.fleet.autoAlloc||!payload.econ.fareAuto)throw Error("New preferences missing from save");CM.loadGame(payload);return true})()');
  await until('!CM.isLoading()&&!!CM.game?.fleet?.autoAlloc');
  await E('CM.ui.closeScreen();CM.ui.closePanel(true);CM.game.setSpeed(0);if(!CM.game.econ.fareAuto||CM.game.econ.funds!==patchSavedFunds)throw Error("Preferences or funds changed after reload");true');
  report.patchStorage=true;console.log('PASS native quantity purchase/allocation/partial sale and real IndexedDB reload');

  // A scale bar must represent the actual ground distance after both UI and camera transforms.
  for(const view of [false,true])for(const unit of ['km','deg']) {
    await E('CM.Settings.set("uiScale",1.15);CM.Settings.set("grid",true);CM.Settings.set("gridUnit",'+JSON.stringify(unit)+');CM.ui.setView('+view+');true');
    await until('Math.abs(CM.R.cam.t-'+(view?1:0)+')<.002');await wait();
    const check=await E('(()=>{const R=CM.R,b=CM.ui.scaleBar,r=b.querySelector(".sb-b").getBoundingClientRect(),s=b.querySelector(".sb-t").textContent,n=parseFloat(s)*(s.includes("km")?1000:1),a=R.unproject(R.w/2-r.width/2,R.h/2,0),c=R.unproject(R.w/2+r.width/2,R.h/2,0);return{label:n,distance:Math.hypot(a.x-c.x,a.y-c.y)*CM.CFG.CELL_M,geo:CM.Grid.isGeo()}})()');
    if(Math.abs(check.distance-check.label)>check.label*.04)throw Error('Scale bar distance is inaccurate: '+JSON.stringify(check));
    if(check.geo!==(unit==='deg'))throw Error('Grid units were not applied');
    await audit('scale '+view+'/'+unit);
  }
  await E('CM.Settings.set("grid",false);CM.Settings.set("gridUnit","km");CM.Settings.set("uiScale",1);true');
  for(const view of [false,true]) {
    await E('CM.ui.setView('+view+');(()=>{const a=CM.R.hubModels(CM.game.city,CM.game.year()).find(x=>x.id==="hbj_pek");if(!a)throw Error("Beijing airport terminal missing");CM.R.flyTo(a.x,a.y,64);return true})()');
    await until('!CM.R.cam.fly&&Math.abs(CM.R.cam.t-'+(view?1:0)+')<.002');await delay(1000);
    await screenshot('patch-airport-'+(view?'25d':'2d'));
  }
  report.patchScale=true;console.log('PASS physical scale in both views/grid units and Beijing terminal previews');
}
