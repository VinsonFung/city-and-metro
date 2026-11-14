// Real touch, hit testing and IndexedDB; the launcher uses an isolated profile.
export async function runFixChecks({E,send,until,screenshot,delay,settle,tap,audit,close,report}){
 if(process.env.CM_V27_TASK_UI_ONLY){await runTaskUIChecks({E,send,screenshot,delay,settle,tap,audit,close,report});return;}
 await runQuickViewportChecks({E,send,until,screenshot,delay,settle,tap,audit,close,report});
 if(process.env.CM_V27_QUICK_UI_ONLY)return;
 const touch=async sel=>{await E('document.querySelector('+JSON.stringify(sel)+').scrollIntoView({block:"center",inline:"nearest"});true');await delay(100);await tap(sel);await settle();};
 for(const lang of ['zh-CN','zh-TW','en'])for(const[width,height]of[[320,568],[568,320],[390,844],[1440,1000]]){
  await close();await send('Page.bringToFront');await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});
  await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",1.15);CM.game.econ.funds=1e9;CM.ui.openOpsApp("stations");true');await settle();
  if(await E('!!document.querySelector(".mc-chk input")||!!document.querySelector(".mc-batch:not([hidden])")'))throw Error('Batch controls visible before opting in');
  await audit('stations default '+[lang,width],'.mc-app button,.mc-app input');await touch('[data-batch=toggle]');
  const ids=await E('Array.from(document.querySelectorAll("tr[data-sid]")).slice(0,2).map(e=>e.dataset.sid)');if(ids.length!==2)throw Error('Missing station rows');
  await E('window.batchIds='+JSON.stringify(ids)+';for(const id of batchIds){CM.game.net.stations[id].tod=0;CM.game.net.stations[id].decor={style:"modern",art:"mural",sign:"std",color:null}};true');
  for(const id of ids)await touch('tr[data-sid="'+id+'"] .mc-chk input');
  await E('window.batchBefore=CM.game.econ.funds;window.quoteBefore=CM.ui.batchTodQuote(batchIds,1);true');await touch('[data-tod="1"]');
  await audit('batch quote '+[lang,width],'.mc-batch button,.mc-batch input');await touch('.mc-batch-ask button:last-child');
  if(!await E('CM.game.econ.funds===batchBefore&&batchIds.every(id=>!CM.game.net.stations[id].tod)'))throw Error('Cancelling commercial development spent money');
  await touch('[data-tod="1"]');await touch('[data-batch=tod-ok]');
  if(!await E('Math.abs(CM.game.econ.funds-(batchBefore-quoteBefore.cost))<.001&&batchIds.every(id=>CM.game.net.stations[id].tod===1)'))throw Error('Batch development payment or station levels incorrect');
  await E('window.decorCash=CM.game.econ.funds;true');await touch('[data-batch=reset]');
  if(!await E('CM.game.econ.funds===decorCash&&batchIds.every(id=>CM.game.net.stations[id].decor.art==="none")'))throw Error('Batch decoration was charged or did not apply');
  await audit('batch controls '+[lang,width],'.mc-batch button');
  await touch('.mc-batch .dd');await audit('batch style dropdown','.dd-pop button');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await settle();
  if(lang==='en'&&(width===320||width===568))await screenshot('v27-batch-'+width);
  await touch('[data-batch=toggle]');if(await E('!!document.querySelector(".mc-chk input")'))throw Error('Leaving batch mode did not clear controls');
  await close();await E('CM.ui.openOpsApp("stations");true');await settle();if(await E('!!document.querySelector(".mc-chk input")'))throw Error('Batch selection leaked to a new app');
 }
 console.log('PASS three-language batch opt-in, quote/cancel/payment, free decoration and dropdowns in four viewports');
 await close();await E('CM.Settings.set("uiScale",1);CM.Settings.set("language","zh-CN");window.testLine=Object.keys(CM.game.net.lines)[0];CM.ui.openOpsApp("lines",testLine);true');await settle();
 await E('window.crowdTable=document.querySelector(".mc-pad .tbl");if(!crowdTable)throw Error("Section load table missing");crowdTable.scrollIntoView({block:"start"});true');await settle();await audit('section load table','.mc-pad .tbl tr.clickable');
 await touch('.mc-pad .tbl tr.clickable');await until('!CM.ui.opsApp',10000);await close();
 await E('CM.Fleet.setMode(CM.game,testLine,"manual");for(const s of CM.Fleet.lineInfo(CM.game,testLine))CM.Fleet.setManual(CM.game,testLine,s.id,0,0);CM.game.model.solveNow(2);CM.ui.openOpsApp("lines",testLine);true');await settle();
 if(!await E('document.querySelector(".mc-kpis").textContent.includes("早高峰无列车")'))throw Error('No-train KPI still shows a percentage');await audit('stopped line controls','.mc-app button');
 for(const s of await E('CM.Fleet.lineInfo(CM.game,testLine).map(s=>s.id)'))await E('CM.Fleet.setManual(CM.game,testLine,'+JSON.stringify(s)+',0,1);true');
 await close();await E('CM.game.model.solveNow(2);true');
 await E('(async()=>{const r=await CM.Save.save(CM.game,"manual");if(!r.ok)throw Error(r.error);const p=await CM.Save.load(r.slotId);if(p.rulesRevision!==11||!Object.values(p.net.stations).some(s=>s.tod===1&&s.decor))throw Error("Batch values missing from actual IndexedDB save");return true})()');
 report.missing=await E('CM.I18n.missing()');if(report.missing.length)throw Error('Missing translations: '+JSON.stringify(report.missing));await screenshot('v27-task-service-final');
 console.log('PASS section load navigation, stopped-service KPI and persisted batch changes');
}

async function runQuickViewportChecks({E,send,until,screenshot,delay,settle,tap,audit,close,report}){
 const fit=async label=>{
  const box=await E('(()=>{const e=document.querySelector(".qpop,.ctx-menu");if(!e)throw Error("Quick overlay disappeared");const r=e.getBoundingClientRect(),v=CM.ui.viewport();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,v}})()');
  if(box.left<box.v.left-1||box.top<box.v.top-1||box.right>box.v.right+1||box.bottom>box.v.bottom+1)throw Error(label+' outside viewport '+JSON.stringify(box));
  await audit(label,'.qpop button,.qpop input,.ctx-menu button');
 };
 for(const lang of ['zh-CN','zh-TW','en']){
  await close();await send('Page.bringToFront');await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",1.15);CM.ui.tools.setTool("select");window.quickStation=Object.values(CM.game.net.stations)[0];CM.ui.select({kind:"station",id:quickStation.id});CM.ui.flyTo(quickStation.x,quickStation.y,22);true');await settle();await delay(650);
  await tap('#objBar .ob-name');await settle();await E('document.querySelector(".qpop input").value="Pending station";true');await fit('quick rename landscape '+lang);
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});await settle();await fit('quick rename rotated '+lang);
  if(!await E('document.querySelector(".qpop input").value==="Pending station"'))throw Error('Rotation discarded pending station name');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:320,deviceScaleFactor:1,mobile:true});await settle();await fit('quick rename reduced height '+lang);
  await E('CM.Settings.set("uiScale",.9);true');await settle();await fit('quick rename resized UI '+lang);
  if(!await E('document.querySelector(".qpop input").value==="Pending station"'))throw Error('Resizing discarded pending station name');
  if(lang==='en')await screenshot('quick-rename-320');
  await tap('.qpop .qpop-h button');
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("uiScale",1.15);CM.ui.flyTo(quickStation.x,quickStation.y,22);true');await settle();await delay(650);
  if(!await E('(()=>{const p=CM.ui.R.P(quickStation.x,quickStation.y,CM.ui.R.trackH(quickStation.type));return CM.Quick.context(p.x,p.y)})()'))throw Error('Context menu did not select station');
  await settle();await fit('quick context landscape '+lang);await send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});await settle();await fit('quick context rotated '+lang);
  if(lang==='en')await screenshot('quick-context-320');
  await E('CM.Quick.close();true');
 }
 await close();await E('CM.Quick.hide();CM.Settings.set("language","zh-CN");CM.Settings.set("uiScale",1);true');
 console.log('PASS three-language quick rename and context menus remain visible after rotation without losing input');
}

async function runTaskUIChecks({E,send,screenshot,delay,settle,tap,audit,close,report}){
 await E('window.tasksBefore=CM.game.tasks;const g=CM.game,fs=CM.Fac.list(g.city),future=fs.find(f=>f.open>g.year()),active=g.model.fn.list[0],line=Object.keys(g.net.lines)[0];if(!future||!active)throw Error("Missing task facilities");const base={kind:"hist",issuedAt:[g.clock.y,g.clock.m],deadline:[g.clock.y+1,1],reward:1000,status:"active",desc:"Fixture"};g.tasks=new CM.Tasks();g.tasks.active=[{...base,id:"future",title:"Future facility",type:"facShare",fac:future.id,target:.1},{...base,id:"fare",title:"Fare requirement",type:"facShare",fac:active.id,target:0,fare0:CM.Tasks.fareLevel(g.econ.fare)*2},{...base,id:"crowd",title:"Crowding",type:"lineCrowd",line,start:1.5,target:1},{...base,id:"retired",title:"Retired subgoal",type:"combo",parts:[{type:"coverage",core:true,target:2},{type:"facShare",fac:"retired-fixture",target:.1}]}];CM.Tasks.alignFacDeadline(g.tasks.active[0]);true');
 for(const lang of ['zh-CN','zh-TW','en'])for(const[width,height]of[[320,568],[568,320]]){
  await close();await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await E('CM.Settings.set("language",'+JSON.stringify(lang)+');CM.Settings.set("uiScale",1.15);CM.ui.openPage("tasks");true');await settle();
  if(!await E('!!document.querySelector(".tk-part.na")&&!!document.querySelector(".tk-card .tk-basis.bad")'))throw Error('Waived subgoal or fare warning missing');
  await E('for(const b of document.querySelectorAll(".tk-card button"))if(b.textContent.trim()===CM.I18n.text("票价管理")){b.dataset.test="fare-entry";break}document.querySelector("[data-test=fare-entry]").scrollIntoView({block:"center"});true');await settle();await audit('task warnings '+[lang,width],'.tk-card button');
  await tap('[data-test=fare-entry]');await settle();if(!await E('CM.ui.opsApp?.state().root==="fare"'))throw Error('Task fare entry opened the wrong page');await close();
  await E('CM.ui.openPage("tasks");true');await settle();
  await E('for(const b of document.querySelectorAll(".tk-card button"))if(b.textContent.trim()===CM.I18n.text("各区段满载率")){b.dataset.test="load-entry";break}document.querySelector("[data-test=load-entry]").scrollIntoView({block:"center"});true');await settle();await tap('[data-test=load-entry]');await settle();
  if(!await E('!!document.querySelector(".tk-crowd .crowd-table")'))throw Error('Task section loads did not expand');
  await E('(()=>{const cell=document.querySelector(".tk-crowd tr.clickable td");cell.dataset.test="task-load-cell";cell.scrollIntoView({block:"center",inline:"nearest"});return true})()');await settle();await audit('task load table '+[lang,width],'[data-test=task-load-cell]');
  if(lang==='en')await screenshot('v27-tasks-'+width);
  await tap('[data-test=task-load-cell]');await settle();if(!await E('CM.ui.selection?.kind==="seg"'))throw Error('Task section did not locate its segment');
 }
 await close();await E('CM.game.tasks=tasksBefore;true');report.missing=await E('CM.I18n.missing()');if(report.missing.length)throw Error('Task translations: '+JSON.stringify(report.missing));
 console.log('PASS localized future-facility deadlines, waived subgoals, fare-management links and expandable task section loads');
}
