// Capture the existing four README subjects from the actual game in the launcher's isolated profile.
export async function captureReadme({E,send,until,screenshot,delay,settle,close,task,fs,path}){
 const report={version:await E('CM.CFG.GAME_VERSION'),capturedAt:new Date().toISOString(),size:[1600,1000],screenshots:[]};
 await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Page.bringToFront');
 await E('CM.Settings.set("language","zh-CN");CM.Settings.set("uiScale",1);CM.Settings.set("theme","light");CM.Settings.set("gfx","high");CM.Settings.set("labels","all");CM.Settings.set("immersive",false);CM.Settings.set("autosave",false);true');await E('document.fonts.ready.then(()=>true)');
 const warm=async()=>{await delay(700);await until('CM.R.sharpReady()',120000);await delay(350)};
 // Keep Hong Kong selected and verify every registered map is available.
 await close();await E('CM.endGame();CM.ui.showMapSelect("hk");true');await until('!!document.querySelector(".ms2-poster img")&&[...document.querySelectorAll(".ms2 img")].every(e=>e.complete&&e.naturalWidth>0)',120000);await settle();
 const map=await E('({expected:CM.MAP_ORDER,shown:[...document.querySelectorAll(".ms2-item:not(.hidden-el)")].map(el=>el.dataset.id),text:document.querySelector(".ms2-count").textContent,selected:document.querySelector(".ms2-item.on")?.dataset.id})');
 if(!map.expected.length||map.shown.length!==map.expected.length||map.expected.some((id,i)=>id!==map.shown[i])||map.selected!=='hk')throw Error('README map catalogue did not show every map with Hong Kong selected');
 await screenshot('screenshot-map-selection');report.screenshots.push({file:'screenshot-map-selection.png',count:map.shown.length,text:map.text,selected:map.selected});console.log('CAPTURE catalogue with '+map.shown.length+' maps');
 // The inherited Ginza Line is shown at its real 1950 starting state.
 await E('CM.newGame({map:"tk",mode:"challenge",seed:19500101});true');await until('!CM.isLoading()&&CM.game?.mapId==="tk"&&!CM.game.pending',180000);await close();
 await E('CM.game.setSpeed(0);CM.R.cam.view=CM.R.cam.t=0;CM.R.cam.under=CM.R.cam.tu=0;CM.R.computeTransform();var s=CM.game.compiled.stations;CM.ui.fitBox(Math.min(...s.map(s=>s.x))-10,Math.min(...s.map(s=>s.y))-8,Math.max(...s.map(s=>s.x))+12,Math.max(...s.map(s=>s.y))+10,24);CM.ui.clearCelebrations();true');await warm();await until('!CM.R.cam.fly');
 const tokyo=await E('({map:CM.game.mapId,clock:{...CM.game.clock},stations:CM.game.compiled.stations.length,lines:Object.keys(CM.game.net.lines).length,view:CM.R.cam.t})');if(tokyo.stations!==18||tokyo.clock.y!==1950||tokyo.view!==0)throw Error('Unexpected Tokyo fixture');await settle();await screenshot('screenshot-tokyo-day');report.screenshots.push({file:'screenshot-tokyo-day.png',...tokyo});console.log('CAPTURE Tokyo 1950, 18 inherited stations');
 // Capture the Guangzhou night backdrop without the main menu overlay.
 await E('CM.endGame();CM.ui.closeScreen();CM.Settings.set("theme","dark");true');
 await E('new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=reject;img.src="img/menu-bg-dark.webp"})');
 await until('document.documentElement.dataset.theme==="dark" && !document.querySelector("#menubg").classList.contains("off")');
 await delay(850);
 await screenshot('screenshot-guangzhou-night');
 report.screenshots.push({file:'screenshot-guangzhou-night.png',map:'gz',theme:'dark'});
 await E('CM.Settings.set("theme","light");CM.Settings.set("labels","all");true');
 console.log('CAPTURE Guangzhou night backdrop');
 // Build a legal five-station line, then advance two years using the normal settlement path.
 await E('CM.newGame({map:"gz",mode:"free",startYear:2000,seed:20000101});true');await until('!CM.isLoading()&&CM.game?.mapId==="gz"&&!CM.game.pending',180000);await close();
 await E(`(()=>{const g=CM.game,M=CM.Metro,c=g.city;g.setSpeed(0);let best=null;
 for(let y=6;y<c.H-6;y+=2)for(let x=6;x<c.W-23;x+=2){let score=0,ok=true;for(let i=0;i<5;i++){if(!M.checkSite(c,x+i*4,y,'underground').ok){ok=false;break}const k=c.cellAt(x+i*4,y);score+=c.pop[k]+c.jobs[k]}
 if(!ok||(best&&score<=best.score))continue;const n=M.empty(),l=M.newLine(n),ids=[];for(let i=0;i<5;i++)ids.push(M.addStation(n,x+i*4,y,{size:'M',type:'underground'},c));for(let i=1;i<5;i++)M.addSegment(n,l,ids[i-1],ids[i],[],'underground');if(!M.evaluate(n,g.net,c,g.clock.y).conflicts.length)best={n,score};}
 if(!best)throw Error('No legal demonstration line');g.edit(n=>Object.assign(n,best.n));const r=g.confirmDraft();if(!r.ok)throw Error(r.reason);return true})()`);
 await until('!CM.game.pending&&CM.game.model.trafficReady()&&CM.game.model.settled',180000);await E('CM.ui.jump(24);true');await until('!CM.game.jumping&&!CM.game.pending&&CM.game.clock.y===2002',300000);await close();
 await E('CM.ui.toasts.replaceChildren();CM.ui.clearCelebrations();CM.Stats.open(CM.ui,"econ");true');await settle();await delay(400);
 const economy=await E('({map:CM.game.mapId,clock:{...CM.game.clock},startYear:CM.game.startYear,stations:CM.game.compiled.stations.length,months:CM.game.econ.ledger.length,years:CM.game.macro.rec.length,text:document.querySelector("#stats").innerText.slice(0,600)})');if(economy.stations!==5||economy.months!==24||economy.clock.y!==2002)throw Error('Unexpected economy demonstration');
 await screenshot('screenshot-economy-statistics');report.screenshots.push({file:'screenshot-economy-statistics.png',...economy});console.log('CAPTURE Guangzhou 2000→2002, five stations and 24 settled months');
 await fs.writeFile(path.join(task,'report.json'),JSON.stringify(report,null,2));
}
