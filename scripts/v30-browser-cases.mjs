// Runs against an isolated mobile Chromium profile through the normal game UI.
export async function runV30Checks({ E, until, close, tap, settle, send, audit }) {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const js = fn => E('(' + fn.toString() + ')()');
  for (const [id, year] of [['nj', 2000], ['mi', 1980]]) {
    await E('CM.newGame({map:' + JSON.stringify(id) + ',mode:"challenge",seed:20000101});true');
    await until('!CM.isLoading() && CM.game?.mapId===' + JSON.stringify(id), 180000);
    await close();
    check(await E(`CM.game.clock.y===${year} && !Object.keys(CM.game.net.lines).length && CM.game.city.totals().pop>100000`), 'Invalid starting state: ' + id);
    check(await E('CM.TERMINALS && CM.Fac.list(CM.game.city).some(f=>f.t==="air") && CM.DATA.histTasks.length>0'), 'Missing scenario facilities or tasks: ' + id);
    await E('CM.Settings.set("language","en");true');
    check(await E(`CM.I18n.text(CM.DATA.city)===${JSON.stringify(id === 'nj' ? 'Nanjing' : 'Miami')}`), 'Map name is not translated: ' + id);
    for (const modelId of id === 'nj' ? ['nj-a1', 'nj-a2', 'nj-b'] : ['mi-budd', 'mi-hitachi']) {
      const model = await E('CM.Fleet.model(' + JSON.stringify(modelId) + ')');
      check(model.maps.includes(id), 'Model belongs to the wrong city: ' + modelId);
      for (const key of ['name', 'short', 'desc']) {
        const original = JSON.stringify(model[key]);
        check(await E('CM.I18n.text(' + original + ')!==' + original), 'Missing English model text: ' + modelId + ' ' + key);
      }
    }
    await E('CM.Settings.set("language","zh-TW");true');
    check(await E('CM.I18n.text("信息详略")!== "信息详略"'), 'Traditional Chinese is not active');
    await E('CM.Settings.set("language","zh-CN");true');
  }
  await js(() => {
    const g = CM.game;
    CM.Settings.set('detail', 'simple');
    g.tasks.active.push({ id: 'test-due', type: 'coverage', kind: 'dyn', title: '三月内任务', deadline: [g.clock.y, g.clock.m + 2], target: 0.3 });
    g.touch();
    CM.ui.updateTop();
    CM.ui.openTop('tasks');
    return true;
  });
  await settle();
  check(await E('CM.ui.taskTab==="todo" && !!document.querySelector(".td-item.lv-urgent") && CM.ui.taskCnt.dataset.level==="urgent"'), 'Urgent task inbox did not open');
  check(await E('getComputedStyle(CM.ui.pills.econ.el).display==="none"'), 'Simple mode still shows the economic pill');
  await tap('.tip1 button');
  check(await E('CM.Settings.get("seenTips").includes("todo") && !document.querySelector(".tip1")'), 'First-use tip dismissal was not saved');
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await settle();
  await audit('mobile landscape task inbox', '.td-acts button, .tip1 button');
  await E('CM.Settings.set("detail","pro");true');
  check(await E('document.documentElement.dataset.detail==="pro" && !CM.ui.pills.econ.el.classList.contains("gone")'), 'Professional mode did not restore detail');
  await close();
  await js(() => {
    const g = CM.game, base = { car: 1500, metro: 1300, commute: 25, cong: 1.25, metroShare: 0.17, fare: 1500 };
    g.impactReport = { status: 'done', at: [1980, 1], stable: true, base, draft: { ...base, car: 1400, metro: 2000 },
      roads: [], roadsWorse: [], lines: [
        { id: 'new', name: '试验新线', before: 0, after: 1000, color: '#3366dd' },
        { id: 'old', name: '试验既有线', before: 1500, after: 1200, color: '#dd6633', other: true }
      ] };
    g.touch();
    CM.ui.openPage('tasks', 'todo', { root: true });
    return true;
  });
  await settle();
  check(await E('[...document.querySelectorAll(".td-acts button")].some(b=>b.textContent==="查看报告")'), 'New report is missing from the inbox');
  await E('[...document.querySelectorAll(".td-acts button")].find(b=>b.textContent==="查看报告").click();true');
  check(await E('CM.game.impactReport.seen && document.body.innerText.includes("既有线客流变化") && document.body.innerText.includes("试验既有线")'), 'Existing-line boardings or read status are missing');
  await close();
  await until('CM.game.model.settled && CM.game.model.trafficReady() && !CM.game.model.hasReviewWork()',60000);
  await E('CM.game.model.ctxs.wd.per[0].reviewLimit=CM.Model.REVIEW_ROUNDS;true');
  const saved = await js(async () => {
    const g = CM.game, r = await CM.Save.save(g, 'manual', { label: 'Miami test' });
    return { ok: r.ok, id: r.slotId, funds: g.econ.funds, date: g.ym() };
  });
  check(saved.ok, 'Failed to write a Miami save to IndexedDB');
  check(await E(`CM.Save.load(${JSON.stringify(saved.id)}).then(p=>{
    if(p.meta.map!=="mi" || p.econ.funds!==${saved.funds} || !p.impactReport.seen || !p.__trafficState) return false;
    window.previousV30Game=CM.game; CM.loadGame(p); return true;
  })`), 'Miami save, report or review cache read-back differs');
  await until('!CM.isLoading() && CM.game!==window.previousV30Game && CM.game?.mapId==="mi"',90000);
  check(await E('CM.game.trafficCacheHit===true && CM.game.model.ctxs.wd.per[0].reviewLimit===CM.Model.REVIEW_ROUNDS'), 'The task review cache was discarded on load');
  await E('delete window.previousV30Game;CM.newGame({map:"sz",mode:"challenge",seed:20000101});true');
  await until('!CM.isLoading() && CM.game?.mapId==="sz"',180000);
  await close();
  check(await js(() => {
    const g = CM.game, c = g.city, LU = CM.LU;
    const wutong = c.regions.findIndex(r => r.id === 'wutong');
    const hasHills = c.region.some((r, i) => r === wutong && c.lu[i] === LU.HILL);
    const stale = c.lu.findIndex((lu, i) => lu === LU.RURAL && !c.regions[c.region[i]].scenic && c.landFrac[i] >= 0.5);
    const archived = g.serialize().city, lu = CM.U.unpackTyped(archived.lu);
    archived.scenicRevision = 1;
    lu[stale] = LU.HILL;
    archived.lu = CM.U.packTyped(lu, archived.lu.t);
    const migrated = new CM.City();
    migrated.generate(c.seed, g.clock.y);
    migrated.restore(archived, g.clock.y);
    return hasHills && stale >= 0 && migrated.lu[stale] !== LU.HILL &&
      migrated.totals().pop === c.totals().pop && migrated.totals().jobs === c.totals().jobs;
  }), 'Shenzhen scenic boundaries or old-save land use are inconsistent');
  console.log('PASS Nanjing and Miami opening, five translated trains, mobile inbox, first-use tips, saved report and review cache');
}

export async function runV30SyncChecks({ E, until, tap, send, audit }) {
  const js = fn => E('(' + fn.toString() + ')()');
  const check = (ok, msg) => { if (!ok) throw Error(msg); };
  const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  const enter = async text => {
    await E('document.querySelector(".nv-sin").focus();true');
    await send('Input.insertText', { text });
    await until('!!document.querySelector(".nv-sopt")');
    await tap('.nv-sopt');
  };
  await viewport(320, 568);
  await until('CM.Journey.ready(CM.game)');
  await js(() => { CM.ui.openVoicesApp(); return true; });
  await tap('.vx-rail button[aria-label="导航"]');
  await enter('木樨地');
  await enter('西直门');
  check(await E('document.querySelectorAll(".nv-opt").length===4 && !document.querySelector(".nv-slist.on")'), 'No full directions result from touch search');
  check(await E('!!document.querySelector(".nv-leg.k-ride") && !!document.querySelector(".nv-leg.k-wait")'), 'Directions must include rail and waiting legs for the two active stations');
  await audit('narrow directions', '.nv-top button, .jm-z, .nv-search input');
  const pinch = await js(() => {
    const r = document.querySelector('.nv-map canvas').getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return [x,y,CM.ui._nav.view.s,CM.ui._nav.a.x,CM.ui._nav.b.x];
  });
  const [x,y,scale,a,b] = pinch;
  const touches = dx => [{x:x-dx,y,id:1},{x:x+dx,y,id:2}];
  await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:touches(24)});
  await send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:touches(52)});
  await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await until('CM.ui._nav.view.s>' + scale);
  check(await E('CM.ui._nav.a.x===' + a + '&&CM.ui._nav.b.x===' + b), 'Pinch picked a new route endpoint');
  await E('document.querySelector(".nv-res .fk-mapbar button").scrollIntoView({block:"center"});true');
  await tap('.nv-res .fk-mapbar button');
  await until('!CM.ui.voApp');
  check(await E('CM.R.hl?.kind==="trip"'), 'Directions were not shown on the city map');
  await js(() => { CM.Settings.set('language','en'); CM.ui.openVoicesApp('nav'); return true; });
  check(await E('document.querySelector(".vx-head").textContent.includes("Directions")'), 'Directions title is not in English');
  await viewport(568, 320);
  await audit('landscape directions', '.nv-top button, .jm-z, .nv-search input');
  await js(() => { CM.ui.voApp.show('stories'); return true; });
  check(await E('document.querySelectorAll(".fk-cast button.fk-who svg").length>=8'), 'Citizens were not generated and drawn');
  await E('document.querySelector(".fk-cast button.fk-who").scrollIntoView({block:"center"});true');
  await tap('.fk-cast button.fk-who');
  await until('!!document.querySelector(".fk-map canvas")');
  check(await js(async () => {
    const source = CM.game.folks, save = await CM.Save.save(CM.game, 'manual');
    if (!save.ok) return false;
    const p = await CM.Save.load(save.slotId);
    const restored = CM.Game.restore(p);
    return restored.folks.list.length === source.list.length && restored.folks.list.every(c => c.cur) && restored.folks.log.length === source.log.length;
  }), 'Storing and restoring citizen trips or posts failed');
  await js(() => { CM.ui.voApp.close(null,true); CM.Settings.set('language','zh-TW'); return true; });
  await viewport(320, 568);
  await js(() => {
    const ui=CM.ui; ui.clearToasts(); ui.clearCelebrations();
    ui.toast('回归提示一', 'info', {label:'查看报告',fn:()=>{}});
    ui.toast('回归提示二');
    ui.toast('回归提示三');
    return true;
  });
  check(await E('document.querySelectorAll("#feed .toast").length===1 && document.querySelector(".toast-more").textContent==="+2"'), 'Notices did not collapse to one card');
  await audit('narrow toast actions', '#feed .toast button');
  await tap('.toast-more');
  check(await E('document.querySelector(".td-notes")?.textContent.includes(CM.I18n.text("回归提示三"))'), 'Recent notices were not found in To-do');
  await js(() => { const ui=CM.ui; ui.closePanel(true); ui.closeScreen(); CM.Settings.set('language','en'); return CM.game.startJump(1); });
  await until('!CM.game.jumping && !!CM.ui.lastReport');
  await js(() => { CM.ui.clearToasts(); CM.ui.showReport(CM.ui.lastReport); return true; });
  await until('!!document.querySelector(".jr-scroll .jr-kpi")');
  check(await E('document.querySelector(".jr-fin2")?.textContent.includes(CM.I18n.text("一般资金")) && document.querySelector("#screen .jr").getBoundingClientRect().right<=innerWidth+1'), 'Report exceeds the screen or is missing English finance');
  await audit('narrow advance report', '#screen .jr button');
  console.log('PASS touch route search and pinch, citizen reports, queued notices and advance report');
}
