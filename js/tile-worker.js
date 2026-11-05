'use strict';
// 地面块后台绘制（v2.6 性能）：地面块与总览图的绘制（真实水系、道路、街区、未开放区域）放到独立线程，主线程只负责贴图，
// 平移和缩放时不再被地图块卡住。线程里运行的是同一份绘制代码（render.js 的 drawGround），所需的城市数据由主线程按版本同步过来。
// 任何错误都会通知主线程退回原来的分帧绘制，所以这里不做容错。
self.window = self;
importScripts('util.js', 'config.js', 'accessibility.js');
self.CM.DATA = {};
importScripts('geo.js', 'city.js', 'render.js', 'sites.js', 'scenery.js');
self.document = { createElement: function (tag) { if(tag !== 'canvas') throw Error('Unsupported worker element'); return new OffscreenCanvas(1,1); } };
CM.Settings = { get: function (key) { return key === 'lighting' ? (!CM.workerRenderer || CM.workerRenderer.lightOn) : key === 'gfx' ? 'auto' : null; } };
self.matchMedia = function () { return {matches:false}; };
(function (CM) {
  const CFG = CM.CFG, Geo = CM.Geo;
  let R = null, city = null, game = null, LK = null, reclaim = [];
  const initMap = function (m) {
    if (m.geoFile) importScripts(m.geoFile);
    CM.mapId = m.geoId;
    CM.GEO = m.geoFile ? CM.GEOS[m.geoId] : m.geo;
    for (const k of Object.keys(CM.DATA)) delete CM.DATA[k];
    Object.assign(CM.DATA, m.data);
    Object.assign(CFG, m.cfg);
    CM.curMap = function () { return { region: m.region }; };
    Geo.ready = false; Geo.init();
    R = new CM.Renderer(new OffscreenCanvas(1, 1)); CM.workerRenderer = R;
    city = null; game = null;
  };
  const applyState = function (m) {
    if (m.base) {
      city = Object.create(CM.City.prototype);
      Object.assign(city, m.base);
      // 这两项在主线程算好（依赖区域开放、任务与填海进度），线程直接取结果
      city.lockState = function () { return LK; };
      city.reclaimWater = function () { return reclaim; };
      game = { city: city, clock: { y: 0, m: 1, d: 1 } };
      R.game = game; R._facm = null; R._mt = null; R._tf = null; R._hs = null; R._lmc = null; R._lmcCity = null;
    }
    if (m.roads) {
      const q = m.roads, groups = [], ways = [];
      for (let i = 0; i < q.cls.length; i++) groups.push({ cls: q.cls[i], flags: q.flags[i] });
      for (let i = 0; i < q.wayRoad.length; i++) {
        const k = q.wayRoad[i], rd = k >= 0 ? Geo.roads[k] : null, p = rd ? rd.p : q.extra[-1 - k];
        ways.push({ g: q.wayGroup[i], p: p, bbox: rd ? rd.bbox : Geo.bbox(p) });
      }
      city.roadGroups = groups; city.roadWays = ways; city.roadWayBk = Geo.buckets(ways, 4, city.W, city.H);
    }
    if (m.terrain) { const t = m.terrain; reclaim = t.reclaim || []; delete t.reclaim; Object.assign(city, t); R.geoPaths = new WeakMap(); R._bankPaths = null; }
    if (m.cells) Object.assign(city, m.cells);
    if (m.built) city.roadsBuilt = m.built;
    if (m.lock) LK = m.lock;
    if (m.facm !== undefined) R._facm = m.facm ? Object.assign(m.facm, { city: city }) : null;
    if (m.mt !== undefined) R._mt = m.mt;
    if (m.view) {
      const v = m.view;
      if (v.theme !== R.themeName) { R.applyTheme(v.theme); R._hs = null; }
      R.lightOn = v.lightOn; R.styleYear = v.styleYear; R.styleEpoch = v.styleEpoch;
      game.clock = v.clock; R._rk = null;
    }
  };
  self.onmessage = function (e) {
    const m = e.data;
    try {
      if (m.type === 'map') initMap(m);
      else if (m.type === 'state') applyState(m);
      else if (m.type === 'tile') {
        const it = R.groundChunkGen(m.lvl, m.ci, m.cj, true);
        let r = it.next(); while (!r.done) r = it.next();
        const bm = r.value.transferToImageBitmap();
        self.postMessage({ type: 'tile', key: m.key, lvl: m.lvl, ep: m.ep, bitmap: bm }, [bm]);
      } else if (m.type === 'overview') {
        const lvl = 4, cv = new OffscreenCanvas(CFG.W * lvl, CFG.H * lvl), x = cv.getContext('2d', { willReadFrequently: true });
        x.setTransform(lvl, 0, 0, lvl, 0, 0);
        R.drawGround(x, 0, 0, CFG.W, CFG.H, lvl);
        const bm = cv.transferToImageBitmap();
        self.postMessage({ type: 'overview', ep: m.ep, version: m.version, bitmap: bm }, [bm]);
      }
    } catch (err) { self.postMessage({ type: 'fail', why: String(err && err.stack || err) }); }
  };
})(self.CM);
