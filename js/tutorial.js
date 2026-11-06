'use strict';
// 新手教程（青湾地图）：左上角的引导卡片按步骤给出目标与操作说明，自动检测完成情况；
// 相关按钮闪烁提示，地图上高亮目标位置。进度随存档保存，可跳过任意一步。
// v2.5 重新设计：第一次进入青湾先给一个明确的小目标——用一条地铁把南岸居民区和老城就业中心连起来；
// 主线分五章约 12 分钟：修第一条线（看需求 → 规划 → 预测 → 建设 → 运行 → 看效果）、管好线路（地铁芯与列车）、扩大线网、读懂城市、学会经营。
// 每步一两个小动作，都可以跳过；跟随列车、线路图与财政图文是选学。
(function (CM) {
  const U = CM.U, h = U.h, M = CM.Metro;
  const ic = function (n, s) { return CM.icon(n, s); };
  const snd = function (n) { if (CM.Sound) CM.Sound.play(n); };
  let ui = null, g = null, el = null, idx = -1, ctx = {}, doneAt = 0, target = null, mini = false, lastCheck = 0;
  // 指示气泡（v2.1 第二轮）：当前小动作的一句话，带箭头指向要点的按钮或地图位置；按钮外另加闪动的圈
  let tip = null, ring = null, subIdx = 0;
  // 回看（v2.1 玩家反馈）：返回上一步或打开已完成的步骤时不自动跳走；新完成的步骤约 2.6 秒后继续，
  // 鼠标停在卡片上时暂停倒计时，也可关闭「自动下一步」（随进度保存）
  let review = false, hover = false, listOpen = false;
  const AUTO_MS = 2600;
  const autoOn = function () { return !!g.tutorial && g.tutorial.auto === true; };

  const place = function (name) { const p = CM.DATA.places.find(function (q) { return q[0] === name; }); return p ? { x: p[1], y: p[2] } : { x: 0, y: 0 }; };
  const absMin = function (c) { return (U.ymIndex(c.y, c.m) * 31 + c.d) * 1440 + c.minute; };
  const nets = function () { return g.draft ? [g.draft.net, g.net] : [g.net]; };
  const near = function (net, p, r) { for (const id in net.stations) { const s = net.stations[id]; if (U.dist(s.x, s.y, p.x, p.y) <= r) return id; } return null; };
  const lineStations = function (net, lid) { const tp = M.lineTopo(net, lid); return (tp.stations || []).map(function (sid) { return net.stations[sid]; }).filter(Boolean); };
  const NORTH = ['oldtown', 'xiguan', 'dongguan', 'beizhan', 'eastind'], SOUTH = ['nanan', 'tech'];
  const regionId = function (s) { const rg = g.city.regionAt(s.x, s.y); return rg ? rg.id : ''; };
  // 说明中的 {操作} 换成当前键位（设置中可自定义；未设置时写「对应按键」）
  const keyText = function (s) { return String(typeof s === 'function' ? s() : s).replace(/\{([\w.]+)\}/g, function (m, id) { return (CM.Keys && CM.Keys.hint(id)) || '对应按键'; }); };

  // 主线目标：南岸居民区（南岸新区）与老城就业中心（钟楼、府前一带）在同一条线上
  const T = function () { return ui.tools; };
  const chainOn = function () { return !!T().chain; };
  // 点车站、列车、片区或设施都要先回到「选择」工具：绘线 / 建站工具下同样的点击会开始建设（v2.3 玩家实测：确认换乘线后仍在绘线，点车站又开始画新线）
  const PICK = { t: '先点底部的「选择」（或按 Esc）', el: function () { return T().tool === 'select' ? null : ui.tbtns.select; }, done: function () { return T().tool === 'select'; } };
  const JOB = function () { return [place('钟楼'), place('府前'), place('青年路')]; };
  const nearJobs = function (s) { return JOB().some(function (p) { return U.dist(s.x, s.y, p.x, p.y) <= 2.8; }); };
  const inSouth = function (s) { return SOUTH.indexOf(regionId(s)) >= 0; };
  const mainLine = function (n) { for (const lid in n.lines) { const ss = lineStations(n, lid); if (ss.length >= 3 && ss.some(inSouth) && ss.some(nearJobs)) return lid; } return null; };
  const southStation = function () { for (const n of nets()) for (const id in n.stations) if (inSouth(n.stations[id])) { const s = n.stations[id]; return { x: s.x, y: s.y }; } return place('南岸'); };
  const midStation = function () { for (const lid in g.net.lines) { const ss = lineStations(g.net, lid); if (ss.length) { const s = ss[Math.floor(ss.length / 2)]; return { x: s.x, y: s.y }; } } return null; };
  // 「点左下的图层」：已开着别的图层时说明要换一个（v2.3 玩家实测：开错图层后不知道该先关掉还是重新选）
  const layerAsk = function (want) { return function () { return ui.layer !== 'none' && ui.layer !== want ? '现在开着别的图层：点左下的「图层」换一个' : '点左下的「图层」'; }; };
  // 设施小课要点的圆点：青湾已开放的火车站或医院（没有时取第一个设施）
  const confirmBtn = function () { return g.draft ? ui.draftbar.querySelector('.btn.primary') : null; };
  const regionIdx = function (id) { return g.city.regions.findIndex(function (r) { return r.id === id; }); };
  const twoEnds = function () {
    const k = regionIdx('nanan'), rg = g.city.regions[k], a = { x: 19.9, y: 15.6 };
    return { kind: 'multi', items: [k >= 0 ? { kind: 'region', region: k, lx: rg.cx, ly: rg.cy, label: '南岸居民区' } : null, { kind: 'circle', x: a.x, y: a.y, r: 2.8, lx: a.x, ly: a.y - 2.8, label: '老城就业中心' }].filter(Boolean) };
  };
  // 开局时的出行情况（任务简报与开通效果对照）：南岸到老城的通勤人数、青江大桥早高峰拥堵、平均通勤
  const roadVC = function (name) {
    const m = g.model, road = m.road, city = g.city; let vc = 1;
    if (!road || !m.trafficReady()) return null;
    const P = m.resultsFor('wd').per[0];
    for (const L of road.links) if (city.roadNames[L.name] === name) for (let d = 0; d < 2; d++) { const a = 2 * L.id + d; vc = Math.max(vc, P.arcTime[a] / road.arcT0[a]); }
    return vc;
  };
  // 南岸居民：每天去北岸上班的人数、早高峰开车过江的平均时间、早高峰坐地铁的比例（工作日早高峰已发布结果）
  const southStats = function () {
    const m = g.model, city = g.city, od = m.od, Z = m.Z;
    if (!m.trafficReady() || !od || !od.t) return null;
    const P = m.resultsFor('wd').per[0], sk = P.skimT || m.ctxs.wd.per[0].skimT, rid = function (z) { const rg = city.regions[m.zReg[z]]; return rg ? rg.id : ''; };
    let cross = 0, tt = 0, trips = 0, metro = 0;
    for (let z = 0; z < Z; z++) {
      if (SOUTH.indexOf(rid(z)) < 0) continue;
      trips += P.zTrips[z] || 0; metro += P.zMetro[z] || 0;
      for (let k = od.start[z]; k < od.start[z + 1]; k++) { const dz = od.dest[k], w = od.t[0][k] || 0; if (dz < Z && w > 0 && NORTH.indexOf(rid(dz)) >= 0) { cross += w; tt += w * (sk ? sk[z * Z + dz] || 0 : 0); } }
    }
    return { cross: Math.round(cross), carMin: cross > 0 ? tt / cross : 0, share: trips > 0 ? metro / trips : 0 };
  };
  const baseline = function () {
    const m = g.model, d = m.dailyWk || m.daily || {}, s = southStats() || {};
    return { cross: s.cross || 0, carMin: s.carMin || 0, south: s.share || 0, commute: d.commute || 0, vc: roadVC('青江大桥'), share: (m.daily && m.daily.metroShare) || 0 };
  };
  // 早高峰最拥堵的片区（没有拥堵时取非地铁出行最多的片区）：进阶小课直接圈出来，不再让玩家自己找「红色道路」
  const hotZone = function () {
    const m = g.model; if (!m.trafficReady()) return null;
    let best = -1, bv = 0, car = -1, cv = 0;
    for (let z = 0; z < m.Z; z++) {
      if (m.zPop[z] + m.zJobs[z] < 800) continue;
      const v = g.zoneCong(z, 'wd'); if (v > bv) { bv = v; best = z; }
      const c = m.zoneTraffic(z).car; if (c > cv) { cv = c; car = z; }
    }
    const busy = bv >= 1.15, z = busy ? best : car;
    return z >= 0 ? { z: z, x: m.zCx[z], y: m.zCy[z], busy: busy, v: bv } : null;
  };
  // 开通效果：线路描绘、车站绽放，然后弹出效果卡（数字从开通前滚动到开通后）
  const celebrate = function () {
    const lid = mainLine(g.net), R = ui.R; if (!lid) return;
    const L = g.net.lines[lid], col = CM.Accessibility ? CM.Accessibility.line(L) : L.color;
    const ss = lineStations(g.net, lid); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of ss) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    ui.fitBox(x0 - 3, y0 - 3, x1 + 3, y1 + 3, 24);
    let k = 0;
    for (const sg of M.lineSegs(g.net, lid)) R.addFx('trace', 0, 0, { pts: M.segGeom(g.net, sg, g.city).pts, color: col, dur: 1.4, delay: 0.15 * k++, type: sg.type });
    ss.forEach(function (s, i) { R.addFx('burst', s.x, s.y, { color: col, delay: 0.3 + 0.18 * i, type: s.type }); });
  };
  const showCard = function () {
    const r = g.impactReport; if (!r || r.status !== 'done' || !CM.Impact) return;
    g.tutorial.cardSeen = true; ui.markUnsaved();
    celebrate();
    const b = g.tutorial.base || {}, now = southStats();
    const share = h('b', { class: 'good' }, U.fmtPct(b.south || 0, 0));
    const extra = h('div', { class: 'callout good' }, ic('bridge'), h('div', { class: 'ct' },
      h('div', null, '南岸居民早高峰坐地铁的比例：', U.fmtPct(b.south || 0, 0), ' → ', share),
      h('div', { class: 'tiny' }, '这就是一轮完整的规划：看需求、修线、看结果，再根据报告调整。')));
    if (now && CM.Impact) CM.Impact.count(share, (b.south || 0) * 100, now.share * 100, function (v) { return U.fmtNum(v, 0) + '%'; }, 1400);
    setTimeout(function () {
      if (CM.game !== g) return;
      CM.Impact.card(ui, r, { kicker: '任务完成 · 连接两岸', title: '南岸到老城的地铁开通了！', ok: '继续', extra: extra, onReport: function () { g.tutorial.reportSeen = true; } });
    }, CM.Settings.reducedMotion() ? 0 : 1500);
  };

  // 地铁芯（v2.5）：教程要点的按钮
  const opsEl = function (sel) { const a = ui.opsApp; return a ? a.el.querySelector(sel) : null; };
  const opsState = function () { return ui.opsApp ? ui.opsApp.state() : null; };
  // 步骤：title 目标、body 一句话说明、hint 小提示、hl 地图高亮、check 完成条件、manual 需点击按钮继续。
  // sub（v2.1 第二轮重新设计：新手不知道在哪里操作）：把一步拆成几个小动作，每个一句话；
  // el 返回要点的按钮（气泡指向它并闪动外圈），at 返回要点的地图位置（气泡指向地图），done 判断该动作是否已完成。
  // 当前动作 = 第一个未完成的动作，随玩家的实际操作前进或退回。
  // main：主线（计入进度条），ch 为所属章节；ext：选学（可跳过）；info：小知识（可跳过）
  const STEPS = [
    { id: 'intro', title: '你的任务：连接两岸', manual: '开始任务',
      body: '南岸的人每天过江去老城上班。先用一条地铁连起两岸，再学怎么管理线路、扩大线网和经营，全程约 12 分钟。',
      hint: '跟着发光的气泡操作；右上角目录可以回看，每一步都能跳过。',
      enter: function () { if (!g.tutorial.base) g.tutorial.base = baseline(); ctx.at = performance.now(); } },
    { id: 'look', main: true, ch: '修第一条线', title: '看看人住在哪、在哪上班',
      body: '橙色是住宅，蓝色是就业岗位：南岸住的人多，老城工作的人多。',
      hint: '拖动地图、滚轮缩放可以看得更清楚；按 {view.toggle} 切换 2D / 2.5D。',
      hl: twoEnds,
      enter: function () { const p = place('钟楼'), q = place('南岸'); ui.fitBox(Math.min(p.x, q.x) - 6, p.y - 4, Math.max(p.x, q.x) + 6, q.y + 4, 22); },
      sub: [
        { t: layerAsk('jobs'), el: function () { return ui.layerBtn; }, done: function () { return ui.layerPanelOpen() || ui.layer === 'jobs'; } },
        { t: '选「住宅与就业」', el: function () { return ui.dockBtns.jobs; }, done: function () { return ui.layer === 'jobs'; } },
      ] },
    { id: 'station', main: true, ch: '修第一条线', title: '在南岸建第一座车站',
      body: '车站建在住宅最密的地方，走路就能到。放下前，光标旁会显示站名。',
      hint: '放错了可以撤销（Ctrl+Z）；站名之后可以改。',
      hl: function () { const k = regionIdx('nanan'), rg = g.city.regions[k]; return k >= 0 ? { kind: 'region', region: k, lx: rg.cx, ly: rg.cy, label: '南岸居民区' } : null; },
      enter: function () { const p = place('南岸'); ui.R.flyTo(p.x, p.y, Math.max(ui.R.cam.zoom, 22)); },
      check: function () { return nets().some(function (n) { for (const id in n.stations) if (inSouth(n.stations[id])) return true; return false; }); },
      sub: [
        { t: '点底部的「建站」', el: function () { return ui.tbtns.station; }, done: function () { return T().tool === 'station'; } },
        { t: '在南岸亮区里人多的地方点一下', at: function () { return place('南岸'); } },
      ] },
    { id: 'line', main: true, ch: '修第一条线', title: '画线过江，连到老城',
      body: '从南岸站出发，跨过青江，一直画到钟楼附近的就业中心。',
      hint: '站距 4–6 格（1–1.5 km）比较合适；跨江段建地下就是隧道，建高架就是桥。',
      hl: twoEnds,
      enter: function () { const a = place('钟楼'), b = place('南岸'); ui.fitBox(Math.min(a.x, b.x) - 4, a.y - 3, Math.max(a.x, b.x) + 4, b.y + 3, 24); },
      check: function () { return nets().some(function (n) { return !!mainLine(n); }); },
      sub: [
        { t: '点底部的「绘线」', el: function () { return ui.tbtns.line; }, done: function () { return T().tool === 'line' || chainOn(); } },
        { t: '先点南岸的车站', at: southStation, done: function () { return chainOn() || nets().some(function (n) { for (const lid in n.lines) if (lineStations(n, lid).some(inSouth)) return true; return false; }); } },
        { t: '过江后在北岸江边点一下放一站', at: function () { return place('滨江'); }, done: function () { return nets().some(function (n) { for (const lid in n.lines) { const ss = lineStations(n, lid); if (ss.some(inSouth) && ss.some(function (s) { return NORTH.indexOf(regionId(s)) >= 0; })) return true; } return false; }); } },
        { t: '点亮圈里的钟楼，再右键结束', at: function () { return place('钟楼'); } },
      ] },
    { id: 'confirm', main: true, ch: '修第一条线', title: '看预测，确认建设',
      body: '右侧会预测这条线的效果：多少人改坐地铁、通勤快多少、票款够不够运营。',
      hint: '确认前可以撤销或放弃，不花钱；青湾是自由建造，资金不限。',
      check: function () { return !!mainLine(g.net) && g.compiled.routes.length > 0; },
      sub: [
        { t: '等右侧「效果预测」算完', el: function () { return ui.rBody && ui.rBody.querySelector('.sec.open'); }, done: function () { return !g.draft || (g.draft.pred && g.draft.pred.state === 'done'); } },
        { t: '点「确认建设」', el: confirmBtn },
      ] },
    { id: 'run', main: true, ch: '修第一条线', title: '开通运营：让时间走起来',
      body: '列车开过青江了。开动时间，看乘客上车。',
      hint: '早高峰 7–9 点乘客最多；系统同时在算这条线的建设效果。',
      enter: function () { if (g.tutorial.runT0 == null) g.tutorial.runT0 = absMin(g.clock); ctx.t0 = g.tutorial.runT0; },   // 计时起点随进度保存，读档后不重新计时
      check: function () { return absMin(g.clock) - ctx.t0 >= 120; },
      sub: [
        { t: '点 ▶ 开始', el: function () { return ui.tbtns.pause; }, done: function () { return g.speed > 0; } },
        { t: '再点 3× 加速', el: function () { return ui.tbtns.s2; }, done: function () { return g.speed >= 2 || ctx.fast || (ctx.fast = absMin(g.clock) - ctx.t0 >= 60); } },
        { t: '等时间走过 2 小时' },
      ] },
    { id: 'result', main: true, ch: '修第一条线', title: '看看这条线带来了什么',
      body: '效果卡对比了有没有这条线：分担率、通勤时间和运营收支。',
      hint: '每次建设完成都会生成「建设效果报告」，会告诉你为什么，在拥堵或分担率详情里也能打开。',
      enter: function () { if (g.impactReport && g.impactReport.status === 'done' && !g.tutorial.cardSeen) showCard(); },
      check: function () { return !!g.tutorial.cardSeen; },
      sub: [
        { t: '等建设效果报告生成（几秒钟）', done: function () { return !!(g.impactReport && g.impactReport.status === 'done'); } },
        { t: '看效果卡里的数字变化', done: function () { return !!g.tutorial.cardSeen; } },
      ] },
    { id: 'app', main: true, ch: '管好线路', title: '打开地铁芯',
      body: '所有线路、车站和列车都在这里管理：改名改色、配车、定站台规模、做商业开发和装修。',
      hint: '只有绘线和建站要回到地图。',
      enter: function () { if (ui.layer !== 'none') ui.setLayer('none'); },
      check: function () { const s = opsState(); return !!s && s.root === 'lines'; },
      sub: [
        { t: '点右下角的「地铁芯」', el: function () { return ui.opsDock; }, done: function () { return !!ui.opsApp; } },
        { t: '点左侧的「线路管理」', el: function () { return opsEl('.mc-nav[data-v="lines"]'); } },
      ] },
    { id: 'fleet', main: true, ch: '管好线路', title: '给线路加一列车',
      body: '发车间隔由投入的列车决定：列车越多越密，运营费也越高。智能调度只用已有的列车。',
      hint: '同一页还能设运行速度（越慢允许的弯越急）和加开快车、区间车，让运力集中到客流大的地方。',
      enter: function () { ctx.n0 = g.fleet ? g.fleet.trains.length : 0; },
      check: function () { return !!g.fleet && g.fleet.trains.length > ctx.n0; },
      sub: [
        { t: '打开「地铁芯」的「线路管理」', el: function () { return ui.opsApp ? opsEl('.mc-nav[data-v="lines"]') : ui.opsDock; }, done: function () { const s = opsState(); return !!s && s.root === 'lines'; } },
        { t: '点表格里你修好的线路', el: function () { return opsEl('.mc-table tr[data-lid]'); }, done: function () { const s = opsState(); return !!s && s.view === 'line'; } },
        { t: '点「列车运营」', el: function () { return opsEl('.mc-tabs [data-t="ops"]'); }, done: function () { const s = opsState(); return !!s && s.view === 'line' && s.tab === 'ops'; } },
        { t: '点「购买列车」，买 1 列', el: function () { return opsEl('.fo-svc .btn.primary'); } },
      ] },
    { id: 'xfer', main: true, ch: '扩大线网', title: '建一座换乘站',
      body: '两条线共用一座车站，就是换乘站。线网这样连起来，乘客才能到更多地方。',
      hint: '换乘站会显示 ⇄ 标志；新线的运行速度、线形可以在底部的绘线选项里选。',
      enter: function () { if (ui.opsApp) ui.opsApp.close(); },
      check: function () { for (const id in g.net.stations) if (M.stationLines(g.net, id).length >= 2) return true; return false; },
      sub: [
        { t: '点底部的「绘线」', el: function () { return ui.tbtns.line; }, done: function () { return T().tool === 'line' || chainOn(); } },
        { t: '从空地开始，中途点这座已有车站', at: midStation, done: function () { if (!g.draft) return false; const n = g.draft.net; for (const id in n.stations) if (M.stationLines(n, id).length >= 2) return true; return false; } },
        { t: '右键结束，再点「确认建设」', el: confirmBtn },
      ] },
    { id: 'flow', main: true, ch: '读懂城市', title: '看车站客流与拥挤',
      body: '「车站客流」图层标出哪些站最忙。点开车站能看到客流、负荷和解决办法。',
      hint: '真实城市里，线路或车站持续过载时，地铁芯入口上方会出现提醒：可以自动处理，也可以定位后手动处理。',
      check: function () { return ui.layer === 'station' && ui.topIs(['station', 'line']); },
      sub: [
        PICK,
        { t: layerAsk('station'), el: function () { return ui.layerBtn; }, done: function () { return ui.layerPanelOpen() || ui.layer === 'station'; } },
        { t: '选「车站客流」', el: function () { return ui.dockBtns.station; }, done: function () { return ui.layer === 'station'; } },
        { t: '点一座车站', at: midStation },
      ] },
    { id: 'adv-cong', main: true, ch: '读懂城市', title: '找出最堵的片区',
      body: function () { return ctx.zone && !ctx.zone.busy ? '青湾的道路现在还算畅通：亮圈里是开车出行最多的片区，以后最可能堵。' : '亮圈里是早高峰最堵的片区，在这里修地铁效果最好。'; },
      hint: '片区详情会告诉你本地居民有多少开车、地铁能替代多少；点到道路也算完成。其他图层在左下「图层」面板。',
      enter: function () { ui.R.layerOpt.cong = 'am'; ctx.zone = hotZone(); },
      hl: function () { const z = ctx.zone || hotZone(); return z ? { kind: 'circle', x: z.x, y: z.y, r: 2.4, lx: z.x, ly: z.y - 2.4, label: z.busy ? '早高峰最堵的片区' : '开车出行最多的片区' } : null; },
      check: function () { return ui.layer === 'cong' && ui.topIs(['zone', 'road']); },
      sub: [
        PICK,
        { t: '点顶部的「拥堵指数」', el: function () { return ui.metricEl('cong'); }, done: function () { return ui.layer === 'cong'; } },
        { t: '点亮圈里的片区（点到道路也行）', at: function () { const z = ctx.zone; return z ? { x: z.x, y: z.y } : null; } },
      ] },
    { id: 'adv-fare', main: true, ch: '学会经营', title: '票价与财政',
      body: '票价越高收入越多，乘客越少。收入、运营费和债券都在财政页。',
      hint: '在「票价」里调好后点「应用新票价」。青湾资金不限，真实城市选「经营挑战」要自己平衡收支。',
      enter: function () { if (ui.layer !== 'none') ui.setLayer('none'); },
      check: function () { return ui.topIs(['finance']); },
      sub: [{ t: '点顶栏的「资金」', el: function () { return ui.pills && ui.pills.money ? ui.pills.money.el : null; } }] },
    { id: 'tasks', main: true, ch: '学会经营', title: '任务与政府合同',
      body: '经营挑战里，政府会发布任务和招标项目。任务可能同时考核多项条件，合同则按建设进度与运营表现支付。',
      hint: '任务详情都有「怎么做」；不会时打开「菜单 → 新手指南」。',
      check: function () { return ui.topIs(['tasks']); },
      sub: [{ t: '点顶栏的「任务」', el: function () { return ui.hbtns && ui.hbtns.tasks; } }] },
    { id: 'follow', ext: true, title: '跟随一列列车',
      body: '跟着列车逛逛青湾。',
      hint: '按 Esc 退出跟随；列车 06:00–24:00 运行。',
      enter: function () { if (ui.layer !== 'none') ui.setLayer('none'); },
      check: function () { return !!g.tutorial.followed; },   // 按本进度判定，不受其他进度的跟随影响
      sub: [PICK, { t: '点一列行驶中的列车（列车在线上移动，暂停时也能点）', at: midStation }] },
    { id: 'netmap', ext: true, title: '线路示意图',
      body: '像地铁站里挂的线路图。',
      hint: '可以缩放，也能导出图片。',
      check: function () { return !!(CM.NetMap && CM.NetMap.isOpen()); },
      sub: [{ t: '点左下的「线路示意图」', el: function () { return CM.Follow && CM.Follow.active() ? null : ui.tbtns.netmap; } }] },
    // 经济小知识（v2.3 改为图文分页；可跳过、可回看；青湾为自由建造，不实际发行债券）
    { id: 'money', title: '小知识：经营挑战的财政', info: true,
      body: '正式城市要自己管钱。11 页小图告诉你：钱从哪里来、花在哪里、票价怎么定、缺钱怎么借。',
      hint: '每页一张图、两三句话，← → 键翻页。' },
    { id: 'done', title: '教程完成！', final: true,
      body: function () { const m = Math.max(1, Math.round((g.tutorial.playSec || 0) / 60)); return '用时约 ' + m + ' 分钟。你已经学会建线、管理线路、扩大线网、读懂城市和经营，去真实城市开始正式游戏吧。'; },
      hint: '不会时打开「菜单 → 新手指南」。' },
  ];
  const MAIN = STEPS.filter(function (s) { return s.main; }), EXT = STEPS.filter(function (s) { return s.ext; });
  // 旧进度：v2.2 之前只记了序号（按此换算成步骤 id）；删除或改名的步骤换到对应的新步骤（v2.5 教程重新设计：合并了查看客流与设施小课，主线后接管理、扩网与经营）
  const OLD_ORDER = ['intro', 'move', 'pop', 'station', 'line', 'confirm', 'run', 'inspect', 'river', 'xfer', 'layers', 'follow', 'netmap', 'money', 'done'];
  const RENAMED = { move: 'look', pop: 'look', river: 'line', layers: 'adv-cong', goal: 'app', inspect: 'flow', 'adv-fac': 'flow' };

  // 任务简报：手绘简图 + 南岸到老城的通勤现状 + 目标
  function brief() {
    if (!g || CM.game !== g || ui.blocking()) return;
    g.tutorial.briefed = true; ui.markUnsaved();
    const b = g.tutorial.base || baseline(), self = ui;
    const start = function () { self.closeScreen(); if (STEPS[idx] && STEPS[idx].id === 'intro') go(idx + 1); };
    const card = h('div', { class: 'card mission-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-blue' }, ic('flag')), h('div', { class: 'grow' }, h('h2', null, '第一个任务：连接两岸'), h('div', { class: 'tiny muted' }, '新手教程 · 青湾 · 约 12 分钟')), h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { self.closeScreen(); } }, ic('close'))),
      h('div', { class: 'sl-pic', html: CM.Sketch.draw('mission', { clock: b.carMin ? '开车 ' + U.fmtNum(b.carMin, 0) + ' 分钟' : '' }) }),
      h('div', { class: 'mission-facts' },
        h('div', null, h('b', null, b.cross ? U.fmtPeople(b.cross) + ' 人' : '—'), h('span', null, '每天从南岸过江去北岸上班')),
        h('div', null, h('b', null, b.carMin ? '约 ' + U.fmtNum(b.carMin, 0) + ' 分钟' : '—'), h('span', null, '早高峰开车过江上班')),
        h('div', null, h('b', null, U.fmtPct(b.south || 0, 0)), h('span', null, '南岸居民早高峰坐地铁'))),
      h('div', { class: 'mission-goal' }, ic('target'), h('span', null, '目标：建一条地铁，把南岸居民区和老城就业中心连起来。建成后马上会看到分担率、通勤时间和运营收支的变化，以及为什么。')),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', onclick: start }, '开始任务', ic('chev', 14))));
    ui.openScreen(card, function () { self.closeScreen(); });
  }

  function setTarget(t) {
    if (target === t) return;
    if (target) target.classList.remove('coach-target');
    target = t || null;
    if (target) { target.classList.add('coach-target'); if (target.closest('.mc-content')) target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function applyHL(st) {
    const R = ui.R;
    if (R.hl && R.hl.tutorial) R.setHighlight(null);
    const spec = st.hl ? st.hl() : null;
    if (spec) R.setHighlight(Object.assign({ dur: 1e9, tutorial: true }, spec));
  }
  function go(i) {
    const back = idx >= 0 && i < idx;
    idx = U.clamp(i, 0, STEPS.length - 1);
    g.tutorial.step = idx; g.tutorial.stepId = STEPS[idx].id;
    doneAt = 0; ctx = {}; listOpen = false; subIdx = 0;
    review = back || g.tutorial.done.indexOf(STEPS[idx].id) >= 0;
    const st = STEPS[idx];
    if (st.enter) st.enter();
    applyHL(st);
    if (st.final) { g.tutorial.complete = true; snd('fanfare'); }
    ui.markUnsaved(); ui.scheduleAutosave();
    render();
  }
  function complete() {
    if (doneAt) return;
    const st = STEPS[idx];
    doneAt = performance.now();
    if (g.tutorial.done.indexOf(st.id) < 0) g.tutorial.done.push(st.id);
    if (!review) snd('good');
    render();
  }
  // 步骤目录：已完成的任务打勾，点击即可回看（回看时不自动跳走）
  function stepList() {
    const box = h('div', { class: 'co-list' });
    let group = null;
    STEPS.forEach(function (s, i) {
      if (s.manual) return;
      const gname = s.main ? s.ch : (s.ext || s.info ? '选学' : '');
      if (gname && gname !== group) { group = gname; box.appendChild(h('div', { class: 'co-lg tiny muted' }, gname)); }
      const done = g.tutorial.done.indexOf(s.id) >= 0, n = MAIN.indexOf(s);
      box.appendChild(h('button', { class: 'co-li' + (i === idx ? ' on' : '') + (done ? ' done' : ''), onclick: function () { go(i); } },
        h('span', { class: 'co-li-n' }, done ? ic('check', 12) : (s.info ? 'i' : s.final ? '★' : s.ext ? '+' : String(n + 1))), h('span', null, s.title)));
    });
    return box;
  }
  function stepLabel(st) {
    if (st.final) return '全部完成';
    if (st.info) return '小知识 · 可跳过';
    if (st.ext) return '选学 ' + (EXT.indexOf(st) + 1) + ' / ' + EXT.length + ' · 可跳过';
    if (st.main) return st.ch + ' · ' + (MAIN.indexOf(st) + 1) + ' / ' + MAIN.length;
    return '共 ' + MAIN.length + ' 步 · 约 12 分钟';
  }
  function render() {
    if (!el) return;
    const st = STEPS[idx], ok = !!doneAt;
    el.className = 'hud glass' + (mini ? ' mini' : '') + (ok ? ' ok' : '');
    el.innerHTML = '';
    const mainDone = MAIN.filter(function (s) { return g.tutorial.done.indexOf(s.id) >= 0; }).length;
    const pct = Math.round(Math.min(1, (mainDone + (st.main && ok && g.tutorial.done.indexOf(st.id) < 0 ? 1 : 0)) / MAIN.length) * 100);
    const head = h('div', { class: 'co-head' },
      h('span', { class: 'co-badge' }, ic('help', 14), '新手教程'),
      h('span', { class: 'co-step' }, stepLabel(st)),
      h('span', { class: 'grow' }),
      mini ? null : h('button', { class: 'co-auto' + (autoOn() ? ' on' : ''), 'aria-pressed': autoOn() ? 'true' : 'false', 'data-tip': autoOn() ? '完成后约 3 秒自动下一步，点击改为手动' : '手动：完成后点「下一步」，点击恢复自动', onclick: function () { g.tutorial.auto = !autoOn(); ui.markUnsaved(); render(); } }, autoOn() ? '自动' : '手动'),
      mini ? null : h('button', { class: 'iconbtn' + (listOpen ? ' on' : ''), 'data-tip': '教程目录：回看任意一步', onclick: function () { listOpen = !listOpen; render(); } }, ic('tasks')),
      h('button', { class: 'iconbtn', 'data-tip': mini ? '展开' : '收起', onclick: function () { mini = !mini; render(); } }, ic(mini ? 'expand' : 'minus')));
    el.append(head, h('div', { class: 'co-bar' }, h('i', { style: { width: pct + '%' } })));
    if (mini) { el.appendChild(h('div', { class: 'co-mini' }, ok ? '✓ ' : '', st.title)); syncLayout(); return; }
    if (listOpen) { el.appendChild(stepList()); syncLayout(); return; }
    el.appendChild(h('div', { class: 'co-title' }, ok ? h('span', { class: 'co-check' }, ic('check', 16)) : null, st.title, review && !st.manual && !st.final ? h('span', { class: 'co-review' }, '回看') : null));
    el.appendChild(h('div', { class: 'co-body' }, keyText(st.body)));
    // 小动作清单：已完成的打勾，当前动作高亮（气泡同时指向要点的位置）
    if (st.sub && !st.final) {
      const cur = ok ? st.sub.length : subIdx;
      el.appendChild(h('ol', { class: 'co-subs' }, st.sub.map(function (s, k) {
        return h('li', { class: k < cur ? 'done' : (k === cur ? 'on' : '') }, h('span', { class: 'co-sub-n' }, k < cur ? ic('check', 12) : String(k + 1)), h('span', null, keyText(s.t)));
      })));
    }
    if (st.hint && !ok) el.appendChild(h('div', { class: 'co-hint' }, ic('info', 14), h('span', null, keyText(st.hint))));
    const acts = h('div', { class: 'co-acts' });
    const toCity = function () { ui.backToMenu(function () { ui.showMapSelect('gz'); }); };
    if (st.final) {
      acts.append(
        h('button', { class: 'btn sm ghost', onclick: function () { ui.showEconGuide(); } }, '回看财政知识'),
        h('button', { class: 'btn sm', onclick: function () { Tutorial.detach(); ui.toast('教程已完成，可以继续在青湾自由建设', 'good'); } }, '继续在青湾建设'),
        h('button', { class: 'btn sm primary', onclick: toCity }, '去真实城市', ic('chev', 14)));
    } else if (st.info) {
      acts.append(h('button', { class: 'btn sm ghost', onclick: function () { go(idx - 1); } }, '上一步'), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: function () { go(idx + 1); } }, '跳过'),
        h('button', { class: 'btn sm primary', onclick: function () { ui.showEconGuide(function (done) { if (STEPS[idx] === st && done) go(idx + 1); }); } }, '看图文说明', ic('chev', 14)));
    } else if (st.manual) {
      acts.append(h('button', { class: 'btn sm ghost', onclick: function () { Tutorial.detach(true); } }, '退出教程'), h('button', { class: 'btn sm ghost', onclick: brief }, '任务简报'), h('span', { class: 'grow' }), h('button', { class: 'btn sm primary', onclick: function () { g.tutorial.briefed = true; go(idx + 1); } }, st.manual, ic('chev', 14)));
    } else {
      // 新完成的步骤：「下一步」按钮上显示自动继续的倒计时条；回看或手动模式只显示按钮
      const counting = ok && !review && autoOn();
      acts.append.apply(acts, [
        h('button', { class: 'btn sm ghost', disabled: idx <= 1 ? true : null, onclick: function () { go(idx - 1); } }, '上一步'),
        h('span', { class: 'grow' }),
        ok ? h('span', { class: 'co-done' }, review ? '已完成' : '完成！') : h('button', { class: 'btn sm ghost', onclick: function () { go(idx + 1); } }, review ? '下一步' : '跳过'),
        ok ? h('button', { class: 'btn sm primary co-next' + (counting ? ' counting' : ''), style: counting ? { '--co-auto': AUTO_MS + 'ms' } : null, onclick: function () { go(idx + 1); } }, '下一步', ic('chev', 14), counting ? h('i', { class: 'co-countdown' }) : null) : null].filter(Boolean));
    }
    el.appendChild(acts);
    syncLayout();
  }
  // 指示气泡：按钮在左侧栏时放在按钮右边，在画面下半部时放在上方，否则放在下方；地图位置放在其上方
  function placeTip(sub) {
    const hide = !sub || ui.blocking() || (CM.NetMap && CM.NetMap.isOpen()) || (CM.Follow && CM.Follow.active());
    let rect = null, pt = null;
    if (!hide) {
      const e = sub.el ? sub.el() : null;
      if (e && e.isConnected) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) rect = r; }
      if (!rect && sub.at) { const p = sub.at(); if (p) pt = ui.R.P(p.x, p.y, 0, {}); }
    }
    if (hide || (!rect && !pt)) { if (tip) { tip.classList.add('off'); ring.classList.add('off'); } return; }
    if (!tip) { ring = h('div', { id: 'coachRing', class: 'off' }); tip = h('div', { id: 'coachTip', class: 'off' }); document.body.append(ring, tip); }
    const txt = keyText(sub.t);
    if (tip._t !== txt) { tip._t = txt; tip.innerHTML = ''; tip.append(ic('cursor', 15), h('span', null, txt)); if (CM.I18n) CM.I18n.localize(tip); }
    tip.classList.remove('off');
    const W = window.innerWidth, H = window.innerHeight, tw = tip.offsetWidth, th = tip.offsetHeight;
    let x, y, side, ax, ay;
    if (rect) {
      ring.classList.remove('off');
      Object.assign(ring.style, { left: (rect.left - 5) + 'px', top: (rect.top - 5) + 'px', width: (rect.width + 10) + 'px', height: (rect.height + 10) + 'px' });
      ax = rect.left + rect.width / 2; ay = rect.top + rect.height / 2;
      if (rect.left < 100 && rect.width < 90) { side = 'right'; x = rect.right + 16; y = ay - th / 2; }
      else if (ay > H * 0.55) { side = 'above'; x = ax - tw / 2; y = rect.top - th - 16; }
      else { side = 'below'; x = ax - tw / 2; y = rect.bottom + 16; }
    } else {
      ring.classList.add('off');
      ax = pt.x; ay = pt.y; side = 'above'; x = ax - tw / 2; y = ay - th - 22;
      if (y < 80) { side = 'below'; y = ay + 22; }
    }
    const l = U.clamp(x, 8, W - tw - 8), t = U.clamp(y, 8, H - th - 8);
    tip.className = side;
    // 小屏上卡片已经列出当前动作；气泡与卡片相撞时让出正文和按钮，目标描边仍保留。
    if (ui.compact() && el) {
      const c = el.getBoundingClientRect();
      tip.classList.toggle('crowded', l < c.right + 8 && l + tw > c.left - 8 && t < c.bottom + 8 && t + th > c.top - 8);
    }
    tip.style.left = l + 'px'; tip.style.top = t + 'px';
    tip.style.setProperty('--ax', U.clamp(ax - l, 14, tw - 14) + 'px'); tip.style.setProperty('--ay', U.clamp(ay - t, 12, th - 12) + 'px');
  }
  // 引导卡片与图层图例共用左上角：图例排在卡片下方
  function syncLayout() {
    if (!el) return;
    requestAnimationFrame(function () { if (el) document.documentElement.style.setProperty('--coach-h', el.offsetHeight + 'px'); });
  }

  const Tutorial = {
    refreshKeys: function () { if (el) { render(); if (ui && ui.queueLayout) ui.queueLayout(); } },
    attach: function (u, game) {
      ui = u; g = game;
      if (!g.tutorial) return;
      Tutorial.detach();
      ui = u; g = game;
      // 已完成或主动退出的教程不再显示（complete 只在到达完成页或退出时设置；1.7 前完成的存档序号较小，同样适用）
      if (g.tutorial.complete) {
        ui.toast('教程已完成，可以继续在青湾自由建设', 'info');
        return;
      }
      el = h('aside', { id: 'coach' });
      el.addEventListener('pointerenter', function () { hover = true; el.classList.add('hold'); });
      el.addEventListener('pointerleave', function () { hover = false; el.classList.remove('hold'); });
      document.getElementById('app').appendChild(el);
      document.body.classList.add('has-coach');
      if (ui.placeFeed) ui.placeFeed();
      mini = false;
      let sid = g.tutorial.stepId || OLD_ORDER[g.tutorial.step || 0];
      if (RENAMED[sid]) sid = RENAMED[sid];
      const at = STEPS.findIndex(function (s) { return s.id === sid; });
      idx = -1; go(at >= 0 ? at : 0);
    },
    // quit：玩家主动退出教程（保留城市，可继续自由建设）
    detach: function (quit) {
      if (quit && g && g.tutorial) { g.tutorial.complete = true; g.tutorial.step = STEPS.length - 1; if (ui) { ui.markUnsaved(); ui.toast('已退出教程，可以继续在青湾自由建设', 'info'); } }
      setTarget(null);
      if (ui && ui.R.hl && ui.R.hl.tutorial) ui.R.setHighlight(null);
      if (el) { el.remove(); el = null; }
      if (tip) { tip.remove(); ring.remove(); tip = ring = null; }
      document.body.classList.remove('has-coach');
      if (ui && ui.placeFeed) ui.placeFeed();
      idx = -1;
    },
    active: function () { return !!el; },
    // 建设效果报告生成（game 'trafficImpact'）：主线的首条线路由教程弹出效果卡，不再另弹提示；返回 true 表示已处理
    onImpact: function () {
      if (!el || !g || CM.game !== g || g.tutorial.cardSeen || !mainLine(g.net)) return false;
      const st = STEPS[idx];
      if (st && st.id === 'result') showCard();
      return true;
    },
    tick: function (dt) {
      if (!el || !g || CM.game !== g || idx < 0) return;
      const st = STEPS[idx];
      const now = performance.now();
      if (!g.tutorial.complete) g.tutorial.playSec = (g.tutorial.playSec || 0) + (dt || 0);
      // 打开过建设效果报告（效果卡按钮、拥堵详情或菜单入口均可）
      if (!g.tutorial.reportSeen && g.tutorial.cardSeen && ui.topIs(['impact'])) g.tutorial.reportSeen = true;
      // 当前小动作：要点的按钮闪烁并加外圈，气泡指向按钮或地图位置（打开全屏界面时隐藏）
      const sub = !doneAt && st.sub ? st.sub[subIdx] : null;
      setTarget(sub && sub.el && !ui.blocking() ? sub.el() : null);
      placeTip(sub);
      if (doneAt) {
        // 鼠标停在卡片上、打开目录或全屏界面时暂停倒计时；回看与手动模式不自动跳走
        if (hover || listOpen || ui.blocking()) doneAt += (dt || 0) * 1000;
        else if (!review && autoOn() && now - doneAt > AUTO_MS) go(idx + 1);
        return;
      }
      if (now - lastCheck < 250) return;
      lastCheck = now;
      // 第一次进入青湾：开场先给任务简报（载入界面收起后）
      if (st.id === 'intro' && !g.tutorial.briefed && !ui.blocking() && now - (ctx.at || 0) > 600) brief();
      // 效果卡：报告在进入「看效果」之后才生成时，到这里再弹出
      if (st.id === 'result' && !g.tutorial.cardSeen && g.impactReport && g.impactReport.status === 'done' && !ui.blocking()) showCard();
      const safe = function (f) { try { return !!f(); } catch (e) { return false; } };
      if (st.sub) {
        // 进度取已完成的最后一个小动作之后（玩家切回别的工具时不退回已做过的动作）
        let k = 0; for (let i = st.sub.length - 1; i >= 0; i--) if (st.sub[i].done && safe(st.sub[i].done)) { k = i + 1; break; }
        if (k > 0 && k === st.sub.length && !st.check && !st.sub.every(function (s) { return safe(s.done); })) k = st.sub.findIndex(function (s) { return !safe(s.done); });
        if (k !== subIdx) { subIdx = k; render(); }
      }
      // 没有单独完成条件的步骤：全部小动作完成即完成
      const check = st.check || (st.sub && st.sub.every(function (s) { return s.done; }) ? function () { return st.sub.every(function (s) { return safe(s.done); }); } : null);
      if (check && safe(check)) complete();
    },
  };
  CM.Tutorial = Tutorial;
})(window.CM);
