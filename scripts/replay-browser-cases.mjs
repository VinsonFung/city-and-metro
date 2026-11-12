// Real browser replay lifecycle and hit tests, called only in the launcher's isolated profile.
export async function runReplayChecks({E,send,until,screenshot,delay,settle,tap,audit,close,report}){
 await E('CM.game.clock.m=6;window.replayNet=JSON.stringify(CM.game.net);window.replayFunds=CM.game.econ.funds;window.replayTrace=[];for(const k of ["start","stop"]){const fn=CM.NetReplay[k];CM.NetReplay[k]=function(...args){replayTrace.push([k,new Error().stack]);return fn.apply(this,args)}};true');
 for(const lang of ['zh-CN','zh-TW','en'])for(const[width,height]of[[320,568],[568,320],[390,844]])for(const scale of[1,1.15]){
  await close();await send('Page.bringToFront');await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await E(`CM.Settings.set('language',${JSON.stringify(lang)});CM.Settings.set('uiScale',${scale});CM.ui.openNetMap();true`);await settle();
  await audit('replay header '+[lang,width,height,scale],'#netmap button');
  if(await E('!!document.querySelector("[data-style=sky],[data-style=ink]")||!!CM.Achievements'))throw Error('Standalone-only appearance/achievements leaked');
  await tap('.nm-replay');try{await until('!!document.querySelector(".nr-range")',10000);}catch(e){throw Error(e.message+' '+[lang,width,height,scale]+' '+JSON.stringify(await E('replayTrace.slice(-4)')));}await settle();
  await audit('replay controls '+[lang,width,height,scale],'#netmap button,.nr-range');
  const bounds=await E(`(()=>{const host=document.querySelector('.nm-canvas').getBoundingClientRect();return [...document.querySelectorAll('.nr-bar button,.nr-range')].map(e=>e.getBoundingClientRect()).every(r=>r.width>24&&r.height>12&&r.left>=host.left&&r.right<=host.right+1&&r.top>=host.top&&r.bottom<=host.bottom+1)})()`);if(!bounds)throw Error('Replay control outside canvas '+[lang,width,height,scale]);
  await tap('.nr-play');
  if(!await E('document.querySelector(".nr-play").getAttribute("aria-label")===CM.I18n.text("播放")'))throw Error('Pause label not localized');
  const before=await E('CM.NetReplay.info().p');await delay(100);if(await E('CM.NetReplay.info().p')!==before)throw Error('Paused replay advanced');
  // Input/change is also the path used by touch dragging and keyboard scrubbing.
  await E('var r=document.querySelector(".nr-range");r.value=500;r.dispatchEvent(new Event("input",{bubbles:true}));r.dispatchEvent(new Event("change",{bubbles:true}));true');await delay(100);
  if(Math.abs(await E('CM.NetReplay.info().p')-.5)>.001)throw Error('Replay did not seek');
  // Native range keyboard handling must not reach map shortcuts.
  await E('document.querySelector(".nr-range").focus();true');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  if(await E('CM.NetReplay.info().p')<=.5)throw Error('Range keyboard handling failed');
  await E('var r=document.querySelector(".nr-range");r.value=1000;r.dispatchEvent(new Event("input",{bubbles:true}));r.dispatchEvent(new Event("change",{bubbles:true}));true');await settle();
  if(lang==='en'&&width===390&&scale===1)await screenshot('replay-mobile-en');
  await tap('.nr-bar .btn');await until('!CM.NetReplay.active()&&!document.querySelector(".nr-canvas,.nr-bar,.nr-wait")');
  if(!await E('!document.querySelector(".nm-export").disabled&&!document.querySelector(".nm-replay").disabled&&!document.querySelector(".nm-svg").classList.contains("replaying")'))throw Error('Replay did not restore diagram');
  console.log('PASS replay phone',lang,width,height,scale);
 }
 console.log('PASS replay controls, pause/seek, localized labels and exit: three languages, three phone sizes, two scales');
 await close();await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await E('CM.Settings.set("uiScale",1);CM.Settings.set("language","zh-CN");CM.ui.openNetMap();true');await settle();
 // Closing synchronously, while the preparation timer is pending, must cancel the job.
 await E('document.querySelector(".nm-replay").click();CM.NetMap.close();true');await delay(150);
 if(await E('CM.NetReplay.active()||!!document.querySelector(".nr-canvas,.nr-wait")'))throw Error('Preparation survived close');
 await E('CM.ui.openNetMap();true');await settle();await tap('.nm-replay');await until('!!CM.NetReplay.info()');
 await E('document.querySelector(".nm-mode [data-mode=geographic]").click();true');await settle();
 // If the selected mode was already geographic it does not redraw; explicitly select schematic next.
 await E('document.querySelector(".nm-mode [data-mode=schematic]").click();true');await settle();
 if(await E('CM.NetReplay.active()'))throw Error('Layout change did not stop replay');
 await tap('.nm-replay');await until('!!CM.NetReplay.info()');await E('document.querySelector(".nr-play").click();true');
 const p=await E('(()=>{var r=document.querySelector(".nm-canvas").getBoundingClientRect();return{x:r.left+r.width*.5,y:r.top+r.height*.65}})()');
 const oldView=await E('document.querySelector(".nm-svg").getAttribute("viewBox")');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+100,y:p.y+30,buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+100,y:p.y+30,button:'left',buttons:0,clickCount:1});await delay(200);
 if(await E('document.querySelector(".nm-svg").getAttribute("viewBox")')===oldView)throw Error('Diagram drag did not move view');
 await screenshot('replay-desktop');
 await E('var r=document.querySelector(".nr-range");r.value=1000;r.dispatchEvent(new Event("input",{bubbles:true}));r.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(".nr-play").click();true');await until('document.querySelector(".nr-play").dataset.tip===CM.I18n.text("重播")',10000);
 await tap('.nr-play');if(await E('CM.NetReplay.info().p')>=1)throw Error('Replay did not restart');await E('CM.NetReplay.stop();true');await settle();
 // Drafts may be displayed in the diagram but cannot pollute the replay history.
 await E('CM.game.edit(n=>{n.lines[Object.keys(n.lines)[0]].name="Unconfirmed fixture"});CM.NetMap.refresh();true');await settle();
 await E('[...document.querySelectorAll(".nm-head>.seg-ctl:not(.nm-mode) button")].at(-1).click();true');await settle();
 if(!await E('document.querySelector(".nm-replay").disabled'))throw Error('Draft replay allowed');await E('CM.game.cancelDraft();CM.NetMap.refresh();true');await close();
 if(!await E('JSON.stringify(CM.game.net)===replayNet&&CM.game.econ.funds===replayFunds'))throw Error('Replay changed official network or funds');
 // The fare guide must open Metro Core, and failure funds must use the captured amount.
 await E('CM.ui.openPage("guide","fare");true');await settle();
 const guide=await E('(()=>{const e=[...document.querySelectorAll(".guide-page button")].find(e=>e.textContent.includes("票价设置"));e.click();return true})()');if(!guide)throw Error('Missing fare guide');await until('!!document.querySelector(".fe-groups")');await close();
 await E('CM.ui.showFailure({reasons:["Fixture"],funds:-123456});true');await settle();
 if(!await E('document.querySelector("#screen").textContent.includes(CM.U.fmtMoney(-123456))'))throw Error('Failure dialog shows live funds');await close();
 // Choose an option in the detached dropdown without dismissing its owning quick popup.
 await E('CM.ui.tools.setTool("select");const sg=Object.values(CM.game.net.segments)[0],s=CM.game.net.stations[sg.a];CM.ui.flyTo(s.x,s.y,24);CM.ui.select({kind:"seg",id:sg.id});true');await delay(800);
 await until('!!document.querySelector("#objBar:not(.hidden)")');await tap('#objBar [aria-label="贯通、拆开与支线"]');await settle();
 await tap('.qpop .dd');await audit('quick split dropdown','.dd-pop button');
 await E('var list=document.querySelector(".dd-pop");list.scrollTop=list.scrollHeight;true');await settle();await tap('.dd-pop button:last-child');
 if(!await E('!!document.querySelector(".qpop")&&!document.querySelector(".dd-pop")'))throw Error('Selecting dropdown dismissed owner');
 await close();await E('CM.Quick.hide();true');console.log('PASS replay cancellation, layout changes, panning, draft boundary, fare help, failure snapshot and detached quick dropdown');
 // UI zoom changes physical pointer coordinates but must not move the zoom anchor or exaggerate dragging.
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await E('CM.Settings.set("uiScale",1.15);CM.ui.openNetMap();true');await settle();
 const anchor=await E('(()=>{const r=document.querySelector(".nm-canvas").getBoundingClientRect(),p={x:r.left+r.width*.67,y:r.top+r.height*.62};window.anchorWorld=new DOMPoint(p.x,p.y).matrixTransform(document.querySelector(".nm-svg").getScreenCTM().inverse());return p})()');
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:anchor.x,y:anchor.y,deltaX:0,deltaY:-120});await delay(800);
 let screen=await E('(()=>{const p=anchorWorld.matrixTransform(document.querySelector(".nm-svg").getScreenCTM());return{x:p.x,y:p.y}})()');
 if(Math.hypot(screen.x-anchor.x,screen.y-anchor.y)>2)throw Error('UI zoom displaced wheel anchor '+JSON.stringify({anchor,screen}));
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:anchor.x,y:anchor.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:anchor.x+85,y:anchor.y+27,buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:anchor.x+85,y:anchor.y+27,button:'left',buttons:0,clickCount:1});await delay(250);
 screen=await E('(()=>{const p=anchorWorld.matrixTransform(document.querySelector(".nm-svg").getScreenCTM());return{x:p.x,y:p.y}})()');
 if(Math.hypot(screen.x-anchor.x-85,screen.y-anchor.y-27)>2)throw Error('UI zoom exaggerated dragging '+JSON.stringify({anchor,screen}));
 // Seek within a month, pause and watch actual canvas paints. An idle replay should stop repainting.
 await tap('.nm-replay');await until('!!CM.NetReplay.info()',10000);await tap('.nr-play');
 await E('var r=document.querySelector(".nr-range");r.value=500;r.dispatchEvent(new Event("input",{bubbles:true}));r.dispatchEvent(new Event("change",{bubbles:true}));true');await delay(200);
 await E('window.replayPaints=0;var c=document.querySelector(".nr-canvas").getContext("2d"),clear=c.clearRect;c.clearRect=function(...a){replayPaints++;return clear.apply(this,a)};true');await delay(500);
 if(await E('replayPaints')>2)throw Error('Paused replay kept repainting');
 await E('var r=document.querySelector(".nr-range");r.value=500;r.dispatchEvent(new Event("input",{bubbles:true}));r.dispatchEvent(new PointerEvent("pointercancel",{bubbles:true}));document.querySelector(".nr-play").click();true');await delay(250);
 if(await E('CM.NetReplay.info().p')<=.5)throw Error('Cancelled timeline gesture froze playback');await tap('.nr-play');
 // A paused replay must still redraw after rotation or a viewport resize.
 await send('Emulation.setDeviceMetricsOverride',{width:568,height:320,deviceScaleFactor:1,mobile:true});await settle();
 if(!await E('(()=>{const cv=document.querySelector(".nr-canvas"),p=cv.parentElement;return cv.width===Math.round(p.clientWidth*Math.min(2,devicePixelRatio))&&cv.height===Math.round(p.clientHeight*Math.min(2,devicePixelRatio))})()'))throw Error('Paused replay did not resize its canvas');
 await audit('paused replay after rotation','#netmap button,.nr-range');await close();
 // All tracks may have been demolished; their history must remain playable in both layouts.
 await E('window.archivedFixture={net:CM.game.net,compiled:CM.game.compiled,gone:CM.game.netGone};CM.game.netGone={stations:CM.Metro.clone(CM.game.net).stations,lines:CM.Metro.clone(CM.game.net).lines,segments:Object.fromEntries(Object.entries(CM.game.net.segments).map(([id,s])=>[id,{...s,gone:[CM.game.clock.y,CM.game.clock.m]}]))};CM.game.net=CM.Metro.empty();CM.game.compiled=CM.Metro.compile(CM.game.net,CM.game.city);CM.Settings.set("uiScale",1);CM.ui.openNetMap();true');await settle();
 for(const mode of['geographic','schematic']){
  await E(`document.querySelector('.nm-mode [data-mode=${mode}]').click();true`);await settle();
  if(!await E('!document.querySelector(".nm-replay").disabled&&document.querySelector(".nm-export").disabled'))throw Error('Demolished network history is inaccessible');
  await tap('.nm-replay');await until('!!CM.NetReplay.info()',10000);await tap('.nr-play');
  await E('var r=document.querySelector(".nr-range");r.value=500;r.dispatchEvent(new Event("input",{bubbles:true}));r.dispatchEvent(new Event("change",{bubbles:true}));true');await settle();
  if(!await E('/[1-9][0-9]* km/.test(document.querySelector(".nr-hud small").textContent)'))throw Error('Historical mileage is missing');
  await audit('demolished network '+mode,'#netmap button,.nr-range');await tap('.nr-bar .btn');
  if(!await E('document.querySelector(".nm-export").disabled'))throw Error('History-only diagram enabled empty PNG export');
 }
 await close();await E('CM.game.net=archivedFixture.net;CM.game.compiled=archivedFixture.compiled;CM.game.netGone=archivedFixture.gone;true');
 console.log('PASS scaled wheel/drag, idle replay rendering, paused rotation and replay after demolishing the entire network');
}
