'use strict';
// 启动与主循环
(function (CM) {
  const CFG = CM.CFG;
  const canvas = document.getElementById('map');
  const R = new CM.Renderer(canvas);
  const ui = new CM.UI(R);
  const tools = new CM.Tools(R, ui);
  ui.tools = tools;
  if (CM.Quick) CM.Quick.init(ui);
  CM.R = R; CM.ui = ui; CM.tools = tools;
  CM.Follow.init(ui);
  CM.agents = new CM.Agents();
  CM.game = null;

  // 平滑切换（v2.1）：把当前画面复制到覆盖层上，新画面在快照下面以放宽的预算一次画清（最多约 1.2 秒，
  // 不再露出模糊的低分辨率块）；就绪后快照淡出，reveal（如界面换色）在同一帧开始，两者用同样的时长与缓动。
  // 调用方在 crossfade 返回后再切换地图（主题、开始界面背景），快照取的是切换前的画面
  let fadeT = null, waiting = null;
  function applyReveal(reveal) {
    if (!reveal) return;
    const root = document.documentElement;
    root.classList.add('theme-fade'); clearTimeout(fadeT);
    reveal();
    fadeT = setTimeout(function () { root.classList.remove('theme-fade'); }, 650);
  }
  function crossfade(reveal) {
    if (waiting) {   // 上一次切换还在快照下准备：沿用那张快照（画布上已是未画完的新画面），合并 reveal
      const prev = waiting.reveal;
      waiting.reveal = !reveal ? prev : (prev ? function () { prev(); reveal(); } : reveal);
      waiting.t0 = performance.now(); waiting.f0 = R.frame; R.warm(1200);
      return;
    }
    let snap = null;
    if (!CM.Settings.reducedMotion() && R.frame && canvas.width && canvas.height) {
      snap = document.createElement('canvas');
      snap.width = canvas.width; snap.height = canvas.height; snap.className = 'map-snap';
      try { snap.getContext('2d').drawImage(canvas, 0, 0); } catch (e) { snap = null; }
    }
    if (!snap) { if (reveal) reveal(); return; }
    canvas.insertAdjacentElement('afterend', snap);
    const job = waiting = { reveal: reveal, t0: performance.now(), f0: R.frame };
    R.warm(1200);
    const wait = function () {
      // 等画面内的缓存准备好再收起快照。
      const ready = !R.game || (R.frame > job.f0 + 1 && R.sharpReady());
      if (!ready && performance.now() - job.t0 < 1200) { requestAnimationFrame(wait); return; }
      waiting = null; R.warmUntil = 0;
      applyReveal(job.reveal);
      requestAnimationFrame(function () { snap.classList.add('out'); });
      setTimeout(function () { snap.remove(); }, 800);
    };
    requestAnimationFrame(wait);
  }
  CM.crossfade = crossfade;
  // 浅色 / 深色主题：界面（CSS 变量）与地图（渲染主题）同步切换；选择由「设置」保存。
  // 地图先在旧画面快照下画好新主题，再与界面颜色一起过渡
  let themeTransition = null, themeRequest = 0, lastThemePoint = null;
  window.addEventListener('pointerdown', function (e) { lastThemePoint = { x: e.clientX, y: e.clientY, at: performance.now() }; }, true);
  CM.setTheme = function (name) {
    name = name === 'dark' ? 'dark' : 'light';
    const reveal = function () {
      document.documentElement.dataset.theme = name;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', name === 'dark' ? '#111925' : '#eaf1f7');
      if (CM.Settings.get('colorBlind')) {
        CM.Settings.apply('colorBlind');
        ui._toKey = ''; ui.renderToolOpts(); ui.rerenderPage();
        ui.renderDock();
      }
      if (CM.Stats && CM.Stats.isOpen()) CM.Stats.redraw();
    };
    const root = document.documentElement, request = ++themeRequest;
    if (themeTransition) { try { themeTransition.skipTransition(); } catch (e) { /* 已完成 */ } }
    if (root.dataset.theme === name && R.themeName === name) { reveal(); return; }
    if (typeof document.startViewTransition === 'function' && !CM.Settings.reducedMotion() && R.frame > 0 && !document.hidden && !waiting) {
      const p = lastThemePoint && performance.now() - lastThemePoint.at < 1500 ? lastThemePoint : { x: R.w - 40, y: 40 };
      root.style.setProperty('--vt-x', p.x + 'px'); root.style.setProperty('--vt-y', p.y + 'px');
      root.style.setProperty('--vt-r', (Math.ceil(Math.hypot(Math.max(p.x, R.w - p.x), Math.max(p.y, R.h - p.y))) + 2) + 'px');
      root.classList.remove('theme-fade'); root.classList.add('vt-theme');
      try {
        const transition = themeTransition = document.startViewTransition(async function () {
          if (request !== themeRequest) return;
          if (R.themeName !== name) R.setTheme(name);
          reveal(); R.warm(800);
          const until = performance.now() + 800;
          while (request === themeRequest && R.game && !R.sharpReady() && !document.hidden && performance.now() < until) {
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
            if (request === themeRequest) R.render(0, ui);
          }
          if (request === themeRequest) R.warmUntil = 0;
        });
        const done = function () { if (themeTransition === transition) { themeTransition = null; root.classList.remove('vt-theme'); } };
        transition.finished.then(done, done); transition.ready.catch(function () { /* 快速切换时可跳过 */ });
        setTimeout(function () { if (themeTransition === transition) { try { transition.skipTransition(); } catch (e) {} done(); } }, 2200);
        return;
      } catch (e) { themeTransition = null; root.classList.remove('vt-theme'); }
    }
    if (R.themeName !== name) { crossfade(reveal); R.setTheme(name); }
    else applyReveal(reveal);
  };
  CM.Settings.apply();

  // 开始界面背景：2012 年前后的城市与几条示意地铁线（真实车站位置）
  let preview = null, previewT = 0;
  function makePreview() {
    const city = new CM.City();
    city.generate(19900101, 2012);
    const M = CM.Metro, net = M.empty(), P = {}, byName = {};
    for (const p of CM.DATA.places) P[p[0]] = p;
    // 颜色按广州地铁配色：1 号线黄、2 号线蓝、3 号线橙、5 号线红
    const LINES = [
      ['#f3d03e', ['坑口', '花地湾', '芳村', '黄沙', '陈家祠', '西门口', '公园前', '农讲所', '烈士陵园', '东山口', '杨箕', '体育西路', '体育中心']],
      ['#00629b', ['白云公园', '三元里', '越秀公园', '纪念堂', '公园前', '海珠广场', '江南西', '昌岗', '东晓南', '南洲']],
      ['#eca154', ['五山', '华师', '岗顶', '石牌桥', '体育西路', '珠江新城', '广州塔', '客村', '沥滘', '厦滘']],
      ['#c5003e', ['西村', '小北', '淘金', '区庄', '动物园', '杨箕', '珠江新城', '猎德', '潭村', '员村', '车陂', '东圃', '鱼珠', '大沙地']],
    ];
    for (const L of LINES) {
      const lid = M.newLine(net); net.lines[lid].color = L[0];
      let prev = null;
      for (const nm of L[1]) {
        const p = P[nm]; if (!p) continue;
        let sid = byName[nm];
        if (!sid) { sid = M.addStation(net, p[1], p[2], { size: 'M', type: 'underground' }, city); net.stations[sid].name = nm; byName[nm] = sid; }
        if (prev && prev !== sid) M.addSegment(net, lid, prev, sid, [], 'underground');
        prev = sid;
      }
    }
    M.normalizeLines(net);
    return { city: city, net: net, compiled: M.compile(net, city), draft: null, preview: true, clock: { y: 2012, m: 6, d: 1, minute: 600 }, netVersion: 0 };
  }
  // 开始界面背景：镜头沿一条环形路线缓慢巡游几处城市地标（位置与缩放用 Catmull-Rom 平滑插值，速度约 0.3–0.5 格/秒，
  // 新进入画面的地图块少，保持流畅），同时列车在示意线路上运行、汽车在道路上行驶。菜单在左侧，焦点放在画面偏右
  const TOUR = [[44, 39.5, 17.5], [48.6, 45, 19], [44.5, 50.5, 17.5], [31, 45.5, 17], [18.5, 45.5, 18.5], [22, 37.5, 18], [34, 37.5, 17], [47.5, 34.5, 18.5]].map(p => [p[0] + (CM.MAPS.gz.extent.dx || 0), p[1] + (CM.MAPS.gz.extent.dy || 0), p[2]]);
  const TOUR_SEG = 24;   // 每段秒数
  function previewCamera(dt) {
    // Hold the first camera until visible ground and buildings have been filled.
    // Keep the existing per-frame rendering budget; subsequent views keep cruising.
    if (preview && R.game === preview && !preview.ready) {
      if (R.frame > (preview.firstFrame || 0) + 1 && R.sharpReady()) preview.ready = true;
      else dt = 0;
    }
    previewT += dt;
    const n = TOUR.length, u = (previewT / TOUR_SEG) % n, k = Math.floor(u), f = u - k;
    const P = function (i) { return TOUR[((i % n) + n) % n]; };
    const cr = function (j) {
      const p0 = P(k - 1)[j], p1 = P(k)[j], p2 = P(k + 1)[j], p3 = P(k + 2)[j];
      return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    };
    const c = R.cam;
    c.view = 1; c.fly = null; c.anchor = null;
    c.zoom = c.tz = cr(2);
    const d = R.screenToWorldDelta(R.w * 0.14, 0);
    c.cx = cr(0) - d.x; c.cy = cr(1) - d.y;
  }
  function fail(e, what) {
    console.error(e);
    ui.openScreen(CM.U.h('div', { class: 'card' }, CM.U.h('h2', null, what + '失败'), CM.U.h('div', { class: 'callout bad' }, String(e && e.message || e)),
      CM.U.h('div', { class: 'modal-actions' }, CM.U.h('button', { class: 'btn primary', onclick: function () { if (CM.game) ui.closeScreen(); else ui.showStart(); } }, '确定'))));
  }
  function start(g, isNew) {
    if (CM.Soundscape) CM.Soundscape.reset();
    if (CM.Follow) CM.Follow.stop(true);
    if (CM.Tutorial) CM.Tutorial.detach();
    if (CM.game && CM.game !== g && CM.game.model) CM.game.model.retired = true;   // 旧进度的交通求解不再占用工作线程
    CM.game = g;
    if (CM.Fleet) CM.Fleet.ensure(g);   // 车队（v2.5）：新局的既有线路与旧存档按当前运营所需建立车队，并接入模拟
    R.setGame(g);
    CM.releaseGeos();
    canvas.classList.add('map-in');   // 快速进入游戏时，菜单背景任务可能尚未执行
    CM.agents.reset();
    tools.tool = 'select'; tools.chain = null; tools.bends = []; tools.lineChoice = 'new';
    tools.newLineColor = null; tools.newLineSpeed = null; tools.clearMeasure();
    tools.drag = tools.ptr = tools.cursor = tools.hover = tools.hint = tools.snapPt = tools.mouse = tools.portalHover = null;
    tools.lineLock = false; tools.keys.clear(); tools.keyMods = {};
    tools.resetTouches();
    ui.setTooltip(null); R.cv.style.cursor = '';
    ui.attachGame(g);
    // 新开局随后要显示简报：载入卡片直接换成简报，不先关掉界面层（v2.3：以前会露出一帧游戏界面再盖上，看起来闪一下）
    const briefNext = isNew && !g.tutorial && CM.DATA.briefing && ui.showBriefing;
    if (!briefNext) ui.closeScreen();
    const mp = CM.curMap(), cam = mp.cam || { cx: CFG.W / 2, cy: CFG.H / 2, zoom: 18 };
    R.cam.cx = cam.cx; R.cam.cy = cam.cy; R.cam.zoom = R.cam.tz = cam.zoom; R.cam.view = 1; R.cam.t = 1; R.cam.under = R.cam.tu = 0; R.cam.anchor = null; R.cam.fly = null;
    g.setSpeed(0);
    if (g.tutorial && CM.Tutorial) {
      if (isNew) ui.doAutosave(); else ui.markSaved(g, Date.now());
      CM.Tutorial.attach(ui, g);
    } else if (isNew) {
      ui.doAutosave();
      // 开局简报：这座城市当时的交通格局（东京为接管银座线）；关闭后打开任务面板
      const tip = function () { ui.toast('游戏已暂停：先规划线路，再按' + (CM.Keys.hint('pause') ? ' ' + CM.Keys.hint('pause') + ' 或' : '') + ' ▶ 开始。', 'info', { label: '怎么玩？', fn: function () { ui.openPage('guide', 'start', { root: true }); } }); ui.openPage('tasks', null, { root: true }); };
      if (CM.DATA.briefing && ui.showBriefing) ui.showBriefing(tip); else tip();
    } else {
      ui.markSaved(g, Date.now());
      ui.toast('存档已载入（' + g.clock.y + '年' + g.clock.m + '月），' + (CM.Keys.hint('pause') ? '按 ' + CM.Keys.hint('pause') + ' 继续' : '点 ▶ 继续'), 'good');
    }
    // 旧存档升级（升级前的原存档已由 Save.load 另存为备份）：提示并保存升级后的进度
    if (!isNew && g.upgradeNote) {
      // 读入的旧快照与内存中的升级结果不同；备份失败时尤其不能把尚未落盘的升级标为「已保存」。
      ui.markUnsaved();
      ui.toast(g.upgradeNote, g.backupFailed ? 'warn' : 'info'); g.upgradeNote = null;
      if (!g.backupFailed) ui.doAutosave();
    }
    ui.renderToolbar();
  }
  // 驱动开局 / 读档生成器：等待工作线程时让出主线程，普通步骤按短时间片推进。
  // 地图配置切换后暂停旧进度的模拟与绘制；失败时恢复旧地图、货币及进度。
  CM.loadProgress = function (p, label) {
    const job = loading;
    if (job && (p > job.reported || label !== job.reportedLabel)) {
      job.waitAt = null; job.reported = p; job.reportedLabel = label;
    }
    ui.loadProgress(p, label);
  };
  let loading = null;
  const LOAD_WAIT_LIMIT = 60000;
  CM.isLoading = function () { return loading !== null; };
  function cancelLoad() {
    const job = loading;
    if (!job) return;
    loading = null;
    clearTimeout(job.timer);
    if (CM.CarPool && CM.CarPool.onReq === job.resume) CM.CarPool.onReq = null;
    if (job.gen) job.gen.return();
    if (job.releaseGeo) job.releaseGeo();
  }
  function runLoad(mapId, message, makeGen, isNew, what) {
    if (loading) return;   // 包括尚未开始的延时任务，防止快速重复点击启动两次载入
    mapId = CM.MAPS[mapId] ? mapId : 'gz';
    const prev = CM.game;
    const job = loading = { gen: null, timer: null, waitAt: null, reported: -1, reportedLabel: null, mapId: CM.mapId, prevRetired: prev && prev.model && prev.model.retired };
    if (prev && prev.model) prev.model.retired = true;
    if (CM.CarPool) CM.CarPool.onReq = null;
    ui.showLoading(message, isNew ? (message.includes('推演') ? 'pre' : 'new') : 'load', mapId);
    const end = function () {
      clearTimeout(job.timer);
      if (CM.CarPool && CM.CarPool.onReq === job.resume) CM.CarPool.onReq = null;
      if (job.releaseGeo) job.releaseGeo();
      loading = null;
    };
    const step = function () {
      if (loading !== job) return;
      clearTimeout(job.timer);
      try {
        if (job.geoError) throw job.geoError;
        if (!job.gen) {
          CM.useMap(mapId);
          if (job.releaseGeo) job.releaseGeo();
          job.gen = makeGen();
        }
        const t0 = performance.now();
        for (;;) {
          const r = job.gen.next();
          if (r.done) {
            job.gen = null;
            if (CM.CarPool && CM.CarPool.onReq === job.resume) CM.CarPool.onReq = null;
            ui.finishLoading(function () { if (loading !== job) { if (r.value.model) r.value.model.retired = true; return; } end(); start(r.value, isNew); });
            return;
          }
          if (r.value === CM.SIM_WAIT) {
            if (job.waitAt === null) job.waitAt = performance.now();
            if (performance.now() - job.waitAt >= LOAD_WAIT_LIMIT) {
              const error = new Error('恢复交通计算长时间未响应，已停止本次载入。');
              error.code = 'LOAD_TIMEOUT'; throw error;
            }
            if (CM.CarPool) CM.CarPool.onReq = job.resume;
            job.timer = setTimeout(step, 100);   // 后台标签页或异常环境下仍可继续检查回退状态
            return;
          }
          job.waitAt = null;
          if (performance.now() - t0 >= 8) { job.timer = setTimeout(step, 0); return; }
        }
      } catch (e) {
        try { if (job.gen) job.gen.return(); } catch (closeError) { console.error(closeError); }
        end();
        if (e && e.code === 'LOAD_TIMEOUT') for (const pool of [CM.SkimPool, CM.OdPool, CM.CarPool]) if (pool) pool.fail('载入计算长时间未响应');
        CM.useMap(job.mapId || 'gz');
        CM.releaseGeos();
        if (prev && CM.game === prev) {
          if (prev.model) prev.model.retired = job.prevRetired;
          if (CM.applyMoneyEra) CM.applyMoneyEra(prev.clock.y, prev.clock.m);
        }
        if (what === '载入存档') ui.showLoadError(e, ui._loadingSlotId); else fail(e, what);
      }
    };
    job.resume = function () { if (loading === job) { clearTimeout(job.timer); job.timer = setTimeout(step, 0); } };
    const queue = function () { if (loading === job) job.timer = setTimeout(step, Math.max(60, (ui._zoomUntil || 0) - performance.now())); };
    CM.holdGeo(mapId).then(function () {
      if (loading !== job) { CM.unholdGeo(mapId); return; }
      job.releaseGeo = function () { job.releaseGeo = null; CM.unholdGeo(mapId); };
      queue();
    }, function (error) { job.geoError = error; queue(); });
  }
  // opts.map：地图（默认广州）；opts.tutorial：新手教程
  CM.newGame = function (opts) {
    ui._slotLoadRequest = null;
    ui._loadingSlotId = null;
    if (CM.Soundscape) CM.Soundscape.reset();
    const mp = CM.MAPS[opts.map] || CM.MAPS.gz;
    runLoad(mp.id, opts.startYear > mp.cfg.START.y ? '从 ' + mp.cfg.START.y + ' 年推演到 ' + opts.startYear + ' 年的' + mp.data.city : '正在生成 ' + mp.cfg.START.y + ' 年的' + mp.data.city + '，并计算居民出行…', function () { return CM.Game.createGen(opts); }, true, '创建新游戏');
  };
  CM.loadGame = function (data) {
    if (CM.Soundscape) CM.Soundscape.reset();
    runLoad((data.meta && data.meta.map) || 'gz', '正在载入存档并恢复城市与交通状态…', function () { return CM.Game.restoreGen(data); }, false, '载入存档');
  };
  let workerReleaseTimer;
  function releaseIdleWorkers() {
    if (CM.game || loading) return;
    const settled = [CM.CarPool, CM.OdPool, CM.SkimPool].map(function (pool) { return !pool || pool.release(); });
    if (settled.includes(false)) workerReleaseTimer = setTimeout(releaseIdleWorkers, 500);
  }
  CM.endGame = function () {
    ui._slotLoadRequest = null;
    cancelLoad();
    if (CM.CarPool) CM.CarPool.onReq = null;
    if (CM.Soundscape) CM.Soundscape.reset();
    ui.clearCelebrations();
    if (CM.game && CM.game.model) CM.game.model.retired = true;   // 返回主菜单：放弃旧进度尚未发出的交通计算
    CM.game = null;
    ui._opsYm = ui._opsDaily = ui._revenueLegend = ui._totCity = ui.voSeen = null;
    if (CM.Voices) CM.Voices.cache = null;
    if (CM.CityLink) CM.CityLink.clear();
    if (CM.Follow) CM.Follow.stop(true);
    if (CM.Tutorial) CM.Tutorial.detach();
    CM.useMap('gz');   // 开始界面背景是广州
    CM.releaseGeos();
    ui.closeSearch();
    if (CM.NetMap) CM.NetMap.close();
    if (CM.Stats && CM.Stats.isOpen()) CM.Stats.close();
    ui.closePanel(true);
    ui.showHUD(false);
    ui.setTooltip(null);
    CM.agents.reset();
    crossfade();   // 从游戏画面淡入开始界面背景，掩盖地图块的重新绘制
    // 清掉游戏里的视图状态：分析图层、选中与高亮、建设工具、相机飞行与缩放锚点、地下视图、特效
    ui.layer = 'none'; R.layer = 'none'; R.heatKey = ''; R.layerFade = 0;
    ui.selection = null; ui.highlightLine = null; ui.multi = null;
    tools.tool = 'select'; tools.chain = null; tools.bends = []; tools.drag = null; tools.ptr = null; tools.hover = null; tools.keys.clear(); tools.resetTouches();
    R.cv.style.cursor = '';
    if (!preview) preview = makePreview();
    R.setGame(preview);
    preview.ready = false; preview.firstFrame = R.frame;
    R.fx = [];
    R.cam.t = 1; R.cam.under = R.cam.tu = 0; R.cam.fly = null; R.cam.anchor = null;
    previewCamera(0);
    clearTimeout(workerReleaseTimer);
    workerReleaseTimer = setTimeout(releaseIdleWorkers, 500);
  };

  let last = performance.now(), fpsAcc = 0, fpsN = 0, lastJumpPaint = -1e9;
  let idleN = 0, uiDt = 0, inputAt = 0;
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, function () { inputAt = performance.now(); }, { capture: true, passive: true });
  const isStill = function (g, t) {
    return g.speed === 0 && !g.jumping && !g.pending && !g.draft && !R.interacting && t - inputAt > 600 && !waiting && !R.warmUntil && !R.stats.pendingVisible
      && !(R.fx && R.fx.length) && !R.hl && !R.cam.fly && !R.overviewJob && !CM.Follow.active() && !CM.Tutorial.active();
  };
  function frame(t) {
    requestAnimationFrame(frame);
    const workStarted = performance.now();
    R.frameWorkStart = workStarted;
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    // 新进度载入中（地图数据已切换到新城市）：暂停模拟与绘制，画面停在载入界面下的最后一帧
    if (loading) return;
    const g = CM.game;
    if (g) {
      try { g.update(dt); } catch (e) { console.error(e); }
      try { CM.agents.update(dt, g, R); } catch (e) { console.error(e); }
      try { CM.Follow.tick(dt); } catch (e) { console.error(e); }
      try { CM.Tutorial.tick(dt); } catch (e) { console.error(e); }
      try { tools.tick(dt); } catch (e) { console.error(e); }
    } else if (preview && R.game === preview) {
      previewCamera(dt);
      try { CM.agents.updatePreview(dt, preview, R); } catch (e) { console.error(e); }
    }
    // 跳月 / 跳年期间画面被推进卡片遮住、列车车辆静止：地图降频重绘，把时间留给结算
    const overlay = !!(g && CM.NetMap && CM.NetMap.isOpen());
    const jumpHold = overlay || (g && g.jumping && t - lastJumpPaint < CFG.perf.jumpRenderMs);
    // 静止画面降频（v2.5 性能）：暂停、没有操作、没有待补的地图块和动画时每 6 帧才重绘一次，把 CPU 与 GPU 省下来
    const still = !jumpHold && g && isStill(g, t);
    idleN = still ? idleN + 1 : 0;
    const paint = !jumpHold && (!still || idleN % 6 === 0);
    if (paint) { if (g && g.jumping) lastJumpPaint = t; try { R.render(dt, ui); } catch (e) { console.error(e); } }
    // 界面与环境音是低优先级任务：镜头移动时约 20 次/秒，其余时间每帧（dt 累计，不丢时间）
    uiDt += dt;
    if (!R.interacting || uiDt >= 0.05) {
      try { CM.Soundscape.tick(uiDt); } catch (e) { console.error(e); }
      try { ui.tick(uiDt); } catch (e) { console.error(e); }
      uiDt = 0;
    }
    if (paint) R.noteFrameTime(performance.now() - workStarted);   // 暂停期间的空帧不计入画质自适应
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { R.stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  }
  window.addEventListener('beforeunload', function () { if (!loading && CM.game && !ui.isSaved()) ui.doAutosave(); });
  window.addEventListener('resize', function () { R.resize(); });

  R.resize();
  R.cam.zoom = R.cam.tz = 17; R.cam.view = 1; R.cam.t = 1; previewCamera(0);
  requestAnimationFrame(frame);
  // 先显示开始界面，再在下一帧之后生成背景城市，地图淡入（打开不卡顿）
  canvas.classList.add('map-intro');
  CM.Save.init().then(function () { ui.showStart(); }, function () { ui.showStart(); });
  setTimeout(function () {
    if (loading) return;   // 当前配置已属于载入中的城市，不能用它生成广州菜单背景
    if (!preview) { try { preview = makePreview(); } catch (e) { console.error(e); } }
    if (preview && !CM.game) { R.setGame(preview); preview.ready = false; preview.firstFrame = R.frame; }
    requestAnimationFrame(function () { canvas.classList.add('map-in'); });
    setTimeout(function () { if (CM.prewarmThumbs) CM.prewarmThumbs(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); }, 1500);
  }, 80);
})(window.CM);
