'use strict';
// 渲染：相机（平移/缩放/视图过渡）、地面与等距建筑分块缓存、分析图层、地铁网络、动态对象、标注
(function (CM) {
  const AX = CM.Accessibility;
  const U = CM.U, CFG = CM.CFG, D = CM.DATA, LU = CM.LU;
  const ISO = [0.70710678, -0.70710678, 0.35355339, 0.35355339];
  const HSF = 0.82;                          // 高度屏幕系数
  const EX = 2.0 / CFG.CELL_M;               // 米 → 世界单位（夸张）
  const LEVELS = [8, 16, 32, 64];
  const CHUNK_PX = 512;
  const MAX_H = 5.0;                          // 世界单位（建筑最大高度，含广州塔天线）
  const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  // 地图文字层级（v2.4 统一）：区名 > 地名（车站、地标、设施与图层标注同一字号字重）> 说明与数值 > 道路名。地名与普通站名用常规字重、
  // 低调不抢画面，只有换乘站加粗。同一种地点在普通地图、分析图层与说明卡上用同一种字
  const TYPE = CM.MAP_TYPE = {
    font: FONT,
    district: function (z) { return '500 ' + (z < 9 ? 15 : 17) + 'px ' + FONT; },
    place: '400 12px ' + FONT, placeMajor: '700 12px ' + FONT,
    meta: '500 11px ' + FONT, road: '500 10.5px ' + FONT, title: '700 12.5px ' + FONT,
  };
  const UNDER_DEPTH = 4;                     // 地下视图中地下线路的视觉下沉倍数

  // 地图主题：浅色为「云雾淡彩」风格（浅蓝白底、柔和水面、水墨山峦、玻璃色楼宇）；深色为同风格夜景
  const THEMES = {
    light: {
      night: false, bg: [234, 241, 247], bgUnder: [214, 225, 238],
      fog: [238, 244, 250], cloud: [255, 255, 255],
      ground: {
        land: '#edf2f6', farm: ['#e6efe5', '#e9f1e8', '#e3ece3'], hill: ['#b4ccd0', '#adc7cc', '#bcd2d5'], park: '#d2e7cc',
        urban: { 1: '#f0f4f8', 2: '#f0f4f8', 3: '#f0f3f7', 4: '#f0f4f8', 6: '#f0f4f7', 10: '#eef3f2', 0: '#f0f4f8' },
        airport: '#e7ecf1', runway: '#c8d2dd', apron: '#dbe2ea', water: '#94c0e3', bank: '#bcd8ee', glint: 'rgba(255,255,255,0.4)', wood: 'rgba(170,205,180,0.42)', parkEdge: 'rgba(130,180,130,0.3)',
      },
      pal: {
        1: [[216, 226, 239], [208, 220, 236], [224, 231, 242], [202, 215, 233]],
        2: [[178, 199, 228], [190, 208, 233], [168, 191, 224]],
        3: [[214, 221, 230], [206, 213, 224]],
        4: [[206, 219, 237], [215, 225, 239]],
        6: [[219, 228, 239], [226, 233, 242]],
        0: [[226, 231, 237], [218, 225, 233]],
      },
      shadow2d: 'rgba(70,100,140,0.10)', bldStroke: 'rgba(100,130,170,0.16)', parkTree: 'rgba(125,180,125,0.5)',
      road: { local: '#ffffff', localCase: '#dee5ee', coll: '#ffffff', collCase: '#d0dbe7', art: '#ffffff', artCase: '#bfccdc', exp: '#f8fafd', expCase: '#a9b9cd', expLine: 'rgba(170,186,208,0.55)', bridgeCase: '#93a3b9', tunnel: 'rgba(140,156,178,0.45)', rail: '#ffffff', railCase: '#a5b1c2' },
      lockFill: 'rgba(226,233,241,0.62)', lockHatch: 'rgba(150,166,188,0.2)',
      ink: '#1c2c45', halo: 'rgba(255,255,255,0.92)', district: '#58708f', landmarkInk: '#36557d', roadInk: '#7a8ca6', lockInk: '#7a889e',
      stFill: '#ffffff', stInter: '#25334a', isoShadow: 'rgba(80,110,150,0.10)', roofOld: [[226, 232, 240], [214, 222, 232]], roofInd: [222, 228, 236],
      tree: [[134, 188, 128], [112, 170, 112]], trunk: '#8f9c85', elevCase: 'rgba(90,112,145,0.45)', lineCase: 'rgba(255,255,255,0.96)', pier: '#a9b5c6',
      lm2d: { fill: '#e5ebf2', stroke: '#9fb1c8' }, edgeLine: 'rgba(90,120,160,0.12)',
      peak: { top: [78, 128, 140], base: [210, 228, 232], ridge: 'rgba(50,92,104,0.3)' },
      // 轨道建设方式（v2.0）：越江隧道、道床与枕木、桥面与栏杆、引桥挡墙
      trk: { tunnelWater: 'rgba(36,92,160,0.55)', ballast: '#cfc8ba', sleeper: '#8d8473', deck: '#b3bfcd', parapet: 'rgba(255,255,255,0.95)',
        wall: '#a7afba', pierFoot: 'rgba(255,255,255,0.7)', shadow: '#2a3a52' },
    },
    dark: {
      night: true, bg: [17, 25, 37], bgUnder: [9, 14, 22],
      fog: [17, 26, 39], cloud: [58, 78, 106],
      ground: {
        land: '#192333', farm: ['#1a2633', '#192431', '#1c2836'], hill: ['#21393d', '#1f3639', '#253f42'], park: '#1c3530',
        urban: { 1: '#1f2a3a', 2: '#1f2a3a', 3: '#1f2939', 4: '#1f2a3a', 6: '#1f2a39', 10: '#202c33', 0: '#1f2a3a' },
        airport: '#212b38', runway: '#364254', apron: '#29333f', water: '#1c3f61', bank: '#284f73', glint: 'rgba(140,190,240,0.18)', wood: 'rgba(36,72,62,0.55)', parkEdge: 'rgba(70,130,100,0.35)',
      },
      pal: {
        1: [[60, 76, 100], [56, 72, 96], [66, 80, 104], [58, 74, 100]],
        2: [[52, 74, 110], [60, 82, 118], [48, 70, 106]],
        3: [[62, 70, 84], [58, 66, 80]],
        4: [[64, 78, 100], [58, 74, 98]],
        6: [[66, 76, 94], [62, 72, 90]],
        0: [[62, 68, 80], [58, 64, 76]],
      },
      shadow2d: 'rgba(0,0,0,0.32)', bldStroke: 'rgba(140,170,210,0.14)', parkTree: 'rgba(70,130,100,0.55)',
      road: { local: '#2b384b', localCase: '#162030', coll: '#324157', collCase: '#131c2a', art: '#3d4f68', artCase: '#0f1723', exp: '#4b6080', expCase: '#0e1520', expLine: 'rgba(150,180,220,0.3)', bridgeCase: '#080d15', tunnel: 'rgba(110,130,160,0.4)', rail: '#5a6678', railCase: '#0c121b' },
      lockFill: 'rgba(8,12,20,0.5)', lockHatch: 'rgba(110,128,156,0.16)',
      ink: '#e6edf7', halo: 'rgba(12,18,28,0.88)', district: '#8ea2bd', landmarkInk: '#a9c4e8', roadInk: '#8d9db3', lockInk: '#95a3b7',
      stFill: '#ffffff', stInter: '#0e1622', isoShadow: 'rgba(0,0,0,0.28)', roofOld: [[78, 90, 108], [70, 80, 98]], roofInd: [72, 82, 98],
      tree: [[52, 108, 82], [42, 92, 70]], trunk: '#3e4a44', elevCase: 'rgba(0,0,0,0.6)', lineCase: 'rgba(10,16,26,0.92)', pier: '#4a566a',
      lm2d: { fill: '#2c3646', stroke: '#7d93b4' }, edgeLine: 'rgba(160,185,220,0.10)',
      peak: { top: [44, 78, 84], base: [24, 36, 48], ridge: 'rgba(150,200,210,0.18)' },
      trk: { tunnelWater: 'rgba(80,150,225,0.5)', ballast: '#4a4740', sleeper: '#24221e', deck: '#3b4658', parapet: 'rgba(190,210,235,0.7)',
        wall: '#5a6474', pierFoot: 'rgba(150,195,240,0.4)', shadow: '#000000' },
    },
  };  let TH = THEMES.light, GROUND = TH.ground, PAL = TH.pal;

  function Renderer(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.w = 0; this.h = 0;
    this.cam = { cx: 30, cy: 40, zoom: 13, tz: 13, anchor: null, view: 0, t: 0, under: 0, tu: 0, fly: null };
    this.ground = new Map(); this.iso = new Map(); this.cachePx = 0;
    this.overview = null; this.overviewStale = true; this.overviewAt = 0;
    this.frame = 0; this.time = 0;
    this.layer = 'none'; this.layerOpt = { shareDt: 'wd', cong: 'now', flow: 'all', station: 'all', stView: 'flow', stDt: 'avg', cover: 'time', facP: 'all', facDt: 'wd', gapDt: 'wd', devK: 'pop', devB: 'era' };
    this.heat = null; this.heatKey = '';
    this.bFade = 0; this.roadVer = -1;
    this.labelsOn = true;
    this.M = [1, 0, 0, 1]; this.z = 13; this.ox = 0; this.oy = 0; this.hs = 0; this.det = 1;
    this.stats = { fps: 60, chunksDrawn: 0 };
    this.linkGrid = null; this.linkGridVer = -1;
    this.th = TH; this.themeName = 'light';
    this.mapLabelsOn = true; this.agentsOn = true;
    this.fx = [];
    this.detail = { tier: 0, ema: 8, busy: 0, calm: 0 };
    this.textWidths = new Map();
    this.roadLabelGeom = new WeakMap();
    this.segScreens = new WeakMap();
    this.segDecos = new WeakMap();
    this.heatLayers = new Map();
    this.geoPaths = new WeakMap();
  }
  CM.Renderer = Renderer;

  // ---------------- 地面块后台线程（v2.6 性能，见 tile-worker.js） ----------------
  // 地面块与总览图在独立线程绘制，主线程只贴图。线程按城市版本同步数据（只在真正要画新块时才同步，跳月期间没有开销）；
  // 线程不可用或出错时退回主线程的分帧绘制（groundChunkGen），画面结果相同
  const GEO_FILES = { gz: 1, hz: 1, hk: 1, tk: 1, tp: 1, pa: 1, wh: 1, sh: 1, bj: 1, ld: 1, sz: 1 };
  function TilePool(R) { this.R = R; this.list = null; this.off = false; this.pending = new Map(); this.ep = 0; this.sent = {}; this.geo = null; this.ovBusy = false; this.ovAt = -1e9; }
  TilePool.prototype.ready = function () {
    if (this.off) return false;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof Path2D === 'undefined' || typeof createImageBitmap === 'undefined') { this.off = true; return false; }
    if (this.list && this.geo === CM.GEO) return true;
    this.stop();
    try {
      const cores = navigator.hardwareConcurrency || 2, n = (navigator.deviceMemory <= 4 || matchMedia('(pointer:coarse)').matches) ? 1 : cores >= 8 ? 2 : 1, id = CM.mapId, mp = CM.curMap ? CM.curMap() : null;
      const data = { landmarks: D.landmarks, runways: D.runways, airport: D.airport, reclaim: (D.reclaim || []).map(function (r) { return { id: r.id, year: r.year, name: r.name }; }), hsrYear: D.hsrYear };
      const msg = { type: 'map', data: data, cfg: { W: CFG.W, H: CFG.H, START: CFG.START }, region: mp ? mp.region : null, geoId: id, geoFile: GEO_FILES[id] ? 'geo_' + id + '.js' : null, geo: GEO_FILES[id] ? null : CM.GEO };
      this.list = [];
      for (let i = 0; i < n; i++) {
        const w = new Worker('js/tile-worker.js'), slot = { w: w, n: 0 };
        w.onmessage = (e) => this.done(slot, e.data);
        w.onmessageerror = () => this.fail('工作线程消息无法解码');
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this.fail((e && e.message) || '工作线程出错'); };
        w.postMessage(msg);
        this.list.push(slot);
      }
      this.geo = CM.GEO; this.sent = {};
      return true;
    } catch (e) { this.fail(String(e && e.message || e)); return false; }
  };
  TilePool.prototype.stop = function () {
    if (this.list) for (const s of this.list) { try { s.w.terminate(); } catch (e) { /* 已结束 */ } }
    this.list = null; this.pending.clear(); this.ovBusy = false; this.ep++;
  };
  TilePool.prototype.fail = function (why) {
    if (this.off) return;
    this.off = true; this.stop();
    console.warn('地面块改为主线程绘制：' + why);
  };
  // 丢弃所有在途结果（换城市、换主题、切语言）
  TilePool.prototype.reset = function () { this.ep++; this.pending.clear(); this.ovBusy = false; };
  // 把变化的城市数据发给线程（一次发送，所有线程共用同一份内容）
  TilePool.prototype.sync = function () {
    const R = this.R, g = R.game, c = g.city, s = this.sent, msg = { type: 'state' };
    let any = false;
    if (s.city !== c) {
      msg.base = { W: c.W, H: c.H, N: c.N, FS: c.FS, FW: c.FW, FH: c.FH, BS: c.BS, BW: c.BW, BH: c.BH, uid: c.uid, region: c.region, scenicHost: c.scenicHost, airportBox: c.airportBox, regions: c.regions.map(function (r) { return { scenic: !!r.scenic, relief: r.relief }; }) };
      s.city = c; s.roads = null; s.geoVer = null; s.terrainVer = null; s.version = null; s.roadVersion = null; s.lk = null; s.facm = undefined; s.mt = undefined; s.viewKey = null; any = true;
    }
    if (s.roads !== c.roadGroups) {
      // 线程已解码同一份地理数据：道路只发序号与分组（复制全部折线要几百毫秒），新开局第一帧不再卡一下
      const byP = new Map(); CM.Geo.roads.forEach(function (rd, i) { byP.set(rd.p, i); });
      const nG = c.roadGroups.length, nW = c.roadWays.length, cls = new Uint8Array(nG), flags = new Uint8Array(nG), wayRoad = new Int32Array(nW), wayGroup = new Int32Array(nW), extra = [];
      for (let i = 0; i < nG; i++) { cls[i] = c.roadGroups[i].cls; flags[i] = c.roadGroups[i].flags; }
      for (let i = 0; i < nW; i++) { const w = c.roadWays[i], k = byP.get(w.p); wayGroup[i] = w.g; if (k !== undefined) wayRoad[i] = k; else { wayRoad[i] = -1 - extra.length; extra.push(w.p); } }
      msg.roads = { cls: cls, flags: flags, wayRoad: wayRoad, wayGroup: wayGroup, extra: extra };
      s.roads = c.roadGroups; any = true;
    }
    if (s.geoVer !== c.geoVer || s.terrainVer !== c.terrainVer) {
      msg.terrain = { wmask: c.wmask, bmask: c.bmask, landFrac: c.landFrac, wood: c.wood, terrainVer: c.terrainVer, terrainYear: c.terrainYear, reclaim: c.reclaimWater ? c.reclaimWater() : [] };
      s.geoVer = c.geoVer; s.terrainVer = c.terrainVer; any = true;
    }
    if (s.version !== c.version) {
      msg.cells = { version: c.version, lu: c.lu, street: c.street, taken: c.taken, bh: c.bh, pop: c.pop, jobs: c.jobs, urbanYear: c.urbanYear, protectedId: c.protectedId, landmarkOn: c.landmarkOn };
      s.version = c.version; any = true;
    }
    if (s.roadVersion !== c.roadVersion) { msg.built = c.roadsBuilt; s.roadVersion = c.roadVersion; any = true; }
    const LK = c.lockState();
    if (s.lk !== LK) { msg.lock = { mask: LK.mask, info: LK.info.map(function (f) { return { n: f.n, b: f.b }; }) }; s.lk = LK; any = true; }
    const fm = R._facm && R._facm.city === c ? R._facm : null;
    if (s.facm !== fm) {
      const pick = function (it) { return { lm: it.lm, x: it.x, y: it.y, fac: it.fac }; };
      msg.facm = fm ? { list: fm.list.map(pick), hubs: (fm.hubs || []).map(pick), airs: fm.airs.map(pick), cells: fm.cells, noTree: fm.noTree || new Set(), ver: fm.ver } : null;
      s.facm = fm; any = true;
    }
    if (s.mt !== R._mt) { msg.mt = R._mt ? { mask: R._mt.mask } : null; s.mt = R._mt; any = true; }
    const lightOn = CM.Settings.get('lighting') !== false;
    const viewKey = R.themeName + '|' + lightOn + '|' + R.styleYear + '|' + R.styleEpoch + '|' + g.clock.y + '|' + (g.clock.m || 1);
    if (s.viewKey !== viewKey) { msg.view = { theme: R.themeName, lightOn: lightOn, styleYear: R.styleYear, styleEpoch: R.styleEpoch, clock: { y: g.clock.y, m: g.clock.m, d: g.clock.d } }; s.viewKey = viewKey; any = true; }
    if (any) for (const sl of this.list) sl.w.postMessage(msg);
  };
  // 申请一块：线程都忙时返回 false（下一帧再试）
  TilePool.prototype.request = function (q) {
    if (this.pending.has(q.key)) return true;
    let best = null;
    for (const sl of this.list) if (sl.n < 2 && (!best || sl.n < best.n)) best = sl;
    if (!best) return false;
    try {
      this.sync();
      best.w.postMessage({ type: 'tile', key: q.key, lvl: q.lvl, ci: q.ci, cj: q.cj, ep: this.ep });
    } catch (e) { this.fail(String(e && e.message || e)); return false; }   // 数据发不过去（不能复制）：退回主线程绘制
    best.n++;
    this.pending.set(q.key, { stale: false });
    return true;
  };
  TilePool.prototype.requestOverview = function () {
    if (this.ovBusy) return;
    const sl = this.list[0];
    try {
      this.sync();
      sl.w.postMessage({ type: 'overview', ep: this.ep, version: this.R.game.city.version });
    } catch (e) { this.fail(String(e && e.message || e)); return; }
    this.ovBusy = true; sl.n++;
  };
  TilePool.prototype.done = function (slot, m) {
    if (m.type === 'fail') { this.fail(m.why); return; }
    slot.n = Math.max(0, slot.n - 1);
    const R = this.R;
    if (m.type === 'tile') {
      const p = this.pending.get(m.key);
      if (m.ep !== this.ep || !p) { m.bitmap.close(); return; }
      this.pending.delete(m.key);
      const old = R.ground.get(m.key);
      if (old) { R.cachePx -= old.px; freeTile(old); }
      const px = m.bitmap.width * m.bitmap.height;
      R.ground.set(m.key, { cv: m.bitmap, lvl: m.lvl, key: m.key, used: R.frame, px: px, stale: p.stale });
      R.cachePx += px;
    } else if (m.type === 'overview') {
      if (m.ep !== this.ep) { m.bitmap.close(); return; }
      this.ovBusy = false;
      const old = R.overview; R.overview = m.bitmap; R.overviewAt = performance.now(); this.ovAt = R.overviewAt;
      if (old && old.close) old.close();
      if (R.game && R.game.city.version === m.version) R.overviewStale = false;
    }
  };
  function freeTile(e) { if (e.cv.close) e.cv.close(); else e.cv.width = e.cv.height = 1; }


  Renderer.prototype.noteFrameTime = function (ms) { this.lastFrameMs = ms; };
  Renderer.prototype.cacheLimit = function () {
    const memory = Number(navigator.deviceMemory) || 8;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Math.min(CFG.perf.cacheMaxPx, memory <= 2 ? 8e6 : memory <= 4 || touch ? 12e6 : CFG.perf.cacheMaxPx);
  };
  Renderer.prototype.adaptDetail = function (dt) {
    const d = this.detail, elapsed = Math.min(0.1, dt || 1 / 60);
    // 地图块绘制时间不计入：它有自己的预算，补块时降低细节只会换来更多重绘
    const q = this.lastQueueMs || 0;
    const work = Math.max(0, (this.lastFrameMs == null ? (this.lastRenderMs || 0) : this.lastFrameMs) - q);
    const missedFrame = dt > 1 / 45 ? Math.max(0, dt * 1000 - q) : 0;
    const cost = Math.min(100, Math.max(work, missedFrame, this.cachePx > this.cacheLimit() ? 20 : 0));
    d.ema += (cost - d.ema) * 0.12;
    d.busy = d.ema > 18 ? d.busy + elapsed : Math.max(0, d.busy - elapsed * 2);
    d.calm = d.ema < 12 ? d.calm + elapsed : 0;
    if (d.busy > 0.35 && d.tier < 2) { d.tier++; d.busy = 0; d.calm = 0; }
    if (d.calm > 1.1 && d.tier > 0) { d.tier--; d.calm = 0; }
    // 画质档位（设置）：标准至少降一档、优先流畅；高质量最多降一档、优先画面；自动按负载调整
    const gfx = CM.Settings ? CM.Settings.get('gfx') : 'auto';
    if (gfx === 'standard' && d.tier < 1) d.tier = 1; else if (gfx === 'high' && d.tier > 1) d.tier = 1;
    this.stats.detailTier = d.tier;
  };
  Renderer.prototype.textWidth = function (ctx, text) {
    const key = ctx.font + '|' + text;
    let width = this.textWidths.get(key);
    if (width === undefined) {
      width = ctx.measureText(text).width;
      if (this.textWidths.size >= 4096) this.textWidths.delete(this.textWidths.keys().next().value);
      this.textWidths.set(key, width);
    } else { this.textWidths.delete(key); this.textWidths.set(key, width); }
    return width;
  };
  // 排版用的字宽：按字体分表，不拼键、不读写绘制画布的字体
  Renderer.prototype.textW = function (font, text) {
    let m = this.textWidths.get(font);
    if (!(m instanceof Map)) { m = new Map(); this.textWidths.set(font, m); }
    let w = m.get(text);
    if (w === undefined) {
      const x = this._mx || (this._mx = makeCanvas(1, 1).getContext('2d'));
      if (this._mxFont !== font) { x.font = font; this._mxFont = font; }
      w = x.measureText(text).width;
      if (m.size >= 8192) m.clear();
      m.set(text, w);
    }
    return w;
  };
  // 小图集（v2.6）：站名字形与车站符号画在几张 2048 px 的大图上，用行式分配；满了就清掉最早的一页。
  // 同一张大图上的贴图可以合批，也不用为每条标注建一个画布（以前站名超过约 750 条时每帧要重建上千个小画布）
  const ATLAS_SIZE = 2048;
  function Atlas(maxPages) { this.maxPages = maxPages; this.pages = []; this.cur = -1; }
  Atlas.prototype.alloc = function (w, h, e, owner, key) {
    w = Math.min(w, ATLAS_SIZE); h = Math.min(h, ATLAS_SIZE);
    let p = this.pages[this.cur];
    if (p) {
      if (p.x + w + 1 > ATLAS_SIZE) { p.x = 0; p.y += p.row + 1; p.row = 0; }
      if (p.y + h + 1 > ATLAS_SIZE) p = null;
    }
    if (!p) {
      if (this.pages.length < this.maxPages) {
        const cv = makeCanvas(ATLAS_SIZE, ATLAS_SIZE);
        p = { cv: cv, ctx: cv.getContext('2d'), x: 0, y: 0, row: 0, items: [] };
        this.pages.push(p); this.cur = this.pages.length - 1;
      } else {
        this.cur = (this.cur + 1) % this.maxPages; p = this.pages[this.cur];
        for (const it of p.items) { it[0].dead = true; it[1].delete(it[2]); }
        p.items.length = 0; p.x = p.y = p.row = 0;
        p.ctx.setTransform(1, 0, 0, 1, 0, 0); p.ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
      }
    }
    e.cv = p.cv; e.sx = p.x; e.sy = p.y; e.sw = w; e.sh = h;
    p.items.push([e, owner, key]);
    p.x += w + 1; if (h > p.row) p.row = h;
    return p.ctx;
  };
  Atlas.prototype.dispose = function () { for (const p of this.pages) { for (const it of p.items) it[0].dead = true; p.cv.width = p.cv.height = 1; } this.pages = []; this.cur = -1; };
  // 排版开始：字形环境变化（密度、主题描边、字体加载、语言）时清空图集；budget 为本次最多新画的字形数，用完的下次排版再补
  Renderer.prototype.labelsBegin = function (budget) {
    const sig = this.dpr + '|' + TH.halo + '|' + (document.fonts ? document.fonts.status : '') + '|' + (CM.I18n ? CM.I18n.get() : '');
    let S = this._lbl;
    if (!S || S.sig !== sig) { if (S) S.atlas.dispose(); S = this._lbl = { sig: sig, atlas: new Atlas(4), fonts: new Map(), budget: 0 }; }
    S.budget = budget;
  };
  // 相机移动时只重排标注，字形与描边按原生像素密度复用；返回图集中的位置（本次排版的预算用完时返回 null）
  Renderer.prototype.labelSprite = function (text, font, fill) {
    const S = this._lbl;
    let F = S.fonts.get(font); if (!F) { F = new Map(); S.fonts.set(font, F); }
    let m = F.get(fill); if (!m) { m = new Map(); F.set(fill, m); }
    let e = m.get(text);
    if (e) return e;
    if (S.budget <= 0) return null;
    S.budget--;
    const dpr = this.dpr, mx = this._mx || (this._mx = makeCanvas(1, 1).getContext('2d'));
    mx.font = font; this._mxFont = font; mx.textAlign = 'left'; mx.textBaseline = 'middle';
    const q = mx.measureText(text), left = Math.floor(Math.min(0, -q.actualBoundingBoxLeft) - 3), right = Math.ceil(Math.max(q.width, q.actualBoundingBoxRight) + 3),
      top = Math.floor(-q.actualBoundingBoxAscent - 3), bottom = Math.ceil(q.actualBoundingBoxDescent + 3);
    e = { cv: null, sx: 0, sy: 0, sw: 0, sh: 0, left: left, top: top, width: q.width, dead: false };
    const x = S.atlas.alloc(Math.max(1, Math.ceil((right - left) * dpr)), Math.max(1, Math.ceil((bottom - top) * dpr)), e, m, text);
    x.setTransform(dpr, 0, 0, dpr, e.sx - left * dpr, e.sy - top * dpr);
    x.font = font; x.textAlign = 'left'; x.textBaseline = 'middle'; x.lineWidth = 3.2; x.lineJoin = 'round';
    x.strokeStyle = TH.halo; x.strokeText(text, 0, 0); x.fillStyle = fill; x.fillText(text, 0, 0);
    m.set(text, e);
    return e;
  };
  Renderer.prototype.featurePath = function (feature, polygon) {
    let p = this.geoPaths.get(feature);
    if (!p) { p = new Path2D(); if (polygon) CM.Geo.tracePoly(p, feature); else CM.Geo.traceLine(p, feature.p); this.geoPaths.set(feature, p); }
    return p;
  };
  // 水岸描边用的路径（v2.2）：跳过数据按范围裁剪留下的直边（较长且正好水平或竖直的线段），
  // 地图扩展接缝两侧的水面与陆地上不再出现一条笔直的岸线
  Renderer.prototype.bankPath = function (feature) {
    const cache = this._bankPaths || (this._bankPaths = new WeakMap());
    let p = cache.get(feature); if (p) return p;
    p = new Path2D();
    for (const r of feature.rings) {
      const q = r.p, n = q.length / 2; let pen = false;
      for (let k = 0; k <= n; k++) {
        const i = k % n, x = q[2 * i], y = q[2 * i + 1];
        if (k > 0) { const px = q[2 * ((k - 1) % n)], py = q[2 * ((k - 1) % n) + 1]; if ((x === px && (Math.abs(y - py) > 0.3 || x === Math.round(x))) || (y === py && (Math.abs(x - px) > 0.3 || y === Math.round(y)))) { p.moveTo(x, y); pen = true; continue; } }   // 裁切边：较长的轴向线段，或落在整格线上的轴向线段（地图扩展的拼接处）
        if (pen) p.lineTo(x, y); else { p.moveTo(x, y); pen = true; }
      }
    }
    cache.set(feature, p); return p;
  };
  Renderer.prototype.clearImages = function () {
    this.cancelIsoJob(); this.cancelGroundJob();
    for (const cache of [this.ground, this.iso]) { for (const e of cache.values()) freeTile(e); cache.clear(); }
    this.cachePx = 0;
    if (this.tiles) this.tiles.reset();
  };
  Renderer.prototype.cancelIsoJob = function () {
    const job = this.isoJob;
    if (job) { if (job.cv) job.cv.width = job.cv.height = 1; job.gen.return(); this.isoJob = null; }
  };
  Renderer.prototype.cancelGroundJob = function () {
    const job = this.groundJob;
    if (job) { job.gen.return(); if (job.cv) job.cv.width = job.cv.height = 1; this.groundJob = null; }
  };
  // Hold the displayed raster level until the replacement viewport is ready. Buildings at
  // different levels use different chunk grids, so switching immediately would hide them.
  Renderer.prototype.rasterLevel = function (eff, bounds, queue, buildings) {
    const need = eff * 0.85;
    let target = 0;
    if (eff > 5) { target = 64; for (const level of LEVELS) if (level >= need) { target = level; break; } }
    const previous = this.requestedLevel;
    if (previous && target && this.requestedTier === this.detail.tier) {
      if (target > previous && need <= previous * 1.12) target = previous;
      else if (target < previous && need >= previous / 2 * 0.88) target = previous;
    }
    this.requestedTier = this.detail.tier;
    this.requestedLevel = target;
    if (this.displayedLevel == null || !target) this.displayedLevel = target;
    this.stats.targetLevel = target;
    this.stats.lodPreparing = false;
    if (target === this.displayedLevel) { this.stats.rasterLevel = target; return target; }
    let ready = true;
    const C = CHUNK_PX / target;
    const ci0 = Math.max(0, Math.floor(bounds.x0 / C)), ci1 = Math.min(Math.ceil(CFG.W / C) - 1, Math.floor(bounds.x1 / C));
    const cj0 = Math.max(0, Math.floor(bounds.y0 / C)), cj1 = Math.min(Math.ceil(CFG.H / C) - 1, Math.floor(bounds.y1 / C));
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      if (!this.groundVisible(ci * C, cj * C, C)) continue;
      const key = target + ':' + ci + ':' + cj, e = this.ground.get(key);
      if (e) e.used = this.frame; // Protect completed staging tiles until the atomic handover.
      if (!e || e.stale) {
        ready = false;
        queue.push({ kind: 'g', key: key, lvl: target, ci: ci, cj: cj, d: Math.abs((ci + 0.5) * C - this.cam.cx) + Math.abs((cj + 0.5) * C - this.cam.cy) - 1 });
      }
    }
    const staged = [];
    if (buildings) {
      const size = this.isoChunkGeom(target);
      const x0 = Math.max(0, Math.floor(bounds.x0 / size) - 1), x1 = Math.min(Math.ceil(CFG.W / size) - 1, Math.floor(bounds.x1 / size) + 1);
      const y0 = Math.max(0, Math.floor(bounds.y0 / size) - 1), y1 = Math.min(Math.ceil(CFG.H / size) - 1, Math.floor(bounds.y1 / size) + 1);
      for (let cj = y0; cj <= y1; cj++) for (let ci = x0; ci <= x1; ci++) {
        const key = 'i' + target + ':' + ci + ':' + cj, e = this.iso.get(key);
        if (!this.isoVisible(e, target, ci, cj, size)) continue;
        if (e) { e.used = this.frame; staged.push(e); }
        if (!e || e.stale) {
          ready = false;
          queue.push({ kind: 'i', key: key, lvl: target, ci: ci, cj: cj, C: size, d: Math.abs((ci + 0.5) * size - this.cam.cx) + Math.abs((cj + 0.5) * size - this.cam.cy) - 1.5 });
        }
      }
    }
    if (ready) {
      this.displayedLevel = target;
      for (const e of staged) e.born = this.time - 1;
    } else this.stats.lodPreparing = true;
    this.stats.rasterLevel = this.displayedLevel;
    return this.displayedLevel;
  };
  // 空闲预绘（v2.1）：画面内的块都已就绪时，预先绘制下一档更清晰的级别（覆盖视野中部，放大时直接切换）、
  // 当前级别的视野外一圈（平移）与更粗一档（缩小），让缩放与移动时不再先看到模糊的低分辨率块。
  // 已在缓存中的目标块标为最近使用，避免被淘汰后又重绘
  Renderer.prototype.prefetch = function (queue, lvl, b, buildings) {
    if (!lvl) return;
    const k = LEVELS.indexOf(lvl), cam = this.cam, vw = b.x1 - b.x0, vh = b.y1 - b.y0, keep = this.frame - 1, cap = this.cacheLimit();
    const plan = [], todo = [];
    if (k + 1 < LEVELS.length) plan.push([LEVELS[k + 1], -0.2, 100]);   // 视野中部约 1/3 面积（放大一档后的画面）
    plan.push([lvl, 0.3, 200]);
    if (k > 0) plan.push([LEVELS[k - 1], 0.8, 300]);
    for (const p of plan) {
      const L = p[0], x0 = b.x0 - vw * p[1], x1 = b.x1 + vw * p[1], y0 = b.y0 - vh * p[1], y1 = b.y1 + vh * p[1];
      const C = CHUNK_PX / L;
      for (let cj = Math.max(0, Math.floor(y0 / C)); cj <= Math.min(Math.ceil(CFG.H / C) - 1, Math.floor(y1 / C)); cj++) {
        for (let ci = Math.max(0, Math.floor(x0 / C)); ci <= Math.min(Math.ceil(CFG.W / C) - 1, Math.floor(x1 / C)); ci++) {
          const key = L + ':' + ci + ':' + cj, e = this.ground.get(key);
          if (e) e.used = Math.max(e.used, keep);
          if (!e || e.stale) todo.push({ kind: 'g', key: key, lvl: L, ci: ci, cj: cj, d: p[2] + Math.abs((ci + 0.5) * C - cam.cx) + Math.abs((cj + 0.5) * C - cam.cy) });
        }
      }
      if (!buildings) continue;
      const S = this.isoChunkGeom(L);
      for (let cj = Math.max(0, Math.floor(y0 / S) - 1); cj <= Math.min(Math.ceil(CFG.H / S) - 1, Math.floor(y1 / S) + 1); cj++) {
        for (let ci = Math.max(0, Math.floor(x0 / S) - 1); ci <= Math.min(Math.ceil(CFG.W / S) - 1, Math.floor(x1 / S) + 1); ci++) {
          const key = 'i' + L + ':' + ci + ':' + cj, e = this.iso.get(key);
          if (e) e.used = Math.max(e.used, keep);
          if (!e || e.stale) todo.push({ kind: 'i', key: key, lvl: L, ci: ci, cj: cj, C: S, d: p[2] + 0.5 + Math.abs((ci + 0.5) * S - cam.cx) + Math.abs((cj + 0.5) * S - cam.cy) });
        }
      }
    }
    if (!todo.length) return;
    // 缓存偏满：先淘汰既不在画面内、也不是这次预绘目标的旧块，腾出空间后再预绘（移动到新区域后仍能继续）
    if (this.cachePx > cap * 0.75) this.evict(cap * 0.6, keep);
    if (this.cachePx > cap * 0.75) return;
    for (const q of todo) queue.push(q);
  };
  // 主题切换等需要「一次画清」时：在 ms 毫秒内放宽每帧的绘制预算，画面内的块补齐即结束
  Renderer.prototype.warm = function (ms) { this.warmUntil = performance.now() + (ms || 1500); };
  Renderer.prototype.sharpReady = function () { return this.frame > 0 && this.stats.pendingVisible === 0; };
  Renderer.prototype.isoVisible = function (e, level, ci, cj, size) {
    const a = this.P(ci * size, cj * size, 0), sc = this.z / level, pad = 2.8 * this.z;
    return e && !e.empty ? this.screenVisible(a.x - e.ax * sc, a.y - e.ay * sc, e.cv.width * sc, e.cv.height * sc, 2)
      : this.screenVisible(a.x - size * ISO[0] * this.z - pad, a.y - MAX_H * HSF * this.z - pad, 2 * size * ISO[0] * this.z + 2 * pad, (2 * size * ISO[2] + MAX_H * HSF) * this.z + 2 * pad, 2);
  };
  Renderer.prototype.screenVisible = function (x, y, w, h, pad) {
    pad = pad || 0;
    return x + w >= -pad && y + h >= -pad && x <= this.w + pad && y <= this.h + pad;
  };
  Renderer.prototype.groundVisible = function (x, y, size) {
    const M = this.M, z = this.z, ax = this.ox + (M[0] * x + M[1] * y) * z, ay = this.oy + (M[2] * x + M[3] * y) * z;
    const dx = M[0] * size * z, ex = M[1] * size * z, dy = M[2] * size * z, ey = M[3] * size * z;
    return this.screenVisible(ax + Math.min(0, dx) + Math.min(0, ex), ay + Math.min(0, dy) + Math.min(0, ey), Math.abs(dx) + Math.abs(ex), Math.abs(dy) + Math.abs(ey), 3);
  };

  // ---------------- 氛围：边缘雾化与 2.5D 远处薄雾（按画面尺寸与主题缓存为一张图，每帧只贴图一次） ----------------
  Renderer.prototype.drawAtmosphere = function (ctx) {
    const W = this.w, H = this.h, t = Math.round(this.tEase * 10) / 10;
    const key = W + 'x' + H + ':' + this.themeName + ':' + t;
    if (this._atmoKey !== key) {
      const cv = this._atmo || (this._atmo = makeCanvas(1, 1));
      cv.width = Math.max(1, Math.round(W)); cv.height = Math.max(1, Math.round(H));
      const g = cv.getContext('2d'), fog = TH.fog || TH.bg;
      g.clearRect(0, 0, cv.width, cv.height);
      if (t > 0.05) {
        const lg = g.createLinearGradient(0, 0, 0, H * 0.4);
        lg.addColorStop(0, U.rgb(fog, 0.6 * t)); lg.addColorStop(1, U.rgb(fog, 0));
        g.fillStyle = lg; g.fillRect(0, 0, W, H * 0.4);
      }
      const R = Math.hypot(W, H) / 2, rg = g.createRadialGradient(W / 2, H / 2, R * 0.62, W / 2, H / 2, R * 1.04);
      rg.addColorStop(0, U.rgb(fog, 0)); rg.addColorStop(1, U.rgb(fog, TH.night ? 0.7 : 0.78));
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      this._atmoKey = key;
    }
    ctx.drawImage(this._atmo, 0, 0, W, H);
  };

  // ---------------- 反馈特效（建站涟漪、建成绽放、轨道描绘、拆除烟尘、区域开放） ----------------
  const FX_DUR = { ripple: 0.9, burst: 1.5, dust: 1.1, trace: 1.3, region: 2.6 };
  Renderer.prototype.addFx = function (kind, x, y, o) {
    if (this.game && this.game.preview) return;
    o = o || {};
    this.fx.push({ kind: kind, x: x, y: y, o: o, t: -(o.delay || 0), dur: o.dur || FX_DUR[kind] || 1, seed: Math.random() * 1000 });
    if (this.fx.length > 160) this.fx.shift();
  };
  Renderer.prototype.fxRing = function (ctx, x, y, rw, h) {
    const tmp = {};
    ctx.beginPath();
    for (let a = 0; a <= 24; a++) { const t = a / 24 * Math.PI * 2; this.P(x + Math.cos(t) * rw, y + Math.sin(t) * rw, h || 0, tmp); if (a) ctx.lineTo(tmp.x, tmp.y); else ctx.moveTo(tmp.x, tmp.y); }
  };
  Renderer.prototype.drawFx = function (ctx, dt) {
    if (!this.fx.length) return;
    const z = this.z, tmp = {};
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.dur) { this.fx.splice(i, 1); continue; }
      if (f.t < 0) continue;
      const k = f.t / f.dur, e = 1 - Math.pow(1 - k, 3);
      const col = f.o.color || '#2f6fb6', fh = f.o.type ? this.trackH(f.o.type) : 0;   // 建设特效画在线路 / 车站本身的高度上（v2.3，与 2D 一致地贴着对象）
      switch (f.kind) {
        case 'ripple': {
          for (let r = 0; r < 2; r++) {
            const kk = U.clamp(k * 1.3 - r * 0.3, 0, 1); if (kk <= 0 || kk >= 1) continue;
            ctx.globalAlpha = (1 - kk) * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 3.2 * (1 - kk) + 0.8;
            this.fxRing(ctx, f.x, f.y, (6 + (1 - Math.pow(1 - kk, 3)) * 34) / z, fh); ctx.stroke();
          }
          break;
        }
        case 'burst': {
          const p = this.P(f.x, f.y, fh, tmp), px = p.x, py = p.y;
          ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - k) + 1;
          this.fxRing(ctx, f.x, f.y, (8 + e * 46) / z, fh); ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.35; ctx.fillStyle = col; this.fxRing(ctx, f.x, f.y, (6 + e * 18) / z, fh); ctx.fill();
          // 光柱与粒子
          if (k < 0.6) { const a = 1 - k / 0.6; const g = ctx.createLinearGradient(px, py, px, py - 70); g.addColorStop(0, 'rgba(255,255,255,' + (0.75 * a) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(px - 3, py - 70 * e, 6, 70 * e); }
          for (let q = 0; q < 12; q++) {
            const ang = (q / 12) * Math.PI * 2 + f.seed, d = 10 + e * (28 + 14 * Math.sin(f.seed + q * 3));
            const x = px + Math.cos(ang) * d, y = py + Math.sin(ang) * d * 0.7 - e * 22 + k * k * 30;
            ctx.globalAlpha = (1 - k); ctx.fillStyle = q % 3 === 0 ? '#ffffff' : col;
            ctx.beginPath(); ctx.arc(x, y, 2.6 * (1 - k) + 0.8, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'dust': {
          const p = this.P(f.x, f.y, 0, tmp), sc = f.o.small ? 0.6 : 1;
          for (let q = 0; q < 7; q++) {
            const ang = (q / 7) * Math.PI * 2 + f.seed, d = e * 22 * sc;
            ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = this.th.night ? '#8b93a1' : '#a89f92';
            ctx.beginPath(); ctx.arc(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.6 - e * 14 * sc, (5 + e * 9) * sc, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'trace': {
          const pts = f.o.pts; if (!pts || pts.length < 2) break;
          const n = Math.max(2, Math.ceil(pts.length * Math.min(1, e * 1.4)));
          ctx.beginPath();
          for (let q = 0; q < n; q++) { this.P(pts[q][0], pts[q][1], fh, tmp); if (q) ctx.lineTo(tmp.x, tmp.y); else ctx.moveTo(tmp.x, tmp.y); }
          const fade = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
          ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = this.lineWidthPx() + 9; ctx.stroke();
          ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = col; ctx.lineWidth = this.lineWidthPx() + 3; ctx.stroke();
          const hd = pts[n - 1]; this.P(hd[0], hd[1], fh, tmp);
          ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(tmp.x, tmp.y, 5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'region': {
          const p = this.P(f.x, f.y, 0, tmp);
          ctx.globalAlpha = (1 - k) * 0.5; ctx.strokeStyle = '#2fd1bf'; ctx.lineWidth = 6 * (1 - k) + 2;
          this.fxRing(ctx, f.x, f.y, (30 + e * 160) / z); ctx.stroke();
          const a = k < 0.15 ? k / 0.15 : (k > 0.75 ? (1 - k) / 0.25 : 1);
          ctx.globalAlpha = a; ctx.font = '700 15px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4; ctx.strokeStyle = this.th.halo; ctx.fillStyle = this.th.night ? '#7ff0e2' : '#0d8a7e';
          const txt = '新区域开放 · ' + String(f.o.name || '').replace(/（.*）/, '');
          ctx.strokeText(txt, p.x, p.y - 8 * e); ctx.fillText(txt, p.x, p.y - 8 * e);
          break;
        }
      }
    }
    ctx.restore();
  };

  Renderer.prototype.setGame = function (g) {
    this.game = g;
    this._facS = null;   // 设施图层的显示缓存属于上一座城市：不清掉时上一城的设施会画在新城市的地图上
    this._sitePlans=new WeakMap();this._siteStamp=null;
    this.displayedLevel = this.requestedLevel = null;
    this.clearImages(); this.dropThemeStash(); if (this.overview && this.overview.close) this.overview.close(); this.overview = null; this.overviewJob = null; this.overviewStale = true; this.heat = null; this.heatKey = '';
    if (g && typeof document !== 'undefined' && !this.tiles) this.tiles = new TilePool(this);
    this.heatLayers.clear(); this.segScreens = new WeakMap(); this.segDecos = new WeakMap(); this.metroOrder = null;
    this.roadLabelGeom = new WeakMap(); this.textWidths.clear(); this._cgBmp = null;
    this.geoPaths = new WeakMap();
    this.labelImage = null;
    if (this._lbl) { this._lbl.atlas.dispose(); this._lbl = null; }
    if (this._stAtlas) { this._stAtlas.atlas.dispose(); this._stAtlas = null; }
    if (this._mLayer) { this._mLayer.cv.width = this._mLayer.cv.height = 1; this._mLayer = null; }
    this._lmc = null; this._lmcCity = null;
    this.lastFrameMs = null; this.detail = { tier: 0, ema: 8, busy: 0, calm: 0 };
    this.roadVer = g ? g.city.roadVersion : -1;
    // 换城市（含换地图）时清掉按城市版本号缓存的数据，避免不同城市的版本号恰好相同
    this.linkGrid = null; this.linkGridVer = -1; this._cgIdx = null; this._cgRuns = null; this._fa = null; this._fl = null; this._flKey = null;
    this._todL = null; this._smC = null;
    this._flLay = null; this._flLayKey = null; this._flShow = null; this._sf = null; this._sfKey = null; this._rm = {}; this.hl = null; this.follow = null;
    this._rk = null; this.styleEpoch = g ? Math.floor(g.clock.y / 5) : null; this.styleYear = g ? this.styleEpoch * 5 : null;
  };
  // 切换主题：重建地面与建筑缓存（总览图立即重绘，避免空白）
  // 画面内的块按主题暂存，只留一套；与当前主题共用内存预算。
  Renderer.prototype.themeSig = function () {
    const g = this.game;
    return g ? [g, g.city.version, g.city.roadVersion, this.styleEpoch, this.w, this.h, this.dpr, this.detail.tier] : null;
  };
  Renderer.prototype.dropThemeStash = function () {
    const st = this.themeStash; this.themeStash = null;
    if (st) for (const cache of [st.ground, st.iso]) for (const e of cache.values()) freeTile(e);
  };
  Renderer.prototype.applyTheme = function (name) { TH = THEMES[name] || THEMES.light; GROUND = TH.ground; PAL = TH.pal; this.th = TH; this.themeName = name; };
  Renderer.prototype.setTheme = function (name) {
    const prev = this.themeName, sig = this.themeSig();
    const same = function (a, b) { return a && b && a.length === b.length && a.every(function (v, i) { return v === b[i]; }); };
    this.cancelIsoJob(); this.cancelGroundJob();
    const stash = { name: prev, sig: sig, ground: new Map(), iso: new Map(), px: 0 }, keep = this.frame;   // 只留上一帧画到的块（不含预绘）
    for (const pair of [[this.ground, stash.ground], [this.iso, stash.iso]]) {
      for (const [k, e] of pair[0]) {
        if (sig && e.used >= keep && !e.stale && stash.px + e.px <= this.cacheLimit() * 0.45) { pair[1].set(k, e); stash.px += e.px; } else freeTile(e);
      }
      pair[0].clear();
    }
    this.cachePx = 0;
    const back = this.themeStash; this.themeStash = null;
    if (back && back.name === name && same(back.sig, sig)) { this.ground = back.ground; this.iso = back.iso; this.cachePx = back.px; }
    else if (back) { this.themeStash = back; this.dropThemeStash(); }
    this.themeStash = stash.px ? stash : null;
    this.applyTheme(name);
    if (this.tiles) this.tiles.reset();
    this.displayedLevel = this.requestedLevel = null;
    this.heatKey = ''; this._cgBmp = null;
    if (this.game) this.renderOverview(); else this.overviewStale = true;
  };
  Renderer.prototype.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.dropThemeStash();
    this.dpr = dpr; this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
  };

  // ---------------- 相机 ----------------
  Renderer.prototype.computeTransform = function () {
    const c = this.cam, t = U.easeInOut(c.t);
    const m00 = U.lerp(1, ISO[0], t), m01 = U.lerp(0, ISO[1], t), m10 = U.lerp(0, ISO[2], t), m11 = U.lerp(1, ISO[3], t);
    this.M = [m00, m01, m10, m11]; this.z = c.zoom;
    this.det = m00 * m11 - m01 * m10;
    this.ox = this.w / 2 - (m00 * c.cx + m01 * c.cy) * c.zoom;
    this.oy = this.h / 2 - (m10 * c.cx + m11 * c.cy) * c.zoom;
    this.hs = c.zoom * HSF * t;
    this.tEase = t;
  };
  Renderer.prototype.P = function (x, y, h, out) {
    const M = this.M, z = this.z;
    out = out || {};
    out.x = this.ox + (M[0] * x + M[1] * y) * z;
    out.y = this.oy + (M[2] * x + M[3] * y) * z - (h || 0) * this.hs;
    return out;
  };
  Renderer.prototype.unproject = function (sx, sy, h) {
    const M = this.M, a = (sx - this.ox) / this.z, b = (sy + (h || 0) * this.hs - this.oy) / this.z;
    return { x: (M[3] * a - M[1] * b) / this.det, y: (-M[2] * a + M[0] * b) / this.det };
  };
  Renderer.prototype.screenToWorldDelta = function (dx, dy) {
    const M = this.M, a = dx / this.z, b = dy / this.z;
    return { x: (M[3] * a - M[1] * b) / this.det, y: (-M[2] * a + M[0] * b) / this.det };
  };
  Renderer.prototype.panBy = function (dx, dy) {
    const d = this.screenToWorldDelta(dx, dy);
    this.cam.cx -= d.x; this.cam.cy -= d.y; this.cam.fly = null; this.clampCam(); this.computeTransform();
  };
  Renderer.prototype.zoomAt = function (sx, sy, factor) {
    const c = this.cam;
    c.tz = U.clamp(c.tz * factor, 5, 96);
    const w = this.unproject(sx, sy);
    c.anchor = { sx: sx, sy: sy, wx: w.x, wy: w.y };
    c.fly = null;
  };
  Renderer.prototype.flyTo = function (x, y, zoom) {
    const c = this.cam;
    c.fly = { fx: c.cx, fy: c.cy, fz: c.zoom, tx: x, ty: y, tzm: zoom || Math.max(c.zoom, 20), t: 0 };
    c.anchor = null;
  };
  Renderer.prototype.setView = function (iso) { this.cam.view = iso ? 1 : 0; };
  Renderer.prototype.setUnder = function (on) { this.cam.tu = on ? 1 : 0; };
  Renderer.prototype.clampCam = function () {
    const c = this.cam;
    c.cx = U.clamp(c.cx, -2, CFG.W + 2); c.cy = U.clamp(c.cy, -2, CFG.H + 2);
  };
  Renderer.prototype.updateCamera = function (dt) {
    const c = this.cam;
    if (c.fly) {
      const f = c.fly; f.t = Math.min(1, f.t + dt / (f.duration || 0.65));
      const e = U.easeInOut(f.t);
      c.cx = U.lerp(f.fx, f.tx, e); c.cy = U.lerp(f.fy, f.ty, e);
      c.zoom = Math.exp(U.lerp(Math.log(f.fz), Math.log(f.tzm), e)); c.tz = c.zoom;
      if (f.t >= 1) c.fly = null;
    } else if (Math.abs(c.zoom - c.tz) > 1e-3) {
      const k = 1 - Math.exp(-dt * 14);
      c.zoom = Math.exp(U.lerp(Math.log(c.zoom), Math.log(c.tz), k));
      if (Math.abs(c.zoom - c.tz) / c.tz < 0.002) c.zoom = c.tz;
      if (c.anchor) {
        this.computeTransform();
        const M = this.M, a = (c.anchor.sx - this.w / 2) / c.zoom, b = (c.anchor.sy - this.h / 2) / c.zoom;
        const dx = (M[3] * a - M[1] * b) / this.det, dy = (-M[2] * a + M[0] * b) / this.det;
        c.cx = c.anchor.wx - dx; c.cy = c.anchor.wy - dy;
      }
    }
    const tv = c.view;
    if (c.t !== tv) { const sp = dt / 0.5; c.t = tv > c.t ? Math.min(tv, c.t + sp) : Math.max(tv, c.t - sp); }
    if (c.under !== c.tu) { const sp = dt / 0.35; c.under = c.tu > c.under ? Math.min(c.tu, c.under + sp) : Math.max(c.tu, c.under - sp); }
    this.clampCam();
    this.computeTransform();
  };

  Renderer.prototype.markDirty = function () {
    const city = this.game.city;
    // 城市风貌按 5 年一档：跨档时把地面与建筑分块标为过期（旧图块继续显示，后台逐块重绘，不出现空白）
    const ep = Math.floor(this.game.clock.y / 5);
    const pend = this.tiles ? this.tiles.pending : null;
    if (this.styleEpoch !== ep) {
      this.styleEpoch = ep; this.styleYear = ep * 5;
      this.ground.forEach(function (e) { e.stale = true; });
      this.iso.forEach(function (e, k) { if (k.charAt(0) !== 'L') e.stale = true; });
      if (pend) pend.forEach(function (p) { p.stale = true; });
    }
    if (city.roadVersion !== this.roadVer) {
      this.roadVer = city.roadVersion;
      this.ground.forEach(function (e) { e.stale = true; });
      if (pend) pend.forEach(function (p) { p.stale = true; });
      this.overviewStale = true;
    }
    this.syncMetroMask();
    if (!city.dirty.size) return;
    this.cancelIsoJob();
    const keys = new Set(), ikeys = new Set(), self = this;
    city.dirty.forEach(function (c) {
      const i = c % city.W, j = (c / city.W) | 0;
      for (const lvl of LEVELS) {
        const C = CHUNK_PX / lvl, Ci = self.isoChunkGeom(lvl);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          keys.add(lvl + ':' + Math.floor((i + di * 0.6) / C) + ':' + Math.floor((j + dj * 0.6) / C));
        }
        ikeys.add('i' + lvl + ':' + Math.floor(i / Ci) + ':' + Math.floor(j / Ci));
      }
    });
    city.dirty.clear();
    const g = this.ground, iso = this.iso;
    keys.forEach(function (k) { const a = g.get(k); if (a) a.stale = true; });
    ikeys.forEach(function (k) { const b = iso.get(k); if (b) b.stale = true; });
    this.overviewStale = true;
    this.heatKey = '';
  };
  // to：淘汰到的像素数；keep：used 不小于它的块保留（默认只保留本帧用到的）
  Renderer.prototype.evict = function (to, keep) {
    const cap = this.cacheLimit();
    if (this.themeStash && this.cachePx + this.themeStash.px > cap) this.dropThemeStash();
    if (to == null) { if (this.cachePx <= cap) return; to = cap * 0.8; }
    if (keep == null) keep = this.frame;
    const all = [];
    this.ground.forEach(function (e, k) { all.push([e, k, 'g']); });
    this.iso.forEach(function (e, k) { all.push([e, k, 'i']); });
    all.sort(function (a, b) { return a[0].used - b[0].used; });
    for (const it of all) {
      if (this.cachePx <= to) break;
      if (it[0].used >= keep) continue;
      (it[2] === 'g' ? this.ground : this.iso).delete(it[1]);
      this.cachePx -= it[0].px;
      freeTile(it[0]);
    }
  };
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);   // 主线程与 Worker 共用相同的缓存绘图后端
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  // ---------------- 地面绘制（世界坐标） ----------------
  // 单格建筑（单位坐标 u,v ∈ [0,1]，高度为米）：在 4×4 子地块上稀疏布置，避开真实道路、铁路与水面。
  // 风格上以少量玻璃塔楼与低层体量为主；coarse=true（远景）时只保留较高的建筑。
  Renderer.prototype.cellBuildings = function (c, coarse) {
    const city = this.game.city, L = city.lu[c];
    const landmark = city.protectedId[c] - 1;
    if (landmark >= 0 && city.landmarkOn[landmark] && D.landmarks[landmark].kind === 'campus') return null;
    if (!city.street[c] && L !== LU.RURAL) return null;
    const h0 = city.bh[c];
    if (h0 <= 0) return null;
    const lf = city.landFrac[c] * (1 - city.taken[c]);
    if (lf < 0.15) return null;
    if (L === LU.RURAL && city.pop[c] < 12) return null;
    if (L !== LU.RURAL && L !== LU.RES && L !== LU.MIX && L !== LU.COM && L !== LU.IND && L !== LU.INST) return null;
    if (coarse && h0 < 22) return null;
    const hs = function (k) { return U.hash2(c, k, 91); };
    const W = city.W, i = c % W, j = (c / W) | 0, BS = city.BS, BW = city.BW, bm = city.bmask;
    const free = this._free || (this._free = new Uint8Array(16));
    let nFree = 0;
    for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
      let maj = 0, mn = 0;
      for (let y = 0; y < 2; y++) { const row = (j * BS + v * 2 + y) * BW + i * BS + u * 2; for (let x = 0; x < 2; x++) { const m = bm[row + x]; if (m >= 2) maj++; else if (m === 1) mn++; } }
      const f = maj === 0 && mn <= 1 ? 1 : 0;
      free[v * 4 + u] = f; nFree += f;
    }
    if (!nFree) return null;
    const quadFree = function (qu, qv) { return free[qv * 8 + qu * 2] && free[qv * 8 + qu * 2 + 1] && free[qv * 8 + 4 + qu * 2] && free[qv * 8 + 4 + qu * 2 + 1]; };
    const out = [];
    const sub = function (u, v, size, h) { const cx = u * 0.25 + 0.125, cy = v * 0.25 + 0.125, r = size / 2; out.push([cx - r, cy - r, cx + r, cy + r, h, L]); };
    const quad = function (qu, qv, size, h) { const cx = qu * 0.5 + 0.25, cy = qv * 0.5 + 0.25, r = size / 2; out.push([cx - r, cy - r, cx + r, cy + r, h, L]); };
    const dens = U.clamp((city.pop[c] + city.jobs[c]) / 3000, 0.2, 1);
    // 随机挑选可用子地块
    const pickSubs = function (n, seed) { const got = []; for (let k = 0; k < 16 && got.length < n; k++) { const s2 = (k * 7 + Math.floor(hs(seed) * 16)) % 16; if (free[s2] && got.indexOf(s2) < 0) got.push(s2); } return got; };
    switch (L) {
      case LU.RURAL: {
        if (hs(2) < 0.45) for (const s2 of pickSubs(1, 3)) sub(s2 & 3, s2 >> 2, 0.14, 4 + hs(11) * 4);
        break;
      }
      case LU.RES: case LU.MIX: {
        if (h0 > 40) {
          // 高层住宅：1–2 座点式塔楼
          let n = 0;
          for (let q = 0; q < 4 && n < (dens > 0.6 ? 2 : 1); q++) { const qq = (q + Math.floor(hs(20) * 4)) % 4; if (quadFree(qq & 1, qq >> 1) && hs(21 + qq) < 0.75) { quad(qq & 1, qq >> 1, 0.22 + hs(24 + qq) * 0.06, h0 * (0.8 + 0.4 * hs(28 + qq))); n++; } }
          if (!coarse) for (const s2 of pickSubs(1, 33)) sub(s2 & 3, s2 >> 2, 0.18, Math.min(h0, 20) * (0.6 + 0.4 * hs(34)));
        } else if (!coarse) {
          const n = Math.round(dens * 1.4 + hs(5) * 0.9);
          for (const s2 of pickSubs(n, 6)) sub(s2 & 3, s2 >> 2, 0.16 + hs(40 + s2) * 0.05, h0 * (0.7 + 0.6 * hs(50 + s2)));
        }
        break;
      }
      case LU.COM: {
        let tower = false;
        for (let q = 0; q < 4 && !tower; q++) { const qq = (q + Math.floor(hs(60) * 4)) % 4; if (quadFree(qq & 1, qq >> 1)) { quad(qq & 1, qq >> 1, h0 > 50 ? 0.24 + hs(2) * 0.06 : 0.36, h0 * (0.85 + 0.3 * hs(3))); tower = true; } }
        if (!coarse) for (const s2 of pickSubs(tower ? 1 : 2, 65)) sub(s2 & 3, s2 >> 2, 0.18, h0 * (0.35 + 0.35 * hs(66 + s2)));
        break;
      }
      case LU.IND: {
        if (coarse) break;
        let n = 0;
        for (let q = 0; q < 4 && n < 2; q++) if (quadFree(q & 1, q >> 1) && hs(70 + q) < 0.55) { quad(q & 1, q >> 1, 0.4, h0 * (0.8 + 0.3 * hs(74 + q))); n++; }
        break;
      }
      case LU.INST: {
        if (coarse) break;
        for (let q = 0; q < 4; q++) if (quadFree(q & 1, q >> 1) && hs(80 + q) < 0.35) { const cx = (q & 1) * 0.5 + 0.25, cy = (q >> 1) * 0.5 + 0.25; out.push([cx - 0.19, cy - 0.11, cx + 0.19, cy + 0.11, h0 * (0.8 + 0.3 * hs(84 + q)), L]); }
        break;
      }
    }
    if (!out.length) return null;
    if (city.taken[c] > 0.05) { const keep = Math.max(0, Math.round(out.length * (1 - city.taken[c]))); out.length = keep; }
    // 地面 / 高架地铁占用的子地块上的房屋已拆除（syncMetroMask）
    const mm = this._mt && this._mt.mask.get(c);
    if (mm) { let n = 0; for (const b of out) if (!(boxBits(b) & mm)) out[n++] = b; out.length = n; }
    return out.length ? out : null;
  };

  Renderer.prototype.drawGround = function (ctx, X0, Y0, X1, Y1, lvl) {
    const g = this.game, city = g.city, W = city.W, H = city.H, Geo = CM.Geo;
    const i0 = Math.max(0, Math.floor(X0)), j0 = Math.max(0, Math.floor(Y0)), i1 = Math.min(W, Math.ceil(X1)), j1 = Math.min(H, Math.ceil(Y1));
    const px = 1 / lvl;
    const inBox = function (b, m) { return b[2] >= X0 - m && b[0] <= X1 + m && b[3] >= Y0 - m && b[1] <= Y1 + m; };
    ctx.fillStyle = GROUND.land; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    // 地块底色（按颜色批量）
    const paths = new Map();
    const P = function (col) { let p = paths.get(col); if (!p) { p = new Path2D(); paths.set(col, p); } return p; };
    let anyHill = false;
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const c = j * W + i, L = city.lu[c];
        let col;
        if (L === LU.WATER) col = GROUND.farm[0];
        else if (L === LU.HILL) { col = GROUND.farm[0]; anyHill = true; }   // 山体另行平滑绘制（见下）
        else if (L === LU.AIRPORT) col = GROUND.airport;
        else if (city.street[c] && L !== LU.PARK) col = GROUND.urban[L] || GROUND.urban[0];
        else col = GROUND.farm[Math.floor(U.hash2(i >> 1, j >> 1, 3) * 3)];
        P(col).rect(i - px, j - px, 1 + 2 * px, 1 + 2 * px);
      }
    }
    // 按颜色固定顺序填充：各格向外多画 1 像素，相邻不同颜色的重叠处取决于先后，顺序固定后相邻地图块、分条绘制的结果一致
    Array.from(paths.keys()).sort().forEach(function (col) { ctx.fillStyle = col; ctx.fill(paths.get(col)); });
    // 山体：按格的掩膜先做 3×3 平均（零散的单格淡出、成片的连成整体），再双线性放大，边缘柔和、不再是一格一格的方块；
    // 四周多取一格，跨块连续；颜色随平滑噪声略有深浅
    if (anyHill) {
      const mw = i1 - i0 + 2, mh = j1 - j0 + 2, mc = makeCanvas(mw, mh), mx = mc.getContext('2d'), img = mx.createImageData(mw, mh), d = img.data;
      const shades = GROUND.hill.map(function (h) { return U.hex2rgb(h); });
      const isHill = function (i, j) { return city.lu[U.clamp(j, 0, H - 1) * W + U.clamp(i, 0, W - 1)] === LU.HILL ? 1 : 0; };
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const i = i0 - 1 + x, j = j0 - 1 + y;
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += isHill(i + dx, j + dy) * (dx && dy ? 0.5 : 1);
        const cover = (s + isHill(i, j) * 2) / 9;   // 中心 3、四邻各 1、四角各 0.5，权重合计 9
        if (cover < 0.3) continue;
        const t = U.noise2(i * 0.18, j * 0.18, 5) * 2, k = Math.min(1, Math.floor(t)), f = t - k, a = shades[k], b = shades[k + 1], o = (y * mw + x) * 4;
        d[o] = a[0] + (b[0] - a[0]) * f; d[o + 1] = a[1] + (b[1] - a[1]) * f; d[o + 2] = a[2] + (b[2] - a[2]) * f;
        d[o + 3] = Math.round(255 * U.clamp((cover - 0.3) / 0.45, 0, 1));
      }
      mx.putImageData(img, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mc, 0, 0, mw, mh, i0 - 1, j0 - 1, mw, mh);   // 第 x 个像素对应格 i0 − 1 + x，像素中心即格中心
      ctx.restore();
    }
    // 夜间：商业中心与混合街区的暖色灯光（按岗位密度分三档）
    if (TH.night && lvl >= 16) {
      const glow = [new Path2D(), new Path2D(), new Path2D()], any = [false, false, false];
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const c = j * W + i, L = city.lu[c];
        if ((L !== LU.COM && L !== LU.MIX) || !city.street[c]) continue;
        const d = city.jobs[c] / (L === LU.COM ? 2500 : 4000), q = d > 1.2 ? 2 : (d > 0.5 ? 1 : (d > 0.15 ? 0 : -1));
        if (q < 0) continue;
        glow[q].rect(i, j, 1, 1); any[q] = true;
      }
      for (let q = 0; q < 3; q++) if (any[q]) { ctx.fillStyle = 'rgba(255,190,110,' + [0.05, 0.09, 0.14][q] + ')'; ctx.fill(glow[q]); }
    }
    // 林地（真实范围）
    ctx.fillStyle = GROUND.wood;
    const wp = new Path2D();
    for (const f of Geo.woods) if (inBox(f.bbox, 0.5)) wp.addPath(this.featurePath(f, true));
    ctx.fill(wp, 'nonzero');
    // 风景区山体：雾蓝绿色
    // 逐个填充：风景区内常有嵌套的子景区，合在一条路径里用奇偶规则会互相抵消成空洞
    ctx.fillStyle = GROUND.hill[0]; ctx.globalAlpha = 0.85;
    for (const f of Geo.reserves) if (inBox(f.bbox, 0.5)) ctx.fill(this.featurePath(f, true), 'evenodd');
    ctx.globalAlpha = 1;
    if (CM.Settings.get('lighting') !== false) this.drawTerrainLight(ctx);
    // 公园（真实范围）
    const pp = new Path2D();
    for (const f of Geo.parks) if (inBox(f.bbox, 0.5)) pp.addPath(this.featurePath(f, true));
    ctx.fillStyle = GROUND.park; ctx.fill(pp, 'nonzero');
    if (lvl >= 16) { ctx.strokeStyle = GROUND.parkEdge; ctx.lineWidth = px * 1.2; ctx.stroke(pp); }
    // 旧机场跑道
    const ab = city.airportBox;
    let rw = D.airport && D.airport.runway;
    // 跑道延长段的填海尚未成陆时，跑道止于原来的端点
    const rx = D.airport && D.airport.runwayExt, rxr = rx && (D.reclaim || []).find(function (r) { return r.id === rx.reclaim; });
    if (rw && rxr && rxr.year > city.terrainYear) rw = [rw[0], rx.end];
    if (rw && city.lu.indexOf(LU.AIRPORT) >= 0 && inBox([Math.min(rw[0][0], rw[1][0]), Math.min(rw[0][1], rw[1][1]), Math.max(rw[0][0], rw[1][0]), Math.max(rw[0][1], rw[1][1])], 1)) {
      // 指定方向的跑道（如伸入海港的启德跑道）
      ctx.lineCap = 'butt';
      ctx.strokeStyle = GROUND.apron; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(rw[0][0], rw[0][1]); ctx.lineTo(rw[1][0], rw[1][1]); ctx.stroke();
      ctx.strokeStyle = GROUND.runway; ctx.lineWidth = 0.26; ctx.stroke();
      ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = Math.max(px, 0.02); ctx.setLineDash([0.3, 0.3]); ctx.stroke(); ctx.setLineDash([]);
    } else if (ab && city.lu.indexOf(LU.AIRPORT) >= 0 && inBox(ab, 1)) {
      const cx = (ab[0] + ab[2]) / 2, len = (ab[3] - ab[1]) * 0.78, y0 = (ab[1] + ab[3]) / 2 - len / 2;
      ctx.fillStyle = GROUND.apron; ctx.fillRect(cx - 1.3, y0 + len * 0.3, 0.9, len * 0.32);
      ctx.fillStyle = GROUND.runway; ctx.fillRect(cx - 0.12, y0, 0.24, len);
      ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = Math.max(px, 0.02); ctx.setLineDash([0.3, 0.3]);
      ctx.beginPath(); ctx.moveTo(cx, y0 + 0.2); ctx.lineTo(cx, y0 + len - 0.2); ctx.stroke(); ctx.setLineDash([]);
    }
    // 其他机场的跑道（v2.2，如香港国际机场的三条跑道）：按启用年份画，跑道所在须已成陆
    const ryear = g.clock.y + ((g.clock.m || 1) - 1) / 12;
    for (const r of D.runways || []) {
      if (ryear < r.from || !inBox([Math.min(r.a[0], r.b[0]), Math.min(r.a[1], r.b[1]), Math.max(r.a[0], r.b[0]), Math.max(r.a[1], r.b[1])], 1)) continue;
      if (city.waterAt((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2)) continue;
      ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(r.a[0], r.a[1]); ctx.lineTo(r.b[0], r.b[1]);
      ctx.strokeStyle = GROUND.apron; ctx.lineWidth = 0.55; ctx.stroke();
      ctx.strokeStyle = GROUND.runway; ctx.lineWidth = 0.24; ctx.stroke();
      ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = Math.max(px, 0.02); ctx.setLineDash([0.3, 0.3]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 场地底色先画，随后保留水系、铁路与道路的原始显示。
    for (let k = 0; k < D.landmarks.length; k++) {
      const lm = D.landmarks[k];
      if (city.landmarkOn[k] && CM.Sites.complex(lm) && inBox([lm.x - Math.hypot(lm.w, lm.d) / CFG.CELL_M, lm.y - Math.hypot(lm.w, lm.d) / CFG.CELL_M, lm.x + Math.hypot(lm.w, lm.d) / CFG.CELL_M, lm.y + Math.hypot(lm.w, lm.d) / CFG.CELL_M], 0)) this.drawSiteFloor(ctx, lm);
    }
    // 水系（真实岸线）
    const wpth = new Path2D(), bankPath = new Path2D();
    for (const f of Geo.water) if (inBox(f.bbox, 0.5)) { wpth.addPath(this.featurePath(f, true)); bankPath.addPath(this.bankPath(f)); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 历史海岸线：尚未填海成陆的区域仍画成水面（单独以 nonzero 填充，避免与海域多边形的奇偶规则抵消）
    // v2.1：填海范围按平滑后的实际水面（city.reclaimWater），岸线只描旧海岸一侧
    const rpth = new Path2D(), redge = new Path2D(); let anyRc = false;
    for (const f of city.reclaimWater ? city.reclaimWater() : []) if (inBox(f.bbox, 0.5)) {
      rpth.addPath(this.featurePath(f, true)); anyRc = true;
      let ep = this.geoPaths.get(f.edge);
      if (!ep) { ep = new Path2D(); const e = f.edge; for (let q = 0; q + 3 < e.length; q += 4) { ep.moveTo(e[q], e[q + 1]); ep.lineTo(e[q + 2], e[q + 3]); } this.geoPaths.set(f.edge, ep); }
      redge.addPath(ep);
    }
    ctx.strokeStyle = GROUND.bank; ctx.lineWidth = Math.max(0.05, px * 2.4); ctx.stroke(bankPath);
    if (anyRc) ctx.stroke(redge);
    ctx.fillStyle = GROUND.water; ctx.fill(wpth, 'nonzero');
    if (anyRc) ctx.fill(rpth, 'nonzero');
    // 水面波纹（近景）
    if (lvl >= 16) {
      ctx.save(); ctx.clip(wpth, 'nonzero');
      ctx.strokeStyle = GROUND.glint; ctx.lineWidth = px * 1.2;
      ctx.beginPath();
      // 波纹格点按世界坐标对齐（相邻地图块、分条绘制时图案连续）
      for (let j = Math.floor(Y0 / 0.7) * 0.7; j < Y1; j += 0.7) for (let i = Math.floor(X0 / 1.3) * 1.3; i < X1; i += 1.3) {
        const hx = U.hash2(Math.round(i * 10), Math.round(j * 10), 17); if (hx > 0.35) continue;
        const x = i + hx * 1.5, y = j + U.hash2(Math.round(i * 10), Math.round(j * 10), 18) * 0.5;
        ctx.moveTo(x, y); ctx.lineTo(x + 0.35, y - 0.06);
      }
      ctx.stroke(); ctx.restore();
    }
    for (const l of Geo.waterLines) {
      const width = Math.max(l.w, px * 1.5);
      // 河道bbox仅覆盖中心线；裁剪必须包含描边半宽和抗锯齿，否则跨图块 / 条带的宽河道会被切成方块。
      if (!inBox(l.bbox, width / 2 + px)) continue;
      ctx.strokeStyle = GROUND.water; ctx.lineWidth = width;
      ctx.stroke(this.featurePath(l, false));
    }
    // 2D 建筑占地（近景才显示，保持平面图简洁）
    if (lvl >= 32) {
      const shadow = new Path2D();
      const fills = new Map();
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const c = j * W + i;
        if (this.isLmCenter(c)) continue;
        const bl = this.cellBuildings(c);
        if (!bl) continue;
        for (let k = 0; k < bl.length; k++) {
          const b = bl[k];
          const x0 = i + b[0], y0 = j + b[1], x1 = i + b[2], y1 = j + b[3];
          const off = Math.min(0.08, 0.008 + b[4] * 0.0005);
          shadow.rect(x0 + off, y0 + off, x1 - x0, y1 - y0);
          const col = U.rgb(this.bldTopColor(c, k, b));
          let fp = fills.get(col); if (!fp) { fp = new Path2D(); fills.set(col, fp); }
          fp.rect(x0, y0, x1 - x0, y1 - y0);
        }
      }
      if (CM.Settings.get('lighting') !== false) { ctx.fillStyle = TH.shadow2d; ctx.fill(shadow); }
      ctx.strokeStyle = TH.bldStroke; ctx.lineWidth = px;
      fills.forEach(function (p, col) { ctx.fillStyle = col; ctx.fill(p); if (lvl >= 32) ctx.stroke(p); });
    }
    // 公园树木（2D）
    if (lvl >= 32) {
      ctx.fillStyle = TH.parkTree;
      ctx.beginPath();
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const c = j * W + i, L = city.lu[c];
        if (L !== LU.PARK && L !== LU.HILL && city.wood[c] < 0.5) continue;
        for (let k = 0; k < 4; k++) {
          const x = i + 0.12 + U.hash2(c, k, 61) * 0.76, y = j + 0.12 + U.hash2(c, k, 62) * 0.76;
          if (city.waterAt(x, y) || city.bmask[Math.floor(y * city.BS) * city.BW + Math.floor(x * city.BS)] >= 2) continue;
          ctx.moveTo(x + 0.06, y); ctx.arc(x, y, 0.06, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    // 铁路
    const RD = TH.road;
    for (const r of Geo.rail) {
      if (!inBox(r.bbox, 0.5) || (r.flags & 2)) continue;
      if ((r.flags & 16) && g.clock.y < (D.hsrYear || 2009)) continue;   // 高速铁路按本地图的开通年份出现
      if (r.year && g.clock.y < r.year) continue;
      const railPath = this.featurePath(r, false);
      ctx.strokeStyle = RD.railCase; ctx.lineWidth = Math.max(0.05, px * 2.6); ctx.stroke(railPath);
      ctx.strokeStyle = RD.rail; ctx.lineWidth = Math.max(0.025, px * 1.2);
      if (lvl >= 32) ctx.setLineDash([0.06, 0.06]);
      ctx.stroke(railPath); ctx.setLineDash([]);
    }
    // 支路：只在已开发的街区显示
    const streets = Geo.streetBk && lvl >= 16 ? Geo.query(Geo.streetBk, X0 - 0.5, Y0 - 0.5, X1 + 0.5, Y1 + 0.5) : [];
    const st = new Path2D();
    for (const k of streets) {
      const p = Geo.streets[k].p;
      for (let q = 0; q + 3 < p.length; q += 2) {
        const c = city.cellAt((p[q] + p[q + 2]) / 2, (p[q + 1] + p[q + 3]) / 2);
        if (c < 0 || !city.street[c] || city.lu[c] === LU.PARK) continue;
        st.moveTo(p[q], p[q + 1]); st.lineTo(p[q + 2], p[q + 3]);
      }
    }
    // 主要道路（已通车）
    const ways = city.roadWayBk ? Geo.query(city.roadWayBk, X0 - 0.5, Y0 - 0.5, X1 + 0.5, Y1 + 0.5) : [];
    const lay = { 2: [], 3: [], 4: [] }, links = [], tunnels = [];
    for (const k of ways) {
      const w = city.roadWays[k];
      if (!city.roadsBuilt[w.g]) continue;
      const gr = city.roadGroups[w.g];
      if (gr.flags & 2) tunnels.push(w); else if (gr.flags & 4) links.push(w); else lay[gr.cls].push(w);
    }
    const path = (arr) => { const p = new Path2D(); for (const w of arr) p.addPath(this.featurePath(w, false)); return p; };
    const bridgePath = (arr) => { const p = new Path2D(); for (const w of arr) if (city.roadGroups[w.g].flags & 1) p.addPath(this.featurePath(w, false)); return p; };
    const P2 = path(lay[2]), P3 = path(lay[3]), P4 = path(lay[4]), PL = path(links), PT = path(tunnels);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 路缘（桥梁加深）
    ctx.strokeStyle = RD.localCase; ctx.lineWidth = Math.max(0.05, px * 2.2); ctx.stroke(st);
    ctx.strokeStyle = RD.collCase; ctx.lineWidth = Math.max(0.085, px * 2.8); ctx.stroke(P2);
    ctx.strokeStyle = RD.artCase; ctx.lineWidth = Math.max(0.12, px * 3.4); ctx.stroke(P3);
    ctx.strokeStyle = RD.expCase; ctx.lineWidth = Math.max(0.065, px * 2.4); ctx.stroke(PL);
    ctx.lineWidth = Math.max(0.16, px * 4.2); ctx.stroke(P4);
    ctx.strokeStyle = RD.bridgeCase;
    ctx.lineWidth = Math.max(0.12, px * 3.6); ctx.stroke(bridgePath(lay[3])); ctx.stroke(bridgePath(lay[2]));
    ctx.lineWidth = Math.max(0.17, px * 4.4); ctx.stroke(bridgePath(lay[4]));
    // 路面
    ctx.strokeStyle = RD.local; ctx.lineWidth = Math.max(0.03, px * 1.1); ctx.stroke(st);
    ctx.strokeStyle = RD.coll; ctx.lineWidth = Math.max(0.055, px * 1.7); ctx.stroke(P2);
    ctx.strokeStyle = RD.art; ctx.lineWidth = Math.max(0.085, px * 2.3); ctx.stroke(P3);
    ctx.strokeStyle = RD.exp; ctx.lineWidth = Math.max(0.04, px * 1.4); ctx.stroke(PL);
    ctx.lineWidth = Math.max(0.12, px * 3); ctx.stroke(P4);
    if (tunnels.length) { ctx.strokeStyle = RD.tunnel; ctx.lineWidth = Math.max(0.05, px * 1.6); ctx.setLineDash([0.12, 0.08]); ctx.stroke(PT); ctx.setLineDash([]); }
    if (lvl >= 32 && lay[4].length) { ctx.strokeStyle = RD.expLine; ctx.lineWidth = px; ctx.stroke(P4); }
    // 尚未填海成陆的区域盖回水面：伸向新土地的道路、桥梁与铁路在成陆前不显示
    if (anyRc) { ctx.fillStyle = GROUND.water; ctx.fill(rpth, 'nonzero'); }
    // 地标占地（2D）
    for (let k = 0; k < D.landmarks.length; k++) {
      if (!city.landmarkOn[k]) continue;
      const lm = D.landmarks[k], R = Math.max(lm.w, lm.d) / CFG.CELL_M;
      if (lm.x < X0 - R || lm.x > X1 + R || lm.y < Y0 - R || lm.y > Y1 + R) continue;
      this.drawLandmark2D(ctx, lm, lvl);
    }
    // Supplemental facilities use the same ground and isometric plans.
    for (const it of this.extraModels()) {
      const r = Math.hypot(it.lm.w, it.lm.d) / CFG.CELL_M;
      if (it.x < X0 - r || it.x > X1 + r || it.y < Y0 - r || it.y > Y1 + r) continue;
      this.drawLandmark2D(ctx, it.lm, lvl);
    }
    // 未开放区域：底色与斜线先画在临时图层上，再用按格掩膜（3×3 平均后双线性放大）裁出范围，
    // 与山体、风景区相邻处是柔和的边缘，不再是一格一格的方块。水面格按所在区域计入（随后按真实岸线裁掉水面）
    const locked = function (i, j) {
      const c = U.clamp(j, 0, H - 1) * W + U.clamp(i, 0, W - 1), k = city.region[c];
      const state = city.lockState();
      return city.landFrac[c] >= 0.5 ? state.mask[c] : (state.info[city.lockRegion(c)].b ? 0 : 1);
    };
    let anyLock = false;
    for (let j = j0; j < j1 && !anyLock; j++) for (let i = i0; i < i1; i++) if (locked(i, j) && city.lu[j * W + i] !== LU.WATER) { anyLock = true; break; }
    if (anyLock) {
      const mw = i1 - i0 + 2, mh = j1 - j0 + 2, mc = makeCanvas(mw, mh), mx = mc.getContext('2d'), img = mx.createImageData(mw, mh), d = img.data;
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const i = i0 - 1 + x, j = j0 - 1 + y;
        let s = locked(i, j) * 2;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += locked(i + dx, j + dy) * (dx && dy ? 0.5 : 1);
        const cover = s / 9;
        if (cover >= 0.3) { const o = (y * mw + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(255 * U.clamp((cover - 0.3) / 0.45, 0, 1)); }
      }
      mx.putImageData(img, 0, 0);
      const cv = ctx.canvas, layer = makeCanvas(cv.width, cv.height), lx = layer.getContext('2d'), tf = ctx.getTransform();
      lx.setTransform(tf);
      // 先画区域遮罩，再分别扣除现代水面、历史水面与河道。
      // 矩形叠加水面不能用 nonzero 作反向裁剪；改回 evenodd 也会让重叠水面相互抵消。
      lx.fillStyle = TH.lockFill; lx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      lx.strokeStyle = TH.lockHatch; lx.lineWidth = Math.max(px, 0.04);
      lx.beginPath();
      for (let k = Math.floor((X0 + Y0) / 0.6) * 0.6; k < X1 + Y1; k += 0.6) { lx.moveTo(k - Y0, Y0); lx.lineTo(k - Y1, Y1); }
      lx.stroke();
      lx.globalCompositeOperation = 'destination-out'; lx.fillStyle = '#000'; lx.fill(wpth, 'nonzero');
      if (anyRc) lx.fill(rpth, 'nonzero');
      lx.strokeStyle = '#000'; lx.lineCap = 'round'; lx.lineJoin = 'round';
      for (const l of Geo.waterLines) {
        const width = Math.max(l.w, px * 1.5);
        if (!inBox(l.bbox, width / 2 + px)) continue;
        lx.lineWidth = width; lx.stroke(this.featurePath(l, false));
      }
      lx.globalCompositeOperation = 'destination-in'; lx.imageSmoothingEnabled = true; lx.imageSmoothingQuality = 'high';
      lx.drawImage(mc, 0, 0, mw, mh, i0 - 1, j0 - 1, mw, mh);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0); ctx.restore();
    }
  };
  // 地标占地（2D 平面）：真实场地范围 + 主体建筑轮廓
  Renderer.prototype.drawLandmark2D = function (ctx, lm, lvl) {
    if (CM.Sites.complex(lm)) return this.drawComplexSite(ctx, (x, y) => [x, y], lm, lvl, true);
    const F = TH.lm2d, N = TH.night, CMM = CFG.CELL_M;
    const ang = (lm.rot || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const T = function (u, v) { return [lm.x + (u * ca - v * sa) / CMM, lm.y + (u * sa + v * ca) / CMM]; };
    const hw = lm.w / 2, hd = lm.d / 2;
    ctx.save();
    ctx.lineWidth = Math.max(1 / lvl, 0.012); ctx.strokeStyle = F.stroke;
    const poly = function (pts, fill, stroke) { ctx.beginPath(); pts.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke !== false) ctx.stroke(); };
    const rect = function (u0, v0, u1, v1, fill, stroke) { poly([T(u0, v0), T(u1, v0), T(u1, v1), T(u0, v1)], fill, stroke); };
    const ngon = function (cu, cv, r, n, rot, rv) { const o = []; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2 + (rot || 0); o.push(T(cu + Math.cos(t) * r, cv + Math.sin(t) * (rv == null ? r : rv))); } return o; };
    const lawn = N ? '#1f3a28' : '#cfe4bf', plaza = N ? '#2c3340' : '#ece6da', bld = F.fill;
    switch (lm.kind) {
      case 'campus': ctx.globalAlpha = 0.35; rect(-hw, -hd, hw, hd, lawn, false); ctx.globalAlpha = 1; break; // 校园内建筑由街区生成，此处只铺草地底色
      case 'memorial': case 'hall':
        rect(-hw, -hd, hw, hd, lawn, false);
        rect(-12, -hd, 12, hd, plaza, false);
        if (lm.kind === 'hall') { poly(ngon(0, 0, 31, 8, Math.PI / 8), '#4a83c4'); poly(ngon(0, 0, 14, 8, Math.PI / 8), '#7fb0e0', false); }
        else rect(-18, -18, 18, 18, '#f2f2ee');
        break;
      case 'themepark': {   // 主题乐园（v2.2 重做）：与三维布局一致的平面——大街与中央广场、湖面、穹顶、城堡与外圈小火车；海洋公园为海滨乐园
        rect(-hw, -hd, hw, hd, lawn, false);
        const wat = N ? '#2f4a5e' : '#a9d3e8', wht = N ? '#5a6272' : '#f4f2ee', blu = N ? '#3f5ea8' : '#6f93cf', cas = N ? '#6a6f9a' : '#ece6f2';
        if (lm.style === 'castle' && lm.id === 'sh_disney') {   // 上海迪士尼：中央城堡与奇想花园、南面米奇大街、西侧宝藏湾湖面与咆哮山、东侧创极速光轮顶棚
          rect(-15, hd * 0.38, 15, hd * 0.88, plaza, false); poly(ngon(0, hd * 0.2, 66, 20), plaza, false); poly(ngon(0, hd * 0.2, 52, 20), N ? '#2f4a3c' : '#b6d6a8', false);
          poly(ngon(-hw * 0.6, hd * 0.2, hw * 0.28, 20, 0, hd * 0.34), wat, false);
          poly(ngon(-hw * 0.52, -hd * 0.44, 40, 7), N ? '#7a5a50' : '#d29a82');
          poly(ngon(hw * 0.56, hd * 0.08, 64, 16, 0, 36), wht);
          poly(ngon(0, -hd * 0.08, 44, 8, Math.PI / 8), cas); poly(ngon(0, -hd * 0.08, 14, 8, Math.PI / 8), blu, false);
        } else if (lm.style === 'castle') {
          const tk = /^fac_tk/.test(lm.id || ''), cz = tk ? -hd * 0.16 : -hd * 0.2;
          rect(-15, tk ? hd * 0.32 : hd * 0.2, 15, tk ? hd * 0.88 : hd * 0.76, plaza, false); poly(ngon(0, tk ? hd * 0.12 : hd * 0.06, tk ? 48 : 42, 20), plaza, false);
          poly(ngon(tk ? -hw * 0.56 : -hw * 0.54, tk ? -hd * 0.04 : hd * 0.04, hw * (tk ? 0.28 : 0.26), 20, 0, hd * (tk ? 0.4 : 0.34)), wat, false);
          poly(ngon(hw * 0.6, tk ? -hd * 0.04 : hd * 0.04, tk ? 42 : 34, 20), wht);
          poly(ngon(0, cz, tk ? 34 : 30, 8, Math.PI / 8), cas); poly(ngon(0, cz, 11, 8, Math.PI / 8), blu, false);
          if (!tk) rect(-30, hd * 0.84 - 13, 30, hd * 0.84 + 13, N ? '#6a5048' : '#d8b4a6');
          ctx.save(); ctx.strokeStyle = N ? '#8a94a8' : '#9aa6b4'; ctx.lineWidth = Math.max(1.5 / lvl, 0.008); poly(ngon(0, 0, hw * (tk ? 0.84 : 0.88), 48, 0, hd * (tk ? 0.8 : 0.84)), null); ctx.restore();
        } else {
          poly(ngon(-hw * 0.44, -hd * 0.1, 32, 20), N ? '#4a6080' : '#c6d6e2');
          poly(ngon(hw * 0.16, hd * 0.1, hw * 0.32, 20, 0, hd * 0.3), wat, false);
          rect(hw * 0.6 - 23, -hd * 0.36 - 15, hw * 0.6 + 23, -hd * 0.36 + 15, N ? '#2f4a3c' : '#a8c8a0');
          rect(hw * 0.64 - 30, hd * 0.72 - 5, hw * 0.64 + 30, hd * 0.72 + 5, plaza);
          for (let k = 0; k < 5; k++) rect(-hw * 0.72 + k * 32 - 6, hd * 0.56 - 7, -hw * 0.72 + k * 32 + 6, hd * 0.56 + 7, bld);
        }
        break;
      }
      case 'stadium':
        rect(-hw, -hd, hw, hd, lm.w > 500 ? lawn : plaza, false);
        if (lm.style === 'race') { poly(ngon(0, 0, hw * 0.92, 40, 0, hd * 0.85), N ? '#5a4a3a' : '#cdb48e'); poly(ngon(0, 0, hw * 0.8, 40, 0, hd * 0.68), N ? '#2a4a30' : '#9cc98a', false); rect(-hw * 0.6, hd * 0.86, hw * 0.6, hd, N ? '#4a5262' : '#e6e8ea'); }
        else if (lm.w > 500) {
          poly(ngon(0, -70, 150, 36, 0, 125), N ? '#3b4250' : '#eceee9'); poly(ngon(0, -70, 108, 36, 0, 90), '#c8644a', false); poly(ngon(0, -70, 90, 36, 0, 75), '#7dbb62', false);
          poly(ngon(-270, 170, 70, 20, 0, 52), N ? '#3b4250' : '#e2e5e9'); rect(200, 125, 340, 210, N ? '#33475c' : '#cfe2ef');
        } else { poly(ngon(0, 0, hw * 0.95, 30, 0, hd * 0.95), N ? '#3b4250' : '#eceee9'); poly(ngon(0, 0, hw * 0.7, 30, 0, hd * 0.7), '#7dbb62', false); }
        break;
      case 'tvtower': poly(ngon(0, 0, 40, 24, 0, 30), N ? '#4a3f66' : '#b9bec6'); poly(ngon(0, 0, 26, 24, 0, 19), N ? '#2b2840' : '#d5d9df', false); poly(ngon(0, 0, 10, 12), N ? '#d07ae0' : '#646a74', false); break;
      case 'lattice':
        if (lm.style === 'eiffel') { rect(-hw, -hd, hw, hd, plaza, false); for (const a of [-1, 1]) for (const b of [-1, 1]) poly([T(a * 38, b * 38), T(a * 62, b * 38), T(a * 62, b * 62), T(a * 38, b * 62)], N ? '#8a6a44' : '#8a7058'); rect(-38, -38, 38, 38, null); rect(-6, -6, 6, 6, N ? '#c8a064' : '#6e5a46', false); }
        else if (lm.style === 'skytree') { rect(-hw, -hd, hw, hd, plaza, false); poly(ngon(0, 0, 39, 3, -Math.PI / 2), N ? '#3e4a5e' : '#dfe5ec'); poly(ngon(0, 0, 17, 18), N ? '#6fa8e0' : '#a9b3bf', false); }
        else { rect(-hw, -hd, hw, hd, plaza, false); rect(-45, -30, 45, 30, N ? '#4a4f5a' : '#e4e1da'); for (const a of [-1, 1]) for (const b of [-1, 1]) rect(a * 40 - 6, b * 40 - 6, a * 40 + 6, b * 40 + 6, '#d2452f'); rect(-8, -8, 8, 8, '#d2452f', false); }
        break;
      case 'pagoda': rect(-hw, -hd, hw, hd, plaza, false); rect(-77, -32, -23, -12, '#6f6d6a'); rect(-77, 2, -23, 22, '#6f6d6a'); poly(ngon(30, 0, 11, 8, Math.PI / 8), '#cfa96b'); break;
      case 'minaret': rect(-hw, -hd, hw, hd, plaza, false); rect(-40, -20, 2, 18, '#9aa7ad'); poly(ngon(22, 0, 5, 12), '#e2dccd'); break;
      case 'tower': rect(-18, -13, 18, 13, '#b5402f'); break;
      case 'church':
        rect(-hw, -hd, hw, hd, plaza, false);
        if (lm.style === 'notredame') { rect(-64, -20, -50, 20, '#8a8478'); rect(-50, -12, 40, 12, '#9aa3ae'); rect(-6, -24, 6, 24, '#9aa3ae'); poly(ngon(48, 0, 12, 12), '#9aa3ae'); }
        else { rect(-50, -16, 20, 16, '#9a9890'); rect(20, -17, 32, -5, '#7a786f'); rect(20, 5, 32, 17, '#7a786f'); }
        break;
      case 'palace': {
        const ce = hw - 80, wc = N ? '#4c5260' : '#9aa6b4';
        rect(-hw, -hd, hw, hd, plaza, false);
        if (lm.style === 'keep') { rect(-hw, -hd, hw, hd, N ? '#4e5058' : '#cfc6b4'); rect(-hw + 8, -hd + 8, hw - 8, hd - 8, plaza, false); rect(-hw + 34, -16, -hw + 66, 16, N ? '#5e6068' : '#b8ae9a'); break; }
        if (lm.style !== 'louvre') { const iw = Math.min(26, hw * 0.3), id2 = Math.min(26, hd * 0.3); rect(-hw, -hd, hw, hd, wc); rect(-hw + iw, -hd + id2, hw - iw, hd - id2, plaza, false); break; }
        rect(-hw, -hd, ce - 80, -hd + 22, wc); rect(-hw, hd - 22, ce - 80, hd, wc);
        rect(ce - 80, -80, ce + 80, 80, wc); rect(ce - 58, -58, ce + 58, 58, plaza);
        rect(ce - 102, -hd + 22, ce - 80, -80, wc); rect(ce - 102, 80, ce - 80, hd - 22, wc);
        if ((this.styleYear || 0) >= 1989) poly([T(ce - 192, -17), T(ce - 158, -17), T(ce - 158, 17), T(ce - 192, 17)], N ? '#5a7898' : '#bcd4e6');
        break;
      }
      case 'dome': {
        rect(-hw, -hd, hw, hd, plaza, false);
        const bw = Math.min(hw, 70), bd = Math.min(hd, 60), R = Math.min(bw, bd) * 0.42;
        if (lm.style === 'glass') { rect(-bw, -bd * 0.45, bw, bd * 0.45, N ? '#4c6078' : '#c4d6e4'); poly(ngon(0, 0, bd * 0.38, 16), N ? '#6a86a6' : '#d8e6f0'); }
        else { rect(-bw, -bd, bw, bd, N ? '#4e5058' : '#d8d0c0'); poly(ngon(0, 0, R * 1.04, 16), lm.style === 'gold' ? '#c9a54e' : lm.style === 'white' ? (N ? '#7a7a76' : '#f2f0e8') : lm.style === 'copper' ? '#7aaa96' : (N ? '#5a626e' : '#9aa4ae')); }
        break;
      }
      case 'arch':
        if (lm.style === 'defense') { rect(-62, -62, 62, 62, plaza, false); rect(-56, -54, 56, -36, N ? '#7a8294' : '#e4e6ea'); rect(-56, 36, 56, 54, N ? '#7a8294' : '#e4e6ea'); rect(-56, -36, 56, 36, N ? '#5e6676' : '#f0f1f3'); }
        else { poly(ngon(0, 0, 120, 32), plaza, false); rect(-11, -22.5, 11, 22.5, N ? '#6a665e' : '#cfc6b2'); }   // 星形广场（直径约 240 m，只作底图）
        break;
      case 'colonial':
        rect(-hw, -hd, hw, hd, lm.w > 500 ? (N ? '#22382a' : '#d8e8c8') : plaza, false);
        if (lm.w > 500) { for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) { if (r === 1 && k === 0) continue; const u0 = -hw + 40 + k * (lm.w - 140) / 9, v0 = [-80, 50][r]; rect(u0, v0, u0 + 52, v0 + 46, '#e6c98a'); } rect(-hw + 10, 95, -hw + 150, 140, N ? '#5a6070' : '#f4f4f0'); }
        else { rect(-60, -60, 60, -44, '#d9cfbb'); rect(-60, 44, 60, 60, '#d9cfbb'); rect(-60, -44, -44, 44, '#d9cfbb'); rect(44, -44, 60, 44, '#d9cfbb'); }
        break;
      case 'traditional': case 'temple': rect(-hw, -hd, hw, hd, plaza, false); rect(-hw + 4, -hd + 4, hw - 4, hd - 4, null); break;
      case 'rail': case 'station2':
        rect(-hw, -hd, hw, hd, plaza, false);
        if (lm.w > 500) { for (let k = 0; k < 5; k++) rect(-hw + 40, -120 + k * 34, hw - 40, -102 + k * 34, N ? '#30363f' : '#c9cbd0', false); rect(-170, 60, 170, 110, N ? '#4a5263' : '#dcdde3'); }
        else rect(-hw + 20, -hd + 30, hw - 20, hd - 50, N ? '#4a5263' : '#dcdde3');
        break;
      case 'expo': rect(-hw, -hd, hw, hd, plaza, false); for (let r = 0; r < 3; r++) { const v0 = -hd + 70 + r * (lm.d - 140) / 3; rect(-hw + 60, v0, hw - 60, v0 + (lm.d - 140) / 3 - 50, N ? '#3a4a5c' : '#d4e1ec'); } break;
      case 'skyscraper':
        rect(-hw, -hd, hw, hd, plaza, false);
        if (lm.style === 'citic') { rect(-100, -100, 100, 100, N ? '#3a4152' : '#e2e0db'); rect(-24, -60, 24, -12, N ? '#4a6080' : '#c6d6e2'); }
        else rect(-hw * 0.9, -hd * 0.9, hw * 0.9, hd * 0.9, N ? '#4a6080' : '#c6d6e2');
        break;
      case 'opera': rect(-hw, -hd, hw, hd, plaza, false); poly(ngon(-30, 0, 62, 7, 0.2, 48), N ? '#4c525e' : '#dcdcd8'); poly(ngon(62, 38, 32, 6, 0.6, 25), N ? '#4c525e' : '#dcdcd8'); break;
      case 'box': rect(-hw, -hd, hw, hd, plaza, false); if (lm.style === 'pompidou') rect(-83, -30, 83, 30, N ? '#4a5262' : '#e6e8ea'); else rect(-58, -58, 58, 58, N ? '#40424a' : '#8e8e94'); break;
      case 'concert': poly([T(-58, -26), T(56, -38), T(48, 36), T(-52, 30)], N ? '#5a6474' : '#eef0f2'); break;
      case 'gallery': poly(ngon(0, 0, 46, 5, -Math.PI / 2), N ? '#4a5262' : '#f4f4f2'); break;
      // 任务设施的示意建筑（v2.2）
      case 'hospital':
        rect(-hw, -hd, hw, hd, plaza, false); rect(-hw * 0.8, -hd * 0.62, hw * 0.8, -hd * 0.18, bld); rect(-hw * 0.18, -hd * 0.18, hw * 0.18, hd * 0.7, bld); rect(-hw * 0.8, hd * 0.2, -hw * 0.3, hd * 0.7, bld);
        poly(ngon(hw * 0.4, -hd * 0.4, 9, 16), N ? '#3e4a5a' : '#e9edf0');   // 屋顶直升机坪
        rect(hw * 0.4 - 4, -hd * 0.4 - 4.5, hw * 0.4 - 2.6, -hd * 0.4 + 4.5, N ? '#c8d2dc' : '#5a8a9a', false); rect(hw * 0.4 + 2.6, -hd * 0.4 - 4.5, hw * 0.4 + 4, -hd * 0.4 + 4.5, N ? '#c8d2dc' : '#5a8a9a', false); rect(hw * 0.4 - 3, -hd * 0.4 - 0.7, hw * 0.4 + 3, -hd * 0.4 + 0.7, N ? '#c8d2dc' : '#5a8a9a', false);
        break;
      case 'mall': rect(-hw, -hd, hw, hd, plaza, false); rect(-hw * 0.88, -hd * 0.8, hw * 0.88, hd * 0.8, bld); rect(-hw * 0.5, -hd * 0.18, hw * 0.5, hd * 0.18, N ? '#4a6080' : '#c6d6e2', false); break;
      case 'cluster': rect(-hw, -hd, hw, hd, plaza, false); rect(-hw * 0.8, -hd * 0.7, -hw * 0.2, -hd * 0.05, N ? '#4a6080' : '#c6d6e2'); rect(hw * 0.05, -hd * 0.75, hw * 0.75, -hd * 0.15, N ? '#4a6080' : '#c6d6e2'); rect(-hw * 0.3, hd * 0.15, hw * 0.35, hd * 0.75, N ? '#4a6080' : '#c6d6e2'); break;
      case 'garden':
        rect(-hw, -hd, hw, hd, lawn, false);
        poly(ngon(hw * 0.3, hd * 0.15, hw * 0.32, 18, 0, hd * 0.3), N ? '#2f4a5e' : '#a9d3e8', false);
        if (lm.style === 'zoo') for (const [a, b] of [[-0.55, -0.45], [-0.55, 0.35], [-0.05, -0.55]]) poly(ngon(hw * a, hd * b, hw * 0.2, 7, 0.3, hd * 0.2), N ? '#3c4a38' : '#dfe6c9');
        else poly(ngon(-hw * 0.35, -hd * 0.25, 12, 6), bld);
        break;
      case 'airport': {   // 机场平面（v2.2）：停机坪、航站楼、廊桥与停机位上的客机；+v 朝跑道
        const TT = (lm.T || 400) / 2, zf = -hd + 64, ap = N ? '#2c3540' : '#d9dfe5', pl = N ? '#9aa6b4' : '#ffffff';
        rect(-hw, -hd + 8, hw, hd, ap, false); rect(-hw * 1.05, hd, hw * 1.05, hd + 42, ap, false);
        rect(-TT, zf - 50, TT, zf, bld); rect(-TT * 0.9, zf - 60, TT * 0.9, zf - 52, N ? '#3a4452' : '#e8ebee', false);
        const n = Math.max(3, Math.floor((lm.T || 400) / 75));
        ctx.save(); ctx.fillStyle = pl;
        const plane = function (u, v, a, L) { const c = Math.cos(a), s = Math.sin(a), P = function (p, q) { return T(u + p * c - q * s, v + p * s + q * c); };
          poly([P(L * 0.5, 0), P(L * 0.1, L * 0.05), P(-L * 0.18, L * 0.48), P(-L * 0.26, L * 0.48), P(-L * 0.12, L * 0.05), P(-L * 0.42, L * 0.05), P(-L * 0.5, L * 0.18), P(-L * 0.52, 0), P(-L * 0.5, -L * 0.18), P(-L * 0.42, -L * 0.05), P(-L * 0.12, -L * 0.05), P(-L * 0.26, -L * 0.48), P(-L * 0.18, -L * 0.48), P(L * 0.1, -L * 0.05)], pl, false); };
        for (let j = 0; j < n; j++) { const u = -TT + (lm.T || 400) * (j + 0.5) / n; rect(u - 1.8, zf, u + 1.8, zf + 26, N ? '#55606e' : '#c4cad2', false); plane(u, zf + 62, -Math.PI / 2, 62); }
        if (lm.d >= 250) for (let j = 0; j < 3; j++) plane(-hw * 0.8 + j * hw * 0.26, zf + 175, -Math.PI / 2, 52);
        plane(hw * 0.64, hd + 20, 0, 60);
        ctx.restore();
        poly(ngon(-TT - 48, zf - 30, 9, 12), N ? '#55606e' : '#c4cad2');
        break;
      }
      case 'museum': rect(-hw, -hd, hw, hd, plaza, false); rect(-hw * 0.8, -hd * 0.7, hw * 0.8, hd * 0.7, bld); rect(-hw * 0.3, -hd * 0.3, hw * 0.3, hd * 0.3, N ? '#4a6080' : '#c6d6e2', false); break;
      default: rect(-hw * 0.8, -hd * 0.8, hw * 0.8, hd * 0.8, bld);
    }
    ctx.restore();
  };
  // 分条绘制（v2.1）：较粗级别的地面块一次可达 30–40 ms，按水平条带分几帧画完，避免单帧卡顿。
  // 条带边界落在整像素上，每个像素只属于一个条带；图案连续，裁剪边缘允许抗锯齿微差
  // 分帧画布每段提交，避免浏览器丢失尚未栅格化的条带。
  const flushCanvas = function (ctx) { ctx.getImageData(0, 0, 1, 1); };
  Renderer.prototype.groundChunkGen = function* (lvl, ci, cj) {
    const C = CHUNK_PX / lvl, x0 = ci * C, y0 = cj * C;
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(CHUNK_PX + 2, CHUNK_PX + 2) : makeCanvas(CHUNK_PX + 2, CHUNK_PX + 2), ctx = cv.getContext('2d', { willReadFrequently: true });
    const N = lvl <= 8 ? 16 : (lvl <= 16 ? 8 : 4), edge = x0 + C > CFG.W || y0 + C > CFG.H;
    for (let s = 0; s < N; s++) {
      const ya = s ? y0 + C * s / N : y0 - 1 / lvl, yb = s < N - 1 ? y0 + C * (s + 1) / N : y0 + C + 1 / lvl;
      ctx.save();
      ctx.setTransform(lvl, 0, 0, lvl, -x0 * lvl + 1, -y0 * lvl + 1);
      ctx.beginPath(); ctx.rect(x0 - 1 / lvl, ya, C + 2 / lvl, yb - ya); ctx.clip();
      if (edge) { ctx.beginPath(); ctx.rect(0, 0, CFG.W, CFG.H); ctx.clip(); }
      this.drawGround(ctx, x0 - 1 / lvl, ya - 1 / lvl, x0 + C + 1 / lvl, yb + 1 / lvl, lvl);
      ctx.restore();
      flushCanvas(ctx);
      if (s < N - 1) yield cv;
    }
    return cv;
  };
  // 总览图的底：陆地与水面，随后补上细节（有地面块线程时由线程画好后替换）
  Renderer.prototype.renderOverviewBase = function () {
    const lvl = 4, cv = makeCanvas(CFG.W * lvl, CFG.H * lvl), ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = GROUND.land; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = GROUND.water;
    const city = this.game.city;
    for (let c = 0; c < city.N; c++) if (city.lu[c] === LU.WATER) ctx.fillRect((c % city.W) * lvl, ((c / city.W) | 0) * lvl, lvl, lvl);
    this.overview = cv; this.overviewAt = performance.now();
    return cv;
  };
  Renderer.prototype.renderOverview = function () {
    const cv = this.renderOverviewBase();
    this.overviewStale = false;
    this.overviewJob = { cv: cv, row: 0, version: this.game.city.version };
  };
  Renderer.prototype.stepOverview = function () {
    const job = this.overviewJob;
    if (!job) return;
    const y0 = job.row, y1 = Math.min(CFG.H, y0 + 4), ctx = job.cv.getContext('2d');
    ctx.save(); ctx.setTransform(4, 0, 0, 4, 0, 0); ctx.beginPath(); ctx.rect(0, y0, CFG.W, y1 - y0); ctx.clip();
    this.drawGround(ctx, 0, y0, CFG.W, y1, 4); ctx.restore(); flushCanvas(ctx);
    job.row = y1;
    if (y1 >= CFG.H) { this.overviewJob = null; this.overviewAt = performance.now(); this.overviewStale = job.version !== this.game.city.version; }
  };

  // ---------------- 等距建筑分块 ----------------
  Renderer.prototype.isoChunkGeom = function (lvl, ci, cj) {
    const C = CHUNK_PX / lvl / 1.41421356 | 0 || 1;
    return C;
  };
  Renderer.prototype.isoChunkGen = function* (lvl, ci, cj, C) {
    const city = this.game.city, W = city.W, H = city.H;
    const i0 = ci * C, j0 = cj * C;
    const s = lvl, coarse = s < 16;
    let waterOnly = true;
    for (let j = j0; j < Math.min(H, j0 + C) && waterOnly; j++) for (let i = i0; i < Math.min(W, i0 + C); i++) {
      const L = city.lu[j * W + i]; if (L !== LU.WATER && L !== LU.LANDMARK) { waterOnly = false; break; }
    }
    if (waterOnly) return { cv: makeCanvas(1, 1), ax: 0, ay: 0, px: 1, empty: true };
    let hasHill = false;
    for (let j = j0; j < Math.min(H, j0 + C) && !hasHill; j++) for (let i = i0; i < Math.min(W, i0 + C); i++) if (city.lu[j * W + i] === LU.HILL) { hasHill = true; break; }
    const pad = hasHill ? 2.8 * s : 4;   // 山峰会越出所在格
    const minX = (i0 - (j0 + C)) * ISO[0] * s - pad, maxX = ((i0 + C) - j0) * ISO[0] * s + pad;
    const minY = (i0 + j0) * ISO[2] * s - MAX_H * HSF * s - pad, maxY = (i0 + j0 + 2 * C) * ISO[2] * s + pad;
    const cv = makeCanvas(maxX - minX, maxY - minY), ctx = cv.getContext('2d');
    const ox = -minX, oy = -minY;
    const pj = function (x, y, h) { return [(x - y) * ISO[0] * s + ox, (x + y) * ISO[2] * s + oy - h * HSF * s]; };
    let drew = 0;
    const progress = { cv: cv };
    for (let sum = i0 + j0; sum <= i0 + j0 + 2 * C - 2; sum++) {
      if (sum > i0 + j0) yield progress;
      for (let i = Math.max(i0, sum - (j0 + C - 1)); i <= Math.min(i0 + C - 1, sum - j0); i++) {
        const j = sum - i;
        if (i >= W || j >= H || i < 0 || j < 0) continue;
        const c = j * W + i, L = city.lu[c];
        if (L === LU.WATER || L === LU.LANDMARK) continue;
        if (L === LU.HILL) {
          const relief = city.regions[city.region[c]].relief;
          drew += relief === 0 ? this.isoTrees(ctx, pj, c, i, j, coarse ? 1 : 3, s) : this.isoPeak(ctx, pj, c, i, j, s); continue;
        }
        if (L === LU.PARK || (city.wood[c] > 0.5 && !city.street[c])) { drew += this.isoTrees(ctx, pj, c, i, j, coarse ? 1 : 3, s); continue; }
        if (L === LU.RURAL && !city.street[c] && city.pop[c] < 12) { if (U.hash2(c, 1, 77) < 0.2) drew += this.isoTrees(ctx, pj, c, i, j, 1, s); }
        if (this.isLmCenter(c)) continue;
        const bl = this.cellBuildings(c, coarse);
        if (!bl) continue;
        for (let k = 0; k < bl.length; k++) { this.isoBox(ctx, pj, i, j, bl[k], c, k, s); drew++; }
      }
    }
    if (!drew) cv.width = cv.height = 1;
    return { cv: cv, ax: (i0 - j0) * ISO[0] * s + ox, ay: (i0 + j0) * ISO[2] * s + oy, px: cv.width * cv.height, empty: drew === 0 };
  };
  // 已建成地标中心所在的格不再放普通建筑（由地标模型占用）
  Renderer.prototype.isLmCenter = function (c) {
    const city = this.game.city;
    if (!this._lmc || this._lmcCity !== city) { this._lmcCity = city; this._lmc = new Map(); D.landmarks.forEach((lm, k) => this._lmc.set(city.cellAt(lm.x, lm.y), k)); }
    const k = this._lmc.get(c);
    return k !== undefined && city.landmarkOn[k] === 1;
  };
  // 地标精灵：每个地标按缩放级别单独缓存（大型场地不受分块裁切），在其中心所在分块之后绘制
  Renderer.prototype.landmarkSprite = function (k, lvl) {
    const key = 'L' + lvl + ':' + k;
    const lm = D.landmarks[k], s = lvl, siteVersion = CM.Sites.complex(lm) ? CM.Sites.version(this) : null;
    let e = this.iso.get(key);
    if (e && !e.stale && e.siteVersion === siteVersion) { e.used = this.frame; return e; }
    const R = Math.hypot(lm.w, lm.d) / 2 / CFG.CELL_M + 0.15;
    const tall = lm.kind === 'tvtower' || lm.kind === 'skyscraper' || lm.kind === 'lattice';
    const hMax = (lm.h || (lm.kind === 'pagoda' ? 70 : (lm.kind === 'church' ? 62 : 55))) * EX * (tall ? 1.05 : 1.6) + 0.05;
    const xs = [lm.x - R, lm.x + R], ys = [lm.y - R, lm.y + R];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const x of xs) for (const y of ys) { const px = (x - y) * ISO[0] * s, py = (x + y) * ISO[2] * s; minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    minY -= hMax * HSF * s;
    const padd = 6, cv = makeCanvas(maxX - minX + 2 * padd, maxY - minY + 2 * padd), ctx = cv.getContext('2d');
    const ox = -minX + padd, oy = -minY + padd;
    const pj = function (x, y, h) { return [(x - y) * ISO[0] * s + ox, (x + y) * ISO[2] * s + oy - h * HSF * s]; };
    try { this.isoLandmark(ctx, pj, lm, s); } catch (err) { console.error(err); }
    e = { cv: cv, ax: (lm.x - lm.y) * ISO[0] * s + ox, ay: (lm.x + lm.y) * ISO[2] * s + oy, px: cv.width * cv.height, used: this.frame, born: this.warmUntil ? this.time - 1 : this.time, stale: false, siteVersion: siteVersion };
    const old = this.iso.get(key); if (old) this.cachePx -= old.px;
    this.iso.set(key, e); this.cachePx += e.px;
    return e;
  };
  // ---------- 等距几何辅助：任意凸多边形棱柱、棱锥、椭圆 ----------
  function fillPts(ctx, pts, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); }
  // 棱柱：底面多边形（世界坐标，任意方向），高度 h0→h1（世界单位）；可见侧面按远近排序并按朝向着色
  function prism(ctx, pj, pts, h0, h1, wall, top, opt) {
    opt = opt || {};
    const n = pts.length;
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    const faces = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const nx = sgn * ey, ny = -sgn * ex, nl = Math.hypot(nx, ny) || 1;
      const vx = nx / nl, vy = ny / nl;
      if (vx + vy <= 0.001) continue;
      faces.push({ a: a, b: b, d: a[0] + a[1] + b[0] + b[1], f: 0.72 + 0.17 * Math.max(0, vx) - 0.04 * Math.max(0, vy) });
    }
    faces.sort(function (p, q) { return p.d - q.d; });
    for (const fc of faces) {
      const q = [pj(fc.a[0], fc.a[1], h0), pj(fc.b[0], fc.b[1], h0), pj(fc.b[0], fc.b[1], h1), pj(fc.a[0], fc.a[1], h1)];
      fillPts(ctx, q, U.rgb(U.shade(wall, CM.Settings.get('lighting') === false ? 1 : fc.f)));
      if (opt.lines) { opt.lines(fc, q); }
    }
    if (top) fillPts(ctx, pts.map(function (p) { return pj(p[0], p[1], h1); }), U.rgb(top));
    return faces;
  }
  // 棱锥 / 坡顶：多边形底边 h0 收向顶点 (cx,cy,h1)
  function pyramidN(ctx, pj, pts, cx, cy, h0, h1, col) {
    const n = pts.length, tip = pj(cx, cy, h1);
    const faces = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
      faces.push({ a: a, b: b, d: mx + my, f: 0.78 + 0.16 * (mx > 0 ? 1 : 0) + 0.08 * (my > 0 ? -1 : 0) });
    }
    faces.sort(function (p, q) { return p.d - q.d; });
    for (const fc of faces) fillPts(ctx, [pj(fc.a[0], fc.a[1], h0), pj(fc.b[0], fc.b[1], h0), tip], U.rgb(U.shade(col, fc.f)));
  }

  // ---------------- 城市风貌（v2.0）：建筑年代与地区风格 ----------------
  // 普通建筑程序生成：按「建成年代」（只用于外观，见 bldVintage）分为传统低层、战前砖石、混凝土板楼、面砖塔楼与玻璃幕墙；
  // 传统低层按地区区分（内地灰砖坡顶、香港唐楼、台北街屋、东京木造坡顶）。商业区按年代出现招牌与霓虹。外观按 5 年一档更新。
  // 配色保持原有浅色、克制的「云雾淡彩」风格：年代与地区只体现在形体（坡顶、窗带、竖条）和极轻的色调差异上
  const STYLE_PAL = {
    old: { cn: [[226, 229, 233], [219, 223, 229], [231, 232, 234]], hk: [[236, 234, 228], [228, 235, 233], [236, 231, 230], [229, 231, 238]], jp: [[234, 231, 225], [227, 226, 222], [237, 234, 228]], tw: [[229, 232, 236], [222, 227, 233], [232, 232, 231]],
      eu: [[238, 232, 218], [233, 227, 212], [240, 236, 224]] },   // 巴黎：奥斯曼式奶油色石材立面
    roof: { cn: [184, 194, 208], hk: null, jp: [176, 187, 202], tw: null, eu: [170, 178, 190] },   // 巴黎为锌板芒萨尔屋顶
    masonry: [[233, 229, 220], [227, 224, 216], [236, 233, 226]],
    slab: [[232, 235, 239], [226, 231, 237], [236, 238, 240], [222, 228, 236]],
    tile: [[236, 240, 245], [228, 235, 243], [240, 242, 245]],
  };
  const NEON_YEAR = { cn: 1992, hk: 1960, jp: 1955, tw: 1975, eu: 1925 };
  const NEON_P = { eu: 0.25 };          // 出现招牌的商业楼比例（未列出的地区为 0.7）
  const ROOF_MAX = { eu: 30 };          // 坡屋顶 / 芒萨尔屋顶的最高楼高（米，未列出的地区为 20）
  const NEON_COL = ['#ff4fa3', '#36e0ff', '#ffd23f', '#7cff6b', '#ff6a3d', '#b98cff'];
  const REGION_KEY = { '中国内地': 'cn', '中国香港': 'hk', '中国台湾': 'tw', '日本': 'jp', '法国': 'eu' };
  const roofFor = function (rk, st, mh) { return st === 'old' && mh <= (ROOF_MAX[rk] || 20) ? STYLE_PAL.roof[rk] : null; };
  function nightCol(c) { return [c[0] * 0.24 + 8, c[1] * 0.26 + 12, c[2] * 0.28 + 24]; }   // 与原夜景楼宇同一深度
  Renderer.prototype.regionKey = function () { const m = CM.curMap ? CM.curMap() : null; return (m && REGION_KEY[m.region]) || 'cn'; };
  // 建筑年代（只用于外观，不影响模拟）：开局前已是城区的街区分散在开局前约 6–50 年；之后城市化的街区按城市化年份；
  // 较高的建筑只会出现在允许该高度的年代之后；建成 30 年以上的建筑逐步翻新（外观换新、高度不变）。
  Renderer.prototype.bldVintage = function (c, k, h) {
    const city = this.game.city, y0 = CFG.START.y, Y = this.styleYear || y0, uy = city.urbanYear[c];
    let v = uy > y0 ? uy + 3 * U.hash2(c, k, 17) : y0 - 6 - 44 * U.hash2(c, k, 17);
    const minY = h > 100 ? 2003 : h > 60 ? 1992 : h > 32 ? 1972 : -1e9;
    if (v < minY) v = minY + 8 * U.hash2(c, k, 18);
    const age = Y - v;
    // 巴黎：1940 年以前的低层石材建筑整体保护，只翻新不改变风格
    const keep = (this._rk || (this._rk = this.regionKey())) === 'eu' && v < 1940 && h <= 30;
    if (!keep && age > 30 && U.hash2(c, k, 19) < (age - 30) / 50) v = Y - 25 * U.hash2(c, k, 20);
    return Math.min(v, Y);
  };
  Renderer.prototype.bldStyle = function (c, k, h) {
    const v = this.bldVintage(c, k, h);
    if (v < 1960) return h <= ((this._rk || (this._rk = this.regionKey())) === 'eu' ? 30 : 24) ? 'old' : 'masonry';
    if (v < 1990) return 'slab';
    if (v < 2005) return 'tile';
    return 'glass';
  };
  // 平面图（2D）中的建筑颜色：与 2.5D 同一风格，坡屋顶建筑显示屋面颜色
  Renderer.prototype.bldTopColor = function (c, k, b) {
    const st = this.bldStyle(c, k, b[4]), rk = this._rk || (this._rk = this.regionKey());
    if (st === 'glass') { const pal = PAL[b[5]] || PAL[0]; return pal[Math.floor(U.hash2(c, k, 4) * pal.length)]; }
    let col; const rf = roofFor(rk, st, b[4]);
    if (rf) col = U.mixc(rf, [226, 231, 237], 0.35);
    else { const P = st === 'old' ? (STYLE_PAL.old[rk] || STYLE_PAL.old.cn) : STYLE_PAL[st]; col = P[Math.floor(U.hash2(c, k, 4) * P.length)]; }
    return TH.night ? nightCol(col) : col;
  };
  // 坡屋顶：屋脊沿较长的一边；先画背坡，再画山墙与前坡
  function pitchedRoof(ctx, pj, A, B, C, D, h, wall, col) {
    const w = B[0] - A[0], d = D[1] - A[1], rh = Math.min(h * 0.55, Math.min(w, d) * 0.5);
    const At = pj(A[0], A[1], h), Bt = pj(B[0], B[1], h), Ct = pj(C[0], C[1], h), Dt = pj(D[0], D[1], h);
    if (w >= d) {
      const ym = (A[1] + D[1]) / 2, R0 = pj(A[0], ym, h + rh), R1 = pj(B[0], ym, h + rh);
      fillPts(ctx, [At, Bt, R1, R0], U.rgb(U.shade(col, 0.78)));
      fillPts(ctx, [Bt, Ct, R1], U.rgb(U.shade(wall, 0.95)));
      fillPts(ctx, [Dt, Ct, R1, R0], U.rgb(col));
    } else {
      const xm = (A[0] + B[0]) / 2, R0 = pj(xm, A[1], h + rh), R1 = pj(xm, D[1], h + rh);
      fillPts(ctx, [At, Dt, R1, R0], U.rgb(U.shade(col, 0.78)));
      fillPts(ctx, [Dt, Ct, R1], U.rgb(U.shade(wall, 0.84)));
      fillPts(ctx, [Bt, Ct, R1, R0], U.rgb(U.shade(col, 1.08)));
    }
  }
  // 芒萨尔屋顶（巴黎）：四面陡坡的截顶棱台，顶部为平台；凸体按先背坡、再前坡、最后顶面的顺序绘制
  function mansardRoof(ctx, pj, A, B, C, D, h, col) {
    const w = B[0] - A[0], d = D[1] - A[1], m = Math.min(w, d), ins = m * 0.16, rh = Math.min(h * 0.24, m * 0.42);
    const b0 = pj(A[0], A[1], h), b1 = pj(B[0], B[1], h), b2 = pj(C[0], C[1], h), b3 = pj(D[0], D[1], h);
    const t0 = pj(A[0] + ins, A[1] + ins, h + rh), t1 = pj(B[0] - ins, B[1] + ins, h + rh), t2 = pj(C[0] - ins, C[1] - ins, h + rh), t3 = pj(D[0] + ins, D[1] - ins, h + rh);
    fillPts(ctx, [b0, b1, t1, t0], U.rgb(U.shade(col, 0.74)));
    fillPts(ctx, [b0, b3, t3, t0], U.rgb(U.shade(col, 0.8)));
    fillPts(ctx, [b3, b2, t2, t3], U.rgb(U.shade(col, 0.9)));
    fillPts(ctx, [b1, b2, t2, t1], U.rgb(U.shade(col, 1.02)));
    fillPts(ctx, [t0, t1, t2, t3], U.rgb(U.shade(col, 1.12)));
  }
  // 立面上的一条水平线（两个可见立面）
  function faceBand(ctx, pj, B, C, D, hh) {
    const p0 = pj(D[0], D[1], hh), p1 = pj(C[0], C[1], hh), p2 = pj(B[0], B[1], hh);
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
  }
  // 建筑体量：两个立面 + 顶面（或坡屋顶）；按年代风格加窗带、玻璃竖条、檐口；高楼带高光；夜间少量暖色窗光与商业霓虹
  Renderer.prototype.isoBox = function (ctx, pj, i, j, b, c, k, s) {
    const signature = s >= 16 && this.signatureOf(this.bldStyle(c, k, b[4]), b[4], c, k);
    if (signature) return this.drawSignature(ctx, pj, i, j, b, signature, s);
    const h = b[4] * EX, mh = b[4];
    const A = [i + b[0], j + b[1]], B = [i + b[2], j + b[1]], C = [i + b[2], j + b[3]], Dd = [i + b[0], j + b[3]];
    const Bb = pj(B[0], B[1], 0), Cb = pj(C[0], C[1], 0), Db = pj(Dd[0], Dd[1], 0);
    const At = pj(A[0], A[1], h), Bt = pj(B[0], B[1], h), Ct = pj(C[0], C[1], h), Dt = pj(Dd[0], Dd[1], h);
    const st = this.bldStyle(c, k, mh), rk = this._rk || (this._rk = this.regionKey());
    let base;
    if (st === 'glass') { const pal = PAL[b[5]] || PAL[0]; base = pal[Math.floor(U.hash2(c, k, 4) * pal.length)]; }
    else { const P = st === 'old' ? (STYLE_PAL.old[rk] || STYLE_PAL.old.cn) : STYLE_PAL[st]; base = P[Math.floor(U.hash2(c, k, 4) * P.length)]; if (TH.night) base = nightCol(base); }
    const tall = b[4] > 40;
    if (s >= 16) {
      const so = CM.Settings.get('lighting') === false ? 0 : Math.min(1.0, h * 0.45);
      const Cs = pj(C[0] + so, C[1] + so, 0), Bs = pj(B[0] + so, B[1] + so, 0);
      fillPts(ctx, [Bb, Bs, Cs, Cb], TH.isoShadow);
    }
    if (st === 'glass' && tall && s >= 16) {
      const gS = ctx.createLinearGradient(0, Dt[1], 0, Db[1]);
      gS.addColorStop(0, U.rgb(U.shade(base, TH.night ? 0.9 : 0.97))); gS.addColorStop(1, U.rgb(U.shade(base, TH.night ? 0.62 : 0.8)));
      const gE = ctx.createLinearGradient(0, Bt[1], 0, Bb[1]);
      gE.addColorStop(0, U.rgb(U.shade(base, TH.night ? 1.05 : 1.08))); gE.addColorStop(1, U.rgb(U.shade(base, TH.night ? 0.75 : 0.9)));
      fillPts(ctx, [Db, Cb, Ct, Dt], gS); fillPts(ctx, [Bb, Cb, Ct, Bt], gE);
      ctx.strokeStyle = TH.night ? 'rgba(170,200,240,0.25)' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Ct[0], Ct[1] + 1); ctx.lineTo(Cb[0], Cb[1]); ctx.stroke();
    } else {
      fillPts(ctx, [Db, Cb, Ct, Dt], U.rgb(U.shade(base, 0.82)));
      fillPts(ctx, [Bb, Cb, Ct, Bt], U.rgb(U.shade(base, 0.93)));
    }
    const roof = roofFor(rk, st, mh);
    if (roof && rk === 'eu') mansardRoof(ctx, pj, A, B, C, Dd, h, TH.night ? nightCol(roof) : roof);
    else if (roof) pitchedRoof(ctx, pj, A, B, C, Dd, h, base, TH.night ? nightCol(roof) : roof);
    else fillPts(ctx, [At, Bt, Ct, Dt], U.rgb(U.shade(base, TH.night ? 1.12 : 1.07)));
    // 立面细节（近景）：板楼与砖石楼的水平窗带、面砖塔楼的玻璃竖条、砖石楼檐口、街屋屋顶加建
    if (s >= 32 && mh >= 9) {
      if (st === 'slab' || st === 'masonry') {
        const rows = Math.min(6, Math.floor(mh / 9));
        ctx.strokeStyle = TH.night ? 'rgba(255,214,140,0.22)' : 'rgba(110,132,165,0.16)'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let r = 1; r <= rows; r++) faceBand(ctx, pj, B, C, Dd, h * r / (rows + 1)); ctx.stroke();
        if (st === 'masonry') { ctx.strokeStyle = U.rgb(U.shade(base, 0.86)); ctx.lineWidth = 1.5; ctx.beginPath(); faceBand(ctx, pj, B, C, Dd, h * 0.94); ctx.stroke(); }
      } else if (st === 'tile') {
        const glass = TH.night ? [52, 82, 120] : [184, 206, 230];
        for (const f of [[Dd, C], [B, C]]) {
          const a = f[0], e = f[1], p = function (t, hh) { return pj(a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t, hh); };
          fillPts(ctx, [p(0.4, h * 0.06), p(0.6, h * 0.06), p(0.6, h * 0.96), p(0.4, h * 0.96)], U.rgb(glass));
        }
      } else if (st === 'old' && rk === 'eu' && mh >= 12) {
        // 奥斯曼式立面：二层与五层的通长铁艺阳台
        ctx.strokeStyle = TH.night ? 'rgba(255,214,140,0.2)' : 'rgba(96,92,86,0.32)'; ctx.lineWidth = 1;
        ctx.beginPath(); faceBand(ctx, pj, B, C, Dd, h * 0.3); faceBand(ctx, pj, B, C, Dd, h * 0.8); ctx.stroke();
      } else if (st === 'old' && !roof && rk === 'tw' && U.hash2(c, k, 31) < 0.6) {
        // 台北街屋顶楼的铁皮加盖
        const sh = h * 0.18, m = function (u, v) { return [A[0] + (B[0] - A[0]) * u, A[1] + (Dd[1] - A[1]) * v]; };
        const q0 = m(0.2, 0.2), q1 = m(0.8, 0.2), q2 = m(0.8, 0.8), q3 = m(0.2, 0.8);
        fillPts(ctx, [pj(q3[0], q3[1], h), pj(q2[0], q2[1], h), pj(q2[0], q2[1], h + sh), pj(q3[0], q3[1], h + sh)], TH.night ? '#24344a' : '#c9d5e3');
        fillPts(ctx, [pj(q1[0], q1[1], h), pj(q2[0], q2[1], h), pj(q2[0], q2[1], h + sh), pj(q1[0], q1[1], h + sh)], TH.night ? '#1d2b3d' : '#bccadb');
        fillPts(ctx, [pj(q0[0], q0[1], h + sh), pj(q1[0], q1[1], h + sh), pj(q2[0], q2[1], h + sh), pj(q3[0], q3[1], h + sh)], TH.night ? '#2c3e56' : '#d6dfea');
      }
    }
    // 商业招牌：按地区年代出现。夜间为霓虹（老式楼宇为竖向招牌），白天高楼屋顶有广告牌
    if (b[5] === LU.COM && mh >= 15 && s >= 16 && (this.styleYear || 0) >= NEON_YEAR[rk] && U.hash2(c, k, 33) < (NEON_P[rk] || 0.7)) {
      const col = NEON_COL[Math.floor(U.hash2(c, k, 34) * NEON_COL.length)];
      const p = function (t, hh) { return pj(Dd[0] + (C[0] - Dd[0]) * t, Dd[1] + (C[1] - Dd[1]) * t, hh); };
      if (TH.night) {
        ctx.globalAlpha = 0.92;
        if (st === 'old' || st === 'masonry' || st === 'slab') fillPts(ctx, [p(0.12, h * 0.3), p(0.2, h * 0.3), p(0.2, h * 0.9), p(0.12, h * 0.9)], col);
        else fillPts(ctx, [p(0.2, h * 0.86), p(0.8, h * 0.86), p(0.8, h * 0.92), p(0.2, h * 0.92)], col);
        ctx.globalAlpha = 1;
      } else if (s >= 32 && mh >= 30 && st !== 'old') {
        const bh = Math.min(0.12, h * 0.12);
        ctx.globalAlpha = 0.35; fillPts(ctx, [p(0.25, h), p(0.75, h), p(0.75, h + bh), p(0.25, h + bh)], col); ctx.globalAlpha = 1;
      }
    }
    // 夜景：少量亮窗（传统低层更少）
    if (TH.night && s >= 16 && b[4] >= 10) {
      const rows = Math.min(7, Math.floor(b[4] / 14) + 1), lit = st === 'old' ? 0.3 : 0.45;
      ctx.fillStyle = 'rgba(255,214,140,0.85)';
      for (let r = 0; r < rows; r++) for (let q = 0; q < 2; q++) {
        if (U.hash2(c * 7 + k, r * 3 + q, 13) > lit) continue;
        const t = 0.3 + q * 0.4, hh = (r + 0.6) / rows * h;
        const fx = Dd[0] + (C[0] - Dd[0]) * t, fy = Dd[1] + (C[1] - Dd[1]) * t, p = pj(fx, fy, hh);
        ctx.fillRect(p[0] - 1, p[1] - 0.8, 2, 1.6);
      }
    }
  };
  // 圆冠树
  Renderer.prototype.isoTrees = function (ctx, pj, c, i, j, n, s) {
    let cnt = 0;
    const T = TH.tree[0];
    for (let k = 0; k < n; k++) {
      const x = i + 0.15 + U.hash2(c, k, 61) * 0.7, y = j + 0.15 + U.hash2(c, k, 62) * 0.7;
      const r = (0.07 + U.hash2(c, k, 63) * 0.05) * s * 0.85;
      const t = pj(x, y, 0.07 + U.hash2(c, k, 64) * 0.04);
      const v = 0.92 + U.hash2(c, k, 65) * 0.16;
      ctx.fillStyle = U.rgb(U.shade(T, v * 0.86)); ctx.beginPath(); ctx.arc(t[0], t[1], Math.max(1, r), 0, Math.PI * 2); ctx.fill();
      if (s >= 16) { ctx.fillStyle = U.rgb(U.shade(T, v * 1.12)); ctx.beginPath(); ctx.arc(t[0] - r * 0.25, t[1] - r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill(); }
      cnt++;
    }
    return cnt;
  };
  // 山体深度（到山区边缘的格数），用于山峰高度
  Renderer.prototype.hillDepth = function () {
    const city = this.game.city;
    if (this._hd && this._hdCity === city) return this._hd;
    const W = city.W, H = city.H, N = city.N, d = new Float32Array(N).fill(1e9), q = [];
    for (let c = 0; c < N; c++) if (city.lu[c] !== LU.HILL) { d[c] = 0; q.push(c); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % W, j = (c / W) | 0;
      for (const o of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + o[0], jj = j + o[1]; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const n2 = jj * W + ii; if (d[n2] > d[c] + 1) { d[n2] = d[c] + 1; q.push(n2); } }
    }
    this._hd = d; this._hdCity = city;
    return d;
  };
  // 水墨山峰：渐变填充的山形剪影，山脚融入雾中
  Renderer.prototype.isoPeak = function (ctx, pj, c, i, j, s) {
    const depth = this.hillDepth()[c], pk = TH.peak;
    const m = Math.min(1, depth / 5);
    if (U.hash2(c, 3, 41) > 0.16 + 0.12 * m) return 0;
    const cx = i + 0.2 + U.hash2(c, 1, 42) * 0.6, cy = j + 0.2 + U.hash2(c, 2, 43) * 0.6;
    const relief = this.game.city.regions[this.game.city.region[c]].relief;
    const scale = relief == null ? 1 : Math.max(0, relief) / 380;
    const hm = (60 + 320 * m) * scale * (0.55 + 0.75 * U.hash2(c, 4, 44));
    const r = (1.1 + 1.5 * m + U.hash2(c, 5, 45) * 0.7) * s;
    const P0 = pj(cx, cy, 0), A0 = pj(cx, cy, hm * EX * 0.6), A = [A0[0] + (U.hash2(c, 8, 47) - 0.5) * r * 0.5, A0[1]];
    const by = P0[1] + r * 0.18;
    const g = ctx.createLinearGradient(0, A[1], 0, by);
    g.addColorStop(0, U.rgb(pk.top, 0.95)); g.addColorStop(0.5, U.rgb(U.mixc(pk.top, pk.base, 0.55), 0.8)); g.addColorStop(1, U.rgb(pk.base, 0));
    const jit = function (k) { return (U.hash2(c, k, 46) - 0.5); };
    const pts = [[P0[0] - r, by]];
    for (let k = 1; k <= 3; k++) { const t = k / 4; pts.push([P0[0] - r + (A[0] - P0[0] + r) * t + jit(k) * r * 0.22, by + (A[1] - by) * Math.pow(t, 0.8) + jit(k + 5) * r * 0.16]); }
    pts.push([A[0], A[1]]);
    for (let k = 1; k <= 3; k++) { const t = k / 4; pts.push([A[0] + (P0[0] + r - A[0]) * t + jit(k + 10) * r * 0.22, A[1] + (by - A[1]) * Math.pow(t, 1.25) + jit(k + 15) * r * 0.16]); }
    pts.push([P0[0] + r, by]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.quadraticCurveTo(P0[0], by + r * 0.12, pts[0][0], pts[0][1]); ctx.fill();
    // 背光面
    const g2 = ctx.createLinearGradient(0, A[1], 0, by);
    g2.addColorStop(0, U.rgb(U.shade(pk.top, 0.72), 0.55)); g2.addColorStop(1, U.rgb(pk.top, 0));
    ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(A[0], A[1]);
    for (let k = 5; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.lineTo(P0[0] + r * 0.15, by); ctx.closePath(); ctx.fill();
    if (s >= 16) { ctx.strokeStyle = pk.ridge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); for (let k = 2; k <= 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke(); }
    // 山脚云雾
    const mg = ctx.createRadialGradient(P0[0], by - r * 0.05, 0, P0[0], by - r * 0.05, r * 1.1);
    mg.addColorStop(0, U.rgb(TH.fog, 0.55)); mg.addColorStop(1, U.rgb(TH.fog, 0));
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(P0[0], by - r * 0.05, r * 1.1, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    return 1;
  };

  // 截锥（两环之间的侧面 + 顶面），用于层檐、穹顶与塔身收分
  function frustumRings(ctx, pj, b, t, h0, h1, col, cx, cy, noTop) {
    const n = b.length, faces = [];
    let rmax = 0; for (const p of b) rmax = Math.max(rmax, Math.hypot(p[0] - cx, p[1] - cy));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; const mx = (b[i][0] + b[j][0]) / 2 - cx, my = (b[i][1] + b[j][1]) / 2 - cy; faces.push({ i: i, j: j, d: mx + my, f: 0.74 + 0.2 * U.clamp((mx - my * 0.3) / (rmax || 1), 0, 1) }); }
    faces.sort(function (p, q) { return p.d - q.d; });
    for (const fc of faces) fillPts(ctx, [pj(b[fc.i][0], b[fc.i][1], h0), pj(b[fc.j][0], b[fc.j][1], h0), pj(t[fc.j][0], t[fc.j][1], h1), pj(t[fc.i][0], t[fc.i][1], h1)], U.rgb(U.shade(col, fc.f)));
    if (!noTop) fillPts(ctx, t.map(function (p) { return pj(p[0], p[1], h1); }), U.rgb(U.shade(col, 1.06)));
  }

  // 地标精细模型：局部坐标为米（u 向东、v 向南，绕场地中心旋转 rot 度），高度为米
  Renderer.prototype.isoLandmark = function (ctx, pj, lm, s) {
    if (CM.Sites.complex(lm)) return this.drawComplexSite(ctx, pj, lm, s, false);
    const N = TH.night, CMM = CFG.CELL_M, kind = lm.kind, detail = s >= 16;
    const L = N ? ctx : null;
    const ang = (lm.rot || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const T = function (u, v) { return [lm.x + (u * ca - v * sa) / CMM, lm.y + (u * sa + v * ca) / CMM]; };
    // 巴黎的纪念建筑（拱门、穹顶、宫殿、圣母院）按真实高度比例绘制，与统一限高的街区相称
    const tall = kind === 'tvtower' || kind === 'skyscraper' || kind === 'lattice' || kind === 'arch' || kind === 'dome' || kind === 'palace' || lm.style === 'notredame' || lm.real;
    const E =EX * (tall ? 1 : 1.6);
    const hw = lm.w / 2, hd = lm.d / 2;
    const Rc = function (u0, v0, u1, v1) { return [T(u0, v0), T(u1, v0), T(u1, v1), T(u0, v1)]; };
    const NG = function (cu, cv, r, n, rot, rv) { const o = []; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2 + (rot || 0); o.push(T(cu + Math.cos(t) * r, cv + Math.sin(t) * (rv == null ? r : rv))); } return o; };
    const box = function (u0, v0, u1, v1, h0, h1, wall, top, opt) { return prism(ctx, pj, Rc(u0, v0, u1, v1), h0 * E, h1 * E, wall, top === undefined ? U.shade(wall, 1.08) : top, opt); };
    const poly = function (pts, h0, h1, wall, top, opt) { return prism(ctx, pj, pts, h0 * E, h1 * E, wall, top === undefined ? U.shade(wall, 1.06) : top, opt); };
    const cyl = function (cu, cv, r, n, h0, h1, wall, top, rot, rv) { return poly(NG(cu, cv, r, n, rot, rv), h0, h1, wall, top); };
    const hip = function (u0, v0, u1, v1, h0, h1, col) { const c = T((u0 + u1) / 2, (v0 + v1) / 2); pyramidN(ctx, pj, Rc(u0, v0, u1, v1), c[0], c[1], h0 * E, h1 * E, col); };
    const cone = function (cu, cv, r, n, h0, h1, col, rot) { const c = T(cu, cv); pyramidN(ctx, pj, NG(cu, cv, r, n, rot), c[0], c[1], h0 * E, h1 * E, col); };
    const eaveN = function (cu, cv, r0, r1, n, h0, h1, col, rot) { const c = T(cu, cv); frustumRings(ctx, pj, NG(cu, cv, r0, n, rot), NG(cu, cv, r1, n, rot), h0 * E, h1 * E, col, c[0], c[1]); };
    const mansardRoofL = function (u0, v0, u1, v1, h0, h1, col) { const m = Math.min(u1 - u0, v1 - v0) * 0.18, c = T((u0 + u1) / 2, (v0 + v1) / 2); frustumRings(ctx, pj, Rc(u0, v0, u1, v1), Rc(u0 + m, v0 + m, u1 - m, v1 - m), h0 * E, h1 * E, col, c[0], c[1]); };
    const eaveR = function (u0, v0, u1, v1, over, h0, h1, col) { const c = T((u0 + u1) / 2, (v0 + v1) / 2); frustumRings(ctx, pj, Rc(u0 - over, v0 - over, u1 + over, v1 + over), Rc(u0 + over * 0.3, v0 + over * 0.3, u1 - over * 0.3, v1 - over * 0.3), h0 * E, h1 * E, col, c[0], c[1]); };
    // 两坡顶：沿 u 方向的屋脊
    const gable = function (u0, v0, u1, v1, h0, h1, col, ridge) {
      const vm = (v0 + v1) / 2, A = T(u0, vm), B = T(u1, vm);
      const RA = pj(A[0], A[1], h1 * E), RB = pj(B[0], B[1], h1 * E);
      const p = function (u, v) { const w = T(u, v); return pj(w[0], w[1], h0 * E); };
      fillPts(ctx, [p(u0, v0), p(u1, v0), RB, RA], U.rgb(U.shade(col, 0.78)));
      fillPts(ctx, [p(u0, v1), p(u1, v1), RB, RA], U.rgb(col));
      if (ridge && s >= 16) { ctx.strokeStyle = ridge; ctx.lineWidth = Math.max(1, s / 30); ctx.beginPath(); ctx.moveTo(RA[0], RA[1]); ctx.lineTo(RB[0], RB[1]); ctx.stroke(); }
    };
    const line = function (u0, v0, h0, u1, v1, h1, col, w) { const a = T(u0, v0), b = T(u1, v1), A = pj(a[0], a[1], h0 * E), B = pj(b[0], b[1], h1 * E); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); };
    const dot = function (u, v, h, r, col) { const a = T(u, v), A = pj(a[0], a[1], h * E); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(A[0], A[1], r, 0, Math.PI * 2); ctx.fill(); };
    // 夜间灯光层（附加模型的车站、机场）：灯具画在 L 上，直接画入当前画布；白天不绘制
    const glowLine = function (u0, v0, h0, u1, v1, h1, col, w) { if (!L) return; const a = T(u0, v0), b = T(u1, v1), A = pj(a[0], a[1], h0 * E), B = pj(b[0], b[1], h1 * E); L.strokeStyle = col; L.lineWidth = w; L.beginPath(); L.moveTo(A[0], A[1]); L.lineTo(B[0], B[1]); L.stroke(); };
    const glowDot = function (u, v, h, r, col) { if (!L) return; const a = T(u, v), A = pj(a[0], a[1], h * E); L.fillStyle = col; L.beginPath(); L.arc(A[0], A[1], r, 0, Math.PI * 2); L.fill(); };
    const glowFace = function (u0, v0, u1, v1, h0, h1, col) { if (!L) return; const a = T(u0, v0), b = T(u1, v1); fillPts(L, [pj(a[0], a[1], h0 * E), pj(b[0], b[1], h0 * E), pj(b[0], b[1], h1 * E), pj(a[0], a[1], h1 * E)], col); };
    // 夜间亮窗：立面 (u0,v0)-(u1,v1)，高度 h0-h1（米）
    const lit = function (u0, v0, u1, v1, h0, h1, rows, cols) {
      if (!N || s < 16) return;
      ctx.fillStyle = 'rgba(255,214,140,0.85)';
      for (let rr = 0; rr < rows; rr++) for (let q = 0; q < cols; q++) {
        const t = (q + 0.5) / cols, hh = h0 + (h1 - h0) * (rr + 0.5) / rows;
        const w = T(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t), p = pj(w[0], w[1], hh * E);
        ctx.fillRect(p[0] - 0.8, p[1] - 0.8, 1.6, 1.6);
      }
    };
    // 场地内的树
    const trees = function (n, seed, avoid) {
      const T0 = TH.tree[0], rr = Math.max(1.2, 9 / CMM * s * 0.8);
      const list = [];
      for (let k = 0; k < n; k++) {
        const u = (U.hash2(k, seed, 3) - 0.5) * lm.w * 0.92, v = (U.hash2(k, seed, 4) - 0.5) * lm.d * 0.92;
        if (avoid && avoid(u, v)) continue;
        list.push([u, v]);
      }
      list.sort(function (a, b) { const A = T(a[0], a[1]), B = T(b[0], b[1]); return (A[0] + A[1]) - (B[0] + B[1]); });
      for (const t of list) {
        const w = T(t[0], t[1]), p = pj(w[0], w[1], 12 * EX);
        const v2 = 0.85 + U.hash2(Math.round(t[0]), Math.round(t[1]), 7) * 0.3;
        ctx.fillStyle = U.rgb(U.shade(T0, v2 * 0.82)); ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
        if (s >= 32) { ctx.fillStyle = U.rgb(U.shade(T0, v2 * 1.1)); ctx.beginPath(); ctx.arc(p[0] - rr * 0.25, p[1] - rr * 0.3, rr * 0.6, 0, Math.PI * 2); ctx.fill(); }
      }
    };
    const glass = N ? [70, 96, 130] : [176, 205, 228], white = N ? [120, 126, 140] : [242, 242, 238], stone = N ? [112, 108, 104] : [214, 206, 192];
    // 由远及近绘制若干部件：parts 为 [u, v, fn]，按观察方向（世界 (1,1)）上的深度排序
    const depth = function (u, v) { return (u * ca - v * sa) + (u * sa + v * ca); };
    const ordered = function (parts) { parts.sort(function (a, b) { return depth(a[0], a[1]) - depth(b[0], b[1]); }); for (const p of parts) p[2](); };
    let campusFront = null;
    switch (kind) {
      case 'hospital': {
        box(-hw, -hd * .48, hw, hd * .6, 0, lm.h || 34, stone, white);
        box(-hw * .28, -hd, hw * .28, hd, 0, (lm.h || 34) * .82, stone, white);
        const roofH=(lm.h || 34)+.4, red=N?[180,95,95]:[204,112,112];
        box(-5,-20,5,20,roofH,roofH+1,red,red);box(-20,-5,20,5,roofH,roofH+1,red,red);
        lit(-hw,hd*.6,hw,hd*.6,4,(lm.h||34)-3,4,10);break;
      }
      case 'garden': {
        const green=N?[44,75,60]:[178,209,168];box(-hw,-hd,hw,hd,0,.7,green,green);
        box(-8,-hd,8,hd,.7,.9,stone,stone);box(-hw,-7,hw,7,.7,.9,stone,stone);
        if(detail)trees(28,41,(u,v)=>Math.abs(u)<14||Math.abs(v)<12);break;
      }
      case 'cluster': {
        ordered([[-hw*.4,-hd*.25,()=>box(-hw,-hd,-hw*.03,hd*.3,0,(lm.h||140)*.72,glass)],
          [hw*.42,-hd*.2,()=>box(hw*.06,-hd*.85,hw,hd*.18,0,lm.h||140,glass)],
          [0,hd*.55,()=>box(-hw*.68,hd*.3,hw*.65,hd,0,(lm.h||140)*.35,stone)]]);break;
      }
      case 'themepark': { // 主题乐园（v2.2，简化示意）：迪士尼为城堡与园内街道，海洋公园为观光塔、海洋馆穹顶与登山缆车
        const water = N ? [46, 74, 96] : [150, 200, 226], pink = N ? [150, 120, 140] : [246, 222, 232], blue = N ? [58, 82, 150] : [86, 128, 206], gold = N ? '#ffe08a' : '#d2a33a';
        if (lm.style === 'castle') {
          const sh = lm.id === 'sh_disney';   // 上海迪士尼：城堡居中，湖面在西侧（宝藏湾），东侧为创极速光轮的玻璃顶棚
          if (detail) trees(70, 31, function (u, v) { return Math.hypot(u, v + hd * (sh ? 0.04 : 0.2)) < 110 || Math.abs(u) < 18; });
          if (sh) { box(-hw * 0.74, -hd * 0.02, -hw * 0.38, hd * 0.42, 0, 0.6, water, water); box(hw * 0.4, -hd * 0.06, hw * 0.72, hd * 0.2, 0, 15, N ? [70, 90, 110] : [176, 206, 224], null); }
          else box(hw * 0.12, hd * 0.0, hw * 0.72, hd * 0.5, 0, 0.6, water, water);                       // 园内湖
          // 大街两侧的彩色小楼
          for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) {
            const v0 = hd * 0.15 + k * 30, cols = [[236, 196, 150], [214, 120, 110], [150, 190, 220], [240, 220, 140]], c = cols[(k + (sd > 0 ? 1 : 0)) % 4];
            box(sd * 18, v0, sd * 38, v0 + 24, 0, 9, N ? U.shade(c, 0.5) : c, null); gable(sd > 0 ? 18 : -38, v0 - 1, sd > 0 ? 38 : -18, v0 + 25, 9, 13, N ? [90, 70, 70] : [170, 92, 80]);
          }
          // 城堡：主体、四角圆塔与蓝色尖顶，中央高塔与金色尖端
          const cv = sh ? -hd * 0.04 : -hd * 0.2;
          box(-30, cv - 22, 30, cv + 22, 0, 16, pink, null);
          for (const a of [-1, 1]) for (const b of [-1, 1]) { cyl(a * 30, cv + b * 22, 7, 10, 0, 26, pink, null); cone(a * 30, cv + b * 22, 8.5, 10, 26, 40, blue); }
          cyl(0, cv, 12, 12, 16, 38, pink, null); cone(0, cv, 14, 12, 38, 60, blue);
          for (const a of [-1, 1]) { cyl(a * 13, cv - 8, 5, 8, 16, 46, pink, null); cone(a * 13, cv - 8, 6, 8, 46, 58, blue); }
          line(0, cv, 60, 0, cv, 68, gold, Math.max(1.5, s / 22));
          glowDot(0, cv, 50, 3, 'rgba(255,214,140,0.9)');
          // 园内游乐设施：几座彩色帐篷顶
          for (const p of [[-hw * 0.55, -hd * 0.45, [226, 90, 80]], [-hw * 0.6, hd * 0.35, [90, 170, 120]], [hw * 0.55, -hd * 0.5, [240, 190, 70]]]) { cyl(p[0], p[1], 16, 12, 0, 8, N ? [100, 100, 110] : [236, 236, 236], null); cone(p[0], p[1], 19, 12, 8, 22, N ? U.shade(p[2], 0.55) : p[2]); }
        } else {
          if (detail) trees(40, 37, function (u, v) { return u > -hw * 0.1 && Math.abs(v) < hd * 0.5; });
          box(-hw * 0.65, -hd * 0.25, -hw * 0.05, hd * 0.45, 0, 0.6, water, water);                  // 园内湖与海洋池
          // 海洋馆：圆形场馆与玻璃穹顶
          cyl(hw * 0.4, 0, 34, 16, 0, 12, N ? [80, 96, 116] : [220, 228, 236], null); cone(hw * 0.4, 0, 30, 16, 12, 26, N ? [60, 100, 140] : [150, 200, 230]);
          // 观光塔（约 72 m）：塔柱与环形观景舱
          const tu = -hw * 0.6, tv = -hd * 0.55;
          cyl(tu, tv, 3.2, 10, 0, 72, N ? [150, 150, 160] : [236, 236, 240], null);
          cyl(tu, tv, 9, 14, 58, 64, N ? [160, 90, 90] : [226, 92, 72], N ? [180, 110, 110] : [240, 120, 100]);
          glowDot(tu, tv, 72, 3, 'rgba(255,120,90,0.9)');
          // 登山缆车：塔架与缆索，通往南朗山上的园区
          for (let k = 0; k < 4; k++) { const u = hw * 0.15 + k * 45, v = hd * 0.2 + k * 35, h = 18 + k * 20; box(u - 2, v - 2, u + 2, v + 2, 0, h, N ? [120, 120, 130] : [190, 190, 196], null); if (k) line(u - 45, v - 35, h - 20, u, v, h, N ? '#9aa' : '#666a72', Math.max(1, s / 40)); }
          // 园内的几座游乐设施
          for (const p of [[hw * 0.05, -hd * 0.3, [240, 190, 70]], [-hw * 0.2, hd * 0.6, [90, 170, 220]]]) { cyl(p[0], p[1], 14, 12, 0, 7, N ? [100, 100, 110] : [236, 236, 236], null); cone(p[0], p[1], 16, 12, 7, 18, N ? U.shade(p[2], 0.55) : p[2]); }
        }
        break;
      }
      case 'hall': { // 中山纪念堂：八角形宝蓝琉璃瓦大屋顶、四面抱厦
        const wall = [238, 228, 206], blue = [40, 96, 170], gold = [222, 176, 64];
        if (detail) trees(26, 11, function (u, v) { return Math.abs(u) < 70 && Math.abs(v) < 70 || (Math.abs(u) < 16 && v > 0); });
        box(-46, -46, 46, 46, 0, 3, [210, 204, 190]);
        for (const d of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const pu = d[0] * 36, pv = d[1] * 36, w = 12;
          box(pu - w, pv - w, pu + w, pv + w, 3, 15, wall, null);
          hip(pu - w - 3, pv - w - 3, pu + w + 3, pv + w + 3, 15, 22, blue);
        }
        poly(NG(0, 0, 31, 8, Math.PI / 8), 3, 24, wall, null, { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = 'rgba(176,48,40,0.85)'; ctx.lineWidth = Math.max(1, s / 40); ctx.beginPath(); for (let t = 0.2; t < 1; t += 0.3) { ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t); } ctx.stroke(); } });
        eaveN(0, 0, 42, 28, 8, 24, 29, blue, Math.PI / 8);
        cyl(0, 0, 23, 8, 29, 33, wall, null, Math.PI / 8);
        cone(0, 0, 31, 8, 33, 46, blue, Math.PI / 8);
        line(0, 0, 46, 0, 0, 52, U.rgb(gold), Math.max(1.5, s / 22));
        break;
      }
      case 'tower': { // 镇海楼：红砂岩台基、五层红墙绿瓦
        if (lm.style === 'yellowcrane') { // 黄鹤楼（1985 年重建，51 m）：台基上五层，朱红柱廊、层层黄色琉璃瓦飞檐，四面出抱厦，金色宝顶
          const red = [184, 66, 50], yel = N ? [214, 174, 72] : [236, 190, 62];
          box(-26, -26, 26, 26, 0, 4, N ? [104, 100, 96] : [206, 198, 182]);
          for (let k = 0; k < 5; k++) {
            const w = 15.5 - k * 1.7, h0 = 4 + k * 8.4;
            if (k < 3) { box(-w - 4, -w * 0.4, w + 4, w * 0.4, h0, h0 + 5.6, red, null); box(-w * 0.4, -w - 4, w * 0.4, w + 4, h0, h0 + 5.6, red, null); }
            box(-w, -w, w, w, h0, h0 + 5.6, red, null);
            lit(-w, w, w, w, h0 + 1, h0 + 5, 1, 4);
            eaveR(-w - (k < 3 ? 4 : 0), -w - (k < 3 ? 4 : 0), w + (k < 3 ? 4 : 0), w + (k < 3 ? 4 : 0), 3, h0 + 5.6, h0 + 8.4, yel);
          }
          hip(-7, -7, 7, 7, 46, 50, yel);
          line(0, 0, 50, 0, 0, 54, N ? '#ffe08a' : '#c9a03e', Math.max(1.5, s / 20));
          break;
        }
        const red = [176, 58, 46], green = [64, 112, 92];
        box(-18, -13, 18, 13, 0, 5, [160, 112, 96]);
        for (let k = 0; k < 5; k++) {
          const w = 15 - k * 1.1, d = 10.5 - k * 0.9, h0 = 5 + k * 4.6;
          box(-w, -d, w, d, h0, h0 + 3.6, red, null);
          lit(-w, d, w, d, h0, h0 + 3.6, 1, 4);
          eaveR(-w, -d, w, d, 2.6, h0 + 3.6, h0 + 4.6, green);
        }
        hip(-11, -7, 11, 7, 28, 32, green);
        break;
      }
      case 'pagoda': { // 六榕寺：岭南灰瓦殿宇 + 八角九层花塔（57 m）
        const body = [236, 210, 160], eaveC = [168, 64, 46], tile = [98, 100, 104], wallT = [196, 186, 170];
        if (detail) trees(10, 21, function (u, v) { return u > -20; });
        for (let k = 0; k < 2; k++) { const v0 = -30 + k * 34; box(-75, v0, -25, v0 + 18, 0, 7, wallT, null); gable(-77, v0 - 2, -23, v0 + 20, 7, 11, tile, '#3aa37a'); }
        const pu = 30, pv = 0;
        cyl(pu, pv, 11, 8, 0, 2, stone, null, Math.PI / 8);
        for (let k = 0; k < 9; k++) {
          const r = 8.5 - k * 0.45, h0 = 2 + k * 6;
          cyl(pu, pv, r, 8, h0, h0 + 5, body, null, Math.PI / 8);
          lit(pu - r, pv + r * 0.7, pu + r, pv + r * 0.7, h0 + 1, h0 + 4, 1, 3);
          eaveN(pu, pv, r + 2.6, r + 0.5, 8, h0 + 5, h0 + 6, eaveC, Math.PI / 8);
        }
        line(pu, pv, 56, pu, pv, 63, '#c9a03e', Math.max(1.5, s / 20));
        break;
      }
      case 'minaret': { // 怀圣寺光塔：圆柱形光塔（36 m）与礼拜殿
        box(-38, -18, 0, 16, 0, 9, white, null); gable(-40, -20, 2, 18, 9, 13, N ? [70, 80, 90] : [120, 140, 150]);
        cyl(22, 0, 4.5, 14, 0, 33, N ? [150, 146, 138] : [226, 222, 210]);
        cone(22, 0, 4.8, 14, 33, 38, N ? [140, 130, 110] : [200, 190, 160]);
        break;
      }
      case 'temple': case 'traditional': { // 光孝寺 / 五仙观：沿中轴的殿宇；陈家祠 / 农讲所：三路三进岭南祠堂
        const wall = kind === 'temple' ? [214, 172, 96] : [196, 186, 170];
        const tile = kind === 'temple' ? [150, 92, 50] : [96, 98, 102];
        const ridgeC = kind === 'temple' ? '#d9a33a' : '#3aa37a';
        if (kind === 'temple' && lm.w > 150) {
          if (detail) trees(30, 31, function (u, v) { return Math.abs(u) < 60; });
          for (let k = 0; k < 4; k++) { const v0 = -hd + 30 + k * (lm.d - 60) / 4, w = k === 2 ? 34 : 26; box(-w, v0, w, v0 + 22, 0, 9 + (k === 2 ? 4 : 0), wall, null); gable(-w - 3, v0 - 3, w + 3, v0 + 25, 9 + (k === 2 ? 4 : 0), 15 + (k === 2 ? 6 : 0), tile, ridgeC); }
        } else {
          const rows = lm.d > 100 ? 3 : 2, cols = lm.w > 120 ? 3 : 1;
          for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
            const v0 = -hd + 6 + r * (lm.d - 12) / rows, v1 = v0 + (lm.d - 12) / rows * 0.55;
            const u0 = -hw + 6 + q * (lm.w - 12) / cols, u1 = u0 + (lm.w - 12) / cols - 6;
            box(u0, v0, u1, v1, 0, 8, wall, null);
            gable(u0 - 2, v0 - 2, u1 + 2, v1 + 2, 8, 12, tile, ridgeC);
          }
        }
        break;
      }
      case 'church': { // 石室圣心大教堂：哥特式双尖塔（58 m）
        if (lm.style === 'notredame') { // 巴黎圣母院：西立面双塔（69 m，平顶）、中殿与耳堂、半圆形后殿、交叉部尖塔（96 m）
          const st = N ? [110, 104, 96] : [218, 208, 188], rf = N ? [70, 78, 90] : [126, 136, 148];
          ordered([
            [-57, 0, function () { box(-64, -20, -50, 20, 0, 45, st, null); lit(-64, 20, -50, 20, 6, 40, 3, 4); for (const dv of [-12.5, 12.5]) box(-64, dv - 7.5, -50, dv + 7.5, 45, 69, st, U.shade(st, 1.06)); }],
            [0, -18, function () { box(-6, -24, 6, -12, 0, 33, st, null); hip(-7, -25, 7, -11, 33, 40, rf); }],
            [-5, 0, function () { box(-50, -12, 40, 12, 0, 33, st, null); gable(-50, -13, 40, 13, 33, 43, rf); lit(-50, 12, 40, 12, 8, 28, 2, 10); line(0, 0, 43, 0, 0, 96, N ? '#c8c0b0' : '#5a6070', Math.max(1.4, s / 22)); cone(0, 0, 3.5, 8, 43, 70, rf); }],
            [0, 18, function () { box(-6, 12, 6, 24, 0, 33, st, null); hip(-7, 11, 7, 25, 33, 40, rf); }],
            [48, 0, function () { cyl(48, 0, 12, 12, 0, 30, st, null); cone(48, 0, 13, 12, 30, 40, rf); }],
          ]);
          break;
        }
        const st = N ? [96, 96, 98] : [158, 156, 150], dark = N ? [70, 70, 74] : [112, 110, 106];
        box(-48, -15, 20, 15, 0, 22, st, null);
        gable(-50, -16, 20, 16, 22, 31, dark);
        lit(-48, 15, 20, 15, 4, 18, 2, 8);
        for (const dv of [-11, 11]) { box(20, dv - 6, 32, dv + 6, 0, 34, st, null); cone(26, dv, 7.5, 4, 34, 58, dark, Math.PI / 4); }
        box(20, -5, 30, 5, 0, 24, st, U.shade(st, 1.1));
        dot(31, 0, 15, Math.max(1.5, s / 18), N ? 'rgba(255,200,120,0.9)' : 'rgba(90,110,150,0.85)');
        break;
      }
      case 'colonial': {
        if (lm.w > 500) { // 沙面：欧式别墅街区、林荫大道与白天鹅宾馆
          const wallC = [[236, 212, 156], [232, 220, 196], [214, 190, 160], [226, 200, 170]], roofC = [170, 86, 64];
          const rowsV = [-80, 50];
          for (let r = 0; r < 2; r++) {
            for (let k = 0; k < 9; k++) {
              const u0 = -hw + 40 + k * (lm.w - 140) / 9, v0 = rowsV[r], w = 52, d = 46;
              if (r === 1 && k === 0) continue;
              const col = wallC[(k + r) % 4], h = 10 + U.hash2(k, r, 5) * 9;
              box(u0, v0, u0 + w, v0 + d, 0, h, col, null);
              lit(u0, v0 + d, u0 + w, v0 + d, 2, h - 2, 2, 5);
              hip(u0 - 2, v0 - 2, u0 + w + 2, v0 + d + 2, h, h + 4, roofC);
            }
          }
          if (detail) trees(40, 41, function (u, v) { return !((v > -30 && v < 40) || v < -90 - 10 || v > 110); });
          // 白天鹅宾馆（1983）：岛西南角的白色板楼
          box(-hw + 10, 95, -hw + 150, 140, 0, 14, white, null);
          box(-hw + 30, 100, -hw + 140, 128, 14, 100, white, U.shade(white, 1.05));
          lit(-hw + 30, 128, -hw + 140, 128, 18, 96, 12, 10);
        } else { // 黄埔军校：灰瓦合院
          const wallC = [214, 206, 188], tile = [92, 96, 100];
          if (detail) trees(18, 51, function (u, v) { return Math.abs(u) < 70 && Math.abs(v) < 70; });
          box(-60, -60, 60, -44, 0, 9, wallC, null); gable(-62, -62, 62, -42, 9, 13, tile);
          box(-60, 44, 60, 60, 0, 9, wallC, null); gable(-62, 42, 62, 62, 9, 13, tile);
          box(-60, -44, -44, 44, 0, 9, wallC, null); box(44, -44, 60, 44, 0, 9, wallC, null);
          lit(-60, 60, 60, 60, 2, 8, 2, 10);
          box(-14, 60, 14, 74, 0, 11, [236, 232, 220], null); hip(-16, 58, 16, 76, 11, 15, tile);
        }
        break;
      }
      case 'bund': { // 外滩建筑群：沿江一字排开的石砌大楼（u 沿江岸），海关大楼钟楼、汇丰银行穹顶、和平饭店绿色金字塔顶
        const sc = N ? [120, 114, 104] : [224, 216, 198], green = N ? [70, 110, 96] : [86, 140, 118], n = 13, gap = 6, bw = (lm.w - gap * (n - 1)) / n;
        const parts = [];
        for (let k = 0; k < n; k++) {
          const u0 = -hw + k * (bw + gap), u1 = u0 + bw, uc = (u0 + u1) / 2, h = 24 + 14 * U.hash2(k, 3, 77);
          parts.push([uc, 0, function () {
            box(u0, -hd, u1, hd, 0, h, sc, null); lit(u0, hd, u1, hd, 3, h - 3, Math.max(2, Math.round(h / 6)), 3);
            if (k === 5) { cyl(uc, 0, Math.min(14, bw * 0.3), 12, h, h + 6, sc, null); eaveN(uc, 0, Math.min(14, bw * 0.3), 2, 12, h + 6, h + 16, N ? [96, 104, 116] : [160, 168, 176]); }   // 汇丰银行大楼穹顶
            if (k === 6) { box(uc - 9, -9, uc + 9, 9, h, 66, sc, null); hip(uc - 10, -10, uc + 10, 10, 66, 79, sc); dot(uc, 9, 58, Math.max(1.4, s / 22), N ? '#ffe08a' : '#f4f1e8'); }   // 海关大楼钟楼
            if (k === 9) { box(uc - 10, -10, uc + 10, 10, h, 58, sc, null); hip(uc - 11, -11, uc + 11, 11, 58, 77, green); }   // 和平饭店
          }]);
        }
        ordered(parts);
        break;
      }
      case 'palace': { // 宫殿式合院：石材四翼围合庭院、芒萨尔屋顶（市政厅、卢森堡宫）；style 'keep' 为城堡（围墙与 52 m 主塔），'louvre' 为卢浮宫
        const wall = N ? [116, 110, 100] : [228, 220, 202], rf = N ? [72, 80, 92] : [150, 160, 172], hh = 24;
        const wing = function (u0, v0, u1, v1) { return [(u0 + u1) / 2, (v0 + v1) / 2, function () { box(u0, v0, u1, v1, 0, hh, wall, null); mansardRoofL(u0, v0, u1, v1, hh, hh + 7, rf); lit(u0, v1, u1, v1, 3, hh - 3, 2, Math.max(3, Math.round((u1 - u0) / 30))); }]; };
        if (lm.style === 'keep') { // 万塞讷城堡：长方形城墙、角楼与主塔
          const sw = N ? [104, 100, 92] : [206, 198, 182], t = 8;
          const wallSeg = function (u0, v0, u1, v1) { return [(u0 + u1) / 2, (v0 + v1) / 2, function () { box(u0, v0, u1, v1, 0, 14, sw, null); }]; };
          const parts = [wallSeg(-hw, -hd, hw, -hd + t), wallSeg(-hw, hd - t, hw, hd), wallSeg(-hw, -hd + t, -hw + t, hd - t), wallSeg(hw - t, -hd + t, hw, hd - t)];
          for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([q[0] * (hw - 6), q[1] * (hd - 6), function () { box(q[0] * (hw - 6) - 7, q[1] * (hd - 6) - 7, q[0] * (hw - 6) + 7, q[1] * (hd - 6) + 7, 0, 22, sw, null); }]);
          parts.push([-hw + 50, 0, function () { box(-hw + 34, -16, -hw + 66, 16, 0, 52, sw, U.shade(sw, 1.05)); lit(-hw + 34, 16, -hw + 66, 16, 8, 46, 4, 3); }]);
          ordered(parts);
          break;
        }
        if (lm.style === 'clock' || lm.style === 'spire') { // 江汉关：石砌大楼与正面钟楼；上海展览中心：俄式主楼与镀金尖塔（lm.h 为塔尖高度）
          const sw = N ? [116, 110, 100] : [222, 214, 196], H = lm.h || 46, tw = lm.style === 'spire' ? 14 : 9;
          ordered([
            [0, -hd * 0.3, function () { box(-hw, -hd, hw, hd * 0.4, 0, 20, sw, null); lit(-hw, hd * 0.4, hw, hd * 0.4, 3, 18, 3, 10); }],
            [0, hd * 0.5, function () {
              const v0 = hd * 0.4 - tw * 2;
              box(-tw, v0, tw, v0 + tw * 2, 0, H * (lm.style === 'spire' ? 0.42 : 0.82), sw, null);
              if (lm.style === 'spire') { eaveN(0, v0 + tw, tw * 0.9, tw * 0.5, 8, H * 0.42, H * 0.55, sw, Math.PI / 8); line(0, v0 + tw, H * 0.55, 0, v0 + tw, H, N ? '#ffe08a' : '#c9a03e', Math.max(1.4, s / 22)); }
              else { hip(-tw - 1, v0 - 1, tw + 1, v0 + tw * 2 + 1, H * 0.82, H, N ? [70, 96, 90] : [92, 132, 118]); dot(0, v0 + tw * 2, H * 0.7, Math.max(1.4, s / 22), N ? '#ffe08a' : '#f4f1e8'); }
            }],
          ]);
          break;
        }
        if (lm.style !== 'louvre') {
          const iw = Math.min(26, hw * 0.3), id2 = Math.min(26, hd * 0.3);
          ordered([wing(-hw, -hd, hw, -hd + id2), wing(-hw, -hd + id2, -hw + iw, hd - id2), wing(hw - iw, -hd + id2, hw, hd - id2), wing(-hw, hd - id2, hw, hd)]);
          break;
        }
        // 卢浮宫：东端方形的卡雷庭院，沿里沃利街与塞纳河的两翼长廊（南翼为大画廊）；1989 年起拿破仑庭院中的玻璃金字塔
        const ce = hw - 80;   // 卡雷庭院中心
        const parts = [
          wing(-hw, -hd, ce - 80, -hd + 22), wing(-hw, hd - 22, ce - 80, hd),
          wing(ce - 80, -80, ce + 80, -58), wing(ce - 80, 58, ce + 80, 80), wing(ce - 80, -58, ce - 58, 58), wing(ce + 58, -58, ce + 80, 58),
          wing(ce - 102, -hd + 22, ce - 80, -80), wing(ce - 102, 80, ce - 80, hd - 22),
        ];
        if ((this.styleYear || 0) >= 1989) parts.push([ce - 175, 0, function () { const c = T(ce - 175, 0); pyramidN(ctx, pj, Rc(ce - 192, -17, ce - 158, 17), c[0], c[1], 0, 21.6 * E, N ? [130, 176, 220] : [190, 214, 230]); }]);
        ordered(parts);
        break;
      }
      case 'dome': { // 穹顶建筑：先贤祠、荣军院（金顶）、圣心大教堂（白色石灰华与小穹顶）、大皇宫（玻璃筒拱与玻璃穹顶）
        const H = lm.h || 60, sty = lm.style || '';
        const wall = sty === 'white' ? (N ? [136, 134, 128] : [246, 244, 236]) : stone;
        const domeC = sty === 'gold' ? (N ? [196, 160, 80] : [206, 174, 96]) : sty === 'white' ? wall : sty === 'glass' ? (N ? [96, 136, 176] : [198, 214, 226]) : sty === 'copper' ? (N ? [74, 116, 104] : [122, 170, 150]) : (N ? [84, 92, 104] : [146, 156, 166]);
        const bw = Math.min(hw, 70), bd = Math.min(hd, 60);
        const domeAt = function (cu, cv, R, h0) { // 半球近似：逐级收小的截锥环
          let r0 = R; const n = 16;
          for (let k = 1; k <= 5; k++) { const a = k / 10 * Math.PI, r1 = Math.max(R * Math.cos(a), R * 0.08); eaveN(cu, cv, r0, r1, n, h0 + R * 0.92 * Math.sin((k - 1) / 10 * Math.PI), h0 + R * 0.92 * Math.sin(a), domeC); r0 = r1; }
          return h0 + R * 0.92;
        };
        if (sty === 'glass') {
          box(-bw, -bd * 0.45, bw, bd * 0.45, 0, 20, wall, null);
          gable(-bw, -bd * 0.45, bw, bd * 0.45, 20, 32, domeC);
          lit(-bw, bd * 0.45, bw, bd * 0.45, 3, 17, 2, 14);
          const top = domeAt(0, 0, bd * 0.38, 26);
          line(0, 0, top, 0, 0, H, N ? '#ffe2a0' : '#8a8f96', Math.max(1, s / 30));
          break;
        }
        box(-bw, -bd, bw, bd, 0, H * 0.3, wall, null);
        lit(-bw, bd, bw, bd, 3, H * 0.3 - 3, 2, 10);
        const R = Math.min(bw, bd) * 0.42, h0 = H * 0.3, dh = H * 0.25;
        if (sty === 'white') for (const q of [[-1, -1], [1, -1]]) { const cu = q[0] * bw * 0.62, cv = q[1] * bd * 0.55; cyl(cu, cv, R * 0.36, 12, h0, h0 + dh * 0.5, wall, null); domeAt(cu, cv, R * 0.38, h0 + dh * 0.5); }
        cyl(0, 0, R, 16, h0, h0 + dh, wall, null);
        if (N && s >= 16) lit(-R, R, R, R, h0 + 3, h0 + dh - 3, 1, 6);
        const top = domeAt(0, 0, R * 1.04, h0 + dh);
        cyl(0, 0, R * 0.16, 8, top - 1, top + (H - top) * 0.55, wall, null);
        line(0, 0, top + (H - top) * 0.55, 0, 0, H, sty === 'gold' ? (N ? '#ffe08a' : '#c9a03e') : (N ? '#c8c0b0' : '#7a7f86'), Math.max(1.2, s / 26));
        if (sty === 'white') for (const q of [[-1, 1], [1, 1]]) { const cu = q[0] * bw * 0.62, cv = q[1] * bd * 0.55; cyl(cu, cv, R * 0.36, 12, h0, h0 + dh * 0.5, wall, null); domeAt(cu, cv, R * 0.38, h0 + dh * 0.5); }
        break;
      }
      case 'arch': {
        if (lm.style === 'defense') { // 新凯旋门：近 110 m 的空心立方体（白色大理石与玻璃），开口沿历史轴线
          const c = N ? [150, 158, 174] : [240, 242, 245], gl = { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = N ? 'rgba(255,214,140,0.35)' : 'rgba(150,164,182,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let t = 0.125; t < 1; t += 0.125) { ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t); } ctx.stroke(); } };
          box(-62, -62, 62, 62, 0, 4, N ? [96, 100, 110] : [222, 222, 218]);
          ordered([
            [0, -45, function () { box(-56, -54, 56, -36, 4, 92, c, null, gl); }],
            [0, 0, function () { box(-56, -54, 56, 54, 92, 110, c, U.shade(c, 1.04)); }],
            [0, 45, function () { box(-56, 36, 56, 54, 4, 92, c, null, gl); }],
          ]);
          break;
        }
        // 凯旋门：高 50 m、宽 45 m、深 22 m，主拱沿香榭丽舍大街轴线贯通
        const c = N ? [124, 118, 108] : [224, 216, 198];
        ordered([
          [0, -15, function () { box(-11, -22.5, 11, -7.3, 0, 29, c, null); }],
          [0, 0, function () { box(-11, -22.5, 11, 22.5, 29, 50, c, U.shade(c, 1.05)); if (s >= 16) { line(-11, -22.5, 44, -11, 22.5, 44, N ? 'rgba(255,214,140,0.4)' : 'rgba(120,110,96,0.45)', 1); line(-11, 22.5, 44, 11, 22.5, 44, N ? 'rgba(255,214,140,0.4)' : 'rgba(120,110,96,0.45)', 1); } }],
          [0, 15, function () { box(-11, 7.3, 11, 22.5, 0, 29, c, null); }],
        ]);
        if (N && s >= 16) dot(0, 0, 50, Math.max(1.2, s / 30), 'rgba(255,214,140,0.9)');
        break;
      }
      case 'museum': { // 南越王墓博物馆：红砂岩阶梯体量与覆斗形墓室
        if (lm.style === 'ding') { // 上海博物馆：方形基座、圆形顶部（「天圆地方」，形如青铜鼎）
          const sc = N ? [116, 110, 100] : [214, 202, 178];
          box(-58, -58, 58, 58, 0, 6, sc, null); box(-50, -50, 50, 50, 6, 18, sc, null); lit(-50, 50, 50, 50, 8, 16, 1, 8);
          cyl(0, 0, 44, 24, 18, 25, sc, null); eaveN(0, 0, 44, 52, 24, 25, 29.5, U.shade(sc, 1.05));
          break;
        }
        if (lm.style === 'crown') { // 中国馆（2010 年世博会）：四根核心筒托起倒置的斗拱形红色展厅（63 m）
          const red = N ? [170, 50, 44] : [196, 44, 36], core = N ? [140, 46, 40] : [176, 40, 32];
          box(-70, -70, 70, 70, 0, 4, N ? [96, 92, 90] : [206, 196, 186]);
          for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(q[0] * 26 - 9, q[1] * 26 - 9, q[0] * 26 + 9, q[1] * 26 + 9, 4, 33, core, null);
          const c0 = T(0, 0);
          for (let k = 0; k < 4; k++) { const a = 36 + k * 8.5, b = a + 8.5, h0 = 33 + k * 7.5; frustumRings(ctx, pj, Rc(-a, -a, a, a), Rc(-b, -b, b, b), h0 * E, (h0 + 7.5) * E, red, c0[0], c0[1], k < 3); }
          break;
        }
        const st = [178, 98, 76];
        if (detail) trees(10, 61, function (u, v) { return Math.abs(u) < 60 && Math.abs(v) < 50; });
        box(-55, -40, 55, 40, 0, 10, st, U.shade(st, 1.1));
        box(-35, -26, 35, 26, 10, 18, st, U.shade(st, 1.15));
        hip(-24, -18, 24, 18, 18, 24, N ? [110, 140, 160] : [150, 196, 214]);
        break;
      }
      case 'memorial': { // 陵园：中轴大道、纪念碑与林木
        if (detail) trees(70, 71, function (u, v) { return Math.abs(u) < 34 || Math.hypot(u, v) < 60; });
        const plat = [212, 210, 204];
        box(-30, -30, 30, 30, 0, 2, plat, U.shade(plat, 1.06));
        box(-18, -18, 18, 18, 2, 4, plat, U.shade(plat, 1.06));
        box(-4, -4, 4, 4, 4, 40, [244, 244, 240], null);
        hip(-4.5, -4.5, 4.5, 4.5, 40, 45, [230, 230, 226]);
        break;
      }
      case 'stadium': { // 天河体育中心（主场 + 体育馆 + 游泳馆）/ 越秀山体育场
        const big = lm.w > 500;
        const bowl = function (cu, cv, rx, ry, H, roofOn) {
          const n = 36;
          const ringAt = function (sc) { const o = []; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; o.push(T(cu + Math.cos(t) * rx * sc, cv + Math.sin(t) * ry * sc)); } return o; };
          fillPts(ctx, ringAt(0.72).map(function (p) { return pj(p[0], p[1], 0); }), '#c8644a');
          fillPts(ctx, ringAt(0.6).map(function (p) { return pj(p[0], p[1], 0); }), '#79b85e');
          prism(ctx, pj, ringAt(1), 0, H * E, N ? [92, 100, 116] : [206, 210, 216], null, { lines: function (fc, q) { if (!N || s < 16) return; ctx.fillStyle = 'rgba(255,214,140,0.7)'; ctx.fillRect((q[0][0] + q[1][0]) / 2 - 1, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4 - 1, 2, 2); } });
          prism(ctx, pj, ringAt(0.76), 0, H * 0.3 * E, N ? [84, 92, 106] : [196, 200, 208], null);   // 三维：看台前沿的矮墙（从场内看不到看台底下）
          const top = ringAt(1).map(function (p) { return pj(p[0], p[1], H * E); }), inner = ringAt(0.76).map(function (p) { return pj(p[0], p[1], H * 0.3 * E); });
          ctx.fillStyle = N ? '#5a6474' : '#b9c0c8'; ctx.beginPath(); top.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); inner.slice().reverse().forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill('evenodd');
          if (roofOn) {
            const rin = ringAt(0.86).map(function (p) { return pj(p[0], p[1], H * 1.12 * E); });
            ctx.fillStyle = N ? 'rgba(220,230,245,0.85)' : 'rgba(250,250,252,0.96)'; ctx.beginPath(); top.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); rin.slice().reverse().forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill('evenodd');
          }
          if (N && s >= 16) for (const q of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { line(cu + q[0] * rx * 0.95, cv + q[1] * ry * 0.95, H, cu + q[0] * rx * 0.95, cv + q[1] * ry * 0.95, H + 18, '#9aa4b2', 1); dot(cu + q[0] * rx * 0.95, cv + q[1] * ry * 0.95, H + 18, 2.2, 'rgba(255,250,220,0.95)'); }
        };
        if (big) {
          if (detail) trees(60, 81, function (u, v) { return Math.hypot(u / 180, (v + 70) / 150) < 1.1 || (Math.abs(u + 270) < 90 && Math.abs(v - 170) < 70) || (Math.abs(u - 270) < 90 && Math.abs(v - 170) < 60); });
          bowl(0, -70, 150, 125, 30, true);
          cyl(-270, 170, 70, 20, 0, 18, N ? [96, 104, 120] : [220, 222, 226], null, 0, 52);
          eaveN(-270, 170, 74, 30, 20, 18, 30, N ? [130, 140, 160] : [196, 206, 220]);
          box(200, 125, 340, 210, 0, 16, N ? [86, 108, 128] : [196, 220, 236]);
        } else bowl(0, 0, lm.w / 2 * 0.95, lm.d / 2 * 0.95, 14, false);
        break;
      }
      case 'campus': { // 校园标志建筑 + 周围一圈教学楼、图书馆与林荫（其余校舍由街区建筑生成）
        const brick = [180, 92, 70], tile = [80, 124, 98];
        const R0 = Math.min(150, Math.min(hw, hd) * 0.55);
        if (R0 > 70) {
          const pal = lm.style === 'palace' || lm.id === 'scut' ? [[214, 204, 180], [70, 120, 96]] : lm.id === 'sysu' ? [brick, [96, 100, 106]] : [N ? [104, 110, 124] : [232, 230, 224], null];
          const parts = [];
          // [u, v, 半长, 半宽, 高]：长条形低层教学楼（两侧）、图书馆（前方）与实验楼（后方）
          const blocks = [[-R0, -R0 * 0.5, 14, 42, 9], [R0, -R0 * 0.5, 14, 42, 9], [-R0, R0 * 0.5, 14, 42, 9], [R0, R0 * 0.5, 14, 42, 9], [0, R0, 46, 20, 12], [0, -R0, 40, 14, 8]];
          blocks.forEach(function (bk, q) {
            parts.push([bk[0], bk[1], function () {
              const wall = N ? U.shade(pal[0], 0.55) : pal[0], uw = bk[2], vw = bk[3], hh = bk[4];
              box(bk[0] - uw, bk[1] - vw, bk[0] + uw, bk[1] + vw, 0, hh, wall, pal[1] ? null : undefined);
              if (pal[1]) hip(bk[0] - uw - 2, bk[1] - vw - 2, bk[0] + uw + 2, bk[1] + vw + 2, hh, hh + 6, N ? U.shade(pal[1], 0.6) : pal[1]);
              lit(bk[0] - uw, bk[1] + vw, bk[0] + uw, bk[1] + vw, 2, hh - 2, 2, 6);
            }]);
          });
          if (detail) trees(Math.round(R0 / 4), 57, function (u, v) { return Math.abs(u) < 40 && Math.abs(v) < 30 || blocks.some(function (bk) { return Math.abs(u - bk[0]) < bk[2] + 6 && Math.abs(v - bk[1]) < bk[3] + 6; }); });
          // 视线后方的楼先画，前方的楼在标志建筑之后画（见本分支末尾）
          ordered(parts.filter(function (p) { return depth(p[0], p[1]) < 0; }));
          campusFront = parts.filter(function (p) { return depth(p[0], p[1]) >= 0; });
        }
        if (lm.id === 'sysu') { // 怀士堂：红砖钟楼礼堂
          box(-24, -12, 24, 12, 0, 12, brick, null); hip(-26, -14, 26, 14, 12, 18, tile);
          box(-6, -20, 6, -8, 0, 26, brick, null); hip(-7, -21, 7, -7, 26, 32, tile);
          lit(-24, 12, 24, 12, 2, 10, 2, 6);
        } else if (lm.id === 'scut' || lm.style === 'palace') { // 华工一号楼、武汉大学等：宫殿式教学楼
          box(-40, -10, 40, 10, 0, 16, [214, 204, 180], null); hip(-43, -13, 43, 13, 16, 24, [70, 120, 96]);
          box(-12, -14, 12, 14, 0, 20, [214, 204, 180], null); hip(-14, -16, 14, 16, 20, 28, [70, 120, 96]);
          lit(-40, 10, 40, 10, 2, 14, 3, 10);
        } else { // 暨南大学：现代礼堂与校门
          box(-30, -22, 30, 22, 0, 14, white, U.shade(white, 1.04)); cyl(0, 0, 16, 16, 14, 20, N ? [110, 130, 160] : [170, 196, 222]);
          lit(-30, 22, 30, 22, 2, 12, 2, 8);
        }
        if (campusFront) ordered(campusFront);
        break;
      }
      case 'rail': { // 广州站：长条站房 + 中央钟楼 + 站台雨棚；广州东站：大跨度方形站房
        const body = N ? [86, 92, 104] : [226, 226, 230];
        if (lm.style === 'round') { // 上海南站：圆形站房与圆盘形屋顶
          const R = Math.min(hw, hd) * 0.8;
          cyl(0, 0, R * 0.9, 32, 0, 14, body, null);
          lit(-R * 0.9, R * 0.6, R * 0.9, R * 0.6, 3, 12, 2, 12);
          eaveN(0, 0, R * 1.02, R * 0.4, 32, 14, 24, N ? [120, 150, 186] : [196, 214, 230]);
          break;
        }
        if (lm.w > 500) {
          for (let k = 0; k < 5; k++) { const v0 = -120 + k * 34; box(-hw + 40, v0, hw - 40, v0 + 18, 6, 9, N ? [70, 76, 88] : [196, 200, 206], N ? [96, 104, 118] : [212, 216, 222]); }
          box(-170, 60, 170, 110, 0, 22, body, U.shade(body, 1.04));
          lit(-170, 110, 170, 110, 3, 20, 3, 16);
          box(-12, 64, 12, 96, 22, 52, [214, 208, 196], null);
          hip(-13, 63, 13, 97, 52, 58, [140, 60, 50]);
          dot(0, 97, 45, Math.max(1.5, s / 22), N ? '#ffe08a' : '#ffffff');
        } else {
          box(-hw + 20, -hd + 30, hw - 20, hd - 50, 0, 36, body, null);
          lit(-hw + 20, hd - 50, hw - 20, hd - 50, 4, 32, 4, 12);
          const n = 12; ctx.fillStyle = N ? 'rgba(140,170,210,0.95)' : 'rgba(176,204,232,0.98)'; ctx.beginPath();
          for (let k = 0; k <= n; k++) { const t = k / n, w = T(-hw + 20 + (lm.w - 40) * t, -hd + 30), p = pj(w[0], w[1], (36 + 10 * Math.sin(Math.PI * t)) * E); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
          for (let k = n; k >= 0; k--) { const t = k / n, w = T(-hw + 20 + (lm.w - 40) * t, hd - 50), p = pj(w[0], w[1], (36 + 10 * Math.sin(Math.PI * t)) * E); ctx.lineTo(p[0], p[1]); }
          ctx.fill();
        }
        break;
      }
      case 'station2': { // 车站（附加模型）：盖在铁路上的两跨低矮站台雨棚 + 一侧的站房（玻璃门厅朝外）
        const sd = lm.side || 1, cw = 20, roofC = N ? [88, 100, 120] : [214, 222, 232], hallC = N ? [96, 102, 116] : [234, 232, 228];
        const parts = [];
        if (lm.tracks) parts.push([0, 0, function () {
          for (const v0 of [-cw, 0]) box(-hw * 0.95, v0 + 1, hw * 0.95, v0 + cw - 1, 5.5, 6.6, roofC, U.shade(roofC, 1.06));
          for (const vv of [-cw / 2, cw / 2]) glowLine(-hw * 0.9, vv, 5.4, hw * 0.9, vv, 5.4, 'rgba(255,240,210,0.95)', Math.max(1, s / 28));   // 雨棚下的灯带
        }]);
        const hv = lm.tracks ? sd * (cw + 20) : 0, hu = lm.tracks ? 64 : hw;
        parts.push([0, hv, function () {
          box(-hu, hv - 14, hu, hv + 14, 0, 12, hallC, null);
          box(-hu + 8, hv + sd * 14 - (sd > 0 ? 0.6 : 0), hu - 8, hv + sd * 14 + (sd > 0 ? 0 : 0.6), 1.5, 10.5, glass, null);   // 门厅玻璃
          eaveR(-hu, hv - 14, hu, hv + 14, 3, 12, 15, roofC);
          lit(-hu + 8, hv + sd * 14, hu - 8, hv + sd * 14, 2, 10, 2, 10);
          glowFace(-hu + 8, hv + sd * 14, hu - 8, hv + sd * 14, 1.5, 10.5, 'rgba(255,214,150,0.6)');
        }]);
        ordered(parts);
        break;
      }
      case 'airport': { // 机场（附加模型）：放在地面图的停机坪上——与跑道平行的航站楼、登机廊桥与停机位上的客机、塔台；+v 一侧朝向跑道
        const body = N ? [96, 104, 118] : [236, 238, 242], roof = N ? [120, 134, 156] : [206, 216, 228], td = 18;
        const plane = function (u, v, tail) {
          return function () {
            const wc = N ? [150, 156, 168] : [250, 250, 252], k = 1.1;
            poly([T(u - 18 * k, v + 3 * k), T(u + 18 * k, v + 3 * k), T(u + 3 * k, v - 3 * k), T(u - 3 * k, v - 3 * k)], 2.6, 3.1, wc, U.shade(wc, 0.92));   // 主翼
            box(u - 2.2 * k, v - 21 * k, u + 2.2 * k, v + 21 * k, 1.2, 5.2, wc, U.shade(wc, 1.02));   // 机身（机头朝航站楼）
            poly([T(u - 7 * k, v + 18 * k), T(u + 7 * k, v + 18 * k), T(u + 2 * k, v + 14 * k), T(u - 2 * k, v + 14 * k)], 4.6, 5.0, wc, null);   // 平尾
            box(u - 0.5 * k, v + 14 * k, u + 0.5 * k, v + 21 * k, 5, 11, tail, U.shade(tail, 1.05));   // 垂尾（航空公司色）
            glowDot(u, v - 21 * k, 3, Math.max(0.8, s / 50), 'rgba(255,255,255,0.9)');
          };
        };
        const tails = [[200, 54, 48], [36, 92, 170], [24, 140, 110], [226, 150, 40]];
        const parts = [[0, 0, function () {
          box(-hw, -td, hw, td, 0, 11, body, null);
          box(-hw + 6, td - 0.6, hw - 6, td, 1.5, 9.5, glass, null);   // 朝停机坪的玻璃幕墙
          lit(-hw + 6, td, hw - 6, td, 2, 9, 2, 16);
          eaveR(-hw, -td, hw, td, 5, 11, 14, roof);
          glowFace(-hw + 6, td, hw - 6, td, 1.5, 9.5, 'rgba(255,214,160,0.6)');
        }]];
        for (let k = 0; k < 3; k++) {
          const u = -hw * 0.6 + k * hw * 0.6;
          parts.push([u, td + 14, function () { box(u - 1.8, td, u + 1.8, td + 26, 4, 7, N ? [110, 116, 128] : [212, 214, 218]); }]);   // 登机廊桥
          parts.push([u, td + 52, plane(u, td + 52, tails[(k + Math.round(lm.x * 7)) % 4])]);
        }
        for (const u of [-hw * 0.9, 0, hw * 0.9]) parts.push([u, td + 92, function () {   // 机坪高杆灯
          line(u, td + 92, 0, u, td + 92, 20, N ? '#8c96a6' : '#9aa2ae', Math.max(0.6, s / 70));
          glowDot(u, td + 92, 20, Math.max(2, s / 14), 'rgba(255,236,200,0.95)');
        }]);
        parts.push([-hw - 26, -td + 6, function () {   // 塔台
          cyl(-hw - 26, -td + 6, 4.5, 12, 0, 30, body, null);
          cyl(-hw - 26, -td + 6, 7.5, 12, 30, 35, glass, null);
          cyl(-hw - 26, -td + 6, 8.2, 12, 35, 36.5, roof, null);
          line(-hw - 26, -td + 6, 36.5, -hw - 26, -td + 6, 44, N ? '#c8d0dc' : '#6a7280', Math.max(0.8, s / 50));
          glowDot(-hw - 26, -td + 6, 32.5, Math.max(1.6, s / 18), 'rgba(170,255,220,0.9)');
          if (N) dot(-hw - 26, -td + 6, 44, Math.max(1, s / 36), '#ff5a4a');
        }]);
        ordered(parts);
        break;
      }
      case 'expo': { // 琶洲会展中心：三排展馆的波浪形屋面
        const n = 30;
        for (let r = 0; r < 3; r++) {
          const v0 = -hd + 70 + r * (lm.d - 140) / 3, v1 = v0 + (lm.d - 140) / 3 - 50;
          box(-hw + 60, v0, hw - 60, v1, 0, 22, N ? [70, 84, 102] : [210, 222, 232], null);
          lit(-hw + 60, v1, hw - 60, v1, 3, 18, 2, 24);
          for (let side = 0; side < 2; side++) {
            ctx.fillStyle = side ? (N ? '#8fa6c0' : '#eef3f7') : (N ? '#6e86a2' : '#cfdbe6');
            ctx.beginPath();
            const va = side ? (v0 + v1) / 2 : v0, vb = side ? v1 : (v0 + v1) / 2;
            for (let k = 0; k <= n; k++) { const t = k / n, w = T(-hw + 60 + (lm.w - 120) * t, va), p = pj(w[0], w[1], (22 + 9 * Math.abs(Math.sin(t * Math.PI * 5))) * E); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
            for (let k = n; k >= 0; k--) { const t = k / n, w = T(-hw + 60 + (lm.w - 120) * t, vb), p = pj(w[0], w[1], (22 + 9 * Math.abs(Math.sin(t * Math.PI * 5))) * E); ctx.lineTo(p[0], p[1]); }
            ctx.fill();
          }
        }
        break;
      }
      case 'tvtower': { // 广州塔：扭转收腰的钢结构网格外筒（454 m）+ 天线桅杆（600 m）
        if (lm.style === 'pearl' || lm.style === 'needle') {
          const b0 = pj(lm.x, lm.y, 0);
          ctx.fillStyle = TH.modelShadow; ctx.beginPath(); ctx.ellipse(b0[0], b0[1], 40 / CMM * s, 18 / CMM * s, 0, 0, Math.PI * 2); ctx.fill();
          const conc = N ? [150, 154, 170] : [222, 224, 228];
          // 球体：沿高度分成若干截锥环（下半逐渐放大、上半逐渐收小）
          const sphere = function (cu, cv, hc, R, col) {
            const n = 16, steps = 10; let r0 = R * 0.12, h0 = hc - R;
            for (let k = 1; k <= steps; k++) { const a = -Math.PI / 2 + k / steps * Math.PI, r1 = Math.max(R * 0.12, R * Math.cos(a)), h1 = hc + R * Math.sin(a); eaveN(cu, cv, r0, r1, n, h0, h1, col); r0 = r1; h0 = h1; }
          };
          if (lm.style === 'pearl') { // 东方明珠（1994，468 m）：三根立柱与三根斜撑，下球体（68–118 m）、上球体（250–295 m）、太空舱（335–349 m）
            const H = lm.h || 468, pink = N ? [236, 100, 176] : [204, 86, 136], lw = Math.max(1, s / 30);
            for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; line(Math.cos(a) * 46, Math.sin(a) * 46, 0, Math.cos(a) * 18, Math.sin(a) * 18, 80, N ? '#9aa4c0' : '#c8ccd4', lw * 2.2); }
            for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; cyl(Math.cos(a) * 10, Math.sin(a) * 10, 4.5, 8, 0, 335, conc, null); }
            sphere(0, 0, 93, 25, pink);
            for (const hc of [140, 175, 210]) sphere(0, 0, hc, 5.5, pink);   // 中间的小球
            sphere(0, 0, 272, 22.5, pink);
            sphere(0, 0, 342, 7, pink);
            cyl(0, 0, 3, 8, 349, 370, conc, null);
            line(0, 0, 370, 0, 0, H, N ? '#e8ecff' : '#a0a6b0', Math.max(1, s / 30));
            if (N) dot(0, 0, H, Math.max(1.2, s / 24), '#ff4d6d');
          } else { // 混凝土电视塔（龟山电视塔，221 m）：收分塔身、塔楼与天线
            const H = lm.h || 221, glassC = N ? [110, 160, 220] : [176, 200, 222];
            eaveN(0, 0, 9, 5, 12, 0, H * 0.62, conc);
            eaveN(0, 0, 5.5, 15, 16, H * 0.62, H * 0.66, conc);
            cyl(0, 0, 15, 16, H * 0.66, H * 0.71, glassC, null);
            eaveN(0, 0, 15, 6, 16, H * 0.71, H * 0.74, conc);
            cyl(0, 0, 3.5, 8, H * 0.74, H * 0.84, conc, null);
            line(0, 0, H * 0.84, 0, 0, H, N ? '#e8ecff' : '#a0a6b0', Math.max(1, s / 30));
            if (N) dot(0, 0, H, Math.max(1.2, s / 24), '#ff4d6d');
          }
          break;
        }
        // 白天：中灰立柱与斜撑、深灰圆环、深灰混凝土核心筒、灰色桅杆（顶部红色航空障碍灯）；夜间：结构内嵌的彩色 LED 灯光
        const H = 454, rings = 26, nv = 24, tw = 280 / H;
        // 双曲面外筒：底部椭圆约 80 × 60 m，280 m 处收腰约 27 × 21 m，顶部约 54 × 41 m
        const radius = function (t) { const d = t - tw; return { rx: Math.sqrt(13.5 * 13.5 + 3692 * d * d), ry: Math.sqrt(10.5 * 10.5 + 2057 * d * d) }; };
        const b = pj(lm.x, lm.y, 0), top = pj(lm.x, lm.y, H * E);
        ctx.fillStyle = TH.modelShadow; ctx.beginPath(); ctx.ellipse(b[0], b[1], 70 / CMM * s, 30 / CMM * s, 0, 0, Math.PI * 2); ctx.fill();
        cyl(0, 0, 7, 12, 0, H * 0.98, N ? [40, 38, 54] : [92, 98, 108], null, 0, 8.5);   // 椭圆核心筒约 14 × 17 m
        let col, brace, ringCol;
        if (N) {
          const gr = ctx.createLinearGradient(b[0], b[1], top[0], top[1]);
          gr.addColorStop(0, 'rgba(186,148,174,0.95)'); gr.addColorStop(0.45, 'rgba(169,154,193,0.95)'); gr.addColorStop(1, 'rgba(145,176,204,0.95)');
          col = gr; brace = gr; ringCol = 'rgba(255,214,246,0.55)';
        } else { col = 'rgba(228,233,238,0.98)'; brace = 'rgba(200,209,218,0.9)'; ringCol = 'rgba(190,201,212,0.95)'; }
        const strand = function (a0, twist, style, lw) {
          ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath();
          for (let q = 0; q <= rings; q++) {
            const t = q / rings, a = a0 + t * twist, r = radius(t);
            const w = T(Math.cos(a) * r.rx, Math.sin(a) * r.ry), p = pj(w[0], w[1], H * t * E);
            if (q) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          }
          ctx.stroke();
        };
        const lw = 1.8 / CMM * s;
        ctx.meshLines = true;
        for (let v = 0; v < nv; v++) strand(v / nv * Math.PI * 2, Math.PI * 0.9, col, lw);          // 24 根倾斜立柱
        if (s >= 16) for (let v = 0; v < nv; v += 2) strand(v / nv * Math.PI * 2, -Math.PI * 0.55, brace, lw * 0.7); // 反向斜撑
        ctx.strokeStyle = ringCol; ctx.lineWidth = lw;
        for (let q = 1; q <= rings; q += 2) { const t = q / rings, r = radius(t), start = 0, end = Math.PI * 2; ctx.beginPath(); for (let a = start; a <= end + 0.001; a += (end - start) / 40) { const w = T(Math.cos(a) * r.rx, Math.sin(a) * r.ry), p = pj(w[0], w[1], H * t * E); if (a > start) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
        // 顶部观光层圆环
        { const r = radius(1); ctx.strokeStyle = N ? 'rgba(255,236,250,0.9)' : 'rgba(176,182,192,0.95)'; ctx.lineWidth = lw * 1.6; ctx.beginPath(); for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.25) { const w = T(Math.cos(a) * r.rx, Math.sin(a) * r.ry), p = pj(w[0], w[1], H * E); if (a > 0) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
        line(0, 0, H, 0, 0, 600, N ? '#c6becd' : '#a5adb7', 1.4 / CMM * s);
        line(0, 0, 540, 0, 0, 600, N ? '#d5d8df' : '#b2b8c0', 0.8 / CMM * s);
        dot(0, 0, 600, Math.max(1.2, s / (N ? 24 : 34)), N ? '#ff4d6d' : '#e0403a');
        ctx.meshLines = false;
        break;
      }
      case 'lattice': { // 钢结构电波塔：东京塔（国际橙/白相间桁架）与东京晴空塔（三角底座渐变为圆形的白色桁架）
        const b = pj(lm.x, lm.y, 0);
        ctx.fillStyle = TH.modelShadow; ctx.beginPath(); ctx.ellipse(b[0], b[1], 60 / CMM * s, 26 / CMM * s, 0, 0, Math.PI * 2); ctx.fill();
        const lw = Math.max(0.8, s / 40);
        // 正对观察者的立面：世界方向 (1,1)
        const front = function (u, v) { return (u * ca - v * sa) + (u * sa + v * ca) > -0.1; };
        if (lm.style === 'eiffel') { // 埃菲尔铁塔：底边约 125 m 的四足熟铁塔，57 m 一层、115 m 二层、276 m 顶层平台；塔顶天线（lm.h，1889 年 312 m）
          const H = lm.h || 324, PR = [[0, 62], [57, 35], [115, 19], [180, 9], [276, 4.6], [300, 3]];
          const hwAt = function (h) { return U.interp(PR, h); };
          const BR = N ? [214, 160, 86] : [132, 108, 84], PL = N ? [255, 206, 128] : [156, 130, 100];
          const sq = function (w) { return Rc(-w, -w, w, w); };
          const brace = function (h0, h1) { // 立面上的 X 形斜撑
            if (s < 16) return;
            const w0 = hwAt(h0), w1 = hwAt(h1);
            ctx.strokeStyle = N ? 'rgba(255,236,190,0.5)' : 'rgba(70,52,36,0.45)'; ctx.lineWidth = lw; ctx.beginPath();
            for (const sd of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
              if (!front(sd[0], sd[1])) continue;
              const P = function (t, w, h) { const u = sd[0] ? sd[0] * w : (t * 2 - 1) * w, v = sd[1] ? sd[1] * w : (t * 2 - 1) * w, q = T(u, v); return pj(q[0], q[1], h * E); };
              const a0 = P(0, w0, h0), a1 = P(1, w1, h1), b0 = P(1, w0, h0), b1 = P(0, w1, h1);
              ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]);
            }
            ctx.stroke();
          };
          // 四足：底部各约 24 m 见方，向上收拢到一层平台
          const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(function (a, b) { return depth(a[0], a[1]) - depth(b[0], b[1]); });
          for (const L of legs) {
            const u0 = L[0] * 50, v0 = L[1] * 50, u1 = L[0] * 29, v1 = L[1] * 29;
            const c0 = T((u0 + u1) / 2, (v0 + v1) / 2);
            frustumRings(ctx, pj, Rc(u0 - 12, v0 - 12, u0 + 12, v0 + 12), Rc(u1 - 6, v1 - 6, u1 + 6, v1 + 6), 0, 57 * E, BR, c0[0], c0[1]);
          }
          // 一层下方的装饰拱
          if (s >= 16) {
            ctx.strokeStyle = N ? 'rgba(255,226,160,0.8)' : 'rgba(96,74,54,0.75)'; ctx.lineWidth = lw * 1.3;
            for (const sd of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
              if (!front(sd[0], sd[1])) continue;
              ctx.beginPath();
              for (let k = 0; k <= 12; k++) { const t = k / 12, x = (t * 2 - 1) * 34, hh = 12 + 27 * Math.sin(Math.PI * t), q = T(sd[0] ? sd[0] * 42 : x, sd[1] ? sd[1] * 42 : x), p = pj(q[0], q[1], hh * E); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
              ctx.stroke();
            }
          }
          box(-38, -38, 38, 38, 57, 64, PL); lit(-38, 38, 38, 38, 58, 63, 1, 10);
          const bands = [64, 90, 115];
          for (let q = 1; q < bands.length; q++) { frustumRings(ctx, pj, sq(hwAt(bands[q - 1])), sq(hwAt(bands[q])), bands[q - 1] * E, bands[q] * E, BR, lm.x, lm.y, true); brace(bands[q - 1], bands[q]); }
          box(-21, -21, 21, 21, 115, 121, PL); lit(-21, 21, 21, 21, 116, 120, 1, 6);
          const up = [121, 150, 180, 215, 245, 276];
          for (let q = 1; q < up.length; q++) { frustumRings(ctx, pj, sq(hwAt(up[q - 1])), sq(hwAt(up[q])), up[q - 1] * E, up[q] * E, BR, lm.x, lm.y, q < up.length - 1); brace(up[q - 1], up[q]); }
          box(-6, -6, 6, 6, 276, 284, PL);
          cyl(0, 0, 3, 8, 284, 300, BR, null);
          line(0, 0, 300, 0, 0, H, N ? '#ffe0a0' : '#7a6650', Math.max(1, s / 30));
          if (N) dot(0, 0, H, Math.max(1.2, s / 24), '#ff4d6d');
          break;
        }
        if (lm.style === 'skytree') {
          const H = 634, f0 = -Math.PI / 2, n = 18;
          const R = function (h) { return 17 + 22 * Math.pow(Math.max(0, 1 - h / 350), 1.6); };
          const ring = function (h) {
            const f = U.clamp(h / 300, 0, 1), sm = f * f * (3 - 2 * f), r = R(h), o = [];
            for (let k = 0; k < n; k++) {
              const t = f0 + k / n * Math.PI * 2;
              let d = ((t - f0) % (Math.PI * 2 / 3) + Math.PI * 2 / 3) % (Math.PI * 2 / 3) - Math.PI / 3;
              const tri = 0.5 / Math.cos(d);
              const rr = r * ((1 - sm) * tri + sm);
              o.push([Math.cos(t) * rr, Math.sin(t) * rr]);
            }
            return o;
          };
          const W = function (pts) { return pts.map(function (p) { return T(p[0], p[1]); }); };
          const white = N ? [92, 150, 214] : [226, 233, 240], deck = N ? [150, 200, 255] : [176, 196, 214];
          const hs = [0, 40, 80, 125, 170, 215, 260, 305, 340];
          let prev = ring(0);
          for (let q = 1; q < hs.length; q++) {
            const cur = ring(hs[q]);
            frustumRings(ctx, pj, W(prev), W(cur), hs[q - 1] * E, hs[q] * E, white, lm.x, lm.y, q < hs.length - 1);
            if (s >= 16) { // 桁架斜撑
              ctx.strokeStyle = N ? 'rgba(200,232,255,0.55)' : 'rgba(120,134,150,0.45)'; ctx.lineWidth = lw * 0.8; ctx.beginPath();
              for (let k = 0; k < n; k++) {
                const a = prev[k], c = cur[(k + 1) % n], c2 = cur[(k + n - 1) % n];
                if (!front(a[0], a[1])) continue;
                const A = T(a[0], a[1]), C1 = T(c[0], c[1]), C2 = T(c2[0], c2[1]);
                const pA = pj(A[0], A[1], hs[q - 1] * E), p1 = pj(C1[0], C1[1], hs[q] * E), p2 = pj(C2[0], C2[1], hs[q] * E);
                ctx.moveTo(pA[0], pA[1]); ctx.lineTo(p1[0], p1[1]); ctx.moveTo(pA[0], pA[1]); ctx.lineTo(p2[0], p2[1]);
              }
              ctx.stroke();
            }
            prev = cur;
          }
          cyl(0, 0, 24, 18, 340, 352, white);
          cyl(0, 0, 26, 18, 352, 368, deck);      // 天望甲板
          cyl(0, 0, 22, 18, 368, 375, white);
          cyl(0, 0, 15, 14, 375, 440, white);
          cyl(0, 0, 19, 16, 440, 452, deck);      // 天望回廊
          cyl(0, 0, 12, 12, 452, 497, white);
          line(0, 0, 497, 0, 0, H, N ? '#d8ecff' : '#b8c2cc', Math.max(1.4, s / 22));
          line(0, 0, 560, 0, 0, H, N ? '#ffffff' : '#d0d6dc', Math.max(0.8, s / 40));
          if (N) dot(0, 0, H, Math.max(1.2, s / 28), '#ff4d6d');
          break;
        }
        // 东京塔：333 m，底边约 80 m 的四足桁架，150 m 大展望台、250 m 特别展望台
        const H = lm.h || 333;
        const hwAt = function (h) { return 3 + 37 * Math.pow(Math.max(0, 1 - h / 260), 1.8); };
        const ORG = N ? [255, 132, 52] : [214, 74, 42], WHT = N ? [255, 204, 140] : [238, 236, 230];
        box(-45, -30, 45, 30, 0, 22, N ? [96, 100, 116] : [226, 223, 216]); // 塔下大楼
        lit(-45, 30, 45, 30, 3, 20, 4, 10);
        const sq = function (w) { return Rc(-w, -w, w, w); };
        // 四足：0–50 m
        for (const a of [-1, 1]) for (const c of [-1, 1]) {
          const u0 = a * 38, v0 = c * 38, u1 = a * (hwAt(50) - 3), v1 = c * (hwAt(50) - 3);
          const B = Rc(u0 - 5, v0 - 5, u0 + 5, v0 + 5), Tp = Rc(u1 - 3, v1 - 3, u1 + 3, v1 + 3), cc = T((u0 + u1) / 2, (v0 + v1) / 2);
          frustumRings(ctx, pj, B, Tp, 0, 50 * E, ORG, cc[0], cc[1]);
        }
        const bands = [50, 78, 102, 124, 145, 168, 190, 212, 232, 250];
        const xb = function (h0, h1) { // 立面上的 X 形斜撑
          if (s < 16) return;
          const w0 = hwAt(h0), w1 = hwAt(h1);
          ctx.strokeStyle = N ? 'rgba(255,240,210,0.5)' : 'rgba(110,40,24,0.45)'; ctx.lineWidth = lw; ctx.beginPath();
          const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
          for (const sd of sides) {
            if (!front(sd[0], sd[1])) continue;
            const P = function (t, w, h) { const u = sd[0] ? sd[0] * w : (t * 2 - 1) * w, v = sd[1] ? sd[1] * w : (t * 2 - 1) * w, q = T(u, v); return pj(q[0], q[1], h * E); };
            const a0 = P(0, w0, h0), a1 = P(1, w1, h1), b0 = P(1, w0, h0), b1 = P(0, w1, h1);
            ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]);
          }
          ctx.stroke();
        };
        for (let q = 1; q < bands.length; q++) {
          const h0 = bands[q - 1], h1 = bands[q];
          frustumRings(ctx, pj, sq(hwAt(h0)), sq(hwAt(h1)), h0 * E, h1 * E, q % 2 ? ORG : WHT, lm.x, lm.y, true);
          xb(h0, h1);
          if (h1 === 145) { box(-19, -19, 19, 19, 145, 160, N ? [255, 226, 170] : [196, 204, 212]); lit(-19, 19, 19, 19, 148, 158, 2, 8); } // 大展望台
        }
        box(-7, -7, 7, 7, 248, 256, N ? [255, 226, 170] : [196, 204, 212]); // 特别展望台
        // 天线段：250–333 m，橙白相间
        const ah = [256, 270, 284, 298, 312];
        for (let q = 1; q < ah.length; q++) { const w0 = 3 - (ah[q - 1] - 256) / 40, w1 = 3 - (ah[q] - 256) / 40; frustumRings(ctx, pj, sq(w0), sq(w1), ah[q - 1] * E, ah[q] * E, q % 2 ? WHT : ORG, lm.x, lm.y, q < ah.length - 1); }
        line(0, 0, 312, 0, 0, H, N ? '#ffd9a0' : '#c45a3c', Math.max(1, s / 30));
        dot(0, 0, H, Math.max(1.2, s / (N ? 24 : 34)), N ? '#ff4d6d' : '#e0403a');
        break;
      }
      case 'skyscraper': {
        const H = lm.h;
        if (lm.style === 'citic') { // 中信广场：裙楼 + 两座公寓塔 + 主塔（双桅杆）
          box(-100, -100, 100, 100, 0, 18, N ? [80, 88, 104] : [216, 214, 210], null);
          for (const du of [-62, 62]) { box(du - 17, 30, du + 17, 64, 18, 120, N ? [96, 104, 122] : [224, 220, 210], null); lit(du - 17, 64, du + 17, 64, 22, 116, 14, 4); }
          box(-24, -60, 24, -12, 18, 322, N ? [70, 92, 120] : [196, 210, 220], null, { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = N ? 'rgba(255,214,140,0.45)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let t = 0.1; t < 1; t += 0.1) { ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t); } ctx.stroke(); } });
          hip(-24, -60, 24, -12, 322, 340, N ? [120, 130, 150] : [176, 186, 196]);
          for (const du of [-10, 10]) { line(du, -36, 330, du, -36, H, N ? '#c8d0dc' : '#8a929c', Math.max(1, s / 30)); if (N) dot(du, -36, H, 1.8, '#ff4d4d'); }
        } else if (lm.style === 'west') { // 西塔：圆角三角形玻璃筒 + 斜交网格
          const tri = function (sc) { const o = []; for (let k = 0; k < 18; k++) { const t = k / 18 * Math.PI * 2; const r = 33 * sc * (1 + 0.13 * Math.cos(3 * t)); o.push(T(Math.cos(t) * r, Math.sin(t) * r)); } return o; };
          const segs = 6;
          for (let k = 0; k < segs; k++) { const h0 = H * k / segs, h1 = H * (k + 1) / segs, sc0 = 1 - 0.12 * k / segs, sc1 = 1 - 0.12 * (k + 1) / segs; const c = T(0, 0); frustumRings(ctx, pj, tri(sc0), tri(sc1), h0 * E, h1 * E, N ? [60, 90, 130] : [168, 200, 226], c[0], c[1], k < segs - 1); }
          if (s >= 16) { ctx.strokeStyle = N ? 'rgba(160,210,255,0.55)' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; for (let k = 0; k < 10; k++) { const a0 = k / 10 * Math.PI * 2; ctx.beginPath(); for (let q = 0; q <= 20; q++) { const t = q / 20, a = a0 + t * 1.2 * (k % 2 ? 1 : -1); if (Math.cos(a) + Math.sin(a) < -0.2) continue; const r = 33 * (1 - 0.12 * t); const w = T(Math.cos(a) * r, Math.sin(a) * r), p = pj(w[0], w[1], H * t * E); if (q) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); } }
          if (N) dot(0, 0, H, 2, '#ff4d4d');
        } else if (lm.style === 'taipei101') { // 台北101：裙楼 + 截头方锥基座 + 8 节外倾「竹节」 + 顶部与塔尖
          const kh = H / 508, col = N ? [62, 96, 100] : [146, 188, 184], q2 = function (w) { return Rc(-w, -w, w, w); };
          box(-62, -48, 62, 48, 0, 58 * kh, N ? [80, 88, 104] : [214, 214, 208]);
          frustumRings(ctx, pj, q2(32), q2(25), 0, 92 * kh * E, col, lm.x, lm.y, false);
          for (let k = 0; k < 8; k++) { const h0 = 92 + k * 32.5; frustumRings(ctx, pj, q2(22), q2(28), h0 * kh * E, (h0 + 32.5) * kh * E, k % 2 ? col : U.shade(col, 1.07), lm.x, lm.y, false); }
          frustumRings(ctx, pj, q2(18), q2(12), 352 * kh * E, 392 * kh * E, col, lm.x, lm.y, false);
          line(0, 0, 392 * kh, 0, 0, H, N ? '#c8d0dc' : '#8a929c', Math.max(1, s / 26));
          if (N) dot(0, 0, H, 2, '#ff4d4d');
        } else if (lm.style === 'jinmao') { // 金茂大厦（1999，420.5 m）：宝塔式逐段收分的银灰色塔身，顶部尖塔
          const kh = H / 420.5, col = N ? [92, 106, 128] : [184, 192, 202];
          box(-42, -42, 42, 42, 0, 24 * kh, N ? [80, 88, 104] : [212, 210, 204]);
          let h0 = 24, w = 27;
          for (let k = 0; k < 10; k++) {
            const th = 52 * Math.pow(0.86, k), w1 = w - 1.6;
            frustumRings(ctx, pj, Rc(-w, -w, w, w), Rc(-w1, -w1, w1, w1), h0 * kh * E, (h0 + th) * kh * E, k % 2 ? col : U.shade(col, 1.05), lm.x, lm.y, false);
            eaveR(-w1, -w1, w1, w1, 2.2, (h0 + th - 3) * kh, (h0 + th) * kh, U.shade(col, 1.12));
            h0 += th; w = w1 - 0.8;
          }
          hip(-w, -w, w, w, h0 * kh, (h0 + 40) * kh, U.shade(col, 1.08));
          line(0, 0, (h0 + 40) * kh, 0, 0, H, N ? '#d8e2f0' : '#8a929c', Math.max(1, s / 28));
          if (N) dot(0, 0, H, 2, '#ff4d4d');
        } else if (lm.style === 'swfc') { // 上海环球金融中心（2008，492 m）：方形底座两侧以弧面收成一条斜线，顶部梯形开口
          const kh = H / 492, col = N ? [74, 98, 132] : [176, 198, 218], segs = 8;
          for (let k = 0; k < segs; k++) {
            const t0 = k / segs, t1 = (k + 1) / segs, f = function (t) { return 29 * (1 - 0.88 * Math.pow(t, 1.3)); };
            frustumRings(ctx, pj, Rc(-29, -f(t0), 29, f(t0)), Rc(-29, -f(t1), 29, f(t1)), t0 * 492 * kh * E, t1 * 492 * kh * E, col, lm.x, lm.y, k < segs - 1);
          }
          if (s >= 12) { // 顶部开口：两个可见立面上画出透空的梯形
            const sky = N ? 'rgba(20,28,44,0.9)' : 'rgba(226,236,246,0.95)';
            for (const sv of [-1, 1]) {
              if (!(depth(0, sv) > 0)) continue;
              const vv = sv * 29 * (1 - 0.88 * Math.pow(0.93, 1.3)), P = function (u, h) { const q = T(u, vv); return pj(q[0], q[1], h * kh * E); };
              fillPts(ctx, [P(-20, 440), P(20, 440), P(14, 475), P(-14, 475)], sky);
            }
          }
          if (N) dot(0, 0, H, 2, '#ff4d4d');
        } else if (lm.style === 'shtower') { // 上海中心大厦（2015，632 m）：圆角三角形平面，逐段收分并扭转约 120°
          const kh = H / 632, segs = 9, col = N ? [70, 100, 136] : [176, 202, 222];
          const ring = function (sc, rot) { const o = []; for (let k = 0; k < 18; k++) { const t = k / 18 * Math.PI * 2 + rot; const r = 36 * sc * (1 + 0.12 * Math.cos(3 * (t - rot))); o.push(T(Math.cos(t) * r, Math.sin(t) * r)); } return o; };
          box(-48, -48, 48, 48, 0, 30 * kh, N ? [80, 88, 104] : [214, 214, 210]);
          for (let k = 0; k < segs; k++) {
            const t0 = k / segs, t1 = (k + 1) / segs, h0 = 30 + t0 * 550, h1 = 30 + t1 * 550;
            frustumRings(ctx, pj, ring(1 - 0.45 * t0, t0 * Math.PI * 2 / 3), ring(1 - 0.45 * t1, t1 * Math.PI * 2 / 3), h0 * kh * E, h1 * kh * E, k % 2 ? col : U.shade(col, 1.04), lm.x, lm.y, k < segs - 1);
          }
          const top = ring(0.55, Math.PI * 2 / 3), c0 = T(0, 0);
          frustumRings(ctx, pj, top, ring(0.45, Math.PI * 2 / 3 + 0.2), 580 * kh * E, H * E, U.shade(col, 1.1), c0[0], c0[1], false);
          if (N) dot(0, 0, H, 2, '#ff4d4d');
        } else { // 东塔：方形分段收分，白色竖向陶板（其他城市的超高层按高度与占地等比缩放）
          const kh = H / 530, kw = Math.min(1.2, (lm.w || 78) / 78);
          const tiers = [[38, 0, 160], [36, 160, 330], [33, 330, 470], [29, 470, 515]];
          // 裙楼（占地足够时）与塔冠亮带
          if ((lm.w || 78) >= 90) box(-hw * 0.48, -hd * 0.48, hw * 0.48, hd * 0.48, 0, Math.min(36, 30 * kh * 1.6), N ? [80, 88, 104] : [216, 216, 212], null);
          for (const t of tiers) box(-t[0] * kw, -t[0] * 0.9 * kw, t[0] * kw, t[0] * 0.9 * kw, t[1] * kh, t[2] * kh, N ? [80, 92, 112] : [214, 222, 230], null, { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = N ? 'rgba(255,214,140,0.4)' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0.08; k < 1; k += 0.14) { ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * k, q[0][1] + (q[1][1] - q[0][1]) * k); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * k, q[3][1] + (q[2][1] - q[3][1]) * k); } ctx.stroke(); } });
          box(-22 * kw, -20 * kw, 22 * kw, 20 * kw, 515 * kh, H, N ? [110, 120, 140] : [196, 204, 214]);
          box(-29 * kw, -26.1 * kw, 29 * kw, 26.1 * kw, 505 * kh, 515 * kh, N ? [150, 170, 200] : [238, 242, 246]);   // 塔冠亮带
          if (N) dot(0, 0, H, 2, '#ff4d4d');
        }
        break;
      }
      case 'opera': { // 广州大剧院：两块“圆润双砾”
        const facet = N ? [92, 98, 110] : [214, 214, 210];
        const pebble = function (cu, cv, r0, h, n, rot) { const c = T(cu, cv); frustumRings(ctx, pj, NG(cu, cv, r0, n, rot, r0 * 0.78), NG(cu + 6, cv - 4, r0 * 0.62, n, rot + 0.3, r0 * 0.48), 0, h * 0.75 * E, facet, c[0], c[1], true); const top = NG(cu + 6, cv - 4, r0 * 0.62, n, rot + 0.3, r0 * 0.48); const t2 = T(cu + 10, cv - 6); pyramidN(ctx, pj, top, t2[0], t2[1], h * 0.75 * E, h * E, U.shade(facet, 1.05)); };
        pebble(-30, 0, 62, 42, 7, 0.2);
        pebble(62, 38, 32, 26, 6, 0.6);
        lit(-80, 30, 20, 40, 3, 12, 1, 8);
        break;
      }
      case 'box': { // 广东省博物馆：“宝盒”
        if (lm.style === 'pompidou') { // 蓬皮杜中心：外露的彩色设备管道（蓝：空调，绿：给水，黄：电气，红：交通）与外挂自动扶梯
          box(-83, -30, 83, 30, 0, 42, N ? [96, 104, 118] : [228, 230, 232], null, { lines: function (fc, q) { if (s < 16) return; const cols = ['#2f6fb6', '#2e9b55', '#e8c22c', '#d9412f']; ctx.lineWidth = Math.max(0.8, s / 60); ctx.globalAlpha = 0.7; for (let k = 0; k < 8; k++) { const t = (k + 0.5) / 8; ctx.strokeStyle = cols[k % 4]; ctx.beginPath(); ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t); ctx.stroke(); } ctx.globalAlpha = 1; } });
          lit(-83, 30, 83, 30, 3, 40, 5, 12);
          line(-78, 31, 3, 70, 31, 41, '#d9412f', Math.max(1.4, s / 24));
          break;
        }
        box(-40, -40, 40, 40, 0, 7, N ? [60, 64, 72] : [120, 124, 130], null);
        box(-58, -58, 58, 58, 7, 42, N ? [70, 72, 80] : [96, 96, 100], N ? [90, 92, 100] : [150, 150, 156], { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = N ? 'rgba(220,180,90,0.35)' : 'rgba(220,200,160,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let t = 0.12; t < 1; t += 0.18) { ctx.moveTo(q[0][0] + (q[3][0] - q[0][0]) * t, q[0][1] + (q[3][1] - q[0][1]) * t); ctx.lineTo(q[1][0] + (q[2][0] - q[1][0]) * t, q[1][1] + (q[2][1] - q[1][1]) * t); } ctx.stroke(); } });
        break;
      }
      case 'library': { // 广州图书馆：“之”字形层叠
        if (lm.style === 'bnf') { // 法国国家图书馆：木质平台四角的四座 L 形玻璃塔楼（79 m，形如打开的书），中央为下沉花园
          const a = hw - 6, b = hd - 6, L = Math.min(60, hw * 0.4), t = 18, gC = N ? [74, 104, 140] : [186, 208, 226];
          box(-hw, -hd, hw, hd, 0, 5, N ? [104, 92, 80] : [196, 170, 140]);
          if (detail) trees(26, 91, function (u, v) { return Math.abs(u) > hw - 60 || Math.abs(v) > hd - 50; });
          const parts = [];
          for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const cu = q[0] * a, cv = q[1] * b;
            parts.push([cu - q[0] * L * 0.3, cv - q[1] * L * 0.3, function () {
              box(Math.min(cu, cu - q[0] * L), Math.min(cv, cv - q[1] * t), Math.max(cu, cu - q[0] * L), Math.max(cv, cv - q[1] * t), 5, 79, gC, null);
              box(Math.min(cu, cu - q[0] * t), Math.min(cv - q[1] * t, cv - q[1] * L), Math.max(cu, cu - q[0] * t), Math.max(cv - q[1] * t, cv - q[1] * L), 5, 79, gC, null);
            }]);
          }
          ordered(parts);
          break;
        }
        const c1 = N ? [96, 100, 112] : [206, 200, 188];
        box(-62, -36, 10, 36, 0, 26, c1, null); box(-10, -36, 62, 36, 26, 50, c1);
        box(-62, -36, 10, 36, 26, 28, U.shade(c1, 0.9)); lit(-62, 36, 10, 36, 3, 24, 4, 8); lit(-10, 36, 62, 36, 28, 48, 4, 8);
        break;
      }
      case 'mall': { // 天河城：商业裙楼——底层玻璃橱窗带、立面招牌带、退台屋顶与屋面设备
        const wall = N ? [86, 92, 110] : [224, 218, 206], gl = N ? [70, 96, 130] : [180, 204, 226];
        const u0 = -hw + 10, v0 = -hd + 10, u1 = hw - 10, v1 = hd - 10;
        box(u0, v0, u1, v1, 0, 32, wall, null, { lines: function (fc, q) { if (s < 16) return; const L = function (t) { ctx.beginPath(); ctx.moveTo(q[0][0] + (q[3][0] - q[0][0]) * t, q[0][1] + (q[3][1] - q[0][1]) * t); ctx.lineTo(q[1][0] + (q[2][0] - q[1][0]) * t, q[1][1] + (q[2][1] - q[1][1]) * t); ctx.stroke(); }; ctx.strokeStyle = N ? 'rgba(150,180,220,0.45)' : 'rgba(150,175,205,0.55)'; ctx.lineWidth = Math.max(2, s / 14); L(0.9); ctx.strokeStyle = N ? 'rgba(255,200,120,0.55)' : 'rgba(200,90,70,0.55)'; ctx.lineWidth = Math.max(1.5, s / 22); L(0.42); } });
        box(u0, v0, u1, v1, 0, 6, gl, null);
        lit(u0, v1, u1, v1, 8, 30, 5, 14);
        box(u0 + 24, v0 + 24, u1 - 24, v1 - 24, 32, 38, U.shade(wall, 0.96));
        box(-30, -30, 30, 30, 38, 46, N ? [110, 120, 140] : [196, 210, 224]);
        for (const d of [[-1, -1], [1, 1]]) box(d[0] * 45 - 8, d[1] * 40 - 6, d[0] * 45 + 8, d[1] * 40 + 6, 38, 41, N ? [70, 76, 88] : [190, 192, 196]);
        break;
      }
      case 'conference': { // 白云国际会议中心：依山而建的两组白色长楼，立面为彩色竖向遮阳板（细密、柔和），底层玻璃
        const wall = N ? [86, 92, 106] : [232, 232, 228], gl = N ? [70, 96, 130] : [186, 208, 228];
        const louvres = { lines: function (fc, q) { if (s < 16) return; const cols = ['#d94f3d', '#f0a72b', '#2f6fb6', '#16a085', '#8e44ad']; const n = Math.max(16, Math.round(s * 0.8)); ctx.globalAlpha = N ? 0.55 : 0.7; ctx.lineWidth = Math.max(0.8, s / 70); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; ctx.strokeStyle = cols[(k * 3 + (k >> 2)) % 5]; ctx.beginPath(); ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t); ctx.stroke(); } ctx.globalAlpha = 1; } };
        const u0 = -hw + 20, u1 = hw - 20, v0 = -hd + 30, v1 = hd - 30, um = (u0 + u1) / 2;
        ordered([
          [(u0 + um) / 2 - 4, 0, function () { box(u0, v0, um - 8, v1, 0, 6, gl, null); box(u0, v0, um - 8, v1, 6, 34, wall, null, louvres); }],
          [(um + u1) / 2 + 4, 0, function () { box(um + 8, v0 + 6, u1, v1 - 6, 0, 6, gl, null); box(um + 8, v0 + 6, u1, v1 - 6, 6, 30, wall, null, louvres); }],
        ]);
        break;
      }
      case 'concert': { // 星海音乐厅：双曲抛物面屋顶
        poly([T(-58, -26), T(56, -38), T(48, 36), T(-52, 30)], 0, 8, N ? [88, 96, 110] : [236, 238, 240], null);
        lit(-52, 30, 48, 36, 1, 7, 1, 8);
        const P = [T(-58, -26), T(56, -38), T(48, 36), T(-52, 30)].map(function (p, k) { return pj(p[0], p[1], [8, 32, 8, 24][k] * E); });
        fillPts(ctx, [P[0], P[1], P[2]], N ? '#9fb2c8' : '#f7f8fa');
        fillPts(ctx, [P[0], P[2], P[3]], N ? '#7d90a8' : '#dfe4ea');
        break;
      }
      case 'gallery': { // 广东美术馆：白色多面体
        poly(NG(0, 0, 46, 5, -Math.PI / 2), 0, 14, white, U.shade(white, 0.96));
        poly(NG(6, -4, 22, 4, Math.PI / 4), 14, 22, white, U.shade(white, 1.02));
        break;
      }
      default: box(-hw * 0.6, -hd * 0.6, hw * 0.6, hd * 0.6, 0, 12, [214, 196, 172]); break;
    }
  };
  // ---------------- 分析图层（热力格） ----------------
  // 片区吸引的出行分到各格（按与 sim.js 相同的用地权重），用于「设施出行需求」与「地铁服务缺口」图层
  Renderer.prototype.cellWeights = function (q) {
    const city = this.game.city, LU = CM.LU, N = city.N, w = new Float32Array(N);
    const fn = this.game.model.fn, excl = fn ? fn.excl : null;
    for (let c = 0; c < N; c++) {
      const pc = city.pop[c], jc = city.jobs[c], L = city.lu[c], com = L === LU.COM || L === LU.MIX;
      if (q === 'hw') w[c] = jc;
      else if (q === 'all') w[c] = pc + jc;
      else if (excl && excl[c]) w[c] = 0;
      else if (q === 'sc') w[c] = pc * 0.25 + (L === LU.INST ? jc * 1.2 : 0);
      else if (q === 'sh') w[c] = jc * (com ? 1 : (L === LU.RES ? 0.5 : (L === LU.IND ? 0.1 : 0.3))) + pc * 0.05;
      else if (q === 'md') w[c] = (L === LU.INST ? jc * 0.5 : 0) + (com ? jc * 0.05 : 0) + pc * 0.03;
      else if (q === 'lz') w[c] = (city.isPark[c] || L === LU.PARK ? 400 * city.landFrac[c] : 0) + (L === LU.HILL ? 60 * city.landFrac[c] : 0) + (com ? jc * 0.25 : 0) + pc * 0.12 + (L === LU.LANDMARK ? 200 : 0);
    }
    return w;
  };
  Renderer.prototype.zoneToCells = function (zv, w) {
    const model = this.game.model, out = new Float32Array(this.game.city.N);
    for (let z = 0; z < model.Z; z++) {
      const cs = model.zoneCells[z]; let s = 0;
      for (const c of cs) s += w[c];
      if (!(s > 0) || !(zv[z] > 0)) continue;
      for (const c of cs) out[c] = zv[z] * w[c] / s;
    }
    return out;
  };
  Renderer.prototype.buildHeat = function () {
    const g = this.game, city = g.city, model = g.model, W = city.W, H = city.H, LO = this.layerOpt, lay = this.layer;
    const access = lay === 'cover' || lay === 'gap' ? model.net : null;
    const dyn = lay === 'fac' || lay === 'gap' || lay === 'commute' || lay === 'mshare';
    const key = this.themeName + ':' + AX.flag() + ':' + lay + ':' + city.version + ':' + g.clock.y + ':' + g.clock.m + ':' + (lay === 'cover' ? g.netVersion + ':' + LO.cover : '') + (lay === 'fac' ? LO.facP + ':' + LO.facDt : '') + (lay === 'gap' ? LO.gapDt + ':' + g.netVersion : '') + (lay === 'mshare' ? LO.shareDt : '') + (lay === 'dev' ? LO.devK + ':' + LO.devB + ':' + (g.eraBase ? g.eraBase.id : '') + (LO.devK === 'pull' ? ':' + g.netVersion + ':' + (model.dailyStale ? 0 : model.version) : '') : '') + (dyn ? ':' + model.cycles + ':' + (model.settled ? 's' : '') : '');
    const old = this.heatLayers.get(lay);
    if (old && old.key === key && old.access === access) { this.heat = old.cv; this.heatKey = key; return; }
    this.heatKey = key;
    this.heat = old && old.cv.width === W && old.cv.height === H ? old.cv : makeCanvas(W, H);
    const ctx = this.heat.getContext('2d');
    const img = ctx.createImageData(W, H), d = img.data;
    const acc = model.net ? model.net.acc : null;
    // 设施出行需求：片区吸引（按目的）分到各格；全部目的时按主要目的着色
    let facCell = null, facDom = null, gapCell = null;
    const TR = CFG.trips, PK = TR.keys;
    const fd = dyn ? model.facData(lay === 'gap' ? LO.gapDt : lay === 'mshare' ? LO.shareDt : LO.facDt) : null;
    if (lay === 'fac' && fd) {
      const Z = model.Z;
      const list = LO.facP === 'all' ? ['sc', 'sh', 'md', 'lz'] : [LO.facP];   // 全部 = 设施类出行（上学、购物、医疗、休闲）；通勤按岗位，单独查看
      facCell = new Float32Array(city.N); facDom = new Int8Array(city.N).fill(-1);
      const best = new Float32Array(city.N);
      for (const q of list) {
        const qi = PK.indexOf(q);
        let zv;
        if (q === 'hb') {   // 枢纽接驳：城市一端（出发与到达的片区），按需求表中的接驳出行
          zv = new Float32Array(Z); const od = model.od, t5 = od.t[5];
          const mult = LO.facDt === 'we' ? model.weekendMult(model.year)[5] : 1;
          for (let i = 0; i < Z; i++) for (let k = od.start[i]; k < od.start[i + 1]; k++) zv[i] += 2 * t5[k] * mult;
        } else zv = fd.dest.subarray(qi * Z, qi * Z + Z);
        const cv = this.zoneToCells(zv, this.cellWeights(q));
        for (let c = 0; c < city.N; c++) { facCell[c] += cv[c]; if (cv[c] > best[c]) { best[c] = cv[c]; facDom[c] = qi; } }
      }
    }
    if (lay === 'gap' && fd) {
      const Z = model.Z, zv = new Float32Array(Z);
      for (let z = 0; z < Z; z++) {
        let dst = 0; for (let q = 0; q < 6; q++) dst += fd.dest[q * Z + z];
        zv[z] = (fd.trips[z] + dst) * (1 - (acc ? acc.zCov[z] : 0));
      }
      gapCell = this.zoneToCells(zv, this.cellWeights('all'));
    }
    // 通勤时间、乘地铁比例：按片区算比率，再在片区中心之间双线性插值；出行很少的片区不参与（比率没有意义）
    let rateAt = null, rateScale = null;
    if (lay === 'commute' || lay === 'mshare') {
      const Z = model.Z, ZS = CFG.ZONE, zw = W / ZS, zh = H / ZS, zv = new Float32Array(Z).fill(-1), P0 = model.resultsFor('wd').per[0];
      if (lay === 'commute') { if (P0.zCW) for (let z = 0; z < Z; z++) if (P0.zCW[z] > 5) zv[z] = P0.zCT[z] / P0.zCW[z]; }
      else if (fd) for (let z = 0; z < Z; z++) if (fd.trips[z] > 300) zv[z] = fd.metro[z] / fd.trips[z];
      const vals = []; let wSum = 0;
      for (let z = 0; z < Z; z++) if (zv[z] >= 0) { const w = lay === 'commute' ? P0.zCW[z] : fd.trips[z]; vals.push([zv[z], w]); wSum += w; }
      vals.sort(function (a, b) { return a[0] - b[0]; });
      const at = function (q) { let c = 0; for (const e of vals) { c += e[1]; if (c >= wSum * q) return e[0]; } return vals.length ? vals[vals.length - 1][0] : 0; };
      if (lay === 'commute') { const lo = Math.floor(at(0.1)), hi = Math.max(lo + 8, Math.ceil(at(0.9))); rateScale = { lo: lo, hi: hi }; }
      else rateScale = { lo: 0, hi: Math.max(0.05, Math.ceil(at(0.95) * 20) / 20) };
      rateAt = function (x, y) {
        const fx = U.clamp((x + 0.5) / ZS - 0.5, 0, zw - 1), fy = U.clamp((y + 0.5) / ZS - 0.5, 0, zh - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(zw - 1, x0 + 1), y1 = Math.min(zh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        let sum = 0, wt = 0;
        const add = function (i, j, w) { const v = zv[j * zw + i]; if (v >= 0) { sum += v * w; wt += w; } };
        add(x0, y0, (1 - tx) * (1 - ty)); add(x1, y0, tx * (1 - ty)); add(x0, y1, (1 - tx) * ty); add(x1, y1, tx * ty);
        return wt > 0.001 ? sum / wt : -1;
      };
    }
    // 城市发展（v2.2）：与本阶段开始（或本局开始）相比，每约 1 km 方块的人口、岗位或已开发用地的增减（按方块面积折算为密度变化）
    // v2.3：色标随实际变化自适应（取变化最大的 5% 方块为满色），刚开始的几个月也看得见；方块值按双线性插值铺到各格，不再是生硬的方格；
    // 还没有可见变化时改为显示本阶段的重点发展片区（见 devPlan）
    const pullV = lay === 'dev' && LO.devK === 'pull';   // 地铁带动（v2.3）：车站对周边增长的吸引，见 Game.metroPull
    const pull = pullV && g.metroPull ? g.metroPull() : null;
    this.devPull = pullV ? pull : null;
    const dv = lay === 'dev' && !pullV && CM.Eras ? CM.Eras.change(g, LO.devB, LO.devK) : null;
    const devRamp = LO.devK === 'jobs' ? [[0, [196, 214, 250]], [0.5, [92, 132, 230]], [1, [40, 70, 190]]] : LO.devK === 'land' ? [[0, [250, 226, 170]], [0.5, [226, 160, 60]], [1, [176, 96, 20]]] : [[0, [200, 236, 210]], [0.5, [72, 178, 120]], [1, [20, 120, 70]]];
    const devFloor = LO.devK === 'land' ? 0.05 : 300;
    let devFull = devFloor, devMin = devFloor / 4;
    if (dv) {
      const a = []; for (const v of dv.v) if (Math.abs(v) > 1e-6) a.push(Math.abs(v));
      a.sort(function (x, y) { return x - y; });
      if (a.length) devFull = Math.max(devFloor, a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]);
      devMin = Math.max(devFloor / 4, devFull * 0.06);
      this.devScale = { full: devFull, min: devMin, key: LO.devK, any: a.length > 0 && a[a.length - 1] >= devMin };
    }
    const devAt = dv ? function (x, y) {   // 方块中心之间双线性插值
      const fx = U.clamp((x + 0.5) / dv.bs - 0.5, 0, dv.bw - 1), fy = U.clamp((y + 0.5) / dv.bs - 0.5, 0, dv.bh - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(dv.bw - 1, x0 + 1), y1 = Math.min(dv.bh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const v = function (i, j) { return dv.v[j * dv.bw + i]; };
      return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
    } : null;
    const plan = lay === 'dev' && dv && !this.devScale.any && CM.Eras ? CM.Eras.devPlan(g) : null;
    const stCol = function (k) { if (AX.enabled()) return U.hex2rgb(AX.category(k)); const hsh = (k * 2654435761) >>> 0; return [40 + (hsh & 127), 110 + ((hsh >> 7) & 100), 60 + ((hsh >> 14) & 140)]; };
    for (let c = 0; c < W * H; c++) {
      let col = null, a = 0;
      const p = city.pop[c] / 0.0625, jb = city.jobs[c] / 0.0625;
      if (lay === 'fac') {
        if (facCell) { const v = facCell[c] / 0.0625; if (v > 150) { const t = U.clamp(Math.sqrt(v / 40000), 0, 1); col = U.hex2rgb(AX.category(facDom[c], TR.color[PK[facDom[c]]] || '#888888')); a = 0.1 + 0.42 * t; } }
      } else if (lay === 'gap') {
        if (gapCell) { const v = gapCell[c] / 0.0625; if (v > 400) { const t = U.clamp(Math.sqrt(v / 60000), 0, 1); col = AX.ramp([[0, [255, 214, 170]], [0.5, [236, 112, 72]], [1, [180, 24, 34]]], t); a = 0.12 + 0.45 * t; } }
      } else if (lay === 'cover' && LO.cover === 'station') {
        const w = acc ? acc.cellWalk[c] : Infinity, k = acc ? acc.cellStation[c] : -1;
        if (k >= 0 && w <= CFG.walk.maxAccessM) { col = stCol(k); a = 0.42 - 0.18 * U.clamp(w / CFG.walk.maxAccessM, 0, 1); }
        else if (p > 4000) { col = [215, 48, 39]; a = U.clamp(0.1 + p / 120000, 0, 0.38); }
      } else if (lay === 'dev') {
        if (pullV) {
          const v = pull ? pull.field[c] * pull.w : 0;
          if (v > 0.03 && city.lu[c] !== CM.LU.WATER) { const t = U.clamp(Math.sqrt(v / 1.1), 0, 1); col = AX.ramp([[0, [226, 214, 250]], [0.5, [150, 108, 226]], [1, [92, 40, 170]]], t); a = 0.1 + 0.48 * t; }
        } else if (plan && city.lu[c] !== CM.LU.WATER) {
          const w = plan.w[city.region[c]] || 0;
          if (w > 0) { const x = c % W, y = (c - x) / W; col = AX.ramp(devRamp, U.clamp(0.35 + w * 0.5, 0, 1)); a = ((x + y) % 4 < 2 ? 0.34 : 0.16) * U.clamp(0.5 + w, 0, 1); }   // 斜纹：规划倾向而非实际变化
        } else if (dv && city.lu[c] !== CM.LU.WATER) {
          const x = c % W, y = (c - x) / W, v = devAt(x, y);
          const t = U.clamp(Math.sqrt(Math.abs(v) / devFull), 0, 1);
          if (Math.abs(v) >= devMin) { col = v > 0 ? AX.ramp(devRamp, t) : AX.ramp([[0, [250, 210, 205]], [1, [200, 50, 50]]], t); a = 0.14 + 0.5 * t; }
        }
      } else if (rateAt) {
        if (p + jb > 300 && city.lu[c] !== CM.LU.WATER) {
          const x = c % W, v = rateAt(x, (c - x) / W);
          if (v >= 0 && lay === 'commute') { col = AX.ramp([[0, [64, 170, 120]], [0.5, [245, 200, 80]], [1, [205, 50, 50]]], U.clamp((v - rateScale.lo) / (rateScale.hi - rateScale.lo), 0, 1)); a = U.clamp(0.28 + Math.sqrt((p + jb) / 90000) * 0.3, 0, 0.55); }
          else if (v >= 0) { const t = U.clamp(v / rateScale.hi, 0, 1); col = AX.ramp([[0, [214, 232, 245]], [0.5, [90, 160, 220]], [1, [20, 70, 159]]], t); a = 0.16 + 0.42 * t; }
        }
      } else if (lay === 'pop') {
        // 浅色单色渐变、半透明（最高约 0.5），道路与地名仍清楚可见
        if (p > 200) { const t = U.clamp(Math.sqrt(p / 60000), 0, 1); col = AX.ramp([[0, [255, 226, 150]], [0.5, [249, 158, 76]], [1, [222, 84, 52]]], t); a = 0.12 + 0.4 * t; }
      } else if (this.layer === 'jobs') {
        const t = p + jb;
        if (t > 300) { const sh = p / t; col = AX.mix([52, 104, 214], [240, 150, 60], sh); a = U.clamp(0.12 + 0.4 * Math.sqrt(t / 90000), 0, 0.5); }
      } else if (this.layer === 'cover') {
        const w = acc ? acc.cellWalk[c] : Infinity;
        const m = w / CFG.walk.mPerMin;
        if (m <= 5) { col = [27, 140, 70]; a = 0.5; }
        else if (m <= 10) { col = [90, 180, 100]; a = 0.42; }
        else if (m <= 15) { col = [160, 214, 130]; a = 0.36; }
        else if (p > 4000) { col = [215, 48, 39]; a = U.clamp(0.1 + p / 120000, 0, 0.38); }
      } else if (this.layer === 'region') {
        const rg = city.regions[city.region[c]];
        if (rg.scenic) { col = [120, 170, 110]; a = 0.25; }
        else if (city.cellLocked(c)) { col = [150, 150, 150]; a = 0.25; }
      }
      if (col) { col = AX.rgb(col); const o = c * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a * 255; }
    }
    ctx.putImageData(img, 0, 0);
    this.heatLayers.set(this.layer, { key: key, access: access, cv: this.heat });
    // 图例写出色标的实际范围
    if (rateScale) { const S = this.rateScales || (this.rateScales = {}), was = S[lay]; S[lay] = rateScale; if ((!was || was.lo !== rateScale.lo || was.hi !== rateScale.hi) && CM.ui && CM.ui.layer === lay && CM.ui.renderDock) CM.ui.renderDock(); }
    if (lay === 'dev') {
      this.devLabels = this.devLabelList(g, plan, devMin);
      // 图例的色标与说明随之更新（自适应满色、是否改为显示规划倾向）
      const sig = this.devScale ? this.devScale.key + ':' + this.devScale.any + ':' + Math.round(this.devScale.full * 100) : '';
      if (sig !== this._devSig) { this._devSig = sig; if (CM.ui && CM.ui.layer === 'dev' && CM.ui.renderDock) CM.ui.renderDock(); }
    }
  };
  // 城市发展图层的地图标注（v2.3）：变化最大的片区写明增减（人口、岗位或新开发用地）；还没有变化时标出本阶段的重点发展片区
  Renderer.prototype.devLabelList = function (g, plan, min) {
    const LO = this.layerOpt, key = LO.devK, out = [];
    // 地铁带动：吸引最强的几座车站（相隔至少约 1.5 km，避免标注叠在一起），按强度写「枢纽带动 / 带动较强 / 带动起步」
    if (key === 'pull') {
      const P = this.devPull; if (!P || !P.top) return out;
      for (const s of P.top) {
        if (out.length >= 5) break;
        if (out.some(function (o) { return Math.hypot(o.x - s.x, o.y - s.y) < 6; })) continue;
        const v = s.k * P.w; out.push({ x: s.x, y: s.y, text: s.name + ' · ' + (v >= 1 ? '枢纽带动' : (v >= 0.45 ? '带动较强' : '带动起步')), kind: 'pull' });
      }
      return out;
    }
    if (plan) { for (const p of plan.list) out.push({ x: p.x, y: p.y, text: p.name + ' · ' + (key === 'jobs' ? '岗位增长' : key === 'land' ? '重点开发' : '人口增长') + ' ×' + p.f.toFixed(1), kind: 'plan' }); return out; }
    const rc = CM.Eras && CM.Eras.regionChange(g, LO.devB); if (!rc) return out;
    const val = function (r) { return key === 'jobs' ? r.dj : key === 'land' ? r.dl : r.dp; };
    const fmt = function (v) { return (v >= 0 ? '+' : '−') + (key === 'land' ? U.fmtNum(Math.abs(v), 1) + ' km²' : U.fmtPeople(Math.abs(v)) + (key === 'jobs' ? ' 岗位' : ' 人')); };
    const regs = g.city.regions, list = rc.list.filter(function (r) { return Math.abs(val(r)) >= (key === 'land' ? 0.05 : Math.max(200, min)); });
    const up = list.filter(function (r) { return val(r) > 0; }).sort(function (a, b) { return val(b) - val(a); }).slice(0, 4);
    const down = list.filter(function (r) { return val(r) < 0; }).sort(function (a, b) { return val(a) - val(b); }).slice(0, 2);
    for (const r of up.concat(down)) { const rg = regs[r.k]; if (rg && isFinite(rg.cx)) out.push({ x: rg.cx, y: rg.cy, text: r.name + ' ' + fmt(val(r)), kind: val(r) > 0 ? 'up' : 'down' }); }
    return out;
  };
  Renderer.prototype.drawDevLabels = function (ctx) {
    const L = this.devLabels; if (!L || !L.length) return;
    const tmp = {}, col = { up: this.th.night ? [60, 170, 110] : [24, 128, 76], down: [200, 60, 60], plan: this.th.night ? [90, 150, 220] : [40, 100, 180], pull: this.th.night ? [170, 130, 240] : [100, 50, 180] };
    ctx.save(); ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of L) {
      const p = this.P(l.x, l.y, 0, tmp); if (p.x < -60 || p.y < -20 || p.x > this.w + 60 || p.y > this.h + 20) continue;
      const w = ctx.measureText(l.text).width + 16, c = col[l.kind];
      ctx.globalAlpha = 0.92; ctx.fillStyle = U.rgb(c, 0.95); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p.x - w / 2, p.y - 11, w, 22, 11) : ctx.rect(p.x - w / 2, p.y - 11, w, 22); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillText(l.text, p.x, p.y + 0.5);
    }
    ctx.restore();
  };

  // ---------------- 每帧绘制 ----------------
  Renderer.prototype.render = function (dt, ui) {
    const frameStart = performance.now();
    this.frame++; this.time += dt; this.dt = dt;
    this.adaptDetail(dt);
    this.resize();
    const ctx = this.ctx, dpr = this.dpr, g = this.game;
    if (!g) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = U.rgb(TH.bg); ctx.fillRect(0, 0, this.cv.width, this.cv.height); return; }
    if (g.preview && this.layer !== 'none') this.layer = 'none';   // 开始界面背景没有交通模型，不画分析图层
    this.updateCamera(dt);
    this.syncFacModels();
    this.markDirty();
    const cam = this.cam, under = U.smooth(cam.under), t = this.tEase;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = U.rgb(U.mixc(TH.fog || TH.bg, TH.bgUnder, under));
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const M = this.M, z = this.z;
    // 可见范围
    const corners = [this.unproject(0, 0), this.unproject(this.w, 0), this.unproject(0, this.h + (t > 0 ? MAX_H * this.hs : 0)), this.unproject(this.w, this.h + (t > 0 ? MAX_H * this.hs : 0))];
    let wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9;
    for (const p of corners) { wx0 = Math.min(wx0, p.x); wx1 = Math.max(wx1, p.x); wy0 = Math.min(wy0, p.y); wy1 = Math.max(wy1, p.y); }
    this.view = { x0: wx0 - 1, y0: wy0 - 1, x1: wx1 + 1, y1: wy1 + 1 };
    const tStart = performance.now();
    // ---- 地面 ----
    const pool = this.tiles && this.tiles.ready() ? this.tiles : null;
    if (pool && !this.overview) this.renderOverviewBase();
    if (this.overviewStale && pool) { if (!g.jumping && !g.pending && !pool.ovBusy && performance.now() - pool.ovAt > 2500) pool.requestOverview(); }
    else if (this.overviewStale && !this.overviewJob && (!this.overview || performance.now() - this.overviewAt > 600)) this.renderOverview();
    const groundAlpha = 1 - 0.68 * under;
    ctx.globalAlpha = groundAlpha;
    ctx.imageSmoothingEnabled = true;
    const setWorld = () => ctx.setTransform(dpr * M[0] * z, dpr * M[2] * z, dpr * M[1] * z, dpr * M[3] * z, dpr * this.ox, dpr * this.oy);
    const detailScale = z >= 28 ? 1 : (this.detail.tier === 2 ? 0.68 : this.detail.tier === 1 ? 0.85 : 1);
    const eff = z * Math.min(dpr, 1.5) * (1 - 0.28 * t) * detailScale;
    const queue = [];
    const lvl = this.rasterLevel(eff, { x0: wx0, y0: wy0, x1: wx1, y1: wy1 }, queue,
      t >= 0.999 && cam.view === 1 && under < 0.99 && (this.layerFade || 0) < 0.99);
    setWorld();
    if (this.overviewJob) queue.push({ kind: 'o', d: 1 });
    if (this.overview) {
      ctx.drawImage(this.overview, 0, 0, CFG.W, CFG.H);
    }
    if (lvl) {
      const C = CHUNK_PX / lvl;
      const ci0 = Math.max(0, Math.floor(wx0 / C)), ci1 = Math.min(Math.ceil(CFG.W / C) - 1, Math.floor(wx1 / C));
      const cj0 = Math.max(0, Math.floor(wy0 / C)), cj1 = Math.min(Math.ceil(CFG.H / C) - 1, Math.floor(wy1 / C));
      for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
        if (!this.groundVisible(ci * C, cj * C, C)) continue;
        const key = lvl + ':' + ci + ':' + cj;
        let e = this.ground.get(key);
        if (!e || e.stale) {
          queue.push({ kind: 'g', key: key, lvl: lvl, ci: ci, cj: cj, d: Math.abs((ci + 0.5) * C - cam.cx) + Math.abs((cj + 0.5) * C - cam.cy) });
          if (!e) {
            // 退而使用较低分辨率的块
            for (const L2 of LEVELS.slice().reverse()) {
              if (L2 >= lvl) continue;
              const C2 = CHUNK_PX / L2, k2 = L2 + ':' + Math.floor(ci * C / C2) + ':' + Math.floor(cj * C / C2);
              const e2 = this.ground.get(k2);
              if (e2) { e = e2; break; }
            }
            if (!e) continue;
          }
        }
        e.used = this.frame;
        const C2 = CHUNK_PX / e.lvl;
        if (e.x0 === undefined) { const k = e.key.split(':'); e.x0 = +k[1] * C2; e.y0 = +k[2] * C2; }
        const x0 = e.x0, y0 = e.y0;
        if (e.lvl !== lvl) {
          // A coarse fallback covers several requested tiles. Clip it so a later fallback
          // cannot paint over a neighbouring tile that already has sharper imagery.
          ctx.save(); ctx.beginPath(); ctx.rect(ci * C - 1 / lvl, cj * C - 1 / lvl, C + 2 / lvl, C + 2 / lvl); ctx.clip();
        }
        ctx.drawImage(e.cv, 0, 0, CHUNK_PX + 2, CHUNK_PX + 2, x0 - 1 / e.lvl, y0 - 1 / e.lvl, C2 + 2 / e.lvl, C2 + 2 / e.lvl);
        if (e.lvl !== lvl) ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // ---- 图层（地面） ----
    const layerOn = this.layer !== 'none';
    if (layerOn && ['pop', 'jobs', 'cover', 'region', 'fac', 'gap', 'dev', 'commute', 'mshare'].indexOf(this.layer) >= 0) {
      this.buildHeat();
      setWorld();
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.heat, 0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 分析图层开启时：地面加一层浅色蒙版，隐藏建筑与车辆，让图层本身清楚可读（渐变过渡）
    this.layerFade = U.clamp((this.layerFade || 0) + (layerOn ? dt : -dt) / 0.25, 0, 1);
    if (this.layerFade > 0.01 && (this.layer === 'cong' || this.layer === 'flow' || this.layer === 'station' || this.layer === 'tod' || !layerOn)) {
      ctx.fillStyle = U.rgb(TH.fog || TH.bg, 0.5 * this.layerFade); ctx.fillRect(0, 0, this.w, this.h);
    }
    // 经纬网格（视图工具）：画在地面上、建筑之下，保持低调
    if (CM.Grid) CM.Grid.draw(ctx, this);
    // ---- 建筑与动态对象 ----
    const agents = this.agentsOn && this.layerFade < 0.5 ? CM.agents : null;
    if (t >= 0.999 && cam.view === 1) this.bFade = Math.min(1, this.bFade + dt / 0.3); else this.bFade = Math.max(0, this.bFade - dt / 0.15);
    const bAlpha = this.bFade * (1 - under) * (1 - this.layerFade);
    const agentAlpha = (1 - under) * (1 - this.layerFade);
    if (bAlpha > 0.01 && lvl) {
      const ilvl = lvl;
      const C = this.isoChunkGeom(ilvl);
      const ci0 = Math.max(0, Math.floor(wx0 / C) - 1), ci1 = Math.min(Math.ceil(CFG.W / C) - 1, Math.floor(wx1 / C) + 1);
      const cj0 = Math.max(0, Math.floor(wy0 / C) - 1), cj1 = Math.min(Math.ceil(CFG.H / C) - 1, Math.floor(wy1 / C) + 1);
      const list = [];
      for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) list.push([ci, cj]);
      list.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]; });
      const buckets = agents && agentAlpha > 0 ? agents.bucket(C, this) : null;
      const sc = z / ilvl;
      // 地标按其中心所在分块归组，在该分块之后绘制（与前后建筑正确遮挡）
      const city = this.game.city, lmBy = new Map();
      for (let k = 0; k < D.landmarks.length; k++) {
        if (!city.landmarkOn[k]) continue;
        const lm = D.landmarks[k], kk = Math.floor(lm.x / C) + ':' + Math.floor(lm.y / C);
        let l = lmBy.get(kk); if (!l) { l = []; lmBy.set(kk, l); } l.push(k);
      }
      const extraBy = new Map();
      for (const it of this.extraModels()) {
        const key = Math.floor(it.x / C) + ':' + Math.floor(it.y / C);
        let a = extraBy.get(key); if (!a) extraBy.set(key, a = []); a.push(it);
      }
      for (const it of list) {
        const ci = it[0], cj = it[1];
        if (buckets) { const bk = buckets.get(ci + ':' + cj); if (bk) agents.drawList(ctx, this, bk, agentAlpha); }
        const key = 'i' + ilvl + ':' + ci + ':' + cj;
        let e = this.iso.get(key);
        const a = this.P(ci * C, cj * C, 0);
        const visible = this.isoVisible(e, ilvl, ci, cj, C);
        if (visible && (!e || e.stale)) queue.push({ kind: 'i', key: key, lvl: ilvl, ci: ci, cj: cj, C: C, d: Math.abs((ci + 0.5) * C - cam.cx) + Math.abs((cj + 0.5) * C - cam.cy) - 0.5 });
        if (visible && e && !e.empty) {
          e.used = this.frame;
          const fade = Math.min(1, (this.time - e.born) / 0.25);
          ctx.globalAlpha = bAlpha * fade;
          ctx.drawImage(e.cv, a.x - e.ax * sc, a.y - e.ay * sc, e.cv.width * sc, e.cv.height * sc);
        } else if (visible && e) e.used = this.frame;
        const facilities = extraBy.get(ci + ':' + cj);
        if (facilities) for (const it of facilities) this.drawFacilitySprite(ctx, it.lm, Math.min(64, ilvl), bAlpha);
        const lks = lmBy.get(ci + ':' + cj);
        if (lks) for (const k of lks) {
          let landmarkLvl = 64;
          const landmarkEff = z * Math.min(dpr, 1.5) * (1 - 0.28 * t);
          for (const L of LEVELS) if (L >= landmarkEff * 0.85) { landmarkLvl = L; break; }
          const sp = this.landmarkSprite(k, landmarkLvl), lm = D.landmarks[k], a = this.P(lm.x, lm.y, 0), ls = z / landmarkLvl;
          if (!this.screenVisible(a.x - sp.ax * ls, a.y - sp.ay * ls, sp.cv.width * ls, sp.cv.height * ls, 2)) { sp.used = this.frame - 1; continue; }
          ctx.globalAlpha = bAlpha * Math.min(1, (this.time - sp.born) / 0.25);
          ctx.drawImage(sp.cv, a.x - sp.ax * ls, a.y - sp.ay * ls, sp.cv.width * ls, sp.cv.height * ls);
        }
      }
      ctx.globalAlpha = 1;
    } else if (agents && agentAlpha > 0) {
      agents.drawAll(ctx, this, agentAlpha);
    }
    if (z >= 16 && agentAlpha > 0.3 && !g.preview && this.agentsOn) this.drawCranes(ctx, agentAlpha);
    // ---- 图层（线状） ----
    if (this.layer === 'cong') this.drawCongestion(ctx);
    if (this.layer === 'flow') this.drawDesire(ctx);
    if (this.layer === 'cover') this.drawCoverExtras(ctx, ui);
    // ---- 地铁 ----
    this.drawDemolitions(ctx, under);
    this.drawScenicZones(ctx, under);
    this.drawHeritage(ctx, under);
    this.drawMetro(ctx, ui);
    if (t > 0.05 && this.layer === "none") this.drawStationModels(ctx, g.draft && g.draft.compiled || g.compiled, under);
    CM.CityLink.draw(this, ctx, (1 - under) * (1 - this.layerFade));
    this.drawPortals(ctx, (1 - under) * (1 - this.layerFade));
    if (CM.BgTransit && this.game === CM.game) CM.BgTransit.draw2D(ctx, this, agentAlpha);
    if (agents) agents.drawTrains(ctx, this, ui);
    if (this.layer === 'station') this.drawStationFlows(ctx);
    if (this.layer === 'tod') this.drawTodLayer(ctx);
    if (CM.Settings.get('taskPins') && !g.preview) this.drawTaskPins(ctx);
    if (this.layer === 'gap') this.drawGapOverload(ctx);
    if (this.layer === 'fac' || this.layer === 'gap') this.drawFacilities(ctx);
    if (this.fx.length) this.drawFx(ctx, dt);
    if (under < 0.5) this.drawAtmosphere(ctx);
    // ---- 标注 ----
    this.drawLabels(ctx, ui);
    if (CM.Grid) CM.Grid.drawLabels(ctx, this);
    if (this.layer === 'dev' && this.layerFade > 0.5) this.drawDevLabels(ctx);
    if (this.hl) this.drawHighlight(ctx);
    if (ui && ui.drawOverlay) ui.drawOverlay(ctx, this);
    // ---- 缓存渲染队列 ----
    // 优先补齐当前画面；空闲时在网页版的帧预算内预绘。
    let pending = 0;
    for (const q of queue) if (q.kind !== 'o') pending++;
    this.stats.pendingVisible = pending;
    const warming = this.warmUntil && performance.now() < this.warmUntil;
    if (!warming) this.warmUntil = 0;
    let budget;
    if (warming) budget = CFG.perf.warmBudgetMs;
    else if (pending) budget = Math.max(2, Math.min(g.preview ? 4 : CFG.perf.sharpBudgetMs, 16 - (performance.now() - tStart)));
    else {
      budget = this.detail.ema < 14 && !(this.cam.fly) ? Math.min(CFG.perf.prefetchMs, Math.max(0, 14 - (performance.now() - tStart))) : 0;
      if (budget > 0.5) this.prefetch(queue, lvl, { x0: wx0, y0: wy0, x1: wx1, y1: wy1 }, t >= 0.999 && cam.view === 1 && under < 0.99 && this.layerFade < 0.99);
      else budget = 0;
    }
    // 镜头移动中（拖动、滚轮缩放、键盘平移）：每帧补块的预算收紧，保证移动流畅；停下后再用完整预算补齐
    const camKey = cam.cx.toFixed(3) + ':' + cam.cy.toFixed(3) + ':' + cam.zoom.toFixed(3) + ':' + cam.t.toFixed(2) + ':' + cam.under.toFixed(2);
    const moving = camKey !== this._camKey; this._camKey = camKey;
    if (moving) this.movedAt = performance.now();
    this.interacting = performance.now() - (this.movedAt || -1e9) < 200;
    if (moving) budget = Math.min(budget, CFG.perf.movingBudgetMs || 3);
    if (!warming || moving) budget = Math.min(budget, Math.max(0, 14 - (performance.now() - (this.frameWorkStart || frameStart))));
    if (this.isoJob) {
      const active = queue.find((q) => q.kind === 'i' && q.key === this.isoJob.key);
      if (!active || this.isoJob.version !== g.city.version) this.cancelIsoJob();
      else active.d = Math.min(active.d, -0.6);
    }
    const gver = g.city.version + ':' + this.roadVer + ':' + this.styleEpoch + ':' + this.themeName;
    if (this.groundJob) {
      const active = queue.find((q) => q.kind === 'g' && q.key === this.groundJob.key);
      if (!active || this.groundJob.ver !== gver) this.cancelGroundJob();
      else active.d = Math.min(active.d, -0.7);
    }
    queue.sort(function (a, b) { return a.d - b.d; });
    const queueStart = performance.now();
    let n = 0;
    if (pool && this.groundJob) this.groundJob = null;
    for (const q of queue) {
      if (pool && q.kind === 'g' && pool.list) { if (!g.jumping) pool.request(q); continue; }
      if (n > 0 && performance.now() - queueStart >= budget) break;
      const t1 = performance.now();
      if (q.kind === 'g') {
        // 地面块按条带分帧绘制（groundChunkGen），同一时间只进行一块
        if (this.groundJob && this.groundJob.key !== q.key) continue;
        if (!this.groundJob) this.groundJob = { key: q.key, ver: gver, gen: this.groundChunkGen(q.lvl, q.ci, q.cj) };
        const deadline = performance.now() + Math.max(0.25, budget - (performance.now() - queueStart));
        let cv = null;
        do { const step = this.groundJob.gen.next(); if (step.done) { cv = step.value; break; } this.groundJob.cv = step.value; } while (performance.now() < deadline);
        if (!cv) { n++; break; }
        this.groundJob = null;
        const old = this.ground.get(q.key); if (old) this.cachePx -= old.px;
        this.ground.set(q.key, { cv: cv, lvl: q.lvl, key: q.key, used: this.frame, px: cv.width * cv.height, stale: false });
        this.cachePx += cv.width * cv.height;
      } else if (q.kind === 'o') {
        this.stepOverview();
      } else {
        if (this.isoJob && this.isoJob.key !== q.key) continue;
        if (!this.isoJob) this.isoJob = { key: q.key, version: g.city.version, gen: this.isoChunkGen(q.lvl, q.ci, q.cj, q.C), cv: null };
        const deadline = performance.now() + Math.max(0.25, budget - (performance.now() - queueStart));
        do {
          const step = this.isoJob.gen.next();
          if (step.done) {
            const r = step.value, old = this.iso.get(q.key); if (old) this.cachePx -= old.px;
            r.used = this.frame; r.born = old || warming || q.d >= 100 ? this.time - 1 : this.time; r.stale = false;
            this.iso.set(q.key, r); this.cachePx += r.px; this.isoJob = null; break;
          }
          this.isoJob.cv = step.value.cv;
        } while (performance.now() < deadline);
      }
      n++;
      if (performance.now() - t1 > budget) break;
    }
    this.stats.chunksDrawn = n;
    this.lastQueueMs = performance.now() - queueStart;
    this.evict();
    this.lastRenderMs = performance.now() - frameStart;
  };

  // 塔吊（城市成长）：近 18 个月新开发或明显加高的街区立起塔吊，吊臂随游戏时间缓慢转动（暂停时静止）；
  // 视野内最多 40 台，远景不画，不缓存也不进入存档
  Renderer.prototype.drawCranes = function (ctx, alpha) {
    const g = this.game, sites = g.city.sites;
    if (!sites || !sites.size || !g.ym) return;
    const now = g.ym(), v = this.view, W = g.city.W, vt = CM.agents ? CM.agents.vt : 0, a0 = {}, a1 = {}, a2 = {}, a3 = {};
    let n = 0;
    ctx.lineCap = 'round';
    for (const [c, m0] of sites) {
      const age = now - m0; if (age < 0 || age > 18 || U.hash2(c, 9, 41) > 0.4) continue;   // 约四成工地立塔吊，避免快速发展期满城塔吊
      const i = c % W, j = (c / W) | 0, x = i + 0.3 + 0.4 * U.hash2(c, 1, 41), y = j + 0.3 + 0.4 * U.hash2(c, 2, 41);
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      if (++n > 40) break;
      const hTop = Math.max(0.12, g.city.bh[c] * EX * 1.15 + 0.05);
      const base = this.P(x, y, 0, a0), tp = this.P(x, y, hTop, a1);
      const a = vt * 0.0035 + U.hash2(c, 3, 41) * 6.28, jl = 0.2, cl = 0.07;
      const hookAt = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(vt * 0.002 + c));
      const j1 = this.P(x + Math.cos(a) * jl, y + Math.sin(a) * jl, hTop, a2), j2 = this.P(x - Math.cos(a) * cl, y - Math.sin(a) * cl, hTop, a3);
      ctx.globalAlpha = Math.min(1, (18 - age) / 3) * alpha;
      ctx.strokeStyle = TH.night ? '#a07a2a' : '#e2a72e'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tp.x, tp.y); ctx.moveTo(j2.x, j2.y); ctx.lineTo(j1.x, j1.y); ctx.stroke();
      const hx = tp.x + (j1.x - tp.x) * hookAt, hy = tp.y + (j1.y - tp.y) * hookAt, drop = Math.max(2, (base.y - tp.y) * 0.5);
      ctx.strokeStyle = TH.night ? 'rgba(200,200,200,0.5)' : 'rgba(60,60,60,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + drop); ctx.stroke();
      if (TH.night) { ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(tp.x, tp.y, 1.3, 0, Math.PI * 2); ctx.arc(j1.x, j1.y, 1.1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  };
  // ---------------- 地铁绘制 ----------------
  Renderer.prototype.lineWidthPx = function () { return U.clamp(this.z * 0.1, 2.8, 9); };
  // 某种建设方式的线路在画面上的高度（与线路本身的绘制一致：高架抬高，地下线只在地下视图中下沉）。
  // 绘线预览、控制点、冲突与拖动提示都画在这个高度上，2D 与 3D 指向同一条线（v2.3）
  Renderer.prototype.trackH = function (type) { let hh = CFG.metro.height[type] || 0; if (hh < 0) hh = hh * U.smooth(this.cam.under) * UNDER_DEPTH; return hh; };
  Renderer.prototype.segScreen = function (cs, under, out) {
    const pts = cs.g.pts, hs = cs.h, n = pts.length;
    // 缓存键每帧（及地下视图进度变化时）只拼一次
    if (this._ssFrame !== this.frame || this._ssUnder !== under) { this._ssFrame = this.frame; this._ssUnder = under; this._ssKey = this.M.join(',') + ':' + this.z + ':' + this.ox + ':' + this.oy + ':' + under + ':' + this.hs; }
    const key = this._ssKey;
    let cached = !out && this.segScreens.get(cs);
    if (cached && cached.key === key) return cached.arr;
    const arr = out || (cached ? cached.arr : new Float32Array(n * 2));
    const uw = U.smooth(under);
    const ty = cs.seg.type;
    for (let i = 0; i < n; i++) {
      let h = hs[i];
      if (h < 0) h = h * uw * UNDER_DEPTH;
      const M = this.M, z = this.z;
      arr[i * 2] = this.ox + (M[0] * pts[i][0] + M[1] * pts[i][1]) * z;
      arr[i * 2 + 1] = this.oy + (M[2] * pts[i][0] + M[3] * pts[i][1]) * z - h * this.hs;
    }
    if (!out) this.segScreens.set(cs, { key: key, arr: arr });
    return arr;
  };
  // 地铁线网（v2.6 性能）：几千座车站时逐段描边、逐站画圆是最重的一步，这里分三层省下来——
  // ① 轨道按「方式、颜色、透明度、线宽」合并成一条路径描一次（描边次数只随线路颜色数增长）；
  // ② 车站符号预先画进图集，每帧只贴图（stationSprite）；③ 平面视图把线网整张画进带边距的缓存图，
  // 静止、平移时直接贴图，缩放时先缩放旧图、约每 120 ms 重画一次（blitMetroLayer）。拾取用的屏幕坐标按需计算（SegPx）
  function SegPx(R) { this.R = R; this.C = null; this.ix = null; this.under = 0; this.lw = 0; this.sh = new Map(); this.vis = null; }
  SegPx.prototype.begin = function (C, ix, under, lw) { this.C = C; this.ix = ix; this.under = under; this.lw = lw; this.sh.clear(); this.vis = null; };
  SegPx.prototype.arr = function (cs) {
    if (!cs.shift) return this.R.segScreen(cs, this.under);
    let a = this.sh.get(cs.seg.id);
    if (!a) { a = shiftArr(this.R.segScreen(cs, this.under), cs.shift * (this.lw + 1.2)); this.sh.set(cs.seg.id, a); }
    return a;
  };
  SegPx.prototype.get = function (id) { const cs = this.C && this.C.segs.get(id); return cs ? this.arr(cs) : undefined; };
  SegPx.prototype.visible = function () {
    if (this.vis) return this.vis;
    const v = this.R.view, ix = this.ix, out = [];
    if (ix && v) for (const q of CM.Geo.query(ix.grid, v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6)) {
      const bb = ix.order[q].bbox;
      if (bb[2] < v.x0 - 6 || bb[0] > v.x1 + 6 || bb[3] < v.y0 - 6 || bb[1] > v.y1 + 6 || !this.C.net.lines[ix.order[q].cs.seg.line]) continue;
      out.push(ix.order[q].cs);
    }
    return (this.vis = out);
  };
  SegPx.prototype.forEach = function (fn) { for (const cs of this.visible()) fn(this.arr(cs), cs.seg.id); };
  SegPx.prototype[Symbol.iterator] = function* () { for (const cs of this.visible()) yield [cs.seg.id, this.arr(cs)]; };
  // 每个编译结果的车站显示信息：是否换乘、线路颜色、站外换乘；颜色、主题或线路风格变化时重建
  Renderer.prototype.stationInfo = function (C, ix) {
    const g = this.game, mnet = g.model && g.model.net, sig = this.themeName + '|' + 'standard' + '|' + AX.flag() + '|' + this.dpr;
    let rs = ix.rs;
    if (rs && rs.mnet === mnet && rs.sig === sig) return rs;
    // 站外换乘：两座不同线路的运营车站之间可步行换乘（虚线连接，两站都按换乘站标示）
    const xfer = new Set(), xLinks = [];
    if (mnet && mnet.acc) {
      const MC = mnet.C;
      for (const tr of mnet.acc.transfers) {
        if (tr.a > tr.b) continue;
        const ia = C.sIndex.get(MC.stations[tr.a].id), ib = C.sIndex.get(MC.stations[tr.b].id);
        if (ia === undefined || ib === undefined) continue;
        // 草案里已移动的车站不能继续沿用原位置的换乘结果。
        if(U.dist(C.stations[ia].x,C.stations[ia].y,MC.stations[tr.a].x,MC.stations[tr.a].y)>1e-7||U.dist(C.stations[ib].x,C.stations[ib].y,MC.stations[tr.b].x,MC.stations[tr.b].y)>1e-7)continue;
        const la = C.stationLines[ia], lb = C.stationLines[ib];
        if (!la.size || !lb.size) continue;
        let share = false; la.forEach(function (l) { if (lb.has(l)) share = true; });
        if (share) continue;
        xfer.add(ia); xfer.add(ib); xLinks.push([ia, ib]);
      }
    }
    const n = C.stations.length, inter = new Uint8Array(n), keys = new Array(n);
    for (let i = 0; i < n; i++) {
      const lines = C.stationLines[i], f = lines.size > 1 || xfer.has(i);
      inter[i] = f ? 1 : 0;
      let k = (C.serviced[i] ? 's' : 'u') + (f ? 'x' : 'o') + (C.stations[i].size || '');
      lines.forEach(function (id) { const L = C.net.lines[id]; k += ',' + (L ? AX.line(L) : '#888888'); });
      keys[i] = k;
    }
    return (ix.rs = { mnet: mnet, sig: sig, xfer: xfer, xLinks: xLinks, inter: inter, keys: keys, spr: new Array(n).fill(null) });
  };
  // 车站符号本体（不含选中、商业开发等叠加标记）：图集与直接绘制共用
  Renderer.prototype.paintStationCore = function (ctx, C, i, s, p, h, r, lw, inter, lines, LS, serviced) {
    const ow = inter ? Math.max(2.2, r * 0.3) : Math.max(1.8, r * 0.36);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = TH.stFill; ctx.fill();
    if (!serviced) { ctx.setLineDash([3, 2]); ctx.strokeStyle = '#8a8f98'; }
    else if (inter) ctx.strokeStyle = TH.stInter;
    else { const lid = lines.values().next().value; ctx.strokeStyle = C.net.lines[lid] ? AX.line(C.net.lines[lid]) : '#444'; }
    ctx.lineWidth = ow;
    ctx.stroke(); ctx.setLineDash([]);
    // 换乘标志：深色外环 + 各线路颜色分段内环 + 换乘箭头
    if (inter && serviced) {
      const ls = Array.from(lines), n = ls.length;
      if (n >= 1) {
        const rr = r - ow * 0.5 - Math.max(1.1, r * 0.13), gap = n > 1 ? 0.22 : 0;
        ctx.lineWidth = Math.max(1.5, r * 0.2); ctx.lineCap = 'butt';
        for (let k = 0; k < n; k++) {
          const L = C.net.lines[ls[k]]; if (!L) continue;
          const a0 = -Math.PI / 2 + k * Math.PI * 2 / n + gap / 2, a1 = -Math.PI / 2 + (k + 1) * Math.PI * 2 / n - gap / 2;
          ctx.strokeStyle = AX.line(L); ctx.beginPath(); ctx.arc(p.x, p.y, rr, a0, a1); ctx.stroke();
        }
        ctx.lineCap = 'round';
      }
      if (r >= 6.5) xferGlyph(ctx, p.x, p.y, r * 0.36, TH.stInter);
    }
  };
  // 车站符号图集：半径按档取整（贴图时再缩放到实际大小），同样颜色组合的车站共用一张
  const R_BUCKET = [3, 3.6, 4.4, 5.4, 6.6, 8, 10, 12.5, 16, 20, 26];
  Renderer.prototype.stationSprite = function (C, i, s, h, r, lw, inter, lines, LS, serviced, rs) {
    let b = R_BUCKET[R_BUCKET.length - 1];
    for (let k = 0; k < R_BUCKET.length; k++) if (R_BUCKET[k] >= r) { b = R_BUCKET[k]; break; }
    const old = rs.spr[i];
    if (old && old.b === b && !old.dead) return old;
    let S = this._stAtlas;
    if (!S || S.sig !== rs.sig) { if (S) S.atlas.dispose(); S = this._stAtlas = { sig: rs.sig, atlas: new Atlas(3), map: new Map(), budget: 0, frame: -1 }; }
    if (S.frame !== this.frame) { S.frame = this.frame; S.budget = 60; }
    const key = rs.keys[i] + '|' + b;
    let e = S.map.get(key);
    if (!e) {
      // 缩放跨档时一帧只画几十张新符号，其余车站先用上一档的图（按实际大小缩放），几帧内换完
      if (S.budget <= 0) return old && !old.dead ? old : null;
      S.budget--;
      const dpr = this.dpr, half = Math.ceil(b * 1.32 + 5), px = Math.ceil(half * 2 * dpr);
      e = { b: b, half: half, cv: null, sx: 0, sy: 0, sw: 0, sh: 0, dead: false };
      const x = S.atlas.alloc(px, px, e, S.map, key);
      x.save(); x.setTransform(dpr, 0, 0, dpr, e.sx + px / 2, e.sy + px / 2); x.globalAlpha = 1; x.lineJoin = 'round'; x.lineCap = 'round';
      this.paintStationCore(x, C, i, s, { x: 0, y: 0 }, h, b, lw, !!inter, lines, LS, serviced);
      x.restore();
      S.map.set(key, e);
    }
    rs.spr[i] = e;
    return e;
  };
  // 本帧的车站屏幕位置（拾取、站名与图层用；对象复用，不产生垃圾）
  Renderer.prototype.updateStationPx = function (C, rs, under) {
    const v = this.view, n = C.stations.length, R0 = U.clamp(this.z * 0.11, 3.2, 9);
    let objs = this._stObjs; if (!objs || objs.length < n) objs = this._stObjs = Array.from({ length: Math.max(n, 64) }, function () { return { x: 0, y: 0, r: 0, id: '' }; });
    const out = this.stPx || (this.stPx = []); out.length = n;
    for (let i = 0; i < n; i++) {
      const s = C.stations[i];
      if (s.x < v.x0 - 1 || s.x > v.x1 + 1 || s.y < v.y0 - 1 || s.y > v.y1 + 1) { out[i] = null; continue; }
      let hh = CFG.metro.height[s.type]; if (hh < 0) hh = hh * under * UNDER_DEPTH;
      const o = objs[i]; this.P(s.x, s.y, hh, o);
      o.r = R0 * (s.size === 'S' ? 0.8 : s.size === 'L' ? 1.3 : s.size === 'XL' ? 1.55 : 1) * (rs.inter[i] ? 1.4 : 1); o.id = s.id;
      out[i] = o;
    }
  };
  // 轨道与车站（不含选中与草案标记）。v：参与绘制的世界范围（缓存图比屏幕大一圈）
  Renderer.prototype.paintMetro = function (ctx, C, ix, rs, v, under, t, lw, LS, hlLine, lyrDim, draft) {
    const g = this.game, z = this.z, list = CM.Geo.query(ix.grid, v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6).sort(function (a, b) { return a - b; }), order = ix.order;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 越江隧道：所有可见区段合成一条路径、每帧只描一次（大型线网不随区段数增加描边次数）；
    // 被高亮线路淡化的区段仍在各自绘制时单独描边
    this._tunBatch = false;
    if (z >= 12 && under < 0.5 && LS === 'standard') {
      const wp = new Path2D(), add = function (p, arr, r) { p.moveTo(arr[r[0] * 2], arr[r[0] * 2 + 1]); for (let i = r[0] + 1; i <= r[1]; i++) p.lineTo(arr[i * 2], arr[i * 2 + 1]); };
      let anyW = false;
      for (const q of list) {
        const cs = order[q].cs, s = cs.seg, bb = order[q].bbox;
        if (!C.net.lines[s.line] || (hlLine && hlLine !== s.line)) continue;
        if (bb[2] < v.x0 - 6 || bb[0] > v.x1 + 6 || bb[3] < v.y0 - 6 || bb[1] > v.y1 + 6) continue;
        const d = this.segDeco(cs);
        if (!d.water.length) continue;
        const arr = this.segScreen(cs, under);
        for (const r of d.water) if (cs.h[(r[0] + r[1]) >> 1] < -DECO_FLAT) { add(wp, arr, r); anyW = true; }
      }
      if (anyW) { ctx.lineCap = 'butt'; ctx.globalAlpha = (1 - 2 * under) * lyrDim; ctx.strokeStyle = TH.trk.tunnelWater; ctx.lineWidth = lw + 4.5; ctx.stroke(wp); ctx.lineCap = 'round'; ctx.globalAlpha = 1; }
      this._tunBatch = true;
    }
    // 轨道：同一层（地下 / 地面 / 高架）的区段按颜色合并；有桥面、道床等细节的区段逐段画在合并描边之后
    const P = this.segPx, far = z < 12 || under >= 0.5, marks = [];
    let batch = new Map(), direct = [], rank = '';
    const flush = () => {
      if (batch.size) {
        const es = Array.from(batch.values());
        if (far) for (const e of es) if (e.type !== 'underground' || under > 0.5) { ctx.globalAlpha = e.alpha; ctx.strokeStyle = e.type === 'elevated' ? TH.elevCase : TH.lineCase; ctx.lineWidth = e.width + 2.5; strokeArrs(ctx, e.arrs); }
        for (const e of es) { ctx.globalAlpha = far ? e.alpha : e.alpha * U.lerp(0.82, 1, under); ctx.strokeStyle = e.col; ctx.lineWidth = e.width; strokeArrs(ctx, e.arrs); }
        for (const e of es) {
          ctx.globalAlpha = e.alpha;
          if (e.type === 'surface') { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, e.width * 0.22); ctx.setLineDash([e.width, e.width]); strokeArrs(ctx, e.arrs); ctx.setLineDash([]); }
          if (e.type === 'underground' && under < 0.5 && !g.preview) { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, e.width * 0.18); ctx.setLineDash([2, e.width * 1.6]); strokeArrs(ctx, e.arrs); ctx.setLineDash([]); }
        }
        ctx.globalAlpha = 1; batch = new Map();
      }
      for (const a of direct) this.drawTrack(ctx, a[0], a[1], a[2], a[3], a[4], under, t, this._tunBatch && !(hlLine && hlLine !== a[0].seg.line));
      direct = [];
    };
    for (const q of list) {
      const cs = order[q].cs, s = cs.seg, line = C.net.lines[s.line];
      if (!line) continue;
      const bb = order[q].bbox;   // 粗略裁剪
      if (bb[2] < v.x0 - 6 || bb[0] > v.x1 + 6 || bb[3] < v.y0 - 6 || bb[1] > v.y1 + 6) continue;
      const col = AX.line(line);
      let alpha = 1, width = lw;
      if (s.type === 'underground') { alpha = U.lerp(0.92, 1, under); width = lw * U.lerp(0.95, 1.05, under); }
      else if (under > 0) alpha = U.lerp(1, 0.35, under);
      if (hlLine && hlLine !== s.line) alpha *= 0.3;
      alpha *= lyrDim;
      if (s.type !== rank) { flush(); rank = s.type; }
      const arr = P.arr(cs);
      let plain = far;
      if (!plain && s.type === 'underground') { const d = this.segDeco(cs); plain = !d.water.length && !d.ground.length && !d.high.length && !d.raised && (z < 16 || !d.rails.length) && d.buried.length === 1 && d.buried[0][0] === 0 && d.buried[0][1] === arr.length / 2 - 1; }
      if (plain) {
        const key = col + '|' + alpha + '|' + width + (s.type === rank ? '' : s.type);
        let e = batch.get(key);
        if (!e) { e = { type: s.type, col: col, alpha: alpha, width: width, arrs: [] }; batch.set(key, e); }
        e.arrs.push(arr);
      } else direct.push([cs, arr, col, alpha, width]);
      if (draft && ix.changed && ix.changed.has(s.id)) marks.push([arr, width]);
    }
    flush();
    if (marks.length) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -this.time * 12;
      for (const m of marks) { ctx.lineWidth = Math.max(1.2, m[1] * 0.3); this.strokeArr(ctx, m[0]); }
      ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
    }
    const stH = function (s) { let hh = CFG.metro.height[s.type]; if (hh < 0) hh = hh * under * UNDER_DEPTH; return hh; };
    if (rs.xLinks.length) {
      ctx.strokeStyle = TH.stInter; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(2, lw * 0.45); ctx.setLineDash([3, 4]); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const l of rs.xLinks) { const A = C.stations[l[0]], B = C.stations[l[1]]; if (!A || !B) continue; const pa = this.P(A.x, A.y, stH(A)), pb = this.P(B.x, B.y, stH(B)); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // 车站
    const R0 = U.clamp(z * 0.11, 3.2, 9), portalA = (1 - under) * (1 - (this.layerFade || 0)), tmp = this._stTmp || (this._stTmp = { x: 0, y: 0 }), dpr = this.dpr;
    for (let i = 0; i < C.stations.length; i++) {
      const s = C.stations[i];
      if (s.x < v.x0 - 1 || s.x > v.x1 + 1 || s.y < v.y0 - 1 || s.y > v.y1 + 1) continue;
      const h = stH(s), p = this.P(s.x, s.y, h, tmp), lines = C.stationLines[i], inter = rs.inter[i] === 1;
      const r = R0 * (s.size === 'S' ? 0.8 : s.size === 'L' ? 1.3 : s.size === 'XL' ? 1.55 : 1) * (inter ? 1.4 : 1), serviced = C.serviced[i];
      let alpha = 1;
      if (hlLine && !lines.has(hlLine)) alpha = 0.35;
      alpha *= lyrDim;
      ctx.globalAlpha = alpha;
      // 已接通的接驳口车站：在地图边缘画成线路颜色的双向箭头（drawPortals），这里不画站点圆
      if (s.portal && serviced && portalA > 0.5 && CM.Fac && CM.Fac.isPortalStation(s)) continue;
      if (s.type === 'underground' && under > 0.05) {
        const gp = this.P(s.x, s.y, 0);
        ctx.strokeStyle = 'rgba(90,100,120,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      if (s.type === 'elevated' && this.tEase > 0.05) {
        const gp = this.P(s.x, s.y, 0);
        ctx.strokeStyle = 'rgba(120,124,130,0.7)'; ctx.lineWidth = Math.max(2, r * 0.6); ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      // 天地换乘：其他站台层画在各自高度，用竖向通道（深色实线、白色内芯）与主站台相连，
      // 站台圈描该层颜色（平面视图中与主站台重合，只看右上角的站台层标志）
      const lvs = C.stLevels && C.stLevels[i];
      if (lvs && this.tEase > 0.05) for (const t3 of lvs) {
        if (t3 === s.type) continue;
        let hh = CFG.metro.height[t3]; if (hh < 0) hh = hh * under * UNDER_DEPTH;
        const q = this.P(s.x, s.y, hh);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 1.5) continue;
        ctx.lineCap = 'round';
        ctx.strokeStyle = TH.stInter; ctx.lineWidth = Math.max(3, r * 0.55);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = TH.stFill; ctx.fill();
        ctx.strokeStyle = LEVEL_COL[t3]; ctx.lineWidth = Math.max(2.4, r * 0.34); ctx.stroke();
        ctx.strokeStyle = TH.stInter; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.86 + Math.max(1.2, r * 0.17), 0, Math.PI * 2); ctx.stroke();
      }
      const e = this.stationSprite(C, i, s, h, r, lw, rs.inter[i], lines, LS, serviced, rs);
      if (e) { const k = r / e.b, hw = e.half * k; ctx.drawImage(e.cv, e.sx, e.sy, e.sw, e.sh, p.x - hw, p.y - hw, hw * 2, hw * 2); }
      else this.paintStationCore(ctx, C, i, s, p, h, r, lw, inter, lines, LS, serviced);
      const todLv = g.net.stations[s.id] ? g.net.stations[s.id].tod || 0 : 0;
      if (todLv && serviced) this.drawTodMark(ctx, p.x, p.y, r, inter ? Math.max(2.2, r * 0.3) : Math.max(1.8, r * 0.36), todLv);
      if (lvs && lvs.length > 1 && serviced) levelBadge(ctx, p.x + r * 0.85, p.y - r * 0.85, Math.max(12, r * 1.4), lvs, TH.stInter);
    }
    ctx.globalAlpha = 1;
  };
  // 平面视图的线网缓存图：比屏幕大一圈。平移在边距内直接贴图（对齐到物理像素），缩放时先缩放旧图，停下或约 120 ms 后重画
  Renderer.prototype.blitMetroLayer = function (ctx, C, ix, rs, lw, LS, hlLine, lyrDim) {
    const w = this.w, h = this.h, dpr = this.dpr, mx = Math.round(w * 0.18), my = Math.round(h * 0.18), z = this.z, ox = this.ox, oy = this.oy, cam = this.cam, now = performance.now();
    const key = ix.seq + '|' + rs.sig + '|' + (hlLine || '') + '|' + Math.round(lyrDim * 40) + '|' + this.detail.tier + '|' + this.game.netVersion + '|' + (this.game.city.terrainVer || 0) + '|' + w + '|' + h + '|' + (rs.mnet ? rs.xLinks.length : -1);
    let L = this._mLayer, redo = !L || L.key !== key;
    if (!redo) {
      const k = z / L.z;
      if (Math.abs(k - 1) < 1e-6) redo = Math.abs(ox - L.ox) > mx || Math.abs(oy - L.oy) > my;
      else {
        const x0 = ox - k * (L.ox + mx), y0 = oy - k * (L.oy + my), zooming = Math.abs(cam.tz - cam.zoom) > cam.zoom * 0.002 || !!cam.fly || !!cam.tween;
        redo = !zooming || now - L.at > 120 || x0 > 0 || y0 > 0 || x0 + k * (w + 2 * mx) < w || y0 + k * (h + 2 * my) < h;
      }
    }
    if (redo) {
      const cw = Math.round((w + 2 * mx) * dpr), ch = Math.round((h + 2 * my) * dpr);
      if (!L) L = this._mLayer = { cv: makeCanvas(cw, ch) };
      if (L.cv.width !== cw || L.cv.height !== ch) { L.cv.width = cw; L.cv.height = ch; }
      const x = L.ctx || (L.ctx = L.cv.getContext('2d')), v = this.view;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cw, ch); x.setTransform(dpr, 0, 0, dpr, mx * dpr, my * dpr);
      this._paintMg = Math.max(mx, my);
      this.paintMetro(x, C, ix, rs, { x0: v.x0 - mx / z, y0: v.y0 - my / z, x1: v.x1 + mx / z, y1: v.y1 + my / z }, 0, 0, lw, LS, hlLine, lyrDim, null);
      this._paintMg = 0;
      L.key = key; L.z = z; L.ox = ox; L.oy = oy; L.at = now;
    }
    const k = z / L.z;
    if (Math.abs(k - 1) < 1e-6) ctx.drawImage(L.cv, Math.round((ox - L.ox - mx) * dpr) / dpr, Math.round((oy - L.oy - my) * dpr) / dpr, w + 2 * mx, h + 2 * my);
    else ctx.drawImage(L.cv, ox - k * (L.ox + mx), oy - k * (L.oy + my), k * (w + 2 * mx), k * (h + 2 * my));
  };
  Renderer.prototype.drawMetro = function (ctx, ui) {
    const g = this.game;
    const draft = g.draft ? g.draftCompiled() : null;
    const C = draft || g.compiled;
    const under = U.smooth(this.cam.under), t = this.tEase;
    const lw = this.lineWidthPx(), LS = 'standard';
    const v = this.view;
    const sel = ui ? ui.selection : null;
    const hlLine = ui && ui.highlightLine;
    const lyrDim = this.layer === 'cong' || this.layer === 'flow' ? 1 - 0.65 * (this.layerFade || 0) : 1;   // 拥堵、出行方向图层下淡化地铁
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (!this.segPx) this.segPx = new SegPx(this);
    // 草案中被删除的正式轨道（虚影）
    if (draft) {
      g.compiled.segs.forEach((cs, id) => {
        if (draft.segs.has(id)) return;
        let inBase = false;
        draft.segs.forEach(function (d) { if (d.seg.base && d.seg.base.indexOf(id) >= 0) inBase = true; });
        if (inBase) return;
        const arr = this.segScreen(cs, under);
        ctx.strokeStyle = 'rgba(214,48,49,0.55)'; ctx.lineWidth = lw; ctx.setLineDash([lw * 1.2, lw * 1.2]);
        this.strokeArr(ctx, arr); ctx.setLineDash([]);
      });
    }
    if (!this.metroOrder || this.metroOrder.C !== C) {
      const order = [], rank = { underground: 0, surface: 1, elevated: 2 };
      C.segs.forEach(function (cs) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of cs.g.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        order.push({ cs: cs, bbox: [x0, y0, x1, y1] });
      });
      order.sort(function (a, b) { return rank[a.cs.seg.type] - rank[b.cs.seg.type]; });
      this.metroOrder = { C: C, seq: (this._metroSeq = (this._metroSeq || 0) + 1), order: order, grid: CM.Geo.buckets(order, 8, g.city.W, g.city.H), rs: null, changed: null };
    }
    const ix = this.metroOrder, rs = this.stationInfo(C, ix);
    // 草案标记：与正式线网相比有变化的区段（每份草案只比较一次）
    if (draft && !ix.changed) {
      ix.changed = new Set();
      C.segs.forEach(function (cs) {
        const s = cs.seg, o = g.net.segments[s.id], A = C.net.stations[s.a], B = C.net.stations[s.b];
        if (!o || o.type !== s.type || JSON.stringify(o.pts) !== JSON.stringify(s.pts) || g.net.stations[s.a].x !== A.x || g.net.stations[s.a].y !== A.y || !g.net.stations[s.b] || g.net.stations[s.b].x !== B.x || g.net.stations[s.b].y !== B.y) ix.changed.add(s.id);
      });
    }
    this.segPx.begin(C, ix, under, lw);
    this.updateStationPx(C, rs, under);
    if (!draft && under === 0 && t === 0 && C.segs.size >= 150) this.blitMetroLayer(ctx, C, ix, rs, lw, LS, hlLine, lyrDim);
    else this.paintMetro(ctx, C, ix, rs, v, under, t, lw, LS, hlLine, lyrDim, draft);
    // 选中的区段
    if (sel && sel.kind === 'seg') {
      const cs = C.segs.get(sel.id), L = cs && C.net.lines[cs.seg.line];
      if (L) { ctx.globalAlpha = 0.35; ctx.strokeStyle = AX.line(L); ctx.lineWidth = lw + 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; this.strokeArr(ctx, this.segPx.arr(cs)); ctx.globalAlpha = 1; }
    }
    this.drawWalkTransferHints(ctx, C, ui, rs.xLinks);
    // 草案新站与选中车站的动态标记
    if (draft || (sel && sel.kind === 'station')) {
      const stPx = this.stPx;
      for (let i = 0; i < C.stations.length; i++) {
        const s = C.stations[i], p = stPx[i]; if (!p) continue;
        if (draft && !g.net.stations[s.id]) {
          ctx.strokeStyle = 'rgba(30,136,229,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -this.time * 10;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }
        if (sel && sel.kind === 'station' && sel.id === s.id) {
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
          ctx.strokeStyle = 'rgba(30,136,229,' + (0.5 + 0.4 * pulse) + ')'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    this.drawnC = C;
  };
  // 标准轨道装饰：按轨面高度缓存地下、地面、高架、桥墩与铁路交叉数据。
  const DECO_BURIED = -0.035, DECO_FLAT = 0.004; // 轨面低于约 1/3 埋深视为地下段
  function decoRuns(n, test) {
    const out = []; let s = -1;
    for (let i = 0; i < n; i++) {
      if (test(i)) { if (s < 0) s = i; } else if (s >= 0) { out.push([Math.max(0, s - 1), i]); s = -1; }
    }
    if (s >= 0) out.push([Math.max(0, s - 1), n - 1]);
    return out;
  }
  Renderer.prototype.segDeco = function (cs) {
    const city = this.game.city, tv = (city.uid || 0) * 4096 + (city.terrainVer || 0);
    let d = this.segDecos.get(cs);
    if (d && d.tv === tv) return d;
    const pts = cs.g.pts, cum = cs.g.cum, hs = cs.h, n = pts.length;
    const wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) wet[i] = city.waterDistAt(pts[i][0], pts[i][1]) < 0 ? 1 : 0;
    const elevH = CFG.metro.height.elevated;
    // 桥墩：高出地面的部分约每 50 m 一座，水中约每 100 m
    const piers = []; let next = -1, raised = false;
    for (let i = 0; i < n; i++) if (hs[i] > DECO_FLAT * 3) { raised = true; if (cum[i] >= next) { piers.push(i); next = cum[i] + (wet[i] ? 0.4 : 0.2); } }
    // 与运营中铁路的交叉：取铁路在交叉点的走向
    const rails = [];
    for (const kind of ['railSurf', 'railVia']) for (const p of cs.g[kind] || []) {
      const f = CM.Geo.rail[p[2]]; let ang = 0, best = Infinity;
      if (f && f.p) for (let q = 0; q + 3 < f.p.length; q += 2) { const dd = U.distToSeg(p[0], p[1], f.p[q], f.p[q + 1], f.p[q + 2], f.p[q + 3]); if (dd < best) { best = dd; ang = Math.atan2(f.p[q + 3] - f.p[q + 1], f.p[q + 2] - f.p[q]); } }
      let bi = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const dx = pts[i][0] - p[0], dy = pts[i][1] - p[1], dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bi = i; } }
      rails.push({ i: bi, x: p[0], y: p[1], ang: ang, via: kind === 'railVia' });
    }
    d = {
      tv: tv, wet: wet, piers: piers, raised: raised, rails: rails,
      water: decoRuns(n, function (i) { return wet[i] === 1; }),
      buried: decoRuns(n, function (i) { return hs[i] < DECO_BURIED; }),
      ground: decoRuns(n, function (i) { return Math.abs(hs[i]) <= DECO_FLAT; }),
      high: decoRuns(n, function (i) { return hs[i] > DECO_FLAT; }),
      ramp: decoRuns(n, function (i) { return hs[i] > DECO_FLAT && hs[i] < elevH - DECO_FLAT; }),
    };
    this.segDecos.set(cs, d);
    return d;
  };
  function strokeArrs(ctx, arrs) {
    ctx.beginPath();
    for (const arr of arrs) { ctx.moveTo(arr[0], arr[1]); for (let i = 2; i < arr.length; i += 2) ctx.lineTo(arr[i], arr[i + 1]); }
    ctx.stroke();
  }
  function strokeRange(ctx, arr, r) {
    ctx.beginPath(); ctx.moveTo(arr[r[0] * 2], arr[r[0] * 2 + 1]);
    for (let i = r[0] + 1; i <= r[1]; i++) ctx.lineTo(arr[i * 2], arr[i * 2 + 1]);
    ctx.stroke();
  }
  // 屏幕折线的平行线（像素偏移，正值在前进方向左侧）：栏杆、挡墙
  function strokeOffset(ctx, arr, r, off) {
    const n = arr.length / 2;
    ctx.beginPath();
    for (let i = r[0]; i <= r[1]; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = arr[b * 2] - arr[a * 2], dy = arr[b * 2 + 1] - arr[a * 2 + 1], l = Math.hypot(dx, dy) || 1;
      const x = arr[i * 2] + dy / l * off, y = arr[i * 2 + 1] - dx / l * off;
      if (i === r[0]) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  function shiftArr(arr, off) {
    const n = arr.length / 2, out = new Float32Array(arr.length);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = arr[b * 2] - arr[a * 2], dy = arr[b * 2 + 1] - arr[a * 2 + 1], l = Math.hypot(dx, dy) || 1;
      out[i * 2] = arr[i * 2] + dy / l * off; out[i * 2 + 1] = arr[i * 2 + 1] - dx / l * off;
    }
    return out;
  }
  function arrAngle(arr, i) {
    const n = arr.length / 2, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    return Math.atan2(arr[b * 2 + 1] - arr[a * 2 + 1], arr[b * 2] - arr[a * 2]);
  }
  Renderer.prototype.drawWalkTransferHints = function (ctx,C,ui,existing) {
    this.walkTransferHints=[];const g=this.game,T=CM.tools,model=g.model;
    if(this.cam.under>.5||g.preview||g.pending||g.jumping||!model||!model.walkTransferPreview||!T||T.tool!=='line'||(ui&&ui.blocking()))return;
    const walk=g.city.walk,rules=CFG.walk.transferMaxM+':'+CFG.metro.minSpacingM;
    let cache=this._walkHintCache;
    if(!cache||cache.C!==C||cache.walk!==walk||cache.rules!==rules||cache.chain!==T.chain){cache=this._walkHintCache={C,walk,rules,chain:T.chain,links:[]};
      const seen=new Set((existing||[]).map(p=>[C.stations[p[0]].id,C.stations[p[1]].id].sort().join('|')));
      if(g.draft)for(let i=0;i<C.stations.length;i++){
        const s=C.stations[i],old=g.net.stations[s.id];
        if(old&&U.dist(old.x,old.y,s.x,s.y)<1e-7&&g.compiled.serviced[g.compiled.sIndex.get(s.id)])continue;
        const lines=C.stationLines[i];if(!C.serviced[i]&&T.chain!==s.id)continue;
        const targets=C.stations.filter((b,k)=>b.id!==s.id&&C.serviced[k]&&!Array.from(lines).some(l=>C.stationLines[k].has(l))&&U.dist(s.x,s.y,b.x,b.y)*CFG.CELL_M+1e-6>=CFG.metro.minSpacingM);
        for(const link of model.walkTransferPreview(s,targets)){const key=[s.id,link.station].sort().join('|');if(seen.has(key))continue;seen.add(key);cache.links.push({from:s.id,to:link.station,metres:link.metres,path:link.path});}
      }
    }
    const hints=cache.links.slice(),cursor=T.snapPt||T.cursor;
    if(cursor&&Number.isFinite(cursor.x+cursor.y)&&T.hover?.kind!=='station'){
      const key=[cursor.x,cursor.y,T.lineChoice,T.buildType,T.chain].join(':');
      if(cache.hoverKey!==key){cache.hoverKey=key;cache.hover=[];
        const valid=CM.Metro.checkSite(g.city,cursor.x,cursor.y,T.buildType).ok&&!C.stations.some(s=>U.dist(s.x,s.y,cursor.x,cursor.y)*CFG.CELL_M+1e-6<CFG.metro.minSpacingM);
        if(valid){const targets=C.stations.filter((s,i)=>C.serviced[i]&&!C.stationLines[i].has(T.lineChoice));for(const link of model.walkTransferPreview(cursor,targets))cache.hover.push({from:'@cursor',to:link.station,metres:link.metres,path:link.path,hover:true});}
      }hints.push(...cache.hover);
    }
    this.walkTransferHints=hints;if(!hints.length)return;
    ctx.save();ctx.strokeStyle=TH.stInter;ctx.globalAlpha=.3;ctx.lineWidth=1.4;ctx.setLineDash([3,5]);ctx.lineCap='round';ctx.beginPath();
    for(const h of hints){for(let i=0;i<h.path.length;i++){const p=this.P(h.path[i][0],h.path[i][1],0);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}}ctx.stroke();ctx.restore();
  };
  // batched：隧道外廓与越江隧道已在 drawMetro 中合并描边
  Renderer.prototype.drawTrack = function (ctx, cs, arr, col, alpha, width, under, t, batched) {
    const s = cs.seg, z = this.z;
    if (z < 12 || under >= 0.5) {
      // 远景与地下视图：原有画法（衬边 + 线路色 + 地面虚线 / 地下点线）
      if (s.type === 'elevated' && t > 0.05) this.drawRaisedBase(ctx, cs, arr, alpha, width, t, null);
      ctx.globalAlpha = alpha;
      if (s.type !== 'underground' || under > 0.5) { ctx.strokeStyle = s.type === 'elevated' ? TH.elevCase : TH.lineCase; ctx.lineWidth = width + 2.5; this.strokeArr(ctx, arr); }
      ctx.strokeStyle = col; ctx.lineWidth = width; this.strokeArr(ctx, arr);
      if (s.type === 'surface') { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, width * 0.22); ctx.setLineDash([width, width]); this.strokeArr(ctx, arr); ctx.setLineDash([]); }
      if (s.type === 'underground' && under < 0.5 && !this.game.preview) { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, width * 0.18); ctx.setLineDash([2, width * 1.6]); this.strokeArr(ctx, arr); ctx.setLineDash([]); }
      ctx.globalAlpha = 1;
      return;
    }
    // 近景细节（枕木、栏杆、挡墙）只在缩放 ≥ 24 且自动细节未降档时绘制；负载升高时与其他中远景细节一起省略
    const d = this.segDeco(cs), K = TH.trk, hs = cs.h, near = z >= 24 && this.detail.tier < 2;
    const fade = 1 - 2 * under;
    // 高出地面部分：2.5D 投影阴影与桥墩，2D 向右下偏移的阴影（偏移量随轨面高度变化，引桥逐渐抬升）
    if (d.raised) this.drawRaisedBase(ctx, cs, arr, alpha, width, t, d);
    // 越水：桥面（地面 / 高架）或越江隧道（地下）
    for (const r of d.water) {
      const mid = (r[0] + r[1]) >> 1;
      if (hs[mid] < -DECO_FLAT) { if (!batched) { ctx.globalAlpha = alpha * fade; ctx.strokeStyle = K.tunnelWater; ctx.lineWidth = width + 4.5; strokeRange(ctx, arr, r); } }
      else { ctx.globalAlpha = alpha; ctx.strokeStyle = K.deck; ctx.lineWidth = width + 6; strokeRange(ctx, arr, r); }
    }
    ctx.lineCap = 'butt';
    // 地面：道床与枕木
    if (d.ground.length) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = K.ballast; ctx.lineWidth = width + 3.5;
      for (const r of d.ground) strokeRange(ctx, arr, r);
      if (near) { ctx.strokeStyle = K.sleeper; ctx.setLineDash([1.3, Math.max(2.4, width * 0.55)]); for (const r of d.ground) strokeRange(ctx, arr, r); ctx.setLineDash([]); }
    }
    // 高出地面：留出与下方线路交叉的间隙，再画桥面衬边
    if (d.high.length) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = TH.lineCase; ctx.lineWidth = width + 5;
      for (const r of d.high) strokeRange(ctx, arr, r);
      ctx.strokeStyle = TH.elevCase; ctx.lineWidth = width + 2.5;
      for (const r of d.high) strokeRange(ctx, arr, r);
    }
    ctx.lineCap = 'round';
    // 线路本色：地下段略透明
    ctx.strokeStyle = col; ctx.lineWidth = width;
    if (d.buried.length === 1 && d.buried[0][0] === 0 && d.buried[0][1] === arr.length / 2 - 1) { ctx.globalAlpha = alpha * U.lerp(0.82, 1, under); this.strokeArr(ctx, arr); }
    else {
      ctx.globalAlpha = alpha; this.strokeArr(ctx, arr);
      if (d.buried.length) { ctx.globalAlpha = alpha * 0.25 * fade; ctx.strokeStyle = TH.lineCase; ctx.lineWidth = width * 0.5; for (const r of d.buried) strokeRange(ctx, arr, r); }
    }
    ctx.globalAlpha = alpha;
    // 中线标记：地面段白色短线，地下段白色点线
    if (s.type === 'surface') { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, width * 0.22); ctx.setLineDash([width, width]); for (const r of d.ground) strokeRange(ctx, arr, r); ctx.setLineDash([]); }
    if (d.buried.length && !this.game.preview) { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, width * 0.18); ctx.setLineDash([2, width * 1.6]); for (const r of d.buried) strokeRange(ctx, arr, r); ctx.setLineDash([]); }
    if (near) {
      // 桥面栏杆（高架与越水桥梁）与引桥挡墙
      ctx.strokeStyle = K.parapet; ctx.lineWidth = 1;
      for (const r of d.high) { strokeOffset(ctx, arr, r, width / 2 + 1.25); strokeOffset(ctx, arr, r, -width / 2 - 1.25); }
      for (const r of d.water) { const mid = (r[0] + r[1]) >> 1; if (hs[mid] >= -DECO_FLAT && hs[mid] <= DECO_FLAT) { strokeOffset(ctx, arr, r, width / 2 + 2.6); strokeOffset(ctx, arr, r, -width / 2 - 2.6); } }
      if (d.ramp.length) { ctx.strokeStyle = K.wall; ctx.lineWidth = 1.2; ctx.setLineDash([2, 1.5]); for (const r of d.ramp) { strokeOffset(ctx, arr, r, width / 2 + 2.6); strokeOffset(ctx, arr, r, -width / 2 - 2.6); } ctx.setLineDash([]); }
    }
    // 与铁路交叉：地下线——铁路从隧道上方经过；高架 / 地面线——跨越铁路的桥台
    if (z >= 16) for (const rc of d.rails) {
      const p = this.P(rc.x, rc.y, 0), q = {}, mg = 30 + (this._paintMg || 0);   // 线网缓存图比屏幕大一圈
      if (p.x < -mg || p.y < -mg || p.x > this.w + mg || p.y > this.h + mg) continue;
      const len = width * 2.4 + 3, c = Math.cos(rc.ang), sn = Math.sin(rc.ang);
      this.P(rc.x + c * 0.1, rc.y + sn * 0.1, 0, q);
      const ra = Math.atan2(q.y - p.y, q.x - p.x);
      ctx.save(); ctx.globalAlpha = alpha;
      if (hs[rc.i] < -DECO_FLAT) {
        ctx.translate(p.x, p.y); ctx.rotate(ra); ctx.lineCap = 'butt';
        ctx.strokeStyle = TH.road.railCase; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.strokeStyle = TH.road.rail; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const ta = arrAngle(arr, rc.i), off = width / 2 + 3;
        ctx.translate(arr[rc.i * 2], arr[rc.i * 2 + 1]); ctx.rotate(ta);
        ctx.strokeStyle = K.wall; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
        for (const sx of [-1, 1]) { ctx.moveTo(sx * (width + 4), -off); ctx.lineTo(sx * (width + 4), off); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
  // 高出地面部分的阴影与桥墩：2.5D 阴影落在地面、桥墩连到桥面；2D 阴影向右下偏移；水中桥墩画出水纹
  Renderer.prototype.drawRaisedBase = function (ctx, cs, arr, alpha, width, t, d) {
    const pts = cs.g.pts, hs = cs.h, n = pts.length, tmp = {};
    const K = TH.trk;
    if (t > 0.05) {
      ctx.globalAlpha = (TH.night ? 0.4 : 0.18) * alpha * t; ctx.strokeStyle = TH.night ? '#000' : '#3a3a3a'; ctx.lineWidth = width;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) { if (hs[i] <= DECO_FLAT) { pen = false; continue; } const p = this.P(pts[i][0], pts[i][1], 0, tmp); if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true; }
      ctx.stroke();
      ctx.globalAlpha = 0.55 * alpha * t; ctx.strokeStyle = TH.pier; ctx.lineWidth = Math.max(1, width * 0.35);
      ctx.beginPath();
      if (d) for (const i of d.piers) { const p = this.P(pts[i][0], pts[i][1], 0, tmp); ctx.moveTo(p.x, p.y); ctx.lineTo(arr[i * 2], arr[i * 2 + 1]); }
      else { const step = 4; for (let i = step; i < n - 1; i += step) { const p = this.P(pts[i][0], pts[i][1], 0, tmp); ctx.moveTo(p.x, p.y); ctx.lineTo(arr[i * 2], arr[i * 2 + 1]); } }
      ctx.stroke();
    }
    if (!d) return;
    if (t < 0.95) {
      const k = (1 - t) * this.z * 2.0;
      ctx.globalAlpha = (TH.night ? 0.35 : 0.16) * alpha * (1 - t); ctx.strokeStyle = K.shadow; ctx.lineWidth = width + 1;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) { if (hs[i] <= DECO_FLAT) { pen = false; continue; } const hh = hs[i] * k; if (pen) ctx.lineTo(arr[i * 2] + hh * 0.55, arr[i * 2 + 1] + hh); else ctx.moveTo(arr[i * 2] + hh * 0.55, arr[i * 2 + 1] + hh); pen = true; }
      ctx.stroke();
    }
    if (this.z >= 20) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = K.pierFoot; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const i of d.piers) { if (!d.wet[i]) continue; const p = this.P(pts[i][0], pts[i][1], 0, tmp); ctx.moveTo(p.x + width * 0.9 + 1, p.y); ctx.ellipse(p.x, p.y, width * 0.9 + 1, (width * 0.9 + 1) * (1 - 0.5 * t), 0, 0, Math.PI * 2); }
      ctx.stroke();
    }
  };
  // 换乘箭头（⇄）：上箭头向右、下箭头向左
  const LEVEL_ROWS = ['elevated', 'surface', 'underground'], LEVEL_COL = { elevated: '#f59f45', surface: '#4fbf7f', underground: '#6f9bff' };
  CM.LEVEL_COL = LEVEL_COL;
  function levelBadge(ctx, x, y, hh, types, ink) {
    const w = hh * 0.9, bw = w * 0.62, bh = hh * 0.17, gap = (hh - 3 * bh) / 4;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - hh / 2, w, hh, hh * 0.24);
    ctx.fillStyle = ink; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, hh * 0.1); ctx.stroke();
    for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.roundRect(x - bw / 2, y - hh / 2 + gap + k * (bh + gap), bw, bh, bh / 2);
      ctx.fillStyle = types.indexOf(LEVEL_ROWS[k]) >= 0 ? LEVEL_COL[LEVEL_ROWS[k]] : 'rgba(255,255,255,0.18)'; ctx.fill();
    }
  }
  function xferGlyph(ctx, x, y, s, col) {
    const a = s * 0.42, hd = s * 0.5;
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.3); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s, y - a); ctx.lineTo(x + s, y - a); ctx.lineTo(x + s - hd, y - a - hd);
    ctx.moveTo(x + s, y + a); ctx.lineTo(x - s, y + a); ctx.lineTo(x - s + hd, y + a + hd);
    ctx.stroke();
  }
  Renderer.prototype.strokeArr = function (ctx, arr) {
    ctx.beginPath();
    ctx.moveTo(arr[0], arr[1]);
    for (let i = 2; i < arr.length; i += 2) ctx.lineTo(arr[i], arr[i + 1]);
    ctx.stroke();
  };

  // 道路拥堵图层：只显示主要道路（快速路与主干道），沿真实道路线形连续着色。折线约每 100 m 取一个样点，
  // 样点对应同名的模拟路段，取其当前时刻的饱和度；相邻同档样点合并为一段，按道路等级定粗细。
  // 0 畅通 · 1 缓行 · 2 拥堵 · 3 严重拥堵；按饱和度（小时流量 ÷ 通行能力）分档。已建成的主要道路全部着色（车少时为绿色）
  // 性能：各档连续段在时刻档（5 分钟）变化时才重建为世界坐标的 Path2D（只保留原折线顶点与分档断点），每帧按地图变换整体描边
  const CONG_COLS = ['#33a660', '#f2bf3a', '#f27a24', '#d3203a'];
  const CONG_CUT = [1.15, 1.35, 1.60];
  Renderer.CONG_COLS = CONG_COLS;
  // 拥堵变化（v2.3）：与对比基准相比的工作日早高峰拥堵比之差，分为明显缓解、缓解、基本不变、加重、明显加重
  const DIFF_COLS = ['#0f8a48', '#79c58a', 'rgba(128,138,154,0.5)', '#f0a03a', '#d3203a'], DIFF_COLS_AX = ['#1f5fbf', '#7aa7e0', 'rgba(128,138,154,0.5)', '#f0a35c', '#b3261e'];
  const DIFF_CUT = [-0.12, -0.03, 0.03, 0.12];
  Renderer.DIFF_COLS = function () { return AX.enabled() ? DIFF_COLS_AX : DIFF_COLS; };
  Renderer.prototype.congIndex = function () {
    const city = this.game.city, car = city.car;
    if (this._cgIdx && this._cgIdx.city === city && this._cgIdx.ver === city.roadVersion) return this._cgIdx;
    const byName = new Map();
    for (const L of car.links) { if (L.cls < 3 || !L.name) continue; let a = byName.get(L.name); if (!a) { a = []; byName.set(L.name, a); } a.push(L); }
    const ways = [], STEP = 0.4;
    for (const w of city.roadWays) {
      const gr = city.roadGroups[w.g];
      if (gr.cls < 3 || (gr.flags & 4)) continue;   // 快速路、主干道（匝道不画）
      const p = w.p, xs = [], ys = [], vt = [];
      for (let k = 0; k + 3 < p.length; k += 2) {
        const ax = p[k], ay = p[k + 1], bx = p[k + 2], by = p[k + 3], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP));
        for (let q = k === 0 ? 0 : 1; q <= n; q++) { xs.push(ax + (bx - ax) * q / n); ys.push(ay + (by - ay) * q / n); vt.push(q === 0 || q === n ? 1 : 0); }
      }
      const near = byName.get(w.g + 1) || [], lk = new Int32Array(xs.length);
      for (let i = 0; i < xs.length; i++) {
        let best = -1, bd = 1.0;
        for (const L of near) {
          const b = L.bbox; if (xs[i] < b[0] - 1 || xs[i] > b[2] + 1 || ys[i] < b[1] - 1 || ys[i] > b[3] + 1) continue;
          const d = U.distToPoly(xs[i], ys[i], L.pts); if (d < bd) { bd = d; best = L.id; }
        }
        if (best < 0) { const L = this.pickLink(xs[i], ys[i], 0.6); if (L && L.cls >= 2) best = L.id; }
        lk[i] = best;
      }
      ways.push({ g: w.g, cls: gr.cls, bbox: w.bbox, xs: Float32Array.from(xs), ys: Float32Array.from(ys), vt: Uint8Array.from(vt), lk: lk });
    }
    this._cgIdx = { city: city, ver: city.roadVersion, ways: ways };
    this._cgRuns = null;
    return this._cgIdx;
  };
  // 按当前时刻（5 分钟一档）把各条道路分成不同拥堵档的连续段，并生成各档、各等级的 Path2D
  Renderer.prototype.congRuns = function () {
    const g = this.game, model = g.model, city = g.city, idx = this.congIndex();
    let basis=this.layerOpt.cong||'now';
    const ref = (basis === 'build' || basis === 'year') && g.congRefFor ? g.congRefFor(basis) : null, diff = !!ref;
    if ((basis === 'build' || basis === 'year') && !ref) basis = 'am';   // 还没有对比基准：按早高峰拥堵程度显示
    const key = model.version + ':' + basis + ':' + (ref ? ref.ym + ':' + (ref.label || '') : '') + ':' + Math.floor(g.clock.minute / 5) + ':' + city.roadVersion;
    if (this._cgRuns && this._cgRunsKey === key) return this._cgRuns;
    const W = model.weights(g.clock.minute), sat = new Map();
    const satOf = function (id) {
      let v = sat.get(id);
      if (v === undefined && diff) {
        // 变化：两个方向中较拥堵一侧的拥堵比，与基准的同一侧相比（基准里没有的路段视为不变）
        const P = model.resultsFor('wd').per[0], q0 = ref.q[2 * id], q1 = ref.q[2 * id + 1];
        if (q0 === 255 || q1 === 255) v = 0;
        else v = Math.max(P.arcTime[2 * id] / model.road.arcT0[2 * id], P.arcTime[2 * id + 1] / model.road.arcT0[2 * id + 1]) - (1 + Math.max(q0, q1) / 100);
        sat.set(id, v);
      }
      if (v === undefined) { const P=model.resultsFor('wd').per[0];v=basis==='am'?Math.max(P.arcTime[2*id]/model.road.arcT0[2*id],P.arcTime[2*id+1]/model.road.arcT0[2*id+1]):Math.max(model.arcRatioAt(2*id,W),model.arcRatioAt(2*id+1,W)); sat.set(id, v); }
      return v;
    };
    const cuts = diff ? DIFF_CUT : CONG_CUT, nLv = cuts.length + 1;
    const lvl = function (x) { let k = 0; while (k < nLv - 1 && x >= cuts[k]) k++; return k; };
    const paths = [], halo = { 3: new Path2D(), 4: new Path2D() };
    for (let k = 0; k < nLv; k++) paths.push({ 3: new Path2D(), 4: new Path2D() });
    let nRuns = 0;
    const push = function (w, a, b, k) {
      if (b <= a) return;
      const p = paths[k][w.cls], q = halo[w.cls];
      p.moveTo(w.xs[a], w.ys[a]); q.moveTo(w.xs[a], w.ys[a]);
      for (let i = a + 1; i < b; i++) if (w.vt[i]) { p.lineTo(w.xs[i], w.ys[i]); q.lineTo(w.xs[i], w.ys[i]); }
      p.lineTo(w.xs[b], w.ys[b]); q.lineTo(w.xs[b], w.ys[b]);
      nRuns++;
    };
    for (const w of idx.ways) {
      if (!city.roadsBuilt[w.g]) continue;
      const n = w.xs.length; if (n < 2) continue;
      let first = diff ? 2 : 0; for (let i = 0; i < n; i++) if (w.lk[i] >= 0) { first = lvl(satOf(w.lk[i])); break; }   // 没有对应路段的道路按畅通（变化图为不变）显示
      let cur = first, start = 0;
      for (let i = 1; i < n; i++) {
        const k = w.lk[i] >= 0 ? lvl(satOf(w.lk[i])) : cur;
        if (k !== cur) { push(w, start, i, cur); start = i; cur = k; }
      }
      push(w, start, n - 1, cur);
    }
    this._cgRuns = { paths: paths, halo: halo, n: nRuns, diff: diff, ref: ref }; this._cgRunsKey = key;
    return this._cgRuns;
  };
  // 在世界坐标下描边各档路段；z 为对应的地图缩放（决定屏幕上的线宽）
  function strokeCong(ctx, cr, z) {
    const lw = U.clamp(z * 0.07, 1.6, 7) / z, halo = 3 / z;   // 线宽换算到世界单位
    const widthOf = { 3: 1, 4: 1.45 };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 先画衬边，再按拥堵程度从轻到重画颜色（重的压在上面）
    ctx.strokeStyle = TH.halo;
    for (const cls of [3, 4]) { ctx.lineWidth = lw * widthOf[cls] * 1.15 + halo; ctx.stroke(cr.halo[cls]); }
    if (cr.diff) {
      // 变化图：先画基本不变（细、淡），再画缓解与加重，明显变化的压在上面
      const DC = Renderer.DIFF_COLS();
      for (const k of [2, 1, 3, 0, 4]) { ctx.strokeStyle = DC[k]; for (const cls of [3, 4]) { ctx.lineWidth = lw * widthOf[cls] * (k === 2 ? 0.75 : (k === 0 || k === 4 ? 1.25 : 1.05)); ctx.stroke(cr.paths[k][cls]); } }
      return;
    }
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = AX.enabled() ? AX.statuses()[k] : CONG_COLS[k];
      ctx.setLineDash(AX.dash(k).split(' ').filter(Boolean).map(function (n) { return +n / z; }));
      for (const cls of [3, 4]) { ctx.lineWidth = lw * widthOf[cls] * (k >= 2 ? 1.15 : 1); ctx.stroke(cr.paths[k][cls]); }
    }
    ctx.setLineDash([]);
  }
  // 性能：大城市的主要道路很多，逐帧描边的栅格化开销会让帧率掉到 30 帧。改为把描边画进一张与世界坐标对齐的位图
  // （当前视野四周各留三成余量，像素数有上限），每帧按地图变换贴图。视野移出位图范围时立即重画；
  // 缩放变化超过两成时按新线宽重画（最多每 0.12 秒一次）；拥堵分档变化时最多每 0.4 秒重画一次
  Renderer.prototype.drawCongestion = function (ctx) {
    const cr = this.congRuns(), M = this.M, z = this.z, dpr = this.dpr, city = this.game.city, now = performance.now();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of [[0, 0], [this.w, 0], [0, this.h], [this.w, this.h]]) { const p = this.unproject(s[0], s[1]); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(city.W, x1); y1 = Math.min(city.H, y1);
    if (x1 <= x0 || y1 <= y0) return;
    let c = this._cgBmp;
    const fresh = c && c.city === city && c.halo === TH.halo;
    const inside = fresh && x0 >= c.x0 && y0 >= c.y0 && x1 <= c.x1 && y1 <= c.y1;
    const zoomed = fresh && Math.abs(z - c.z) > c.z * 0.2;
    if (!inside || (zoomed && now - c.t > 120) || (c.runs !== cr && now - c.t > 400)) {
      const mx = (x1 - x0) * 0.3, my = (y1 - y0) * 0.3;
      const bx0 = Math.max(0, x0 - mx), by0 = Math.max(0, y0 - my), bx1 = Math.min(city.W, x1 + mx), by1 = Math.min(city.H, y1 + my);
      const area = (bx1 - bx0) * (by1 - by0);
      const sb = Math.min(z * dpr, Math.sqrt(6e6 / area));   // 位图每世界单位的像素数（上限约 600 万像素）
      const w = Math.ceil((bx1 - bx0) * sb), h = Math.ceil((by1 - by0) * sb);
      const cv = c && c.cv.width === w && c.cv.height === h ? c.cv : makeCanvas(w, h);
      const x = cv.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h);
      x.setTransform(sb, 0, 0, sb, -bx0 * sb, -by0 * sb);
      strokeCong(x, cr, z);
      c = this._cgBmp = { city: city, halo: TH.halo, cv: cv, x0: bx0, y0: by0, x1: bx1, y1: by1, sb: sb, z: z, runs: cr, t: now };
    }
    const sb = c.sb;
    ctx.save();
    ctx.setTransform(dpr * M[0] * z / sb, dpr * M[2] * z / sb, dpr * M[1] * z / sb, dpr * M[3] * z / sb,
      dpr * (this.ox + z * (M[0] * c.x0 + M[1] * c.y0)), dpr * (this.oy + z * (M[2] * c.x0 + M[3] * c.y0)));
    ctx.drawImage(c.cv, 0, 0);
    ctx.restore();
  };
  // 出行方向图层：按片区（城市区域；老城区再分为越秀、东山、荔湾）汇总当前时段的出行，每个片区画出它最主要的出行方向
  // （第二方向接近最主要方向时也画出）：箭头从片区中心指向目的片区，尖端标出目的地。放置时按流量从大到小依次尝试缩短、
  // 小角度偏转，尽量不与其他箭头、片区名称重叠。新区域开放、城市发展后流向随之变化；箭头中间的蓝色部分是乘地铁的比例。
  // 结果只在模拟完成一整轮或时段变化时更新，箭头的出现、消失与粗细变化都平滑过渡（不跳闪）
  Renderer.prototype.flowAreas = function () {
    const g = this.game, city = g.city, model = g.model;
    if (this._fa && this._fa.city === city && this._fa.ver === city.version) return this._fa;
    const W = city.W, H = city.H, N = W * H;
    const names = [], idOf = new Map(), area = new Int16Array(N).fill(-1);
    const old = city.regions.findIndex(function (r) { return r.id === 'oldcity'; });
    const oldLabels = (city.districtLabels || []).filter(function (d) { return d[0] === '越秀' || d[0] === '东山' || d[0] === '荔湾'; });
    const short = function (n) { return n.replace(/（.*）/, '').replace(/·.*$/, ''); };
    for (let c = 0; c < N; c++) {
      const k = city.region[c], rg = city.regions[k];
      if (rg.scenic || !city.regionOpen[k] || city.landFrac[c] < 0.5) continue;
      let key = 'r' + k, name = short(rg.name);
      if (k === old && oldLabels.length) {
        const x = c % W + 0.5, y = ((c / W) | 0) + 0.5; let best = 0, bd = 1e9;
        oldLabels.forEach(function (d, q) { const dd = U.dist(x, y, d[1], d[2]); if (dd < bd) { bd = dd; best = q; } });
        key = 'o' + best; name = oldLabels[best][0];
      }
      let id = idOf.get(key); if (id === undefined) { id = names.length; idOf.set(key, id); names.push(name); }
      area[c] = id;
    }
    const n = names.length, sx = new Float64Array(n), sy = new Float64Array(n), sw = new Float64Array(n);
    for (let c = 0; c < N; c++) { const d = area[c]; if (d < 0) continue; const w = city.pop[c] + city.jobs[c] + 1; sx[d] += (c % W + 0.5) * w; sy[d] += (((c / W) | 0) + 0.5) * w; sw[d] += w; }
    const B = model.B, BW = model.BW, blk = new Int16Array(B).fill(-1), Z = CFG.ZONE * 2;
    for (let b = 0; b < B; b++) {
      const bi = b % BW, bj = (b / BW) | 0, cnt = new Map();
      for (let j = bj * Z; j < Math.min(H, bj * Z + Z); j++) for (let i = bi * Z; i < Math.min(W, bi * Z + Z); i++) { const c = j * W + i, d = area[c]; if (d >= 0) cnt.set(d, (cnt.get(d) || 0) + city.pop[c] + city.jobs[c] + 1); }
      let best = -1, bn = 0; cnt.forEach(function (v, d) { if (v > bn) { bn = v; best = d; } }); blk[b] = best;
    }
    this._fa = { city: city, ver: city.version, names: names, x: Array.from(sx, function (v, k) { return sw[k] ? v / sw[k] : 0; }), y: Array.from(sy, function (v, k) { return sw[k] ? v / sw[k] : 0; }), blk: blk };
    return this._fa;
  };
  Renderer.prototype.flowList = function () {
    const g = this.game, model = g.model, fa = this.flowAreas();
    const p = model.weights(g.clock.minute).p0, mode = this.layerOpt.flow;
    const key = model.cycles + ':' + model.dayType + ':' + p + ':' + mode + ':' + fa.ver + ':' + g.netVersion;
    if (this._fl && this._flKey === key) return this._fl;
    const P = model.live.per[p], B = model.B, n = fa.names.length;
    const tot = new Float64Array(n * n), met = new Float64Array(n * n), node = new Float64Array(n);
    for (let a = 0; a < B; a++) {
      const da = fa.blk[a]; if (da < 0) continue;
      for (let b = 0; b < B; b++) {
        const db = fa.blk[b]; if (db < 0) continue;
        const k = a * B + b, t = P.desTot[k]; if (!(t > 0)) continue;
        const m = P.desMetro[k], f = mode === 'metro' ? m : (mode === 'car' ? t - m : t);
        node[da] += f;
        if (da !== db) { tot[da * n + db] += f; met[da * n + db] += m; }
      }
    }
    const list = [];
    const add = function (a, b, f, rank) { list.push({ key: a + '>' + b, a: a, b: b, f: f, rank: rank, share: mode === 'metro' ? 1 : (mode === 'car' ? 0 : met[a * n + b] / f) }); };
    for (let a = 0; a < n; a++) {
      let b1 = -1, f1 = 0, b2 = -1, f2 = 0;
      for (let b = 0; b < n; b++) { const f = tot[a * n + b]; if (f > f1) { b2 = b1; f2 = f1; b1 = b; f1 = f; } else if (f > f2) { b2 = b; f2 = f; } }
      if (b1 >= 0) add(a, b1, f1, 0);
      if (b2 >= 0 && f2 >= f1 * 0.6) add(a, b2, f2, 1);
    }
    list.sort(function (x, y) { return y.f - x.f; });
    // 两个片区互为主要方向时合并为一条双向箭头（两端都是片区圆点，不必另标目的地）
    const byKey = new Map(), top = [];
    for (const e of list) byKey.set(e.key, e);
    for (const e of list) {
      if (e.used) continue;
      e.used = true;
      const r = byKey.get(e.b + '>' + e.a);
      if (r && !r.used) {
        r.used = true;
        const a = Math.min(e.a, e.b), b = Math.max(e.a, e.b);
        top.push({ key: a + '<>' + b, a: a, b: b, f: Math.max(e.f, r.f), both: true, share: (e.share * e.f + r.share * r.f) / (e.f + r.f) });
      } else top.push(e);
    }
    const mx = top.length ? top[0].f : 1;
    let nmx = 1; for (const v of node) nmx = Math.max(nmx, v);
    this._fl = { top: top.filter(function (e) { return e.f >= mx * 0.015; }), mx: mx, node: node, nodeMax: nmx }; this._flKey = key;
    return this._fl;
  };
  // 箭头几何（屏幕坐标）：从起点片区的圆边出发，朝目的片区方向（可偏转 ang），长度约为两地距离的一半（乘 lf），并略偏向右侧，
  // 使相向的两条箭头并排而不重叠。距离太近（缩得太小）时返回 null
  const flowGeo = function (pa, pb, ra, rb, w, ang, lf) {
    const dx = pb.x - pa.x, dy = pb.y - pa.y, dist = Math.hypot(dx, dy);
    if (dist < ra + rb + 26) return null;
    const t = Math.atan2(dy, dx) + ang, ux = Math.cos(t), uy = Math.sin(t), nx = -uy, ny = ux;
    const off = w / 2 + 2, s0 = ra + 3, ah = 5 + w * 0.7;
    const L = Math.min(dist - rb - ah - 4, U.clamp(dist * 0.5, 42, 150)) * lf;
    if (L < s0 + 14) return null;
    const sx = pa.x + ux * s0 + nx * off, sy = pa.y + uy * s0 + ny * off, ex = pa.x + ux * L + nx * off, ey = pa.y + uy * L + ny * off;
    return { sx: sx, sy: sy, ex: ex, ey: ey, tx: ex + ux * ah, ty: ey + uy * ah, ux: ux, uy: uy, nx: nx, ny: ny, ah: ah };
  };
  // 双向箭头：连接两个片区圆点，两端各有箭头（ax,ay 为起点端尖端）
  const flowGeo2 = function (pa, pb, ra, rb, w) {
    const dx = pb.x - pa.x, dy = pb.y - pa.y, dist = Math.hypot(dx, dy), ah = 5 + w * 0.7;
    if (dist < ra + rb + ah * 2 + 14) return null;
    const ux = dx / dist, uy = dy / dist;
    const ax = pa.x + ux * (ra + 3), ay = pa.y + uy * (ra + 3), tx = pb.x - ux * (rb + 3), ty = pb.y - uy * (rb + 3);
    return { both: true, ax: ax, ay: ay, tx: tx, ty: ty, sx: ax + ux * ah, sy: ay + uy * ah, ex: tx - ux * ah, ey: ty - uy * ah, ux: ux, uy: uy, nx: -uy, ny: ux, ah: ah };
  };
  // 碰撞检测用的箭头线段：去掉靠近片区圆点的根部，从同一片区出发、方向不同的箭头不算重叠
  const flowSpan = function (G) {
    const t = 12, x1 = G.both ? G.ax : G.sx, y1 = G.both ? G.ay : G.sy;
    return [x1 + G.ux * t, y1 + G.uy * t, G.tx - (G.both ? G.ux * t : 0), G.ty - (G.both ? G.uy * t : 0)];
  };
  const segDist = function (ax, ay, bx, by, cx, cy, dx, dy) {
    const ps = function (px, py, x1, y1, x2, y2) { const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy; const t = l2 ? U.clamp(((px - x1) * vx + (py - y1) * vy) / l2, 0, 1) : 0; return Math.hypot(px - x1 - vx * t, py - y1 - vy * t); };
    const cr = function (x1, y1, x2, y2, x3, y3) { return (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1); };
    const d1 = cr(ax, ay, bx, by, cx, cy), d2 = cr(ax, ay, bx, by, dx, dy), d3 = cr(cx, cy, dx, dy, ax, ay), d4 = cr(cx, cy, dx, dy, bx, by);
    if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
    return Math.min(ps(ax, ay, cx, cy, dx, dy), ps(bx, by, cx, cy, dx, dy), ps(cx, cy, ax, ay, bx, by), ps(dx, dy, ax, ay, bx, by));
  };
  const flowLabelBox = function (G, tw) {
    const k = 5 + (tw / 2) * Math.abs(G.ux) + 8 * Math.abs(G.uy), cx = G.tx + G.ux * k, cy = G.ty + G.uy * k;
    return { cx: cx, cy: cy, x0: cx - tw / 2 - 2, y0: cy - 8, x1: cx + tw / 2 + 2, y1: cy + 8 };
  };
  // 布局：只在流向列表、缩放档位或视角变化时重算（与平移无关），结果是每条箭头选定的偏转、长度与是否标注目的地
  Renderer.prototype.flowLayout = function (ctx, fa, fl, show) {
    const M = this.M, z = this.z;
    const key = this._flKey + '|' + Math.round(Math.log2(z) * 5) + '|' + M.map(function (v) { return v.toFixed(2); }).join(',') + '|' + this.w + 'x' + this.h;
    if (this._flLay && this._flLayKey === key) return this._flLay;
    const q = function (d) { return { x: (M[0] * fa.x[d] + M[1] * fa.y[d]) * z, y: (M[2] * fa.x[d] + M[3] * fa.y[d]) * z }; };
    const rad = function (d) { return 4 + 6 * Math.sqrt(fl.node[d] / fl.nodeMax); };
    const caps = [], rects = [];
    const capRect = function (x1, y1, x2, y2, r, b) { for (let k = 0; k <= 8; k++) { const px = x1 + (x2 - x1) * k / 8, py = y1 + (y2 - y1) * k / 8; if (px > b.x0 - r && px < b.x1 + r && py > b.y0 - r && py < b.y1 + r) return true; } return false; };
    const hitRect = function (b) { let n = 0; for (const r of rects) if (b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0) n++; for (const c of caps) if (capRect(c.x1, c.y1, c.x2, c.y2, c.r, b)) n++; return n; };
    const hitCap = function (x1, y1, x2, y2, r, own) {
      let n = 0;
      for (const c of caps) if (c.own !== own && segDist(x1, y1, x2, y2, c.x1, c.y1, c.x2, c.y2) < r + c.r) n++;
      for (const b of rects) if (b.own !== own && capRect(x1, y1, x2, y2, r, b)) n++;
      return n;
    };
    // 片区圆点与名称先占位
    ctx.font = TYPE.place;
    const nodes = new Set(); show.forEach(function (s) { nodes.add(s.e.a); if (s.e.both) nodes.add(s.e.b); });
    nodes.forEach(function (d) { const p = q(d), r = rad(d), tw = ctx.measureText(fa.names[d]).width; caps.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, r: r + 2, own: d }); rects.push({ x0: p.x - tw / 2 - 3, y0: p.y + r + 3, x1: p.x + tw / 2 + 3, y1: p.y + r + 19, own: d }); });
    const out = new Map();
    // 双向箭头位置固定（连接两个圆点），先占位
    show.forEach(function (s) {
      if (!s.e.both) return;
      const G = flowGeo2(q(s.e.a), q(s.e.b), rad(s.e.a), rad(s.e.b), 2.5 + 9 * Math.sqrt(s.tw)); if (!G) return;
      const sp = flowSpan(G); caps.push({ x1: sp[0], y1: sp[1], x2: sp[2], y2: sp[3], r: 2.5 + 4.5 * Math.sqrt(s.tw) + 2, own: -1 });
      out.set(s.e.key, { ang: 0, lf: 1, label: false });
    });
    // 单向箭头：按流量从大到小依次放置，依次尝试原方向、缩短、小角度偏转
    const CAND = [[0, 1], [0, 0.72], [0.2, 1], [-0.2, 1], [0.2, 0.72], [-0.2, 0.72], [0, 0.5], [0.2, 0.5], [-0.2, 0.5], [0.4, 0.72], [-0.4, 0.72], [0.4, 0.5], [-0.4, 0.5]];
    ctx.font = TYPE.place;
    const items = Array.from(show.values()).filter(function (s) { return !s.e.both; }).sort(function (x, y) { return y.tw - x.tw; });
    for (const s of items) {
      const e = s.e, pa = q(e.a), pb = q(e.b), w = 2.5 + 9 * Math.sqrt(s.tw), tw = ctx.measureText(fa.names[e.b]).width;
      let best = null;
      for (const cd of CAND) {
        const G = flowGeo(pa, pb, rad(e.a), rad(e.b), w, cd[0], cd[1]); if (!G) continue;
        const sp = flowSpan(G), ha = hitCap(sp[0], sp[1], sp[2], sp[3], w / 2 + 2, e.a), lb = flowLabelBox(G, tw), hl = hitRect(lb);
        const sc = ha * 10 + (hl ? 1 : 0);
        if (!best || sc < best.sc) best = { sc: sc, ang: cd[0], lf: cd[1], G: G, sp: sp, lb: lb, label: hl === 0 };
        if (sc === 0) break;
      }
      if (!best) continue;
      const sp = best.sp;
      caps.push({ x1: sp[0], y1: sp[1], x2: sp[2], y2: sp[3], r: w / 2 + 2, own: -1 });
      if (best.label) rects.push({ x0: best.lb.x0, y0: best.lb.y0, x1: best.lb.x1, y1: best.lb.y1, own: -1 });
      out.set(e.key, { ang: best.ang, lf: best.lf, label: best.label });
    }
    this._flLay = out; this._flLayKey = key;
    return out;
  };
  Renderer.prototype.drawDesire = function (ctx) {
    const fa = this.flowAreas(), fl = this.flowList(), mode = this.layerOpt.flow, dt = Math.min(0.1, this.dt || 0.016);
    // 平滑过渡：每条流向的透明度与粗细逐帧趋近目标值
    const show = this._flShow || (this._flShow = new Map());
    if (this._flShowArea !== fa) { show.clear(); this._flShowArea = fa; this._flLayKey = null; }
    const want = new Set();
    for (const e of fl.top) {
      want.add(e.key);
      let s = show.get(e.key);
      if (!s) { s = { a: 0, w: e.f / fl.mx, share: e.share }; show.set(e.key, s); }
      s.e = e; s.tw = e.f / fl.mx; s.ts = e.share;
    }
    show.forEach(function (s, k) {
      const on = want.has(k);
      s.a = U.clamp(s.a + (on ? dt : -dt) / 0.45, 0, 1);
      if (on) { s.w += (s.tw - s.w) * Math.min(1, dt * 4); s.share += (s.ts - s.share) * Math.min(1, dt * 4); }
      if (!on && s.a <= 0) show.delete(k);
    });
    const lay = this.flowLayout(ctx, fa, fl, show);
    const rad = function (d) { return 4 + 6 * Math.sqrt(fl.node[d] / fl.nodeMax); };
    const pos = (d) => this.P(fa.x[d], fa.y[d], 0);
    const metroCol = [33, 102, 204], carCol = mode === 'car' ? [222, 112, 46] : [128, 134, 148];
    const items = Array.from(show.values()).sort(function (x, y) { return x.w - y.w; });
    const nodeA = new Map(), labels = [];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of items) {
      const e = s.e, c = lay.get(e.key); if (!c) continue;
      const w = 2.5 + 9 * Math.sqrt(Math.max(0, s.w));
      const G = e.both ? flowGeo2(pos(e.a), pos(e.b), rad(e.a), rad(e.b), w) : flowGeo(pos(e.a), pos(e.b), rad(e.a), rad(e.b), w, c.ang, c.lf); if (!G) continue;
      nodeA.set(e.a, Math.max(nodeA.get(e.a) || 0, s.a));
      if (e.both) nodeA.set(e.b, Math.max(nodeA.get(e.b) || 0, s.a));
      const share = mode === 'metro' ? 1 : U.clamp(s.share, 0, 1);
      ctx.globalAlpha = s.a;
      ctx.beginPath(); ctx.moveTo(G.sx, G.sy); ctx.lineTo(G.ex, G.ey);
      ctx.strokeStyle = TH.halo; ctx.lineWidth = w + 4; ctx.stroke();
      ctx.strokeStyle = U.rgb(share >= 0.999 ? metroCol : carCol, 0.94); ctx.lineWidth = w; ctx.stroke();
      if (share > 0.02 && share < 0.999) { ctx.strokeStyle = U.rgb(metroCol, 0.95); ctx.lineWidth = Math.max(1.5, w * share); ctx.stroke(); }   // 乘地铁部分
      const hw = G.ah * 0.62, fill = U.rgb(share > 0.5 ? metroCol : carCol, 1);
      const head = function (tx, ty, ux, uy) {
        const bx = tx - ux * (G.ah + 2), by = ty - uy * (G.ah + 2);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx - uy * hw, by + ux * hw); ctx.lineTo(bx + uy * hw, by - ux * hw); ctx.closePath();
        ctx.strokeStyle = TH.halo; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = fill; ctx.fill();
      };
      head(G.tx, G.ty, G.ux, G.uy);
      if (G.both) head(G.ax, G.ay, -G.ux, -G.uy);
      if (c.label) labels.push({ G: G, t: fa.names[e.b], a: s.a });
    }
    // 目的地名称（箭头尖端）
    ctx.font = TYPE.place; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const L of labels) {
      const b = flowLabelBox(L.G, ctx.measureText(L.t).width);
      ctx.globalAlpha = L.a; ctx.lineWidth = 3; ctx.strokeStyle = TH.halo; ctx.strokeText(L.t, b.cx, b.cy);
      ctx.fillStyle = TH.night ? '#b9c4cf' : '#465264'; ctx.fillText(L.t, b.cx, b.cy);
    }
    // 片区圆点与名称
    ctx.font = TYPE.place;
    nodeA.forEach((a, d) => {
      const p = pos(d), r = rad(d);
      ctx.globalAlpha = a;
      ctx.fillStyle = TH.stFill; ctx.strokeStyle = TH.stInter; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = TH.halo; ctx.strokeText(fa.names[d], p.x, p.y + r + 11); ctx.fillStyle = TH.ink; ctx.fillText(fa.names[d], p.x, p.y + r + 11);
    });
    ctx.globalAlpha = 1;
  };
  // 车站客流图层：用典型工作日的全天数据（夜间停运时同样可看）。圆的大小 = 车站日客流，颜色 = 高峰小时负荷；
  // 线路下方的半透明色带 = 区间日断面客流（双向合计）；客流较大的车站标出数值
  // 统计口径（layerOpt.stDt）：周平均（5 个工作日 + 2 个周末日）、工作日或周末；高峰负荷为所选日类型中最大的高峰小时值
  Renderer.prototype.stationFlowData = function () {
    const model = this.game.model, net = model.net, dt = this.layerOpt.stDt || 'avg';
    const sd = model.dailyStale ? null : (dt === 'wd' ? model.stDailyWk : (dt === 'we' ? model.stDailyWe : model.stDaily));
    if (!net || !sd || !net.N) return null;
    const kind = this.layerOpt.station, key = model.cycles + ':' + model.version + ':' + net.N + ':' + net.R + ':' + kind + ':' + dt;
    if (this._sf && this._sfKey === key) return this._sf;
    const C = net.C, N = net.N, val = new Float32Array(N), ratio = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = sd.inn[i] || 0, b = sd.out[i] || 0, x = sd.xfer[i] || 0;
      val[i] = kind === 'in' ? a : (kind === 'out' ? b : (kind === 'xfer' ? x : a + b + x));
      ratio[i] = (sd.peak[i] || 0) / CFG.metro.stationCap[C.stations[i].size];
    }
    const W = CFG.trips.weekWeights, dts = dt === 'avg' ? [['wd', W.wd], ['we', W.we]] : [[dt, 1]];
    const segLoad = new Map(), segLF = new Map();
    for (let r = 0; r < net.R; r++) {
      const rt = C.routes[r], re = net.rideEdge[r], capT = model.capOf(r, net);
      for (let k = 0; k < rt.segRefs.length; k++) {
        let d = 0, lf = 0;
        for (const x of dts) for (let p = 0; p < 4; p++) {
          const P = model.resultsFor(x[0]).per[p];
          if (!P.load || P.load.length !== net.nE) continue;
          d += ((P.load[re[2 * k]] || 0) + (P.load[re[2 * k + 1]] || 0)) * model.pHours[p] * (p === 3 ? 0.9 : 1) * x[1];
          lf = Math.max(lf, CM.Model.sectionLF(P.load[re[2 * k]], CM.Model.dirFreq(P, net, r, 2 * k), capT), CM.Model.sectionLF(P.load[re[2 * k + 1]], CM.Model.dirFreq(P, net, r, 2 * k + 1), capT));
        }
        // 快车的一个区间跨过多段轨道（v2.5）：每段都计；同一轨道上的全程车与加开交路客流相加
        for (const ref of rt.legSegs[k]) { const id = ref.id; segLoad.set(id, rt.svc ? (segLoad.get(id) || 0) + d : Math.max(segLoad.get(id) || 0, d)); segLF.set(id, Math.max(segLF.get(id) || 0, lf)); }
      }
    }
    let vmax = 1; for (let i = 0; i < N; i++) vmax = Math.max(vmax, val[i]);
    let smax = 1; segLoad.forEach(function (v) { smax = Math.max(smax, v); });
    this._sf = { val: val, ratio: ratio, segLoad: segLoad, segLF: segLF, vmax: vmax, smax: smax }; this._sfKey = key;
    return this._sf;
  };
  // 商业开发图层：已开发的车站标出等级与每月净收益（圈越大净收益越高，亏损为红色）；未开发但开发后能盈利的车站标绿色虚线圈。
  // 结果按月和客流版本缓存，不用每帧重算
  Renderer.prototype.todList = function () {
    const g = this.game, ui = CM.ui, key = g.clock.y + ':' + g.clock.m + ':' + g.netVersion + ':' + g.model.cycles;
    if (this._todL && this._todL.key === key) return this._todL.list;
    const list = [];
    if (ui) for (const id in g.net.stations) {
      const I = ui.todInfo(id); if (!I) continue;
      if (I.lv) list.push({ id: id, lv: I.lv, net: I.net(I.lv) });
      else list.push({ id: id, lv: 0, net: I.net(1) });
    }
    this._todL = { key: key, list: list };
    return list;
  };
  Renderer.prototype.drawTodLayer = function (ctx) {
    const list = this.todList(), net = this.game.net, v = this.view, zk = U.clamp(this.z / 26, 0.55, 1.15), a0 = this.layerFade == null ? 1 : this.layerFade;
    let top = 1; for (const o of list) if (o.lv || o.net > 0) top = Math.max(top, Math.abs(o.net));
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const o of list) {
      const s = net.stations[o.id]; if (!s || s.x < v.x0 - 1 || s.x > v.x1 + 1 || s.y < v.y0 - 1 || s.y > v.y1 + 1) continue;
      const p = this.P(s.x, s.y, this.trackH(s.type));
      if (!o.lv && o.net <= 0) {   // 开发后暂不盈利：只有一个灰色小圈
        ctx.globalAlpha = a0; ctx.strokeStyle = 'rgba(120,128,140,0.85)'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 11 * zk, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      const r = (o.lv ? 15 : 12) * zk + 18 * zk * Math.sqrt(Math.abs(o.net) / top);
      if (o.lv) {
        const col = o.net < 0 ? '214,48,49' : '201,151,28';
        ctx.globalAlpha = a0; ctx.fillStyle = 'rgba(' + col + ',0.24)'; ctx.strokeStyle = 'rgba(' + col + ',0.95)'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const bx = p.x + r * 0.72, by = p.y - r * 0.72, br = Math.max(7, 8 * zk);
        ctx.fillStyle = 'rgb(' + col + ')'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(br * 1.35) + 'px ' + FONT; ctx.fillText(String(o.lv), bx, by + 0.5);
      } else {
        ctx.globalAlpha = a0; ctx.strokeStyle = 'rgba(47,163,107,0.95)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      if (this.z >= (o.lv ? 12 : 20)) {
        const text = (o.net < 0 ? '−' : '+') + U.fmtMoney(Math.abs(o.net)) + '/月';
        ctx.font = '700 11px ' + FONT; ctx.lineWidth = 3; ctx.strokeStyle = TH.halo; ctx.strokeText(text, p.x, p.y + r + 9);
        ctx.fillStyle = o.lv ? (o.net < 0 ? '#c0282a' : '#8a6410') : '#1d7f50'; ctx.fillText(text, p.x, p.y + r + 9);
      }
    }
    ctx.restore();
  };
  // 任务标记：进行中任务的地点（连接任务的各个站点区域、车站、设施、片区；线路任务标在线路中段），点击打开任务页
  Renderer.prototype.taskPinList = function () {
    const g = this.game, T = g.tasks, net = g.net, out = [];
    if (!T || !g.model) return out;
    for (const t of T.active) {
      const add = function (x, y, name) { if (isFinite(x) && isFinite(y)) out.push({ x: x, y: y, title: t.title, name: name || '' }); };
      if (t.anchors) for (const a of t.anchors) add(a.x, a.y, a.name);
      else if (t.station && net.stations[t.station]) add(net.stations[t.station].x, net.stations[t.station].y, net.stations[t.station].name);
      else if (t.fac) { const f = CM.Fac.byId(t.fac); if (f) add(f.x, f.y, f.name); }
      else if (t.zone !== undefined) add(g.model.zCx[t.zone], g.model.zCy[t.zone]);
      else if (t.line && net.lines[t.line]) { const list = CM.Metro.lineTopo(net, t.line).stations, s = net.stations[list[list.length >> 1]]; if (s) add(s.x, s.y, net.lines[t.line].name); }
    }
    return out;
  };
  Renderer.prototype.drawTaskPins = function (ctx) {
    const v = this.view; this._pinPx = [];
    ctx.save(); ctx.lineJoin = 'round'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const o of this.taskPinList()) {
      if (o.x < v.x0 - 1 || o.x > v.x1 + 1 || o.y < v.y0 - 1 || o.y > v.y1 + 1) continue;
      const p = this.P(o.x, o.y, 0), y = p.y - 30;
      ctx.strokeStyle = '#6d3fc4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, y + 11); ctx.stroke();
      ctx.fillStyle = '#6d3fc4'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - 3.5, y + 6); ctx.lineTo(p.x - 3.5, y - 6); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(p.x - 3.5, y - 6); ctx.lineTo(p.x + 5.5, y - 3); ctx.lineTo(p.x - 3.5, y); ctx.closePath(); ctx.fill();
      this._pinPx.push({ x: p.x, y: y, r: 13, title: o.title, name: o.name });
    }
    ctx.restore();
  };
  Renderer.prototype.pickTaskPin = function (sx, sy) {
    if (!CM.Settings.get('taskPins') || !this._pinPx) return null;
    for (const p of this._pinPx) if (Math.hypot(sx - p.x, sy - p.y) <= p.r) return p;
    return null;
  };
  Renderer.prototype.drawStationFlows = function (ctx) {
    this._layerRects = []; this._layerRectsFor = 'station'; this._layerNamed = new Set();
    const g = this.game, model = g.model, net = model.net;
    if (!net || !this.stPx || !this.drawnC) return;
    const sf = this.stationFlowData(); if (!sf) return;
    const C = net.C, DC = this.drawnC, zk = U.clamp(this.z / 26, 0.45, 1.15);   // 圆的大小随缩放变化，缩小时不互相压住
    const loadView = this.layerOpt.stView === 'load';
    // 区间断面客流色带（高峰负荷视图：按高峰小时满载率着色）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    sf.segLoad.forEach((v, id) => {
      const arr = this.segPx && this.segPx.get(id); if (!arr || v <= 0) return;
      const cs = C.segs.get(id), L = cs && C.net.lines[cs.seg.line]; if (!L) return;
      if (loadView) {
        const lf = sf.segLF.get(id) || 0, col = lf > 1 ? [217, 58, 58] : (lf > 0.6 ? [232, 163, 58] : [47, 163, 107]);
        ctx.strokeStyle = U.rgb(AX.rgb(col), 0.55); ctx.lineWidth = this.lineWidthPx() + (4 + 10 * Math.min(1.5, lf)) * zk;
      } else { ctx.strokeStyle = U.rgb(U.hex2rgb(AX.line(L)), 0.32); ctx.lineWidth = this.lineWidthPx() + (3 + 22 * Math.sqrt(v / sf.smax)) * zk; }
      this.strokeArr(ctx, arr);
    });
    // 车站：按客流从小到大画，大站在上
    const list = [];
    for (let i = 0; i < C.stations.length; i++) {
      const k = DC.sIndex.get(C.stations[i].id); if (k === undefined) continue;
      const sp = this.stPx[k]; if (!sp || !(sf.val[i] > 0)) continue;
      list.push({ i: i, sp: sp, v: sf.val[i], r: (4 + 20 * Math.sqrt(sf.val[i] / sf.vmax)) * zk });
    }
    list.sort(function (a, b) { return a.v - b.v; });
    for (const it of list) {
      const rt = sf.ratio[it.i], col = rt > 1 ? [217, 58, 58] : (rt > 0.6 ? [240, 160, 32] : [31, 143, 191]);
      ctx.fillStyle = U.rgb(AX.rgb(col), 0.78); ctx.strokeStyle = TH.halo; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(it.sp.x, it.sp.y, it.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // 标注：站名 + 日客流，放在圆的下方；大站优先，互不重叠（本图层不显示普通站名）
    const placed = list.map(function (it) { return [it.sp.x - it.r * 0.7, it.sp.y - it.r * 0.7, it.sp.x + it.r * 0.7, it.sp.y + it.r * 0.7]; });
    this._layerRects = placed;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let shown = 0;
    for (let q = list.length - 1; q >= 0 && shown < 30; q--) {
      const it = list[q], name = C.stations[it.i].name, val = loadView ? '高峰负荷 ' + U.fmtPct(sf.ratio[it.i], 0) : U.fmtPeople(it.v) + ' 人次' + (AX.enabled() ? ' · 负荷 ' + U.fmtPct(sf.ratio[it.i], 0) : '');
      ctx.font = TYPE.place; const w1 = ctx.measureText(name).width;
      ctx.font = TYPE.meta; const w2 = ctx.measureText(val).width;
      const w = Math.max(w1, w2) + 6, x = it.sp.x, y = it.sp.y + it.r + 4;
      const b = [x - w / 2, y, x + w / 2, y + 28];
      if (placed.some(function (o, k) { return k !== q && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; })) continue;
      placed.push(b); shown++; this._layerNamed.add(C.stations[it.i].id);
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = TH.halo;
      ctx.font = TYPE.place; ctx.strokeText(name, x, y + 7); ctx.fillStyle = TH.ink; ctx.fillText(name, x, y + 7);
      ctx.font = TYPE.meta; ctx.strokeText(val, x, y + 21); ctx.fillStyle = TH.roadInk; ctx.fillText(val, x, y + 21);
    }
  };
  // ---------------- 重要设施（v1.9）：设施出行需求与地铁服务缺口图层中的设施圆点 ----------------
  // 圆的大小 = 所选日类型的日到访量（枢纽为到达与离开合计），外环颜色 = 乘地铁比例（红 → 绿）；服务缺口图层只突出无地铁接驳的设施
  Renderer.prototype.facMarkers = function () {
    const g = this.game, model = g.model, fn = model.fn;
    if (!fn || !model.facDaily) return null;
    const dt = this.layer === 'gap' ? (this.layerOpt.gapDt === 'we' ? 'we' : 'wd') : (this.layerOpt.facDt === 'we' ? 'we' : 'wd');
    const fd = model.facData(dt); if (!fd || fd.F !== fn.F) return null;
    const acc = model.net ? model.net.acc : null, facP = this.layerOpt.facP, PK = CFG.trips.keys;
    const out = [];
    let vmax = 1;
    fn.list.forEach(function (f, k) {
      let v = f.T.hub ? fd.inn[k] + fd.out[k] : fd.inn[k];
      let m = f.T.hub ? fd.innM[k] + fd.outM[k] : fd.innM[k];
      // 按目的筛选时分子分母都取该目的（玩家反馈：以前用全部地铁到访 ÷ 该目的到访，比例可超过 100%）
      if (this.layer === 'fac' && facP !== 'all') {
        const qi = PK.indexOf(facP), both = f.T.hub && facP === 'hb' ? 2 : 1;
        v = qi >= 0 ? fd.purp[k * 6 + qi] * both : 0; if (!(v > 0)) return;
        m = fd.purpM[k * 6 + qi] * both;
      }
      const cov = acc && acc.NZ === fn.NZ ? acc.zCov[model.Z + k] : 0;
      out.push({ f: f, k: k, v: v, share: v > 0 ? m / Math.max(v, 1) : 0, cov: cov });
      if (v > vmax) vmax = v;
    }, this);
    return { list: out, vmax: vmax, key: dt + ':' + (this.layer === 'fac' ? facP : '') };
  };
  // 显示用的平滑值（v2.1）：模拟每天重算一次设施客流，数值会跳；圆点大小逐帧缓动到最新结果，
  // 设施表更新、新结果暂缺时沿用上一份（不再整体消失再出现）；出现 / 消失的设施淡入淡出
  Renderer.prototype.facSmooth = function () {
    const raw = this.facMarkers(), S = this._facS || (this._facS = { m: new Map(), vmax: 0, key: null, list: [] });
    const dt = this.layer === 'gap' ? (this.layerOpt.gapDt === 'we' ? 'we' : 'wd') : (this.layerOpt.facDt === 'we' ? 'we' : 'wd');
    const skey = this.layer + ':' + (raw ? raw.key : dt + ':' + (this.layer === 'fac' ? this.layerOpt.facP : ''));
    const snap = S.key !== skey && raw;   // 切换图层 / 日类型 / 出行目的：直接取新值，不做缓动
    // 新口径暂未算好时不能把旧口径当新结果；相同口径等待计算时则保留上一份。
    if (S.key !== skey) { S.m.clear(); S.vmax = S.tvmax = raw ? raw.vmax : 1; S.key = skey; }
    const a = snap ? 1 : 1 - Math.exp(-(this.dt || 0.016) / 0.35);
    if (raw) {
      const live = new Set();
      for (const it of raw.list) {
        live.add(it.f.id);
        let o = S.m.get(it.f.id);
        if (!o) { o = { f: it.f, v: snap ? it.v : 0, share: it.share, alpha: snap ? 1 : 0, lab: false, la: 0 }; S.m.set(it.f.id, o); }
        o.f = it.f; o.k = it.k; o.tv = it.v; o.tshare = it.share; o.cov = it.cov; o.on = true;
      }
      S.m.forEach(function (o, id) { if (!live.has(id)) { o.on = false; o.tv = o.v; } });
      S.tvmax = raw.vmax;
    }
    if (!S.m.size) return null;
    S.vmax += ((S.tvmax || S.vmax || 1) - S.vmax) * a;
    const list = [];
    S.m.forEach(function (o, id) {
      o.v += (o.tv - o.v) * a; o.share += (o.tshare - o.share) * a;
      o.alpha = U.clamp(o.alpha + (o.on ? 1 : -1) * (this.dt || 0.016) / 0.3, 0, 1);
      if (!o.on && o.alpha <= 0) { S.m.delete(id); return; }
      list.push(o);
    }, this);
    return { list: list, vmax: Math.max(1, S.vmax) };
  };
  Renderer.prototype.drawFacilities = function (ctx) {
    this._facPx = []; this._layerRects = []; this._layerRectsFor = this.layer;
    const fm = this.facSmooth(); if (!fm) return;
    const gap = this.layer === 'gap', zk = U.clamp(this.z / 26, 0.5, 1.15), tmp = {};
    // 服务缺口图层的显示门槛带回差：已显示的设施要明显越过门槛才隐藏，避免在门槛附近反复闪现
    for (const it of fm.list) { const show = it.gapOn ? (it.cov < 0.36 && it.tv >= 1300) : (it.cov < 0.3 && it.tv >= 1500); it.gapOn = show; it.hide = gap && !show; }
    const list = fm.list.slice().sort(function (a, b) { return (a.f.ext ? 1 : 0) - (b.f.ext ? 1 : 0) || a.v - b.v; });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const it of list) {
      if (it.hide) continue;
      const p = this.P(it.f.x, it.f.y, 0, tmp);
      if (p.x < -40 || p.y < -40 || p.x > this.w + 40 || p.y > this.h + 40) continue;
      const r = (4 + 16 * Math.sqrt(it.v / fm.vmax)) * zk;
      ctx.globalAlpha = it.alpha;
      const ring = gap ? [122, 31, 31] : AX.ramp([[0, [214, 52, 52]], [0.25, [236, 160, 50]], [0.6, [40, 160, 90]]], U.clamp(it.share, 0, 0.6) / 0.6);
      const fill = gap ? AX.color('rgba(122,31,31,0.18)') : U.rgb(U.hex2rgb(AX.category(CFG.trips.keys.indexOf(Object.keys(it.f.p)[0]), CFG.trips.color[Object.keys(it.f.p)[0]] || '#888888')), 0.55);
      if (it.f.ext) { it.ring = U.rgb(AX.rgb(ring), 0.95); it.gate = this.drawExtFacility(ctx, it.f, p, r, fill, it.ring); this._facPx.push({ id: it.f.id, x: it.gate.x, y: it.gate.y, r: Math.max(12, it.gate.r + 4) }); continue; }
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = U.rgb(AX.rgb(ring), 0.95); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = TH.halo; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.stroke();
      this._facPx.push({ id: it.f.id, x: p.x, y: p.y, r: Math.max(8, r + 2) });
      this._layerRects.push([p.x - r, p.y - r, p.x + r, p.y + r]);
    }
    ctx.globalAlpha = 1;
    // 标注：文字用最新结果（只在每天重算后变一次，不随缓动滚动）；上一帧已标注的设施优先保留位置（回差），
    // 新出现的标注淡入，不在相近的设施之间来回跳
    const placed = [];
    let shown = 0;
    const valText = function (it) { return gap ? '无地铁接驳 · ' + U.fmtPeople(it.tv) + ' 人次' : U.fmtPeople(it.tv) + ' 人次 · 地铁 ' + U.fmtPct(it.tshare, 0); };
    // 地图外设施：名称牌接在客流圆点外侧（同在地图边缘外）；其余设施按到访量从大到小标注
    for (const it of list) {
      if (!it.f.ext || !it.gate || it.hide) continue;
      ctx.globalAlpha = it.alpha;
      this.extFacLabel(ctx, it.f, it.gate, CM.Fac.shortName(it.f) + (CM.Fac.extLink(it.f, this.game) ? ' · 已接通' : it.f.ext.gate ? ' · 未接通' : ' · 地图外 ' + it.f.ext.km + ' km'), (gap ? '无地铁接驳 · ' : '') + U.fmtPeople(it.tv) + ' 人次 · 地铁 ' + U.fmtPct(it.tshare, 0), it.ring);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const order = list.filter(function (it) { return !it.f.ext && !it.hide; }).sort(function (a, b) { return b.v * (b.lab ? 1.6 : 1) - a.v * (a.lab ? 1.6 : 1); });
    const step = (this.dt || 0.016) / 0.25;
    for (const it of order) {
      const was = it.lab; it.lab = false;
      if (shown >= 24) { it.la = 0; continue; }
      const p = this.P(it.f.x, it.f.y, 0, tmp);
      const r = (4 + 16 * Math.sqrt(it.v / fm.vmax)) * zk;
      const name = it.f.name.replace(/（.*）/, ''), val = valText(it);
      ctx.font = TYPE.place; const w = Math.max(ctx.measureText(name).width, ctx.measureText(val).width * 0.92) + 8;
      const y0 = p.y + r + 2;
      const b = [p.x - w / 2, y0, p.x + w / 2, y0 + 28];
      if (b[2] < 0 || b[0] > this.w || b[3] < 0 || b[1] > this.h) { it.la = 0; continue; }
      if (placed.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; })) { it.la = 0; continue; }
      placed.push(b); shown++; it.lab = true;
      it.la = was ? Math.min(1, it.la + step) : step;
      ctx.globalAlpha = Math.min(it.la, it.alpha);
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = TH.halo;
      ctx.strokeText(name, p.x, y0 + 7); ctx.fillStyle = TH.ink; ctx.fillText(name, p.x, y0 + 7);
      ctx.font = TYPE.meta; ctx.strokeText(val, p.x, y0 + 21); ctx.fillStyle = TH.roadInk; ctx.fillText(val, p.x, y0 + 21);
    }
    ctx.globalAlpha = 1;
    for (const b of placed) this._layerRects.push(b);
  };
  // ---------------- 地图外设施的接驳口（v2.1） ----------------
  // 机场等设施在地图外：提示卡（飞机徽标指向设施方向 + 名称、距离）整块画在地图边缘外侧，不压在地图上；
  // 地图边缘线上是「接驳口」：尚未接通时为虚线圆（建站 / 绘线工具下呼吸闪烁），把线路修到边缘线附近、或点提示卡，都会自动吸附到接驳口建站；
  // 接通后接驳口换成横跨边缘线的线路颜色双向箭头，提示卡徽标也换成线路颜色。设施图层中，该设施的客流圆点同样画在边缘外侧
  const PLANE = typeof Path2D !== 'undefined' ? new Path2D('M10.5 21l1.5-1.2 1.5 1.2v-2l-1-1V13l7 2v-2l-7-4V4.5a1 1 0 0 0-2 0V9l-7 4v2l7-2v4.9l-1 1z') : null;
  // 双向箭头（屏幕坐标，沿单位方向 dx,dy，中心 x,y，半长 k）：表示与地图外双向接通
  function biArrow(ctx, x, y, dx, dy, k, color, halo) {
    const nx = -dy, ny = dx, hw = k * 0.55, hl = k * 0.6, sw = Math.max(1.6, k * 0.22);
    const head = function (sx) {
      const tx = x + dx * k * sx, ty = y + dy * k * sx, bx = tx - dx * hl * sx, by = ty - dy * hl * sx;
      ctx.moveTo(tx, ty); ctx.lineTo(bx + nx * hw, by + ny * hw); ctx.lineTo(bx - nx * hw, by - ny * hw); ctx.closePath();
    };
    ctx.beginPath(); ctx.moveTo(x - dx * (k - hl), y - dy * (k - hl)); ctx.lineTo(x + dx * (k - hl), y + dy * (k - hl));
    ctx.lineCap = 'round'; ctx.lineWidth = sw + 3.5; ctx.strokeStyle = halo; ctx.stroke();
    ctx.beginPath(); head(1); head(-1); ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - dx * (k - hl), y - dy * (k - hl)); ctx.lineTo(x + dx * (k - hl), y + dy * (k - hl));
    ctx.lineWidth = sw; ctx.strokeStyle = color; ctx.stroke();
    ctx.beginPath(); head(1); head(-1); ctx.fillStyle = color; ctx.fill();
  }
  function planeIcon(ctx, x, y, dx, dy, size, color) {
    if (!PLANE) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2); ctx.scale(size / 24, size / 24); ctx.translate(-12, -12.6);
    ctx.fillStyle = color; ctx.fill(PLANE); ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // 接驳口的屏幕几何：边缘点 e（接驳口所在）、该处地图边界的外法向 n、指向设施的方向 (dx, dy)
  Renderer.prototype.gateGeom = function (f) {
    const P0 = CM.Fac.portal(f), v = f.ext.v;
    const e = this.P(P0.ex, P0.ey, 0, {}), q = this.P(P0.ex + v[0], P0.ey + v[1], 0, {});
    let dx = q.x - e.x, dy = q.y - e.y, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    // 城市连接的接驳口在地图中间：提示朝对岸方向摆放
    const wn = f.ext.gate ? [Math.round(v[0]) || 0, Math.round(v[1]) || 1] : P0.ex <= 1e-6 ? [-1, 0] : P0.ex >= CFG.W - 1e-6 ? [1, 0] : P0.ey <= 1e-6 ? [0, -1] : [0, 1];
    const m = this.P(P0.ex + wn[0], P0.ey + wn[1], 0, {}), t = this.P(P0.ex + wn[1], P0.ey + wn[0], 0, {});
    let nx = m.x - e.x, ny = m.y - e.y; L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    // o：画面上垂直于边缘线、指向地图外的方向（立体视图中与 n 不同），用来保证提示整块落在边缘线外
    let ox = -(t.y - e.y), oy = t.x - e.x; L = Math.hypot(ox, oy) || 1; ox /= L; oy /= L;
    if (ox * nx + oy * ny < 0) { ox = -ox; oy = -oy; }
    return { e: e, dx: dx, dy: dy, n: { x: nx, y: ny }, o: { x: ox, y: oy } };
  };
  // 把以 (x, y, w, h) 为外框的提示推到边缘线外至少 gap px，返回需要平移的量
  function gatePush(G, x, y, w, h, gap) {
    let dm = Infinity;
    for (const cx of [x, x + w]) for (const cy of [y, y + h]) dm = Math.min(dm, (cx - G.e.x) * G.o.x + (cy - G.e.y) * G.o.y);
    const s = dm < gap ? gap - dm : 0;
    return { x: G.o.x * s, y: G.o.y * s };
  }
  // 提示卡布局：胶囊形卡片整块放在边缘外侧，徽标一端靠近接驳口；只沿边缘方向贴回画面（不往地图里挪）
  Renderer.prototype.gateCard = function (ctx, G, gr, title, sub) {
    ctx.font = TYPE.title; const w1 = title ? this.textWidth(ctx, title) : 0;
    ctx.font = TYPE.meta; const w2 = sub ? this.textWidth(ctx, sub) : 0;
    const tw = Math.max(w1, w2), pad = 5, h = Math.max(gr * 2 + pad * 2, sub ? 42 : 28), w = gr * 2 + pad * 2 + (tw ? tw + 18 : 0);
    const n = G.n, side = Math.abs(n.x) > Math.abs(n.y), flip = side && n.x < 0;   // 东西两侧：卡片沿法向展开；西侧徽标在右端
    const off = 22 + (side ? pad + gr : h / 2);   // 让出边缘线上接驳口（双向箭头）的位置
    let bx = G.e.x + n.x * off, by = G.e.y + n.y * off;
    let x = flip ? bx + gr + pad - w : bx - gr - pad, y = by - h / 2;
    if (side) { const y2 = U.clamp(y, 8, Math.max(8, this.h - h - 8)); by += y2 - y; y = y2; }
    else { const x2 = U.clamp(x, 8, Math.max(8, this.w - w - 8)); bx += x2 - x; x = x2; }
    const d = gatePush(G, x, y, w, h, 12); x += d.x; y += d.y; bx += d.x; by += d.y;
    return { x: x, y: y, w: w, h: h, bx: bx, by: by, gr: gr, tx: flip ? x + 14 : bx + gr + 10, title: title, sub: sub };
  };
  Renderer.prototype.drawGateCard = function (ctx, c, G, col, dim) {
    ctx.save();
    ctx.shadowColor = 'rgba(15,30,55,0.22)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    roundRect(ctx, c.x, c.y, c.w, c.h, c.h / 2); ctx.fillStyle = TH.night ? 'rgba(24,34,50,0.94)' : 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(c.bx, c.by, c.gr, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    if (dim) { ctx.fillStyle = TH.night ? 'rgba(24,34,50,0.35)' : 'rgba(255,255,255,0.35)'; ctx.fill(); }
    if (c.gate) biArrow(ctx, c.bx, c.by, 1, 0, c.gr * .7, '#ffffff', col);
    else planeIcon(ctx, c.bx, c.by, G.dx, G.dy, c.gr * 1.25, '#ffffff');
    if (c.title) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = TYPE.title; ctx.fillStyle = TH.ink; ctx.fillText(c.title, c.tx, c.sub ? c.by - 7.5 : c.by);
      if (c.sub) { ctx.font = TYPE.meta; ctx.fillStyle = TH.roadInk; ctx.fillText(c.sub, c.tx, c.by + 8.5); }
    }
    ctx.restore();
  };
  // 接驳口到提示卡徽标的引线
  function gateLeader(ctx, G, c, col, dashed, w) {
    const vx = c.bx - G.e.x, vy = c.by - G.e.y, L = Math.hypot(vx, vy);
    if (L <= c.gr + 4) return;
    ctx.beginPath(); ctx.moveTo(G.e.x + vx / L * 4, G.e.y + vy / L * 4); ctx.lineTo(c.bx - vx / L * c.gr, c.by - vy / L * c.gr);
    ctx.setLineDash(dashed ? [3, 4] : []); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); ctx.setLineDash([]);
  }
  // 普通视图中的接驳口（不进入地下视图、分析图层与开始界面）
  Renderer.prototype.drawPortals = function (ctx, alpha) {
    const g = this.game, Fac = CM.Fac;
    this._portals = [];
    if (!Fac || g.preview || !CM.DATA.facilities || alpha <= 0.02) return;
    const yr = g.year ? g.year() : g.clock.y, z = this.z, lw = this.lineWidthPx(), net = g.net;
    const T = CM.tools, building = T && (T.tool === 'station' || T.tool === 'line'), hov = T && T.portalHover;
    const accent = TH.night ? '#6f9fe0' : '#3f6fb0', grey = TH.night ? '#5d6a7e' : '#9aa6b6';
    const gr = U.clamp(z * 0.4, 11, 15), sel = CM.ui && CM.ui.selection;
    for (const f of Fac.list()) {
      if (!f.ext) continue;
      if (f.ext.gate && yr < f.open) continue;   // 城市连接的接驳口没到开放时间不显示，也没有需求
      const G = this.gateGeom(f), e = G.e, n = G.n;
      if (e.x < -240 || e.x > this.w + 240 || e.y < -240 || e.y > this.h + 240) { this._portals.push({ f: f, sx: e.x, sy: e.y, card: null }); continue; }
      const active = yr >= f.open && (f.close == null || yr < f.close);
      const lk = active ? Fac.extLink(f, g) : null;
      const L = lk ? net.lines[lk.lines[0]] : null, col = L ? AX.line(L) : (active ? accent : grey);
      const km = f.ext.km + ' km', labels = z >= 6 && this.labelsOn;
      const sub = f.ext.gate ? (lk ? '已接通 ⇄ ' + (f.ext.to || '对岸') : '线路修到这里即接通' + (f.ext.to ? ' ' + f.ext.to : ''))
        : !active ? (f.open > yr ? Math.floor(f.open) + ' 年启用 · 地图外 ' + km : '已停用') : lk ? '已接通 ⇄ ' + (lk.portal ? '接驳口' : '经「' + lk.st.name + '」') : '地图外 ' + km + ' · 线路修到边缘即接通';
      const card = this.gateCard(ctx, G, gr, labels ? Fac.shortName(f) : '', labels ? sub : '');
      card.gate = f.ext.gate;
      this._portals.push({ f: f, sx: e.x, sy: e.y, card: card });
      ctx.save();
      ctx.globalAlpha = alpha * (active ? 1 : 0.75);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      gateLeader(ctx, G, card, col, !lk, lk ? Math.max(2, lw * 0.5) : 1.6);
      if (lk) {
        // 接通：车站 → 接驳口的线路色连线（步行接通时为虚线），接驳口画成横跨边缘线的双向箭头
        const a = this.P(lk.st.x, lk.st.y, 0, {});
        if (Math.hypot(a.x - e.x, a.y - e.y) > 1) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y);
          ctx.lineWidth = lw + 3; ctx.strokeStyle = TH.lineCase; ctx.stroke();
          ctx.lineWidth = lw; ctx.strokeStyle = col; if (!lk.portal) ctx.setLineDash([Math.max(6, lw * 2), Math.max(4, lw * 1.3)]); ctx.stroke(); ctx.setLineDash([]);
        }
        const k = U.clamp(lw * 2, 9, 14);
        if (lk.portal && sel && sel.kind === 'station' && sel.id === lk.st.id) {
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
          ctx.strokeStyle = 'rgba(30,136,229,' + (0.5 + 0.4 * pulse) + ')'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(e.x, e.y, k + 5 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
        }
        biArrow(ctx, e.x, e.y, n.x, n.y, k, col, TH.halo);
      } else if (active) {
        // 待接通：边缘线上的接驳口（建设工具下呼吸闪烁，鼠标靠近时变实线）
        const pulse = building ? 0.5 + 0.5 * Math.sin(this.time * 4) : 0, hot = hov === f.id, rr = 7.5 + (hot ? 2.5 : 0);
        if (building) { ctx.beginPath(); ctx.arc(e.x, e.y, rr + 3 + pulse * 6, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = alpha * (0.55 - pulse * 0.45); ctx.stroke(); ctx.globalAlpha = alpha; }
        ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = hot ? col : (TH.night ? 'rgba(20,30,46,0.92)' : 'rgba(255,255,255,0.94)'); ctx.fill();
        ctx.setLineDash(hot ? [] : [3, 2.5]); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.setLineDash([]);
        // 圆内的小双向箭头：示意「接通后双向连通」
        const tx = -n.y, ty = n.x, s = rr * 0.5;
        ctx.beginPath(); ctx.moveTo(e.x - n.x * s, e.y - n.y * s); ctx.lineTo(e.x + n.x * s, e.y + n.y * s);
        for (const sg of [1, -1]) { const hx = e.x + n.x * s * sg, hy = e.y + n.y * s * sg; ctx.moveTo(hx - n.x * 3 * sg + tx * 2.6, hy - n.y * 3 * sg + ty * 2.6); ctx.lineTo(hx, hy); ctx.lineTo(hx - n.x * 3 * sg - tx * 2.6, hy - n.y * 3 * sg - ty * 2.6); }
        ctx.lineWidth = 1.6; ctx.strokeStyle = hot ? '#ffffff' : col; ctx.stroke();
      }
      this.drawGateCard(ctx, card, G, col, !active);
      ctx.restore();
    }
  };
  // 设施图层中的地图外设施：客流圆点画在边缘外侧（大小 = 接驳客流，描边颜色 = 乘地铁比例），飞机图标指向设施方向；
  // 场内接驳点 → 接驳口为虚线（接通后为实线并在边缘线上显示双向箭头）
  Renderer.prototype.drawExtFacility = function (ctx, f, p, r, fill, ring) {
    const lk = CM.Fac.extLink(f, this.game), G = this.gateGeom(f), e = G.e, n = G.n;
    r = Math.max(r, 12 * U.clamp(this.z / 26, 0.6, 1.15));
    const d = gatePush(G, e.x + n.x * (r + 16) - r, e.y + n.y * (r + 16) - r, r * 2, r * 2, 12), gx = e.x + n.x * (r + 16) + d.x, gy = e.y + n.y * (r + 16) + d.y;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(e.x, e.y); ctx.lineTo(gx - n.x * r, gy - n.y * r);
    ctx.lineWidth = 4; ctx.strokeStyle = TH.halo; ctx.stroke();
    ctx.setLineDash(lk ? [] : [5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = TH.halo; ctx.stroke();
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke();
    planeIcon(ctx, gx, gy, G.dx, G.dy, Math.min(r * 1.25, 26), TH.night ? '#ffffff' : '#1d2b40');
    if (lk) biArrow(ctx, e.x, e.y, n.x, n.y, 8, ring, TH.halo);
    ctx.restore();
    return { x: gx, y: gy, r: r };
  };
  // 设施图层中地图外设施的名称牌：接在客流圆点外侧（东西两侧边缘横向接出，南北两侧放在圆点旁），只沿边缘方向贴回画面
  Renderer.prototype.extFacLabel = function (ctx, f, gate, title, sub, accent) {
    const G = this.gateGeom(f), n = G.n;
    ctx.font = TYPE.title; const w1 = this.textWidth(ctx, title);
    ctx.font = TYPE.meta; const w2 = this.textWidth(ctx, sub);
    const w = Math.max(w1, w2) + 22, h = 38, side = Math.abs(n.x) > Math.abs(n.y);
    let x, y;
    if (side) { x = n.x > 0 ? gate.x + gate.r + 8 : gate.x - gate.r - 8 - w; y = U.clamp(gate.y - h / 2, 8, Math.max(8, this.h - h - 8)); }
    else { x = U.clamp(gate.x + gate.r + 8, 8, Math.max(8, this.w - w - 8)); y = gate.y - h / 2; if (x < gate.x + gate.r && x + w > gate.x - gate.r) y = n.y < 0 ? gate.y - gate.r - 8 - h : gate.y + gate.r + 8; }
    const d = gatePush(G, x, y, w, h, 10); x += d.x; y += d.y;
    ctx.save();
    ctx.shadowColor = 'rgba(15,30,55,0.22)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    roundRect(ctx, x, y, w, h, 9); ctx.fillStyle = TH.night ? 'rgba(24,34,50,0.94)' : 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = accent; roundRect(ctx, x, y, 4, h, 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = TYPE.title; ctx.fillStyle = TH.ink; ctx.fillText(title, x + 12, y + 13);
    ctx.font = TYPE.meta; ctx.fillStyle = TH.roadInk; ctx.fillText(sub, x + 12, y + 27);
    ctx.restore();
  };
  // ---------------- 风景区内的景区站可建范围（v2.1） ----------------
  // 风景区一般不能设站；运营中的景点约 600 m 内可建地下景区站（metro.js M.scenicGate）。
  // 建站 / 绘线工具下与「区域」图层中，用很淡的填充加一圈细边标出这片范围（只含风景区内、非水面的部分）
  const SCENIC_RAD = 2.4, SCENIC_RES = 18, SCENIC_ARC = 180;
  Renderer.prototype.scenicZones = function () {
    const g = this.game, city = g.city, Fac = CM.Fac;
    if (!Fac || !city.regions.some(function (r) { return r.scenic; })) return null;
    const yr = city.terrainYear || CFG.START.y;
    const key = (city.uid || 0) + ':' + (city.terrainVer || 0) + ':' + Math.floor(yr * 12) + ':' + this.themeName;
    if (this._scz && this._scz.key === key) return this._scz.list;
    const list = [], night = TH.night;
    const fillC = night ? [128, 214, 160] : [38, 132, 84];
    const ok = function (x, y) { const c = city.cellAt(x, y); return c >= 0 && city.regions[city.region[c]].scenic && city.waterDistAt(x, y) >= 0.05; };
    for (const f of Fac.list()) {
      if (f.T.hub || f.ext) continue;
      const c0 = city.cellAt(f.x, f.y);
      if (c0 < 0 || !city.regions[city.region[c0]].scenic || !Fac.active(f, yr, city)) continue;
      const n = Math.ceil(SCENIC_RAD * 2 * SCENIC_RES), x0 = f.x - SCENIC_RAD, y0 = f.y - SCENIC_RAD;
      const inside = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) / SCENIC_RES, y = y0 + (j + 0.5) / SCENIC_RES;
        if (U.dist(x, y, f.x, f.y) <= SCENIC_RAD && ok(x, y)) inside[j * n + i] = 1;
      }
      // 两遍可分离的方框模糊（半径 3 格）让区域边缘羽化
      const blur = function (src) {
        const tmp = new Float32Array(n * n), out = new Float32Array(n * n), R = 3, w = 2 * R + 1;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0; for (let k = -R; k <= R; k++) { const ii = i + k; if (ii >= 0 && ii < n) s += src[j * n + ii]; } tmp[j * n + i] = s / w; }
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0; for (let k = -R; k <= R; k++) { const jj = j + k; if (jj >= 0 && jj < n) s += tmp[jj * n + i]; } out[j * n + i] = s / w; }
        return out;
      };
      const soft = blur(inside);
      const cv = makeCanvas(n, n), x = cv.getContext('2d'), img = x.createImageData(n, n), d = img.data;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, m = soft[k] * inside[k]; if (m <= 0) continue;
        const r = U.dist(x0 + (i + 0.5) / SCENIC_RES, y0 + (j + 0.5) / SCENIC_RES, f.x, f.y) / SCENIC_RAD;
        d[k * 4] = fillC[0]; d[k * 4 + 1] = fillC[1]; d[k * 4 + 2] = fillC[2]; d[k * 4 + 3] = Math.round(m * (night ? 60 : 46) * (0.55 + 0.45 * (1 - r * r)));
      }
      x.putImageData(img, 0, 0);
      // 圆周上落在风景区内的弧段（相邻两点都在区内才连线）
      const arcs = []; let run = null;
      for (let k = 0; k <= SCENIC_ARC; k++) {
        const a = k / SCENIC_ARC * Math.PI * 2, px = f.x + Math.cos(a) * SCENIC_RAD * 0.985, py = f.y + Math.sin(a) * SCENIC_RAD * 0.985;
        if (ok(px, py)) { if (!run) { run = []; arcs.push(run); } run.push(a); } else run = null;
      }
      if (arcs.length > 1 && arcs[0][0] === 0 && arcs[arcs.length - 1][arcs[arcs.length - 1].length - 1] >= Math.PI * 2 - 1e-6) arcs[0] = arcs.pop().concat(arcs[0].map(function (a) { return a + Math.PI * 2; }));
      list.push({ f: f, cv: cv, x0: x0, y0: y0, n: n, arcs: arcs.filter(function (r) { return r.length > 1; }), ink: U.rgb(fillC, 0.95), fillC: fillC });
    }
    this._scz = { key: key, list: list };
    return list;
  };
  // 历史城区与地下保护范围（v2.6）：选址、绘线时用淡紫色标出——这里只能走地下，隧道、车站与拆迁都更贵
  Renderer.prototype.drawHeritage = function (ctx, under) {
    const city = this.game.city, H = city.heritage; if (!H) return;
    const T = CM.tools, want = !this.game.preview && under < 0.5 && ((T && (T.tool === 'station' || T.tool === 'line')) || this.layer === 'region');
    this._herA = U.clamp((this._herA || 0) + (want ? 1 : -1) * (this.dt || 0.016) / 0.25, 0, 1);
    if (this._herA <= 0.01) return;
    const W = city.W, HH = city.H, v = this.view, A = this._herA * (1 - 2 * under), self = this;
    const i0 = Math.max(0, Math.floor(v.x0)), i1 = Math.min(W - 1, Math.ceil(v.x1)), j0 = Math.max(0, Math.floor(v.y0)), j1 = Math.min(HH - 1, Math.ceil(v.y1));
    const pt = function (x, y) { return self.P(x, y, 0, {}); };
    ctx.save(); ctx.globalAlpha = A;
    for (const lv of [1, 2]) {
      ctx.beginPath();
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (H[j * W + i] !== lv) continue;
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      }
      ctx.fillStyle = lv === 2 ? 'rgba(124,58,150,0.2)' : 'rgba(124,58,150,0.1)'; ctx.fill();
    }
    ctx.beginPath();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const on = H[j * W + i] > 0;
      if (i + 1 < W && on !== (H[j * W + i + 1] > 0)) { const a = pt(i + 1, j), b = pt(i + 1, j + 1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      if (j + 1 < HH && on !== (H[(j + 1) * W + i] > 0)) { const a = pt(i, j + 1), b = pt(i + 1, j + 1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(124,58,150,0.75)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    if (this.z >= 12) {
      const seen = new Set();
      city.regions.forEach(function (rg) {
        if (!rg.heritage || rg.scenic || seen.has(rg.id)) return; seen.add(rg.id);   // 历史城区里的风景区（如故宫、天坛）不另标“· 历史城区”
        if (rg.cx < v.x0 || rg.cx > v.x1 || rg.cy < v.y0 || rg.cy > v.y1) return;
        const p = pt(rg.cx, rg.cy), text = String(rg.name).replace(/（.*）/, '') + ' · 历史城区';
        ctx.font = TYPE.meta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width + 16;
        ctx.beginPath(); ctx.roundRect(p.x - tw / 2, p.y - 10, tw, 20, 10); ctx.fillStyle = TH.halo; ctx.fill();
        ctx.strokeStyle = 'rgba(124,58,150,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = TH.night ? '#d9c2e6' : '#5c2b73'; ctx.fillText(text, p.x, p.y + 0.5);
      });
    }
    ctx.restore();
  };
  Renderer.prototype.drawScenicZones = function (ctx, under) {
    if (this.game.jumping || this.game.pending || (CM.ui && CM.ui.blocking())) { this._sczA = 0; return; }
    const T = CM.tools, want = !this.game.preview && under < 0.5 && ((T && (T.tool === 'station' || T.tool === 'line')) || this.layer === 'region');
    this._sczA = U.clamp((this._sczA || 0) + (want ? 1 : -1) * (this.dt || 0.016) / 0.25, 0, 1);
    if (this._sczA <= 0.01) return;
    const list = this.scenicZones(); if (!list || !list.length) return;
    const M = this.M, z = this.z, v = this.view;
    ctx.save();
    ctx.globalAlpha = this._sczA * (1 - 2 * under);
    ctx.imageSmoothingEnabled = true;
    for (const it of list) {
      if (it.x0 > v.x1 || it.y0 > v.y1 || it.x0 + SCENIC_RAD * 2 < v.x0 || it.y0 + SCENIC_RAD * 2 < v.y0) continue;
      {
        ctx.save();
        ctx.transform(M[0] * z, M[2] * z, M[1] * z, M[3] * z, this.ox, this.oy);
        ctx.drawImage(it.cv, it.x0, it.y0, it.n / SCENIC_RES, it.n / SCENIC_RES);
        ctx.restore();
      }
      // 圆周虚线弧：浅色衬底 + 圆头虚线，随视图投影（2D / 2.5D 都按地面点投影）
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const run of it.arcs) {
        ctx.beginPath();
        for (let k = 0; k < run.length; k++) { const a = run[k], p = this.P(it.f.x + Math.cos(a) * SCENIC_RAD, it.f.y + Math.sin(a) * SCENIC_RAD, 0, {}); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
        ctx.setLineDash([]); ctx.strokeStyle = TH.halo; ctx.globalAlpha = this._sczA * (1 - 2 * under) * 0.6; ctx.lineWidth = 4; ctx.stroke();
        ctx.setLineDash([1, 6]); ctx.strokeStyle = U.rgb(it.fillC, 0.9); ctx.globalAlpha = this._sczA * (1 - 2 * under); ctx.lineWidth = 2.6; ctx.stroke();
      }
      ctx.setLineDash([]);
      if (z >= 10) {
        // 名称标签放在范围下沿（避开地标名称），浅色圆角底
        const p = this.P(it.f.x, it.f.y + SCENIC_RAD, 0, {}), text = CM.Fac.shortName(it.f) + ' · 景区站可建范围';
        ctx.font = TYPE.meta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width + 16, ty = p.y + 13;
        ctx.beginPath(); ctx.roundRect(p.x - tw / 2, ty - 10, tw, 20, 10);
        ctx.fillStyle = TH.halo; ctx.fill(); ctx.strokeStyle = U.rgb(it.fillC, 0.35); ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = it.ink; ctx.fillText(text, p.x, ty + 0.5);
      }
    }
    ctx.restore();
  };
  // ---------------- 车站简易模型（v2.1 第二轮） ----------------
  // 立体视图中按站台层画简易模型，沿站台方向、长度按车站规模：地下站为站体轮廓与两处出入口亭，地面站为站台、雨棚与站房，
  // 高架站为桥墩上的站房与地面出入口；屋面带一道线路色。设置「车站模型」可关闭；地下视图与远景不画。
  // 画在Canvas 地图叠加层上：按屏幕空间判断只画朝向镜头的侧面
  const SM_LEN = { S: 0.28, M: 0.36, L: 0.46, XL: 0.58 }, SM_M = EX;   // 半长（格）；米 → 世界单位
  const hexRgb = function (c) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c)); if (!m) return [120, 132, 150]; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
  const mixRgb = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const fillXY = function (ctx, q, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath(); ctx.fill(); };
  Renderer.prototype.box3 = function (ctx, pts, h0, h1, wall, top) {
    const self = this, area = function (q) { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y; } return s; };
    const tp = pts.map(function (p) { return self.P(p[0], p[1], h1, {}); }), sTop = area(tp);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const q = [this.P(a[0], a[1], h0, {}), this.P(b[0], b[1], h0, {}), this.P(b[0], b[1], h1, {}), this.P(a[0], a[1], h1, {})];
      const s = area(q); if (s * sTop <= 0 || Math.abs(s) < 0.3) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
      fillXY(ctx, q, U.rgb(U.shade(wall, 0.8 + 0.14 * (ey - ex) / l)));
    }
    if (top) fillXY(ctx, tp, U.rgb(top));
  };
  // 换乘站的站台（v2.3：不再每层只画一个）：每条线路一座站台，沿本线的站台方向、用本线颜色；
  // 同层且方向相近（±12°，含反向）的线路并排（如同站台换乘），方向不同的线路各自成一座站台。off 为横向偏移（格）
  const PLAT_GAP = { underground: 0.14, surface: 0.17, elevated: 0.21 };
  const angGap = function (a, b) { let d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
  Renderer.platformsOf = function (net, s, lines) {
    const MT = CM.Metro, groups = [];
    for (const lid of lines.length ? lines : [null]) {
      const t = lid ? MT.platType(s, lid) : s.type, a0 = lid ? MT.platformDir(net, s.id, lid) : null, a = a0 == null ? 0 : a0;
      let gr = groups.find(function (x) { return x.t === t && angGap(x.a, a) < 0.21; });
      if (!gr) groups.push(gr = { t: t, a: a, lines: [] });
      gr.lines.push(lid);
    }
    const out = [];
    groups.forEach(function (gr, gi) { const n = gr.lines.length; gr.lines.forEach(function (lid, k) { out.push({ t: gr.t, a: gr.a, lid: lid, off: (k - (n - 1) / 2) * (PLAT_GAP[gr.t] || 0.15), lead: k === 0, first: gi === 0 && k === 0 }); }); });
    return out;
  };
  // 车站装修主题（v2.3，纯视觉）：选定风格时固定外观年代的造型（era）与配色（pal），「随年代」按建成 / 翻新年份
  const DECOR_LOOK = { heritage: { era: 'early', pal: 'early' }, modern: { era: 'current', pal: 'current' }, tech: { era: 'future', pal: 'future' }, garden: { era: 'classic', pal: 'garden' }, industrial: { era: 'classic', pal: 'industrial' } };
  // 站台层与方向（按编译后的线网缓存）；era 为站台外观年代（建成年份、「当前年份 − 40 年翻新」与玩家翻新年份中最晚者）
  // 一座车站的站台模型数据（站台方向、年代、装修）：用到时才算（v2.6：以前第一次放大到站台模型时一次算完全网，几千座车站要卡一秒多）
  Renderer.prototype.stationModelsOf = function (C, i, y) {
    const net = C.net, list = [], g = this.game, ds = g.draft ? g.draft.net.stations : null, s = C.stations[i];
    if (!C.serviced[i] && !(g.draft && !g.net.stations[s.id])) return list;
    const src = (ds && ds[s.id]) || g.net.stations[s.id] || s, dc = src.decor || null, look = dc && DECOR_LOOK[dc.style];
    const era = look ? look.era : CM.Agents.eraOf(Math.max((s.built && s.built[0]) || y, y - 40, src.renov || 0));
    const deco = { pal: look ? look.pal : era, tc: dc && dc.color ? hexRgb(dc.color) : null, art: dc && dc.art !== 'none' ? dc.art : null, sign: (dc && dc.sign) || 'std', tod: src.tod || 0 };
    for (const p of Renderer.platformsOf(net, s, Array.from(C.stationLines[i] || []))) {
      const L = p.lid && net.lines[p.lid];
      list.push(Object.assign({ i: i, s: s, t: p.t, a: p.a, off: p.off, lead: p.lead, first: p.first, era: era, col: L ? hexRgb(AX.line(L)) : [120, 132, 150] }, deco));
    }
    return list;
  };
  // 站台外观的年代配色：早期为石材 / 砖与铸铁绿出入口，战后为混凝土，现代为玻璃钢结构，未来为白色流线雨棚
  const ERA_ST = {
    early: { wall: [150, 112, 86], roof: [74, 70, 66], glass: [96, 118, 98], slab: [168, 150, 128], pier: [128, 104, 84], arch: [46, 92, 70] },
    classic: { wall: [176, 174, 168], roof: [118, 122, 126], glass: [140, 160, 176], slab: [190, 188, 182], pier: [160, 160, 156] },
    modern: { wall: null, roof: null, glass: null, slab: null, pier: null },
    current: { wall: null, roof: null, glass: null, slab: null, pier: null },
    future: { wall: [236, 240, 244], roof: [246, 248, 250], glass: [190, 222, 240], slab: [226, 230, 236], pier: [214, 220, 228], glow: true },
    garden: { wall: [176, 146, 108], roof: [72, 96, 76], glass: [132, 160, 128], slab: [184, 172, 148], pier: [136, 112, 86] },      // 园林：木构、青瓦与竹绿
    industrial: { wall: [134, 76, 58], roof: [62, 66, 72], glass: [112, 124, 132], slab: [152, 148, 142], pier: [86, 90, 96] },     // 工业风：红砖与深灰钢构
  };
  // 公共艺术与标识（v2.3 装修主题）：画在本站第一座站台旁的地面上；标识风格决定导向柱牌面的颜色
  const SIGN_LOOK = { std: null, enamel: { panel: [28, 58, 124], top: [236, 232, 220] }, neon: { panel: [255, 64, 160], top: [80, 236, 255], glow: true }, minimal: { panel: [238, 240, 242], top: null } };
  Renderer.prototype.drawStationDecor = function (ctx, m, R4, len, dim, N) {
    const tc = m.tc, art = m.art, S = SIGN_LOOK[m.sign] || null;
    // 导向柱：立柱 + 牌面（标准为线路色）
    this.box3(ctx, R4(len * 0.92, 0.11, 0.008, 0.008), 0, 4.2 * SM_M, dim([92, 98, 110]), null);
    if (S && S.glow && N) { ctx.shadowColor = U.rgb(S.panel); ctx.shadowBlur = 10; }
    this.box3(ctx, R4(len * 0.92, 0.11, 0.022, 0.01), 4.2 * SM_M, 6.4 * SM_M, S && S.glow ? S.panel : dim(S ? S.panel : m.col), S && S.top ? (S.glow ? S.top : dim(S.top)) : dim(S ? S.panel : m.col));
    ctx.shadowBlur = 0;
    if (!art) return;
    const ac = tc || null, ax = -len * 0.35, ay = 0.16;
    if (art === 'sculpture') {
      this.box3(ctx, R4(ax, ay, 0.022, 0.022), 0, 1.4 * SM_M, dim([196, 192, 184]), dim([210, 206, 198]));
      this.box3(ctx, R4(ax, ay, 0.011, 0.014), 1.4 * SM_M, 7.5 * SM_M, dim(ac || [176, 132, 70]), dim(ac || [196, 150, 84]));
    } else if (art === 'mural') {
      this.box3(ctx, R4(ax, ay, 0.08, 0.006), 0, 4.6 * SM_M, dim(ac || [222, 112, 72]), dim([210, 206, 198]));
    } else if (art === 'light') {
      if (N) { ctx.shadowColor = U.rgb(ac || [120, 220, 255]); ctx.shadowBlur = 14; }
      for (const k of [-1, 0, 1]) this.box3(ctx, R4(ax + k * 0.035, ay, 0.006, 0.006), 0, (6 + 2.5 * (1 - Math.abs(k))) * SM_M, N ? (ac || [120, 220, 255]) : dim(ac || [150, 200, 230]), N ? [255, 255, 255] : null);
      ctx.shadowBlur = 0;
    } else if (art === 'memory') {
      this.box3(ctx, R4(ax, ay, 0.1, 0.009), 0, 2.6 * SM_M, dim([172, 144, 112]), dim(ac || [120, 96, 72]));
    }
  };
  // 车站商业开发（TOD）在地图上的样子：站点外加金色细环，右上角小楼标志（楼的数量 = 开发等级），任何缩放下都能看出哪里开发了
  const TOD_GOLD = '#d99a00';
  Renderer.prototype.drawTodMark = function (ctx, x, y, r, ow, lv) {
    ctx.beginPath(); ctx.arc(x, y, r + ow / 2 + 1.6, 0, Math.PI * 2); ctx.strokeStyle = TOD_GOLD; ctx.lineWidth = Math.max(1.4, r * 0.22); ctx.stroke();
    if (r < 4) return;   // 缩得很小时只留金环
    const u = U.clamp(r * 0.42, 2, 3.4), w = u * (lv + 0.9) + (lv - 1) * u * 0.25, hgt = u * 3.1, bx = x + r * 0.62, by = y - r * 0.62 - hgt;
    ctx.fillStyle = TOD_GOLD; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, hgt, u * 0.5); else ctx.rect(bx, by, w, hgt); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.8, u * 0.28); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let k = 0; k < lv; k++) { const bh = hgt * (0.38 + 0.2 * k); ctx.fillRect(bx + u * 0.45 + k * u * 1.25, by + hgt - bh - u * 0.3, u * 0.85, bh); }
  };
  // 上盖与周边建筑（3D 视图放大时）：便利店与灯箱 → 商业街 → 裙楼加塔楼；屋顶金色，和站点的金环呼应
  Renderer.prototype.drawStationTod = function (ctx, m, R4, len, dim, N) {
    const accent = m.tc || m.col, gold = dim([232, 180, 60]), glass = dim(N ? [96, 128, 164] : [150, 178, 205]), wall = dim([222, 214, 200]);
    if (m.tod >= 3) {
      this.box3(ctx, R4(0, 0.34, 0.44, 0.16), 0, 14 * SM_M, wall, dim([206, 200, 188]));
      for (const t of [[-0.25, 0.12, 80], [0.03, 0.1, 58], [0.28, 0.08, 40]]) { if (N) { ctx.shadowColor = U.rgb(gold); ctx.shadowBlur = 8; } this.box3(ctx, R4(t[0], 0.34, t[1], t[1]), 14 * SM_M, t[2] * SM_M, glass, gold); ctx.shadowBlur = 0; }
    } else if (m.tod === 2) {
      for (const a of [-0.3, 0, 0.3]) { this.box3(ctx, R4(a, 0.27, 0.13, 0.09), 0, 10 * SM_M, wall, gold); this.box3(ctx, R4(a, 0.27, 0.132, 0.092), 3 * SM_M, 4.4 * SM_M, dim(accent), null); }
    } else {
      this.box3(ctx, R4(len * 0.25, 0.2, 0.08, 0.06), 0, 4.5 * SM_M, wall, gold);
      this.box3(ctx, R4(len * 0.25 + 0.14, 0.2, 0.012, 0.05), 0, 9 * SM_M, dim(accent), gold);
    }
  };
  Renderer.prototype.drawStationModels = function (ctx, C, under) {
    const z = this.z, t = this.tEase;
    if (CM.Settings.get('stationModels') === false || t < 0.05 || under > 0.5 || z < 18) return;
    const N = TH.night, y = this.game && this.game.clock ? this.game.clock.y : 2000;
    // 2.5D 使用屏幕位置裁剪；模型数据分帧补齐，避免一次遍历完全网。
    const sPx = this.stPx || [], vis = [], missing = [];
    let sm = this._smC; if (!sm || sm.C !== C || sm.y !== y) sm = this._smC = { C: C, y: y, by: new Array(C.stations.length) };
    for (let i = 0; i < C.stations.length && vis.length < 90; i++) {
      const p = sPx[i];
      if (!p || p.x < -80 || p.y < -80 || p.x > this.w + 80 || p.y > this.h + 80) continue;
      vis.push(i); if (sm.by[i] === undefined && missing.length < 24) missing.push(i);
    }
    if (missing.length) CM.Metro.withSegIndex([C.net], () => { for (const i of missing) sm.by[i] = this.stationModelsOf(C, i, y); });
    const list = []; for (const i of vis) if (sm.by[i]) for (const m of sm.by[i]) list.push(m);
    const glass0 = N ? [64, 92, 126] : [126, 168, 210], roof0 = N ? [96, 104, 118] : [232, 236, 242], slab0 = N ? [86, 92, 104] : [200, 205, 212], pier0 = N ? [92, 98, 110] : [178, 184, 194];
    const eh = CFG.metro.height.elevated, dim = function (c) { return N ? [c[0] * 0.55, c[1] * 0.58, c[2] * 0.64] : c; };
    ctx.save(); ctx.globalAlpha = Math.min(1, (z - 18) / 6) * t * (1 - 2 * under);
    for (const m of list) {
      const s = m.s;
      const E = ERA_ST[m.pal] || ERA_ST[m.era] || ERA_ST.current, glass = E.glass ? dim(E.glass) : glass0, roof = E.roof ? dim(E.roof) : roof0, slab = E.slab ? dim(E.slab) : slab0, pier = E.pier ? dim(E.pier) : pier0, wall = E.wall ? dim(E.wall) : glass;
      const len = SM_LEN[s.size] || 0.36, ca = Math.cos(m.a), sa = Math.sin(m.a), off = m.off || 0;
      // 以站台方向为轴的矩形：沿轴 along ± hl，横向 side ± hw（换乘站的并排站台整体横移 off）
      const R4 = function (along, side, hl, hw) { side += off; const cx = s.x + ca * along - sa * side, cy = s.y + sa * along + ca * side; return [[cx - ca * hl + sa * hw, cy - sa * hl - ca * hw], [cx + ca * hl + sa * hw, cy + sa * hl - ca * hw], [cx + ca * hl - sa * hw, cy + sa * hl + ca * hw], [cx - ca * hl - sa * hw, cy - sa * hl + ca * hw]]; };
      const bc = m.tc || m.col, band = E.glow ? bc : mixRgb(roof, bc, m.tc ? 0.9 : 0.75);   // 屋面色带：主题色优先，否则线路色
      if (m.first && (m.art || m.sign !== 'std' || m.tc)) this.drawStationDecor(ctx, m, R4, len, dim, N);
      if (m.first && m.tod) this.drawStationTod(ctx, m, R4, len, dim, N);
      if (E.glow && N) { ctx.shadowColor = U.rgb(m.col); ctx.shadowBlur = 8; }
      if (m.t === 'underground') {
        // 地下站体轮廓（虚线，本线颜色）与两处出入口亭（并排站台只画第一座的出入口）
        const o = R4(0, 0, len, 0.055).map(function (p) { return this.P(p[0], p[1], 0, {}); }, this);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = U.rgb(m.col, 0.6); ctx.lineWidth = 1.2;
        ctx.beginPath(); o.forEach(function (p, k) { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
        if (m.lead) for (const e of [[-0.72, 1], [0.72, -1]]) {
          if (m.era === 'early') {
            // 早期地铁口：铸铁绿栏杆与拱形门楣
            this.box3(ctx, R4(len * e[0], 0.085 * e[1], 0.036, 0.024), 0, 1.6 * SM_M, dim(E.arch), null);
            this.box3(ctx, R4(len * e[0], 0.085 * e[1], 0.006, 0.024), 0, 5.2 * SM_M, dim(E.arch), null);
            this.box3(ctx, R4(len * e[0], 0.085 * e[1], 0.04, 0.008), 4.6 * SM_M, 5.4 * SM_M, dim(E.arch), band);
          } else {
            this.box3(ctx, R4(len * e[0], 0.085 * e[1], 0.036, 0.024), 0, 4.5 * SM_M, glass, null);
            this.box3(ctx, R4(len * e[0], 0.085 * e[1], m.era === 'future' ? 0.05 : 0.043, 0.031), 4.5 * SM_M, 5.3 * SM_M, roof, band);
          }
        }
      } else if (m.t === 'surface') {
        if (m.lead) this.box3(ctx, R4(len * -0.55, 0.12, 0.05, 0.035), 0, 8 * SM_M, wall, roof);   // 站房（早期为砖石）
        this.box3(ctx, R4(0, 0, len, 0.06), 0, 1.1 * SM_M, slab, slab);                   // 站台
        for (const k of [-0.6, -0.2, 0.2, 0.6]) this.box3(ctx, R4(len * k, 0, 0.007, 0.007), 1.1 * SM_M, 7 * SM_M, pier, null);
        this.box3(ctx, R4(0, 0, len * 0.82, m.era === 'future' ? 0.085 : 0.075), 7 * SM_M, 7.8 * SM_M, roof, band);    // 雨棚
      } else {
        for (const k of [-0.7, -0.25, 0.25, 0.7]) this.box3(ctx, R4(len * k, 0, m.era === 'early' ? 0.03 : 0.02, 0.02), 0, eh - 1.5 * SM_M, pier, null);   // 桥墩（早期为砖石拱墩，更粗）
        if (m.lead) for (const e of [[-0.5, 1], [0.5, -1]]) this.box3(ctx, R4(len * e[0], 0.125 * e[1], 0.045, 0.03), 0, eh + 6 * SM_M, wall, roof);   // 两侧地面出入口与楼梯塔
        this.box3(ctx, R4(0, 0, len, 0.09), eh - 1.5 * SM_M, eh + 14 * SM_M, m.era === 'early' || m.era === 'classic' ? wall : glass, null);   // 站房（站厅与站台）
        this.box3(ctx, R4(0, 0, len * 1.04, 0.1), eh + 14 * SM_M, eh + 15 * SM_M, roof, band);                               // 屋面
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  };
  const MT_HALF = { surface: 0.11, elevated: 0.07 }, ST_LEN = { S: 0.3, M: 0.4, L: 0.5, XL: 0.62 }, ST_HALF = 0.09, MT_STEP = 0.06;
  // net 中地面 / 高架的轨道与车站占用的子地块：Map(格 → 16 位掩码)。only(id, kind) 返回 false 的对象跳过
  Renderer.prototype.metroMaskOf = function (net, only) {
    const city = this.game.city, MT = CM.Metro, W = city.W, H = city.H, mask = new Map();
    const mark = function (x, y, r) {
      const u0 = Math.floor((x - r) * 4), u1 = Math.floor((x + r) * 4), v0 = Math.floor((y - r) * 4), v1 = Math.floor((y + r) * 4);
      for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
        const qx = U.clamp(x, u / 4, (u + 1) / 4), qy = U.clamp(y, v / 4, (v + 1) / 4);
        if ((qx - x) * (qx - x) + (qy - y) * (qy - y) > r * r) continue;
        const i = u >> 2, j = v >> 2; if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const c = j * W + i; mask.set(c, (mask.get(c) || 0) | (1 << ((v & 3) * 4 + (u & 3))));
      }
    };
    // 全网批量查询：共用区段索引；全地下的车站不占地面，不必查站台方向（v2.6：以前几千座车站每次改网要卡半秒）
    MT.withSegIndex([net], function () {
      for (const id in net.segments) {
        const sg = net.segments[id], r = MT_HALF[sg.type];
        if (!r || (only && !only(id, 'seg'))) continue;
        const pts = MT.segGeom(net, sg, city).pts;
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], L = U.dist(a[0], a[1], b[0], b[1]), n = Math.max(1, Math.ceil(L / MT_STEP));
          for (let q = 0; q <= n; q++) mark(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n, r);
        }
      }
      for (const id in net.stations) {
        const st = net.stations[id];
        if (st.type === 'underground' && !st.lv) continue;
        if (only && !only(id, 'st')) continue;
        // 换乘站每条线路的地面 / 高架站台都占地（v2.3，与车站模型的站台一致）
        for (const p of Renderer.platformsOf(net, st, MT.stationLines(net, id))) {
          if (p.t === 'underground') continue;
          const a = p.a, ca = Math.cos(a), sa = Math.sin(a), len = ST_LEN[st.size] || 0.4, n = Math.ceil(len * 2 / MT_STEP);
          for (let q = 0; q <= n; q++) { const s = -len + 2 * len * q / n; mark(st.x + ca * s - sa * p.off, st.y + sa * s + ca * p.off, ST_HALF); }
        }
      }
    });
    return mask;
  };
  // 建筑体块覆盖的子地块位
  function boxBits(b) {
    let m = 0;
    for (let v = Math.floor(b[1] * 4); v <= Math.min(3, Math.floor((b[3] - 1e-6) * 4)); v++) for (let u = Math.floor(b[0] * 4); u <= Math.min(3, Math.floor((b[2] - 1e-6) * 4)); u++) m |= 1 << (v * 4 + u);
    return m;
  }
  // 正式线网的占用掩码：线网或城市变化时重算，变化的格标为过期，建筑分块随之重绘
  Renderer.prototype.syncMetroMask = function () {
    const g = this.game; if (!g || !g.net || g.preview) { this._mt = null; return; }
    const key = g.netVersion + ':' + (g.city.uid || 0) + ':' + (g.city.terrainVer || 0);
    if (this._mt && this._mt.key === key) return;
    const old = this._mt ? this._mt.mask : new Map(), mask = this.metroMaskOf(g.net), dirty = g.city.dirty;
    mask.forEach(function (m, c) { if (old.get(c) !== m) dirty.add(c); });
    old.forEach(function (m, c) { if (!mask.has(c)) dirty.add(c); });
    this._mt = { key: key, mask: mask };
  };
  // 草案将拆除的房屋：草案新增或改动的地面 / 高架部分占用、正式线网尚未占用的子地块上的现有房屋
  Renderer.prototype.demolitionBoxes = function () {
    const g = this.game, d = g.draft, city = g.city, MT = CM.Metro, off = g.net;
    const key = d.ver + ':' + city.version + ':' + (this._mt ? this._mt.key : '');
    if (this._dmb && this._dmb.key === key) return this._dmb;
    const changed = function (id, kind) {
      if (kind === 'seg') { const a = d.net.segments[id], b = off.segments[id]; return !b || a.type !== b.type || a.curve !== b.curve || MT.trackKey(a) !== MT.trackKey(b); }
      const a = d.net.stations[id], b = off.stations[id];
      return !b || a.x !== b.x || a.y !== b.y || a.type !== b.type || a.size !== b.size || JSON.stringify(a.lv || null) !== JSON.stringify(b.lv || null) || MT.platDirsChanged(off, d.net, id);
    };
    const dm = this.metroMaskOf(d.net, changed), cur = this._mt ? this._mt.mask : new Map(), boxes = [];
    dm.forEach(function (bits, c) {
      const free = bits & ~(cur.get(c) || 0); if (!free) return;
      const bl = this.cellBuildings(c); if (!bl) return;
      for (const b of bl) if (boxBits(b) & free) boxes.push({ i: c % city.W, j: (c / city.W) | 0, b: b });
    }, this);
    this._dmb = { key: key, boxes: boxes };
    return this._dmb;
  };
  Renderer.prototype.drawDemolitions = function (ctx, under) {
    const g = this.game;
    if (!g.draft || g.preview || under > 0.5) return;
    const D = this.demolitionBoxes(); if (!D.boxes.length) return;
    const v = this.view, pulse = 0.9 + 0.1 * Math.sin(this.time * 4), a = 1 - 2 * under;
    const vis = function (i, j) { return i >= v.x0 - 1 && i <= v.x1 + 1 && j >= v.y0 - 1 && j <= v.y1 + 1; };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 将拆除的房屋：柔和淡红体块与屋顶「×」，不铺设街区底色
    const lw = U.clamp(this.z * 0.03, 1, 2);
    for (const it of D.boxes) {
      if (!vis(it.i, it.j)) continue;
      const b = it.b, h = b[4] * EX, x0 = it.i + b[0], y0 = it.j + b[1], x1 = it.i + b[2], y1 = it.j + b[3];
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const base = corners.map(function (c) { return this.P(c[0], c[1], 0, {}); }, this), top = corners.map(function (c) { return this.P(c[0], c[1], h, {}); }, this);
      ctx.globalAlpha = a * 0.42 * pulse; ctx.fillStyle = '#eab0b2';
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        ctx.beginPath(); ctx.moveTo(base[k].x, base[k].y); ctx.lineTo(base[k2].x, base[k2].y); ctx.lineTo(top[k2].x, top[k2].y); ctx.lineTo(top[k].x, top[k].y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = a * 0.65 * pulse; ctx.fillStyle = '#f0babc';
      ctx.beginPath(); top.forEach(function (t, k) { if (k) ctx.lineTo(t.x, t.y); else ctx.moveTo(t.x, t.y); }); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = a * 0.75; ctx.strokeStyle = '#c97f86'; ctx.lineWidth = lw; ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(base[k].x, base[k].y); ctx.lineTo(top[k].x, top[k].y); }
      ctx.moveTo(top[0].x, top[0].y); ctx.lineTo(top[2].x, top[2].y); ctx.moveTo(top[1].x, top[1].y); ctx.lineTo(top[3].x, top[3].y);
      ctx.stroke();
    }
    ctx.restore();
  };
  Renderer.prototype.pickFacility = function (sx, sy, wx, wy) {
    const g = this.game, model = g && g.model;
    if (!model || !model.fn) return null;
    if ((this.layer === 'fac' || this.layer === 'gap') && this._facPx) {
      let best = null, bd = 1e9;
      for (const it of this._facPx) { const d = Math.hypot(sx - it.x, sy - it.y); if (d <= it.r && d < bd) { bd = d; best = it.id; } }
      if (best) return best;
    } else if (this._portals) {
      for (const p of this._portals) if (p.card && sx >= p.card.x - 3 && sx <= p.card.x + p.card.w + 3 && sy >= p.card.y - 3 && sy <= p.card.y + p.card.h + 3) return p.f.id;   // 地图外设施的提示卡
    }
    let best = null, bd = 1e9;
    for (const f of model.fn.list) {
      let hit = false, d = U.dist(wx, wy, f.x, f.y);
      if (f.lmK >= 0) hit = g.city.inLandmarkSite(f.lmK, wx, wy) || d < 0.35;
      else hit = d < Math.min(0.6, Math.max(0.3, f.r * 0.5));
      if (hit && d < bd) { bd = d; best = f.id; }
    }
    return best;
  };
  // 地铁服务缺口：已有地铁但高峰超载的车站与区间（按所选日类型）
  Renderer.prototype.drawGapOverload = function (ctx) {
    const model = this.game.model, net = model.net;
    if (!net || !net.R || !this.stPx || !this.drawnC) return;
    const dt = this.layerOpt.gapDt === 'we' ? 'we' : 'wd', sd = dt === 'we' ? model.stDailyWe : model.stDailyWk;
    const C = net.C, DC = this.drawnC, zk = U.clamp(this.z / 26, 0.5, 1.15);
    ctx.lineCap = 'round';
    for (let r = 0; r < net.R; r++) {
      const rt = C.routes[r], re = net.rideEdge[r];
      for (let k = 0; k < rt.segRefs.length; k++) {
        let lf = 0;
        for (let p = 0; p < 4; p++) { const P = model.resultsFor(dt).per[p]; if (!P.load || P.load.length !== net.nE) continue; const capT = model.capOf(r, net); lf = Math.max(lf, CM.Model.sectionLF(P.load[re[2 * k]], CM.Model.dirFreq(P, net, r, 2 * k), capT), CM.Model.sectionLF(P.load[re[2 * k + 1]], CM.Model.dirFreq(P, net, r, 2 * k + 1), capT)); }
        if (lf <= 1) continue;
        for (const ref of rt.legSegs[k]) { const arr = this.segPx && this.segPx.get(ref.id); if (!arr) continue;
        ctx.strokeStyle = 'rgba(239,138,58,0.75)'; ctx.lineWidth = this.lineWidthPx() + 8 * zk; this.strokeArr(ctx, arr); }
      }
    }
    if (!sd || model.dailyStale) return;
    for (let i = 0; i < C.stations.length; i++) {
      const ratio = (sd.peak[i] || 0) / CFG.metro.stationCap[C.stations[i].size]; if (ratio <= 1) continue;
      const k = DC.sIndex.get(C.stations[i].id); if (k === undefined) continue;
      const sp = this.stPx[k]; if (!sp) continue;
      ctx.fillStyle = 'rgba(239,138,58,0.55)'; ctx.strokeStyle = 'rgba(190,90,20,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, (9 + 6 * Math.min(1, ratio - 1)) * zk, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  };
  // 地铁覆盖图层附加：地面铁路的阻隔（无通道处）、按车站划分时的分界线、选中车站的步行范围
  Renderer.prototype.coverGeom = function () {
    const g = this.game, city = g.city, model = g.model, acc = model.net ? model.net.acc : null;
    const key = city.roadVersion + ':' + city.version + ':' + g.netVersion + ':' + (acc ? 1 : 0) + ':' + this.layerOpt.cover;
    if (this._cg2 && this._cg2.key === key && this._cg2.acc === acc) return this._cg2;
    const W = city.W, H = city.H, VW = city.VW, rail = [], bound = [];
    if (city.eRail) for (let e = 0; e < city.eRail.length; e++) {
      if (city.eRail[e] !== 2 || city.eCls[e] >= 3 || city.eCls[e] < 1) continue;
      const uv = city.edgeVerts(e); rail.push([uv[0] % VW, (uv[0] / VW) | 0, uv[1] % VW, (uv[1] / VW) | 0]);
    }
    if (acc && this.layerOpt.cover === 'station') {
      const cs = acc.cellStation, cw = acc.cellWalk, mx = CFG.walk.maxAccessM;
      const st = function (c) { return cw[c] <= mx ? cs[c] : -1; };
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const c = j * W + i, a = st(c); if (a < 0) continue;
        if (i + 1 < W) { const b = st(c + 1); if (b >= 0 && b !== a) bound.push([i + 1, j, i + 1, j + 1]); }
        if (j + 1 < H) { const b = st(c + W); if (b >= 0 && b !== a) bound.push([i, j + 1, i + 1, j + 1]); }
      }
    }
    this._cg2 = { key: key, acc: acc, rail: rail, bound: bound };
    return this._cg2;
  };
  Renderer.prototype.drawCoverExtras = function (ctx, ui) {
    const cg = this.coverGeom(), tmp = {}, tmp2 = {};
    const seg = (list) => { ctx.beginPath(); for (const s of list) { this.P(s[0], s[1], 0, tmp); this.P(s[2], s[3], 0, tmp2); ctx.moveTo(tmp.x, tmp.y); ctx.lineTo(tmp2.x, tmp2.y); } };
    if (cg.bound.length) { seg(cg.bound); ctx.strokeStyle = TH.night ? 'rgba(220,230,240,0.45)' : 'rgba(40,60,50,0.45)'; ctx.lineWidth = 1; ctx.stroke(); }
    if (cg.rail.length && this.z >= 10) { seg(cg.rail); ctx.strokeStyle = 'rgba(192,57,43,0.85)'; ctx.lineWidth = 2.2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
    // 选中车站：步行 15 分钟范围的外轮廓
    const sel = ui && ui.selection, model = this.game.model, acc = model.net ? model.net.acc : null;
    if (!sel || sel.kind !== 'station' || !acc) return;
    const k = model.net.C.sIndex.get(sel.id); if (k === undefined) return;
    const tr = acc.trees[k]; if (!tr) return;
    const city = this.game.city, W = city.W, H = city.H, VW = city.VW, mx = CFG.walk.maxAccessM, extra = CFG.walk.cellExtraM;
    const dv = new Map(); for (let q = 0; q < tr.verts.length; q++) dv.set(tr.verts[q], tr.dist[q]);
    const inR = function (i, j) {
      if (i < 0 || j < 0 || i >= W || j >= H) return false;
      const v0 = j * VW + i; let m = Infinity;
      for (const v of [v0, v0 + 1, v0 + VW, v0 + VW + 1]) { const d = dv.get(v); if (d !== undefined && d < m) m = d; }
      return m + extra <= mx;
    };
    const st = model.net.C.stations[k], ci = Math.floor(st.x), cj = Math.floor(st.y), edges = [];
    for (let j = cj - 7; j <= cj + 7; j++) for (let i = ci - 7; i <= ci + 7; i++) {
      if (!inR(i, j)) continue;
      if (!inR(i - 1, j)) edges.push([i, j, i, j + 1]); if (!inR(i + 1, j)) edges.push([i + 1, j, i + 1, j + 1]);
      if (!inR(i, j - 1)) edges.push([i, j, i + 1, j]); if (!inR(i, j + 1)) edges.push([i, j + 1, i + 1, j + 1]);
    }
    seg(edges); ctx.strokeStyle = TH.halo; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = '#14a252'; ctx.lineWidth = 2.5; ctx.stroke();
  };

  // ---------------- 地图定位高亮：片区（矩形）、区域（范围与边界）、道路（线形）、地点（圆），脉动显示数秒 ----------------
  Renderer.prototype.setHighlight = function (hl) {
    this.hl = hl ? Object.assign({ t0: this.time, dur: 7 }, hl) : null;
    if (this.hl) for (const it of this.hl.kind === 'multi' ? this.hl.items : [this.hl]) if (it.kind === 'region') this.regionMask(it.region);
  };
  // 区域范围：W×H 掩膜（填充）与边界线段（世界坐标），按区域缓存
  Renderer.prototype.regionMask = function (k) {
    const city = this.game.city, W = city.W, H = city.H;
    this._rm = this._rm || {};
    const key = k + ':' + city.version;
    if (this._rm[key]) return this._rm[key];
    const cv = makeCanvas(W, H), c2 = cv.getContext('2d'), img = c2.createImageData(W, H), d = img.data, edges = [];
    const inR = function (i, j) { return i >= 0 && j >= 0 && i < W && j < H && city.region[j * W + i] === k && city.landFrac[j * W + i] >= 0.3; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!inR(i, j)) continue;
      const o = (j * W + i) * 4; d[o] = 47; d[o + 1] = 111; d[o + 2] = 168; d[o + 3] = 255;
      if (!inR(i - 1, j)) edges.push([i, j, i, j + 1]); if (!inR(i + 1, j)) edges.push([i + 1, j, i + 1, j + 1]);
      if (!inR(i, j - 1)) edges.push([i, j, i + 1, j]); if (!inR(i, j + 1)) edges.push([i, j + 1, i + 1, j + 1]);
    }
    c2.putImageData(img, 0, 0);
    this._rm[key] = { cv: cv, edges: edges };
    return this._rm[key];
  };
  // 高亮：kind 为 rect / circle / region / road，或 multi（items 为多个高亮，各自带名称标签）；dur 为持续秒数
  Renderer.prototype.drawHighlight = function (ctx) {
    const hl = this.hl, age = this.time - hl.t0;
    if (age > hl.dur) { this.hl = null; return; }
    const fade = Math.min(1, age / 0.3) * Math.min(1, (hl.dur - age) / 0.8), pulse = 0.5 + 0.5 * Math.sin(age * 4.5);
    ctx.save();
    for (const it of hl.kind === 'multi' ? hl.items : [hl]) this.drawHighlightOne(ctx, it, age, fade, pulse);
    ctx.restore();
  };
  Renderer.prototype.drawHighlightOne = function (ctx, hl, age, fade, pulse) {
    const col = TH.night ? [106, 166, 230] : [30, 110, 200], tmp = {}, dpr = this.dpr, M = this.M, z = this.z;
    ctx.globalAlpha = fade; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = (pts, close) => { ctx.beginPath(); pts.forEach((p, i) => { this.P(p[0], p[1], 0, tmp); if (i) ctx.lineTo(tmp.x, tmp.y); else ctx.moveTo(tmp.x, tmp.y); }); if (close) ctx.closePath(); };
    const outline = (w) => { ctx.strokeStyle = TH.halo; ctx.lineWidth = w + 4; ctx.stroke(); ctx.strokeStyle = U.rgb(col, 0.95); ctx.lineWidth = w; ctx.stroke(); };
    if (hl.kind === 'rect' || hl.kind === 'circle') {
      const pts = [];
      if (hl.kind === 'rect') pts.push([hl.x0, hl.y0], [hl.x1, hl.y0], [hl.x1, hl.y1], [hl.x0, hl.y1]);
      else for (let a = 0; a < 48; a++) pts.push([hl.x + Math.cos(a / 48 * Math.PI * 2) * hl.r, hl.y + Math.sin(a / 48 * Math.PI * 2) * hl.r]);
      path(pts, true); ctx.fillStyle = U.rgb(col, 0.12 + 0.1 * pulse); ctx.fill();
      ctx.setLineDash([10, 6]); ctx.lineDashOffset = -age * 20; outline(3); ctx.setLineDash([]);
    } else if (hl.kind === 'region') {
      const rm = this.regionMask(hl.region);
      ctx.save(); ctx.setTransform(dpr * M[0] * z, dpr * M[2] * z, dpr * M[1] * z, dpr * M[3] * z, dpr * this.ox, dpr * this.oy);
      ctx.globalAlpha = fade * (0.16 + 0.1 * pulse); ctx.imageSmoothingEnabled = false; ctx.drawImage(rm.cv, 0, 0, rm.cv.width, rm.cv.height); ctx.restore();
      ctx.beginPath();
      for (const e of rm.edges) { this.P(e[0], e[1], 0, tmp); ctx.moveTo(tmp.x, tmp.y); this.P(e[2], e[3], 0, tmp); ctx.lineTo(tmp.x, tmp.y); }
      outline(2.5);
    } else if (hl.kind === 'road') {
      ctx.beginPath();
      for (const p of hl.ways) for (let q = 0; q < p.length; q += 2) { this.P(p[q], p[q + 1], 0, tmp); if (q) ctx.lineTo(tmp.x, tmp.y); else ctx.moveTo(tmp.x, tmp.y); }
      ctx.strokeStyle = U.rgb(col, 0.25 + 0.2 * pulse); ctx.lineWidth = 14; ctx.stroke();
      outline(4);
    }
    // 名称标签
    if (hl.label) {
      const p = this.P(hl.lx, hl.ly, 0);
      ctx.font = '700 13px ' + FONT; const w = ctx.measureText(hl.label).width + 22, x = p.x - w / 2, y = p.y - 44;
      ctx.fillStyle = U.rgb(col, 0.96); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 26, 13) : ctx.rect(x, y, w, 26); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x - 6, y + 26); ctx.lineTo(p.x + 6, y + 26); ctx.lineTo(p.x, y + 33); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hl.label, p.x, y + 13.5);
    }
  };
  // ---------------- 标注 ----------------
  // 图层自带圆点与标注的位置摘要（按 6 px 取整）：变化时重新排站名
  Renderer.prototype.layerSig = function () {
    if (this._layerRectsFor !== this.layer || !this._layerRects) return '';
    let s = '';
    for (const b of this._layerRects) s += ((b[0] / 6) | 0) + ',' + ((b[1] / 6) | 0) + ',' + ((b[2] / 6) | 0) + ',' + ((b[3] / 6) | 0) + ';';
    return s;
  };
  // 标注（v2.6 性能）：排版与绘制分开。排版（避让、取字形）在镜头移动时约每 110 ms 做一次，停下后立即按新视野重排；
  // 每帧只把排好的标注贴到当前位置（每条记下所依附的车站或世界坐标与屏幕偏移），平移缩放时字跟着地图走、不闪烁
  Renderer.prototype.drawLabels = function (ctx, ui) {
    const g = this.game;
    if (g.preview) return;
    const step = (this.dt || 0.016) / 0.25;
    this.labA = U.clamp((this.labA == null ? (this.labelsOn ? 1 : 0) : this.labA) + (this.labelsOn ? step : -step), 0, 1);
    this.mapLabA = U.clamp((this.mapLabA == null ? (this.mapLabelsOn !== false ? 1 : 0) : this.mapLabA) + (this.mapLabelsOn !== false ? step : -step), 0, 1);
    if (this.labA < 0.01 && this.mapLabA < 0.01 && !this.labelsOn && this.mapLabelsOn === false && this.layer === 'none') { this.labelImage = null; return; }
    const sig = [this.w, this.h, this.dpr, this.cam.under, this.tEase > 0.5, this.bFade > 0.5, g.city.version, g.clock.y, g.clock.m, g.netVersion, this.layer, AX.flag(), this.themeName, document.fonts ? document.fonts.status : '', this.layerSig(), !!this.labelsOn, this.mapLabelsOn !== false, !!CM.Settings.get('lineTags')].join('|');
    const camKey = this.z + ':' + this.ox + ':' + this.oy + ':' + this.hs + ':' + this.projKey, now = performance.now(), moving = camKey !== this._lblCam;
    this._lblCam = camKey;
    let L = this.labelImage;
    let redo = !L || !L.items || L.sig !== sig || L.C !== this.drawnC;
    if (!redo && L.cam !== camKey) redo = !moving || now - L.at >= 110;
    if (!redo && L.more) redo = now - L.at >= 50;
    if (redo) L = this.labelImage = this.layoutLabels(ui, sig, camKey, now, moving);
    // 每帧贴图
    const W = this.w, H = this.h, dpr = this.dpr, tmp = this._lblTmp || (this._lblTmp = { x: 0, y: 0 }), stPx = this.stPx, A = [this.labA, this.mapLabA, 1];
    for (const it of L.items) {
      const a = A[it.grp] * it.a; if (a < 0.01) continue;
      const p = it.st >= 0 ? stPx && stPx[it.st] : this.P(it.ax, it.ay, it.ah, tmp);
      if (!p) continue;
      if (it.tag) {
        const T = it.tag, x = p.x + it.ox, y = p.y + it.oy;
        ctx.globalAlpha = a; ctx.font = '800 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - T.w / 2, y - 9, T.w, 18, 6); else ctx.rect(x - T.w / 2, y - 9, T.w, 18);
        ctx.fillStyle = T.col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = AX.ink(T.col); ctx.fillText(T.label, x, y + 0.5);
        continue;
      }
      const e = it.e; if (e.dead) { L.more = true; continue; }
      const x = p.x + it.ox, y = p.y + it.oy, dw = e.sw / dpr, dh = e.sh / dpr;
      if (x > W || y > H || x + dw < 0 || y + dh < 0) continue;
      if (it.lx != null) { ctx.save(); ctx.globalAlpha = a * 0.45; ctx.strokeStyle = TH.landmarkInk; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + it.lx, p.y + it.ly); ctx.stroke(); ctx.restore(); }
      ctx.globalAlpha = a;
      ctx.drawImage(e.cv, e.sx, e.sy, e.sw, e.sh, x, y, dw, dh);
    }
    ctx.globalAlpha = 1;
  };
  Renderer.prototype.layoutLabels = function (ui, sig, camKey, now, moving) {
    const g = this.game, z = this.z, v = this.view, city = g.city, items = [], tmp = {};
    this.labelsBegin(moving ? 70 : 800);
    // 避让网格：48 px 一格；矩形存在类型数组里，排版不产生垃圾
    const tile = 48, GW = Math.ceil(this.w / tile) + 3, GH = Math.ceil(this.h / tile) + 3;
    let G = this._lblGrid;
    if (!G || G.GW !== GW || G.GH !== GH) G = this._lblGrid = { GW: GW, GH: GH, head: new Int32Array(GW * GH), rect: new Float32Array(16384), link: new Int32Array(32768) };
    G.head.fill(-1);
    let nR = 0, nL = 0;
    const cellX = function (x) { const i = Math.floor(x / tile) + 1; return i < 0 ? 0 : i >= GW ? GW - 1 : i; }, cellY = function (y) { const j = Math.floor(y / tile) + 1; return j < 0 ? 0 : j >= GH ? GH - 1 : j; };
    const occupy = function (x0, y0, x1, y1) {
      const i0 = cellX(x0), i1 = cellX(x1), j0 = cellY(y0), j1 = cellY(y1);
      if ((nR + 1) * 4 > G.rect.length) { const a = new Float32Array(G.rect.length * 2); a.set(G.rect); G.rect = a; }
      const id = nR++, r = G.rect, b = id * 4; r[b] = x0; r[b + 1] = y0; r[b + 2] = x1; r[b + 3] = y1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if ((nL + 1) * 2 > G.link.length) { const a = new Int32Array(G.link.length * 2); a.set(G.link); G.link = a; }
        const c = j * GW + i, l = nL++; G.link[l * 2] = id; G.link[l * 2 + 1] = G.head[c]; G.head[c] = l;
      }
    };
    const fits = function (x0, y0, x1, y1) {
      const i0 = cellX(x0), i1 = cellX(x1), j0 = cellY(y0), j1 = cellY(y1), r = G.rect, link = G.link, head = G.head;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        for (let l = head[j * GW + i]; l >= 0; l = link[l * 2 + 1]) { const b = link[l * 2] * 4; if (x0 < r[b + 2] && x1 > r[b] && y0 < r[b + 3] && y1 > r[b + 1]) return false; }
      }
      occupy(x0, y0, x1, y1);
      return true;
    };
    // grp：0 站名（随站名开关）；1 地名（随地图标注开关）；2 不随开关。st：依附的车站序号（否则为世界坐标）
    const put = (text, x, y, font, fill, center, grp, a, st, ax, ay, ah, lead) => {
      const s = this.labelSprite(text, font, fill);
      if (!s) { this._lblShort = true; return; }
      const p = st >= 0 ? this.stPx[st] : this.P(ax, ay, ah, tmp);
      items.push({ e: s, st: st, ax: ax, ay: ay, ah: ah, grp: grp, a: a, ox: x + s.left - (center ? s.width / 2 : 0) - p.x, oy: y + s.top - p.y, lx: lead ? x - p.x : null, ly: lead ? y - p.y : null, tag: null });
    };
    this._lblShort = false;
    // 普通地图也标注独立设施。枢纽优先占位，其他设施与地标在地铁站名之后排版；两种视图共用。
    const mapOn = this.mapLabelsOn !== false || this.mapLabA > 0.01, labOn = this.labelsOn || this.labA > 0.01;
    const mapLabels = [];
    if (z >= 10 && mapOn && this.layer === 'none') {
      const yr = g.year ? g.year() : g.clock.y + ((g.clock.m || 1) - 1) / 12;
      const facilities = CM.Fac ? CM.Fac.list(city) : [], hubs = new Set(), models = new Map();
      for (const f of facilities) if (f.T.hub && CM.Fac.active(f, yr, city) && f.lmK >= 0) hubs.add(f.lmK);
      for (const it of this.extraModels()) if (it.lm && (it.fac || it.id.charAt(0) === 'h')) models.set(it.fac || it.id.slice(1), it.lm);
      for (let k = 0; k < D.landmarks.length; k++) if (city.landmarkOn[k] && (z >= 13 || hubs.has(k))) { const lm = D.landmarks[k]; mapLabels.push({ x: lm.x, y: lm.y, h: lm.h || 54, name: lm.name, hub: hubs.has(k) }); }
      for (const f of facilities) {
        if (f.ext || f.lmK >= 0 || f.gen || !CM.Fac.active(f, yr, city) || (!f.T.hub && z < 18)) continue;
        const model = models.get(f.id);
        mapLabels.push({ x: model ? model.x : f.x, y: model ? model.y : f.y, h: model ? model.h : (f.t === 'air' ? 46 : 16), name: f.label || f.name, hub: !!f.T.hub });
      }
    }
    const drawMapLabel = it => {
      if (it.x < v.x0 || it.x > v.x1 || it.y < v.y0 || it.y > v.y1) return;
      const height = this.tEase > 0.5 && this.bFade > 0.5 ? it.h * EX : 0, p = this.P(it.x, it.y, height, tmp), font = TYPE.place;   // 地标与设施名不加粗（只有换乘站加粗）
      if (p.x < -20 || p.y < -20 || p.x > this.w + 20 || p.y > this.h + 20) return;
      const px = p.x, py = p.y, text = '◆ ' + it.name, w = this.textW(font, text);
      // 在四周寻找位置，边缘收进视口；留出完整译名的宽度，避免靠近车站时整条名称消失。
      for (const d of [[0, -14], [0, 15], [w / 2 + 12, 0], [-w / 2 - 12, 0], [0, -32], [0, 33]]) {
        const x = U.clamp(px + d[0], w / 2 + 6, this.w - w / 2 - 6), y = U.clamp(py + d[1], 10, this.h - 10);
        if (!fits(x - w / 2 - 3, y - 8, x + w / 2 + 3, y + 8)) continue;
        put(text, x, y, font, TH.landmarkInk, true, 1, 1, -1, it.x, it.y, height, Math.hypot(x - px, y - py) > 22);
        break;
      }
    };
    // 线路编号牌
    const C = this.drawnC;
    if ((AX.enabled() || CM.Settings.get('lineTags')) && C && this.segPx) {
      const seen = new Map(); let count = 0;
      for (const [id, arr] of this.segPx) {
        const cs = C.segs.get(id), line = cs && C.net.lines[cs.seg.line];
        if (!line || arr.length < 4 || count >= 48) continue;
        const old = seen.get(line.id) || [];
        if (old.length >= 3 || U.dist(arr[0], arr[1], arr[arr.length - 2], arr[arr.length - 1]) < 70) continue;
        const label = AX.enabled() ? AX.number(line) : CM.Metro.lineBadge(line), w = Math.max(22, this.textW('800 11px ' + FONT, label) + 10), col = AX.line(line);
        for (const f of [0.5, 0.7, 0.3]) {
          const k = Math.round((arr.length / 2 - 1) * f), x = arr[k * 2], y = arr[k * 2 + 1];
          if (x < w || x > this.w - w || y < 15 || y > this.h - 15 || old.some(function (p) { return U.dist(x, y, p[0], p[1]) < 190; })) continue;
          if (this.stPx && this.stPx.some(function (p) { return p && U.dist(x, y, p.x, p.y) < 26; })) continue;
          if (!fits(x - w / 2 - 3, y - 12, x + w / 2 + 3, y + 12)) continue;
          const wp = cs.g.pts[k], hh = cs.h[k] < 0 ? 0 : cs.h[k], p = this.P(wp[0], wp[1], hh, tmp);
          items.push({ e: null, st: -1, ax: wp[0], ay: wp[1], ah: hh, grp: 2, a: 1, ox: x - p.x, oy: y - p.y, lx: null, ly: null, tag: { label: label, w: w, col: col } });
          old.push([x, y]); seen.set(line.id, old); count++; break;
        }
      }
    }
    const busyLayer = this.layer === 'cong' || this.layer === 'flow' || this.layer === 'station' || this.layer === 'fac' || this.layer === 'gap';   // 这些图层自带标注，隐藏区名与未开放区域
    // 站名在所有图层都显示（v2.1）：图层自带的圆点与标注先占位，站名避开它们；车站客流图层已标出的站不重复标
    const lr = busyLayer && this._layerRectsFor === this.layer ? this._layerRects : null;
    if (lr) for (const b of lr) occupy(b[0], b[1], b[2], b[3]);
    const named = this.layer === 'station' && this._layerRectsFor === 'station' ? this._layerNamed : null;
    for (const it of mapLabels) if (it.hub) drawMapLabel(it);
    if (C && this.stPx && z >= 8.5 && labOn) {
      const fs = 12, ix = this.metroOrder;
      // 排版顺序（线路多、规模大的站优先）每个编译结果只排一次
      let ord = ix && ix.C === C ? ix.lblOrder : null;
      if (!ord) {
        ord = Array.from({ length: C.stations.length }, function (_, i) { return i; });
        const SZ = { XL: 3, L: 2, M: 1, S: 0 };
        ord.sort(function (a, b) { return (C.stationLines[b].size - C.stationLines[a].size) || (SZ[C.stations[b].size] - SZ[C.stations[a].size]) || (a - b); });
        if (ix && ix.C === C) ix.lblOrder = ord;
      }
      for (const i of ord) {
        const p = this.stPx[i]; if (!p) continue;
        const s = C.stations[i];
        if (s.portal && CM.Fac && CM.Fac.isPortalStation(s)) continue;   // 接驳口车站的名称由接驳口名称牌显示
        if (named && named.has(s.id)) continue;
        const font = C.stationLines[i].size > 1 ? TYPE.placeMajor : TYPE.place;   // 按实际字重测宽，避免换乘站名与旁边标注重叠
        const w = this.textW(font, s.name);
        // 右侧放不下时依次试左侧、上方（图层标注较多时站名仍尽量显示）
        let x = p.x + p.r + 4, y = p.y;
        if (!fits(x - 2, y - fs / 2 - 2, x + w + 2, y + fs / 2 + 2)) {
          x = p.x - p.r - 4 - w;
          if (!fits(x - 2, y - fs / 2 - 2, x + w + 2, y + fs / 2 + 2)) {
            x = p.x - w / 2; y = p.y - p.r - fs / 2 - 4;
            if (!fits(x - 2, y - fs / 2 - 2, x + w + 2, y + fs / 2 + 2)) continue;
          }
        }
        put(s.name, x, y, font, TH.ink, false, 0, 1, i);
      }
    }
    // 普通地标与非枢纽设施，避让已排好的枢纽及地铁站名。
    for (const it of mapLabels) if (!it.hub) drawMapLabel(it);
    // 道路名
    if (z >= 22 && this.layer === 'none' && mapOn) {
      const seen = new Set();
      for (const k of CM.Geo.query(city.roadWayBk, v.x0, v.y0, v.x1, v.y1)) {
        const w = city.roadWays[k], gr = city.roadGroups[w.g];
        if (gr.cls < 3 || !gr.name || (gr.flags & 6) || !city.roadsBuilt[w.g] || seen.has(gr.name)) continue;
        const p = w.p;
        let geom = this.roadLabelGeom.get(w);
        if (!geom) {
          let len = 0;
          for (let q = 2; q < p.length; q += 2) len += Math.hypot(p[q] - p[q - 2], p[q + 1] - p[q - 1]);
          let acc = 0, mx = p[0], my = p[1];
          for (let q = 2; q < p.length; q += 2) { const d = Math.hypot(p[q] - p[q - 2], p[q + 1] - p[q - 1]); if (acc + d >= len / 2) { const t = (len / 2 - acc) / (d || 1); mx = p[q - 2] + (p[q] - p[q - 2]) * t; my = p[q - 1] + (p[q + 1] - p[q - 1]) * t; break; } acc += d; }
          geom = { len: len, x: mx, y: my }; this.roadLabelGeom.set(w, geom);
        }
        const len = geom.len;
        if (len < 2.4) continue;
        const pt = this.P(geom.x, geom.y, 0, tmp), px = pt.x, py = pt.y;
        if (px < 0 || py < 0 || px > this.w || py > this.h) continue;
        const text = gr.name, tw = this.textW(TYPE.road, text);
        if (!fits(px - tw / 2, py - 7, px + tw / 2, py + 7)) continue;
        seen.add(gr.name);
        put(text, px, py, TYPE.road, TH.roadInk, true, 1, 1, -1, geom.x, geom.y, 0);
      }
    }
    // 区名
    if (z < 16 && mapOn && this.layer !== 'flow') {
      const a = U.clamp((16 - z) / 5, 0, 1) * 0.75, font = TYPE.district(z);
      for (const dl of (city.districtLabels || [])) {
        const p = this.P(dl[1], dl[2], 0, tmp), px = p.x, py = p.y;
        put(dl[0], px, py, font, TH.district, true, 1, a, -1, dl[1], dl[2], 0);
        // 占位：之后的未开放区域标签避开区名
        const tw = this.textW(font, dl[0]); fits(px - tw / 2 - 2, py - 11, px + tw / 2 + 2, py + 11);
      }
    }
    // 未开放区域标签
    if (z < 24 && !busyLayer) {
      const shown = new Set(), LK = city.lockState();
      for (let k = 0; k < city.regions.length; k++) {
        // v2.2：按各区域不能建设的部分标注（位置取该部分的中心，年份为该处的预计开放年份）；太小的零星部分不标
        const rg = city.regions[k], f = LK.info[k];
        if (rg.scenic || f.n < 20 || shown.has(k)) continue;
        const cx = f.x, cy = f.y;
        if (cx < v.x0 || cx > v.x1 || cy < v.y0 || cy > v.y1) continue;
        const p = this.P(cx, cy, 0);
        const text = '🔒 ' + rg.name.replace(/（.*）/, '') + ' · ' + (f.year ? '参考 ' + f.year + ' 年开放' : (rg.lockNote || '不开放'));
        const w = this.textW(TYPE.meta, text);
        // 靠近地图边缘的区域：标签整体收进地图范围，不越出边界
        const xl = this.P(0, cy, 0).x + w / 2 + 6, xr = this.P(CFG.W, cy, 0).x - w / 2 - 6;
        if (xl <= xr) p.x = U.clamp(p.x, xl, xr);
        const yt = this.P(cx, 0, 0).y + 12, yb = this.P(cx, CFG.H, 0).y - 12;
        if (yt <= yb) p.y = U.clamp(p.y, yt, yb);
        if (!fits(p.x - w / 2, p.y - 8, p.x + w / 2, p.y + 8)) continue;
        put(text, p.x, p.y, TYPE.meta, TH.lockInk, true, 2, 1, -1, cx, cy, 0);
        shown.add(k);
      }
    }
    return { items: items, sig: sig, cam: camKey, C: this.drawnC, at: now, more: this._lblShort };
  };

  // ---------------- 拾取 ----------------
  Renderer.prototype.pickStation = function (sx, sy) {
    if (!this.stPx) return null;
    let best = null, bd = 1e9;
    for (const p of this.stPx) {
      if (!p) continue;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < p.r + 7 && d < bd) { bd = d; best = p.id; }
    }
    return best;
  };
  Renderer.prototype.pickSegment = function (sx, sy, tol) {
    if (!this.segPx) return null;
    tol = tol || 7;
    let best = null, bd = tol;
    this.segPx.forEach(function (arr, id) {
      for (let i = 0; i + 3 < arr.length; i += 2) {
        const d = U.distToSeg(sx, sy, arr[i], arr[i + 1], arr[i + 2], arr[i + 3]);
        if (d < bd) { bd = d; best = id; }
      }
    });
    return best;
  };
  Renderer.prototype.buildLinkGrid = function () {
    const city = this.game.city;
    if (this.linkGridVer === city.roadVersion) return;
    const G = new Map();
    for (const L of city.car.links) {
      const b = L.bbox;
      for (let j = Math.floor(b[1] / 4); j <= Math.floor(b[3] / 4); j++) for (let i = Math.floor(b[0] / 4); i <= Math.floor(b[2] / 4); i++) {
        const k = i + ':' + j; if (!G.has(k)) G.set(k, []); G.get(k).push(L);
      }
    }
    this.linkGrid = G; this.linkGridVer = city.roadVersion;
  };
  Renderer.prototype.pickLink = function (wx, wy, tol) {
    this.buildLinkGrid();
    const arr = this.linkGrid.get(Math.floor(wx / 4) + ':' + Math.floor(wy / 4));
    if (!arr) return null;
    let best = null, bd = tol || 0.25;
    for (const L of arr) { const d = U.distToPoly(wx, wy, L.pts); if (d < bd) { bd = d; best = L; } }
    return best;
  };
  Renderer.prototype.fitAllSmooth = function () {
    const z = U.clamp(Math.min(this.w / (CFG.W + 4), this.h / (CFG.H + 4)) * 1.05, 5, 96);
    this.flyTo(CFG.W / 2, CFG.H / 2, z); this.cam.fly.duration = 0.9;
  };
  CM.RENDER_CONST = { EX: EX, HSF: HSF, ISO: ISO, UNDER_DEPTH: UNDER_DEPTH };
})(window.CM);
